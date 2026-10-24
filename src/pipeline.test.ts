import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCriteriaFromText } from "./nlu/parse-query";
import { MultiStoreAdapter } from "./adapters/multi-store-adapter";
import { InMemoryProductStore } from "./store/product-store";
import { rankResults } from "./ranking/rank";
import { sampleProducts } from "./fixtures/sample-products";

test("koko putki: 'talvihaalari 5-vuotiaalle tytölle, max 120€' löytää oikeat tuotteet", async () => {
  const criteria = parseCriteriaFromText("Talvihaalari 5-vuotiaalle tytölle, max 120 €");
  const adapter = new MultiStoreAdapter([new InMemoryProductStore(sampleProducts)]);
  const matches = await adapter.search(criteria);
  const ids = matches.map((p) => p.id);
  assert.ok(ids.includes("fixture:1"));
  assert.ok(!ids.includes("fixture:3"));
  assert.ok(!ids.includes("fixture:5"));
  assert.ok(ids.includes("fixture:2"));
});

test("koko putki: ranking palauttaa halvimman ensin ja piilottaa 'suosituimmat' jos liian vähän arvioita", async () => {
  const criteria = parseCriteriaFromText("Kurahousut vedenpitävät");
  const adapter = new MultiStoreAdapter([new InMemoryProductStore(sampleProducts)]);
  const matches = await adapter.search(criteria);
  const ranked = rankResults(matches);
  assert.equal(ranked.cheapest[0].id, "fixture:4");
  assert.equal(ranked.mostLoved, null);
});

test("koko putki: haku joka ei täsmää mihinkään palauttaa tyhjän listan, ei kaadu", async () => {
  const criteria = parseCriteriaFromText("Kengät 200 cm, max 5€");
  const adapter = new MultiStoreAdapter([new InMemoryProductStore(sampleProducts)]);
  const matches = await adapter.search(criteria);
  assert.equal(matches.length, 0);
  const ranked = rankResults(matches);
  assert.equal(ranked.cheapest.length, 0);
  assert.equal(ranked.mostLoved, null);
});
