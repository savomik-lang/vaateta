// ---------------------------------------------------------------------------
// Yhteinen Redis-yhteyslogiikka product-store.ts:lle JA kv-store.ts:lle.
// Vercelin Storage-integraatiot tarjoavat kahdenlaisia Redis-tunnuksia
// riippuen siitä minkä palveluntarjoajan kautta tietokanta on luotu:
//  1) Upstashin REST API (KV_REST_API_URL + KV_REST_API_TOKEN, tai
//     UPSTASH_REDIS_REST_URL/TOKEN) - käyttää @upstash/redis-pakettia.
//  2) Perinteinen Redis-protokolla yhdellä URL:lla (KV_REDIS_URL tai
//     REDIS_URL, muotoa redis://user:pass@host:port) - esim. Redis Cloud
//     -integraatio. Tähän käytetään "redis"-pakettia (node-redis).
//
// HUOM: kv-store.ts käytti aiemmin OMAA, erillistä @upstash/redis-pohjaista
// yhteyttään suoraan vanhojen KV_REST_API_URL/TOKEN-muuttujien varaan, jotka
// nimettiin uudelleen DEAD_*-etuliitteellä kun Upstash-tietokanta
// uninstallattiin (ks. product-store.ts:n korjaushistoria). Tämä aiheutti
// tuotannossa "Failed to parse URL from /pipeline" -virheen AI-web-
// hakuvarapolussa (rate-limit/query-cache), koska se ei koskaan vaihtanut
// uuteen TCP-pohjaiseen Redikseen. Tämä moduuli yhdistää logiikan yhteen
// paikkaan niin ettei ajautuma toistu toisessa tiedostossa.
// ---------------------------------------------------------------------------

export interface RedisCapableClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exSeconds?: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

let cachedClient: RedisCapableClient | null = null;

export async function getRedisConnection(): Promise<RedisCapableClient> {
  if (cachedClient) return cachedClient;

  const restUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (restUrl && restToken) {
    const { Redis } = await import("@upstash/redis");
    const upstash = new Redis({ url: restUrl, token: restToken });
    cachedClient = {
      async get(key) {
        const v = await upstash.get(key);
        return v == null ? null : (typeof v === "string" ? v : JSON.stringify(v));
      },
      async set(key, value, exSeconds) {
        return upstash.set(key, value, exSeconds ? { ex: exSeconds } : undefined);
      },
      async incr(key) {
        return upstash.incr(key);
      },
      async expire(key, seconds) {
        return upstash.expire(key, seconds);
      },
    };
    return cachedClient;
  }

  const tcpUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
  if (tcpUrl) {
    const { createClient } = await import("redis");
    const client = createClient({ url: tcpUrl });
    client.on("error", (err) => console.error("Redis-yhteysvirhe:", err));
    await client.connect();
    cachedClient = {
      async get(key) {
        return client.get(key);
      },
      async set(key, value, exSeconds) {
        return exSeconds ? client.set(key, value, { EX: exSeconds }) : client.set(key, value);
      },
      async incr(key) {
        return client.incr(key);
      },
      async expire(key, seconds) {
        return client.expire(key, seconds);
      },
    };
    return cachedClient;
  }

  throw new Error(
    "Redis-yhteystietoja ei löytynyt. Tarkista että projektissa on joko " +
    "KV_REST_API_URL+KV_REST_API_TOKEN tai KV_REDIS_URL/REDIS_URL asetettu."
  );
}
