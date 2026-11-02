import { Product } from "../types";
import { hasBlockedKeywords } from "./child-safety-filter";

// LAPSITURVALLISUUS (korkea prioriteetti, viimeinen puolustuskerros): suodattaa VIELÄ KERRAN
// riippumatta tulosten lähteestä (omat Awin-kaupat tai AI-web-hakuvarapolku) ennen kuin mitään
// näytetään käyttäjälle. Tuonnin oma suodatus (generic-awin-importer.ts) estää suurimman osan
// epäsopivista tuotteista pääsemästä kantaan asti, mutta tämä on viimeinen varmistus siltä
// varalta että data on tullut jotain muuta reittiä. Jaettu: q-haku, rakenteinen haku ja facets.
export function filterChildSafe(products: Product[]): Product[] {
  return products.filter((p) => !hasBlockedKeywords({ title: p.title, category: p.garment_type }));
}
