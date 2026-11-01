// Värit: haun väri on aina suomenkielinen perusmuoto (musta, sininen ...), jonka UI kääntää.
// Haussa tunnistetaan myös ruotsin- ja englanninkieliset värisanat. Tuotteiden värit ovat
// feedissä englanniksi ("Black", "Lava Red", "Navy Blue/Solid Dark Grey"), joten suodatus
// vertaa perusväriä tuotteen värin synonyymeihin.

export const COLOR_KEYWORDS = ["musta", "sininen", "punainen", "vihreä", "keltainen", "vaaleanpunainen", "harmaa", "valkoinen", "ruskea", "oranssi"];

// Hakusanat (sv, en) -> perusväri. Suomen sanat tunnistetaan osamerkkijonona (taivutukset).
const QUERY_WORDS: Record<string, string[]> = {
  musta: ["svart", "svarta", "black"],
  sininen: ["blå", "blått", "blåa", "marinblå", "blue", "navy"],
  punainen: ["röd", "rött", "röda", "red"],
  vihreä: ["grön", "grönt", "gröna", "green"],
  keltainen: ["gul", "gult", "gula", "yellow"],
  vaaleanpunainen: ["rosa", "ljusrosa", "pink"],
  harmaa: ["grå", "grått", "gråa", "grey", "gray"],
  valkoinen: ["vit", "vitt", "vita", "white"],
  ruskea: ["brun", "brunt", "bruna", "brown"],
  oranssi: ["orange"],
};

// Tuotteen värin synonyymit (pienillä kirjaimilla). Lyhyet sanat (<= 3 merkkiä) vain kokonaisina sanoina.
const PRODUCT_WORDS: Record<string, string[]> = {
  musta: ["musta", "black", "svart", "jet"],
  sininen: ["sininen", "blue", "blå", "navy", "denim"],
  punainen: ["punainen", "red", "röd", "burgundy"],
  vihreä: ["vihreä", "green", "grön", "olive", "moss", "khaki"],
  keltainen: ["keltainen", "yellow", "gul", "mustard"],
  vaaleanpunainen: ["vaaleanpunainen", "pink", "rosa", "rose", "blush"],
  harmaa: ["harmaa", "grey", "gray", "grå", "anthracite", "charcoal"],
  valkoinen: ["valkoinen", "white", "vit", "offwhite", "off-white", "cream"],
  ruskea: ["ruskea", "brown", "brun", "chocolate"],
  oranssi: ["oranssi", "orange", "rust"],
};

const wordRe = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "iu");
const QUERY_RES: [string, RegExp][] = Object.entries(QUERY_WORDS).flatMap(([color, words]) =>
  words.map((w) => [color, wordRe(w)] as [string, RegExp]));

/** Perusväri hakutekstistä (suomi osamerkkijonona, sv/en sanarajoilla). */
export function findColor(text: string): string | undefined {
  const fi = COLOR_KEYWORDS.find((c) => text.includes(c));
  if (fi) return fi;
  for (const [color, rx] of QUERY_RES) if (rx.test(text)) return color;
  return undefined;
}

/** Sopiiko tuotteen väri ("Navy Blue/Solid Dark Grey") haettuun perusväriin ("sininen")? */
export function colorMatches(productColor: string, wanted: string): boolean {
  const words = PRODUCT_WORDS[wanted.toLowerCase()];
  const pc = productColor.toLowerCase();
  if (!words) return pc === wanted.toLowerCase();
  return words.some((w) => (w.length <= 3 ? wordRe(w).test(pc) : pc.includes(w)));
}
