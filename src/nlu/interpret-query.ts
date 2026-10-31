import { SearchCriteria } from "../types";
import { config } from "../config";
import { RedisKeyValueStore } from "../store/kv-store";
import { AnthropicLlmClient } from "./llm-client";
import { Interpretation, interpretWithLlmFallback } from "./llm-interpret";

// Tuotantokytkentä: lukee asetukset configista ja antaa orkestraattorille
// Redis-välimuistin ja Anthropic-asiakkaan. api/search.ts kutsuu vain tätä.
export async function interpretQuery(
  text: string,
  rules: SearchCriteria
): Promise<{ criteria: SearchCriteria; interpretation: Interpretation }> {
  return interpretWithLlmFallback(text, rules, {
    enabled: config.nlu.enabled(),
    getClient: () =>
      new AnthropicLlmClient({
        apiKey: config.ai.apiKey(),
        model: config.nlu.model,
        timeoutMs: config.nlu.timeoutMs,
      }),
    kv: new RedisKeyValueStore(),
    dailyLimit: config.nlu.dailyLimit,
    cacheTtlSeconds: config.nlu.cacheTtlSeconds,
    log: (message, err) => console.error(message, err instanceof Error ? err.message : err),
  });
}
