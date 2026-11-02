import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseItem, parseItemList, parseFilters } from "./items";
import { MultiStoreAdapter } from "../adapters/multi-store-adapter";
import { InMemoryProductStore } from "../store/product-store";
import { InMemoryKeyValueStore } from "../store/kv-store";
import { makeProduct } from "../fixtures/make-product";
import { structuredSearchResponse, facetsResponse } from "./handlers";
import { clearMemoryCache } from "./cache";
import { productSizeFit, cmForShoeEu } from "../size";

beforeEach(() => clearMemoryCache());

function catalog() {
  return [
    makeProduct({ id: "h:1", garment_type: "haalari", title: "Kids Winter Overall", brand: "Reima", size_available: ["104", "110", "116"], winter: true, waterproof: true, source: "outnorth-fi" }),
    makeProduct({ id: "h:2", garment_type: "haalari", title: "Kids Rain Overall", brand: "Didriksons", size_available: ["110", "116"], winter: false, waterproof: true, source: "outnorth-fi" }),
    makeProduct({ id: "h:3", garment_type: "haalari", title: "Women's Winter Overall", brand: "Reima", size_available: ["S", "M"], winter: true, source: "outnorth-fi" }),
    makeProduct({ id: "p:1", garment_type: "pipo", title: "Kids Beanie", brand: "color kids", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "p:2", garment_type: "pipo", title: "Kids Beanie Girls", brand: "Reima", gender: "tyttö", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "p:3", garment_type: "pipo", title: "Kids Beanie Boys", brand: "Reima", gender: "poika", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "l:1", garment_type: "lapaset", title: "Kids Mittens", brand: "Reima", waterproof: true, size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "l:2", garment_type: "lapaset", title: "Kids Wool Mittens", brand: "Reima", waterproof: false, size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "k:1", garment_type: "kengät", title: "Kids Sneakers", brand: "Reima", size_available: ["30", "31"], source: "outnorth-fi" }),
    makeProduct({ id: "k:2", garment_type: "kengät", title: "Kids Boots", brand: "Reima", size_available: ["36"], source: "outnorth-fi" }),
  ];
}
const adapter = (products = catalog()) => new MultiStoreAdapter([new InMemoryProductStore(products)]);

test("parseItem: tyyppi, modifierit ja alatyyppi", () => {
  assert.deepEqual(parseItem("haalari+winter"), { id: "haalari+winter", garment: "haalari", winter: true, wp: false });
  assert.deepEqual(parseItem("lapaset+wp"), { id: "lapaset+wp", garment: "lapaset", winter: false, wp: true });
  assert.equal(parseItem("kengät+wp")?.garment, "kengät");
  assert.equal(parseItem("kengät.lenkkarit")?.subtype, "lenkkarit");
  assert.equal(parseItem("paita")?.id, "paita");
  // '+' saapuu kyselymerkkijonossa välilyöntinä
  assert.equal(parseItem("haalari winter")?.winter, true);
  assert.equal(parseItem("haalari winter")?.id, "haalari+winter");
  assert.equal(parseItem("HAALARI+Winter")?.garment, "haalari");
});

test("parseItem: virheelliset hylätään", () => {
  assert.equal(parseItem(""), null);
  assert.equal(parseItem("muu"), null);
  assert.equal(parseItem("lentokone"), null);
  assert.equal(parseItem("haalari+kesä"), null);
  assert.equal(parseItem("haalari.+winter"), null);
  assert.equal(parseItem("haalari.<script>"), null);
});

test("parseItemList: rajat ja virheelliset", () => {
  assert.equal(parseItemList(undefined, 10).ok, false);
  const ok = parseItemList("haalari+winter,pipo,lapaset+wp", 10);
  assert.ok(ok.ok && ok.items.length === 3);
  const bad = parseItemList("haalari,foo,bar+x", 10);
  assert.ok(!bad.ok && bad.invalid_items?.join() === "foo,bar+x");
  assert.equal(parseItemList("a,b", 1).ok, false);
  const many = Array.from({ length: 11 }, () => "pipo").join(",");
  assert.equal(parseItemList(many, 10).ok, false);
  assert.equal(parseItemList(many, 20).ok, true);
});

test("parseFilters: koko, sukupuoli, brändit", () => {
  const r = parseFilters({ size_cm: "110", shoe_eu: "30", gender: "tytto", brands: "Reima,Lindberg,reima" });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.filters, { size_cm: 110, shoe_eu: 30, gender: "tyttö", brands: ["Reima", "Lindberg"] });
  const none = parseFilters({});
  assert.ok(none.ok && none.filters.gender === null && none.filters.size_cm === null && none.filters.brands.length === 0);
  const bad = parseFilters({ size_cm: "abc", gender: "robotti", shoe_eu: "99" });
  assert.ok(!bad.ok && bad.invalid_params.join() === "size_cm,shoe_eu,gender");
});

test("kenkien shoe_eu käytetään sellaisenaan (myös taulukon ulkopuoliset koot 18-42)", () => {
  for (let eu = 18; eu <= 42; eu++) {
    assert.equal(productSizeFit([String(eu)], cmForShoeEu(eu), true, eu), "exact", `EU ${eu}`);
  }
  // EU 28 ei ole kokotaulukossa: ilman tarkkaa arvoa lähin taulukkokoko (29) veisi väärälle alueelle
  assert.equal(productSizeFit(["26"], cmForShoeEu(28), true, 28), "smaller");
  assert.equal(productSizeFit(["27"], cmForShoeEu(28), true, 28), "exact");
});

test("rakenteinen haku: ryhmät samassa järjestyksessä, nolla-ryhmä palautetaan", async () => {
  const r = await structuredSearchResponse({ items: "haalari+winter,pipo,mekko" }, { lang: "fi", market: "FI" }, adapter());
  assert.equal(r.status, 200);
  const b = r.body as any;
  assert.equal(b.mode, "structured");
  assert.deepEqual(b.groups.map((g: any) => g.item), ["haalari+winter", "pipo", "mekko"]);
  assert.equal(b.groups[2].total_matches, 0);
  assert.ok(b.groups[2].notice);
  assert.deepEqual(b.groups[2].results.cheapest, []);
  assert.equal(b.total_matches, b.groups.reduce((s: number, g: any) => s + g.total_matches, 0));
  assert.equal(b.groups[0].total_matches, 1); // vain lasten talvihaalari: sade-, ja naisten haalari pois
  assert.equal(b.groups[0].results.cheapest[0].id, "h:1");
});

test("rakenteinen haku: lapsisuodatus aina päällä (aikuisten tuotteet pois)", async () => {
  const r = await structuredSearchResponse({ items: "haalari" }, {}, adapter());
  const ids = (r.body as any).groups[0].results.cheapest.map((p: any) => p.id);
  assert.ok(!ids.includes("h:3"));
});

test("rakenteinen haku: wp, gender, brands (tarkka) ja koko", async () => {
  const a = adapter();
  const wp = (await structuredSearchResponse({ items: "lapaset+wp" }, {}, a)).body as any;
  assert.deepEqual(wp.groups[0].results.cheapest.map((p: any) => p.id), ["l:1"]);

  const girl = (await structuredSearchResponse({ items: "pipo", gender: "tytto" }, {}, a)).body as any;
  assert.deepEqual(girl.groups[0].results.cheapest.map((p: any) => p.id).sort(), ["p:1", "p:2"]); // unisex mukana, poika pois
  assert.equal(girl.filters.gender, "tyttö");

  const exact = (await structuredSearchResponse({ items: "pipo", brands: "Color" }, {}, a)).body as any;
  assert.equal(exact.groups[0].total_matches, 0); // ei osamerkkijonoa
  const full = (await structuredSearchResponse({ items: "pipo", brands: "Color Kids" }, {}, a)).body as any;
  assert.deepEqual(full.groups[0].results.cheapest.map((p: any) => p.id), ["p:1"]);

  const sized = (await structuredSearchResponse({ items: "haalari+winter", size_cm: "116" }, {}, a)).body as any;
  assert.equal(sized.groups[0].total_matches, 1);
  assert.ok(sized.groups[0].results.bestMatch.length > 0);
  const tooBig = (await structuredSearchResponse({ items: "haalari+winter", size_cm: "152" }, {}, a)).body as any;
  assert.equal(tooBig.groups[0].total_matches, 0);
});

test("rakenteinen haku: shoe_eu vs size_cm kengille", async () => {
  const a = adapter();
  const eu = (await structuredSearchResponse({ items: "kengät", shoe_eu: "30" }, {}, a)).body as any;
  assert.deepEqual(eu.groups[0].results.cheapest.map((p: any) => p.id), ["k:1"]);
  // ilman shoe_eu:ta size_cm muunnetaan EU-kooksi
  const cm = (await structuredSearchResponse({ items: "kengät", size_cm: String(cmForShoeEu(30)) }, {}, a)).body as any;
  assert.deepEqual(cm.groups[0].results.cheapest.map((p: any) => p.id), ["k:1"]);
  // shoe_eu ei vaikuta vaatteisiin
  const mixed = (await structuredSearchResponse({ items: "haalari+winter,kengät", shoe_eu: "30" }, {}, a)).body as any;
  assert.equal(mixed.groups[0].total_matches, 1);
  assert.equal(mixed.groups[1].total_matches, 1);
});

test("rakenteinen haku: virheet 400", async () => {
  const a = adapter();
  const bad = await structuredSearchResponse({ items: "haalari,foo" }, {}, a);
  assert.equal(bad.status, 400);
  assert.deepEqual((bad.body as any).invalid_items, ["foo"]);
  assert.equal((await structuredSearchResponse({}, {}, a)).status, 400);
  const p = await structuredSearchResponse({ items: "pipo", size_cm: "x" }, { lang: "sv" }, a);
  assert.equal(p.status, 400);
  assert.deepEqual((p.body as any).invalid_params, ["size_cm"]);
});

test("alatyyppi-itemillä ei ole vielä osumia (vaihe B2), mutta ryhmä palautetaan", async () => {
  const r = (await structuredSearchResponse({ items: "kengät.lenkkarit" }, {}, adapter())).body as any;
  assert.equal(r.groups[0].total_matches, 0);
  assert.equal(r.groups[0].item, "kengät.lenkkarit");
});

test("facets-määrä = rakenteisen haun total_matches samoilla suodattimilla", async () => {
  const a = adapter();
  const query = { items: "haalari+winter,pipo,lapaset+wp,kengät,mekko", size_cm: "116", gender: "tytto" };
  const facets = JSON.parse((await facetsResponse(query, "fi", a, null)).body as string);
  const search = (await structuredSearchResponse(query, {}, a)).body as any;
  for (const g of search.groups) assert.equal(facets.items[g.item], g.total_matches, g.item);
  assert.deepEqual(facets.subtypes, {});
  assert.deepEqual(facets.brands, []);
});

test("facets: virheet ja enimmäismäärä 20", async () => {
  const a = adapter();
  assert.equal((await facetsResponse({}, "fi", a, null)).status, 400);
  assert.equal((await facetsResponse({ items: "foo" }, "fi", a, null)).status, 400);
  const twenty = Array.from({ length: 20 }, (_, i) => (i % 2 ? "pipo" : "lapaset")).join(",");
  assert.equal((await facetsResponse({ items: twenty }, "fi", a, null)).status, 200);
  assert.equal((await facetsResponse({ items: twenty + ",pipo" }, "fi", a, null)).status, 400);
});

test("facets-välimuisti: toinen kutsu osuu muistiin, uusi tuonti mitätöi", async () => {
  const kv = new InMemoryKeyValueStore();
  const store = new InMemoryProductStore(catalog());
  const first = await facetsResponse({ items: "pipo" }, "fi", new MultiStoreAdapter([store]), kv);
  assert.equal(first.cache, "miss");
  const second = await facetsResponse({ items: "pipo" }, "fi", new MultiStoreAdapter([store]), kv);
  assert.equal(second.cache, "memory");
  assert.equal(second.body, first.body);
  // Redis-polku: tyhjennetään prosessimuisti
  clearMemoryCache();
  const third = await facetsResponse({ items: "pipo" }, "fi", new MultiStoreAdapter([store]), kv);
  assert.equal(third.cache, "redis");
  // uusi tuonti = uusi versio -> uudelleenlasku
  await new Promise((r) => setTimeout(r, 5));
  await store.replaceAll(catalog().slice(0, 3));
  const fourth = await facetsResponse({ items: "pipo" }, "fi", new MultiStoreAdapter([store]), kv);
  assert.equal(fourth.cache, "miss");
  assert.equal(JSON.parse(fourth.body as string).items.pipo, 0);
});

test("facets: eri suodattimet eivät jaa välimuistia", async () => {
  const kv = new InMemoryKeyValueStore();
  const a = adapter();
  const all = JSON.parse((await facetsResponse({ items: "pipo" }, "fi", a, kv)).body as string);
  const girl = JSON.parse((await facetsResponse({ items: "pipo", gender: "tytto" }, "fi", a, kv)).body as string);
  assert.equal(all.items.pipo, 3);
  assert.equal(girl.items.pipo, 2);
});

test("rakenteinen haku: taulukon ulkopuolinen shoe_eu (28) rajaa tarkasti", async () => {
  const a = adapter([
    makeProduct({ id: "s:27", garment_type: "kengät", title: "Kids Shoe A", size_available: ["27"] }),
    makeProduct({ id: "s:33", garment_type: "kengät", title: "Kids Shoe B", size_available: ["33"] }),
  ]);
  const r = (await structuredSearchResponse({ items: "kengät", shoe_eu: "28" }, {}, a)).body as any;
  assert.deepEqual(r.groups[0].results.cheapest.map((p: any) => p.id), ["s:27"]);
});
