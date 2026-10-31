import { Product } from "../types";
import { gzipSync, gunzipSync } from "zlib";
import { getRedisConnection, RedisCapableClient } from "./redis-connection";

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
// ---------------------------------------------------------------------------
// REDIS-KUORMAN PIENENNYS: ilmaisen Redis-paketin kiintiöt ovat tiukat
// (30 MB muisti, 5 GB/kk siirtoa). Aiemmin jokainen haku latasi koko katalogin
// (kaikkien kauppojen JSON, useita Mt) KAKSI kertaa (loadAll + lastUpdated)
// eikä mikään välimuisti säilynyt hakujen välillä. Nyt:
//  1) payload tallennetaan gzip+base64-muodossa ("gz1:"-etuliite; vanha pakkaamaton
//     JSON luetaan edelleen, joten vanha data toimii kunnes seuraava import ajetaan)
//  2) pieni meta-avain (updated_at) kertoo onko katalogi muuttunut
//  3) purettu katalogi säilyy prosessin muistissa (lämmin Lambda) ja ladataan
//     uudelleen vain kun meta-avain muuttuu - hakua kohden pieni GET/kauppa
// ---------------------------------------------------------------------------
const GZ_PREFIX = "gz1:";

export function encodePayload(payload: StoredPayload): string {
  return GZ_PREFIX + gzipSync(Buffer.from(JSON.stringify(payload))).toString("base64");
}

export function decodePayload(raw: string): StoredPayload {
  if (raw.startsWith(GZ_PREFIX)) {
    return JSON.parse(gunzipSync(Buffer.from(raw.slice(GZ_PREFIX.length), "base64")).toString("utf-8")) as StoredPayload;
  }
  return JSON.parse(raw) as StoredPayload;
}

interface CacheEntry { updated_at: string; products: Product[]; fetchedAt: number }
const memoryCache = new Map<string, CacheEntry>();
// Jos meta-avainta ei ole (data tuotu ennen tätä muutosta), välimuisti kelpaa näin kauan.
const LEGACY_TTL_MS = 5 * 60 * 1000;

export class RedisProductStore implements IProductStore {
  private key: string;
  private metaKey: string;

  constructor(storeKey: string = "boozt", private getConn: () => Promise<RedisCapableClient> = getRedisConnection) {
    this.key = `vaateta:products:${storeKey}`;
    this.metaKey = `vaateta:products-meta:${storeKey}`;
  }

  async replaceAll(products: Product[]): Promise<void> {
    const redis = await this.getConn();
    const payload: StoredPayload = { updated_at: new Date().toISOString(), count: products.length, products };
    // Ensin payload, sitten meta: lukija joka näkee uuden metan löytää myös uuden payloadin.
    await redis.set(this.key, encodePayload(payload));
    await redis.set(this.metaKey, payload.updated_at);
    memoryCache.set(this.key, { updated_at: payload.updated_at, products, fetchedAt: Date.now() });
  }

  async loadAll(): Promise<Product[]> {
    const redis = await this.getConn();
    const cached = memoryCache.get(this.key);
    const meta = await redis.get(this.metaKey);
    if (cached) {
      if (meta ? meta === cached.updated_at : Date.now() - cached.fetchedAt < LEGACY_TTL_MS) return cached.products;
    }
    const raw = await redis.get(this.key);
    const payload = raw ? decodePayload(raw) : null;
    const products = payload?.products ?? [];
    if (payload) memoryCache.set(this.key, { updated_at: payload.updated_at, products, fetchedAt: Date.now() });
    return products;
  }

  async lastUpdated(): Promise<string | null> {
    const redis = await this.getConn();
    const meta = await redis.get(this.metaKey);
    if (meta) return meta;
    const cached = memoryCache.get(this.key);
    if (cached) return cached.updated_at;
    await this.loadAll();
    return memoryCache.get(this.key)?.updated_at ?? null;
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
