import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Puuttuva ympäristömuuttuja: ${name}. Tarkista .env-tiedosto.`);
  return value;
}

export const config = {
  awin: {
    datafeedApiKey: () => required("AWIN_DATAFEED_API_KEY"),
    // "google"-formaatin kaupoille (Darwin-lataus) tarvitaan nämä kaksi -
    // löytyvät Awinista Toolbox > Datafeeds > "Feed List Download" -laatikon
    // esimerkki-URL:sta: .../publisher/{AWIN_PUBLISHER_ID}/{AWIN_FEEDLIST_TOKEN}/1/feedList
    publisherId: () => required("AWIN_PUBLISHER_ID"),
    feedListToken: () => required("AWIN_FEEDLIST_TOKEN"),
  },
  ai: {
    apiKey: () => required("ANTHROPIC_API_KEY"),
    model: process.env.AI_SEARCH_MODEL || "claude-haiku-4-5-20251001",
    maxSearchesPerQuery: Number(process.env.AI_SEARCH_MAX_USES || 6),
    dailyLimit: Number(process.env.AI_SEARCH_DAILY_LIMIT || 50),
    cacheTtlSeconds: Number(process.env.AI_SEARCH_CACHE_TTL_SECONDS || 2 * 60 * 60),
  },
  // LLM-tulkinta (src/nlu/llm-interpret.ts): sääntöparserin varapolku, kun
  // vaatetyyppi puuttuu tai teksti ei ole suomea. Päällä kun ANTHROPIC_API_KEY
  // on asetettu, ellei NLU_LLM_ENABLED=false.
  nlu: {
    enabled: () => process.env.NLU_LLM_ENABLED !== "false" && !!process.env.ANTHROPIC_API_KEY,
    model: process.env.NLU_LLM_MODEL || process.env.AI_SEARCH_MODEL || "claude-haiku-4-5-20251001",
    dailyLimit: Number(process.env.NLU_LLM_DAILY_LIMIT || 500),
    cacheTtlSeconds: Number(process.env.NLU_LLM_CACHE_TTL_SECONDS || 24 * 60 * 60),
    timeoutMs: Number(process.env.NLU_LLM_TIMEOUT_MS || 8000),
  },
};
