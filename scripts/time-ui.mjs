// Drives the real app and reads the per-note timeline it shows (ms from release/send to each moment).
//   node scripts/time-ui.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
const B = process.argv[2] ?? 'http://localhost:8787';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const pg = await b.newPage();
pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
await fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: 'rohan' }) });
await pg.goto(`${B}/?p=rohan`, { waitUntil: 'networkidle0' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const done = async n => {
  await pg.waitForFunction(k => { const x = document.querySelectorAll('.note')[k - 1]; return x && /Cards/.test(x.querySelector('.times')?.textContent ?? ''); }, { timeout: 60000 }, n);
  await wait(2500);
};
const read = n => pg.evaluate(k => { const x = document.querySelectorAll('.note')[k - 1]; return `${x.querySelector('.gist')?.textContent ?? x.querySelector('.said')?.textContent} → ${x.querySelector('.times')?.textContent}`; }, n);
const [pill] = await pg.$$('.pill');
await pill.click(); await done(1); console.log('voice', await read(1));
const notes = ['Kal mera kya plan hai?', 'Priya ko bolo self review bhar diya hai.'];
for (let i = 0; i < notes.length; i++) {
  await pg.type('.typebar input:not([type=file])', notes[i]); await pg.keyboard.press('Enter');
  await done(i + 2); console.log('typed', await read(i + 2));
}
await b.close();
