import { test } from "node:test";
import assert from "node:assert/strict";
import { findColor, colorMatches } from "./colors";
import { parseCriteriaFromText } from "./parse-query";

test("findColor: suomi, ruotsi ja englanti -> suomenkielinen perusväri", () => {
  assert.equal(findColor("musta takki"), "musta");
  assert.equal(findColor("svart jacka"), "musta");
  assert.equal(findColor("black jacket"), "musta");
  assert.equal(findColor("röd jacka"), "punainen");
  assert.equal(findColor("blå regnbyxor"), "sininen");
  assert.equal(findColor("pink dress"), "vaaleanpunainen");
  assert.equal(findColor("rosa klänning"), "vaaleanpunainen");
  assert.equal(findColor("grey hoodie"), "harmaa");
  assert.equal(findColor("vit tröja"), "valkoinen");
  assert.equal(findColor("jacka"), undefined);
});

test("findColor: ei osu keskelle sanaa", () => {
  assert.equal(findColor("redwood jacket"), undefined);
  assert.equal(findColor("visit"), undefined);
});

test("colorMatches: tuotteen englanninkielinen väri vs. suomenkielinen perusväri", () => {
  assert.equal(colorMatches("Black", "musta"), true);
  assert.equal(colorMatches("Navy Blue/Solid Dark Grey", "sininen"), true);
  assert.equal(colorMatches("Navy Blue/Solid Dark Grey", "harmaa"), true);
  assert.equal(colorMatches("Lava Red", "punainen"), true);
  assert.equal(colorMatches("Red", "sininen"), false);
  assert.equal(colorMatches("Svart", "musta"), true);
  assert.equal(colorMatches("Redwood", "punainen"), false); // lyhyt sana vain kokonaisena
  assert.equal(colorMatches("Burgundy", "punainen"), true);
});

test("parse: värit sv/en palauttavat suomenkielisen värin", () => {
  assert.equal(parseCriteriaFromText("röd regnjacka storlek 116", { lang: "sv" }).color, "punainen");
  assert.equal(parseCriteriaFromText("black winter jacket for a 6-year-old", { lang: "en" }).color, "musta");
  assert.equal(parseCriteriaFromText("musta talvitakki 6-vuotiaalle").color, "musta");
});
