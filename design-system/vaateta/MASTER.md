# Vaateta – suunnittelujärjestelmä (MASTER)

Yhteinen lähde kaikille käyttöliittymämuutoksille (UI-chat, Data-chat ja muut). Päätetty premium-UX-suunnitelmassa
(https://claude.ai/artifact/D1hC2KhiQDHTaQ4Jmj83CZ), otettu käyttöön vaiheessa 1 (1.11.2026). Rakenne seuraa
UI UX Pro Max -skillin MASTER-mallia (`.claude/skills/ui-ux-pro-max`). Sivukohtaiset poikkeukset:
`design-system/vaateta/pages/<sivu>.md` (ei vielä yhtään).

Arvot ovat CSS-muuttujina `index.html`:n ja `tietosuoja.html`:n `:root`-lohkossa. **Käytä muuttujia, älä kirjoita
värikoodeja suoraan komponentteihin.**

## Suunta

- Haku edellä toimiva pohjoismainen minimalismi: rauhallinen, lämmin ja ilmava pohja, haku pääosassa,
  tuotekuvat tuovat värin.
- Editoriaaliset otsikot (Fraunces), selkeä käyttöliittymäteksti (Inter).
- Väriä vain merkityksen kanssa: ale, sopivuus, korostus. Ei koristevärejä.
- Skillin säätimet: rohkeus 4/10, liike 3/10 (hienovarainen), tiiviys 3/10 (ilmava).

## Värit

| Muuttuja | Arvo | Käyttö | Kontrasti |
|---|---|---|---|
| `--paper` | #F7F5F0 | Sivun pohja | – |
| `--paper-raised` | #FFFFFF | Kortit, hakukenttä, vaalea teksti tummalla | – |
| `--paper-alt` | #EFECE5 | Osion tausta, kuvaruudut | – |
| `--ink` | #1F2124 | Otsikot, teksti, pääpainike (valkoinen teksti) | 14,8:1 pohjalla, 16,1:1 painikkeessa |
| `--ink-soft` | #5B5E64 | Selitteet, kauppojen nimet | 6,0:1 |
| `--accent` | #E7A94A | Korostus taustana tai tummalla pohjalla (musta teksti päällä) | 7,8:1 |
| `--accent-text` | #9A6418 | Korostus tekstinä vaalealla (valittu välilehti, numerot) | 4,6:1 |
| `--berry` | #A83D34 | Ale (hinta, merkki), mikrofoni kuuntelee | 5,7:1 / 6,2:1 valkoisella |
| `--sage` | #4E5B44 | Sopivuus (teksti), kohdistusrengas | 6,0:1 `--fit-bg`:llä |
| `--fit-bg` | #E6EBDF | Sopivuusmerkin ja tulkintasirun tausta | – |
| `--blue` | #33505C | Linkit tietosuojasivulla, aikuisten koko -merkki | 8,6:1 |
| `--line` | rgba(31,33,36,0.14) | Reunat ja erottimet | – |

Kielletty: #C98A2B (vanha sinappi) tekstinä, kontrasti 2,7:1.

## Typografia

| Taso | Fontti | Koko työpöytä / mobiili | Huomio |
|---|---|---|---|
| Pääotsikko (h1) | Fraunces 400, kursiivi korostukseen | clamp(36px, 4.4vw, 56px), rivitys 1,05 | Enintään 2 riviä, `text-wrap: balance` |
| Osion otsikko (h2) | Fraunces 400 | `--h2-size` = clamp(26px, 2.6vw, 32px) | |
| Väliotsikko (h3) | Inter 600 | 16–17 px | |
| Leipäteksti | Inter 400 | 15–17 px, rivitys 1,5 | Lomakekentät vähintään 16 px (iOS) |
| Hinnat | Inter 600, `font-variant-numeric: tabular-nums` | 17 px (alkuperäinen 13 px) | |
| Pienet nimikkeet | Inter 500 | 13–14 px | Ei isoja kirjaimia, ei mono-fonttia (poikkeus: beta-merkki ja kielikoodit) |

- Fraunces 400 on valittu vertailussa (500 näytti raskaalta isoissa koissa, 350 liian ohuelta kuvan päällä).
- Fontit omalta palvelimelta: `/fonts/fonts.css` (Fraunces opsz + wght, normaali ja kursiivi; Inter wght;
  latin + latin-ext). Lisenssi SIL OFL 1.1 (`/fonts/OFL-*.txt`). Ei Google Fontsia.
- Muuttujat: `--font-display`, `--font-ui`.

## Muodot ja välit

| Muuttuja | Arvo | Käyttö |
|---|---|---|
| `--radius` | 12 px | Kortit, kuvat, laatikot |
| `--r-field` | 14 px | Hakukenttä |
| `--r-btn` | 10 px | Painikkeet, mikrofoni |
| `--r-sm` | 6 px | Pienet merkit (ale, sopivuus, beta) |
| – | 999 px | Sirut ja kielivalinnat |

- Välit 8 px:n askelin: 8, 16, 24, 32, 48, 56, 64, 72, 88. Osioiden väli 72–88 px työpöydällä, 56 px mobiilissa.
- Varjo vain hakukentässä (`0 16px 36px -18px rgba(0,0,0,.45)`) ja korttien hover-tilassa.
- Sivun leveys 1120 px, sivureunat 28 px (mobiili 18 px).

## Kerrokset (z-index)

| Arvo | Elementti |
|---|---|
| 2 | `.hero-content` (ensinäkymän teksti ja haku) |
| 10 | `header` (logo, valikko, kielivalitsin ja sen pudotusvalikko) |
| 20 | `.sticky-search` (kiinnittyvä hakupalkki) |
| 60 | Puhehaun ikkuna |

- Otsakkeen täytyy olla ensinäkymän sisällön yläpuolella: mobiilissa `.hero-content` alkaa heti otsakkeen alta
  (yläpadding kuvan korkeuden verran) ja peitti kielivalikon, kun molemmilla oli sama arvo (korjattu 1.11.2026).
- Uusi pudotusvalikko tai ponnahdus: tarkista mobiilissa, että se on päällimmäisenä (`document.elementFromPoint`).

## Kuvat

- Ensinäkymä: `images/ensinakyma-metsapolku-*` (WebP 1408/800 + JPG). Kategoriat: `images/kategoria-*` (4:3, WebP 480/960 + JPG).
- Alkuperäiset: `images/lahde/` (ei julkaista). Tekoälykuvat: alatunnisteessa "Kuvat on luotu tekoälyllä".
- Tuotekuvissa ei logoja tai merkkien tunnusmerkkejä ("plain unbranded").

## Liike

- Hienovarainen: 150–400 ms, enintään 1–2 animoitua asiaa näkymää kohti, vain `transform` ja `opacity`.
- `prefers-reduced-motion: reduce` → ei liikettä.
- Ei parallaksia, automaattisia karuselleja, kursoriefektejä eikä lasisumennusta kuvien päällä.

## Saavutettavuus (tarkista jokaisessa PR:ssä)

- Tekstin kontrasti vähintään 4,5:1 (iso teksti 3:1), tarkistetaan axe-työkalulla.
- Kosketusalueet vähintään 44 × 44 px, kohdistus näkyy (`:focus-visible`).
- Kuvissa mitat (`width`/`height`), koristekuvissa `alt=""`, laiska lataus näkymän alapuolella.
- Skillin julkaisua edeltävä tarkistuslista: `.claude/skills/ui-ux-pro-max/SKILL.md` → "Pre-Delivery Checklist".
