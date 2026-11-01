import { Product, ProductOffer } from "../types";
import { toEur } from "../currency";
import { AWIN_STORES } from "../stores-registry";
import { FitContext, baseTitle, dedupeColorVariants, fitTier, sizePenalty } from "./fit";
import { Lang, ViewOpts } from "../lang";

// ---------------------------------------------------------------------------
// Kauppojen välinen vertailu: sama tuote usealla kaupalla (esim. Outnorth FI ja
// SE) näytetään yhtenä rivinä, jossa edustajana on parhaiten istuva ja sitten
// halvin tarjous. Muut kaupat tulevat kenttään other_offers.
//
// Tunnistus (yksikin yhteinen avain riittää, ryhmät yhdistetään):
//   - group_id (Outnorth parent_product_id) + väri
//   - EAN (yksittäisen variantin viivakoodi)
//   - merkki + otsikko ilman väriä + väri
// Tuotteet joilla ei ole yhteistä avainta pysyvät erillisinä.
// ---------------------------------------------------------------------------

function keysFor(p: Product): string[] {
  const color = (p.color || "").trim().toLowerCase();
  const keys = [`t|${p.brand.trim().toLowerCase()}|${baseTitle(p)}|${color}`];
  if (p.group_id) keys.push(`g|${p.group_id}|${color}`);
  if (p.ean) keys.push(`e|${p.ean}`);
  return keys;
}

function storeName(source: string): string {
  return AWIN_STORES.find((s) => s.storeKey === source)?.displayName || source;
}

// Suomenkielinen oletushuomautus (FI-kävijä, Ruotsin kauppa). Muut kielet ja kävijän
// markkinat: shippingNote().
export const FOREIGN_SHOP_NOTE = "Ruotsin verkkokauppa – tarkista toimitus Suomeen ennen ostoa";

export function marketOf(source: string): string | undefined {
  return AWIN_STORES.find((s) => s.storeKey === source)?.market;
}
// Kävijän oma markkina ensin, "global" (Voghion) sen jälkeen, vieras markkina viimeisenä.
// FI-kävijä: FI > global > SE (kuten ennen). SE-kävijä: SE > global > FI. Muut: FI > global > SE.
function marketRank(source: string, viewer?: ViewOpts["market"]): number {
  const m = marketOf(source);
  const own = viewer === "SE" ? "SE" : "FI";
  return m === own ? 0 : m === "global" || m === undefined ? 1 : 2;
}

const NOTE_SE_TO_FI: Record<Lang, string> = {
  fi: FOREIGN_SHOP_NOTE,
  sv: "Svensk webbutik – kontrollera leverans till Finland innan du beställer",
  en: "Swedish online store – check delivery to Finland before ordering",
};
const NOTE_FI_TO_SE: Record<Lang, string> = {
  fi: "Toimitus Suomesta",
  sv: "Leverans från Finland",
  en: "Shipped from Finland",
};
// Muut maat: kaikilla kaupoilla huomautus, kunnes selvitetty mihin kauppa toimittaa.
const NOTE_OTHER: Record<"FI" | "SE" | "global", Record<Lang, string>> = {
  FI: {
    fi: "Suomalainen verkkokauppa – tarkista toimitus maahasi ennen ostoa",
    sv: "Finsk webbutik – kontrollera leverans till ditt land innan du beställer",
    en: "Finnish online store – check delivery to your country before ordering",
  },
  SE: {
    fi: "Ruotsalainen verkkokauppa – tarkista toimitus maahasi ennen ostoa",
    sv: "Svensk webbutik – kontrollera leverans till ditt land innan du beställer",
    en: "Swedish online store – check delivery to your country before ordering",
  },
  global: {
    fi: "Kansainvälinen verkkokauppa – tarkista toimitus maahasi ennen ostoa",
    sv: "Internationell webbutik – kontrollera leverans till ditt land innan du beställer",
    en: "International online store – check delivery to your country before ordering",
  },
};

// Toimitushuomautus tuotteen kaupan markkinan ja kävijän markkinan mukaan.
//   FI-kävijä (oletus): vain Ruotsin kaupalle.  SE-kävijä: vain Suomen kaupalle ("Leverans från Finland").
//   Muu maa: jokaiselle kaupalle.
export function shippingNote(productMarket: string | undefined, view: ViewOpts = {}): string | undefined {
  const lang = view.lang ?? "fi";
  const viewer = view.market ?? "FI";
  const m = productMarket === "FI" || productMarket === "SE" || productMarket === "global" ? productMarket : undefined;
  if (viewer === "other") return NOTE_OTHER[m ?? "global"][lang];
  if (viewer === "SE") return m === "FI" ? NOTE_FI_TO_SE[lang] : undefined;
  return m === "SE" ? NOTE_SE_TO_FI[lang] : undefined;
}
function noteFor(source: string, view?: ViewOpts): string | undefined {
  return shippingNote(marketOf(source), view);
}

function toOffer(p: Product, view?: ViewOpts): ProductOffer {
  return {
    source: p.source, store: storeName(p.source), price: p.price,
    original_price: p.original_price, discount_percent: p.discount_percent,
    url_affiliate: p.url_affiliate, size_available: p.size_available,
    color: p.color, in_stock: p.in_stock,
    ...(marketOf(p.source) ? { market: marketOf(p.source) } : {}),
    ...(noteFor(p.source, view) ? { shipping_note: noteFor(p.source, view) } : {}),
  };
}

const TIER_ORDER = { A: 0, B: 1, C: 2 } as const;

export function mergeCrossStoreOffers(products: Product[], ctx?: FitContext, view?: ViewOpts): Product[] {
  // Union-find avainten yli
  const parent: number[] = products.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map<string, number>();
  products.forEach((p, i) => {
    for (const k of keysFor(p)) {
      const j = seen.get(k);
      if (j === undefined) seen.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Product[]>();
  products.forEach((p, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(p); else groups.set(r, [p]);
  });

  const cmp = (a: Product, b: Product) => {
    if (ctx) {
      const t = TIER_ORDER[fitTier(a, ctx)] - TIER_ORDER[fitTier(b, ctx)];
      if (t !== 0) return t;
    }
    // Suomen kauppa edustajaksi ennen ulkomaista, vaikka ulkomainen olisi hieman halvempi.
    const m = marketRank(a.source, view?.market) - marketRank(b.source, view?.market);
    if (m !== 0) return m;
    return toEur(a.price) - toEur(b.price);
  };

  const out: Product[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const sorted = [...group].sort(cmp);
    const rep = sorted[0];
    // Per kauppa vain paras tarjous; saman kaupan muut rivit (esim. toinen
    // värivaihtoehto eri hinnalla) pysyvät omina riveinään.
    const bestPerSource = new Map<string, Product>();
    const sameSourceExtras: Product[] = [];
    for (const p of sorted) {
      if (p.source === rep.source) { if (p !== rep) sameSourceExtras.push(p); continue; }
      if (!bestPerSource.has(p.source)) bestPerSource.set(p.source, p);
      else sameSourceExtras.push(p);
    }
    const offers = [...bestPerSource.values()]
      .filter((p) => !ctx || ctx.targetCm === undefined || sizePenalty(p.size_available, ctx) <= 2)
      .sort((a, b) => toEur(a.price) - toEur(b.price))
      .map((p) => toOffer(p, view));
    out.push(offers.length ? { ...rep, other_offers: offers } : rep);
    // Ne tarjoukset joita ei listattu other_offersissa (huono koko) tai
    // jotka ovat saman kaupan lisärivejä: saman kaupan lisärivit säilytetään.
    for (const p of sameSourceExtras) if (p.source === rep.source) out.push(p);
  }
  return out;
}

// Yksi askel hakutuloksille: kauppojen välinen yhdistäminen, sitten
// värivaihtoehtojen yhdistäminen kaupan sisällä.
export function dedupeResults(products: Product[], ctx?: FitContext, view?: ViewOpts): Product[] {
  return dedupeColorVariants(mergeCrossStoreOffers(products, ctx, view), ctx).map((p) => withMarket(p, view));
}

// Lisää tuotteelle markkina-alue ja tarvittaessa toimitushuomautus.
export function withMarket(p: Product, view?: ViewOpts): Product {
  const market = marketOf(p.source);
  const note = noteFor(p.source, view);
  if (!market) return p;
  return { ...p, market, ...(note ? { shipping_note: note } : {}) };
}
