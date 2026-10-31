// Karkea kielentunnistus hakutekstille. Käytetään vain päättämään, riittääkö
// sääntöparseri (suomi) vai kutsutaanko LLM-tulkintaa (muut kielet), sekä
// valitsemaan oletusvaluutta. Ei tarvitse olla tarkka: tuntematon teksti
// tulkitaan suomeksi, jolloin toimii vanha sääntöpolku.

export type DetectedLanguage = "fi" | "sv" | "en" | "other";

// Kielikohtaisia yleisiä sanoja. "other" = tanska/norja (yhteiset sanat).
const WORDS: Record<DetectedLanguage, Set<string>> = {
  fi: new Set([
    "tarvitsen", "tarvitaan", "haluan", "etsin", "ostaisin", "lapselle", "lapsen", "tytölle",
    "pojalle", "vuotiaalle", "vuotias", "vuotiaan", "koko", "ei", "ja", "tai", "alle", "enintään",
    "korkeintaan", "jotain", "talvitakki", "kurahousut", "housut", "takki", "kengät", "paita",
    "haalari", "farkut", "sadetakki", "vedenpitävä", "vedenpitävät", "euroa", "hinta", "sininen",
    "musta", "punainen", "vauvalle", "mekko", "pipo", "lapaset", "sukat", "tytön", "pojan",
  ]),
  sv: new Set([
    "jag", "behöver", "söker", "letar", "till", "min", "mitt", "dotter", "son", "barn", "år",
    "åring", "storlek", "och", "eller", "inte", "byxor", "jacka", "skor", "tröja", "overall",
    "under", "högst", "kronor", "kr", "regnbyxor", "regnjacka", "vinterjacka", "klänning",
    "mössa", "vantar", "strumpor", "pojke", "flicka", "något", "varmt", "vattentät",
    "stl", "tjej", "kille", "handskar", "kängor", "stövlar", "gummistövlar", "baddräkt", "huvtröja", "regnställ",
    "vinterbyxor", "vinteroverall", "sexåring", "månader", "budget", "för",
  ]),
  en: new Set([
    "i", "need", "looking", "for", "my", "the", "and", "or", "not", "no", "year", "years", "old",
    "size", "under", "max", "pants", "jacket", "shoes", "shirt", "daughter", "boy", "girl", "kid",
    "kids", "jeans", "something", "warm", "waterproof", "winter", "coat", "boots", "dress",
    "trousers", "euros", "with", "without", "baby", "toddler",
    "snowsuit", "beanie", "gloves", "mittens", "hoodie", "sweater", "swimsuit", "wellies", "sneakers", "budget", "yo",
  ]),
  other: new Set([
    "jeg", "trenger", "leter", "etter", "til", "min", "mitt", "datter", "sønn", "barn", "år",
    "størrelse", "og", "eller", "ikke", "bukser", "bukse", "jakke", "sko", "genser", "kjole",
    "regnbukse", "regnjakke", "vinterjakke", "under", "maks", "kroner", "gutt", "jente",
    "noget", "varmt", "støvler", "overtræk",
  ]),
};

const LANGUAGES: DetectedLanguage[] = ["fi", "sv", "en", "other"];

export function detectLanguage(text: string): DetectedLanguage {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const scores: Record<DetectedLanguage, number> = { fi: 0, sv: 0, en: 0, other: 0 };
  for (const word of words) {
    for (const lang of LANGUAGES) if (WORDS[lang].has(word)) scores[lang] += 1;
  }
  const ranked = LANGUAGES.map((l) => [l, scores[l]] as const).sort((a, b) => b[1] - a[1]);
  // Ei yhtään osumaa tai tasapeli -> suomi (vanha, toimiva sääntöpolku).
  if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return "fi";
  return ranked[0][0];
}
