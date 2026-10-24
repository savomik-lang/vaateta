import { Product, Currency } from "../types";
import { guessGarmentType } from "../nlu/garment-keywords";

interface RawAgentItem {
  title?: unknown; brand?: unknown; price?: unknown; currency?: unknown;
  url?: unknown; image_url?: unknown; in_stock?: unknown; waterproof?: unknown;
  material?: unknown; rating?: unknown; store?: unknown;
}
const VALID_CURRENCIES: Currency[] = ["EUR", "SEK", "NOK", "DKK"];

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const p = new URL(value); return p.protocol === "http:" || p.protocol === "https:"; } catch { return false; }
}
function stableIdFromUrl(url: string): string {
  const encoded = Buffer.from(url).toString("base64").replace(/[/+=]/g, "");
  return `web:${encoded.slice(0, 24)}`;
}

export function mapAgentItem(raw: unknown): Product | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as RawAgentItem;
  if (typeof item.title !== "string" || item.title.trim() === "") return null;
  if (typeof item.price !== "number" || Number.isNaN(item.price) || item.price <= 0) return null;
  if (!isValidUrl(item.url)) return null;

  const currency: Currency = VALID_CURRENCIES.includes(item.currency as Currency) ? (item.currency as Currency) : "EUR";
  const store = typeof item.store === "string" && item.store.trim() !== "" ? item.store.trim() : "web";

  return {
    id: stableIdFromUrl(item.url as string),
    source: `web:${store}`,
    title: item.title.trim(),
    brand: typeof item.brand === "string" && item.brand.trim() !== "" ? item.brand.trim() : "Tuntematon",
    garment_type: guessGarmentType(item.title),
    price: { amount: item.price, currency },
    original_price: null, discount_percent: null,
    size_available: [], size_normalized: null,
    material: typeof item.material === "string" ? item.material : null,
    waterproof: typeof item.waterproof === "boolean" ? item.waterproof : null,
    color: null, gender: null,
    url_affiliate: item.url as string,
    image_url: typeof item.image_url === "string" ? item.image_url : "",
    in_stock: typeof item.in_stock === "boolean" ? item.in_stock : true,
    shipping_cost_from: null, free_shipping_threshold: null,
    rating: typeof item.rating === "number" && item.rating >= 0 && item.rating <= 5 ? item.rating : null,
    rating_count: null,
    last_updated: new Date().toISOString(),
  };
}

export function mapAgentItems(rawItems: unknown[]): Product[] {
  return rawItems.map(mapAgentItem).filter((p): p is Product => p !== null);
}
