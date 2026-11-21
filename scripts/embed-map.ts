// Builds the data for the embedding map: every stored vector in each person's context space, plus a vector for each
// person in their life (name + relationship + about, same model), projected from 256 dimensions to 3 with PCA.
//   npx tsx scripts/embed-map.ts <dir with <user>.db files> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
process.loadEnvFile('.env');

const [dir, out] = process.argv.slice(2);
const MODEL = 'text-embedding-3-large', DIMS = 256;
const personas: Record<string, any> = {};
for (const f of fs.readdirSync('data/personas')) { const p = JSON.parse(fs.readFileSync(`data/personas/${f}`, 'utf8')); personas[p.id] = p; }

async function embed(texts: string[]): Promise<Float64Array[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMS }) });
  const j: any = await r.json(); if (!r.ok) throw new Error(j.error?.message);
  return j.data.map((d: any) => unit(Float64Array.from(d.embedding)));
}
const unit = (v: Float64Array) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); };
const cos = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Top-3 principal directions by power iteration with deflation (n is small: tens of points). */
function pca3(X: Float64Array[]): number[][] {
  const n = X.length, d = X[0].length, mean = new Float64Array(d);
  for (const x of X) for (let i = 0; i < d; i++) mean[i] += x[i] / n;
  const C = X.map(x => x.map((v, i) => v - mean[i]));
  const comps: Float64Array[] = [];
  for (let k = 0; k < 3; k++) {
    let v = unit(Float64Array.from({ length: d }, (_, i) => Math.sin(i * (k + 1) * 1.7) + 0.01));
    for (let it = 0; it < 200; it++) {
      const w = new Float64Array(d);
      for (const c of C) { const s = cos(c, v); for (let i = 0; i < d; i++) w[i] += s * c[i]; }
      for (const u of comps) { const s = cos(w, u); for (let i = 0; i < d; i++) w[i] -= s * u[i]; }
      v = unit(w);
    }
    comps.push(v);
  }
  const P = C.map(c => comps.map(u => cos(c, u)));
  const r = Math.max(...P.map(p => Math.hypot(...p))) || 1;
  return P.map(p => p.map(x => +(x / r * 10).toFixed(3)));
}

const GROUPS: [RegExp, string][] = [
  [/unverified|unknown/i, 'risk'], [/mother|father|wife|husband|son|daughter|sister|brother|cousin|in-law|uncle|mama|amma|ammi|abbu|girlfriend|mummy|^ma$/i, 'family'],
  [/doctor|clinic|chemist|medical|dentist|paediatrician|heart/i, 'health'], [/customer|supplier|distributor|broker|karigar|tailor|fabric|pump|mechanic|accountant|bilty|shop helper/i, 'business'],
  [/office|colleague|teammate|hr\b|manager|principal|teacher/i, 'work'], [/friend|flatmate|carpool|college/i, 'friends'],
];
const groupOf = (rel: string) => GROUPS.find(([re]) => re.test(rel))?.[1] ?? 'services';
const first = (n: string) => n.replace(/^(Dr\.|Mr\.|Mrs\.)\s*/, '').split(/[\s']/)[0].toLowerCase();

const result: Record<string, unknown> = {};
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.db'))) {
  const id = path.basename(f, '.db'), p = personas[id];
  if (!p) continue;
  const db = new DatabaseSync(path.join(dir, f), { readOnly: true } as any);
  const ents = db.prepare(`SELECT id, name, rel, about, source, interactions FROM entity`).all() as any[];
  const aliases = db.prepare(`SELECT entity_id, phrase FROM alias`).all() as any[];
  const rows = (db.prepare(`SELECT kind, ref, entity_id, at, text, emb, scale FROM vec WHERE emb IS NOT NULL`).all() as any[]).map(r => {
    const q = new Int8Array(r.emb.buffer, r.emb.byteOffset, r.emb.byteLength);
    return { kind: r.kind, entity: r.entity_id as string | null, text: String(r.text), at: r.at, v: unit(Float64Array.from(q, x => x * r.scale)) };
  });
  // a vector for each person in this life, and for the user, from the same model
  const desc = ents.map(e => `${e.name}: ${e.rel}${e.about ? `. ${e.about}` : ''}`);
  const ev = await embed([`${p.name}, ${p.age}, ${p.city}. ${p.about}`, ...desc]);
  const userV = ev[0], entV = ev.slice(1);
  const all = [userV, ...entV, ...rows.map(r => r.v)];
  const P = pca3(all);
  const people = ents.map((e, i) => {
    const near = ents.map((o, j) => ({ id: o.id, sim: +cos(entV[i], entV[j]).toFixed(3) })).filter(x => x.id !== e.id).sort((a, b) => b.sim - a.sim).slice(0, 3);
    const mine = rows.filter(r => r.entity === e.id).length;
    return { id: e.id, name: e.name, rel: e.rel, about: e.about ?? '', group: groupOf(`${e.rel}`), source: e.source, interactions: e.interactions, memories: mine,
      called: aliases.filter(a => a.entity_id === e.id).map(a => a.phrase).slice(0, 4), toUser: +cos(entV[i], userV).toFixed(3), near, p: P[1 + i] };
  });
  const memories = rows.map((r, i) => {
    // which person is this memory closest to, by meaning (shown for memories that are not tied to one person)
    let best = { id: '', sim: -1 }; ents.forEach((e, j) => { const s = cos(r.v, entV[j]); if (s > best.sim) best = { id: e.id, sim: s }; });
    return { kind: r.kind, entity: r.entity, nearest: best.id, sim: +best.sim.toFixed(3), text: r.text.replace(/\s+/g, ' ').slice(0, 160), p: P[1 + ents.length + i] };
  });
  // same-name pairs: two people who share a name word (Ayush Sharma / Ayush Gupta, Dr. Ramesh / Auto Ramesh)
  const STOP = new Set(['dr', 'mr', 'mrs', 'ji', 'auto', 'the', 'unknown', 'caller', 'said', 'store', 'shop', 'uncle', 'aunty']);
  const words = (n: string) => new Set(n.toLowerCase().replace(/['’]s\b/g, '').split(/[^a-z\u0900-\u097f]+/).filter(w => w.length > 2 && !STOP.has(w)));
  const pairs: [string, string][] = [];
  for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) { const A = words(ents[i].name), B = words(ents[j].name); if ([...A].some(w => B.has(w))) pairs.push([ents[i].id, ents[j].id]); }
  void first;
  const twins = pairs.map(([a, b]) => {
    const ia = ents.findIndex(e => e.id === a), ib = ents.findIndex(e => e.id === b);
    return { a, b, sim: +cos(entV[ia], entV[ib]).toFixed(3) };
  });
  result[id] = { user: { id, name: p.name, age: p.age, city: p.city, about: p.about, speaks: p.speaks, p: P[0] }, people, memories, twins, vectors: rows.length };
  db.close();
  console.log(id, ents.length, 'people', rows.length, 'vectors', twins.map(t => `${t.a}~${t.b} ${t.sim}`).join(' '));
}
fs.writeFileSync(out, JSON.stringify({ model: MODEL, dims: DIMS, at: new Date().toISOString(), people: result }));
