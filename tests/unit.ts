import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTranslationUserMessage } from '@/lib/ai/prompts/translation';
import { parseDeliveryProfile } from '@/lib/ai/prompts/speechStyle';
import { chunkDocument, chunkForSpeechSegments } from '@/lib/documents/chunk';
import { resolveStage } from '@/lib/engines/router';
import { checkReachability, invalidateReachabilityProbe } from '@/lib/offline/connectivity';
import { nllbSupports, nllbTranslate } from '@/lib/offline/nllbCore';
import { ocrPrintedText } from '@/lib/offline/tesseractLocal';
import { speechTagsFor } from '@/lib/engines/speech/local';
import { sha256Hex } from '@/lib/offline/integrity';
import {
  crossOriginResponse,
  oversizedBodyResponse,
  protectApiRequest,
  rateLimitResponse,
} from '@/lib/rateLimit';
import {
  selectSpeechProvider,
  SpeechProviderUnavailableError,
  synthesizeSpeech,
} from '@/lib/ai/speechProviders';
import { defaultDeliveryProfile } from '@/lib/ai/speechStyle';
import { validateManifest } from '@/lib/offline/downloadManager';
import { NLLB_LANGUAGE_CATALOG, NLLB_OFFICIAL_LANGUAGE_COUNT } from '@/lib/offline/nllbLanguages';
import { PACK_DEFS } from '@/lib/offline/languagePacks';
import {
  modelFileKey,
  offlineUrlKey,
  partialModelFileKey,
  partialModelMetaKey,
} from '@/lib/offline/storageKeys';

function test(name: string, fn: () => void): void {
  fn();
  console.log(`PASS ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  console.log(`PASS ${name}`);
}

test('router-keeps-best-quality-online-only', () => {
  assert.deepEqual(resolveStage({ mode: 'online', connectivity: 'offline', stage: 'translation' }), {
    blocked: 'You appear to be offline. Connect to the internet, or switch Mode to Offline to use on-device options.',
  });
  assert.deepEqual(resolveStage({ mode: 'offline', connectivity: 'online', stage: 'speech' }), { engine: 'local' });
  assert.deepEqual(resolveStage({ mode: 'auto', connectivity: 'online', stage: 'translation' }), { engine: 'cloud' });
  assert.deepEqual(resolveStage({ mode: 'auto', connectivity: 'offline', stage: 'extraction' }), { engine: 'local' });
});

test('source-language-contract-is-explicit', () => {
  const message = buildTranslationUserMessage('Telugu', 'Can you teach me?', 'Hindi');
  assert.match(message, /SOURCE_LANGUAGE: Hindi/);
  assert.match(message, /SOURCE_TEXT_START/);
  assert.equal(nllbSupports('English'), true);
  assert.equal(nllbSupports('Klingon'), false);
});

test('shared-offline-pack-exposes-the-multilingual-catalog', () => {
  assert.equal(NLLB_LANGUAGE_CATALOG.length, NLLB_OFFICIAL_LANGUAGE_COUNT);
  assert.equal(NLLB_LANGUAGE_CATALOG.length, 202);
  assert.equal(new Set(NLLB_LANGUAGE_CATALOG.map((language) => language.name)).size, NLLB_LANGUAGE_CATALOG.length);
  assert.equal(new Set(NLLB_LANGUAGE_CATALOG.map((language) => language.code)).size, NLLB_LANGUAGE_CATALOG.length);
  for (const language of NLLB_LANGUAGE_CATALOG) {
    assert.match(language.code, /^[a-z]{3}_[A-Za-z]{4}$/);
  }
  assert.equal(nllbSupports('Kannada'), true);
  assert.equal(nllbSupports('French'), true);
  assert.equal(nllbSupports('Chinese (Traditional)'), true);
  assert.equal(nllbSupports('Yiddish'), true);
  assert.equal(nllbSupports('Tamasheq (Tifinagh)'), true);
  const downloadable = PACK_DEFS.filter((def) => def.translation === 'downloadable');
  assert.equal(downloadable.length, NLLB_LANGUAGE_CATALOG.length);
  assert.equal(new Set(downloadable.map((def) => def.manifestUrl)).size, 1);
});

test('device-speech-tags-cover-the-expanded-offline-catalog', () => {
  assert.deepEqual(speechTagsFor('French'), ['fr-FR', 'fr']);
  assert.ok(speechTagsFor('Yiddish').includes('yi'));
  assert.ok(speechTagsFor('Acehnese (Latin)').includes('ace'));
  assert.ok(NLLB_LANGUAGE_CATALOG.every((language) => speechTagsFor(language.name).length > 0));
  assert.deepEqual(speechTagsFor('Klingon'), []);
});

test('speech-profile-parser-clamps-and-falls-back-safely', () => {
  const profile = parseDeliveryProfile(
    '{"contentType":"question","tone":"clear","pace":"brisk","energy":"high","expressiveness":2}',
    'Telugu'
  );
  assert.equal(profile?.contentType, 'question');
  assert.equal(profile?.pace, 'slightly-fast');
  assert.equal(profile?.expressiveness, 0.65);
  assert.equal(parseDeliveryProfile('not-json', 'Telugu'), null);
});

test('speech-provider-selection-does-not-require-openai-for-sarvam', () => {
  const previousProvider = process.env.SPEECH_PROVIDER;
  const previousSarvamKey = process.env.SARVAM_API_KEY;
  try {
    process.env.SPEECH_PROVIDER = 'sarvam';
    process.env.SARVAM_API_KEY = 'unit-test-key';
    assert.equal(selectSpeechProvider('Telugu').provider, 'sarvam');
    assert.equal(selectSpeechProvider('Japanese').provider, 'openai');
  } finally {
    if (previousProvider === undefined) delete process.env.SPEECH_PROVIDER;
    else process.env.SPEECH_PROVIDER = previousProvider;
    if (previousSarvamKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousSarvamKey;
  }
});

test('document-and-speech-chunkers-preserve-order-and-limits', () => {
  const docs = chunkDocument('First paragraph.\n\nSecond paragraph.', 18);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].order, 1);
  assert.equal(docs[1].order, 2);
  assert.ok(docs.every((chunk) => chunk.text.length <= 18));

  const speech = chunkForSpeechSegments('One. Two. Three.', 8);
  assert.ok(speech.length >= 2);
  assert.ok(speech.every((chunk) => chunk.text.length <= 8));
});

test('rate-limiter-returns-429-after-window-limit', () => {
  const request = () => new Request('http://localhost/api/translate', {
    headers: { 'x-forwarded-for': 'unit-test-rate-limit' },
  });
  assert.equal(rateLimitResponse(request(), 'unit-test', 2, 60_000), null);
  assert.equal(rateLimitResponse(request(), 'unit-test', 2, 60_000), null);
  assert.equal(rateLimitResponse(request(), 'unit-test', 2, 60_000)?.status, 429);
});

test('api-origin-guard-rejects-cross-site-browser-requests', () => {
  const sameOrigin = new Request('http://localhost/api/translate', {
    headers: { origin: 'http://localhost', host: 'localhost' },
  });
  const crossOrigin = new Request('http://localhost/api/translate', {
    headers: { origin: 'https://attacker.example', host: 'localhost' },
  });
  assert.equal(crossOriginResponse(sameOrigin), null);
  assert.equal(crossOriginResponse(crossOrigin)?.status, 403);
});

test('api-body-limit-rejects-oversized-content-length', () => {
  const request = new Request('http://localhost/api/translate', {
    headers: { 'content-length': '1025' },
  });
  assert.equal(oversizedBodyResponse(request, 1024)?.status, 413);
  assert.equal(oversizedBodyResponse(new Request('http://localhost/api/translate'), 1024), null);
});

test('offline-manifest-rejects-invalid-file-sizes', () => {
  const valid = {
    id: 'test',
    version: 'v1',
    files: [{ url: 'https://example.com/model.bin', sha256: 'a'.repeat(64), bytes: 1 }],
  };
  assert.ok(validateManifest(valid));
  assert.equal(validateManifest({ ...valid, files: [{ ...valid.files[0], bytes: 1.5 }] }), null);
  assert.equal(
    validateManifest({
      ...valid,
      files: [{ ...valid.files[0], cacheApi: { cache: 'transformers-cache', request: 'https://example.com/other.bin' } }],
    }),
    null
  );
  assert.equal(validateManifest({ ...valid, id: '../unsafe' }), null);
  assert.equal(validateManifest({ ...valid, version: 'v 1' }), null);
  assert.equal(
    validateManifest({ ...valid, files: [valid.files[0], valid.files[0]] }),
    null
  );
});

test('shipped-nllb-manifest-is-validated-and-sufficiently-sized', () => {
  const raw = JSON.parse(readFileSync('public/offline-packs/nllb-base-v1.json', 'utf8')) as unknown;
  const manifest = validateManifest(raw);
  assert.ok(manifest);
  assert.equal(manifest.id, 'nllb-base');
  assert.equal(manifest.version, 'v1');
  assert.ok(manifest.files.some((file) => file.cacheApi?.cache === 'transformers-cache'));
  assert.ok(manifest.files.reduce((total, file) => total + file.bytes, 0) > 900_000_000);
});

test('offline-storage-keys-are-stable', () => {
  assert.equal(modelFileKey('nllb-base', 'v1', 4), 'nllb-base/v1/4');
  assert.equal(offlineUrlKey('https://example.com/model.onnx'), 'offline-url/https://example.com/model.onnx');
  assert.equal(partialModelFileKey('nllb-base', 'v1', 4, 7), 'partial/nllb-base/v1/4/7');
  assert.equal(partialModelMetaKey('nllb-base', 'v1', 4), 'partial-meta/nllb-base/v1/4');
});

async function runAsyncTests(): Promise<void> {
  await testAsync('shared-rate-limiter-uses-upstash-when-configured', async () => {
    const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
    const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const previousProxy = process.env.TRUST_PROXY;
    const previousFetch = globalThis.fetch;
    let call = 0;
    try {
      process.env.UPSTASH_REDIS_REST_URL = 'https://unit-test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'unit-test-token';
      process.env.TRUST_PROXY = 'true';
      globalThis.fetch = async () => {
        call += 1;
        return new Response(JSON.stringify([{ result: [call === 1 ? 1 : 3, 2] }]), { status: 200 });
      };
      const request = () => new Request('http://localhost/api/shared', {
        headers: { 'x-forwarded-for': 'shared-unit-test', host: 'localhost' },
      });
      assert.equal(await protectApiRequest(request(), 'shared-unit', 2, 60_000), null);
      const second = await protectApiRequest(request(), 'shared-unit', 2, 60_000);
      assert.equal(second?.status, 429, `shared limiter mock calls=${call} status=${second?.status}`);
      assert.ok(call >= 2);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
      if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
      if (previousProxy === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previousProxy;
    }
  });

  await testAsync('offline-integrity-hashes-content', async () => {
    assert.equal(
      await sha256Hex(new Blob(['hello'])),
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  await testAsync('reachability-reprobes-after-invalidation', async () => {
    const previousFetch = globalThis.fetch;
    let calls = 0;
    try {
      invalidateReachabilityProbe();
      globalThis.fetch = async () => {
        calls += 1;
        return new Response('', { status: calls === 1 ? 200 : 503 });
      };
      assert.equal(await checkReachability(), true);
      assert.equal(await checkReachability(), true);
      assert.equal(calls, 1);
      invalidateReachabilityProbe();
      assert.equal(await checkReachability(), false);
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = previousFetch;
      invalidateReachabilityProbe();
    }
  });

  await testAsync('sarvam-speech-preserves-exact-text-and-reports-outage', async () => {
    const previousProvider = process.env.SPEECH_PROVIDER;
    const previousSarvamKey = process.env.SARVAM_API_KEY;
    const previousFetch = globalThis.fetch;
    let payload: Record<string, unknown> | null = null;
    try {
      process.env.SPEECH_PROVIDER = 'sarvam';
      process.env.SARVAM_API_KEY = 'unit-test-key';
      globalThis.fetch = async (_input, init) => {
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ audios: [Buffer.from('mp3').toString('base64')] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
      const exactText = 'Do not rewrite this question?';
      const result = await synthesizeSpeech(null, {
        text: exactText,
        language: 'Telugu',
        profile: defaultDeliveryProfile('Telugu'),
      });
      assert.equal(result.provider, 'sarvam');
      assert.equal(Buffer.from(result.audio).toString(), 'mp3');
      const capturedPayload = payload as Record<string, unknown> | null;
      assert.equal(capturedPayload?.text, exactText);
      assert.equal(capturedPayload?.language_code, 'te-IN');

      globalThis.fetch = async () => new Response('{}', { status: 503 });
      await assert.rejects(
        () => synthesizeSpeech(null, {
          text: exactText,
          language: 'Telugu',
          profile: defaultDeliveryProfile('Telugu'),
        }),
        (error: unknown) => error instanceof SpeechProviderUnavailableError
          && /Sarvam speech service is temporarily unavailable/.test(error.message)
      );
    } finally {
      globalThis.fetch = previousFetch;
      if (previousProvider === undefined) delete process.env.SPEECH_PROVIDER;
      else process.env.SPEECH_PROVIDER = previousProvider;
      if (previousSarvamKey === undefined) delete process.env.SARVAM_API_KEY;
      else process.env.SARVAM_API_KEY = previousSarvamKey;
    }
  });

  await testAsync('offline-engines-require-explicit-supported-source-language', async () => {
    await assert.rejects(
      () => nllbTranslate('hello', 'Hindi', 'Auto-detect'),
      /nllb-source-language-required/
    );
    await assert.rejects(
      () => ocrPrintedText(new Blob(['image']), 'Klingon'),
      /ocr-language-unsupported/
    );
  });
}

runAsyncTests().then(
  () => console.log('RESULT unit tests passed'),
  (error: unknown) => {
    console.error('FAIL async contract tests', error);
    process.exitCode = 1;
  }
);
