import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MultiStoreAdapter } from "../src/adapters/multi-store-adapter";
import { RedisKeyValueStore } from "../src/store/kv-store";
import { parseLang } from "../src/lang";
import { resolveCountry } from "../src/geo";
import { facetsResponse } from "../src/structured/handlers";

// GET /api/facets?items=haalari+winter,pipo,lapaset+wp&brand_items=pipo&size_cm=110&shoe_eu=30&gender=tytto&brands=Reima
// -> { items: { "haalari+winter": 12, ... }, subtypes, brands: [{ name, count }], last_imported }
// Kävijän maa (x-vercel-ip-country, tai ?country=XX testaukseen) piilottaa kaupat, jotka eivät toimita maahan (shipsTo).
// Sopimus: claude/vaihe-b-rajapinta.md. Määrät ovat samat kuin rakenteisen haun total_matches.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const lang = parseLang(req.query.lang);
  if (req.method !== "GET") {
    res.status(405).json({ error: { fi: "Vain GET-pyynnöt tuettu", sv: "Endast GET-förfrågningar stöds", en: "Only GET requests are supported" }[lang] });
    return;
  }
  try {
    const started = Date.now();
    const result = await facetsResponse(req.query, lang, new MultiStoreAdapter(), new RedisKeyValueStore(),
      resolveCountry(req.query.country, req.headers["x-vercel-ip-country"]));
    if (result.cache) res.setHeader("X-Vaateta-Cache", result.cache);
    res.setHeader("Server-Timing", `total;dur=${Date.now() - started}`);
    if (typeof result.body === "string") {
      res.status(result.status).setHeader("Content-Type", "application/json; charset=utf-8").send(result.body);
    } else {
      res.status(result.status).json(result.body);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Tuntematon virhe" });
  }
}
