import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "zlib";
import { readCsvRecords } from "./feed-stream";

const CSV = 'a,b,c\n1,"x, y",3\n4,"line1\nline2",6\n\n7,8,9\n';

async function* chunks(buf: Buffer, size: number) {
  for (let i = 0; i < buf.length; i += size) yield new Uint8Array(buf.subarray(i, i + size));
}
async function collect(it: AsyncIterable<Record<string, string>>) {
  const out: Record<string, string>[] = [];
  for await (const r of it) out.push(r);
  return out;
}

test("lukee pakatun CSV:n pieninä palasina (lainausmerkit, rivinvaihto kentässä, tyhjä rivi)", async () => {
  const rows = await collect(readCsvRecords(chunks(gzipSync(Buffer.from(CSV)), 7)));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { a: "1", b: "x, y", c: "3" });
  assert.equal(rows[1].b, "line1\nline2");
  assert.equal(rows[2].c, "9");
});

test("lukee purkamattoman CSV:n (undici purki gzipin)", async () => {
  const rows = await collect(readCsvRecords(chunks(Buffer.from(CSV), 5)));
  assert.equal(rows.length, 3);
});

test("tyhjä runko ei kaada", async () => {
  assert.deepEqual(await collect(readCsvRecords(chunks(Buffer.alloc(0), 5))), []);
});

test("rikkinäinen gzip nostaa virheen", async () => {
  const bad = gzipSync(Buffer.from(CSV));
  const broken = Buffer.concat([bad.subarray(0, 12), Buffer.from("garbage-garbage-garbage")]);
  await assert.rejects(() => collect(readCsvRecords(chunks(broken, 6))));
});

test("suuri syöte: 50 000 riviä", async () => {
  const lines = ["id,name"];
  for (let i = 0; i < 50000; i++) lines.push(`${i},"tuote ${i}"`);
  const rows = await collect(readCsvRecords(chunks(gzipSync(Buffer.from(lines.join("\n"))), 16384)));
  assert.equal(rows.length, 50000);
  assert.equal(rows[49999].name, "tuote 49999");
});
