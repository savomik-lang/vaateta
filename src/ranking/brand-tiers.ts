export type BrandTier = "premium" | "perus" | "budjetti";

const BRAND_TIERS: Record<string, BrandTier> = {
  reima: "premium", "polarn o. pyret": "premium", didriksons: "premium",
  molo: "premium", "mini rodini": "premium", "bobo choses": "premium",
  lindex: "perus", kappahl: "perus", h_and_m: "perus",
};
const TIER_ORDER: Record<BrandTier, number> = { premium: 0, perus: 1, budjetti: 2 };

export function getBrandTier(brand: string): BrandTier {
  return BRAND_TIERS[brand.trim().toLowerCase()] ?? "budjetti";
}
export function compareBrandTier(brandA: string, brandB: string): number {
  return TIER_ORDER[getBrandTier(brandA)] - TIER_ORDER[getBrandTier(brandB)];
}
