import { Readable, pipeline } from "stream";
import { createGunzip } from "zlib";
import { parse } from "csv-parse";

// ---------------------------------------------------------------------------
// Feedin lataus, purku ja CSV-jäsennys virtaavasti: verkko, gunzip ja
// jäsennys tapahtuvat samanaikaisesti eikä koko tiedostoa (Outnorth ~95 000
// riviä) pidetä muistissa kerralla tekstinä. Aiemmin kaikki tehtiin
// peräkkäin (lataa kaikki -> pura kaikki -> jäsennä kaikki), jolloin ajat
// summautuivat 60 s funktioajan rajaa vasten.
//
// Gzip tunnistetaan ensimmäisen palasen taikanumerosta (1f 8b): Node/undici
// voi purkaa Content-Encodingin itse, tai Awin voi palauttaa raakaa .gz:ta.
// ---------------------------------------------------------------------------

export async function* readCsvRecords(body: AsyncIterable<Uint8Array>): AsyncGenerator<Record<string, string>> {
  const it = body[Symbol.asyncIterator]();
  const first = await it.next();
  if (first.done) return;
  const head = first.value;
  const rest = (async function* () {
    yield head;
    for (;;) {
      const n = await it.next();
      if (n.done) return;
      yield n.value;
    }
  })();
  const source = Readable.from(rest, { objectMode: false });
  const isGzip = head.length > 2 && head[0] === 0x1f && head[1] === 0x8b;
  const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true });
  const stages = isGzip ? [source, createGunzip(), parser] : [source, parser];
  // pipeline välittää virheet (esim. rikkinäinen gzip) ja siivoaa streamit;
  // virhe nousee parserin async-iteraatiossa.
  (pipeline as any)(...stages, () => {});
  for await (const record of parser as AsyncIterable<Record<string, string>>) yield record;
}
