// Screens of the Settings sheet for a user (desktop + phone).
//   node scripts/shots-settings.mjs <personaId>
import puppeteer from 'puppeteer-core';
const pid = process.argv[2] ?? 'aditya';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
for (const [w, h, tag, mobile] of [[1440, 1000, 'desktop', false], [390, 1400, 'phone', true]]) {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await pg.evaluateOnNewDocument(id => { try { localStorage.setItem('artha.me', id); } catch { /* */ } }, pid);
  await pg.goto(`http://localhost:8787/?p=${pid}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await pg.click('button[aria-label="Settings"]');
  await new Promise(r => setTimeout(r, 1500));
  await pg.screenshot({ path: `docs/shots/settings-${tag}.png` });
  await pg.close();
}
await b.close();
console.log('done');
