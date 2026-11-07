import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { readXmlItems, decodeXmlText, parseXmlItem } from "./xml-feed-stream";
import {
  mapAdtractionRecords, splitTitleSize, colorFromTitle, maskFeedUrl, importAdtractionStore,
} from "./adtraction-importer";
import { matchesCriteria } from "./multi-store-adapter";
import { STORES, getConfiguredStores } from "../stores-registry";
import { marketOf } from "../ranking/offers";
import { guessGarmentType } from "../nlu/garment-keywords";
import type { Product } from "../types";

// Oikeasta Metsolan syötteestä (7.11.2026) poimittu 36 rivin näyte; kuvaukset typistetty.
const FIXTURE = readFileSync(join(__dirname, "..", "fixtures", "adtraction-metsola-sample.xml"));
const STORE = { storeKey: "metsola-fi", fixedBrand: "Metsola" };

async function* chunked(buf: Buffer, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}
async function readAll(src: AsyncIterable<Uint8Array>) {
  const out: Record<string, string>[] = [];
  for await (const r of readXmlItems(src)) out.push(r);
  return out;
}

test("XML-lukija: lukee kaikki rivit, poistaa g:-etuliitteen ja purkaa entiteetit", async () => {
  const rows = await readAll(chunked(FIXTURE, 1 << 20));
  assert.equal(rows.length, 36);
  const first = rows[0];
  assert.ok(first.id);
  assert.ok(first.title && first.link && first.price);
  assert.ok(first.link.startsWith("https://track.adtraction.com/t/t?"));
  assert.ok(first.link.includes("&as="), "&amp; puretaan merkiksi &");
  const mens = rows.find((r) => r.title.startsWith("Men"))!;
  assert.equal(mens.title.slice(0, 5), "Men'S", "&apos; puretaan");
});

test("XML-lukija: sama tulos pienillä palasilla (monitavuiset merkit palasten rajalla) ja gzipattuna", async () => {
  const whole = await readAll(chunked(FIXTURE, 1 << 20));
  const tiny = await readAll(chunked(FIXTURE, 7));
  assert.deepEqual(tiny, whole);
  const gz = await readAll(chunked(gzipSync(FIXTURE), 513));
  assert.deepEqual(gz, whole);
  assert.ok(whole.some((r) => /[äö]/.test(r.title)), "ääkköset säilyvät");
});

test("decodeXmlText / parseXmlItem: CDATA, numeeriset entiteetit, tyhjät kentät", () => {
  assert.equal(decodeXmlText("<![CDATA[a & <b>]]>"), "a & <b>");
  assert.equal(decodeXmlText("Ty&#246;t &amp; &#x4F;k"), "Työt & Ok");
  const item = parseXmlItem("<g:id>1</g:id><title>T</title><g:size></g:size><g:id>2</g:id>");
  assert.deepEqual(item, { id: "1", title: "T", size: "" });
});

test("splitTitleSize: koko otsikon lopusta, väri ei ole koko", () => {
  assert.deepEqual(splitTitleSize("BEAR CARDIGAN, ROSEWATER - 50/56"), { baseTitle: "BEAR CARDIGAN, ROSEWATER", size: "50/56", adultSize: false });
  assert.equal(splitTitleSize("STRIPED BOMBER -TAKKI | MILKY BLUE - VANILLA - 74/80").baseTitle, "STRIPED BOMBER -TAKKI | MILKY BLUE - VANILLA");
  assert.equal(splitTitleSize("X | Milky Blue - Vanilla").size, null, "väri ei ole koko");
  assert.equal(splitTitleSize("Rib Beanie - 1-2Y").size, "1-2Y");
  assert.equal(splitTitleSize("Rib Beanie - NB").size, "50");
  assert.equal(splitTitleSize("Tube - OS").size, "One Size");
  assert.equal(splitTitleSize("Beanie - A").adultSize, true);
  assert.equal(splitTitleSize("Dress - XL").adultSize, true);
  assert.equal(splitTitleSize("Lahjakortti - 15,00 €").size, null);
  assert.equal(splitTitleSize("Pipo", "86/92").size, "86/92", "g:size ensisijainen jos annettu");
});

test("colorFromTitle", () => {
  assert.equal(colorFromTitle("BEAR CARDIGAN, ROSEWATER"), "Rosewater");
  assert.equal(colorFromTitle("Rib Helmet -Kypärämyssy | Muddy Boots"), "Muddy Boots");
  assert.equal(colorFromTitle("Bunny Pink -Yöpuku"), null);
});

function mapFixture() {
  return readAll(chunked(FIXTURE, 1 << 20)).then((rows) => mapAdtractionRecords(rows, STORE));
}
const byTitle = (ps: Product[], start: string) => ps.filter((p) => p.title.startsWith(start));

test("Metsola: vain varastossa olevat, lapsille sopivat tuotteet tulevat mukaan", async () => {
  const { products, stats } = await mapFixture();
  assert.equal(stats.rows, 36);
  assert.equal(stats.outOfStock, 2);
  const titles = products.map((p) => p.title).join(" | ");
  for (const banned of ["Alley", "Women", "Men'S", "Lahjakortti", "Honeygold", "Sunflower", "Christmas Beanie", "Bear Cardigan"]) {
    assert.ok(!titles.toLowerCase().includes(banned.toLowerCase()), `${banned} ei kuulu mukaan: ${titles}`);
  }
  assert.ok(products.every((p) => p.brand === "Metsola" && p.source === "metsola-fi" && p.in_stock));
  assert.equal(new Set(products.map((p) => p.id)).size, products.length, "tunnisteet yksilöllisiä");
  assert.ok(products.every((p) => p.url_affiliate.startsWith("https://track.adtraction.com/")));
});

test("Metsola: koot kootaan yhdeksi tuotteeksi pienimmästä suurimpaan", async () => {
  const { products } = await mapFixture();
  const pj = byTitle(products, "Bunny Pink -Yöpuku");
  assert.equal(pj.length, 1);
  assert.deepEqual(pj[0].size_available, ["50/56", "62/68", "74/80"]);
  assert.equal(pj[0].garment_type, "pyjama");
  assert.equal(pj[0].price.amount, 49.9);
  const beanie = byTitle(products, "Rib Beanie")[0];
  assert.deepEqual(beanie.size_available, ["0-1Y", "1-2Y", "3-4Y"]);
  assert.equal(beanie.garment_type, "pipo");
  assert.equal(beanie.color, "Black");
});

test("Metsola: eri hintainen koko saa oman hintatasonsa", async () => {
  const { products } = await mapFixture();
  const dress = byTitle(products, "Hedgehog Dress");
  assert.equal(dress.length, 2);
  const [cheap, dear] = [...dress].sort((a, b) => a.price.amount - b.price.amount);
  assert.deepEqual([cheap.price.amount, cheap.size_available], [40, ["74/80"]]);
  assert.deepEqual([dear.price.amount, dear.size_available], [45, ["110/116"]]);
  const wants = (cm: number) => ({ garment_type: "mekko" as const, size_cm: cm, child_signal: true });
  assert.equal(matchesCriteria(dear, wants(110)), true);
  assert.equal(matchesCriteria(cheap, wants(110)), false, "40 EUR:n koko 74/80 ei sovi 110 cm:lle");
  assert.equal(matchesCriteria(cheap, wants(80)), true);
});

test("Metsola: alennushinta ja alkuperäinen hinta", async () => {
  const { products } = await mapFixture();
  const cardigan = byTitle(products, "Knit Cardigan")[0];
  assert.equal(cardigan.price.amount, 62.93);
  assert.equal(cardigan.original_price?.amount, 89.9);
  assert.equal(cardigan.discount_percent, 30);
  assert.equal(cardigan.garment_type, "takki");
  assert.equal(cardigan.color, "Rosy");
  assert.deepEqual(cardigan.size_available, ["98/104", "110/116"]);
});

test("Metsola: tyypit (body, kengät, haalari, lapaset, kylpytakki, huivi)", async () => {
  const { products } = await mapFixture();
  assert.equal(byTitle(products, "Winter Dance Ruffle")[0].garment_type, "body");
  const shoes = byTitle(products, "Kuoma Hanki")[0];
  assert.equal(shoes.garment_type, "kengät");
  assert.deepEqual(shoes.size_available, ["20", "21", "22"]);
  const overall = byTitle(products, "Merino Overall")[0];
  assert.equal(overall.garment_type, "haalari", "tyhjä tuotetyyppi -> otsikosta");
  assert.deepEqual(overall.size_available, ["68"]);
  const mittens = byTitle(products, "Merino Mittens")[0];
  assert.equal(mittens.garment_type, "lapaset");
  assert.deepEqual(mittens.size_available, ["One Size"]);
  assert.equal(byTitle(products, "Pupu")[0].garment_type, "muu", "kylpytakki ei ole takki");
  assert.deepEqual(byTitle(products, "Buddy-Tuubihuivi")[0].size_available, ["One Size"]);
  assert.equal(byTitle(products, "Puppy -Leggingsit")[0].garment_type, "housut");
  assert.deepEqual(byTitle(products, "Rib Bear Beanie")[0].size_available, ["50"], "NB -> 50 cm");
});

test("Metsola: isot kirjaimet muutetaan luettavaksi ja seurantalinkki säilyy sellaisenaan", async () => {
  const rows = await readAll(chunked(FIXTURE, 1 << 20));
  const { products } = mapAdtractionRecords(rows, STORE);
  const bomber = byTitle(products, "Striped Bomber")[0];
  assert.equal(bomber.title, "Striped Bomber -Takki | Milky Blue - Vanilla");
  const src = rows.find((r) => r.title.startsWith("STRIPED BOMBER"))!;
  assert.equal(bomber.url_affiliate, src.link);
});

test("Metsola: ei lasten tuotteita kokohaussa vääristä koista (talvi/koko-suodatus toimii)", async () => {
  const { products } = await mapFixture();
  const girl110 = products.filter((p) => matchesCriteria(p, { child_signal: true, size_cm: 110 }));
  assert.ok(girl110.some((p) => p.title.startsWith("Hedgehog Dress")));
  assert.ok(!girl110.some((p) => p.title.startsWith("Bunny Pink -Yöpuku")), "50-80 cm yöpuku ei sovi 110 cm:lle");
});

test("rekisteri: Metsola on mukana, markkina FI, konfiguroitu vain kun URL on asetettu", () => {
  const def = STORES.find((s) => s.storeKey === "metsola-fi")!;
  assert.equal(def.format, "adtraction");
  assert.equal(marketOf("metsola-fi"), "FI");
  const saved = process.env[def.feedIdEnvVar];
  delete process.env[def.feedIdEnvVar];
  assert.ok(!getConfiguredStores().some((s) => s.storeKey === "metsola-fi"));
  process.env[def.feedIdEnvVar] = "https://secure.adtraction.com/productfeed.htm?x=1";
  assert.ok(getConfiguredStores().some((s) => s.storeKey === "metsola-fi"));
  if (saved === undefined) delete process.env[def.feedIdEnvVar]; else process.env[def.feedIdEnvVar] = saved;
});

test("yövaate tunnistetaan pyjamaksi", () => {
  assert.equal(guessGarmentType("Yövaate", "Whispers -Yöpuku"), "pyjama");
  assert.equal(guessGarmentType("Yövaatteet", "Joku"), "pyjama");
});

test("maskFeedUrl peittää tunnisteet", () => {
  const m = maskFeedUrl("https://secure.adtraction.com/productfeed.htm?type=feed&apid=1946958325&asid=2125595250&pfid=2522&encoding=UTF8");
  assert.ok(!/1946958325|2125595250|pfid=2522/.test(m));
  assert.ok(m.includes("encoding=UTF8"));
});

const def = STORES.find((s) => s.storeKey === "metsola-fi")!;
const goodUrl = "https://secure.adtraction.com/productfeed.htm?type=feed&format=XML&encoding=UTF8&zip=0&apid=1&asid=2&pfid=3";

test("tuonti hylkää väärän osoitteen ennen latausta", async () => {
  await assert.rejects(importAdtractionStore({ ...def, feedId: "https://example.com/feed.xml" }), /Adtractionin https-osoitteeseen/);
  await assert.rejects(importAdtractionStore({ ...def, feedId: goodUrl.replace("UTF8", "88591") }), /encoding=UTF8/);
  await assert.rejects(importAdtractionStore({ ...def, feedId: goodUrl.replace("zip=0", "zip=1") }), /zip=0/);
  await assert.rejects(importAdtractionStore({ ...def, feedId: "ei-url" }), /kelvollinen URL/);
});

test("tuonti ei tyhjennä kauppaa, jos vastaus ei ole syöte tai lataus epäonnistuu", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("<html><body>virhe</body></html>", { status: 200 })) as typeof fetch;
    await assert.rejects(importAdtractionStore({ ...def, feedId: goodUrl }), /yhtään <item>-riviä/);
    globalThis.fetch = (async () => new Response("no", { status: 403, statusText: "Forbidden" })) as typeof fetch;
    await assert.rejects(importAdtractionStore({ ...def, feedId: goodUrl }), (e: Error) =>
      /403/.test(e.message) && !/apid=1(&|$)/.test(e.message) && e.message.includes("apid=***"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
