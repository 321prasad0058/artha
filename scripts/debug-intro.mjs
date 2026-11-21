// Debug: canvas and host sizes of the intro on a phone viewport.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://localhost:8787/?intro=1', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 3000));
console.log(await page.evaluate(() => { const c = document.querySelector('.intro-gl canvas'); const h = document.querySelector('.intro-gl'); return { cw: c.width, ch: c.height, ccw: c.clientWidth, cch: c.clientHeight, hw: h.clientWidth, hh: h.clientHeight, iw: innerWidth, ih: innerHeight, style: c.getAttribute('style') }; }));
await browser.close();
