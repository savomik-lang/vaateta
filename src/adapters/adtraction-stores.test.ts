import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readXmlItems } from "./xml-feed-stream";
import { mapAdtractionRecords, lastCategorySegment, garmentFor } from "./adtraction-importer";
import { convertFeedSize } from "./adtraction-sizes";
import { matchesCriteria } from "./multi-store-adapter";
import { parseSizeToken, productSizeFit } from "../size";
import { STORES } from "../stores-registry";
import { guessGarmentType } from "../nlu/garment-keywords";
import { looksLikeNonClothing } from "../nlu/non-clothing";
import { makeProduct } from "../fixtures/make-product";
import type { Product } from "../types";

// Polarn O. Pyretin (1 408) ja Kekäleen (3 094) oikeista syötteistä 8.11.2026 poimitut näytteet; kuvaukset typistetty.
async function* chunk(buf: Buffer): AsyncGenerator<Uint8Array> { yield buf; }
async function load(name: string): Promise<Record<string, string>[]> {
  const buf = readFileSync(join(__dirname, "..", "fixtures", name));
  const out: Record<string, string>[] = [];
  for await (const r of readXmlItems(chunk(buf))) out.push(r);
  return out;
}
const store = (key: string) => STORES.find((s) => s.storeKey === key)!;

async function pop() {
  const rows = await load("adtraction-polarnopyret-sample.xml");
  return { rows, ...mapAdtractionRecords(rows, store("polarnopyret-fi")) };
}
async function kekale() {
  const rows = await load("adtraction-kekale-sample.xml");
  return { rows, ...mapAdtractionRecords(rows, store("kekale-fi")) };
}
const byTitle = (ps: Product[], t: string) => ps.find((p) => p.title === t)!;

test("rekisteri: Polarn O. Pyret ja Kekäle ovat Adtraction-kauppoja omilla muuttujillaan", () => {
  const p = store("polarnopyret-fi");
  const k = store("kekale-fi");
  assert.equal(p.format, "adtraction");
  assert.equal(p.feedIdEnvVar, "ADTRACTION_POLARNOPYRET_FI_FEED_URL");
  assert.equal(k.feedIdEnvVar, "ADTRACTION_KEKALE_FI_FEED_URL");
  assert.equal(k.sizeUnknown, true);
  assert.equal(k.childOnly, true);
  assert.equal(p.shipsTo, undefined, "toimitusmaita ei ole vahvistettu -> ei rajausta");
  assert.equal(k.shipsTo, undefined);
});

test("lastCategorySegment: viimeinen osa pienellä", () => {
  assert.equal(lastCategorySegment("lastenvaatteet  >  vaatteet  >  alaosat  >  housut"), "housut");
  assert.equal(lastCategorySegment("lastenvaatteet"), "lastenvaatteet");
  assert.equal(lastCategorySegment("Uncategorized"), "uncategorized");
  assert.equal(lastCategorySegment(undefined), "");
});

test("convertFeedSize: sukat (kenkäkoko) -> pituus, haettava ja kaupan merkintä näkyvissä", () => {
  const c = convertFeedSize("22 - 24", "sukat");
  assert.equal(c.size, "86-98 (22-24)");
  assert.deepEqual(parseSizeToken(c.size!), { kind: "cm", lo: 86, hi: 98 });
  assert.equal(productSizeFit([c.size!], 92, false), "exact");
  assert.equal(productSizeFit([c.size!], 128, false), null);
  assert.equal(convertFeedSize("46 - 48", "sukat").adult, true);
  assert.equal(convertFeedSize("25", "sukat").size, "98-102 (25)");
});

test("convertFeedSize: pipot (pään ympärys) ja käsineet (koko 0-6)", () => {
  const hat = convertFeedSize("48 - 50", "pipo");
  assert.equal(hat.size, "92-104 (pää 48-50)");
  assert.deepEqual(parseSizeToken(hat.size!), { kind: "cm", lo: 92, hi: 104 });
  const single = convertFeedSize("42", "pipo");
  assert.equal(single.size, "68-68 (pää 42)");
  assert.deepEqual(parseSizeToken(single.size!), { kind: "cm", lo: 68, hi: 68 });
  assert.equal(convertFeedSize("60 - 62", "pipo").adult, true);
  const glove = convertFeedSize("3", "lapaset");
  assert.equal(glove.size, "98-110 (koko 3)");
  assert.deepEqual(parseSizeToken(glove.size!), { kind: "cm", lo: 98, hi: 110 });
  assert.equal(convertFeedSize("1 - 3", "lapaset").size, "74-110 (koko 1-3)");
});

test("convertFeedSize: muut koot jätetään ennalleen, Onesize normalisoidaan", () => {
  assert.equal(convertFeedSize("86 - 92", "paita").size, null);
  assert.equal(convertFeedSize("140", "housut").size, null);
  assert.equal(convertFeedSize("Onesize", "muu").size, "One Size");
  assert.equal(convertFeedSize("S", "pipo").size, null);
});

test("POP: rivit koottu tuotteiksi, aikuiset/alusvaatteet/bikinit/loppuneet pois", async () => {
  const { rows, products, stats } = await pop();
  assert.equal(rows.length, 26);
  assert.equal(stats.rows, 26);
  assert.ok(stats.outOfStock >= 1);
  assert.ok(stats.notClothingOrAdult >= 4, "aikuiset, alushousut, viltti");
  assert.ok(stats.unsafe >= 1, "bikini on estolistalla");
  assert.ok(products.length >= 10 && products.length < rows.length);
  for (const p of products) {
    assert.equal(p.source, "polarnopyret-fi");
    assert.equal(p.brand, "Polarn O. Pyret");
    assert.ok(p.url_affiliate.startsWith("https://track.adtraction.com/t/t?"), p.title);
    assert.ok(p.size_available.length > 0, p.title);
    assert.ok(!/bikini|bokseri|viltti/i.test(p.title), p.title);
  }
  // Aikuisten kirjainkokoja ei jää kokoihin.
  for (const p of products) assert.ok(!p.size_available.some((s) => /^(XS|S|M|L|XL|XXL)$/.test(s)), p.title);
});

test("POP: sukat, pipo ja käsineet saavat haettavat pituuskoot; vaatteiden koot ennallaan", async () => {
  const { products } = await pop();
  const socks = byTitle(products, "Sukat merinovilla");
  assert.equal(socks.garment_type, "sukat");
  assert.ok(socks.size_available.includes("86-98 (22-24)"));
  const hat = byTitle(products, "Tuulenpitävä Fleece‑vuorinen kypärämyssy raidallinen");
  assert.equal(hat.garment_type, "pipo");
  assert.ok(hat.size_available.every((s) => parseSizeToken(s).kind === "cm"), hat.size_available.join());
  const mitts = byTitle(products, "Vedenpitävät topatut lapaset");
  assert.equal(mitts.garment_type, "lapaset");
  assert.equal(mitts.waterproof, true);
  assert.ok(mitts.size_available.every((s) => /\(koko \d\)$/.test(s)));
  const pants = byTitle(products, "Housut");
  assert.deepEqual(pants.size_available, ["110", "134", "140"]);
  // Kenkien EU-koot säilyvät kenkäkokoina.
  const shoes = products.find((p) => p.title.includes("talvikenkä"))!;
  assert.equal(shoes.garment_type, "kengät");
  assert.ok(shoes.size_available.every((s) => parseSizeToken(s).kind === "eu"));
});

test("POP: kokohaku löytää oikeat koot muunnetuista kokomerkinnöistä", async () => {
  const { products } = await pop();
  const find = (cm: number, garment: Product["garment_type"]) =>
    products.filter((p) => matchesCriteria(p, { garment_type: garment, child_signal: true, size_cm: cm, size_raw: String(cm) }));
  assert.ok(find(92, "sukat").some((p) => p.title === "Sukat merinovilla"), "sukat 92 cm");
  assert.ok(find(100, "pipo").some((p) => p.title.startsWith("Tuulenpitävä Fleece")), "pipo 100 cm (pää 48-50)");
  assert.equal(find(80, "pipo").some((p) => p.title.startsWith("Tuulenpitävä Fleece")), true, "pää 44-46 sopii 80 cm:lle");
  assert.equal(find(140, "pipo").length, 0, "pipot ovat pienille");
  assert.ok(find(105, "lapaset").some((p) => p.title === "Vedenpitävät topatut lapaset"));
  assert.ok(find(140, "housut").some((p) => p.title === "Housut"));
  assert.equal(find(86, "housut").length, 0);
});

test("POP: hinnat, alennus, väri, toimituskulu ja vaatetyypit otsikosta", async () => {
  const { products } = await pop();
  const pants = byTitle(products, "Housut");
  assert.equal(pants.price.amount, 20.93);
  assert.equal(pants.original_price?.amount, 29.9);
  assert.equal(pants.discount_percent, 30);
  assert.equal(pants.color, "Blue");
  assert.equal(pants.shipping_cost_from?.amount, 4.9);
  assert.equal(pants.gender, null);
  assert.equal(byTitle(products, "Collegepaidat").garment_type, "paita");
  assert.equal(byTitle(products, "Bodyt Röyhelö").garment_type, "body");
  assert.equal(byTitle(products, "Mekko kukallinen").garment_type, "mekko");
  // Sama ryhmä, sama tuote: id on ryhmän id
  assert.ok(pants.id.startsWith("polarnopyret-fi:"));
  // Ilmainen toimitus (0 EUR) säilyy nollana eikä katoa
  assert.equal(products.find((p) => p.title.includes("talvikenkä"))?.shipping_cost_from?.amount, 0);
});

test("garmentFor: otsikko voittaa tuotepolun (polun 'valikerrastot' ei tee pipoa kerrastoksi)", () => {
  const rules = { categoryPaths: true, titleFirstTypes: true };
  const path = "lastenvaatteet  >  ulkovaatteet  >  talvivaatteet  >  valikerrastot";
  assert.equal(garmentFor(path, "Pipo merinovillaa", rules), "pipo");
  assert.equal(garmentFor(path, "Merinovillakerrasto", rules), "kerrasto");
  assert.equal(garmentFor("lastenvaatteet  >  asusteet  >  hanskat", "Lämpimät", rules), "lapaset");
  // Ilman titleFirstTypes (Metsola) ennallaan: tuotetyyppi + otsikko yhdessä
  assert.equal(garmentFor("Pipo", "Rib Helmet", {}), "pipo");
});

test("suomen monikot tunnistetaan: hanskat, rukkaset, paidat, mekot, bodyt, yöpuvut, talvikenkä", () => {
  const cases: [string, string][] = [
    ["Vedenpitävät toppahanskat", "lapaset"], ["Vedenpitävät kuorirukkaset", "lapaset"], ["Collegepaidat", "paita"],
    ["Pyörähdysmekot kukallinen", "mekko"], ["Jatkettava ribbibodyt", "body"], ["Yöpuvut hevoset", "pyjama"],
    ["Vedenpitävä topattu talvikenkä SNOWY", "kengät"], ["Termosaapas SLUSH", "kengät"], ["Mokkasiinit", "kengät"],
    ["Name It lasten toppi Nakal", "paita"],
  ];
  for (const [title, expected] of cases) assert.equal(guessGarmentType(title), expected, title);
  // Toppatakki ja toppahousut eivät muutu topiksi
  assert.equal(guessGarmentType("Toppatakki"), "takki");
  assert.equal(guessGarmentType("Toppahousut"), "toppahousut");
  assert.equal(looksLikeNonClothing("Bodyt raita"), false);
});

test("Kekäle: vain lasten tuotteet, aikuiset pois, virheellisesti 'adult'-merkityt lastenmerkit mukaan", async () => {
  const { rows, products, stats } = await kekale();
  assert.equal(rows.length, 14);
  const titles = products.map((p) => p.title);
  assert.ok(titles.some((t) => t.startsWith("Name It body NBMROBO")), "age_group=adult mutta Name It on lastenmerkki");
  assert.ok(titles.some((t) => t.startsWith("Only and Sons Junior t-paita")));
  assert.ok(!titles.some((t) => /Tommy|Patagonia|miesten|Olymp/i.test(t)), "aikuisten tuotteet");
  assert.ok(!titles.some((t) => /bokseri/i.test(t)), "alusvaatteet");
  assert.ok(stats.notClothingOrAdult >= 4);
  for (const p of products) {
    assert.equal(p.source, "kekale-fi");
    assert.ok(["Name It", "Reima", "Kids Only", "Only and Sons Junior", "Jack and Jones Junior", "Lil Atelier", "Patagonia"].includes(p.brand), p.brand);
  }
});

test("Kekäle: ei kokoja -> size_available tyhjä; hinnat ja alennus syötteestä", async () => {
  const { products } = await kekale();
  for (const p of products) assert.deepEqual(p.size_available, [], p.title);
  const jeans = products.find((p) => p.title.includes("NKFROSE"))!;
  assert.equal(jeans.price.amount, 16.5);
  assert.equal(jeans.original_price?.amount, 32.99);
  assert.equal(jeans.garment_type, "housut");
  assert.equal(jeans.shipping_cost_from, null);
  assert.equal(products.find((p) => p.title.includes("Tank Top"))?.garment_type, "paita");
});

test("Kekäle: kokohaku ohittaa tuotteet, haku ilman kokoa näyttää ne", async () => {
  const { products } = await kekale();
  const jeans = products.find((p) => p.title.includes("NKFROSE"))!;
  assert.equal(matchesCriteria(jeans, { garment_type: "housut", child_signal: true }), true);
  assert.equal(matchesCriteria(jeans, { garment_type: "housut", child_signal: true, size_cm: 110, size_raw: "110" }), false);
  assert.equal(matchesCriteria(jeans, { garment_type: "housut", child_signal: true, size_cm: 164, size_raw: "164" }), false);
  // Muiden kauppojen kokotiedottomat lastentuotteet käyttäytyvät ennallaan
  const other = makeProduct({ id: "x:1", source: "voghion-global", garment_type: "housut", title: "Kids Jeans", size_available: [] });
  assert.equal(matchesCriteria(other, { garment_type: "housut", child_signal: true, size_cm: 110, size_raw: "110" }), true);
});
