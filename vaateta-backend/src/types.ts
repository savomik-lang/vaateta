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
  source: string; // esim. "boozt" | "shopify:merkki"
  title: string;
  brand: string;
  garment_type: GarmentType;

  price: Money;
  original_price: Money | null;
  discount_percent: number | null; // laskettu: (original - price) / original * 100

  size_available: string[]; // raakakoot sellaisenaan feedistä
  size_normalized: string[] | null; // täytetään myöhemmin erillisellä normalisointipalvelulla (speksi 6.2) — ei MVP:ssä

  material: string | null;
  waterproof: boolean | null;

  url_affiliate: string;
  image_url: string;
  in_stock: boolean;

  // Hinnoittelun lisäkentät (hakukokemus-ja-jarjestys-speksi.md 3.3)
  shipping_cost_from: Money | null;
  free_shipping_threshold: Money | null;

  // Arvostelu, jos feed sisältää sen (hakukokemus-ja-jarjestys-speksi.md 2.2)
  rating: number | null; // 0–5, null jos ei saatavilla
  rating_count: number | null;

  last_updated: string; // ISO-timestamp, feedin oma last_updated-kenttä
}

// Hakukriteerit (NLU/slot-filling-kerroksen tuottama strukturoitu pyyntö)
export interface SearchCriteria {
  garment_type?: GarmentType;
  size_cm?: number; // normalisoitu cm, jos tiedossa
  size_raw?: string; // esim. käyttäjän antama "110" tai "5v" ennen normalisointia
  child_gender_pref?: "tyttö" | "poika" | "unisex";
  max_price?: Money;
  brand_allow?: string[];
  brand_deny?: string[];
  waterproof?: boolean;
  material_keywords?: string[];
}
