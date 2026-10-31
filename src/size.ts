// Koko- ja ikälogiikka: ikä -> senttimetrit, tuotteen kokomerkintöjen tulkinta
// väleinä (esim. "158/164", "13-14 yr", "XS") ja sopivuuden arviointi.

export const AGE_TO_CM: Record<number, number> = {
  0: 80, 1: 86, 2: 92, 3: 98, 4: 104, 5: 110, 6: 116, 7: 122, 8: 128, 9: 134,
  10: 140, 11: 146, 12: 152, 13: 158, 14: 164, 15: 170, 16: 176, 17: 176,
};

// Kengät: karkea pituus -> EU-koko (lasten merkkien kokotaulukoiden mukaan).
const SHOE_EU_BY_CM: [number, number][] = [
  [86, 21], [92, 24], [98, 26], [104, 27], [110, 29], [116, 30], [122, 32],
  [128, 33], [134, 34], [140, 35], [146, 37], [152, 38], [158, 39], [164, 40],
  [170, 41], [176, 42],
];
function shoeEuForCm(cm: number): number {
  let best = SHOE_EU_BY_CM[0];
  for (const e of SHOE_EU_BY_CM) if (Math.abs(e[0] - cm) < Math.abs(best[0] - cm)) best = e;
  return best[1];
}

export type SizeToken =
  | { kind: "cm"; lo: number; hi: number }
  | { kind: "eu"; lo: number; hi: number }
  | { kind: "letters"; letters: string[] }
  | { kind: "unknown" };

function monthsToCm(m: number): number {
  return m <= 12 ? 56 + 2 * m : 80 + (m - 12);
}

const LETTER_RE = /^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-9]xl)$/;
const AGE_UNIT = "(?:y|yr|yrs|year|years|år|v|vuotta|vuotiaat)";

export function parseSizeToken(raw: string): SizeToken {
  let t = raw.trim().toLowerCase();
  if (!t) return { kind: "unknown" };

  // Värietuliite: "Black/Multi 28" -> "28" (Outnorth liittää värin kokoon).
  const colorPrefixed = t.match(/^[^\d]*[a-zåäö][^\d]*\s(\d{2,3}(?:[.,]5)?(?:\s*[\/-]\s*\d{2,3})?)$/);
  if (colorPrefixed && !/^(?:eu|uk|us)\b/.test(t)) t = colorPrefixed[1];

  // Puolikoot: "28.5", "40,5" -> pyöristetään alas-ylös ([n, n+1]).
  const half = t.match(/^(?:eu\s*)?(\d{2})[.,]5$/);
  if (half) {
    const n = parseInt(half[1], 10);
    if (n >= 15 && n <= 47) return { kind: "eu", lo: n, hi: n + 1 };
  }
  // "40 2/3", "38 1/2" -> perusluku
  const frac = t.match(/^(\d{2})\s+\d\/\d$/);
  if (frac) t = frac[1];

  // Kuukausikoot (vauvat), esim. "9-12 months", "0-6 m", "12 kk": karkea pituus.
  const months = t.match(/\b(\d{1,2})\s*(?:-|–|\/)?\s*(\d{1,2})?\s*(?:m|mo|mos|months?|mån|kk)\b/);
  if (months) {
    const a = parseInt(months[1], 10);
    const b = months[2] ? parseInt(months[2], 10) : a;
    return { kind: "cm", lo: monthsToCm(Math.min(a, b)), hi: monthsToCm(Math.max(a, b)) };
  }

  // Ikäväli, esim. "13-14 yr", "5-8Y", "6-8 år"
  const ageRange = t.match(new RegExp(`(\\d{1,2})\\s*(?:-|–|/)\\s*(\\d{1,2})\\s*${AGE_UNIT}\\b`));
  if (ageRange) {
    const a = parseInt(ageRange[1], 10), b = parseInt(ageRange[2], 10);
    if (a <= 17 && b <= 17 && a <= b) return { kind: "cm", lo: AGE_TO_CM[a], hi: AGE_TO_CM[b] };
  }
  const ageSingle = t.match(new RegExp(`(\\d{1,2})\\s*${AGE_UNIT}\\b`));
  if (ageSingle) {
    const a = parseInt(ageSingle[1], 10);
    if (a <= 17) return { kind: "cm", lo: AGE_TO_CM[a], hi: AGE_TO_CM[a] };
  }

  // Senttimetrit: "164", "158/164", "134-140 cm"
  const cmRange = t.match(/\b(\d{2,3})\s*(?:\/|-|–)\s*(\d{2,3})\b/);
  if (cmRange) {
    const a = parseInt(cmRange[1], 10), b = parseInt(cmRange[2], 10);
    if (a >= 44 && b <= 190 && a <= b) return { kind: "cm", lo: a, hi: b };
    if (a >= 15 && b <= 47 && a <= b) return { kind: "eu", lo: a, hi: b };
  }
  const single = t.match(/^(?:eu\s*)?(\d{2,3})(?:\s*cm)?$/);
  if (single) {
    const n = parseInt(single[1], 10);
    if (/eu/.test(t) && n >= 15 && n <= 47) return { kind: "eu", lo: n, hi: n };
    if (n >= 44 && n <= 190) return { kind: "cm", lo: n, hi: n };
    if (n >= 15 && n <= 43) return { kind: "eu", lo: n, hi: n };
  }

  // Kirjainkoot: "XS", "S/M", "XS-S"
  const parts = t.split(/[\/\-–\s]+/).filter(Boolean);
  if (parts.length > 0 && parts.every((x) => LETTER_RE.test(x))) return { kind: "letters", letters: parts };

  return { kind: "unknown" }; // "One Size" tms. - neutraali
}

// Aikuisten kirjainkoot, jotka sopivat nuorelle tietyn pituuden mukaan.
export function teenLetterSizes(cm: number): string[] {
  if (cm <= 158) return ["xxs", "xs"];
  if (cm <= 164) return ["xs", "s"];
  if (cm <= 170) return ["s"];
  return ["s", "m"];
}

export type SizeFit = "exact" | "smaller" | null;

function overlaps(lo: number, hi: number, a: number, b: number): boolean {
  return hi >= a && lo <= b;
}

export function tokenFit(tok: SizeToken, targetCm: number, isShoe: boolean): SizeFit {
  switch (tok.kind) {
    case "unknown": return "exact";
    case "letters":
      if (targetCm < 152) return null;
      return tok.letters.some((l) => teenLetterSizes(targetCm).includes(l)) ? "exact" : null;
    case "cm":
      if (isShoe) return null;
      // Sopiva: enintään 3 cm pienempi tai 9 cm (1,5 kokoa) suurempi kuin haettu.
      if (overlaps(tok.lo, tok.hi, targetCm - 3, targetCm + 9)) return "exact";
      if (overlaps(tok.lo, tok.hi, targetCm - 9, targetCm - 4)) return "smaller";
      return null;
    case "eu": {
      if (!isShoe) return null;
      const eu = shoeEuForCm(targetCm);
      if (overlaps(tok.lo, tok.hi, eu - 1, eu + 2)) return "exact";
      if (overlaps(tok.lo, tok.hi, eu - 3, eu - 2)) return "smaller";
      return null;
    }
  }
}

// Tuotteen paras sopivuus haettuun kokoon. Ei kokotietoa = hyväksytään.
// Tunnistamattomat merkinnät ("One Size") ovat neutraaleja vain jos tuotteella
// EI ole yhtään tulkittavaa kokoa - muuten ne eivät saa ohittaa kokosuodatinta.
export function productSizeFit(sizes: string[], targetCm: number, isShoe: boolean): SizeFit {
  if (sizes.length === 0) return "exact";
  const tokens = sizes.map(parseSizeToken);
  const known = tokens.filter((t) => t.kind !== "unknown");
  if (known.length === 0) return "exact";
  let best: SizeFit = null;
  for (const tok of known) {
    const fit = tokenFit(tok, targetCm, isShoe);
    if (fit === "exact") return "exact";
    if (fit === "smaller") best = "smaller";
  }
  return best;
}

// Suurin/pienin senttikoko tuotelistasta (viestejä varten, esim. "vain kokoon 152 asti").
export function sizeRangeCm(sizeLists: string[][]): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity;
  for (const list of sizeLists) {
    for (const s of list) {
      const t = parseSizeToken(s);
      if (t.kind === "cm") { min = Math.min(min, t.lo); max = Math.max(max, t.hi); }
    }
  }
  return min === Infinity ? null : { min, max };
}

// Kokotiedoton tuotteen (esim. Voghion) ikäväli otsikosta: "Ages 4-11",
// "for 3-8 years", "6-8Y". Palauttaa kokomerkinnän tai null.
export function inferSizeFromTitle(title: string): string[] {
  const m1 = title.match(/\bages?\s*(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/i);
  if (m1) return [`${m1[1]}-${m1[2]} yr`];
  const m2 = title.match(new RegExp(`\\b(\\d{1,2})\\s*(?:-|–|to)\\s*(\\d{1,2})\\s*${AGE_UNIT}\\b`, "i"));
  if (m2) return [`${m2[1]}-${m2[2]} yr`];
  return [];
}
