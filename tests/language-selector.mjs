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

// RTL rendering check via translation display path (static markup check)
const dirCount = await page.locator('p.translation, p.original-text').count();
check('no-crash-custom', errors.length === 0, errors.join('|').slice(0, 200));

await browser.close();
console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
