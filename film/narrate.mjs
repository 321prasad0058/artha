// Narration + timeline for the Artha film.
// Each line is spoken from its "say" text (native script for Indian words), trimmed and slightly quickened,
// then laid end to end with small gaps. Clips (real voice notes, Artha's spoken reply) sit in the timeline too.
// Output: film/build/vo/<id>.wav, film/build/timeline.json, film/out/artha-demo.srt
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

process.loadEnvFile('.env');
const KEY = process.env.OPENAI_API_KEY;
const S = JSON.parse(fs.readFileSync('film/script.json', 'utf8'));
const B = 'film/build';
fs.mkdirSync(`${B}/vo`, { recursive: true });
const force = process.argv.includes('--force');
const dur = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

async function tts(text, voice, instructions, out, tempo) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, instructions, response_format: 'wav' }),
  });
  if (!r.ok) throw new Error(`tts ${r.status} ${await r.text()}`);
  const raw = out.replace(/\.wav$/, '.raw.wav');
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  const af = `silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse,atempo=${tempo}`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', af, '-ar', '48000', '-ac', '1', out]);
  fs.unlinkSync(raw);
}

// Artha's spoken Telugu reply, from the real captured output of the a6 note.
const story = JSON.parse(fs.readFileSync('docs/artha-story/data.json', 'utf8'));
const a6 = story.notes.find(n => n.id === 'a6').artha;
const replyText = a6.reply_speech || a6.reply;
if (force || !fs.existsSync(`${B}/reply-a6.mp3`)) {
  await tts(replyText, 'coral', 'You are Artha, a warm assistant replying with a quick voice note in Telugu. Native Telugu pronunciation, brisk and friendly, no long pauses.', `${B}/reply-a6.wav`, 1.12);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${B}/reply-a6.wav`, '-c:a', 'libmp3lame', '-b:a', '96k', `${B}/reply-a6.mp3`]);
}

const lines = [], clips = [], scenes = [];
let t = 0.8, scene = null;
const jobs = [];
for (const b of S.beats) {
  if (b.text && (force || !fs.existsSync(`${B}/vo/${b.id}.wav`))) jobs.push(b);
}
for (let i = 0; i < jobs.length; i += 5) {
  await Promise.all(jobs.slice(i, i + 5).map(b => tts(b.say ?? b.text, S.narrator.voice, S.narrator.instructions, `${B}/vo/${b.id}.wav`, 1.15).then(() => console.log('vo', b.id))));
}
for (const b of S.beats) {
  if (b.scene) {
    if (scene) scene.end = t;
    t += scenes.length ? 0.5 : 0;
    scene = { id: b.scene, label: b.label, start: t - 0.3 };
    scenes.push(scene);
  }
  if (b.clip) {
    const d = dur(b.file);
    clips.push({ id: b.id, clip: b.clip, file: b.file, start: t, end: t + d, scene: scene.id, caption: b.caption, gloss: b.gloss });
    t += d + (b.gap ?? 0.4);
  } else {
    const d = dur(`${B}/vo/${b.id}.wav`);
    lines.push({ id: b.id, text: b.text, start: t, end: t + d, scene: scene.id, file: `${B}/vo/${b.id}.wav` });
    t += d + (b.gap ?? 0.35);
  }
}
scene.end = t;
const total = t + 0.4;
fs.writeFileSync(`${B}/timeline.json`, JSON.stringify({ total, lines, clips, scenes }, null, 1));
const ts = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const subs = [...lines.map(l => ({ start: l.start, end: l.end, text: l.text })), ...clips.filter(c => c.caption).map(c => ({ start: c.start, end: c.end + .3, text: `${c.caption}\n${c.gloss}` }))].sort((a, b) => a.start - b.start);
fs.writeFileSync('film/out/artha-demo.srt', subs.map((l, i) => `${i + 1}\n${ts(l.start)} --> ${ts(l.end)}\n${l.text}\n`).join('\n'));
console.log(`timeline: ${total.toFixed(1)}s, ${lines.length} lines, ${clips.length} clips, ${scenes.length} scenes`);
for (const s of scenes) console.log(`  ${s.id.padEnd(8)} ${s.start.toFixed(1).padStart(6)} → ${s.end.toFixed(1)}`);
