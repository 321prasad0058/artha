// The new-user journey without Google: builds "Aarav" from the fictional demo inbox (data/mock-mail),
// exactly as a Google sign-in would (profile → who's who → filing), and saves him as user u-demo-aarav.
// Then open http://localhost:8787/?p=u-demo-aarav (or :5173 in dev).
import { buildProfile, extract, file, triage, type Mail } from '../server/connectors/gmail.ts';
import { AARAV_INBOX, AARAV_MORE } from '../data/mock-mail/aarav.ts';
import { freshState, saveState, saveUser } from '../server/store.ts';
import type { Persona } from '../server/types.ts';
try { process.loadEnvFile('.env'); } catch { /* use the real environment */ }

const ID = 'u-demo-aarav';
const now = new Date();
let p: Persona = { id: ID, source: 'gmail', email: 'artha.person@gmail.com', name: 'Artha Person', age: 0, about: '', city: '', speaks: ['English'], avatar: 'AP', contacts: [], events: [], memory: [], calendar: [], ledger: [] };
const mails: Mail[] = [...AARAV_INBOX, ...AARAV_MORE].map(m => ({ id: m.id, from: m.from, fromName: m.fromName, subject: m.subject, date: String(now.getTime() - m.daysAgo * 864e5), labels: ['INBOX', `CATEGORY_${m.category.toUpperCase()}`], bulk: !!m.bulk, body: m.body }));
const otp = mails.filter(m => triage(m) === 'otp');
const kept = mails.filter(m => triage(m) === 'keep');   // OTP mails are dropped here, before any model sees them
console.log(`Reading ${mails.length} demo mails: ${kept.length} kept, ${otp.length} OTP never opened`);

p = await buildProfile(kept, p, now);
p.avatar = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
await saveUser(p);
console.log(`Profile: ${p.name} · ${p.city} · ${p.contacts.length} people`);

const state = freshState(p);
for (const c of p.contacts) state.threads[c.id] ??= [];
const items = await extract(kept, p, now);
const stats = file(state, p, kept, items);
state.gmail = { email: p.email ?? '', lastSync: now.toISOString(), historyId: '', seen: mails.map(m => m.id),
  stats: { scanned: mails.length, kept: kept.length, skipped: mails.length - kept.length - otp.length, otp: otp.length, ...stats } } as any;
await saveState(state);
console.log('Filed:', stats);
console.log(`\nReady: open /?p=${ID}`);
