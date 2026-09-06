import { Product } from "../types";

export interface RankedResults {
  cheapest: Product[];
  bestValue: Product[]; // TODO: toteuta hakukokemus-ja-jarjestys-speksi.md 2.5 mukaisesti
  mostLoved: Product[] | null;
}

const TOP_N = 5;

export function rankResults(products: Product[]): RankedResults {
  const cheapest = [...products]
    .sort((a, b) => a.price.amount - b.price.amount)
    .slice(0, TOP_N);

  // TODO (stub): "paras hinta-laatu" = sama kuin halvimmat juuri nyt.
  const bestValue = cheapest;

  const ratedProducts = products.filter((p) => p.rating !== null);
  const mostLoved =
    ratedProducts.length >= 3
      ? [...ratedProducts]
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, TOP_N)
      : null;

  return { cheapest, bestValue, mostLoved };
}
