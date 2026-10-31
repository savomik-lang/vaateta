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

// Tunnistaa onko sana (esim. hakulauseen "ei Reimaa") tunnetun brändin alku.
// Käytetään brand_deny-parserissa, ettei "ei liian kallis" tulkita brändiksi.
const EXTRA_KNOWN_BRANDS = ["name it", "nameit", "molo", "reima", "lindex", "kappahl", "hm", "h&m", "zara", "adidas", "nike", "puma", "columbia", "helly", "icepeak", "ticket", "tenson", "isbjörn", "isbjorn", "color kids", "urberg", "lindberg", "voghion", "mini rodini", "polarn", "didriksons", "hummel", "joha", "moomin", "muumi", "marimekko", "finnwear", "kuling"];
export function isKnownBrandWord(word: string): boolean {
  const w = word.trim().toLowerCase();
  if (w.length < 3) return false;
  const brands = [...Object.keys(BRAND_TIERS), ...EXTRA_KNOWN_BRANDS];
  return brands.some((b) => w.startsWith(b) || (b.length >= 4 && b.startsWith(w) && w.length >= 4));
}
