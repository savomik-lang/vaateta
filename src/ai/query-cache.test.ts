import { test } from "node:test";
import assert from "node:assert/strict";
import { getCachedResults, setCachedResults } from "./query-cache";
import { InMemoryKeyValueStore } from "../store/kv-store";
import { RankedResults } from "../ranking/rank";

const sampleResults: RankedResults = { cheapest: [], bestValue: [], mostLoved: null };

test("palauttaa null kun mitään ei ole välimuistissa", async () => {
  const kv = new InMemoryKeyValueStore();
  assert.equal(await getCachedResults(kv, "jokin haku"), null);
});
test("tallentaa ja hakee saman kyselyn onnistuneesti", async () => {
  const kv = new InMemoryKeyValueStore();
  await setCachedResults(kv, "Talvihaalari 5v", sampleResults);
  assert.deepEqual(await getCachedResults(kv, "Talvihaalari 5v"), sampleResults);
});
test("normalisoi kyselyn samaksi avaimeksi", async () => {
  const kv = new InMemoryKeyValueStore();
  await setCachedResults(kv, "  Talvihaalari   5v  ", sampleResults);
  assert.deepEqual(await getCachedResults(kv, "talvihaalari 5v"), sampleResults);
});
