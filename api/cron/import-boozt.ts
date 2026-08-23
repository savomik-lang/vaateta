import type { VercelRequest, VercelResponse } from "@vercel/node";
import { importBooztFeed } from "../../src/adapters/boozt-feed-importer";

// Vercelin cron kutsuu tätä automaattisesti vercel.json:n aikataulun mukaan.
// CRON_SECRET-tarkistus estää sen, että kuka tahansa voisi laukaista
// katalogin uudelleenlatauksen kutsumalla osoitetta suoraan.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers["authorization"];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const result = await importBooztFeed();
    res.status(200).json(result);
  } catch (err: any) {
    console.error("Boozt-feedin tuonti epäonnistui:", err);
    res.status(500).json({ error: err.message || "Tuntematon virhe tuonnissa" });
  }
}
