#!/usr/bin/env node
/*
 * Hakukentän esimerkit viikoittain (vaihe 1, "esimerkit Google Trendsistä").
 *
 * Lukee Google Trendsin viiden vuoden viikkodatasta lasketut viikkoprofiilit
 * (data/trends/FI.json, data/trends/SE.json) ja valitsee jokaiselle ISO-viikolle 1–52
 * kahdeksan ajankohtaisinta lastenvaatehakua.
 * Tulos kirjoitetaan index.html:n CHIP_WEEKS-taulukkoon merkkien
 * /*CHIP_WEEKS*\/ ja /*END_CHIP_WEEKS*\/ väliin; sen jälkeen aja scripts/build-i18n.js.
 *
 * Datan muoto (data/trends/<GEO>.json):
 *   { geo, fetched, anchor, source, terms: { <id>: { query, level, weeksWithData, profile: [52] } } }
 *   query = Trends-haku (TAI-yhdistelmä "a + b"), level = hakumäärä suhteessa ankkurisanaan
 *   (5 vuoden summien suhde samasta vertailusta), profile = ISO-viikkojen keskiarvo 5 vuodelta,
 *   tasoitettu ±1 viikko, keskiarvo 100. Datan haku: ks. docs/esimerkit-trends.md.
 *
 * Käyttö: node scripts/build-chip-weeks.js [--check]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GEOS = ['FI', 'SE'];
const PER_WEEK = 8;          // ehdokkaita viikolle (UI näyttää 5, varalla tuotteettomien tilalle)
const MAX_PER_GROUP = 2;     // monipuolisuus: enintään 2 samasta ryhmästä (esim. päähineet)
const MIN_WEEKS = 25;        // vähintään näin monella viikolla (262:sta) dataa, muuten kohinaa

// Ryhmät monipuolisuutta varten: sama ryhmä = sama vaatetyyppi asiakkaan silmissä.
const GROUP = {
  talvihaalari: 'haalari', valikausihaalari: 'haalari', sadeasu: 'haalari',
  kurahousut: 'sade', sadetakki: 'sade',
  kumisaappaat: 'kengat', talvikengat: 'kengat', sandaalit: 'kengat', lenkkarit: 'kengat', tossut: 'kengat',
  talvitakki: 'takki', valikausitakki: 'takki', fleece: 'takki', softshell: 'takki',
  toppahousut: 'housut', shortsit: 'housut', collegehousut: 'housut', farkut: 'housut', leggingsit: 'housut',
  pipo: 'paahine', kyparamyssy: 'paahine', aurinkohattu: 'paahine', lippis: 'paahine',
  lapaset: 'lapaset', villasukat: 'sukat', kerrasto: 'kerrasto',
  uimapuku: 'uinti', uimahousut: 'uinti', mekko: 'mekko', juhlamekko: 'mekko',
  huppari: 'paita', neule: 'paita', tpaita: 'paita', pyjama: 'yo', body: 'vauva'
};

// Pisteet viikolle w: sesonki (profiili, keskiarvo 100) kertaa hakumäärän neliöjuuri.
// Neliöjuuri vaimentaa tason eroja: pelkät hakusanat ("toppahousut") sisältävät aikuisten haut ja
// ovat moninkertaisia lapsiin rajattuihin ("lasten talvitakki") verrattuna, mutta sesonki ratkaisee.
function score(term, w) {
  return Math.sqrt(term.level) * term.profile[w];
}

function build(geo) {
  const file = path.join(ROOT, 'data', 'trends', geo + '.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Harvinaiset haut (Trends antaa alle MIN_WEEKS viikolle lukeman) ovat pelkkää kohinaa.
  const ids = Object.keys(data.terms).filter((id) => {
    const t = data.terms[id];
    return t.level > 0 && t.weeksWithData >= MIN_WEEKS && Array.isArray(t.profile) && t.profile.length === 52;
  });
  const table = [];
  for (let w = 0; w < 52; w++) {
    const ranked = ids.slice().sort((a, b) => score(data.terms[b], w) - score(data.terms[a], w) || a.localeCompare(b));
    const pick = [], perGroup = {};
    for (const id of ranked) {
      const g = GROUP[id] || id;
      if ((perGroup[g] || 0) >= MAX_PER_GROUP) continue;
      if (score(data.terms[id], w) <= 0) continue;
      pick.push(id); perGroup[g] = (perGroup[g] || 0) + 1;
      if (pick.length === PER_WEEK) break;
    }
    table.push(pick);
  }
  return { table, fetched: data.fetched, used: ids.length, total: Object.keys(data.terms).length };
}

function main() {
  const check = process.argv.includes('--check');
  const out = {}, meta = [];
  GEOS.forEach((g) => { const r = build(g); out[g] = r.table; meta.push(g + ' ' + r.fetched + ', ' + r.used + '/' + r.total + ' hakua'); });
  const literal = '/*CHIP_WEEKS*/' + JSON.stringify(out) + '/*END_CHIP_WEEKS*/';
  const htmlPath = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const re = /\/\*CHIP_WEEKS\*\/[\s\S]*?\/\*END_CHIP_WEEKS\*\//;
  if (!re.test(html)) throw new Error('index.html: CHIP_WEEKS-merkkejä ei löydy');
  const next = html.replace(re, literal);
  if (check) {
    if (next !== html) { console.error('CHIP_WEEKS ei ole ajan tasalla: aja node scripts/build-chip-weeks.js'); process.exit(1); }
    console.log('CHIP_WEEKS ajan tasalla (' + meta.join(', ') + ')');
    return;
  }
  fs.writeFileSync(htmlPath, next);
  console.log('CHIP_WEEKS päivitetty (' + meta.join(', ') + ')');
}

if (require.main === module) main();
module.exports = { score, build };
