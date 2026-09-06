import type { VercelRequest, VercelResponse } from "@vercel/node";
import { BooztAdapter } from "../src/adapters/boozt";
import { rankResults } from "../src/ranking/rank";
import { parseCriteriaFromText } from "../src/nlu/parse-query";

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
    const criteria = parseCriteriaFromText(q);
    const adapter = new BooztAdapter();
    const matches = await adapter.search(criteria);
    const ranked = rankResults(matches);
    const lastImported = await adapter.lastImportedAt();

    res.status(200).json({
      query: q,
      parsed_criteria: criteria,
      total_matches: matches.length,
      last_imported: lastImported,
      results: ranked,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Tuntematon virhe haussa" });
  }
}
