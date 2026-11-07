import { Product, Currency, GarmentType } from "../types";
import { RedisProductStore } from "../store/product-store";
import { guessGarmentType } from "../nlu/garment-keywords";
import { guessWinter } from "../season";
import { parseSizeToken } from "../size";
import { StoreDefinition } from "../stores-registry";
import { isChildSafeProductForStore } from "../safety/child-safety-filter";
import { readXmlItems } from "./xml-feed-stream";
import type { ImportResult } from "./generic-awin-importer";

// ---------------------------------------------------------------------------
// Adtraction-tuonti (Google Shopping -tyyppinen XML, esim. Metsola).
//
// Syötteen erikoisuudet (todennettu Metsolan syötteestä 7.11.2026):
//  - JOKAINEN KOKO on oma rivinsä (g:item_group_id on yhteinen, koko on otsikon
//    lopussa "... - 98/104"; g:size, g:color, g:gender ja g:age_group ovat tyhjiä).
//    Rivit kootaan yhdeksi tuotteeksi (ryhmä + hintataso).
//  - Vain pieni osa riveistä on varastossa (3 601 / 18 584). Loppuneet rivit
//    jätetään pois; tuote, jonka kaikki koot ovat lopussa, ei tule mukaan.
//  - Mukana on aikuisten tuotteita ("Aikuisten ..." -tuotetyyppi, "for women",
//    kirjainkoot XS-XXL), kankaita metritavarana, lahjakortteja ja kodintekstiilejä.
//    Ne eivät kuulu lastenvaatehakuun.
//  - g:brand on usein mallistonimi ("Winter Wonders") -> StoreDefinition.fixedBrand.
//  - g:link on valmis Adtractionin seurantalinkki (säilytetään sellaisenaan).
// ---------------------------------------------------------------------------

type Raw = Record<string, string>;

// Tuotetyypit (pienellä), jotka eivät ole vaatteita.
const NON_CLOTHING_TYPES = new Set([
  "kangas", "kankaat", "lahjakortit", "muut tuotteet", "pussilakana", "peitto", "torkkupeitto",
  "vaunuverho", "koristetyynyliina", "tyynyliina", "pyyhe", "tapetti", "matto", "verhot",
  "laukku", "kassi", "kori", "maski", "vaatelaastari", "scrunchie", "harso",
]);

// Metsolan tuotetyyppi -> tyyppi silloin kun yleinen arvaus menisi väärin.
const TYPE_OVERRIDES: Record<string, GarmentType> = {
  "yövaate": "pyjama",
  "yövaatteet": "pyjama",
  "yövaate / pyjama": "pyjama",
  "kylpytakki": "muu", // kylpytakki ei ole takki
  "huivi": "muu",
  "panta": "muu",
  "hame": "muu",
  "haalari/jumpsuit": "haalari",
  "haalari / jumpsuit": "haalari",
  "jumpsuit": "haalari",
};

const ADULT_TITLE_REGEX = /(?<![\p{L}\p{N}])(?:for\s+(?:women|men)|womens?|mens?|naisten|miesten)(?![\p{L}\p{N}])/iu;
// Metritavara: "RIB 2X2 SUNFLOWER 1M", "College (harjattu) 2M", "Trikoo, Heather 2 m".
const FABRIC_TITLE_REGEX = /(?:^|[\s,])\d+(?:[.,]\d+)?\s?m$/i;
const NON_CLOTHING_TITLE_REGEX = /(?<![\p{L}\p{N}])(?:bedlinen|bed\s?linen|towel|muslin\s?cloth|lahjakortti|gift\s?card|toimituskulu|kangaskassi|scrunchie|tupsut\/nauhat)(?![\p{L}\p{N}])/iu;

export interface MappedSize {
  baseTitle: string;
  size: string | null; // normalisoitu kokoteksti (esim. "98/104", "1-2Y")
  adultSize: boolean;
}

// Koko on otsikon lopussa viimeisen " - " jälkeen. Hyväksytään vain, jos se
// tunnistuu kooksi (muuten esim. väri "MILKY BLUE - VANILLA" jäisi kokona).
export function splitTitleSize(title: string, explicitSize?: string): MappedSize {
  const clean = title.replace(/\s+/g, " ").trim();
  let base = clean;
  let raw = (explicitSize || "").trim();
  const idx = clean.lastIndexOf(" - ");
  if (idx > 0) {
    const seg = clean.slice(idx + 3).trim();
    if (looksLikeSize(seg)) {
      base = clean.slice(0, idx).trim();
      if (!raw) raw = seg;
    }
  }
  if (!raw) return { baseTitle: base, size: null, adultSize: false };
  const up = raw.toUpperCase();
  // "A" = aikuinen (Metsolan pipot), kirjainkoot XS-XXL = aikuisten vaatteet.
  if (up === "A") return { baseTitle: base, size: raw, adultSize: true };
  if (up === "NB") return { baseTitle: base, size: "50", adultSize: false }; // vastasyntynyt
  if (up === "OS") return { baseTitle: base, size: "One Size", adultSize: false };
  const tok = parseSizeToken(raw);
  if (tok.kind === "letters") return { baseTitle: base, size: raw, adultSize: true };
  return { baseTitle: base, size: tok.kind === "unknown" ? null : raw, adultSize: false };
}

function looksLikeSize(seg: string): boolean {
  const up = seg.toUpperCase();
  if (up === "A" || up === "NB" || up === "OS") return true;
  return parseSizeToken(seg).kind !== "unknown";
}

function parsePrice(raw: string | undefined): { amount: number; currency: Currency } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-z]{3})?$/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: ((m[2] || "EUR").toUpperCase()) as Currency };
}

function titleCaseIfShouting(s: string): string {
  if (!/\p{L}/u.test(s) || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(\-/|,])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

// Väri otsikosta: "Rib Helmet -Kypärämyssy | Muddy Boots" -> "Muddy Boots",
// "BEAR CARDIGAN, ROSEWATER" -> "Rosewater". Syötteen g:color on tyhjä.
export function colorFromTitle(baseTitle: string): string | null {
  let part: string | null = null;
  if (baseTitle.includes("|")) part = baseTitle.slice(baseTitle.lastIndexOf("|") + 1);
  else if (baseTitle.includes(", ")) part = baseTitle.slice(baseTitle.lastIndexOf(", ") + 2);
  if (!part) return null;
  const c = titleCaseIfShouting(part.replace(/\s+/g, " ").trim());
  return c && c.length <= 40 ? c : null;
}

export interface AdtractionStats {
  rows: number;
  outOfStock: number;
  notClothingOrAdult: number;
  unsafe: number;
  noPrice: number;
}

interface Variant {
  raw: Raw;
  size: string | null;
  price: { amount: number; currency: Currency };
  original: { amount: number; currency: Currency } | null;
}

// Puhdas muunnos: syöterivit -> tuotteet. Testattava ilman verkkoa ja Redisiä.
export function mapAdtractionRecords(records: Raw[], store: Pick<StoreDefinition, "storeKey" | "fixedBrand">): { products: Product[]; stats: AdtractionStats } {
  const stats: AdtractionStats = { rows: 0, outOfStock: 0, notClothingOrAdult: 0, unsafe: 0, noPrice: 0 };
  const groups = new Map<string, { base: string; variants: Variant[] }>();

  for (const r of records) {
    stats.rows++;
    if ((r.availability || "").toLowerCase().replace(/\s+/g, "_") !== "in_stock") { stats.outOfStock++; continue; }
    if (!r.id || !r.title || !r.link) continue;
    const type = (r.product_type || "").trim().toLowerCase();
    const { baseTitle, size, adultSize } = splitTitleSize(r.title, r.size);
    if (
      type.startsWith("aikuisten") || NON_CLOTHING_TYPES.has(type) || type.includes(" > ") ||
      /women/i.test(r.brand || "") || ADULT_TITLE_REGEX.test(r.title) ||
      (size === null && FABRIC_TITLE_REGEX.test(r.title)) || NON_CLOTHING_TITLE_REGEX.test(r.title) || adultSize
    ) { stats.notClothingOrAdult++; continue; }
    const safety = isChildSafeProductForStore(store.storeKey, {
      title: r.title, category: r.product_type, description: r.description, ageGroup: r.age_group,
    });
    if (!safety.safe) { stats.unsafe++; continue; }
    const list = parsePrice(r.price);
    const sale = parsePrice(r.sale_price);
    const price = sale && list && sale.amount < list.amount ? sale : list;
    if (!price) { stats.noPrice++; continue; }
    const original = sale && list && sale.amount < list.amount ? list : null;
    const key = r.item_group_id || baseTitle;
    const g = groups.get(key) || { base: baseTitle, variants: [] };
    g.variants.push({ raw: r, size, price, original });
    groups.set(key, g);
  }

  const products: Product[] = [];
  const now = new Date().toISOString();
  for (const [groupKey, g] of groups) {
    // Sama tuote voi maksaa eri koissa eri verran (esim. 40 EUR vauvankoot, 45 EUR isommat):
    // jaetaan hintatasoihin, jotta hinta pitää paikkansa jokaiselle näytetylle koolle.
    const tiers = new Map<string, Variant[]>();
    for (const v of g.variants) {
      const tk = `${v.price.amount}|${v.original?.amount ?? ""}`;
      tiers.set(tk, [...(tiers.get(tk) || []), v]);
    }
    const ordered = [...tiers.values()].sort((a, b) => a[0].price.amount - b[0].price.amount);
    ordered.forEach((variants, i) => {
      const first = variants[0];
      const r = first.raw;
      const sizes = Array.from(new Set(variants.map((v) => v.size).filter((s): s is string => !!s)));
      sizes.sort((a, b) => sizeSortKey(a) - sizeSortKey(b));
      const title = titleCaseIfShouting(g.base);
      const typeKey = (r.product_type || "").trim().toLowerCase();
      const garment = TYPE_OVERRIDES[typeKey] ?? guessGarmentType(r.product_type, g.base);
      const discount = first.original ? Math.round((1 - first.price.amount / first.original.amount) * 100) : null;
      products.push({
        id: `${store.storeKey}:${groupKey}${i === 0 ? "" : `-${i + 1}`}`,
        source: store.storeKey,
        title,
        brand: store.fixedBrand || r.brand || "Tuntematon",
        garment_type: garment,
        price: first.price,
        original_price: first.original,
        discount_percent: discount,
        // Ei kokoa otsikossa (esim. kintaat, tuubihuivit): "One Size" on kokohaussa neutraali.
        size_available: sizes.length ? sizes : ["One Size"],
        size_normalized: null,
        material: null,
        waterproof: /vedenpitävä|waterproof/i.test(`${r.description || ""} ${r.title}`) ? true : null,
        color: colorFromTitle(g.base),
        gender: null,
        url_affiliate: r.link,
        image_url: variants.map((v) => v.raw.image_link).find(Boolean) || "",
        in_stock: true,
        shipping_cost_from: null,
        free_shipping_threshold: null,
        rating: null,
        rating_count: null,
        winter: guessWinter(g.base, r.product_type, r.description),
        last_updated: now,
      });
    });
  }
  return { products, stats };
}

// Pienempi = pienempi koko (cm-keskiarvo); tuntemattomat ja kirjainkoot loppuun.
function sizeSortKey(raw: string): number {
  const t = parseSizeToken(raw);
  if (t.kind === "cm" || t.kind === "eu") return (t.lo + t.hi) / 2;
  return 1000;
}

// Peitetään syötteen osoitteen tunnisteet virheilmoituksista.
export function maskFeedUrl(url: string): string {
  return url.replace(/([?&](?:apid|asid|pfid|tk|token|key)=)[^&]*/gi, "$1***");
}

function assertFeedUrl(store: StoreDefinition, url: string): URL {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`${store.displayName}: ${store.feedIdEnvVar} ei ole kelvollinen URL.`); }
  if (u.protocol !== "https:" || !/(^|\.)adtraction\.com$/i.test(u.hostname)) {
    throw new Error(`${store.displayName}: ${store.feedIdEnvVar} ei osoita Adtractionin https-osoitteeseen.`);
  }
  const enc = (u.searchParams.get("encoding") || "").toUpperCase();
  if (enc && enc !== "UTF8" && enc !== "UTF-8") {
    throw new Error(`${store.displayName}: syötteen URL:ssa pitää olla encoding=UTF8 (nyt "${enc}"), muuten ääkköset hajoavat.`);
  }
  if (u.searchParams.get("zip") === "1") {
    throw new Error(`${store.displayName}: syötteen URL:ssa pitää olla zip=0 (zip-arkistoa ei pureta).`);
  }
  return u;
}

export async function importAdtractionStore(store: StoreDefinition & { feedId: string }): Promise<ImportResult> {
  const startedAt = Date.now();
  const url = assertFeedUrl(store, store.feedId);
  const response = await fetch(url, {
    headers: { "User-Agent": "Vaateta/1.0 (+https://vaateta.com)", Accept: "application/xml,text/xml,*/*" },
  });
  if (!response.ok) {
    let snippet = "";
    try { snippet = (await response.text()).replace(/\s+/g, " ").slice(0, 300); } catch { /* ei runkoa */ }
    throw new Error(
      `${store.displayName}: Adtraction-syötteen lataus epäonnistui (${response.status} ${response.statusText}). ` +
      `Tarkista ${store.feedIdEnvVar}. URL: ${maskFeedUrl(url.toString())} | vastaus: ${snippet || "(tyhjä)"}`,
    );
  }
  const headersAt = Date.now();

  // Muistin säästämiseksi loppuneet rivit lasketaan jo virrassa eikä niitä säilytetä
  // (Metsolassa ~80 % riveistä on loppuneita).
  let fetchedRows = 0;
  let outOfStock = 0;
  let firstKeys: string[] | undefined;
  const kept: Raw[] = [];
  for await (const rec of readXmlItems(response.body as unknown as AsyncIterable<Uint8Array>)) {
    fetchedRows++;
    if (!firstKeys) firstKeys = Object.keys(rec);
    if ((rec.availability || "").toLowerCase().replace(/\s+/g, "_") !== "in_stock") { outOfStock++; continue; }
    kept.push(rec);
  }
  const streamedAt = Date.now();

  // Suojaus: tyhjä tai virheellinen vastaus (esim. HTML-virhesivu) ei saa tyhjentää kauppaa.
  if (fetchedRows === 0) {
    throw new Error(`${store.displayName}: syötteestä ei löytynyt yhtään <item>-riviä - kauppaa ei päivitetty.`);
  }
  const { products, stats } = mapAdtractionRecords(kept, store);
  if (products.length === 0) {
    throw new Error(
      `${store.displayName}: syötteessä oli ${fetchedRows} riviä mutta yhtään tuotetta ei hyväksytty ` +
      `(sarakkeet: ${(firstKeys || []).join(",")}) - kauppaa ei päivitetty.`,
    );
  }
  const mappedAt = Date.now();

  await new RedisProductStore(store.storeKey).replaceAll(products);
  const savedAt = Date.now();

  return {
    storeKey: store.storeKey,
    displayName: store.displayName,
    fetchedRows,
    importedProducts: products.length,
    skippedRows: outOfStock + stats.notClothingOrAdult + stats.unsafe + stats.noPrice,
    outOfStockRows: outOfStock,
    notChildRows: stats.notClothingOrAdult,
    durationMs: savedAt - startedAt,
    timings: { headersMs: headersAt - startedAt, streamMs: streamedAt - headersAt, dedupeMs: mappedAt - streamedAt, saveMs: savedAt - mappedAt },
  };
}
