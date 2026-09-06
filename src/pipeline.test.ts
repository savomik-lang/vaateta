import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCriteriaFromText } from "./nlu/parse-query";
import { BooztAdapter } from "./adapters/boozt";
import { InMemoryProductStore } from "./store/product-store";
import { rankResults } from "./ranking/rank";
import { sampleProducts } from "./fixtures/sample-products";

test("koko putki: 'talvihaalari 5-vuotiaalle tytölle, max 120€' löytää oikeat tuotteet", async () => {
  const criteria = parseCriteriaFromText(
    "Talvihaalari 5-vuotiaalle tytölle, max 120 €"
  );

  const store = new InMemoryProductStore(sampleProducts);
  const adapter = new BooztAdapter(store);
  const matches = await adapter.search(criteria);

  // Odotettu: fixture:1 (Reima, tyttö, 109€) ja fixture:3 (Polarn O. Pyret,
  // tyttö, 128€ -> YLI budjetin, pitää suodattua pois).
  // fixture:5 on loppuunmyyty -> pitää suodattua pois riippumatta muusta.
  const ids = matches.map((p) => p.id);
  assert.ok(ids.includes("fixture:1"), "Reiman haalari täyttää kriteerit");
  assert.ok(!ids.includes("fixture:3"), "Yli budjetin oleva haalari suodattuu pois");
  assert.ok(!ids.includes("fixture:5"), "Loppuunmyyty tuote suodattuu aina pois");
  assert.ok(ids.includes("fixture:2"), "Unisex-haalari täsmää myös 'tytölle'-rajaukseen, koska unisex sopii kummallekin");
});

test("koko putki: ranking palauttaa halvimman ensin ja piilottaa 'suosituimmat' jos liian vähän arvioita", async () => {
  const criteria = parseCriteriaFromText("Kurahousut vedenpitävät");
  const store = new InMemoryProductStore(sampleProducts);
  const adapter = new BooztAdapter(store);

  const matches = await adapter.search(criteria);
  const ranked = rankResults(matches);

  assert.equal(ranked.cheapest[0].id, "fixture:4", "Halvin kurahousu on ensin");
  // Vain 1 kurahousu-tuote fixturessa -> alle 3 arvioitua -> piilotettu
  assert.equal(ranked.mostLoved, null);
});

test("koko putki: haku joka ei täsmää mihinkään palauttaa tyhjän listan, ei kaadu", async () => {
  const criteria = parseCriteriaFromText("Kengät 200 cm, max 5€");
  const store = new InMemoryProductStore(sampleProducts);
  const adapter = new BooztAdapter(store);

  const matches = await adapter.search(criteria);
  assert.equal(matches.length, 0);

  const ranked = rankResults(matches);
  assert.equal(ranked.cheapest.length, 0);
  assert.equal(ranked.mostLoved, null);
});
