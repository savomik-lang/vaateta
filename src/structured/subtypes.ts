import { Product, GarmentType } from "../types";

// ---------------------------------------------------------------------------
// Alatyypit (vaihe B2). Alatyyppi on lisäluokitus nykyisen garment_type-luokituksen päällä:
// se EI muuta tuotteen tyyppiä (paita pysyy paitana), vaan antaa sille tarkemman nimen otsikon
// perusteella (fi / sv / en). Tunnistus lasketaan lennossa ja muistetaan, joten kantaan jo
// tallennetut tuotteet saavat alatyypin ilman uutta tuontia.
//
// Säännöt ovat järjestyksessä: ensimmäinen osuva voittaa. Tuote, johon mikään sääntö ei osu,
// jää ilman alatyyppiä (ei "oletus"-alatyyppiä: pipo.pipo ei ole alatyyppi).
// Facetsissa alatyyppi näytetään vain, jos sillä on vähintään SUBTYPE_MIN_PRODUCTS tuotetta
// koko katalogissa (lapsisuodatettuna ja yhdistettynä), jotta UI ei näytä lähes tyhjiä kuvakkeita.
// ---------------------------------------------------------------------------

export const SUBTYPE_MIN_PRODUCTS = 8;

const P = "(?<![\\p{L}\\p{N}])";
const S = "(?![\\p{L}\\p{N}])";
/** Sana kokonaisena (rajat kirjaimiin ja numeroihin). */
const word = (...alts: string[]) => new RegExp(`${P}(?:${alts.join("|")})${S}`, "iu");
/** Vartalo + mikä tahansa pääte (suomen taivutus): "lenkkar" -> lenkkarit, lenkkareiden. */
const stem = (...alts: string[]) => new RegExp(`${P}(?:${alts.join("|")})\\p{L}*`, "iu");
const any = (...res: RegExp[]) => new RegExp(res.map((r) => `(?:${r.source})`).join("|"), "iu");

interface Rule { id: string; re: RegExp }

export const SUBTYPE_RULES: Partial<Record<GarmentType, Rule[]>> = {
  kengät: [
    { id: "kumisaappaat", re: any(word("rain\\s?boots?", "wellies", "wellingtons?", "rubber\\s+boots?", "rain\\s+wellies"), stem("kumisaapp", "kurasaapp", "gummistövl", "gummistöv", "regnstövl")) },
    { id: "lenkkarit", re: any(word("sneakers?", "trainers?", "running\\s+shoes?", "sport\\s+shoes?", "gym\\s+shoes?", "tennis\\s+shoes?"), stem("lenkkar", "lenkkitossu", "juoksukeng", "urheilukeng", "tennari", "löparsko", "löparskor", "joggingsko", "joggingskor", "träningssko", "träningsskor", "gympasko", "gympaskor")) },
    { id: "sandaalit", re: any(word("sandals?", "flip[\\s-]?flops?", "slides?", "sliders?"), stem("sandaal", "sandaler", "sandalett", "varvassandal")) },
    { id: "tossut", re: any(word("slippers?", "house\\s+shoes?", "indoor\\s+shoes?"), stem("tohvel", "\\p{L}*tossu", "tofflor", "toffel", "innesko", "inneskor", "sisäkeng")) },
  ],
  pipo: [
    { id: "kypärämyssy", re: any(word("balaclavas?", "balaklavas?", "helmet\\s+hats?", "helmet\\s+beanies?"), stem("kypärämyss", "kypärälakk", "balaklav", "hjälmmöss")) },
    { id: "sadehattu", re: any(word("rain\\s?hats?", "sou'?wester", "sou-wester"), stem("sadehat", "sydväst", "regnhatt")) },
    { id: "aurinkohattu", re: any(word("sun\\s?hats?", "bucket\\s+hats?", "uv\\s+hats?", "safari\\s+hats?", "legionnaire\\s+hats?", "swim\\s+hats?"), stem("aurinkohat", "solhatt", "kalastajahat", "uv-hat", "uv-hatt")) },
    { id: "lippis", re: any(word("caps?", "baseball\\s+caps?", "trucker\\s+caps?", "keps", "kepsar", "visor"), stem("lippis", "lippalakk", "lippahatt")) },
  ],
  lapaset: [
    { id: "sormikkaat", re: any(word("gloves?", "handskar", "handske", "fingervantar", "finger\\s+mittens?"), stem("sormikka", "sormikas", "fingervant", "käsine", "hansk")) },
    { id: "lapaset", re: any(word("mittens?", "mitts?", "vantar", "vante", "lobster\\s+gloves?"), stem("lapanen", "lapaset", "lapas", "rukkas", "tumppu", "tumvant", "vant")) },
  ],
  paita: [
    { id: "huppari", re: any(word("hoodies?", "hooded\\s+(?:sweat|top|shirt|jumper)", "zip\\s+hoodie"), stem("huppari", "huvtröj", "huvja")) },
    { id: "fleece", re: any(word("fleece", "mid[\\s-]?layers?", "micro[\\s-]?fleece", "pile"), stem("mikrofleece", "välikerros", "fleecepaita", "mellanlager")) },
    { id: "t-paita", re: any(word("t[\\s-]?shirts?", "tee", "tees", "tank\\s+tops?"), stem("t-paita", "t-paid", "teepaita", "t-tröja", "t-shirt", "tshirt", "toppi")) },
    { id: "pitkähihainen", re: any(word("long[\\s-]?sleeves?", "long[\\s-]?sleeved", "ls\\s+(?:top|tee|shirt)", "longsleeve"), stem("pitkähihai", "långärm", "långärmad", "lshirt")) },
    { id: "neule", re: any(word("sweaters?", "jumpers?", "knit(?:ted)?", "knitwear", "cardigans?", "pullovers?", "stickad", "stickade", "stickat"), stem("neule", "neuletakki", "villapaid", "villapusero")) },
  ],
  housut: [
    // Järjestys ratkaisee: "Farkkushortsit" on shortsit ja "Collegehousut denim-tyylillä" collegehousut, ei farkut.
    { id: "shortsit", re: any(word("shorts", "short\\s+pants", "bermudas?", "swim\\s?shorts"), stem("\\p{L}*shortsi", "bermuda")) },
    { id: "collegehousut", re: any(word("sweat\\s?pants", "joggers?", "jogger\\s+pants", "track\\s?pants", "jogging\\s+pants"), stem("collegehous", "college-hous", "mjukisbyx", "verkkari", "verryttelyhous", "collegebyx", "joggingbyx")) },
    { id: "leggingsit", re: any(word("leggings?", "leggins", "tights\\s+(?:kids|girls)"), stem("leggingsi", "leggingsit", "leggins")) },
    { id: "farkut", re: any(word("jeans", "denim\\s+(?:pants|trousers)", "denim"), stem("farkku", "farkut", "jeanshous")) },
    { id: "ulkoiluhousut", re: any(word("softshell", "hiking", "trekking", "outdoor", "shell\\s+pants", "trail", "walking\\s+pants", "cargo\\s+pants"), stem("ulkoilu", "retkeily", "vaellus", "friluft", "softshell")) },
  ],
  takki: [
    { id: "softshell", re: any(word("softshell", "soft\\s+shell"), stem("softshell")) },
    { id: "kuoritakki", re: any(word("shell\\s+jackets?", "hardshell", "hard\\s+shell", "rain\\s+jackets?", "waterproof\\s+jackets?", "skaljacka", "shell"), stem("kuoritakki", "kuorijakku", "sadetakki", "regnjacka")) },
    { id: "toppatakki", re: any(word("down\\s+jackets?", "down", "puffer", "puffa", "padded", "quilted", "insulated\\s+jackets?"), stem("untuva", "toppatakki", "toppa", "dunjack", "dunjacka", "vadderad", "tikkitakki")) },
  ],
};

// Vain vapaan tekstin hakuun: alatyyppejä, joita ei näytetä facetsissa (kuvakkeita ei ole), mutta joilla
// haku voi rajata. Fleece-takit ovat kannassa osin takkeina, osin paitoina (paita.fleece).
export const FREE_TEXT_SUBTYPE_RULES: Partial<Record<GarmentType, Rule[]>> = {
  // Sadeasu = sadevaatteeksi nimetty haalari. Pelkkä "vedenpitävä"-merkintä ei riitä: fleece- ja välikausihaalareita
  // on merkitty vedenpitäviksi, mutta ne eivät ole sadeasuja.
  haalari: [
    { id: "sadeasu", re: any(word("rain\\s?(?:suits?|sets?|overalls?|outfits?)", "waterproof\\s+(?:suits?|overalls?|sets?)", "shell\\s+(?:suits?|overalls?|sets?)", "puddle\\s?suits?"), stem("sadeasu", "sadehaalari", "kuoriasu", "kuorihaalari", "regnställ", "regnoverall", "skalställ", "skaloverall")) },
  ],
  takki: [
    { id: "fleece", re: any(word("fleece", "pile", "windfleece", "wind\\s+fleece"), stem("fleecetakk", "fleecejack", "fleecejakk", "mikrofleece", "pilejack", "pilejakk")) },
  ],
};

/** Alatyyppi, jonka tuote täyttää: tallennettu/johdettu alatyyppi tai vapaan tekstin lisäsääntö. "pipo" = pipo, jolla ei ole muuta pipo-alatyyppiä. */
export function matchesSubtype(p: Product, subtype: string): boolean {
  const own = subtypeOf(p);
  if (own === subtype) return true;
  if (subtype === "pipo") return p.garment_type === "pipo" && own === null;
  const extra = FREE_TEXT_SUBTYPE_RULES[p.garment_type]?.find((r) => r.id === subtype);
  return Boolean(extra && extra.re.test(p.title));
}

/** Kuuluuko alatyyppi tälle vaatetyypille (hakutulkinnan eheystarkistus). */
export function subtypeBelongsTo(garment: GarmentType | undefined, subtype: string): boolean {
  if (!garment) return false;
  if (subtype === "pipo") return garment === "pipo";
  return [...(SUBTYPE_RULES[garment] ?? []), ...(FREE_TEXT_SUBTYPE_RULES[garment] ?? [])].some((r) => r.id === subtype);
}

// Alatyypit, joiden sana kertoo myös vaatetyypin (haku "neule 110" tai "kypärälakki" ilman muuta vaatesanaa).
// Lyhyet, monitulkintaiset sanat (ulkoiluhousut: "trail", "outdoor"; pitkähihainen) jätetään pois.
const IMPLIES_GARMENT = new Set([
  "kypärämyssy", "sadehattu", "aurinkohattu", "lippis", "kumisaappaat", "lenkkarit", "sandaalit", "tossut",
  "sormikkaat", "huppari", "t-paita", "neule", "fleece", "farkut", "shortsit", "leggingsit", "collegehousut", "softshell", "kuoritakki", "toppatakki", "sadeasu",
]);
const PLAIN_PIPO_RE = /(?<![\p{L}\p{N}])(?:pipo|pipot|pipon|pipoa|pipoja|beanies?|mössa|mössor|myssy|myssyt|myssyn)(?![\p{L}\p{N}])/iu;

export interface SubtypeHit { garment: GarmentType; subtype: string }

/**
 * Alatyyppi hakutekstistä (fi/sv/en, samat sanat kuin tuotteiden alatyyppisäännöissä).
 * Vaatetyyppi tiedossa: vain sen tyypin säännöt. Ei tiedossa: alatyyppi, jonka sana kertoo vaatetyypin.
 * Hakulauseen "pipo"/"beanie"/"mössa" rajaa pipot ilman erikoisalatyyppiä (ei lippiksiä, aurinkohattuja, kypärämyssyjä).
 */
export function findSubtype(text: string, garment?: GarmentType): SubtypeHit | undefined {
  const garments = garment ? [garment] : (Object.keys({ ...SUBTYPE_RULES, ...FREE_TEXT_SUBTYPE_RULES }) as GarmentType[]);
  for (const g of garments) {
    for (const r of [...(SUBTYPE_RULES[g] ?? []), ...(FREE_TEXT_SUBTYPE_RULES[g] ?? [])]) {
      if (!r.re.test(text)) continue;
      if (garment || IMPLIES_GARMENT.has(r.id)) return { garment: g, subtype: r.id };
    }
  }
  if ((!garment || garment === "pipo") && PLAIN_PIPO_RE.test(text)) return { garment: "pipo", subtype: "pipo" };
  return undefined;
}

const memo = new WeakMap<Product, string | null>();

/** Tuotteen alatyyppi (tai null). Käyttää tuonnissa asetettua `subtype`-kenttää, jos se on olemassa. */
export function subtypeOf(p: Product): string | null {
  const stored = (p as Product & { subtype?: string | null }).subtype;
  if (stored !== undefined) return stored;
  const cached = memo.get(p);
  if (cached !== undefined) return cached;
  const rules = SUBTYPE_RULES[p.garment_type];
  let found: string | null = null;
  if (rules) {
    for (const r of rules) {
      if (r.re.test(p.title)) { found = r.id; break; }
    }
  }
  memo.set(p, found);
  return found;
}

/** Vaatetyypit, joilla on alatyyppejä. */
export function garmentsWithSubtypes(): GarmentType[] {
  return Object.keys(SUBTYPE_RULES) as GarmentType[];
}

export function subtypeIdsFor(garment: GarmentType): string[] {
  return (SUBTYPE_RULES[garment] ?? []).map((r) => r.id);
}
