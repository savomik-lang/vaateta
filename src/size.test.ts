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
