import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBestValue, rankResults } from "./rank";
import { makeProduct } from "../fixtures/make-product";

test("tyhjä lista ei kaadu, palauttaa tyhjän", () => {
  assert.deepEqual(computeBestValue([]), []);
});
test("valitsee vain halvimman kolmanneksen joukosta", () => {
  const products = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((amount, i) =>
    makeProduct({ id: `p${i}`, price: { amount, currency: "EUR" }, waterproof: true }));
  const result = computeBestValue(products);
  assert.ok(result.map((p) => p.price.amount).every((p) => p <= 30));
});
test("karsii pois tuotteet joilla ei ole laatusignaalia, jos vaihtoehtoja riittää", () => {
  const withQuality = makeProduct({ id: "quality", price: { amount: 10, currency: "EUR" }, waterproof: true });
  const withoutQuality = makeProduct({ id: "no-quality", price: { amount: 11, currency: "EUR" }, waterproof: null, material: null, title: "Perus tuote" });
  const filler = [12, 13, 14, 15].map((amount, i) => makeProduct({ id: `filler${i}`, price: { amount, currency: "EUR" }, waterproof: true }));
  const expensivePadding = Array.from({ length: 12 }, (_, i) => makeProduct({ id: `padding${i}`, price: { amount: 1000 + i, currency: "EUR" } }));
  const result = computeBestValue([withQuality, withoutQuality, ...filler, ...expensivePadding]);
  assert.ok(!result.map((p) => p.id).includes("no-quality"));
});
test("täydentää listaa laaduttomilla, jos laadukkaita ei ole tarpeeksi", () => {
  const withQuality = makeProduct({ id: "quality", price: { amount: 10, currency: "EUR" }, waterproof: true });
  const withoutQuality = makeProduct({ id: "no-quality", price: { amount: 11, currency: "EUR" }, waterproof: null, material: null, title: "Perus tuote" });
  const expensivePadding = Array.from({ length: 4 }, (_, i) => makeProduct({ id: `padding${i}`, price: { amount: 1000 + i, currency: "EUR" } }));
  const result = computeBestValue([withQuality, withoutQuality, ...expensivePadding]);
  assert.ok(result.map((p) => p.id).includes("no-quality"));
});
test("järjestää brändi-tason mukaan ennen hintaa ehdokkaiden sisällä", () => {
  const premiumPricier = makeProduct({ id: "premium", brand: "Reima", price: { amount: 20, currency: "EUR" }, waterproof: true });
  const budgetCheaper = makeProduct({ id: "budget", brand: "Tuntematon Merkki", price: { amount: 10, currency: "EUR" }, waterproof: true });
  const expensivePadding = Array.from({ length: 4 }, (_, i) => makeProduct({ id: `padding${i}`, price: { amount: 1000 + i, currency: "EUR" } }));
  const result = computeBestValue([premiumPricier, budgetCheaper, ...expensivePadding]);
  assert.equal(result[0].id, "premium");
});
test("rankResults palauttaa kaikki kolme listaa yhdessä kutsussa", () => {
  const products = [makeProduct({ id: "a", price: { amount: 10, currency: "EUR" }, waterproof: true }), makeProduct({ id: "b", price: { amount: 20, currency: "EUR" } })];
  const ranked = rankResults(products);
  assert.ok(Array.isArray(ranked.cheapest));
  assert.ok(Array.isArray(ranked.bestValue));
  assert.equal(ranked.mostLoved, null);
});
