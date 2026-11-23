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
    // Nalgene-pullot ja litra-/millilitramäärä otsikossa ("Nalgene Kids' Otf 0,35 L", "500 ml"): juomapullo, ei kenkä.
    `${P}nalgene${S}`,
    `${P}\\d+(?:[.,]\\d+)?\\s?(?:ml|cl|dl)${S}`,
    `${P}\\d+[.,]\\d+\\s?l${S}`,
    `${P}\\d+\\s?(?:litres?|liters?|litra)${S}`,
    // Lemmikin vaatteet ja tarvikkeet (Voghion: "Christmas dog clothes Big dog cat Teddy Bear"). "Dog print" -painatus lapsen paidassa ei osu.
    // Pelkkä "cat/dog + hoodie/t-shirt" voi olla lapsen vaate eläinkuvalla, joten koiralle/kissalle vain selvät sanat.
    `${P}(?:dogs?|cats?)\\s+(?:clothes|clothing|costumes?|apparel|outfits?|raincoats?|harness(?:es)?|collars?)${S}`,
    `${P}(?:pets?|puppy|puppies|kitten|kittens)\\s+(?:clothes|clothing|costumes?|coats?|jackets?|sweaters?|hoodies?|apparel|outfits?|vests?|shoes?|boots?|socks?|dress(?:es)?|pajamas?|raincoats?|harness(?:es)?|collars?)${S}`,
    `${P}(?:clothes|clothing|costumes?|apparel)\\s+for\\s+(?:dogs?|cats?|pets?)${S}`,
    `${P}(?:koiran|kissan|lemmikin|lemmikki|koira|kissa)\\s?(?:vaatteet|vaate|takki|asu|puku|haalari|kengät|sukat)${S}`,
    `${P}(?:hund|katt|husdjurs?)(?:kläder|jacka|tröja|overall|skor)${S}`,
    // Vaatteen tarvikkeet: jalkalenkit (housun lahkeen pidike) eivät ole housuja.
    `${P}jalkalenkk\\p{L}*${S}`,
    `${P}(?:trouser|pants?)\\s+(?:stirrups?|straps?|loops?)${S}`,
    `${P}(?:foot|leg)\\s+(?:stirrups?|loops?)${S}`,
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
  /(?<!cross|some|any|no|every|anti|busy)body(?:s|t|suits?)?(?!\p{L})|potkupuku|bodysuit|vauvanbody|kietaisu|romper|babygrow/iu;
