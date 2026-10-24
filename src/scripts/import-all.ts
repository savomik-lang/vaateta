import { importAwinStore } from "../adapters/generic-awin-importer";
import { getConfiguredStores } from "../stores-registry";
import { getUnconfiguredStoreNames } from "../adapters/multi-store-adapter";

async function main() {
  const stores = getConfiguredStores();
  if (stores.length === 0) {
    console.log("Ei yhtään kauppaa konfiguroitu .env:ssä - tarkista AWIN_*_FEED_ID-muuttujat.");
    return;
  }
  for (const store of stores) {
    try {
      const result = await importAwinStore(store);
      console.log(`${store.displayName}: ${result.importedProducts} tuotetta tuotu (${result.skippedRows} ohitettu).`);
    } catch (err: any) {
      console.error(`${store.displayName}: tuonti epäonnistui:`, err.message);
    }
  }
  const unconfigured = getUnconfiguredStoreNames();
  if (unconfigured.length > 0) {
    console.log("Ei vielä konfiguroitu (puuttuu Feed ID .env:stä):", unconfigured.join(", "));
  }
}

main().catch((err) => {
  console.error("Tuonti epäonnistui:", err);
  process.exit(1);
});
