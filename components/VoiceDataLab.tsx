'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Mic, Square } from 'lucide-react';
import { VOICE_EMOTION_PRESETS } from '@/lib/speech/emotions';
import type { TrainingEmotion, VoiceDataManifest } from '@/lib/speech/dataManifest';
import type { VoiceEmotion } from '@/types/speech';

type LabEmotion = Exclude<VoiceEmotion, 'auto'>;
type LabLanguage = 'en' | 'te' | 'hi';
type RecordedClip = {
  id: string;
  blob: Blob;
  url: string;
  language: LabLanguage;
  emotion: LabEmotion;
  transcript: string;
};

const LAB_EMOTIONS = Object.keys(VOICE_EMOTION_PRESETS) as LabEmotion[];
const LAB_LANGUAGES: Array<{ code: LabLanguage; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

const PROMPTS: Record<LabLanguage, string[]> = {
  en: [
    'Hello, I am ready to learn.',
    'Please listen carefully and repeat this sentence.',
    'You can do this; take your time.',
  ],
  te: [
    'నమస్కారం, నేను నేర్చుకోవడానికి సిద్ధంగా ఉన్నాను.',
    'దయచేసి జాగ్రత్తగా విని ఈ వాక్యాన్ని మళ్లీ చెప్పండి.',
    'మీరు ఇది చేయగలరు; మీ సమయం తీసుకోండి.',
  ],
  hi: [
    'नमस्ते, मैं सीखने के लिए तैयार हूँ।',
    'कृपया ध्यान से सुनें और इस वाक्य को दोहराएँ।',
    'आप यह कर सकते हैं; अपना समय लें।',
  ],
};

function localSpeakerHash(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random()}`.replace(/\D/g, '').padEnd(32, '0').slice(0, 32);
  return random.slice(0, 32);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function VoiceDataLab() {
  const [language, setLanguage] = useState<LabLanguage>('en');
  const [emotion, setEmotion] = useState<LabEmotion>('warm');
  const [promptIndex, setPromptIndex] = useState(0);
  const [consented, setConsented] = useState(false);
  const [recording, setRecording] = useState(false);
  const [clips, setClips] = useState<Record<string, RecordedClip>>({});
  const [note, setNote] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const clipsRef = useRef<Record<string, RecordedClip>>({});
  const speakerHash = useMemo(localSpeakerHash, []);
  const prompts = PROMPTS[language];
  const transcript = prompts[promptIndex];
  const clipId = `${language}-${emotion}-${promptIndex + 1}`;
  const currentClip = clips[clipId];
  const totalPrompts = LAB_LANGUAGES.length * LAB_EMOTIONS.length * 3;

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    Object.values(clipsRef.current).forEach((clip) => URL.revokeObjectURL(clip.url));
  }, []);

  const startRecording = async () => {
    if (!consented) {
      setNote('Please confirm consent before recording.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNote('Recording is not supported in this browser.');
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const nextRecorder = new MediaRecorder(nextStream);
      stream.current = nextStream;
      recorder.current = nextRecorder;
      chunks.current = [];
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      nextRecorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: nextRecorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setClips((previous) => {
          const old = previous[clipId];
          if (old) URL.revokeObjectURL(old.url);
          return { ...previous, [clipId]: { id: clipId, blob, url, language, emotion, transcript } };
        });
        setRecording(false);
        setNote('Clip captured locally. Download it before closing this tab.');
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
      };
      nextRecorder.start();
      setNote(`Recording ${VOICE_EMOTION_PRESETS[emotion].label.toLowerCase()} delivery…`);
      setRecording(true);
    } catch {
      setNote('Microphone permission was not granted. No audio was uploaded.');
    }
  };

  const stopRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const nextPrompt = () => {
    setPromptIndex((value) => (value + 1) % prompts.length);
    setNote('');
  };

  const downloadCurrent = () => {
    if (!currentClip) return;
    downloadBlob(currentClip.blob, `${currentClip.id}.webm`);
  };

  const exportManifest = () => {
    const manifest: VoiceDataManifest = {
      version: 1,
      purpose: 'research-benchmark',
      // MediaRecorder's WebM output has browser-dependent encoding metadata.
      // Keep this truthful; preprocessing must resample to 16 kHz mono later.
      sampleRateHz: null,
      channels: 1,
      clips: Object.values(clips).map((clip) => ({
        id: clip.id,
        sourceId: 'mothertongue-consented',
        audioPath: `voice-lab/${clip.id}.webm`,
        transcript: clip.transcript,
        language: clip.language,
        emotion: clip.emotion as TrainingEmotion,
        split: 'train',
        speakerHash,
        consent: 'direct-consent',
        consentReference: 'voice-lab-consent-v1',
        licenseVerified: true,
      })),
    };
    downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), 'mothertongue-voice-manifest.json');
    setNote('Manifest downloaded. Download each recorded clip and place them under data/voice/raw/voice-lab/.');
  };

  const downloadAll = () => {
    Object.values(clips).forEach((clip, index) => {
      setTimeout(() => downloadBlob(clip.blob, `${clip.id}.webm`), index * 120);
    });
  };

  return (
    <details className="voice-lab">
      <summary>Voice Lab · collect consented training clips</summary>
      <div className="voice-lab-body">
        <p className="muted small">
          Record your own voice or a speaker who has given explicit permission. Audio stays in this tab until you download it; nothing is uploaded.
        </p>
        <label className="voice-lab-consent">
          <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
          <span>I confirm I own this voice or have permission to use it for MotherTongue voice research and product development.</span>
        </label>
        <div className="voice-lab-fields">
          <label>Language
            <select value={language} onChange={(event) => { setLanguage(event.target.value as LabLanguage); setPromptIndex(0); setNote(''); }} disabled={recording}>
              {LAB_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.native} · {item.label}</option>)}
            </select>
          </label>
          <label>Emotion
            <select value={emotion} onChange={(event) => { setEmotion(event.target.value as LabEmotion); setNote(''); }} disabled={recording}>
              {LAB_EMOTIONS.map((value) => <option key={value} value={value}>{VOICE_EMOTION_PRESETS[value].label}</option>)}
            </select>
          </label>
        </div>
        <div className="voice-lab-prompt" dir="auto">
          <span>Prompt {promptIndex + 1} of {prompts.length}</span>
          <strong>{transcript}</strong>
        </div>
        <div className="voice-lab-actions">
          <button className={recording ? 'primary-small recording' : 'primary-small'} type="button" onClick={recording ? stopRecording : () => void startRecording()}>
            {recording ? <Square size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
            {recording ? 'Stop recording' : 'Record prompt'}
          </button>
          <button className="ghost-small" type="button" onClick={nextPrompt} disabled={recording}>
            Next prompt
          </button>
          {currentClip && <button className="ghost-small" type="button" onClick={downloadCurrent}><Download size={15} aria-hidden /> Save clip</button>}
        </div>
        <div className="voice-lab-progress" role="status">
          <span>{Object.keys(clips).length} of {totalPrompts} suggested clips captured</span>
          <span>Speaker ID is random and non-identifying</span>
        </div>
        {Object.keys(clips).length > 0 && (
          <div className="voice-lab-export">
            <button className="ghost-small" type="button" onClick={exportManifest}>Download manifest</button>
            <button className="ghost-small" type="button" onClick={downloadAll}>Download all clips</button>
          </div>
        )}
        {note && <p className="muted small voice-lab-note" role="status">{note}</p>}
      </div>
    </details>
  );
}
