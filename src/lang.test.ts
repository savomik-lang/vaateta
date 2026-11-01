import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLang, parseMarket } from "./lang";

test("parseLang: fi/sv/en, muut ja puuttuva -> fi", () => {
  assert.equal(parseLang("sv"), "sv");
  assert.equal(parseLang("EN"), "en");
  assert.equal(parseLang("sv-SE"), "sv");
  assert.equal(parseLang("en-GB"), "en");
  assert.equal(parseLang("fi"), "fi");
  assert.equal(parseLang("de"), "fi");
  assert.equal(parseLang(undefined), "fi");
  assert.equal(parseLang(["sv", "en"]), "sv");
  assert.equal(parseLang(""), "fi");
});
test("parseMarket: FI/SE/other, muut ja puuttuva -> FI", () => {
  assert.equal(parseMarket("SE"), "SE");
  assert.equal(parseMarket("se"), "SE");
  assert.equal(parseMarket("other"), "other");
  assert.equal(parseMarket("FI"), "FI");
  assert.equal(parseMarket("xx"), "FI");
  assert.equal(parseMarket(undefined), "FI");
});

import { marketFromCountry, resolveMarket } from "./lang";

test("marketFromCountry: FI/AX -> FI, SE -> SE, muut -> other, puuttuva -> FI", () => {
  assert.equal(marketFromCountry("FI"), "FI");
  assert.equal(marketFromCountry("ax"), "FI");
  assert.equal(marketFromCountry("SE"), "SE");
  assert.equal(marketFromCountry("DE"), "other");
  assert.equal(marketFromCountry("US"), "other");
  assert.equal(marketFromCountry(undefined), "FI");
  assert.equal(marketFromCountry(""), "FI");
  assert.equal(marketFromCountry(["SE", "FI"]), "SE");
});

test("resolveMarket: eksplisiittinen ?market voittaa otsakkeen", () => {
  assert.equal(resolveMarket("FI", "SE"), "FI");
  assert.equal(resolveMarket("other", "FI"), "other");
  assert.equal(resolveMarket(undefined, "SE"), "SE");
  assert.equal(resolveMarket("", "DE"), "other");
  assert.equal(resolveMarket(undefined, undefined), "FI");
});
