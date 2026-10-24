import { IKeyValueStore } from "../store/kv-store";

const SECONDS_IN_A_DAY_PLUS_MARGIN = 26 * 60 * 60;

function todayKey(): string {
  return `ai-search:daily-count:${new Date().toISOString().slice(0, 10)}`;
}

export interface RateLimitResult { allowed: boolean; currentCount: number; limit: number; }

export async function checkAndIncrementDailyLimit(kv: IKeyValueStore, dailyLimit: number): Promise<RateLimitResult> {
  const newCount = await kv.incr(todayKey(), SECONDS_IN_A_DAY_PLUS_MARGIN);
  return { allowed: newCount <= dailyLimit, currentCount: newCount, limit: dailyLimit };
}
