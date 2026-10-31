import { gunzipSync } from "zlib";
import { parse } from "csv-parse/sync";
import { config } from "../config";
import { Product, Currency } from "../types";
import { RedisProductStore } from "../store/product-store";
import { guessGarmentType } from "../nlu/garment-keywords";
import { guessWinter } from "../season";
import { StoreDefinition } from "../stores-registry";
import { isChildSafeProductForStore, hasChildMarkers } from "../safety/child-safety-filter";

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

function buildClassicFeedUrl(store: StoreDefinition & { feedId: string }): string {
  const apiKey = config.awin.datafeedApiKey();
  if (store.classicColumns) {
    // Täsmälleen Awinin Datafeeds.csv:n / Create-a-Feed'in tuottama muoto
    // (sarakkeet URL-enkoodattuna, esim. "Fashion%3Asize").
    const cols = store.classicColumns.map(encodeURIComponent).join("%2C");
    return (
      `https://productdata.awin.com/datafeed/download/apikey/${apiKey}` +
      `/fid/${store.feedId}/format/csv/language/${store.classicLanguage || "any"}` +
      `/delimiter/%2C/compression/gzip/columns/${cols}/`
    );
  }
  return (
    `https://productdata.awin.com/datafeed/download/apikey/${apiKey}` +
    `/language/any/fid/${store.feedId}/columns/${COLUMNS}` +
    // LAPSITURVALLISUUS: adultcontent/0 = EI aikuissisältöä feedissä.
    `/format/csv/delimiter/%2C/compression/gzip/adultcontent/0/`
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
  // LAPSITURVALLISUUS (korkea prioriteetti): hylätään aikuis-/seksuaali-
  // sisältöiset tai muuten epävarmat tuotteet ennen kuin niitä käsitellään
  // tai tallennetaan lainkaan. Ks. src/safety/child-safety-filter.ts.
  const safety = isChildSafeProductForStore(storeKey, {
    title: row.title,
    category: row.google_product_category || row.product_type,
    description: row.description,
    ageGroup: row.age_group,
  });
  if (!safety.safe) return null;
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
    winter: guessWinter(row.title, row.google_product_category || row.product_type, row.description),
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
  // Outnorthin feedien kentät
  category_name?: string; merchant_product_category_path?: string;
  product_price_old?: string; base_price?: string; aw_image_url?: string;
  "Fashion:suitable_for"?: string; "Fashion:size"?: string;
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
  if (/girl|female|flick|tytö|tytt/.test(v)) return "tyttö";
  if (/boy|male|pojk|pojat|poika|pojille/.test(v)) return "poika";
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
  // Eri mainostajien classic-feedit nimeävät samat asiat eri sarakkeisiin
  // (Outnorth: Fashion:size, Fashion:suitable_for, product_price_old/
  // base_price, category_name) - poimitaan ensisijainen arvo kummasta tahansa.
  const category = row.merchant_category || row.category_name || row.product_type || row.merchant_product_category_path;
  const suitableFor = row["Fashion:suitable_for"] || row.gender || row.age_group;
  const sizeRaw = row["Fashion:size"] || row.size;
  // LAPSITURVALLISUUS (korkea prioriteetti) - ks. mapGoogleRow yllä ja
  // src/safety/child-safety-filter.ts.
  const safety = isChildSafeProductForStore(storeKey, {
    title: row.product_name,
    category,
    description: row.description,
    ageGroup: row.age_group,
  });
  if (!safety.safe) return null;
  const price = parseMoney(row.search_price, row.currency);
  // HUOM: base_price (Outnorth FI) on hinta ILMAN ALVia, ei alkuperäinen
  // hinta - sitä ei käytetä. Alkuperäiseksi hinnaksi kelpaa vain korkeampi
  // kuin nykyinen hinta.
  const rawOriginal = parseMoney(row.store_price || row.product_price_old, row.currency);
  if (!price) return null;
  const originalPrice = rawOriginal && rawOriginal.amount > price.amount ? rawOriginal : null;
  const discountPercent = originalPrice && originalPrice.amount > price.amount
    ? Math.round((1 - price.amount / originalPrice.amount) * 100) : null;

  return {
    id: `${storeKey}:${row.aw_product_id}`,
    source: storeKey,
    title: row.product_name,
    brand: row.brand_name || "Tuntematon",
    garment_type: guessGarmentType(row.merchant_category || row.category_name, row.product_type || row.merchant_product_category_path, row.product_name),
    price, original_price: originalPrice, discount_percent: discountPercent,
    size_available: sizeRaw ? [sizeRaw] : [],
    size_normalized: null,
    material: null,
    waterproof: guessWaterproof(row.description, row.product_name),
    color: row.colour || null,
    gender: guessGender(suitableFor),
    url_affiliate: row.aw_deep_link,
    image_url: row.merchant_image_url || row.aw_image_url || "",
    in_stock: (row.in_stock || "").toLowerCase() !== "false" && row.in_stock !== "0",
    shipping_cost_from: parseMoney(row.delivery_cost, row.currency),
    free_shipping_threshold: null,
    rating: null, rating_count: null,
    winter: guessWinter(row.product_name, category, row.description),
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
  // Kuinka monta riviä hylättiin koska niissä ei ollut lapsimerkkiä
  // (vain childOnly-kaupoille, esim. Outnorth).
  notChildRows?: number;
  durationMs?: number;
}

export async function importAwinStore(store: StoreDefinition & { feedId: string }): Promise<ImportResult> {
  const startedAt = Date.now();
  const url = store.format === "google" ? buildGoogleFeedUrl(store.feedId) : buildClassicFeedUrl(store);
  // Osa CDN:istä (mm. Awinin CloudFront) hylkää pyynnöt ilman User-Agentia -
  // Noden oma fetch ei lähetä sitä oletuksena, mikä voi näkyä geneerisenä
  // "fetch failed" -virheenä ilman HTTP-statuskoodia.
  const response = await fetch(url, {
    headers: { "User-Agent": "Vaateta/1.0 (+https://vaateta.com)", Accept: "text/csv,*/*" },
  });
  if (!response.ok) {
    // Diagnostiikka: Awin kertoo usein virheen syyn vastauksen rungossa
    // (esim. väärä apikey, feediä ei ole liitetty julkaisijaan). API-avain
    // peitetään, ettei se vuoda virheilmoituksen kautta.
    let bodySnippet = "";
    try {
      bodySnippet = (await response.text()).replace(/\s+/g, " ");
      // Awin kaiuttaa pyydetyn polun (apikey mukana) 404-vastauksen runkoon -
      // peitetään avain ja token myös sieltä ennen kuin teksti palautetaan.
      bodySnippet = bodySnippet.replace(/(apikey\/)[^/\s"]+/g, "$1***").replace(/(publisher\/[^/]+\/)[^/\s"]+/g, "$1***").slice(0, 400);
    } catch { /* ei runkoa */ }
    const maskedUrl = url
      .replace(/apikey\/[^/]+/, "apikey/***")
      .replace(/(publisher\/[^/]+\/)[^/]+/, "$1***");
    throw new Error(
      `${store.displayName}: Awin-feedin lataus epäonnistui (${response.status} ${response.statusText}). ` +
      `Tarkista AWIN_DATAFEED_API_KEY/AWIN_PUBLISHER_ID/AWIN_FEEDLIST_TOKEN ja ${store.feedIdEnvVar}. ` +
      `URL: ${maskedUrl} | Awinin vastaus: ${bodySnippet || "(tyhjä)"}`
    );
  }

  // Puretaan gzip tavujen "taikanumeron" (1f 8b) perusteella: Node/undici voi
  // purkaa Content-Encoding:n itse, tai Awin voi palauttaa raakaa .gz-tiedostoa
  // - molemmat tapaukset hoituvat tunnistamalla muoto datasta itsestään.
  const buf = Buffer.from(await response.arrayBuffer());
  const csvText = (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString("utf-8");

  // childOnly-kaupoissa (Outnorth ~95k riviä, pääosin aikuisten tuotteita)
  // pudotetaan ei-lapsirivit jo jäsennysvaiheessa (on_record), jottei koko
  // 95k rivin taulukkoa pidetä muistissa.
  let fetchedRows = 0;
  let notChildRows = 0;
  let firstRowKeys: string[] | undefined;
  const rows: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    on_record: (record: Record<string, string>) => {
      fetchedRows++;
      if (!firstRowKeys) firstRowKeys = Object.keys(record);
      if (store.childOnly) {
        const text = [
          record.product_name || record.title,
          record.merchant_category || record.google_product_category,
          record.category_name, record.merchant_product_category_path, record.product_type,
          record["Fashion:suitable_for"],
        ].filter(Boolean).join(" ");
        if (!hasChildMarkers(text, record.age_group)) {
          notChildRows++;
          return null;
        }
      }
      return record;
    },
  });

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
    fetchedRows,
    importedProducts: deduped.length,
    skippedRows: skipped + (products.length - deduped.length),
    sampleRowKeys: products.length === 0 && fetchedRows > 0 ? firstRowKeys : undefined,
    notChildRows: store.childOnly ? notChildRows : undefined,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Monet feedit (erityisesti Google Shopping -skeema) listaavat saman tuotteen
// kerran JOKAISTA kokoa/väriä kohden omalla rivillään. Kokeiltiin aluksi
// ryhmittelyä url_affiliate:n mukaan, MUTTA Voghionin feedissä jokaisella
// koko/värivariantilla on oma UNIIKKI tuotelinkki (eri product_id URLissa),
// vaikka nimi, brändi ja hinta ovat identtiset - url_affiliate ei siis
// tunnista näitä samaksi tuotteeksi. Ryhmitellään sen sijaan ensisijaisesti
// nimen+brändin+hinnan mukaan (sama tuote eri koossa/värissä = sama nimi ja
// hinta), ja vain jos nimi puuttuu käytetään url_affiliate:ia varalla.
// Edustajaksi valitaan halvin variantti, ja kerätään kaikkien varianttien
// koot yhteen size_available-listaan.
// ---------------------------------------------------------------------------
function dedupeVariants(products: Product[]): Product[] {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.title
      ? `${p.title}::${p.brand}::${p.price.amount}`
      : p.url_affiliate || `${p.brand}::${p.price.amount}::${p.id}`;
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
