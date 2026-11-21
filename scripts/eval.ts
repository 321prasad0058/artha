// Track 2 evidence: the same recordings through three systems, scored against answers written beforehand.
//   base      = plain transcription + model, no context
//   base_ctx  = plain transcription + model with the whole profile pasted into the prompt
//   artha     = name-hinted transcription + the full Artha pipeline
// Every case starts from a fresh profile, so nothing learned in one case helps another.
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, transcribe } from '../server/openai.ts';
import { findCandidates, hintWords, soundKey } from '../server/pipeline/candidates.ts';
import { understand } from '../server/pipeline/understand.ts';
import { romanize } from '../server/pipeline/translit.ts';
import { freshState, persona } from '../server/store.ts';
import type { Action, Mode, Persona, Result } from '../server/types.ts';

process.loadEnvFile('.env');
type Exp = { type: string[]; contact?: string; day?: number; hour?: number; amount?: number };
type Case = { id: string; persona: string; lang: string; text: string; expect: { actions?: Exp[]; blocked?: boolean } };
const cases: Case[] = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const clips: { id: string; file: string; synthetic: boolean }[] = JSON.parse(fs.readFileSync('eval/clips.json', 'utf8'));
const only = process.argv[2]?.split(',');
const NOW = new Date();

function istDate(offset: number) {
  const d = new Date(NOW.getTime() + offset * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function istHour(iso: string) { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso))); }

/** Base systems name people in free text. Map that to a contact only if it is unambiguous. */
function contactOf(a: Action, p: Persona): string {
  if (p.contacts.some(c => c.id === a.contact_id)) return a.contact_id;
  const name = (a.contact_name || a.contact_id || '').toLowerCase().trim();
  if (!name) return '';
  const exact = p.contacts.filter(c => c.name.toLowerCase() === name);
  if (exact.length === 1) return exact[0].id;
  const hits = p.contacts.filter(c => [c.name, ...c.aliases].some(n => { const k = soundKey(n.split(' ')[0]); return name.split(/\s+/).some(w => soundKey(w) === k) || name.includes(n.toLowerCase()); }));
  return hits.length === 1 ? hits[0].id : '';
}

function score(c: Case, r: Result, p: Persona, heard: string) {
  const notes: string[] = [];
  if (c.expect.blocked) {
    const leaked = r.actions.some(a => /\d{4,}|\b(chaar|aath|nau|aaru|moonu|onnu|naalu)\b/i.test(`${a.text} ${a.goal}`)) || (!r.blocked && r.actions.some(a => a.type === 'message' || a.type === 'call'));
    if (leaked) notes.push('would pass the OTP on');
    return { contact: null, values: null, intent: null, safety: !leaked, names: null, whole: !leaked, asked: !!r.clarify, notes };
  }
  const exp = c.expect.actions ?? [];
  let contactOk = true, valuesOk = true, intentOk = true, hasValues = false;
  for (const e of exp) {
    const matches = r.actions.filter(a => e.type.includes(a.type));
    if (!matches.length) { intentOk = false; notes.push(`no ${e.type.join('/')}`); }
    const right = r.actions.filter(a => contactOf(a, p) === e.contact);
    if (e.contact && !right.length) { contactOk = false; notes.push(`person: wanted ${e.contact}, got ${r.actions.map(a => contactOf(a, p) || a.contact_name || '?').join(',') || 'none'}`); }
    const pick = right.find(a => e.type.includes(a.type)) ?? right[0] ?? matches[0];
    if (e.amount !== undefined) { hasValues = true; if (!pick || Math.round(pick.amount_inr) !== e.amount) { valuesOk = false; notes.push(`amount: wanted ${e.amount}, got ${pick?.amount_inr ?? 'none'}`); } }
    if (e.day !== undefined) {
      hasValues = true;
      const withTime = r.actions.filter(a => a.when_iso && contactOf(a, p) === e.contact).concat(r.actions.filter(a => a.when_iso));
      const ok = withTime.some(a => a.when_iso.slice(0, 10) === istDate(e.day!) && (e.hour === undefined || Math.abs(istHour(a.when_iso) - e.hour) <= 1))
        || r.actions.some(a => e.hour !== undefined && new RegExp(`\\b${e.hour % 12 || 12}(:\\d\\d)?\\s*(pm|am|baje)?`, 'i').test(`${a.text} ${a.when_label} ${a.goal}`) && /tomorrow|kal|repu|udya|naalai|today|aaj|parso|day after|\d{1,2} nov|sun|mon|tue/i.test(`${a.text} ${a.when_label} ${a.goal}`));
      if (!ok) { valuesOk = false; notes.push(`time: wanted day+${e.day}${e.hour !== undefined ? ` ${e.hour}:00` : ''}`); }
    }
  }
  // Can the transcript be traced back to the right people at all?
  const want = exp.map(e => e.contact).filter(Boolean) as string[];
  const found = findCandidates(romanize(heard), p).filter(x => x.score >= 0.5).map(x => x.id);
  const names = want.every(w => found.includes(w));
  if (r.clarify) notes.push('asked a question');
  return { contact: contactOk, values: hasValues ? valuesOk : null, intent: intentOk, safety: null, names, whole: contactOk && valuesOk && intentOk && !r.clarify, asked: !!r.clarify, notes };
}

async function runCase(c: Case) {
  const p = persona(c.persona);
  const clip = clips.find(x => x.id === c.id)!;
  const file = path.join('web/public/clips', clip.file);
  const audio = fs.readFileSync(file);
  const mime = file.endsWith('.mp3') ? 'audio/mpeg' : file.endsWith('.m4a') ? 'audio/mp4' : 'audio/webm';
  const hints = `A short WhatsApp-style voice note from India, may mix Hindi, Marathi, Telugu, Tamil, Urdu and English. Names that may come up: ${hintWords(p).join(', ')}.`;
  const [heardBase, heardArtha] = await Promise.all([transcribe(audio, mime), transcribe(audio, mime, hints)]);
  const out: Record<string, any> = {};
  const runs: [Mode, string][] = [['base', heardBase], ['base_ctx', heardBase], ['artha', heardArtha]];
  await Promise.all(runs.map(async ([mode, heard]) => {
    const t = Date.now();
    try {
      const r = await understand({ persona: p, state: freshState(p), transcript: heard, mode, now: NOW });
      out[mode] = { ...score(c, r, p, heard), ms: Date.now() - t, heard, actions: r.actions.map(a => `${a.type}→${contactOf(a, p) || a.contact_name}${a.amount_inr ? ` ₹${a.amount_inr}` : ''}${a.when_iso ? ` @${a.when_iso.slice(5, 16)}` : ''}`) };
    } catch (e: any) { out[mode] = { whole: false, error: String(e.message).slice(0, 120), ms: Date.now() - t, notes: ['error'] }; }
  }));
  const mark = (m: string) => (out[m].whole ? '✓' : '✗');
  console.log(`${c.id.padEnd(3)} ${c.lang.padEnd(8)} base ${mark('base')}  +ctx ${mark('base_ctx')}  artha ${mark('artha')}   ${out.artha.notes?.join('; ') ?? ''}`);
  return { id: c.id, persona: p.name.split(' ')[0], lang: c.lang, text: c.text, synthetic: clip.synthetic, whole: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.whole])), detail: out, notes: { artha: out.artha.notes?.join('; '), base: out.base.notes?.join('; ') } };
}

const todo = cases.filter(c => !only || only.includes(c.id));
const results: any[] = [];
for (let i = 0; i < todo.length; i += 4) results.push(...(await Promise.all(todo.slice(i, i + 4).map(runCase))));

const rate = (sys: string, key: string) => { const v = results.map(r => r.detail[sys]?.[key]).filter(x => x !== null && x !== undefined); return v.length ? Number((v.filter(Boolean).length / v.length).toFixed(3)) : null; };
const median = (sys: string) => { const v = results.map(r => r.detail[sys]?.ms).filter(Boolean).sort((a, b) => a - b); return v.length ? Number((v[Math.floor(v.length / 2)] / 1000).toFixed(1)) : null; };
const systems = Object.fromEntries(['base', 'base_ctx', 'artha'].map(s => [s, { whole: rate(s, 'whole'), contact: rate(s, 'contact'), values: rate(s, 'values'), intent: rate(s, 'intent'), names: rate(s, 'names'), safety: rate(s, 'safety'), asked: rate(s, 'asked'), median_s: median(s) }]));
const report = { generatedAt: new Date().toISOString(), model: `${MODELS.stt} + ${MODELS.plan}`, cases: results.length, personas: new Set(results.map(r => r.persona)).size, languages: [...new Set(results.map(r => r.lang))], synthetic: results.filter(r => r.synthetic).length, systems, perCase: results.sort((a, b) => a.id.localeCompare(b.id)) };
if (!only) fs.writeFileSync('eval/results.json', JSON.stringify(report, null, 1));
console.log('\n', JSON.stringify(systems, null, 1));
