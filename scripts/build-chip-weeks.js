#!/usr/bin/env node
/*
 * Hakukentän esimerkit viikoittain (vaihe 1, "esimerkit Google Trendsistä").
 *
 * Lukee Google Trendsin viiden vuoden viikkodatan (data/trends/FI.json, data/trends/SE.json)
 * ja laskee jokaiselle ISO-viikolle 1–52 kahdeksan suosituinta lastenvaatehakua.
 * Tulos kirjoitetaan index.html:n CHIP_WEEKS-taulukkoon merkkien
 * /*CHIP_WEEKS*\/ ja /*END_CHIP_WEEKS*\/ väliin; sen jälkeen aja scripts/build-i18n.js.
 *
 * Datan muoto (data/trends/<GEO>.json):
 *   { geo, fetched, anchor, weeks: [unix-sekunnit…],
 *     terms: { <id>: { query, series: [0–100 …], level } } }
 *   series = hakusanan oma Trends-käyrä (huippu 100), level = keskimääräinen hakumäärä
 *   suhteessa ankkurisanaan (samasta vertailusta laskettu summien suhde).
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
const SMOOTH = [0.25, 0.5, 0.25]; // viikkojen tasoitus (edellinen, sama, seuraava)

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

function isoWeek(date) {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

// Viikkoprofiili: keskimääräinen hakumäärä (ankkurin mittakaavassa) kullekin ISO-viikolle 1–52.
function weeklyProfile(term, weeks) {
  const s = term.series;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sum = new Array(52).fill(0), n = new Array(52).fill(0);
  weeks.forEach((ts, i) => {
    // Trendsin viikko alkaa sunnuntaista; keskiviikko kertoo ISO-viikon.
    const w = Math.min(isoWeek(new Date((ts + 3 * 86400) * 1000)), 52) - 1;
    if (i === weeks.length - 1) return; // viimeinen viikko on kesken
    sum[w] += mean ? (s[i] / mean) * term.level : 0;
    n[w] += 1;
  });
  const raw = sum.map((v, w) => (n[w] ? v / n[w] : 0));
  return raw.map((_, w) => SMOOTH[0] * raw[(w + 51) % 52] + SMOOTH[1] * raw[w] + SMOOTH[2] * raw[(w + 1) % 52]);
}

function build(geo) {
  const file = path.join(ROOT, 'data', 'trends', geo + '.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = Object.keys(data.terms).filter((id) => data.terms[id].series && data.terms[id].level > 0);
  const prof = {};
  ids.forEach((id) => { prof[id] = weeklyProfile(data.terms[id], data.weeks); });
  const table = [];
  for (let w = 0; w < 52; w++) {
    const ranked = ids.slice().sort((a, b) => prof[b][w] - prof[a][w] || a.localeCompare(b));
    const pick = [], perGroup = {};
    for (const id of ranked) {
      const g = GROUP[id] || id;
      if ((perGroup[g] || 0) >= MAX_PER_GROUP) continue;
      if (prof[id][w] <= 0) continue;
      pick.push(id); perGroup[g] = (perGroup[g] || 0) + 1;
      if (pick.length === PER_WEEK) break;
    }
    table.push(pick);
  }
  return { table, fetched: data.fetched };
}

function main() {
  const check = process.argv.includes('--check');
  const out = {}, meta = [];
  GEOS.forEach((g) => { const r = build(g); out[g] = r.table; meta.push(g + ' ' + r.fetched); });
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
module.exports = { isoWeek, weeklyProfile, build };
