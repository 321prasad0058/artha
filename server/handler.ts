// All API routes, shared by the local server and AWS Lambda.
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, speech, transcribe } from './openai.js';
import { hintWords } from './pipeline/candidates.js';
import { understand } from './pipeline/understand.js';
import { freshState, loadState, persona, personas, saveState } from './store.js';
import type { Action, Mode } from './types.js';

export type Req = { method: string; path: string; query: URLSearchParams; headers: Record<string, string | undefined>; body: Buffer };
export type Res = { status: number; headers?: Record<string, string>; body: string | Buffer };
const voiceCache = new Map<string, Buffer>();

const json = (status: number, data: unknown): Res => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const parse = (b: Buffer) => (b.length ? JSON.parse(b.toString('utf8')) : {});
const nowIso = () => new Date().toISOString();

export async function handle(req: Req): Promise<Res> {
  try {
    const { method, path: p, query } = req;

    if (p === '/api/health') return json(200, { ok: true, models: MODELS });

    if (p === '/api/personas' && method === 'GET') {
      return json(200, personas().map(x => ({ id: x.id, name: x.name, age: x.age, about: x.about, city: x.city, speaks: x.speaks, avatar: x.avatar, contacts: x.contacts })));
    }

    if (p === '/api/state' && method === 'GET') return json(200, await loadState(query.get('p') ?? ''));

    // Stage 1: Hear. Artha passes name hints; the base model gets none.
    if (p === '/api/transcribe' && method === 'POST') {
      const who = persona(query.get('p') ?? '');
      const mode = (query.get('mode') ?? 'artha') as Mode;
      const hints = mode === 'artha' ? `A short WhatsApp-style voice note from India, may mix Hindi, Marathi, Telugu, Tamil, Urdu and English. Names that may come up: ${hintWords(who).join(', ')}.` : undefined;
      const t = Date.now();
      const text = await transcribe(req.body, req.headers['content-type'] ?? 'audio/webm', hints);
      return json(200, { text, ms: Date.now() - t, hints: mode === 'artha' ? hintWords(who) : [] });
    }

    // Stages 2–5: Meaning, Who, Plan, Rules
    if (p === '/api/understand' && method === 'POST') {
      const b = parse(req.body);
      const who = persona(b.p);
      const state = await loadState(who.id);
      const result = await understand({ persona: who, state, transcript: String(b.transcript ?? '').slice(0, 1200), mode: (b.mode ?? 'artha') as Mode, forced: b.forced ?? {} });
      if (result.mode === 'artha') {
        state.notes += 1;
        // Remember this turn of the conversation (a re-plan after "which one?" replaces the previous turn).
        const turnId = `t${state.notes}`;
        result.actions.forEach((a, i) => (a.id = `${turnId}:${i + 1}`));
        const turn = {
          id: turnId, at: nowIso(), said: String(b.transcript ?? '').slice(0, 300),
          people: result.mentions.filter(m => m.kind === 'person' && m.candidates.length).map(m => { const c = [...m.candidates].sort((x, y) => y.score - x.score)[0]; return { mention: m.text, id: c.id, name: c.name }; }),
          actions: [
            ...result.actions.map(a => ({ id: a.id!, type: a.type, contact_id: a.contact_id, contact_name: a.contact_name, title: a.title, text: a.text, when_iso: a.when_iso, when_label: a.when_label, amount_inr: a.amount_inr, status: 'proposed' as 'proposed' | 'done' | 'skipped' })),
            ...(result.refs ?? []).map((r, i) => ({ id: `${turnId}:ref${i + 1}`, type: r.type, contact_id: r.contact_id, contact_name: who.contacts.find(c => c.id === r.contact_id)?.name ?? '', title: `${r.title} (already in calendar)`, text: '', when_iso: r.when_iso, when_label: '', amount_inr: 0, status: 'done' as const })),
          ],
          reply: result.reply,
        };
        state.turns = [...(state.turns ?? []).filter(t => !(b.forced && Object.keys(b.forced).length && t.said === turn.said)), turn].slice(-12);
        // Stage 6: Learn
        for (const f of result.learn) if (!state.memory.some(m => m.fact.toLowerCase() === f.toLowerCase())) state.memory.push({ fact: f, src: 'from a voice note', at: nowIso(), learned: true });
        await saveState(state);
      }
      return json(200, { result, state });
    }

    // The user answered "which one?": remember it.
    if (p === '/api/answer' && method === 'POST') {
      const b = parse(req.body);
      const who = persona(b.p);
      const c = who.contacts.find(x => x.id === b.contactId);
      if (!c) return json(400, { error: 'Unknown contact' });
      const state = await loadState(who.id);
      const topic = typeof b.topic === 'string' && b.topic ? b.topic : undefined;
      const fact = `“${b.mention}”${topic ? ` (${topic.replace('_', ' ')})` : ''} means ${c.name}, ${c.rel.toLowerCase()}`;
      // a newer correction for the same words replaces the old one
      state.memory = state.memory.filter(m => !(m.kind === 'alias' && m.mention?.toLowerCase() === String(b.mention).toLowerCase() && m.topic === topic));
      state.memory.push({ fact, src: b.how === 'changed' ? 'you changed it once' : 'you told Artha', at: nowIso(), learned: true, kind: 'alias', about: c.id, mention: String(b.mention), topic });
      await saveState(state);
      return json(200, { state });
    }

    // Carry out an action (inside the app; nothing leaves it).
    if (p === '/api/act' && method === 'POST') {
      const b = parse(req.body);
      const who = persona(b.p);
      const a = b.action as Action;
      const state = await loadState(who.id);
      const c = who.contacts.find(x => x.id === a.contact_id);
      const markDone = () => { for (const t of state.turns ?? []) for (const x of t.actions) if (x.id === a.id) x.status = 'done'; };
      let done = '';
      if (a.type === 'message' && c) { (state.threads[c.id] ??= []).push({ me: true, text: a.text, at: nowIso(), via: `Artha · ${a.language}` }); done = `Sent to ${c.name}`; }
      else if (a.type === 'call' && c) { state.calls.push({ contact: c.id, goal: a.goal, at: nowIso(), status: 'queued' }); (state.threads[c.id] ??= []).push({ me: true, text: `Artha is calling: ${a.goal}`, at: nowIso(), via: 'Artha call' }); done = `Artha will call ${c.name}`; }
      else if (a.type === 'calendar') { state.calendar.push({ title: a.title, when_iso: a.when_iso, when_label: a.when_label, contact: c?.id, added: true }); done = 'Added to calendar'; }
      else if (a.type === 'reminder') { state.reminders.push({ title: a.title, when_label: a.when_label, when_iso: a.when_iso }); done = 'Reminder set'; }
      else if (a.type === 'ledger' && c) { state.ledger.push({ contact: c.id, amount: a.amount_inr, note: a.title || a.text || 'Credit', at: nowIso() }); done = `₹${a.amount_inr.toLocaleString('en-IN')} added to ${c.name}'s account`; }
      else if (a.type === 'payment' && c) {
        if (!b.confirmed) return json(400, { error: 'Payments need confirmation' });
        state.payments.push({ contact: c.id, amount: a.amount_inr, upi: c.upi ?? '', at: nowIso() });
        (state.threads[c.id] ??= []).push({ me: true, text: `Paid ₹${a.amount_inr.toLocaleString('en-IN')} by UPI (demo, no real money)`, at: nowIso(), via: 'UPI' });
        done = `Paid ₹${a.amount_inr.toLocaleString('en-IN')} (demo)`;
      } else if (a.type === 'suggestion') {
        if (/scam/i.test(a.title)) state.memory.push({ fact: `${c?.name ?? 'That caller'} is a likely scam; Artha answers their calls`, src: 'you marked it', at: nowIso(), learned: true });
        done = 'Done';
      } else return json(400, { error: 'Cannot do this action' });
      markDone();
      await saveState(state);
      return json(200, { done, state });
    }

    // Artha talks back: the reply in the user's language, native pronunciation, brisk pace.
    if (p === '/api/speak' && method === 'POST') {
      const b = parse(req.body);
      const who = persona(b.p);
      const text = String(b.text ?? '').slice(0, 400);
      if (!text) return json(400, { error: 'Nothing to say' });
      const key = `${who.id}:${text}`;
      let audio = voiceCache.get(key);
      if (!audio) {
        const lang = /[\u0C00-\u0C7F]/.test(text) ? 'Telugu' : /[\u0B80-\u0BFF]/.test(text) ? 'Tamil' : /[\u0900-\u097F]/.test(text) ? (who.speaks[0] === 'Marathi' ? 'Marathi' : 'Hindi') : 'Indian English';
        audio = await speech(text, 'coral', `You are Artha, a warm, capable assistant replying to ${who.name.split(' ')[0]} with a quick voice note in ${lang}. Use native ${lang} pronunciation for every word and name. Speak briskly and naturally, like a friend on the phone: no newsreader tone, no long pauses.`);
        if (voiceCache.size > 200) voiceCache.clear();
        voiceCache.set(key, audio);
      }
      return { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'max-age=86400' }, body: audio };
    }

    if (p === '/api/skip' && method === 'POST') {
      const b = parse(req.body);
      const state = await loadState(persona(b.p).id);
      for (const t of state.turns ?? []) for (const x of t.actions) if (x.id === b.id) x.status = 'skipped';
      await saveState(state);
      return json(200, { ok: true });
    }

    if (p === '/api/reset' && method === 'POST') {
      const b = parse(req.body);
      const s = freshState(persona(b.p));
      await saveState(s);
      return json(200, { state: s });
    }

    if (p === '/api/results' && method === 'GET') {
      const f = path.join(process.env.ARTHA_ROOT || process.cwd(), 'eval/results.json');
      return json(200, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
    }

    return json(404, { error: 'Not found' });
  } catch (e: any) {
    console.error(e);
    return json(e?.status ?? 500, { error: String(e?.message ?? e) });
  }
}
