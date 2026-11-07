import { Product } from "./types";
import { STORES } from "./stores-registry";

// ---------------------------------------------------------------------------
// Kävijän maa ja kauppojen toimitusmaat. Jos kaupalla on `shipsTo`-lista (stores-registry),
// sen tuotteet näytetään vain listan maissa. Kaupat ilman listaa näkyvät kaikkialla.
// Maatieto puuttuu (ei otsaketta) tai on tuntematon -> näytetään kaikki.
// ---------------------------------------------------------------------------

// Vercel/Cloudflare palauttavat tuntemattomalle maalle XX (Tor: T1) - käsitellään kuin puuttuvaa.
const UNKNOWN_CODES = new Set(["XX", "T1"]);

/** ISO-3166 alpha-2 -maakoodi isoilla kirjaimilla. AX (Ahvenanmaa) = FI. Puuttuva/virheellinen/tuntematon -> undefined. */
export function parseCountry(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const cc = typeof s === "string" ? s.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(cc) || UNKNOWN_CODES.has(cc)) return undefined;
  return cc === "AX" ? "FI" : cc;
}

/** Eksplisiittinen ?country (testaus, esikatselu) voittaa; muuten Vercelin x-vercel-ip-country. */
export function resolveCountry(query: unknown, countryHeader: unknown): string | undefined {
  return parseCountry(query) ?? parseCountry(countryHeader);
}

/** Näytetäänkö kaupan tuotteet tämän maan kävijälle. */
export function storeVisibleIn(storeKey: string, country: string | undefined): boolean {
  if (!country) return true;
  const store = STORES.find((s) => s.storeKey === storeKey);
  return !store?.shipsTo || store.shipsTo.includes(country);
}

/** Maassa piilotettavat kaupat (aakkosjärjestyksessä); välimuistiavaimeksi ja diagnostiikkaan. */
export function hiddenStoreKeys(country: string | undefined): string[] {
  return STORES.filter((s) => !storeVisibleIn(s.storeKey, country)).map((s) => s.storeKey).sort();
}

/** Tuotteet, jotka saa näyttää kävijän maassa. Ei muutoksia (sama taulukko), jos mitään ei piiloteta. */
export function filterByCountry(products: Product[], country: string | undefined): Product[] {
  const hidden = new Set(hiddenStoreKeys(country));
  if (hidden.size === 0) return products;
  return products.filter((p) => !hidden.has(p.source));
}
