import { Product } from "../types";

// Testiapuri: luo täydellisen Product-olion järkevillä oletuksilla,
// jotta testeissä tarvitsee kirjoittaa vain oleelliset kentät auki.
export function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    source: "fixture",
    title: "Testituote",
    brand: "Tuntematon",
    garment_type: "muu",
    price: { amount: 50, currency: "EUR" },
    original_price: null,
    discount_percent: null,
    size_available: [],
    size_normalized: null,
    material: null,
    waterproof: null,
    color: null,
    gender: null,
    url_affiliate: "https://example.com",
    image_url: "",
    in_stock: true,
    shipping_cost_from: null,
    free_shipping_threshold: null,
    rating: null,
    rating_count: null,
    last_updated: new Date().toISOString(),
    ...overrides,
  };
}
