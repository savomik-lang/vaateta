// Käsin ylläpidetty, HELPOSTI MUOKATTAVA brändi-taso-taulukko.
// Pohjautuu: hakukokemus-ja-jarjestys-speksi.md kohta 2.5 (heuristiikka A).
//
// PÄIVITÄ TÄTÄ kun uusia kauppoja/brändejä tulee mukaan (Boozt, Babyshop, ...).
// Tämä tiedosto ei sisällä mitään logiikkaa — vain dataa — jotta sen
// päivittäminen ei vaadi ranking-algoritmin koskemista.

export type BrandTier = "premium" | "perus" | "budjetti";

const BRAND_TIERS: Record<string, BrandTier> = {
  reima: "premium",
  "polarn o. pyret": "premium",
  didriksons: "premium",
  molo: "premium",
  "mini rodini": "premium",
  "bobo choses": "premium",

  lindex: "perus",
  kappahl: "perus",
  h_and_m: "perus",
};

const TIER_ORDER: Record<BrandTier, number> = {
  premium: 0,
  perus: 1,
  budjetti: 2,
};

// Tuntematon brändi = "budjetti" (ei nosteta eikä lasketa erikseen).
export function getBrandTier(brand: string): BrandTier {
  return BRAND_TIERS[brand.trim().toLowerCase()] ?? "budjetti";
}

// Negatiivinen jos a on parempi taso kuin b, positiivinen jos huonompi, 0 jos sama.
// Käytettävissä suoraan Array.sort()-vertailufunktiona.
export function compareBrandTier(brandA: string, brandB: string): number {
  return TIER_ORDER[getBrandTier(brandA)] - TIER_ORDER[getBrandTier(brandB)];
}
