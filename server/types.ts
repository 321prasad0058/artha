export type Contact = { id: string; name: string; rel: string; lang: string; aliases: string[]; upi?: string };
export type Persona = {
  id: string; name: string; age: number; about: string; city: string; speaks: string[]; avatar: string;
  contacts: Contact[];
  events: { day: number; time: string; contact: string; text: string }[];
  memory: { fact: string; src: string }[];
  calendar: { title: string; day: number; time: string; contact?: string }[];
  ledger: { contact: string; amount: number; note: string; day: number }[];
};

export type Mode = 'artha' | 'base' | 'base_ctx';
export type EntityKind = 'person' | 'time' | 'money' | 'event' | 'place' | 'secret';

/** Something the code (not the model) understood: a date, time or amount. */
export type Entity = { text: string; kind: 'date' | 'time' | 'money'; label: string; iso?: string; amount?: number };

export type Candidate = { id: string; name: string; rel: string; score: number; why: string };
export type Mention = { text: string; kind: EntityKind; value: string; candidates: { id: string; name: string; score: number; why: string }[] };

export type ActionType = 'message' | 'call' | 'reminder' | 'calendar' | 'payment' | 'ledger' | 'suggestion';
export type Action = {
  /** Stable id ("<turn>:<n>") so a later note or a tap can refer back to this exact action. */
  id?: string;
  type: ActionType; contact_id: string; contact_name: string; language: string; text: string; gloss: string;
  goal: string; title: string; when_iso: string; when_label: string; amount_inr: number; predicted: boolean; why: string;
  needs_confirm?: boolean;
  /** Other people this could have meant, offered as one-tap "change" instead of a question. */
  alternatives?: { id: string; name: string }[];
  mention?: string;
  /** One-tap links that open the right app on a phone (WhatsApp, dialler, Google Calendar, UPI). */
  links?: { kind: string; label: string; href: string }[];
};

export type Check = { rule: string; ok: boolean; note?: string };
export type Clarify = { mention: string; question: string; options: { id: string; label: string }[] };

export type Result = {
  mode: Mode;
  transcript: string;
  roman: string;
  language: string;
  entities: Entity[];
  candidates: Candidate[];
  mentions: Mention[];
  actions: Action[];
  clarify: Clarify | null;
  blocked: boolean;
  checks: Check[];
  learn: string[];
  reply: string;
  /** The reply in the user's native script, for text-to-speech. */
  reply_speech?: string;
  /** Existing timeline items this note was about (e.g. "already in your calendar"), kept for follow-ups. */
  refs?: { type: ActionType; title: string; when_iso: string; contact_id: string }[];
  topics?: string[];
  ms: { meaning: number; who: number; plan: number };
};

export type State = {
  persona: string;
  memory: { fact: string; src: string; at: string; learned?: boolean; kind?: string; about?: string; mention?: string; topic?: string }[];
  threads: Record<string, { me: boolean; text: string; at: string; via?: string }[]>;
  calendar: { title: string; when_iso: string; when_label: string; contact?: string; added?: boolean }[];
  reminders: { title: string; when_label: string; when_iso: string }[];
  ledger: { contact: string; amount: number; note: string; at: string }[];
  payments: { contact: string; amount: number; upi: string; at: string }[];
  calls: { contact: string; goal: string; at: string; status: string }[];
  notes: number;
  /** The conversation so far: what was said, who it was about, what was proposed and what was done. */
  turns?: Turn[];
};

export type Turn = {
  id: string; at: string; said: string;
  people: { mention: string; id: string; name: string }[];
  actions: { id: string; type: ActionType; contact_id: string; contact_name: string; title: string; text: string; when_iso: string; when_label: string; amount_inr: number; status: 'proposed' | 'done' | 'skipped' }[];
  reply: string;
};
