import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLanguage, primaryLanguage, cookieLang, isBot } from "./choose-language";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const lang = (country: string | null, acceptLanguage: string | null, cookie: string | null = null, userAgent: string | null = CHROME) =>
  chooseLanguage({ country, acceptLanguage, cookie, userAgent });

test("Suomi: suomi oletuksena, selaimen sv/en voittaa", () => {
  assert.equal(lang("FI", "fi-FI,fi;q=0.9,en;q=0.8"), "fi");
  assert.equal(lang("FI", "sv-FI,sv;q=0.9,fi;q=0.8"), "sv");
  assert.equal(lang("FI", "en-US,en;q=0.9"), "en");
  assert.equal(lang("FI", "de-DE,de;q=0.9"), "fi");
  assert.equal(lang("FI", null), "fi");
});

test("Ruotsi ja Ahvenanmaa: ruotsi", () => {
  assert.equal(lang("SE", "sv-SE,sv;q=0.9"), "sv");
  assert.equal(lang("SE", "en-US,en;q=0.9"), "sv");
  assert.equal(lang("AX", "sv-AX"), "sv");
});

test("Muut maat: englanti, paitsi kun selain on suomeksi tai ruotsiksi", () => {
  assert.equal(lang("DE", "de-DE,de;q=0.9,en;q=0.5"), "en");
  assert.equal(lang("US", "en-US"), "en");
  assert.equal(lang("ES", "fi-FI,fi;q=0.9"), "fi");
  assert.equal(lang("NO", "sv-SE"), "sv");
  assert.equal(lang("SE", "fi-FI,fi;q=0.9,sv;q=0.8"), "fi");
});

test("Tuntematon maa (esim. paikallinen kehitys) käsitellään kuin Suomi", () => {
  assert.equal(lang(null, "de-DE"), "fi");
  assert.equal(lang("", "en-GB"), "en");
});

test("Oma valinta (eväste) voittaa maan ja selaimen", () => {
  assert.equal(lang("SE", "sv-SE", "vaateta_lang=fi"), "fi");
  assert.equal(lang("FI", "fi-FI", "other=1; vaateta_lang=en"), "en");
  assert.equal(lang("US", "en-US", "vaateta_lang=sv"), "sv");
  assert.equal(lang("SE", "sv-SE", "vaateta_lang=de"), "sv", "tuntematon arvo ohitetaan");
});

test("Robotteja ja esikatseluja ei ohjata", () => {
  assert.equal(lang("SE", "sv-SE", null, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), "fi");
  assert.equal(lang("US", "en", null, "facebookexternalhit/1.1"), "fi");
  assert.equal(lang("SE", "sv", null, "WhatsApp/2.23"), "fi");
  assert.equal(lang("SE", "sv", null, null), "fi");
  assert.equal(isBot(CHROME), false);
});

test("Accept-Language: painoarvo ratkaisee", () => {
  assert.equal(primaryLanguage("en;q=0.5,sv;q=0.9"), "sv");
  assert.equal(primaryLanguage("fi, en;q=0.9"), "fi");
  assert.equal(primaryLanguage("*"), null);
  assert.equal(primaryLanguage("sv;q=0,en"), "en");
  assert.equal(primaryLanguage(""), null);
});

test("Evästeen luku", () => {
  assert.equal(cookieLang("a=b; vaateta_lang=SV"), "sv");
  assert.equal(cookieLang("vaateta_lang_x=en"), null);
  assert.equal(cookieLang(null), null);
});
