import { MultiStoreAdapter } from "../adapters/multi-store-adapter";
import { IKeyValueStore } from "../store/kv-store";
import { Lang, ViewOpts } from "../lang";
import { parseItemList, parseFilters } from "./items";
import { runStructuredSearch, runFacets } from "./search";
import { cachedJson, cacheKey } from "./cache";

// Rakenteisen haun ja facetsin pyyntölogiikka ilman HTTP-kerrosta (testattavissa InMemory-kaupoilla).
// api/search.ts ja api/facets.ts ovat ohuita kuoria näiden ympärillä.

export const MAX_SEARCH_ITEMS = 10;
export const MAX_FACET_ITEMS = 20;

export interface HandlerResult {
  status: number;
  /** Valmis JSON-merkkijono (facets tulee välimuistista sellaisenaan) tai objekti. */
  body: unknown;
  cache?: "memory" | "redis" | "miss";
}

const MSG: Record<string, Record<Lang, string>> = {
  items_missing: { fi: "Anna items-parametri, esim. ?items=haalari+winter,pipo", sv: "Ange parametern items, t.ex. ?items=haalari+winter,pipo", en: "Provide the items parameter, e.g. ?items=haalari+winter,pipo" },
  items_invalid: { fi: "Virheellinen item", sv: "Ogiltigt item", en: "Invalid item" },
  items_too_many: { fi: "Liian monta itemiä", sv: "För många items", en: "Too many items" },
  params_invalid: { fi: "Virheelliset parametrit", sv: "Ogiltiga parametrar", en: "Invalid parameters" },
};

function itemsError(parsed: { error: string; invalid_items?: string[] }, max: number, lang: Lang): HandlerResult {
  if (parsed.invalid_items) return { status: 400, body: { error: MSG.items_invalid[lang], invalid_items: parsed.invalid_items } };
  if (parsed.error.startsWith("items puuttuu")) return { status: 400, body: { error: MSG.items_missing[lang] } };
  return { status: 400, body: { error: `${MSG.items_too_many[lang]} (max ${max})` } };
}

export async function structuredSearchResponse(
  query: Record<string, unknown>, view: ViewOpts, adapter: MultiStoreAdapter,
): Promise<HandlerResult> {
  const lang = view.lang ?? "fi";
  const items = parseItemList(query.items, MAX_SEARCH_ITEMS);
  if (!items.ok) return itemsError(items, MAX_SEARCH_ITEMS, lang);
  const filters = parseFilters(query);
  if (!filters.ok) return { status: 400, body: { error: MSG.params_invalid[lang], invalid_params: filters.invalid_params } };
  const [products, lastImported] = await Promise.all([adapter.loadAllProducts(), adapter.lastImportedAt()]);
  return { status: 200, body: runStructuredSearch(products, items.items, filters.filters, view, lastImported) };
}

export async function facetsResponse(
  query: Record<string, unknown>, lang: Lang, adapter: MultiStoreAdapter, kv: IKeyValueStore | null,
): Promise<HandlerResult> {
  const items = parseItemList(query.items, MAX_FACET_ITEMS);
  if (!items.ok) return itemsError(items, MAX_FACET_ITEMS, lang);
  const filters = parseFilters(query);
  if (!filters.ok) return { status: 400, body: { error: MSG.params_invalid[lang], invalid_params: filters.invalid_params } };
  // brand_items: itemit, joiden tuotteista brändilista lasketaan (puuttuu = kaikki items).
  let brandItems = items.items;
  if (query.brand_items !== undefined && String(query.brand_items).trim() !== "") {
    const parsed = parseItemList(query.brand_items, MAX_FACET_ITEMS);
    if (!parsed.ok) return itemsError(parsed, MAX_FACET_ITEMS, lang);
    brandItems = parsed.items;
  }
  // Välimuisti mitätöityy uuden tuonnin lisäksi uudella julkaisulla (koodi voi muuttaa laskentaa, esim.
  // luokittelu tai suodatus), joten versioon liitetään julkaisun commit.
  const importVersion = await adapter.importVersion();
  const version = importVersion ? `${importVersion}#${(process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 12)}` : "";
  // Määrät eivät riipu kielestä eivätkä markkinasta -> avaimessa vain itemit, brändi-itemit ja suodattimet.
  const key = cacheKey("facets:v2", { items: items.items.map((i) => i.id), brand_items: brandItems.map((i) => i.id), filters: filters.filters });
  const { json, cache } = await cachedJson(kv, key, version, async () => {
    const [products, lastImported] = await Promise.all([adapter.loadAllProducts(), adapter.lastImportedAt()]);
    return JSON.stringify(runFacets(products, items.items, filters.filters, lastImported, brandItems));
  });
  return { status: 200, body: json, cache };
}
