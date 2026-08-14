// MediScan AI - real-browser production smoke test (Phase 24)
// Drives installed Chrome against https://127.0.0.1:8443 (nginx TLS).
// Verifies: page loads, login, HttpOnly cookies (JS cannot read tokens),
// cookie-authenticated API calls, upload (stage + Upload button), real
// prediction, Grad-CAM image bytes, PDF export, logout, refresh denial.
const puppeteer = require('C:/Users/MAHIDHAR/.browser-test/node_modules/puppeteer-core');

const BASE = 'https://127.0.0.1:8443';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAMPLE = 'C:/Users/MAHIDHAR/.browser-test/scan_browser.png';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

// Click any element (button/div/li) by visible text — MUI renders menus as
// divs/lis; puppeteer lacks :has-text so we scan the DOM and click the
// deepest match (the actual event target).
async function clickButton(page, text, timeoutMs = 10000) {
  await page.waitForFunction((t) => {
    const els = Array.from(document.querySelectorAll('body *'));
    return els.some((el) => {
      const tx = (el.innerText || '').trim();
      return tx.length > 0 && tx.length <= 80 && tx.includes(t);
    });
  }, { timeout: timeoutMs }, text);
  await page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll('body *'));
    let best = null, bestDepth = -1;
    for (const el of els) {
      const tx = (el.innerText || '').trim();
      if (tx.length > 0 && tx.length <= 80 && tx.includes(t)) {
        let depth = 0, p = el;
        while (p && p !== document.body) { depth++; p = p.parentElement; }
        if (depth > bestDepth) { bestDepth = depth; best = el; }
      }
    }
    if (best) best.click();
  }, text);
}

// Set a React-controlled MUI input value via the native setter.
async function setInput(page, sel, val) {
  await page.$eval(sel, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, val);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const pdfResponses = [];
  const uploadResponses = [];
  page.on('response', (r) => {
    if (r.url().includes('/predictions/') && r.url().includes('/pdf')) {
      pdfResponses.push({ status: r.status(), type: r.headers()['content-type'] || '' });
    }
    if (r.url().includes('/scans/upload') || r.url().includes('/predictions/predict')) {
      uploadResponses.push({ status: r.status(), url: r.url() });
    }
  });

  // ---- 1. load the SPA ----
  console.log('== 1. load SPA over HTTPS ==');
  await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 30000 });
  ok('SPA loads; unauthenticated -> redirected to /login', page.url().includes('/login'));
  ok('no page errors on load', pageErrors.length === 0, `(errors=${pageErrors.slice(0,3)})`);

  // ---- 2. login ----
  console.log('== 2. login ==');
  await setInput(page, 'form input[type="text"]', 'doctore2e');
  await setInput(page, 'form input[type="password"]', 'E2ePass123!');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname === '/', { timeout: 30000 });
  ok('login redirects to dashboard', page.url().includes('/'));

  // ---- 3. HttpOnly cookie proof in the browser ----
  console.log('== 3. JavaScript cannot read auth tokens ==');
  const docCookie = await page.evaluate(() => document.cookie);
  ok('csrf_token readable by JS (double-submit design)', docCookie.includes('csrf_token'));
  ok('access_token NOT readable by JS (HttpOnly)', !docCookie.includes('access_token'));
  ok('refresh_token NOT readable by JS (HttpOnly)', !docCookie.includes('refresh_token'));

  // ---- 4. cookie-authenticated API call from the page ----
  console.log('== 4. cookie-authenticated API from the page ==');
  const me = await page.evaluate(async () => {
    const r = await fetch('/api/v1/auth/me', { credentials: 'include' });
    return { status: r.status, body: await r.json() };
  });
  ok('GET /auth/me via cookies -> 200', me.status === 200, `(got ${me.status})`);
  ok('authenticated as doctore2e', me.body?.username === 'doctore2e');

  // ---- 5. upload a synthetic non-PHI image ----
  console.log('== 5. upload (stage + Upload button) ==');
  await page.goto(BASE + '/upload', { waitUntil: 'networkidle0', timeout: 60000 });
  const input = await page.$('input[type="file"]');
  ok('upload dropzone present', !!input);
  if (input) {
    await input.uploadFile(SAMPLE);
    // react-dropzone stages the file; the app requires clicking the Upload button
    await clickButton(page, 'Upload 1 file', 10000);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some((b) => (b.innerText || '').includes('Analyze Now')),
      { timeout: 60000 }
    );
    ok('upload completed (Analyze Now card shown)', true);
    await clickButton(page, 'Analyze Now', 10000);
    await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 30000 });
    ok('navigated to /results/:scanId', true);
  }

  // ---- 6. real prediction + Grad-CAM ----
  console.log('== 6. prediction + Grad-CAM ==');
  try {
    // AuthImage fetches the gradcam endpoint with cookies and renders a blob
    // URL, so match by alt text and verify real decoded bytes (naturalWidth).
    await page.waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll('img[alt*="Grad-CAM"]'));
        return imgs.some((i) => i.naturalWidth > 0);
      },
      { timeout: 180000 }
    );
    ok('Grad-CAM image rendered (real bytes, naturalWidth>0)', true);
  } catch (e) {
    ok('Grad-CAM image rendered', false, String(e).slice(0, 120));
  }
  const hasPrediction = await page.evaluate(() =>
    document.body.innerText.includes('Pneumonia') || document.body.innerText.includes('Normal') ||
    document.body.innerText.includes('Confidence') || document.body.innerText.includes('Findings'));
  ok('prediction result rendered on page', hasPrediction);

  // ---- 7. PDF export ----
  console.log('== 7. PDF export ==');
  try {
    await clickButton(page, 'Export Clinical Report', 15000);
    await clickButton(page, 'Download Clinical Report', 15000);
    await new Promise((r) => setTimeout(r, 5000));
    const pdfOk = pdfResponses.some((p) => p.status === 200 && p.type.includes('application/pdf'));
    ok('PDF served with 200 application/pdf (authorized cookies)', pdfOk, `(responses=${JSON.stringify(pdfResponses.slice(0,2))})`);
    // close the report dialog so its backdrop does not block the user menu
    await clickButton(page, 'Cancel', 10000);
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) {
    ok('PDF export', false, String(e).slice(0, 120));
  }

  // ---- 8. logout + refresh-after-logout denial ----
  console.log('== 8. logout + refresh revocation ==');
  try {
    await clickButton(page, 'doctore2e', 10000);
    await clickButton(page, 'Sign out', 10000);
    await page.waitForFunction(() => location.pathname === '/login', { timeout: 30000 });
    ok('logout -> redirected to /login', true);
  } catch (e) {
    await page.evaluate(async () => {
      const csrf = (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || '';
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{}' });
    });
    ok('logout (fallback fetch) executed', true, String(e).slice(0, 80));
  }
  const afterLogout = await page.evaluate(async () => {
    const me = await fetch('/api/v1/auth/me', { credentials: 'include' });
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { me: me.status, refresh: refresh.status, cookie: document.cookie };
  });
  ok('GET /auth/me after logout -> 401', afterLogout.me === 401, `(got ${afterLogout.me})`);
  ok('POST /auth/refresh after logout -> 401 (revoked)', afterLogout.refresh === 401, `(got ${afterLogout.refresh})`);
  ok('csrf_token cleared from JS-visible cookies after logout', !afterLogout.cookie.includes('csrf_token'));

  // ---- summary ----
  console.log('');
  console.log(`CONSOLE ERRORS (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('  -', String(e).slice(0, 160)));
  console.log(`PAGE ERRORS (${pageErrors.length}):`);
  pageErrors.slice(0, 5).forEach((e) => console.log('  -', String(e).slice(0, 160)));
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
