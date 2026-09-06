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
    datafeedApiKey: () => required("AWIN_DATAFEED_API_KEY"),
    boozt: {
      feedId: () => required("AWIN_BOOZT_FEED_ID"),
      format: (process.env.AWIN_BOOZT_FEED_FORMAT as "enhanced" | "legacy") || "legacy",
    },
  },
  feedRefreshIntervalMinutes: Number(process.env.FEED_REFRESH_INTERVAL_MINUTES || 24 * 60),
  productStorePath: process.env.PRODUCT_STORE_PATH || "./data/products-boozt.json",
};
