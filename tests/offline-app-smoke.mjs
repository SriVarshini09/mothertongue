// Heavy opt-in proof of the app's actual offline translation path.
// Requires a running local server and downloads the real ~912 MB NLLB pack.
// Usage: npm run dev -- --port 3100 (terminal 1), npm run test:offline-app (terminal 2)
import { chromium } from 'playwright-core';

const base = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(30_000);
let offlineStarted = false;
const failedAfterOffline = [];
page.on('console', (message) => {
  if (message.type() === 'error') console.log(`[browser] ${message.text().slice(0, 1000)}`);
});
page.on('requestfailed', (request) => {
  if (offlineStarted) failedAfterOffline.push(request.url());
  console.log(`[browser-request-failed] ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`);
});

const pack = page.locator('.pack-item').filter({ hasText: 'Telugu' });
await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.getByRole('button', { name: 'Offline settings' }).click();
await pack.getByRole('button', { name: /Download/ }).click();
await pack.getByRole('button', { name: /^Download$/ }).click();

console.log('Downloading the verified NLLB pack…');
const downloadState = await page.waitForFunction(
  () => {
    const text = Array.from(document.querySelectorAll('.pack-item'))
      .find((node) => /Telugu/.test(node.textContent || ''))?.textContent || '';
    if (/Downloaded/.test(text)) return 'ok';
    if (/Download failed|Could not load download info|Not enough free storage|limited memory/i.test(text)) {
      return `error: ${text.replace(/\s+/g, ' ').trim()}`;
    }
    return false;
  },
  null,
  { timeout: 15 * 60_000 }
);
const downloadResult = await downloadState.jsonValue();
if (downloadResult !== 'ok') throw new Error(String(downloadResult));
console.log('PASS verified pack download and Cache API/IndexedDB priming');

await page.getByRole('radio', { name: /Offline/ }).check();
await page.getByRole('button', { name: 'Close offline settings' }).click();
await page.locator('#source-language-button').click();
await page.getByLabel('Search languages').fill('English');
await page.locator('.lang-option[role="option"]').first().click();

const requestsAfterOffline = [];
page.on('request', (request) => requestsAfterOffline.push(request.url()));
offlineStarted = true;
await page.context().setOffline(true);
await page.getByPlaceholder(/paste something/i).fill('Can you teach me to drink water?');
await page.getByRole('button', { name: /^Translate$/i }).click();
const translationState = await page.waitForFunction(
  () => {
    const translation = document.querySelector('.translation')?.textContent || '';
    if (translation.trim()) return { kind: 'translation', text: translation };
    const error = document.querySelector('[role="alert"]')?.textContent || '';
    if (error.trim()) return { kind: 'error', text: error };
    return false;
  },
  null,
  { timeout: 180_000 }
);
const translationResult = await translationState.jsonValue();
if (!translationResult || translationResult.kind !== 'translation') {
  const diagnostics = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const cacheEntries = {};
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      cacheEntries[name] = (await cache.keys()).map((request) => request.url);
    }
    const dbKeys = await new Promise((resolve) => {
      const request = indexedDB.open('mothertongue-models', 1);
      request.onerror = () => resolve([]);
      request.onsuccess = () => {
        const db = request.result;
        const getAll = db.transaction('files', 'readonly').objectStore('files').getAllKeys();
        getAll.onsuccess = () => {
          resolve((getAll.result || []).map(String));
          db.close();
        };
        getAll.onerror = () => {
          resolve([]);
          db.close();
        };
      };
    });
    return { cacheEntries, dbKeys };
  });
  console.log(`OFFLINE_DIAGNOSTICS ${JSON.stringify(diagnostics)}`);
  console.log(`OFFLINE_REQUESTS ${JSON.stringify(requestsAfterOffline)}`);
  throw new Error(`offline translation did not complete: ${translationResult?.text || '(no error shown)'}`);
}
const output = translationResult.text;
if (!/నాకు|నన్ను/.test(output || '') || /నీకు|మీకు/.test(output || '')) {
  throw new Error(`offline translation failed role check: ${output || '(empty)'}`);
}
const networkLeak = failedAfterOffline.filter((url) => /\/api\/|huggingface|cdn\.jsdelivr/i.test(url));
if (networkLeak.length > 0) throw new Error(`offline translation attempted network access: ${networkLeak.join(', ')}`);
console.log(`PASS offline worker translation: ${(output || '').slice(0, 120)}`);

await browser.close();
console.log('OFFLINE_APP_VERIFY_OK');
