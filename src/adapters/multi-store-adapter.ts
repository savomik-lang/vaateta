import { Product, SearchCriteria } from "../types";
import { RedisProductStore, InMemoryProductStore, IProductStore } from "../store/product-store";
import { toEur } from "../currency";
import { productSizeFit, inferSizeFromTitle } from "../size";
import { hasChildMarkers } from "../safety/child-safety-filter";
import { guessWinter, SEASON_FILTERED_GARMENTS } from "../season";
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
// HUOM: "'s"-pääte jätetään kokonaan pois vaatimuksesta - \b-sanaraja
// yksinään riittää tunnistamaan sekä paljaan "Women"/"Men" (esim. "For
// Women", "Men And Women All Match") ETTÄ omistusmuodon ("Women's",
// "Men's") riippumatta käytetäänkö ASCII-heittomerkkiä (') tai Unicode-
// kaarevaa heittomerkkiä (’) - molemmissa tapauksissa heittomerkki on
// ei-sana-merkki, joten \b laukeaa juuri perussanan jälkeen joka tapauksessa.
const ADULT_GENDER_MARKER_REGEX = /\b(women|men|woman|man|ladies|lady)\b/i;
// [2-9]xl kattaa 6XL/7XL/jne, ei vain 5XL:ään asti.
const ADULT_SIZE_TOKEN = "(?:xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|xxxxxl|[2-9]xl)";
const ADULT_SIZE_RANGE_REGEX = new RegExp(`\\b${ADULT_SIZE_TOKEN}\\s*[-–]\\s*${ADULT_SIZE_TOKEN}\\b`, "i");
// TUNNETTU RAJOITUS: bare "man"/"men" voi osua yhdysmerkillä kirjoitettuun
// lisensoituun hahmonimeen ("Spider-Man", "He-Man") lapsituotteen otsikossa,
// koska yhdysmerkki on ei-sana-merkki ja luo sanarajan. Hyväksytty riski -
// Voghionin kaltaisessa yleismarkkinapaikassa tällaisia tuotteita on
// harvoin, ja aikuisvaatteiden suodattaminen oikein painaa enemmän.

const TEEN_TITLE_REGEX = /\b(teen|teens|teenager|youth|junior|juniors|big kids?|older kids?|nuoret|nuorten|ungdom)\b/i;
const GIRL_TITLE_REGEX = /\b(girl|girls|flicka|flickor)\b/i;
const BOY_TITLE_REGEX = /\b(boy|boys|pojke|pojkar)\b/i;

export function hasChildSignal(c: SearchCriteria): boolean {
  return Boolean(c.child_signal) || Boolean(c.child_gender_pref) || Boolean(c.size_raw) || Boolean(c.size_cm);
}

// Haettu koko senttimetreinä: size_cm tai (vanhoilta kutsuilta) numeerinen size_raw.
export function targetSizeCm(c: SearchCriteria): number | undefined {
  if (c.size_cm) return c.size_cm;
  const n = c.size_raw ? parseInt(c.size_raw, 10) : NaN;
  return n >= 44 && n <= 190 ? n : undefined;
}

// NUORI-TILA: haettu koko >= 152 cm tai ikä >= 12. Silloin luotettujen
// kauppojen (ks. stores-registry.ts trustedForTeen) aikuisten kokoja (XS/S)
// saa näyttää, sukupuolta kunnioittaen. Estolista pysyy aina päällä.
export function isTeenSearch(c: SearchCriteria): boolean {
  const cm = targetSizeCm(c);
  return (cm !== undefined && cm >= 152) || (c.age !== undefined && c.age >= 12);
}

function isTrustedForTeen(source: string): boolean {
  return AWIN_STORES.some((s) => s.storeKey === source && s.trustedForTeen);
}

const MENS_TITLE_REGEX = /\b(men|man|mens|herr|miesten|miehet)\b/i;
const WOMENS_TITLE_REGEX = /\b(women|woman|womens|ladies|lady|dam|naisten|naiset)\b/i;

function looksLikeAdultProduct(title: string): boolean {
  return ADULT_GENDER_MARKER_REGEX.test(title) || ADULT_SIZE_RANGE_REGEX.test(title);
}

export interface MatchOptions {
  // Salli myös hieman (yksi koko) haettua pienemmät koot - käytetään kun
  // täsmälleen sopivia on vähän (notice partial_size).
  allowSmaller?: boolean;
}

export function matchesCriteria(p: Product, c: SearchCriteria, opts: MatchOptions = {}): boolean {
  if (!p.in_stock) return false;
  const teenTrusted = isTeenSearch(c) && isTrustedForTeen(p.source);
  if (hasChildSignal(c) && looksLikeAdultProduct(p.title)) {
    // Nuorelle luotetusta kaupasta aikuisten tuote sallitaan (koko tarkistetaan
    // alla), mutta väärälle sukupuolelle merkitty hylätään.
    if (!teenTrusted) return false;
  }
  if (teenTrusted) {
    if (c.child_gender_pref === "tyttö" && MENS_TITLE_REGEX.test(p.title) && !WOMENS_TITLE_REGEX.test(p.title)) return false;
    if (c.child_gender_pref === "poika" && WOMENS_TITLE_REGEX.test(p.title) && !MENS_TITLE_REGEX.test(p.title)) return false;
  }
  if (c.garment_type && p.garment_type !== c.garment_type) return false;
  // Vertailu EUR:ssa, jotta SEK/NOK/DKK-hintaiset tuotteet (Outnorth SE)
  // eivät livahda hintarajan ohi pelkän valuuttaeron vuoksi.
  if (c.max_price && toEur(p.price) > toEur(c.max_price)) return false;
  // Otsikossa nimenomaan vastakkaiselle sukupuolelle ("Girls ...") merkitty
  // tuote ei kuulu pojalle/tytölle-hakuun, vaikka feedin gender-kenttä olisi tyhjä.
  if (c.child_gender_pref === "poika" && GIRL_TITLE_REGEX.test(p.title) && !BOY_TITLE_REGEX.test(p.title)) return false;
  if (c.child_gender_pref === "tyttö" && BOY_TITLE_REGEX.test(p.title) && !GIRL_TITLE_REGEX.test(p.title)) return false;
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
  if (c.season === "winter" && p.garment_type && SEASON_FILTERED_GARMENTS.has(p.garment_type)) {
    const winter = p.winter !== undefined ? p.winter : guessWinter(p.title);
    if (winter !== true) return false;
  }
  const targetCm = targetSizeCm(c);
  if (targetCm !== undefined) {
    let sizes = p.size_available;
    if (sizes.length === 0) {
      // Ei kokotietoa (esim. Voghion): päätellään ikäväli otsikosta, tai
      // hyväksytään vain jos otsikko kertoo tuotteen olevan lapsille.
      // Muuten (esim. "Y2K Unisex Puffer Jacket") sopivuutta ei voi tietää.
      const inferred = inferSizeFromTitle(p.title);
      if (inferred.length > 0) sizes = inferred;
      else if (!hasChildMarkers(p.title)) return false;
      // Nuorelle (>= 152 cm) kokotiedoton tuote kelpaa vain jos otsikko
      // viittaa isompiin lapsiin - "Baby/Toddler/Kids" ilman ikää on pienille.
      else if (targetCm >= 152 && !TEEN_TITLE_REGEX.test(p.title)) return false;
    }
    const fit = productSizeFit(sizes, targetCm, p.garment_type === "kengät");
    if (fit === null) return false;
    if (fit === "smaller" && !opts.allowSmaller) return false;
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

  private cache: Product[] | null = null;

  // Koko katalogi (ladataan kerran per adapteri-instanssi, jotta rennostettu
  // haku ja osittainen koko -haku eivät lataa Redisistä uudelleen).
  async loadAllProducts(): Promise<Product[]> {
    if (!this.cache) {
      const allResults = await Promise.all(this.stores.map((s) => s.loadAll()));
      this.cache = allResults.flat();
    }
    return this.cache;
  }

  async search(criteria: SearchCriteria, opts: MatchOptions = {}): Promise<Product[]> {
    const all = await this.loadAllProducts();
    return all.filter((p) => matchesCriteria(p, criteria, opts));
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
