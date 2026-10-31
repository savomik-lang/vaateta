import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProduct } from "./fixtures/make-product";
import { matchesCriteria } from "./adapters/multi-store-adapter";
import { parseCriteriaFromText } from "./nlu/parse-query";
import { findRelaxation, buildNoResultsNotice, buildQuery, dropCriteria } from "./search-notice";

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
