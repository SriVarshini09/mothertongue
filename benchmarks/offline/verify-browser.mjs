// Re-runnable proof that offline engines execute in a real browser.
// Needs: npx playwright-core install chromium (one-time).
// Usage: npm run verify:offline-engines [-- path/to/telugu.png]
// Verifies transformers.js NLLB q8 translation + tesseract.js Telugu OCR
// inside headless Chromium (real WASM execution, CDN-pinned libs matching
// the versions bundled by the app).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const pngArg = process.argv[2];
let pngB64 = '';
if (pngArg) {
  pngB64 = readFileSync(pngArg).toString('base64');
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[pg]', m.text().slice(0, 160)));
page.on('pageerror', (e) => console.log('[pgerror]', String(e).slice(0, 200)));

const results = await page.evaluate(async (png) => {
  const out = [];
  try {
    const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm');
    const tr = await T.pipeline('translation', 'Xenova/nllb-200-distilled-600M', { dtype: 'q8' });
    out.push('PIPELINE_OK');
    const cases = [
      ['Can you teach me to drink water?', 'tel_Telu', /నాకు|నన్ను/, /నీకు|మీకు/],
      ['Can I teach you English?', 'tel_Telu', /నేను/, null],
    ];
    for (const [text, tgt, good, bad] of cases) {
      const r = await tr(text, { src_lang: 'eng_Latn', tgt_lang: tgt });
      const s = (Array.isArray(r) ? r[0]?.translation_text : r.translation_text) ?? '';
      const ok = good.test(s) && !(bad && bad.test(s));
      out.push(`${ok ? 'PASS' : 'FAIL'} :: ${text} => ${s}`);
    }
  } catch (e) {
    out.push('NLLB_FAIL :: ' + String((e && e.message) || e).slice(0, 300));
  }
  if (png) {
    try {
      const Tess = await import('https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/+esm');
      const worker = await Tess.createWorker(['eng', 'tel']);
      const { data } = await worker.recognize(`data:image/png;base64,${png}`);
      await worker.terminate();
      const t = data.text || '';
      const ok = /నాకు/.test(t);
      out.push(`${ok ? 'PASS' : 'FAIL'} TESS :: ${t.slice(0, 120)}`);
    } catch (e) {
      out.push('TESS_FAIL :: ' + String((e && e.message) || e).slice(0, 300));
    }
  } else {
    out.push('SKIP TESS (no PNG path given)');
  }
  return out;
}, pngB64);

let fail = 0;
for (const line of results) {
  console.log(line);
  if (/^(FAIL|NLLB_FAIL|TESS_FAIL)/.test(line)) fail++;
}
await browser.close();
console.log(fail === 0 ? 'BROWSER_VERIFY_OK' : 'BROWSER_VERIFY_FAILED');
process.exit(fail ? 1 : 0);
