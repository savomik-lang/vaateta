import { Product, SearchCriteria } from "../types";
import { toEur } from "../currency";
import { parseSizeToken, shoeEuForCm, teenLetterSizes } from "../size";
import { targetSizeCm, isTeenSearch } from "../adapters/multi-store-adapter";

// ---------------------------------------------------------------------------
// "Paras sopivuus": kuinka hyvin tuote vastaa haettua kokoa ja muita
// kriteereitä. Käytetään (1) bestMatch-listaan ja (2) siihen, että halvin- ja
// bestValue-listat poimitaan ensisijaisesti hyvin istuvista tuotteista.
// ---------------------------------------------------------------------------

export interface FitContext {
  targetCm?: number;
  isShoe: boolean;
  teen: boolean;
  genderPref?: "tyttö" | "poika" | "unisex";
  winter?: boolean;
  waterproof?: boolean;
  // Kävijän markkina: SE-kävijälle Ruotsin kaupan tuotteet hieman ylemmäs (tasatilanteissa).
  preferMarket?: "SE";
}

export function fitContextFromCriteria(c: SearchCriteria, viewerMarket?: "FI" | "SE" | "other"): FitContext {
  return {
    ...(viewerMarket === "SE" ? { preferMarket: "SE" as const } : {}),
    targetCm: targetSizeCm(c),
    isShoe: c.garment_type === "kengät",
    teen: isTeenSearch(c),
    genderPref: c.child_gender_pref,
    winter: c.season === "winter",
    waterproof: c.waterproof,
  };
}

const TEEN_TITLE = /\b(teen|teens|teenager|youth|junior|juniors|big kids?|older kids?|nuoret|nuorten|ungdom)\b/i;

function gap(lo: number, hi: number, a: number, b: number): number {
  if (hi < a) return a - hi;
  if (lo > b) return lo - b;
  return 0;
}

// Koko-sakko: 0 = tuotteella on koko juuri sopivalla "varaslotilla"
// (vaate: haettu..haettu+6 cm eli ei liian pieni mutta kasvunvaraa; kenkä:
// haettu EU..+1). Isompi = kauempana. Ei tulkittavaa kokoa = 2.
export function sizePenalty(sizes: string[], ctx: FitContext): number {
  if (ctx.targetCm === undefined) return 0;
  const tokens = sizes.map(parseSizeToken).filter((t) => t.kind !== "unknown");
  if (tokens.length === 0) return 2;
  let best = Infinity;
  for (const t of tokens) {
    let pen = Infinity;
    if (t.kind === "cm" && !ctx.isShoe) pen = gap(t.lo, t.hi, ctx.targetCm, ctx.targetCm + 6) / 3;
    else if (t.kind === "eu" && ctx.isShoe) {
      const eu = shoeEuForCm(ctx.targetCm);
      pen = gap(t.lo, t.hi, eu, eu + 1);
    } else if (t.kind === "letters" && !ctx.isShoe) {
      pen = t.letters.some((l) => teenLetterSizes(ctx.targetCm!).includes(l)) ? 0 : 4;
    }
    best = Math.min(best, pen);
  }
  return best === Infinity ? 4 : best;
}

export function fitScore(p: Product, ctx: FitContext): number {
  let score = 100;
  score -= Math.min(8, sizePenalty(p.size_available, ctx)) * 10;
  if (!p.in_stock) score -= 25;
  if (ctx.teen && ctx.targetCm !== undefined && ctx.targetCm >= 152 && TEEN_TITLE.test(p.title)) score += 8;
  if (ctx.genderPref && ctx.genderPref !== "unisex") score += p.gender === ctx.genderPref ? 5 : 0;
  if (ctx.winter && p.winter === true) score += 3;
  if (ctx.waterproof && p.waterproof === true) score += 2;
  if (ctx.preferMarket && p.market === ctx.preferMarket) score += 3;
  // Karkea alennusbonus (ei saa ohittaa sopivuutta tai hintajärjestystä tasatilanteissa).
  if (p.discount_percent) score += p.discount_percent >= 30 ? 2 : p.discount_percent >= 15 ? 1 : 0;
  return score;
}

// A = juuri sopiva koko, B = lähellä / koko tuntematon, C = heikko osuma.
export function fitTier(p: Product, ctx: FitContext): "A" | "B" | "C" {
  if (ctx.targetCm === undefined) return "A";
  const pen = sizePenalty(p.size_available, ctx);
  return pen === 0 ? "A" : pen <= 2 ? "B" : "C";
}

export function byFitThenPrice(ctx: FitContext) {
  return (a: Product, b: Product) => {
    const d = fitScore(b, ctx) - fitScore(a, ctx);
    return d !== 0 ? d : toEur(a.price) - toEur(b.price);
  };
}

// --- Värivaihtoehtojen yhdistäminen ----------------------------------------

export function baseTitle(p: Product): string {
  let t = p.title.trim();
  const c = p.color?.trim();
  if (c && t.toLowerCase().endsWith(c.toLowerCase())) t = t.slice(0, t.length - c.length).trim();
  return t.toLowerCase();
}

// Sama tuote samassa kaupassa samalla hinnalla eri väreissä -> yksi rivi.
// Edustajaksi valitaan parhaiten istuva (sitten halvin) variantti, ja
// värivaihtoehdot kerrotaan color_count / other_colors -kentissä.
export function dedupeColorVariants(products: Product[], ctx?: FitContext): Product[] {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = `${p.source}|${p.brand.toLowerCase()}|${baseTitle(p)}|${p.price.currency}${p.price.amount}`;
    const list = groups.get(key);
    if (list) list.push(p); else groups.set(key, [p]);
  }
  const cmp = ctx ? byFitThenPrice(ctx) : (a: Product, b: Product) => toEur(a.price) - toEur(b.price);
  const out: Product[] = [];
  for (const variants of groups.values()) {
    if (variants.length === 1) { out.push(variants[0]); continue; }
    const sorted = [...variants].sort(cmp);
    const rep = sorted[0];
    const colors = Array.from(new Set(variants.map((v) => v.color).filter((c): c is string => !!c)));
    const others = colors.filter((c) => c !== rep.color);
    out.push(colors.length > 1 ? { ...rep, color_count: colors.length, other_colors: others } : rep);
  }
  return out;
}
