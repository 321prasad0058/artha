// When does each streamed piece arrive? ms from the start of the planning call.
import { understand } from '../server/pipeline/understand.ts';
import { freshState, persona } from '../server/store.ts';
process.loadEnvFile('.env');
const NOTES: [string, string][] = [['rohan', 'Ayush ko bol do kal match 7 baje hai, bat le aana.'], ['rohan', 'Kal mera kya plan hai?'], ['imran', 'Sharma ji ke khate mein dhai hazaar aur likh do.'], ['aditya', 'Mehta ji wala appointment parso shaam ko shift karwa do.']];
for (let round = 0; round < 2; round++) for (const [p, t] of NOTES) {
  const P = persona(p); const t0 = Date.now(); const ev: string[] = [];
  const r = await understand({ persona: P, state: freshState(P), transcript: t, mode: 'artha', onEvent: e => ev.push(`${e.t} ${Date.now() - t0}`) });
  if (round) console.log(`${t.slice(0, 34).padEnd(34)} | ${ev.join(' | ')} | done ${Date.now() - t0} (plan ${r.ms.plan})`);
}
