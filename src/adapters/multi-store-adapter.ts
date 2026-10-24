import { Product, SearchCriteria } from "../types";
import { RedisProductStore, InMemoryProductStore, IProductStore } from "../store/product-store";
import { AWIN_STORES, getConfiguredStores } from "../stores-registry";

// ---------------------------------------------------------------------------
// Hakee JOKAISESTA rekisteröidystä kaupasta (Outnorth SE/FI, Voghion Global,
// ja mikä tahansa myöhemmin lisätty) ja yhdistää tulokset yhdeksi listaksi
// ennen kuin se menee rank.ts:lle. rank.ts ei tiedä eikä sen tarvitse
// tietää monestako kaupasta tuotteet tulivat - se näkee vain yhden
// Product[]-listan, aivan kuten ennenkin yhden kaupan (Boozt) kanssa.
//
// Suodatuslogiikka (matchesCriteria) on identtinen aiemman boozt.ts:n
// kanssa - ei muutettu, koska sitä ei ole syytä muuttaa kaupan vaihtuessa.
// ---------------------------------------------------------------------------

// Kun hakukriteereissä on LAPSISIGNAALI (iästä/koosta johdettu size_raw,
// tai tytölle/pojalle/unisex-sukupuolipreferenssi), hylätään tuotteet jotka
// otsikkonsa perusteella on selkeästi merkitty AIKUISTEN vaatteeksi -
// "Women's"/"Men's"/"Ladies'"-merkinnät tai aikuisten kokoväli (esim.
// "S-5XL", "XS-XXXL") otsikossa. Tämä on ERI asia kuin lapsiturvasuodatin
// (child-safety-filter.ts), joka estää aikuis-/seksuaalisisältöä kaikille
// hauille - tämä sääntö koskee vain RELEVANSSIA lapsisignaalin hauissa
// (esim. "talvitakki pojalle" ei saa näyttää naisten takkeja, vaikka ne
// olisivat täysin asiallisia sinänsä).
const ADULT_GENDER_MARKER_REGEX = /\b(women'?s|men'?s|ladies'?|woman'?s|man'?s)\b/i;
const ADULT_SIZE_TOKEN = "(?:xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|xxxxxl|[2-5]xl)";
const ADULT_SIZE_RANGE_REGEX = new RegExp(`\\b${ADULT_SIZE_TOKEN}\\s*[-–]\\s*${ADULT_SIZE_TOKEN}\\b`, "i");

function hasChildSignal(c: SearchCriteria): boolean {
  return Boolean(c.child_gender_pref) || Boolean(c.size_raw);
}

function looksLikeAdultProduct(title: string): boolean {
  return ADULT_GENDER_MARKER_REGEX.test(title) || ADULT_SIZE_RANGE_REGEX.test(title);
}

export function matchesCriteria(p: Product, c: SearchCriteria): boolean {
  if (!p.in_stock) return false;
  if (hasChildSignal(c) && looksLikeAdultProduct(p.title)) return false;
  if (c.garment_type && p.garment_type !== c.garment_type) return false;
  if (c.max_price && p.price.currency === c.max_price.currency) {
    if (p.price.amount > c.max_price.amount) return false;
  }
  if (c.brand_deny?.some((b) => p.brand.toLowerCase().includes(b.toLowerCase()))) return false;
  if (c.brand_allow?.length) {
    const allowed = c.brand_allow.some((b) => p.brand.toLowerCase().includes(b.toLowerCase()));
    if (!allowed) return false;
  }
  if (c.waterproof === true && p.waterproof !== true) return false;
  if (c.child_gender_pref && p.gender && p.gender !== "unisex") {
    if (c.child_gender_pref !== "unisex" && p.gender !== c.child_gender_pref) return false;
  }
  if (c.color && p.color && p.color.toLowerCase() !== c.color.toLowerCase()) return false;
  if (c.material_keywords?.length) {
    const haystack = (p.material || "").toLowerCase();
    if (!c.material_keywords.some((kw) => haystack.includes(kw.toLowerCase()))) return false;
  }
  if (c.size_raw && p.size_available.length > 0) {
    if (!p.size_available.some((s) => s.toLowerCase().includes(c.size_raw!.toLowerCase()))) return false;
  }
  return true;
}

export class MultiStoreAdapter {
  private stores: IProductStore[];

  constructor(stores?: IProductStore[]) {
    // Oletuksena: yksi RedisProductStore jokaiselle .env:ssä konfiguroidulle
    // kaupalle (ks. stores-registry.ts). Testeissä annetaan InMemoryProductStore-
    // lista suoraan konstruktorille, jolloin Redis-yhteyttä ei tarvita.
    this.stores = stores ?? getConfiguredStores().map((s) => new RedisProductStore(s.storeKey));
  }

  async search(criteria: SearchCriteria): Promise<Product[]> {
    const allResults = await Promise.all(this.stores.map((s) => s.loadAll()));
    const merged = allResults.flat();
    return merged.filter((p) => matchesCriteria(p, criteria));
  }

  async lastImportedAt(): Promise<string | null> {
    const timestamps = await Promise.all(this.stores.map((s) => s.lastUpdated()));
    const valid = timestamps.filter((t): t is string => t !== null);
    if (valid.length === 0) return null;
    // Palautetaan vanhin päivitys - jos yksi kauppa ei ole päivittynyt
    // pitkään aikaan, se näkyy heti eikä piiloudu tuoreimman taakse.
    return valid.sort()[0];
  }
}

// Helppokäyttöinen apuri: nimet joita juuri nyt EI ole konfiguroitu
// (ei feedId:tä .env:ssä) - hyödyllinen virheilmoituksiin ja diagnostiikkaan.
export function getUnconfiguredStoreNames(): string[] {
  const configured = new Set(getConfiguredStores().map((s) => s.storeKey));
  return AWIN_STORES.filter((s) => !configured.has(s.storeKey)).map((s) => s.displayName);
}
