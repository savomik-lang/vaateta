import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MultiStoreAdapter } from "../src/adapters/multi-store-adapter";
import { rankResults } from "../src/ranking/rank";
import { parseCriteriaFromText } from "../src/nlu/parse-query";
import { config } from "../src/config";
import { RedisKeyValueStore } from "../src/store/kv-store";
import { getCachedResults, setCachedResults } from "../src/ai/query-cache";
import { checkAndIncrementDailyLimit } from "../src/ai/rate-limit";
import { searchWebForProducts } from "../src/ai/agent-search";

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
    const catalogMatches = await adapter.search(criteria);

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

    // --- 2. Omat kaupat eivät löytäneet mitään -> AI-web-hakuvarapolku ---
    const kv = new RedisKeyValueStore();

    const cached = await getCachedResults(kv, q);
    if (cached) {
      res.status(200).json({
        query: q,
        source: "ai-cache",
        total_matches: cached.cheapest.length + cached.bestValue.length,
        results: cached,
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

    const webProducts = await searchWebForProducts(q);
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
