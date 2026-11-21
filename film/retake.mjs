// Retake a narration line until it transcribes back the way we want (or keep the best of N takes).
// Usage: node film/retake.mjs <id> "<say text 1>" ["<say text 2>" ...] --want "regex"
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

process.loadEnvFile('.env');
const KEY = process.env.OPENAI_API_KEY;
const args = process.argv.slice(2);
const id = args[0];
const wi = args.indexOf('--want');
const want = new RegExp(args[wi + 1], 'i');
const variants = args.slice(1, wi);
const S = JSON.parse(fs.readFileSync('film/script.json', 'utf8'));
const out = `film/build/vo/${id}.wav`;

async function take(text) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: S.narrator.voice, input: text, instructions: S.narrator.instructions, response_format: 'wav' }) });
  const raw = `${out}.raw.wav`, tmp = `${out}.try.wav`;
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse,atempo=1.15', '-ar', '48000', '-ac', '1', tmp]);
  fs.unlinkSync(raw);
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(tmp)], { type: 'audio/wav' }), 'x.wav'); fd.append('model', 'gpt-transcribe');
  const heard = (await (await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd })).json()).text;
  return { tmp, heard };
}
for (let round = 0; round < 3; round++) {
  for (const v of variants) {
    const { tmp, heard } = await take(v);
    const ok = want.test(heard);
    console.log(ok ? 'KEEP' : 'no  ', '|', v, '→', heard);
    if (ok) {
      fs.renameSync(tmp, out);
      const b = S.beats.find(x => x.id === id); b.say = v;
      fs.writeFileSync('film/script.json', JSON.stringify(S, null, 1));
      process.exit(0);
    }
    fs.unlinkSync(tmp);
  }
}
console.log('no take matched; kept the existing one');
