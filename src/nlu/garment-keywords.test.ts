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
test("sukat luokitellaan sukiksi vaikka tekstissä olisi myös sana shoes", () => {
  assert.equal(guessGarmentType("Non Slip Soccer Socks With Grip Pads", "Apparel > Shoes & Socks"), "sukat");
});

test("uudet vaatesanat: shortsit, sandaalit, lippis, kerrasto", () => {
  assert.equal(guessGarmentType("Kids Shorts"), "housut");
  assert.equal(guessGarmentType("Swim Shorts Boys"), "uimapuku");
  assert.equal(guessGarmentType("Lasten sandaalit"), "kengät");
  assert.equal(guessGarmentType("Lenkkarit"), "kengät");
  assert.equal(guessGarmentType("Aurinkohattu lapselle"), "pipo");
  assert.equal(guessGarmentType("Villakerrasto"), "kerrasto");
  assert.equal(guessGarmentType("Merino Base Layer Pants"), "kerrasto");
  assert.equal(guessGarmentType("Kids Shell Suit"), "haalari");
});

test("sv/en-sanat tunnistetaan sanarajalla, kun osamerkkijonolista ei löydä mitään", () => {
  assert.equal(guessGarmentType("Solhatt barn"), "pipo");
  assert.equal(guessGarmentType("Keps Kids"), "pipo");
  assert.equal(guessGarmentType("Kids Cap"), "pipo");
  assert.equal(guessGarmentType("Underställ ull"), "kerrasto");
  assert.equal(guessGarmentType("What that is"), "muu");
  assert.equal(guessGarmentType("Capers snack"), "muu");
});

test("liivi on takki-tyyppiä", () => {
  assert.equal(guessGarmentType("Color Kids Kids' Waistcoat"), "takki");
  assert.equal(guessGarmentType("Lasten toppaliivi"), "takki");
});

test("korut ja vartalotuotteet eivät luokitu vaatteiksi (Body Jewelry ei ole body)", () => {
  assert.equal(guessGarmentType("1PC 16G Stainless Steel Belly Button Ring Body Jewelry"), "muu");
  assert.equal(guessGarmentType("TOPGRILLZ Gold Teeth Grillz"), "muu");
  assert.equal(guessGarmentType("Nipple Piercing Barbell Body Jewelry"), "muu");
  assert.equal(guessGarmentType("Body Chain Necklace"), "muu");
  assert.equal(guessGarmentType("Body Lotion Kids"), "muu");
  assert.equal(guessGarmentType("Crossbody Bag for kids"), "muu");
  assert.equal(guessGarmentType("Korvakorut lapselle"), "muu");
});

test("oikeat body- ja potkupuku-tuotteet luokitellaan edelleen bodyiksi", () => {
  assert.equal(guessGarmentType("Baby Bodysuit Organic Cotton"), "body");
  assert.equal(guessGarmentType("Newborn Body Long Sleeve"), "body");
  assert.equal(guessGarmentType("Lasten potkupuku 68"), "body");
  assert.equal(guessGarmentType("Vauvan body 2-pack"), "body");
  assert.equal(guessGarmentType("Reima Body"), "body");
});
