// Re-record lines with the batch tool until each one passes the check: the name comes back as Artha / अर्थ,
// and the line is close to the script. Only failing lines are re-recorded, round after round.
// Usage: LANG_CODE=en node --import tsx film/kore-fix.mjs L8,L15,... [rounds]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { transcribe } from '../server/openai.ts';
import { romanize } from '../server/pipeline/translit.ts';

process.loadEnvFile('.env');
const L = process.env.LANG_CODE || 'en';
const SCRIPT = `film/build/kore/${L}.json`, AUDIO = `film/build/kore/${L}`;
const S = JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));
let todo = process.argv[2].split(',');
const rounds = Number(process.argv[3] || 4);
const norm = s => romanize(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
const cer = (a, b) => { a = norm(a); b = norm(b); const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) dp[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return dp[a.length][b.length] / Math.max(1, a.length); };
const BAD = /earth|arthur|\bart\b|\barts\b|औरत|आरत|अर्ट|पार्थ|अर्था\b|arsa/i;
const nameOk = (say, heard) => !/अर्थ|artha/i.test(say) || (/(\bartha?\b|अर्थ)/i.test(heard) && !BAD.test(heard));
const env = { ...process.env, SCRIPT, AUDIO, PACE_MAX: '0.95', SPEECH_MAX: '0.8', ...(L === 'hi' ? { PACE_MIN: '0.16', SPEECH_MIN: '0.16' } : {}) };

for (let r = 1; r <= rounds && todo.length; r++) {
  console.log(`round ${r}: recording ${todo.join(',')}`);
  execFileSync('node', ['film/tts-batch.mjs', ...todo], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  const results = await Promise.all(todo.map(async id => {
    const say = S.scenes.find(s => s.id === id).say;
    const heard = await transcribe(fs.readFileSync(`${AUDIO}/${id}.wav`), 'audio/wav');
    return { id, ok: nameOk(say, heard) && cer(say, heard) < 0.2, heard };
  }));
  for (const x of results) console.log(`  ${x.ok ? '✓' : '✗'} ${x.id}  ${x.heard}`);
  todo = results.filter(x => !x.ok).map(x => x.id);
}
console.log(todo.length ? `still not clean: ${todo.join(',')}` : 'all clean');
