import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Puuttuva ympäristömuuttuja: ${name}. Tarkista .env-tiedosto (ks. .env.example).`
    );
  }
  return value;
}

export const config = {
  awin: {
    // HUOM: tämä on eri avain kuin AWIN_API_TOKEN (Publisher API) —
    // datafeedin lataukseen käytetään erikseen datafeed-API-avainta.
    // Löytyy Awinin kojelaudalta: My Account -> API Credentials -> Datafeed
    datafeedApiKey: () => required("AWIN_DATAFEED_API_KEY"),

    // Boozt-ohjelman feed-ID. Löytyy Awinin "Create-a-Feed" tai
    // "Product Feed List Download" -näkymästä, kun Boozt-hyväksyntä on tullut.
    boozt: {
      feedId: () => required("AWIN_BOOZT_FEED_ID"),
      // "enhanced" = Google-formaatti (sisältää size/gender/age_group suoraan)
      // "legacy"   = vanha Awin-formaatti (ei erillistä size-kenttää)
      // Tarkista Awinin kojelaudalta kumpi on tarjolla Boozt-feedille.
      format: (process.env.AWIN_BOOZT_FEED_FORMAT as "enhanced" | "legacy") || "legacy",
    },
  },

  // Kuinka usein feed-importeri ajetaan (minuutteina). Awin päivittää
  // useimmat feedit n. 1x/vrk, joten tiheämpi haku ei tuo lisäarvoa.
  feedRefreshIntervalMinutes: Number(process.env.FEED_REFRESH_INTERVAL_MINUTES || 24 * 60),

  productStorePath: process.env.PRODUCT_STORE_PATH || "./data/products-boozt.json",
};
