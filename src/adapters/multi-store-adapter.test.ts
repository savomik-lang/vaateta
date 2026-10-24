import { test } from "node:test";
import assert from "node:assert/strict";
import { MultiStoreAdapter } from "./multi-store-adapter";
import { InMemoryProductStore } from "../store/product-store";
import { makeProduct } from "../fixtures/make-product";

test("yhdistää tulokset useammasta kaupasta yhdeksi listaksi", async () => {
  const storeA = new InMemoryProductStore([
    makeProduct({ id: "outnorth-se:1", source: "outnorth-se", garment_type: "housut", in_stock: true }),
  ]);
  const storeB = new InMemoryProductStore([
    makeProduct({ id: "voghion-global:1", source: "voghion-global", garment_type: "housut", in_stock: true }),
  ]);

  const adapter = new MultiStoreAdapter([storeA, storeB]);
  const results = await adapter.search({ garment_type: "housut" });

  const ids = results.map((p) => p.id);
  assert.ok(ids.includes("outnorth-se:1"), "löytää tuotteen kaupasta A");
  assert.ok(ids.includes("voghion-global:1"), "löytää tuotteen kaupasta B");
  assert.equal(results.length, 2);
});

test("suodatus toimii yhdistetyn listan yli samalla tavalla kuin yhden kaupan sisällä", async () => {
  const storeA = new InMemoryProductStore([
    makeProduct({ id: "a:1", garment_type: "housut", in_stock: true }),
    makeProduct({ id: "a:2", garment_type: "takki", in_stock: true }), // eri tyyppi, pitää suodattua pois
  ]);
  const storeB = new InMemoryProductStore([
    makeProduct({ id: "b:1", garment_type: "housut", in_stock: false }), // ei varastossa, pitää suodattua pois
  ]);

  const adapter = new MultiStoreAdapter([storeA, storeB]);
  const results = await adapter.search({ garment_type: "housut" });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "a:1");
});

test("tyhjät kaupat eivät kaada hakua, palauttaa tyhjän listan", async () => {
  const adapter = new MultiStoreAdapter([new InMemoryProductStore([]), new InMemoryProductStore([])]);
  const results = await adapter.search({});
  assert.deepEqual(results, []);
});

test("lapsisignaalin yhteydessä hylätään selkeästi aikuisille merkitty tuote otsikon perusteella", async () => {
  const store = new InMemoryProductStore([
    makeProduct({ id: "adult:1", garment_type: "takki", in_stock: true, title: "Women's Classic Wool Coat" }),
    makeProduct({ id: "kids:1", garment_type: "takki", in_stock: true, title: "Kid's Warm Winter Jacket" }),
  ]);
  const adapter = new MultiStoreAdapter([store]);
  const results = await adapter.search({ garment_type: "takki", child_gender_pref: "poika" });
  const ids = results.map((p) => p.id);
  assert.ok(!ids.includes("adult:1"), "naisten takki ei saa näkyä pojalle-haussa");
  assert.ok(ids.includes("kids:1"));
});

test("lapsisignaalin yhteydessä hylätään tuote jonka otsikossa on aikuisten kokoväli (S-5XL)", async () => {
  const store = new InMemoryProductStore([
    makeProduct({ id: "adult:2", garment_type: "takki", in_stock: true, title: "Vintage Wool Blend Coat (Navy/Beige, S-5XL)" }),
  ]);
  const adapter = new MultiStoreAdapter([store]);
  const results = await adapter.search({ garment_type: "takki", size_raw: "110" });
  assert.equal(results.length, 0);
});

test("hylkää paljaan 'Women'/'Men'-sanan otsikossa vaikka omistusmuotoa ('s) ei olisi", async () => {
  const store = new InMemoryProductStore([
    makeProduct({ id: "bare-women:1", garment_type: "takki", in_stock: true, title: "Street Hip Hop Zipper Jacket Women 2022 Harajuku Style" }),
    makeProduct({ id: "bare-men:1", garment_type: "takki", in_stock: true, title: "New Spring Oversize Men Long Jacket" }),
  ]);
  const adapter = new MultiStoreAdapter([store]);
  const results = await adapter.search({ garment_type: "takki", child_gender_pref: "poika" });
  assert.equal(results.length, 0);
});

test("hylkää tuotteen jonka kokoväli ulottuu 6XL:ään asti", async () => {
  const store = new InMemoryProductStore([
    makeProduct({ id: "size6xl:1", garment_type: "housut", in_stock: true, title: "Straight Leg Pants In Light Blue, Black & More (XS-6XL)" }),
  ]);
  const adapter = new MultiStoreAdapter([store]);
  const results = await adapter.search({ garment_type: "housut", size_raw: "92" });
  assert.equal(results.length, 0);
});

test("ilman lapsisignaalia aikuismerkintää ei suodateta pois (relevanssisääntö koskee vain lapsihakuja)", async () => {
  const store = new InMemoryProductStore([
    makeProduct({ id: "adult:3", garment_type: "takki", in_stock: true, title: "Women's Classic Wool Coat" }),
  ]);
  const adapter = new MultiStoreAdapter([store]);
  const results = await adapter.search({ garment_type: "takki" });
  assert.equal(results.length, 1);
});

test("lastImportedAt palauttaa vanhimman päivitysajan kauppojen joukosta", async () => {
  const older = new InMemoryProductStore([makeProduct({ id: "x" })]);
  const newer = new InMemoryProductStore([makeProduct({ id: "y" })]);
  // Pakotetaan "older" näyttämään aidosti vanhemmalta kirjoittamalla se ensin
  // ja odottamalla pieni hetki ennen toista kirjoitusta.
  await older.replaceAll([makeProduct({ id: "x" })]);
  await new Promise((r) => setTimeout(r, 5));
  await newer.replaceAll([makeProduct({ id: "y" })]);

  const adapter = new MultiStoreAdapter([older, newer]);
  const lastImported = await adapter.lastImportedAt();
  const olderTimestamp = await older.lastUpdated();

  assert.equal(lastImported, olderTimestamp, "näyttää vanhimman kaupan ajan, jotta jälkeenjäänyt kauppa huomataan");
});
