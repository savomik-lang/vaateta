import { IKeyValueStore } from "../store/kv-store";
import { RankedResults } from "../ranking/rank";

const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}
function cacheKey(query: string): string {
  return `ai-search:cache:${normalizeQuery(query)}`;
}

export async function getCachedResults(kv: IKeyValueStore, query: string): Promise<RankedResults | null> {
  const raw = await kv.get(cacheKey(query));
  if (!raw) return null;
  try { return JSON.parse(raw) as RankedResults; } catch { return null; }
}

export async function setCachedResults(kv: IKeyValueStore, query: string, results: RankedResults, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  await kv.set(cacheKey(query), JSON.stringify(results), ttlSeconds);
}
