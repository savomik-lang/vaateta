import { Product, SearchCriteria } from "../types";
import { ProductStore } from "../store/product-store";

// ---------------------------------------------------------------------------
// VASTUU: hakee tuloksia PAIKALLISESTI TALLENNETUSTA Boozt-datasta
// (ks. boozt-feed-importer.ts, joka päivittää datan ajastetusti).
// Tämä tiedosto EI koskaan kutsu Awinia suoraan — se olisi väärä paikka,
// koska Awin ei tue livehakua per kysely.
//
// search()-metodin suodatuslogiikka on tarkoituksella yksinkertainen ja
// muista adaptereista riippumaton (jokainen kauppa-adapteri toteuttaa
// saman rajapinnan itsenäisesti, ks. speksin kohta 5).
//
// HUOM (tärkeä): tämä palauttaa VIELÄ VAIN suodatetut tulokset, EI
// järjestettynä paremmuusjärjestykseen — järjestäminen (3 filminauhaa:
// Halvimmat / Paras hinta-laatu / Näistä ihmiset pitivät eniten) tehdään
// erillisessä ranking-moduulissa (src/ranking/rank.ts), joka on VIELÄ
// tarkoituksella yksinkertainen tynkä ("stub") — se optimoidaan kun
// oikeaa Boozt-dataa on nähty ja nähdään millaista se oikeasti on.
// ---------------------------------------------------------------------------

export class BooztAdapter {
  constructor(private store: ProductStore = new ProductStore()) {}

  async search(criteria: SearchCriteria): Promise<Product[]> {
    const all = await this.store.loadAll();

    return all.filter((p) => matchesCriteria(p, criteria));
  }

  async lastImportedAt(): Promise<string | null> {
    return this.store.lastUpdated();
  }
}

function matchesCriteria(p: Product, c: SearchCriteria): boolean {
  if (!p.in_stock) return false;

  if (c.garment_type && p.garment_type !== c.garment_type) {
    return false;
  }

  if (c.max_price && p.price.currency === c.max_price.currency) {
    if (p.price.amount > c.max_price.amount) return false;
  }
  // HUOM: jos valuutat eroavat (esim. haku EUR, tuote SEK), tämä
  // suodatin EI tällä hetkellä suodata pois mitään — valuuttamuunnos
  // puuttuu vielä. TODO: lisää muunnos ennen tuotantoa (moni-markkina-MVP).

  if (c.brand_deny?.some((b) => b.toLowerCase() === p.brand.toLowerCase())) {
    return false;
  }
  if (c.brand_allow?.length) {
    const allowed = c.brand_allow.some(
      (b) => b.toLowerCase() === p.brand.toLowerCase()
    );
    if (!allowed) return false;
  }

  if (c.waterproof === true && p.waterproof !== true) {
    return false;
  }

  if (c.material_keywords?.length) {
    const haystack = (p.material || "").toLowerCase();
    const hasMatch = c.material_keywords.some((kw) =>
      haystack.includes(kw.toLowerCase())
    );
    if (!hasMatch) return false;
  }

  // Koon suodatus jätetty tarkoituksella löysäksi MVP:ssä, koska
  // size_normalized ei ole vielä täytetty (odottaa erillistä
  // koon normalisointipalvelua, speksi 6.2). Kun c.size_raw on annettu,
  // tehdään vain karkea tekstivertailu size_available-listaan.
  if (c.size_raw && p.size_available.length > 0) {
    const match = p.size_available.some((s) =>
      s.toLowerCase().includes(c.size_raw!.toLowerCase())
    );
    if (!match) return false;
  }

  return true;
}
