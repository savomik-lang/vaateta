#!/usr/bin/env node
/*
 * Vapaan tekstin haun kategoriatesti (tests/hakutesti/kategoriat.json).
 *
 * Ajaa jokaisen haun /api/search?q=…&lang=… -rajapintaan ja tarkistaa viisi parasta tulosta (bestMatch):
 *   - tuotetyyppi: otsikko osuu tapauksen `type`-lausekkeeseen eikä `not`-lausekkeeseen (vähintään minType/5)
 *   - koko: tuotteen size_available sisältää haetun koon tai lähes (cm ±6, EU-kenkäkoko ±1) (vähintään minSize/5)
 * Jos tuloksia on alle viisi, raja suhteutetaan tulosten määrään. Nolla tulosta on aina hylätty.
 *
 * Käyttö: node scripts/hakutesti.mjs [perus-URL, oletus https://www.vaateta.com] [--json] [--vain=hakusana]
 * Esikatselu: node scripts/hakutesti.mjs https://vaateta-xxxx-sasmo.vercel.app (Vercel-suojaus voi estää).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Kokomerkinnästä väli [ala, ylä]: "92-104 (2-4 v)", "110/116", "98 - 104", "28", "24/25". Sulut ohitetaan.
const AGE_CM = [74, 80, 92, 98, 104, 110, 116, 122, 128, 134, 140, 146, 152, 158, 164];
export function sizeRange(s) {
  // Ikäkoot (Metsola): "1-2Y" → 80–92 cm, "6-12M" → 68–80 cm
  const y = String(s).match(/^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*Y\b/i);
  if (y) return [AGE_CM[Math.min(+y[1], 14)], AGE_CM[Math.min(+y[2], 14)]];
  const mo = String(s).match(/^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*M\b/i);
  if (mo) return [Math.round(50 + +mo[1] * 2.5), Math.round(50 + +mo[2] * 2.5)];
  const m = String(s).replace(/\([^)]*\)/g, '').match(/(\d{2,3})\s*(?:[-–\/]\s*(\d{2,3}))?/);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  return [Math.min(a, b), Math.max(a, b)];
}

// Tuotteen etäisyys haetusta koosta (0 = osuu). Kenkäkoot (alle 45) ja cm-koot (yli 45) erotellaan.
export function sizeDistance(product, target, isShoe) {
  let best = Infinity;
  for (const e of product.size_available || []) {
    const r = sizeRange(e);
    if (!r) continue;
    if (isShoe ? r[1] > 45 : r[0] < 45) continue;
    const d = target < r[0] ? r[0] - target : target > r[1] ? target - r[1] : 0;
    best = Math.min(best, d);
  }
  return best;
}

export function evaluateCase(c, response, cfg) {
  const TYPE = new RegExp(c.type, 'i'), NOT = c.not ? new RegExp(c.not, 'i') : null;
  const top = ((response.results || {}).bestMatch || []).slice(0, 5);
  const isShoe = c.eu != null, target = isShoe ? c.eu : c.cm, tol = isShoe ? 1 : 6;
  const rows = top.map((p) => ({
    title: p.title,
    typeOk: TYPE.test(p.title) && !(NOT && NOT.test(p.title)),
    sizeOk: target == null ? true : sizeDistance(p, target, isShoe) <= tol,
    sizes: (p.size_available || []).slice(0, 5).join('|'),
  }));
  const n = rows.length;
  const needType = Math.min(cfg.minType, n), needSize = Math.min(cfg.minSize, n);
  const typeHits = rows.filter((r) => r.typeOk).length, sizeHits = rows.filter((r) => r.sizeOk).length;
  return {
    q: c.q, lang: c.lang, parsed: response.parsed_criteria || {}, total: response.total_matches || 0, rows,
    typeHits, sizeHits, n,
    pass: n > 0 && typeHits >= needType && sizeHits >= needSize,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => /^https?:/.test(a)) || 'https://www.vaateta.com').replace(/\/$/, '');
  const only = (args.find((a) => a.startsWith('--vain=')) || '').slice(7);
  const asJson = args.includes('--json');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cfg = JSON.parse(readFileSync(path.join(root, 'tests', 'hakutesti', 'kategoriat.json'), 'utf8'));
  const out = [];
  for (const c of cfg.cases.filter((x) => !only || x.q.includes(only))) {
    const url = base + '/api/search?q=' + encodeURIComponent(c.q) + '&lang=' + c.lang;
    let res;
    try { res = await fetch(url).then((r) => r.json()); } catch (e) { res = { error: String(e) }; }
    out.push(evaluateCase(c, res, cfg));
    await new Promise((r) => setTimeout(r, 200));
  }
  if (asJson) { console.log(JSON.stringify(out, null, 2)); }
  else {
    for (const r of out) {
      console.log((r.pass ? 'OK   ' : 'FAIL ') + r.q + ' (' + r.lang + ')  tyyppi ' + r.typeHits + '/' + r.n + ', koko ' + r.sizeHits + '/' + r.n + ', tuloksia ' + r.total + '  ' + JSON.stringify(r.parsed));
      if (!r.pass) r.rows.forEach((x) => console.log('       ' + (x.typeOk ? '+' : '-') + (x.sizeOk ? ' ' : '!') + ' ' + x.title.slice(0, 60) + '  [' + x.sizes + ']'));
    }
    console.log('\n' + out.filter((r) => r.pass).length + '/' + out.length + ' OK');
  }
  process.exit(out.every((r) => r.pass) ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
