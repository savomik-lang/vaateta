import { Product, Currency, GarmentType } from "../types";
import { RedisProductStore } from "../store/product-store";
import { guessGarmentType } from "../nlu/garment-keywords";
import { guessWinter } from "../season";
import { parseSizeToken } from "../size";
import { StoreDefinition } from "../stores-registry";
import { isChildSafeProductForStore, hasChildMarkers } from "../safety/child-safety-filter";
import { convertFeedSize } from "./adtraction-sizes";
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
  // Polarn O. Pyret (tuotepolun viimeinen osa)
  "unilelut", "viltit", "paikkaus-merkitseminen", "tekstiilien-hoito", "aurinkolasit", "kaulalappu",
  "vastasyntynyt-unituotteet", "farkunsininen",
  // Lindex (tuotepolun viimeinen osa englanniksi): korut, laukut, vyöt, meikit, vauvatarvikkeet (helistin, hoitoalusta, ruokalappu)
  "jewellery & watches", "handbags, wallets & cases", "duffel bags", "belts", "clothing accessories",
  "baby & toddler clothing", "baby & toddler clothing accessories", "nappy bucket accessories", "activewear",
  "eye shadow", "lipstick", "lip gloss", "cosmetic tools",
]);

// Alusvaatteet englanninkielisessä tuotepolussa (Lindex): pois. Yleinen "underwear & socks" sisältää myös sukat,
// jotka hyväksytään otsikon perusteella.
const UNDERWEAR_LEAFS = new Set(["underwear", "lingerie", "bras", "underwear slips", "shapewear", "lingerie accessories"]);
const SOCK_TITLE_REGEX = /sukk|sock|tights|sukkahous/i;
const TIGHTS_TITLE_REGEX = /sukkahous|tights/i;

// Metsolan tuotetyyppi -> tyyppi silloin kun yleinen arvaus menisi väärin.
const TYPE_OVERRIDES: Record<string, GarmentType> = {
  "yövaate": "pyjama",
  "yövaatteet": "pyjama",
  "yövaate / pyjama": "pyjama",
  "kylpytakki": "muu", // kylpytakki ei ole takki
  "huivi": "muu",
  "panta": "muu",
  "hame": "muu",
  "robes": "muu", // Lindex: aamutakit ja kylpytakit
  "haalari/jumpsuit": "haalari",
  "haalari / jumpsuit": "haalari",
  "jumpsuit": "haalari",
};

// Yksittäiset varalapaset ("Vedenpitävä kuorirukkanen, vasen", "Topattu yksittäinen rukkanen oikeaan käteen"):
// asiakas luulisi ostavansa parin, joten ne jätetään pois.
const SINGLE_ITEM_TITLE_REGEX = /(?<![\p{L}\p{N}])yksittäi\p{L}*|(?<![\p{L}\p{N}])(?:vasen|oikea)(?:\s+käteen)?\s*$/iu;

// Alusvaatteet (bokserit, alushousut) ja bikinit (myös suomalaiset yhdyssanat: "Bikinisetti") eivät kuulu lastenvaatehakuun - sama turvalinja kuin child-safety-filterissä.
const UNDERWEAR_TITLE_REGEX = /(?<![\p{L}\p{N}])(?:bokseri\p{L}*|alushous\p{L}*|alusvaat\p{L}*|bikini\p{L}*|boxers?|briefs|underpants|underwear)(?![\p{L}\p{N}])/iu;

// "alusvaatteet"-polun alla hyväksytyt tuotteet (viimeinen osa).
const UNDERWEAR_PATH_OK = new Set(["sukat", "sukkahousut"]);

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
  /** childOnly-kaupat: tuotteet, joissa ei ole lapsimerkkiä (Kekäle: aikuisten muotia). */
  notChild: number;
  unsafe: number;
  noPrice: number;
}

/** Kauppakohtaiset tuontisäännöt (stores-registry). */
export type AdtractionStoreRules = Pick<StoreDefinition, "storeKey" | "fixedBrand" | "childOnly" | "childBrands" | "sizeUnknown" | "adtraction">;

/** Tuotepolku "a  >  b  >  c" -> viimeinen osa pienellä ("c"); ei polkua -> koko arvo. */
export function lastCategorySegment(productType: string | undefined): string {
  const parts = (productType || "").split(">").map((x) => x.trim()).filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}

const GENDER_GIRL = /^(female|girls?|tyttö|tytöt|flicka)/i;
const GENDER_BOY = /^(male|boys?|poika|pojat|pojke)/i;
function genderOf(raw: string | undefined): "tyttö" | "poika" | null {
  const g = (raw || "").trim();
  if (GENDER_GIRL.test(g)) return "tyttö";
  if (GENDER_BOY.test(g)) return "poika";
  return null; // unisex tai tyhjä
}

// Toimituskulu g:shipping-lohkosta ("<g:country>FI</g:country><g:price>4.9 EUR</g:price>").
function shippingFrom(raw: string | undefined): { amount: number; currency: Currency } | null {
  const m = (raw || "").match(/<g:price>\s*([^<]*?)\s*<\/g:price>/);
  if (!m) return null;
  const p = m[1].trim().match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-z]{3})?$/);
  if (!p) return null;
  const amount = parseFloat(p[1].replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? { amount, currency: ((p[2] || "EUR").toUpperCase()) as Currency } : null;
}

// Tuotesivun osoitteen viimeinen osa Adtractionin seurantalinkistä: "...&url=https://www.lindex.com/fi/p/3009518-7483" -> "3009518-7483".
export function landingKey(link: string | undefined): string | null {
  const m = (link || "").match(/[?&]url=(https?:\/\/[^&\s]+)/i);
  if (!m) return null;
  try {
    const parts = new URL(m[1]).pathname.split("/").filter(Boolean);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : null;
  } catch { return null; }
}

interface Variant {
  raw: Raw;
  size: string | null;
  price: { amount: number; currency: Currency };
  original: { amount: number; currency: Currency } | null;
}

// Vaatetyyppi: Metsolalla tuotetyyppi + otsikko yhdessä (ennallaan); titleFirstTypes-kaupoilla otsikko ensin
// ja tuotepolun viimeinen osa vasta, jos otsikosta ei tunnistu mitään.
export function garmentFor(productType: string | undefined, baseTitle: string, rules: NonNullable<StoreDefinition["adtraction"]>): GarmentType {
  const typeKey = (productType || "").trim().toLowerCase();
  const leaf = lastCategorySegment(productType);
  const override = TYPE_OVERRIDES[typeKey] ?? (rules.categoryPaths ? TYPE_OVERRIDES[leaf] : undefined);
  if (override) return override;
  if (rules.titleFirstTypes) {
    const byTitle = guessGarmentType(baseTitle);
    if (byTitle !== "muu") return byTitle;
    return guessGarmentType((rules.categoryPaths ? leaf : productType || "").replace(/-/g, " "));
  }
  return guessGarmentType(productType, baseTitle);
}

// Syötteen g:color (Polarn O. Pyret englanniksi pienellä, Kekäle suomeksi isoilla): "blue" -> "Blue".
function feedColor(raw: string | undefined): string | null {
  const c = (raw || "").replace(/\s+/g, " ").trim();
  if (!c || c.length > 40) return null;
  const t = titleCaseIfShouting(c);
  return t === t.toLowerCase() ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Puhdas muunnos: syöterivit -> tuotteet. Testattava ilman verkkoa ja Redisiä.
export function mapAdtractionRecords(records: Raw[], store: AdtractionStoreRules): { products: Product[]; stats: AdtractionStats } {
  const stats: AdtractionStats = { rows: 0, outOfStock: 0, notClothingOrAdult: 0, notChild: 0, unsafe: 0, noPrice: 0 };
  const rules = store.adtraction ?? {};
  const childBrands = new Set((store.childBrands ?? []).map((b) => b.trim().toLowerCase()));
  const childTypes = new Set((rules.childProductTypes ?? []).map((x) => x.trim().toLowerCase()));
  const excludeTitle = rules.excludeTitle ? new RegExp(rules.excludeTitle, "i") : null;
  const groups = new Map<string, { base: string; variants: Variant[] }>();

  for (const r of records) {
    stats.rows++;
    if ((r.availability || "").toLowerCase().replace(/\s+/g, "_") !== "in_stock") { stats.outOfStock++; continue; }
    if (!r.id || !r.title || !r.link) continue;
    const type = rules.categoryPaths ? lastCategorySegment(r.product_type) : (r.product_type || "").trim().toLowerCase();
    const split = splitTitleSize(r.title, r.size);
    const { baseTitle, adultSize } = split;
    // Muunnettavat koot (Polarn O. Pyret) säilytetään alkuperäisinä: "1 - 3" ei ole tunnistettu koko ennen muunnosta.
    const size = rules.convertSizes && r.size && !adultSize ? r.size.trim() : split.size;
    // Lastentuote: tunnettu lastenmerkki tai kaupan lastentuotetyyppi (Björn Borg "Kids"), vaikka age_group olisi "adult".
    const childMarked = childBrands.has((r.brand || "").trim().toLowerCase()) || childTypes.has((r.product_type || "").trim().toLowerCase());
    if ((r.age_group || "").trim().toLowerCase() === "adult" && !childMarked) {
      stats.notClothingOrAdult++; continue;
    }
    if (excludeTitle && excludeTitle.test(r.title)) { stats.notClothingOrAdult++; continue; }
    if (
      type.startsWith("aikuisten") || NON_CLOTHING_TYPES.has(type) || (!rules.categoryPaths && type.includes(" > ")) ||
      /women/i.test(r.brand || "") || ADULT_TITLE_REGEX.test(r.title) ||
      (split.size === null && FABRIC_TITLE_REGEX.test(r.title)) || NON_CLOTHING_TITLE_REGEX.test(r.title) || UNDERWEAR_TITLE_REGEX.test(r.title) || SINGLE_ITEM_TITLE_REGEX.test(r.title) || adultSize
    ) { stats.notClothingOrAdult++; continue; }
    // Alusvaatteet eivät kuulu lastenvaatehakuun (turvalinja, ks. child-safety-filter): Polarn O. Pyretin
    // "alusvaatteet"-polun alla on myös sukat ja sukkahousut, jotka hyväksytään.
    const pathParts = (r.product_type || "").split(">").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (rules.categoryPaths && pathParts.includes("alusvaatteet") && !UNDERWEAR_PATH_OK.has(pathParts[pathParts.length - 1])) {
      stats.notClothingOrAdult++; continue;
    }
    if (rules.categoryPaths && (UNDERWEAR_LEAFS.has(type) || (type === "underwear & socks" && !SOCK_TITLE_REGEX.test(r.title)))) {
      stats.notClothingOrAdult++; continue;
    }
    if (store.childOnly && !childMarked && !hasChildMarkers(`${r.title} ${r.product_type || ""}`, r.age_group)) {
      stats.notChild++; continue;
    }
    const safety = isChildSafeProductForStore(store.storeKey, {
      // Tuotepolusta turvatarkistukseen vain viimeinen osa (polun "alusvaatteet" estäisi sukat).
      title: r.title,
      // Lindexin yleinen "underwear & socks" -luokka sisältää myös sukat (hyväksytty otsikon perusteella ylempänä):
      // luokan nimi ei saa osua alusvaate-estolistaan.
      category: rules.categoryPaths ? (type === "underwear & socks" ? "" : type) : r.product_type,
      // Tunnetun lastenmerkin tuotteen "adult"-merkintä on syötteen virhe (Kekäle) -> ei hylkäysperusteena.
      description: r.description,
      ageGroup: childMarked && (r.age_group || "").trim().toLowerCase() === "adult" ? "kids" : r.age_group,
    });
    if (!safety.safe) { stats.unsafe++; continue; }
    const list = parsePrice(r.price);
    const sale = parsePrice(r.sale_price);
    const price = sale && list && sale.amount < list.amount ? sale : list;
    if (!price) { stats.noPrice++; continue; }
    const original = sale && list && sale.amount < list.amount ? list : null;
    const key = (rules.groupByLink ? landingKey(r.link) : null) || r.item_group_id || baseTitle;
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
      const title = titleCaseIfShouting(g.base);
      const garment = garmentFor(r.product_type, g.base, rules);
      // Koot: muunnettavat (sukat, pipot, käsineet) pituudeksi; aikuisten koot pois.
      const sizeSet = new Set<string>();
      let adultVariants = 0;
      for (const v of variants) {
        if (!v.size) continue;
        // Sukkahousujen koot ovat senttikokoja (ei kenkäkokoja kuten sukkien): ei muunneta.
        if (rules.convertSizes && !TIGHTS_TITLE_REGEX.test(g.base)) {
          const conv = convertFeedSize(v.size, garment, rules.convertSizes === "lindex" ? "lindex" : true);
          if (conv.adult) { adultVariants++; continue; }
          sizeSet.add(conv.size ?? (parseSizeToken(v.size).kind === "unknown" ? "One Size" : v.size));
        } else sizeSet.add(v.size);
      }
      if (adultVariants > 0 && sizeSet.size === 0) { stats.notClothingOrAdult += adultVariants; return; }
      const sizes = Array.from(sizeSet);
      sizes.sort((a, b) => sizeSortKey(a) - sizeSortKey(b));
      const discount = first.original ? Math.round((1 - first.price.amount / first.original.amount) * 100) : null;
      const shipping = variants.map((v) => shippingFrom(v.raw.shipping)).filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => a.amount - b.amount)[0] ?? null;
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
        // Kokotiedottomassa syötteessä (Kekäle) lista jää tyhjäksi ja kauppa on merkitty sizeUnknown.
        size_available: sizes.length ? sizes : store.sizeUnknown ? [] : ["One Size"],
        size_normalized: null,
        material: null,
        waterproof: /vedenpitävä|waterproof/i.test(`${r.description || ""} ${r.title}`) ? true : null,
        color: feedColor(r.color) ?? colorFromTitle(g.base),
        gender: genderOf(r.gender),
        url_affiliate: r.link,
        image_url: variants.map((v) => v.raw.image_link).find(Boolean) || "",
        in_stock: true,
        shipping_cost_from: shipping,
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
    skippedRows: outOfStock + stats.notClothingOrAdult + stats.notChild + stats.unsafe + stats.noPrice,
    outOfStockRows: outOfStock,
    notChildRows: stats.notClothingOrAdult + stats.notChild,
    durationMs: savedAt - startedAt,
    timings: { headersMs: headersAt - startedAt, streamMs: streamedAt - headersAt, dedupeMs: mappedAt - streamedAt, saveMs: savedAt - mappedAt },
  };
}
