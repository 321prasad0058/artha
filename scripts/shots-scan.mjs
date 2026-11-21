// Screens of the two new pieces: a scanned khata page (Imran) and the structured "you said" card (Sunita).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const B = 'http://localhost:8787', OUT = 'docs/shots';
fs.mkdirSync(OUT, { recursive: true });
const reset = p => fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p }) });
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
for (const [w, h, tag, mobile] of [[1440, 1000, 'desktop', false], [390, 1500, 'phone', true]]) {
  await reset('imran');
  let page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await page.goto(`${B}/?p=imran`, { waitUntil: 'networkidle0' });
  const input = await page.$('.typebar input[type=file]');
  await input.uploadFile('eval/images/khata-imran.jpg');
  await page.waitForSelector('.scan', { timeout: 90000 });
  await wait(1800);
  const iss = await page.$$('.issue'); if (iss[0]) await iss[0].click();
  await wait(500);
  await page.evaluate(() => document.querySelector('.note')?.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${OUT}/scan-${tag}.png` });
  await page.close();

  await reset('sunita');
  page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.setViewport({ width: w, height: mobile ? 1100 : h, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const say = 'मी खात्यात काही गोष्टी ॲड करायला सांगतोय, सो तेवढं ॲड करा. आता बाराशे रुपये आपल्याला सप्लायरकडून घ्यायचे आहे. त्यांचं नाव आहे आनंद पाटील. मग आपल्याला पाच हजार दुसऱ्या सप्लायरला द्यायचे. पाच किलो राईस विकला, ज्याचे सहाशे रुपये झाले. अजून तांदूळ पण गेली, ज्याचे चारशे रुपये झाले.';
  await page.goto(`${B}/?p=sunita&say=${encodeURIComponent(say)}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.act, .clar, .kgroup', { timeout: 90000 });
  await wait(1500);
  await page.evaluate(() => document.querySelector('.note')?.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${OUT}/heard-${tag}.png` });
  await page.close();
  console.log('shot', tag);
}
await browser.close();
await reset('imran'); await reset('sunita');
