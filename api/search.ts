import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MultiStoreAdapter } from "../src/adapters/multi-store-adapter";
import { rankResults, RankedResults } from "../src/ranking/rank";
import { parseCriteriaFromText } from "../src/nlu/parse-query";
import { config } from "../src/config";
import { RedisKeyValueStore } from "../src/store/kv-store";
import { getCachedResults, setCachedResults } from "../src/ai/query-cache";
import { checkAndIncrementDailyLimit } from "../src/ai/rate-limit";
import { searchWebForProducts } from "../src/ai/agent-search";
import { hasBlockedKeywords } from "../src/safety/child-safety-filter";
import { Product } from "../src/types";

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
  if (req.method !== "GET") {
    res.status(405).json({ error: "Vain GET-pyynnöt tuettu" });
    return;
  }

  const q = (req.query.q as string) || "";
  if (!q.trim()) {
    res.status(400).json({ error: "Anna hakuteksti parametrilla ?q=..." });
    return;
  }

  try {
    // --- 1. Omat Awin-kaupat ensin (Outnorth SE/FI, Voghion Global, ...) ---
    const criteria = parseCriteriaFromText(q);
    const adapter = new MultiStoreAdapter();
    const rawCatalogMatches = await adapter.search(criteria);
    // LAPSITURVALLISUUS (korkea prioriteetti): viimeinen varmistus ennen
    // näyttämistä. Ks. filterChildSafe-funktion kommentti yllä.
    const catalogMatches = filterChildSafe(rawCatalogMatches);

    if (catalogMatches.length > 0) {
      const ranked = rankResults(catalogMatches);
      const lastImported = await adapter.lastImportedAt();
      res.status(200).json({
        query: q,
        source: "catalog",
        parsed_criteria: criteria,
        total_matches: catalogMatches.length,
        last_imported: lastImported,
        results: ranked,
      });
      return;
    }

    if (rawCatalogMatches.length > 0 && catalogMatches.length === 0) {
      // Kriteerit osuivat omaan katalogiin, MUTTA jokainen osuma suodattui
      // pois lapsiturvasuodattimessa. Tässä tilanteessa EI saa pudota
      // AI-web-hakuvarapolkuun, koska se ohittaisi turvasuodatuksen
      // tarkoituksen kokonaan - palautetaan selkeä "ei tuloksia" sen
      // sijaan. (Korkean prioriteetin turvallisuusvaatimus.)
      res.status(200).json({
        query: q,
        source: "catalog",
        parsed_criteria: criteria,
        total_matches: 0,
        last_imported: await adapter.lastImportedAt(),
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
        source: "catalog",
        parsed_criteria: criteria,
        total_matches: 0,
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
        notice: "Päivän hakumäärä on tällä hetkellä täynnä. Kokeile huomenna uudelleen.",
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
