import { importAwinStore, ImportResult } from "./generic-awin-importer";
import { importAdtractionStore } from "./adtraction-importer";
import { StoreDefinition } from "../stores-registry";

// Valitsee tuontitavan kaupan verkoston (format) mukaan. Skriptit ja cron käyttävät tätä,
// jolloin uuden verkoston kauppa ei vaadi muutoksia kutsupaikkoihin.
export function importStore(store: StoreDefinition & { feedId: string }): Promise<ImportResult> {
  return store.format === "adtraction" ? importAdtractionStore(store) : importAwinStore(store);
}
