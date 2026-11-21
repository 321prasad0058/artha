// Transcribe every narration line back and compare with the script (character error rate on romanised text).
import fs from 'node:fs';
import { transcribe } from '../server/openai.ts';
import { romanize } from '../server/pipeline/translit.ts';
process.loadEnvFile('.env');
const LANG = process.env.FILM_LANG || 'en';
const SUF = LANG === 'en' ? '' : `-${LANG}`;
const VO = process.env.VO_DIR || (LANG === 'en' ? 'film/build/vo' : `film/build/${LANG}/vo`);
const S = JSON.parse(fs.readFileSync(`film/script${SUF}.json`, 'utf8'));
const norm = (s: string) => romanize(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/[nm](?=[^aeiou])/g, 'n');
function cer(a: string, b: string) { a = norm(a); b = norm(b); const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) dp[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return dp[a.length][b.length] / Math.max(1, a.length); }
const rows = await Promise.all(S.beats.filter((b: any) => b.text).map(async (b: any) => { const heard = await transcribe(fs.readFileSync(`${VO}/${b.id}.wav`), 'audio/wav'); return { id: b.id, e: cer(b.say ?? b.text, heard), heard }; }));
for (const r of rows.sort((a, b) => b.e - a.e)) console.log(`${r.id.padEnd(4)} ${(r.e * 100).toFixed(0).padStart(3)}%  ${r.heard}`);
console.log('AVERAGE', (rows.reduce((s, r) => s + r.e, 0) / rows.length * 100).toFixed(1) + '%');
