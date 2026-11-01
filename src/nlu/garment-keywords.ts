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
  kengät: ["kengät", "shoes", "boots", "saappaat", "tennarit", "nilkkurit", "sandaal", "sandal", "lenkkar", "sneaker", "tossut"],
  paita: ["paita", "shirt", "t-paita", "tpaita", "tröja", "collegepaita", "hupparipaita", "huppari", "pusero"],
  haalari: ["haalari", "overall", "jumpsuit", "kokohaalari", "ulkoiluhaalari", "talvihaalari", "kuoriasu", "sadeasu", "shell suit"],
  mekko: ["mekko", "dress", "klänning", "juhlamekko", "kesämekko"],
  body: ["body", "bodysuit", "vauvanbody", "potkupuku"],
  pyjama: ["pyjama", "pyjamat", "yöpuku", "pajamas", "nukkumapuku"],
  pipo: ["pipo", "beanie", "myssy", "aurinkohattu", "lippalakki", "lippis", "balaklava", "balaclava", "hattu"],
  lapaset: ["lapaset", "mittens", "vantar", "sormikkaat", "käsineet"],
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

function guessByKeyword(haystack: string): GarmentType {
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [GarmentType, string[]][]) {
    if (type === "kengät" && SHOE_ACCESSORY_REGEX.test(haystack)) continue;
    // "body" on osamerkkijono: vaadi oikea body/bodysuit/potkupuku-sana ("bodybuilding", "crossbody" eivät kelpaa).
    if (type === "body" && !BODY_PRODUCT_REGEX.test(haystack) && !haystack.includes("vauvanbody")) continue;
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return "muu";
}
