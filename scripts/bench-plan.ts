// Planning latency per model: the same notes, run twice (warm prompt cache), median of the planning step in ms.
//   ARTHA_PLAN_MODEL=gpt-4.1 ARTHA_PLAN_EFFORT=off npx tsx scripts/bench-plan.ts
import { understand } from '../server/pipeline/understand.ts';
import { freshState, persona } from '../server/store.ts';
process.loadEnvFile('.env');
const NOTES: [string, string][] = [
  ['rohan', 'Ayush ko bol do kal match 7 baje hai, bat le aana.'],
  ['rohan', 'Kal mera kya plan hai?'],
  ['imran', 'Sharma ji ke khate mein dhai hazaar aur likh do.'],
  ['aditya', 'Mehta ji wala appointment parso shaam ko shift karwa do.'],
  ['sunita', 'दुधवाल्यांना या महिन्याचे पैसे पाठवा.'],
  ['meenakshi', 'Auto Ramesh-kku sollu, naalai kaalai aaru manikku vaanga.'],
  ['fatima', 'Salma ko bolo Jumme ko biryani bana rahi hoon, zaroor aana.'],
  ['ananya', 'Mishti ko kis cheez se allergy hai?'],
];
const ms: number[] = [];
for (let round = 0; round < 2; round++) for (const [p, t] of NOTES) {
  const P = persona(p);
  const r = await understand({ persona: P, state: freshState(P), transcript: t, mode: 'artha' });
  if (round) ms.push(r.ms.plan);
}
ms.sort((a, b) => a - b);
console.log(`${process.env.ARTHA_PLAN_MODEL}: median ${ms[ms.length >> 1]} ms, fastest ${ms[0]} ms, slowest ${ms[ms.length - 1]} ms`);
