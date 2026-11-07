import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseCountry, resolveCountry, hiddenStoreKeys, storeVisibleIn, filterByCountry } from "./geo";
import { STORES } from "./stores-registry";
import { MultiStoreAdapter } from "./adapters/multi-store-adapter";
import { InMemoryProductStore } from "./store/product-store";
import { InMemoryKeyValueStore } from "./store/kv-store";
import { makeProduct } from "./fixtures/make-product";
import { structuredSearchResponse, facetsResponse } from "./structured/handlers";
import { clearMemoryCache } from "./structured/cache";
import { clearSubtypeMemo } from "./structured/search";
import { dedupeResults, shippingNote } from "./ranking/offers";
import { marketFromCountry } from "./lang";

beforeEach(() => { clearMemoryCache(); clearSubtypeMemo(); });

const METSOLA_COUNTRIES = ["FI", "SE", "EE", "LV", "LT", "DK", "DE", "NL", "BE", "LU", "FR", "IE", "ES", "PT", "IT", "MT", "GR", "HR", "AT", "CZ", "SK", "PL", "HU", "RO", "BG"];

test("parseCountry: isot kirjaimet, AX = FI, virheelliset ja tuntemattomat puuttuvia", () => {
  assert.equal(parseCountry("no"), "NO");
  assert.equal(parseCountry(" de "), "DE");
  assert.equal(parseCountry("AX"), "FI");
  assert.equal(parseCountry(["SE", "NO"]), "SE");
  for (const bad of [undefined, null, "", "XX", "T1", "FIN", "1", "F", 5, {}]) assert.equal(parseCountry(bad), undefined, String(bad));
});

test("resolveCountry: ?country voittaa otsakkeen, muuten otsake", () => {
  assert.equal(resolveCountry("NO", "FI"), "NO");
  assert.equal(resolveCountry(undefined, "de"), "DE");
  assert.equal(resolveCountry("zzz", "DE"), "DE");
  assert.equal(resolveCountry(undefined, undefined), undefined);
});

test("Metsolan toimitusmaat: täsmälleen omistajan lista", () => {
  const metsola = STORES.find((s) => s.storeKey === "metsola-fi")!;
  assert.deepEqual([...metsola.shipsTo!].sort(), [...METSOLA_COUNTRIES].sort());
  // Muilla kaupoilla ei rajausta -> näkyvät kaikkialla.
  for (const s of STORES.filter((x) => x.storeKey !== "metsola-fi")) assert.equal(s.shipsTo, undefined, s.storeKey);
});

test("hiddenStoreKeys / storeVisibleIn", () => {
  for (const cc of METSOLA_COUNTRIES) assert.deepEqual(hiddenStoreKeys(cc), [], cc);
  for (const cc of ["NO", "GB", "US", "CY", "SI", "CH", "JP"]) assert.deepEqual(hiddenStoreKeys(cc), ["metsola-fi"], cc);
  assert.deepEqual(hiddenStoreKeys(undefined), []);
  assert.equal(storeVisibleIn("outnorth-fi", "NO"), true);
  assert.equal(storeVisibleIn("metsola-fi", "NO"), false);
  assert.equal(storeVisibleIn("tuntematon-kauppa", "NO"), true);
});

function catalog() {
  return [
    makeProduct({ id: "m:1", source: "metsola-fi", garment_type: "pipo", title: "Lasten pipo", brand: "Metsola", size_available: [] }),
    makeProduct({ id: "m:2", source: "metsola-fi", garment_type: "pipo", title: "Lasten pipo 2", brand: "Metsola", size_available: [] }),
    makeProduct({ id: "o:1", source: "outnorth-fi", garment_type: "pipo", title: "Kids Beanie", brand: "Reima", size_available: [] }),
  ];
}
// Yksi kauppa-instanssi, jotta tuontiversio (päivitysaika) pysyy samana kutsujen välillä.
const sharedStore = new InMemoryProductStore(catalog());
const adapter = () => new MultiStoreAdapter([sharedStore]);

test("filterByCountry: NO ei saa Metsolaa, DE saa; puuttuva maa palauttaa kaiken", () => {
  const all = catalog();
  assert.deepEqual(filterByCountry(all, "NO").map((p) => p.id), ["o:1"]);
  assert.equal(filterByCountry(all, "DE").length, 3);
  assert.equal(filterByCountry(all, undefined), all);
});

test("adapter.loadProductsFor", async () => {
  const a = adapter();
  assert.equal((await a.loadProductsFor("NO")).length, 1);
  assert.equal((await a.loadProductsFor("DE")).length, 3);
  assert.equal((await a.loadProductsFor()).length, 3);
});

test("rakenteinen haku: NO -> 0 Metsolan tuotetta, DE -> Metsola mukana", async () => {
  const sources = async (country?: string) => {
    const r = (await structuredSearchResponse({ items: "pipo" }, { country }, adapter())).body as any;
    return { total: r.total_matches, ids: r.groups[0].results.cheapest.map((p: any) => p.source) };
  };
  const no = await sources("NO");
  assert.equal(no.total, 1);
  assert.ok(!no.ids.includes("metsola-fi"));
  const de = await sources("DE");
  assert.equal(de.total, 3);
  assert.ok(de.ids.includes("metsola-fi"));
  assert.equal((await sources(undefined)).total, 3);
  assert.equal((await sources("FI")).total, 3);
});

test("facets: määrät ja brändit piilottavat Metsolan, välimuisti ei sekoita maita", async () => {
  const kv = new InMemoryKeyValueStore();
  const f = async (country?: string) => {
    const r = await facetsResponse({ items: "pipo" }, "fi", adapter(), kv, country);
    return { body: JSON.parse(r.body as string), cache: r.cache };
  };
  const no = await f("NO");
  assert.equal(no.body.items.pipo, 1);
  assert.deepEqual(no.body.brands, [{ name: "Reima", count: 1 }]);
  assert.equal(no.cache, "miss");
  // Eri piilotuslista -> oma merkintä, ei NO:n tulosta
  const de = await f("DE");
  assert.equal(de.body.items.pipo, 3);
  assert.deepEqual(de.body.brands.map((b: any) => b.name), ["Metsola", "Reima"]);
  assert.equal(de.cache, "miss");
  // Kaikki toimitusmaat (ja maaton) jakavat saman välimuistin
  assert.equal((await f("SE")).cache, "memory");
  assert.equal((await f(undefined)).cache, "memory");
  assert.equal((await f("FI")).body.items.pipo, 3);
  // Toinen piilotettu maa käyttää NO:n merkintää
  const gb = await f("GB");
  assert.equal(gb.cache, "memory");
  assert.equal(gb.body.items.pipo, 1);
});

test("facets: alatyyppien kynnys lasketaan näkyvästä katalogista", async () => {
  const metsolaCaps = Array.from({ length: 8 }, (_, i) =>
    makeProduct({ id: `c:${i}`, source: "metsola-fi", garment_type: "pipo", title: `Lasten lippis ${i}`, brand: "Metsola", size_available: [] }));
  const a = () => new MultiStoreAdapter([new InMemoryProductStore(metsolaCaps)]);
  const sub = async (country?: string) =>
    JSON.parse((await facetsResponse({ items: "pipo" }, "fi", a(), null, country)).body as string).subtypes;
  assert.deepEqual(await sub("DE"), { pipo: ["lippis"] });
  assert.deepEqual(await sub("NO"), {});
});

test("toimitushuomautus: Metsola toimitusmaassa 'Shipped from Finland', FI-kävijälle ei huomautusta", () => {
  const [p] = dedupeResults([makeProduct({ id: "m:1", source: "metsola-fi", garment_type: "pipo", title: "Lasten pipo", brand: "Metsola" })], undefined, { lang: "en", market: marketFromCountry("DE"), country: "DE" });
  assert.equal(p.shipping_note, "Shipped from Finland");
  const [sv] = dedupeResults([makeProduct({ id: "m:1", source: "metsola-fi", garment_type: "pipo", title: "Lasten pipo", brand: "Metsola" })], undefined, { lang: "sv", market: "other", country: "DE" });
  assert.equal(sv.shipping_note, "Leverans från Finland");
  const [fi] = dedupeResults([makeProduct({ id: "m:1", source: "metsola-fi", garment_type: "pipo", title: "Lasten pipo", brand: "Metsola" })], undefined, { lang: "fi", market: "FI", country: "FI" });
  assert.equal(fi.shipping_note, undefined);
  // Maa tuntematon + market=other -> vanha huomautus säilyy; kauppa ilman shipsTo ei muutu
  assert.equal(shippingNote("FI", { lang: "en", market: "other" }), "Finnish online store – check delivery to your country before ordering");
  const [o] = dedupeResults([makeProduct({ id: "o:1", source: "outnorth-fi", garment_type: "pipo", title: "Kids Beanie", brand: "Reima" })], undefined, { lang: "en", market: "other", country: "DE" });
  assert.equal(o.shipping_note, "Finnish online store – check delivery to your country before ordering");
});
