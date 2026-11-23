import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesCriteria } from "./adapters/multi-store-adapter";
import { refineGarmentType, guessGarmentType } from "./nlu/garment-keywords";
import { looksLikeNonClothing } from "./nlu/non-clothing";
import { guessWinter } from "./season";
import { criteriaForItem } from "./structured/search";
import { parseItem } from "./structured/items";
import { subtypeOf } from "./structured/subtypes";
import { makeProduct } from "./fixtures/make-product";
import type { Product, SearchCriteria } from "./types";

// Kategoriapaneelin tarkastuksen (23.11.2026) väärin luokitellut tuotteet. Otsikot ovat sellaisia kuin UI-chat ne raportoi.

const prod = (title: string, garment_type: Product["garment_type"], extra: Partial<Product> = {}) =>
  makeProduct({ id: `t:${title}`, title, garment_type, size_available: ["104", "110"], brand: "Testi", ...extra });
const item = (s: string) => criteriaForItem(parseItem(s)!, { size_cm: null, shoe_eu: null, gender: null, brands: [] });
const shows = (p: Product, c: SearchCriteria) => matchesCriteria(p, c);

// --- 1. Ei-vaatteet: lemmikin vaate, juomapullo ---------------------------------------------------------------------

test("lemmikin vaate ja juomapullo eivät ole vaatteita", () => {
  assert.equal(looksLikeNonClothing("Christmas dog clothes Big dog cat Teddy Bear"), true);
  assert.equal(looksLikeNonClothing("Nalgene Kids' Otf 0,35 L"), true);
  assert.equal(guessGarmentType("Nalgene Kids' Otf 0,35 L"), "muu");
  assert.equal(shows(prod("Christmas dog clothes Big dog cat Teddy Bear", "kengät"), item("kengät")), false);
  assert.equal(shows(prod("Nalgene Kids' Otf 0,35 L", "kengät"), item("kengät")), false);
  // Oikeat lastenvaatteet eivät karsiudu (koiran kuva painatuksena, koko L, "Pet" brändinä)
  for (const t of ["Dog print t-shirt", "T-paita koiralla", "Kids Jacket size L", "Dinosaur Cat Hoodie"]) {
    assert.equal(looksLikeNonClothing(t), false, t);
  }
});

// --- 2. Kurakengät: ei sandaaleja eikä tossuja -----------------------------------------------------------------------

test("kengät+wp ei sisällä sandaaleja, Birkenstockeja eikä tossuja", () => {
  const wp = item("kengät+wp");
  for (const t of ["Birkenstock Arizona Eva", "Birkenstock Kids' Birki Flow Eva", "Vauvan toppatossut", "Topatut tossut", "Crocs Classic Clog"]) {
    assert.equal(shows(prod(t, "kengät", { waterproof: true }), wp), false, t);
  }
  for (const t of ["Tretorn Kids' Gränna Winter Black/Grey", "Gummistövlar Kids Rain Boot", "Reima Kids' Winter Boots Nefar"]) {
    assert.equal(shows(prod(t, "kengät", { waterproof: true }), wp), true, t);
  }
  // Nimenomainen alatyyppi saa yhä vedenpitävät sandaalit
  const eva = prod("Birkenstock Kids' Arizona Eva Sandal", "kengät", { waterproof: true });
  assert.equal(shows(eva, item("kengät.sandaalit+wp")), true);
  assert.equal(shows(eva, item("kengät+wp")), false);
  // Ilman vedenpitävyyspyyntöä sandaalit näkyvät normaalisti
  assert.equal(shows(eva, item("kengät")), true);
});

test("toppatossut tunnistetaan tossut-alatyypiksi (yhdyssana)", () => {
  assert.equal(subtypeOf(prod("Vauvan toppatossut", "kengät")), "tossut");
  assert.equal(subtypeOf(prod("Topatut tossut", "kengät")), "tossut");
});

// --- 3. Talvihaalari / talvitakki: ei välikausi-, kuori-, fleece- eikä leikkivaatteita -------------------------------

test("haalari+winter ei sisällä välikausi-, softshell-, kuori- eikä playsuit-haalareita", () => {
  const winter = item("haalari+winter");
  // Kantaan on voinut tallentua kuvauksesta johdettu winter=true: otsikon selvä "ei talvea" ratkaisee.
  for (const t of ["Name It välikausihaalari Alfa08", "Kekäle softshellhaalari Alfa08", "Skogstad Sletteheida 2-Lags", "Skogstad kuorihaalari Sletteheida", "Metsola Night Pilot Playsuit"]) {
    assert.equal(guessWinter(t), false, t);
    assert.equal(shows(prod(t, "haalari", { winter: true }), winter), false, t);
  }
  for (const t of ["Reima Toppahaalari Kuusi", "Didriksons Björnen Winter Overall", "Polarn O. Pyret Talvihaalari"]) {
    assert.equal(shows(prod(t, "haalari", { winter: true }), winter), true, t);
  }
});

test("takki+winter ei sisällä fleece- eikä Full Zip -välikerroksia", () => {
  const winter = item("takki+winter");
  for (const t of ["Polarn O. Pyret Fleecetakki", "Didriksons Monte Full Zip", "Anten Full-Zip", "Kids Pilefleece-takki"]) {
    assert.equal(guessWinter(t), false, t);
    assert.equal(shows(prod(t, "takki", { winter: true }), winter), false, t);
  }
  for (const t of ["Reima Toppatakki Kuusi", "Didriksons Puffer Full Zip Jacket", "Columbia Winter Jacket"]) {
    assert.equal(shows(prod(t, "takki", { winter: true }), winter), true, t);
  }
});

// --- 4. Kerrasto: ei alushousuja, hoodieita eikä Half Zip -paitoja -------------------------------------------------

test("kerrasto-luokasta poistuvat bokserit, hupparit ja Half Zip -paidat", () => {
  assert.equal(refineGarmentType("kerrasto", "Urberg Bamboo Boxers 3-Pack"), "muu");
  assert.equal(refineGarmentType("kerrasto", "Isbjörn of Sweden Teen Panda Hoodie"), "paita");
  assert.equal(refineGarmentType("kerrasto", "Isbjörn of Sweden Teen Shaun Hoodie"), "paita");
  assert.equal(refineGarmentType("kerrasto", "Didriksons Gosig Half Zip"), "paita");
  // Oikeat kerrastot säilyvät
  for (const t of ["Woolpower Merino Long Johns", "Reima Base Layer Set", "Urberg Merino Half Zip", "Kerrastohousut villa", "Isbjörn Husky Thermal Pants"]) {
    assert.equal(refineGarmentType("kerrasto", t), "kerrasto", t);
  }
});

// --- 5. Takki: ei hupparia, Half Zip -paitaa eikä usean vaatteen settiä -----------------------------------------------

test("takki-luokasta poistuvat hupparit, Half Zip -paidat ja setit", () => {
  assert.equal(refineGarmentType("takki", "Isbjörn of Sweden Teen Shaun Hoodie"), "paita");
  assert.equal(refineGarmentType("takki", "Didriksons Gosig Half Zip"), "paita");
  assert.equal(refineGarmentType("takki", "Setti, jossa neuletakki ja housut"), "muu");
  assert.equal(refineGarmentType("takki", "Setti - Neuletakki ja housut"), "muu");
  // Housujen ja paitojen setit säilyvät toistaiseksi (Lindex "Setti - Paita ja shortsit")
  assert.equal(refineGarmentType("housut", "Setti - Paita ja shortsit"), "housut");
  assert.equal(refineGarmentType("housut", "Setti, jossa paita ja housut"), "housut");
  // Oikeat takit säilyvät (myös Full Zip, huppu ja Rain Set)
  for (const t of ["Reima Toppatakki Kuusi", "Didriksons Monte Full Zip", "Hooded Jacket Kids", "Zip Hoodie Jacket", "Neuletakki lapselle"]) {
    assert.equal(refineGarmentType("takki", t), "takki", t);
  }
  assert.equal(refineGarmentType("haalari", "Urberg Kids' Malme PU Rain Set"), "haalari");
  assert.equal(refineGarmentType("takki", "Rain Set Jacket"), "takki");
});

// --- 6. Sadetakki / sadeasu: ei fleeceä ----------------------------------------------------------------------------

test("takki+wp ja haalari+wp eivät sisällä fleece-/pilevaatteita", () => {
  assert.equal(shows(prod("Tuulenpitävä pilefleece-takki", "takki", { waterproof: true }), item("takki+wp")), false);
  assert.equal(shows(prod("Lindberg Stormy Baby Overall Windfleece", "haalari", { waterproof: true }), item("haalari+wp")), false);
  // Sadevaate, jonka vuori on fleeceä, kelpaa
  assert.equal(shows(prod("Lindberg Kids' Fagerhult Rain Set Fleece", "haalari", { waterproof: true }), item("haalari+wp")), true);
  assert.equal(shows(prod("Reima Regnjacka Fleece-lined", "takki", { waterproof: true }), item("takki+wp")), true);
  assert.equal(shows(prod("Urberg Kids' Malme PU Rain Set", "haalari", { waterproof: true }), item("haalari+wp")), true);
});

// --- 7. Housut: jalkalenkit ovat tarvike --------------------------------------------------------------------------

test("jalkalenkit eivät ole housuja", () => {
  for (const t of ["Jalkalenkki (1 kpl)", "4-pack jalkalenkkejä"]) {
    assert.equal(looksLikeNonClothing(t), true, t);
    assert.equal(shows(prod(t, "housut"), item("housut")), false, t);
  }
  assert.equal(shows(prod("Collegehousut lapselle", "housut"), item("housut")), true);
});
