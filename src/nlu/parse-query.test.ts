import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCriteriaFromText } from "./parse-query";

test("tunnistaa vaatetyypin ja hinnan", () => {
  const result = parseCriteriaFromText(
    "Talvihaalari 5-vuotiaalle tytölle, max 120 €"
  );
  assert.equal(result.garment_type, "haalari");
  assert.equal(result.child_gender_pref, "tyttö");
  assert.deepEqual(result.max_price, { amount: 120, currency: "EUR" });
  assert.equal(result.size_raw, "110", "5-vuotiaalle vastaa karkeasti 110cm");
});

test("tunnistaa kurahousut, vedenpitävyyden ja koon cm:ssä", () => {
  const result = parseCriteriaFromText(
    "Kurahousut 92 cm, täytyy olla vedenpitävät"
  );
  assert.equal(result.garment_type, "housut");
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
