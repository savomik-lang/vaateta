#!/usr/bin/env node
/*
 * Kieliversiot: tuottaa sv/index.html ja en/index.html suomenkielisestä
 * lähdesivusta (index.html) ja käännöstiedostoista (i18n/<kieli>.json).
 *
 *   node scripts/build-i18n.js          kirjoittaa sivut
 *   node scripts/build-i18n.js --check  tarkistaa, että sivut ovat ajan tasalla
 *
 * Merkinnät lähdesivulla:
 *   data-i18n="avain"                       elementin sisältö (HTML sallittu)
 *   data-i18n-attr="placeholder:avain ..."  attribuuttien arvot
 * JavaScriptin tekstit ovat index.html:n I18N-taulukossa; sivu valitsee ne
 * <html lang> -attribuutin perusteella.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LANGS = ['sv', 'en'];
const SOURCE = path.join(ROOT, 'index.html');

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Etsii avaavan tagin <tag ...> lopun ja vastaavan sulkevan tagin, ottaen
// huomioon samannimiset sisäkkäiset elementit.
function findClose(html, tag, from) {
  const re = new RegExp('<(/?)' + tag + '(?=[\\s>/])[^>]*>', 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { start: m.index, end: re.lastIndex };
  }
  throw new Error('Sulkevaa tagia </' + tag + '> ei löytynyt kohdasta ' + from);
}

function keysIn(html) {
  const keys = new Set();
  for (const m of html.matchAll(/\sdata-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of html.matchAll(/\sdata-i18n-attr="([^"]+)"/g)) {
    m[1].trim().split(/\s+/).forEach((pair) => keys.add(pair.split(':')[1]));
  }
  return keys;
}

function translate(src, dict, lang) {
  const missing = [...keysIn(src)].filter((k) => typeof dict[k] !== 'string');
  if (missing.length) throw new Error(`i18n/${lang}.json: käännös puuttuu avaimille: ${missing.join(', ')}`);

  let html = src.replace(/<html lang="fi">/, `<html lang="${lang}">`);
  if (html === src) throw new Error('<html lang="fi"> puuttuu lähdesivulta');

  // 1) Attribuutit: käydään läpi kaikki avaavat tagit, joissa data-i18n-attr
  html = html.replace(/<[a-z][a-z0-9]*\b[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/gi, (tagHtml, spec) => {
    let out = tagHtml;
    spec.trim().split(/\s+/).forEach((pair) => {
      const [attr, key] = pair.split(':');
      const re = new RegExp('(\\s' + attr + '=")[^"]*(")');
      if (!re.test(out)) throw new Error(`Attribuuttia ${attr} ei ole tagissa: ${tagHtml.slice(0, 80)}`);
      out = out.replace(re, (_, a, b) => a + escAttr(dict[key]) + b);
    });
    return out;
  });

  // 2) Sisällöt
  const openRe = /<([a-z][a-z0-9]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>/gi;
  let result = '';
  let pos = 0;
  let m;
  while ((m = openRe.exec(html))) {
    const tag = m[1];
    const key = m[2];
    const innerStart = openRe.lastIndex;
    const close = findClose(html, tag, innerStart);
    result += html.slice(pos, innerStart) + dict[key];
    pos = close.start;
    openRe.lastIndex = close.start;
  }
  html = result + html.slice(pos);

  // 3) Kielivalitsin: nykyinen kieli merkitään aria-current="page"
  html = html.replace(/(<a [^>]*data-lang="fi"[^>]*?) aria-current="page"/, '$1');
  html = html.replace(new RegExp('(<a [^>]*data-lang="' + lang + '"[^>]*?)>'), '$1 aria-current="page">');

  const banner = `<!-- Generoitu: scripts/build-i18n.js (index.html + i18n/${lang}.json). Älä muokkaa käsin. -->\n`;
  return html.replace(/^<!DOCTYPE html>\n/i, (d) => d + banner);
}

function loadDict(lang) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', lang + '.json'), 'utf8'));
}

function buildAll() {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const out = {};
  for (const lang of LANGS) {
    const dict = loadDict(lang);
    const used = keysIn(src);
    const unused = Object.keys(dict).filter((k) => !used.has(k) && !k.startsWith('_'));
    if (unused.length) throw new Error(`i18n/${lang}.json: käyttämättömiä avaimia: ${unused.join(', ')}`);
    out[path.join(ROOT, lang, 'index.html')] = translate(src, dict, lang);
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const pages = buildAll();
  let stale = 0;
  for (const [file, html] of Object.entries(pages)) {
    const rel = path.relative(ROOT, file);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (check) {
      if (current !== html) { stale++; console.error(`${rel} ei ole ajan tasalla. Aja: node scripts/build-i18n.js`); }
    } else if (current !== html) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html);
      console.log(`kirjoitettu ${rel}`);
    } else {
      console.log(`${rel} ajan tasalla`);
    }
  }
  if (stale) process.exit(1);
}

module.exports = { translate, keysIn, buildAll, LANGS };
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}
