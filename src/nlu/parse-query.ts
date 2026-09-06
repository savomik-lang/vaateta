import { SearchCriteria, GarmentType } from "../types";

// ---------------------------------------------------------------------------
// TÄMÄ ON EDELLEEN SÄÄNTÖPOHJAINEN TULKINTA, EI LLM-POHJAINEN NLU.
// Se on kuitenkin nyt oma, testattava moduulinsa (ei enää api/search.ts:n
// sisällä), ja tunnistaa huomattavasti enemmän ilmaisutapoja kuin
// ensimmäinen versio. Korvataan oikealla LLM-pohjaisella
// slot-filling-kerroksella (speksin kuvaama) kun perusputki on
// osoittautunut toimivaksi oikealla datalla.
// ---------------------------------------------------------------------------

const GARMENT_KEYWORDS: Record<GarmentType, string[]> = {
  takki: ["takki", "kuoritakki", "toppatakki", "villatakki"],
  housut: [
    "housut",
    "farkut",
    "kurahousut",
    "verkkarit",
    "collegehousut",
    "leggingsit",
  ],
  kengät: ["kengät", "saappaat", "tennarit", "nilkkurit"],
  paita: [
    "paita",
    "t-paita",
    "tpaita",
    "collegepaita",
    "huppari",
    "hupparipaita",
    "pusero",
  ],
  haalari: ["haalari", "kokohaalari", "ulkoiluhaalari", "talvihaalari"],
  muu: [],
};

const WATERPROOF_KEYWORDS = [
  "vedenpitäv",
  "vedenkestäv",
  "sadeasu",
  "sadetakki",
  "sadehousut",
];

const MATERIAL_KEYWORDS = [
  "luomupuuvilla",
  "gots",
  "villaa",
  "merinovilla",
  "fleece",
  "softshell",
];

const GENDER_KEYWORDS: Record<"tyttö" | "poika" | "unisex", string[]> = {
  tyttö: ["tytölle", "tytön", "tyttöjen"],
  poika: ["pojalle", "pojan", "poikien"],
  unisex: ["unisex", "sukupuolineutraali"],
};

const COLOR_KEYWORDS = [
  "musta",
  "sininen",
  "punainen",
  "vihreä",
  "keltainen",
  "vaaleanpunainen",
  "harmaa",
  "valkoinen",
  "ruskea",
  "oranssi",
];

function findGarmentType(text: string): GarmentType | undefined {
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [
    GarmentType,
    string[],
  ][]) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return undefined;
}

function findGender(text: string): "tyttö" | "poika" | "unisex" | undefined {
  for (const [gender, keywords] of Object.entries(GENDER_KEYWORDS) as [
    "tyttö" | "poika" | "unisex",
    string[],
  ][]) {
    if (keywords.some((kw) => text.includes(kw))) return gender;
  }
  return undefined;
}

function findMaxPrice(text: string): { amount: number; currency: "EUR" } | undefined {
  // Tukee: "max 120€", "max 120 €", "alle 60€", "korkeintaan 80 euroa", "60e"
  const match = text.match(
    /(?:max|alle|korkeintaan|enintään)\s*(\d+)\s*(?:€|eur|euroa|e\b)/
  );
  if (match) {
    return { amount: parseInt(match[1], 10), currency: "EUR" };
  }
  return undefined;
}

// Karkea, yleisesti käytetty ikä->cm-vastaavuus pohjoismaisessa
// lastenvaatemitoituksessa (esim. Reima, Boozt käyttävät samankaltaista
// asteikkoa). TÄMÄ ON ARVIO, ei tarkka normalisointi — oikea, kauppakohtainen
// koon normalisointipalvelu on speksin kohdan 6.2 mukainen erillinen työ.
const AGE_TO_CM: Record<number, number> = {
  1: 86, 2: 92, 3: 98, 4: 104, 5: 110, 6: 116,
  7: 122, 8: 128, 9: 134, 10: 140, 11: 146, 12: 152,
};

function findSize(text: string): { size_raw?: string } {
  const cmMatch = text.match(/(\d{2,3})\s*cm/);
  if (cmMatch) return { size_raw: cmMatch[1] };

  const ageMatch = text.match(/(\d{1,2})[\s-]?v(?:uotiaalle|uotta|uotiaan)?\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    const cm = AGE_TO_CM[age];
    return { size_raw: cm ? String(cm) : ageMatch[1] };
  }

  return {};
}

function findBrandDeny(text: string): string[] {
  // "ei Reimaa", "ei halua Lindexiä" -> hyvin karkea poiminta,
  // TODO: tarkenna kun oikeita brändinimiä nähdään datassa
  const denyMatches = [...text.matchAll(/ei\s+(?:halua\s+)?([a-zäöå]+)/g)];
  return denyMatches
    .map((m) => m[1])
    .filter((word) => word.length > 2 && !["ole", "voi", "saa"].includes(word));
}

export function parseCriteriaFromText(rawText: string): SearchCriteria {
  const text = rawText.toLowerCase();
  const criteria: SearchCriteria = {};

  const garmentType = findGarmentType(text);
  if (garmentType) criteria.garment_type = garmentType;

  const maxPrice = findMaxPrice(text);
  if (maxPrice) criteria.max_price = maxPrice;

  if (WATERPROOF_KEYWORDS.some((kw) => text.includes(kw))) {
    criteria.waterproof = true;
  }

  const materialMatches = MATERIAL_KEYWORDS.filter((kw) =>
    new RegExp(`\\b${kw}`, "i").test(text)
  );
  if (materialMatches.length > 0) {
    criteria.material_keywords = materialMatches;
  }

  const gender = findGender(text);
  if (gender) criteria.child_gender_pref = gender;

  const color = COLOR_KEYWORDS.find((c) => text.includes(c));
  if (color) criteria.color = color;

  const { size_raw } = findSize(text);
  if (size_raw) criteria.size_raw = size_raw;

  const brandDeny = findBrandDeny(text);
  if (brandDeny.length > 0) criteria.brand_deny = brandDeny;

  return criteria;
}
