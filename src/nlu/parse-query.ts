import { SearchCriteria, GarmentType } from "../types";
import { GARMENT_KEYWORDS } from "./garment-keywords";
import { AGE_TO_CM } from "../size";
import { isKnownBrandWord } from "../ranking/brand-tiers";

const WATERPROOF_KEYWORDS = ["vedenpitäv", "vedenkestäv", "sadeasu", "sadetakki", "sadehousut"];
const MATERIAL_KEYWORDS = ["luomupuuvilla", "gots", "villaa", "merinovilla", "fleece", "softshell"];
const GENDER_KEYWORDS: Record<"tyttö" | "poika" | "unisex", string[]> = {
  tyttö: ["tytölle", "tytön", "tyttöjen"],
  poika: ["pojalle", "pojan", "poikien"],
  unisex: ["unisex", "sukupuolineutraali"],
};
// Sanat jotka kertovat että haku koskee lasta, vaikka ikää/kokoa/sukupuolta
// ei mainittaisi ("kurahousut lapselle"). Käytetään aikuistuotteiden
// suodatuksen aktivointiin (ks. multi-store-adapter.ts).
const CHILD_SIGNAL_KEYWORDS = [
  "lapselle", "lapsen", "lapsille", "lapsi", "lapsia", "lasten",
  "vauvalle", "vauvan", "vauva", "vauvoille",
  "taaperolle", "taaperon", "taapero",
  "pikkulapsi", "pikkulapselle", "tytölle", "pojalle",
];
const COLOR_KEYWORDS = ["musta", "sininen", "punainen", "vihreä", "keltainen", "vaaleanpunainen", "harmaa", "valkoinen", "ruskea", "oranssi"];
const SEASON_WINTER_REGEX = /talvi|untuva|vinter|winter/;
const SEASON_TOPPA_GARMENTS = new Set<GarmentType>(["takki", "haalari", "kengät"]);
// Sanat jotka "ei ..." -rakenteessa eivät ole brändejä ("ei liian kallis").
const NOT_BRAND_WORDS = new Set(["liian", "kovin", "kovinkaan", "yhtään", "mitään", "mikään", "ollenkaan", "paljon", "tosi", "hirveän", "mitenkään", "välttämättä", "ihan", "aivan", "vielä", "tarvitse", "pakko", "vain", "vaan", "sitä", "sen", "tämä", "nämä", "joku", "jokin", "kallis", "kallista", "halpa", "iso", "pieni"]);

function findGarmentType(text: string): GarmentType | undefined {
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [GarmentType, string[]][]) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return undefined;
}
function findGender(text: string): "tyttö" | "poika" | "unisex" | undefined {
  for (const [gender, keywords] of Object.entries(GENDER_KEYWORDS) as ["tyttö" | "poika" | "unisex", string[]][]) {
    if (keywords.some((kw) => text.includes(kw))) return gender;
  }
  return undefined;
}
function findMaxPrice(text: string) {
  const match = text.match(/(?:max|alle|korkeintaan|enintään)\s*(\d+)\s*(?:€|eur|euroa|e\b)/);
  return match ? { amount: parseInt(match[1], 10), currency: "EUR" as const } : undefined;
}
function findSize(text: string): { size_raw?: string; size_cm?: number; age?: number } {
  const cmMatch = text.match(/(\d{2,3})\s*cm/);
  if (cmMatch) return { size_raw: cmMatch[1], size_cm: parseInt(cmMatch[1], 10) };
  const ageMatch = text.match(/(\d{1,2})[\s-]?v(?:uotiaalle|uotta|uotiaan|uotias|uotiaana)?\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    // 0 ja yli 17 -vuotiaat eivät ole lapsihaun ikiä - ei tulkita kokona.
    if (age >= 1 && age <= 17) {
      const cm = AGE_TO_CM[age];
      return { size_raw: String(cm), size_cm: cm, age };
    }
  }
  return {};
}
function findBrandDeny(rawText: string): string[] {
  const denyMatches = [...rawText.matchAll(/\bei\s+(?:halua\s+)?([A-Za-zäöåÄÖÅ]+)/gi)];
  return denyMatches
    .map((m) => m[1])
    .filter((w) => w.length > 2 && !["ole", "voi", "saa"].includes(w.toLowerCase()) && !NOT_BRAND_WORDS.has(w.toLowerCase()))
    // Brändi = isolla alkukirjaimella kirjoitettu tai tunnettu brändi.
    .filter((w) => /^[A-ZÄÖÅ]/.test(w) || isKnownBrandWord(w))
    .map((w) => w.toLowerCase());
}

export function parseCriteriaFromText(rawText: string): SearchCriteria {
  const text = rawText.toLowerCase();
  const criteria: SearchCriteria = {};
  const garmentType = findGarmentType(text);
  if (garmentType) criteria.garment_type = garmentType;
  const maxPrice = findMaxPrice(text);
  if (maxPrice) criteria.max_price = maxPrice;
  if (WATERPROOF_KEYWORDS.some((kw) => text.includes(kw))) criteria.waterproof = true;
  const materialMatches = MATERIAL_KEYWORDS.filter((kw) => new RegExp(`\\b${kw}`, "i").test(text));
  if (materialMatches.length > 0) criteria.material_keywords = materialMatches;
  const gender = findGender(text);
  if (gender) criteria.child_gender_pref = gender;
  if (CHILD_SIGNAL_KEYWORDS.some((kw) => text.includes(kw))) criteria.child_signal = true;
  const color = COLOR_KEYWORDS.find((c) => text.includes(c));
  if (color) criteria.color = color;
  const { size_raw, size_cm, age } = findSize(text);
  if (size_raw) criteria.size_raw = size_raw;
  if (size_cm) criteria.size_cm = size_cm;
  if (age) criteria.age = age;
  if (SEASON_WINTER_REGEX.test(text) || (text.includes("toppa") && garmentType && SEASON_TOPPA_GARMENTS.has(garmentType))) {
    criteria.season = "winter";
  }
  const brandDeny = findBrandDeny(rawText);
  if (brandDeny.length > 0) criteria.brand_deny = brandDeny;
  return criteria;
}
