import { test } from "node:test";
import assert from "node:assert/strict";
import { getBrandTier, compareBrandTier } from "./brand-tiers";

test("tunnetut premium-brändit saavat premium-tason", () => {
  assert.equal(getBrandTier("Reima"), "premium");
  assert.equal(getBrandTier("polarn o. pyret"), "premium"); // ei väliä isot/pienet kirjaimet
});

test("tuntematon brändi saa budjetti-tason oletuksena", () => {
  assert.equal(getBrandTier("Joku Ihan Tuntematon Merkki"), "budjetti");
});

test("compareBrandTier järjestää premium ennen budjettia", () => {
  const result = compareBrandTier("Reima", "Joku Tuntematon");
  assert.ok(result < 0, "Reima (premium) pitäisi tulla ennen tuntematonta (budjetti)");
});

test("compareBrandTier palauttaa 0 samalle tasolle", () => {
  const result = compareBrandTier("Reima", "Molo");
  assert.equal(result, 0);
});
