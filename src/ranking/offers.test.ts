import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProduct } from "../fixtures/make-product";
import { fitContextFromCriteria } from "./fit";
import { dedupeResults, mergeCrossStoreOffers, shippingNote, FOREIGN_SHOP_NOTE } from "./offers";
import { rankResults } from "./rank";

const coatCtx = fitContextFromCriteria({ garment_type: "takki", size_cm: 164, age: 14, child_signal: true } as any);

const fi = makeProduct({
  id: "outnorth-fi:1", source: "outnorth-fi", brand: "Urberg", title: "Urberg Juniors' 2nd Layer Padded Jacket Mediterranea",
  color: "Mediterranea", group_id: "PL1", price: { amount: 38.94, currency: "EUR" }, size_available: ["158/164"],
});
const se = makeProduct({
  id: "outnorth-se:1", source: "outnorth-se", brand: "Urberg", title: "Urberg Juniors' 2nd Layer Padded Jacket Mediterranea",
  color: "Mediterranea", group_id: "PL1", price: { amount: 695, currency: "SEK" }, size_available: ["158/164"],
});

test("sama tuote FI:ssä ja SE:ssä yhdistyy: halvin EUR edustajaksi, toinen other_offersiin", () => {
  const out = mergeCrossStoreOffers([se, fi], coatCtx);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "outnorth-fi:1");
  assert.equal(out[0].other_offers!.length, 1);
  assert.equal(out[0].other_offers![0].source, "outnorth-se");
  assert.equal(out[0].other_offers![0].store, "Outnorth SE");
  assert.equal(out[0].other_offers![0].price.amount, 695);
});

test("parempi koko voittaa halvemman hinnan edustajana", () => {
  const seFit = { ...se, size_available: ["164"] };
  const fiSmall = { ...fi, size_available: ["134/140"] };
  const out = mergeCrossStoreOffers([fiSmall, seFit], coatCtx);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "outnorth-se");
  // huonosti istuvaa FI-tarjousta ei listata vaihtoehtona
  assert.equal(out[0].other_offers, undefined);
});

test("yhdistyy myös pelkällä otsikolla ja värillä kun group_id puuttuu (vanha data)", () => {
  const a = { ...fi, group_id: undefined };
  const b = { ...se, group_id: undefined };
  assert.equal(mergeCrossStoreOffers([a, b], coatCtx).length, 1);
});

test("yhdistyy EANilla vaikka otsikko eroaisi", () => {
  const a = { ...fi, group_id: undefined, title: "Eri nimi A", ean: "123" };
  const b = { ...se, group_id: undefined, title: "Toinen nimi B", ean: "123" };
  assert.equal(mergeCrossStoreOffers([a, b], coatCtx).length, 1);
});

test("eri väri eri kaupassa ei yhdisty otsikko- tai group-avaimella", () => {
  const seRed = { ...se, id: "outnorth-se:2", color: "Red", title: "Urberg Juniors' 2nd Layer Padded Jacket Red", group_id: "PL1" };
  assert.equal(mergeCrossStoreOffers([fi, seRed], coatCtx).length, 2);
});

test("saman kaupan kaksi tuotetta samalla avaimella ei katoa", () => {
  const dup = { ...fi, id: "outnorth-fi:2", price: { amount: 45, currency: "EUR" as const } };
  const out = mergeCrossStoreOffers([fi, dup], coatCtx);
  assert.equal(out.length, 2);
});

test("eri tuotteet eivät yhdisty", () => {
  const other = makeProduct({ id: "x", source: "outnorth-se", brand: "Didriksons", title: "Didriksons Volt Jacket Black", color: "Black" });
  assert.equal(mergeCrossStoreOffers([fi, other], coatCtx).length, 2);
});

test("dedupeResults: kauppojen yhdistäminen ja värit yhdessä", () => {
  const fiBlack = { ...fi, id: "fi-black", title: "Urberg Juniors' 2nd Layer Padded Jacket Black", color: "Black", group_id: "PL1-B" };
  const out = dedupeResults([fi, se, fiBlack], coatCtx);
  assert.equal(out.length, 1);
  assert.equal(out[0].color_count, 2);
  assert.equal(out[0].other_offers?.length, 1);
});

test("Suomen kauppa on edustaja vaikka Ruotsin kauppa olisi halvempi; SE-tarjouksessa toimitushuomautus", () => {
  const cheapSe = { ...se, price: { amount: 300, currency: "SEK" as const } };
  const out = dedupeResults([cheapSe, fi], coatCtx);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "outnorth-fi");
  assert.equal(out[0].market, "FI");
  assert.equal(out[0].shipping_note, undefined);
  assert.equal(out[0].other_offers![0].market, "SE");
  assert.match(out[0].other_offers![0].shipping_note!, /tarkista toimitus Suomeen/);
});

test("pelkkä SE-tuote saa market SE ja huomautuksen; FI-tuote ei huomautusta", () => {
  const onlySe = dedupeResults([{ ...se, title: "Vain Ruotsissa Jacket", group_id: "X", color: "Red" }], coatCtx)[0];
  assert.equal(onlySe.market, "SE");
  assert.ok(onlySe.shipping_note);
  const onlyFi = dedupeResults([{ ...fi, title: "Vain Suomessa Jacket", group_id: "Y", color: "Red" }], coatCtx)[0];
  assert.equal(onlyFi.market, "FI");
  assert.equal(onlyFi.shipping_note, undefined);
});

test("parempi koko ruotsalaisella voittaa edelleen suomalaisen markkina-etusijan", () => {
  const fiSmall = { ...fi, size_available: ["134/140"] };
  const out = dedupeResults([fiSmall, se], coatCtx);
  assert.equal(out[0].source, "outnorth-se");
});

// --- Kävijän markkina (market) ja kieli (lang) ------------------------------------------
const voghion = makeProduct({
  id: "voghion-global:1", source: "voghion-global", brand: "voghion", title: "Cotton-padded Coat For Kids",
  price: { amount: 25, currency: "EUR" }, size_available: ["158/164"],
});

test("oletus (FI-kävijä, fi) ei muutu: SE-tuotteella suomenkielinen huomautus, FI-tuotteella ei", () => {
  const out = dedupeResults([fi, voghion], coatCtx);
  assert.equal(out.find((p) => p.source === "outnorth-fi")!.shipping_note, undefined);
  assert.equal(out.find((p) => p.source === "voghion-global")!.shipping_note, undefined);
  const seOnly = dedupeResults([{ ...se, group_id: "X", title: "Yksin" }], coatCtx);
  assert.equal(seOnly[0].shipping_note, FOREIGN_SHOP_NOTE);
});
test("FI-kävijä: huomautus kielellä sv ja en", () => {
  assert.equal(shippingNote("SE", { lang: "sv", market: "FI" }), "Svensk webbutik – kontrollera leverans till Finland innan du beställer");
  assert.equal(shippingNote("SE", { lang: "en" }), "Swedish online store – check delivery to Finland before ordering");
  assert.equal(shippingNote("FI", { lang: "sv", market: "FI" }), undefined);
});
test("SE-kävijä: Ruotsin kauppa edustajaksi, FI-tarjous other_offersiin huomautuksella 'Leverans från Finland'", () => {
  const out = dedupeResults([fi, se], coatCtx, { lang: "sv", market: "SE" });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "outnorth-se");
  assert.equal(out[0].shipping_note, undefined); // oma markkina, ei huomautusta
  assert.equal(out[0].other_offers!.length, 1);
  assert.equal(out[0].other_offers![0].source, "outnorth-fi");
  assert.equal(out[0].other_offers![0].shipping_note, "Leverans från Finland");
});
test("SE-kävijä: FI-kaupan tuote ilman SE-vastinetta saa huomautuksen", () => {
  const out = dedupeResults([{ ...fi, group_id: "Z", title: "Vain FI" }], coatCtx, { lang: "sv", market: "SE" });
  assert.equal(out[0].shipping_note, "Leverans från Finland");
  assert.equal(shippingNote("FI", { lang: "en", market: "SE" }), "Shipped from Finland");
  assert.equal(shippingNote("global", { lang: "sv", market: "SE" }), undefined);
});
test("FI-kävijä: Suomen kauppa edustajaksi (kuten ennen), SE-kävijä: Ruotsin kauppa", () => {
  assert.equal(dedupeResults([se, fi], coatCtx, { market: "FI" })[0].source, "outnorth-fi");
  assert.equal(dedupeResults([fi, se], coatCtx, { market: "SE" })[0].source, "outnorth-se");
});
test("muu maa: jokaisella kaupalla huomautus kävijän kielellä", () => {
  const out = dedupeResults([fi, voghion, { ...se, group_id: "Q", title: "Vain SE" }], coatCtx, { lang: "en", market: "other" });
  const note = (src: string) => out.find((p) => p.source === src)!.shipping_note;
  assert.equal(note("outnorth-fi"), "Finnish online store – check delivery to your country before ordering");
  assert.equal(note("outnorth-se"), "Swedish online store – check delivery to your country before ordering");
  assert.equal(note("voghion-global"), "International online store – check delivery to your country before ordering");
  assert.equal(shippingNote("SE", { lang: "sv", market: "other" }), "Svensk webbutik – kontrollera leverans till ditt land innan du beställer");
});
test("SE-kävijä: Ruotsin kaupan tuote nousee Sopivimmat-listassa FI-tuotteen edelle tasatilanteessa", () => {
  const a = { ...fi, id: "fi-a", group_id: "A", title: "Jacket A", size_available: ["164"], color: "Blue" };
  const b = { ...se, id: "se-b", group_id: "B", title: "Jacket B", size_available: ["164"], color: "Red", price: { amount: 999, currency: "SEK" as const } };
  const crit = { garment_type: "takki" as const, size_cm: 164, age: 14, child_signal: true };
  const viewSE = { lang: "sv" as const, market: "SE" as const };
  const rankedSE = rankResults(dedupeResults([a, b], fitContextFromCriteria(crit, "SE"), viewSE), fitContextFromCriteria(crit, "SE"));
  assert.equal(rankedSE.bestMatch![0].id, "se-b");
  const rankedFI = rankResults(dedupeResults([a, b], fitContextFromCriteria(crit, "FI")), fitContextFromCriteria(crit, "FI"));
  assert.equal(rankedFI.bestMatch![0].id, "fi-a"); // FI-kävijällä halvempi edellä kuten ennen
});

