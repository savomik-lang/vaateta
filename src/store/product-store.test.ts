import { test } from "node:test";
import assert from "node:assert/strict";
import { RedisProductStore, encodePayload, decodePayload } from "./product-store";
import { makeProduct } from "../fixtures/make-product";

function fakeRedis() {
  const data = new Map<string, string>();
  const calls: { op: string; key: string; bytes: number }[] = [];
  const client = {
    async get(key: string) { const v = data.get(key) ?? null; calls.push({ op: "get", key, bytes: v ? v.length : 0 }); return v; },
    async set(key: string, value: string) { data.set(key, value); calls.push({ op: "set", key, bytes: value.length }); return "OK"; },
    async incr() { return 1; }, async expire() { return 1; },
  };
  return { data, calls, client, conn: async () => client };
}
const products = Array.from({ length: 300 }, (_, i) => makeProduct({ id: `p${i}`, title: `Tuote numero ${i} Kids' Jacket`, url_affiliate: `https://www.awin1.com/pclick.php?p=${i}&a=1&m=2` }));

test("payload pakkautuu selvästi ja palautuu täsmälleen", () => {
  const payload = { updated_at: "2026-10-31T00:00:00Z", count: products.length, products };
  const enc = encodePayload(payload);
  assert.ok(enc.startsWith("gz1:"));
  assert.ok(enc.length < JSON.stringify(payload).length / 3);
  assert.deepEqual(decodePayload(enc), payload);
});

test("vanha pakkaamaton JSON luetaan edelleen", () => {
  const payload = { updated_at: "x", count: 1, products: [products[0]] };
  assert.deepEqual(decodePayload(JSON.stringify(payload)), payload);
});

test("toinen haku ei lataa payloadia uudelleen (vain meta-GET)", async () => {
  const r = fakeRedis();
  const writer = new RedisProductStore("test-cache-1", r.conn);
  await writer.replaceAll(products);
  r.calls.length = 0;
  // uusi instanssi = uusi haku; jaettu prosessimuisti
  const a = await new RedisProductStore("test-cache-1", r.conn).loadAll();
  const b = await new RedisProductStore("test-cache-1", r.conn).loadAll();
  const ts = await new RedisProductStore("test-cache-1", r.conn).lastUpdated();
  assert.equal(a.length, 300); assert.equal(b.length, 300);
  assert.ok(ts);
  const bigGets = r.calls.filter((c) => c.op === "get" && c.key.includes(":products:"));
  assert.equal(bigGets.length, 0);
  assert.ok(r.calls.every((c) => c.bytes < 100));
});

test("uusi import (muuttunut meta) ladataan toisessa prosessissa; vanha välimuisti ei jää voimaan", async () => {
  const r = fakeRedis();
  const s = new RedisProductStore("test-cache-2", r.conn);
  await s.replaceAll(products.slice(0, 10));
  assert.equal((await s.loadAll()).length, 10);
  // simuloi toista Lambdaa joka kirjoittaa uuden katalogin suoraan Redisiin
  r.data.set("vaateta:products:test-cache-2", encodePayload({ updated_at: "2099-01-01T00:00:00Z", count: 50, products: products.slice(0, 50) }));
  r.data.set("vaateta:products-meta:test-cache-2", "2099-01-01T00:00:00Z");
  assert.equal((await s.loadAll()).length, 50);
  assert.equal(await s.lastUpdated(), "2099-01-01T00:00:00Z");
});

test("vanha data ilman metaa luetaan ja lastUpdated löytyy", async () => {
  const r = fakeRedis();
  r.data.set("vaateta:products:test-cache-3", JSON.stringify({ updated_at: "2026-01-01T00:00:00Z", count: 2, products: products.slice(0, 2) }));
  const s = new RedisProductStore("test-cache-3", r.conn);
  assert.equal((await s.loadAll()).length, 2);
  assert.equal(await s.lastUpdated(), "2026-01-01T00:00:00Z");
});

test("tyhjä Redis palauttaa tyhjän ja null-ajan", async () => {
  const r = fakeRedis();
  const s = new RedisProductStore("test-cache-4", r.conn);
  assert.deepEqual(await s.loadAll(), []);
  assert.equal(await s.lastUpdated(), null);
});
