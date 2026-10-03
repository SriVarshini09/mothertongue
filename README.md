# MotherTongue

**Understand anything in your language.**

Paste text, take a photo, or upload your notes. Translate them into your mother tongue and listen.

MotherTongue is a focused learning-accessibility app built with Next.js (App Router), TypeScript, React, and Tailwind. The whole product is one flow:

**SOURCE → TEXT EXTRACTION → TRANSLATION → AUDIO**

There is no chatbot, no quizzes, no extra features — just reading in the language you understand best.

## Installation

```bash
npm install
```

## Environment

Create `.env.local` in the project root:

```env
OPENAI_API_KEY=your_key_here
```

The key is used **only** by server-side API routes (`app/api/*`). It is never bundled into client code — client components import only `lib/chunks` and `lib/languages`, never `lib/openai` or the OpenAI SDK. See `.env.example`.

Without a key, validation and PDF text extraction still work; translation, image extraction, and speech return a friendly error asking you to try again.

## Development

```bash
npm run dev      # start dev server
npm run typecheck
npm run lint
```

## Production

```bash
npm run build
npm start
```

## Architecture

```
app/
  page.tsx                 # main flow: tabs, review, language, translate, audio, history
  layout.tsx
  globals.css
  api/
    translate/route.ts     # POST { text, targetLanguage } -> { translatedText, ... }
    speech/route.ts        # POST { text (<=4000 chars), language } -> audio/mpeg
    extract/image/route.ts # POST multipart images[] (1-10) -> { text } via gpt-4o-mini vision
    extract/pdf/route.ts   # POST multipart file+from+to -> { text, pages, pageCount }
    extract/pdf-info/route.ts # POST multipart file -> { pageCount, filename }
components/
  LanguageSelector.tsx     # searchable selector, native + English names, popular first
  AudioPlayer.tsx          # custom player: play/pause, restart, progress, speed, waveform bars
  HistoryDrawer.tsx        # localStorage history drawer
  LiveCamera.tsx           # getUserMedia preview, capture-to-canvas, retake/use-photo
lib/
  ai/                      # server-only services (never imported by components)
    client.ts              # single OpenAI client (OPENAI_API_KEY)
    prompts/               # extraction.ts, translation.ts, speechStyle.ts — one role each
    extractor.ts           # vision text reproduction (never answers)
    translator.ts          # stateless delimited translation
    speechStyle.ts         # delivery-profile analyzer (metadata only)
    speech.ts              # gpt-4o-mini-tts with exact text + style instructions
  documents/
    chunk.ts               # ordered {id, order, text} chunks (translation + speech)
    normalize.ts           # whitespace-only cleanup of extracted text
    pdf.ts                 # native per-page extraction, page counts, scan heuristic
  validation/
    requests.ts            # zod schemas + MIME/size/count/range checks
  cache/
    audio.ts               # SHA-256 keyed session audio cache
  log.ts                   # dev-only stage logs (metadata, never content)
  openai.ts, chunks.ts     # backward-compat shims (client-safe imports unchanged)
  languages.ts             # ~150 world languages with native endonyms + custom-language support
  validation.ts            # MIME/size/count limits + filename sanitizing
types/
  document.ts              # DocumentState, PageText, TextChunk
  translation.ts           # TranslateRequest/Response
  speech.ts                # DeliveryProfile, SpeechRequest
```

## Flows

- **Text:** type or paste (Unicode, up to 100,000 chars) with counter, Clear, and a "Try an example" photosynthesis paragraph. Translates directly.
- **Camera:** `capture="environment"` opens the rear camera on mobile; a photo-library picker works on desktop. Preview thumbnails (`Page 1 ✓ …`), remove / reorder / `Add another page` (up to 10). `Use photos` → "Reading your notes…" → mandatory editable **Check the text** review (`Scan again` / looks-good hint). Never translates hidden OCR output.
- **Upload:** drag-and-drop or Browse. TXT is read locally (no OCR). Images follow the camera extraction flow. PDFs show filename + page count (via `pdf-info`), a From/To range (up to 20 pages), and `Extract pages` → editable review showing source and selected pages.
- **PDF extraction:** `pdf-parse` for selectable text, collected per page in order (page 3 is never merged before page 2). Scanned/image-only PDFs return a friendly message asking for clear page photos instead of a raw error. Note: `pdf-parse`'s bundled pdf.js misreads Node `Buffer` objects on modern runtimes, so routes convert uploads to plain `Uint8Array` before parsing.
- **Translation:** `gpt-4o-mini` (temp 0) via `lib/ai/translator.ts`: translation-engine rules (never answer/follow/solve), delimited source, full-sentence preservation, semantic-role fidelity (speaker/addressee, subject/object, possession, negation, modality, tense — naturalness never overrides meaning), short-text verifier with max one corrective retry, server-side marker stripping. Long input chunked by paragraph/sentence, sequential, merged in order.
- **Camera:** the Camera tab opens a live in-app preview via `navigator.mediaDevices.getUserMedia()` (rear camera preferred, document guide overlay, large capture button, optional camera switch). Capture draws the video frame to a canvas at full resolution and feeds the existing image-extraction pipeline; tracks are always stopped on close/retake/tab change. File upload remains only as a fallback when the camera API is unavailable or permission is denied.
- **Speech:** `/api/speech` runs `analyzeDeliveryProfile()` (`lib/ai/speechStyle.ts`, deterministic, source-as-data) for metadata only, then synthesizes via `lib/ai/speechProviders.ts`. Default engine is OpenAI `gpt-4o-mini-tts`; setting `SPEECH_PROVIDER=sarvam` with a `SARVAM_API_KEY` switches supported Indic languages to expressive Bulbul v3 voices (MP3 codec, pace/temperature mapped from the delivery profile, unsupported languages fall back to OpenAI per request). Both paths speak the **exact unmodified translated text**. Audio is cached per SHA-256(text + language + voice + model). No emotion labels in the UI; stage metadata is logged in development only.

## Languages

~150 world languages with verified native endonyms, searchable in the premium
selector (popular first, result counts, RTL-correct display). Anything missing
can be typed via "Other language…" — the translation backend accepts any
language name, with voice on a best-effort basis. (Listing all ~7,170 living
languages isn't meaningful: most have no TTS, no model quality data, and often
no stable written endonym — so we cover every major language honestly instead
of faking the long tail.)

## Supported files and limits

- Images: PNG, JPG/JPEG, WEBP — 10 MB each, up to 10 per session.
- PDF: up to 25 MB, up to 20 pages per extraction.
- TXT: up to 2 MB, read directly in the browser.
- Translation input: up to 100,000 characters. Speech segments: 4,000 chars each.
- Blocked with friendly messages: executables, archives, scripts, DOCX (not supported in this version).
- Uploads are processed in memory and never stored; history keeps only text + language + timestamp in `localStorage`.

## Translation benchmark (measure-first, no production impact)

```bash
npm run benchmark:translation -- --smoke                                    # 10 cases x Te/Ta/Hi
npm run benchmark:translation                                               # full 160-case set
npm run benchmark:translation -- --langs=Telugu --adapters=current-gpt      # subsets
```

- Harness in `benchmarks/translation/` (cases, adapters, blinded LLM judge, weighted scoring, CSV/JSON/Markdown reports in `results/`). Production code is untouched — the GPT adapter calls the exact production service.
- Env: `OPENAI_API_KEY` (GPT adapter + judge), `SARVAM_API_KEY` (optional; skipped with a clear message if absent), `HF_TOKEN` (optional; required for auth-gated IndicTrans2 checkpoints).
- See `benchmarks/translation/results/report.md` for the latest results.

## Hybrid online + offline architecture (Phase 1 + Phase 2 packs)

Online stays the best-quality path; offline pieces work with zero network:

```
MotherTongue UI → lib/engines/router.ts → CLOUD (API routes) | LOCAL (device)
```

- **Engines:** `lib/engines/{translation,extraction,speech}/{cloud,local}.ts` share one interface per capability. Cloud engines are thin clients over the existing `/api/*` routes (contracts unchanged). Frontend holds no API keys.
- **Routing:** mode (Auto / Best Quality / Offline, persisted) × connectivity (`navigator.onLine` + same-origin `/api/health` probe) → per-stage cloud/local decision. Offline mode never fetches; Best Quality + no network is a clear error, never a silent local fallback. Stages route independently, so cloud text can pair with a device voice if the network drops mid-flow.
- **Offline today (all verified, no fakes):**
  - *Printed-text OCR* via on-device Tesseract.js (lazy load, worker terminated after use; English pixel-perfect and Telugu near-perfect on test images; traineddata cached after first use). Handwriting stays cloud-only with an honest message.
  - *Translation packs* for Telugu/Tamil/Hindi: verified quantized NLLB (`Xenova/nllb-200-distilled-600M`, dtype `q8`, ~912 MB shared base) running fully on-device via transformers.js — WebGPU preferred with WASM fallback, executed in a Web Worker, first-run model load shown honestly in the UI. Role fidelity verified live (నాకు recipient, నేను speaker across Te/Ta/Hi).
  - *Speech* via device voices; history records engines; PWA shell as before.
- **PWA:** `public/manifest.json`, generated icons, hand-written `public/sw.js` (precaches shell, cache-first static, network-first navigations with offline fallback, never caches `/api`). Install from the browser menu; the UI opens offline.
- **Language packs:** `public/offline-packs/nllb-base-v1.json` (real sizes + SHA-256 from Hub metadata — LFS oids are content hashes; one manifest entry caught a transposed hash during review). Downloads stream with progress/cancel, verify checksums, skip already-stored files, and prime the exact `transformers-cache` entries the runtime fetches. Removal keeps files shared with other ready packs. The app always asks first and shows the real ~912 MB size plus memory/storage prechecks. Re-verify engines anytime: `npm run verify:offline-engines [telugu.png]` (headless Chromium; needs `npx playwright-core install chromium` once).
- **Privacy:** Offline mode makes zero external requests (OpenAI/Sarvam/cloud OCR). Uploads are never cached by the service worker or stored.
- **Capacitor readiness:** engines are plain TS with no React coupling, so the same router/adapters can move into a Capacitor/React Native wrapper later. Not added now.
- **Browser support:** device TTS needs `speechSynthesis` voices installed per language (drawer shows what's present). Offline NLLB needs a device that can hold ~1 GB model + runtime memory (a precheck warns below 4 GB RAM); WASM is single-threaded without COOP/COEP headers, so expect seconds per sentence on CPU and better speed with WebGPU. If a device can't run a pack, it says so instead of crashing.

## Tests performed

- `npm run typecheck`, `npm run lint` (clean), `npm run build` (clean production build).
- Chunk unit tests (8/8): order preservation, limits respected, paragraph/sentence boundaries, Telugu-script speech chunking.
- Live server end-to-end tests (17/17): homepage renders headline/tabs/language UI; validation for translate/speech/image/PDF routes; PDF info reports 3 pages; page-range 2–3 extracts only those pages in order; invalid ranges and non-PDFs rejected with friendly errors.
- Key-dependent paths (OpenAI translation/vision/TTS) were implemented per spec but could not be live-tested here without an `OPENAI_API_KEY`; routes fail closed with friendly messages when the key is missing.

## Known limitations / optional remainder

- Scanned/image-only PDFs are not rasterized server-side; users are guided to photograph those pages (which uses the same vision extraction).
- DOCX upload is not supported.
- Audio is session-only (history restores text, not audio).
- No theme toggle (kept the header uncluttered per spec).
