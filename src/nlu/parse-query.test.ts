import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCriteriaFromText } from "./parse-query";

test("tunnistaa vaatetyypin ja hinnan", () => {
  const result = parseCriteriaFromText("Talvihaalari 5-vuotiaalle tytölle, max 120 €");
  assert.equal(result.garment_type, "haalari");
  assert.equal(result.child_gender_pref, "tyttö");
  assert.deepEqual(result.max_price, { amount: 120, currency: "EUR" });
  assert.equal(result.size_raw, "110");
});
test("tunnistaa kurahousut, vedenpitävyyden ja koon cm:ssä", () => {
  const result = parseCriteriaFromText("Kurahousut 92 cm, täytyy olla vedenpitävät");
  assert.equal(result.garment_type, "kurahousut");
  assert.equal(result.waterproof, true);
  assert.equal(result.size_raw, "92");
});
test("tunnistaa 'alle X€' -muotoisen hintarajan", () => {
  const result = parseCriteriaFromText("Farkut pojalle, alle 40 euroa");
  assert.equal(result.garment_type, "housut");
  assert.equal(result.child_gender_pref, "poika");
  assert.deepEqual(result.max_price, { amount: 40, currency: "EUR" });
});
test("tunnistaa materiaalimaininnan", () => {
  const result = parseCriteriaFromText("Paita luomupuuvillaa, sininen");
  assert.equal(result.garment_type, "paita");
  assert.deepEqual(result.material_keywords, ["luomupuuvilla"]);
  assert.equal(result.color, "sininen");
});
test("ei keksi kriteerejä joita tekstissä ei mainita", () => {
  const result = parseCriteriaFromText("Tarvitsen jotain lapselle");
  assert.equal(result.garment_type, undefined);
  assert.equal(result.max_price, undefined);
  assert.equal(result.waterproof, undefined);
});
test("tunnistaa brändin poissulkemisen karkeasti", () => {
  const result = parseCriteriaFromText("Takki, ei Reimaa");
  assert.ok(result.brand_deny && result.brand_deny.includes("reimaa"));
});
test("tunnistaa uudet vaatetyypit: mekko, body, uimapuku, pyjama", () => {
  assert.equal(parseCriteriaFromText("Mekko tytölle").garment_type, "mekko");
  assert.equal(parseCriteriaFromText("Body vauvalle").garment_type, "body");
  assert.equal(parseCriteriaFromText("Uimapuku tytölle").garment_type, "uimapuku");
  assert.equal(parseCriteriaFromText("Pyjama 4-vuotiaalle").garment_type, "pyjama");
});
test("toppahousut ja kurahousut ovat omia tyyppejään, ei yleistä housut-tyyppiä", () => {
  assert.equal(parseCriteriaFromText("Toppahousut 110 cm").garment_type, "toppahousut");
  assert.equal(parseCriteriaFromText("Kurahousut lapselle").garment_type, "kurahousut");
  assert.equal(parseCriteriaFromText("Farkut pojalle").garment_type, "housut");
});
test("lapselle/lapsen/lapsille/vauvalle/vauvan/taaperolle aktivoivat child_signal-lipun", () => {
  for (const q of ["kurahousut lapselle", "lapsen takki", "pipo lapsille", "body vauvalle", "vauvan haalari", "kengät taaperolle"]) {
    assert.equal(parseCriteriaFromText(q).child_signal, true, q);
  }
  assert.equal(parseCriteriaFromText("kurahousut").child_signal, undefined);
});

test("ikä 13-17 muuttuu koolle: 14 v -> 164 cm, age ja size_cm mukana", () => {
  const r = parseCriteriaFromText("talvitakki 14-vuotiaalle tytölle");
  assert.equal(r.size_cm, 164);
  assert.equal(r.age, 14);
  assert.equal(r.size_raw, "164");
  assert.equal(parseCriteriaFromText("housut 16 vuotiaalle").size_cm, 176);
  assert.equal(parseCriteriaFromText("takki 40-vuotiaalle").size_cm, undefined);
});

test("talvi/untuva/toppa -> season winter (toppa vain takille/haalarille/kengille)", () => {
  assert.equal(parseCriteriaFromText("talvitakki pojalle").season, "winter");
  assert.equal(parseCriteriaFromText("untuvatakki").season, "winter");
  assert.equal(parseCriteriaFromText("toppatakki").season, "winter");
  assert.equal(parseCriteriaFromText("kurahousut lapselle").season, undefined);
});

test("brand_deny: 'ei liian kallis' ei ole brändi, 'ei Reimaa' on", () => {
  assert.equal(parseCriteriaFromText("hyvälaatuinen talvitakki pojalle, ei liian kallis").brand_deny, undefined);
  assert.deepEqual(parseCriteriaFromText("Takki, ei Reimaa").brand_deny, ["reimaa"]);
  assert.deepEqual(parseCriteriaFromText("takki ei reimaa").brand_deny, ["reimaa"]);
});

test("puhehaku: lukusanaikä ja hintaraja (116 cm, max 80 EUR)", () => {
  for (const q of [
    "talvitakki 6-vuotiaalle, max 80 euroa",
    "talvitakki kuusivuotiaalle max 80 euroa",
    "talvitakki kuuden vuoden ikäiselle alle 80 €",
    "Talvitakki 6 vuotiaalle maksimissaan 80 euroa",
  ]) {
    const r = parseCriteriaFromText(q);
    assert.equal(r.size_cm, 116, q);
    assert.equal(r.age, 6, q);
    assert.deepEqual(r.max_price, { amount: 80, currency: "EUR" }, q);
    assert.equal(r.garment_type, "takki", q);
    assert.equal(r.season, "winter", q);
  }
});
test("hintarajan muodot: korkeintaan, enintään, budjetti, asti, e/eur", () => {
  const price = (q: string) => parseCriteriaFromText(q).max_price?.amount;
  assert.equal(price("takki korkeintaan 60 euroa"), 60);
  assert.equal(price("takki enintään 60 eur"), 60);
  assert.equal(price("takki budjetti 60"), 60);
  assert.equal(price("takki 60 euroon asti"), 60);
  assert.equal(price("takki alle 60 e"), 60);
  assert.equal(price("takki max 29,90 €"), 29.9);
  assert.equal(price("takki kahdeksankymmentä euroa asti"), 80);
});
test("hintaraja ei sekoitu ikään tai määrään", () => {
  assert.equal(parseCriteriaFromText("takki alle 6-vuotiaalle").max_price, undefined);
  assert.equal(parseCriteriaFromText("sukat korkeintaan 3 paria").max_price, undefined);
  assert.equal(parseCriteriaFromText("takki 116 cm").max_price, undefined);
});
test("lukusana koossa: sataviisitoista senttiä", () => {
  const r = parseCriteriaFromText("haalari sataviisitoista senttiä");
  assert.equal(r.size_cm, 115);
  assert.equal(parseCriteriaFromText("haalari 116 senttiä").size_cm, 116);
});
test("kuukaudet tulkitaan vauvakooksi, ei vuosiksi", () => {
  for (const q of ["body kuuden kuukauden", "body 6 kk", "body kuusikuinen", "body 6kk"]) {
    const r = parseCriteriaFromText(q);
    assert.equal(r.size_cm, 68, q);
    assert.equal(r.age, undefined, q);
  }
  assert.equal(parseCriteriaFromText("haalari puolitoistavuotiaalle").size_cm, 86);
});
test("ikä 18+ ei tulkita lapsen kooksi", () => {
  assert.equal(parseCriteriaFromText("takki kolmekymmentä vuotta").size_cm, undefined);
});

// --- Ruotsi ja englanti (UI-chatin kieliversiot) ---------------------------------------
test("sv/en: UI-chatin viisi lausetta tuottavat vaatetyypin, koon ja hinnan oikealla valuutalla", () => {
  const a = parseCriteriaFromText("vinterjacka till 6 år");
  assert.equal(a.garment_type, "takki");
  assert.equal(a.size_cm, 116);
  assert.equal(a.age, 6);
  assert.equal(a.season, "winter");

  const b = parseCriteriaFromText("regnbyxor storlek 116 max 400 kr");
  assert.equal(b.garment_type, "kurahousut");
  assert.equal(b.size_cm, 116);
  assert.deepEqual(b.max_price, { amount: 400, currency: "SEK" });

  const c = parseCriteriaFromText("mössa till min son 4 år");
  assert.equal(c.garment_type, "pipo");
  assert.equal(c.size_cm, 104);
  assert.equal(c.age, 4);
  assert.equal(c.child_gender_pref, "poika");

  const d = parseCriteriaFromText("winter jacket for 6 year old");
  assert.equal(d.garment_type, "takki");
  assert.equal(d.size_cm, 116);
  assert.equal(d.age, 6);
  assert.equal(d.season, "winter");

  const e = parseCriteriaFromText("rain pants size 116 under 40 euros");
  assert.equal(e.garment_type, "kurahousut");
  assert.equal(e.size_cm, 116);
  assert.deepEqual(e.max_price, { amount: 40, currency: "EUR" });
});
test("sv: vaatesanat", () => {
  const g = (q: string) => parseCriteriaFromText(q).garment_type;
  assert.equal(g("jacka"), "takki");
  assert.equal(g("regnjacka"), "takki");
  assert.equal(g("vinteroverall"), "haalari");
  assert.equal(g("regnställ"), "haalari");
  assert.equal(g("vinterbyxor"), "toppahousut");
  assert.equal(g("termobyxor"), "toppahousut");
  assert.equal(g("överdragsbyxor"), "toppahousut");
  assert.equal(g("byxor"), "housut");
  assert.equal(g("jeans"), "housut");
  assert.equal(g("tröja"), "paita");
  assert.equal(g("huvtröja"), "paita");
  assert.equal(g("klänning"), "mekko");
  assert.equal(g("mössa"), "pipo");
  assert.equal(g("vantar"), "lapaset");
  assert.equal(g("handskar"), "lapaset");
  assert.equal(g("strumpor"), "sukat");
  assert.equal(g("strumpbyxor"), "sukat");
  assert.equal(g("skor"), "kengät");
  assert.equal(g("stövlar"), "kengät");
  assert.equal(g("gummistövlar"), "kengät");
  assert.equal(g("kängor"), "kengät");
  assert.equal(g("pyjamas"), "pyjama");
  assert.equal(g("baddräkt"), "uimapuku");
  assert.equal(g("badbyxor"), "uimapuku");
  assert.equal(g("body"), "body");
});
test("en: vaatesanat", () => {
  const g = (q: string) => parseCriteriaFromText(q).garment_type;
  assert.equal(g("snowsuit for toddler"), "haalari");
  assert.equal(g("snow pants"), "toppahousut");
  assert.equal(g("winter pants for kids"), "toppahousut");
  assert.equal(g("rain jacket"), "takki");
  assert.equal(g("beanie"), "pipo");
  assert.equal(g("a warm hat"), "pipo");
  assert.equal(g("gloves"), "lapaset");
  assert.equal(g("mittens"), "lapaset");
  assert.equal(g("boots"), "kengät");
  assert.equal(g("wellies"), "kengät");
  assert.equal(g("sneakers"), "kengät");
  assert.equal(g("hoodie"), "paita");
  assert.equal(g("sweater"), "paita");
  assert.equal(g("swimsuit"), "uimapuku");
});
test("en: sana ei osu osamerkkijonoon (that/what ei ole hat)", () => {
  assert.equal(parseCriteriaFromText("what is that").garment_type, undefined);
  assert.equal(parseCriteriaFromText("something for my kid").garment_type, undefined);
});
test("sv/en: ikämuodot", () => {
  const age = (q: string) => parseCriteriaFromText(`jacka ${q}`).age;
  assert.equal(age("6 år"), 6);
  assert.equal(age("6-åring"), 6);
  assert.equal(age("6 års"), 6);
  assert.equal(age("sexåring"), 6);
  assert.equal(age("till en sexåring"), 6);
  assert.equal(age("till ett barn på fjorton år"), 14);
  assert.equal(age("6 year old"), 6);
  assert.equal(age("6-year-old"), 6);
  assert.equal(age("6 yo"), 6);
  assert.equal(age("age 6"), 6);
  assert.equal(age("6 years"), 6);
  assert.equal(age("six year old"), 6);
  assert.equal(age("for a six-year-old"), 6);
  assert.equal(age("fourteen years old"), 14);
  assert.equal(age("ages 4-11"), undefined);
});
test("sv/en: kuukaudet ovat vauvakoko eivätkä ikävuosia", () => {
  for (const q of ["body 6 månader", "body 6 mån", "body sex månader", "baby body 6 months", "body six months old"]) {
    const r = parseCriteriaFromText(q);
    assert.equal(r.size_cm, 68, q);
    assert.equal(r.age, undefined, q);
  }
});
test("sv/en: koko storlek/stl/size", () => {
  assert.equal(parseCriteriaFromText("jacka storlek 128").size_cm, 128);
  assert.equal(parseCriteriaFromText("jacka stl 128").size_cm, 128);
  assert.equal(parseCriteriaFromText("jacket size 128").size_cm, 128);
  assert.equal(parseCriteriaFromText("takki koko 128").size_cm, 128);
  // kenkien EU-koko -> pituus
  assert.equal(parseCriteriaFromText("skor storlek 34").size_cm, 134);
  assert.equal(parseCriteriaFromText("boots size 40").size_cm, 164);
  // vaatteilla pieni luku ei ole senttikoko
  assert.equal(parseCriteriaFromText("jacket size 34").size_cm, undefined);
});
test("sv/en: hintarajat ja valuutat", () => {
  const p = (q: string) => parseCriteriaFromText(q).max_price;
  assert.deepEqual(p("jacka max 400 kr"), { amount: 400, currency: "SEK" });
  assert.deepEqual(p("jacka högst 400 kronor"), { amount: 400, currency: "SEK" });
  assert.deepEqual(p("jacka under 400 sek"), { amount: 400, currency: "SEK" });
  assert.deepEqual(p("jacka budget 400 kr"), { amount: 400, currency: "SEK" });
  assert.deepEqual(p("jacka 400 kr eller mindre"), { amount: 400, currency: "SEK" });
  assert.deepEqual(p("jacket under 40 euros"), { amount: 40, currency: "EUR" });
  assert.deepEqual(p("jacket max 40 eur"), { amount: 40, currency: "EUR" });
  assert.deepEqual(p("jacket less than 40 €"), { amount: 40, currency: "EUR" });
  assert.deepEqual(p("jacket under €40"), { amount: 40, currency: "EUR" });
  assert.deepEqual(p("jacket 40 euros or less"), { amount: 40, currency: "EUR" });
  assert.deepEqual(p("jacket up to 40 euros"), { amount: 40, currency: "EUR" });
  // ruotsinkielinen "max 400" ilman valuuttaa -> kruunu; suomi/englanti -> EUR
  assert.deepEqual(p("regnjacka till min dotter max 400"), { amount: 400, currency: "SEK" });
  assert.deepEqual(p("takki max 80"), { amount: 80, currency: "EUR" });
});
test("sv/en: hintaraja ei sekoitu ikään", () => {
  assert.equal(parseCriteriaFromText("jacka under 6 år").max_price, undefined);
  assert.equal(parseCriteriaFromText("jacket under 6 years old").max_price, undefined);
});
test("sv/en: sukupuoli ja lapsisignaali", () => {
  const r = (q: string) => parseCriteriaFromText(q);
  assert.equal(r("jacka till min dotter").child_gender_pref, "tyttö");
  assert.equal(r("jacka till en flicka").child_gender_pref, "tyttö");
  assert.equal(r("jacka tjej").child_gender_pref, "tyttö");
  assert.equal(r("jacka till min son").child_gender_pref, "poika");
  assert.equal(r("jacka till pojke").child_gender_pref, "poika");
  assert.equal(r("jacka kille").child_gender_pref, "poika");
  assert.equal(r("jacket for my daughter").child_gender_pref, "tyttö");
  assert.equal(r("jacket for a girl").child_gender_pref, "tyttö");
  assert.equal(r("jacket for my son").child_gender_pref, "poika");
  assert.equal(r("jacket for a boy").child_gender_pref, "poika");
  assert.equal(r("jacka barn").child_signal, true);
  assert.equal(r("jacket for kids").child_signal, true);
  assert.equal(r("jacket for a toddler").child_signal, true);
  assert.equal(r("baby jacket").child_signal, true);
  // sana ei osu osamerkkijonoon (season/reason sisältävät "son")
  assert.equal(r("jacket for the season").child_gender_pref, undefined);
});
test("sv/en: vedenpitävä ja talvi", () => {
  assert.equal(parseCriteriaFromText("vattentät jacka").waterproof, true);
  assert.equal(parseCriteriaFromText("waterproof jacket").waterproof, true);
  assert.equal(parseCriteriaFromText("vinterstövlar").season, "winter");
  assert.equal(parseCriteriaFromText("winter boots").season, "winter");
});
test("suomenkielinen haku käyttäytyy ennallaan sv/en-sääntöjen lisäyksen jälkeen", () => {
  const r = parseCriteriaFromText("Talvihaalari 5-vuotiaalle tytölle, max 120 €");
  assert.equal(r.garment_type, "haalari");
  assert.equal(r.child_gender_pref, "tyttö");
  assert.deepEqual(r.max_price, { amount: 120, currency: "EUR" });
  assert.equal(r.size_raw, "110");
  assert.equal(parseCriteriaFromText("pipo 3-vuotiaalle").garment_type, "pipo");
  assert.equal(parseCriteriaFromText("kengät koko 34").size_cm, 134);
});


test("brändikielto: inte / not / ej / without / utan", () => {
  assert.deepEqual(parseCriteriaFromText("regnjacka inte Reima", { lang: "sv" }).brand_deny, ["reima"]);
  assert.deepEqual(parseCriteriaFromText("rain jacket not Reima", { lang: "en" }).brand_deny, ["reima"]);
  assert.deepEqual(parseCriteriaFromText("jacka ej Molo", { lang: "sv" }).brand_deny, ["molo"]);
  assert.deepEqual(parseCriteriaFromText("jacket without Lindex", { lang: "en" }).brand_deny, ["lindex"]);
  assert.deepEqual(parseCriteriaFromText("jacka utan Molo", { lang: "sv" }).brand_deny, ["molo"]);
  assert.deepEqual(parseCriteriaFromText("takki ei Reimaa").brand_deny, ["reimaa"]);
});

test("brändikielto: 'not waterproof' ja 'inte för dyr' eivät ole brändejä", () => {
  assert.equal(parseCriteriaFromText("jacket not waterproof", { lang: "en" }).brand_deny, undefined);
  assert.equal(parseCriteriaFromText("jacka inte för dyr", { lang: "sv" }).brand_deny, undefined);
  assert.equal(parseCriteriaFromText("takki ei liian kallis").brand_deny, undefined);
});

test("uudet vaatesanat haussa", () => {
  const g = (q: string, lang?: "fi" | "sv" | "en") => parseCriteriaFromText(q, { lang }).garment_type;
  assert.equal(g("shorts till pojke", "sv"), "housut");
  assert.equal(g("solhatt till barn", "sv"), "pipo");
  assert.equal(g("keps storlek 52", "sv"), "pipo");
  assert.equal(g("balaklava", "sv"), "pipo");
  assert.equal(g("underställ 110", "sv"), "kerrasto");
  assert.equal(g("shorts for a boy", "en"), "housut");
  assert.equal(g("swim shorts for kids", "en"), "uimapuku");
  assert.equal(g("cap for a 6-year-old", "en"), "pipo");
  assert.equal(g("shell suit 110", "en"), "haalari");
  assert.equal(g("base layer for kids", "en"), "kerrasto");
  assert.equal(g("sandaalit 6-vuotiaalle"), "kengät");
  assert.equal(g("lenkkarit koko 32"), "kengät");
  assert.equal(g("shortsit pojalle"), "housut");
  assert.equal(g("aurinkohattu lapselle"), "pipo");
  assert.equal(g("villakerrasto 110 cm"), "kerrasto");
});

test("liivihaku asettaa vest-lipun, takkihaku ei", () => {
  assert.equal(parseCriteriaFromText("väst till 6-åring", { lang: "sv" }).vest, true);
  assert.equal(parseCriteriaFromText("väst till 6-åring", { lang: "sv" }).garment_type, "takki");
  assert.equal(parseCriteriaFromText("kids vest", { lang: "en" }).vest, true);
  assert.equal(parseCriteriaFromText("toppaliivi 6-vuotiaalle").vest, true);
  assert.equal(parseCriteriaFromText("vinterjacka till 6-åring", { lang: "sv" }).vest, undefined);
});

test("UI:n lausemuodot tunnistuvat (regressio)", () => {
  const a = parseCriteriaFromText("vinterjacka 110 cm till flicka, max 800 kr", { lang: "sv" });
  assert.equal(a.garment_type, "takki");
  assert.equal(a.season, "winter");
  assert.equal(a.size_cm, 110);
  assert.equal(a.child_gender_pref, "tyttö");
  assert.deepEqual(a.max_price, { amount: 800, currency: "SEK" });

  const b = parseCriteriaFromText("vinterjacka till 6-åring", { lang: "sv" });
  assert.equal(b.garment_type, "takki");
  assert.equal(b.age, 6);
  assert.equal(b.season, "winter");

  const c = parseCriteriaFromText("vinterjacka till barn", { lang: "sv" });
  assert.equal(c.garment_type, "takki");
  assert.equal(c.child_signal, true);

  assert.equal(parseCriteriaFromText("regnjacka vattentät", { lang: "sv" }).waterproof, true);

  const d = parseCriteriaFromText("winter jacket for a 6-year-old", { lang: "en" });
  assert.equal(d.garment_type, "takki");
  assert.equal(d.age, 6);
  assert.equal(d.season, "winter");

  const e = parseCriteriaFromText("winter jacket for a girl", { lang: "en" });
  assert.equal(e.child_gender_pref, "tyttö");

  const f = parseCriteriaFromText("winter jacket for kids", { lang: "en" });
  assert.equal(f.child_signal, true);

  assert.equal(parseCriteriaFromText("rain jacket waterproof", { lang: "en" }).waterproof, true);
  assert.deepEqual(parseCriteriaFromText("winter jacket max 80 €", { lang: "en" }).max_price, { amount: 80, currency: "EUR" });
});
