import { createHash } from "crypto";
import { IKeyValueStore } from "../store/kv-store";

// Facets-välimuisti: prosessin muisti (lämmin Lambda) + Redis (jaettu instanssien kesken).
// Avain sisältää tuontiversion (kauppojen päivitysajat), joten uusi tuonti tekee kaikista vanhoista
// merkinnöistä käyttökelvottomia heti; Redis-merkinnät vanhenevat lisäksi TTL:llä.
const MAX_MEMORY_ENTRIES = 300;
const memory = new Map<string, { version: string; value: string }>();
const REDIS_TTL_SECONDS = 36 * 60 * 60;

export function cacheKey(namespace: string, parts: unknown): string {
  return `${namespace}:${createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 24)}`;
}

/**
 * Palauttaa välimuistissa olevan JSON-merkkijonon tai laskee sen. `version` tyhjä (ei tuontia)
 * -> ei tallenneta, ettei tyhjää katalogia jäädä välimuistiin. Välimuistivirheet eivät kaada hakua.
 */
export async function cachedJson(
  kv: IKeyValueStore | null, key: string, version: string, compute: () => Promise<string>,
): Promise<{ json: string; cache: "memory" | "redis" | "miss" }> {
  const usable = version.replace(/\|/g, "").length > 0;
  if (usable) {
    const hit = memory.get(key);
    if (hit && hit.version === version) return { json: hit.value, cache: "memory" };
    if (kv) {
      try {
        const raw = await kv.get(`vaateta:cache:${createHash("sha1").update(version).digest("hex").slice(0, 12)}:${key}`);
        if (raw) { remember(key, version, raw); return { json: raw, cache: "redis" }; }
      } catch { /* välimuisti ei ole pakollinen */ }
    }
  }
  const json = await compute();
  if (usable) {
    remember(key, version, json);
    if (kv) {
      try { await kv.set(`vaateta:cache:${createHash("sha1").update(version).digest("hex").slice(0, 12)}:${key}`, json, REDIS_TTL_SECONDS); } catch { /* ohitetaan */ }
    }
  }
  return { json, cache: "miss" };
}

function remember(key: string, version: string, value: string): void {
  if (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value as string);
  memory.set(key, { version, value });
}

export function clearMemoryCache(): void { memory.clear(); }
