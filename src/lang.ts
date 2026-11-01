// Käyttöliittymän kieli ja kävijän markkina-alue. UI lähettää /api/search?...&lang=fi|sv|en&market=FI|SE|other.
// Tuntematon tai puuttuva arvo -> oletus (fi / FI), jolloin vastaus on kuten ennen kielituen lisäämistä.

export type Lang = "fi" | "sv" | "en";
export type ViewerMarket = "FI" | "SE" | "other";

export interface ViewOpts {
  lang?: Lang;
  market?: ViewerMarket;
}

export function parseLang(v: unknown): Lang {
  const s = (Array.isArray(v) ? v[0] : v);
  const t = typeof s === "string" ? s.trim().toLowerCase().slice(0, 2) : "";
  return t === "sv" || t === "en" ? t : "fi";
}

/** Kävijän maa Vercelin x-vercel-ip-country-otsakkeesta: FI/AX -> FI, SE -> SE, muu maa -> other, puuttuu -> FI. */
export function marketFromCountry(header: unknown): ViewerMarket {
  const s = Array.isArray(header) ? header[0] : header;
  const cc = typeof s === "string" ? s.trim().toUpperCase() : "";
  if (!cc) return "FI";
  if (cc === "FI" || cc === "AX") return "FI";
  if (cc === "SE") return "SE";
  return "other";
}

/** Eksplisiittinen ?market voittaa; muuten maa-otsake; muuten FI. */
export function resolveMarket(query: unknown, countryHeader: unknown): ViewerMarket {
  const q = Array.isArray(query) ? query[0] : query;
  if (typeof q === "string" && q.trim()) return parseMarket(q);
  return marketFromCountry(countryHeader);
}

export function parseMarket(v: unknown): ViewerMarket {
  const s = (Array.isArray(v) ? v[0] : v);
  const t = typeof s === "string" ? s.trim().toLowerCase() : "";
  if (t === "se") return "SE";
  if (t === "other" || t === "int" || t === "intl" || t === "world") return "other";
  return "FI";
}
