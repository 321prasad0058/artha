// Frames of the opening intro, frozen at exact moments (?introAt=), desktop and phone.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const OUT = 'docs/shots/intro';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
for (const [w, h, tag, mobile, times] of [[1440, 900, 'desktop', false, [0.9, 1.75, 2.9, 5.3, 7.4]], [390, 844, 'phone', true, [1.75, 5.3, 7.4]]]) {
  for (const t of times) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    await page.goto(`http://localhost:8787/?intro=1&introAt=${t}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${OUT}/${tag}-${String(t).replace('.', '_')}.png` });
    await page.close();
  }
  console.log('frames', tag);
}
await browser.close();
