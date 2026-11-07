// Tuotteet, jotka eivät ole vaatteita ja joita ei saa näyttää lastenvaatehaussa: korut, lävistyskorut,
// vartalotuotteet. Vaatetyypin tunnistus on osamerkkijonohakua, joten esim. "Body Jewelry" luokittui
// aiemmin vauvan bodyksi. Tätä käytetään sekä tuonnissa (luokitus -> "muu") että haussa
// (jo kantaan tallennetut tuotteet suodatetaan pois ilman uutta tuontia).

const P = "(?<!\\p{L})";
const S = "(?!\\p{L})";

export const NON_CLOTHING_REGEX = new RegExp(
  [
    `${P}(?:body|ear|nose|belly|navel|tongue|lip|nipple|septum)\\s*(?:jewel(?:ry|lery)|rings?|studs?|bars?|barbells?|piercings?|clips?|chains?)${S}`,
    `${P}jewel(?:ry|lery|s)${S}`,
    `${P}piercings?${S}`,
    `${P}(?:earrings?|necklaces?|bracelets?|anklets?|pendants?|brooch(?:es)?|cufflinks?|barbells?|labrets?|septums?)${S}`,
    `\\p{L}*grillz${S}`,
    `${P}body\\s*(?:lotion|wash|oil|spray|pillow|scrub|butter|paint|glitter|stickers?|tattoos?|art|bag|armou?r|harness|shaper|brush|mist|cream|building|con)${S}`,
    // juomapullot, polttoainepullot ja muu retkeilyvarustus (Outnorth-valikoimassa korkit luokittuivat pipoiksi ja
    // pullot kengiksi). "Bottle green" on väri, joten pullo vaatii määreen tai vierussanan.
    `${P}(?:fuel|water|drinking|baby|feeding|sports?|insulated|thermo|sippy|vacuum)\\s+bottles?${S}`,
    `${P}bottles?\\s+(?:cap|lid|brush|holder|cage|set)${S}`,
    `${P}(?:sippy|thermos|flasks?|canteens?|hydration|nipples?\\s+(?:for|slow|medium|fast)|slow\\s+flow|pacifiers?|teethers?|cartridges?|canisters?|stoves?|lunch\\s?box(?:es)?)${S}`,
    // suomi ja ruotsi
    `${P}(?:korut?|korvakoru\\p{L}*|kaulakoru\\p{L}*|rannekoru\\p{L}*|sormus\\p{L}*|lävistys\\p{L}*|smycke\\p{L}*|örhänge\\p{L}*)${S}`,
  ].join("|"),
  "iu",
);

export function looksLikeNonClothing(...texts: (string | null | undefined)[]): boolean {
  return NON_CLOTHING_REGEX.test(texts.filter(Boolean).join(" "));
}

// Aito body/potkupuku/romper-tuote. "Body" ei saa osua osaksi muita sanoja (crossbody, somebody, bodycon).
export const BODY_PRODUCT_REGEX =
  /(?<!cross|some|any|no|every|anti|busy)body(?:s|suits?)?(?!\p{L})|potkupuku|bodysuit|vauvanbody|kietaisu|romper|babygrow/iu;
