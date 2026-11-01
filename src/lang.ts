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

export function parseMarket(v: unknown): ViewerMarket {
  const s = (Array.isArray(v) ? v[0] : v);
  const t = typeof s === "string" ? s.trim().toLowerCase() : "";
  if (t === "se") return "SE";
  if (t === "other" || t === "int" || t === "intl" || t === "world") return "other";
  return "FI";
}
