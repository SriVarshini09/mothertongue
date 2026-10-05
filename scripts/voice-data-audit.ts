import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  auditVoiceManifest,
  type VoiceDataManifest,
  type VoiceDataPurpose,
  type VoiceSourceRecord,
} from '@/lib/speech/dataManifest';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const purposeArg = process.argv.find((arg) => arg.startsWith('--purpose='))?.split('=')[1] as VoiceDataPurpose | undefined;
const purpose: VoiceDataPurpose = purposeArg === 'production' ? 'production' : 'research-benchmark';
const checkFiles = args.has('--check-files');
const manifestArg = process.argv.find((arg) => arg.startsWith('--manifest='))?.split('=').slice(1).join('=') ?? 'data/voice/manifest.json';
const dataRootArg = process.argv.find((arg) => arg.startsWith('--data-root='))?.split('=').slice(1).join('=') ?? 'data/voice/raw';
const manifestPath = path.resolve(root, manifestArg);
const sourcesPath = path.join(root, 'data/voice/sources.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as VoiceDataManifest;
const sources = (JSON.parse(readFileSync(sourcesPath, 'utf8')) as { sources: VoiceSourceRecord[] }).sources;
const result = auditVoiceManifest(manifest, sources, { purpose });

if (checkFiles) {
  const dataRoot = path.resolve(root, dataRootArg);
  for (const clip of manifest.clips) {
    const fullPath = path.resolve(dataRoot, clip.audioPath);
    const relative = path.relative(dataRoot, fullPath);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      result.errors.push(`${clip.id}: audioPath escapes data root ${clip.audioPath}`);
    } else if (!existsSync(fullPath)) {
      result.errors.push(`${clip.id}: missing local audio file ${clip.audioPath}`);
    }
  }
}

for (const warning of result.warnings) console.warn(`WARN ${warning}`);
for (const error of result.errors) console.error(`FAIL ${error}`);
console.log(`VOICE_DATA_AUDIT clips=${result.clips} speakers=${result.speakers} languages=${result.languages} emotions=${result.emotions} train=${result.splits.train} validation=${result.splits.validation} test=${result.splits.test} purpose=${purpose}`);
if (result.errors.length > 0) process.exit(1);
console.log('VOICE_DATA_AUDIT_OK');
