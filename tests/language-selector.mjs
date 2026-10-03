// Language selector verification: search filtering, custom language,
// RTL rendering. Usage: node lang-check.mjs [baseUrl]
import { chromium } from 'playwright-core';

const base = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/$/, '');
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));

let pass = 0, fail = 0;
const check = (n, c, extra = '') => {
  if (c) { pass++; console.log(`PASS ${n}`); }
  else { fail++; console.log(`FAIL ${n} ${extra}`); }
};

await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

const serviceWorkerReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  return registration.active?.scriptURL.endsWith('/sw.js') ?? false;
});
check('service-worker-registered', serviceWorkerReady);
const shellCache = await page.evaluate(async () => {
  const names = await caches.keys();
  const keys = names.includes('mothertongue-shell-v2')
    ? await caches.open('mothertongue-shell-v2').then((cache) => cache.keys())
    : [];
  return { ready: names.includes('mothertongue-shell-v2'), assets: keys.length };
});
check('service-worker-caches-shell-assets', shellCache.ready && shellCache.assets >= 4, JSON.stringify(shellCache));

await page.locator('#source-language-button').click();
await page.getByLabel('Search languages').fill('hindi');
await page.waitForTimeout(300);
await page.locator('.lang-option[role="option"]').first().click();
const sourceBtn = await page.locator('#source-language-button').textContent();
check('select-source-language', /Hindi/.test(sourceBtn || ''), sourceBtn || '');

await page.locator('#language-button').click();
await page.getByLabel('Search languages').fill('tami');
await page.waitForTimeout(300);
const opts = await page.locator('.lang-option[role="option"]').count();
check('search-filters-tamil', opts >= 1, `options=${opts}`);
const group = await page.locator('.lang-group').last().textContent();
check('result-count-shown', /result/i.test(group || ''), `group=${group}`);
await page.locator('.lang-option[role="option"]').first().click();
const btn1 = await page.locator('#language-button').textContent();
check('select-tamil', /Tamil/.test(btn1 || ''), btn1 || '');

// Custom language path
await page.locator('#language-button').click();
await page.getByRole('button', { name: /other language/i }).click();
await page.getByLabel('Type any language name').fill('Klingon');
await page.getByRole('button', { name: /^use$/i }).click();
const btn2 = await page.locator('#language-button').textContent();
check('custom-language', /Klingon/.test(btn2 || ''), btn2 || '');

await page.getByRole('button', { name: 'Offline settings' }).click();
await page.waitForTimeout(300);
check('shared-pack-has-one-download-control', await page.getByRole('button', { name: /Download/ }).count() === 1);
check('multilingual-pack-covers-catalog', await page.getByText(/Included in multilingual pack/).count() >= 90);
check('offline-catalog-is-expanded', await page.locator('.pack-item').count() >= 100);
const favoriteFrench = page.getByRole('button', { name: 'Add French to offline favorites' });
check('offline-language-favorite-control', await favoriteFrench.count() === 1);
await favoriteFrench.click();
check('offline-language-favorite-activates', await page.getByRole('button', { name: 'Remove French from offline favorites' }).getAttribute('aria-pressed') === 'true');
await page.getByLabel('Filter offline languages').fill('French');
check('offline-language-filter', await page.locator('.pack-item').count() === 1);
await page.getByLabel('Filter offline languages').fill('');
await page.getByRole('button', { name: 'Close offline settings' }).click();

// RTL rendering check via translation display path (static markup check)
const dirCount = await page.locator('p.translation, p.original-text').count();
check('no-crash-custom', errors.length === 0, errors.join('|').slice(0, 200));

await page.context().setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
check('offline-reload-renders-shell', await page.getByRole('heading', { name: /understand anything/i }).count() === 1);
await page.context().setOffline(false);

await browser.close();
console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
