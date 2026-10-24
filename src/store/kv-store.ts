import { getRedisConnection } from "./redis-connection";

export interface IKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
}

export class RedisKeyValueStore implements IKeyValueStore {
  async get(key: string): Promise<string | null> {
    const redis = await getRedisConnection();
    const value = await redis.get(key);
    return value == null ? null : String(value);
  }
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const redis = await getRedisConnection();
    await redis.set(key, value, ttlSeconds);
  }
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const redis = await getRedisConnection();
    const newValue = await redis.incr(key);
    if (newValue === 1 && ttlSeconds) await redis.expire(key, ttlSeconds);
    return newValue;
  }
}

export class InMemoryKeyValueStore implements IKeyValueStore {
  private data = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.data.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.data.set(key, value); }
  async incr(key: string): Promise<number> {
    const next = parseInt(this.data.get(key) ?? "0", 10) + 1;
    this.data.set(key, String(next));
    return next;
  }
}
