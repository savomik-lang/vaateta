// Suomen lukusanat (0-999) numeroiksi hakulauseessa. Puheentunnistus kirjoittaa
// iän, hinnan ja koon usein sanoina: "kuusivuotiaalle", "kahdeksankymmentä euroa".
//
// Muunnos tehdään vain ikä-, kuukausi-, hinta- ja senttiyhteydessä, jotta
// esim. "kuusi paria sukkia" tai "kuusi" (puu) eivät muutu numeroiksi.

const UNITS: Record<string, number> = {
  yksi: 1, yhden: 1, yhtä: 1,
  kaksi: 2, kahden: 2, kahta: 2,
  kolme: 3, kolmen: 3, kolmea: 3,
  neljä: 4, neljän: 4, neljää: 4,
  viisi: 5, viiden: 5, viittä: 5,
  kuusi: 6, kuuden: 6, kuutta: 6,
  seitsemän: 7, seitsemää: 7,
  kahdeksan: 8, kahdeksaa: 8,
  yhdeksän: 9, yhdeksää: 9,
};
const U = Object.keys(UNITS).sort((a, b) => b.length - a.length).join("|");
const TEEN_RE = new RegExp(`^(${U})toista$`, "u");
const TENS_RE = new RegExp(`^(${U})(?:kymmentä|kymmenen)(${U})?$`, "u");
const UNIT_RE = new RegExp(`^(${U})$`, "u");
const HUNDRED_RE = new RegExp(`^(?:(${U}))?(?:sata|sataa|sadan)(.*)$`, "u");

function under100(s: string): number | null {
  if (s === "kymmenen" || s === "kymmentä") return 10;
  let m = s.match(TEEN_RE);
  if (m) return 10 + UNITS[m[1]];
  m = s.match(TENS_RE);
  if (m) return UNITS[m[1]] * 10 + (m[2] ? UNITS[m[2]] : 0);
  m = s.match(UNIT_RE);
  if (m) return UNITS[m[1]];
  return null;
}

/** "kuusi" -> 6, "neljätoista" -> 14, "sataviisitoista" -> 115. Muuten null. */
export function parseFinnishNumber(word: string): number | null {
  const s = word.toLowerCase();
  if (!s) return null;
  const h = s.match(HUNDRED_RE);
  if (h) {
    const rest = h[2] === "" ? 0 : under100(h[2]);
    if (rest === null) return null;
    return (h[1] ? UNITS[h[1]] : 1) * 100 + rest;
  }
  return under100(s);
}

const SEP = "[\\s-]*";
// Lukusana alkaa sanan alusta; laiska \p{L}+? kattaa yhdyssanat ("kuusivuotiaalle").
const W = "(?<!\\p{L})(\\p{L}+?)";
const END = "(?!\\p{L})";

const HALF_RE = new RegExp(`(?<!\\p{L})(?:puolitoista|puolentoista)${SEP}(?:vuotia\\p{L}*|vuoden|vuotta|vuotias)${END}`, "giu");
const MONTH_RE = new RegExp(`${W}${SEP}(kuukau(?:den|tta|tis\\p{L}*|sia)|kuinen|kuis\\p{L}*)${END}`, "giu");
const YEAR_RE = new RegExp(`${W}${SEP}(vuotia\\p{L}*|vuotias|vuoden|vuotta|vanha\\p{L}*)${END}`, "giu");
const CM_RE = new RegExp(`${W}${SEP}(sentti\\p{L}*)${END}`, "giu");
const EUR_RE = new RegExp(`${W}${SEP}(euroa|euron|euroon|euro|eur)${END}`, "giu");

/**
 * Muuntaa lukusanat numeroiksi ikä-, kuukausi-, koko- ja hintayhteydessä:
 *   "kuusivuotiaalle" / "kuuden vuoden ikäiselle" -> "6-vuotiaalle"
 *   "puolitoistavuotiaalle", "kuusikuinen"        -> "18 kk", "6 kk"
 *   "sataviisitoista senttiä"                     -> "115 cm"
 *   "kahdeksankymmentä euroa"                     -> "80 €"
 */
export function normalizeNumberWords(text: string): string {
  let t = text;
  t = t.replace(HALF_RE, "18 kk");
  t = t.replace(MONTH_RE, (m, w: string) => {
    const n = parseFinnishNumber(w);
    return n !== null && n >= 1 && n <= 36 ? `${n} kk` : m;
  });
  t = t.replace(YEAR_RE, (m, w: string) => {
    const n = parseFinnishNumber(w);
    return n !== null && n >= 1 && n <= 17 ? `${n}-vuotiaalle` : m;
  });
  t = t.replace(CM_RE, (m, w: string) => {
    const n = parseFinnishNumber(w);
    return n !== null && n >= 44 && n <= 190 ? `${n} cm` : m;
  });
  t = t.replace(EUR_RE, (m, w: string) => {
    const n = parseFinnishNumber(w);
    return n !== null && n >= 1 ? `${n} €` : m;
  });
  return t;
}
