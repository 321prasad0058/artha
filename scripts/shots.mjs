// Visual check: drive the real app in Chrome, play a sample, screenshot desktop and phone.
// Usage: node scripts/shots.mjs <outdir> [persona] [sample label]
import puppeteer from 'puppeteer-core';

const [out = '.', persona = 'aditya', label = 'Anna + parcel'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
await fetch('http://localhost:8787/api/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: persona }) });

const sizes = [
  ['desk', { width: 1440, height: 960 }],
  ['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
for (const [name, vp] of sizes) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await page.setViewport(vp);
  await page.goto(`http://localhost:8787/?p=${persona}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: `${out}/${name}-empty.png` });
  const [btn] = await page.$$(`xpath/.//button[contains(., "${label}")]`);
  if (btn) await btn.click(); else console.log('sample not found');
  await page.waitForSelector('.act, .blocked, .clar, .err', { timeout: 60000 }).catch(() => console.log('no result in 60s'));
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: `${out}/${name}-note.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(name, 'horizontal overflow px:', overflow);
  await page.close();
}
await browser.close();
