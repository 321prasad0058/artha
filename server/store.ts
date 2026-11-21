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
    const order = ['aditya', 'sunita', 'imran', 'meenakshi'];
    personaCache = fs.readdirSync(PERSONA_DIR).filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(PERSONA_DIR, f), 'utf8')) as Persona)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return personaCache;
}
export function persona(id: string): Persona {
  const p = personas().find(x => x.id === id);
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
    memory: p.memory.map(m => ({ fact: m.fact, src: m.src, at: '' })),
    threads,
    calendar: p.calendar.map(c => { const iso = dayIso(c.day, c.time); return { title: c.title, when_iso: iso, when_label: labelOf(iso), contact: c.contact }; }),
    reminders: [],
    ledger: p.ledger.map(l => ({ contact: l.contact, amount: l.amount, note: l.note, at: dayIso(l.day, '10:00') })),
    payments: [], calls: [], notes: 0,
  };
}

// ---- storage backends
async function s3() {
  const mod: any = await import('@aws-sdk/client-s3' as string);
  return { mod, client: new mod.S3Client({}) };
}
export async function loadState(id: string): Promise<State> {
  const p = persona(id);
  try {
    if (BUCKET) {
      const { mod, client } = await s3();
      const r = await client.send(new mod.GetObjectCommand({ Bucket: BUCKET, Key: `state/${id}.json` }));
      return JSON.parse(await r.Body.transformToString());
    }
    return JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${id}.json`), 'utf8'));
  } catch {
    return freshState(p);
  }
}
export async function saveState(s: State): Promise<void> {
  const body = JSON.stringify(s, null, 1);
  if (BUCKET) {
    const { mod, client } = await s3();
    await client.send(new mod.PutObjectCommand({ Bucket: BUCKET, Key: `state/${s.persona}.json`, Body: body, ContentType: 'application/json' }));
    return;
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, `${s.persona}.json`), body);
}
