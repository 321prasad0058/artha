// Frames of the opening intro at each beat (desktop + one phone frame).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const OUT = 'docs/shots/intro';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
for (const [w, h, tag, mobile, times] of [[1440, 900, 'desktop', false, [1.8, 4.0, 7.2, 10.4, 13.8]], [390, 844, 'phone', true, [4.0, 7.2, 10.4]]]) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await page.goto('http://localhost:8787/?intro=1', { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  for (const t of times) {
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    await page.screenshot({ path: `${OUT}/${tag}-${String(t).replace('.', '_')}.png` });
  }
  await page.close();
  console.log('frames', tag);
}
await browser.close();
