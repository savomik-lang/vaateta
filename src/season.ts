// Talvikäytön tunnistus tuotteen otsikosta/kategoriasta/kuvauksesta.
// true = selvästi talvituote, false = selvästi EI talvituote (sade, kuori,
// fleece, UV...), null = ei tiedossa.

const L = "\\p{L}";
const POSITIVE = new RegExp(
  `(?<!${L})(?:winter|vinter|talvi${L}*|toppa${L}*|untuva${L}*|padded|insulated|isolerad${L}*|eristetty|` +
  `down|dun|puffer|parka|thinsulate|primaloft|wadded|vadderad${L}*|täck${L}*|snow|ski|skid${L}*|` +
  `laskettelu${L}*|thermo${L}*)(?!${L})`, "iu");
const NEGATIVE = new RegExp(
  `(?<!${L})(?:rain${L}*|regn${L}*|sade${L}*|drizzle|shell|skal${L}*|fleece|softshell|uv${L}*|sun|sun-?proof|sun-?safe|sun-?protect${L}*|sol|summer|sommar|` +
  `kesä${L}*|windbreaker|tuuli${L}*|lightweight|thin|mid-?layer|base-?layer)(?!${L})`, "iu");

function classify(text: string): boolean | null {
  if (POSITIVE.test(text)) return true;
  if (NEGATIVE.test(text)) return false;
  return null;
}

// Otsikko ratkaisee ensin: kategorian tai kuvauksen "snow/ski"-tyyppinen sana ei saa
// kumota otsikon selvää vihjettä (esim. "Sunproof Overall", "Drizzle Jacket").
export function guessWinter(title: string, category?: string | null, description?: string | null): boolean | null {
  const byTitle = classify(title);
  if (byTitle !== null) return byTitle;
  const byCategory = category ? classify(category) : null;
  if (byCategory !== null) return byCategory;
  if (description && POSITIVE.test(description)) return true;
  return null;
}

// Vaatetyypit, joille talvirajaus on mielekäs (toppahousut ovat jo talvityyppi).
export const SEASON_FILTERED_GARMENTS = new Set(["takki", "haalari", "kengät"]);
