import { test } from "node:test";
import assert from "node:assert/strict";
import { hasQualitySignal } from "./quality-signals";

test("strukturoitu waterproof=true riittää yksinään", () => {
  assert.equal(hasQualitySignal({ material: null, title: "Jokin tuote", waterproof: true }), true);
});
test("avainsana material-kentässä riittää", () => {
  assert.equal(hasQualitySignal({ material: "GOTS-luomupuuvilla", title: "Paita", waterproof: null }), true);
});
test("avainsana title-kentässä riittää, jos material puuttuu", () => {
  assert.equal(hasQualitySignal({ material: null, title: "Vedenpitävä kurahousut", waterproof: null }), true);
});
test("ei laatusignaalia jos mitään ei löydy", () => {
  assert.equal(hasQualitySignal({ material: null, title: "Perus t-paita", waterproof: null }), false);
});
test("waterproof=false EI itsessään anna laatusignaalia", () => {
  assert.equal(hasQualitySignal({ material: null, title: "Perus t-paita", waterproof: false }), false);
});
