import type { VercelRequest, VercelResponse } from "@vercel/node";
import { importAwinStore } from "../../src/adapters/generic-awin-importer";
import { getConfiguredStores } from "../../src/stores-registry";
import { getUnconfiguredStoreNames } from "../../src/adapters/multi-store-adapter";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers["authorization"];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // ?store=outnorth-fi tuo vain yhden kaupan - hyödyllinen suurille feedeille,
  // jotka eivät mahdu yhteen 60 s funktioajoon peräkkäin tuotuina.
  // Pilkulla erotettuna useampi: ?store=outnorth-fi,voghion-global
  const onlyStore = typeof req.query.store === "string" ? req.query.store : undefined;
  const wanted = onlyStore ? onlyStore.split(",").map((x) => x.trim()).filter(Boolean) : [];
  const allConfigured = getConfiguredStores();
  const stores = wanted.length ? allConfigured.filter((s) => wanted.includes(s.storeKey)) : allConfigured;
  if (wanted.length && stores.length === 0) {
    res.status(404).json({
      error: `Kauppaa "${onlyStore}" ei löydy tai sitä ei ole konfiguroitu.`,
      configured: allConfigured.map((s) => s.storeKey),
    });
    return;
  }
  if (stores.length === 0) {
    res.status(200).json({
      message: "Ei yhtään kauppaa konfiguroitu .env:ssä - tarkista AWIN_*_FEED_ID-muuttujat.",
      results: [],
    });
    return;
  }

  const results: any[] = [];
  // Kaupat tuodaan rinnakkain: kokonaisaika on hitain kauppa, ei kaikkien summa
  // (FI + Voghion samassa ajossa mahtuu 60 s rajaan).
  await Promise.all(stores.map(async (store) => {
    try {
      const result = await importAwinStore(store);
      results.push({ ...result, status: "ok" });
    } catch (err: any) {
      console.error(`${store.displayName}: tuonti epäonnistui:`, err);
      // Node/undici "fetch failed" -virheen todellinen syy (DNS, TLS, timeout,
      // connection reset) on käärittynä err.cause-kenttään, jota pelkkä
      // err.message ei näytä - poimitaan se mukaan diagnostiikkaa varten.
      const cause = err?.cause ? String(err.cause?.message || err.cause) : undefined;
      results.push({
        storeKey: store.storeKey,
        displayName: store.displayName,
        status: "error",
        error: err.message,
        cause,
      });
    }
  }));

  results.sort((x, y) => String(x.storeKey).localeCompare(String(y.storeKey)));
  res.status(200).json({
    imported: results,
    unconfigured_stores: getUnconfiguredStoreNames(),
  });
}
