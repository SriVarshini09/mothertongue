const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const health = await request('/api/health');
  assert(health.response.status === 200, `health returned ${health.response.status}`);
  assert(health.body?.ok === true, 'health response did not contain { ok: true }');
  assert(health.response.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff header');
  assert(health.response.headers.get('x-frame-options') === 'DENY', 'missing frame protection header');
  assert(health.response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'missing referrer policy');
  console.log('PASS health endpoint');

  const invalid = await request('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '', targetLanguage: 'Hindi' }),
  });
  assert(invalid.response.status === 400, `invalid translation returned ${invalid.response.status}`);
  console.log('PASS server-side request validation');

  const malformed = await request('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert(malformed.response.status === 400, `malformed JSON returned ${malformed.response.status}`);
  assert(/valid JSON/i.test(malformed.body?.error || ''), 'malformed JSON error was not actionable');
  console.log('PASS malformed JSON rejection');

  const malformedSpeech = await request('/api/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert(malformedSpeech.response.status === 400, `malformed speech JSON returned ${malformedSpeech.response.status}`);
  assert(/valid JSON/i.test(malformedSpeech.body?.error || ''), 'malformed speech JSON error was not actionable');
  console.log('PASS malformed speech JSON rejection');

  const crossOrigin = await request('/api/translate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://attacker.example',
      host: '127.0.0.1:3100',
    },
    body: JSON.stringify({ text: 'hello', targetLanguage: 'Hindi' }),
  });
  assert(crossOrigin.response.status === 403, `cross-origin request returned ${crossOrigin.response.status}`);
  console.log('PASS cross-origin request rejection');

  const translation = await request('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'hello', targetLanguage: 'Hindi' }),
  });
  assert(translation.response.status === 500, `unconfigured translation returned ${translation.response.status}`);
  assert(/Translation service is not configured/i.test(translation.body?.error || ''), 'translation error was not friendly');
  console.log('PASS fail-closed translation configuration error');

  const speech = await request('/api/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'hello', language: 'Japanese' }),
  });
  assert(speech.response.status === 500, `unconfigured speech returned ${speech.response.status}`);
  assert(/Speech service is not configured/i.test(speech.body?.error || ''), 'speech error was not friendly');
  console.log('PASS fail-closed speech configuration error');

  console.log('RESULT API smoke tests passed');
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
