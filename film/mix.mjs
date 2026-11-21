// Audio for the film: narration + real clips placed on the timeline, music ducked under voice, loudness-normalised.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const LANG = process.env.FILM_LANG || 'en';
const SUF = LANG === 'en' ? '' : `-${LANG}`;
const TL = JSON.parse(fs.readFileSync(`film/build/timeline${SUF}.json`, 'utf8'));
const MUSIC = `${process.env.HOME}/Desktop/SahiCar-content/promo/music-candidates/634.mp3`; // Mixkit "Your Breath", free licence
const SFX = `${process.env.HOME}/Desktop/SahiCar-content/promo/sfx/chime.mp3`;
const total = TL.total;
const voice = [...TL.lines.map(l => ({ file: l.file, at: l.start, vol: 1 })), ...TL.clips.map(c => ({ file: c.file, at: c.start, vol: c.clip === 'reply' ? 1.05 : 1.15 }))];
const chimes = [TL.lines.find(l => l.id === 'L16').start - .15, TL.lines.find(l => l.id === 'L33').start - .25];

const args = ['-y', '-loglevel', 'error'];
voice.forEach(v => args.push('-i', v.file));
args.push('-i', MUSIC);
chimes.forEach(() => args.push('-i', SFX));
const n = voice.length;
const parts = [];
voice.forEach((v, i) => parts.push(`[${i}]aresample=48000,aformat=channel_layouts=mono,volume=${v.vol},adelay=${Math.round(v.at * 1000)}:all=1[v${i}]`));
parts.push(`${voice.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,asplit=2[vo][sc]`);
parts.push(`[${n}]aresample=48000,aformat=channel_layouts=mono,atrim=0:${total.toFixed(2)},afade=t=in:d=2.5,afade=t=out:st=${(total - 4).toFixed(2)}:d=4,volume=-21dB[mu]`);
parts.push(`[mu][sc]sidechaincompress=threshold=0.015:ratio=6:attack=20:release=600:makeup=1[duck]`);
chimes.forEach((at, k) => parts.push(`[${n + 1 + k}]aresample=48000,aformat=channel_layouts=mono,volume=0.22,adelay=${Math.round(at * 1000)}:all=1,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)}[c${k}]`));
parts.push(`[vo][duck]${chimes.map((_, k) => `[c${k}]`).join('')}amix=inputs=${2 + chimes.length}:normalize=0,volume=1.5dB,alimiter=limit=0.89:level=false,aformat=channel_layouts=stereo[out]`);
args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', `film/build/mix${SUF}.wav`);
execFileSync('ffmpeg', args);
console.log('mix ready', total.toFixed(1), 's');
