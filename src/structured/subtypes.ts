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
    { id: "tossut", re: any(word("slippers?", "house\\s+shoes?", "indoor\\s+shoes?"), stem("tohvel", "tossu", "tofflor", "toffel", "innesko", "inneskor", "sisäkeng")) },
  ],
  pipo: [
    { id: "kypärämyssy", re: any(word("balaclavas?", "balaklavas?", "helmet\\s+hats?", "helmet\\s+beanies?"), stem("kypärämyss", "balaklav", "hjälmmöss")) },
    { id: "aurinkohattu", re: any(word("sun\\s?hats?", "bucket\\s+hats?", "uv\\s+hats?", "safari\\s+hats?", "legionnaire\\s+hats?", "swim\\s+hats?"), stem("aurinkohat", "solhatt", "kalastajahat", "uv-hat", "uv-hatt")) },
    { id: "lippis", re: any(word("caps?", "baseball\\s+caps?", "trucker\\s+caps?", "keps", "kepsar", "visor"), stem("lippis", "lippalakk", "lippahatt")) },
  ],
  lapaset: [
    { id: "sormikkaat", re: any(word("gloves?", "handskar", "handske", "fingervantar", "finger\\s+mittens?"), stem("sormikka", "sormikas", "fingervant")) },
    { id: "lapaset", re: any(word("mittens?", "mitts?", "vantar", "vante", "lobster\\s+gloves?"), stem("lapanen", "lapaset", "lapas", "vant")) },
  ],
  paita: [
    { id: "huppari", re: any(word("hoodies?", "hooded\\s+(?:sweat|top|shirt|jumper)", "zip\\s+hoodie"), stem("huppari", "huvtröj", "huvja")) },
    { id: "fleece", re: any(word("fleece", "mid[\\s-]?layers?", "micro[\\s-]?fleece", "pile"), stem("mikrofleece", "välikerros", "fleecepaita", "mellanlager")) },
    { id: "t-paita", re: any(word("t[\\s-]?shirts?", "tee", "tees", "tank\\s+tops?"), stem("t-paita", "t-paid", "teepaita", "t-tröja", "t-shirt", "tshirt", "toppi")) },
    { id: "pitkähihainen", re: any(word("long[\\s-]?sleeves?", "long[\\s-]?sleeved", "ls\\s+(?:top|tee|shirt)", "longsleeve"), stem("pitkähihai", "långärm", "långärmad", "lshirt")) },
    { id: "neule", re: any(word("sweaters?", "jumpers?", "knit(?:ted)?", "knitwear", "cardigans?", "pullovers?", "stickad", "stickade", "stickat"), stem("neule", "neuletakki", "villapaid", "villapusero")) },
  ],
  housut: [
    { id: "farkut", re: any(word("jeans", "denim\\s+(?:pants|trousers)", "denim"), stem("farkku", "farkut", "jeanshous")) },
    { id: "shortsit", re: any(word("shorts", "short\\s+pants", "bermudas?", "swim\\s?shorts"), stem("shortsi", "shortsit", "bermuda")) },
    { id: "leggingsit", re: any(word("leggings?", "leggins", "tights\\s+(?:kids|girls)"), stem("leggingsi", "leggingsit", "leggins")) },
    { id: "ulkoiluhousut", re: any(word("softshell", "hiking", "trekking", "outdoor", "shell\\s+pants", "trail", "walking\\s+pants", "cargo\\s+pants"), stem("ulkoilu", "retkeily", "vaellus", "friluft", "softshell")) },
  ],
  takki: [
    { id: "softshell", re: any(word("softshell", "soft\\s+shell"), stem("softshell")) },
    { id: "kuoritakki", re: any(word("shell\\s+jackets?", "hardshell", "hard\\s+shell", "rain\\s+jackets?", "waterproof\\s+jackets?", "skaljacka", "shell"), stem("kuoritakki", "kuorijakku", "sadetakki", "regnjacka")) },
    { id: "toppatakki", re: any(word("down\\s+jackets?", "down", "puffer", "puffa", "padded", "quilted", "insulated\\s+jackets?"), stem("untuva", "toppatakki", "toppa", "dunjack", "dunjacka", "vadderad", "tikkitakki")) },
  ],
};

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
