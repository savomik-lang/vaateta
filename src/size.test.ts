import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSizeToken, productSizeFit, sizeRangeCm } from "./size";

test("parseSizeToken: tulkitsee välit, ikäkoot ja kirjainkoot", () => {
  assert.deepEqual(parseSizeToken("158/164"), { kind: "cm", lo: 158, hi: 164 });
  assert.deepEqual(parseSizeToken("134-140 cm"), { kind: "cm", lo: 134, hi: 140 });
  assert.deepEqual(parseSizeToken("13-14 yr"), { kind: "cm", lo: 158, hi: 164 });
  assert.deepEqual(parseSizeToken("15CM/5-8Y"), { kind: "cm", lo: 110, hi: 128 });
  assert.deepEqual(parseSizeToken("164"), { kind: "cm", lo: 164, hi: 164 });
  assert.deepEqual(parseSizeToken("XS"), { kind: "letters", letters: ["xs"] });
  assert.deepEqual(parseSizeToken("S/M"), { kind: "letters", letters: ["s", "m"] });
  assert.deepEqual(parseSizeToken("30"), { kind: "eu", lo: 30, hi: 30 });
  assert.equal(parseSizeToken("One Size").kind, "unknown");
});

test("14-vuotias (164 cm) ei saa kokoja 98-146, mutta saa 158/164 ja 164", () => {
  for (const s of ["98/104", "110", "134/140", "140", "146/152"]) {
    assert.equal(productSizeFit([s], 164, false), null, s);
  }
  assert.equal(productSizeFit(["158/164"], 164, false), "exact");
  assert.equal(productSizeFit(["164"], 164, false), "exact");
  assert.equal(productSizeFit(["170"], 164, false), "exact"); // yksi koko isompi ok
  assert.equal(productSizeFit(["158"], 164, false), "smaller"); // yksi koko pienempi
  assert.equal(productSizeFit(["152"], 164, false), null); // kaksi kokoa pienempi
});

test("nuorelle sopivat aikuisten kirjainkoot, pienille eivät", () => {
  assert.equal(productSizeFit(["XS", "M"], 164, false), "exact");
  assert.equal(productSizeFit(["L", "XL"], 164, false), null);
  assert.equal(productSizeFit(["XS"], 110, false), null);
});

test("kenkien EU-koot verrataan pituudesta johdettuun kokoon", () => {
  assert.equal(productSizeFit(["29", "30"], 110, true), "exact");
  assert.equal(productSizeFit(["40"], 110, true), null);
  assert.equal(productSizeFit(["164"], 164, true), null);
});

test("ei kokotietoa tai tuntematon koko hyväksytään", () => {
  assert.equal(productSizeFit([], 164, false), "exact");
  assert.equal(productSizeFit(["One Size"], 164, false), "exact");
});

test("sizeRangeCm kertoo pienimmän ja suurimman koon", () => {
  assert.deepEqual(sizeRangeCm([["98/104", "110"], ["146/152"]]), { min: 98, max: 152 });
  assert.equal(sizeRangeCm([["XS"]]), null);
});

test("kuukausikoot tulkitaan pituuksiksi, eivätkä sovi nuorelle", () => {
  assert.equal(productSizeFit(["9-12 months", "0-6 months"], 164, true), null);
  assert.equal(productSizeFit(["12-18 months"], 86, false), "exact");
});

test("tunnistamaton merkintä ei ohita kokosuodatinta jos tulkittavia kokoja on", () => {
  assert.equal(productSizeFit(["One Size", "110"], 164, false), null);
  assert.equal(productSizeFit(["One Size"], 164, false), "exact");
});

test("kenkien pienet EU-koot (19-33) eivät sovi 14-vuotiaalle, 41 sopii", () => {
  assert.equal(productSizeFit(["19-20", "21-22", "23-24", "25-26"], 164, true), null);
  assert.equal(productSizeFit(["19", "20", "33", "35"], 164, true), null);
  assert.equal(productSizeFit(["41"], 164, true), "exact");
});

test("parseSizeToken: puolikoot ja värietuliitteiset koot", () => {
  assert.deepEqual(parseSizeToken("28.5"), { kind: "eu", lo: 28, hi: 29 });
  assert.deepEqual(parseSizeToken("Black/Multi 28"), { kind: "eu", lo: 28, hi: 28 });
  assert.deepEqual(parseSizeToken("Black/Multi 164"), { kind: "cm", lo: 164, hi: 164 });
  assert.equal(productSizeFit(["28.5"], 164, true), null);
  assert.equal(productSizeFit(["Black/Multi 28", "Black/Multi 30"], 164, true), null);
  assert.equal(productSizeFit(["Navy 40"], 164, true), "exact");
});

test("parseSizeToken: desimaalimuotoinen kokonaisluku (28.0)", () => {
  assert.deepEqual(parseSizeToken("28.0"), { kind: "eu", lo: 28, hi: 28 });
  assert.equal(productSizeFit(["36.0", "35.0", "32.0", "31.0"], 164, true), null);
  assert.equal(productSizeFit(["40.0"], 164, true), "exact");
});

test("vaatteen pelkkä pieni luku on ikä vuosina: 14-vuotiaalle 8, 10, 12 eivät kelpaa, 14 ja 15 kelpaavat", () => {
  for (const s of ["5", "8", "10", "12"]) assert.equal(productSizeFit([s], 164, false), null, s);
  assert.equal(productSizeFit(["14"], 164, false), "exact");
  assert.equal(productSizeFit(["15"], 164, false), "exact");
  // kengillä pienet luvut (UK) eivät riitä yksinään
  assert.equal(productSizeFit(["3.5", "40"], 164, true), "exact");
});
