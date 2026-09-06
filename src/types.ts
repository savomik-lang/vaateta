// Yhtenäinen tuoteskeema kaikille kauppa-adaptereille.
// Pohjautuu: lastenvaate-agentti-speksi.md kohta 6.1
// Laajennettu: hakukokemus-ja-jarjestys-speksi.md kohta 3.3 (hinnoittelukentät)

export type Currency = "EUR" | "SEK" | "NOK" | "DKK";

export interface Money {
  amount: number;
  currency: Currency;
}

export type GarmentType =
  | "takki"
  | "housut"
  | "kengät"
  | "paita"
  | "haalari"
  | "muu";

export interface Product {
  id: string;
  source: string;
  title: string;
  brand: string;
  garment_type: GarmentType;

  price: Money;
  original_price: Money | null;
  discount_percent: number | null;

  size_available: string[];
  size_normalized: string[] | null;

  material: string | null;
  waterproof: boolean | null;
  color: string | null;
  gender: "tyttö" | "poika" | "unisex" | null;

  url_affiliate: string;
  image_url: string;
  in_stock: boolean;

  shipping_cost_from: Money | null;
  free_shipping_threshold: Money | null;

  rating: number | null;
  rating_count: number | null;

  last_updated: string;
}

// Hakukriteerit (NLU/slot-filling-kerroksen tuottama strukturoitu pyyntö)
export interface SearchCriteria {
  garment_type?: GarmentType;
  size_cm?: number;
  size_raw?: string;
  child_gender_pref?: "tyttö" | "poika" | "unisex";
  max_price?: Money;
  brand_allow?: string[];
  brand_deny?: string[];
  waterproof?: boolean;
  material_keywords?: string[];
  color?: string;
}
