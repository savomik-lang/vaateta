import { SearchCriteria, GarmentType } from "../types";
import { GARMENT_KEYWORDS } from "./garment-keywords";

const WATERPROOF_KEYWORDS = ["vedenpitäv", "vedenkestäv", "sadeasu", "sadetakki", "sadehousut"];
const MATERIAL_KEYWORDS = ["luomupuuvilla", "gots", "villaa", "merinovilla", "fleece", "softshell"];
const GENDER_KEYWORDS: Record<"tyttö" | "poika" | "unisex", string[]> = {
  tyttö: ["tytölle", "tytön", "tyttöjen"],
  poika: ["pojalle", "pojan", "poikien"],
  unisex: ["unisex", "sukupuolineutraali"],
};
const COLOR_KEYWORDS = ["musta", "sininen", "punainen", "vihreä", "keltainen", "vaaleanpunainen", "harmaa", "valkoinen", "ruskea", "oranssi"];
const AGE_TO_CM: Record<number, number> = { 1: 86, 2: 92, 3: 98, 4: 104, 5: 110, 6: 116, 7: 122, 8: 128, 9: 134, 10: 140, 11: 146, 12: 152 };

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
function findSize(text: string): { size_raw?: string } {
  const cmMatch = text.match(/(\d{2,3})\s*cm/);
  if (cmMatch) return { size_raw: cmMatch[1] };
  const ageMatch = text.match(/(\d{1,2})[\s-]?v(?:uotiaalle|uotta|uotiaan)?\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    return { size_raw: AGE_TO_CM[age] ? String(AGE_TO_CM[age]) : ageMatch[1] };
  }
  return {};
}
function findBrandDeny(text: string): string[] {
  const denyMatches = [...text.matchAll(/ei\s+(?:halua\s+)?([a-zäöå]+)/g)];
  return denyMatches.map((m) => m[1]).filter((w) => w.length > 2 && !["ole", "voi", "saa"].includes(w));
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
  const color = COLOR_KEYWORDS.find((c) => text.includes(c));
  if (color) criteria.color = color;
  const { size_raw } = findSize(text);
  if (size_raw) criteria.size_raw = size_raw;
  const brandDeny = findBrandDeny(text);
  if (brandDeny.length > 0) criteria.brand_deny = brandDeny;
  return criteria;
}
