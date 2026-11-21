// The pipeline. Artha mode: code stages + one model call that can only choose saved people.
// Base modes exist so the same recording can be compared: plain model, and plain model + pasted context.
import { jsonCall } from '../openai.js';
import type { Action, Candidate, Mention, Mode, Persona, Result, State } from '../types.js';
import { retrieve } from '../kb.js';
import { linksFor } from '../connectors.js';
import { isoOf, labelOf, normalise } from './normalize.js';
import { checkActions, needsClarify, secretCheck } from './rules.js';
import { romanize } from './translit.js';

const ACTION_TYPES = ['message', 'call', 'reminder', 'calendar', 'payment', 'ledger', 'suggestion'] as const;

function actionSchema(contactIds: string[] | null) {
  const contact = contactIds ? { type: 'string', enum: [...contactIds, 'none'] } : { type: 'string' };
  return {
    type: 'object', additionalProperties: false,
    required: ['type', 'contact_id', 'language', 'text', 'gloss', 'goal', 'title', 'when_iso', 'when_label', 'amount_inr', 'predicted', 'why'],
    properties: {
      type: { type: 'string', enum: ACTION_TYPES }, contact_id: contact, language: { type: 'string' }, text: { type: 'string' }, gloss: { type: 'string' },
      goal: { type: 'string' }, title: { type: 'string' }, when_iso: { type: 'string' }, when_label: { type: 'string' }, amount_inr: { type: 'number' },
      predicted: { type: 'boolean' }, why: { type: 'string' },
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
- ledger: ONLY when the user says to write or add an amount to someone's khata ("likh do", "khate mein daal do", "add karo"). Set amount_inr and contact. "Yaad dilao" / "remind them they owe" is NOT a ledger entry: it is a message to that person about the amount already due.
- suggestion: at most one helpful next step predicted from a clear habit in MEMORY (for example, a reminder 1 hour before appointments). Mark predicted=true. Do not invent habits.
- Never put an OTP, PIN, password, card or Aadhaar number into any action.
- Fill fields that don't apply with "" , 0 or false. contact_id is "none" when no person applies.

Also
- clarify_question: if two people fit about equally, a short question in the user's own language and script style, otherwise "".
- learn: 0 to 2 short new facts worth remembering (a changed plan, a new preference). Not things already in MEMORY.
- reply: one short line to the user, in their own language mix, Roman script, saying what is READY for them ("Amma ke liye message ready hai"). Never say something was sent, paid or done: the user confirms with one tap.
- reply_speech: the same reply written for reading aloud, in the NATIVE script of the user's language (Devanagari for Hindi, Hinglish, Marathi and Urdu; Telugu script; Tamil script; English stays English). Keep English words like "appointment" in that script too (अपॉइंटमेंट). Short and warm.
- If the user ASKS something (their schedule, a khata balance, what they told you), answer it in "reply" and return NO actions.
- If the requested calendar entry or reminder ALREADY EXISTS in TIMELINE at that time, do not add it again: say in "reply" that it is already there. This never removes a message: "bol do / bolo / sang / sanga / cheppu / sollu / tell" ALWAYS means a message to that person.
- CANCEL: if the user cancels something that is still PROPOSED (not done), just confirm it is dropped and return NO actions. Only if it was DONE, create what undoes it (for example a call or message to cancel).
- A follow-up that changes one thing (time, day, person) re-plans ONLY that action. Do not repeat other actions from earlier turns.
- FOLLOW-UPS: short notes often continue the CONVERSATION. "Calendar mein daal do / add karo / add it" = add the latest proposed thing as a calendar entry with the same time and person; if that thing is marked "already in calendar", say it is already there. "Time 5 baje kar do / change to Monday" = the same action again with the new time. "Usko / unko bhi bata do / tell him too" = the people in the latest turn. "Cancel karo / rehne do" = cancel what was just set up. Use the people, times and amounts from CONVERSATION; do not ask again for things it already has.
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

type PlanOut = { language: string; mentions: Mention[]; actions: Action[]; clarify_question: string; learn: string[]; reply: string; reply_speech: string };

export async function understand(args: { persona: Persona; state: State; transcript: string; mode: Mode; forced?: Record<string, string>; now?: Date }): Promise<Result> {
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
  const turns = (state.turns ?? []).filter(t => now.getTime() - Date.parse(t.at) < 3 * 3600e3).slice(-4);
  const talkedAbout = [...new Set(turns.slice().reverse().flatMap(t => [...t.people.map(x => x.id), ...t.actions.map(a => a.contact_id)]).filter(Boolean))];
  const kb = retrieve(roman, p, state, now, talkedAbout);
  const shortlist = kb.candidates;
  const filled: Candidate[] = [...shortlist];
  for (const c of p.contacts) if (filled.length < 12 && !filled.some(x => x.id === c.id)) filled.push({ id: c.id, name: c.name, rel: c.rel, score: 0, why: 'No match in the note' });
  const msWho = Date.now() - t;

  const contactInfo = filled.map(c => { const k = p.contacts.find(x => x.id === c.id)!; return { id: k.id, name: k.name, relation: k.rel, lang: k.lang, called: k.aliases, code_score: Number(c.score.toFixed(2)), code_reason: c.why }; });
  const input = [
    `TODAY: ${istNowLabel(now)} (Asia/Kolkata)`,
    `USER: ${p.name}, ${p.age}, ${p.city}. ${p.about}`,
    `TRANSCRIPT: "${transcript}"`,
    `ROMAN: "${roman}"`,
    `TOPIC (from code): ${kb.topics.join(', ') || 'unclear'}`,
    `CODE_VALUES: ${norm.entities.length ? norm.entities.map(e => `"${e.text}" = ${e.label}`).join('; ') : 'none'}${norm.when ? `; combined when = ${norm.when.iso} (${norm.when.label})` : ''}`,
    `CANDIDATES (code_score comes from name sound, topic fit, recency and past corrections; trust it unless the note clearly says otherwise): ${JSON.stringify(contactInfo)}`,
    kb.pending.length ? `AMOUNTS THEY ASKED FOR (code found these in their own messages): ${kb.pending.map(x => `${x.name}: ₹${x.amount.toLocaleString('en-IN')} ("${x.said}")`).join('; ')}` : '',
    `CONVERSATION (latest last; follow-ups refer to this):\n${turns.length ? turns.map(t => `- ${Math.round((now.getTime() - Date.parse(t.at)) / 60000)} min ago, user said: "${t.said}"\n  people: ${t.people.map(x => `${x.name} [${x.id}]`).join(', ') || 'none'}\n  actions: ${t.actions.map(a => `${a.id} ${a.type} ${a.contact_id ? `→ ${a.contact_name} [${a.contact_id}] ` : ''}${a.title || a.text ? `"${(a.title || a.text).slice(0, 80)}" ` : ''}${a.when_iso ? `at ${a.when_iso} ` : ''}${a.amount_inr ? `₹${a.amount_inr} ` : ''}· ${a.status.toUpperCase()}`).join(' | ') || 'none'}`).join('\n') : '- (new conversation)'}`,
    `TIMELINE (structured, upcoming): ${JSON.stringify([...state.calendar.filter(c => Date.parse(c.when_iso) > now.getTime() - 3600e3).map(c => ({ what: c.title, with: c.contact ?? null, at: c.when_iso })), ...state.reminders.map(r => ({ what: `reminder: ${r.title}`, at: r.when_iso }))].slice(0, 12))}`,
    `PREFERENCES AND HABITS:\n${state.memory.filter(m => !m.learned).map(m => `- ${m.fact}`).join('\n') || '- none'}`,
    `CORRECTIONS THE USER MADE (always follow): ${JSON.stringify(state.memory.filter(m => m.kind === 'alias').map(m => ({ said: m.mention, topic: m.topic ?? 'any', means: m.about })))}`,
    `LEARNED NOTES:\n${state.memory.filter(m => m.learned && m.kind !== 'alias').map(m => `- ${m.fact}`).join('\n') || '- none'}`,
    `RELEVANT FACTS ABOUT THESE PEOPLE:\n${kb.facts.map(f => `- ${f.text}`).join('\n') || '- none'}`,
    `RECENT ACTIVITY (calls and messages):\n${kb.recent.join('\n')}`,
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
