import { Product } from "../types";
import { toEur } from "../currency";
import { compareBrandTier } from "./brand-tiers";
import { hasQualitySignal } from "./quality-signals";

export interface RankedResults {
  cheapest: Product[];
  bestValue: Product[];
  mostLoved: Product[] | null;
}
const TOP_N = 5;

export function rankResults(products: Product[]): RankedResults {
  const cheapest = [...products].sort((a, b) => toEur(a.price) - toEur(b.price)).slice(0, TOP_N);
  const bestValue = computeBestValue(products);
  const ratedProducts = products.filter((p) => p.rating !== null);
  const mostLoved = ratedProducts.length >= 3
    ? [...ratedProducts].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, TOP_N)
    : null;
  return { cheapest, bestValue, mostLoved };
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
