import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCriteriaFromText } from "./parse-query";

test("tunnistaa vaatetyypin ja hinnan", () => {
  const result = parseCriteriaFromText("Talvihaalari 5-vuotiaalle tytölle, max 120 €");
  assert.equal(result.garment_type, "haalari");
  assert.equal(result.child_gender_pref, "tyttö");
  assert.deepEqual(result.max_price, { amount: 120, currency: "EUR" });
  assert.equal(result.size_raw, "110");
});
test("tunnistaa kurahousut, vedenpitävyyden ja koon cm:ssä", () => {
  const result = parseCriteriaFromText("Kurahousut 92 cm, täytyy olla vedenpitävät");
  assert.equal(result.garment_type, "kurahousut");
  assert.equal(result.waterproof, true);
  assert.equal(result.size_raw, "92");
});
test("tunnistaa 'alle X€' -muotoisen hintarajan", () => {
  const result = parseCriteriaFromText("Farkut pojalle, alle 40 euroa");
  assert.equal(result.garment_type, "housut");
  assert.equal(result.child_gender_pref, "poika");
  assert.deepEqual(result.max_price, { amount: 40, currency: "EUR" });
});
test("tunnistaa materiaalimaininnan", () => {
  const result = parseCriteriaFromText("Paita luomupuuvillaa, sininen");
  assert.equal(result.garment_type, "paita");
  assert.deepEqual(result.material_keywords, ["luomupuuvilla"]);
  assert.equal(result.color, "sininen");
});
test("ei keksi kriteerejä joita tekstissä ei mainita", () => {
  const result = parseCriteriaFromText("Tarvitsen jotain lapselle");
  assert.equal(result.garment_type, undefined);
  assert.equal(result.max_price, undefined);
  assert.equal(result.waterproof, undefined);
});
test("tunnistaa brändin poissulkemisen karkeasti", () => {
  const result = parseCriteriaFromText("Takki, ei Reimaa");
  assert.ok(result.brand_deny && result.brand_deny.includes("reimaa"));
});
test("tunnistaa uudet vaatetyypit: mekko, body, uimapuku, pyjama", () => {
  assert.equal(parseCriteriaFromText("Mekko tytölle").garment_type, "mekko");
  assert.equal(parseCriteriaFromText("Body vauvalle").garment_type, "body");
  assert.equal(parseCriteriaFromText("Uimapuku tytölle").garment_type, "uimapuku");
  assert.equal(parseCriteriaFromText("Pyjama 4-vuotiaalle").garment_type, "pyjama");
});
test("toppahousut ja kurahousut ovat omia tyyppejään, ei yleistä housut-tyyppiä", () => {
  assert.equal(parseCriteriaFromText("Toppahousut 110 cm").garment_type, "toppahousut");
  assert.equal(parseCriteriaFromText("Kurahousut lapselle").garment_type, "kurahousut");
  assert.equal(parseCriteriaFromText("Farkut pojalle").garment_type, "housut");
});
test("lapselle/lapsen/lapsille/vauvalle/vauvan/taaperolle aktivoivat child_signal-lipun", () => {
  for (const q of ["kurahousut lapselle", "lapsen takki", "pipo lapsille", "body vauvalle", "vauvan haalari", "kengät taaperolle"]) {
    assert.equal(parseCriteriaFromText(q).child_signal, true, q);
  }
  assert.equal(parseCriteriaFromText("kurahousut").child_signal, undefined);
});
