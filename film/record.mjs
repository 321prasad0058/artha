// Records real footage of the working app (local server on :8787) for the film, and logs when things happen.
// Output: film/build/rec/<name>.webm and film/build/rec/marks.json
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const B = 'http://localhost:8787';
const OUT = 'film/build/rec';
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const reset = p => fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p }) });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const marks = fs.existsSync(`${OUT}/marks.json`) ? JSON.parse(fs.readFileSync(`${OUT}/marks.json`, 'utf8')) : {};
const only = process.argv[2]?.split(',');

async function shoot(name, persona, vp, steps) {
  if (only && !only.includes(name)) return;
  await reset(persona);
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.goto(`${B}/?p=${persona}`, { waitUntil: 'networkidle0' });
  await wait(1200);
  const rec = await page.screencast({ path: `${OUT}/${name}.webm` });
  const t0 = Date.now();
  const m = {};
  const mark = k => (m[k] = (Date.now() - t0) / 1000);
  const click = async text => { const [b] = await page.$$(`xpath/.//button[contains(., "${text}")]`); if (!b) throw new Error(`${name}: no button "${text}"`); await b.click(); };
  await steps({ page, wait, mark, click });
  mark('end');
  await rec.stop();
  await page.close();
  marks[name] = m;
  console.log(name, JSON.stringify(m));
}

await shoot('mehta', 'aditya', DESK, async ({ page, wait, mark, click }) => {
  await wait(700); mark('click'); await click('Shift Mehta ji');
  await page.waitForSelector('.act', { timeout: 60000 }); mark('result');
  await wait(3200); await click('How'); mark('how'); await wait(2600);
});

await shoot('rahul', 'aditya', DESK, async ({ page, wait, mark }) => {
  await wait(600); await page.click('.typebar input'); mark('type');
  await page.type('.typebar input', 'Rahul ko bol do kal ki meeting 4 baje rakhte hain', { delay: 38 });
  await wait(300); mark('send'); await page.keyboard.press('Enter');
  await page.waitForSelector('.act', { timeout: 60000 }); mark('result');
  await wait(2200); const sw = await page.$('button[aria-label="Someone else?"]'); if (sw) { await sw.click(); mark('swap'); } await wait(2600);
});

await shoot('telugu', 'aditya', PHONE, async ({ page, wait, mark, click }) => {
  await wait(600); mark('click'); await click('Telugu: Amma');
  await page.waitForSelector('.act', { timeout: 60000 }); mark('result');
  await wait(2400); await click('Send'); mark('send'); await wait(1300);
  await page.click('.tabbar button:nth-child(2)'); mark('chats'); await wait(900);
  const [amma] = await page.$$('xpath/.//button[contains(@class,"chatrow") and contains(., "Amma")]'); await amma.click(); mark('thread'); await wait(2400);
});

await shoot('imran', 'imran', DESK, async ({ page, wait, mark, click }) => {
  await wait(600); mark('click'); await click('Sharma ji khata');
  await page.waitForSelector('.act', { timeout: 60000 }); mark('result');
  await wait(2200); await click('Add ₹'); mark('add'); await wait(2800);
});

await shoot('otp', 'meenakshi', PHONE, async ({ page, wait, mark, click }) => {
  await wait(600); mark('click'); await click('Pension OTP scam');
  await page.waitForSelector('.blocked', { timeout: 60000 }); mark('result'); await wait(3400);
});

fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 1));
await browser.close();
for (const p of ['aditya', 'imran', 'meenakshi']) await reset(p);
