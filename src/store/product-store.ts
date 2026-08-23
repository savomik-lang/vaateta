import { Redis } from "@upstash/redis";
import { Product } from "../types";

// Vercel KV on lakkautettu (siirretty Upstashiin) — käytetään Upstash Redisiä
// Vercel Marketplace -integraation kautta. Integraatio injektoi env-muuttujat
// automaattisesti projektiin kun "Redis (Upstash)" lisätään Storage-välilehdeltä.
//
// Muuttujien nimi voi olla joko KV_REST_API_* (vanha nimeämiskäytäntö) tai
// UPSTASH_REDIS_REST_* riippuen integraation versiosta — tuetaan molempia.

const redis = new Redis({
  url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)!,
  token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)!,
});

const STORE_KEY = "vaateta:products:boozt";

interface StoredPayload {
  updated_at: string;
  count: number;
  products: Product[];
}

// Julkinen rajapinta on TARKOITUKSELLA identtinen aiemman
// tiedostopohjaisen version kanssa — boozt.ts ja muu koodi eivät
// tiedä eivätkä välitä mihin data oikeasti tallentuu.
export class ProductStore {
  async replaceAll(products: Product[]): Promise<void> {
    const payload: StoredPayload = {
      updated_at: new Date().toISOString(),
      count: products.length,
      products,
    };
    await redis.set(STORE_KEY, payload);
  }

  async loadAll(): Promise<Product[]> {
    const payload = await redis.get<StoredPayload>(STORE_KEY);
    return payload?.products ?? [];
  }

  async lastUpdated(): Promise<string | null> {
    const payload = await redis.get<StoredPayload>(STORE_KEY);
    return payload?.updated_at ?? null;
  }
}
