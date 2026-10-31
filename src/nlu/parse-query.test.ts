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

test("ikä 13-17 muuttuu koolle: 14 v -> 164 cm, age ja size_cm mukana", () => {
  const r = parseCriteriaFromText("talvitakki 14-vuotiaalle tytölle");
  assert.equal(r.size_cm, 164);
  assert.equal(r.age, 14);
  assert.equal(r.size_raw, "164");
  assert.equal(parseCriteriaFromText("housut 16 vuotiaalle").size_cm, 176);
  assert.equal(parseCriteriaFromText("takki 40-vuotiaalle").size_cm, undefined);
});

test("talvi/untuva/toppa -> season winter (toppa vain takille/haalarille/kengille)", () => {
  assert.equal(parseCriteriaFromText("talvitakki pojalle").season, "winter");
  assert.equal(parseCriteriaFromText("untuvatakki").season, "winter");
  assert.equal(parseCriteriaFromText("toppatakki").season, "winter");
  assert.equal(parseCriteriaFromText("kurahousut lapselle").season, undefined);
});

test("brand_deny: 'ei liian kallis' ei ole brändi, 'ei Reimaa' on", () => {
  assert.equal(parseCriteriaFromText("hyvälaatuinen talvitakki pojalle, ei liian kallis").brand_deny, undefined);
  assert.deepEqual(parseCriteriaFromText("Takki, ei Reimaa").brand_deny, ["reimaa"]);
  assert.deepEqual(parseCriteriaFromText("takki ei reimaa").brand_deny, ["reimaa"]);
});

test("puhehaku: lukusanaikä ja hintaraja (116 cm, max 80 EUR)", () => {
  for (const q of [
    "talvitakki 6-vuotiaalle, max 80 euroa",
    "talvitakki kuusivuotiaalle max 80 euroa",
    "talvitakki kuuden vuoden ikäiselle alle 80 €",
    "Talvitakki 6 vuotiaalle maksimissaan 80 euroa",
  ]) {
    const r = parseCriteriaFromText(q);
    assert.equal(r.size_cm, 116, q);
    assert.equal(r.age, 6, q);
    assert.deepEqual(r.max_price, { amount: 80, currency: "EUR" }, q);
    assert.equal(r.garment_type, "takki", q);
    assert.equal(r.season, "winter", q);
  }
});
test("hintarajan muodot: korkeintaan, enintään, budjetti, asti, e/eur", () => {
  const price = (q: string) => parseCriteriaFromText(q).max_price?.amount;
  assert.equal(price("takki korkeintaan 60 euroa"), 60);
  assert.equal(price("takki enintään 60 eur"), 60);
  assert.equal(price("takki budjetti 60"), 60);
  assert.equal(price("takki 60 euroon asti"), 60);
  assert.equal(price("takki alle 60 e"), 60);
  assert.equal(price("takki max 29,90 €"), 29.9);
  assert.equal(price("takki kahdeksankymmentä euroa asti"), 80);
});
test("hintaraja ei sekoitu ikään tai määrään", () => {
  assert.equal(parseCriteriaFromText("takki alle 6-vuotiaalle").max_price, undefined);
  assert.equal(parseCriteriaFromText("sukat korkeintaan 3 paria").max_price, undefined);
  assert.equal(parseCriteriaFromText("takki 116 cm").max_price, undefined);
});
test("lukusana koossa: sataviisitoista senttiä", () => {
  const r = parseCriteriaFromText("haalari sataviisitoista senttiä");
  assert.equal(r.size_cm, 115);
  assert.equal(parseCriteriaFromText("haalari 116 senttiä").size_cm, 116);
});
test("kuukaudet tulkitaan vauvakooksi, ei vuosiksi", () => {
  for (const q of ["body kuuden kuukauden", "body 6 kk", "body kuusikuinen", "body 6kk"]) {
    const r = parseCriteriaFromText(q);
    assert.equal(r.size_cm, 68, q);
    assert.equal(r.age, undefined, q);
  }
  assert.equal(parseCriteriaFromText("haalari puolitoistavuotiaalle").size_cm, 86);
});
test("ikä 18+ ei tulkita lapsen kooksi", () => {
  assert.equal(parseCriteriaFromText("takki kolmekymmentä vuotta").size_cm, undefined);
});

