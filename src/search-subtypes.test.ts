import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCriteriaFromText } from "./nlu/parse-query";
import { matchesCriteria } from "./adapters/multi-store-adapter";
import { catalogSearch } from "./search-catalog";
import { buildQuery } from "./search-notice";
import { mergeCriteria } from "./nlu/llm-interpret";
import { refineGarmentType, guessGarmentType } from "./nlu/garment-keywords";
import { brandKey, pickBrandDisplayName } from "./structured/items";
import { findSubtype, matchesSubtype } from "./structured/subtypes";
import { makeProduct } from "./fixtures/make-product";
import type { Product } from "./types";

const prod = (id: string, title: string, garment_type: Product["garment_type"], sizes: string[], extra: Partial<Product> = {}) =>
  makeProduct({ id, title, garment_type, size_available: sizes, brand: "Testi", ...extra });
const VIEW = { lang: "fi" as const, market: "FI" as const, country: undefined };

// --- 1. Alatyypit vapaassa tekstissä -----------------------------------------------------------------

test("haku tunnistaa alatyypin samalla sanastolla kuin facets (fi/sv/en)", () => {
  const sub = (q: string) => parseCriteriaFromText(q);
  for (const [q, garment, subtype] of [
    ["kypärämyssy 2-vuotiaalle", "pipo", "kypärämyssy"],
    ["kypärälakki 92 cm", "pipo", "kypärämyssy"],
    ["balaklava 2 år", "pipo", "kypärämyssy"],
    ["balaclava for a 2 year old", "pipo", "kypärämyssy"],
    ["lippis 4-vuotiaalle", "pipo", "lippis"],
    ["aurinkohattu 98 cm", "pipo", "aurinkohattu"],
    ["sadehattu 104 cm", "pipo", "sadehattu"],
    ["pipo 110 cm", "pipo", "pipo"],
    ["kumisaappaat koko 26", "kengät", "kumisaappaat"],
    ["gummistövlar storlek 26", "kengät", "kumisaappaat"],
    ["lenkkarit koko 32", "kengät", "lenkkarit"],
    ["tossut koko 24", "kengät", "tossut"],
    ["sandaalit koko 30", "kengät", "sandaalit"],
    ["farkut 122 cm", "housut", "farkut"],
    ["collegehousut 110 cm", "housut", "collegehousut"],
    ["leggingsit 104 cm", "housut", "leggingsit"],
    ["shortsit 110 cm", "housut", "shortsit"],
    ["huppari 128 cm", "paita", "huppari"],
    ["t-paita 116 cm", "paita", "t-paita"],
    ["neule 110", "paita", "neule"],
    ["toppatakki 128 cm", "takki", "toppatakki"],
    ["sadetakki 110 cm", "takki", "kuoritakki"],
    ["softshelltakki 116 cm", "takki", "softshell"],
    ["fleecetakki 122 cm", "takki", "fleece"],
    ["sormikkaat 6-vuotiaalle", "lapaset", "sormikkaat"],
    ["lapaset 2-vuotiaalle", "lapaset", "lapaset"],
  ] as const) {
    const c = sub(q);
    assert.equal(c.garment_type, garment, `${q}: vaatetyyppi`);
    assert.equal(c.subtype, subtype, `${q}: alatyyppi`);
  }
});

test("yleinen vaatesana ei rajaa alatyyppiin", () => {
  for (const q of ["talvitakki 6-vuotiaalle", "talvihaalari 92 cm", "kurahousut 104 cm", "mekko 110 cm", "kerrasto 110 cm", "lasten housut 116"]) {
    assert.equal(parseCriteriaFromText(q).subtype, undefined, q);
  }
  // Alatyypin sana ei saa muuttaa tunnistettua vaatetyyppiä
  assert.equal(parseCriteriaFromText("pipo 52 cm").garment_type, "pipo");
});

test("alatyyppi rajaa tuotteet: kypärämyssyhaku ei palauta lippiksiä, pipohaku ei kypärämyssyjä", () => {
  const helmet = prod("1", "Reima Kypärämyssy Tuulenpitävä", "pipo", ["92-104"]);
  const balaclava = prod("2", "Woolpower Kids Balaclava", "pipo", ["92-110"]);
  const cap = prod("3", "Name It Lippis", "pipo", ["92-104"]);
  const beanie = prod("4", "Lindberg Alaska Hat", "pipo", ["92-104"]);
  const c = parseCriteriaFromText("kypärämyssy 2-vuotiaalle");
  assert.deepEqual([helmet, balaclava, cap, beanie].filter((p) => matchesCriteria(p, c)).map((p) => p.id), ["1", "2"]);
  const plain = parseCriteriaFromText("pipo 92 cm");
  assert.deepEqual([helmet, balaclava, cap, beanie].filter((p) => matchesCriteria(p, plain)).map((p) => p.id), ["4"]);
});

test("fleece-takki: softshell- ja fleecehaku eivät kaadu materiaalirajaukseen (ennen 0 tulosta)", () => {
  const soft = prod("1", "Didriksons Softshell Jacket Kids", "takki", ["110/116"]);
  const fleece = prod("2", "Urberg Kids' Vindeln Wind Fleece Jacket", "takki", ["110/116"]);
  const shell = prod("3", "Reima Shell Jacket Kids", "takki", ["110/116"]);
  const soft1 = parseCriteriaFromText("softshelltakki 116 cm");
  assert.equal(soft1.material_keywords, undefined); // alatyyppi kattaa materiaalin
  assert.deepEqual([soft, fleece, shell].filter((p) => matchesCriteria(p, soft1)).map((p) => p.id), ["1"]);
  const f = parseCriteriaFromText("fleecetakki 122 cm");
  assert.deepEqual([soft, fleece, shell].filter((p) => matchesCriteria(p, { ...f, size_cm: 116, size_raw: "116" })).map((p) => p.id), ["2"]);
});

test("findSubtype: vaatetyyppi tulee alatyypin sanasta vain yksiselitteisillä sanoilla", () => {
  assert.deepEqual(findSubtype("kypärälakki"), { garment: "pipo", subtype: "kypärämyssy" });
  assert.deepEqual(findSubtype("neule 110"), { garment: "paita", subtype: "neule" });
  assert.equal(findSubtype("retkeily 110"), undefined); // ulkoiluhousut ei johda vaatetyyppiin
  assert.equal(findSubtype("fleece", "housut"), undefined);
  assert.ok(matchesSubtype(prod("x", "Pile Jacket", "takki", []), "fleece"));
});

// --- 2. Lähimmät koot samalle alatyypille -------------------------------------------------------------

test("alatyypillä vähän tuotteita haetussa koossa: saman alatyypin lähimmät koot, ei muita alatyyppejä", () => {
  const catalog = [
    prod("h92", "Reima Kypärämyssy", "pipo", ["92-104"]),
    prod("h116", "Lindberg Kypärämyssy", "pipo", ["116-134"]),
    prod("h152", "Woolpower Balaclava", "pipo", ["152-176"]),
    prod("cap92", "Name It Lippis", "pipo", ["92-104"]),
    prod("cap116", "Name It Lippalakki", "pipo", ["110-122"]),
  ];
  const c = parseCriteriaFromText("kypärämyssy 2-vuotiaalle");
  const r = catalogSearch(catalog, c, VIEW);
  assert.deepEqual(r.matches.map((p) => p.id).sort(), ["h116", "h92"]); // 152 on liian kaukana, lippikset eivät kuulu mukaan
  assert.equal(r.notice?.code, "partial_size");
  assert.match(r.notice?.message ?? "", /lähimpiä kokoja/);
});

test("alatyyppiä ilman riittävästi tuotteita ei täydennetä muilla alatyypeillä; tarpeeksi osumia -> ei ilmoitusta", () => {
  const many = Array.from({ length: 5 }, (_, i) => prod(`f${i}`, `Farkut ${i}`, "housut", ["122"]));
  const r = catalogSearch([...many, prod("s1", "Shortsit", "housut", ["122"])], parseCriteriaFromText("farkut 122 cm"), VIEW);
  assert.equal(r.matches.length, 5);
  assert.equal(r.notice, undefined);
  // Ilman alatyyppiä lähimpiä kokoja ei lisätä (ennallaan)
  const plain = catalogSearch([prod("a", "Housut", "housut", ["146"])], parseCriteriaFromText("housut 104 cm"), VIEW);
  assert.equal(plain.matches.length, 0);
});

test("lähimmät koot: kengillä enintään 4 EU-kokoa, vaatteissa enintään 24 cm", () => {
  const c = { garment_type: "kengät" as const, subtype: "sandaalit", size_cm: 98, size_raw: "98", shoe_eu: 26 };
  const sandal = (eu: string) => prod(`s${eu}`, "Sandaalit", "kengät", [eu]);
  assert.ok(matchesCriteria(sandal("29"), c, { allowNearest: true }));
  assert.ok(matchesCriteria(sandal("23"), c, { allowNearest: true }));
  assert.ok(!matchesCriteria(sandal("32"), c, { allowNearest: true }));
  assert.ok(!matchesCriteria(sandal("29"), c));
  const j = { garment_type: "housut" as const, subtype: "farkut", size_cm: 104, size_raw: "104" };
  const jeans = (s: string) => prod(`j${s}`, "Farkut", "housut", [s]);
  assert.ok(matchesCriteria(jeans("128"), j, { allowNearest: true }));
  assert.ok(!matchesCriteria(jeans("134"), j, { allowNearest: true }));
});

// --- 3. Materiaalit, vedenpitävyys -----------------------------------------------------------------

test("villasukat rajaa villaan (otsikosta tai materiaalista), ei tavallisiin sukkiin", () => {
  const c = parseCriteriaFromText("villasukat 3-vuotiaalle");
  assert.deepEqual(c.material_keywords, ["villa"]);
  const wool = prod("1", "Woolpower Kids Socks Classic Logo 400", "sukat", ["98-110"]);
  const merino = prod("2", "Merino Socks", "sukat", ["98-110"]);
  const cotton = prod("3", "Cotton Socks 3-pack", "sukat", ["98-110"]);
  const byMaterial = prod("4", "Sukat", "sukat", ["98-110"], { material: "80% villa" });
  assert.deepEqual([wool, merino, cotton, byMaterial].filter((p) => matchesCriteria(p, c)).map((p) => p.id), ["1", "2", "4"]);
  assert.deepEqual(parseCriteriaFromText("ullstrumpor 98").material_keywords, ["villa"]);
  assert.equal(parseCriteriaFromText("Paita luomupuuvillaa").material_keywords?.[0], "luomupuuvilla");
});

test("rain jacket ja regnställ tulkitaan vedenpitäviksi", () => {
  assert.equal(parseCriteriaFromText("rain jacket 110 cm").waterproof, true);
  assert.equal(parseCriteriaFromText("regnställ 98 cm").waterproof, true);
  assert.equal(parseCriteriaFromText("regnjacka storlek 116").waterproof, true);
  assert.equal(parseCriteriaFromText("winter jacket 116").waterproof, undefined);
});

// --- 4. Kengät: EU-koko ja talvikengät -----------------------------------------------------------------

test("kenkien 'koko 28' tulkitaan EU-koko 28:ksi", () => {
  for (const q of ["talvikengät koko 28", "winter boots size 28", "kengät 28", "skor storlek 28"]) {
    const c = parseCriteriaFromText(q);
    assert.equal(c.garment_type, "kengät", q);
    assert.equal(c.shoe_eu, 28, q);
  }
  // Vaatteissa koko on senttejä
  assert.equal(parseCriteriaFromText("takki koko 116").shoe_eu, undefined);
});

test("talvikenkähaku ei palauta sandaaleja eikä uimakenkiä, vaikka niissä olisi talvimerkintä", () => {
  const c = parseCriteriaFromText("talvikengät koko 28");
  const boot = prod("1", "Reima Winter Boots Kids", "kengät", ["28"], { winter: true });
  const sandal = prod("2", "Birkenstock Arizona Sandals Kids", "kengät", ["28"], { winter: true });
  const swim = prod("3", "Aqua Swim Shoes", "kengät", ["28"], { winter: true });
  const slides = prod("4", "Adidas Adilette Slides", "kengät", ["28"], { winter: true });
  assert.deepEqual([boot, sandal, swim, slides].filter((p) => matchesCriteria(p, c)).map((p) => p.id), ["1"]);
  // Ei talvirajausta -> sandaalit kelpaavat edelleen
  assert.ok(matchesCriteria(sandal, parseCriteriaFromText("sandaalit koko 28")));
});

// --- 5. Kerrasto ja fleece -----------------------------------------------------------------------

test("fleece- ja pile-tuotteet eivät ole kerrastoja; oikeat kerrastot säilyvät", () => {
  assert.equal(refineGarmentType("kerrasto", "Urberg Juniors' Stavik Fleece Black Beauty"), "paita");
  assert.equal(refineGarmentType("kerrasto", "Urberg Juniors' Pile Hoodie Black Beauty"), "paita");
  assert.equal(refineGarmentType("kerrasto", "Urberg Juniors' Vindeln Wind Fleece Jacket"), "takki");
  assert.equal(refineGarmentType("kerrasto", "Urberg Kids' Åheim Pile Jacket"), "takki");
  assert.equal(refineGarmentType("kerrasto", "Urberg Junior's Soft Base Layer Pant"), "kerrasto");
  assert.equal(refineGarmentType("kerrasto", "Woolpower Kids Crewneck 200"), "kerrasto");
  assert.equal(refineGarmentType("kerrasto", "Pitkät alushousut, merinovillaa"), "kerrasto");
  assert.equal(refineGarmentType("kerrasto", "Merino Fleece Base Layer Top"), "kerrasto");
  assert.equal(refineGarmentType("takki", "Fleece Jacket"), "takki"); // vain kerrastot korjataan
  assert.equal(guessGarmentType("kypärälakki"), "pipo");
});

// --- 6. Hakulause ehdotuksissa ja LLM-yhdistely --------------------------------------------------------------

test("buildQuery säilyttää alatyypin ja kenkien EU-koon (ehdotuspainikkeen hakulause)", () => {
  for (const [q, lang] of [
    ["kypärämyssy 2-vuotiaalle", "fi"], ["balaklava 2 år", "sv"], ["rain boots size 26", "en"], ["talvikengät koko 28", "fi"],
    ["farkut 122 cm", "fi"], ["fleecetakki 122 cm", "fi"], ["pipo 110 cm", "fi"],
  ] as const) {
    const c = parseCriteriaFromText(q, { lang });
    const again = parseCriteriaFromText(buildQuery(c, lang), { lang });
    assert.equal(again.garment_type, c.garment_type, `${q}: ${buildQuery(c, lang)}`);
    assert.equal(again.subtype, c.subtype, `${q}: ${buildQuery(c, lang)}`);
    assert.equal(again.shoe_eu, c.shoe_eu, `${q}: ${buildQuery(c, lang)}`);
  }
});

test("LLM-yhdistely: alatyyppi pudotetaan, jos LLM valitsi toisen vaatetyypin; kenkäkoko seuraa kokoa", () => {
  const rules = parseCriteriaFromText("balaklava 2 år");
  assert.equal(mergeCriteria(rules, { garment_type: "pipo" }, "llm").subtype, "kypärämyssy");
  assert.equal(mergeCriteria(rules, { garment_type: "takki" }, "llm").subtype, undefined);
  const shoes = parseCriteriaFromText("skor storlek 28");
  const merged = mergeCriteria(shoes, { garment_type: "kengät", size_cm: 104, size_raw: "104" }, "llm");
  assert.equal(merged.shoe_eu, undefined); // LLM:n koko voittaa, EU-koko ei jää ristiriitaan
  assert.equal(mergeCriteria(shoes, { garment_type: "kengät" }, "llm").shoe_eu, 28);
});

// --- 7. Merkkilista ------------------------------------------------------------------------------------

test("Isbjörn ja Isbjörn of Sweden ovat sama merkki facetsissa", () => {
  assert.equal(brandKey("Isbjörn of Sweden"), brandKey("Isbjörn"));
  assert.equal(brandKey("ISBJÖRN OF SWEDEN"), "isbjörn");
  assert.notEqual(brandKey("Sweden Kids"), brandKey("Kids"));
  const variants = new Map([["Isbjörn of Sweden", 40], ["Isbjörn", 21]]);
  assert.equal(pickBrandDisplayName(variants), "Isbjörn");
});
