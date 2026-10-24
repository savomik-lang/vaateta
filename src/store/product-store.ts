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

// Vercelin Storage-integraatiot tarjoavat kahdenlaisia Redis-tunnuksia
// riippuen siitä minkä palveluntarjoajan kautta tietokanta on luotu:
//  1) Upstashin REST API (KV_REST_API_URL + KV_REST_API_TOKEN, tai
//     UPSTASH_REDIS_REST_URL/TOKEN) - käyttää @upstash/redis-pakettia,
//     joka serialisoi/deserialisoi JSON:n automaattisesti.
//  2) Perinteinen Redis-protokolla yhdellä URL:lla (KV_REDIS_URL tai
//     REDIS_URL, muotoa redis://user:pass@host:port) - esim. Redis Cloud
//     -integraatio. Tähän käytetään "redis"-pakettia (node-redis), joka
//     EI serialisoi JSON:ia itse, joten se tehdään tässä käsin.
async function getRedisClient(cache: { client: RedisLike | null }): Promise<RedisLike> {
  if (cache.client) return cache.client;

  const restUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (restUrl && restToken) {
    const { Redis } = await import("@upstash/redis");
    cache.client = new Redis({ url: restUrl, token: restToken }) as unknown as RedisLike;
    return cache.client;
  }

  const tcpUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
  if (tcpUrl) {
    const { createClient } = await import("redis");
    const client = createClient({ url: tcpUrl });
    client.on("error", (err) => console.error("Redis-yhteysvirhe:", err));
    await client.connect();
    cache.client = {
      async set(key: string, value: unknown) {
        return client.set(key, JSON.stringify(value));
      },
      async get(key: string) {
        const raw = await client.get(key);
        return raw ? JSON.parse(raw) : null;
      },
    };
    return cache.client;
  }

  throw new Error(
    "Redis-yhteystietoja ei löytynyt. Tarkista että projektissa on joko " +
    "KV_REST_API_URL+KV_REST_API_TOKEN tai KV_REDIS_URL/REDIS_URL asetettu."
  );
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
