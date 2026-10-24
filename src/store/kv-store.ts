export interface IKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
}

interface RedisLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export class RedisKeyValueStore implements IKeyValueStore {
  private client: RedisLike | null = null;
  private async getClient(): Promise<RedisLike> {
    if (!this.client) {
      const { Redis } = await import("@upstash/redis");
      this.client = new Redis({
        url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)!,
        token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)!,
      }) as unknown as RedisLike;
    }
    return this.client;
  }
  async get(key: string): Promise<string | null> {
    const redis = await this.getClient();
    const value = await redis.get(key);
    return value == null ? null : String(value);
  }
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const redis = await this.getClient();
    await redis.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
  }
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const redis = await this.getClient();
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
