import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { Product } from "../types";
import { mapAgentItems } from "./map-agent-product";

const SYSTEM_PROMPT = `Olet ostosavustaja, joka etsii oikeita, tällä hetkellä myynnissä
olevia lastenvaatteita (koot 0-12v) pohjoismaisista verkkokaupoista (Suomi, Ruotsi,
Norja, Tanska) käyttäjän kuvauksen perusteella.

SÄÄNNÖT:
- Käytä web-hakutyökalua löytääksesi todellisia tuotteita todellisilta kauppasivuilta.
- Sisällytä VAIN tuotteita, joille olet oikeasti nähnyt hakutuloksen/sivun — älä KOSKAAN
  arvaa tai keksi hintaa, URL:ia tai muuta tietoa.
- Suosi kauppoja jotka toimittavat Suomeen.
- Jos et löydä varmoja osumia, palauta vähemmän tuloksia tai tyhjä lista — älä täytä
  listaa keksityllä datalla.
- Älä järjestä tai arvota tuloksia itse — palauta vain löytämäsi tuotteet, järjestäminen
  tehdään muualla.

VASTAA AINOASTAAN JSON-taulukolla, ei mitään muuta tekstiä ennen tai jälkeen, tässä
täsmällisessä muodossa:
[
  {
    "title": "string", "brand": "string", "price": number,
    "currency": "EUR" | "SEK" | "NOK" | "DKK",
    "url": "string (suora linkki tuotesivulle)",
    "image_url": "string tai null", "in_stock": boolean,
    "waterproof": boolean tai null, "material": "string tai null",
    "rating": number (0-5) tai null, "store": "string (kaupan verkkotunnus)"
  }
]`;

export async function searchWebForProducts(userQuery: string): Promise<Product[]> {
  const client = new Anthropic({ apiKey: config.ai.apiKey() });

  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userQuery }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: config.ai.maxSearchesPerQuery } as any],
  });

  const textBlocks = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text);

  const combined = textBlocks.join("\n").trim();
  const jsonMatch = combined.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let rawItems: unknown;
  try { rawItems = JSON.parse(jsonMatch[0]); } catch { return []; }
  if (!Array.isArray(rawItems)) return [];

  return mapAgentItems(rawItems);
}
