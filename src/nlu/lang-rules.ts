import { GarmentType } from "../types";

// ---------------------------------------------------------------------------
// Ruotsin- ja englanninkieliset hakusäännöt (sääntöparserin laajennus).
//
// Tarkoituksella erillään GARMENT_KEYWORDS-listasta: se on osamerkkijonohaku ja
// palvelee myös tuotteiden luokittelua (esim. "hat" osuisi sanoihin "that" ja
// "what"). Tässä käytetään sanarajoja; ruotsin yhdyssanoissa ("vinterjacka")
// pääte riittää ilman alkurajaa.
// ---------------------------------------------------------------------------

const B = "(?<!\\p{L})";   // sanan alku
const E = "(?!\\p{L})";    // sanan loppu

function re(src: string): RegExp {
  return new RegExp(src, "iu");
}

// Järjestys ratkaisee (ensimmäinen osuma voittaa): erikoisempi ennen yleistä.
// "strumpbyxor" (sukkahousut) sukat ennen housut; "badbyxor" uimapuku ennen housut.
export const SV_EN_GARMENTS: [GarmentType, RegExp][] = [
  // kerrasto ensin: "base layer pants" ei ole housut.
  ["kerrasto", re(`underställ\\p{L}*|${B}base\\s*-?\\s*layers?${E}`)],
  ["kurahousut", re(`regnbyx(?:or|a|an|orna)${E}|${B}rain\\s*(?:pants|trousers|bibs|overtrousers)${E}|${B}waterproof\\s+(?:pants|trousers)${E}`)],
  ["toppahousut", re(
    `vinterbyx\\p{L}*|termobyx\\p{L}*|[öo]verdragsbyx\\p{L}*|skidbyx\\p{L}*|täckbyx\\p{L}*|` +
    `${B}(?:snow|ski)\\s*(?:pants|trousers|bibs)${E}|${B}(?:winter|insulated)\\s+(?:pants|trousers)${E}|${B}salopettes?${E}`)],
  ["sukat", re(`strump(?:or|byxor|a)${E}|${B}(?:socks?|tights|stockings)${E}`)],
  ["uimapuku", re(`baddräkt\\p{L}*|badbyx\\p{L}*|badshorts|swim\\s*shorts|board\\s*shorts|uimashorts\\p{L}*|uimahousu\\p{L}*|simdräkt\\p{L}*|bikini\\p{L}*|${B}(?:swimsuits?|swimwear|swim\\s*trunks|bathing\\s*suits?|swimming\\s*costumes?)${E}`)],
  ["housut", re(`byx(?:or|a|an|orna)${E}|${B}(?:pants|trousers|jeans|leggings|joggers|sweatpants|trackpants|shorts)${E}|${B}jeans`)],
  ["kengät", re(
    `skor${E}|${B}sko${E}|stövl\\p{L}*|kängor${E}|${B}känga${E}|sandaler|tofflor|` +
    `${B}(?:shoes?|boots?|wellies|wellingtons|sneakers?|trainers|sandals?|slippers|gymp\\p{L}*)${E}`)],
  ["takki", re(`jack(?:a|an|or|orna)${E}|${B}(?:jackets?|coats?|parkas?|anoraks?|windbreakers?|raincoats?|puffers?)${E}|${B}parkas?${E}|` +
    `${B}(?:väst(?:en|ar|arna)?|vests?|waistcoats?|gilets?|body\\s?warmers?)${E}`)],
  ["paita", re(`tröj(?:a|an|or|orna)${E}|${B}skjorta|sweatshirt|${B}(?:shirts?|t-?shirts?|hoodies?|sweaters?|sweatshirts?|jumpers?|pullovers?)${E}`)],
  ["haalari", re(`overall\\p{L}*|regnställ|skalställ|${B}shell\\s*suits?${E}|${B}(?:snowsuits?|overalls?|jumpsuits?|coveralls?|rain\\s*suits?|ski\\s*suits?)${E}`)],
  ["mekko", re(`klänning\\p{L}*|${B}(?:dress|dresses|gowns?)${E}`)],
  ["body", re(`${B}(?:bodys?|bodies|bodysuits?|rompers?)${E}`)],
  ["pyjama", re(`pyjamas\\p{L}*|nattkläder|${B}(?:pyjamas?|pajamas?|pjs|sleepwear|nightwear)${E}`)],
  ["pipo", re(`mössa\\p{L}*|mössor|solhatt\\p{L}*|${B}hatt(?:en|ar)?${E}|${B}keps(?:en|ar)?${E}|balaklava\\p{L}*|${B}(?:beanies?|hats?|caps?|sun\\s*hats?|balaclavas?)${E}`)],
  ["lapaset", re(`vantar${E}|handskar|fingervantar|tumvantar|${B}(?:gloves?|mittens?)${E}`)],
];

// Liivi: haetaan takkina, mutta liivit sisältävä haku merkitään erikseen (vest).
export const VEST_QUERY_RE = re(`väst(?:en|ar|arna)?${E}|liivi\\p{L}*|${B}(?:vests?|waistcoats?|gilets?|body\\s?warmers?)${E}`);
export const VEST_GARMENT_RE = re(`${B}(?:väst(?:en|ar|arna)?|vests?|waistcoats?|gilets?|body\\s?warmers?)${E}`);

export function findGarmentSvEn(text: string): GarmentType | undefined {
  for (const [type, rx] of SV_EN_GARMENTS) if (rx.test(text)) return type;
  return undefined;
}

// --- Sukupuoli ja lapsi --------------------------------------------------------------
const GIRL_RE = re(`${B}(?:dott(?:er|ern|erns)|flick(?:a|an|or|orna)|tjej(?:en|er|erna)?|girls?|daughters?)${E}`);
const BOY_RE = re(`${B}(?:son(?:en|ens)?|pojk(?:e|en|ar|arna)|kille(?:n|r|rna)?|grabb(?:en|ar)?|boys?|sons?)${E}`);
export function findGenderSvEn(text: string): "tyttö" | "poika" | undefined {
  if (GIRL_RE.test(text)) return "tyttö";
  if (BOY_RE.test(text)) return "poika";
  return undefined;
}

const CHILD_RE = re(`${B}(?:barn(?:et|en|ens|s)?|bebis(?:ar)?|småbarn|spädbarn|kids?|child|children|toddlers?|babies|baby|infants?)${E}`);
export function hasChildSignalSvEn(text: string): boolean {
  return CHILD_RE.test(text) || GIRL_RE.test(text) || BOY_RE.test(text);
}

export const WATERPROOF_SV_EN = ["vattentät", "waterproof", "water-proof"];

// --- Koko ja ikä ---------------------------------------------------------------------
// "storlek 116", "stl 116", "size 116", "koko 116". Vain 2-3 numeroa (cm tai kenkien EU-koko).
const SIZE_WORD_RE = re(`${B}(?:storlek|stl|strl|size|sz|koko)\\.?\\s*[:=]?\\s*(\\d{2,3})(?!\\d)`);
export function findSizeWord(text: string): number | undefined {
  const m = text.match(SIZE_WORD_RE);
  return m ? parseInt(m[1], 10) : undefined;
}

// Ikä: ruotsi "6 år", "6-åring", "6 års", "6-årig"; englanti "6 year old", "6-year-old",
// "6 yo", "6 years", "age 6". Lukusanat on muunnettu numeroiksi jo ennen tätä (numbers.ts).
export const AGE_PATTERNS: RegExp[] = [
  re(`(?<!\\d)(\\d{1,2})\\s*-?\\s*(?:åring\\p{L}*|årig\\p{L}*|års?)${E}`),
  re(`(?<!\\d)(\\d{1,2})\\s*-?\\s*(?:years?|yrs?|yo|y\\/o|y)(?:\\s*-?\\s*old)?${E}`),
  re(`${B}(?:aged?|ages)\\s+(\\d{1,2})(?!\\d|\\s*[-–]\\s*\\d)`),
];

// Ikä lauseyhteydestä, vain kun haussa on lapsisignaali: "dotter som är 6", "daughter is 6",
// "who is 6", "joka on 6". Luku saa olla enintään kaksinumeroinen eikä sen perässä yksikköä tai valuuttaa.
const NO_UNIT = "(?!\\d|[.,]\\d|\\s*(?:cm|kr|kronor|sek|€|eur|euro\\p{L}*|%|:-))";
export const AGE_CONTEXT_PATTERNS: RegExp[] = [
  re(`${B}(?:som\\s+)?(?:är|blir|fyller)\\s+(\\d{1,2})${NO_UNIT}`),
  re(`${B}(?:who\\s+is|who's|(?:she|he)\\s+is|turns|turning|will\\s+be|(?:daughter|son|child|kid|girl|boy|toddler)\\s+is)\\s+(\\d{1,2})${NO_UNIT}`),
  re(`${B}(?:joka\\s+on|täyttää)\\s+(\\d{1,2})${NO_UNIT}`),
];

// Kuukaudet (vauvat): "6 månader", "6 mån", "6 months", "6 mo".
export const MONTH_PATTERNS: RegExp[] = [
  re(`(?<!\\d)(\\d{1,2})\\s*-?\\s*(?:månad\\p{L}*|mån)${E}`),
  re(`(?<!\\d)(\\d{1,2})\\s*-?\\s*(?:months?|mths?|mos?)(?:\\s*-?\\s*old)?${E}`),
];
