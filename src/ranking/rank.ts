import { Product } from "../types";
import { toEur } from "../currency";
import { compareBrandTier, getBrandTier } from "./brand-tiers";
import { hasQualitySignal } from "./quality-signals";
import { FitContext, byFitThenPrice, fitScore, fitTier } from "./fit";

export interface RankedResults {
  cheapest: Product[];
  bestValue: Product[];
  mostLoved: Product[] | null;
  // Sopivimmat: ensisijainen tuloslista. Kokohaussa koon mukaan, muuten
  // hakurajausten, laadun ja arvioiden mukaan (ks. criteriaMatch).
  bestMatch?: Product[];
}
const TOP_N = 5;
const BRAND_BONUS: Record<string, number> = { premium: 4, perus: 2, budjetti: 0 };

// Sopivuuspisteet, kun kokoa ei tiedetä: hakurajausten osumat (fitScore:
// sukupuoli, talvi, vedenpitävyys, markkina, saatavuus) + laatumerkit,
// tunnettu merkki ja hyvät arviot. Hinta ratkaisee tasatilanteet.
export function criteriaScore(p: Product, ctx: FitContext): number {
  let score = fitScore(p, ctx);
  if (hasQualitySignal(p)) score += 4;
  score += BRAND_BONUS[getBrandTier(p.brand)] ?? 0;
  if (typeof p.rating === "number" && p.rating >= 4 && (p.rating_count ?? 0) >= 3) score += 2;
  return score;
}

// Sopivimmat ilman kokoa. Kallein kolmannes jätetään pois (kun tuotteita on
// riittävästi), jotta laatupisteet eivät nosta listaa pelkkiin kalleimpiin.
export function criteriaMatch(products: Product[], ctx: FitContext): Product[] {
  let pool = products;
  if (products.length >= TOP_N * 2) {
    const byPrice = [...products].sort((a, b) => toEur(a.price) - toEur(b.price));
    pool = byPrice.slice(0, Math.ceil(byPrice.length * 2 / 3));
  }
  return [...pool].sort((a, b) => {
    const d = criteriaScore(b, ctx) - criteriaScore(a, ctx);
    return d !== 0 ? d : toEur(a.price) - toEur(b.price);
  }).slice(0, TOP_N);
}

export function rankResults(products: Product[], ctx?: FitContext): RankedResults {
  // Kokohaussa halvin- ja bestValue-listat poimitaan ensisijaisesti hyvin
  // istuvista tuotteista (tier A/B), jos niitä on tarpeeksi.
  let pool = products;
  let bestMatch: Product[] | undefined;
  if (ctx && ctx.targetCm !== undefined) {
    const good = products.filter((p) => fitTier(p, ctx) !== "C");
    if (good.length >= TOP_N) pool = good;
    bestMatch = [...products].sort(byFitThenPrice(ctx)).slice(0, TOP_N);
  } else if (ctx && products.length > 0) {
    bestMatch = criteriaMatch(products, ctx);
  }
  const cheapest = [...pool].sort((a, b) => toEur(a.price) - toEur(b.price)).slice(0, TOP_N);
  const bestValue = computeBestValue(pool);
  const ratedProducts = products.filter((p) => p.rating !== null);
  const mostLoved = ratedProducts.length >= 3
    ? [...ratedProducts].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, TOP_N)
    : null;
  return { cheapest, bestValue, mostLoved, ...(bestMatch ? { bestMatch } : {}) };
}

export function computeBestValue(products: Product[]): Product[] {
  if (products.length === 0) return [];
  const sortedByPrice = [...products].sort((a, b) => toEur(a.price) - toEur(b.price));
  const cheapestThirdCount = Math.max(1, Math.ceil(sortedByPrice.length / 3));
  const cheapestThird = sortedByPrice.slice(0, cheapestThirdCount);
  const withQualitySignal = cheapestThird.filter(hasQualitySignal);
  const candidates = [...withQualitySignal];
  if (candidates.length < TOP_N) {
    const alreadyIncluded = new Set(candidates.map((p) => p.id));
    for (const p of cheapestThird) {
      if (candidates.length >= TOP_N) break;
      if (!alreadyIncluded.has(p.id)) candidates.push(p);
    }
  }
  return candidates.sort((a, b) => {
    const tierDiff = compareBrandTier(a.brand, b.brand);
    return tierDiff !== 0 ? tierDiff : toEur(a.price) - toEur(b.price);
  }).slice(0, TOP_N);
}
