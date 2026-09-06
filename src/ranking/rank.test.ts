import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBestValue, rankResults } from "./rank";
import { makeProduct } from "../fixtures/make-product";

test("tyhjä lista ei kaadu, palauttaa tyhjän", () => {
  assert.deepEqual(computeBestValue([]), []);
});

test("valitsee vain halvimman kolmanneksen joukosta", () => {
  // 9 tuotetta, hinnat 10..90 - halvin kolmannes = 3 halvinta (10,20,30)
  const products = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((amount, i) =>
    makeProduct({
      id: `p${i}`,
      price: { amount, currency: "EUR" },
      waterproof: true, // kaikilla laatusignaali, jotta testataan VAIN hintarajausta
    })
  );

  const result = computeBestValue(products);
  const prices = result.map((p) => p.price.amount);

  assert.ok(prices.every((p) => p <= 30), "kaikki tulokset halvimmasta kolmanneksesta");
});

test("karsii pois tuotteet joilla ei ole laatusignaalia, jos vaihtoehtoja riittää", () => {
  const withQuality = makeProduct({
    id: "quality",
    price: { amount: 10, currency: "EUR" },
    waterproof: true,
  });
  const withoutQuality = makeProduct({
    id: "no-quality",
    price: { amount: 11, currency: "EUR" },
    waterproof: null,
    material: null,
    title: "Perus tuote",
  });
  // 4 muuta halpaa, laadukasta vaihtoehtoa - täyttävät Top 5:n ilman
  // "no-quality"-tuotetta.
  const filler = [12, 13, 14, 15].map((amount, i) =>
    makeProduct({ id: `filler${i}`, price: { amount, currency: "EUR" }, waterproof: true })
  );
  // 12 kallista täytetuotetta VAIN kasvattamassa kokonaismäärää niin, että
  // "halvin kolmannes" (18/3=6) osuu juuri näihin 6 halvimpaan asti, ei pidemmälle.
  const expensivePadding = Array.from({ length: 12 }, (_, i) =>
    makeProduct({ id: `padding${i}`, price: { amount: 1000 + i, currency: "EUR" } })
  );

  const products = [withQuality, withoutQuality, ...filler, ...expensivePadding];
  const result = computeBestValue(products);
  const ids = result.map((p) => p.id);

  assert.ok(!ids.includes("no-quality"), "laaduton tuote karsiutuu kun vaihtoehtoja riittää");
});

test("täydentää listaa laaduttomilla, jos laadukkaita ei ole tarpeeksi", () => {
  const withQuality = makeProduct({
    id: "quality",
    price: { amount: 10, currency: "EUR" },
    waterproof: true,
  });
  const withoutQuality = makeProduct({
    id: "no-quality",
    price: { amount: 11, currency: "EUR" },
    waterproof: null,
    material: null,
    title: "Perus tuote",
  });
  // 4 kallista täytetuotetta VAIN kasvattamassa kokonaismäärää niin, että
  // "halvin kolmannes" (6/3=2) osuu juuri näihin kahteen halvimpaan.
  const expensivePadding = Array.from({ length: 4 }, (_, i) =>
    makeProduct({ id: `padding${i}`, price: { amount: 1000 + i, currency: "EUR" } })
  );

  const result = computeBestValue([withQuality, withoutQuality, ...expensivePadding]);
  const ids = result.map((p) => p.id);

  assert.ok(ids.includes("no-quality"), "laaduton tuote täydentää listaa kun ei ole muuta samassa hintaikkunassa");
});

test("järjestää brändi-tason mukaan ennen hintaa ehdokkaiden sisällä", () => {
  const premiumPricier = makeProduct({
    id: "premium",
    brand: "Reima",
    price: { amount: 20, currency: "EUR" },
    waterproof: true,
  });
  const budgetCheaper = makeProduct({
    id: "budget",
    brand: "Tuntematon Merkki",
    price: { amount: 10, currency: "EUR" },
    waterproof: true,
  });
  // Kasvatetaan kokonaismäärää niin että molemmat mahtuvat "halvimpaan
  // kolmannekseen" (6/3=2 -> juuri nämä kaksi halvinta).
  const expensivePadding = Array.from({ length: 4 }, (_, i) =>
    makeProduct({ id: `padding${i}`, price: { amount: 1000 + i, currency: "EUR" } })
  );

  const result = computeBestValue([premiumPricier, budgetCheaper, ...expensivePadding]);

  assert.equal(result[0].id, "premium", "premium-brändi nostetaan kärkeen halvemmasta hinnasta huolimatta");
});

test("rankResults palauttaa kaikki kolme listaa yhdessä kutsussa", () => {
  const products = [
    makeProduct({ id: "a", price: { amount: 10, currency: "EUR" }, waterproof: true }),
    makeProduct({ id: "b", price: { amount: 20, currency: "EUR" } }),
  ];
  const ranked = rankResults(products);

  assert.ok(Array.isArray(ranked.cheapest));
  assert.ok(Array.isArray(ranked.bestValue));
  assert.equal(ranked.mostLoved, null); // alle 3 arvioitua tuotetta
});
