import { GarmentType, Product, SearchCriteria } from "./types";
import { hasChildSignal, matchesCriteria, targetSizeCm, isTeenSearch } from "./adapters/multi-store-adapter";
import { productSizeFit, sizeRangeCm } from "./size";
import { toEur } from "./currency";

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

const GARMENT_WORD: Record<GarmentType, string> = {
  takki: "takki", kurahousut: "kurahousut", toppahousut: "toppahousut", housut: "housut", kengät: "kengät",
  paita: "paita", haalari: "haalari", mekko: "mekko", body: "body", uimapuku: "uimapuku", pyjama: "pyjama",
  sukat: "sukat", pipo: "pipo", lapaset: "lapaset", muu: "vaate",
};
const GARMENT_PLURAL: Record<GarmentType, string> = {
  takki: "takkeja", kurahousut: "kurahousuja", toppahousut: "toppahousuja", housut: "housuja", kengät: "kenkiä",
  paita: "paitoja", haalari: "haalareita", mekko: "mekkoja", body: "bodyja", uimapuku: "uimapukuja", pyjama: "pyjamia",
  sukat: "sukkia", pipo: "pipoja", lapaset: "lapasia", muu: "vaatteita",
};
const WINTER_PREFIX_GARMENTS = new Set<GarmentType>(["takki", "haalari", "kengät"]);

function pluralLabel(c: SearchCriteria): string {
  const g = c.garment_type ?? "muu";
  const base = GARMENT_PLURAL[g];
  const label = c.season === "winter" && WINTER_PREFIX_GARMENTS.has(g) ? `talvi${base}` : base;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Rakentaa hakulauseen kriteereistä, jonka parseCriteriaFromText tulkitsee samoiksi kriteereiksi.
export function buildQuery(c: SearchCriteria): string {
  const parts: string[] = [];
  const g = c.garment_type;
  if (g) {
    const word = GARMENT_WORD[g];
    if (c.season === "winter" && WINTER_PREFIX_GARMENTS.has(g)) parts.push(`talvi${word}`);
    else if (c.season === "winter") parts.push("talvi", word);
    else parts.push(word);
  }
  if (c.child_gender_pref === "tyttö") parts.push("tytölle");
  else if (c.child_gender_pref === "poika") parts.push("pojalle");
  else if (c.child_gender_pref === "unisex") parts.push("unisex");
  const cm = targetSizeCm(c);
  if (cm) parts.push(`${cm} cm`);
  if (!c.child_gender_pref && !cm && c.child_signal) parts.push("lapselle");
  if (c.max_price) parts.push(`max ${c.max_price.amount} €`);
  if (c.waterproof) parts.push("vedenpitävä");
  if (c.color) parts.push(c.color);
  if (c.material_keywords?.length) parts.push(c.material_keywords.join(" "));
  return parts.join(" ").trim();
}

const SIZE_LADDER = [80, 86, 92, 98, 104, 110, 116, 122, 128, 134, 140, 146, 152, 158, 164, 170, 176];

function who(c: SearchCriteria): string {
  if (c.age) return `${c.age}-vuotiaalle`;
  const cm = targetSizeCm(c);
  return cm ? `koolle ${cm}` : "hakemallesi koolle";
}

export function buildNoResultsNotice(c: SearchCriteria, relax: Relaxation | null): Notice {
  if (!relax) {
    return { code: "no_results", message: `${pluralLabel(c)} ei löytynyt näillä rajauksilla. Kokeile väljempää hakua tai toista vaatetta.` };
  }
  const dropped = relax.dropped;
  const names: string[] = dropped.map((d) => (d === "max_price" ? "max_price" : d));
  let message = "Hakuehtoihin ei löytynyt tuotteita.";
  const suggestions: { label: string; query: string }[] = [];
  const target = targetSizeCm(c);

  if (dropped.includes("size") && target) {
    const range = sizeRangeCm(relax.matches.map((p) => p.size_available));
    if (range && range.max < target - 3) {
      message = `${pluralLabel(c)} löytyy vain kokoon ${range.max} asti.` + (isTeenSearch(c) ? ` ${who(c)} sopivia ei vielä ole valikoimassamme.` : "");
    } else if (range && range.min > target + 9) {
      message = `${pluralLabel(c)} löytyy vain koosta ${range.min} alkaen.`;
    } else {
      message = `Koolle ${target} sopivia ${pluralLabel(c).toLowerCase()} ei löytynyt, mutta muita kokoja on.`;
    }
    // Lähin koko, jossa tuloksia on.
    const ladder = [...SIZE_LADDER].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    for (const cm of ladder) {
      if (cm === target) continue;
      if (relax.matches.some((p) => productSizeFit(p.size_available, cm, p.garment_type === "kengät") === "exact")) {
        suggestions.push({ label: `Näytä koko ${cm}`, query: buildQuery({ ...dropCriteria(c, ["size"]), size_cm: cm }) });
        break;
      }
    }
  } else if (dropped.includes("max_price") && c.max_price) {
    const cheapest = Math.min(...relax.matches.map((p) => toEur(p.price)));
    message = `Hintarajalla ${c.max_price.amount} € ei löytynyt tuotteita. Halvin vastaava maksaa noin ${Math.ceil(cheapest)} €.`;
  } else if (dropped.includes("season")) {
    message = "Talvimerkittyjä tuotteita ei löytynyt tällä haulla.";
  } else if (dropped.includes("waterproof")) {
    message = "Vedenpitäviksi merkittyjä tuotteita ei löytynyt tällä haulla.";
  } else if (dropped.includes("color")) {
    message = `Väriä "${c.color}" ei löytynyt tällä haulla.`;
  } else if (dropped.includes("gender")) {
    message = "Tytöille tai pojille erikseen merkittyjä tuotteita ei löytynyt tällä haulla.";
  }

  return {
    code: "no_results",
    message,
    ...(suggestions.length ? { suggestions } : {}),
    relaxed: { dropped: names, total_matches: relax.matches.length },
  };
}

export function buildPartialSizeNotice(c: SearchCriteria): Notice {
  const cm = targetSizeCm(c);
  return {
    code: "partial_size",
    message: `Osa tuloksista on hieman pienempiä kuin haettu koko${cm ? ` ${cm}` : ""}. Tarkista koot ennen tilaamista.`,
  };
}

export function buildLimitedCoverageNotice(): Notice {
  return { code: "limited_coverage", message: "Tässä koossa on vielä vähän tuotteita. Lisäämme kauppoja koko ajan." };
}

export function buildNoGarmentNotice(): Notice {
  return {
    code: "no_garment",
    message: "Kerro, minkä vaatteen haet. Esimerkiksi talvitakki, kurahousut tai pipo.",
  };
}

export function buildRateLimitedNotice(): Notice {
  return { code: "rate_limited", message: "Päivän hakumäärä on tällä hetkellä täynnä. Kokeile huomenna uudelleen." };
}

export { matchesCriteria };
