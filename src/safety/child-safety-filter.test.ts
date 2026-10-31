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

test("hylkää aikuisten tuotteen age_group:adult perusteella vaikka otsikko on neutraali", () => {
  const result = isChildSafeProduct({
    title: "Classic wool coat",
    ageGroup: "adult",
  });
  assert.equal(result.safe, false);
});

test("HYVÄKSYY epävarman tuotteen (ei age_groupia, ei estolistaosumaa) - tietoinen linjaus", () => {
  const result = isChildSafeProduct({
    title: "Phone case with ring holder",
    ageGroup: null,
  });
  assert.equal(result.safe, true);
  assert.equal(result.reason, "uncertain:accepted_by_default");
});

test("bodysuit/jumpsuit yksin (esim. vauvan body) ei osu kontekstuaaliseen estolistaan", () => {
  assert.equal(
    hasBlockedKeywords({ title: "Baby bodysuit long sleeve cotton", category: null }),
    false
  );
});

test("bodysuit + women's yhdistelmä osuu kontekstuaaliseen estolistaan ja hylätään", () => {
  assert.equal(
    hasBlockedKeywords({ title: "Women's bodysuit club wear", category: null }),
    true
  );
  const result = isChildSafeProduct({ title: "Women's bodysuit club wear", ageGroup: null });
  assert.equal(result.safe, false);
});

test("underwear-avainsana hylkää vaikka otsikossa ei ole 'sexy'-sanaa", () => {
  const result = isChildSafeProduct({ title: "Men's cotton underwear 3-pack", ageGroup: null });
  assert.equal(result.safe, false);
});

test("epävarma tuote hyväksytään kaikille kaupoille identtisesti (ei kauppakohtaista eroa)", () => {
  const result = isChildSafeProductForStore("voghion-global", {
    title: "Random marketplace item",
    ageGroup: null,
  });
  assert.equal(result.safe, true);
});

test("'striped' (raidallinen) ei osu 'strip'-estolistasanaan", () => {
  assert.equal(hasBlockedKeywords({ title: "Striped cotton t-shirt for boys", category: null }), false);
});

test("'zebra' ei osu 'bra'-estolistasanaan", () => {
  assert.equal(hasBlockedKeywords({ title: "Zebra print winter hat", category: null }), false);
});

test("'bra' sanana yksinään hylätään edelleen", () => {
  assert.equal(hasBlockedKeywords({ title: "Women's lace bra set", category: null }), true);
});

test("tavallinen talvitakki hyväksytään", () => {
  const result = isChildSafeProduct({
    title: "Kid's warm winter jacket with hood",
    ageGroup: null,
  });
  assert.equal(result.safe, true);
});

import { hasChildMarkers } from "./child-safety-filter";

test("hasChildMarkers: tunnistaa lapsimerkit otsikosta (en/sv/fi)", () => {
  assert.equal(hasChildMarkers("Kids Waterproof Rain Pants"), true);
  assert.equal(hasChildMarkers("Barn Skaljacka Junior"), true);
  assert.equal(hasChildMarkers("Lasten talvitakki"), true);
  assert.equal(hasChildMarkers("Tytöt kurahousut"), true);
});

test("hasChildMarkers: aikuisten tuote ilman lapsimerkkiä hylätään", () => {
  assert.equal(hasChildMarkers("Men's Hiking Boots GTX"), false);
  assert.equal(hasChildMarkers("Women's Down Jacket"), false);
});

test("hasChildMarkers: age_group ratkaisee ensin, eikä osamerkkijono riitä", () => {
  assert.equal(hasChildMarkers("Rain Jacket", "kids"), true);
  assert.equal(hasChildMarkers("Kids Rain Jacket", "adult"), false);
  assert.equal(hasChildMarkers("Skidoo Jacket"), false); // "kid" ei osu sanan sisällä
});
