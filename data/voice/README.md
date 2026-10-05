# Voice-training data contract

This directory stores auditable metadata only. Raw audio, processed audio, consent forms, and speaker identity mappings stay outside Git and are ignored by `.gitignore`.

The starter registry is in [`sources.json`](./sources.json), and the metadata manifest is [`manifest.json`](./manifest.json). The manifest is intentionally empty until each clip has a verified license or direct speaker consent.

The in-app Voice Lab can export browser-captured WebM clips and a capture manifest. Those captures intentionally use `sampleRateHz: null` because browser recording does not guarantee a sample rate. Resample and convert them to 16 kHz mono WAV, add SHA-256 values, then set `sampleRateHz` to `16000` before training or production review.

Run the audit before any training job:

```bash
npm run audit:voice-data
npm run audit:voice-data -- --purpose=production --check-files
```

Preprocess a downloaded Voice Lab capture into 16 kHz mono WAV files. The output stays ignored under `data/voice/processed/`:

```bash
npm run voice:preprocess -- --manifest=data/voice/capture-manifest.json
npm run audit:voice-data -- --manifest=data/voice/processed/manifest.json --data-root=data/voice --check-files
```

Train and evaluate the portable emotion-style baseline with speaker-independent holdout evaluation:

```bash
npm run voice:train -- --manifest=data/voice/processed/manifest.json
```

The trainer writes an ignored `emotion-model.json`, `evaluation.json`, `features.jsonl`, and `report.md`. It requires at least two speakers and two emotion labels; it never sends audio or features over the network.

Each clip must include:

- a source ID and exact source release recorded in the private project notes;
- a relative audio path under `data/voice/raw/`;
- transcript, language code, emotion label, and split;
- a non-identifying speaker hash;
- `licenseVerified: true`;
- either a dataset license or a private direct-consent reference;
- a SHA-256 hash when the processed asset is ready.

For honest evaluation, never put the same speaker in train and validation/test. The audit warns when that happens. Production mode rejects restricted or request-only sources unless a direct-consent record is used.

Recommended first experiment:

1. Use Common Voice for multilingual pronunciation/ASR evaluation.
2. Collect a small, directly consented set of the same sentences in English, Telugu, and Hindi across neutral, warm, calm, encouraging, excited, empathetic, confident, and storytelling delivery.
3. Keep the first model focused on emotion/style classification and prosody recommendations. Do not clone a person’s voice without explicit voice-creation consent.
4. Run the local preprocessing and baseline trainer, then commit only model metadata, checksums, and evaluation reports—not raw voices or private consent records.
