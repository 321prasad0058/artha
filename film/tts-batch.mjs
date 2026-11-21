// Gemini TTS, quota-optimised (reused from the SahiCar videos): several lines per request, cut back into one WAV per line at the pauses.
// Usage: SCRIPT=x.json AUDIO=audio/x node tts-batch.mjs [id ...]
//  - records only scenes whose text/voice/direction/model changed (audio/<x>/.manifest.json) or the ids given
//  - groups scenes into batches of up to WORDS words (default 170 ≈ 70–90 s of audio) → far fewer requests
//  - asks for a long silent pause between paragraphs, finds the N-1 longest silences, and checks every
//    piece's length against its word count; a batch that doesn't split cleanly is retried as two halves
//    (down to single scenes), so quality never depends on a lucky split
//  - rotates the keys in SahiCar/.keys (never printed); waits out per-minute limits; skips keys that are out for the day
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
// every Gemini key already on this machine (SahiCar's rotation file + GEMINI_API_KEY in project .env files); never printed
const ENV_FILES = ['.env', ...['/Users/prasad.alai/Desktop/FL/SahiCar', ...(existsSync('/Users/prasad.alai/Desktop/FL/myapp') ? readdirSync('/Users/prasad.alai/Desktop/FL/myapp').map((d) => `/Users/prasad.alai/Desktop/FL/myapp/${d}`) : [])]
  .flatMap((d) => { try { return readdirSync(d).filter((f) => f.startsWith('.env') && f !== '.env.example').map((f) => `${d}/${f}`) } catch { return [] } })]
const KEYS = [...new Set([
  ...(existsSync('/Users/prasad.alai/Desktop/FL/SahiCar/.keys') ? readFileSync('/Users/prasad.alai/Desktop/FL/SahiCar/.keys', 'utf8').split(/\s+/) : []),
  ...ENV_FILES.filter((f) => existsSync(f)).flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l) => /^(VITE_)?GEMINI_API_KEY=(.*)$/.exec(l.trim())?.[2]?.replace(/["']/g, '').trim()).filter(Boolean)),
].filter((k) => /^(AIza|AQ\.)/.test(k)))]
console.log(`${KEYS.length} Gemini keys available`)
const E = process.env, S = JSON.parse(readFileSync(E.SCRIPT, 'utf8')), AD = E.AUDIO, MODEL = E.MODEL || 'gemini-2.5-flash-preview-tts'
const PMIN = Number(E.PACE_MIN || 0.28), PMAX = Number(E.PACE_MAX || 0.6), SMIN = Number(E.SPEECH_MIN || 0.28), SMAX = Number(E.SPEECH_MAX || 0.55)
const WORDS = Number(E.WORDS || 170), GAP_S = 21   // ≥21 s between requests on one key keeps us under ~3/min
mkdirSync(AD, { recursive: true })
const MF = `${AD}/.manifest.json`, man = existsSync(MF) ? JSON.parse(readFileSync(MF, 'utf8')) : {}
const sig = (sc) => createHash('sha1').update([sc.say, S.voice, S.direction, MODEL].join('|')).digest('hex').slice(0, 16)
const only = process.argv.slice(2)
const todo = S.scenes.filter((sc) => (only.length ? only.includes(sc.id) : man[sc.id] !== sig(sc) || !existsSync(`${AD}/${sc.id}.wav`)))
const words = (sc) => sc.say.split(/\s+/).length
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wav = (pcm, rate) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]) }

const out = new Set(), last = new Map()   // keys out for today; last request time per key
let ki = 0, requests = 0
async function call(text) {
  for (let spins = 0; spins < KEYS.length * 6; spins++) {
    if (out.size >= KEYS.length) throw new Error('all keys are out of quota for today')
    const k = ki % KEYS.length; if (out.has(k)) { ki++; continue }
    const wait = (last.get(k) || 0) + GAP_S * 1000 - Date.now(); if (wait > 0) await sleep(wait)
    last.set(k, Date.now()); requests++
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEYS[k] },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: S.voice } } } } }) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }))
    const j = await r.json().catch(() => ({}))
    const d = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
    if (r.ok && d) return { pcm: Buffer.from(d.data, 'base64'), rate: Number(/rate=(\d+)/.exec(d.mimeType)?.[1] || 24000) }
    const msg = j.error?.message || ''
    if (r.status === 429 && /per ?day|daily|PerDay/i.test(msg + JSON.stringify(j.error?.details || ''))) { console.log(`key ${k + 1}: out for today`); out.add(k); ki++; continue }
    if (r.status === 429) { console.log(`key ${k + 1}: per-minute limit, trying the next key`); ki++; await sleep(4000); continue }
    console.log(`request failed (${r.status}) ${msg.slice(0, 90)}; retrying`); ki++; await sleep(5000)
  }
  throw new Error('no key could serve the request')
}

// silences: 20 ms frames below -40 dBFS, runs ≥ 0.45 s
function silences(pcm, rate) {
  const f = Math.round(rate * 0.02), n = Math.floor(pcm.length / 2 / f), quiet = []
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < f; j++) { const v = pcm.readInt16LE((i * f + j) * 2) / 32768; s += v * v } quiet.push(Math.sqrt(s / f) < 0.01) }
  const runs = []; let a = -1
  for (let i = 0; i <= n; i++) { if (i < n && quiet[i]) { if (a < 0) a = i } else if (a >= 0) { if ((i - a) * 0.02 >= 0.45) runs.push([a * 0.02, i * 0.02]); a = -1 } }
  return runs
}
function split(pcm, rate, batch) {
  const total = pcm.length / 2 / rate, runs = silences(pcm, rate).filter(([a, b]) => a > 0.3 && b < total - 0.3)
  if (batch.length === 1) return total / words(batch[0]) > PMAX + 0.05 ? null : [[0, total]]
  if (runs.length < batch.length - 1) return null
  const cuts = runs.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0])).slice(0, batch.length - 1).sort((x, y) => x[0] - y[0])
  const segs = []; let st = 0
  for (const [a, b] of cuts) { segs.push([st, a + 0.12]); st = Math.max(0, b - 0.12) } segs.push([st, total])
  const W = batch.reduce((s, sc) => s + words(sc), 0), speech = segs.reduce((s, [a, b]) => s + b - a, 0)
  if (speech / W < SMIN || speech / W > SMAX) return null   // whole read unusually fast/slow: don't trust it
  for (let i = 0; i < batch.length; i++) { const exp = (words(batch[i]) / W) * speech, got = segs[i][1] - segs[i][0], pace = got / words(batch[i]); if (got < exp * 0.75 || got > exp * 1.35 || pace < PMIN || pace > PMAX) return null }
  return segs
}
const prompt = (batch) => batch.length === 1 ? `${S.direction}\n\nSay this line exactly:\n${batch[0].say}`
  : `${S.direction}\n\nRead the following ${batch.length} paragraphs exactly, in order, in the same voice and energy. After each paragraph, stay completely silent for about two seconds before starting the next one. Do not read any numbers or labels for the paragraphs.\n\n` + batch.map((sc) => sc.say).join('\n\n')

async function record(batch) {
  const { pcm, rate } = await call(prompt(batch))
  const segs = split(pcm, rate, batch)
  if (!segs) {
    if (batch.length === 1) throw new Error(`could not record ${batch[0].id}`)
    console.log(`batch ${batch.map((b) => b.id).join(',')} didn't split cleanly: re-recording as two halves`)
    const h = Math.ceil(batch.length / 2); await record(batch.slice(0, h)); await record(batch.slice(h)); return
  }
  segs.forEach(([a, b], i) => { const sc = batch[i], A = Math.floor(a * rate) * 2, B = Math.floor(b * rate) * 2
    writeFileSync(`${AD}/${sc.id}.wav`, wav(pcm.subarray(A, B), rate)); man[sc.id] = sig(sc); writeFileSync(MF, JSON.stringify(man, null, 1))
    console.log(`ok ${sc.id} ${(b - a).toFixed(1)} s`) })
}

if (E.TESTWAV) {   // offline check of the splitter: TESTWAV=file.wav TESTIDS=a,b,c
  const buf = readFileSync(E.TESTWAV), rate = buf.readUInt32LE(24), pcm = buf.subarray(44), ids = E.TESTIDS.split(',')
  const segs = split(pcm, rate, ids.map((id) => S.scenes.find((s) => s.id === id)))
  console.log(segs ? segs.map(([a, b], i) => `${ids[i]} ${a.toFixed(2)}–${b.toFixed(2)}`).join('\n') : 'NO CLEAN SPLIT'); process.exit(0)
}
const batches = []; let cur = []
for (const sc of todo) { if (cur.length && cur.reduce((s, x) => s + words(x), 0) + words(sc) > WORDS) { batches.push(cur); cur = [] } cur.push(sc) }
if (cur.length) batches.push(cur)
console.log(`${todo.length} scenes to record in ${batches.length} batches (model ${MODEL})`)
try { for (const b of batches) await record(b) } catch (e) { console.log('STOPPED:', e.message) }
const left = S.scenes.filter((sc) => man[sc.id] !== sig(sc) || !existsSync(`${AD}/${sc.id}.wav`)).map((s) => s.id)
console.log(`${requests} requests used. ${left.length ? 'still to record: ' + left.join(' ') : 'all scenes recorded'}`)
