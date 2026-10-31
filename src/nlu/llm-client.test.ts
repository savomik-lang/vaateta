import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { AnthropicLlmClient } from "./llm-client";
import { LLM_TOOL_NAME } from "./llm-spec";

// Oikea Anthropic SDK paikallista mock-palvelinta vastaan (baseURL). Näin
// testataan pyynnön muoto ja vastauksen käsittely ilman verkkoa ja avainta.

interface Captured { url?: string; headers: http.IncomingHttpHeaders; body: any }

async function withServer(
  respond: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (baseURL: string, captured: Captured[]) => Promise<void>
) {
  const captured: Captured[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      captured.push({ url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      respond(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`, captured);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const toolUseResponse = (input: unknown) => ({
  id: "msg_test", type: "message", role: "assistant", model: "test-model",
  content: [{ type: "tool_use", id: "toolu_1", name: LLM_TOOL_NAME, input }],
  stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 },
});

test("lähettää oikean pyynnön (polku, avain, pakotettu työkalu, lämpötila 0) ja palauttaa työkalun syötteen", async () => {
  await withServer(
    (_req, res) => json(res, 200, toolUseResponse({ garment_type: "takki", confidence: "high" })),
    async (baseURL, captured) => {
      const client = new AnthropicLlmClient({ apiKey: "sk-test", model: "test-model", timeoutMs: 5000, baseURL });
      const result = await client.extract("winter jacket for kids");
      assert.deepEqual(result, { garment_type: "takki", confidence: "high" });

      assert.equal(captured.length, 1);
      const req = captured[0];
      assert.equal(req.url, "/v1/messages");
      assert.equal(req.headers["x-api-key"], "sk-test");
      assert.equal(req.body.model, "test-model");
      assert.equal(req.body.temperature, 0);
      assert.equal(req.body.max_tokens, 400);
      assert.deepEqual(req.body.tool_choice, { type: "tool", name: LLM_TOOL_NAME });
      assert.equal(req.body.tools.length, 1);
      assert.equal(req.body.tools[0].name, LLM_TOOL_NAME);
      assert.deepEqual(req.body.messages, [{ role: "user", content: "winter jacket for kids" }]);
      assert.equal(typeof req.body.system, "string");
    }
  );
});

test("heittää, jos vastauksessa ei ole tool_use-lohkoa", async () => {
  await withServer(
    (_req, res) =>
      json(res, 200, { ...toolUseResponse({}), content: [{ type: "text", text: "En osaa" }], stop_reason: "end_turn" }),
    async (baseURL) => {
      const client = new AnthropicLlmClient({ apiKey: "sk-test", model: "m", timeoutMs: 5000, baseURL });
      await assert.rejects(() => client.extract("jotain"), /tool_use puuttuu/);
    }
  );
});

test("HTTP 500 heittää eikä yritä uudelleen (maxRetries 0)", async () => {
  await withServer(
    (_req, res) => json(res, 500, { type: "error", error: { type: "api_error", message: "boom" } }),
    async (baseURL, captured) => {
      const client = new AnthropicLlmClient({ apiKey: "sk-test", model: "m", timeoutMs: 5000, baseURL });
      await assert.rejects(() => client.extract("jotain"));
      assert.equal(captured.length, 1);
    }
  );
});

test("aikakatkaisu heittää nopeasti", async () => {
  await withServer(
    () => { /* ei vastausta */ },
    async (baseURL) => {
      const client = new AnthropicLlmClient({ apiKey: "sk-test", model: "m", timeoutMs: 200, baseURL });
      const started = Date.now();
      await assert.rejects(() => client.extract("jotain"));
      assert.ok(Date.now() - started < 3000);
    }
  );
});
