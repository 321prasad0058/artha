// Gmail connector: read-only. Turns the last 90 days of a person's mail into structured context Artha can use:
// who's who (senders matched to contacts, new people added), plans (appointments, flights, invites), money (bills,
// payments, who owes what) and short facts, each embedded like any other memory. Full email bodies are never stored.
//
//   connect  → Google sign-in (gmail.readonly only); the refresh token is stored encrypted (AES-256-GCM)
//   sync     → list ids (90 days, no promotions/social/spam) → headers first → triage in code → full body for the rest
//              → OTP mails dropped before anything else sees them → AI extraction, 8 mails per call → written into the space
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { jsonCall } from '../openai.js';
import { labelOf } from '../pipeline/normalize.js';
import type { BookEntry, Persona, State } from '../types.js';

const ROOT = process.env.ARTHA_ROOT || process.cwd();
const BUCKET = process.env.ARTHA_BUCKET;
export const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const G = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ---------- sign-in
export function googleConfigured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
const sign = (s: string) => crypto.createHmac('sha256', tokenKey()).update(s).digest('base64url').slice(0, 16);
export function authUrl(pid: string, redirect: string, scopes = SCOPES) {
  const state = `${pid}.${sign(pid)}`;
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirect, response_type: 'code', scope: scopes.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
export function checkState(state: string) { const [pid, sig] = state.split('.'); return sig && sig === sign(pid) ? pid : null; }
export async function exchangeCode(code: string, redirect: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirect, grant_type: 'authorization_code' }) });
  const j: any = await r.json(); if (!r.ok) throw new Error(`Google sign-in failed: ${j.error_description ?? j.error}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number };
}
async function accessToken(refresh: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refresh, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token' }) });
  const j: any = await r.json(); if (!r.ok) throw new Error(`Gmail access expired, please connect again (${j.error})`);
  return j.access_token as string;
}

// ---------- encrypted token store (S3 on AWS, a local file otherwise)
function tokenKey() {
  const k = process.env.ARTHA_TOKEN_KEY;
  if (k) return Buffer.from(k, 'base64');
  return crypto.createHash('sha256').update(`artha-local-${process.env.OPENAI_API_KEY ?? ''}`).digest();   // local development only
}
function seal(obj: unknown) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}
function open(s: string) {
  const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', tokenKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
}
type Saved = { refresh: string; email: string; at: string };
async function s3() { const mod: any = await import('@aws-sdk/client-s3' as string); return { mod, client: new mod.S3Client({}) }; }
export async function saveToken(pid: string, t: Saved) {
  const body = seal(t);
  if (BUCKET) { const { mod, client } = await s3(); await client.send(new mod.PutObjectCommand({ Bucket: BUCKET, Key: `tokens/${pid}.gmail`, Body: body })); return; }
  fs.mkdirSync(path.join(ROOT, 'data/tokens'), { recursive: true }); fs.writeFileSync(path.join(ROOT, `data/tokens/${pid}.gmail`), body);
}
export async function loadToken(pid: string): Promise<Saved | null> {
  try {
    if (BUCKET) { const { mod, client } = await s3(); const r = await client.send(new mod.GetObjectCommand({ Bucket: BUCKET, Key: `tokens/${pid}.gmail` })); return open(await r.Body.transformToString()); }
    return open(fs.readFileSync(path.join(ROOT, `data/tokens/${pid}.gmail`), 'utf8'));
  } catch { return null; }
}
export async function dropToken(pid: string) {
  if (BUCKET) { const { mod, client } = await s3(); await client.send(new mod.DeleteObjectCommand({ Bucket: BUCKET, Key: `tokens/${pid}.gmail` })).catch(() => {}); return; }
  fs.rmSync(path.join(ROOT, `data/tokens/${pid}.gmail`), { force: true });
}

// ---------- Gmail API
async function api(token: string, p: string, init?: RequestInit): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${G}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise(res => setTimeout(res, 400 * 2 ** attempt)); continue; }
    throw new Error(`Gmail ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}
export async function profile(token: string) { return api(token, '/profile') as Promise<{ emailAddress: string; historyId: string; messagesTotal: number }>; }
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const header = (m: any, name: string) => (m.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
function bodyText(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const p of part.parts ?? []) { const t = bodyText(p); if (t) return t; }
  if (part.mimeType === 'text/html' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return '';
}

// ---------- triage, in code, before any model
const OTP = /\b(otp|one[- ]time password|verification code|passcode)\b/i;
export type Mail = { id: string; from: string; fromName: string; subject: string; date: string; labels: string[]; bulk: boolean; body?: string };
export function triage(m: Mail): 'keep' | 'skip' | 'otp' {
  if (OTP.test(`${m.subject}`) || (OTP.test(m.body ?? '') && /\b\d{4,8}\b/.test(m.body ?? ''))) return 'otp';
  if (m.labels.some(l => /CATEGORY_PROMOTIONS|CATEGORY_SOCIAL|CATEGORY_FORUMS|SPAM|TRASH/.test(l))) return 'skip';
  if (m.bulk) return 'skip';
  return 'keep';
}

// ---------- extraction: 8 mails per model call, into Artha's own shapes
const KINDS = ['person', 'appointment', 'travel', 'bill', 'payment', 'order', 'work', 'invite', 'scam', 'other'] as const;
type Item = { id: string; keep: boolean; kind: typeof KINDS[number]; contact_id: string; name: string; relation: string; title: string; fact: string; when_iso: string; amount_inr: number; money: '' | 'to_pay' | 'paid' | 'to_receive' | 'received' };
const schema = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['id', 'keep', 'kind', 'contact_id', 'name', 'relation', 'title', 'fact', 'when_iso', 'amount_inr', 'money'],
  properties: { id: { type: 'string' }, keep: { type: 'boolean' }, kind: { type: 'string', enum: KINDS }, contact_id: { type: 'string' }, name: { type: 'string' }, relation: { type: 'string' },
    title: { type: 'string' }, fact: { type: 'string' }, when_iso: { type: 'string' }, amount_inr: { type: 'number' }, money: { type: 'string', enum: ['', 'to_pay', 'paid', 'to_receive', 'received'] } } } } } };
const INSTRUCTIONS = `You turn a person's emails into structured memory for Artha, their assistant. For EACH email return one item.
- keep: false for anything not useful to remember (generic notifications). Bank and UPI debit/credit alerts, bills, orders and bookings are ALWAYS keep true (kind payment, bill, order, travel or appointment). Phishing and fake KYC/"account blocked" mails: keep true, kind "scam".
- contact_id: the id from CONTACTS if the sender (or the person the mail is about) is clearly one of them, judging by name, relationship and content (a mail signed "Mummy" from the user's mother = the mother). Else "none".
- name: the sender as a person or business ("Khanna Dental Care", "Ayush Gupta"). relation: how they relate to the user, 3 to 6 words ("Dentist", "Colleague, data engineering", "Credit card bank").
- title: at most 8 words. fact: ONE sentence (at most 22 words) worth remembering, with names, dates and amounts ("Ayush Sharma owes Rohan ₹1,500 for the Goa trip; will pay on the 1st").
- when_iso: for appointments, travel, invites and events: the start as ISO 8601 with +05:30. Resolve "Sunday", "kal", "tomorrow" against the EMAIL'S OWN DATE (a Friday mail about "Sunday" means the Sunday right after it). A time with no AM/PM ("7 baje"): use the user's KNOWN PLANS for the same thing if there is one, else the usual time of day for it. Date only, no time (a festival, a due date): just YYYY-MM-DD. Bills: the due date. Else "".
- amount_inr and money: bills due → to_pay; money the user paid → paid; money someone owes the user → to_receive; money received → received. Else 0 and "".
Never copy passwords, OTPs, card or account numbers into any field.`;

export async function extract(mails: Mail[], p: Persona, now = new Date()): Promise<Item[]> {
  const contacts = p.contacts.map(c => ({ id: c.id, name: c.name, relation: c.rel, called: c.aliases }));
  const batches: Mail[][] = []; for (let i = 0; i < mails.length; i += 8) batches.push(mails.slice(i, i + 8));
  const today = now.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const plans = (p.calendar ?? []).map(c => `${c.title} at ${c.time}`).join('; ');
  const sent = (m: Mail) => new Date(Number(m.date) || Date.parse(m.date)).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const out = await pool(batches, 3, b => jsonCall<{ items: Item[] }>({ name: 'mail', instructions: INSTRUCTIONS, schema,
    input: `TODAY: ${today}\nUSER: ${p.name}, ${p.city}. ${p.about}\nKNOWN PLANS: ${plans || 'none'}\nCONTACTS: ${JSON.stringify(contacts)}\nEMAILS:\n${b.map(m => JSON.stringify({ id: m.id, from: `${m.fromName} <${m.from}>`, sent: sent(m), subject: m.subject, body: (m.body ?? '').slice(0, 1800) })).join('\n')}` }));
  return out.flatMap(o => o.items);
}

// ---------- filing into the person's state
const slug = (s: string) => `g-${crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 10)}`;
export function file(state: State, p: Persona, mails: Mail[], items: Item[]) {
  const byId = new Map(mails.map(m => [m.id, m]));
  const people = (state.people ??= []);
  const stats = { people: 0, plans: 0, money: 0, facts: 0, scams: 0, chats: 0 };
  for (const it of items) {
    const m = byId.get(it.id); if (!m || !it.keep) continue;
    const at = new Date(Number(m.date) || Date.parse(m.date) || Date.now()).toISOString();
    // who: a saved contact, a person already learned from mail, or someone new
    let cid = p.contacts.some(c => c.id === it.contact_id) ? it.contact_id : '';
    if (!cid) {
      const key = slug(m.from); let known = people.find(x => x.id === key);
      if (!known) { known = { id: key, name: it.name || m.fromName || m.from, email: m.from, rel: it.kind === 'scam' ? 'Unverified sender (likely phishing)' : it.relation || 'From email', source: 'gmail' }; people.push(known); stats.people++; }
      cid = known.id;
    }
    const src = `Gmail · ${m.subject.slice(0, 60)}`;
    if (it.fact && !state.memory.some(x => x.fact === it.fact)) { state.memory.push({ fact: it.fact, src, at, learned: true, kind: 'email', about: cid }); stats.facts++; }
    if (it.kind === 'scam') { stats.scams++; continue; }
    if (p.contacts.some(c => c.id === cid) && ['person', 'work', 'invite'].includes(it.kind)) {
      const thread = (state.threads[cid] ??= []);
      if (!thread.some(x => x.text.startsWith(`✉ ${m.subject}`))) { thread.push({ me: false, text: `✉ ${m.subject}: ${(m.body ?? '').replace(/\s+/g, ' ').slice(0, 220)}`, at, via: 'Gmail' }); stats.chats++; }
    }
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(it.when_iso);
    const when = dateOnly ? `${it.when_iso}T09:00:00+05:30` : it.when_iso && !Number.isNaN(Date.parse(it.when_iso)) ? it.when_iso : '';
    if (when && ['appointment', 'travel', 'invite', 'work', 'person'].includes(it.kind) && !state.calendar.some(c => c.when_iso === when)) {
      state.calendar.push({ title: it.title, when_iso: when, when_label: labelOf(when, !dateOnly), contact: p.contacts.some(c => c.id === cid) ? cid : undefined, added: true }); stats.plans++;
    }
    if (it.money && it.amount_inr > 0) {
      const kind = it.money as BookEntry['kind'];
      const book = (state.book ??= []);
      const id = `gmail:${m.id}`;
      if (!book.some(b => b.id === id)) {
        const day = (when || at).slice(0, 10);
        book.push({ id, turn: 'gmail', at, day, kind, party: it.name, contact_id: p.contacts.some(c => c.id === cid) ? cid : undefined, item: it.title, amount: it.amount_inr, status: kind === 'paid' || kind === 'received' ? 'saved' : 'proposed', said: src });
        stats.money++;
      }
    }
  }
  return stats;
}

// ---------- the sync, as progress events
export async function* syncEvents(state: State, p: Persona, now = new Date()): AsyncGenerator<Record<string, unknown>> {
  const saved = await loadToken(p.id);
  if (!saved) { yield { t: 'error', error: 'Gmail is not connected' }; return; }
  const token = await accessToken(saved.refresh);
  const seen = new Set(state.gmail?.seen ?? []);
  // 1. ids: last 90 days, without the noise Gmail already sorts out
  const ids: string[] = []; let page = '';
  do {
    const q = new URLSearchParams({ q: 'newer_than:90d -in:spam -in:trash -category:promotions -category:social -category:forums', maxResults: '200', ...(page ? { pageToken: page } : {}) });
    const j = await api(token, `/messages?${q}`); for (const m of j.messages ?? []) if (!seen.has(m.id)) ids.push(m.id); page = j.nextPageToken ?? '';
  } while (page && ids.length < 1000);
  yield { t: 'progress', stage: 'list', n: ids.length };
  // 2. headers first (cheap), triage, then full bodies only for what is kept
  const meta = await pool(ids, 10, id => api(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence`));
  const mails: Mail[] = meta.map(m => {
    const from = header(m, 'From'), em = /<([^>]+)>/.exec(from)?.[1] ?? from;
    return { id: m.id, from: em.trim(), fromName: from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || em, subject: header(m, 'Subject'), date: m.internalDate, labels: m.labelIds ?? [], bulk: !!header(m, 'List-Unsubscribe') || /bulk|list/i.test(header(m, 'Precedence')) };
  });
  let kept = mails.filter(m => triage(m) === 'keep');
  yield { t: 'progress', stage: 'triage', n: mails.length, kept: kept.length, skipped: mails.length - kept.length };
  const full = await pool(kept, 10, m => api(token, `/messages/${m.id}?format=full`));
  kept.forEach((m, i) => (m.body = bodyText(full[i].payload)));
  const otp = kept.filter(m => triage(m) === 'otp');
  kept = kept.filter(m => triage(m) === 'keep');                       // OTP mails are dropped here, before any model sees them
  yield { t: 'progress', stage: 'read', n: kept.length, otp: otp.length };
  // 3. extraction and filing
  const items = kept.length ? await extract(kept, p, now) : [];
  yield { t: 'progress', stage: 'understood', n: items.filter(x => x.keep).length };
  const stats = file(state, p, kept, items);
  for (const m of mails) seen.add(m.id);
  const prof = await profile(token).catch(() => null);
  state.gmail = { email: saved.email, lastSync: now.toISOString(), historyId: prof?.historyId ?? state.gmail?.historyId ?? '', seen: [...seen].slice(-3000),
    stats: { scanned: mails.length, kept: kept.length, skipped: mails.length - kept.length - otp.length, otp: otp.length, ...stats } };
  yield { t: 'done', stats: state.gmail.stats };
}

// ---------- seeding a demo mailbox (never sends: inserts straight into the mailbox)
export async function insertMock(token: string, to: string, m: { id: string; daysAgo: number; time: string; fromName: string; from: string; subject: string; body: string; category: string; bulk?: boolean }, now = new Date()) {
  const [h, mi] = m.time.split(':').map(Number);
  const d = new Date(now.getTime() - m.daysAgo * 864e5); d.setUTCHours(h - 5, mi - 30, 0, 0);   // IST time of day
  const enc = (s: string) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
  const raw = [
    `From: ${enc(m.fromName)} <${m.from}>`, `To: <${to}>`, `Subject: ${enc(m.subject)}`, `Date: ${d.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${m.id}.${d.getTime()}@artha-mock.example>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', 'X-Artha-Mock: yes',
    ...(m.bulk ? [`List-Unsubscribe: <mailto:unsubscribe@${m.from.split('@')[1]}>`] : []), '', Buffer.from(m.body, 'utf8').toString('base64'),
  ].join('\r\n');
  const labelIds = ['INBOX', 'UNREAD', `CATEGORY_${m.category.toUpperCase()}`];
  return api(token, '/messages?internalDateSource=dateHeader', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url'), labelIds }) });
}
