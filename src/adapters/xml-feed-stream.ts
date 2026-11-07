import { Readable, pipeline } from "stream";
import { createGunzip } from "zlib";
import { StringDecoder } from "string_decoder";

// ---------------------------------------------------------------------------
// Virtaava lukija RSS/Google Shopping -tyyppisille XML-syötteille (Adtraction).
// Syöte voi olla kymmeniä megatavuja (Metsola ~44 MB), joten sitä ei jäsennetä
// DOM-puuksi: teksti puretaan palasina ja jokainen <item>...</item> käsitellään
// heti omana kokonaisuutenaan. Syöte on koneellisesti tuotettua ja säännöllistä,
// joten kentät (g:id, title, link, ...) poimitaan yksinkertaisella tagihaulla ja
// XML-entiteetit puretaan itse - ei ulkoista XML-riippuvuutta.
//
// Gzip tunnistetaan taikanumerosta (1f 8b), kuten feed-stream.ts:ssä.
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlText(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim();
  return raw
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
}

// Yhden <item>-lohkon sisältö -> { kentän nimi ilman "g:"-etuliitettä: teksti }.
// Jos sama kenttä esiintyy useammin, ensimmäinen voittaa.
export function parseXmlItem(inner: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const name = m[1].replace(/^g:/, "");
    if (!(name in out)) out[name] = decodeXmlText(m[2]);
  }
  return out;
}

export async function* readXmlItems(body: AsyncIterable<Uint8Array>): AsyncGenerator<Record<string, string>> {
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
  let chunks: AsyncIterable<Buffer | string>;
  if (isGzip) {
    const gunzip = createGunzip();
    (pipeline as any)(source, gunzip, () => {});
    chunks = gunzip;
  } else {
    chunks = source;
  }

  const decoder = new StringDecoder("utf8");
  let buffer = "";
  const OPEN = "<item>";
  const CLOSE = "</item>";
  for await (const chunk of chunks) {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    for (;;) {
      const start = buffer.indexOf(OPEN);
      if (start < 0) {
        // Ei vielä alkua: säilytetään vain mahdollinen alkava tagi puskurin lopussa.
        if (buffer.length > OPEN.length) buffer = buffer.slice(-OPEN.length);
        break;
      }
      const end = buffer.indexOf(CLOSE, start);
      if (end < 0) {
        if (start > 0) buffer = buffer.slice(start);
        break;
      }
      yield parseXmlItem(buffer.slice(start + OPEN.length, end));
      buffer = buffer.slice(end + CLOSE.length);
    }
  }
}
