import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAgentItem, mapAgentItems } from "./map-agent-product";

test("kartoittaa kelvollisen kohteen oikein", () => {
  const result = mapAgentItem({ title: "Talvihaalari", brand: "Reima", price: 99.9, currency: "EUR", url: "https://example-store.com/product/123", image_url: "https://example-store.com/img.jpg", in_stock: true, waterproof: true, material: "vedenpitävä kuori", rating: 4.5, store: "example-store.com" });
  assert.ok(result);
  assert.equal(result!.title, "Talvihaalari");
  assert.equal(result!.garment_type, "haalari");
  assert.equal(result!.source, "web:example-store.com");
  assert.equal(result!.price.amount, 99.9);
});
test("hylkää kohteen jolla ei ole kelvollista URL:ia", () => {
  assert.equal(mapAgentItem({ title: "Jokin tuote", price: 50, url: "ei-ole-oikea-url" }), null);
});
test("hylkää kohteen jolla ei ole hintaa tai hinta on negatiivinen/0", () => {
  assert.equal(mapAgentItem({ title: "T", price: 0, url: "https://x.com" }), null);
  assert.equal(mapAgentItem({ title: "T", price: -5, url: "https://x.com" }), null);
  assert.equal(mapAgentItem({ title: "T", url: "https://x.com" }), null);
});
test("hylkää kohteen jolla ei ole otsikkoa", () => {
  assert.equal(mapAgentItem({ price: 50, url: "https://x.com" }), null);
});
test("täyttää puuttuvat valinnaiset kentät järkevillä oletuksilla", () => {
  const result = mapAgentItem({ title: "Perus paita", price: 20, url: "https://x.com" });
  assert.ok(result);
  assert.equal(result!.brand, "Tuntematon");
  assert.equal(result!.price.currency, "EUR");
  assert.equal(result!.in_stock, true);
  assert.equal(result!.rating, null);
});
test("hylkää virheellisen rating-arvon (esim. yli 5) pudottamalla sen nulliksi", () => {
  const result = mapAgentItem({ title: "T", price: 20, url: "https://x.com", rating: 9.9 });
  assert.equal(result!.rating, null);
});
test("mapAgentItems suodattaa hylätyt kohteet pois eikä kaadu sekajoukosta", () => {
  const results = mapAgentItems([{ title: "Hyvä", price: 20, url: "https://x.com" }, { title: "Huono - ei urlia" }, "täysin väärä tyyppi", null, { title: "Toinen hyvä", price: 30, url: "https://y.com" }]);
  assert.equal(results.length, 2);
});
test("sama URL tuottaa aina saman id:n", () => {
  const a = mapAgentItem({ title: "T", price: 10, url: "https://sama.com/a" });
  const b = mapAgentItem({ title: "T", price: 10, url: "https://sama.com/a" });
  assert.equal(a!.id, b!.id);
});
