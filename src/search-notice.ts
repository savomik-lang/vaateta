import { Currency, GarmentType, Product, SearchCriteria } from "./types";
import { Lang } from "./lang";
import { hasChildSignal, matchesCriteria, targetSizeCm, isTeenSearch } from "./adapters/multi-store-adapter";
import { productSizeFit, sizeRangeCm } from "./size";
import { toEur, fromEur } from "./currency";

// ---------------------------------------------------------------------------
// Hakupalaute (notice) - ks. projektidokumentin "UI-sopimus". Kenttä on
// valinnainen lisäkenttä /api/search-vastauksessa; vanha vastausmuoto ei muutu.
// ---------------------------------------------------------------------------

export type NoticeCode =
  | "no_garment" | "no_results" | "partial_size" | "limited_coverage" | "rate_limited";

export interface Notice {
  code: NoticeCode;
  message: string;
  suggestions?: { label: string; query: string }[];
  relaxed?: { dropped: string[]; total_matches: number };
}

export type DropName = "size" | "max_price" | "gender" | "waterproof" | "color" | "season" | "material";
const DROP_ORDER: DropName[] = ["size", "max_price", "season", "waterproof", "color", "material", "gender"];

function hasDroppable(c: SearchCriteria, d: DropName): boolean {
  switch (d) {
    case "size": return Boolean(c.size_cm || c.size_raw || c.age);
    case "max_price": return Boolean(c.max_price);
    case "gender": return Boolean(c.child_gender_pref);
    case "waterproof": return c.waterproof === true;
    case "color": return Boolean(c.color);
    case "season": return Boolean(c.season);
    case "material": return Boolean(c.material_keywords?.length);
  }
}

export function dropCriteria(c: SearchCriteria, drops: DropName[]): SearchCriteria {
  const out: SearchCriteria = { ...c };
  // Lapsisignaali säilytetään, jotta aikuissuodatus ei katoa kun koko/sukupuoli poistetaan.
  if (hasChildSignal(c)) out.child_signal = true;
  for (const d of drops) {
    switch (d) {
      case "size": delete out.size_cm; delete out.size_raw; delete out.age; break;
      case "max_price": delete out.max_price; break;
      case "gender": delete out.child_gender_pref; break;
      case "waterproof": delete out.waterproof; break;
      case "color": delete out.color; break;
      case "season": delete out.season; break;
      case "material": delete out.material_keywords; break;
    }
  }
  return out;
}

export interface Relaxation {
  dropped: DropName[];
  criteria: SearchCriteria;
  matches: Product[];
}

// Kokeilee poistaa rajauksia yksi kerrallaan (sitten pareittain) ja valitsee
// sen, joka tuottaa eniten tuloksia. `run` suorittaa haun (sis. turvasuodatuksen).
export function findRelaxation(c: SearchCriteria, run: (c: SearchCriteria) => Product[]): Relaxation | null {
  const present = DROP_ORDER.filter((d) => hasDroppable(c, d));
  const candidates: DropName[][] = present.map((d) => [d]);
  let best: Relaxation | null = null;
  const consider = (drops: DropName[]) => {
    const crit = dropCriteria(c, drops);
    const matches = run(crit);
    if (matches.length > 0 && (!best || matches.length > best.matches.length)) best = { dropped: drops, criteria: crit, matches };
  };
  for (const drops of candidates) consider(drops);
  if (!best) {
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) consider([present[i], present[j]]);
  }
  return best;
}

const GARMENT_WORD: Record<Lang, Record<GarmentType, string>> = {
  fi: {
    takki: "takki", kurahousut: "kurahousut", toppahousut: "toppahousut", housut: "housut", kengät: "kengät",
    paita: "paita", haalari: "haalari", mekko: "mekko", body: "body", uimapuku: "uimapuku", pyjama: "pyjama",
    sukat: "sukat", pipo: "pipo", lapaset: "lapaset", kerrasto: "kerrasto", muu: "vaate",
  },
  sv: {
    takki: "jacka", kurahousut: "regnbyxor", toppahousut: "vinterbyxor", housut: "byxor", kengät: "skor",
    paita: "tröja", haalari: "overall", mekko: "klänning", body: "body", uimapuku: "baddräkt", pyjama: "pyjamas",
    sukat: "strumpor", pipo: "mössa", lapaset: "vantar", kerrasto: "underställ", muu: "kläder",
  },
  en: {
    takki: "jacket", kurahousut: "rain pants", toppahousut: "snow pants", housut: "pants", kengät: "shoes",
    paita: "shirt", haalari: "overall", mekko: "dress", body: "body", uimapuku: "swimsuit", pyjama: "pyjamas",
    sukat: "socks", pipo: "beanie", lapaset: "mittens", kerrasto: "base layer", muu: "clothes",
  },
};
const GARMENT_PLURAL: Record<Lang, Record<GarmentType, string>> = {
  fi: {
    takki: "takkeja", kurahousut: "kurahousuja", toppahousut: "toppahousuja", housut: "housuja", kengät: "kenkiä",
    paita: "paitoja", haalari: "haalareita", mekko: "mekkoja", body: "bodyja", uimapuku: "uimapukuja", pyjama: "pyjamia",
    sukat: "sukkia", pipo: "pipoja", lapaset: "lapasia", kerrasto: "kerrastoja", muu: "vaatteita",
  },
  sv: {
    takki: "jackor", kurahousut: "regnbyxor", toppahousut: "vinterbyxor", housut: "byxor", kengät: "skor",
    paita: "tröjor", haalari: "overaller", mekko: "klänningar", body: "bodys", uimapuku: "baddräkter", pyjama: "pyjamas",
    sukat: "strumpor", pipo: "mössor", lapaset: "vantar", kerrasto: "underställ", muu: "kläder",
  },
  en: {
    takki: "jackets", kurahousut: "rain pants", toppahousut: "snow pants", housut: "pants", kengät: "shoes",
    paita: "shirts", haalari: "overalls", mekko: "dresses", body: "bodysuits", uimapuku: "swimsuits", pyjama: "pyjamas",
    sukat: "socks", pipo: "beanies", lapaset: "mittens", kerrasto: "base layers", muu: "clothes",
  },
};
const WINTER_PREFIX_GARMENTS = new Set<GarmentType>(["takki", "haalari", "kengät"]);
const WINTER_PREFIX: Record<Lang, string> = { fi: "talvi", sv: "vinter", en: "winter " };

const COLOR_NAMES: Record<Lang, Record<string, string>> = {
  fi: {},
  sv: { musta: "svart", sininen: "blå", punainen: "röd", vihreä: "grön", keltainen: "gul", vaaleanpunainen: "rosa", harmaa: "grå", valkoinen: "vit", ruskea: "brun", oranssi: "orange" },
  en: { musta: "black", sininen: "blue", punainen: "red", vihreä: "green", keltainen: "yellow", vaaleanpunainen: "pink", harmaa: "grey", valkoinen: "white", ruskea: "brown", oranssi: "orange" },
};

function pluralLabel(c: SearchCriteria, lang: Lang = "fi"): string {
  const g = c.garment_type ?? "muu";
  const base = GARMENT_PLURAL[lang][g];
  const label = c.season === "winter" && WINTER_PREFIX_GARMENTS.has(g) ? `${WINTER_PREFIX[lang]}${base}` : base;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", SEK: "kr", NOK: "kr", DKK: "kr" };
function money(amount: number, currency: Currency): string {
  return `${amount} ${CURRENCY_SYMBOL[currency]}`;
}

// Rakentaa hakulauseen kriteereistä, jonka parseCriteriaFromText tulkitsee samoiksi kriteereiksi
// (sama kieli kuin UI: ehdotuspainikkeen hakulause näkyy käyttäjälle hakukentässä).
export function buildQuery(c: SearchCriteria, lang: Lang = "fi"): string {
  const parts: string[] = [];
  const g = c.garment_type;
  if (g) {
    const word = GARMENT_WORD[lang][g];
    if (c.season === "winter" && WINTER_PREFIX_GARMENTS.has(g) && lang !== "en") parts.push(`${WINTER_PREFIX[lang]}${word}`);
    else if (c.season === "winter") parts.push(WINTER_PREFIX[lang].trim(), word);
    else parts.push(word);
  }
  const girl = { fi: "tytölle", sv: "flicka", en: "girl" }[lang];
  const boy = { fi: "pojalle", sv: "pojke", en: "boy" }[lang];
  if (c.child_gender_pref === "tyttö") parts.push(girl);
  else if (c.child_gender_pref === "poika") parts.push(boy);
  else if (c.child_gender_pref === "unisex") parts.push("unisex");
  const cm = targetSizeCm(c);
  if (cm) parts.push(`${cm} cm`);
  if (!c.child_gender_pref && !cm && c.child_signal) parts.push({ fi: "lapselle", sv: "barn", en: "kids" }[lang]);
  if (c.max_price) parts.push(`max ${money(c.max_price.amount, c.max_price.currency)}`);
  if (c.waterproof) parts.push({ fi: "vedenpitävä", sv: "vattentät", en: "waterproof" }[lang]);
  if (c.color) parts.push(c.color);
  if (c.material_keywords?.length) parts.push(c.material_keywords.join(" "));
  return parts.join(" ").trim();
}

const SIZE_LADDER = [80, 86, 92, 98, 104, 110, 116, 122, 128, 134, 140, 146, 152, 158, 164, 170, 176];

function who(c: SearchCriteria, lang: Lang): string {
  const cm = targetSizeCm(c);
  if (lang === "sv") return c.age ? `en ${c.age}-åring` : cm ? `storlek ${cm}` : "din storlek";
  if (lang === "en") return c.age ? `a ${c.age}-year-old` : cm ? `size ${cm}` : "your size";
  if (c.age) return `${c.age}-vuotiaalle`;
  return cm ? `koolle ${cm}` : "hakemallesi koolle";
}

export function buildNoResultsNotice(c: SearchCriteria, relax: Relaxation | null, lang: Lang = "fi"): Notice {
  const plural = pluralLabel(c, lang);
  const pluralLower = plural.toLowerCase();
  if (!relax) {
    return {
      code: "no_results",
      message: {
        fi: `${plural} ei löytynyt näillä rajauksilla. Kokeile väljempää hakua tai toista vaatetta.`,
        sv: `Inga ${pluralLower} hittades med de här filtren. Prova en bredare sökning eller ett annat plagg.`,
        en: `No ${pluralLower} found with these filters. Try a broader search or a different garment.`,
      }[lang],
    };
  }
  const dropped = relax.dropped;
  const names: string[] = dropped.map((d) => (d === "max_price" ? "max_price" : d));
  let message = {
    fi: "Hakuehtoihin ei löytynyt tuotteita.",
    sv: "Inga produkter hittades med dina sökvillkor.",
    en: "No products matched your search criteria.",
  }[lang];
  const suggestions: { label: string; query: string }[] = [];
  const target = targetSizeCm(c);

  if (dropped.includes("size") && target) {
    const range = sizeRangeCm(relax.matches.map((p) => p.size_available));
    if (range && range.max < target - 3) {
      const teen = isTeenSearch(c);
      message = {
        fi: `${plural} löytyy vain kokoon ${range.max} asti.` + (teen ? ` ${who(c, "fi")} sopivia ei vielä ole valikoimassamme.` : ""),
        sv: `${plural} finns bara upp till storlek ${range.max}.` + (teen ? ` Det finns ännu inga passande för ${who(c, "sv")} i vårt sortiment.` : ""),
        en: `${plural} are only available up to size ${range.max}.` + (teen ? ` We don't have suitable ones for ${who(c, "en")} yet.` : ""),
      }[lang];
    } else if (range && range.min > target + 9) {
      message = {
        fi: `${plural} löytyy vain koosta ${range.min} alkaen.`,
        sv: `${plural} finns bara från storlek ${range.min}.`,
        en: `${plural} are only available from size ${range.min}.`,
      }[lang];
    } else {
      message = {
        fi: `Koolle ${target} sopivia ${pluralLower} ei löytynyt, mutta muita kokoja on.`,
        sv: `Inga ${pluralLower} i storlek ${target} hittades, men det finns andra storlekar.`,
        en: `No ${pluralLower} found in size ${target}, but other sizes are available.`,
      }[lang];
    }
    // Lähin koko, jossa tuloksia on.
    const ladder = [...SIZE_LADDER].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    for (const cm of ladder) {
      if (cm === target) continue;
      if (relax.matches.some((p) => productSizeFit(p.size_available, cm, p.garment_type === "kengät") === "exact")) {
        const label = { fi: `Näytä koko ${cm}`, sv: `Visa storlek ${cm}`, en: `Show size ${cm}` }[lang];
        suggestions.push({ label, query: buildQuery({ ...dropCriteria(c, ["size"]), size_cm: cm }, lang) });
        break;
      }
    }
  } else if (dropped.includes("max_price") && c.max_price) {
    const cheapestEur = Math.min(...relax.matches.map((p) => toEur(p.price)));
    const limit = money(c.max_price.amount, c.max_price.currency);
    const cheapest = money(Math.ceil(fromEur(cheapestEur, c.max_price.currency)), c.max_price.currency);
    message = {
      fi: `Hintarajalla ${limit} ei löytynyt tuotteita. Halvin vastaava maksaa noin ${cheapest}.`,
      sv: `Inga produkter hittades inom prisgränsen ${limit}. Den billigaste motsvarande kostar ungefär ${cheapest}.`,
      en: `No products found within the price limit of ${limit}. The cheapest match costs about ${cheapest}.`,
    }[lang];
  } else if (dropped.includes("season")) {
    message = {
      fi: "Talvimerkittyjä tuotteita ei löytynyt tällä haulla.",
      sv: "Inga produkter märkta för vinter hittades med den här sökningen.",
      en: "No products marked for winter were found for this search.",
    }[lang];
  } else if (dropped.includes("waterproof")) {
    message = {
      fi: "Vedenpitäviksi merkittyjä tuotteita ei löytynyt tällä haulla.",
      sv: "Inga produkter märkta som vattentäta hittades med den här sökningen.",
      en: "No products marked as waterproof were found for this search.",
    }[lang];
  } else if (dropped.includes("color")) {
    const color = (c.color && COLOR_NAMES[lang][c.color]) || c.color;
    message = {
      fi: `Väriä "${color}" ei löytynyt tällä haulla.`,
      sv: `Färgen "${color}" hittades inte med den här sökningen.`,
      en: `The colour "${color}" wasn't found for this search.`,
    }[lang];
  } else if (dropped.includes("gender")) {
    message = {
      fi: "Tytöille tai pojille erikseen merkittyjä tuotteita ei löytynyt tällä haulla.",
      sv: "Inga produkter markerade specifikt för flickor eller pojkar hittades med den här sökningen.",
      en: "No products marked specifically for girls or boys were found for this search.",
    }[lang];
  }

  return {
    code: "no_results",
    message,
    ...(suggestions.length ? { suggestions } : {}),
    relaxed: { dropped: names, total_matches: relax.matches.length },
  };
}

export function buildPartialSizeNotice(c: SearchCriteria, lang: Lang = "fi"): Notice {
  const cm = targetSizeCm(c);
  const suffix = cm ? ` ${cm}` : "";
  return {
    code: "partial_size",
    message: {
      fi: `Osa tuloksista on hieman pienempiä kuin haettu koko${suffix}. Tarkista koot ennen tilaamista.`,
      sv: `Några av resultaten är något mindre än den sökta storleken${suffix}. Kontrollera storlekarna innan du beställer.`,
      en: `Some of the results are slightly smaller than the size you searched for${suffix}. Check the sizes before ordering.`,
    }[lang],
  };
}

export function buildLimitedCoverageNotice(lang: Lang = "fi"): Notice {
  return {
    code: "limited_coverage",
    message: {
      fi: "Tässä koossa on vielä vähän tuotteita. Lisäämme kauppoja koko ajan.",
      sv: "I den här storleken finns det ännu få produkter. Vi lägger till nya butiker hela tiden.",
      en: "There are still few products in this size. We're adding new stores all the time.",
    }[lang],
  };
}

export function buildNoGarmentNotice(lang: Lang = "fi"): Notice {
  return {
    code: "no_garment",
    message: {
      fi: "Kerro, minkä vaatteen haet. Esimerkiksi talvitakki, kurahousut tai pipo.",
      sv: "Berätta vilket plagg du söker. Till exempel vinterjacka, regnbyxor eller mössa.",
      en: "Tell us which garment you're looking for. For example a winter jacket, rain pants or a beanie.",
    }[lang],
  };
}

export function buildRateLimitedNotice(lang: Lang = "fi"): Notice {
  return {
    code: "rate_limited",
    message: {
      fi: "Päivän hakumäärä on tällä hetkellä täynnä. Kokeile huomenna uudelleen.",
      sv: "Dagens sökgräns är nådd just nu. Försök igen i morgon.",
      en: "Today's search limit has been reached. Please try again tomorrow.",
    }[lang],
  };
}

export { matchesCriteria };
