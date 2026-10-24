// ---------------------------------------------------------------------------
// LAPSITURVALLISUUSSUODATIN - korkean prioriteetin suodatin, joka estää
// aikuis-/seksuaalisisältöisten tuotteiden pääsyn kuluttajien nähtäville.
//
// HISTORIA: suodatin oli alun perin TIUKKA ("oletus: hylkää, jos epävarma"
// age_group-kentän perusteella). Käytännössä tämä hylkäsi Voghion Globalilta
// lähes KAIKKI tuotteet (8605/8605), koska yleinen markkinapaikkafeed ei
// tue age_group-kenttää luotettavasti. Tuotteen omistajan päätöksellä
// linjaa kevennettiin: oletus on nyt HYVÄKSY, ja vain SELKEÄT aikuis-/
// seksuaalisisältösignaalit (avainsanat, kategoria, tai nimenomainen
// age_group:adult) hylätään. Tämä on tietoinen kompromissi katalogin
// kattavuuden ja turvallisuuden välillä - vastuu päätöksestä on tuotteen
// omistajalla, ei tällä koodilla.
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
// aiheuttajia lastenvaatteissa. Sisältää aikuisten alusvaatteet yleisesti
// (ei vain "sexy"-merkittyjä), koska alusvaatteet eivät kuulu lasten-
// vaatevalikoimaan ylipäätään.
// HUOM: näitä verrataan KOKO SANAN tarkkuudella (\b...\b), ei osamerkki-
// jonohakuna - "strip" ei siis osu "striped" (raidallinen) -sanaan, eikä
// "bra" osu "zebra"-sanaan. Ks. containsWholeWord/matchesBlocklist alla.
const HARD_BLOCKLIST_KEYWORDS = [
  "lingerie", "underwear", "sexy", "seductive", "erotic", "fetish",
  "bikini", "thong", "thongs", "g-string", "panties", "panty",
  "bra", "bras", "boxer brief", "boxer shorts", "intimate apparel",
  "adult content", "nsfw", "porn", "nude", "strip", "strips",
  "crotchless", "fishnet body", "harness lingerie", "kinky", "camisole set",
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

// Google Shopping -skeeman age_group-kentän arvot.
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Vertaa KOKO SANAN/FRAASIN tarkkuudella \b-sanarajoilla, jotta lyhyet
// avainsanat (esim. "bra", "strip") eivät osu pidempien sanojen SISÄLLE
// ("zebra", "striped"). Haystack tulee olla jo pienaakkosin.
const boundaryRegexCache = new Map<string, RegExp>();
function containsWholeWord(haystack: string, phrase: string): boolean {
  let re = boundaryRegexCache.get(phrase);
  if (!re) {
    re = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i");
    boundaryRegexCache.set(phrase, re);
  }
  return re.test(haystack);
}

function matchesBlocklist(haystack: string): string | null {
  for (const kw of HARD_BLOCKLIST_KEYWORDS) {
    if (containsWholeWord(haystack, kw)) return `hard-blocklist:${kw}`;
  }
  for (const [a, b] of CONTEXTUAL_BLOCKLIST_PAIRS) {
    if (containsWholeWord(haystack, a) && containsWholeWord(haystack, b)) {
      return `contextual-blocklist:${a}+${b}`;
    }
  }
  return null;
}

// Kevyt versio: tarkistaa VAIN estolistat. Tätä käytetään viimeisenä
// puolustuskerroksena api/search.ts:ssä KAIKILLE tuloksille (myös AI-web-
// haulle ja tuonnissa jo kerran hyväksytyille tuotteille), koska Product-
// tyyppi ei kuljeta age_group-tietoa tuonnin jälkeen.
export function hasBlockedKeywords(input: Pick<SafetyCheckInput, "title" | "category" | "description">): boolean {
  const haystack = [input.title, input.category, input.description].filter(Boolean).join(" ").toLowerCase();
  return matchesBlocklist(haystack) !== null;
}

export function isChildSafeProduct(input: SafetyCheckInput): SafetyCheckResult {
  const haystack = [input.title, input.category, input.description].filter(Boolean).join(" ").toLowerCase();

  const blocked = matchesBlocklist(haystack);
  if (blocked) return { safe: false, reason: blocked };

  const ageGroup = (input.ageGroup || "").trim().toLowerCase();
  if (ageGroup && ADULT_AGE_GROUPS.has(ageGroup)) {
    return { safe: false, reason: "age_group:adult" };
  }
  if (ageGroup && CHILD_AGE_GROUPS.has(ageGroup)) {
    return { safe: true, reason: "age_group:child" };
  }

  // Ei estolistaosumaa eikä nimenomaista age_group:adult-merkintää ->
  // hyväksytään. (Tietoinen kompromissi, ks. tiedoston alun kommentti.)
  return { safe: true, reason: "uncertain:accepted_by_default" };
}

// isChildSafeProductForStore säilytetään erillisenä rajapintana siltä
// varalta että jokin TULEVA kauppa osoittautuu niin epäluotettavaksi
// (esim. paljon aikuissisältöä estolistan ohi) että sille halutaan
// tiukempi, kauppakohtainen linja - tällä hetkellä käytös on kaikille
// kaupoille identtinen isChildSafeProduct:n kanssa.
export function isChildSafeProductForStore(_storeKey: string, input: SafetyCheckInput): SafetyCheckResult {
  return isChildSafeProduct(input);
}
