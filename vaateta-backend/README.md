# Vaateta — Boozt/Awin-adapteri

Tämä paketti sisältää ensimmäisen oikean data-integraation: siirtymän
mock-katalogista Awinin kautta saatavaan Boozt-dataan.

## Arkkitehtuuri lyhyesti

Awin **ei tarjoa livehakua** — data saadaan säännöllisesti ladattavana
CSV/XML-tiedostona, joka sisältää koko katalogin. Siksi integraatio on
jaettu kahteen osaan:

```
boozt-feed-importer.ts   Lataa KOKO Boozt-katalogin Awinista ja tallentaa
                          sen paikallisesti (ajetaan ajastetusti, esim. 1x/vrk)
                                    │
                                    ▼
                          data/products-boozt.json  (ProductStore)
                                    │
                                    ▼
boozt.ts (adapter)        search()-metodi hakee TÄSTÄ paikallisesta
                          datasta, EI koskaan suoraan Awinista
                                    │
                                    ▼
rank.ts                   Järjestää tulokset (TÄLLÄ HETKELLÄ TYNKÄ —
                          ks. alla "Ranking-moduulin tila")
```

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

`rank.ts` on **tarkoituksella yksinkertainen tynkä** juuri nyt, kuten
sovittiin: "Halvimmat" toimii oikeasti, mutta "Paras hinta-laatu" palauttaa
tällä hetkellä saman listan kuin halvimmat (ei vielä oikeaa laatuheuristiikkaa).
Tämä optimoidaan seuraavaksi, kun oikeaa Boozt-dataa on nähty — täydellinen
algoritmi on jo suunniteltu dokumentissa `hakukokemus-ja-jarjestys-speksi.md`
kohdassa 2.5, se vain odottaa oikeaa dataa ennen viimeistelyä.
