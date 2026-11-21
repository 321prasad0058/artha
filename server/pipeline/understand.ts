// The pipeline. Artha mode: code stages + one model call that can only choose saved people.
// Base modes exist so the same recording can be compared: plain model, and plain model + pasted context.
import { jsonCall } from '../openai.js';
import type { Action, Candidate, Mention, Mode, Persona, Result, State } from '../types.js';
import { retrieve } from '../kb.js';
import { linksFor } from '../connectors.js';
import { isoOf, labelOf, normalise } from './normalize.js';
import { checkActions, needsClarify, secretCheck } from './rules.js';
import { romanize } from './translit.js';
import type { DatabaseSync } from 'node:sqlite';
import { personCard, touchFacts } from '../context/space.js';
import { recall } from '../context/embed.js';

const ACTION_TYPES = ['message', 'call', 'reminder', 'calendar', 'payment', 'ledger', 'suggestion'] as const;

function actionSchema(contactIds: string[] | null) {
  const contact = contactIds ? { type: 'string', enum: [...contactIds, 'none'] } : { type: 'string' };
  return {
    type: 'object', additionalProperties: false,
    required: ['type', 'contact_id', 'language', 'text', 'gloss', 'goal', 'title', 'when_iso', 'when_label', 'amount_inr', 'predicted', 'why', 'entry_kind', 'party', 'item', 'updates'],
    properties: {
      type: { type: 'string', enum: ACTION_TYPES }, contact_id: contact, language: { type: 'string' }, text: { type: 'string' }, gloss: { type: 'string' },
      goal: { type: 'string' }, title: { type: 'string' }, when_iso: { type: 'string' }, when_label: { type: 'string' }, amount_inr: { type: 'number' },
      predicted: { type: 'boolean' }, why: { type: 'string' },
      entry_kind: { type: 'string', enum: ['', 'sale', 'purchase', 'to_receive', 'to_pay', 'received', 'paid', 'credit'] }, party: { type: 'string' }, item: { type: 'string' }, updates: { type: 'string' },
    },
  };
}
function planSchema(contactIds: string[] | null) {
  const cand = contactIds ? { type: 'string', enum: [...contactIds, 'none'] } : { type: 'string' };
  return {
    type: 'object', additionalProperties: false, required: ['language', 'mentions', 'actions', 'clarify_question', 'learn', 'reply', 'reply_speech'],
    properties: {
      language: { type: 'string' },
      mentions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'kind', 'value', 'candidates'], properties: {
        text: { type: 'string' }, kind: { type: 'string', enum: ['person', 'time', 'money', 'event', 'place', 'secret'] }, value: { type: 'string' },
        candidates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'score', 'why'], properties: { id: cand, score: { type: 'number' }, why: { type: 'string' } } } } } } },
      actions: { type: 'array', items: actionSchema(contactIds) },
      clarify_question: { type: 'string' },
      learn: { type: 'array', items: { type: 'string' } },
      reply: { type: 'string' },
      reply_speech: { type: 'string' },
    },
  };
}

const ARTHA_INSTRUCTIONS = `You are the understanding stage of Artha, an assistant for Indian users. You get a short voice note (any mix of Hindi, Marathi, Telugu, Tamil, Urdu and English), already transcribed, plus the user's personal context. Work out who and what they mean, and turn it into actions done on their behalf.

People
- Choose people ONLY by id from CANDIDATES. For every person mentioned, list up to 3 candidate ids with a score from 0 to 1 (a mention's scores add up to at most 1) and a short reason.
- Use relationship, recent activity, the topic of the note and MEMORY to separate people with the same name. If two still fit about equally, give them close scores and do not pick one arbitrarily.
- Honour FORCED choices exactly.

Values
- Use CODE_VALUES exactly for dates, times and amounts when they apply. Write when_iso as ISO 8601 with +05:30, and when_label in plain words like "Mon 23 Nov, 6:00 PM".

Actions
- message: write "text" as the exact words the RECIPIENT will read, in their preferred language (their "lang"): Telugu in Telugu script, Tamil in Tamil script, Hindi, Marathi and Urdu in simple Roman script, English in English. Short, natural, respectful for the relationship, addressed to them ("Anna, ..."). Put the English meaning in "gloss".
- call: when something must be arranged or changed with someone (rescheduling, asking, booking). Put the outcome wanted in "goal" (for Artha), AND in "text" a short message to that person in their language that could be sent instead of calling.
- reminder or calendar: for times the user must remember or plans they made.
- payment: only when the user asks to pay or send money; set amount_inr. If the user gives no amount, use the amount that person asked for in AMOUNTS THEY ASKED FOR. Payments always wait for the user's confirmation, so don't hold back for that.
- ledger: a line in the user's KHATA BOOK, when they ask to write, add or note amounts ("likh do", "khate mein daal do", "khatyat add kara", "nond kara", "entry karo", "hisaab mein"). ONE ledger action PER entry: a note with four amounts gives four ledger actions. For each set:
  entry_kind: sale (goods sold, money in), purchase (stock bought), to_receive (someone owes the user, e.g. "1200 supplier se lene hain"), to_pay (the user owes someone, "5000 dene hain"), received (money came in), paid (money went out), credit (a customer took goods on khata).
  party: the person's or business's NAME only, without role words ("Anand Patil", not "Anand Patil supplier"), exactly as named, EVEN IF they are not in CANDIDATES (then contact_id "none"). If no name was given ("doosra supplier"), party "" and title says what is missing.
  item: goods and quantity if said ("5 kg rice"). amount_inr: the amount. title: a short line like "5 kg rice sold" or "To receive from Anand Patil (supplier)". when_iso: the day it happened if said (yesterday etc.), else "".
  updates: "" for a new entry. If the user CORRECTS or COMPLETES an entry already in KHATA BOOK (gives the missing name, a new amount, says it was a different person), return that entry again with all fields filled and updates = its id. Never create a second copy of an entry.
  "Yaad dilao" / "remind them they owe" is NOT a ledger entry: it is a message to that person about the amount already due.
- Non-ledger actions: entry_kind "", party "", item "", updates "".
- If a name the user gives answers an earlier open question (an entry with a missing party), that IS the correction: update that entry.
- suggestion: at most one helpful next step predicted from a clear habit in MEMORY (for example, a reminder 1 hour before appointments). Mark predicted=true. Do not invent habits.
- Never put an OTP, PIN, password, card or Aadhaar number into any action.
- Fill fields that don't apply with "" , 0 or false. contact_id is "none" when no person applies.

Also
- clarify_question: if two people fit about equally, a short question in the user's own language and script style, otherwise "".
- learn: 0 to 2 short new facts worth remembering (a changed plan, a new preference). Not things already in MEMORY.
- reply: one short line to the user, in their own language mix, Roman script, saying what is READY for them ("Amma ke liye message ready hai"). Never say something was sent, paid or done: the user confirms with one tap.
- reply_speech: the same reply written for reading aloud, in the NATIVE script of the user's language (Devanagari for Hindi, Hinglish, Marathi and Urdu; Telugu script; Tamil script; English stays English). Keep English words like "appointment" in that script too (अपॉइंटमेंट). Short and warm.
- If the user ASKS something (their schedule, a khata balance, what they told you), answer it in "reply" and return NO actions. For khata questions read KHATA BOOK: list the entries asked for (who or what, amount, saved or not yet confirmed) and the totals. If they ask for a day with no entries but entries were recorded in this conversation, give those and say when they were recorded. Never say you cannot see entries that are in KHATA BOOK. If they ask you to tell, repeat or list the entries again, LIST THEM in the reply right away (each entry with amount, then totals); never answer with a question like "should I tell you again?".
- reply and reply_speech may be up to 4 short sentences when listing entries; otherwise one line.
- If the requested calendar entry or reminder ALREADY EXISTS in TIMELINE at that time, do not add it again: say in "reply" that it is already there. This never removes a message: "bol do / bolo / sang / sanga / cheppu / sollu / tell" ALWAYS means a message to that person.
- CANCEL: if the user cancels something that is still PROPOSED (not done), just confirm it is dropped and return NO actions. Only if it was DONE, create what undoes it (for example a call or message to cancel).
- A follow-up that changes one thing (time, day, person) re-plans ONLY that action. Do not repeat other actions from earlier turns.
- FOLLOW-UPS: short notes often continue the CONVERSATION. "Calendar mein daal do / add karo / add it" = add the latest proposed thing as a calendar entry with the same time and person; if that thing is marked "already in calendar", say it is already there. "Time 5 baje kar do / change to Monday" = the same action again with the new time. "Usko / unko bhi bata do / tell him too" = the people in the latest turn. "Cancel karo / rehne do" = cancel what was just set up. Use the people, times and amounts from CONVERSATION; do not ask again for things it already has.
- PEOPLE CARDS "habits" come from what the user actually confirmed before (for example "reach by: call (3×)"): prefer them when the note does not say. FROM MEMORY is background: use it to understand references to older things ("wahi jo pichle hafte bola tha").
- mentions: list ONLY people mentioned, using the exact words from the transcript.
- Keep every "why" under 10 words. Be brief everywhere: speed matters.`;

const BASE_INSTRUCTIONS = `Turn this transcribed voice note into a list of actions (message, call, reminder, calendar, payment, ledger, suggestion). Use contact_id for the person's name as you understand it. Fill fields that don't apply with "", 0 or false. reply: a one-line confirmation. reply_speech: "". mentions: people, times and amounts mentioned, with empty candidates. learn: empty. clarify_question: "".`;

function istNowLabel(now: Date) {
  return now.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
function eventWhen(day: number, time: string, now: Date) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now.getTime() + day * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return labelOf(isoOf({ y: +p.year, m: +p.month, d: +p.day }, h, m));
}

const KIND_LABEL: Record<string, string> = { sale: 'sold', purchase: 'bought', to_receive: 'to receive', to_pay: 'to pay', received: 'received', paid: 'paid', credit: 'customer credit' };
/** The khata book as the model sees it: every entry with its id (so corrections can point at it), and totals per day, computed in code. */
function bookSection(state: State, now: Date) {
  const book = (state.book ?? []).filter(e => e.status !== 'dropped').slice(-40);
  if (!book.length) return 'KHATA BOOK: (no entries yet)';
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const days = [...new Set(book.map(e => e.day))];
  const totals = days.map(d => {
    const sum = (k: string) => book.filter(e => e.day === d && e.kind === k).reduce((s, e) => s + e.amount, 0);
    const parts = Object.keys(KIND_LABEL).map(k => [KIND_LABEL[k], sum(k)] as const).filter(([, v]) => v > 0).map(([l, v]) => `${l} ₹${v.toLocaleString('en-IN')}`);
    return `${d}${d === today ? ' (today)' : ''}: ${parts.join(', ')}`;
  });
  return `KHATA BOOK (every entry the user dictated, structured; "day" is the business day the entry is for, "recorded" is when they told Artha; correct an entry by returning it with updates = its id):\n${JSON.stringify(book.map(e => ({ id: e.id, day: e.day, kind: e.kind, party: e.party || '(name not given yet)', item: e.item || undefined, inr: e.amount, status: e.status === 'saved' ? 'saved' : 'not confirmed yet', recorded: e.at.slice(0, 16) })))}\nTOTALS BY DAY (code): ${totals.join(' | ')}`;
}

type PlanOut = { language: string; mentions: Mention[]; actions: Action[]; clarify_question: string; learn: string[]; reply: string; reply_speech: string };

export async function understand(args: { persona: Persona; state: State; transcript: string; mode: Mode; forced?: Record<string, string>; now?: Date; ctx?: { db: DatabaseSync; query: Promise<Float32Array | null> } }): Promise<Result> {
  const { persona: p, state, transcript, mode } = args;
  const forced = args.forced ?? {};
  const now = args.now ?? new Date();
  const roman = romanize(transcript);

  const empty = (extra: Partial<Result>): Result => ({ mode, transcript, roman, language: '', entities: [], candidates: [], mentions: [], actions: [], clarify: null, blocked: false, checks: [], learn: [], reply: '', ms: { meaning: 0, who: 0, plan: 0 }, ...extra });

  // ---------- Base and base + pasted context: no code stages, free-text people ----------
  if (mode !== 'artha') {
    const t = Date.now();
    const ctx = mode === 'base_ctx' ? `\n\nCONTEXT ABOUT THE USER (JSON):\n${JSON.stringify({ name: p.name, city: p.city, contacts: p.contacts, recent: p.events, memory: state.memory.map(m => m.fact), calendar: state.calendar })}` : '';
    const out = await jsonCall<PlanOut>({ name: 'plan', instructions: BASE_INSTRUCTIONS, input: `Today: ${istNowLabel(now)}.\nVoice note: "${transcript}"${ctx}`, schema: planSchema(null) });
    const actions = out.actions.map(a => ({ ...a, contact_name: a.contact_id, contact_id: p.contacts.find(c => c.name.toLowerCase() === a.contact_id.toLowerCase() || c.id === a.contact_id)?.id ?? '' }));
    return empty({ language: out.language, mentions: out.mentions, actions, reply: out.reply, ms: { meaning: 0, who: 0, plan: Date.now() - t } });
  }

  // ---------- Artha ----------
  // Rule 1 first: secrets never reach a model.
  const secret = secretCheck(transcript, roman);
  if (secret.blocked) {
    const scam = p.contacts.find(c => /unverified/i.test(c.rel));
    return empty({
      transcript: secret.masked, roman: romanize(secret.masked), blocked: true,
      mentions: [{ text: 'OTP', kind: 'secret', value: 'never shared', candidates: [] }],
      actions: scam ? [{ type: 'suggestion', contact_id: scam.id, contact_name: scam.name, language: '', text: '', gloss: '', goal: '', title: `Mark “${scam.name}” as a likely scam`, when_iso: '', when_label: '', amount_inr: 0, predicted: true, why: 'Real banks and offices never ask for an OTP on a call.' }] : [],
      checks: [{ rule: 'Blocked: an OTP or PIN with digits was found', ok: false }, { rule: 'The digits were hidden before any model or log saw them', ok: true }],
      reply: 'OTP kabhi kisi ko nahi batate. Bank ya office kabhi OTP nahi maangte.',
      reply_speech: 'ओटीपी कभी किसी को नहीं बताते। बैंक या ऑफ़िस कभी ओटीपी नहीं माँगते।',
    });
  }

  let t = Date.now();
  const norm = normalise(roman, now);
  {
    // A follow-up that changes only the time keeps the day (and morning/evening) of the plan being discussed.
    const recentActs = (state.turns ?? []).filter(x => now.getTime() - Date.parse(x.at) < 3 * 3600e3).flatMap(x => x.actions).reverse();
    const prev = recentActs.find(a => a.when_iso && !a.id.includes(':ref')) ?? recentActs.find(a => a.when_iso);   // what was just asked for beats what was already there
    const hasDay = norm.entities.some(e => e.kind === 'date');
    const changing = /\b(badal|badlo|badla|badlaa|badalna|change|shift|instead|nahi|nako|vel|vela|velaa|time|waqt|samay|maathu|maathunga|reschedule|postpone|prepone|pudhe|aage|peeche|kar ?do)\b/.test(roman.toLowerCase());
    const saidPart = /\b(subah|savere|morning|sakali|kaalai|dopahar|dupari|madhyanam|afternoon|shaam|sham|evening|sandhyakali|maalai|raat|ratri|raatri|night)\b/.test(roman.toLowerCase());
    if (norm.when && !hasDay && prev && changing && norm.entities.some(e => e.kind === 'time')) {
      const [hh, mm] = norm.when.iso.slice(11, 16).split(':').map(Number);
      const prevH = Number(new Date(prev.when_iso).toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }));
      const h = saidPart ? hh : [hh % 12, (hh % 12) + 12].sort((a, b) => Math.abs(a - prevH) - Math.abs(b - prevH))[0];
      const iso = `${prev.when_iso.slice(0, 10)}T${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`;
      norm.when = { iso, label: labelOf(iso) };
      norm.entities.push({ text: '(same day as the plan being discussed)', kind: 'date', label: labelOf(iso, false), iso });
    }
  }
  const msMeaning = Date.now() - t;

  t = Date.now();
  // Knowledge base retrieval: likely people, facts about them, the topic, what the user taught before.
  const turns = (state.turns ?? []).filter(t => now.getTime() - Date.parse(t.at) < 3 * 3600e3).slice(-6);
  const talkedAbout = [...new Set(turns.slice().reverse().flatMap(t => [...t.people.map(x => x.id), ...t.actions.map(a => a.contact_id)]).filter(Boolean))];
  const kb = retrieve(roman, p, state, now, talkedAbout);
  const shortlist = kb.candidates;
  const filled: Candidate[] = [...shortlist];
  for (const c of p.contacts) if (filled.length < 12 && !filled.some(x => x.id === c.id)) filled.push({ id: c.id, name: c.name, rel: c.rel, score: 0, why: 'No match in the note' });
  const msWho = Date.now() - t;

  // The context space: a card per likely person, and older memories that MEAN the same as this note (vector recall).
  let cards: unknown[] = [], memories: string[] = [];
  if (args.ctx) {
    const ids = [...new Set([...shortlist.filter(c => c.score >= 0.3).slice(0, 4).map(c => c.id), ...talkedAbout.slice(0, 2)])];
    cards = ids.map(id => personCard(args.ctx!.db, id, now.getTime())).filter(Boolean);
    const q = await args.ctx.query;
    if (q) {
      const shown = new Set([...turns.map(x => x.id), ...(state.book ?? []).map(b => b.id)]);   // already in CONVERSATION / KHATA BOOK
      const hits = recall(args.ctx.db, q, { people: ids, exclude: shown, k: 6, now: now.getTime() });
      touchFacts(args.ctx.db, hits.filter(h => h.kind === 'fact').map(h => h.ref));
      memories = hits.map(h => `- [${h.kind}${h.at ? `, ${Math.max(0, Math.round((now.getTime() - h.at) / 864e5))}d ago` : ''}, match ${h.sim.toFixed(2)}] ${h.text.replace(/\n/g, ' · ').slice(0, 220)}`);
    }
  }
  const contactInfo = filled.map(c => { const k = p.contacts.find(x => x.id === c.id)!; return { id: k.id, name: k.name, relation: k.rel, lang: k.lang, called: k.aliases, code_score: Number(c.score.toFixed(2)), code_reason: c.why }; });
  const input = [
    `TODAY: ${istNowLabel(now)} (Asia/Kolkata)`,
    `USER: ${p.name}, ${p.age}, ${p.city}. ${p.about}`,
    `TRANSCRIPT: "${transcript}"`,
    `ROMAN: "${roman}"`,
    `TOPIC (from code): ${kb.topics.join(', ') || 'unclear'}`,
    `CODE_VALUES: ${norm.entities.length ? norm.entities.map(e => `"${e.text}" = ${e.label}`).join('; ') : 'none'}${norm.when ? `; combined when = ${norm.when.iso} (${norm.when.label})` : ''}`,
    `CANDIDATES (code_score comes from name sound, topic fit, recency and past corrections; trust it unless the note clearly says otherwise): ${JSON.stringify(contactInfo)}`,
    cards.length ? `PEOPLE CARDS (structured, from the user's context space: who they are, what the user calls them, last contact, money, next plan, habits learned from what the user confirmed):\n${cards.map(c => JSON.stringify(c)).join('\n')}` : '',
    memories.length ? `FROM MEMORY (older things that mean the same as this note, found by meaning; use if relevant, ignore if not):\n${memories.join('\n')}` : '',
    kb.pending.length ? `AMOUNTS THEY ASKED FOR (code found these in their own messages): ${kb.pending.map(x => `${x.name}: ₹${x.amount.toLocaleString('en-IN')} ("${x.said}")`).join('; ')}` : '',
    `CONVERSATION (latest last; follow-ups refer to this):\n${turns.length ? turns.map(t => `- ${Math.round((now.getTime() - Date.parse(t.at)) / 60000)} min ago, user said: "${t.said}"\n  people: ${t.people.map(x => `${x.name} [${x.id}]`).join(', ') || 'none'}\n  actions: ${t.actions.map(a => `${a.id} ${a.type} ${a.contact_id ? `→ ${a.contact_name} [${a.contact_id}] ` : ''}${a.title || a.text ? `"${(a.title || a.text).slice(0, 80)}" ` : ''}${a.when_iso ? `at ${a.when_iso} ` : ''}${a.amount_inr ? `₹${a.amount_inr} ` : ''}· ${a.status.toUpperCase()}`).join(' | ') || 'none'}${t.reply ? `\n  Artha replied: "${t.reply.slice(0, 200)}"` : ''}`).join('\n') : '- (new conversation)'}`,
    `TIMELINE (structured, upcoming): ${JSON.stringify([...state.calendar.filter(c => Date.parse(c.when_iso) > now.getTime() - 3600e3).map(c => ({ what: c.title, with: c.contact ?? null, at: c.when_iso })), ...state.reminders.map(r => ({ what: `reminder: ${r.title}`, at: r.when_iso }))].slice(0, 12))}`,
    `PREFERENCES AND HABITS:\n${state.memory.filter(m => !m.learned).map(m => `- ${m.fact}`).join('\n') || '- none'}`,
    `CORRECTIONS THE USER MADE (always follow): ${JSON.stringify(state.memory.filter(m => m.kind === 'alias').map(m => ({ said: m.mention, topic: m.topic ?? 'any', means: m.about })))}`,
    `LEARNED NOTES:\n${state.memory.filter(m => m.learned && m.kind !== 'alias').map(m => `- ${m.fact}`).join('\n') || '- none'}`,
    `RELEVANT FACTS ABOUT THESE PEOPLE:\n${kb.facts.map(f => `- ${f.text}`).join('\n') || '- none'}`,
    `RECENT ACTIVITY (calls and messages):\n${kb.recent.join('\n')}`,
    bookSection(state, now),
    ...(() => {   // open questions and day mismatches, spelled out so the model cannot miss them
      const open = (state.book ?? []).filter(e => e.status !== 'dropped' && !e.party && e.kind !== 'sale' && e.kind !== 'purchase' && now.getTime() - Date.parse(e.at) < 3 * 3600e3);
      const asked = norm.entities.find(e => e.kind === 'date' && e.iso)?.iso?.slice(0, 10);
      const book = (state.book ?? []).filter(e => e.status !== 'dropped');
      return [
        open.length ? `OPEN QUESTION: ${open.map(e => `entry ${e.id} (${e.kind} ₹${e.amount})`).join(', ')} has no name yet. If this note gives a name, it is the name for ${open.length === 1 ? 'that entry' : 'the entry it fits'}: return it as a ledger action with party set and updates = its id.` : '',
        asked && book.length && !book.some(e => e.day === asked) ? `NOTE: there are no entries for ${asked}. The entries in KHATA BOOK were recorded ${[...new Set(book.map(e => e.day))].join(', ')}. If the user asks about ${asked}, list the KHATA BOOK entries anyway (they likely mean what they just told you), say which day they are saved under, and offer to move them.` : '',
      ];
    })(),
    state.ledger.length ? `KHATA BALANCES (credit due, structured): ${JSON.stringify(Object.entries(state.ledger.reduce<Record<string, number>>((m, l) => ({ ...m, [l.contact]: (m[l.contact] ?? 0) + l.amount }), {})).map(([id, due]) => ({ id, name: p.contacts.find(c => c.id === id)?.name, due_inr: due })))}` : '',
    state.payments.length ? `PAYMENTS MADE: ${JSON.stringify(state.payments.slice(-5).map(x => ({ to: x.contact, inr: x.amount, at: x.at })))}` : '',
    Object.keys(forced).length ? `FORCED: ${JSON.stringify(forced)} (the user already chose these people)` : '',
  ].filter(Boolean).join('\n\n');

  t = Date.now();
  let out = await jsonCall<PlanOut>({ name: 'artha_plan', instructions: ARTHA_INSTRUCTIONS, input, schema: planSchema(null) });
  {
    const tell = /\b(bol ?do|bolo|bolna|bata ?do|batao|sang|sanga|sangaa|saang|cheppu|cheppandi|sollu|sollunga|tell|message|msg)\b/i.test(roman);
    const named = shortlist.filter(c => c.score >= 0.8).map(c => c.id);
    const toldTo = new Set(out.actions.filter(a => a.type === 'message' || a.type === 'call').map(a => a.contact_id));
    const missing = named.filter(id => !toldTo.has(id));
    if (tell && named.length && missing.length === named.length && (!out.clarify_question || named.length === 1)) {
      out = await jsonCall<PlanOut>({ name: 'artha_plan', instructions: ARTHA_INSTRUCTIONS, input: `${input}\n\nCHECK: the user asked to TELL ${missing.map(id => p.contacts.find(c => c.id === id)?.name).join(', ')} something. Include a message action to them with their exact words in their language.`, schema: planSchema(null) });
    }
  } // fixed schema = cached by OpenAI; ids are validated in code below
  const msPlan = Date.now() - t;
  { // "Their name is Sunil Sharma": fill the one open khata entry, even if the model only said "noted".
    const open = (state.book ?? []).filter(e => e.status !== 'dropped' && !e.party && e.kind !== 'sale' && e.kind !== 'purchase' && now.getTime() - Date.parse(e.at) < 3 * 3600e3);
    const name = out.mentions.find(m => m.kind === 'person')?.text;
    if (open.length === 1 && name && !out.actions.some(a => a.type === 'ledger' && a.party) && /\b(naav|nav|naam|nam|name|naavh)\b|नाव|नाम|పేరు|பெயர்/i.test(`${transcript} ${roman}`)) {
      const e = open[0];
      out.actions = out.actions.filter(a => a.type !== 'ledger');
      const kind = { to_pay: p.speaks[0] === 'Marathi' ? 'द्यायचे' : 'dene hain', to_receive: p.speaks[0] === 'Marathi' ? 'घ्यायचे' : 'lene hain' }[e.kind as 'to_pay'] ?? '';
      const say = p.speaks[0] === 'Marathi' ? `ठीक आहे, ₹${e.amount.toLocaleString('en-IN')} ${kind} ती नोंद ${name} यांच्या नावाने केली.` : p.speaks[0] === 'English' ? `Done, the ₹${e.amount.toLocaleString('en-IN')} entry is now under ${name}.` : `Theek hai, ₹${e.amount.toLocaleString('en-IN')} wali entry ${name} ke naam se kar di.`;
      out.reply = say; out.reply_speech = say; out.clarify_question = '';
      out.actions.push({ type: 'ledger', contact_id: 'none', contact_name: '', language: '', text: '', gloss: '', goal: '', title: '', when_iso: '', when_label: '', amount_inr: e.amount, predicted: false, why: 'The name for the open entry', entry_kind: e.kind, party: name, item: e.item, updates: e.id });
    }
  }

  // Make every mention's candidates readable and honour forced picks
  const mentions: Mention[] = out.mentions.map(m => ({
    ...m,
    candidates: (forced[m.text] ? [{ id: forced[m.text], score: 1, why: 'You told Artha' }] : m.candidates)
      .filter(c => p.contacts.some(x => x.id === c.id)).map(c => ({ ...c, name: p.contacts.find(x => x.id === c.id)!.name })),
  }));

  const sameAsCalendar = (a: Action) => (a.type === 'calendar' || a.type === 'reminder') && state.calendar.some(c => a.when_iso && Math.abs(Date.parse(c.when_iso) - Date.parse(a.when_iso)) < 60e3);
  const planned = out.actions.map(a => ({ ...a, contact_name: '' }))
    .filter(a => (a.text || a.goal || a.title || a.amount_inr > 0))                 // no empty cards
    .filter(a => !((a.type === 'calendar' || a.type === 'reminder') && !a.when_iso)) // a reminder needs a time
    .filter(a => !sameAsCalendar(a));                                               // never duplicate what is already there
  const refs: NonNullable<Result['refs']> = [];
  // one message per person per note
  for (let i = planned.length - 1; i >= 0; i--) { const a = planned[i]; if (a.type === 'message' && planned.findIndex(x => x.type === 'message' && x.contact_id === a.contact_id) !== i) planned.splice(i, 1); }
  // if everything asked for is already in the calendar, say so plainly instead of "ready"
  const dupes = out.actions.filter(a => (a.type === 'calendar' || a.type === 'reminder') && a.when_iso && state.calendar.some(c => Math.abs(Date.parse(c.when_iso) - Date.parse(a.when_iso)) < 60e3));
  const already = (c: { title: string; when_iso: string; when_label?: string; contact?: string }) => {
    const lang = p.speaks[0], when = c.when_label || labelOf(c.when_iso);
    const say = lang === 'Marathi' ? `हे आधीच तुमच्या कॅलेंडरमध्ये आहे: ${c.title}, ${when}.` : lang === 'Tamil' ? `இது ஏற்கனவே உங்கள் காலெண்டரில் உள்ளது: ${c.title}, ${when}.` : lang === 'English' ? `That's already in your calendar: ${c.title}, ${when}.` : `Ye pehle se aapke calendar mein hai: ${c.title}, ${when}.`;
    out.reply = say; out.reply_speech = say; out.clarify_question = '';
    if (!refs.some(r => r.when_iso === c.when_iso)) refs.push({ type: 'calendar', title: c.title, when_iso: c.when_iso, contact_id: c.contact ?? '' });
  };
  if (!planned.length && dupes.length) already(state.calendar.find(x => Math.abs(Date.parse(x.when_iso) - Date.parse(dupes[0].when_iso)) < 60e3)!);
  // FOLLOW-UP "add it to the calendar" with no new person, day or time: it means the thing just discussed.
  // Resolved in code from the conversation record, so the model never has to ask "add what?".
  const addFollowUp = /calend|kalend|kailend|kaelend|कॅलेंडर|कैलेंडर|कलेंडर|క్యాలెండర్|காலெண்டர்/i.test(`${transcript} ${roman}`)
    && !norm.entities.some(e => e.kind === 'date' || e.kind === 'time') && !planned.some(a => a.type === 'calendar');
  const last = [...(state.turns ?? [])].reverse().find(x => now.getTime() - Date.parse(x.at) < 3 * 3600e3 && x.actions.some(a => a.when_iso));
  if (addFollowUp && last) {
    const src = [...last.actions].reverse().find(a => a.when_iso && !a.id.includes(':ref') && a.status !== 'skipped' && a.type !== 'calendar');
    const ref = [...last.actions].reverse().find(a => a.when_iso && (a.id.includes(':ref') || a.type === 'calendar'));
    const inCal = src && state.calendar.find(c => Math.abs(Date.parse(c.when_iso) - Date.parse(src.when_iso)) < 60e3);
    if (src && !inCal) {
      const title = src.type === 'call' ? `Call ${src.contact_name}` : src.title && !/already/i.test(src.title) ? src.title : `${src.contact_name}`;
      planned.push({ type: 'calendar', contact_id: src.contact_id, contact_name: '', language: '', text: '', gloss: '', goal: '', title, when_iso: src.when_iso, when_label: src.when_label, amount_inr: 0, predicted: false, why: 'From what you just asked for' } as any);
      out.clarify_question = '';
      if (!out.reply || /\?\s*$/.test(out.reply)) { const s = p.speaks[0] === 'Marathi' ? `कॅलेंडरमध्ये टाकलं: ${title}, ${src.when_label}.` : p.speaks[0] === 'English' ? `Added to your calendar: ${title}, ${src.when_label}.` : `Calendar mein daal diya: ${title}, ${src.when_label}.`; out.reply = s; out.reply_speech = s; }
    } else if (inCal || ref) {
      planned.length = 0;
      already(inCal ?? { title: ref!.title.replace(/\s*\(already in calendar\)/i, '') || ref!.contact_name, when_iso: ref!.when_iso, when_label: ref!.when_label, contact: ref!.contact_id });
    }
  }
  for (const m of mentions.filter(x => x.kind === 'person')) {
    const top = [...m.candidates].sort((a, b) => b.score - a.score)[0];
    const c = top && state.calendar.filter(x => x.contact === top.id && Date.parse(x.when_iso) > now.getTime()).sort((a, b) => Date.parse(a.when_iso) - Date.parse(b.when_iso))[0];
    if (c && !refs.some(r => r.when_iso === c.when_iso)) refs.push({ type: 'calendar', title: c.title, when_iso: c.when_iso, contact_id: c.contact ?? '' });
  }
  let clarify = needsClarify(mentions, forced, out.clarify_question, planned);
  // The model asked "which one?" in words: give the user buttons, from the code shortlist.
  if (!clarify && !planned.length && out.clarify_question) {
    const opts = shortlist.filter(c => c.score >= 0.5).slice(0, 3);
    if (opts.length >= 2) clarify = { mention: out.mentions.find(m => m.kind === 'person')?.text ?? opts[0].name, question: out.clarify_question, options: opts.map(c => ({ id: c.id, label: c.name })) };
  }
  const { actions, checks } = clarify ? { actions: [], checks: [{ rule: 'A true tie between two people, so Artha asks once', ok: true }] } : checkActions(planned, p, now);
  // A time said in the note belongs on the action, even if the model only wrote it into the message text.
  if (norm.when) for (const a of actions) if (!a.when_iso && ['message', 'call', 'reminder', 'calendar'].includes(a.type)) { a.when_iso = norm.when.iso; a.when_label = norm.when.label; }
  // a khata line that is already in the book exactly like this is a confirmation, not a new card
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.type === 'ledger' && (state.book ?? []).some(e => e.status !== 'dropped' && e.amount === a.amount_inr && e.kind === (a.entry_kind || e.kind) && !!e.party && e.party === (a.party || a.contact_name) && (!a.updates || a.updates === e.id))) actions.splice(i, 1);
  }
  for (const a of actions) a.links = linksFor(a, p);
  // Fewer questions: attach the runner-up to each action as a one-tap "change".
  for (const a of actions) {
    const m = mentions.find(x => x.kind === 'person' && x.candidates.some(c => c.id === a.contact_id));
    if (!m) continue;
    a.mention = m.text;
    a.alternatives = [...m.candidates].sort((x, y) => y.score - x.score).filter(c => c.id !== a.contact_id && c.score >= 0.15).slice(0, 2).map(c => ({ id: c.id, name: c.name }));
  }

  return {
    mode, transcript, roman, language: out.language, entities: norm.entities, candidates: shortlist, mentions, actions, clarify, blocked: false, checks,
    learn: clarify ? [] : out.learn.filter(l => l && l.length < 160).slice(0, 2), reply: clarify ? '' : out.reply, reply_speech: clarify ? '' : out.reply_speech, refs, topics: kb.topics, ms: { meaning: msMeaning, who: msWho, plan: msPlan },
  };
}
