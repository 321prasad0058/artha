// Embeddings for the context space: text-embedding-3-large shortened to 256 dimensions (it matches Marathi or Hindi
// to English far better than -small: 0.52 vs 0.34 on the same pair), stored as int8 + one scale = 260 bytes a row.
// Every text is embedded once (content hash) in the background; a query costs one call and a scan of a few
// thousand rows in memory, well under a millisecond, so a separate vector database is not needed at this size.
import type { DatabaseSync } from 'node:sqlite';

const MODEL = 'text-embedding-3-large';
const DIMS = 256;

async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMS }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Embedding failed: ${j?.error?.message ?? r.status}`);
  return j.data.map((d: any) => d.embedding);
}
function quantise(v: number[]) {
  const max = Math.max(...v.map(Math.abs)) || 1;
  return { emb: new Int8Array(v.map(x => Math.round((x / max) * 127))), scale: max / 127 };
}

const running = new Set<DatabaseSync>();
/** Fill in vectors for rows that have none. Runs in the background after a save; safe to call often. */
export async function embedPending(db: DatabaseSync, batch = 96) {
  if (running.has(db) || !process.env.OPENAI_API_KEY) return 0;
  running.add(db);
  let n = 0;
  try {
    for (;;) {
      const rows = db.prepare(`SELECT hash, text FROM vec WHERE emb IS NULL LIMIT ?`).all(batch) as { hash: string; text: string }[];
      if (!rows.length) break;
      const vs = await embed(rows.map(r => r.text.slice(0, 2000)));
      const up = db.prepare(`UPDATE vec SET emb = ?, scale = ? WHERE hash = ?`);
      db.exec('BEGIN');
      rows.forEach((r, i) => { const q = quantise(vs[i]); up.run(Buffer.from(q.emb.buffer), q.scale, r.hash); });
      db.exec('COMMIT');
      n += rows.length;
      cache.delete(db);
    }
  } finally { running.delete(db); }
  return n;
}

/** The note as a vector, or null if it takes too long (retrieval then falls back to code-only). */
export async function embedQuery(text: string, timeoutMs = 1500): Promise<Float32Array | null> {
  try {
    const v = await Promise.race([embed([text.slice(0, 1500)]), new Promise<null>(r => setTimeout(() => r(null), timeoutMs))]);
    return v ? Float32Array.from(v[0]) : null;
  } catch { return null; }
}

type Row = { hash: string; kind: string; ref: string; entity_id: string | null; at: number | null; text: string; v: Float32Array };
const cache = new Map<DatabaseSync, Row[]>();
function rows(db: DatabaseSync): Row[] {
  let r = cache.get(db);
  if (!r) {
    r = (db.prepare(`SELECT hash, kind, ref, entity_id, at, text, emb, scale FROM vec WHERE emb IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)`).all(Date.now()) as any[]).map(x => {
      const q = new Int8Array(x.emb.buffer, x.emb.byteOffset, x.emb.byteLength);
      const v = new Float32Array(q.length); let n = 0;
      for (let i = 0; i < q.length; i++) { v[i] = q[i] * x.scale; n += v[i] * v[i]; }
      n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n;
      return { hash: x.hash, kind: x.kind, ref: x.ref, entity_id: x.entity_id, at: x.at, text: x.text, v };
    });
    cache.set(db, r);
  }
  return r;
}
export const invalidate = (db: DatabaseSync) => cache.delete(db);

export type Hit = { kind: string; ref: string; text: string; entity_id: string | null; at: number | null; score: number; sim: number };
/**
 * Hybrid recall: meaning (cosine) + who (the people code already thinks the note is about) + when (recent first).
 * Items already shown elsewhere in the prompt can be excluded.
 */
export function recall(db: DatabaseSync, q: Float32Array, opts: { people?: string[]; exclude?: Set<string>; k?: number; minSim?: number; now?: number } = {}): Hit[] {
  const now = opts.now ?? Date.now();
  let n = 0; for (const x of q) n += x * x; n = Math.sqrt(n) || 1;
  const people = new Set(opts.people ?? []);
  const out: Hit[] = [];
  for (const r of rows(db)) {
    if (opts.exclude?.has(r.ref)) continue;
    let sim = 0; for (let i = 0; i < r.v.length; i++) sim += r.v[i] * q[i];
    sim /= n;
    if (sim < (opts.minSim ?? 0.3)) continue;
    const age = r.at ? Math.max(0, now - r.at) / 864e5 : 30;
    const score = 0.7 * sim + (r.entity_id && people.has(r.entity_id) ? 0.15 : 0) + 0.15 * Math.exp(-age / 21);
    out.push({ kind: r.kind, ref: r.ref, text: r.text, entity_id: r.entity_id, at: r.at, score, sim });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.k ?? 6);
}
