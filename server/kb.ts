// The personal knowledge base. Built from the person's contacts, history and saved facts, indexed so that
// one voice note retrieves only what matters: the people it can mean, facts about them, the topic it is about,
// and what the user taught Artha before. Retrieval is code (fast, explainable); the model only sees the result.
import type { Candidate, Persona, State } from './types.js';
import { findCandidates, soundKey } from './pipeline/candidates.js';

export type Topic = 'work' | 'health' | 'delivery' | 'transport' | 'family' | 'home' | 'shop_credit' | 'shop_supply' | 'money' | 'fitness' | 'risk';

// What each relationship is about.
const REL_TAGS: [RegExp, Topic[]][] = [
  [/office|colleague|client|manager/i, ['work']],
  [/doctor|clinic|chemist|pharmac|heart/i, ['health']],
  [/delivery/i, ['delivery']],
  [/rapido|driver|auto/i, ['transport', 'money']],
  [/mother|father|wife|husband|son|daughter|cousin|sister|brother|in-law|amma|abbu/i, ['family']],
  [/house help|milkman|gas|secretary|neighbour/i, ['home']],
  [/customer/i, ['shop_credit']],
  [/supplier|distributor/i, ['shop_supply', 'money']],
  [/trainer|gym/i, ['fitness']],
  [/unverified|unknown/i, ['risk']],
];
// What a note is about, from its words (romanised, any language).
const NOTE_TOPICS: [RegExp, Topic][] = [
  [/\b(meeting|meet|office|review|sync|presentation|deck|client|deadline|q4|q3|kaam ka|standup)\b/, 'work'],
  [/\b(doctor|daktar|appointment|apointment|dawai|davai|dava|medicine|tablet|goli|marunthu|mandu|aushadh|sugar|bp|checkup|clinic|reports?)\b/, 'health'],
  [/\b(parcel|paarsal|order|delivery|courier|packet|dabba)\b/, 'delivery'],
  [/\b(ride|drop|pickup|auto|rapido|cab|gaadi|temple|kovil)\b/, 'transport'],
  [/\b(lunch|dinner|bhojanam|khana|jevan|saapadu|ghar|ghari|intiki|veetuku)\b/, 'family'],
  [/\b(kaam|kamala|pani|vela|doodh|dudh|milk|cylinder|safai)\b/, 'home'],
  [/\b(khata|khaata|khate|udhaar|udhar|credit|likh|likho|hisaab|hisab)\b/, 'shop_credit'],
  [/\b(maal|bori|atta|aata|dal|carton|stock|supply|bill)\b/, 'shop_supply'],
  [/\b(paise|paisa|pay|upi|bhej|bhejo|rupaye|rupees|fare)\b/, 'money'],
  [/\b(gym|workout|session|trainer)\b/, 'fitness'],
];

export type KbFact = { text: string; about: string[]; kind: string; src: string; learned: boolean; mention?: string; topic?: string };
export type Retrieved = {
  topics: Topic[];
  candidates: Candidate[];
  facts: KbFact[];
  recent: string[];
  taught: { mention: string; id: string }[];
};

export function tagsOf(rel: string): Topic[] {
  return REL_TAGS.filter(([re]) => re.test(rel)).flatMap(([, t]) => t);
}
export function topicsOf(roman: string): Topic[] {
  const t = ` ${roman.toLowerCase()} `;
  return [...new Set(NOTE_TOPICS.filter(([re]) => re.test(t)).map(([, k]) => k))];
}

/** Link every saved fact to the people it mentions. */
export function factsOf(p: Persona, s: State): KbFact[] {
  return s.memory.map(m => {
    const lower = m.fact.toLowerCase();
    const about = m.about ? [m.about] : p.contacts.filter(c => lower.includes(c.name.toLowerCase().replace(/[“”"]/g, '').split(' (')[0]) || c.aliases.some(a => a.length > 3 && lower.includes(a.toLowerCase()))).map(c => c.id);
    return { text: m.fact, about, kind: m.kind ?? (m.learned ? 'note' : 'habit'), src: m.src, learned: !!m.learned, mention: m.mention, topic: m.topic };
  });
}

export function retrieve(roman: string, p: Persona, s: State, now = new Date()): Retrieved {
  const topics = topicsOf(roman);
  const facts = factsOf(p, s);
  const byId = new Map<string, Candidate>(findCandidates(roman, p, 10).map(c => [c.id, { ...c }]));
  const tokens = roman.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const keys = new Set(tokens.map(soundKey));
  const contact = (id: string) => p.contacts.find(c => c.id === id)!;
  const note = (c: Candidate, why: string) => (c.why = c.why.includes(why) ? c.why : `${c.why}; ${why}`);

  // 1) What the user taught Artha before ("Rahul" about work = Rahul Verma). Strongest signal.
  const taught: Retrieved['taught'] = [];
  for (const f of facts) {
    if (f.kind !== 'alias' || !f.mention || !f.about[0]) continue;
    const mk = f.mention.toLowerCase().split(/\s+/).map(soundKey);
    if (!mk.every(k => keys.has(k))) continue;
    if (f.topic && topics.length && !topics.includes(f.topic as Topic)) continue;
    const id = f.about[0];
    const c = byId.get(id) ?? { id, name: contact(id).name, rel: contact(id).rel, score: 0, why: '' };
    c.score = Math.max(c.score, 0.97); note(c, 'You told Artha before');
    byId.set(id, c); taught.push({ mention: f.mention, id });
  }
  // 2) Topic fit: "meeting" → work contacts, "dawai" → health contacts.
  for (const c of byId.values()) {
    const fit = tagsOf(contact(c.id).rel).filter(t => topics.includes(t));
    if (c.score > 0 && fit.length) { c.score = Math.min(0.99, c.score + 0.12); note(c, `Fits the topic (${fit[0].replace('_', ' ')})`); }
  }
  // 3) Shared words with a recent conversation: "Pune kab aa raha hai" → the cousin who asked about Pune.
  const STOP = new Set(['kya', 'hai', 'hain', 'aur', 'karo', 'kar', 'dena', 'bolo', 'bata', 'ko', 'ki', 'ka', 'ke', 'the', 'and', 'please', 'aaj', 'kal', 'will', 'your', 'aahe', 'naka', 'cheppu', 'sollu']);
  const noteWords = new Set(tokens.filter(w => w.length >= 4 && !STOP.has(w)));
  for (const c of byId.values()) {
    if (c.score <= 0) continue;
    const said = p.events.filter(e => e.contact === c.id).flatMap(e => e.text.toLowerCase().split(/[^a-z]+/));
    const shared = said.find(w => w.length >= 4 && !STOP.has(w) && noteWords.has(w));
    if (shared) { c.score = Math.min(0.99, c.score + 0.12); note(c, `You talked about “${shared}”`); }
  }
  // 4) Recency: someone you were talking to today is more likely.
  const today = p.events.filter(e => e.day === 0).map(e => e.contact);
  for (const c of byId.values()) if (c.score > 0 && today.includes(c.id)) { c.score = Math.min(0.99, c.score + 0.05); note(c, 'Spoke today'); }

  const candidates = [...byId.values()].sort((a, b) => b.score - a.score);
  const top = new Set(candidates.filter(c => c.score >= 0.3).slice(0, 4).map(c => c.id));

  // Facts: about the likely people, or about the topic, plus standing habits. Bounded.
  const relevant = facts.filter(f => f.about.some(a => top.has(a)) || (f.topic && topics.includes(f.topic as Topic)));
  const habits = facts.filter(f => !relevant.includes(f) && f.kind === 'habit' && (f.about.length === 0 || /remind|always|every/i.test(f.text)));
  const factsOut = [...relevant, ...habits].slice(0, 10);

  // Recent activity with those people first, then the latest overall.
  const fmt = (e: Persona['events'][number]) => `${e.day === 0 ? 'Today' : e.day === -1 ? 'Yesterday' : `${-e.day} days ago`} ${e.time} — ${contact(e.contact)?.name ?? e.contact}: ${e.text}`;
  const sorted = [...p.events].sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));
  const recent = [...sorted.filter(e => top.has(e.contact)).slice(0, 5), ...sorted.filter(e => !top.has(e.contact)).slice(0, 3)].map(fmt);

  void now;
  return { topics, candidates, facts: factsOut, recent, taught };
}
