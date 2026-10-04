// Real-browser smoke: hydration errors, console errors, status sync,
// and one end-to-end translation from inside Chromium.
// Usage: node browser-app.mjs [baseUrl]
import { chromium } from 'playwright-core';

const base = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/$/, '');
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200));
});

let pass = 0, fail = 0;
const check = (n, c, extra = '') => {
  if (c) { pass++; console.log(`PASS ${n}`); }
  else { fail++; console.log(`FAIL ${n} ${extra}`); }
};

await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
check('no-page-errors', errors.length === 0, errors.join(' | ').slice(0, 400));
check('headline', await page.getByRole('heading', { name: /understand anything/i }).count() === 1);
const pill = await page.locator('.status-pill').first().textContent();
check('status-synced', /Online|Offline/.test(pill || ''), `pill=${pill}`);
check('no-hydration-text', !errors.join(' ').toLowerCase().includes('hydration'));

// End-to-end translation from inside the browser.
await page.getByPlaceholder(/paste something/i).fill('Can you teach me to drink water?');
await page.getByRole('button', { name: /^translate$/i }).click();
await page.waitForSelector('.translation', { timeout: 90000 });
const out = await page.locator('.translation').textContent();
check('browser-translation-telugu', /నాకు|నన్ను/.test(out || ''), (out || '').slice(0, 80));
check('browser-no-you-swap', !/నీకు|మీకు/.test(out || ''), (out || '').slice(0, 80));
check('voice-feeling-control', await page.getByLabel('Voice feeling').count() === 1);
await page.getByLabel('Voice feeling').selectOption('encouraging');
check('voice-feeling-selects-emotion', await page.getByLabel('Voice feeling').inputValue() === 'encouraging');
check('still-no-errors', errors.length === 0, errors.join(' | ').slice(0, 400));

await browser.close();
console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
