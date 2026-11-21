// End-to-end test, person by person, through the same API routes the app uses.
// For each note: understand → check against what the person meant → carry out every action (as tapping would)
// → verify the phone links (WhatsApp / dialler / Google Calendar / UPI) → show what changed in their data.
// Memory carries over within a person, so corrections made in one note must show up in the next.
import fs from 'node:fs';
import { handle } from '../server/handler.ts';
import type { Action, Result, State } from '../server/types.ts';

process.loadEnvFile('.env');
type Exp = { contact?: string; type?: string[]; amount?: number; hour?: number; day?: number; lang?: string; blocked?: boolean; none?: boolean };
type Step = { say: string; expect: Exp[] | { blocked: true }; change?: { mention: string; to: string; ifNot: string }; note?: string };
const PLAN: Record<string, Step[]> = {
  aditya: [
    { say: 'Anna ko bol do parcel security pe chhod de, aur Mehta ji wala appointment parso shaam ko shift karwa do.', expect: [{ contact: 'santosh', type: ['message'], lang: 'Telugu' }, { contact: 'mehta', type: ['call', 'message'], day: 2, hour: 18 }], note: 'two requests in one note' },
    { say: 'Shankar bhaiya ko dhai sau bhej do.', expect: [{ contact: 'shankar', type: ['payment'], amount: 250 }] },
    { say: 'Priya ko bolo aaj dinner bahar karte hain, saadhe aath baje, aur calendar mein daal do.', expect: [{ contact: 'priya', type: ['message'] }, { type: ['calendar', 'reminder'], day: 0, hour: 20 }] },
    { say: 'అమ్మకి చెప్పు, రేపు మధ్యాహ్నం లంచ్‌కి వస్తాను.', expect: [{ contact: 'amma', type: ['message'], lang: 'Telugu' }], note: 'Telugu script' },
    { say: 'Rahul ko bol do kal ki meeting 4 baje rakhte hain.', expect: [{ contact: 'rahul_v', type: ['message'], day: 1, hour: 16 }], note: 'two Rahuls: topic decides' },
    { say: 'Rahul ko poocho Pune kab aa raha hai.', expect: [{ contact: 'rahul_k', type: ['message'] }], note: 'two Rahuls: past conversation decides' },
    { say: 'Usko bol do 10 minute mein neeche aa raha hoon, parcel le leta hoon.', expect: [{ contact: 'santosh', type: ['message'] }], note: '"usko": who was it?' },
    { say: 'HDFC wale ko OTP bata do, 4 8 2 9 1 3.', expect: { blocked: true } },
  ],
  sunita: [
    { say: 'Pawar doctoranna sanga, udya sakali akra vajta yete.', expect: [{ contact: 'dr_pawar', type: ['message', 'call'], day: 1, hour: 11 }], note: 'two Pawars' },
    { say: 'Dudhwalyanna ya mahinyache paise pathav.', expect: [{ contact: 'pawar_milk', type: ['payment'], amount: 1850 }], note: 'amount comes from his last message' },
    { say: 'Tai la sang aaj sandhyakali ghari ye, puran poli kele aahe.', expect: [{ contact: 'vaishali', type: ['message'] }], change: { mention: 'Tai', to: 'vaishali', ifNot: 'vaishali' }, note: 'two "tai"s; if wrong, Sunita taps ⇄ once' },
    { say: 'Tai la sang ravivari jevayla ye.', expect: [{ contact: 'vaishali', type: ['message'] }], note: 'remembers the correction' },
    { say: 'Rohit la sang, Diwali nantar ye, mi vaat baghte.', expect: [{ contact: 'rohit', type: ['message'], lang: 'English' }], note: 'son prefers English' },
    { say: 'Raatri nau vajta goli ghyaychi aathvan kar.', expect: [{ type: ['reminder', 'calendar'], hour: 21 }], note: 'a reminder for herself' },
  ],
  imran: [
    { say: 'Sharma ji ke khate mein dhai hazaar aur likh do.', expect: [{ contact: 'sharma_ji', type: ['ledger'], amount: 2500 }], note: 'customer, not supplier' },
    { say: 'Sharma wale ko bolo kal atta chaar baje tak bhej dein.', expect: [{ contact: 'sharma_traders', type: ['message', 'call'], day: 1, hour: 16 }], note: 'supplier, not customer' },
    { say: 'Gupta ji ko yaad dilao unka saade chhe sau baaki hai.', expect: [{ contact: 'gupta_ji', type: ['message', 'reminder'] }] },
    { say: 'Bilal ko bolo kal subah aath baje dukaan khol de.', expect: [{ contact: 'bilal', type: ['message'], day: 1, hour: 8 }] },
    { say: 'Rakesh ko das carton Parle-G ka order bhej do, payment kal karenge.', expect: [{ contact: 'rakesh', type: ['message', 'call'] }] },
    { say: 'Ammi ki dawai medical wale se mangwa lo.', expect: [{ contact: 'medical', type: ['call', 'message'] }] },
  ],
  meenakshi: [
    { say: 'Selvi-kku sollu, naalaikku vara vendaam.', expect: [{ contact: 'selvi', type: ['message'], lang: 'Tamil' }] },
    { say: 'Auto Ramesh-kku sollu, naalai kaalai aaru manikku vaanga.', expect: [{ contact: 'auto_ramesh', type: ['message'], day: 1, hour: 6 }], note: 'two Rameshes' },
    { say: 'Doctor Ramesh appointment-a Tuesday-ku maathunga.', expect: [{ contact: 'dr_ramesh', type: ['call', 'message'] }] },
    { say: 'Karthik-kku sollu, Sunday evening pesalaam.', expect: [{ contact: 'karthik', type: ['message'], lang: 'English' }], note: 'son in New Jersey reads English' },
    { say: 'Pension office-la irundhu call vandhudhu, OTP sollanum, aaru moonu onnu naalu.', expect: { blocked: true } },
    { say: 'Medical shop-la BP tablet order pannunga.', expect: [{ contact: 'medicals', type: ['call', 'message'] }] },
  ],
};

const call = async (path: string, body: unknown) => {
  const r = await handle({ method: 'POST', path, query: new URLSearchParams(), headers: {}, body: Buffer.from(JSON.stringify(body)) });
  const j = JSON.parse(String(r.body)); if (r.status >= 400) throw new Error(j.error); return j;
};
const ist = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '');
const dayOf = (off: number) => new Date(Date.now() + off * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function checkLinks(a: Action): string[] {
  const bad: string[] = [];
  for (const l of a.links ?? []) {
    if (l.kind === 'whatsapp' && !/^https:\/\/wa\.me\/\d*\?text=/.test(l.href)) bad.push('whatsapp link malformed');
    if (l.kind === 'upi') { const q = new URL(l.href.replace('upi://', 'https://x/')).searchParams; if (Number(q.get('am')) !== a.amount_inr || !q.get('pa')) bad.push('UPI amount/payee wrong'); }
    if (l.kind === 'gcal') { const d = new URL(l.href).searchParams.get('dates') ?? ''; const start = d.split('/')[0]; const iso = new Date(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T${start.slice(9, 11)}:${start.slice(11, 13)}:00Z`).toISOString(); if (Math.abs(Date.parse(iso) - Date.parse(a.when_iso)) > 60e3) bad.push('calendar time wrong'); }
  }
  if (a.type === 'message' && !a.links?.some(l => l.kind === 'whatsapp')) bad.push('no WhatsApp link');
  if (a.type === 'payment' && !a.links?.some(l => l.kind === 'upi')) bad.push('no UPI link');
  return bad;
}
function grade(step: Step, r: Result): { ok: boolean; why: string[] } {
  if ('blocked' in step.expect) return { ok: r.blocked, why: r.blocked ? [] : ['OTP was NOT blocked'] };
  const why: string[] = [];
  for (const e of step.expect as Exp[]) {
    const pool = r.actions.filter(a => (!e.type || e.type.includes(a.type)) && (!e.contact || a.contact_id === e.contact));
    if (!pool.length) { why.push(`missing ${e.type?.join('/')} → ${e.contact ?? 'self'} (got ${r.actions.map(a => `${a.type}→${a.contact_id}`).join(', ') || 'nothing'})`); continue; }
    if (e.amount && !pool.some(a => Math.round(a.amount_inr) === e.amount)) why.push(`amount should be ₹${e.amount}`);
    if (e.hour !== undefined && !pool.some(a => a.when_iso && Number(ist(a.when_iso).slice(11, 13)) === e.hour && (e.day === undefined || a.when_iso.slice(0, 10) === dayOf(e.day)))) why.push(`time should be day+${e.day ?? '?'} ${e.hour}:00`);
    if (e.lang && !pool.some(a => (a.language || '').toLowerCase().includes(e.lang!.toLowerCase()))) why.push(`message should be in ${e.lang}`);
  }
  for (const a of r.actions) why.push(...checkLinks(a));
  if (r.clarify) why.push('asked a question');
  return { ok: why.length === 0, why };
}

const report: any[] = [];
let pass = 0, total = 0;
for (const [pid, steps] of Object.entries(PLAN)) {
  await call('/api/reset', { p: pid });
  console.log(`\n══════════ ${pid.toUpperCase()} ══════════`);
  for (const [i, step] of steps.entries()) {
    let { result: r, state } = await call('/api/understand', { p: pid, transcript: step.say, mode: 'artha' }) as { result: Result; state: State };
    let changed = '';
    if (step.change) {
      const picked = r.actions.find(a => a.mention?.toLowerCase().startsWith(step.change!.mention.toLowerCase()) || a.contact_id === step.change!.to || step.change!.ifNot)?.contact_id;
      const pickedFor = r.actions.find(a => a.type === 'message')?.contact_id;
      if (pickedFor && pickedFor !== step.change.ifNot) {
        const mention = r.actions.find(a => a.type === 'message')?.mention ?? step.change.mention;
        await call('/api/answer', { p: pid, mention, contactId: step.change.to, topic: r.topics?.[0], how: 'changed' });
        ({ result: r, state } = await call('/api/understand', { p: pid, transcript: step.say, mode: 'artha', forced: { [mention]: step.change.to } }));
        changed = `Artha first picked ${pickedFor}; ⇄ tapped → ${step.change.to}`;
      } else changed = `Artha picked ${pickedFor ?? picked} on its own`;
    }
    const g = grade(step, r); total++; if (g.ok) pass++;
    const did: string[] = [];
    for (const a of r.actions) {
      try { const x = await call('/api/act', { p: pid, action: a, confirmed: a.type === 'payment' }); did.push(x.done); state = x.state; } catch (e: any) { did.push(`could not do ${a.type}: ${e.message}`); }
    }
    const who = r.mentions.filter(m => m.kind === 'person').map(m => { const c = [...m.candidates].sort((a, b) => b.score - a.score); return `${m.text} → ${c[0]?.name ?? '?'} ${c[0] ? Math.round(c[0].score * 100) + '%' : ''}${c[1] ? ` (next: ${c[1].name} ${Math.round(c[1].score * 100)}%)` : ''}`; });
    console.log(`\n${g.ok ? '✅' : '❌'} ${i + 1}. “${step.say}”${step.note ? `   [${step.note}]` : ''}`);
    if (changed) console.log(`   ⇄ ${changed}`);
    console.log(`   understood: ${r.entities.map(e => `${e.text} = ${e.label}`).join(' · ') || '—'}${who.length ? ` | who: ${who.join(' ; ')}` : ''}${r.topics?.length ? ` | topic: ${r.topics.join(',')}` : ''}`);
    if (r.blocked) console.log('   🛡  BLOCKED: OTP never reached any model');
    for (const a of r.actions) {
      console.log(`   → ${a.type.toUpperCase()} ${a.contact_name || ''}${a.language ? ` [${a.language}]` : ''}${a.when_label ? ` @ ${a.when_label}` : ''}${a.amount_inr ? ` ₹${a.amount_inr}` : ''}${a.predicted ? ' (predicted)' : ''}: ${a.text || a.goal || a.title}`);
      for (const l of a.links ?? []) console.log(`       ↗ ${l.label}: ${l.href.length > 150 ? l.href.slice(0, 150) + '…' : l.href}`);
    }
    console.log(`   did: ${did.join(' · ') || '—'}`);
    console.log(`   Artha says: “${r.reply_speech || r.reply}”   (${r.ms.plan} ms)`);
    if (!g.ok) console.log(`   ⚠ ${g.why.join('; ')}`);
    report.push({ persona: pid, n: i + 1, say: step.say, note: step.note, ok: g.ok, why: g.why, changed, understood: r.entities, who, topics: r.topics, blocked: r.blocked, actions: r.actions, did, reply: r.reply_speech || r.reply, ms: r.ms });
  }
  const s = (await handle({ method: 'GET', path: '/api/state', query: new URLSearchParams({ p: pid }), headers: {}, body: Buffer.alloc(0) })).body;
  const st: State = JSON.parse(String(s));
  const sent = Object.entries(st.threads).flatMap(([c, t]) => t.filter(m => m.via).map(m => `${c}: ${m.text.slice(0, 60)}`));
  console.log(`\n   ${pid} after the session: ${sent.length} messages sent · ${st.calendar.filter(c => c.added).length} calendar entries · ${st.reminders.length} reminders · ${st.payments.length} payments · ${st.ledger.length} khata lines · ${st.memory.filter(m => m.learned).length} things learned`);
  for (const m of st.memory.filter(m => m.learned)) console.log(`     learned: ${m.fact}`);
  report.push({ persona: pid, summary: { sent, calendar: st.calendar.filter(c => c.added), reminders: st.reminders, payments: st.payments, ledger: st.ledger, learned: st.memory.filter(m => m.learned) } });
}
fs.writeFileSync('eval/persona-report.json', JSON.stringify({ at: new Date().toISOString(), pass, total, report }, null, 1));
console.log(`\n${pass}/${total} notes fully right · report in eval/persona-report.json`);
