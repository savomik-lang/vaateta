import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRow } from "./generic-awin-importer";

const base = {
  aw_product_id: "37664435101", product_name: "Urberg Kids' Winter Boots Capers",
  aw_deep_link: "https://www.awin1.com/pclick.php?p=37664435101&a=1&m=2",
  merchant_category: "Lämpövuoratut kengät", brand_name: "Urberg", in_stock: "1",
  "Fashion:size": "34",
};

test("Outnorth FI: base_price on alennushinta, search_price normaalihinta", () => {
  const p = mapRow({ ...base, search_price: "64.90", base_price: "35.70 EUR", currency: "EUR" }, "outnorth-fi", { basePriceIsSale: true })!;
  assert.equal(p.price.amount, 35.7);
  assert.equal(p.price.currency, "EUR");
  assert.equal(p.original_price?.amount, 64.9);
  assert.equal(p.discount_percent, 45);
});

test("Outnorth FI: ilman base_pricea tuote on täysihintainen", () => {
  const p = mapRow({ ...base, search_price: "64.90", base_price: "", currency: "EUR" }, "outnorth-fi", { basePriceIsSale: true })!;
  assert.equal(p.price.amount, 64.9);
  assert.equal(p.original_price, null);
  assert.equal(p.discount_percent, null);
});

test("Outnorth FI: base_price joka ei ole alle search_pricen ohitetaan", () => {
  const p = mapRow({ ...base, search_price: "64.90", base_price: "80.00 EUR", currency: "EUR" }, "outnorth-fi", { basePriceIsSale: true })!;
  assert.equal(p.price.amount, 64.9);
  assert.equal(p.original_price, null);
});

test("Outnorth SE: product_price_old on normaalihinta, search_price nykyinen", () => {
  const p = mapRow({ ...base, search_price: "714.00", product_price_old: "1299.00 SEK", currency: "SEK" }, "outnorth-se")!;
  assert.equal(p.price.amount, 714);
  assert.equal(p.original_price?.amount, 1299);
  assert.equal(p.discount_percent, 45);
  const same = mapRow({ ...base, search_price: "645.00", product_price_old: "645.00 SEK", currency: "SEK" }, "outnorth-se")!;
  assert.equal(same.original_price, null);
});

test("base_price ei vaikuta kaupassa ilman basePriceIsSale-lippua", () => {
  const p = mapRow({ ...base, search_price: "64.90", base_price: "35.70 EUR", currency: "EUR" }, "muu-kauppa")!;
  assert.equal(p.price.amount, 64.9);
});
