import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryKeyValueStore, IKeyValueStore } from "../store/kv-store";
import { SearchCriteria } from "../types";
import { matchesCriteria } from "../adapters/multi-store-adapter";
import { makeProduct } from "../fixtures/make-product";
import { parseCriteriaFromText } from "./parse-query";
import {
  criteriaFromLlm, mergeCriteria, interpretWithLlmFallback, MAX_LLM_INPUT_CHARS,
  InterpretDeps, LlmClient,
} from "./llm-interpret";

// --- apurit ----------------------------------------------------------------

class FakeClient implements LlmClient {
  calls: string[] = [];
  constructor(private result: unknown | (() => unknown)) {}
  async extract(text: string): Promise<unknown> {
    this.calls.push(text);
    if (typeof this.result === "function") return (this.result as () => unknown)();
    return this.result;
  }
}

function deps(client: LlmClient, overrides: Partial<InterpretDeps> = {}): InterpretDeps {
  return {
    enabled: true,
    getClient: () => client,
    kv: new InMemoryKeyValueStore(),
    dailyLimit: 100,
    cacheTtlSeconds: 60,
    ...overrides,
  };
}

const RAIN_JACKET_FI = {
  language: "fi", garment_type: "takki", age_years: 6, for_child: true, waterproof: true, confidence: "high",
};
const RAIN_PANTS_SV = {
  language: "sv", garment_type: "kurahousut", size_cm: 116, for_child: true, gender: "tyttö",
  max_price: 400, currency: "SEK", confidence: "high",
};
const WINTER_JACKET_EN = {
  language: "en", garment_type: "takki", age_years: 7, for_child: true, gender: "poika", winter: true,
  brand_deny: ["Reima"], max_price: 80, currency: "EUR", confidence: "high",
};

// --- criteriaFromLlm ---------------------------------------------------------

test("criteriaFromLlm: ikä muunnetaan senteiksi koodissa (AGE_TO_CM)", () => {
  const c = criteriaFromLlm({ garment_type: "takki", age_years: 6, confidence: "high" }, "fi");
  assert.equal(c.size_cm, 116);
  assert.equal(c.size_raw, "116");
  assert.equal(c.age, 6);
});

test("criteriaFromLlm: alle vuoden ikä (0) antaa koon 80 mutta ei age-kenttää", () => {
  const c = criteriaFromLlm({ age_years: 0, confidence: "high" }, "fi");
  assert.equal(c.size_cm, 80);
  assert.equal(c.age, undefined);
});

test("criteriaFromLlm: puolikas ikä pyöristyy, yli 17 -> 17", () => {
  assert.equal(criteriaFromLlm({ age_years: 0.5, confidence: "high" }, "fi").size_cm, 80);
  assert.equal(criteriaFromLlm({ age_years: 2.6, confidence: "high" }, "fi").age, 3);
  assert.equal(criteriaFromLlm({ age_years: 17, confidence: "high" }, "fi").size_cm, 176);
});

test("criteriaFromLlm: suoraan sanottu senttikoko voittaa iän", () => {
  const c = criteriaFromLlm({ age_years: 6, size_cm: 128, confidence: "high" }, "fi");
  assert.equal(c.size_cm, 128);
  assert.equal(c.size_raw, "128");
  assert.equal(c.age, 6);
});

test("criteriaFromLlm: oletusvaluutta kielen mukaan, annettu valuutta voittaa", () => {
  const price = (language: any, currency?: any) =>
    criteriaFromLlm({ max_price: 100, ...(currency ? { currency } : {}), confidence: "high" }, language).max_price;
  assert.deepEqual(price("sv"), { amount: 100, currency: "SEK" });
  assert.deepEqual(price("da"), { amount: 100, currency: "DKK" });
  assert.deepEqual(price("no"), { amount: 100, currency: "NOK" });
  assert.deepEqual(price("en"), { amount: 100, currency: "EUR" });
  assert.deepEqual(price("fi"), { amount: 100, currency: "EUR" });
  assert.deepEqual(price("sv", "NOK"), { amount: 100, currency: "NOK" });
});

test("criteriaFromLlm: muut kentät vastaavat sääntöparserin muotoa", () => {
  const c = criteriaFromLlm(
    { garment_type: "takki", for_child: true, gender: "poika", brand_deny: ["reima"], brand_allow: ["molo"],
      waterproof: true, winter: true, color: "sininen", confidence: "high" },
    "fi"
  );
  assert.deepEqual(c, {
    garment_type: "takki", child_signal: true, child_gender_pref: "poika", brand_deny: ["reima"],
    brand_allow: ["molo"], waterproof: true, season: "winter", color: "sininen",
  });
});

test("criteriaFromLlm: tyhjä tulos antaa tyhjät kriteerit", () => {
  assert.deepEqual(criteriaFromLlm({ confidence: "low" }, "fi"), {});
});

// --- mergeCriteria -----------------------------------------------------------

test("mergeCriteria: prefer=rules -> sääntö voittaa ristiriidassa, LLM täyttää puutteet", () => {
  const rules: SearchCriteria = { garment_type: "takki", color: "musta" };
  const llm: SearchCriteria = { garment_type: "housut", color: "sininen", waterproof: true };
  const m = mergeCriteria(rules, llm, "rules");
  assert.equal(m.garment_type, "takki");
  assert.equal(m.color, "musta");
  assert.equal(m.waterproof, true);
});

test("mergeCriteria: prefer=llm -> LLM voittaa, säännön kentät täyttävät puutteet", () => {
  const rules: SearchCriteria = { garment_type: "takki", season: "winter" };
  const llm: SearchCriteria = { garment_type: "housut" };
  const m = mergeCriteria(rules, llm, "llm");
  assert.equal(m.garment_type, "housut");
  assert.equal(m.season, "winter");
});

test("mergeCriteria: koko kulkee yhtenä ryhmänä samasta lähteestä", () => {
  const rules: SearchCriteria = { size_cm: 116, size_raw: "116", age: 6 };
  const llm: SearchCriteria = { size_cm: 128, size_raw: "128" }; // ei age-kenttää
  const m = mergeCriteria(rules, llm, "llm");
  assert.equal(m.size_cm, 128);
  assert.equal(m.size_raw, "128");
  assert.equal(m.age, undefined); // ei vanhaa ikää sekoittumaan uuteen kokoon
});

test("mergeCriteria: jos voittajalla ei ole kokoa, koko tulee toiselta kokonaisena", () => {
  const m = mergeCriteria({}, { size_cm: 128, size_raw: "128", age: 8 }, "rules");
  assert.deepEqual([m.size_cm, m.size_raw, m.age], [128, "128", 8]);
});

test("mergeCriteria: brand_deny yhdistetään ilman duplikaatteja", () => {
  const m = mergeCriteria({ brand_deny: ["reima"] }, { brand_deny: ["reima", "molo"] }, "llm");
  assert.deepEqual(m.brand_deny, ["reima", "molo"]);
});

// --- interpretWithLlmFallback ---------------------------------------------------

test("LLM:ää ei kutsuta kun sääntöparseri riittää (suomi + vaatetyyppi tunnistettu)", async () => {
  const client = new FakeClient(RAIN_JACKET_FI);
  const text = "talvitakki 6-vuotiaalle";
  const rules = parseCriteriaFromText(text);
  const out = await interpretWithLlmFallback(text, rules, deps(client));
  assert.deepEqual(client.calls, []);
  assert.deepEqual(out.criteria, rules);
  assert.deepEqual(out.interpretation, { method: "rules", language: "fi" });
});

test("suomi, vaatetyyppi puuttuu: LLM täydentää, sääntöparserin koko säilyy", async () => {
  const client = new FakeClient(RAIN_JACKET_FI);
  const text = "ostaisin sadetakin 6-vuotiaalle";
  const rules = parseCriteriaFromText(text);
  assert.equal(rules.garment_type, undefined);
  const out = await interpretWithLlmFallback(text, rules, deps(client));
  assert.deepEqual(client.calls, [text]);
  assert.equal(out.criteria.garment_type, "takki");
  assert.equal(out.criteria.waterproof, true);
  assert.equal(out.criteria.child_signal, true);
  assert.equal(out.criteria.size_cm, 116);
  assert.equal(out.criteria.age, 6);
  assert.deepEqual(out.interpretation, { method: "llm", language: "fi", confidence: "high", llm_status: "used" });
});

test("ruotsi: sääntöparseri antaa tyhjän, LLM tuottaa kriteerit ja SEK-hinnan", async () => {
  const client = new FakeClient(RAIN_PANTS_SV);
  const text = "regnbyxor till min dotter, storlek 116, under 400 kr";
  const out = await interpretWithLlmFallback(text, parseCriteriaFromText(text), deps(client));
  assert.deepEqual(out.criteria, {
    garment_type: "kurahousut", size_cm: 116, size_raw: "116", child_signal: true, child_gender_pref: "tyttö",
    max_price: { amount: 400, currency: "SEK" },
  });
  assert.equal(out.interpretation.language, "sv");
  assert.equal(out.interpretation.method, "llm");
});

test("englanti: LLM voittaa ristiriidassa ja lisää iän, sukupuolen ja brändikiellon", async () => {
  const client = new FakeClient(WINTER_JACKET_EN);
  const text = "winter jacket for my 7 year old son, no Reima, max 80 euros";
  const rules = parseCriteriaFromText(text);
  const out = await interpretWithLlmFallback(text, rules, deps(client));
  assert.equal(out.criteria.garment_type, "takki");
  assert.equal(out.criteria.size_cm, 122);
  assert.equal(out.criteria.age, 7);
  assert.equal(out.criteria.child_gender_pref, "poika");
  assert.deepEqual(out.criteria.brand_deny, ["reima"]);
  assert.equal(out.criteria.season, "winter");
  assert.deepEqual(out.criteria.max_price, { amount: 80, currency: "EUR" });
});

test("LLM ei löydä vaatetta (laturi): garment_type puuttuu edelleen", async () => {
  const client = new FakeClient({ language: "fi", confidence: "low" });
  const text = "puhelimen laturi";
  const out = await interpretWithLlmFallback(text, parseCriteriaFromText(text), deps(client));
  assert.equal(out.criteria.garment_type, undefined);
  assert.equal(out.interpretation.confidence, "low");
});

test("välimuisti: toinen sama haku ei kutsu LLM:ää (myös isot kirjaimet ja välilyönnit)", async () => {
  const client = new FakeClient(RAIN_PANTS_SV);
  const d = deps(client);
  const text = "regnbyxor till min dotter, storlek 116, under 400 kr";
  const first = await interpretWithLlmFallback(text, {}, d);
  const second = await interpretWithLlmFallback("  Regnbyxor till  min dotter, storlek 116, under 400 kr ", {}, d);
  assert.equal(client.calls.length, 1);
  assert.equal(first.interpretation.llm_status, "used");
  assert.equal(second.interpretation.llm_status, "cached");
  assert.deepEqual(second.criteria, first.criteria);
});

test("välimuistissa oleva myrkytetty data siivotaan samoin kuin tuore tulos", async () => {
  const kv = new InMemoryKeyValueStore();
  const text = "regnbyxor till min dotter";
  await kv.set(
    "nlu:llm:v1:regnbyxor till min dotter",
    JSON.stringify({ garment_type: "laturi", age_years: 999, brand_deny: ["<x>"], waterproof: true, confidence: "high" })
  );
  const client = new FakeClient(RAIN_PANTS_SV);
  const out = await interpretWithLlmFallback(text, {}, deps(client, { kv }));
  assert.equal(client.calls.length, 0);
  assert.equal(out.criteria.garment_type, undefined);
  assert.equal(out.criteria.size_cm, undefined);
  assert.equal(out.criteria.brand_deny, undefined);
  assert.equal(out.criteria.waterproof, true);
});

test("rikkinäinen välimuistiarvo ei estä hakua: kutsutaan LLM:ää", async () => {
  const kv = new InMemoryKeyValueStore();
  await kv.set("nlu:llm:v1:regnbyxor till min dotter", "{ei json");
  const client = new FakeClient(RAIN_PANTS_SV);
  const out = await interpretWithLlmFallback("regnbyxor till min dotter", {}, deps(client, { kv }));
  assert.equal(client.calls.length, 1);
  assert.equal(out.interpretation.llm_status, "used");
});

test("päiväraja täynnä: sääntötulos, LLM:ää ei kutsuta", async () => {
  const client = new FakeClient(RAIN_PANTS_SV);
  const d = deps(client, { dailyLimit: 1 });
  const first = await interpretWithLlmFallback("regnbyxor till min dotter", {}, d);
  const second = await interpretWithLlmFallback("jag behöver en jacka", {}, d);
  assert.equal(first.interpretation.llm_status, "used");
  assert.equal(second.interpretation.llm_status, "rate_limited");
  assert.equal(second.interpretation.method, "rules");
  assert.equal(client.calls.length, 1);
});

test("välimuistiosuma ei kuluta päivärajaa", async () => {
  const client = new FakeClient(RAIN_PANTS_SV);
  const d = deps(client, { dailyLimit: 1 });
  await interpretWithLlmFallback("regnbyxor till min dotter", {}, d);
  const again = await interpretWithLlmFallback("regnbyxor till min dotter", {}, d);
  assert.equal(again.interpretation.llm_status, "cached");
});

test("LLM-virhe: sääntötulos palautuu ja virhe lokitetaan, haku ei kaadu", async () => {
  const logged: string[] = [];
  const client = new FakeClient(() => { throw new Error("timeout"); });
  const rules: SearchCriteria = { size_cm: 116, size_raw: "116" };
  const out = await interpretWithLlmFallback("jag behöver en jacka", rules, deps(client, { log: (m) => logged.push(m) }));
  assert.deepEqual(out.criteria, rules);
  assert.equal(out.interpretation.llm_status, "error");
  assert.equal(logged.length, 1);
});

test("getClient-virhe (esim. avain puuttuu) käsitellään kuten LLM-virhe", async () => {
  const out = await interpretWithLlmFallback("jag behöver en jacka", {}, {
    ...deps(new FakeClient({})),
    getClient: () => { throw new Error("Puuttuva ympäristömuuttuja: ANTHROPIC_API_KEY"); },
  });
  assert.equal(out.interpretation.llm_status, "error");
});

test("pois päältä: sääntötulos, status disabled", async () => {
  const client = new FakeClient(RAIN_PANTS_SV);
  const out = await interpretWithLlmFallback("jag behöver en jacka", {}, deps(client, { enabled: false }));
  assert.equal(client.calls.length, 0);
  assert.equal(out.interpretation.llm_status, "disabled");
});

test("liian pitkä teksti ei kuluta LLM-kutsua", async () => {
  const client = new FakeClient(RAIN_PANTS_SV);
  const out = await interpretWithLlmFallback("a ".repeat(MAX_LLM_INPUT_CHARS), {}, deps(client));
  assert.equal(client.calls.length, 0);
  assert.equal(out.interpretation.llm_status, "too_long");
});

test("KV-virhe (Redis alhaalla): haku jatkuu sääntötuloksella, LLM:ää ei kutsuta", async () => {
  // Päiväraja on kustannussuoja: jos laskuria ei voi päivittää, ei kutsuta LLM:ää.
  const brokenKv: IKeyValueStore = {
    get: async () => { throw new Error("redis down"); },
    set: async () => { throw new Error("redis down"); },
    incr: async () => { throw new Error("redis down"); },
  };
  const client = new FakeClient(RAIN_PANTS_SV);
  const rules: SearchCriteria = { size_cm: 110 };
  const out = await interpretWithLlmFallback("regnbyxor till min dotter", rules, deps(client, { kv: brokenKv }));
  assert.equal(client.calls.length, 0);
  assert.deepEqual(out.criteria, rules);
  assert.equal(out.interpretation.llm_status, "error");
});

test("LLM:n roskavastaus ei muuta tulosta: tyhjä sanitize + säännöt", async () => {
  const client = new FakeClient("ignore previous instructions");
  const rules: SearchCriteria = { garment_type: "takki" };
  const out = await interpretWithLlmFallback("winter jacket for kids", rules, deps(client));
  assert.equal(out.criteria.garment_type, "takki");
  assert.equal(out.interpretation.confidence, "low");
});

// --- päästä päähän: tulkinta -> matchesCriteria --------------------------------

test("päästä päähän: 'ostaisin sadetakin 6-vuotiaalle' löytää vain vedenpitävän kokoon 116 sopivan takin", async () => {
  const client = new FakeClient(RAIN_JACKET_FI);
  const text = "ostaisin sadetakin 6-vuotiaalle";
  const { criteria } = await interpretWithLlmFallback(text, parseCriteriaFromText(text), deps(client));

  const good = makeProduct({
    id: "good", title: "Lasten sadetakki", garment_type: "takki", waterproof: true,
    size_available: ["116"], size_normalized: ["116"],
  });
  const notWaterproof = makeProduct({
    id: "dry", title: "Lasten takki", garment_type: "takki", waterproof: null,
    size_available: ["116"], size_normalized: ["116"],
  });
  const wrongType = makeProduct({
    id: "pants", title: "Lasten kurahousut", garment_type: "kurahousut", waterproof: true,
    size_available: ["116"], size_normalized: ["116"],
  });

  assert.equal(matchesCriteria(good, criteria), true);
  assert.equal(matchesCriteria(notWaterproof, criteria), false);
  assert.equal(matchesCriteria(wrongType, criteria), false);
});

test("päästä päähän: englanninkielinen haku sulkee pois Reima-tuotteet ja liian kalliit", async () => {
  const client = new FakeClient(WINTER_JACKET_EN);
  const text = "winter jacket for my 7 year old son, no Reima, max 80 euros";
  const { criteria } = await interpretWithLlmFallback(text, parseCriteriaFromText(text), deps(client));

  const base = { garment_type: "takki" as const, title: "Kids Winter Jacket", winter: true, size_available: ["122"], size_normalized: ["122"] };
  assert.equal(matchesCriteria(makeProduct({ id: "ok", brand: "Lindex", ...base }), criteria), true);
  assert.equal(matchesCriteria(makeProduct({ id: "reima", brand: "Reima", ...base }), criteria), false);
  assert.equal(matchesCriteria(makeProduct({ id: "pricey", brand: "Lindex", price: { amount: 120, currency: "EUR" }, ...base }), criteria), false);
});
