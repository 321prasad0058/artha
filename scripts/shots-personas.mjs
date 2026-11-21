// One phone screenshot per person: a real note, understood, with its one-tap phone connectors.
import puppeteer from 'puppeteer-core';

const OUT = process.argv[2] ?? '.';
const B = 'http://localhost:8787';
const NOTES = {
  aditya: 'Anna ko bol do parcel security pe chhod de, aur Mehta ji wala appointment parso shaam ko shift karwa do.',
  sunita: 'Dudhwalyanna ya mahinyache paise pathav.',
  imran: 'Gupta ji ko yaad dilao unka saade chhe sau baaki hai.',
  meenakshi: 'Auto Ramesh-kku sollu, naalai kaalai aaru manikku vaanga.',
};
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
for (const [p, say] of Object.entries(NOTES)) {
  await fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p }) });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.setViewport({ width: 390, height: 1000, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${B}/?p=${p}&say=${encodeURIComponent(say)}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.act, .blocked, .kgroup', { timeout: 60000 });
  await new Promise(r => setTimeout(r, 1600));
  await page.evaluate(() => { const n = document.querySelector('.note'); n?.scrollIntoView({ block: 'start' }); });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: `${OUT}/${p}.png` });
  await page.close();
  console.log('shot', p);
}
await browser.close();
for (const p of Object.keys(NOTES)) await fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p }) });
