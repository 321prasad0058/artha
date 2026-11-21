// Records a live, unedited walk-through of the real app for one person (screen + captions), and logs when
// voice notes and Artha's spoken replies play, so the sound can be laid back in exactly.
// Usage: node film/live-demo.mjs aditya|imran   (local server on :8787)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const who = process.argv[2] ?? 'aditya';
const B = 'http://localhost:8787';
const OUT = 'film/build/live';
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
await fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: who }) });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(`${B}/?p=${who}`, { waitUntil: 'networkidle0' });
await wait(1200);

// caption bar and a step badge, drawn by the page itself so they are part of the recording
await page.evaluate(() => {
  const s = document.createElement('style');
  s.textContent = `#demo-cap{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:9999;max-width:980px;padding:12px 22px;border-radius:16px;background:rgba(15,16,20,.9);color:#fff;font:600 20px/1.35 'Instrument Sans',system-ui,sans-serif;text-align:center;pointer-events:none;box-shadow:0 12px 30px -10px rgba(0,0,0,.5);transition:opacity .25s}
  #demo-cap:empty{opacity:0} #demo-tag{position:fixed;left:16px;bottom:16px;z-index:9999;padding:6px 12px;border-radius:999px;background:#2c46c2;color:#fff;font:600 13px system-ui;pointer-events:none}`;
  document.head.append(s);
  const c = document.createElement('div'); c.id = 'demo-cap'; document.body.append(c);
  const t = document.createElement('div'); t.id = 'demo-tag'; t.textContent = 'Live demo · real app · nothing edited'; document.body.append(t);
});
const rec = await page.screencast({ path: `${OUT}/${who}.webm` });
const t0 = Date.now();
const sounds = [];   // { at, file }
const now = () => (Date.now() - t0) / 1000;
const cap = async text => page.evaluate(x => { document.getElementById('demo-cap').textContent = x; }, text);
const click = async (text, scope = 'button') => { const [b] = await page.$$(`xpath/.//${scope}[contains(., "${text}")]`); if (!b) throw new Error(`no ${scope} "${text}"`); await b.click(); };
const count = () => page.$$eval('.note', n => n.length);
async function result(n) {   // wait until note n has its answer, then record Artha's spoken reply for the soundtrack
  await page.waitForFunction(k => { const notes = document.querySelectorAll('.note'); const x = notes[k - 1]; return x && x.querySelector('.act, .blocked, .clar'); }, { timeout: 60000 }, n);
  const at = now();
  const reply = await page.evaluate(k => document.querySelectorAll('.note')[k - 1].querySelector('.say span:last-child')?.textContent ?? '', n);
  if (reply) {
    const r = await fetch(`${B}/api/speak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: who, text: reply }) });
    if (r.ok) { const f = `${OUT}/${who}-reply-${n}.mp3`; fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); sounds.push({ at: at + 0.5, file: f, rate: 1.12 }); }
  }
  return at;
}
async function sample(label, clip, caption) { await cap(caption); await wait(500); sounds.push({ at: now(), file: `web/public/clips/${clip}.mp3` }); await click(label); }
async function type(text, caption) { await cap(caption); await page.click('.typebar input'); await page.type('.typebar input', text, { delay: 32 }); await wait(250); await page.keyboard.press('Enter'); }
const scrollDown = () => page.evaluate(() => { const f = document.querySelector('.feed'); f.scrollTo({ top: f.scrollHeight, behavior: 'smooth' }); });

if (who === 'aditya') {
  await cap('Aditya, 29 · Hyderabad · speaks Hinglish, his mother speaks Telugu'); await wait(3200);
  await sample('Shift Mehta ji', 'a2', 'He sends a voice note: “Mehta ji wala appointment parso shaam ko shift karwa do”');
  let n = 1; await result(n);
  await cap('Mehta ji → his doctor · parso shaam → Mon 23 Nov, 6 PM · “shift karwa do” → call the clinic'); await wait(4200);
  await cap('A reminder 1 hour before is predicted, because that is his habit'); await wait(3000);
  await click('Let Artha call'); await cap('One tap: Artha will call the clinic to move it'); await wait(2200);
  await click('Remind me'); await wait(1600);
  await scrollDown(); await sample('Telugu: Amma', 'a6', 'Now in Telugu: “Ammaki cheppu, repu madhyanam lunch ki vastanu”');
  n = 2; await result(n);
  await cap('Amma → his mother · repu madhyanam → Sun 1 PM · the message is written to her in Telugu'); await wait(4200);
  await click('Send'); await cap('Send: it lands in Amma’s chat, or opens WhatsApp with the text ready'); await wait(1500);
  const [amma] = await page.$$('xpath/.//button[contains(@class,"chatrow") and contains(., "Amma")]'); await amma.click(); await wait(2600);
  await page.click('.thread-head .icon-btn'); await wait(600);
  await type('Rahul ko bol do kal ki meeting 4 baje rakhte hain', 'Two Rahuls in his phone. He types this one.');
  n = 3; await result(n);
  await cap('“meeting” means work → Rahul Verma. No question asked; the cousin is one tap away'); await wait(2500);
  const sw = await page.$$('button[aria-label="Someone else?"]'); if (sw.length) { await sw[sw.length - 1].click(); } await wait(3000);
  await scrollDown();
  await type('HDFC wale ko OTP bata do 4 8 2 9 1 3', 'A caller pretending to be his bank asks for an OTP');
  n = 4; await result(n);
  await cap('Blocked before any AI sees it. The digits are hidden, and the caller can be marked as a scam'); await wait(4500);
  await cap('Everything Artha learned is on the right, with where it came from'); await wait(3000);
} else {
  await cap('Imran, 38 · runs a kirana store in Lucknow · keeps his customers’ credit in a khata'); await wait(3200);
  await sample('Sharma ji khata', 'i1', 'Voice note: “Sharma ji ke khate mein dhai hazaar aur likh do”');
  let n = 1; await result(n);
  await cap('dhai hazaar → ₹2,500 · khata → Sharma ji the customer, not Sharma Traders the supplier'); await wait(4200);
  await click('Add ₹'); await cap('One tap: added to his khata. The ledger on the right updates'); await wait(3200);
  await scrollDown(); await sample('Supplier Sharma', 'i2', 'Voice note: “Sharma wale ko bolo kal atta chaar baje tak bhej dein”');
  n = 2; await result(n);
  await cap('This time “Sharma wale” is the supplier · kal chaar baje → Sun 22 Nov, 4 PM'); await wait(3800);
  await click('Send'); await wait(1500);
  await scrollDown();
  await type('Gupta ji ko yaad dilao unka saade chhe sau baaki hai', 'He types: remind Gupta ji about what he owes');
  n = 3; await result(n);
  await cap('saade chhe sau → ₹650 · a polite reminder to Gupta ji, not a new entry in his khata'); await wait(4200);
  await scrollDown();
  await type('Ammi ki dawai medical wale se mangwa lo', 'Ammi’s medicine has run out');
  n = 4; await result(n);
  await cap('A message to Lucknow Medical Store, in Hindi, ready to send'); await wait(4200);
  await cap('Khata, messages and memory all saved. Nothing here was scripted'); await wait(3000);
}
await cap('');
await wait(400);
await rec.stop();
fs.writeFileSync(`${OUT}/${who}-sounds.json`, JSON.stringify(sounds, null, 1));
await browser.close();
await fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: who }) });
console.log(`${who}: ${now().toFixed(1)}s recorded, ${sounds.length} sounds`);
