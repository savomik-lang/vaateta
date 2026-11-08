import { GarmentType } from "../types";

// ---------------------------------------------------------------------------
// Polarn O. Pyretin kokomerkinnät (todennettu syötteestä 8.11.2026). Vaatteet ovat senttikokoja
// ("86", "86 - 92") ja toimivat sellaisinaan, mutta kolme tuoteryhmää käyttää omaa järjestelmäänsä:
//   sukat      EU-kenkäkoko (väli): "22 - 24", "25 - 27"
//   pipot      pään ympärysmitta cm: "40 - 42", "48 - 50"
//   käsineet   koko 0-6 (tai väli "1 - 3")
// Kokohaku ymmärtää vain pituuden (cm), joten ne muunnetaan arvioidulla taulukolla pituudeksi.
// Tulos on muotoa "86-98 (22-24)": alussa pituusväli (haun tulkitsema), sulkeissa kaupan oma
// merkintä, jotta ostaja tunnistaa oikean koon kaupan sivulta. Taulukot ovat arvioita
// (lasten kokotaulukoiden keskiarvoja), ei kaupan virallisia vastaavuuksia.
// ---------------------------------------------------------------------------

type Point = [number, number]; // [kaupan koko, pituus cm]

// Sukat: EU-koko -> pituus (sama linja kuin kenkätaulukko src/size.ts, jatkettu vauvankokoihin).
const SOCK_POINTS: Point[] = [[10, 44], [13, 50], [16, 62], [19, 74], [22, 86], [25, 98], [28, 110], [31, 122], [34, 134], [37, 146], [40, 158], [43, 170]];
// Pipot: pään ympärys -> pituus.
const HAT_POINTS: Point[] = [[34, 44], [36, 50], [38, 56], [40, 62], [42, 68], [44, 74], [46, 80], [48, 92], [50, 104], [52, 116], [54, 134], [56, 152], [58, 164], [60, 176]];
// Käsineet: koko -> pituusväli.
const GLOVE_RANGES: Record<number, [number, number]> = { 0: [56, 68], 1: [74, 86], 2: [86, 98], 3: [98, 110], 4: [110, 122], 5: [122, 134], 6: [134, 146] };

function interpolate(points: Point[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

const RANGE_RE = /^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/;

export interface ConvertedSize {
  /** Muunnettu koko tai null, jos tätä ei muunneta (käytetään alkuperäistä). */
  size: string | null;
  /** Koko on aikuisen (esim. sukka EU 46+): variantti jätetään pois. */
  adult: boolean;
}

const KEEP: ConvertedSize = { size: null, adult: false };

/** Muuntaa Polarn O. Pyretin ryhmäkohtaisen koon pituudeksi vaatetyypin mukaan. */
export function convertFeedSize(raw: string, garment: GarmentType): ConvertedSize {
  const s = raw.trim();
  if (/^one\s?size$/i.test(s)) return { size: "One Size", adult: false };
  const m = s.match(RANGE_RE);
  if (!m) return KEEP;
  const a = parseInt(m[1], 10);
  const b = m[2] ? parseInt(m[2], 10) : a;
  if (b < a) return KEEP;
  if (garment === "sukat") {
    if (a >= 46) return { size: null, adult: true };
    const lo = Math.round(interpolate(SOCK_POINTS, a));
    const hi = Math.round(interpolate(SOCK_POINTS, b + 1));
    return { size: `${lo}-${hi} (${a}${b !== a ? `-${b}` : ""})`, adult: false };
  }
  if (garment === "pipo") {
    if (a >= 60) return { size: null, adult: true };
    const lo = Math.round(interpolate(HAT_POINTS, a));
    const hi = Math.round(interpolate(HAT_POINTS, b));
    return { size: `${lo}-${hi} (pää ${a}${b !== a ? `-${b}` : ""})`, adult: false };
  }
  if (garment === "lapaset") {
    const ra = GLOVE_RANGES[a];
    const rb = GLOVE_RANGES[b];
    if (!ra || !rb) return KEEP;
    return { size: `${ra[0]}-${rb[1]} (koko ${a}${b !== a ? `-${b}` : ""})`, adult: false };
  }
  return KEEP;
}
