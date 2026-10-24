// ---------------------------------------------------------------------------
// LAPSITURVALLISUUSSUODATIN - korkean prioriteetin suodatin, joka estää
// aikuis-/seksuaalisisältöisten tai muuten lapsille sopimattomien tuotteiden
// pääsyn kuluttajien nähtäville. Tämä on tarkoituksella TIUKKA ("oletus:
// hylkää, jos epävarma") - erityisesti Voghion Globalin kaltaiset yleiset
// markkinapaikkafeedit sisältävät sekoituksena mitä tahansa (alusvaatteita,
// koruja, elektroniikkaa), eikä yksittäisen tuotteen lapsisopivuutta voi
// luottavaisesti päätellä otsikosta yksin.
//
// Käytetään KAHDESSA kohdassa puolustuksen syvyyden (defense in depth)
// vuoksi:
//   1) Tuonnissa (generic-awin-importer.ts) - suodatetut tuotteet eivät
//      koskaan päädy Redis-kantaan asti.
//   2) Hakutuloksissa (api/search.ts) - viimeinen varmistus ennen kuin
//      MITÄÄN tuotetta (kummasta tahansa lähteestä, myös AI-web-haku)
//      näytetään käyttäjälle.
// ---------------------------------------------------------------------------

// Nämä avainsanat tunnistavat luotettavasti aikuis-/seksuaalisisältöisen
// tuotteen riippumatta kontekstista - ei tunnettuja väärän positiivisen
// aiheuttajia lastenvaatteissa.
const HARD_BLOCKLIST_KEYWORDS = [
  "lingerie", "underwear", "sexy", "seductive", "erotic", "fetish",
  "bikini", "thong", "g-string", "panties", "panty", "bra ", "bras ",
  "intimate apparel", "adult content", "nsfw", "porn", "nude", "strip",
  "crotchless", "fishnet body", "harness lingerie", "kinky",
  // suomeksi/ruotsiksi yleisimmät
  "alusvaatteet", "alusasu", "eroottinen", "seksikäs",
];

// "bodysuit"/"jumpsuit" yksinään on ihan tavallinen vauvan/lapsen
// vaatekappale (body, haalari) - estetään vain kun yhdistettynä aikuisen
// sukupuolisignaaliin ("women's"/"men's"), joka käytännössä tarkoittaa
// aikuisten vaatetta, ei vauvan bodya.
const CONTEXTUAL_BLOCKLIST_PAIRS: [string, string][] = [
  ["bodysuit", "women's"],
  ["bodysuit", "men's"],
  ["jumpsuit", "women's"],
  ["jumpsuit", "men's"],
];

// Google Shopping -skeeman age_group-kentän hyväksytyt arvot lapsille.
// (ks. https://support.google.com/merchants/answer/6324463)
const CHILD_AGE_GROUPS = new Set(["newborn", "infant", "toddler", "kids", "youth"]);
const ADULT_AGE_GROUPS = new Set(["adult"]);

export interface SafetyCheckInput {
  title: string;
  category?: string | null;
  description?: string | null;
  ageGroup?: string | null;
}

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
}

// Kevyt versio: tarkistaa VAIN estolistat (ei age_group-vaatimusta). Tätä
// käytetään viimeisenä puolustuskerroksena api/search.ts:ssä KAIKILLE
// tuloksille (myös AI-web-haulle ja tuonnissa jo kerran hyväksytyille
// tuotteille), koska Product-tyypissä ei kulje age_group-tietoa eteenpäin
// tuonnin jälkeen - siksi "hylkää jos epävarma" -linjaa ei voi soveltaa
// tässä vaiheessa, vain selkeät estolistaosumat.
export function hasBlockedKeywords(input: Pick<SafetyCheckInput, "title" | "category" | "description">): boolean {
  const haystack = [input.title, input.category, input.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const kw of HARD_BLOCKLIST_KEYWORDS) {
    if (haystack.includes(kw)) return true;
  }
  for (const [a, b] of CONTEXTUAL_BLOCKLIST_PAIRS) {
    if (haystack.includes(a) && haystack.includes(b)) return true;
  }
  return false;
}

export function isChildSafeProduct(input: SafetyCheckInput): SafetyCheckResult {
  const haystack = [input.title, input.category, input.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const kw of HARD_BLOCKLIST_KEYWORDS) {
    if (haystack.includes(kw)) {
      return { safe: false, reason: `hard-blocklist:${kw}` };
    }
  }

  for (const [a, b] of CONTEXTUAL_BLOCKLIST_PAIRS) {
    if (haystack.includes(a) && haystack.includes(b)) {
      return { safe: false, reason: `contextual-blocklist:${a}+${b}` };
    }
  }

  const ageGroup = (input.ageGroup || "").trim().toLowerCase();
  if (ageGroup) {
    if (ADULT_AGE_GROUPS.has(ageGroup)) {
      return { safe: false, reason: "age_group:adult" };
    }
    if (CHILD_AGE_GROUPS.has(ageGroup)) {
      return { safe: true };
    }
    // age_group on asetettu mutta tuntematon arvo - käsitellään epävarmana.
  }

  // EPÄVARMA TAPAUS: age_group puuttuu tai on tunnistamaton, eikä estolista
  // osunut. Oletus on HYLKÄÄ ("reject if uncertain"), paitsi kun kauppa on
  // nimenomaisesti merkitty luotetuksi lastenvaatekaupaksi (trustedChildStore
  // -parametri alla), jolloin koko kaupan valikoima on jo kuratoitu.
  return { safe: false, reason: "uncertain:no_reliable_age_signal" };
}

// ---------------------------------------------------------------------------
// Kaupat, jotka ON TARKISTETTU myyvän NIMENOMAAN lasten/perheiden vaatteita
// (esim. Outnorth on pohjoismainen ulkoiluvaatekauppa, ei yleismarkkinapaikka).
// Näille kaupoille "epävarma" age_group EI johda automaattiseen hylkäykseen -
// vain estolistan osumat hylätään. Yleiset markkinapaikat (kuten Voghion)
// EIVÄT ole tällä listalla, joten niille sovelletaan täyttä "hylkää jos
// epävarma" -linjaa.
// ---------------------------------------------------------------------------
const TRUSTED_CHILD_FOCUSED_STORES = new Set<string>([
  // Outnorth SE/FI lisätään tähän kun niiden datafeed aktivoituu ja
  // tuotekatalogi on tarkistettu - EI lisätä automaattisesti.
]);

export function isChildSafeProductForStore(storeKey: string, input: SafetyCheckInput): SafetyCheckResult {
  const result = isChildSafeProduct(input);
  if (result.safe) return result;
  if (result.reason?.startsWith("uncertain:") && TRUSTED_CHILD_FOCUSED_STORES.has(storeKey)) {
    return { safe: true };
  }
  return result;
}
