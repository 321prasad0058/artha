import { handle } from '../server/handler.ts';
process.loadEnvFile('.env');
const call = async (path: string, body: any) => JSON.parse(String((await handle({ method: 'POST', path, query: new URLSearchParams(), headers: {}, body: Buffer.from(JSON.stringify(body)) })).body));
const C: [string, string, string][] = [
  ['aditya', 'Ravi ko bol do main late aaunga', 'person NOT in contacts'],
  ['aditya', 'Rahul ko call karo', 'two Rahuls, no clue at all'],
  ['aditya', 'Kal mera kya schedule hai?', 'a question, not an action'],
  ['aditya', 'Mehta ji wala appointment cancel kar do', 'cancel instead of move'],
  ['aditya', 'Amma ko bolo dawai le lena, aur Priya ko bolo main 8 baje tak aa jaunga', 'two people, two languages'],
  ['aditya', 'Agle hafte Shankar sir ke saath gym session book karo', '"next week" + the other Shankar'],
  ['aditya', 'Paise bhej do', 'money with no person'],
  ['aditya', 'Amma ko Hindi mein bolo ki main theek hoon', 'override the language'],
  ['imran', 'Sharma Traders ko sava lakh bhej do', 'a big amount'],
  ['imran', 'Sharma ji ka khata kitna hua?', 'asking about the ledger'],
  ['meenakshi', 'Ramesh-kku sollu', 'two Rameshes, no topic'],
  ['meenakshi', 'Bank la irundhu call vandhudhu, OTP kekkuranga', 'scam, but no digits'],
  ['sunita', 'Tai la phone kar', 'two tais, no clue'],
  ['aditya', 'uh hmm', 'noise / nothing'],
];
for (const [p] of new Set(C.map(c => [c[0]]))) await call('/api/reset', { p });
for (const [p, say, why] of C) {
  const { result: r } = await call('/api/understand', { p, transcript: say, mode: 'artha' });
  const acts = r.actions.map((a: any) => `${a.type}→${a.contact_name || 'self'}${a.language ? '[' + a.language + ']' : ''}${a.amount_inr ? ' ₹' + a.amount_inr : ''}${a.when_label ? ' @' + a.when_label : ''}: ${(a.text || a.goal || a.title || '').slice(0, 70)}${a.alternatives?.length ? ` (⇄ ${a.alternatives.map((x: any) => x.name).join(',')})` : ''}`);
  console.log(`\n[${p}] “${say}”  — ${why}`);
  if (r.blocked) console.log('   BLOCKED');
  if (r.clarify) console.log(`   ASKS: ${r.clarify.question} → ${r.clarify.options.map((o: any) => o.label).join(' / ')}`);
  for (const a of acts) console.log('   → ' + a);
  if (!acts.length && !r.clarify && !r.blocked) console.log('   (no action)');
  console.log(`   says: ${r.reply_speech || r.reply}`);
}
