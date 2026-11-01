import { SearchCriteria, GarmentType } from "../types";
import { GARMENT_KEYWORDS } from "./garment-keywords";
import { AGE_TO_CM, monthsToCm, cmForShoeEu } from "../size";
import { normalizeNumberWords } from "./numbers";
import {
  findGarmentSvEn, findGenderSvEn, hasChildSignalSvEn, WATERPROOF_SV_EN,
  findSizeWord, AGE_PATTERNS, MONTH_PATTERNS, VEST_QUERY_RE,
} from "./lang-rules";
import { detectLanguage } from "./language";
import { findColor } from "./colors";
import { Currency } from "../types";
import { Lang } from "../lang";
import { isKnownBrandWord } from "../ranking/brand-tiers";

const WATERPROOF_KEYWORDS = ["vedenpitäv", "vedenkestäv", "sadeasu", "sadetakki", "sadehousut", ...WATERPROOF_SV_EN];
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
export { COLOR_KEYWORDS } from "./colors";
const SEASON_WINTER_REGEX = /talvi|untuva|vinter|winter/;
const SEASON_TOPPA_GARMENTS = new Set<GarmentType>(["takki", "haalari", "kengät"]);
// Sanat jotka "ei ..." -rakenteessa eivät ole brändejä ("ei liian kallis").
const NOT_BRAND_WORDS = new Set(["liian", "kovin", "kovinkaan", "yhtään", "mitään", "mikään", "ollenkaan", "paljon", "tosi", "hirveän", "mitenkään", "välttämättä", "ihan", "aivan", "vielä", "tarvitse", "pakko", "vain", "vaan", "sitä", "sen", "tämä", "nämä", "joku", "jokin", "kallis", "kallista", "halpa", "iso", "pieni", "för", "så", "mycket", "alltför", "någon", "något", "dyr", "dyra", "billig", "too", "very", "so", "any", "more", "really", "the", "that", "this", "expensive", "cheap", "big", "small", "waterproof", "just", "only", "one", "other", "than"]);

function findGarmentType(text: string): GarmentType | undefined {
  // Ruotsin- ja englanninkieliset sanat sanarajoilla ensin; sitten vanha osamerkkijonolista.
  const svEn = findGarmentSvEn(text);
  if (svEn) return svEn;
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [GarmentType, string[]][]) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return undefined;
}
function findGender(text: string): "tyttö" | "poika" | "unisex" | undefined {
  const svEn = findGenderSvEn(text);
  if (svEn) return svEn;
  for (const [gender, keywords] of Object.entries(GENDER_KEYWORDS) as ["tyttö" | "poika" | "unisex", string[]][]) {
    if (keywords.some((kw) => text.includes(kw))) return gender;
  }
  return undefined;
}
// --- Hintaraja (fi, sv, en) ---------------------------------------------------------
// Valuutta: EUR = €, eur, euro(a/n/on/s), e; SEK = kr, kronor, krona, sek, ":-".
const CUR = "(?:(?<eur>€|euro(?:a|n|on|s)?|eur|e)|(?<sek>kr|kronor|krona|sek|:-))(?![\\p{L}])";
const AMOUNT = "(\\d+(?:[.,]\\d+)?)";
const LEAD_ANY =
  "(?:max\\.?|maks\\.?|maksimissaan|maksimissa|maksimi(?:hinta)?|korkeintaan|enintään|alle|budjetti(?:na|ni|ksi)?|hintaraja(?:na)?|ylärajana|" +
  "maximalt|maxpris|högst|under|upp\\s+till|som\\s+mest|budget(?:\\s+of|\\s+is)?|" +
  "maximum|below|up\\s+to|less\\s+than|at\\s+most|no\\s+more\\s+than|within)";
const LEAD_EXPLICIT =
  "(?:max\\.?|maks\\.?|maksimissaan|maksimissa|korkeintaan|enintään|budjetti(?:na|ni|ksi)?|hintaraja(?:na)?|maximalt|maxpris|högst|budget|maximum)";
const PRICE_LEAD = new RegExp(`(?<!\\p{L})${LEAD_ANY}\\s*(?::|on|noin|n\\.|is|of)?\\s*${AMOUNT}\\s*${CUR}`, "iu");
const PRICE_SYMBOL = new RegExp(`(?<!\\p{L})${LEAD_ANY}\\s*€\\s*${AMOUNT}`, "iu");
const PRICE_TRAIL = new RegExp(
  `${AMOUNT}\\s*${CUR}\\s*(?:asti|saakka|tai\\s+alle|korkeintaan|enintään|maksimissaan|max|eller\\s+(?:mindre|lägre|billigare)|or\\s+(?:less|under|below)|at\\s+most)(?!\\p{L})`, "iu");
// "max 80" ilman valuuttaa, kun perässä ei ole kirjainta/yksikköä ("korkeintaan 3 paria", "max 6-vuotiaalle").
const PRICE_BARE = new RegExp(`(?<!\\p{L})${LEAD_EXPLICIT}\\s*${AMOUNT}(?!\\d|[.,]\\d|\\s*[\\p{L}%-])`, "iu");

function findMaxPrice(text: string, bareCurrency: Currency) {
  const m = text.match(PRICE_LEAD) ?? text.match(PRICE_TRAIL);
  if (m) {
    const amount = parseFloat(m[1].replace(",", "."));
    const currency: Currency = m.groups?.sek ? "SEK" : "EUR";
    return amount > 0 ? { amount, currency } : undefined;
  }
  const sym = text.match(PRICE_SYMBOL);
  if (sym) {
    const amount = parseFloat(sym[1].replace(",", "."));
    return amount > 0 ? { amount, currency: "EUR" as const } : undefined;
  }
  const bare = text.match(PRICE_BARE);
  if (bare) {
    const amount = parseFloat(bare[1].replace(",", "."));
    return amount > 0 ? { amount, currency: bareCurrency } : undefined;
  }
  return undefined;
}

// --- Koko ja ikä ------------------------------------------------------------------------
function monthSize(text: string): { size_raw: string; size_cm: number } | undefined {
  const patterns = [
    /(?<!\d)(\d{1,2})\s*-?\s*(?:kk|kuukau\p{L}*|kuinen|kuis\p{L}*)(?!\p{L})/u,
    ...MONTH_PATTERNS,
  ];
  for (const rx of patterns) {
    const m = text.match(rx);
    if (!m) continue;
    const months = parseInt(m[1], 10);
    if (months >= 1 && months <= 36) {
      const cm = monthsToCm(months);
      return { size_raw: String(cm), size_cm: cm };
    }
  }
  return undefined;
}
function findSize(text: string, garmentType?: GarmentType): { size_raw?: string; size_cm?: number; age?: number } {
  const cmMatch = text.match(/(\d{2,3})\s*(?:cm|sentti\p{L}*)/u);
  if (cmMatch) return { size_raw: cmMatch[1], size_cm: parseInt(cmMatch[1], 10) };
  // "storlek 116", "size 116", "koko 116"; kengillä 2-numeroinen luku on EU-koko.
  const sw = findSizeWord(text);
  if (sw !== undefined) {
    if (sw >= 44 && sw <= 190) return { size_raw: String(sw), size_cm: sw };
    if (garmentType === "kengät" && sw >= 18 && sw <= 45) {
      const cm = cmForShoeEu(sw);
      return { size_raw: String(cm), size_cm: cm };
    }
  }
  // Kuukaudet (vauvat) ennen ikävuosia: "6 kk", "6 månader", "6 months" -> vauvakoko, ei ikä.
  const months = monthSize(text);
  if (months) return months;
  const agePatterns = [
    /(?<!\d)(\d{1,2})[\s-]?(?:vuotia\p{L}*|vuotta|vuoden|v)(?!\p{L})/u,
    ...AGE_PATTERNS,
  ];
  for (const rx of agePatterns) {
    const m = text.match(rx);
    if (!m) continue;
    const age = parseInt(m[1], 10);
    // 0 ja yli 17 -vuotiaat eivät ole lapsihaun ikiä - ei tulkita kokona.
    if (age >= 1 && age <= 17) {
      const cm = AGE_TO_CM[age];
      return { size_raw: String(cm), size_cm: cm, age };
    }
  }
  return {};
}
// Kieltosanat: fi "ei (halua)", sv "inte/ej/utan (ha)", en "not/no/without".
const BRAND_DENY_RE = /(?<![\p{L}])(?:ei|inte|ej|utan|not|no|without)\s+(?:(?:halua|ha|vill\s+ha|want|wanting)\s+)?([A-Za-zäöåÄÖÅ]+)/giu;
function findBrandDeny(rawText: string): string[] {
  const denyMatches = [...rawText.matchAll(BRAND_DENY_RE)];
  return denyMatches
    .map((m) => m[1])
    .filter((w) => w.length > 2 && !["ole", "voi", "saa", "ett", "att", "and", "but", "for", "are", "was"].includes(w.toLowerCase()) && !NOT_BRAND_WORDS.has(w.toLowerCase()))
    // Brändi = isolla alkukirjaimella kirjoitettu tai tunnettu brändi.
    .filter((w) => /^[A-ZÄÖÅ]/.test(w) || isKnownBrandWord(w))
    .map((w) => w.toLowerCase());
}

export function parseCriteriaFromText(rawText: string, hint: { lang?: Lang } = {}): SearchCriteria {
  // Lukusanat numeroiksi (puhehaku): ikä, kuukaudet, koko ja hinta.
  const text = normalizeNumberWords(rawText.toLowerCase());
  const criteria: SearchCriteria = {};
  // Valuutta ilman valuuttamerkintää ("max 400"): ruotsinkielisessä haussa kruunu.
  const detected = detectLanguage(text);
  const swedish = detected === "sv" || (detected === "fi" && hint.lang === "sv");
  const bareCurrency: Currency = swedish ? "SEK" : "EUR";
  const garmentType = findGarmentType(text);
  if (garmentType) criteria.garment_type = garmentType;
  const maxPrice = findMaxPrice(text, bareCurrency);
  if (maxPrice) criteria.max_price = maxPrice;
  if (WATERPROOF_KEYWORDS.some((kw) => text.includes(kw))) criteria.waterproof = true;
  const materialMatches = MATERIAL_KEYWORDS.filter((kw) => new RegExp(`\\b${kw}`, "i").test(text));
  if (materialMatches.length > 0) criteria.material_keywords = materialMatches;
  if (VEST_QUERY_RE.test(text)) criteria.vest = true;
  const gender = findGender(text);
  if (gender) criteria.child_gender_pref = gender;
  if (CHILD_SIGNAL_KEYWORDS.some((kw) => text.includes(kw)) || hasChildSignalSvEn(text)) criteria.child_signal = true;
  const color = findColor(text);
  if (color) criteria.color = color;
  const { size_raw, size_cm, age } = findSize(text, garmentType);
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
