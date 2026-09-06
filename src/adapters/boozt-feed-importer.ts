import { parse } from "csv-parse/sync";
import { config } from "../config";
import { Product, Currency, GarmentType } from "../types";
import { ProductStore } from "../store/product-store";

function buildFeedUrl(): string {
  const apiKey = config.awin.datafeedApiKey();
  const feedId = config.awin.boozt.feedId();

  const columns = [
    "aw_deep_link",
    "product_name",
    "aw_product_id",
    "merchant_product_id",
    "merchant_image_url",
    "description",
    "merchant_category",
    "search_price",
    "store_price",
    "delivery_cost",
    "brand_name",
    "in_stock",
    "colour",
    "product_type",
    "last_updated",
    "currency",
    "size",
    "gender",
    "age_group",
  ].join(",");

  return (
    `https://productdata.awin.com/datafeed/download/apikey/${apiKey}` +
    `/language/any/fid/${feedId}/columns/${columns}` +
    `/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`
  );
}

interface RawFeedRow {
  aw_deep_link?: string;
  product_name?: string;
  aw_product_id?: string;
  merchant_product_id?: string;
  merchant_image_url?: string;
  description?: string;
  merchant_category?: string;
  search_price?: string;
  store_price?: string;
  delivery_cost?: string;
  brand_name?: string;
  in_stock?: string;
  colour?: string;
  product_type?: string;
  last_updated?: string;
  currency?: string;
  size?: string;
  gender?: string;
  age_group?: string;
}

const GARMENT_KEYWORDS: Record<GarmentType, string[]> = {
  takki: ["takki", "jacket", "coat", "kuoritakki", "toppatakki"],
  housut: ["housut", "pants", "trousers", "farkut", "jeans", "kurahousut", "verkkarit"],
  kengät: ["kengät", "shoes", "boots", "saappaat"],
  paita: ["paita", "shirt", "t-paita", "tröja", "collegepaita", "hupparipaita"],
  haalari: ["haalari", "overall", "jumpsuit"],
  muu: [],
};

function guessGarmentType(...texts: (string | undefined)[]): GarmentType {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [
    GarmentType,
    string[],
  ][]) {
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return "muu";
}

function guessWaterproof(...texts: (string | undefined)[]): boolean | null {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  const positive = ["vedenpitävä", "waterproof", "vattentät", "vanntett"];
  if (positive.some((kw) => haystack.includes(kw))) return true;
  return null;
}

function guessGender(raw: string | undefined): "tyttö" | "poika" | "unisex" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.includes("girl") || v.includes("female")) return "tyttö";
  if (v.includes("boy") || v.includes("male")) return "poika";
  if (v.includes("unisex")) return "unisex";
  return null;
}

function parseMoney(raw: string | undefined, currency: string | undefined): {
  amount: number;
  currency: Currency;
} | null {
  if (!raw) return null;
  const amount = parseFloat(raw.replace(",", "."));
  if (Number.isNaN(amount)) return null;
  return { amount, currency: (currency as Currency) || "EUR" };
}

function mapRow(row: RawFeedRow): Product | null {
  if (!row.aw_product_id || !row.product_name || !row.aw_deep_link) return null;

  const price = parseMoney(row.search_price, row.currency);
  const originalPrice = parseMoney(row.store_price, row.currency);
  if (!price) return null;

  const discountPercent =
    originalPrice && originalPrice.amount > price.amount
      ? Math.round((1 - price.amount / originalPrice.amount) * 100)
      : null;

  return {
    id: `boozt:${row.aw_product_id}`,
    source: "boozt",
    title: row.product_name,
    brand: row.brand_name || "Tuntematon",
    garment_type: guessGarmentType(row.merchant_category, row.product_type, row.product_name),

    price,
    original_price: originalPrice,
    discount_percent: discountPercent,

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

    rating: null,
    rating_count: null,

    last_updated: row.last_updated || new Date().toISOString(),
  };
}

export interface ImportResult {
  fetchedRows: number;
  importedProducts: number;
  skippedRows: number;
}

export async function importBooztFeed(
  store: ProductStore = new ProductStore()
): Promise<ImportResult> {
  const url = buildFeedUrl();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Awin-feedin lataus epäonnistui: ${response.status} ${response.statusText}.`
    );
  }

  const csvText = await response.text();
  const rows: RawFeedRow[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const products: Product[] = [];
  let skipped = 0;

  for (const row of rows) {
    const product = mapRow(row);
    if (product) products.push(product);
    else skipped++;
  }

  await store.replaceAll(products);

  return {
    fetchedRows: rows.length,
    importedProducts: products.length,
    skippedRows: skipped,
  };
}

if (require.main === module) {
  importBooztFeed()
    .then((result) => console.log("Boozt-feedin tuonti valmis:", result))
    .catch((err) => {
      console.error("Boozt-feedin tuonti epäonnistui:", err);
      process.exit(1);
    });
}
