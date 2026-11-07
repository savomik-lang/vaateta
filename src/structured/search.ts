import { Product, SearchCriteria, GarmentType } from "../types";
import { matchesCriteria, targetSizeCm, isTeenSearch } from "../adapters/multi-store-adapter";
import { dedupeResults } from "../ranking/offers";
import { rankResults, RankedResults } from "../ranking/rank";
import { fitContextFromCriteria } from "../ranking/fit";
import { filterChildSafe } from "../safety/filter-products";
import { cmForShoeEu } from "../size";
import { ViewOpts } from "../lang";
import {
  Notice, findRelaxation, buildNoResultsNotice, buildPartialSizeNotice, buildLimitedCoverageNotice,
} from "../search-notice";
import { Filters, ParsedItem, brandKey, isUnknownBrand, pickBrandDisplayName } from "./items";

// ---------------------------------------------------------------------------
// Rakenteinen haku ja facets. Käyttävät samaa suodatusta (matchesCriteria), turvasuodatusta,
// dedupea ja rankkausta kuin tekstihaku, joten luvut ja tulokset ovat samat kuin
// vastaavalla `q`-haulla. Lapsisignaali on aina päällä.
// ---------------------------------------------------------------------------

const SMALL_RESULT_LIMIT = 5;

/** Tuotteet vaatetyypeittäin: item-haku käy vain oman tyyppinsä läpi koko katalogin sijaan. */
export type ProductIndex = Map<GarmentType, Product[]>;

export function buildIndex(products: Product[]): ProductIndex {
  const index: ProductIndex = new Map();
  for (const p of products) {
    const list = index.get(p.garment_type);
    if (list) list.push(p);
    else index.set(p.garment_type, [p]);
  }
  return index;
}

export function criteriaForItem(item: ParsedItem, filters: Filters): SearchCriteria {
  const c: SearchCriteria = { garment_type: item.garment, child_signal: true };
  if (item.winter) c.season = "winter";
  if (item.wp) c.waterproof = true;
  if (filters.gender) c.child_gender_pref = filters.gender;
  // Kengille shoe_eu (tarkka EU-koko; size_cm on vain kokosuodatuksen portti); muuten size_cm.
  if (item.garment === "kengät" && filters.shoe_eu !== null) {
    const cm = cmForShoeEu(filters.shoe_eu);
    c.size_cm = cm; c.size_raw = String(cm); c.shoe_eu = filters.shoe_eu;
  } else if (filters.size_cm !== null) {
    c.size_cm = filters.size_cm; c.size_raw = String(filters.size_cm);
  }
  return c;
}

function poolFor(index: ProductIndex, item: ParsedItem, filters: Filters): Product[] {
  const pool = index.get(item.garment) ?? [];
  if (filters.brands.length === 0) return pool;
  const keys = new Set(filters.brands.map(brandKey));
  return pool.filter((p) => keys.has(brandKey(p.brand)));
}

function run(pool: Product[], c: SearchCriteria, view: ViewOpts, opts = {}): Product[] {
  return dedupeResults(filterChildSafe(pool.filter((p) => matchesCriteria(p, c, opts))), fitContextFromCriteria(c, view.market), view);
}

export interface ItemMatches {
  criteria: SearchCriteria;
  pool: Product[];
  matches: Product[];
  /** Mukana myös hieman pienempiä kokoja (alle 5 täsmälleen sopivaa). */
  extended: boolean;
}

/** Itemin osumat. Sama logiikka kuin q-haussa; facets käyttää tämän pituutta. */
export function collectMatches(index: ProductIndex, item: ParsedItem, filters: Filters, view: ViewOpts): ItemMatches {
  const criteria = criteriaForItem(item, filters);
  // Alatyypit tulevat vaiheessa B2; siihen asti alatyyppi-itemillä ei ole osumia.
  if (item.subtype) return { criteria, pool: [], matches: [], extended: false };
  const pool = poolFor(index, item, filters);
  let matches = run(pool, criteria, view);
  let extended = false;
  if (targetSizeCm(criteria) !== undefined && matches.length < SMALL_RESULT_LIMIT) {
    const ext = run(pool, criteria, view, { allowSmaller: true });
    if (ext.length > matches.length) { matches = ext; extended = true; }
  }
  return { criteria, pool, matches, extended };
}

const EMPTY: RankedResults = { bestMatch: [], cheapest: [], bestValue: [], mostLoved: null };

export interface ItemGroup {
  item: string;
  total_matches: number;
  results: RankedResults;
  notice: Notice | null;
}

export function searchItem(index: ProductIndex, item: ParsedItem, filters: Filters, view: ViewOpts): ItemGroup {
  const lang = view.lang ?? "fi";
  const { criteria, pool, matches, extended } = collectMatches(index, item, filters, view);
  if (matches.length === 0) {
    const relax = pool.length > 0 ? findRelaxation(criteria, (c) => run(pool, c, view)) : null;
    return { item: item.id, total_matches: 0, results: EMPTY, notice: item.subtype ? null : buildNoResultsNotice(criteria, relax, lang) };
  }
  let notice: Notice | null = extended ? buildPartialSizeNotice(criteria, lang) : null;
  if (!notice && isTeenSearch(criteria) && matches.length <= SMALL_RESULT_LIMIT) notice = buildLimitedCoverageNotice(lang);
  return {
    item: item.id,
    total_matches: matches.length,
    results: rankResults(matches, fitContextFromCriteria(criteria, view.market)),
    notice,
  };
}

export interface StructuredResponse {
  mode: "structured";
  lang: string;
  market: string;
  last_imported: string | null;
  filters: Filters;
  total_matches: number;
  groups: ItemGroup[];
}

export function runStructuredSearch(
  products: Product[], items: ParsedItem[], filters: Filters, view: ViewOpts, lastImported: string | null,
): StructuredResponse {
  const index = buildIndex(products);
  const groups = items.map((item) => searchItem(index, item, filters, view));
  return {
    mode: "structured",
    lang: view.lang ?? "fi",
    market: view.market ?? "FI",
    last_imported: lastImported,
    filters,
    total_matches: groups.reduce((sum, g) => sum + g.total_matches, 0),
    groups,
  };
}

export interface FacetsResponse {
  items: Record<string, number>;
  subtypes: Record<string, string[]>;
  brands: { name: string; count: number }[];
  last_imported: string | null;
}

export const MAX_FACET_BRANDS = 30;

/**
 * Määrät itemeittäin: täsmälleen sama luku kuin rakenteisen haun total_matches samoilla suodattimilla.
 * Brändilista lasketaan `brandItems`-itemien (oletus: kaikki items) yhteisistä tuotteista ILMAN
 * brands-rajausta, jotta jo valitut brändit eivät häviä listasta (monivalinta). Sama tuote
 * lasketaan kerran, vaikka se osuisi useaan itemiin (esim. takki ja takki+wp).
 */
export function runFacets(
  products: Product[], items: ParsedItem[], filters: Filters, lastImported: string | null, brandItems: ParsedItem[] = items,
): FacetsResponse {
  const index = buildIndex(products);
  const counts: Record<string, number> = {};
  const noBrandFilter: Filters = { ...filters, brands: [] };
  // Brändittömien osumien välimuisti: jos brands-rajausta ei ole, itemien laskennan tulos kelpaa sellaisenaan.
  const unrestricted = new Map<string, Product[]>();
  for (const item of items) {
    if (item.id in counts) continue;
    const m = collectMatches(index, item, filters, {});
    counts[item.id] = m.matches.length;
    if (filters.brands.length === 0) unrestricted.set(item.id, m.matches);
  }

  const byBrand = new Map<string, { count: number; variants: Map<string, number> }>();
  const seenProducts = new Set<string>();
  for (const item of brandItems) {
    const matches = unrestricted.get(item.id) ?? collectMatches(index, item, noBrandFilter, {}).matches;
    unrestricted.set(item.id, matches);
    for (const p of matches) {
      if (seenProducts.has(p.id) || isUnknownBrand(p.brand)) continue;
      seenProducts.add(p.id);
      const key = brandKey(p.brand);
      const entry = byBrand.get(key) ?? { count: 0, variants: new Map<string, number>() };
      entry.count++;
      const raw = p.brand.normalize("NFC").trim().replace(/\s+/g, " ");
      entry.variants.set(raw, (entry.variants.get(raw) ?? 0) + 1);
      byBrand.set(key, entry);
    }
  }
  const brands = [...byBrand.values()]
    .map((e) => ({ name: pickBrandDisplayName(e.variants), count: e.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_FACET_BRANDS);

  // Alatyypit: vaihe B2, seuraava osa.
  return { items: counts, subtypes: {}, brands, last_imported: lastImported };
}
