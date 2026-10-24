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

function buildFeedUrl(feedId: string): string {
  const apiKey = config.awin.datafeedApiKey();
  return (
    `https://productdata.awin.com/datafeed/download/apikey/${apiKey}` +
    `/language/any/fid/${feedId}/columns/${COLUMNS}` +
    `/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`
  );
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
}

export async function importAwinStore(store: StoreDefinition & { feedId: string }): Promise<ImportResult> {
  const url = buildFeedUrl(store.feedId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `${store.displayName}: Awin-feedin lataus epäonnistui (${response.status} ${response.statusText}). ` +
      `Tarkista AWIN_DATAFEED_API_KEY ja ${store.feedIdEnvVar}.`
    );
  }
  const csvText = await response.text();
  const rows: RawFeedRow[] = parse(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const products: Product[] = [];
  let skipped = 0;
  for (const row of rows) {
    const product = mapRow(row, store.storeKey);
    if (product) products.push(product); else skipped++;
  }

  const productStore = new RedisProductStore(store.storeKey);
  await productStore.replaceAll(products);

  return {
    storeKey: store.storeKey,
    displayName: store.displayName,
    fetchedRows: rows.length,
    importedProducts: products.length,
    skippedRows: skipped,
  };
}
