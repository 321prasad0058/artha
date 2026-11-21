// Stage 3a (code): who could this note be about?
// Matches names, nicknames and relationship words against the person's contacts by how they SOUND,
// handles Indian case endings stuck to names (Ammaki, Lakshmi akka la, Selvi-kku, Rahul-ne),
// and adds recently active people for "usko", "wahi wala", "jo kal call aaya tha".
import type { Candidate, Persona } from '../types.js';

/** Phonetic key: collapses the spellings Indians use for the same sound. */
export function soundKey(w: string): string {
  return w.toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/aa/g, 'a').replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u').replace(/ai/g, 'e').replace(/au/g, 'o')
    .replace(/w/g, 'v').replace(/ph|f/g, 'p').replace(/z/g, 'j').replace(/q/g, 'k').replace(/x/g, 'ks')
    .replace(/sh|ss/g, 's').replace(/chh|ch/g, 'c').replace(/th/g, 't').replace(/dh/g, 'd').replace(/bh/g, 'b').replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/jh/g, 'j')
    .replace(/(.)\1+/g, '$1')
    .replace(/h$/, '').replace(/a$/, '');
}

// Indian case markers that get glued onto names in speech or transcripts.
const SUFFIXES = ['kku', 'ku', 'ki', 'ko', 'ke', 'ka', 'la', 'na', 'ne', 'ni', 'nu', 'chi', 'che', 'cha', 'kitte', 'tho', 'to', 'ji', 'garu'];
function stripSuffix(token: string): string[] {
  const out = [token];
  for (const s of SUFFIXES) if (token.length > s.length + 2 && token.endsWith(s)) out.push(token.slice(0, -s.length));
  return out;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const close = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && lev(a, b) <= 1);

const RELATION_WORDS = ['anna', 'akka', 'bhaiya', 'bhaiyya', 'bhai', 'didi', 'tai', 'dada', 'kaka', 'kaku', 'mama', 'mami', 'amma', 'ammi', 'abbu', 'aai', 'baba', 'papa', 'mummy', 'uncle', 'aunty', 'sir', 'madam', 'ji', 'doctor', 'kanna'];
const POINTERS = /\b(usko|usse|uske|unko|unhe|wahi|vahi|woh|vo|jo|tyala|tila|tyanna|vaadu|vallaki|avanga|avarkku|him|her|them)\b/;

/** Words to hint the transcription model with: every contact name and nickname (bounded). */
export function hintWords(p: Persona): string[] {
  const words = new Set<string>();
  for (const c of p.contacts) { words.add(c.name.replace(/[“”"()]/g, '')); c.aliases.forEach(a => words.add(a)); }
  return [...words].slice(0, 60);
}

export function findCandidates(roman: string, p: Persona, limit = 8): Candidate[] {
  const tokens = roman.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const keys = tokens.map(t => stripSuffix(t).map(soundKey));
  const scored = new Map<string, Candidate>();
  const bump = (id: string, score: number, why: string) => {
    const c = p.contacts.find(x => x.id === id)!;
    const prev = scored.get(id);
    if (!prev || prev.score < score) scored.set(id, { id, name: c.name, rel: c.rel, score, why });
  };

  for (const c of p.contacts) {
    for (const term of [c.name, ...c.aliases]) {
      const parts = term.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w && !['dr', 'the'].includes(w)).map(soundKey).filter(Boolean);
      if (!parts.length) continue;
      // find the term's words in order, each matching a token (with case endings stripped)
      for (let i = 0; i < keys.length; i++) {
        let ok = true;
        for (let k = 0; k < parts.length; k++) if (!keys[i + k] || !keys[i + k].some(key => close(key, parts[k]))) { ok = false; break; }
        if (!ok) continue;
        const relOnly = parts.length === 1 && RELATION_WORDS.includes(term.toLowerCase());
        const score = relOnly ? 0.5 : parts.length > 1 ? 0.95 : term === c.name ? 0.9 : 0.8;
        bump(c.id, score, relOnly ? `You call them “${term}”` : `Matches “${term}”`);
      }
    }
  }

  // "usko / wahi wala / jo kal aaya tha": offer the most recently active people
  if (POINTERS.test(` ${roman.toLowerCase()} `) || scored.size === 0) {
    const recent = [...p.events].sort((a, b) => b.day - a.day || b.time.localeCompare(a.time)).slice(0, 4);
    recent.forEach((e, i) => { if (p.contacts.some(c => c.id === e.contact)) bump(e.contact, 0.35 - i * 0.05, `Recently active: “${e.text.slice(0, 50)}”`); });
  }

  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
