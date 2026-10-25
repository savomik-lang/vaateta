import { test } from "node:test";
import assert from "node:assert/strict";
import { guessGarmentType } from "./garment-keywords";

test("kenkien lisävarusteet (pohjalliset, nauhat) eivät luokitu kengiksi", () => {
  assert.notEqual(guessGarmentType("Height increasing insoles for men and women shoes"), "kengät");
  assert.notEqual(guessGarmentType("Round Braided Shoelaces for Bread Shoes"), "kengät");
  assert.equal(guessGarmentType("Kids winter boots"), "kengät");
});
test("kurahousut ja toppahousut luokitellaan omiin tyyppeihinsä ennen yleistä housut-tyyppiä", () => {
  assert.equal(guessGarmentType("Kids Rain Pants waterproof"), "kurahousut");
  assert.equal(guessGarmentType("Children snow pants winter"), "toppahousut");
  assert.equal(guessGarmentType("Slim fit jeans"), "housut");
});
