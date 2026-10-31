export type Currency = "EUR" | "SEK" | "NOK" | "DKK";

export interface Money {
  amount: number;
  currency: Currency;
}

export type GarmentType =
  | "takki" | "kurahousut" | "toppahousut" | "housut" | "kengät" | "paita" | "haalari"
  | "mekko" | "body" | "uimapuku" | "pyjama" | "sukat" | "pipo" | "lapaset"
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

  // Onko tuote talvikäyttöön (toppa/untuva/talvi merkintä)? null = ei tiedossa.
  // Puuttuu vanhoista tuonneista - silloin se arvioidaan otsikosta hakuhetkellä.
  winter?: boolean | null;

  // Sama tuote usealla värillä samassa kaupassa ja samalla hinnalla näytetään
  // kerran (paras sopiva väri edustajana). color_count = värivaihtoehtojen
  // määrä (vain jos > 1), other_colors = muut värit.
  color_count?: number;
  other_colors?: string[];

  last_updated: string;
}

export interface SearchCriteria {
  garment_type?: GarmentType;
  size_cm?: number;
  size_raw?: string;
  // size_cm = haettu koko senttimetreinä (numero), age = lapsen ikä vuosina jos
  // haussa mainittiin ikä. size_raw säilyy yhteensopivuuden vuoksi.
  age?: number;
  // Kausirajaus: "talvi"/"untuva"/"toppa" haussa -> "winter".
  season?: "winter";
  child_gender_pref?: "tyttö" | "poika" | "unisex";
  // Kuvaileeko haku lasta ("lapselle", "vauvalle", "taaperolle"...) vaikka
  // ikää, kokoa tai sukupuolta ei mainittaisi. Aktivoi aikuissuodatuksen.
  child_signal?: boolean;
  max_price?: Money;
  brand_allow?: string[];
  brand_deny?: string[];
  waterproof?: boolean;
  material_keywords?: string[];
  color?: string;
}
