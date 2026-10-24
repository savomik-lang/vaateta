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

  const stores = getConfiguredStores();
  if (stores.length === 0) {
    res.status(200).json({
      message: "Ei yhtään kauppaa konfiguroitu .env:ssä - tarkista AWIN_*_FEED_ID-muuttujat.",
      results: [],
    });
    return;
  }

  const results = [];
  for (const store of stores) {
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
  }

  res.status(200).json({
    imported: results,
    unconfigured_stores: getUnconfiguredStoreNames(),
  });
}
