import { test } from "node:test";
import assert from "node:assert/strict";
import { hasQualitySignal } from "./quality-signals";

test("strukturoitu waterproof=true riittää yksinään", () => {
  const result = hasQualitySignal({ material: null, title: "Jokin tuote", waterproof: true });
  assert.equal(result, true);
});

test("avainsana material-kentässä riittää", () => {
  const result = hasQualitySignal({
    material: "GOTS-luomupuuvilla",
    title: "Paita",
    waterproof: null,
  });
  assert.equal(result, true);
});

test("avainsana title-kentässä riittää, jos material puuttuu", () => {
  const result = hasQualitySignal({
    material: null,
    title: "Vedenpitävä kurahousut",
    waterproof: null,
  });
  assert.equal(result, true);
});

test("ei laatusignaalia jos mitään ei löydy", () => {
  const result = hasQualitySignal({
    material: null,
    title: "Perus t-paita",
    waterproof: null,
  });
  assert.equal(result, false);
});

test("waterproof=false EI itsessään anna laatusignaalia", () => {
  const result = hasQualitySignal({
    material: null,
    title: "Perus t-paita",
    waterproof: false,
  });
  assert.equal(result, false);
});
