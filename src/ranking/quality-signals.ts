// Tunnistaa "laatuun viittaavan merkinnän" tuotteesta.
// Pohjautuu: hakukokemus-ja-jarjestys-speksi.md kohta 2.5 (heuristiikka B).
//
// Kaksi lähdettä tarkistetaan:
//   1. Strukturoidut kentät (esim. waterproof: true) - luotettavampi kuin teksti
//   2. Avainsanat material/title-teksteissä - varasignaali kun rakenteista
//      dataa ei ole (moni kauppa ei täytä material-kenttää johdonmukaisesti)

const QUALITY_TEXT_KEYWORDS = [
  "vedenpitävä",
  "vedenkestäv",
  "luomupuuvilla",
  "gots",
  "merinovilla",
  "gore-tex",
  "goretex",
  "vahvistetut polvet",
];

export interface QualitySignalInput {
  material: string | null;
  title: string;
  waterproof: boolean | null;
}

export function hasQualitySignal(product: QualitySignalInput): boolean {
  if (product.waterproof === true) return true;

  const haystack = `${product.material ?? ""} ${product.title}`.toLowerCase();
  return QUALITY_TEXT_KEYWORDS.some((kw) => haystack.includes(kw));
}
