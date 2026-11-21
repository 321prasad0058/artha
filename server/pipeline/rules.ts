// Stage 5 (code): rules the model cannot talk its way around.
import type { Action, Check, Clarify, Mention, Persona } from '../types.js';

const SECRET_WORD = /(\bo\s?t\s?p\b|o\.t\.p|oteepee|otipi|oteepi|\bpin\b(?!\s*-?\s*code)|\bupi pin\b|\bcvv\b|password|passcode|\bmpin\b|ओटीपी|पासवर्ड|ఓటీపీ|ஓடிபி)/i;
const DIGITS = /\d(?:[\s-]?\d){3,}/;
const NUM_WORDS = /\b(ek|do|teen|char|chaar|paanch|chhe|saat|aath|nau|zero|shunya|one|two|three|four|five|six|seven|eight|nine|okati|rendu|moodu|naalugu|aidu|onnu|moonu|naalu|anju)\b/gi;

/** Rule 1, before any model call: never send an OTP/PIN/password anywhere. */
export function secretCheck(original: string, roman: string): { blocked: boolean; masked: string } {
  const text = `${original} ${roman}`;
  const hasWord = SECRET_WORD.test(text);
  const spokenDigits = (roman.match(NUM_WORDS) ?? []).length >= 4;
  const blocked = hasWord && (DIGITS.test(text) || spokenDigits);
  return { blocked, masked: original.replace(/\d(?:[\s-]?\d){3,}/g, '••••') };
}
export const maskNumbers = (s: string) => s.replace(/\d(?:[\s-]?\d){5,}/g, '••••');

/** Rules 2–6, after planning. Returns cleaned actions and a visible list of checks. */
export function checkActions(actions: Action[], p: Persona, now = new Date()): { actions: Action[]; checks: Check[] } {
  const checks: Check[] = [];
  const out: Action[] = [];
  for (const a of actions.slice(0, 6)) {
    const c = p.contacts.find(x => x.id === a.contact_id);
    const needsContact = ['message', 'call', 'payment', 'ledger'].includes(a.type);
    if (needsContact && !c) { checks.push({ rule: `Dropped a ${a.type}: no saved contact`, ok: false }); continue; }
    if (c) a.contact_name = c.name;
    if (a.type === 'payment' || a.type === 'ledger') {
      if (!(a.amount_inr > 0)) { checks.push({ rule: `Dropped a ${a.type}: no clear amount`, ok: false }); continue; }
      if (a.type === 'payment') a.needs_confirm = true;
    }
    if (a.when_iso) {
      const t = Date.parse(a.when_iso);
      if (Number.isNaN(t)) a.when_iso = '';
      else if (t < now.getTime() - 5 * 60e3) checks.push({ rule: `“${a.title || a.type}” is in the past`, ok: false, note: a.when_label });
    }
    a.text = maskNumbers(a.text); a.goal = maskNumbers(a.goal);
    if (a.type === 'message' && c && a.language && !c.lang.toLowerCase().includes(a.language.toLowerCase().split(/[ /]/)[0])) {
      checks.push({ rule: `Message to ${c.name} is in ${a.language}, but they prefer ${c.lang}`, ok: false });
    }
    out.push(a);
  }
  if (out.some(a => a.type === 'payment')) checks.push({ rule: 'Money always needs your confirmation', ok: true });
  else checks.push({ rule: 'No money moves', ok: true });
  checks.push({ rule: 'No OTP, PIN or long ID numbers in any action', ok: true });
  if (out.some(a => a.contact_id)) checks.push({ rule: 'Every person is a saved contact', ok: true });
  return { actions: out, checks };
}

/** Ask only when it is a real tie, or a close call where a wrong guess moves money.
 *  Otherwise Artha acts on its best guess and offers the runner-up as a one-tap "change". */
export function needsClarify(mentions: Mention[], forced: Record<string, string>, question: string, actions: Action[] = []): Clarify | null {
  for (const m of mentions) {
    if (m.kind !== 'person' || forced[m.text]) continue;
    const c = [...m.candidates].sort((a, b) => b.score - a.score);
    if (c.length < 2 || c[1].score < 0.25) continue;
    const gap = c[0].score - c[1].score;
    const moneyAtStake = actions.some(a => (a.type === 'payment' || a.type === 'ledger') && [c[0].id, c[1].id].includes(a.contact_id));
    if (gap < 0.08 || (gap < 0.2 && moneyAtStake)) {
      return { mention: m.text, question: question || `Which ${m.text} did you mean?`, options: c.slice(0, 3).filter(x => x.score >= 0.2).map(x => ({ id: x.id, label: x.name })) };
    }
  }
  return null;
}
