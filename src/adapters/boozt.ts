import { Product, SearchCriteria } from "../types";
import { IProductStore, ProductStore } from "../store/product-store";

export class BooztAdapter {
  constructor(private store: IProductStore = new ProductStore()) {}

  async search(criteria: SearchCriteria): Promise<Product[]> {
    const all = await this.store.loadAll();
    return all.filter((p) => matchesCriteria(p, criteria));
  }

  async lastImportedAt(): Promise<string | null> {
    return this.store.lastUpdated();
  }
}

export function matchesCriteria(p: Product, c: SearchCriteria): boolean {
  if (!p.in_stock) return false;

  if (c.garment_type && p.garment_type !== c.garment_type) return false;

  if (c.max_price && p.price.currency === c.max_price.currency) {
    if (p.price.amount > c.max_price.amount) return false;
  }

  if (c.brand_deny?.some((b) => p.brand.toLowerCase().includes(b.toLowerCase()))) {
    return false;
  }
  if (c.brand_allow?.length) {
    const allowed = c.brand_allow.some((b) =>
      p.brand.toLowerCase().includes(b.toLowerCase())
    );
    if (!allowed) return false;
  }

  if (c.waterproof === true && p.waterproof !== true) return false;

  if (c.child_gender_pref && p.gender && p.gender !== "unisex") {
    if (c.child_gender_pref !== "unisex" && p.gender !== c.child_gender_pref) {
      return false;
    }
  }

  if (c.color && p.color && p.color.toLowerCase() !== c.color.toLowerCase()) {
    return false;
  }

  if (c.material_keywords?.length) {
    const haystack = (p.material || "").toLowerCase();
    const hasMatch = c.material_keywords.some((kw) =>
      haystack.includes(kw.toLowerCase())
    );
    if (!hasMatch) return false;
  }

  if (c.size_raw && p.size_available.length > 0) {
    const match = p.size_available.some((s) =>
      s.toLowerCase().includes(c.size_raw!.toLowerCase())
    );
    if (!match) return false;
  }

  return true;
}
