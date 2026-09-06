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

// ---------------------------------------------------------------------------
// TUOTANTOTOTEUTUS: Upstash Redis (Vercel Marketplace -integraatio).
// Redis-yhteys luodaan LAISKASTI (vasta kun sitä oikeasti käytetään), jotta
// tämä tiedosto voidaan importata testeissä ilman että ympäristömuuttujia
// tarvitsee olla asetettuna.
// ---------------------------------------------------------------------------
interface RedisLike {
  set(key: string, value: unknown): Promise<unknown>;
  get(key: string): Promise<unknown>;
}

export class RedisProductStore implements IProductStore {
  private client: RedisLike | null = null;
  private key = "vaateta:products:boozt";

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

  async replaceAll(products: Product[]): Promise<void> {
    const redis = await this.getClient();
    const payload: StoredPayload = {
      updated_at: new Date().toISOString(),
      count: products.length,
      products,
    };
    await redis.set(this.key, payload);
  }

  async loadAll(): Promise<Product[]> {
    const redis = await this.getClient();
    const payload = (await redis.get(this.key)) as StoredPayload | null;
    return payload?.products ?? [];
  }

  async lastUpdated(): Promise<string | null> {
    const redis = await this.getClient();
    const payload = (await redis.get(this.key)) as StoredPayload | null;
    return payload?.updated_at ?? null;
  }
}

// ---------------------------------------------------------------------------
// TESTITOTEUTUS: tavallinen muistissa oleva lista. Käytetään yksikkö- ja
// pipeline-testeissä (ks. src/pipeline.test.ts), jotta testit eivät riipu
// oikeasta Redis-yhteydestä tai verkosta.
// ---------------------------------------------------------------------------
export class InMemoryProductStore implements IProductStore {
  private data: StoredPayload | null = null;

  constructor(initialProducts: Product[] = []) {
    if (initialProducts.length > 0) {
      this.data = {
        updated_at: new Date().toISOString(),
        count: initialProducts.length,
        products: initialProducts,
      };
    }
  }

  async replaceAll(products: Product[]): Promise<void> {
    this.data = {
      updated_at: new Date().toISOString(),
      count: products.length,
      products,
    };
  }

  async loadAll(): Promise<Product[]> {
    return this.data?.products ?? [];
  }

  async lastUpdated(): Promise<string | null> {
    return this.data?.updated_at ?? null;
  }
}

// Oletustoteutus tuotantokäyttöön (api-reitit importaavat tämän suoraan)
export class ProductStore extends RedisProductStore {}
