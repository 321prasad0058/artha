// Each person's living state: memory, chats, calendar, ledger. Saved to disk locally, to S3 on AWS,
// so what Artha learns survives restarts (the "proof that data persists" for judges).
import fs from 'node:fs';
import path from 'node:path';
import { isoOf, labelOf } from './pipeline/normalize.js';
import type { Persona, State } from './types.js';

const ROOT = process.env.ARTHA_ROOT || process.cwd();
const PERSONA_DIR = path.join(ROOT, 'data/personas');
const STATE_DIR = path.join(ROOT, 'data/state');
const BUCKET = process.env.ARTHA_BUCKET;

let personaCache: Persona[] | null = null;
export function personas(): Persona[] {
  if (!personaCache) {
    const order = ['aditya', 'sunita', 'imran', 'meenakshi', 'rohan', 'fatima', 'gurpreet', 'ananya'];
    personaCache = fs.readdirSync(PERSONA_DIR).filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(PERSONA_DIR, f), 'utf8')) as Persona)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return personaCache;
}
// ---- users created by signing in with Google: their profile is built from their mail and saved like a persona
const users = new Map<string, Persona>();
const USER_DIR = path.join(ROOT, 'data/users');
export async function ensurePersona(id: string) {
  if (!id || !id.startsWith('u-') || users.has(id)) return;
  try {
    if (BUCKET) { const { mod, client } = await s3(); const r = await client.send(new mod.GetObjectCommand({ Bucket: BUCKET, Key: `users/${id}.json` })); users.set(id, JSON.parse(await r.Body.transformToString())); }
    else users.set(id, JSON.parse(fs.readFileSync(path.join(USER_DIR, `${id}.json`), 'utf8')));
  } catch { /* unknown user */ }
}
export async function saveUser(p: Persona) {
  users.set(p.id, p);
  const body = JSON.stringify(p, null, 1);
  if (BUCKET) { const { mod, client } = await s3(); await client.send(new mod.PutObjectCommand({ Bucket: BUCKET, Key: `users/${p.id}.json`, Body: body, ContentType: 'application/json' })); return; }
  fs.mkdirSync(USER_DIR, { recursive: true }); fs.writeFileSync(path.join(USER_DIR, `${p.id}.json`), body);
}

export function persona(id: string): Persona {
  const p = personas().find(x => x.id === id) ?? users.get(id);
  if (!p) throw Object.assign(new Error(`Unknown person "${id}"`), { status: 404 });
  return p;
}

function dayIso(day: number, time: string) {
  const d = new Date(Date.now() + day * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  const [h, m] = time.split(':').map(Number);
  return isoOf({ y: +p.year, m: +p.month, d: +p.day }, h, m);
}

export function freshState(p: Persona): State {
  const threads: State['threads'] = {};
  for (const c of p.contacts) threads[c.id] = [];
  for (const e of [...p.events].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))) threads[e.contact]?.push({ me: false, text: e.text, at: dayIso(e.day, e.time) });
  return {
    persona: p.id,
    memory: p.memory.map(m => ({ fact: m.fact, src: m.src, at: '', ...(m.about ? { about: m.about } : {}) })),
    threads,
    calendar: p.calendar.map(c => { const iso = dayIso(c.day, c.time); return { title: c.title, when_iso: iso, when_label: labelOf(iso), contact: c.contact }; }),
    reminders: [],
    ledger: p.ledger.map(l => ({ contact: l.contact, amount: l.amount, note: l.note, at: dayIso(l.day, '10:00') })),
    payments: [], calls: [], notes: 0,
  };
}

// ---- storage: each user's context space (SQLite file). On AWS the file is synced to S3 around each request.
import { dropSpace, file, hasState, readState, space, writeState } from './context/space.js';
import { embedPending } from './context/embed.js';

async function s3() {
  const mod: any = await import('@aws-sdk/client-s3' as string);
  return { mod, client: new mod.S3Client({}) };
}
const etags = new Map<string, string>();   // the S3 version this Lambda's local copy matches
async function pull(id: string) {
  if (!BUCKET) return;
  try {
    const { mod, client } = await s3();
    // a warm Lambda usually already holds the latest copy: check its version (fast) before downloading
    if (etags.has(id) && fs.existsSync(file(id))) {
      const h = await client.send(new mod.HeadObjectCommand({ Bucket: BUCKET, Key: `context/${id}.db` })).catch(() => null);
      if (h?.ETag && h.ETag === etags.get(id)) return;
    }
    const r = await client.send(new mod.GetObjectCommand({ Bucket: BUCKET, Key: `context/${id}.db` }));
    fs.mkdirSync(path.dirname(file(id)), { recursive: true });
    dropSpace(id);
    fs.writeFileSync(file(id), Buffer.from(await r.Body.transformToByteArray()));
    if (r.ETag) etags.set(id, r.ETag);
  } catch { /* new user */ }
}
async function push(id: string) {
  if (!BUCKET) return;
  const db = space(id); db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const { mod, client } = await s3();
  const r = await client.send(new mod.PutObjectCommand({ Bucket: BUCKET, Key: `context/${id}.db`, Body: fs.readFileSync(file(id)) }));
  if (r.ETag) etags.set(id, r.ETag);
}

export async function loadState(id: string): Promise<State> {
  const p = persona(id);
  await pull(id);
  const db = space(id);
  if (!hasState(db)) {
    // first time: build the space from what the phone is connected to (contacts, chats, calendar, khata), or
    // migrate an older JSON state file if there is one
    let s = freshState(p);
    try { s = JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${id}.json`), 'utf8')); } catch { /* none */ }
    writeState(db, s, p);
    void embedPending(db).catch(() => {});
  }
  return readState(db, p);
}
export async function saveState(s: State): Promise<void> {
  const db = space(s.persona);
  writeState(db, s, persona(s.persona));
  // new text gets its vectors with the next note's embedding call (one round trip), so saving never waits
  if (!BUCKET) void embedPending(db).catch(e => console.warn('embed', e.message));
  await push(s.persona);
}
export async function resetState(id: string): Promise<State> {
  dropSpace(id);
  const s = freshState(persona(id));
  const db = space(id);
  writeState(db, s, persona(id));
  await embedPending(db).catch(() => 0);
  await push(id);
  return readState(db, persona(id));
}
