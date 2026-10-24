import { GarmentType } from "../types";

export const GARMENT_KEYWORDS: Record<GarmentType, string[]> = {
  takki: ["takki", "jacket", "coat", "kuoritakki", "toppatakki", "villatakki"],
  housut: ["housut", "pants", "trousers", "farkut", "jeans", "kurahousut", "verkkarit", "collegehousut", "leggingsit"],
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

export function guessGarmentType(...texts: (string | undefined)[]): GarmentType {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [GarmentType, string[]][]) {
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return "muu";
}
