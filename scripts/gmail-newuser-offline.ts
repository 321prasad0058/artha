// A brand-new user built only from the fictional Aarav inbox (no Gmail): profile, contacts, then filing.
import { buildProfile, extract, file, triage, type Mail } from '../server/connectors/gmail.ts';
import { AARAV_INBOX } from '../data/mock-mail/aarav.ts';
import { freshState } from '../server/store.ts';
import type { Persona } from '../server/types.ts';
process.loadEnvFile('.env');
const now = new Date();
let p: Persona = { id: 'u-offline', source: 'gmail', email: 'artha.person@gmail.com', name: 'Artha Person', age: 0, about: '', city: '', speaks: ['English'], avatar: 'AP', contacts: [], events: [], memory: [], calendar: [], ledger: [] };
const mails: Mail[] = AARAV_INBOX.map(m => ({ id: m.id, from: m.from, fromName: m.fromName, subject: m.subject, date: String(now.getTime() - m.daysAgo * 864e5), labels: ['INBOX', `CATEGORY_${m.category.toUpperCase()}`], bulk: !!m.bulk, body: m.body }));
const kept = mails.filter(m => triage(m) === 'keep');
let t = Date.now(); p = await buildProfile(kept, p, now); const tp = Date.now() - t;
console.log(`PROFILE (${tp} ms): ${p.name}, ${p.age || '?'} · ${p.city} · speaks ${p.speaks.join(', ')}\n  ${p.about}`);
for (const c of p.contacts) console.log(`  - ${c.name.padEnd(26)} ${c.rel.padEnd(42)} ${c.lang.padEnd(8)} called: ${c.aliases.join(', ')}`);
const state = freshState(p);
t = Date.now(); const items = await extract(kept, p, now); const stats = file(state, p, kept, items);
console.log(`\nFILED (${Date.now() - t} ms):`, stats);
console.log('PLANS:'); for (const c of state.calendar) console.log('  -', c.when_label, '·', c.title, c.contact ? `[${p.contacts.find(x => x.id === c.contact)?.name}]` : '');
console.log('KHATA:'); for (const b of state.book ?? []) console.log('  -', b.kind, b.party, `₹${b.amount}`, b.day);
console.log('FACTS (first 8):'); for (const f of state.memory.slice(0, 8)) console.log('  -', f.fact);
