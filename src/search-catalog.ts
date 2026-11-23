import { Product, SearchCriteria } from "./types";
import { matchesCriteria, targetSizeCm } from "./adapters/multi-store-adapter";
import { dedupeResults } from "./ranking/offers";
import { fitContextFromCriteria } from "./ranking/fit";
import { filterChildSafe } from "./safety/filter-products";
import { Notice, buildPartialSizeNotice, buildNearestSizeNotice } from "./search-notice";
import { Lang, ViewOpts } from "./lang";

// Tekstihaun katalogihaku (api/search.ts): suodatus, lapsiturvasuodatus, dedupe sekä koko-varasäännöt.
// Erillään handlerista, jotta samaa logiikkaa voi ajaa testeissä ja offline-hakutestissä ilman Redisiä.

const SMALL_RESULT_LIMIT = 5;

export interface CatalogSearchResult {
  /** Osumat ennen lapsiturvasuodatusta (turvasuodatus voi hävittää kaikki: silloin ei AI-varapolkua). */
  rawMatches: Product[];
  matches: Product[];
  notice?: Notice;
  runSafe: (c: SearchCriteria, opts?: { allowSmaller?: boolean; allowNearest?: boolean }) => Product[];
}

export function catalogSearch(allProducts: Product[], criteria: SearchCriteria, view: ViewOpts & { lang?: Lang }): CatalogSearchResult {
  const lang = view.lang ?? "fi";
  const runSafe = (c: SearchCriteria, opts = {}) =>
    dedupeResults(filterChildSafe(allProducts.filter((p) => matchesCriteria(p, c, opts))), fitContextFromCriteria(c, view.market), view);
  const rawMatches = allProducts.filter((p) => matchesCriteria(p, criteria));
  let matches = dedupeResults(filterChildSafe(rawMatches), fitContextFromCriteria(criteria, view.market), view);
  let notice: Notice | undefined;

  // Vähän täsmälleen sopivia -> otetaan mukaan myös hieman pienemmät koot ja kerrotaan siitä käyttäjälle.
  if (targetSizeCm(criteria) !== undefined && matches.length < SMALL_RESULT_LIMIT) {
    const extended = runSafe(criteria, { allowSmaller: true });
    if (extended.length > matches.length) {
      matches = extended;
      notice = buildPartialSizeNotice(criteria, lang);
    }
  }
  // Alatyypillä (kypärämyssy, farkut...) vähän tuotteita haetussa koossa -> saman alatyypin lähimmät koot
  // (ei vaihdeta muihin alatyyppeihin, esim. kypärämyssy -> lippis).
  if (criteria.subtype && targetSizeCm(criteria) !== undefined && matches.length < SMALL_RESULT_LIMIT) {
    const nearest = runSafe(criteria, { allowSmaller: true, allowNearest: true });
    if (nearest.length > matches.length) {
      matches = nearest;
      notice = buildNearestSizeNotice(criteria, lang);
    }
  }
  return { rawMatches, matches, notice, runSafe };
}
