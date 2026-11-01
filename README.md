# Vaateta — Boozt/Awin-adapteri

Tämä paketti sisältää ensimmäisen oikean data-integraation: siirtymän
mock-katalogista Awinin kautta saatavaan Boozt-dataan.

## Arkkitehtuuri lyhyesti

Awin **ei tarjoa livehakua**: kauppojen katalogit (Outnorth FI, Outnorth SE,
Voghion) ladataan kerran vuorokaudessa ja haku tehdään omasta tietokannasta.

```
api/cron/import-all.ts    Lataa kauppojen Awin-feedit (vercel.json crons, 1x/vrk)
                                    │
                                    ▼
                          Redis (src/store)  – tuotteet kaupoittain
                                    │
                                    ▼
api/search.ts             ?q=&lang=fi|sv|en (&market=FI|SE|other)
  1. tulkinta             src/nlu/parse-query.ts (säännöt fi/sv/en) + LLM-varapolku
  2. haku ja suodatus     src/adapters/multi-store-adapter.ts, lapsiturvasuodatus
  3. yhdistäminen         src/ranking/offers.ts (värit, sama tuote eri kaupoissa)
  4. järjestys            src/ranking/rank.ts + fit.ts (tuloslistat, ks. alla)
  5. palaute              src/search-notice.ts (notice, kielellä lang)
                                    │
                                    ▼
index.html (+ sv/, en/)   Käyttöliittymä: Sopivimmat ensin, välilehdet,
                          tulkintasirut, puhehaku. middleware.ts valitsee kielen.
```

### Tuloslistat ja niiden järjestys

Haku palauttaa neljä listaa (`results`). **Sopivimmat (`bestMatch`) on
ensisijainen tulos**: käyttöliittymä avaa sen oletuksena kaikilla kielillä, ja
backend palauttaa sen aina, kun tuloksia on (päätetty 1.11.2026).

| Lista | Välilehti | Järjestys |
|---|---|---|
| `bestMatch` | Sopivimmat / Passar bäst / Best match | **Koko tai ikä tiedossa:** koon sopivuus (kasvunvaraa 0–6 cm, kengät EU-koko), sitten hakurajaukset ja hinta (`byFitThenPrice`). **Ei kokoa:** hakurajausten osumat (sukupuoli, talvi, vedenpitävyys, kävijän markkina, saatavuus) + laatumerkit, tunnettu merkki ja hyvät arviot, sitten hinta (`criteriaMatch`); kallein kolmannes jätetään pois. |
| `cheapest` | Halvimmat | Hinta (euroiksi muunnettuna). Kokohaussa hyvin istuvista, jos niitä on vähintään 5. |
| `bestValue` | Paras hinta-laatu | Edullisin kolmannes: laatumerkit ja tunnetut merkit ensin. |
| `mostLoved` | Suosituimmat | Asiakasarviot (vähintään 3 arvioitua tuotetta). |

Käyttöliittymä näyttää Sopivimmat-välilehden kuvauksessa, kumpaa järjestystä
käytettiin, ja ilman kokoa se kehottaa lisäämään iän tai koon. Käyttäjän
valitsema välilehti säilyy seuraavissa hauissa. AI-web-haun tuloksilla
(ei hakukontekstia) Sopivimmat-listaa ei ole.

### Kieliversiot

`index.html` on suomenkielinen lähde. `scripts/build-i18n.js` tuottaa
`sv/index.html` ja `en/index.html` käännöstiedostoista `i18n/*.json`
(`npm test` tarkistaa, että ne ovat ajan tasalla). JavaScriptin tekstit ja
kieliriippuva data ovat index.html:n `I18N`- ja `LOCALES`-taulukoissa.
`middleware.ts` ohjaa etusivun kävijän kielen mukaan (säännöt
`src/i18n/choose-language.ts`; oma valinta evästeessä `vaateta_lang`).

## Käyttöönotto

1. Kopioi `.env.example` → `.env` ja täytä:
   - `AWIN_DATAFEED_API_KEY` — Awinin kojelauta → My Account → API Credentials → Datafeed
   - `AWIN_BOOZT_FEED_ID` — saatavilla vasta kun Boozt on hyväksynyt hakemuksesi
   - `AWIN_BOOZT_FEED_FORMAT` — tarkista onko Boozt-feed "enhanced" (Google-formaatti) vai "legacy"

2. Asenna riippuvuudet:
   ```
   npm install
   ```

3. Aja ensimmäinen tuonti:
   ```
   npm run import:boozt
   ```
   Tämä lataa Boozt-katalogin ja kirjoittaa sen tiedostoon
   `data/products-boozt.json`.

4. Aja tämä säännöllisesti (esim. cron-jobina tai serverless-ajastimena)
   `FEED_REFRESH_INTERVAL_MINUTES`-muuttujan mukaisella välillä.

## Hakutekstin tulkinta (sääntöparseri + LLM-varapolku)

`api/search.ts` tulkitsee hakutekstin kahdessa vaiheessa:

1. **Sääntöparseri** (`src/nlu/parse-query.ts`) ajetaan aina ensin. Se on ilmainen,
   nopea ja deterministinen.
2. **LLM-tulkinta** (`src/nlu/llm-interpret.ts`) kutsutaan vain, kun
   - vaatetyyppiä ei tunnistettu (esim. taivutettu "sadetakin", kirjoitusvirhe), tai
   - teksti ei ole suomea (ruotsi, englanti, tanska, norja).

LLM ei päätä hakutuloksista. Se poimii tekstistä samat kriteerit kuin sääntöparseri
(`src/nlu/llm-spec.ts`: pakotettu työkalukutsu, validointi `sanitizeLlmExtraction`).
Ikä muunnetaan senteiksi koodissa (`AGE_TO_CM`), ei mallissa. Suomenkielisessä
tekstissä sääntöparserin tulos voittaa ristiriidassa, muilla kielillä LLM:n.
Lapsiturvasuodatus ajetaan hakutuloksille kuten ennenkin.

Haku ei koskaan kaadu LLM:n takia: jos LLM on pois päältä, päiväraja täynnä,
aikakatkaisu tulee tai vastaus on virheellinen, haku jatkuu sääntötuloksella.
Vastauksen `interpretation`-kenttä kertoo mitä tapahtui
(`method`: `rules`/`llm`, `language`, `confidence`, `llm_status`:
`used`/`cached`/`disabled`/`rate_limited`/`error`/`too_long`).

Kustannussuojat: LLM vain varapolkuna, enintään 300 merkin teksti, vastaukset
välimuistissa (24 h), oma päiväraja (oletus 500 kutsua/vrk, erillään AI-web-haun
rajasta), 8 s aikakatkaisu, ei uudelleenyrityksiä.

| Ympäristömuuttuja | Oletus | Merkitys |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Pakollinen LLM-tulkintaan (sama avain kuin AI-web-haussa) |
| `NLU_LLM_ENABLED` | päällä kun avain on | `false` kytkee LLM-tulkinnan pois |
| `NLU_LLM_MODEL` | `AI_SEARCH_MODEL` / `claude-haiku-4-5-20251001` | Käytettävä malli |
| `NLU_LLM_DAILY_LIMIT` | 500 | Kutsuja päivässä |
| `NLU_LLM_CACHE_TTL_SECONDS` | 86400 | Tulkintojen välimuisti |
| `NLU_LLM_TIMEOUT_MS` | 8000 | Yksittäisen kutsun aikaraja |

Rajaukset: `material_keywords` (materiaali) ei tule LLM:ltä, koska feedien materiaalit
eivät ole suomeksi. Käyttöliittymän ilmoitukset (`notice`) ovat toistaiseksi vain suomeksi.

## TODO ennen kuin oikea data on käytössä

Nämä on merkitty koodiin `TODO`-kommentteina, mutta koottu tähän
näkyvyyden vuoksi:

- [ ] **Vahvista tarkka sarakelista** Awinin "Create-a-Feed"-työkalusta
      Boozt-hyväksynnän jälkeen — `buildFeedUrl()`-funktion sarakelista
      on paras arvaus generic-kenttien perusteella, ei vielä vahvistettu.
- [ ] **Tarkista sisältääkö Boozt-feed `rating`-kenttää.** Jos ei, "Näistä
      ihmiset pitivät eniten" -filminauha jää aina piiloon (koodi käsittelee
      tämän jo oikein — ei kaadu, vain palauttaa `null`).
- [ ] **Tarkista `material`-kentän kattavuus** — vaikuttaa suoraan
      "paras hinta-laatu" -heuristiikkaan (ks. rank.ts TODO).
- [ ] **Koon käsittely** — jos feed on "legacy"-formaatti ilman size-kenttää,
      koot pitää päätellä esim. `parent_product_id`-ryhmittelystä tai
      product_name-tekstistä. Enhanced-formaatti ratkaisee tämän suoraan.
- [ ] **Valuuttamuunnos** hakusuodattimessa (`boozt.ts`, `matchesCriteria`),
      jos halutaan hakea esim. EUR-budjetilla SEK-hintaisia tuotteita.

## Ranking-moduulin tila

Ranking on käytössä: ks. yllä "Tuloslistat ja niiden järjestys" (`src/ranking/rank.ts`, `fit.ts`,
`brand-tiers.ts`, `quality-signals.ts`). Laatuheuristiikkaa (merkit, materiaalit) tarkennetaan,
kun dataa ja käyttäjäpalautetta kertyy.
