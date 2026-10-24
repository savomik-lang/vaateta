import { gunzipSync } from "zlib";
import { parse } from "csv-parse/sync";
import { config } from "../config";
import { Product, Currency } from "../types";
import { RedisProductStore } from "../store/product-store";
import { guessGarmentType } from "../nlu/garment-keywords";
import { StoreDefinition } from "../stores-registry";

// ---------------------------------------------------------------------------
// YLEISKÄYTTÖINEN Awin-feed-importeri, joka toimii MILLE TAHANSA Awin-
// mainostajalle. Korvaa aiemman kauppakohtaisen boozt-feed-importer.ts:n -
// sama mapping-logiikka, mutta parametrisoitu storeKey/feedId:n mukaan,
// jotta uuden kaupan lisääminen ei vaadi kokonaan uutta tiedostoa.
//
// HUOM: sarakelista on paras arvio Awinin yleisistä "generic" datafeed-
// kentistä. Eri mainostajat (Outnorth, Voghion) voivat tarjota hieman eri
// sarakkeita - jos tuonti palauttaa paljon skippedRows-rivejä, tarkista
// Awinin "Create-a-Feed" tai kyseisen kaupan oman Datafeeds-sivun tarkka
// sarakelista ja säädä COLUMNS-listaa tarvittaessa.
// ---------------------------------------------------------------------------

const COLUMNS = [
  "aw_deep_link", "product_name", "aw_product_id", "merchant_product_id",
  "merchant_image_url", "description", "merchant_category", "search_price",
  "store_price", "delivery_cost", "brand_name", "in_stock", "colour",
  "product_type", "last_updated", "currency", "size", "gender", "age_group",
].join(",");

function buildClassicFeedUrl(feedId: string): string {
  const apiKey = config.awin.datafeedApiKey();
  return (
    `https://productdata.awin.com/datafeed/download/apikey/${apiKey}` +
    `/language/any/fid/${feedId}/columns/${COLUMNS}` +
    `/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`
  );
}

// "Darwin"-latauspalvelu: julkaisijakohtainen token (ei apikey-parametri),
// feedId voi sisältää kirjaimia (esim. "F3671"), tiedosto on aina .csv.gz.
function buildGoogleFeedUrl(feedId: string): string {
  const publisherId = config.awin.publisherId();
  const token = config.awin.feedListToken();
  return `https://ui.awin.com/productdata-darwin-download/publisher/${publisherId}/${token}/1/feed/${feedId}.csv.gz`;
}

// Google Shopping -skeeman rivi (ks. https://support.google.com/merchants/answer/7052112)
interface GoogleFeedRow {
  id?: string; title?: string; description?: string; link?: string;
  image_link?: string; price?: string; sale_price?: string;
  availability?: string; brand?: string; product_type?: string;
  google_product_category?: string; color?: string; size?: string;
  gender?: string; age_group?: string; shipping?: string; condition?: string;
}

function mapGoogleRow(row: GoogleFeedRow, storeKey: string): Product | null {
  if (!row.id || !row.title || !row.link) return null;
  // price-kenttä on usein muotoa "199.00 EUR"
  const priceParts = (row.price || "").trim().split(/\s+/);
  const salePriceParts = (row.sale_price || "").trim().split(/\s+/);
  const currency = (priceParts[1] || salePriceParts[1] || "EUR") as Currency;
  const listPrice = parseMoney(priceParts[0], currency);
  const saleP = row.sale_price ? parseMoney(salePriceParts[0], currency) : null;
  const effectivePrice = saleP || listPrice;
  if (!effectivePrice) return null;
  const originalPrice = saleP ? listPrice : null;
  const discountPercent = originalPrice && originalPrice.amount > effectivePrice.amount
    ? Math.round((1 - effectivePrice.amount / originalPrice.amount) * 100) : null;

  return {
    id: `${storeKey}:${row.id}`,
    source: storeKey,
    title: row.title,
    brand: row.brand || "Tuntematon",
    garment_type: guessGarmentType(row.google_product_category, row.product_type, row.title),
    price: effectivePrice, original_price: originalPrice, discount_percent: discountPercent,
    size_available: row.size ? [row.size] : [],
    size_normalized: null,
    material: null,
    waterproof: guessWaterproof(row.description, row.title),
    color: row.color || null,
    gender: guessGender(row.gender),
    url_affiliate: row.link,
    image_url: row.image_link || "",
    in_stock: (row.availability || "").toLowerCase() === "in stock" || (row.availability || "").toLowerCase() === "in_stock",
    shipping_cost_from: null,
    free_shipping_threshold: null,
    rating: null, rating_count: null,
    last_updated: new Date().toISOString(),
  };
}

interface RawFeedRow {
  aw_deep_link?: string; product_name?: string; aw_product_id?: string;
  merchant_product_id?: string; merchant_image_url?: string; description?: string;
  merchant_category?: string; search_price?: string; store_price?: string;
  delivery_cost?: string; brand_name?: string; in_stock?: string; colour?: string;
  product_type?: string; last_updated?: string; currency?: string;
  size?: string; gender?: string; age_group?: string;
}

function guessWaterproof(...texts: (string | undefined)[]): boolean | null {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  const positive = ["vedenpitävä", "waterproof", "vattentät", "vanntett"];
  return positive.some((kw) => haystack.includes(kw)) ? true : null;
}

function guessGender(raw: string | undefined): "tyttö" | "poika" | "unisex" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.includes("girl") || v.includes("female")) return "tyttö";
  if (v.includes("boy") || v.includes("male")) return "poika";
  if (v.includes("unisex")) return "unisex";
  return null;
}

function parseMoney(raw: string | undefined, currency: string | undefined) {
  if (!raw) return null;
  const amount = parseFloat(raw.replace(",", "."));
  if (Number.isNaN(amount)) return null;
  return { amount, currency: (currency as Currency) || "EUR" };
}

function mapRow(row: RawFeedRow, storeKey: string): Product | null {
  if (!row.aw_product_id || !row.product_name || !row.aw_deep_link) return null;
  const price = parseMoney(row.search_price, row.currency);
  const originalPrice = parseMoney(row.store_price, row.currency);
  if (!price) return null;
  const discountPercent = originalPrice && originalPrice.amount > price.amount
    ? Math.round((1 - price.amount / originalPrice.amount) * 100) : null;

  return {
    id: `${storeKey}:${row.aw_product_id}`,
    source: storeKey,
    title: row.product_name,
    brand: row.brand_name || "Tuntematon",
    garment_type: guessGarmentType(row.merchant_category, row.product_type, row.product_name),
    price, original_price: originalPrice, discount_percent: discountPercent,
    size_available: row.size ? [row.size] : [],
    size_normalized: null,
    material: null,
    waterproof: guessWaterproof(row.description, row.product_name),
    color: row.colour || null,
    gender: guessGender(row.gender),
    url_affiliate: row.aw_deep_link,
    image_url: row.merchant_image_url || "",
    in_stock: (row.in_stock || "").toLowerCase() !== "false" && row.in_stock !== "0",
    shipping_cost_from: parseMoney(row.delivery_cost, row.currency),
    free_shipping_threshold: null,
    rating: null, rating_count: null,
    last_updated: row.last_updated || new Date().toISOString(),
  };
}

export interface ImportResult {
  storeKey: string;
  displayName: string;
  fetchedRows: number;
  importedProducts: number;
  skippedRows: number;
  // Vain diagnostiikkaa varten: jos tuonti palautti 0 tuotetta vaikka rivejä
  // löytyi, tämä näyttää ensimmäisen rivin sarakenimet, jotta mapRow/
  // mapGoogleRow-sarakeoletukset voi tarkistaa ilman paikallista CSV:n
  // avaamista.
  sampleRowKeys?: string[];
}

export async function importAwinStore(store: StoreDefinition & { feedId: string }): Promise<ImportResult> {
  const url = store.format === "google" ? buildGoogleFeedUrl(store.feedId) : buildClassicFeedUrl(store.feedId);
  // Osa CDN:istä (mm. Awinin CloudFront) hylkää pyynnöt ilman User-Agentia -
  // Noden oma fetch ei lähetä sitä oletuksena, mikä voi näkyä geneerisenä
  // "fetch failed" -virheenä ilman HTTP-statuskoodia.
  const response = await fetch(url, {
    headers: { "User-Agent": "Vaateta/1.0 (+https://vaateta.com)", Accept: "text/csv,*/*" },
  });
  if (!response.ok) {
    throw new Error(
      `${store.displayName}: Awin-feedin lataus epäonnistui (${response.status} ${response.statusText}). ` +
      `Tarkista AWIN_DATAFEED_API_KEY/AWIN_PUBLISHER_ID/AWIN_FEEDLIST_TOKEN ja ${store.feedIdEnvVar}.`
    );
  }

  let csvText: string;
  if (store.format === "google") {
    // Node/undici saattaa purkaa gzip-pakkauksen itse Content-Encoding-
    // otsikon perusteella, jolloin tavuvirta EI enää ole gzipattu meille
    // asti - toisinaan taas ei. Yritetään ensin gunzip, ja jos se epäonnistuu
    // (data ei olekaan gzip-muodossa), tulkitaan tavuvirta suoraan UTF-8:ksi.
    const buf = Buffer.from(await response.arrayBuffer());
    try {
      csvText = gunzipSync(buf).toString("utf-8");
    } catch {
      csvText = buf.toString("utf-8");
    }
  } else {
    csvText = await response.text();
  }

  const rows: Record<string, string>[] = parse(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const products: Product[] = [];
  let skipped = 0;
  for (const row of rows) {
    const product = store.format === "google"
      ? mapGoogleRow(row as GoogleFeedRow, store.storeKey)
      : mapRow(row as RawFeedRow, store.storeKey);
    if (product) products.push(product); else skipped++;
  }

  const deduped = dedupeVariants(products);

  const productStore = new RedisProductStore(store.storeKey);
  await productStore.replaceAll(deduped);

  return {
    storeKey: store.storeKey,
    displayName: store.displayName,
    fetchedRows: rows.length,
    importedProducts: deduped.length,
    skippedRows: skipped + (products.length - deduped.length),
    sampleRowKeys: products.length === 0 && rows.length > 0 ? Object.keys(rows[0]) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Monet feedit (erityisesti Google Shopping -skeema) listaavat saman tuotteen
// kerran JOKAISTA kokoa/väriä kohden omalla rivillään, mutta samalla
// affiliate-linkillä ja lähes identtisellä nimellä/hinnalla. Ilman siivousta
// nämä täyttävät koko "Halvimmat"/"Paras hinta-laatu" -Top5-listan samalla
// tuotteella. Ryhmitellään url_affiliate:n mukaan (sama tuotesivu = sama
// tuote), valitaan edustajaksi halvin variantti, ja kerätään kaikkien
// varianttien koot yhteen size_available-listaan.
// ---------------------------------------------------------------------------
function dedupeVariants(products: Product[]): Product[] {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.url_affiliate || `${p.title}::${p.brand}::${p.price.amount}`;
    const list = groups.get(key);
    if (list) list.push(p); else groups.set(key, [p]);
  }

  const result: Product[] = [];
  for (const variants of groups.values()) {
    if (variants.length === 1) {
      result.push(variants[0]);
      continue;
    }
    const cheapest = variants.reduce((min, p) => (p.price.amount < min.price.amount ? p : min));
    const allSizes = Array.from(new Set(variants.flatMap((p) => p.size_available)));
    const anyInStock = variants.some((p) => p.in_stock);
    result.push({ ...cheapest, size_available: allSizes, in_stock: anyInStock });
  }
  return result;
}
