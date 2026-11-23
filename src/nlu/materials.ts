// Materiaalirajaukset (hakulause -> tuote). Materiaali tarkistetaan tuotteen materiaalikentästä JA otsikosta,
// koska syötteiden materiaalikenttä on useimmiten tyhjä ("villasukat" ei saa palauttaa pelkkiä puuvillasukkia
// eikä nollaa tulosta).

/** Villa: yksi rajaus fi (villa), sv (ull, ylle) ja en (wool, merino). */
export const WOOL_KEYWORD = "villa";
export const WOOL_QUERY_REGEX = /(?<![\p{L}\p{N}])(?:villa\p{L}*|merino\p{L}*|wool\p{L}*|ull\p{L}*|ylle\p{L}*)/u;
const WOOL_PRODUCT_REGEX = /villa|merino|wool|(?<![\p{L}])ull|ylle|lambswool|alpaca|cashmere/iu;

export function productHasMaterial(material: string | null | undefined, title: string, keyword: string): boolean {
  const haystack = `${material ?? ""} ${title}`.toLowerCase();
  if (keyword.toLowerCase() === WOOL_KEYWORD) return WOOL_PRODUCT_REGEX.test(haystack);
  return haystack.includes(keyword.toLowerCase());
}
