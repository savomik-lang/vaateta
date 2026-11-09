# Hakukentän esimerkit viikoittain (Google Trends)

Hakukentän alla näkyvät esimerkit ("Esimerkiksi") vaihtuvat viikoittain sen mukaan, mitä
lastenvaatteita Suomessa ja Ruotsissa haetaan Googlesta kyseisellä viikolla eniten. Vaihe 1 (8.11.2026):
staattinen kalenteri viiden vuoden Google Trends -datasta. Vaiheet 2 (päivittäinen päivitys) ja 3
(Vaatetan omat nimettömät hakutilastot) ovat suunnitelmassa.

## Miten toimii

- `data/trends/FI.json` ja `data/trends/SE.json`: 35 lastenvaatehaun viikkoprofiilit (Trends, 5 vuotta).
- `scripts/build-chip-weeks.js` valitsee jokaiselle ISO-viikolle 1–52 kahdeksan ajankohtaisinta hakua
  ja kirjoittaa ne `index.html`:n `CHIP_WEEKS`-taulukkoon. Aja sen jälkeen `node scripts/build-i18n.js`.
  Tarkistus: `node scripts/build-chip-weeks.js --check`.
- Sivu näyttää kuluvan viikon viisi ensimmäistä (fi ja en: Suomen data, sv: Ruotsin data). Esimerkit,
  joille kaupoista ei löydy tuotteita (`/api/facets` = 0), vaihdetaan seuraaviin. Ilman dataa sivu
  käyttää vuodenajan esimerkkejä (`LOCALES.*.chips`). Testaus: `?viikko=1`–`52`.
- Esimerkkilauseet (`LOCALES.*.chipPhrases`) on tarkistettu backendin tulkitsijalla: sama vaatetyyppi
  kaikilla kielillä. `CHIP_ITEMS` kertoo, mihin facets-itemiin esimerkki kuuluu.

## Pisteytys

`pisteet(viikko) = sqrt(level) × profile[viikko]`

- `profile`: haun oma Trends-käyrä 5 vuodelta ISO-viikoittain keskiarvona, tasoitettu ±1 viikko,
  keskiarvo 100. Kertoo sesongin.
- `level`: hakumäärä suhteessa ankkurihakuun (FI `kypärämyssy`, SE `regnbyxor`), 5 vuoden summien
  suhde samasta vertailusta. Neliöjuuri vaimentaa eroja: pelkät hakusanat ("toppahousut") sisältävät
  aikuisten haut ja ovat moninkertaisia lapsiin rajattuihin ("lasten toppahousut", noin 1/12).
- Haku jätetään pois, jos Trends antaa lukeman alle 25 viikolle 262:sta (pelkkää kohinaa). Suomessa
  pois jäävät nyt kerrasto, fleece, uimahousut, shortsit, juhlamekko, collegehousut, farkut,
  leggingsit ja t-paita; Ruotsissa juhlamekko.
- Monipuolisuus: enintään 2 samasta ryhmästä (esim. päähineet, kengät, haalarit) viikkoa kohti.

## Datan päivitys (noin kerran vuodessa)

Virallinen Trends API on vain kutsutuille testaajille (2026), ja pytrends on lopetettu. Data haettiin
selaimessa trends.google.com-sivulta sivun omalla rajapinnalla (`/trends/api/explore` ja
`/trends/api/widgetdata/multiline`, `time: "today 5-y"`, `category: 0`):

1. Jokaiselle haulle oma käyrä yksinään (paras tarkkuus) → `profile`.
2. Tasot erissä: ankkuri + 4 hakua samassa vertailussa → `level = summa(haku) / summa(ankkuri)`.
3. Harvinaiset suomenkieliset "lasten …" -haut yhdistetään TAI-hauiksi (`"lasten farkut + poikien
   farkut + tyttöjen farkut"`); kumisaappaissa käytetään lapsiin rajattua muotoa, koska pelkkä
   "kumisaappaat" on pääosin aikuisten hakuja (12-kertainen taso).
4. Tauko noin 1,2 s pyyntöjen välillä; 429-vastauksella odotetaan 30 s.

Hakusanat ja käytetyt TAI-yhdistelmät: `query`-kentät tiedostoissa `data/trends/*.json`.
Ehdokaslista: `data/trends/hakusanat.json`.

## Havaintoja datasta (8.11.2026)

- Suomi: talvivarusteet (toppahousut, talvikengät, talvihaalari, kypärämyssy) huipussaan viikoilla
  44–48; välikausihaalari ja -takki viikoilla 9–13 ja 31–36; lenkkarit viikoilla 14–17; sandaalit,
  lippis ja aurinkohattu viikoilla 18–24; pyjamat ja hupparit nousevat joulun alla (lahjat).
- Ruotsi: kesävaatteet (sandaalit, shortsit, keps, baddräkt) viikoilla 16–26; regnställ ja gummistövlar
  viikoilla 30–36; vinterkängor huipussaan viikolla 47.
- Suomen lastenvaatehakuja on vähän: moni "lasten …" -haku on Trendsissä nolla suurimman osan viikoista.
  Maakuntatason päivädata ei siksi ole luotettavaa; viikkotaso koko maassa on.
