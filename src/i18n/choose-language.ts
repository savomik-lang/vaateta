// Etusivun automaattinen kielivalinta (käytetään middleware.ts:ssä).
// Puhdas funktio, jotta säännöt voidaan testata ilman Verceliä.
//
// Säännöt (päätetty 31.10.2026):
//  1. Hakukonerobotit ja linkkien esikatselut: aina suomi (ei ohjausta).
//  2. Käyttäjän oma valinta (eväste vaateta_lang) voittaa.
//  3. Selaimen ensisijainen kieli suomi tai ruotsi -> se kieli (myös ulkomailla).
//  4. Suomi (tai maa tuntematon): selaimen kieli englanti -> en, muuten fi.
//  5. Ruotsi ja Ahvenanmaa -> sv.
//  6. Muut maat -> en.

export type Lang = "fi" | "sv" | "en";
export const LANGS: readonly Lang[] = ["fi", "sv", "en"];
export const LANG_COOKIE = "vaateta_lang";

export interface LanguageInput {
  country?: string | null;
  acceptLanguage?: string | null;
  cookie?: string | null;
  userAgent?: string | null;
}

const BOT_RE = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|slack|linkedin|pinterest|vkshare|w3c_validator|lighthouse|headless/i;

export function isBot(userAgent?: string | null): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

export function cookieLang(cookieHeader?: string | null): Lang | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANG_COOKIE) {
      const v = decodeURIComponent(rest.join("=")).trim().toLowerCase() as Lang;
      return LANGS.includes(v) ? v : null;
    }
  }
  return null;
}

// Selaimen ensisijainen kieli Accept-Language-otsakkeesta ("sv-FI,sv;q=0.9,fi;q=0.8" -> "sv")
export function primaryLanguage(acceptLanguage?: string | null): string | null {
  if (!acceptLanguage) return null;
  let best: { lang: string; q: number; i: number } | null = null;
  acceptLanguage.split(",").forEach((part, i) => {
    const [tag, ...params] = part.trim().split(";");
    const lang = tag.trim().toLowerCase().split("-")[0];
    if (!lang || lang === "*") return;
    const qp = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qp ? Number(qp.slice(2)) : 1;
    if (!(q > 0)) return;
    if (!best || q > best.q || (q === best.q && i < best.i)) best = { lang, q, i };
  });
  return best ? (best as { lang: string }).lang : null;
}

export function chooseLanguage(input: LanguageInput): Lang {
  if (isBot(input.userAgent)) return "fi";
  const fromCookie = cookieLang(input.cookie);
  if (fromCookie) return fromCookie;
  const browser = primaryLanguage(input.acceptLanguage);
  if (browser === "fi" || browser === "sv") return browser;
  const country = (input.country || "").toUpperCase();
  if (!country || country === "FI") return browser === "en" ? "en" : "fi";
  if (country === "SE" || country === "AX") return "sv";
  return "en";
}

export const LANG_PATHS: Record<Lang, string> = { fi: "/", sv: "/sv/", en: "/en/" };
