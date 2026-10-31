import Anthropic from "@anthropic-ai/sdk";
import { LLM_INPUT_SCHEMA, LLM_SYSTEM_PROMPT, LLM_TOOL_NAME } from "./llm-spec";
import type { LlmClient } from "./llm-interpret";

export interface AnthropicLlmClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  // Vain testeille: osoittaa paikalliseen mock-palvelimeen.
  baseURL?: string;
}

// Pakotettu työkalukutsu (tool_choice) -> vastaus on aina rakenteinen syöte,
// ei vapaata tekstiä jota pitäisi jäsentää. Lämpötila 0: sama teksti -> sama tulos.
// Ei uudelleenyrityksiä: hakua ei viivytetä, virhetilanteessa käytetään sääntötulosta.
export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicLlmClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: 0,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
    this.model = options.model;
  }

  async extract(text: string): Promise<unknown> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      temperature: 0,
      system: LLM_SYSTEM_PROMPT,
      tools: [
        {
          name: LLM_TOOL_NAME,
          description: "Record the search criteria stated in the parent's message.",
          input_schema: LLM_INPUT_SCHEMA as unknown as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: LLM_TOOL_NAME },
      messages: [{ role: "user", content: text }],
    });
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("LLM ei palauttanut työkalukutsua (tool_use puuttuu)");
    }
    return toolUse.input;
  }
}
