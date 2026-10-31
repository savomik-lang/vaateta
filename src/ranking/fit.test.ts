import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProduct } from "../fixtures/make-product";
import { dedupeColorVariants, fitContextFromCriteria, fitScore, fitTier, sizePenalty } from "./fit";
import { rankResults } from "./rank";

const shoeCtx = fitContextFromCriteria({ garment_type: "kengät", size_cm: 164, age: 14, child_signal: true } as any);
const coatCtx = fitContextFromCriteria({ garment_type: "takki", size_cm: 164, age: 14, child_signal: true } as any);

test("kenkä EU 40-41 sopii 14-vuotiaalle paremmin kuin 39 ja 36", () => {
  assert.equal(sizePenalty(["41"], shoeCtx), 0);
  assert.equal(sizePenalty(["40"], shoeCtx), 0);
  assert.equal(sizePenalty(["39"], shoeCtx), 1);
  assert.ok(sizePenalty(["36"], shoeCtx) > 2);
  assert.equal(sizePenalty(["22", "39", "41"], shoeCtx), 0);
});

test("vaate: 164 ja 164/170 parempia kuin 152/158; kokotiedoton tier B", () => {
  assert.equal(sizePenalty(["164"], coatCtx), 0);
  assert.equal(sizePenalty(["170"], coatCtx), 0);
  assert.ok(sizePenalty(["158"], coatCtx) > 0);
  assert.equal(fitTier(makeProduct({ id: "a", size_available: ["164"] }), coatCtx), "A");
  assert.equal(fitTier(makeProduct({ id: "b", size_available: [] }), coatCtx), "B");
});

test("Junior-otsikko ja täsmäkoko nostavat tuotteen kärkeen vaikka hinta on korkeampi", () => {
  const cheapWide = makeProduct({ id: "wide", title: "Kids Boot", price: { amount: 20, currency: "EUR" }, size_available: ["22", "39"] });
  const exact = makeProduct({ id: "exact", title: "Juniors Boot", price: { amount: 60, currency: "EUR" }, size_available: ["40", "41"] });
  assert.ok(fitScore(exact, shoeCtx) > fitScore(cheapWide, shoeCtx));
  const r = rankResults([cheapWide, exact], shoeCtx);
  assert.equal(r.bestMatch![0].id, "exact");
});

test("halvin-lista suosii hyvin istuvia kun niitä on tarpeeksi", () => {
  const good = [1, 2, 3, 4, 5].map((i) => makeProduct({ id: `g${i}`, price: { amount: 50 + i, currency: "EUR" }, size_available: ["41"] }));
  const badCheap = makeProduct({ id: "bad", price: { amount: 5, currency: "EUR" }, size_available: ["30"] });
  const r = rankResults([badCheap, ...good], shoeCtx);
  assert.ok(!r.cheapest.some((p) => p.id === "bad"));
  // jos hyviä ei ole tarpeeksi, kaikki mukaan
  const r2 = rankResults([badCheap, good[0]], shoeCtx);
  assert.ok(r2.cheapest.some((p) => p.id === "bad"));
});

test("ilman kokoa bestMatch-listaa ei tule", () => {
  const ctx = fitContextFromCriteria({ garment_type: "takki" } as any);
  assert.equal(rankResults([makeProduct({ id: "x" })], ctx).bestMatch, undefined);
});

test("värivaihtoehdot samassa kaupassa samalla hinnalla yhdistetään; paras sopiva väri edustaa", () => {
  const mk = (id: string, color: string, sizes: string[], price = 29, source = "outnorth-fi") =>
    makeProduct({ id, source, brand: "Exani", title: `Exani Kids' Luke Jr ${color}`, color, size_available: sizes, price: { amount: price, currency: "EUR" } });
  const out = dedupeColorVariants([
    mk("black", "Black", ["34"]), mk("navy", "Navy", ["40", "41"]), mk("red", "Red", ["38"]),
    mk("pricey", "Green", ["41"], 35), mk("se", "Black", ["41"], 29, "outnorth-se"),
  ], shoeCtx);
  assert.equal(out.length, 3); // fi 29 EUR, fi 35 EUR, se 29 EUR
  const grp = out.find((p) => p.color_count)!;
  assert.equal(grp.id, "navy");
  assert.equal(grp.color_count, 3);
  assert.deepEqual([...grp.other_colors!].sort(), ["Black", "Red"]);
});

test("eri tuotteet eivät yhdisty (eri nimi)", () => {
  const a = makeProduct({ id: "a", title: "Boot A Black", color: "Black" });
  const b = makeProduct({ id: "b", title: "Boot B Black", color: "Black" });
  assert.equal(dedupeColorVariants([a, b]).length, 2);
});
