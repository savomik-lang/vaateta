import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProduct } from "./fixtures/make-product";
import { matchesCriteria } from "./adapters/multi-store-adapter";
import { parseCriteriaFromText } from "./nlu/parse-query";
import {
  findRelaxation, buildNoResultsNotice, buildQuery, dropCriteria, buildNoGarmentNotice, buildRateLimitedNotice,
  buildPartialSizeNotice, buildLimitedCoverageNotice,
} from "./search-notice";

const run = (products: ReturnType<typeof makeProduct>[]) => (c: any) => products.filter((p) => matchesCriteria(p, c));

test("talvitakki 14-vuotiaalle tytölle: ei pieniä kokoja eikä fleece/sadetakkeja, kokoa 164 vastaava talvitakki löytyy", () => {
  const products = [
    makeProduct({ id: "fleece", source: "outnorth-fi", garment_type: "takki", title: "Urberg Kids' Fleece Jacket", size_available: ["146/152", "158/164"] }),
    makeProduct({ id: "small", source: "outnorth-fi", garment_type: "takki", title: "Kids' Winter Jacket", size_available: ["98/104", "110", "122/128"] }),
    makeProduct({ id: "ok", source: "outnorth-fi", garment_type: "takki", title: "Kids' Winter Jacket Junior", size_available: ["146/152", "158/164"] }),
  ];
  const c = parseCriteriaFromText("talvitakki 14-vuotiaalle tytölle");
  assert.equal(c.size_cm, 164);
  assert.equal(c.age, 14);
  assert.equal(c.season, "winter");
  assert.deepEqual(products.filter((p) => matchesCriteria(p, c)).map((p) => p.id), ["ok"]);
});

test("nuori-tila: luotetun kaupan Women's XS-takki sallitaan tytölle, Men's ei; Voghion pysyy tiukkana", () => {
  const products = [
    makeProduct({ id: "w", source: "outnorth-fi", garment_type: "takki", title: "Women's Winter Jacket", size_available: ["XS", "S", "M"] }),
    makeProduct({ id: "m", source: "outnorth-fi", garment_type: "takki", title: "Men's Winter Jacket", size_available: ["XS", "S", "M"] }),
    makeProduct({ id: "v", source: "voghion-global", garment_type: "takki", title: "Women's Winter Jacket", size_available: ["XS", "S"] }),
    makeProduct({ id: "wl", source: "outnorth-fi", garment_type: "takki", title: "Women's Winter Jacket Plus", size_available: ["L", "XL"] }),
  ];
  const c = parseCriteriaFromText("talvitakki 14-vuotiaalle tytölle");
  assert.deepEqual(products.filter((p) => matchesCriteria(p, c)).map((p) => p.id), ["w"]);
});

test("pienen lapsen haussa aikuisten tuote hylätään edelleen", () => {
  const p = makeProduct({ id: "w", source: "outnorth-fi", garment_type: "takki", title: "Women's Winter Jacket", size_available: ["XS"] });
  assert.equal(matchesCriteria(p, parseCriteriaFromText("talvitakki 5-vuotiaalle tytölle")), false);
});

test("allowSmaller päästää läpi yhden koon pienemmän", () => {
  const p = makeProduct({ id: "s", source: "outnorth-fi", garment_type: "takki", title: "Kids' Winter Jacket", size_available: ["158/164"] });
  const c = parseCriteriaFromText("talvitakki 170 cm tytölle");
  assert.equal(matchesCriteria(p, c), false);
  assert.equal(matchesCriteria(p, c, { allowSmaller: true }), true);
});

test("rennostettu haku: koko poistamalla löytyy tuloksia, viesti kertoo suurimman koon", () => {
  const products = [
    makeProduct({ id: "a", source: "outnorth-fi", garment_type: "takki", title: "Kids' Winter Jacket", size_available: ["134/140", "146/152"] }),
  ];
  const c = parseCriteriaFromText("talvitakki 14-vuotiaalle tytölle");
  const relax = findRelaxation(c, run(products));
  assert.ok(relax);
  assert.deepEqual(relax!.dropped, ["size"]);
  const notice = buildNoResultsNotice(c, relax);
  assert.equal(notice.code, "no_results");
  assert.match(notice.message, /Talvitakkeja löytyy vain kokoon 152 asti/);
  assert.match(notice.message, /14-vuotiaalle sopivia ei vielä ole/);
  assert.equal(notice.relaxed?.total_matches, 1);
  assert.deepEqual(notice.relaxed?.dropped, ["size"]);
  assert.equal(notice.suggestions?.[0].label, "Näytä koko 152");
});

test("rennostettu haku säilyttää lapsisignaalin, eikä aikuisten tuotteet tule mukaan koon poiston jälkeen", () => {
  const c = parseCriteriaFromText("talvitakki 5-vuotiaalle tytölle");
  const dropped = dropCriteria(c, ["size", "gender"]);
  assert.equal(dropped.child_signal, true);
  const adult = makeProduct({ id: "w", source: "outnorth-fi", garment_type: "takki", title: "Women's Winter Jacket" });
  assert.equal(matchesCriteria(adult, dropped), false);
});

test("buildQuery tuottaa lauseen jonka parseri tulkitsee samoiksi kriteereiksi", () => {
  const c = parseCriteriaFromText("talvitakki 14-vuotiaalle tytölle, max 120 €");
  const again = parseCriteriaFromText(buildQuery(c));
  assert.equal(again.garment_type, "takki");
  assert.equal(again.season, "winter");
  assert.equal(again.size_cm, 164);
  assert.equal(again.child_gender_pref, "tyttö");
  assert.deepEqual(again.max_price, { amount: 120, currency: "EUR" });
});

test("kokotiedoton tuote: ikäväli otsikosta ratkaisee, ilman lapsimerkkiä hylätään kokohaussa", () => {
  const c = parseCriteriaFromText("talvitakki 5-vuotiaalle tytölle");
  const noMarker = makeProduct({ id: "y2k", source: "voghion-global", garment_type: "takki", title: "Y2K Unisex Puffer Jacket Winter Coat" });
  const ages = makeProduct({ id: "ages", source: "voghion-global", garment_type: "takki", title: "Cotton-padded Winter Coat For Kids Warm Jacket For Ages 4-11" });
  const tooOld = makeProduct({ id: "old", source: "voghion-global", garment_type: "takki", title: "Kids Winter Coat for Ages 12-16" });
  const kidsOnly = makeProduct({ id: "kids", source: "voghion-global", garment_type: "takki", title: "Kids Winter Padded Coat" });
  assert.deepEqual([noMarker, ages, tooOld, kidsOnly].filter((p) => matchesCriteria(p, c)).map((p) => p.id), ["ages", "kids"]);
  // ilman kokorajausta kokotiedoton tuote ei karsiudu tämän säännön takia
  assert.equal(matchesCriteria(noMarker, parseCriteriaFromText("talvitakki pojalle")), true);
});

test("nuorelle kokotiedoton 'Baby/Kids shoes' hylätään, 'Junior' hyväksytään", () => {
  const c = parseCriteriaFromText("kengät 14-vuotiaalle tytölle");
  const baby = makeProduct({ id: "baby", source: "voghion-global", garment_type: "kengät", title: "Kids Sports Shoes Baby Girl Sneakers" });
  const junior = makeProduct({ id: "jr", source: "voghion-global", garment_type: "kengät", title: "Junior Sneakers Girls" });
  assert.deepEqual([baby, junior].filter((p) => matchesCriteria(p, c)).map((p) => p.id), ["jr"]);
});

// --- Kieliversiot: notice-viestit sv/en ---------------------------------------------------
const noticeProducts = [
  makeProduct({ id: "a", source: "outnorth-fi", garment_type: "takki", title: "Kids' Winter Jacket", size_available: ["134/140", "146/152"] }),
];
test("notice: oletuskieli on suomi ja lang=fi antaa saman viestin", () => {
  const c = parseCriteriaFromText("talvitakki 14-vuotiaalle tytölle");
  const relax = findRelaxation(c, run(noticeProducts));
  assert.equal(buildNoResultsNotice(c, relax).message, buildNoResultsNotice(c, relax, "fi").message);
  assert.equal(buildNoGarmentNotice().message, buildNoGarmentNotice("fi").message);
});
test("notice sv: koko ylittää valikoiman", () => {
  const c = parseCriteriaFromText("vinterjacka till en 14-åring flicka");
  const relax = findRelaxation(c, run(noticeProducts));
  const n = buildNoResultsNotice(c, relax, "sv");
  assert.match(n.message, /^Vinterjackor finns bara upp till storlek 152\./);
  assert.match(n.message, /Det finns ännu inga passande för en 14-åring i vårt sortiment\./);
  assert.equal(n.suggestions?.[0].label, "Visa storlek 152");
  // ehdotuksen hakulause on ruotsia ja parseri tulkitsee sen koon 152 mukaan
  const q = n.suggestions![0].query;
  assert.match(q, /jacka/);
  assert.equal(parseCriteriaFromText(q, { lang: "sv" }).size_cm, 152);
});
test("notice en: koko ylittää valikoiman", () => {
  const c = parseCriteriaFromText("winter jacket for a 14 year old girl");
  const relax = findRelaxation(c, run(noticeProducts));
  const n = buildNoResultsNotice(c, relax, "en");
  assert.match(n.message, /^Winter jackets are only available up to size 152\./);
  assert.match(n.message, /We don't have suitable ones for a 14-year-old yet\./);
  assert.equal(n.suggestions?.[0].label, "Show size 152");
  const again = parseCriteriaFromText(n.suggestions![0].query, { lang: "en" });
  assert.equal(again.size_cm, 152);
  assert.equal(again.garment_type, "takki");
  assert.equal(again.season, "winter");
});
test("notice sv/en: hintaraja näytetään oikeassa valuutassa", () => {
  const products = [makeProduct({ id: "p", source: "outnorth-fi", garment_type: "kurahousut", title: "Kids' Rain Pants", size_available: ["116"], price: { amount: 45, currency: "EUR" } })];
  const sv = parseCriteriaFromText("regnbyxor storlek 116 max 100 kr");
  const nSv = buildNoResultsNotice(sv, findRelaxation(sv, run(products)), "sv");
  assert.match(nSv.message, /Inga produkter hittades inom prisgränsen 100 kr\. Den billigaste motsvarande kostar ungefär \d+ kr\./);
  const en = parseCriteriaFromText("rain pants size 116 under 20 euros");
  const nEn = buildNoResultsNotice(en, findRelaxation(en, run(products)), "en");
  assert.equal(nEn.message, "No products found within the price limit of 20 €. The cheapest match costs about 45 €.");
  const fi = parseCriteriaFromText("kurahousut 116 cm alle 20 €");
  assert.equal(buildNoResultsNotice(fi, findRelaxation(fi, run(products))).message, "Hintarajalla 20 € ei löytynyt tuotteita. Halvin vastaava maksaa noin 45 €.");
});
test("notice sv/en: pelkät viestit", () => {
  assert.match(buildNoGarmentNotice("sv").message, /^Berätta vilket plagg du söker/);
  assert.match(buildNoGarmentNotice("en").message, /^Tell us which garment/);
  assert.match(buildRateLimitedNotice("sv").message, /^Dagens sökgräns/);
  assert.match(buildRateLimitedNotice("en").message, /^Today's search limit/);
  assert.match(buildLimitedCoverageNotice("sv").message, /få produkter/);
  assert.match(buildLimitedCoverageNotice("en").message, /few products/);
  assert.match(buildPartialSizeNotice({ size_cm: 116 }, "sv").message, /storleken 116/);
  assert.match(buildPartialSizeNotice({ size_cm: 116 }, "en").message, /size you searched for 116/);
  assert.equal(buildNoGarmentNotice("sv").code, "no_garment");
});
test("buildQuery sv/en: parseri tulkitsee lauseen samoiksi kriteereiksi", () => {
  for (const lang of ["sv", "en"] as const) {
    const c = parseCriteriaFromText(lang === "sv" ? "vinterjacka till en flicka 116 cm max 400 kr vattentät" : "winter jacket for a girl 116 cm max 40 euros waterproof");
    const again = parseCriteriaFromText(buildQuery(c, lang), { lang });
    assert.equal(again.garment_type, c.garment_type, lang);
    assert.equal(again.size_cm, c.size_cm, lang);
    assert.deepEqual(again.max_price, c.max_price, lang);
    assert.equal(again.child_gender_pref, c.child_gender_pref, lang);
    assert.equal(again.season, "winter", lang);
    assert.equal(again.waterproof, true, lang);
  }
});

