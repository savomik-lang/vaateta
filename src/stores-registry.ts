// ---------------------------------------------------------------------------
// Yksi paikka, josta kaikki Awin-kaupat löytyvät. Uuden hyväksynnän
// lisääminen = yksi uusi rivi tähän taulukkoon, ei uutta tiedostoa eikä
// koodin kopiointia (ks. generic-awin-importer.ts ja multi-store-adapter.ts).
//
// "storeKey" on sisäinen tunniste (käytetään Redis-avaimissa).
// "feedIdEnvVar" on sen ympäristömuuttujan NIMI (ei arvo) josta Feed ID
// luetaan - näin .env-tiedoston täyttäminen riittää, ei tarvitse koskea
// tähän tiedostoon kun saat vielä lisää hyväksyntöjä, jos nimeät
// muuttujan tässä kuvatun kaavan mukaisesti.
// ---------------------------------------------------------------------------

export interface StoreDefinition {
  storeKey: string; // esim. "outnorth-se"
  displayName: string; // esim. "Outnorth SE"
  feedIdEnvVar: string; // esim. "AWIN_OUTNORTH_SE_FEED_ID"
  // "classic" = Awinin perinteinen productdata.awin.com/datafeed/download/apikey/...
  //   -URL, jossa fid on PELKKÄ NUMERO ja sarakkeet ovat Awinin omaa
  //   "generic" datafeed-formaattia (aw_deep_link, aw_product_id, jne).
  // "google"  = uudempi "Darwin" productdata-darwin-download -URL
  //   (ui.awin.com/productdata-darwin-download/publisher/{id}/{token}/1/feed/{feedId}.csv.gz),
  //   jossa feedId voi sisältää kirjaimia (esim. "F3671") ja sarakkeet ovat
  //   Google Shopping -skeeman mukaiset (id, title, link, price, jne).
  //   Tätä käytetään kun Awinin "Datafeed Format" -sarake näyttää "Google".
  format: "classic" | "google";
}

export const AWIN_STORES: StoreDefinition[] = [
  { storeKey: "outnorth-se", displayName: "Outnorth SE", feedIdEnvVar: "AWIN_OUTNORTH_SE_FEED_ID", format: "classic" },
  { storeKey: "outnorth-fi", displayName: "Outnorth FI", feedIdEnvVar: "AWIN_OUTNORTH_FI_FEED_ID", format: "classic" },
  { storeKey: "voghion-global", displayName: "Voghion Global", feedIdEnvVar: "AWIN_VOGHION_GLOBAL_FEED_ID", format: "google" },
  // PÄIVITÄ TÄHÄN uusi rivi kun Babyshop/Boozt tms. joskus hyväksyy:
  // { storeKey: "babyshop-fi", displayName: "Babyshop FI", feedIdEnvVar: "AWIN_BABYSHOP_FI_FEED_ID", format: "classic" },
];

// Palauttaa vain ne kaupat, joiden Feed ID on oikeasti asetettu .env:ssä -
// jos joku kauppa on taulukossa mutta ID puuttuu vielä, se ohitetaan
// hiljaisesti sen sijaan että koko haku kaatuisi.
export function getConfiguredStores(): (StoreDefinition & { feedId: string })[] {
  return AWIN_STORES.filter((s) => !!process.env[s.feedIdEnvVar]).map((s) => ({
    ...s,
    feedId: process.env[s.feedIdEnvVar] as string,
  }));
}
