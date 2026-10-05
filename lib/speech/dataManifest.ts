export const TRAINING_EMOTIONS = [
  'neutral',
  'warm',
  'calm',
  'encouraging',
  'excited',
  'empathetic',
  'confident',
  'storytelling',
  'happy',
  'sad',
  'angry',
  'fearful',
  'surprised',
] as const;

export type TrainingEmotion = (typeof TRAINING_EMOTIONS)[number];
export type VoiceDataPurpose = 'research-benchmark' | 'production';
export type VoiceDataCommercialUse = 'allowed' | 'restricted' | 'request-required';

export type VoiceSourceRecord = {
  id: string;
  title: string;
  url: string;
  license: string;
  commercialUse: VoiceDataCommercialUse;
  requiresDirectConsent: boolean;
  allowedTasks: string[];
  notes: string;
};

export type VoiceDataClip = {
  id: string;
  sourceId: string;
  audioPath: string;
  transcript: string;
  language: string;
  emotion: TrainingEmotion;
  split: 'train' | 'validation' | 'test';
  speakerHash: string;
  consent: 'dataset-license' | 'direct-consent';
  consentReference?: string;
  licenseVerified: boolean;
  sha256?: string;
};

export type VoiceDataManifest = {
  version: number;
  purpose: VoiceDataPurpose;
  /** Null means browser-captured audio still needs preprocessing before training. */
  sampleRateHz: number | null;
  channels: number;
  clips: VoiceDataClip[];
};

export type VoiceDataAuditResult = {
  errors: string[];
  warnings: string[];
  clips: number;
  speakers: number;
  languages: number;
  emotions: number;
  splits: Record<'train' | 'validation' | 'test', number>;
};

const AUDIO_EXTENSIONS = new Set(['.wav', '.flac', '.mp3', '.ogg', '.webm']);
const SPLITS = ['train', 'validation', 'test'] as const;

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && !value.includes('\\')
    && !value.startsWith('/')
    && !/^[A-Za-z]:/.test(value)
    && !value.split('/').includes('..');
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function auditVoiceManifest(
  manifest: VoiceDataManifest,
  sources: VoiceSourceRecord[],
  options: { purpose?: VoiceDataPurpose; checkFiles?: boolean; rawRoot?: string } = {}
): VoiceDataAuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const clipIds = new Set<string>();
  const speakerSplits = new Map<string, Set<string>>();
  const speakers = new Set<string>();
  const languages = new Set<string>();
  const emotions = new Set<string>();
  const splits = { train: 0, validation: 0, test: 0 };
  const purpose = options.purpose ?? manifest.purpose;

  if (manifest.version !== 1) errors.push(`unsupported manifest version: ${String(manifest.version)}`);
  if (manifest.sampleRateHz !== 16000) {
    if (manifest.sampleRateHz === null && purpose === 'research-benchmark') {
      warnings.push('sampleRateHz is unknown for browser captures; preprocess to 16000 Hz mono before training');
    } else {
      errors.push('sampleRateHz must be 16000');
    }
  }
  if (manifest.channels !== 1) errors.push('channels must be 1 (mono)');
  if (!Array.isArray(manifest.clips)) errors.push('clips must be an array');

  for (const clip of manifest.clips ?? []) {
    const source = sourceById.get(clip.sourceId);
    if (!source) errors.push(`${clip.id || '<unknown>'}: unknown sourceId ${clip.sourceId}`);
    if (!clip.id || clipIds.has(clip.id)) errors.push(`duplicate or empty clip id: ${clip.id || '<empty>'}`);
    clipIds.add(clip.id);
    if (!isSafeRelativePath(clip.audioPath)) errors.push(`${clip.id}: audioPath must be a safe relative path`);
    const extension = clip.audioPath.slice(clip.audioPath.lastIndexOf('.')).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension)) errors.push(`${clip.id}: unsupported audio extension ${extension}`);
    if (!clip.transcript.trim()) errors.push(`${clip.id}: transcript is required`);
    if (!/^[A-Za-z0-9-]{2,20}$/.test(clip.language)) errors.push(`${clip.id}: language must be an ISO/BCP-47-like code`);
    if (!(TRAINING_EMOTIONS as readonly string[]).includes(clip.emotion)) errors.push(`${clip.id}: unsupported emotion ${clip.emotion}`);
    if (!(SPLITS as readonly string[]).includes(clip.split)) errors.push(`${clip.id}: unsupported split ${clip.split}`);
    if (!/^[a-f0-9]{16,128}$/i.test(clip.speakerHash)) errors.push(`${clip.id}: speakerHash must be a non-identifying hash`);
    if (!clip.licenseVerified) errors.push(`${clip.id}: licenseVerified must be true before training use`);
    if (clip.consent === 'direct-consent' && !clip.consentReference) errors.push(`${clip.id}: direct consent needs a private consentReference`);
    if (clip.consent === 'dataset-license' && source?.requiresDirectConsent) errors.push(`${clip.id}: ${clip.sourceId} requires direct consent`);
    if (purpose === 'production' && source?.commercialUse !== 'allowed' && clip.consent !== 'direct-consent') {
      errors.push(`${clip.id}: ${clip.sourceId} is not cleared for production/commercial use`);
    }
    if (options.checkFiles && options.rawRoot && isSafeRelativePath(clip.audioPath)) {
      // File existence is checked by the CLI; this library stays browser-safe.
    }
    if (clip.sha256 && !isSha256(clip.sha256)) errors.push(`${clip.id}: sha256 must be 64 hexadecimal characters`);

    speakers.add(clip.speakerHash);
    languages.add(clip.language);
    emotions.add(clip.emotion);
    splits[clip.split] += 1;
    const seenSplits = speakerSplits.get(clip.speakerHash) ?? new Set<string>();
    seenSplits.add(clip.split);
    speakerSplits.set(clip.speakerHash, seenSplits);
  }

  for (const [speaker, seenSplits] of speakerSplits) {
    if (seenSplits.size > 1) warnings.push(`speaker ${speaker.slice(0, 8)}… appears in multiple splits; use speaker-independent splits for honest evaluation`);
  }
  if (manifest.clips.length === 0) warnings.push('manifest has no clips yet; add licensed or directly consented metadata before training');
  if (purpose === 'production' && manifest.purpose !== 'production') errors.push('production audit requires manifest purpose=production');

  return {
    errors,
    warnings,
    clips: manifest.clips.length,
    speakers: speakers.size,
    languages: languages.size,
    emotions: emotions.size,
    splits,
  };
}
