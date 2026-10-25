import { GarmentType } from "../types";

export const GARMENT_KEYWORDS: Record<GarmentType, string[]> = {
  takki: ["takki", "jacket", "coat", "kuoritakki", "toppatakki", "villatakki"],
  // HUOM: kurahousut ja toppahousut ovat omia tyyppejään ja MÄÄRÄYTYVÄT
  // ENNEN yleistä housut-tyyppiä, koska ensimmäinen osuma voittaa
  // ("kurahousut" sisältää alimerkkijonon "housut").
  kurahousut: ["kurahousut", "sadehousut", "rain pants", "rainpants", "rain trousers", "waterproof pants", "waterproof trousers"],
  toppahousut: ["toppahousut", "talvihousut", "snow pants", "snowpants", "ski pants", "salopette", "snow trousers", "ski trousers"],
  housut: ["housut", "pants", "trousers", "farkut", "jeans", "verkkarit", "collegehousut", "leggingsit"],
  kengät: ["kengät", "shoes", "boots", "saappaat", "tennarit", "nilkkurit"],
  paita: ["paita", "shirt", "t-paita", "tpaita", "tröja", "collegepaita", "hupparipaita", "huppari", "pusero"],
  haalari: ["haalari", "overall", "jumpsuit", "kokohaalari", "ulkoiluhaalari", "talvihaalari"],
  mekko: ["mekko", "dress", "klänning", "juhlamekko", "kesämekko"],
  body: ["body", "bodysuit", "vauvanbody", "potkupuku"],
  uimapuku: ["uimapuku", "swimsuit", "swimwear", "uikkari", "uima-asu"],
  pyjama: ["pyjama", "pyjamat", "yöpuku", "pajamas", "nukkumapuku"],
  sukat: ["sukat", "socks", "strumpor", "sukkahousut"],
  pipo: ["pipo", "beanie", "myssy"],
  lapaset: ["lapaset", "mittens", "vantar", "sormikkaat", "käsineet"],
  muu: [],
};

// Kenkien lisävarusteet (pohjalliset, nauhat, kengänhoito) sisältävät usein
// sanan "shoes" mutta eivät ole kenkiä - "kengät lapselle" palautti
// pohjallisia ja kengännauhoja. Nämä eivät saa luokittua kengiksi.
const SHOE_ACCESSORY_REGEX = /\b(insoles?|shoelaces?|shoe laces?|laces|shoe covers?|shoe polish|shoe care|shoe cleaner|shoe horn|shoehorn|shoe racks?|shoe trees?)\b/i;

export function guessGarmentType(...texts: (string | undefined)[]): GarmentType {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [GarmentType, string[]][]) {
    if (type === "kengät" && SHOE_ACCESSORY_REGEX.test(haystack)) continue;
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return "muu";
}
