import { Product } from "../types";
import { toEur } from "../currency";
import { compareBrandTier } from "./brand-tiers";
import { hasQualitySignal } from "./quality-signals";
import { FitContext, byFitThenPrice, fitTier } from "./fit";

export interface RankedResults {
  cheapest: Product[];
  bestValue: Product[];
  mostLoved: Product[] | null;
  // Parhaiten haettuun kokoon ja kriteereihin sopivat (vain kokohauissa).
  bestMatch?: Product[];
}
const TOP_N = 5;

export function rankResults(products: Product[], ctx?: FitContext): RankedResults {
  // Kokohaussa halvin- ja bestValue-listat poimitaan ensisijaisesti hyvin
  // istuvista tuotteista (tier A/B), jos niitä on tarpeeksi.
  let pool = products;
  let bestMatch: Product[] | undefined;
  if (ctx && ctx.targetCm !== undefined) {
    const good = products.filter((p) => fitTier(p, ctx) !== "C");
    if (good.length >= TOP_N) pool = good;
    bestMatch = [...products].sort(byFitThenPrice(ctx)).slice(0, TOP_N);
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
