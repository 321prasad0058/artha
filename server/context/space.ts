// The context space: one SQLite file per user (data/context/<user>.db), holding everything Artha knows about them,
// typed and indexed, with a 90-day TTL. One file per user means isolation by construction, a whole-user export
// or "forget me" is one file, and every question we have about a user is a SQL query.
//
// Layers
//   entity  who's who: contacts from the phone + people first heard in voice notes (Anand Patil, a supplier)
//   alias   what the user calls them ("Mehta ji", "doodhwale"), learned from corrections, with topic
//   fact    what Artha knows: profile facts, learned notes, corrections (sliding TTL: used facts stay alive)
//   turn    the conversation, one row per voice note, + action rows with status (proposed / done / skipped)
//   event   connected sources: chats, calls, UPI payments
//   cal     calendar entries and reminders
//   book    the khata book; ledger = customer credit balances; balance = what expired entries carried forward
//   habit   personalisation learned from what the user CONFIRMED (channel, time of day, language per person)
//   vec     embeddings (text-embedding-3-large @ 256 dims, int8) keyed by content hash: never embedded twice
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { BookEntry, Persona, State, Turn } from '../types.js';
import { romanize } from '../pipeline/translit.js';

/** One id per person however the name was written (आनंद पाटील = Anand Patil). */
export const personKey = (name: string) => `v-${hash(romanize(name).toLowerCase().replace(/[^a-z]/g, '').replace(/aa/g, 'a').replace(/ee/g, 'i'))}`;

export const TTL_MS = 90 * 864e5;
const ROOT = process.env.ARTHA_ROOT || process.cwd();
const DIR = process.env.ARTHA_BUCKET ? '/tmp/artha-context' : path.join(ROOT, 'data/context');
const open = new Map<string, DatabaseSync>();

export const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const ms = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);
const exp = (t: number) => (t ? t + TTL_MS : Date.now() + TTL_MS);

const SCHEMA = `
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS entity(id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'person', rel TEXT, lang TEXT, upi TEXT,
  source TEXT NOT NULL, first_seen INT, last_seen INT, interactions INT DEFAULT 0, expires_at INT);
CREATE TABLE IF NOT EXISTS alias(entity_id TEXT NOT NULL, phrase TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', source TEXT, last_used INT, expires_at INT,
  PRIMARY KEY(entity_id, phrase, topic));
CREATE TABLE IF NOT EXISTS fact(id TEXT PRIMARY KEY, text TEXT NOT NULL, kind TEXT, subject TEXT, src TEXT, at INT, learned INT, mention TEXT, topic TEXT,
  last_used INT, uses INT DEFAULT 0, expires_at INT);
CREATE TABLE IF NOT EXISTS turn(id TEXT PRIMARY KEY, at INT NOT NULL, said TEXT, people TEXT, reply TEXT, expires_at INT);
CREATE TABLE IF NOT EXISTS action(id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, type TEXT, entity_id TEXT, contact_name TEXT, title TEXT, text TEXT,
  when_iso TEXT, when_label TEXT, amount INT, status TEXT, expires_at INT);
CREATE TABLE IF NOT EXISTS event(id TEXT PRIMARY KEY, source TEXT NOT NULL, entity_id TEXT, me INT, text TEXT, via TEXT, at INT, data TEXT, expires_at INT);
CREATE TABLE IF NOT EXISTS cal(id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT, when_iso TEXT, when_label TEXT, entity_id TEXT, added INT, expires_at INT);
CREATE TABLE IF NOT EXISTS book(id TEXT PRIMARY KEY, turn TEXT, at INT, day TEXT, kind TEXT, party TEXT, entity_id TEXT, item TEXT, amount INT, status TEXT, said TEXT, expires_at INT);
CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, entity_id TEXT, amount INT, note TEXT, at INT, expires_at INT);
CREATE TABLE IF NOT EXISTS balance(party TEXT NOT NULL, kind TEXT NOT NULL, amount INT NOT NULL, updated INT, PRIMARY KEY(party, kind));
CREATE TABLE IF NOT EXISTS habit(entity_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, n INT NOT NULL DEFAULT 1, updated INT, PRIMARY KEY(entity_id, key, value));
CREATE TABLE IF NOT EXISTS vec(hash TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, entity_id TEXT, at INT, text TEXT NOT NULL, emb BLOB, scale REAL, expires_at INT);
CREATE INDEX IF NOT EXISTS ix_event_entity ON event(entity_id, at);
CREATE INDEX IF NOT EXISTS ix_turn_at ON turn(at);
CREATE INDEX IF NOT EXISTS ix_book_day ON book(day);
CREATE INDEX IF NOT EXISTS ix_vec_pending ON vec(emb) WHERE emb IS NULL;
CREATE INDEX IF NOT EXISTS ix_exp_fact ON fact(expires_at);
CREATE INDEX IF NOT EXISTS ix_exp_event ON event(expires_at);
CREATE INDEX IF NOT EXISTS ix_exp_vec ON vec(expires_at);
-- views for us: one query answers "who is this user's world"
CREATE VIEW IF NOT EXISTS v_people AS
  SELECT e.id, e.name, e.rel, e.lang, e.source, e.interactions, datetime(e.last_seen/1000,'unixepoch') AS last_seen,
    (SELECT group_concat(phrase, ', ') FROM alias a WHERE a.entity_id = e.id) AS called,
    (SELECT COALESCE(SUM(amount),0) FROM ledger l WHERE l.entity_id = e.id) AS khata_due,
    (SELECT group_concat(key || '=' || value || ' (' || n || ')', '; ') FROM habit h WHERE h.entity_id = e.id) AS habits
  FROM entity e ORDER BY e.interactions DESC, e.last_seen DESC;
CREATE VIEW IF NOT EXISTS v_book_daily AS
  SELECT day, kind, COUNT(*) AS entries, SUM(amount) AS total, SUM(status = 'saved') AS saved FROM book WHERE status != 'dropped' GROUP BY day, kind ORDER BY day DESC;
CREATE VIEW IF NOT EXISTS v_expiring AS
  SELECT 'fact' AS what, text AS item, datetime(expires_at/1000,'unixepoch') AS expires FROM fact WHERE expires_at IS NOT NULL
  UNION ALL SELECT 'turn', said, datetime(expires_at/1000,'unixepoch') FROM turn
  UNION ALL SELECT 'book', party || ' ' || kind || ' ' || amount, datetime(expires_at/1000,'unixepoch') FROM book ORDER BY expires;
`;

export function file(user: string) { return path.join(DIR, `${user}.db`); }

/** Open (or create) a user's context space. Expired rows are swept at most once an hour. */
export function space(user: string): DatabaseSync {
  let db = open.get(user);
  if (!db) {
    fs.mkdirSync(DIR, { recursive: true });
    db = new DatabaseSync(file(user));
    db.exec(SCHEMA);
    open.set(user, db);
  }
  const last = Number((db.prepare(`SELECT v FROM meta WHERE k='swept'`).get() as any)?.v ?? 0);
  if (Date.now() - last > 3600e3) sweep(db);
  return db;
}
export function dropSpace(user: string) {
  open.get(user)?.close(); open.delete(user);
  for (const f of [file(user), `${file(user)}-wal`, `${file(user)}-shm`]) fs.rmSync(f, { force: true });
}

/** TTL: delete what has expired. Khata entries are folded into a carried-forward balance first, so money is never forgotten. */
export function sweep(db: DatabaseSync, now = Date.now()) {
  db.exec('BEGIN');
  try {
    const old = db.prepare(`SELECT party, kind, SUM(amount) AS amt FROM book WHERE expires_at < ? AND status = 'saved' GROUP BY party, kind`).all(now) as any[];
    const up = db.prepare(`INSERT INTO balance(party, kind, amount, updated) VALUES(?,?,?,?) ON CONFLICT(party, kind) DO UPDATE SET amount = amount + excluded.amount, updated = excluded.updated`);
    for (const r of old) up.run(r.party || '(no name)', r.kind, r.amt, now);
    const led = db.prepare(`SELECT entity_id, SUM(amount) AS amt FROM ledger WHERE expires_at < ? GROUP BY entity_id`).all(now) as any[];
    for (const r of led) up.run(r.entity_id, 'credit', r.amt, now);
    for (const t of ['fact', 'turn', 'action', 'event', 'cal', 'book', 'ledger', 'alias', 'entity', 'vec']) db.prepare(`DELETE FROM ${t} WHERE expires_at IS NOT NULL AND expires_at < ?`).run(now);
    db.prepare(`DELETE FROM habit WHERE updated < ?`).run(now - TTL_MS);
    db.prepare(`INSERT OR REPLACE INTO meta(k, v) VALUES('swept', ?)`).run(String(now));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- State <-> space. The app works with a State object; the space is where it lives. ----------

export function hasState(db: DatabaseSync) { return !!db.prepare(`SELECT 1 FROM meta WHERE k='persona'`).get(); }

export function readState(db: DatabaseSync, p: Persona): State {
  const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
  const threads: State['threads'] = {};
  for (const c of p.contacts) threads[c.id] = [];
  for (const e of all(`SELECT * FROM event WHERE source='chat' ORDER BY at, id`)) (threads[e.entity_id] ??= []).push({ me: !!e.me, text: e.text, at: new Date(e.at).toISOString(), ...(e.via ? { via: e.via } : {}) });
  const turns: Turn[] = all(`SELECT * FROM turn ORDER BY at`).map(t => ({
    id: t.id, at: new Date(t.at).toISOString(), said: t.said, people: JSON.parse(t.people || '[]'), reply: t.reply,
    actions: all(`SELECT * FROM action WHERE turn_id = ? ORDER BY rowid`, t.id).map(a => ({ id: a.id, type: a.type, contact_id: a.entity_id ?? '', contact_name: a.contact_name ?? '', title: a.title ?? '', text: a.text ?? '', when_iso: a.when_iso ?? '', when_label: a.when_label ?? '', amount_inr: a.amount ?? 0, status: a.status })),
  }));
  const carried = all(`SELECT party, amount FROM balance WHERE kind='credit'`).map(b => ({ contact: b.party, amount: b.amount, note: 'Carried forward', at: '' }));
  return {
    persona: p.id,
    memory: all(`SELECT * FROM fact ORDER BY rowid`).map(f => ({ fact: f.text, src: f.src, at: f.at ? new Date(f.at).toISOString() : '', ...(f.learned ? { learned: true } : {}), ...(f.kind ? { kind: f.kind } : {}), ...(f.subject ? { about: f.subject } : {}), ...(f.mention ? { mention: f.mention } : {}), ...(f.topic ? { topic: f.topic } : {}), uses: f.uses, last_used: f.last_used ? new Date(f.last_used).toISOString() : undefined })),
    threads,
    calendar: all(`SELECT * FROM cal WHERE kind='calendar' ORDER BY when_iso`).map(c => ({ title: c.title, when_iso: c.when_iso, when_label: c.when_label, ...(c.entity_id ? { contact: c.entity_id } : {}), ...(c.added ? { added: true } : {}) })),
    reminders: all(`SELECT * FROM cal WHERE kind='reminder' ORDER BY when_iso`).map(c => ({ title: c.title, when_iso: c.when_iso, when_label: c.when_label })),
    ledger: [...carried, ...all(`SELECT * FROM ledger ORDER BY at`).map(l => ({ contact: l.entity_id, amount: l.amount, note: l.note, at: new Date(l.at).toISOString() }))],
    payments: all(`SELECT * FROM event WHERE source='upi' ORDER BY at`).map(e => ({ contact: e.entity_id, amount: JSON.parse(e.data).amount, upi: JSON.parse(e.data).upi, at: new Date(e.at).toISOString() })),
    calls: all(`SELECT * FROM event WHERE source='call' ORDER BY at`).map(e => ({ contact: e.entity_id, goal: e.text, at: new Date(e.at).toISOString(), status: JSON.parse(e.data).status })),
    notes: Number((db.prepare(`SELECT v FROM meta WHERE k='notes'`).get() as any)?.v ?? 0),
    turns,
    book: all(`SELECT * FROM book ORDER BY at, rowid`).map(b => ({ id: b.id, turn: b.turn, at: new Date(b.at).toISOString(), day: b.day, kind: b.kind, party: b.party, ...(b.entity_id ? { contact_id: b.entity_id } : {}), item: b.item, amount: b.amount, status: b.status, said: b.said })) as BookEntry[],
  };
}

/** Write a State into the space in one transaction. Ids are content-derived, so rows (and their embeddings) are stable. */
export function writeState(db: DatabaseSync, s: State, p: Persona) {
  const now = Date.now();
  db.exec('BEGIN');
  try {
    for (const t of ['turn', 'action', 'event', 'cal', 'book', 'ledger']) db.exec(`DELETE FROM ${t}`);
    // people: phone contacts never expire (the phone is their source); people heard in voice notes live 90 days from last mention
    const ent = db.prepare(`INSERT INTO entity(id, name, kind, rel, lang, upi, source, first_seen, last_seen, interactions, expires_at) VALUES(?,?,?,?,?,?,?,?,?,0,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, rel=COALESCE(excluded.rel, rel), lang=COALESCE(excluded.lang, lang), upi=excluded.upi`);
    for (const c of p.contacts) ent.run(c.id, c.name, /shop|store|clinic|traders|office|bank/i.test(c.name) ? 'business' : 'person', c.rel, c.lang, c.upi ?? null, 'contacts', now, null, null);
    const al = db.prepare(`INSERT INTO alias(entity_id, phrase, topic, source, last_used, expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO UPDATE SET last_used=excluded.last_used, expires_at=excluded.expires_at`);
    for (const c of p.contacts) for (const a of c.aliases) al.run(c.id, a, '', 'contacts', null, null);

    // facts are upserted, not rewritten: use counts and last-used times written by recall are kept
    const fact = db.prepare(`INSERT INTO fact(id, text, kind, subject, src, at, learned, mention, topic, last_used, uses, expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, subject=excluded.subject, src=excluded.src, mention=excluded.mention, topic=excluded.topic,
        last_used=MAX(COALESCE(fact.last_used,0), COALESCE(excluded.last_used,0)), uses=MAX(fact.uses, excluded.uses),
        expires_at=CASE WHEN excluded.expires_at IS NULL THEN NULL ELSE MAX(COALESCE(fact.expires_at,0), excluded.expires_at) END`);
    db.prepare(`DELETE FROM fact WHERE id NOT IN (SELECT value FROM json_each(?))`).run(JSON.stringify(s.memory.map(m => hash(m.fact))));
    for (const m of s.memory) {
      const at = ms(m.at), used = ms(m.last_used);
      const subject = m.about ?? p.contacts.find(c => m.fact.toLowerCase().includes(c.name.toLowerCase().split(' (')[0]))?.id ?? null;
      // profile facts (from the user's own setup) never expire; learned ones live 90 days after they were last USED
      fact.run(hash(m.fact), m.fact, m.kind ?? (m.learned ? 'note' : 'habit'), subject, m.src, at || null, m.learned ? 1 : 0, m.mention ?? null, m.topic ?? null, used || null, m.uses ?? 0, m.learned ? exp(Math.max(at, used)) : null);
      if (m.kind === 'alias' && m.about && m.mention) al.run(m.about, m.mention, m.topic ?? '', 'correction', at, exp(Math.max(at, used)));
    }
    const ev = db.prepare(`INSERT OR REPLACE INTO event(id, source, entity_id, me, text, via, at, data, expires_at) VALUES(?,?,?,?,?,?,?,?,?)`);
    for (const [cid, msgs] of Object.entries(s.threads)) msgs.forEach((m, i) => { const at = ms(m.at); ev.run(hash(`chat${cid}${m.at}${i}${m.text}`), 'chat', cid, m.me ? 1 : 0, m.text, m.via ?? null, at, null, exp(at)); });
    for (const x of s.payments) { const at = ms(x.at); ev.run(hash(`upi${x.contact}${x.at}`), 'upi', x.contact, 1, `Paid ₹${x.amount}`, 'UPI', at, JSON.stringify({ amount: x.amount, upi: x.upi }), exp(at)); }
    for (const x of s.calls) { const at = ms(x.at); ev.run(hash(`call${x.contact}${x.at}`), 'call', x.contact, 1, x.goal, 'Artha call', at, JSON.stringify({ status: x.status }), exp(at)); }
    const cal = db.prepare(`INSERT OR REPLACE INTO cal(id, kind, title, when_iso, when_label, entity_id, added, expires_at) VALUES(?,?,?,?,?,?,?,?)`);
    for (const c of s.calendar) cal.run(hash(`cal${c.title}${c.when_iso}`), 'calendar', c.title, c.when_iso, c.when_label, c.contact ?? null, c.added ? 1 : 0, exp(ms(c.when_iso)));
    for (const r of s.reminders) cal.run(hash(`rem${r.title}${r.when_iso}`), 'reminder', r.title, r.when_iso, r.when_label, null, 1, exp(ms(r.when_iso)));
    const led = db.prepare(`INSERT OR REPLACE INTO ledger(id, entity_id, amount, note, at, expires_at) VALUES(?,?,?,?,?,?)`);
    s.ledger.filter(l => l.note !== 'Carried forward').forEach((l, i) => { const at = ms(l.at); led.run(hash(`led${l.contact}${l.at}${i}`), l.contact, l.amount, l.note, at, exp(at)); });

    const turn = db.prepare(`INSERT OR REPLACE INTO turn(id, at, said, people, reply, expires_at) VALUES(?,?,?,?,?,?)`);
    const act = db.prepare(`INSERT OR REPLACE INTO action(id, turn_id, type, entity_id, contact_name, title, text, when_iso, when_label, amount, status, expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const t of s.turns ?? []) {
      const at = ms(t.at);
      turn.run(t.id, at, t.said, JSON.stringify(t.people), t.reply, exp(at));
      for (const a of t.actions) act.run(a.id, t.id, a.type, a.contact_id || null, a.contact_name, a.title, a.text, a.when_iso, a.when_label, a.amount_inr, a.status, exp(at));
    }
    const book = db.prepare(`INSERT OR REPLACE INTO book(id, turn, at, day, kind, party, entity_id, item, amount, status, said, expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const b of s.book ?? []) { const at = ms(b.at); book.run(b.id, b.turn, at, b.day, b.kind, b.party, b.contact_id ?? null, b.item, b.amount, b.status, b.said, exp(at)); }

    // people first heard in voice notes become entities too (who's who grows by itself)
    for (const b of s.book ?? []) if (b.party && !b.contact_id) {
      const id = personKey(b.party);
      ent.run(id, b.party, 'person', /supplier|सप्लायर/i.test(b.said) ? 'Supplier (from a voice note)' : 'Mentioned in your khata', null, null, 'voice', ms(b.at), ms(b.at), exp(ms(b.at)));
      db.prepare(`UPDATE book SET entity_id = ? WHERE id = ?`).run(id, b.id);
      al.run(id, romanize(b.party), '', 'voice', ms(b.at), exp(ms(b.at)));
    }
    // interactions and last seen, from every source
    db.exec(`UPDATE entity SET
      interactions = (SELECT COUNT(*) FROM event WHERE event.entity_id = entity.id) + (SELECT COUNT(*) FROM action WHERE action.entity_id = entity.id) + (SELECT COUNT(*) FROM book WHERE book.entity_id = entity.id),
      last_seen = MAX(COALESCE(last_seen, 0), COALESCE((SELECT MAX(at) FROM event WHERE event.entity_id = entity.id), 0), COALESCE((SELECT MAX(t.at) FROM action a JOIN turn t ON t.id = a.turn_id WHERE a.entity_id = entity.id), 0))`);
    db.exec(`UPDATE entity SET expires_at = last_seen + ${TTL_MS} WHERE source = 'voice' AND last_seen > 0`);

    // what should be embedded: every piece of text the user may later ask about (pending rows get vectors in the background)
    const keep: string[] = [];
    const vq0 = db.prepare(`INSERT INTO vec(hash, kind, ref, entity_id, at, text, emb, scale, expires_at) VALUES(?,?,?,?,?,?,NULL,NULL,?) ON CONFLICT(hash) DO UPDATE SET expires_at = MAX(COALESCE(vec.expires_at, 0), COALESCE(excluded.expires_at, 0)), ref = excluded.ref`);
    const vq = { run: (h: string, ...rest: any[]) => { keep.push(h); return vq0.run(h, ...rest); } };
    const name = (id?: string | null) => (id ? p.contacts.find(c => c.id === id)?.name ?? id : '');
    for (const f of db.prepare(`SELECT * FROM fact`).all() as any[]) vq.run(hash(`f${f.text}`), 'fact', f.id, f.subject, f.at, f.text, f.expires_at);
    for (const t of db.prepare(`SELECT * FROM turn`).all() as any[]) {
      const acts = (db.prepare(`SELECT type, contact_name, title, amount FROM action WHERE turn_id = ?`).all(t.id) as any[]).map(a => `${a.type} ${a.contact_name ?? ''} ${a.title ?? ''}${a.amount ? ` ₹${a.amount}` : ''}`).join('; ');
      const text = `User said: ${t.said}\nArtha: ${t.reply}${acts ? `\nActions: ${acts}` : ''}`;
      vq.run(hash(`t${text}`), 'turn', t.id, JSON.parse(t.people || '[]')[0]?.id ?? null, t.at, text, t.expires_at);
    }
    for (const e of db.prepare(`SELECT * FROM event`).all() as any[]) { const text = `${e.me ? 'You' : name(e.entity_id)}${e.me ? ` → ${name(e.entity_id)}` : ''}: ${e.text}`; vq.run(hash(`e${text}`), 'event', e.id, e.entity_id, e.at, text, e.expires_at); }
    for (const b of db.prepare(`SELECT * FROM book WHERE status != 'dropped'`).all() as any[]) { const text = `Khata ${b.day}: ${b.kind.replace('_', ' ')} ${b.party || ''} ${b.item || ''} ₹${b.amount}`; vq.run(hash(`b${text}`), 'book', b.id, b.entity_id, b.at, text, b.expires_at); }
    // a vector whose text no longer exists (an entry was corrected, a turn replaced) is dropped: recall never sees stale facts
    db.prepare(`DELETE FROM vec WHERE hash NOT IN (SELECT value FROM json_each(?))`).run(JSON.stringify(keep));

    for (const [k, v] of [['persona', p.id], ['notes', String(s.notes)], ['updated', String(now)]]) db.prepare(`INSERT OR REPLACE INTO meta(k, v) VALUES(?, ?)`).run(k, v);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- Personalisation: learned from what the user confirmed, never from guesses ----------
export function learnHabit(db: DatabaseSync, entity: string, key: string, value: string) {
  db.prepare(`INSERT INTO habit(entity_id, key, value, n, updated) VALUES(?,?,?,1,?) ON CONFLICT DO UPDATE SET n = n + 1, updated = excluded.updated`).run(entity, key, value, Date.now());
}
export function habitsOf(db: DatabaseSync, ids: string[]): Record<string, { key: string; value: string; n: number }[]> {
  const out: Record<string, { key: string; value: string; n: number }[]> = {};
  for (const id of ids) out[id] = db.prepare(`SELECT key, value, n FROM habit WHERE entity_id = ? ORDER BY n DESC`).all(id) as any[];
  return out;
}

/** People first heard in voice notes, as contacts the pipeline can match ("Anand Patil" next time). */
export function voicePeople(db: DatabaseSync) {
  return db.prepare(`SELECT id, name, rel FROM entity WHERE source = 'voice'`).all() as { id: string; name: string; rel: string }[];
}

/** A short structured card per person: everything about them in one place, for the model. */
export function personCard(db: DatabaseSync, id: string, now = Date.now()) {
  const e = db.prepare(`SELECT * FROM entity WHERE id = ?`).get(id) as any;
  if (!e) return null;
  const called = (db.prepare(`SELECT phrase, topic, source FROM alias WHERE entity_id = ?`).all(id) as any[]);
  const last = db.prepare(`SELECT me, text, at FROM event WHERE entity_id = ? ORDER BY at DESC LIMIT 2`).all(id) as any[];
  const due = (db.prepare(`SELECT COALESCE(SUM(amount),0) AS d FROM ledger WHERE entity_id = ?`).get(id) as any).d + ((db.prepare(`SELECT COALESCE(SUM(amount),0) AS d FROM balance WHERE party = ? AND kind = 'credit'`).get(id) as any)?.d ?? 0);
  const open = db.prepare(`SELECT kind, amount, item, status FROM book WHERE entity_id = ? AND status != 'dropped' ORDER BY at DESC LIMIT 4`).all(id) as any[];
  const next = db.prepare(`SELECT title, when_label FROM cal WHERE entity_id = ? AND when_iso > ? ORDER BY when_iso LIMIT 1`).get(id, new Date(now).toISOString()) as any;
  const habits = (db.prepare(`SELECT key, value, n FROM habit WHERE entity_id = ? AND n >= 1 ORDER BY n DESC LIMIT 4`).all(id) as any[]);
  return {
    id, name: e.name, kind: e.kind, relation: e.rel, lang: e.lang, source: e.source,
    called: called.map(c => (c.topic ? `${c.phrase} (${c.topic})` : c.phrase)),
    interactions: e.interactions,
    last: last.map(x => `${x.me ? 'you' : 'them'}: ${String(x.text).slice(0, 70)} (${Math.max(0, Math.round((now - x.at) / 864e5))}d ago)`),
    ...(due ? { khata_due_inr: due } : {}),
    ...(open.length ? { khata_entries: open.map(o => `${o.kind} ₹${o.amount}${o.item ? ` ${o.item}` : ''} (${o.status})`) } : {}),
    ...(next ? { next: `${next.title}, ${next.when_label}` } : {}),
    ...(habits.length ? { habits: habits.map(h => `${h.key}: ${h.value} (${h.n}×)`) } : {}),
  };
}

/** Mark facts as used: their 90-day clock restarts (knowledge that keeps helping is kept). */
export function touchFacts(db: DatabaseSync, ids: string[]) {
  const now = Date.now();
  const st = db.prepare(`UPDATE fact SET uses = uses + 1, last_used = ?, expires_at = CASE WHEN expires_at IS NULL THEN NULL ELSE ? END WHERE id = ?`);
  for (const id of ids) st.run(now, now + TTL_MS, id);
}
