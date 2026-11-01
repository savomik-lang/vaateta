import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MultiStoreAdapter, matchesCriteria, targetSizeCm, isTeenSearch } from "../src/adapters/multi-store-adapter";
import { rankResults, RankedResults } from "../src/ranking/rank";
import { fitContextFromCriteria } from "../src/ranking/fit";
import { dedupeResults } from "../src/ranking/offers";
import { parseCriteriaFromText } from "../src/nlu/parse-query";
import { interpretQuery } from "../src/nlu/interpret-query";
import { config } from "../src/config";
import { RedisKeyValueStore } from "../src/store/kv-store";
import { getCachedResults, setCachedResults } from "../src/ai/query-cache";
import { checkAndIncrementDailyLimit } from "../src/ai/rate-limit";
import { searchWebForProducts } from "../src/ai/agent-search";
import { hasBlockedKeywords } from "../src/safety/child-safety-filter";
import { Product } from "../src/types";
import { parseLang, resolveMarket } from "../src/lang";
import {
  Notice, findRelaxation, buildNoResultsNotice, buildPartialSizeNotice, buildLimitedCoverageNotice,
  buildNoGarmentNotice, buildRateLimitedNotice,
} from "../src/search-notice";

const EMPTY_RESULTS: RankedResults = { cheapest: [], bestValue: [], mostLoved: null };

// LAPSITURVALLISUUS (korkea prioriteetti, viimeinen puolustuskerros): tämä
// suodattaa VIELÄ KERRAN - riippumatta tulosten lähteestä (omat Awin-kaupat
// TAI AI-web-hakuvarapolku) - ennen kuin mitään näytetään käyttäjälle.
// Tuonnin oma suodatus (generic-awin-importer.ts) estää suurimman osan
// epäsopivista tuotteista pääsemästä kantaan asti, mutta tämä on viimeinen
// varmistus siltä varalta että data on tullut jotain muuta reittiä
// (esim. AI-web-haku, jonka tuloksia ei voida etukäteen kuratoida).
function filterChildSafe(products: Product[]): Product[] {
  return products.filter((p) => !hasBlockedKeywords({ title: p.title, category: p.garment_type }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // UI:n kieli ja kävijän markkina (lang=fi|sv|en, market=FI|SE|other). Puuttuva/tuntematon -> fi / FI.
  const lang = parseLang(req.query.lang);
  const market = resolveMarket(req.query.market, req.headers["x-vercel-ip-country"]);
  const view = { lang, market };

  if (req.method !== "GET") {
    res.status(405).json({ error: { fi: "Vain GET-pyynnöt tuettu", sv: "Endast GET-förfrågningar stöds", en: "Only GET requests are supported" }[lang] });
    return;
  }

  const q = (req.query.q as string) || "";
  if (!q.trim()) {
    res.status(400).json({ error: { fi: "Anna hakuteksti parametrilla ?q=...", sv: "Ange söktext med parametern ?q=...", en: "Provide the search text with the parameter ?q=..." }[lang] });
    return;
  }

  try {
    // --- 1. Omat Awin-kaupat ensin (Outnorth SE/FI, Voghion Global, ...) ---
    // Sääntöparseri ensin (ilmainen, deterministinen). LLM-tulkinta on varapolku:
    // kutsutaan vain kun vaatetyyppi puuttuu tai teksti ei ole suomea, ja jos se
    // ei ole käytössä tai epäonnistuu, haku jatkuu sääntötuloksella (ks.
    // src/nlu/llm-interpret.ts). Lapsiturvasuodatus ajetaan tuloksille kuten ennenkin.
    const { criteria, interpretation } = await interpretQuery(q, parseCriteriaFromText(q, { lang }));

    // RELEVANSSIKORJAUS: jos parseCriteriaFromText ei tunnistanut MITÄÄN
    // vaatetyyppiä tekstistä, haku ei saa pudota koko katalogin läpi -
    // sellainen haku ("mekko tytölle" ennen mekko-tyypin lisäämistä,
    // tai mikä tahansa tyyppi jota garment-keywords.ts ei tunne) palautti
    // aiemmin KAIKKI 300+ tuotetta (näytönsuojia, latureita, koruja...)
    // koska mikään suodatin ei osunut. Nyt tunnistamaton vaatetyyppi
    // palauttaa suoraan "ei tuloksia" sen sijaan että näyttää satunnaista
    // irrelevanttia sisältöä.
    if (!criteria.garment_type) {
      res.status(200).json({
        query: q,
        lang,
        market,
        source: "catalog",
        parsed_criteria: criteria,
        interpretation,
        total_matches: 0,
        notice: buildNoGarmentNotice(lang),
        results: EMPTY_RESULTS,
      });
      return;
    }

    const adapter = new MultiStoreAdapter();
    const allProducts = await adapter.loadAllProducts();
    // LAPSITURVALLISUUS (korkea prioriteetti): viimeinen varmistus ennen
    // näyttämistä. Ks. filterChildSafe-funktion kommentti yllä.
    const fitCtx = fitContextFromCriteria(criteria, market);
    // Samat tuotteet eri väreissä (sama kauppa, sama hinta) näytetään kerran.
    const runSafe = (c: typeof criteria, opts = {}) =>
      dedupeResults(filterChildSafe(allProducts.filter((p) => matchesCriteria(p, c, opts))), fitContextFromCriteria(c, market), view);
    const rawCatalogMatches = await adapter.search(criteria);
    let catalogMatches = dedupeResults(filterChildSafe(rawCatalogMatches), fitCtx, view);
    let notice: Notice | undefined;

    // Vähän täsmälleen sopivia -> otetaan mukaan myös hieman pienemmät koot
    // ja kerrotaan siitä käyttäjälle.
    if (targetSizeCm(criteria) !== undefined && catalogMatches.length < 5) {
      const extended = runSafe(criteria, { allowSmaller: true });
      if (extended.length > catalogMatches.length) {
        catalogMatches = extended;
        notice = buildPartialSizeNotice(criteria, lang);
      }
    }

    if (catalogMatches.length > 0) {
      if (!notice && isTeenSearch(criteria) && catalogMatches.length <= 5) notice = buildLimitedCoverageNotice(lang);
      const ranked = rankResults(catalogMatches, fitCtx);
      const lastImported = await adapter.lastImportedAt();
      res.status(200).json({
        query: q,
        lang,
        market,
        source: "catalog",
        parsed_criteria: criteria,
        interpretation,
        total_matches: catalogMatches.length,
        last_imported: lastImported,
        ...(notice ? { notice } : {}),
        results: ranked,
      });
      return;
    }

    // Ei osumia: selvitetään mikä rajaus esti tulokset (rennostettu haku).
    const zeroNotice = buildNoResultsNotice(criteria, findRelaxation(criteria, (c) => runSafe(c)), lang);

    if (rawCatalogMatches.length > 0 && catalogMatches.length === 0) {
      // Kriteerit osuivat omaan katalogiin, MUTTA jokainen osuma suodattui
      // pois lapsiturvasuodattimessa. Tässä tilanteessa EI saa pudota
      // AI-web-hakuvarapolkuun, koska se ohittaisi turvasuodatuksen
      // tarkoituksen kokonaan - palautetaan selkeä "ei tuloksia" sen
      // sijaan. (Korkean prioriteetin turvallisuusvaatimus.)
      res.status(200).json({
        query: q,
        lang,
        market,
        source: "catalog",
        parsed_criteria: criteria,
        interpretation,
        total_matches: 0,
        last_imported: await adapter.lastImportedAt(),
        notice: zeroNotice,
        results: EMPTY_RESULTS,
      });
      return;
    }

    // --- 2. Omat kaupat eivät löytäneet mitään -> AI-web-hakuvarapolku ---
    // Jos ANTHROPIC_API_KEY ei ole konfiguroitu, tämä polku ei voi toimia
    // mitenkään (searchWebForProducts heittäisi poikkeuksen) - palautetaan
    // silloin siisti "ei tuloksia" sen sijaan että kaadutaan 500-virheeseen,
    // joka paljastaisi sisäisen konfiguraatiovirheen käyttäjälle.
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(200).json({
        query: q,
        lang,
        market,
        source: "catalog",
        parsed_criteria: criteria,
        interpretation,
        total_matches: 0,
        notice: zeroNotice,
        results: EMPTY_RESULTS,
      });
      return;
    }

    const kv = new RedisKeyValueStore();

    const cached = await getCachedResults(kv, q);
    if (cached) {
      // LAPSITURVALLISUUS: suodatetaan myös välimuistissa jo oleva data -
      // voi olla tallennettu ennen tätä turvakorjausta.
      const safeCached = {
        cheapest: filterChildSafe(cached.cheapest),
        bestValue: filterChildSafe(cached.bestValue),
        mostLoved: cached.mostLoved ? filterChildSafe(cached.mostLoved) : null,
      };
      res.status(200).json({
        query: q,
        source: "ai-cache",
        total_matches: safeCached.cheapest.length + safeCached.bestValue.length,
        results: safeCached,
      });
      return;
    }

    const rateLimit = await checkAndIncrementDailyLimit(kv, config.ai.dailyLimit);
    if (!rateLimit.allowed) {
      res.status(200).json({
        query: q,
        source: "ai-limit-reached",
        total_matches: 0,
        notice: buildRateLimitedNotice(lang),
        results: { cheapest: [], bestValue: [], mostLoved: null },
      });
      return;
    }

    const rawWebProducts = await searchWebForProducts(q);
    // LAPSITURVALLISUUS: samat estolistat myös AI-web-hakuvarapolulle,
    // jonka tuloksia ei voida etukäteen kuratoida kuten omaa katalogia.
    const webProducts = filterChildSafe(rawWebProducts);
    const ranked = rankResults(webProducts);
    await setCachedResults(kv, q, ranked, config.ai.cacheTtlSeconds);

    res.status(200).json({
      query: q,
      source: "ai-web-search",
      total_matches: webProducts.length,
      results: ranked,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Tuntematon virhe haussa" });
  }
}
