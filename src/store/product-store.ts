import { Product } from "../types";
import { getRedisConnection } from "./redis-connection";

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

// Yhteys ja REST/TCP-valinta on keskitetty redis-connection.ts:ään (jaettu
// kv-store.ts:n kanssa) - tämä tiedosto hoitaa vain JSON-serialisoinnin,
// jota tuotepayload tarvitsee mutta yleiskäyttöinen avain-arvo-yhteys ei.

// ---------------------------------------------------------------------------
// MUUTOS (moni-kauppa-tuki): Redis-avain on nyt parametroitu kaupan
// tunnisteella ("storeKey"), joten jokainen kauppa (Outnorth SE, Outnorth FI,
// Voghion Global, myöhemmin Babyshop/Boozt) tallentuu omaan rinnakkaiseen
// avaimeensa eikä ylikirjoita toista kauppaa. Aiempi, yhden kaupan
// "ProductStore"-nimi säilyy taaksepäin yhteensopivana aliaksena Boozt:lle.
// ---------------------------------------------------------------------------
export class RedisProductStore implements IProductStore {
  private key: string;

  constructor(storeKey: string = "boozt") {
    this.key = `vaateta:products:${storeKey}`;
  }

  async replaceAll(products: Product[]): Promise<void> {
    const redis = await getRedisConnection();
    const payload: StoredPayload = { updated_at: new Date().toISOString(), count: products.length, products };
    await redis.set(this.key, JSON.stringify(payload));
  }
  async loadAll(): Promise<Product[]> {
    const redis = await getRedisConnection();
    const raw = await redis.get(this.key);
    const payload = raw ? (JSON.parse(raw) as StoredPayload) : null;
    return payload?.products ?? [];
  }
  async lastUpdated(): Promise<string | null> {
    const redis = await getRedisConnection();
    const raw = await redis.get(this.key);
    const payload = raw ? (JSON.parse(raw) as StoredPayload) : null;
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
