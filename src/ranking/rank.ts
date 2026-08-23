import { Product } from "../types";

// ---------------------------------------------------------------------------
// TÄMÄ ON TARKOITUKSELLA VIELÄ YKSINKERTAINEN TYNKÄ.
//
// Lopullinen suunnitelma on kuvattu tiedostossa
// hakukokemus-ja-jarjestys-speksi.md, kohdat 2.2 ja 2.5:
//
//   1. "Halvimmat"            — Top 5, efektiivinen hinta nousevasti
//   2. "Paras hinta-laatu"    — Top 5, halvin kolmannes + laatumerkintä
//                                materiaalikentässä + brändi-taso-painotus
//   3. "Näistä ihmiset pitivät eniten"
//                             — Top 5 tähtiarvostelun mukaan, PIILOTETAAN
//                                jos alle 3 arvioitua tuotetta löytyy
//
// Tätä ei kannata rakentaa lopulliseen muotoonsa vielä, koska:
//   - emme tiedä sisältääkö Boozt-feed rating-kenttää lainkaan
//   - emme tiedä kuinka johdonmukaisesti material-kenttä on täytetty
//   - brändi-taso-taulukko (Premium/Perus) pitää rakentaa oikean
//     Boozt-katalogin brändien perusteella, ei arvauksena etukäteen
//
// Kun boozt.ts palauttaa oikeaa dataa, tämä moduuli päivitetään ja
// nämä TODO:t puretaan yksi kerrallaan.
// ---------------------------------------------------------------------------

export interface RankedResults {
  cheapest: Product[];
  bestValue: Product[]; // TODO: toteuta hakukokemus-ja-jarjestys-speksi.md 2.5 mukaisesti
  mostLoved: Product[] | null; // null = piilotetaan (alle 3 arvioitua tuotetta)
}

const TOP_N = 5;

export function rankResults(products: Product[]): RankedResults {
  const cheapest = [...products]
    .sort((a, b) => a.price.amount - b.price.amount)
    .slice(0, TOP_N);

  // TODO (stub): tällä hetkellä "paras hinta-laatu" on vain sama kuin
  // halvimmat — EI lopullinen logiikka, ks. speksi 2.5 ennen julkaisua.
  const bestValue = cheapest;

  const ratedProducts = products.filter((p) => p.rating !== null);
  const mostLoved =
    ratedProducts.length >= 3
      ? [...ratedProducts]
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, TOP_N)
      : null;

  return { cheapest, bestValue, mostLoved };
}
