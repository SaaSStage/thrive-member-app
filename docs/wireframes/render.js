// Render each .screen frame in screens.html to its own PNG.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTML = 'file://' + path.resolve(__dirname, 'screens.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, 'png');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1200, deviceScaleFactor: 2 });
  await page.goto(HTML, { waitUntil: 'networkidle0' });

  const screens = await page.evaluate(() => window.__SCREENS__);
  let n = 0;
  for (const s of screens) {
    const el = await page.$('#scr-' + s.id);
    const name = String(++n).padStart(2, '0') + '_' + s.id + '.png';
    await el.screenshot({ path: path.join(OUT, name) });
    console.log('rendered', name);
  }
  // also a full contact sheet
  await page.screenshot({ path: path.join(OUT, '00_contact-sheet.png'), fullPage: true });
  console.log('rendered 00_contact-sheet.png');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
