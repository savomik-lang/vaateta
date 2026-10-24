import { Product } from "../types";

export interface StoredPayload {
  updated_at: string;
  count: number;
  products: Product[];
}

export interface IProductStore {
  replaceAll(products: Product[]): Promise<void>;
  loadAll(): Promise<Product[]>;
  lastUpdated(): Promise<string | null>;
}

interface RedisLike {
  set(key: string, value: unknown): Promise<unknown>;
  get(key: string): Promise<unknown>;
}

async function getRedisClient(cache: { client: RedisLike | null }): Promise<RedisLike> {
  if (!cache.client) {
    const { Redis } = await import("@upstash/redis");
    cache.client = new Redis({
      url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)!,
      token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)!,
    }) as unknown as RedisLike;
  }
  return cache.client;
}

// ---------------------------------------------------------------------------
// MUUTOS (moni-kauppa-tuki): Redis-avain on nyt parametroitu kaupan
// tunnisteella ("storeKey"), joten jokainen kauppa (Outnorth SE, Outnorth FI,
// Voghion Global, myöhemmin Babyshop/Boozt) tallentuu omaan rinnakkaiseen
// avaimeensa eikä ylikirjoita toista kauppaa. Aiempi, yhden kaupan
// "ProductStore"-nimi säilyy taaksepäin yhteensopivana aliaksena Boozt:lle.
// ---------------------------------------------------------------------------
export class RedisProductStore implements IProductStore {
  private cache: { client: RedisLike | null } = { client: null };
  private key: string;

  constructor(storeKey: string = "boozt") {
    this.key = `vaateta:products:${storeKey}`;
  }

  async replaceAll(products: Product[]): Promise<void> {
    const redis = await getRedisClient(this.cache);
    const payload: StoredPayload = { updated_at: new Date().toISOString(), count: products.length, products };
    await redis.set(this.key, payload);
  }
  async loadAll(): Promise<Product[]> {
    const redis = await getRedisClient(this.cache);
    const payload = (await redis.get(this.key)) as StoredPayload | null;
    return payload?.products ?? [];
  }
  async lastUpdated(): Promise<string | null> {
    const redis = await getRedisClient(this.cache);
    const payload = (await redis.get(this.key)) as StoredPayload | null;
    return payload?.updated_at ?? null;
  }
}

export class InMemoryProductStore implements IProductStore {
  private data: StoredPayload | null = null;
  constructor(initialProducts: Product[] = []) {
    if (initialProducts.length > 0) {
      this.data = { updated_at: new Date().toISOString(), count: initialProducts.length, products: initialProducts };
    }
  }
  async replaceAll(products: Product[]): Promise<void> {
    this.data = { updated_at: new Date().toISOString(), count: products.length, products };
  }
  async loadAll(): Promise<Product[]> { return this.data?.products ?? []; }
  async lastUpdated(): Promise<string | null> { return this.data?.updated_at ?? null; }
}

// Taaksepäin yhteensopiva: vanha koodi joka teki `new ProductStore()`
// (ilman parametria) osoittaa edelleen Boozt-avaimeen.
export class ProductStore extends RedisProductStore {
  constructor() { super("boozt"); }
}
