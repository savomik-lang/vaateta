import { GarmentType } from "../types";

import { findGarmentSvEn } from "./lang-rules";
import { looksLikeNonClothing, BODY_PRODUCT_REGEX } from "./non-clothing";

export const GARMENT_KEYWORDS: Record<GarmentType, string[]> = {
  // kerrasto ensin: "base layer pants" / "kerrastohousut" eivät ole housuja.
  kerrasto: ["kerrasto", "base layer", "baselayer", "base-layer"],
  takki: ["takki", "jacket", "coat", "kuoritakki", "toppatakki", "villatakki", "liivi", "waistcoat", "bodywarmer"],
  // HUOM: kurahousut ja toppahousut ovat omia tyyppejään ja MÄÄRÄYTYVÄT
  // ENNEN yleistä housut-tyyppiä, koska ensimmäinen osuma voittaa
  // ("kurahousut" sisältää alimerkkijonon "housut").
  kurahousut: ["kurahousut", "sadehousut", "rain pants", "rainpants", "rain trousers", "waterproof pants", "waterproof trousers"],
  toppahousut: ["toppahousut", "talvihousut", "snow pants", "snowpants", "ski pants", "salopette", "snow trousers", "ski trousers"],
  // uimapuku ennen housuja: "swim shorts", "uimahousut" sisältävät housujen avainsanan.
  uimapuku: ["uimapuku", "swimsuit", "swimwear", "uikkari", "uima-asu", "swim shorts", "swimshorts", "uimashorts", "uimahousut", "uimashortsit"],
  housut: ["housut", "pants", "trousers", "farkut", "jeans", "verkkarit", "collegehousut", "leggingsit", "shorts"],
  // sukat ennen kenkiä: sukkien kategoriassa/otsikossa esiintyy usein sana "shoes"
  sukat: ["sukat", "socks", "strumpor", "sukkahousut"],
  kengät: ["kengät", "kenkä", "saapas", "mokkasiini", "shoes", "boots", "saappaat", "tennarit", "nilkkurit", "sandaal", "sandal", "lenkkar", "sneaker", "tossut"],
  paita: ["paita", "shirt", "t-paita", "tpaita", "tröja", "collegepaita", "hupparipaita", "huppari", "pusero", "paidat", "toppi", "topit", "tank top", "tanktop", "sports top"],
  haalari: ["haalari", "overall", "jumpsuit", "kokohaalari", "ulkoiluhaalari", "talvihaalari", "kuoriasu", "sadeasu", "shell suit"],
  mekko: ["mekko", "dress", "klänning", "juhlamekko", "kesämekko", "mekot"],
  body: ["body", "bodysuit", "vauvanbody", "potkupuku"],
  pyjama: ["pyjama", "pyjamat", "yöpuku", "yöpuvut", "yövaate", "yövaatteet", "yöasu", "pajamas", "nukkumapuku"],
  pipo: ["pipo", "beanie", "myssy", "aurinkohattu", "lippalakki", "lippis", "balaklava", "balaclava", "kypärälakki", "hattu"],
  lapaset: ["lapaset", "mittens", "vantar", "sormikkaat", "käsineet", "hanskat", "hanska", "rukkas"],
  muu: [],
};

// Kenkien lisävarusteet (pohjalliset, nauhat, kengänhoito) sisältävät usein
// sanan "shoes" mutta eivät ole kenkiä - "kengät lapselle" palautti
// pohjallisia ja kengännauhoja. Nämä eivät saa luokittua kengiksi.
const SHOE_ACCESSORY_REGEX = /\b(insoles?|shoelaces?|shoe laces?|laces|shoe covers?|shoe polish|shoe care|shoe cleaner|shoe horn|shoehorn|shoe racks?|shoe trees?)\b/i;

export function guessGarmentType(...texts: (string | undefined)[]): GarmentType {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  // Korut ja vartalotuotteet eivät ole vaatteita ("Body Jewelry" ei ole body).
  if (looksLikeNonClothing(haystack)) return "muu";
  const byKeyword = guessByKeyword(haystack);
  if (byKeyword !== "muu") return byKeyword;
  // Sanarajalla toimiva ruotsi/englanti-lista (cap, keps, solhatt, underställ...) vain jos
  // osamerkkijonolista ei tunnistanut mitään - lyhyet sanat eivät saa osua keskelle sanaa.
  const fallback = findGarmentSvEn(haystack) ?? "muu";
  return fallback === "kengät" && SHOE_ACCESSORY_REGEX.test(haystack) ? "muu" : fallback;
}

// Yhdyssanat ja englanninkieliset poikkeukset, joissa avainsanalistan järjestys antaisi väärän tyypin:
// "sukkahousut" sisältää sanan "housut", "pyjamahousut"/"pyjamapaita" sisältävät "housut"/"paita",
// urheilun "short tights" on leggingsit eikä sukkahousut.
const SPORT_TIGHTS_REGEX = /(?:^|[^a-zåäö])(?:short|running|training|sport|sports|gym|cycling|bike)\s+tights/;
const PYJAMA_WORD_REGEX = /pyjama|pajama|yöpaita|yöasu/;

function guessByKeyword(haystack: string): GarmentType {
  if (SPORT_TIGHTS_REGEX.test(haystack)) return "housut";
  if (PYJAMA_WORD_REGEX.test(haystack) && !haystack.includes("kerrasto")) return "pyjama";
  if (haystack.includes("sukkahousut")) return "sukat";
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [GarmentType, string[]][]) {
    if (type === "kengät" && SHOE_ACCESSORY_REGEX.test(haystack)) continue;
    // "body" on osamerkkijono: vaadi oikea body/bodysuit/potkupuku-sana ("bodybuilding", "crossbody" eivät kelpaa).
    if (type === "body" && !BODY_PRODUCT_REGEX.test(haystack) && !haystack.includes("vauvanbody")) continue;
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return "muu";
}

// Kerrastoksi luokiteltu fleece-/pile-tuote ei ole kerrasto: se on välikerros (Outnorthin kategoria "Base layers"
// sisältää myös fleece-takkeja). Takkisanalla -> takki, muuten paita (paita.fleece). Oikeat kerrastot (merino, villa,
// "base layer", alushousut) ja kerrastohousut jäävät ennalleen.
const FLEECE_TITLE_REGEX = /(?<![\p{L}\p{N}])(?:\p{L}*fleece|pile)(?![\p{L}\p{N}])/iu;
const BASE_LAYER_TITLE_REGEX = /base[\s-]?layer|merino|wool|(?<![\p{L}])ull(?![\p{L}])|villa|thermal|kerrasto|underställ|long\s?johns?|alushous|thermo|(?<![\p{L}])(?:pants?|bottoms?|tights|leggings|byxor|housut)(?![\p{L}])/iu;
const JACKET_TITLE_REGEX = /(?<![\p{L}])(?:jackets?|jacka|jackor|takki|jakku|cardigan)(?![\p{L}])/iu;

// Outnorthin kategoria "Base layers" sisältää myös alushousuja ja hupparipaitoja; "Jackets" taas hoodie- ja Half Zip -paitoja.
const UNDERWEAR_TITLE_REGEX = /(?<![\p{L}])(?:boxers?|briefs|underpants|panties|bokserit?|bokserikalsar\p{L}*|trosor|kalsonger)(?![\p{L}])/iu;
const HOODIE_TITLE_REGEX = /(?<![\p{L}])(?:hoodies?|hupparit?|huvtröj\p{L}*|hettetröj\p{L}*)(?![\p{L}])/iu;
const HALF_ZIP_TITLE_REGEX = /(?<![\p{L}\p{N}])(?:half[\s-]?zip|1\/2[\s-]?zip|zip[\s-]?neck|halvzip|puolivetoketju\p{L}*)(?![\p{L}\p{N}])/iu;
const COVER_WORD_REGEX = /(?<![\p{L}])(?:jackets?|jacka|jackor|takki|jakku|coat|parka|vest|liivi|väst)(?![\p{L}])/iu;
// "Setti, jossa neuletakki ja housut": useamman vaatteen setti ei ole takki ("Rain Set" ei osu: setti on otsikon alussa
// pilkun, viivan tai liitesanan kanssa). Vain takit: housut- ja paita-luokkien setit (Lindex "Setti - Paita ja shortsit")
// jäävät toistaiseksi näkyviin, koska niitä on kymmeniä eikä setille ole omaa kategoriaa.
const MULTI_GARMENT_SET_REGEX = /^\s*(?:setti|set|sett)\s*(?:[,\-–]|(?:jossa|joka|sisältää|med|with|of|som)\b)/iu;
const SET_REFINED_TYPES = new Set<GarmentType>(["takki"]);

export function refineGarmentType(type: GarmentType, title: string): GarmentType {
  if (SET_REFINED_TYPES.has(type) && MULTI_GARMENT_SET_REGEX.test(title)) return "muu";
  if (type === "kerrasto") {
    if (UNDERWEAR_TITLE_REGEX.test(title)) return "muu";
    if (FLEECE_TITLE_REGEX.test(title) && !BASE_LAYER_TITLE_REGEX.test(title)) return JACKET_TITLE_REGEX.test(title) ? "takki" : "paita";
    if (!BASE_LAYER_TITLE_REGEX.test(title) && (HOODIE_TITLE_REGEX.test(title) || HALF_ZIP_TITLE_REGEX.test(title)) && !COVER_WORD_REGEX.test(title)) return "paita";
    return type;
  }
  // Hupparit ja Half Zip -paidat ovat paitoja (huppari-alatyyppi), vaikka kauppa luokittelisi ne takeiksi.
  if (type === "takki" && !COVER_WORD_REGEX.test(title) && (HOODIE_TITLE_REGEX.test(title) || HALF_ZIP_TITLE_REGEX.test(title))) return "paita";
  return type;
}
