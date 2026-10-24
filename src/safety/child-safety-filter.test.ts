import { test } from "node:test";
import assert from "node:assert/strict";
import { isChildSafeProduct, isChildSafeProductForStore, hasBlockedKeywords } from "./child-safety-filter";

test("hylkää tuotannossa havaitun alusasu/bodysuit-tuotteen", () => {
  const result = isChildSafeProduct({
    title: "Women's Sexy Three-Point Hollow Out Jumpsuit Lingerie & Underwear",
    category: "Apparel & Accessories > Clothing > Underwear & Socks > Lingerie",
    ageGroup: null,
  });
  assert.equal(result.safe, false);
});

test("hasBlockedKeywords tunnistaa saman tuotteen ilman age_group-riippuvuutta", () => {
  assert.equal(
    hasBlockedKeywords({
      title: "Women's Sexy Three-Point Hollow Out Jumpsuit Lingerie & Underwear",
      category: null,
    }),
    true
  );
});

test("hylkää suoraan estolistan osuman vaikka age_group olisi lapsille sopiva", () => {
  const result = isChildSafeProduct({
    title: "Toddler sexy bikini set",
    ageGroup: "toddler",
  });
  assert.equal(result.safe, false);
});

test("hyväksyy selkeästi lasten tuotteen age_group:toddler perusteella", () => {
  const result = isChildSafeProduct({
    title: "Warm winter overall for toddlers",
    ageGroup: "toddler",
  });
  assert.equal(result.safe, true);
});

test("hylkää aikuisten tuotteen age_group:adult perusteella", () => {
  const result = isChildSafeProduct({
    title: "Classic wool coat",
    ageGroup: "adult",
  });
  assert.equal(result.safe, false);
});

test("hylkää epävarman tuotteen (ei age_groupia, ei estolistaosumaa) oletuksena", () => {
  const result = isChildSafeProduct({
    title: "Phone case with ring holder",
    ageGroup: null,
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, "uncertain:no_reliable_age_signal");
});

test("bodysuit/jumpsuit yksin (esim. vauvan body) ei osu kontekstuaaliseen estolistaan", () => {
  assert.equal(
    hasBlockedKeywords({ title: "Baby bodysuit long sleeve cotton", category: null }),
    false
  );
});

test("bodysuit + women's yhdistelmä osuu kontekstuaaliseen estolistaan", () => {
  assert.equal(
    hasBlockedKeywords({ title: "Women's bodysuit club wear", category: null }),
    true
  );
});

test("epäluotetulle kaupalle (esim. voghion-global) epävarma tuote hylätään", () => {
  const result = isChildSafeProductForStore("voghion-global", {
    title: "Random marketplace item",
    ageGroup: null,
  });
  assert.equal(result.safe, false);
});
