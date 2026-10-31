import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAndIncrementDailyLimit } from "./rate-limit";
import { InMemoryKeyValueStore } from "../store/kv-store";

test("sallii pyynnöt rajan alle", async () => {
  const kv = new InMemoryKeyValueStore();
  const result = await checkAndIncrementDailyLimit(kv, 5);
  assert.equal(result.allowed, true);
  assert.equal(result.currentCount, 1);
});
test("estää pyynnöt kun raja ylittyy", async () => {
  const kv = new InMemoryKeyValueStore();
  let last;
  for (let i = 0; i < 6; i++) last = await checkAndIncrementDailyLimit(kv, 5);
  assert.equal(last!.currentCount, 6);
  assert.equal(last!.allowed, false);
});
test("laskuri kasvaa jokaisella kutsulla", async () => {
  const kv = new InMemoryKeyValueStore();
  const r1 = await checkAndIncrementDailyLimit(kv, 100);
  const r2 = await checkAndIncrementDailyLimit(kv, 100);
  assert.equal(r1.currentCount, 1);
  assert.equal(r2.currentCount, 2);
});
test("eri keyPrefix-laskurit ovat erillisiä (AI-haku vs. LLM-tulkinta)", async () => {
  const kv = new InMemoryKeyValueStore();
  await checkAndIncrementDailyLimit(kv, 100);
  await checkAndIncrementDailyLimit(kv, 100);
  const nlu = await checkAndIncrementDailyLimit(kv, 100, "nlu-llm");
  assert.equal(nlu.currentCount, 1);
  const ai = await checkAndIncrementDailyLimit(kv, 100);
  assert.equal(ai.currentCount, 3);
});
test("oletusavain ei muutu (ai-search:daily-count:PVM)", async () => {
  const kv = new InMemoryKeyValueStore();
  await checkAndIncrementDailyLimit(kv, 100);
  const key = `ai-search:daily-count:${new Date().toISOString().slice(0, 10)}`;
  assert.equal(await kv.get(key), "1");
});
