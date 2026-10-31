// ---------------------------------------------------------------------------
// Yksi paikka, josta kaikki Awin-kaupat löytyvät. Uuden hyväksynnän
// lisääminen = yksi uusi rivi tähän taulukkoon, ei uutta tiedostoa eikä
// koodin kopiointia (ks. generic-awin-importer.ts ja multi-store-adapter.ts).
//
// "storeKey" on sisäinen tunniste (käytetään Redis-avaimissa).
// "feedIdEnvVar" on sen ympäristömuuttujan NIMI (ei arvo) josta Feed ID
// luetaan - näin .env-tiedoston täyttäminen riittää, ei tarvitse koskea
// tähän tiedostoon kun saat vielä lisää hyväksyntöjä, jos nimeät
// muuttujan tässä kuvatun kaavan mukaisesti.
// ---------------------------------------------------------------------------

export interface StoreDefinition {
  storeKey: string; // esim. "outnorth-se"
  displayName: string; // esim. "Outnorth SE"
  feedIdEnvVar: string; // esim. "AWIN_OUTNORTH_SE_FEED_ID"
  // "classic" = Awinin perinteinen productdata.awin.com/datafeed/download/apikey/...
  //   -URL, jossa fid on PELKKÄ NUMERO ja sarakkeet ovat Awinin omaa
  //   "generic" datafeed-formaattia (aw_deep_link, aw_product_id, jne).
  // "google"  = uudempi "Darwin" productdata-darwin-download -URL
  //   (ui.awin.com/productdata-darwin-download/publisher/{id}/{token}/1/feed/{feedId}.csv.gz),
  //   jossa feedId voi sisältää kirjaimia (esim. "F3671") ja sarakkeet ovat
  //   Google Shopping -skeeman mukaiset (id, title, link, price, jne).
  //   Tätä käytetään kun Awinin "Datafeed Format" -sarake näyttää "Google".
  format: "classic" | "google";
  // true = kauppa myy pääosin AIKUISTEN tuotteita (esim. Outnorth-ulkoilu-
  // vaatteet, ~95k tuotetta joista vain pieni osa lasten). Tuonnissa
  // hyväksytään silloin VAIN tuotteet, joissa on selkeä lapsimerkki
  // (kids/junior/barn/lasten/age_group jne.) - muuten Redis täyttyisi ja
  // haku hidastuisi aikuistuotteilla, joita lapsihaku ei koskaan näyttäisi.
  childOnly?: boolean;
  // Vain "classic"-formaatille: kaupan OMA sarakelista ja kieli, täsmälleen
  // niin kuin Awinin Datafeeds.csv:n URL-sarake ne listaa. Kaikilla
  // mainostajilla ei ole samoja sarakkeita (esim. Outnorthilla ei ole
  // age_group/gender/size, vaan Fashion:suitable_for ja Fashion:size).
  // true = luotettu kauppa, jonka aikuisten kokoja (XS/S) saa näyttää
  // nuorille (13+ v) - sukupuolta kunnioittaen. Yleiset markkinapaikat
  // (Voghion) pidetään tiukalla aikuissuodatuksella myös nuorille.
  trustedForTeen?: boolean;
  classicColumns?: string[];
  classicLanguage?: string;
  // Outnorth FI: search_price on NORMAALIHINTA ja base_price ("35.70 EUR") on
  // voimassa oleva ALENNUSHINTA (todennettu feedistä 31.10.2026: base_price on
  // alle search_pricen kaikilla 61 883 rivillä, joilla se on annettu).
  basePriceIsSale?: boolean;
}

// Outnorthin feedien sarakkeet (Datafeeds.csv 31.10.2026). SE-feedissä on
// lisäksi currency, FI-feedissä base_price.
const OUTNORTH_COLUMNS_COMMON = [
  "data_feed_id", "merchant_id", "merchant_name", "aw_product_id", "aw_deep_link",
  "aw_image_url", "aw_thumb_url", "category_id", "category_name", "brand_id",
  "brand_name", "merchant_product_id", "merchant_category", "ean", "mpn",
  "product_name", "description", "merchant_deep_link", "merchant_image_url",
];
const OUTNORTH_SE_COLUMNS = [
  ...OUTNORTH_COLUMNS_COMMON,
  "currency", "search_price", "in_stock", "stock_quantity", "condition", "product_type",
  "parent_product_id", "colour", "Fashion:suitable_for", "Fashion:size",
  "merchant_product_category_path", "product_price_old",
];
const OUTNORTH_FI_COLUMNS = [
  ...OUTNORTH_COLUMNS_COMMON,
  "search_price", "in_stock", "condition", "product_type", "parent_product_id", "colour",
  "Fashion:suitable_for", "Fashion:size", "merchant_product_category_path", "base_price",
  "currency",
];

export const AWIN_STORES: StoreDefinition[] = [
  { storeKey: "outnorth-se", displayName: "Outnorth SE", feedIdEnvVar: "AWIN_OUTNORTH_SE_FEED_ID", format: "classic", childOnly: true, trustedForTeen: true, classicColumns: OUTNORTH_SE_COLUMNS, classicLanguage: "sv" },
  { storeKey: "outnorth-fi", displayName: "Outnorth FI", feedIdEnvVar: "AWIN_OUTNORTH_FI_FEED_ID", format: "classic", childOnly: true, trustedForTeen: true, basePriceIsSale: true, classicColumns: OUTNORTH_FI_COLUMNS, classicLanguage: "fi" },
  { storeKey: "voghion-global", displayName: "Voghion Global", feedIdEnvVar: "AWIN_VOGHION_GLOBAL_FEED_ID", format: "google" },
  // PÄIVITÄ TÄHÄN uusi rivi kun Babyshop/Boozt tms. joskus hyväksyy:
  // { storeKey: "babyshop-fi", displayName: "Babyshop FI", feedIdEnvVar: "AWIN_BABYSHOP_FI_FEED_ID", format: "classic" },
];

// Palauttaa vain ne kaupat, joiden Feed ID on oikeasti asetettu .env:ssä -
// jos joku kauppa on taulukossa mutta ID puuttuu vielä, se ohitetaan
// hiljaisesti sen sijaan että koko haku kaatuisi.
export function getConfiguredStores(): (StoreDefinition & { feedId: string })[] {
  return AWIN_STORES.filter((s) => !!process.env[s.feedIdEnvVar]).map((s) => ({
    ...s,
    feedId: process.env[s.feedIdEnvVar] as string,
  }));
}
