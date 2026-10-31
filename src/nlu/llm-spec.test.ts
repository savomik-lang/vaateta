import { test } from "node:test";
import assert from "node:assert/strict";
import { GARMENT_KEYWORDS } from "./garment-keywords";
import { COLOR_KEYWORDS } from "./parse-query";
import {
  LLM_GARMENT_TYPES, LLM_COLORS, LLM_INPUT_SCHEMA, LLM_SYSTEM_PROMPT, LLM_TOOL_NAME,
  sanitizeLlmExtraction,
} from "./llm-spec";

test("LLM_GARMENT_TYPES vastaa garment-keywords.ts:n tyyppejä (ilman 'muu')", () => {
  const expected = Object.keys(GARMENT_KEYWORDS).filter((k) => k !== "muu").sort();
  assert.deepEqual([...LLM_GARMENT_TYPES].sort(), expected);
});

test("LLM_COLORS vastaa parse-query.ts:n COLOR_KEYWORDS-värejä", () => {
  assert.deepEqual([...LLM_COLORS].sort(), [...COLOR_KEYWORDS].sort());
});

test("skeema käyttää samoja listoja kuin validointi", () => {
  const props = LLM_INPUT_SCHEMA.properties as unknown as Record<string, { enum?: readonly string[] }>;
  assert.deepEqual(props.garment_type.enum, [...LLM_GARMENT_TYPES]);
  assert.deepEqual(props.color.enum, [...LLM_COLORS]);
  assert.deepEqual(LLM_INPUT_SCHEMA.required, ["confidence"]);
});

test("prompti mainitsee työkalun ja kieltää ohjeiden noudattamisen viestistä", () => {
  assert.ok(LLM_SYSTEM_PROMPT.includes(LLM_TOOL_NAME));
  assert.match(LLM_SYSTEM_PROMPT, /never instructions/i);
});

test("sanitize: validi syöte läpi, brändit pieniksi kirjaimiksi", () => {
  const out = sanitizeLlmExtraction({
    language: "en", garment_type: "takki", age_years: 7, for_child: true, gender: "poika",
    winter: true, brand_deny: ["Reima"], max_price: 80, currency: "eur", confidence: "high",
  });
  assert.deepEqual(out, {
    language: "en", garment_type: "takki", age_years: 7, for_child: true, gender: "poika",
    winter: true, brand_deny: ["reima"], max_price: 80, currency: "EUR", confidence: "high",
  });
});

test("sanitize: tuntemattomat arvot ja väärät tyypit tiputetaan", () => {
  const out = sanitizeLlmExtraction({
    garment_type: "laturi", color: "turkoosi", gender: "x", currency: "USD", language: "xx",
    age_years: "6", max_price: "50", for_child: "true", waterproof: 1, winter: "yes",
  });
  assert.deepEqual(out, { confidence: "low" });
});

test("sanitize: arvoalueiden ulkopuoliset luvut hylätään", () => {
  assert.equal(sanitizeLlmExtraction({ age_years: -1 }).age_years, undefined);
  assert.equal(sanitizeLlmExtraction({ age_years: 18 }).age_years, undefined);
  assert.equal(sanitizeLlmExtraction({ age_years: 0 }).age_years, 0);
  assert.equal(sanitizeLlmExtraction({ size_cm: 43 }).size_cm, undefined);
  assert.equal(sanitizeLlmExtraction({ size_cm: 191 }).size_cm, undefined);
  assert.equal(sanitizeLlmExtraction({ size_cm: 115.6 }).size_cm, 116);
  assert.equal(sanitizeLlmExtraction({ max_price: 0 }).max_price, undefined);
  assert.equal(sanitizeLlmExtraction({ max_price: NaN }).max_price, undefined);
  assert.equal(sanitizeLlmExtraction({ max_price: Infinity }).max_price, undefined);
  assert.equal(sanitizeLlmExtraction({ max_price: 1e9 }).max_price, undefined);
});

test("sanitize: brändisiivous (liian lyhyt/pitkä, erikoismerkit, duplikaatit, max 5)", () => {
  const out = sanitizeLlmExtraction({
    brand_deny: ["a", "ab", "x".repeat(41), "<script>", "Reima", "REIMA", " Molo ", "H&M", 42, null],
    brand_allow: ["Lindex", "Name It", "Polarn O. Pyret", "Didriksons", "Hummel", "Kappahl", "Ticket"],
  });
  assert.deepEqual(out.brand_deny, ["reima", "molo", "h&m"]);
  assert.equal(out.brand_allow?.length, 5);
});

test("sanitize: roskasyöte ei kaada vaan antaa low-tuloksen", () => {
  for (const raw of [null, undefined, "teksti", 5, [], [1, 2]]) {
    assert.deepEqual(sanitizeLlmExtraction(raw), { confidence: "low" });
  }
});

test("sanitize: for_child/waterproof/winter säilyvät vain arvolla true", () => {
  const out = sanitizeLlmExtraction({ for_child: false, waterproof: false, winter: false, confidence: "high" });
  assert.deepEqual(out, { confidence: "high" });
});
