import { Product } from "../types";
import { compareBrandTier } from "./brand-tiers";
import { hasQualitySignal } from "./quality-signals";

export interface RankedResults {
  cheapest: Product[];
  bestValue: Product[];
  mostLoved: Product[] | null;
}

const TOP_N = 5;

export function rankResults(products: Product[]): RankedResults {
  const cheapest = [...products]
    .sort((a, b) => a.price.amount - b.price.amount)
    .slice(0, TOP_N);

  const bestValue = computeBestValue(products);

  const ratedProducts = products.filter((p) => p.rating !== null);
  const mostLoved =
    ratedProducts.length >= 3
      ? [...ratedProducts]
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, TOP_N)
      : null;

  return { cheapest, bestValue, mostLoved };
}

// ---------------------------------------------------------------------------
// "Paras hinta-laatu" — hakukokemus-ja-jarjestys-speksi.md kohta 2.5.
//
//   1. (Suodatus tehty jo ennen tätä funktiota, adapterin search()-vaiheessa)
//   2. Halvin kolmannes hintajakaumasta = "ehdokkaat"
//   3. Karsi ehdokkaista pois ne, joilla ei ole laatumerkintää
//   4. Järjestä jäljelle jääneet: ensin brändi-taso, sitten hinta nousevasti
//   5. Top 5 — jos ehdokkaita jää alle 5, täydennä halvimman kolmanneksen
//      seuraavaksi halvimmilla tuotteilla ilman laatuvaatimusta
// ---------------------------------------------------------------------------

export function computeBestValue(products: Product[]): Product[] {
  if (products.length === 0) return [];

  const sortedByPrice = [...products].sort((a, b) => a.price.amount - b.price.amount);
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

  return candidates
    .sort((a, b) => {
      const tierDiff = compareBrandTier(a.brand, b.brand);
      if (tierDiff !== 0) return tierDiff;
      return a.price.amount - b.price.amount;
    })
    .slice(0, TOP_N);
}
