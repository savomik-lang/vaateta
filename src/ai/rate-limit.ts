import { IKeyValueStore } from "../store/kv-store";

const SECONDS_IN_A_DAY_PLUS_MARGIN = 26 * 60 * 60;

function todayKey(keyPrefix: string): string {
  return `${keyPrefix}:daily-count:${new Date().toISOString().slice(0, 10)}`;
}

export interface RateLimitResult { allowed: boolean; currentCount: number; limit: number; }

// keyPrefix erottaa laskurit toisistaan: oletus "ai-search" (AI-web-haku, ennallaan),
// LLM-tulkinta käyttää omaa laskuriaan ("nlu-llm"), jotta ne eivät kuluta toistensa rajaa.
export async function checkAndIncrementDailyLimit(kv: IKeyValueStore, dailyLimit: number, keyPrefix: string = "ai-search"): Promise<RateLimitResult> {
  const newCount = await kv.incr(todayKey(keyPrefix), SECONDS_IN_A_DAY_PLUS_MARGIN);
  return { allowed: newCount <= dailyLimit, currentCount: newCount, limit: dailyLimit };
}
