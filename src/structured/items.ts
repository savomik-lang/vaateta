import { GarmentType } from "../types";
import { GARMENT_KEYWORDS } from "../nlu/garment-keywords";

// ---------------------------------------------------------------------------
// Rakenteisen haun ja facetsin syötteet (sopimus: claude/vaihe-b-rajapinta.md).
//
// Item = yksi kategoriapaneelin kuvake: <vaatetyyppi>[.<alatyyppi>][+winter][+wp]
//   haalari+winter, lapaset+wp, kengät.lenkkarit, pipo, paita
// ---------------------------------------------------------------------------

export const ITEM_GARMENTS: GarmentType[] = (Object.keys(GARMENT_KEYWORDS) as GarmentType[]).filter((t) => t !== "muu");
const SUBTYPE_RE = /^[\p{L}\p{N}-]{1,30}$/u;
const MODIFIERS = new Set(["winter", "wp"]);

export interface ParsedItem {
  /** Itemi sellaisenaan (välilyönnit muutettu +-merkeiksi); vastauksen avain. */
  id: string;
  garment: GarmentType;
  subtype?: string;
  winter: boolean;
  wp: boolean;
}

/** Parsii yhden itemin. Palauttaa null, jos muoto tai vaatetyyppi on virheellinen. */
export function parseItem(raw: string): ParsedItem | null {
  // Kyselymerkkijonossa '+' voi saapua välilyöntinä ("haalari winter") - tulkitaan takaisin plussaksi.
  const id = raw.trim().replace(/\s+/g, "+");
  if (!id) return null;
  const [head, ...mods] = id.split("+");
  const dot = head.indexOf(".");
  const garment = (dot === -1 ? head : head.slice(0, dot)).normalize("NFC").toLowerCase() as GarmentType;
  const subtype = dot === -1 ? undefined : head.slice(dot + 1).normalize("NFC").toLowerCase();
  if (!ITEM_GARMENTS.includes(garment)) return null;
  if (subtype !== undefined && !SUBTYPE_RE.test(subtype)) return null;
  const lowered = mods.map((m) => m.toLowerCase());
  if (lowered.some((m) => !MODIFIERS.has(m))) return null;
  return { id, garment, ...(subtype ? { subtype } : {}), winter: lowered.includes("winter"), wp: lowered.includes("wp") };
}

export type ItemListResult =
  | { ok: true; items: ParsedItem[] }
  | { ok: false; error: string; invalid_items?: string[] };

/** `items`-parametri (pilkuilla erotettu, tai toistettu) -> itemit. min 1, max `max`. */
export function parseItemList(param: unknown, max: number): ItemListResult {
  const raw = Array.isArray(param) ? param.join(",") : typeof param === "string" ? param : "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "items puuttuu" };
  if (parts.length > max) return { ok: false, error: `items: enintään ${max} itemiä` };
  const items: ParsedItem[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    const item = parseItem(part);
    if (item) items.push(item);
    else invalid.push(part);
  }
  if (invalid.length > 0) return { ok: false, error: "Virheellinen item", invalid_items: invalid };
  return { ok: true, items };
}

export interface Filters {
  size_cm: number | null;
  shoe_eu: number | null;
  gender: "tyttö" | "poika" | null;
  brands: string[];
}

export type FilterResult =
  | { ok: true; filters: Filters }
  | { ok: false; error: string; invalid_params: string[] };

function first(v: unknown): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}
function parseNum(v: unknown, min: number, max: number): number | null | "invalid" {
  const s = first(v);
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return "invalid";
  return Math.round(n);
}

export const MAX_BRANDS = 30;

/** Normalisoitu vertailuavain brändille (tarkka vertailu, ei osamerkkijonoa). */
export function brandKey(brand: string): string {
  return brand.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Brändien näyttönimet facetsiin. Eri kaupat kirjoittavat saman merkin eri tavoin
// ("color kids", "Color Kids", "COLOR KIDS"): ne yhdistetään brandKeyllä, ja näyttönimeksi
// valitaan sekakirjaiminen kirjoitusasu, tai jos sellaista ei ole, isoiksi alkukirjaimiksi
// muutettu yleisin asu. Vastaus `brands`-parametriin kelpaa takaisin sellaisenaan (sama avain).
// ---------------------------------------------------------------------------

const UNKNOWN_BRANDS = new Set(["", "tuntematon", "unknown", "okänd", "n/a", "na", "none", "-", "null", "undefined"]);

export function isUnknownBrand(brand: string | null | undefined): boolean {
  return UNKNOWN_BRANDS.has(brandKey(brand ?? ""));
}

function titleCaseWords(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(\-/&.])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

/** Yhden kirjoitusasun siistiminen: kokonaan pienet tai kokonaan isot (yli 3 merkkiä) -> Isot Alkukirjaimet. */
export function tidyBrandName(raw: string): string {
  const t = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  const hasLower = /\p{Ll}/u.test(t);
  const hasUpper = /\p{Lu}/u.test(t);
  if (!hasUpper) return titleCaseWords(t);
  if (!hasLower && t.length > 3) return titleCaseWords(t);
  return t;
}

/** Valitsee brändin näyttönimen sen kirjoitusasuista ja niiden esiintymismääristä. */
export function pickBrandDisplayName(variants: Map<string, number>): string {
  const entries = [...variants.entries()];
  const mixed = entries.filter(([v]) => /\p{Ll}/u.test(v) && /\p{Lu}/u.test(v));
  const pool = mixed.length > 0 ? mixed : entries;
  pool.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return tidyBrandName(pool[0][0]);
}

/** Yhteiset suodatinparametrit: size_cm, shoe_eu, gender, brands. */
export function parseFilters(query: Record<string, unknown>): FilterResult {
  const invalid: string[] = [];
  const size = parseNum(query.size_cm, 44, 190);
  if (size === "invalid") invalid.push("size_cm");
  const shoe = parseNum(query.shoe_eu, 16, 46);
  if (shoe === "invalid") invalid.push("shoe_eu");

  let gender: Filters["gender"] = null;
  const g = first(query.gender).toLowerCase();
  if (["tytto", "tyttö", "girl", "flicka"].includes(g)) gender = "tyttö";
  else if (["poika", "boy", "pojke"].includes(g)) gender = "poika";
  else if (g && !["kaikki", "all", "unisex"].includes(g)) invalid.push("gender");

  const rawBrands = Array.isArray(query.brands) ? query.brands.join(",") : typeof query.brands === "string" ? query.brands : "";
  const brands: string[] = [];
  const seen = new Set<string>();
  for (const b of rawBrands.split(",").map((s) => s.trim()).filter(Boolean)) {
    const key = brandKey(b);
    if (!seen.has(key)) { seen.add(key); brands.push(b); }
  }
  if (brands.length > MAX_BRANDS) invalid.push("brands");

  if (invalid.length > 0) return { ok: false, error: "Virheelliset parametrit", invalid_params: invalid };
  return { ok: true, filters: { size_cm: size === "invalid" ? null : size, shoe_eu: shoe === "invalid" ? null : shoe, gender, brands } };
}
