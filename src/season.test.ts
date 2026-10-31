import { test } from "node:test";
import assert from "node:assert/strict";
import { guessWinter } from "./season";

test("tunnistaa talvituotteet otsikosta", () => {
  assert.equal(guessWinter("Reima Kids' Winter Jacket Kiddo"), true);
  assert.equal(guessWinter("Didriksons Kids' Björnen Parka"), true);
  assert.equal(guessWinter("Kids' Down Jacket"), true);
  assert.equal(guessWinter("Lasten talvitakki"), true);
});

test("sulkee pois UV-, sade- ja fleece-tuotteet", () => {
  assert.equal(guessWinter("Isbjörn of Sweden Kids' Dolphine Sun Jumpsuit"), false);
  assert.equal(guessWinter("Reima Kids' Shell Raincoat Lampi Navy"), false);
  assert.equal(guessWinter("Urberg Kids' Tyldal Fleece Jacket"), false);
});

test("kuvauksen talvimerkintä riittää vain jos otsikossa ei ole kieltomerkkiä", () => {
  assert.equal(guessWinter("Kids' Jacket Pilvi", null, "Insulated with PrimaLoft, padded for winter"), true);
  assert.equal(guessWinter("Kids' Shell Jacket", null, "Fits over winter layers"), false);
  assert.equal(guessWinter("Kids' Jacket", null, "Nice jacket"), null);
});
