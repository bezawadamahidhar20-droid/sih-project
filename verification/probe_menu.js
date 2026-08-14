// Probe: after PDF export modal interaction, can we click the user menu?
const puppeteer = require('C:/Users/MAHIDHAR/.browser-test/node_modules/puppeteer-core');
const BASE = 'https://127.0.0.1:8443';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 120)); });
  await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 30000 });
  await page.$eval('form input[type="text"]', (el) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, 'doctore2e'); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.$eval('form input[type="password"]', (el) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, 'E2ePass123!'); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname === '/', { timeout: 30000 });

  // Which elements contain 'doctore2e' text and their clickability?
  const info = await page.evaluate(() => {
    const out = [];
    const els = Array.from(document.querySelectorAll('body *'));
    for (const el of els) {
      const tx = (el.innerText || '').trim();
      if (tx && tx.length <= 80 && tx.includes('doctore2e')) {
        out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), tx: tx.slice(0, 40) });
      }
    }
    return out;
  });
  console.log('doctore2e matches:', JSON.stringify(info, null, 1));
  // check for modal backdrop
  const modal = await page.evaluate(() => {
    const b = document.querySelector('.MuiBackdrop-root, [role="presentation"]');
    return b ? { cls: b.className, display: getComputedStyle(b).display } : null;
  });
  console.log('backdrop:', JSON.stringify(modal));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
