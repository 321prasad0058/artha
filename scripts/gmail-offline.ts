// Runs the Gmail connector's triage → extraction → filing on the fictional inbox, without Gmail, and checks each mail's
// expected outcome (keep / skip / never store / flag as scam). Then prints what landed in the person's context.
//   npx tsx scripts/gmail-offline.ts
import { extract, file, triage, type Mail } from '../server/connectors/gmail.ts';
import { ROHAN_INBOX } from '../data/mock-mail/rohan.ts';
import { freshState, persona } from '../server/store.ts';
process.loadEnvFile('.env');

const p = persona('rohan'), state = freshState(p), now = new Date();
const mails: Mail[] = ROHAN_INBOX.map(m => ({ id: m.id, from: m.from, fromName: m.fromName, subject: m.subject, date: String(now.getTime() - m.daysAgo * 864e5),
  labels: ['INBOX', `CATEGORY_${m.category.toUpperCase()}`], bulk: !!m.bulk, body: m.body }));
const verdict = new Map(mails.map(m => [m.id, triage(m)]));
const kept = mails.filter(m => verdict.get(m.id) === 'keep');
const t0 = Date.now();
const items = await extract(kept, p, now);
const stats = file(state, p, kept, items);
const ms = Date.now() - t0;
let ok = 0;
for (const m of ROHAN_INBOX) {
  const v = verdict.get(m.id), it = items.find(x => x.id === m.id);
  const got = v === 'otp' ? 'never-store' : v === 'skip' ? 'skip' : it?.kind === 'scam' ? 'flag-scam' : it?.keep ? 'keep' : 'dropped';
  const pass = got === m.expect; if (pass) ok++;
  console.log(`${pass ? '✓' : '✗'} ${m.expect.padEnd(11)} ${m.subject.slice(0, 52).padEnd(52)} ${it ? `→ ${it.kind}${it.contact_id !== 'none' ? ` [${it.contact_id}]` : ` (${it.name})`}${it.when_iso ? ` @${it.when_iso.slice(0, 16)}` : ''}${it.amount_inr ? ` ₹${it.amount_inr} ${it.money}` : ''}` : ''}`);
}
console.log(`\n${ok}/${ROHAN_INBOX.length} as expected · ${kept.length} mails read by AI in ${ms} ms · filed:`, stats);
console.log('\nNEW PEOPLE:', (state.people ?? []).map(x => `${x.name} (${x.rel})`).join(' · '));
console.log('\nFACTS:'); for (const f of state.memory.filter(m => m.kind === 'email')) console.log(' -', f.fact, f.about ? `[${f.about}]` : '');
console.log('\nPLANS:'); for (const c of state.calendar.filter(c => c.added)) console.log(' -', c.when_label, '·', c.title);
console.log('\nKHATA:'); for (const b of state.book ?? []) console.log(' -', b.kind, b.party, `₹${b.amount}`, b.day, b.status);
console.log('\nOTP text stored anywhere?', JSON.stringify(state).includes('482913') ? 'YES ✗' : 'no ✓');
