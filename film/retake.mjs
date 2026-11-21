// Retake narration lines until each one transcribes back cleanly; the product name must come back as अर्थ / Arth(a).
// Usage: FILM_LANG=hi node film/retake.mjs L8,L15,...   (up to 5 takes per line; keeps the best)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { provider, speakLine } from './tts.mjs';

process.loadEnvFile('.env');
const KEY = process.env.OPENAI_API_KEY;
const LANG = process.env.FILM_LANG || 'en';
const SUF = LANG === 'en' ? '' : `-${LANG}`;
const VO = LANG === 'en' ? 'film/build/vo' : `film/build/${LANG}/vo`;
const TEMPO = Number(process.env.FILM_TEMPO || (provider() === 'gemini' ? 1.06 : LANG === 'en' ? 1.15 : 1.12));
const S = JSON.parse(fs.readFileSync(`film/script${SUF}.json`, 'utf8'));
const ids = process.argv[2].split(',');
const { romanize } = await import('../server/pipeline/translit.ts').catch(() => ({ romanize: s => s }));

const norm = s => romanize(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
const cer = (a, b) => { a = norm(a); b = norm(b); const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) dp[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return dp[a.length][b.length] / Math.max(1, a.length); };
const nameOk = (say, heard) => !/अर्थ|artha/i.test(say) || (/अर्थ|\barth(a|\b)/i.test(heard) && !/earth|arthur|\bart\b|औरत|आरत|अर्ट|पार्थ|arsa/i.test(heard));

async function take(text, out) {
  await speakLine(text, out, { lang: LANG, tempo: TEMPO, voice: S.narrator.voice, instructions: S.narrator.instructions });
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(out)], { type: 'audio/wav' }), 'x.wav'); fd.append('model', 'gpt-transcribe');
  if (LANG === 'hi') fd.append('language', 'hi');
  return (await (await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd })).json()).text;
}
await Promise.all(ids.map(async id => {
  const b = S.beats.find(x => x.id === id); const say = b.say ?? b.text;
  let best = null;
  for (let k = 0; k < 5; k++) {
    const out = `${VO}/${id}.take${k}.wav`;
    const heard = await take(say, out);
    const e = cer(say, heard), ok = nameOk(say, heard);
    const score = (ok ? 0 : 1) + e;
    if (!best || score < best.score) { if (best) fs.unlinkSync(best.out); best = { out, heard, e, ok, score }; } else fs.unlinkSync(out);
    if (ok && e < 0.06) break;
  }
  fs.renameSync(best.out, `${VO}/${id}.wav`);
  console.log(`${id.padEnd(4)} ${best.ok ? 'name ✓' : 'name ✗'} ${(best.e * 100).toFixed(0).padStart(3)}%  ${best.heard}`);
}));
