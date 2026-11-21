// Renders the test khata page (eval/images/khata-page.html) to a phone-photo-like JPEG.
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const pg = await b.newPage(); await pg.setViewport({ width: 900, height: 1100 });
await pg.goto(`file://${process.cwd()}/eval/images/khata-page.html`, { waitUntil: 'networkidle0' });
await pg.screenshot({ path: 'eval/images/khata-imran.jpg', type: 'jpeg', quality: 72 });
await b.close();
