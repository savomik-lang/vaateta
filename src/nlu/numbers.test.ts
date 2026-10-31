import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFinnishNumber, normalizeNumberWords } from "./numbers";

test("lukusanat 1-19 kaikissa taivutuksissa", () => {
  const cases: [string, number][] = [
    ["yksi", 1], ["yhden", 1], ["kaksi", 2], ["kahden", 2], ["kolme", 3], ["kolmen", 3],
    ["neljä", 4], ["neljän", 4], ["viisi", 5], ["viiden", 5], ["kuusi", 6], ["kuuden", 6],
    ["seitsemän", 7], ["kahdeksan", 8], ["yhdeksän", 9], ["kymmenen", 10],
    ["yksitoista", 11], ["yhdentoista", 11], ["kaksitoista", 12], ["kahdentoista", 12],
    ["kolmetoista", 13], ["kolmentoista", 13], ["neljätoista", 14], ["neljäntoista", 14],
    ["viisitoista", 15], ["viidentoista", 15], ["kuusitoista", 16], ["kuudentoista", 16],
    ["seitsemäntoista", 17], ["kahdeksantoista", 18], ["yhdeksäntoista", 19],
  ];
  for (const [w, n] of cases) assert.equal(parseFinnishNumber(w), n, w);
});
test("kymmenet ja sadat", () => {
  assert.equal(parseFinnishNumber("kaksikymmentä"), 20);
  assert.equal(parseFinnishNumber("kahdeksankymmentä"), 80);
  assert.equal(parseFinnishNumber("kuusikymmentäviisi"), 65);
  assert.equal(parseFinnishNumber("sata"), 100);
  assert.equal(parseFinnishNumber("sataviisitoista"), 115);
  assert.equal(parseFinnishNumber("satakaksikymmentä"), 120);
  assert.equal(parseFinnishNumber("satakuusikymmentäneljä"), 164);
});
test("ei-lukusanat palauttavat null", () => {
  for (const w of ["talvitakki", "satama", "kuusen", "", "toista", "sukat"]) assert.equal(parseFinnishNumber(w), null, w);
});
test("normalisointi: ikä", () => {
  for (const s of ["kuusivuotiaalle", "kuusi vuotiaalle", "kuuden vuoden ikäiselle", "kuusivuotias", "kuuden vanhalle", "kuusi vuotta"]) {
    assert.match(normalizeNumberWords(s), /^6-vuotiaalle/, s);
  }
  assert.match(normalizeNumberWords("neljätoistavuotiaalle"), /^14-vuotiaalle/);
});
test("normalisointi: kuukaudet ja puolitoista", () => {
  assert.equal(normalizeNumberWords("kuuden kuukauden"), "6 kk");
  assert.equal(normalizeNumberWords("kuusikuinen"), "6 kk");
  assert.equal(normalizeNumberWords("puolitoistavuotiaalle"), "18 kk");
  assert.equal(normalizeNumberWords("puolentoista vuoden"), "18 kk");
});
test("normalisointi: hinta ja koko", () => {
  assert.equal(normalizeNumberWords("alle kahdeksankymmentä euroa"), "alle 80 €");
  assert.equal(normalizeNumberWords("sataviisitoista senttiä"), "115 cm");
});
test("normalisointi: ei muuta tavallista tekstiä", () => {
  for (const s of ["kuusi paria sukkia", "kuusi kuusen oksaa", "talvitakki lapselle", "haluan kaksi takkia"]) {
    assert.equal(normalizeNumberWords(s), s, s);
  }
});
