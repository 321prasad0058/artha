// One look at the embedding map page (desktop + phone) before publishing.
import puppeteer from 'puppeteer-core';
const file = `file://${process.cwd()}/docs/embed-map/index.html`;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h, tag, mobile] of [[1440, 900, 'desktop', false], [390, 844, 'phone', true]]) {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await pg.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await pg.goto(`${file}#rohan`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 4000));
  await pg.screenshot({ path: `docs/shots/embed-map-${tag}.png` });
  await pg.close();
}
await b.close();
console.log('done');
