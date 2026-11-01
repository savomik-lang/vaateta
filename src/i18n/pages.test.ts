import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const build = require("../../scripts/build-i18n.js");
const ROOT = path.resolve(__dirname, "../..");

test("kieliversiot sv/ ja en/ ovat ajan tasalla (aja: node scripts/build-i18n.js)", () => {
  const pages: Record<string, string> = build.buildAll();
  for (const [file, html] of Object.entries(pages)) {
    assert.ok(fs.existsSync(file), `${path.relative(ROOT, file)} puuttuu`);
    assert.equal(fs.readFileSync(file, "utf8"), html, `${path.relative(ROOT, file)} on vanhentunut`);
  }
});

test("jokaisella sivulla oikea kieli, canonical ja kielivalitsimen nykyinen kieli", () => {
  const pages = { fi: "index.html", sv: "sv/index.html", en: "en/index.html" } as const;
  for (const [lang, rel] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    const canon = lang === "fi" ? "https://www.vaateta.com/" : `https://www.vaateta.com/${lang}/`;
    assert.ok(html.includes(`<link rel="canonical" href="${canon}"`), `${rel}: canonical`);
    for (const l of ["fi", "sv", "en", "x-default"]) assert.ok(html.includes(`hreflang="${l}"`), `${rel}: hreflang ${l}`);
    const current = html.match(/<a [^>]*data-lang="(\w+)"[^>]*aria-current="page"/g) || [];
    assert.equal(current.length, 1, `${rel}: yksi nykyinen kieli`);
    assert.ok(current[0].includes(`data-lang="${lang}"`), `${rel}: nykyinen kieli ${lang}`);
    assert.ok(!/(src|href)="(images|tietosuoja)/.test(html), `${rel}: suhteellinen polku`);
  }
});

test("JavaScriptin käännöstaulukossa on sv- ja en-käännös jokaiselle suomenkieliselle avaimelle", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const block = html.slice(html.indexOf("var I18N = {"), html.indexOf("var LANG ="));
  const keysOf = (lang: string) => {
    const start = block.indexOf(`\n    ${lang}: {`);
    const end = block.indexOf("\n    }", start);
    return new Set([...block.slice(start, end).matchAll(/'([a-zA-Z]+\.[a-zA-Z_.-]+)':/g)].map((m) => m[1]));
  };
  const fi = keysOf("fi");
  assert.ok(fi.size > 50, `fi-avaimia ${fi.size}`);
  for (const lang of ["sv", "en"]) {
    const other = keysOf(lang);
    const missing = [...fi].filter((k) => !other.has(k));
    assert.deepEqual(missing, [], `${lang}: puuttuu`);
  }
});
