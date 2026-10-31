import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "./language";

test("tunnistaa suomen", () => {
  assert.equal(detectLanguage("tarvitsen talvitakin lapselle, koko 110"), "fi");
  assert.equal(detectLanguage("kurahousut tytölle alle 30 euroa"), "fi");
});

test("tunnistaa ruotsin", () => {
  assert.equal(detectLanguage("regnbyxor till min dotter, storlek 116, under 400 kr"), "sv");
  assert.equal(detectLanguage("jag behöver en jacka"), "sv");
});

test("tunnistaa englannin", () => {
  assert.equal(detectLanguage("winter jacket for my 7 year old son, no Reima, max 80 euros"), "en");
  assert.equal(detectLanguage("looking for waterproof boots"), "en");
});

test("tunnistaa tanskan/norjan ('other')", () => {
  assert.equal(detectLanguage("jeg leter etter regnjakke til datter, størrelse 116"), "other");
});

test("tuntematon teksti tai tasapeli tulkitaan suomeksi (vanha sääntöpolku)", () => {
  assert.equal(detectLanguage(""), "fi");
  assert.equal(detectLanguage("xyzzy qwerty"), "fi");
});
