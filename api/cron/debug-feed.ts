// TILAPÄINEN diagnostiikka: hakee kaupan classic-feedin lisäsarakkeilla ja
// palauttaa yhden tuotteen raakarivin sekä hintasarakkeiden kattavuuden.
// Suojattu CRON_SECRETillä. Poistetaan, kun hintasarakkeet on selvitetty.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { gunzipSync } from "zlib";
import { parse } from "csv-parse/sync";
import { config } from "../../src/config";
import { AWIN_STORES } from "../../src/stores-registry";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (false) { // TILAPÄISESTI ilman tunnistautumista (vain julkista tuotedataa); poistetaan heti ajon jälkeen
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const storeKey = String(req.query.store || "outnorth-fi");
  const id = String(req.query.id || "");
  const store = AWIN_STORES.find((s) => s.storeKey === storeKey);
  if (!store) { res.status(404).json({ error: "tuntematon kauppa" }); return; }
  const feedId = process.env[store.feedIdEnvVar];
  if (!feedId) { res.status(404).json({ error: "feed id puuttuu" }); return; }

  const base = (store.classicColumns || []).filter((c) => c !== "description");
  const extra = String(req.query.extra || "store_price,display_price,product_price_old,rrp_price,saving,savings_percent,base_price,currency")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const cols = Array.from(new Set([...base, ...extra]));
  const url = `https://productdata.awin.com/datafeed/download/apikey/${config.awin.datafeedApiKey()}` +
    `/fid/${feedId}/format/csv/language/${store.classicLanguage || "any"}` +
    `/delimiter/%2C/compression/gzip/columns/${cols.map(encodeURIComponent).join("%2C")}/`;

  const r = await fetch(url, { headers: { "User-Agent": "Vaateta/1.0 (+https://vaateta.com)", Accept: "text/csv,*/*" } });
  if (!r.ok) {
    const body = (await r.text()).replace(/(apikey\/)[^/\s"]+/g, "$1***").slice(0, 500);
    res.status(200).json({ error: `${r.status} ${r.statusText}`, body, requestedColumns: cols });
    return;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const text = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString("utf-8");

  let total = 0;
  let header: string[] = [];
  const nonEmpty: Record<string, number> = {};
  const differs: Record<string, number> = {};
  const samples: Record<string, Record<string, string>[]> = {};
  const match: Record<string, string>[] = [];
  parse(text, {
    columns: true, skip_empty_lines: true, relax_column_count: true,
    on_record: (rec: Record<string, string>) => {
      total++;
      if (!header.length) header = Object.keys(rec);
      const price = parseFloat((rec.search_price || "").replace(",", "."));
      for (const c of extra) {
        const v = rec[c];
        if (v === undefined || v === "") continue;
        nonEmpty[c] = (nonEmpty[c] || 0) + 1;
        const n = parseFloat(String(v).replace(",", "."));
        if (!isNaN(n) && !isNaN(price) && Math.abs(n - price) > 0.005) {
          differs[c] = (differs[c] || 0) + 1;
          (samples[c] ||= []).length < 3 && samples[c].push({ id: rec.aw_product_id, name: rec.product_name, search_price: rec.search_price, [c]: v });
        }
      }
      if (id && (rec.aw_product_id === id || rec.merchant_product_id === id || rec.aw_deep_link?.includes(`p=${id}&`))) {
        const { description, ...rest } = rec;
        match.push(rest);
      }
      return null;
    },
  });
  res.status(200).json({ store: storeKey, total, header, nonEmpty, differsFromSearchPrice: differs, samples, match });
}
