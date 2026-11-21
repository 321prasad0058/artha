// Multi-turn conversations: follow-ups must use what was just said ("add it", "make it 5", "tell him too", "cancel that").
import { handle } from '../server/handler.ts';
process.loadEnvFile('.env');
const call = async (path: string, body: unknown) => JSON.parse(String((await handle({ method: 'POST', path, query: new URLSearchParams(), headers: {}, body: Buffer.from(JSON.stringify(body)) })).body));
const ONLY = process.argv[2];
const CHATS: [string, string[]][] = [
  ['sunita', ['माझी उद्याची पवार डॉक्टरांची अपॉइंटमेंट अकरा वाजता शेड्यूल करा.', 'कॅलेंडरला ॲड करून द्या.', 'वेळ बदला, साडे अकरा करा.', 'त्यांना पण सांगा की मी रिपोर्ट घेऊन येते.']],
  ['aditya', ['Mehta ji wala appointment parso shaam ko shift karwa do.', 'Usko bhi bata do ki main purani reports le aaunga.', 'Nahi, 7 baje kar do.', 'Rehne do, cancel karo.']],
  ['imran', ['Sharma ji ke khate mein dhai hazaar aur likh do.', 'Unko WhatsApp pe bhi bata do.', 'Total kitna hua unka?']],
  ['meenakshi', ['Auto Ramesh-kku sollu, naalai kaalai aaru manikku vaanga.', 'Calendar-la podu.', 'Selvi-kkum sollu, naalaikku seekiram vaanga.']],
];
for (const [p, notes] of CHATS.filter(c => !ONLY || c[0] === ONLY)) {
  await call('/api/reset', { p });
  console.log(`\n══════ ${p.toUpperCase()} ══════`);
  for (const say of notes) {
    const { result: r } = await call('/api/understand', { p, transcript: say, mode: 'artha' });
    console.log(`\n👤 “${say}”`);
    if (r.clarify) console.log(`   ASKS: ${r.clarify.question} → ${r.clarify.options.map((o: any) => o.label).join(' / ')}`);
    for (const a of r.actions) console.log(`   → ${a.type.toUpperCase()} ${a.contact_name || 'self'}${a.language ? ` [${a.language}]` : ''}${a.when_label ? ` @ ${a.when_label}` : ''}${a.amount_inr ? ` ₹${a.amount_inr}` : ''}: ${(a.text || a.goal || a.title || '').slice(0, 90)}`);
    if (!r.actions.length && !r.clarify) console.log('   (no action)');
    console.log(`   🔊 ${r.reply_speech || r.reply}`);
  }
}
