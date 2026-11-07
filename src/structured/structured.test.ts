import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseItem, parseItemList, parseFilters } from "./items";
import { MultiStoreAdapter } from "../adapters/multi-store-adapter";
import { InMemoryProductStore } from "../store/product-store";
import { InMemoryKeyValueStore } from "../store/kv-store";
import { makeProduct } from "../fixtures/make-product";
import { structuredSearchResponse, facetsResponse } from "./handlers";
import { tidyBrandName, isUnknownBrand } from "./items";
import { subtypeOf, SUBTYPE_MIN_PRODUCTS } from "./subtypes";
import { clearSubtypeMemo } from "./search";
import { clearMemoryCache } from "./cache";
import { productSizeFit, cmForShoeEu } from "../size";

beforeEach(() => { clearMemoryCache(); clearSubtypeMemo(); });

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

test("tuntematon alatyyppi ei kaada hakua: ryhmä palautuu nollalla", async () => {
  const r = (await structuredSearchResponse({ items: "kengät.lentokone" }, {}, adapter())).body as any;
  assert.equal(r.groups[0].total_matches, 0);
  assert.equal(r.groups[0].item, "kengät.lentokone");
});

test("facets-määrä = rakenteisen haun total_matches samoilla suodattimilla", async () => {
  const a = adapter();
  const query = { items: "haalari+winter,pipo,lapaset+wp,kengät,mekko", size_cm: "116", gender: "tytto" };
  const facets = JSON.parse((await facetsResponse(query, "fi", a, null)).body as string);
  const search = (await structuredSearchResponse(query, {}, a)).body as any;
  for (const g of search.groups) assert.equal(facets.items[g.item], g.total_matches, g.item);
  assert.deepEqual(facets.subtypes, {});
  assert.ok(Array.isArray(facets.brands));
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

const facets = async (query: Record<string, unknown>, a = adapter(), kv: InMemoryKeyValueStore | null = null) =>
  JSON.parse((await facetsResponse(query, "fi", a, kv)).body as string);

test("tidyBrandName ja isUnknownBrand", () => {
  assert.equal(tidyBrandName("color kids"), "Color Kids");
  assert.equal(tidyBrandName("COLOR KIDS"), "Color Kids");
  assert.equal(tidyBrandName("Reima"), "Reima");
  assert.equal(tidyBrandName("H&M"), "H&M");
  assert.equal(tidyBrandName("polarn o. pyret"), "Polarn O. Pyret");
  assert.equal(tidyBrandName("  Mini   Rodini "), "Mini Rodini");
  for (const u of ["", "  ", "Tuntematon", "unknown", "OKÄND"]) assert.equal(isUnknownBrand(u), true, u);
  assert.equal(isUnknownBrand("Reima"), false);
});

test("facets: brändit määrän mukaan, nimet siistittynä ja yhdistettynä", async () => {
  const f = await facets({ items: "haalari+winter,pipo,lapaset+wp" });
  // haalari+winter: Reima 1 (aikuisten haalari pois), pipo: color kids 1 + Reima 2, lapaset+wp: Reima 1
  assert.deepEqual(f.brands, [{ name: "Reima", count: 4 }, { name: "Color Kids", count: 1 }]);
});

test("facets: brand_items rajaa brändilistan valittuihin itemeihin, items-määrät pysyvät", async () => {
  const f = await facets({ items: "haalari+winter,pipo,lapaset+wp", brand_items: "pipo" });
  assert.deepEqual(f.brands, [{ name: "Reima", count: 2 }, { name: "Color Kids", count: 1 }]);
  assert.equal(f.items.pipo, 3);
  assert.equal(f.items["haalari+winter"], 1);
  const none = await facets({ items: "pipo", brand_items: "haalari+winter" });
  assert.deepEqual(none.brands, [{ name: "Reima", count: 1 }]);
});

test("facets: brands-suodatin ei kavenna brändilistaa, mutta kaventaa määrät", async () => {
  const f = await facets({ items: "pipo", brands: "Reima" });
  assert.equal(f.items.pipo, 2);
  assert.deepEqual(f.brands, [{ name: "Reima", count: 2 }, { name: "Color Kids", count: 1 }]);
  // nimi palaa takaisin sellaisenaan (Color Kids vs raaka "color kids")
  const ck = await facets({ items: "pipo", brands: "Color Kids" });
  assert.equal(ck.items.pipo, 1);
});

test("facets: tuntematon ja tyhjä brändi pois listasta mutta mukana määrässä; kirjoitusasut yhdistyvät", async () => {
  const a = adapter([
    makeProduct({ id: "a:1", garment_type: "pipo", title: "Kids Beanie 1", brand: "Tuntematon", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "a:2", garment_type: "pipo", title: "Kids Beanie 2", brand: "", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "a:3", garment_type: "pipo", title: "Kids Beanie 3", brand: "reima", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "a:4", garment_type: "pipo", title: "Kids Beanie 4", brand: "REIMA", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "a:5", garment_type: "pipo", title: "Kids Beanie 5", brand: "Reima", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "a:6", garment_type: "pipo", title: "Kids Beanie 6", brand: "NAME IT", size_available: [], source: "outnorth-fi" }),
  ]);
  const f = await facets({ items: "pipo" }, a);
  assert.equal(f.items.pipo, 6);
  assert.deepEqual(f.brands, [{ name: "Reima", count: 3 }, { name: "Name It", count: 1 }]);
});

test("facets: sama tuote usean itemin osumana lasketaan brändilistassa kerran", async () => {
  const a = adapter([
    makeProduct({ id: "t:1", garment_type: "takki", title: "Kids Winter Jacket", brand: "Reima", winter: true, waterproof: true, size_available: [], source: "outnorth-fi" }),
  ]);
  const f = await facets({ items: "takki,takki+winter,takki+wp" }, a);
  assert.deepEqual(f.items, { takki: 1, "takki+winter": 1, "takki+wp": 1 });
  assert.deepEqual(f.brands, [{ name: "Reima", count: 1 }]);
});

test("facets: brändejä enintään 30, järjestys määrä laskevasti ja nimi nousevasti", async () => {
  const products = [];
  for (let b = 0; b < 35; b++) {
    const n = b === 0 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      products.push(makeProduct({ id: `m:${b}-${i}`, garment_type: "pipo", title: `Kids Beanie ${b} ${i}`, brand: `Brand${String(b).padStart(2, "0")}`, size_available: [], source: "outnorth-fi" }));
    }
  }
  const f = await facets({ items: "pipo" }, adapter(products));
  assert.equal(f.brands.length, 30);
  assert.deepEqual(f.brands[0], { name: "Brand00", count: 3 });
  assert.equal(f.brands[1].name, "Brand01");
  assert.equal(f.brands[29].name, "Brand29");
});

test("facets: virheellinen brand_items -> 400; eri brand_items eivät jaa välimuistia", async () => {
  const a = adapter();
  const bad = await facetsResponse({ items: "pipo", brand_items: "foo" }, "fi", a, null);
  assert.equal(bad.status, 400);
  assert.deepEqual((bad.body as any).invalid_items, ["foo"]);
  const kv = new InMemoryKeyValueStore();
  const all = await facets({ items: "pipo,lapaset" }, a, kv);
  const only = await facets({ items: "pipo,lapaset", brand_items: "lapaset" }, a, kv);
  assert.equal(all.brands[0].count, 4);
  assert.equal(only.brands[0].count, 2);
});

test("retkeilyvarusteet (polttoainepullon korkki, juomapullo) eivät tule vaatteina; väri 'bottle green' ei estä", async () => {
  const { looksLikeNonClothing } = await import("../nlu/non-clothing");
  for (const t of ["Primus Fuel Bottle Cap - Child proof Nocolour", "Klean Kanteen Kid Sippy Cap Green", "Klean Kanteen Baby Bottle 148 ml With Slow Flow Nipple", "MSR Fuel Bottle Cap Child Resistant", "Kids Water Bottle"]) {
    assert.equal(looksLikeNonClothing(t), true, t);
  }
  for (const t of ["Kids Bottle Green Jacket", "Kids Cap", "Kids Beanie", "Reima Kids Boots"]) {
    assert.equal(looksLikeNonClothing(t), false, t);
  }
  const a = adapter([
    makeProduct({ id: "x:1", garment_type: "pipo", title: "Primus Fuel Bottle Cap - Child proof", brand: "Primus", size_available: ["One Size"], source: "outnorth-fi" }),
    makeProduct({ id: "x:2", garment_type: "pipo", title: "Kids Beanie", brand: "Reima", size_available: [], source: "outnorth-fi" }),
    makeProduct({ id: "x:3", garment_type: "pipo", title: "Kids Beanie 2", brand: "voghion", size_available: [], source: "outnorth-fi" }),
  ]);
  const f = await facets({ items: "pipo" }, a);
  assert.equal(f.items.pipo, 2, "korkki ei ole pipo");
  assert.deepEqual(f.brands, [{ name: "Reima", count: 1 }], "Primus ja Voghion pois");
});

test("facets-välimuisti mitätöityy uudella julkaisulla (commit), vaikka tuonti ei ole muuttunut", async () => {
  const kv = new InMemoryKeyValueStore();
  const store = new InMemoryProductStore(catalog());
  const saved = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    process.env.VERCEL_GIT_COMMIT_SHA = "aaaaaaaaaaaa";
    assert.equal((await facetsResponse({ items: "pipo" }, "fi", new MultiStoreAdapter([store]), kv)).cache, "miss");
    assert.equal((await facetsResponse({ items: "pipo" }, "fi", new MultiStoreAdapter([store]), kv)).cache, "memory");
    process.env.VERCEL_GIT_COMMIT_SHA = "bbbbbbbbbbbb";
    assert.equal((await facetsResponse({ items: "pipo" }, "fi", new MultiStoreAdapter([store]), kv)).cache, "miss");
  } finally {
    if (saved === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = saved;
  }
});

const withTitle = (garment: any, title: string, extra: Record<string, unknown> = {}) =>
  makeProduct({ id: `s:${garment}:${title}`, garment_type: garment, title, brand: "Reima", size_available: [], source: "outnorth-fi", ...extra });

test("alatyyppien tunnistus fi/sv/en otsikosta", () => {
  const cases: [string, string, string | null][] = [
    ["kengät", "Kids Sneakers Blue", "lenkkarit"], ["kengät", "Lasten lenkkarit", "lenkkarit"], ["kengät", "Löparsko barn", "lenkkarit"], ["kengät", "Kids Running Shoes", "lenkkarit"],
    ["kengät", "Kids Sandals", "sandaalit"], ["kengät", "Lasten sandaalit", "sandaalit"], ["kengät", "Sandaler barn", "sandaalit"],
    ["kengät", "Kids Slippers", "tossut"], ["kengät", "Lasten tohvelit", "tossut"], ["kengät", "Tofflor barn", "tossut"],
    ["kengät", "Kids Rain Boots", "kumisaappaat"], ["kengät", "Kurasaappaat lapsille", "kumisaappaat"], ["kengät", "Gummistövlar barn", "kumisaappaat"], ["kengät", "Wellies Kids", "kumisaappaat"],
    ["kengät", "Kids Winter Boots", null],
    ["pipo", "Kids Cap", "lippis"], ["pipo", "Lasten lippis", "lippis"], ["pipo", "Keps barn", "lippis"], ["pipo", "Sun Hat Kids", "aurinkohattu"], ["pipo", "Solhatt barn", "aurinkohattu"],
    ["pipo", "Rib Helmet -Kypärämyssy", "kypärämyssy"], ["pipo", "Balaclava Kids", "kypärämyssy"], ["pipo", "Kids Beanie", null],
    ["lapaset", "Kids Mittens", "lapaset"], ["lapaset", "Lasten vanttuut", "lapaset"], ["lapaset", "Lasten sormikkaat", "sormikkaat"], ["lapaset", "Kids Gloves", "sormikkaat"], ["lapaset", "Fingervantar barn", "sormikkaat"],
    ["paita", "Kids T-Shirt", "t-paita"], ["paita", "Lasten t-paita", "t-paita"], ["paita", "Long Sleeve Top", "pitkähihainen"], ["paita", "Långärmad tröja", "pitkähihainen"],
    ["paita", "Kids Hoodie", "huppari"], ["paita", "Lasten huppari", "huppari"], ["paita", "Huvtröja barn", "huppari"],
    ["paita", "Kids Fleece Sweater", "fleece"], ["paita", "Midlayer Kids", "fleece"], ["paita", "Wool Knit Sweater", "neule"], ["paita", "Lasten neule", "neule"], ["paita", "Stickad tröja", "neule"],
    ["housut", "Kids Jeans", "farkut"], ["housut", "Lasten farkut", "farkut"], ["housut", "Kids Shorts", "shortsit"], ["housut", "Puppy -Leggingsit", "leggingsit"], ["housut", "Kids Leggings", "leggingsit"],
    ["housut", "Kids Softshell Pants", "ulkoiluhousut"], ["housut", "Hiking Pants Kids", "ulkoiluhousut"], ["housut", "Kids Chino", null],
    ["takki", "Kids Softshell Jacket", "softshell"], ["takki", "Kids Shell Jacket", "kuoritakki"], ["takki", "Lasten kuoritakki", "kuoritakki"], ["takki", "Kids Down Jacket", "toppatakki"], ["takki", "Puffer Jacket Kids", "toppatakki"], ["takki", "Lasten toppatakki", "toppatakki"], ["takki", "Kids Fleece Jacket", null],
    ["haalari", "Kids Overall", null],
  ];
  for (const [g, title, want] of cases) assert.equal(subtypeOf(withTitle(g, title)), want, `${g}: ${title}`);
  assert.equal(subtypeOf(withTitle("kengät", "Kids Sneakers", { subtype: "sandaalit" })), "sandaalit", "tuonnissa asetettu subtype ensisijainen");
});

function shoeCatalog() {
  const p = [];
  for (let i = 0; i < SUBTYPE_MIN_PRODUCTS + 2; i++) p.push(withTitle("kengät", `Kids Sneakers Model ${i}`, { size_available: ["30"] }));
  for (let i = 0; i < SUBTYPE_MIN_PRODUCTS; i++) p.push(withTitle("kengät", `Kids Rain Boots Model ${i}`, { size_available: ["30"], waterproof: true }));
  for (let i = 0; i < SUBTYPE_MIN_PRODUCTS - 1; i++) p.push(withTitle("kengät", `Kids Sandals Model ${i}`, { size_available: ["30"] }));
  p.push(withTitle("kengät", "Kids Winter Boots", { size_available: ["30"], winter: true }));
  for (let i = 0; i < 3; i++) p.push(withTitle("paita", `Kids T-Shirt ${i}`));
  return p;
}

test("facets: alatyypit vain kynnyksen (8 tuotetta) ylittäville, määrän mukaan, vain pyydetyille vaatetyypeille", async () => {
  const a = adapter(shoeCatalog());
  const f = await facets({ items: "kengät,paita" }, a);
  assert.deepEqual(f.subtypes, { kengät: ["lenkkarit", "kumisaappaat"] }, "sandaaleja 7 < 8 ja t-paitoja 3 < 8");
  const none = await facets({ items: "pipo" }, a);
  assert.deepEqual(none.subtypes, {});
  const onlyPaita = await facets({ items: "paita" }, a);
  assert.deepEqual(onlyPaita.subtypes, {}, "kenkien alatyyppejä ei palauteta, jos kenkiä ei pyydetty");
});

test("facets: alatyyppilista ei riipu koosta, sukupuolesta eikä brändistä", async () => {
  const a = adapter(shoeCatalog());
  const base = await facets({ items: "kengät" }, a);
  const filtered = await facets({ items: "kengät", size_cm: "110", gender: "tytto", brands: "Joku Muu" }, a);
  assert.deepEqual(filtered.subtypes, base.subtypes);
});

test("rakenteinen haku: alatyyppi-item palauttaa vain kyseisen alatyypin ja lukumäärä = facets", async () => {
  const a = adapter(shoeCatalog());
  const r = (await structuredSearchResponse({ items: "kengät.lenkkarit,kengät.kumisaappaat,kengät" }, {}, a)).body as any;
  const [lenk, kumi, all] = r.groups;
  assert.equal(lenk.total_matches, SUBTYPE_MIN_PRODUCTS + 2);
  assert.equal(kumi.total_matches, SUBTYPE_MIN_PRODUCTS);
  assert.ok(all.total_matches > lenk.total_matches + kumi.total_matches, "koko kengät-ryhmä sisältää muutkin");
  const titles = [...lenk.results.cheapest, ...lenk.results.bestMatch].map((p: any) => p.title);
  assert.ok(titles.length > 0 && titles.every((t: string) => /Sneakers/.test(t)));
  const f = await facets({ items: "kengät.lenkkarit,kengät.kumisaappaat,kengät" }, a);
  assert.equal(f.items["kengät.lenkkarit"], lenk.total_matches);
  assert.equal(f.items["kengät.kumisaappaat"], kumi.total_matches);
  // alatyyppi ei muuta garment_type-luokitusta
  assert.ok([...lenk.results.cheapest].every((p: any) => p.garment_type === "kengät"));
});

test("alatyyppi + modifierit ja koko: kengät.kumisaappaat+wp koolla 30", async () => {
  const a = adapter(shoeCatalog());
  const r = (await structuredSearchResponse({ items: "kengät.kumisaappaat+wp,kengät.lenkkarit+wp", shoe_eu: "30" }, {}, a)).body as any;
  assert.equal(r.groups[0].total_matches, SUBTYPE_MIN_PRODUCTS);
  assert.equal(r.groups[1].total_matches, 0, "lenkkarit eivät ole vedenpitäviä");
});
