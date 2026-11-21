// The pipeline. Artha mode: code stages + one model call that can only choose saved people.
// Base modes exist so the same recording can be compared: plain model, and plain model + pasted context.
import { jsonCall } from '../openai.js';
import type { Action, Candidate, Mention, Mode, Persona, Result, State } from '../types.js';
import { retrieve } from '../kb.js';
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
    type: 'object', additionalProperties: false, required: ['language', 'mentions', 'actions', 'clarify_question', 'learn', 'reply'],
    properties: {
      language: { type: 'string' },
      mentions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'kind', 'value', 'candidates'], properties: {
        text: { type: 'string' }, kind: { type: 'string', enum: ['person', 'time', 'money', 'event', 'place', 'secret'] }, value: { type: 'string' },
        candidates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'score', 'why'], properties: { id: cand, score: { type: 'number' }, why: { type: 'string' } } } } } } },
      actions: { type: 'array', items: actionSchema(contactIds) },
      clarify_question: { type: 'string' },
      learn: { type: 'array', items: { type: 'string' } },
      reply: { type: 'string' },
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
- message: write "text" in the RECIPIENT's preferred language (their "lang"), in Roman script, short, natural and respectful for the relationship. Put the English meaning in "gloss".
- call: when something must be arranged or changed with someone (rescheduling, asking, booking). Put the outcome wanted in "goal".
- reminder or calendar: for times the user must remember or plans they made.
- payment: only when the user asks to pay or send money; set amount_inr.
- ledger: credit (udhaar/khata) entries for a shop; set amount_inr and contact.
- suggestion: at most one helpful next step predicted from a clear habit in MEMORY (for example, a reminder 1 hour before appointments). Mark predicted=true. Do not invent habits.
- Never put an OTP, PIN, password, card or Aadhaar number into any action.
- Fill fields that don't apply with "" , 0 or false. contact_id is "none" when no person applies.

Also
- clarify_question: if two people fit about equally, a short question in the user's own language and script style, otherwise "".
- learn: 0 to 2 short new facts worth remembering (a changed plan, a new preference). Not things already in MEMORY.
- reply: one short confirmation to the user, in their own language mix, Roman script.
- mentions: list ONLY people mentioned, using the exact words from the transcript.
- Keep every "why" under 10 words. Be brief everywhere: speed matters.`;

const BASE_INSTRUCTIONS = `Turn this transcribed voice note into a list of actions (message, call, reminder, calendar, payment, ledger, suggestion). Use contact_id for the person's name as you understand it. Fill fields that don't apply with "", 0 or false. reply: a one-line confirmation. mentions: people, times and amounts mentioned, with empty candidates. learn: empty. clarify_question: "".`;

function istNowLabel(now: Date) {
  return now.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
function eventWhen(day: number, time: string, now: Date) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now.getTime() + day * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return labelOf(isoOf({ y: +p.year, m: +p.month, d: +p.day }, h, m));
}

type PlanOut = { language: string; mentions: Mention[]; actions: Action[]; clarify_question: string; learn: string[]; reply: string };

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
    });
  }

  let t = Date.now();
  const norm = normalise(roman, now);
  const msMeaning = Date.now() - t;

  t = Date.now();
  // Knowledge base retrieval: likely people, facts about them, the topic, what the user taught before.
  const kb = retrieve(roman, p, state, now);
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
    `RELEVANT FACTS:\n${kb.facts.map(f => `- ${f.text}`).join('\n') || '- none'}`,
    `RECENT ACTIVITY:\n${kb.recent.join('\n')}`,
    `CALENDAR: ${state.calendar.map(c => `${c.title} (${c.when_label})`).join('; ') || 'empty'}`,
    state.ledger.length && kb.topics.some(t => t.startsWith('shop')) ? `LEDGER (credit due): ${state.ledger.map(l => `${p.contacts.find(c => c.id === l.contact)?.name}: ₹${l.amount} ${l.note}`).join('; ')}` : '',
    Object.keys(forced).length ? `FORCED: ${JSON.stringify(forced)} (the user already chose these people)` : '',
  ].filter(Boolean).join('\n\n');

  t = Date.now();
  const out = await jsonCall<PlanOut>({ name: 'artha_plan', instructions: ARTHA_INSTRUCTIONS, input, schema: planSchema(null) }); // fixed schema = cached by OpenAI; ids are validated in code below
  const msPlan = Date.now() - t;

  // Make every mention's candidates readable and honour forced picks
  const mentions: Mention[] = out.mentions.map(m => ({
    ...m,
    candidates: (forced[m.text] ? [{ id: forced[m.text], score: 1, why: 'You told Artha' }] : m.candidates)
      .filter(c => p.contacts.some(x => x.id === c.id)).map(c => ({ ...c, name: p.contacts.find(x => x.id === c.id)!.name })),
  }));

  const planned = out.actions.map(a => ({ ...a, contact_name: '' }));
  const clarify = needsClarify(mentions, forced, out.clarify_question, planned);
  const { actions, checks } = clarify ? { actions: [], checks: [{ rule: 'A true tie between two people, so Artha asks once', ok: true }] } : checkActions(planned, p, now);
  // A time said in the note belongs on the action, even if the model only wrote it into the message text.
  if (norm.when) for (const a of actions) if (!a.when_iso && ['message', 'call', 'reminder', 'calendar'].includes(a.type)) { a.when_iso = norm.when.iso; a.when_label = norm.when.label; }
  // Fewer questions: attach the runner-up to each action as a one-tap "change".
  for (const a of actions) {
    const m = mentions.find(x => x.kind === 'person' && x.candidates.some(c => c.id === a.contact_id));
    if (!m) continue;
    a.mention = m.text;
    a.alternatives = [...m.candidates].sort((x, y) => y.score - x.score).filter(c => c.id !== a.contact_id && c.score >= 0.15).slice(0, 2).map(c => ({ id: c.id, name: c.name }));
    if (!a.alternatives.length) a.alternatives = shortlist.filter(c => c.id !== a.contact_id && c.score >= 0.3).slice(0, 2).map(c => ({ id: c.id, name: c.name }));
  }

  return {
    mode, transcript, roman, language: out.language, entities: norm.entities, candidates: shortlist, mentions, actions, clarify, blocked: false, checks,
    learn: clarify ? [] : out.learn.filter(l => l && l.length < 160).slice(0, 2), reply: clarify ? '' : out.reply, topics: kb.topics, ms: { meaning: msMeaning, who: msWho, plan: msPlan },
  };
}
