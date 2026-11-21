// All API routes, shared by the local server and AWS Lambda.
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, speechStream, transcribe } from './openai.js';
import { hintWords } from './pipeline/candidates.js';
import { understand } from './pipeline/understand.js';
import { deleteUser, ensurePersona, loadState, persona, personas, resetState, saveState, saveUser } from './store.js';
import crypto from 'node:crypto';
import { file, habitsOf, learnHabit, personCard, space, voicePeople, TTL_MS } from './context/space.js';
import { embedQueryAndPending } from './context/embed.js';
import { romanize } from './pipeline/translit.js';
import type { Action, BookEntry, Mode, Persona, Result, State } from './types.js';
import { scanImage } from './pipeline/scan.js';
import { SIGNUP_SCOPES, authUrl, checkState, dropToken, exchangeCode, googleConfigured, loadToken, profile, saveToken, syncEvents, userInfo } from './connectors/gmail.js';

/** The person's contacts plus everyone first heard in their voice notes, so "Anand Patil" is known next time. */
function withKnownPeople(p: Persona): Persona {
  const extra = voicePeople(space(p.id)).filter(v => !p.contacts.some(c => c.id === v.id));
  return extra.length ? { ...p, contacts: [...p.contacts, ...extra.map(v => ({ id: v.id, name: v.name, rel: v.rel, lang: p.speaks[0], aliases: [...new Set([romanize(v.name), romanize(v.name.split(' ')[0])])] }))] } : p;
}

export type Req = { method: string; path: string; query: URLSearchParams; headers: Record<string, string | undefined>; body: Buffer };
export type Res = { status: number; headers?: Record<string, string>; body: string | Buffer };
const voiceCache = new Map<string, Buffer>();

/**
 * The reply in the user's language and voice. Returns cached audio, or a live stream that starts playing
 * within a fraction of a second (the full file is cached once it has streamed, for replays).
 */
export async function speakFor(pid: string, raw: string): Promise<{ cached?: Buffer; stream?: ReadableStream<Uint8Array>; done?: (b: Buffer) => void } | { error: string }> {
  const who = persona(pid);
  const text = raw.slice(0, 600);
  if (!text) return { error: 'Nothing to say' };
  const key = `${who.id}:${text}`;
  const hit = voiceCache.get(key);
  if (hit) return { cached: hit };
  const lang = /[\u0C00-\u0C7F]/.test(text) ? 'Telugu' : /[\u0B80-\u0BFF]/.test(text) ? 'Tamil' : /[\u0A00-\u0A7F]/.test(text) ? 'Punjabi' : /[\u0980-\u09FF]/.test(text) ? 'Bengali' : /[\u0600-\u06FF]/.test(text) ? 'Urdu' : /[\u0900-\u097F]/.test(text) ? (who.speaks[0] === 'Marathi' ? 'Marathi' : 'Hindi') : 'Indian English';
  const stream = await speechStream(text, 'coral', `You are Artha, a warm, capable assistant replying to ${who.name.split(' ')[0]} with a quick voice note in ${lang}. Use native ${lang} pronunciation for every word and name. Speak briskly and naturally, like a friend on the phone: no newsreader tone, no long pauses.`);
  return { stream, done: (b: Buffer) => { if (voiceCache.size > 200) voiceCache.clear(); voiceCache.set(key, b); } };
}
async function collect(stream: ReadableStream<Uint8Array>, done: (b: Buffer) => void) {
  const parts: Uint8Array[] = [];
  for await (const c of stream as any) parts.push(c);
  const b = Buffer.concat(parts); done(b); return b;
}

const json = (status: number, data: unknown): Res => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const parse = (b: Buffer) => (b.length ? JSON.parse(b.toString('utf8')) : {});
const nowIso = () => new Date().toISOString();

/** Remember one turn (a voice note or a photo): the conversation record, khata entries, learned facts. */
function recordTurn(state: State, who: Persona, result: Result, said: string, forced?: Record<string, string>, opts: { merge?: boolean; src?: string } = {}) {
  state.notes += 1;
  // Remember this turn of the conversation (a re-plan after "which one?" replaces the previous turn).
  const turnId = `t${state.notes}`;
  result.actions.forEach((a, i) => (a.id = `${turnId}:${i + 1}`));
  const turn = {
    id: turnId, at: nowIso(), said: said.slice(0, 300),
    people: result.mentions.filter(m => m.kind === 'person' && m.candidates.length).map(m => { const c = [...m.candidates].sort((x, y) => y.score - x.score)[0]; return { mention: m.text, id: c.id, name: c.name }; }),
    actions: [
      ...result.actions.map(a => ({ id: a.id!, type: a.type, contact_id: a.contact_id, contact_name: a.contact_name, title: a.title, text: a.text, when_iso: a.when_iso, when_label: a.when_label, amount_inr: a.amount_inr, status: 'proposed' as 'proposed' | 'done' | 'skipped' })),
      ...(result.refs ?? []).map((r, i) => ({ id: `${turnId}:ref${i + 1}`, type: r.type, contact_id: r.contact_id, contact_name: who.contacts.find(c => c.id === r.contact_id)?.name ?? '', title: `${r.title} (already in calendar)`, text: '', when_iso: r.when_iso, when_label: '', amount_inr: 0, status: 'done' as const })),
    ],
    reply: result.reply,
    ...(result.reply_points?.length ? { reply_points: result.reply_points.slice(0, 6) } : {}),
  };
  // The khata book: every ledger line is written down now (not confirmed yet), so later notes can ask about it or correct it.
  const book = (state.book ??= []);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  for (const a of result.actions.filter(x => x.type === 'ledger')) {
    const kind = (a.entry_kind || (a.contact_id ? 'credit' : 'sale')) as BookEntry['kind'];
    const whenDay = a.when_iso ? new Date(a.when_iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '';
    const day = whenDay && whenDay <= today ? whenDay : today;
    const party = (a.contact_name && !['Sales', 'Purchases', 'Name not given'].includes(a.contact_name) ? a.contact_name : a.party ?? '').replace(/\s*\(?(सप्लायर|supplier|wale|wala|वाले|वाला|यांच्याकडून|kadun)\)?$/i, '').trim();
    // a correction points at its entry; a repeat of an open entry (same kind and amount, recent) is the same entry, never a copy
    let e = book.find(x => x.id === a.updates && x.status !== 'dropped')
      ?? (opts.merge === false ? undefined : book.find(x => x.status === 'proposed' && x.kind === kind && x.amount === a.amount_inr && Date.now() - Date.parse(x.at) < 3 * 3600e3 && (!x.party || !party || x.party === party)));
    if (e) { Object.assign(e, { kind, party: party || e.party, contact_id: a.contact_id || e.contact_id, item: a.item || e.item, amount: a.amount_inr, day: whenDay ? day : e.day }); a.updates = e.id; }
    else { e = { id: a.id!, turn: turnId, at: nowIso(), day, kind, party, contact_id: a.contact_id || undefined, item: a.item ?? '', amount: a.amount_inr, status: 'proposed', said: turn.said }; book.push(e); a.updates = e.id; }
  }
  state.turns = [...(state.turns ?? []).filter(t => !(forced && Object.keys(forced).length && t.said === turn.said)), turn].slice(-12);
  // Stage 6: Learn
  for (const f of result.learn) if (!state.memory.some(m => m.fact.toLowerCase() === f.toLowerCase())) state.memory.push({ fact: f, src: opts.src ?? 'from a voice note', at: nowIso(), learned: true });
}

/**
 * One note, start to finish, as a stream of events (newline-delimited JSON), each sent the moment it is ready:
 *   heard  → the words (audio notes)      gist  → "you said", structured
 *   say    → the line Artha speaks, so the voice can start while the cards are still being written
 *   result → the cards                    state → the side panel, after saving
 * Audio or typed text both come in here; the person's context space loads while the audio is being transcribed.
 */
export async function* noteEvents(req: Req): AsyncGenerator<Record<string, unknown>> {
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const isAudio = /^audio\//.test(req.headers['content-type'] ?? '');
  const b = isAudio ? {} as any : parse(req.body);
  const pid = String((isAudio ? req.query.get('p') : b.p) ?? '');
  await ensurePersona(pid);
  const mode = ((isAudio ? req.query.get('mode') : b.mode) ?? 'artha') as Mode;
  const base = persona(pid);
  const statePromise = loadState(base.id);
  const who = withKnownPeople(base);
  let transcript = String(b.transcript ?? '').slice(0, 1200);
  if (isAudio) {
    const hints = mode === 'artha' ? `A short WhatsApp-style voice note from India, may mix Hindi, Marathi, Telugu, Tamil, Urdu, Punjabi, Bengali and English. Names that may come up: ${hintWords(who).join(', ')}.` : undefined;
    transcript = (await transcribe(req.body, req.headers['content-type'] ?? 'audio/webm', hints)).slice(0, 1200);
    yield { t: 'heard', text: transcript, ms: at() };
    if (!transcript) { yield { t: 'error', error: 'Nothing was heard. Try again a little closer.', ms: at() }; return; }
  }
  const state = await statePromise;
  // events from inside understanding are queued and handed out as they happen
  const queue: Record<string, unknown>[] = [];
  let wake: (() => void) | null = null;
  const push = (e: Record<string, unknown>) => { queue.push(e); wake?.(); };
  const ctx = mode === 'artha' ? { db: space(who.id), query: embedQueryAndPending(space(who.id), transcript) } : undefined;
  let result: Awaited<ReturnType<typeof understand>> | null = null, failed: Error | null = null;
  // inline voice: the moment the spoken line is written, generate it and send the audio in this same stream
  const inlineVoice = (isAudio ? req.query.get('voice') : b.voice) === 'inline';
  // Lines play back to back as ONE audio stream (the headline first, then the answer's points). Each line's voice starts
  // generating the moment it is written; its audio is sent once the line before it has finished.
  let voiceChain: Promise<void> = Promise.resolve(), voiceStarted = false;
  const speakNow = (text: string) => {
    const ready = speakFor(base.id, text).catch(e => ({ error: String(e) }));
    voiceChain = voiceChain.then(async () => {
      try {
        const v = await ready;
        if ('error' in v) return;
        if (!voiceStarted) { voiceStarted = true; push({ t: 'audio_start', ms: at() }); }
        if (v.cached) push({ t: 'audio', b64: v.cached.toString('base64') });
        else { const parts: Buffer[] = []; for await (const c of v.stream as any) { const buf = Buffer.from(c); parts.push(buf); push({ t: 'audio', b64: buf.toString('base64') }); } v.done!(Buffer.concat(parts)); }
      } catch { /* a line that fails to speak is skipped; the text is on screen */ }
    });
  };
  const job = understand({ persona: who, state, transcript, mode, forced: b.forced ?? {}, ctx, onEvent: e => { push({ ...e, ms: at() }); if (e.t === 'say' && inlineVoice) speakNow(e.text); } })
    .then(r => { result = r; }, e => { failed = e; }).finally(() => wake?.());
  for (;;) {
    while (queue.length) yield queue.shift()!;
    if (result || failed) break;
    await new Promise<void>(r => (wake = r));
    wake = null;
  }
  await job;
  // every line has been queued by now: close the audio stream after the last one
  const voiceJob = voiceChain.then(() => { if (voiceStarted) push({ t: 'audio_end', ms: at() }); });
  while (queue.length) yield queue.shift()!;
  if (failed) { yield { t: 'error', error: (failed as Error).message, ms: at() }; return; }
  const r = result!;
  if (r.mode === 'artha') recordTurn(state, who, r, transcript, b.forced);   // gives actions their ids
  yield { t: 'result', result: r, transcript, ms: at() };
  if (r.mode === 'artha') await saveState(state);
  yield { t: 'state', state, ms: at() };
  // finish streaming the voice if it is still coming
  let voiceDone = false;
  voiceJob.finally(() => { voiceDone = true; wake?.(); });
  while (!voiceDone || queue.length) {
    while (queue.length) yield queue.shift()!;
    if (voiceDone) break;
    await new Promise<void>(res => (wake = res)); wake = null;
  }
}

/** Gmail sync as progress events; the result is saved into the person's context space at the end. */
export async function* gmailSyncEvents(req: Req): AsyncGenerator<Record<string, unknown>> {
  const b = parse(req.body);
  await ensurePersona(String(b.p ?? ''));
  const base = persona(String(b.p ?? ''));
  const state = await loadState(base.id);
  for await (const e of syncEvents(state, withKnownPeople(base))) yield e;
  await saveState(state);
  yield { t: 'state', state };
}

/** Routes that answer as a stream of newline-delimited JSON events. */
export const STREAMS: Record<string, (req: Req) => AsyncGenerator<Record<string, unknown>>> = { '/api/note': noteEvents, '/api/gmail/sync': gmailSyncEvents };

function origin(req: Req) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:8787';
  return /^(localhost|127\.0\.0\.1)/.test(host) ? `http://${host}` : `https://${host}`;
}

export async function handle(req: Req): Promise<Res> {
  try {
    const { method, path: p, query } = req;
    // users created from Gmail are loaded on demand
    { let pid = query.get('p') ?? ''; if (!pid && method === 'POST' && /json/.test(req.headers['content-type'] ?? '')) { try { pid = parse(req.body).p ?? ''; } catch { /* not json */ } } await ensurePersona(String(pid)); }

    if (p === '/api/health') return json(200, { ok: true, models: MODELS });

    if (p === '/api/personas' && method === 'GET') {
      return json(200, personas().map(x => ({ id: x.id, name: x.name, age: x.age, about: x.about, city: x.city, speaks: x.speaks, avatar: x.avatar, contacts: x.contacts })));
    }

    if (p === '/api/state' && method === 'GET') return json(200, await loadState(query.get('p') ?? ''));

    // Stage 1: Hear. Artha passes name hints; the base model gets none.
    if (p === '/api/transcribe' && method === 'POST') {
      const who = persona(query.get('p') ?? '');
      const mode = (query.get('mode') ?? 'artha') as Mode;
      const hints = mode === 'artha' ? `A short WhatsApp-style voice note from India, may mix Hindi, Marathi, Telugu, Tamil, Urdu and English. Names that may come up: ${hintWords(withKnownPeople(who)).join(', ')}.` : undefined;
      const t = Date.now();
      const text = await transcribe(req.body, req.headers['content-type'] ?? 'audio/webm', hints);
      return json(200, { text, ms: Date.now() - t, hints: mode === 'artha' ? hintWords(who) : [] });
    }

    // Stages 2–5: Meaning, Who, Plan, Rules
    if (p === '/api/understand' && method === 'POST') {
      const b = parse(req.body);
      const state = await loadState(persona(b.p).id);
      const who = withKnownPeople(persona(b.p));
      const transcript = String(b.transcript ?? '').slice(0, 1200);
      const mode = (b.mode ?? 'artha') as Mode;
      // the note's meaning as a vector starts now, in parallel with the code stages
      const ctx = mode === 'artha' ? { db: space(who.id), query: embedQueryAndPending(space(who.id), transcript) } : undefined;
      const result = await understand({ persona: who, state, transcript, mode, forced: b.forced ?? {}, ctx });
      if (result.mode === 'artha') {
        recordTurn(state, who, result, String(b.transcript ?? ''), b.forced);
        await saveState(state);
      }
      return json(200, { result, state });
    }

    // A photo: read it, check it, file it. Same memory as a voice note.
    if (p === '/api/scan' && method === 'POST') {
      const b = parse(req.body);
      const image = String(b.image ?? '');
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 8e6) return json(400, { error: 'Send a JPEG, PNG or WebP photo under 6 MB' });
      const state = await loadState(persona(b.p).id);
      const who = withKnownPeople(persona(b.p));
      const { scan, result } = await scanImage({ persona: who, state, image });
      recordTurn(state, who, result, `(photo) ${scan.title}: ${scan.lines.map(l => `${l.party || l.item} ${l.amount}`).join(', ')}`, undefined, { merge: false, src: 'from a photo' });
      await saveState(state);
      return json(200, { result, scan, state });
    }

    // The whole note at once (scripts, tests). The app uses the streamed version of this route.
    if (p === '/api/note' && method === 'POST') {
      const events: Record<string, unknown>[] = [];
      for await (const e of noteEvents(req)) events.push(e);
      return json(200, { events });
    }

    // ---- Gmail connector (read-only)
    if (p === '/api/gmail/status' && method === 'GET') {
      const pid = persona(query.get('p') ?? '').id;
      const t = googleConfigured() ? await loadToken(pid) : null;
      const s = await loadState(pid);
      return json(200, { configured: googleConfigured(), connected: !!t, email: t?.email ?? '', lastSync: s.gmail?.lastSync ?? '', stats: s.gmail?.stats ?? null });
    }
    if (p === '/api/gmail/connect' && method === 'GET') {
      if (!googleConfigured()) return json(400, { error: 'Gmail is not set up on this server yet' });
      const pid = persona(query.get('p') ?? '').id;
      return { status: 302, headers: { location: authUrl(pid, `${process.env.ARTHA_PUBLIC_URL || origin(req)}/api/gmail/callback`) }, body: '' };
    }
    // Sign up with Google: Artha builds a new user from their own mail
    if (p === '/api/auth/google' && method === 'GET') {
      if (!googleConfigured()) return json(400, { error: 'Google sign-in is not set up on this server yet' });
      return { status: 302, headers: { location: authUrl('new', `${process.env.ARTHA_PUBLIC_URL || origin(req)}/api/gmail/callback`, SIGNUP_SCOPES) }, body: '' };
    }
    if (p === '/api/persona' && method === 'GET') {
      const x = persona(query.get('p') ?? '');
      return json(200, { id: x.id, name: x.name, age: x.age, about: x.about, city: x.city, speaks: x.speaks, avatar: x.avatar, contacts: x.contacts, source: x.source ?? 'sample', email: x.email });
    }
    if (p === '/api/gmail/callback' && method === 'GET' && checkState(query.get('state') ?? '') === 'new') {
      const back = process.env.ARTHA_PUBLIC_URL || origin(req);
      if (!query.get('code')) return { status: 302, headers: { location: `${back}/?signup=failed` }, body: '' };
      const tok = await exchangeCode(query.get('code')!, `${back}/api/gmail/callback`);
      const me = await userInfo(tok.access_token);
      const id = `u-${crypto.createHmac('sha256', process.env.ARTHA_TOKEN_KEY ?? 'artha').update(me.email.toLowerCase()).digest('hex').slice(0, 14)}`;
      await ensurePersona(id);
      let isNew = false;
      try { persona(id); } catch {
        isNew = true;
        const name = me.name || me.email.split('@')[0];
        await saveUser({ id, source: 'gmail', email: me.email, name, age: 0, about: '', city: '', speaks: ['English'], avatar: name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(), contacts: [], events: [], memory: [], calendar: [], ledger: [] });
      }
      const prev = await loadToken(id);
      const refresh = tok.refresh_token ?? prev?.refresh;
      if (!refresh) return { status: 302, headers: { location: `${back}/?signup=failed` }, body: '' };
      await saveToken(id, { refresh, email: me.email, at: nowIso() });
      return { status: 302, headers: { location: `${back}/?p=${id}&gmail=connected${isNew ? '&new=1' : ''}` }, body: '' };
    }
    if (p === '/api/gmail/callback' && method === 'GET') {
      const pid = checkState(query.get('state') ?? '');
      const back = process.env.ARTHA_PUBLIC_URL || origin(req);
      if (!pid || !query.get('code')) return { status: 302, headers: { location: `${back}/?p=${pid ?? ''}&gmail=failed` }, body: '' };
      const tok = await exchangeCode(query.get('code')!, `${back}/api/gmail/callback`);
      const prev = await loadToken(pid);
      const refresh = tok.refresh_token ?? prev?.refresh;
      if (!refresh) return { status: 302, headers: { location: `${back}/?p=${pid}&gmail=failed` }, body: '' };
      const me = await profile(tok.access_token);
      await saveToken(pid, { refresh, email: me.emailAddress, at: nowIso() });
      return { status: 302, headers: { location: `${back}/?p=${pid}&gmail=connected` }, body: '' };
    }
    if (p === '/api/gmail/disconnect' && method === 'POST') {
      const pid = persona(parse(req.body).p).id;
      await dropToken(pid);
      const s = await loadState(pid);
      // forget everything that came from Gmail
      s.memory = s.memory.filter(m => !m.src.startsWith('Gmail'));
      s.calendar = s.calendar.filter(c => c.source !== 'gmail');
      s.book = (s.book ?? []).filter(b => !b.id.startsWith('gmail:'));
      for (const k of Object.keys(s.threads)) s.threads[k] = s.threads[k].filter(x => x.via !== 'Gmail');
      s.people = []; s.gmail = undefined;
      await saveState(s);
      return json(200, { state: s });
    }

    // ---- settings: your profile, forgetting, deleting
    if (p === '/api/profile' && method === 'POST') {
      const b = parse(req.body);
      const cur = persona(String(b.p ?? ''));
      if (cur.source !== 'gmail') return json(400, { error: 'Sample people cannot be edited' });
      const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
      const name = clean(b.name, 60) || cur.name;
      const next = { ...cur, name, city: clean(b.city, 60), about: clean(b.about, 240), speaks: Array.isArray(b.speaks) ? b.speaks.map((x: unknown) => clean(x, 20)).filter(Boolean).slice(0, 6) : cur.speaks,
        avatar: name.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() };
      await saveUser(next);
      return json(200, { persona: next });
    }
    if (p === '/api/me/forget' && method === 'POST') {
      const pid = persona(String(parse(req.body).p ?? '')).id;
      const prev = await loadState(pid);
      const s = await resetState(pid);
      if (prev.gmail) { s.gmail = { ...prev.gmail, seen: [], stats: {}, lastSync: '' }; await saveState(s); }   // still connected; the next sync re-reads mail
      return json(200, { state: s });
    }
    if (p === '/api/me/delete' && method === 'POST') {
      const pid = String(parse(req.body).p ?? '');
      await dropToken(pid); await deleteUser(pid);
      return json(200, { ok: true });
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
      const entry = (state.book ?? []).find(e => e.id === (a.updates || a.id));
      let done = '';
      if (a.type === 'message' && c) { (state.threads[c.id] ??= []).push({ me: true, text: a.text, at: nowIso(), via: `Artha · ${a.language}` }); done = `Sent to ${c.name}`; }
      else if (a.type === 'call' && c) { state.calls.push({ contact: c.id, goal: a.goal, at: nowIso(), status: 'queued' }); (state.threads[c.id] ??= []).push({ me: true, text: `Artha is calling: ${a.goal}`, at: nowIso(), via: 'Artha call' }); done = `Artha will call ${c.name}`; }
      else if (a.type === 'calendar') { state.calendar.push({ title: a.title, when_iso: a.when_iso, when_label: a.when_label, contact: c?.id, added: true }); done = 'Added to calendar'; }
      else if (a.type === 'reminder') { state.reminders.push({ title: a.title, when_label: a.when_label, when_iso: a.when_iso }); done = 'Reminder set'; }
      else if (a.type === 'ledger') {
        if (entry) entry.status = 'saved';
        // a customer's running credit also updates their balance
        if (c && (!a.entry_kind || a.entry_kind === 'credit' || a.entry_kind === 'to_receive')) state.ledger.push({ contact: c.id, amount: a.amount_inr, note: a.title || a.text || 'Credit', at: nowIso() });
        done = `₹${a.amount_inr.toLocaleString('en-IN')} written in your khata`;
      }
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
      // personalisation from what the user confirmed: how they reach each person, at what time, in what language
      const db = space(who.id);
      if (a.contact_id) {
        if (a.type === 'message' || a.type === 'call') learnHabit(db, a.contact_id, 'reach by', a.type);
        if (a.type === 'message' && a.language) learnHabit(db, a.contact_id, 'language', a.language);
        if (a.when_iso && ['call', 'calendar', 'reminder'].includes(a.type)) learnHabit(db, a.contact_id, 'time of day', (h => (h < 12 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night'))(Number(new Date(a.when_iso).toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }))));
      }
      if (a.type === 'reminder' && a.predicted) learnHabit(db, '', 'accepts predicted reminders', 'yes');
      await saveState(state);
      return json(200, { done, state });
    }

    // Artha talks back (whole file; the streaming path below is what the app uses).
    if (p === '/api/speak' && method === 'POST') {
      const b = parse(req.body);
      const v = await speakFor(String(b.p ?? ''), String(b.text ?? ''));
      if ('error' in v) return json(400, { error: v.error });
      const audio = v.cached ?? await collect(v.stream!, v.done!);
      return { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'max-age=86400' }, body: audio };
    }

    if (p === '/api/skip' && method === 'POST') {
      const b = parse(req.body);
      const state = await loadState(persona(b.p).id);
      for (const t of state.turns ?? []) for (const x of t.actions) if (x.id === b.id) x.status = 'skipped';
      for (const e of state.book ?? []) if (e.id === b.id || e.id === b.updates) e.status = 'dropped';
      await saveState(state);
      return json(200, { ok: true });
    }

    // The context space, for us: what Artha holds about one user, how big it is, what expires when.
    if (p === '/api/context' && method === 'GET') {
      const who = persona(query.get('p') ?? '');
      await loadState(who.id);
      const db = space(who.id);
      const count = (t: string, w = '') => (db.prepare(`SELECT COUNT(*) AS n FROM ${t} ${w}`).get() as any).n;
      const people = (db.prepare(`SELECT id FROM entity ORDER BY interactions DESC`).all() as any[]).map(r => personCard(db, r.id));
      return json(200, {
        user: who.id, ttl_days: TTL_MS / 864e5, bytes: fs.statSync(file(who.id)).size,
        counts: { people: count('entity'), aliases: count('alias'), facts: count('fact'), turns: count('turn'), actions: count('action'), events: count('event'), calendar: count('cal'), khata_entries: count('book'), habits: count('habit'), vectors: count('vec', 'WHERE emb IS NOT NULL'), vectors_pending: count('vec', 'WHERE emb IS NULL') },
        expiring_in_7_days: count('vec', `WHERE expires_at < ${Date.now() + 7 * 864e5}`),
        people, habits: habitsOf(db, ['']), book_daily: db.prepare(`SELECT * FROM v_book_daily LIMIT 14`).all(),
      });
    }

    if (p === '/api/reset' && method === 'POST') {
      const b = parse(req.body);
      return json(200, { state: await resetState(persona(b.p).id) });
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
