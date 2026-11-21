// Renders the film page frame by frame (deterministic seek), then encodes with ffmpeg.
// Usage: node film/render.mjs stills 5,20,33   → film/build/stills/t<sec>.jpg
//        node film/render.mjs frames [fps]      → film/build/frames/f%05d.jpg
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const [mode = 'stills', arg] = process.argv.slice(2);
const PORT = 8890;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--force-device-scale-factor=1'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/film/film.html`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  const total = await page.evaluate('window.__duration');
  if (mode === 'stills') {
    fs.mkdirSync('film/build/stills', { recursive: true });
    for (const s of (arg ?? '5').split(',').map(Number)) {
      await page.evaluate(t => window.__seek(t), s);
      await page.screenshot({ path: `film/build/stills/t${s}.jpg`, type: 'jpeg', quality: 85 });
      console.log('still', s);
    }
  } else if (mode === 'range') {
    // re-render only frames inside given windows, e.g. "13.4-17.9,118-122"; existing frames elsewhere are kept
    const fps = 30;
    for (const w of arg.split(',')) {
      const [a, b] = w.split('-').map(Number);
      for (let i = Math.floor(a * fps); i <= Math.ceil(b * fps); i++) {
        await page.evaluate(t => window.__seek(t), i / fps);
        await page.screenshot({ path: `film/build/frames/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92, optimizeForSpeed: true });
      }
      console.log('re-rendered', w);
    }
  } else {
    const fps = Number(arg ?? 30);
    const dir = 'film/build/frames';
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const n = Math.ceil(total * fps);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => window.__seek(t), i / fps);
      await page.screenshot({ path: `${dir}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92, optimizeForSpeed: true });
      if (i % 300 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    console.log(`done ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally {
  await browser.close();
  server.kill();
}
