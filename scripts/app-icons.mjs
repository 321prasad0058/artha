// App icons for the installed app, drawn from the vector mark (never upscaled).
//   node scripts/app-icons.mjs
// "any": Equal green edge to edge with the white ring-a; iOS and launchers round the corners themselves.
// "maskable": same, mark smaller so it survives any launcher shape (circle, squircle…) inside the 40% safe zone.
// Files go under web/public/app-icon/v<N>/: launchers cache icons by URL, so bump V (and sw.js VERSION) on a redesign.
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const V = 1, DIR = `web/public/app-icon/v${V}`;
const GREEN = '#00B140', LIME = '#BAFF29';
// the mark's box is x 9..51, y 14..54 in a 64 grid; centre it and scale
const mark = s => `<g transform="translate(32 32) scale(${s}) translate(-30 -34)">
  <circle cx="28" cy="34" r="15" fill="none" stroke="#fff" stroke-width="8"/>
  <rect x="43" y="14" width="8" height="40" rx="4" fill="#fff"/>
  <circle cx="28" cy="34" r="4.5" fill="${LIME}"/></g>`;
const svg = s => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${GREEN}"/>${mark(s)}</svg>`;

await mkdir(DIR, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const pg = await b.newPage();
const out = async (src, size, file) => {
  await pg.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await pg.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
  await pg.screenshot({ path: file, omitBackground: false });
  return file;
};
const made = [];
for (const [s, size, f] of [[0.82, 192, `${DIR}/any-192.png`], [0.82, 512, `${DIR}/any-512.png`], [0.62, 192, `${DIR}/maskable-192.png`], [0.62, 512, `${DIR}/maskable-512.png`],
  [0.82, 180, 'web/public/apple-touch-icon.png'], [0.82, 32, 'web/public/favicon-32.png']]) made.push(await out(svg(s), size, f));
await b.close();
console.log(made.join('\n'));
