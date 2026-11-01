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
