// One continuous chat per person on the live site, in order, with "which one?" answered and actions confirmed
// the way a person would. Prints what Artha did at each step. Used to write and verify the manual test runbook.
//   npx tsx scripts/live-chain.ts [rohan|imran] [baseUrl]
import fs from 'node:fs';

const who = process.argv[2] ?? 'rohan';
const BASE = (process.argv[3] ?? 'https://djq9jnhg6rg4f.cloudfront.net').replace(/\/$/, '');
type Step = { say?: string; photo?: string; answer?: string; confirm?: boolean };
const CHAINS: Record<string, Step[]> = {
  rohan: [
    { say: 'Ayush ko bol do kal match 7 baje hai, bat le aana.', confirm: true },
    { say: 'Aur usko yaad dila de Goa wale 1500 bhi bhej de.', confirm: true },
    { say: 'Ayush ko bolo Monday standup se pehle dashboard fix push kar de.', confirm: true },
    { say: 'Usko bolo PR review bhi kar de.' },
    { say: 'Ayush ko call karo.', answer: 'ayush_s' },
    { say: 'Ayush ko call karo.' },
    { say: 'Ayush ko bolo standup 10 baje hai.' },
    { say: 'Priya ko bolo self review bhar diya hai.' },
    { say: 'Didi ko bolo engagement pe zaroor aaunga.' },
    { say: 'Kapoor uncle ko is mahine ka rent bhej do.', confirm: true },
    { say: 'Kabir ko wifi ka uska half bhej do.' },
    { say: 'Neha ka birthday 14 February hai, yaad rakhna.' },
    { say: 'Neha ko message kar do ki aaj 8 baje Burma Burma chalte hain.' },
    { say: 'Ayush Sharma ka birthday kab hai?' },
    { say: 'Kal mera kya plan hai?' },
    { say: 'Airtel wale ko OTP bata do 7 3 9 1 2 8' },
    { say: 'Neha ka birthday kab hai?' },
  ],
  imran: [
    { say: 'Sharma ji ke khate mein dhai hazaar aur likh do.', confirm: true },
    { say: 'Unko WhatsApp pe bhi bata do.', confirm: true },
    { say: 'Total kitna hua unka?' },
    { say: 'Sharma wale ko bolo kal atta chaar baje tak bhej dein.' },
    { say: 'Gupta ji ko yaad dilao unka saade chhe sau baaki hai.' },
    { say: 'Aaj ka hisaab likh lo: nakad bikri 1,250, Rizwan bhai ko 450 ka aata udhaar, aur Bilal ko 500 advance diya.', confirm: true },
    { say: 'Rizwan wala 450 nahi, 480 tha.', confirm: true },
    { say: 'Aaj ki saari entries batao.' },
    { photo: 'eval/images/khata-imran.jpg', confirm: true },
    { say: 'Gupta ji ka total kitna hua?' },
    { say: 'Ammi ki dawai medical wale se mangwa lo.' },
    { say: 'Rakesh ko bolo 10 carton Parle-G bhej de.' },
  ],
};
const post = async (path: string, body: unknown) => {
  const t = Date.now();
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { j: (await r.json().catch(() => ({}))) as any, ms: Date.now() - t };
};
const show = (res: any, ms: number) => {
  if (res.blocked) console.log('   BLOCKED');
  if (res.clarify) console.log(`   ASKS: ${res.clarify.question} → ${res.clarify.options.map((o: any) => o.label).join(' / ')}`);
  for (const a of res.actions) console.log(`   → ${a.type.toUpperCase()} ${a.contact_name}${a.entry_kind ? ` (${a.entry_kind})` : ''}${a.when_label ? ` @ ${a.when_label}` : ''}${a.amount_inr ? ` ₹${a.amount_inr}` : ''}${a.updates && a.updates !== a.id ? ' [update]' : ''}: ${String(a.text || a.goal || a.title).slice(0, 90)}`);
  if (res.heard) console.log(`   YOU SAID: ${res.heard.gist} | ${res.heard.points.map((p: any) => `${p.kind}:${p.text}`).join(', ')}`);
  console.log(`   🔊 ${res.reply_speech || res.reply}   (${(ms / 1000).toFixed(1)}s)`);
};
await post('/api/reset', { p: who });
for (const s of CHAINS[who]) {
  if (s.photo) {
    console.log(`\n📷 ${s.photo}`);
    const { j, ms } = await post('/api/scan', { p: who, image: `data:image/jpeg;base64,${fs.readFileSync(s.photo).toString('base64')}` });
    console.log(`   ${j.scan.lines.length} lines · ${j.scan.issues.map((i: any) => `[${i.level}] ${i.title}`).join(' | ')}`);
    show(j.result, ms);
    if (s.confirm) for (const a of j.result.actions) await post('/api/act', { p: who, action: a, confirmed: true });
    continue;
  }
  console.log(`\n👤 ${s.say}`);
  let { j, ms } = await post('/api/understand', { p: who, transcript: s.say, mode: 'artha' });
  show(j.result, ms);
  if (s.answer && j.result.clarify) {
    const c = j.result.clarify;
    await post('/api/answer', { p: who, mention: c.mention, contactId: s.answer, topic: j.result.topics?.[0], how: 'asked' });
    ({ j, ms } = await post('/api/understand', { p: who, transcript: s.say, mode: 'artha', forced: { [c.mention]: s.answer } }));
    console.log(`   (tapped ${s.answer})`); show(j.result, ms);
  }
  if (s.confirm) for (const a of j.result.actions) await post('/api/act', { p: who, action: a, confirmed: true });
}
const st = (await (await fetch(`${BASE}/api/state?p=${who}`)).json()) as any;
console.log('\nLEARNED:', st.memory.filter((m: any) => m.learned).map((m: any) => m.fact));
console.log('KHATA BOOK:', (st.book ?? []).map((b: any) => `${b.kind} ${b.party || b.item} ₹${b.amount} ${b.status}`));
console.log('LEDGER:', st.ledger.map((l: any) => `${l.contact} ₹${l.amount}`));
