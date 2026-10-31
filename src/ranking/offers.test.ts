import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProduct } from "../fixtures/make-product";
import { fitContextFromCriteria } from "./fit";
import { dedupeResults, mergeCrossStoreOffers } from "./offers";

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
