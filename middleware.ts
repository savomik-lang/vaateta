// Etusivun kielivalinta: ohjaa kävijän /sv/- tai /en/-versioon maan,
// selaimen kielen ja oman valinnan (eväste vaateta_lang) mukaan.
// Säännöt ja testit: src/i18n/choose-language.ts.
import { geolocation, next } from "@vercel/functions";
import { chooseLanguage, LANG_PATHS } from "./src/i18n/choose-language";

export const config = {
  matcher: ["/", "/index.html"],
};

export default function middleware(request: Request): Response {
  const lang = chooseLanguage({
    country: geolocation(request).country,
    acceptLanguage: request.headers.get("accept-language"),
    cookie: request.headers.get("cookie"),
    userAgent: request.headers.get("user-agent"),
  });
  if (lang === "fi") return next();
  const url = new URL(request.url);
  url.pathname = LANG_PATHS[lang];
  return new Response(null, {
    status: 307,
    headers: {
      Location: url.toString(),
      "Cache-Control": "private, no-store",
      Vary: "Cookie, Accept-Language",
    },
  });
}
