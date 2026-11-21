// Long-term memory: say things, close the conversation (age it by 2 days), then ask in a new conversation.
// Proves the answer comes from the context space (people, khata, vectors), not from the last few turns.
import { handle } from '../server/handler.ts';
import { space } from '../server/context/space.ts';
import { embedPending, invalidate } from '../server/context/embed.ts';
process.loadEnvFile('.env');
const call = async (path: string, body: unknown, method = 'POST') => JSON.parse(String((await handle({ method, path, query: new URLSearchParams(method === 'GET' ? (body as any) : {}), headers: {}, body: Buffer.from(method === 'GET' ? '' : JSON.stringify(body)) })).body));
const p = process.argv[2] ?? 'sunita';
const TELL: Record<string, string[]> = {
  rohan: ['Neha ka birthday 14 February hai, yaad rakhna.', 'Ayush Gupta ab Bangalore office shift ho gaya hai, standup ab online hota hai.', 'Kabir ko bol do wifi ka 589 bhej diya.'],
  sunita: ['मी खात्यात काही गोष्टी ॲड करायला सांगतोय. बाराशे रुपये आनंद पाटील सप्लायरकडून घ्यायचे आहेत, आणि पाच हजार सुनील शर्मा सप्लायरला द्यायचे. पाच किलो राईस विकला सहाशे रुपयांना.', 'Rohit la sanga, pudhchya shanivari mi Bengaluru la yetey.'],
};
const ASK: Record<string, string[]> = {
  rohan: ['Neha ka birthday kab hai?', 'Ayush Gupta abhi kaha baithta hai?', 'Kabir ko maine kya bola tha?', 'Ayush ko bolo standup link bhej de.'],
  sunita: ['Anand Patil kadun kiti paise ghyayche aahet?', 'सुनील शर्मांना किती द्यायचे आहेत?', 'Rohit la mi kay sangitla hota?', 'Anand Patil la phone kara, paise kadhi denar te vichara.'],
};
await call('/api/reset', { p });
console.log(`\n── ${p}: telling Artha ──`);
for (const say of TELL[p]) {
  const { result: r } = await call('/api/understand', { p, transcript: say, mode: 'artha' });
  console.log(`👤 ${say}\n   🔊 ${r.reply}`);
  for (const [i, a] of r.actions.entries()) if (a.type === 'ledger' || a.type === 'message') await call('/api/act', { p, action: { ...a, id: a.id ?? `x${i}` } });
}
// two days pass: the conversation window (3 h) is long closed
const db = space(p);
const D = 2 * 864e5;
db.exec(`UPDATE turn SET at = at - ${D}; UPDATE book SET at = at - ${D}, day = date(day, '-2 day'); UPDATE event SET at = at - ${D} WHERE at > ${Date.now() - 3600e3}`);
db.prepare(`UPDATE vec SET at = at - ? WHERE at > ?`).run(D, Date.now() - 3600e3);
await embedPending(db); invalidate(db);
console.log(`\n── two days later, new conversation ──`);
for (const say of ASK[p]) {
  const { result: r } = await call('/api/understand', { p, transcript: say, mode: 'artha' });
  console.log(`👤 ${say}`);
  for (const a of r.actions) console.log(`   → ${a.type.toUpperCase()} ${a.contact_name}${a.amount_inr ? ` ₹${a.amount_inr}` : ''}: ${(a.text || a.goal || a.title).slice(0, 90)}`);
  console.log(`   🔊 ${r.reply}`);
}
const ctx = await call('/api/context', { p }, 'GET');
console.log(`\ncontext space: ${(ctx.bytes / 1024).toFixed(0)} KB ·`, JSON.stringify(ctx.counts));
