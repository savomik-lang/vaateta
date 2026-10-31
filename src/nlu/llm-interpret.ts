import { Currency, SearchCriteria } from "../types";
import { AGE_TO_CM } from "../size";
import { IKeyValueStore } from "../store/kv-store";
import { checkAndIncrementDailyLimit } from "../ai/rate-limit";
import { DetectedLanguage, detectLanguage } from "./language";
import { LlmExtraction, LlmLanguage, sanitizeLlmExtraction } from "./llm-spec";

// ---------------------------------------------------------------------------
// LLM-tulkinta sääntöparserin VARAPOLKUNA.
//
// Sääntöparseri (parse-query.ts) ajetaan aina ensin: se on ilmainen, nopea ja
// deterministinen. LLM kutsutaan vain, kun
//   - sääntöparseri ei tunnistanut vaatetyyppiä (esim. taivutettu "sadetakin"), tai
//   - teksti ei ole suomea (ruotsi, englanti, tanska, norja), jolloin säännöt
//     jäisivät ilman ikää, hintaa, sukupuolta ja brändikieltoja.
// Jos LLM ei ole käytössä, päiväraja täyttyy tai kutsu epäonnistuu, haku jatkuu
// täsmälleen kuten ennen (sääntötulos). Haku ei koskaan kaadu LLM:n takia.
// ---------------------------------------------------------------------------

export interface LlmClient {
  // Palauttaa työkalukutsun raa'an syötteen; validointi tehdään täällä.
  extract(text: string): Promise<unknown>;
}

export type LlmStatus = "used" | "cached" | "disabled" | "rate_limited" | "error" | "too_long";

// Kerrotaan vastauksessa (api/search.ts), jotta UI ja debuggaus näkevät miten haku tulkittiin.
export interface Interpretation {
  method: "rules" | "llm";
  language: LlmLanguage | DetectedLanguage;
  confidence?: "high" | "low";
  llm_status?: LlmStatus;
}

export interface InterpretDeps {
  enabled: boolean;
  // Luodaan vasta kun tarvitaan (SDK vaatii API-avaimen).
  getClient: () => LlmClient;
  // Tuotannossa aina annettu: tarjoaa välimuistin ja päivärajan (kustannussuoja).
  kv?: IKeyValueStore;
  dailyLimit: number;
  cacheTtlSeconds: number;
  log?: (message: string, err?: unknown) => void;
}

// Pidempi teksti ei ole hakulause; ei kuluteta siihen LLM-kutsua.
export const MAX_LLM_INPUT_CHARS = 300;

// Nosta versiota, kun prompti tai skeema muuttuu, jotta vanhat välimuistiin
// tallennetut tulkinnat eivät jää voimaan.
const CACHE_VERSION = "v1";
const RATE_LIMIT_PREFIX = "nlu-llm";

function cacheKey(text: string): string {
  return `nlu:llm:${CACHE_VERSION}:${text.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function defaultCurrency(language: LlmLanguage | DetectedLanguage): Currency {
  if (language === "sv") return "SEK";
  if (language === "da") return "DKK";
  if (language === "no") return "NOK";
  return "EUR";
}

// Ikä -> AGE_TO_CM-indeksi: alle vuoden = 0, muuten pyöristys, enintään 17.
function ageIndex(age: number): number {
  return age < 1 ? 0 : Math.min(17, Math.round(age));
}

// Muuntaa validoidun LLM-tuloksen samaan SearchCriteria-muotoon, jonka
// sääntöparseri tuottaa. Ikä muunnetaan senteiksi koodissa (AGE_TO_CM),
// ei LLM:ssä. Suoraan sanottu senttikoko voittaa iän.
export function criteriaFromLlm(ex: LlmExtraction, language: LlmLanguage | DetectedLanguage): SearchCriteria {
  const c: SearchCriteria = {};
  if (ex.garment_type) c.garment_type = ex.garment_type;

  if (ex.size_cm !== undefined) {
    c.size_cm = ex.size_cm;
    c.size_raw = String(ex.size_cm);
  } else if (ex.age_years !== undefined) {
    const cm = AGE_TO_CM[ageIndex(ex.age_years)];
    c.size_cm = cm;
    c.size_raw = String(cm);
  }
  // Sääntöparseri asettaa iän vain >= 1 vuotiaille; sama täällä.
  if (ex.age_years !== undefined && ageIndex(ex.age_years) >= 1) c.age = ageIndex(ex.age_years);

  if (ex.for_child) c.child_signal = true;
  if (ex.gender) c.child_gender_pref = ex.gender;
  if (ex.max_price !== undefined) {
    c.max_price = { amount: ex.max_price, currency: ex.currency ?? defaultCurrency(language) };
  }
  if (ex.brand_deny?.length) c.brand_deny = ex.brand_deny;
  if (ex.brand_allow?.length) c.brand_allow = ex.brand_allow;
  if (ex.waterproof) c.waterproof = true;
  if (ex.winter) c.season = "winter";
  if (ex.color) c.color = ex.color;
  return c;
}

// Yhdistää kaksi tulkintaa. "prefer" kertoo kumpi voittaa ristiriidassa:
// suomenkielisessä tekstissä sääntöparseri (deterministinen), muilla kielillä
// LLM (säännöt eivät ymmärrä kieltä). Toisen puuttuvat kentät täytetään.
// Koko (size_cm/size_raw/age) kulkee aina yhtenä ryhmänä samasta lähteestä,
// ettei ikä ja koko tule eri tulkinnoista. Brändikiellot yhdistetään.
export function mergeCriteria(rules: SearchCriteria, llm: SearchCriteria, prefer: "rules" | "llm"): SearchCriteria {
  const [primary, secondary] = prefer === "rules" ? [rules, llm] : [llm, rules];
  const merged: SearchCriteria = { ...secondary, ...primary };

  delete merged.size_cm;
  delete merged.size_raw;
  delete merged.age;
  const sizeSource = primary.size_cm !== undefined ? primary : secondary;
  if (sizeSource.size_cm !== undefined) merged.size_cm = sizeSource.size_cm;
  if (sizeSource.size_raw !== undefined) merged.size_raw = sizeSource.size_raw;
  if (sizeSource.age !== undefined) merged.age = sizeSource.age;

  const deny = [...(rules.brand_deny ?? []), ...(llm.brand_deny ?? [])];
  if (deny.length) merged.brand_deny = [...new Set(deny)];
  return merged;
}

async function readCache(kv: IKeyValueStore | undefined, key: string): Promise<LlmExtraction | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    // Validoidaan välimuistista luettu data samoin kuin tuore tulos.
    return raw ? sanitizeLlmExtraction(JSON.parse(raw)) : null;
  } catch {
    return null; // välimuistivirhe ei estä hakua
  }
}

export async function interpretWithLlmFallback(
  text: string,
  rules: SearchCriteria,
  deps: InterpretDeps
): Promise<{ criteria: SearchCriteria; interpretation: Interpretation }> {
  const detected = detectLanguage(text);
  const needsLlm = !rules.garment_type || detected !== "fi";
  if (!needsLlm) {
    return { criteria: rules, interpretation: { method: "rules", language: detected } };
  }

  const rulesOnly = (llm_status: LlmStatus) => ({
    criteria: rules,
    interpretation: { method: "rules" as const, language: detected, llm_status },
  });

  if (!deps.enabled) return rulesOnly("disabled");
  const input = text.trim();
  if (input.length === 0 || input.length > MAX_LLM_INPUT_CHARS) return rulesOnly("too_long");

  const key = cacheKey(input);
  let extraction = await readCache(deps.kv, key);
  let status: LlmStatus = "cached";

  if (!extraction) {
    status = "used";
    try {
      if (deps.kv) {
        const limit = await checkAndIncrementDailyLimit(deps.kv, deps.dailyLimit, RATE_LIMIT_PREFIX);
        if (!limit.allowed) return rulesOnly("rate_limited");
      }
      extraction = sanitizeLlmExtraction(await deps.getClient().extract(input));
      if (deps.kv) {
        try { await deps.kv.set(key, JSON.stringify(extraction), deps.cacheTtlSeconds); } catch { /* ei kriittinen */ }
      }
    } catch (err) {
      deps.log?.("LLM-tulkinta epäonnistui, jatketaan sääntötulkinnalla", err);
      return rulesOnly("error");
    }
  }

  const language: LlmLanguage | DetectedLanguage =
    extraction.language && extraction.language !== "other" ? extraction.language : detected;
  const llmCriteria = criteriaFromLlm(extraction, language);
  const criteria = mergeCriteria(rules, llmCriteria, language === "fi" ? "rules" : "llm");

  return {
    criteria,
    interpretation: { method: "llm", language, confidence: extraction.confidence, llm_status: status },
  };
}
