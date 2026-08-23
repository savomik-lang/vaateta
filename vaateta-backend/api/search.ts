import type { VercelRequest, VercelResponse } from "@vercel/node";
import { BooztAdapter } from "../src/adapters/boozt";
import { rankResults } from "../src/ranking/rank";
import { SearchCriteria, GarmentType } from "../src/types";

// ---------------------------------------------------------------------------
// TÄMÄ ON VÄLIAIKAINEN, YKSINKERTAINEN TEKSTINTULKINTA — EI VIELÄ SPEKSIN
// KUVAAMA "NLU/SLOT-FILLING (LLM, työkalukutsuilla)" -KERROS.
// Toimii riittävän hyvin ensimmäiseen testiin, mutta EI kysy täydentäviä
// kysymyksiä eikä tunnista kaikkia ilmaisutapoja. Korvataan oikealla
// LLM-pohjaisella tulkinnalla kun perusputki on todettu toimivaksi.
// ---------------------------------------------------------------------------

const GARMENT_KEYWORDS: Record<GarmentType, string[]> = {
  takki: ["takki", "kuoritakki", "toppatakki"],
  housut: ["housut", "farkut", "kurahousut", "verkkarit"],
  kengät: ["kengät", "saappaat"],
  paita: ["paita", "t-paita", "collegepaita", "huppari"],
  haalari: ["haalari"],
  muu: [],
};

function parseCriteriaFromText(text: string): SearchCriteria {
  const lower = text.toLowerCase();
  const criteria: SearchCriteria = {};

  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [
    GarmentType,
    string[],
  ][]) {
    if (keywords.some((kw) => lower.includes(kw))) {
      criteria.garment_type = type;
      break;
    }
  }

  // "max 120€", "max 120 €", "alle 60€" -tyyliset ilmaukset
  const priceMatch = lower.match(/(?:max|alle)\s*(\d+)\s*€?/);
  if (priceMatch) {
    criteria.max_price = { amount: parseInt(priceMatch[1], 10), currency: "EUR" };
  }

  if (lower.includes("vedenpitäv")) {
    criteria.waterproof = true;
  }

  // Koon tunnistus: "110cm", "110 cm", tai "5-vuotiaalle" / "5v"
  const cmMatch = lower.match(/(\d{2,3})\s*cm/);
  const ageMatch = lower.match(/(\d{1,2})[\s-]?v(?:uotiaalle|uotta|uotiaan)?/);
  if (cmMatch) {
    criteria.size_raw = cmMatch[1];
  } else if (ageMatch) {
    criteria.size_raw = ageMatch[1]; // karkea, ei vielä oikeaa ikä->cm-normalisointia
  }

  return criteria;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Vain GET-pyynnöt tuettu" });
    return;
  }

  const q = (req.query.q as string) || "";
  if (!q.trim()) {
    res.status(400).json({ error: "Anna hakuteksti parametrilla ?q=..." });
    return;
  }

  try {
    const criteria = parseCriteriaFromText(q);
    const adapter = new BooztAdapter();
    const matches = await adapter.search(criteria);
    const ranked = rankResults(matches);
    const lastImported = await adapter.lastImportedAt();

    res.status(200).json({
      query: q,
      parsed_criteria: criteria,
      total_matches: matches.length,
      last_imported: lastImported,
      results: ranked,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Tuntematon virhe haussa" });
  }
}
