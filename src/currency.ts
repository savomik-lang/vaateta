import { Money } from "./types";

// Karkeat kiinteät kurssit EUR-vertailua varten (hintarajat ja hintajärjestys,
// kun tuloksissa on useita valuuttoja, esim. Outnorth SE = SEK). EI käytetä
// näytettävien hintojen muuntamiseen - tuotteen oma hinta ja valuutta
// näytetään sellaisenaan. Päivitä kurssit tarvittaessa.
const RATES_TO_EUR: Record<string, number> = {
  EUR: 1,
  SEK: 0.09,
  NOK: 0.085,
  DKK: 0.134,
};

export function toEur(m: Money): number {
  return m.amount * (RATES_TO_EUR[m.currency] ?? 1);
}
