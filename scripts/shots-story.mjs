// Screenshots of the real app for the explainer page. Needs the local server on :8787.
import puppeteer from 'puppeteer-core';

const OUT = process.argv[2] ?? '.';
const B = 'http://localhost:8787';
const wait = ms => new Promise(r => setTimeout(r, ms));
const reset = p => fetch(`${B}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p }) });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const click = async (page, text) => { const [b] = await page.$$(`xpath/.//button[contains(., "${text}")]`); if (!b) throw new Error(`no button ${text}`); await b.click(); };
const done = page => page.waitForSelector('.act, .blocked, .clar', { timeout: 60000 });

async function open(p, vp) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.setViewport(vp);
  await page.goto(`${B}/?p=${p}`, { waitUntil: 'networkidle0' });
  await wait(1500);
  return page;
}
const DESK = { width: 1440, height: 940, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// 1. desktop, empty
await reset('aditya');
let page = await open('aditya', DESK);
await page.screenshot({ path: `${OUT}/desk-empty.png` });
// 2. desktop, a note understood, then compared with the base model
await click(page, 'Shift Mehta ji'); await done(page); await wait(1500);
await page.screenshot({ path: `${OUT}/desk-note.png` });
await click(page, 'Base model'); await page.waitForSelector('.cmp', { timeout: 60000 }); await wait(1200);
await (await page.$('.pane-thread')).screenshot({ path: `${OUT}/desk-compare.png` });
await click(page, 'How'); await wait(1000);
const how = await page.$('.how'); if (how) await how.screenshot({ path: `${OUT}/how.png` });
await page.close();

// 3. phone: Telugu note, send it, see it in Chats
await reset('aditya');
page = await open('aditya', PHONE);
await page.screenshot({ path: `${OUT}/phone-empty.png` });
await click(page, 'Telugu: Amma'); await done(page); await wait(1500);
await page.screenshot({ path: `${OUT}/phone-note.png` });
await click(page, 'Send'); await wait(1500);
await page.click('.tabbar button:nth-child(2)'); await wait(800);
const [amma] = await page.$$('xpath/.//button[contains(@class,"chatrow") and contains(., "Amma")]'); await amma.click(); await wait(900);
await page.screenshot({ path: `${OUT}/phone-chat.png` });
await page.close();

// 4. phone: OTP scam blocked
await reset('meenakshi');
page = await open('meenakshi', PHONE);
await click(page, 'Pension OTP scam'); await done(page); await wait(1500);
await page.screenshot({ path: `${OUT}/phone-otp.png` });
await page.close();

// 5. desktop: shopkeeper ledger
await reset('imran');
page = await open('imran', DESK);
await click(page, 'Sharma ji khata'); await done(page); await wait(1500);
await page.screenshot({ path: `${OUT}/desk-imran.png` });
await page.close();

// 6. results
page = await open('aditya', DESK);
await click(page, 'Results'); await wait(2500);
await page.screenshot({ path: `${OUT}/desk-results.png` });
await page.close();

await browser.close();
for (const p of ['aditya', 'meenakshi', 'imran']) await reset(p);
console.log('shots done');
