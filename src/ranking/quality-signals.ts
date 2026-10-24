const QUALITY_TEXT_KEYWORDS = ["vedenpitävä", "vedenkestäv", "luomupuuvilla", "gots", "merinovilla", "gore-tex", "goretex", "vahvistetut polvet"];

export interface QualitySignalInput { material: string | null; title: string; waterproof: boolean | null; }

export function hasQualitySignal(product: QualitySignalInput): boolean {
  if (product.waterproof === true) return true;
  const haystack = `${product.material ?? ""} ${product.title}`.toLowerCase();
  return QUALITY_TEXT_KEYWORDS.some((kw) => haystack.includes(kw));
}
