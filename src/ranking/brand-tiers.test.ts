import { test } from "node:test";
import assert from "node:assert/strict";
import { getBrandTier, compareBrandTier } from "./brand-tiers";

test("tunnetut premium-brändit saavat premium-tason", () => {
  assert.equal(getBrandTier("Reima"), "premium");
  assert.equal(getBrandTier("polarn o. pyret"), "premium");
});
test("tuntematon brändi saa budjetti-tason oletuksena", () => {
  assert.equal(getBrandTier("Joku Ihan Tuntematon Merkki"), "budjetti");
});
test("compareBrandTier järjestää premium ennen budjettia", () => {
  assert.ok(compareBrandTier("Reima", "Joku Tuntematon") < 0);
});
test("compareBrandTier palauttaa 0 samalle tasolle", () => {
  assert.equal(compareBrandTier("Reima", "Molo"), 0);
});
