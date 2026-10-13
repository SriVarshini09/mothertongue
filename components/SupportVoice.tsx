'use client';

import { useEffect, useRef, useState } from 'react';
import { HeartHandshake, Mic, Pause, Play, Square } from 'lucide-react';
import { DeviceSpeechEngine } from '@/lib/engines/speech/local';
import {
  SUPPORT_INTENTS,
  SUPPORT_INTENT_LABELS,
  SUPPORT_SAFETY_NOTE,
  supportScriptFor,
  type SupportIntent,
} from '@/lib/support/scripts';

export default function SupportVoice({
  language,
  onStopExistingSpeech,
}: {
  language: string;
  onStopExistingSpeech?: () => void;
}) {
  const [intent, setIntent] = useState<SupportIntent>('pause');
  const [customText, setCustomText] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [note, setNote] = useState('');
  const engine = useRef<DeviceSpeechEngine | null>(null);
  const guidance = supportScriptFor(language, intent);

  const getEngine = () => {
    if (!engine.current) engine.current = new DeviceSpeechEngine();
    return engine.current;
  };

  useEffect(() => {
    const current = getEngine();
    const refreshVoices = () => setVoiceAvailable(current.voicesFor(guidance.language).length > 0);
    refreshVoices();
    const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
    synthesis?.addEventListener('voiceschanged', refreshVoices);
    return () => {
      synthesis?.removeEventListener('voiceschanged', refreshVoices);
      current.stop();
      setSpeaking(false);
    };
  }, [guidance.language]);

  const speak = (text: string) => {
    const clean = text.trim();
    if (!clean) {
      setNote('Write a few words first, or choose a support prompt.');
      return;
    }
    const current = getEngine();
    if (!voiceAvailable) {
      setNote(`No ${guidance.language} device voice is installed. Try Offline & voice or install a system voice.`);
      return;
    }
    onStopExistingSpeech?.();
    setNote('');
    current.speak({
      text: clean,
      language: guidance.language,
      emotion: 'empathetic',
      onEnd: () => setSpeaking(false),
      onError: (message) => {
        setSpeaking(false);
        setNote(message);
      },
    });
    setSpeaking(true);
  };

  const stop = () => {
    getEngine().stop();
    setSpeaking(false);
  };

  return (
    <details className="support-voice">
      <summary><HeartHandshake size={17} aria-hidden /> Emotional support voice</summary>
      <div className="support-voice-body">
        <div className="support-voice-intro">
          <div>
            <strong>A gentle moment, in your voice language</strong>
            <p>Choose a short grounding message, or write your own words to hear them read back slowly.</p>
          </div>
          <span className="support-voice-badge">offline-first</span>
        </div>
        <div className="support-intent-grid" role="group" aria-label="Support voice intention">
          {SUPPORT_INTENTS.map((value) => (
            <button
              className={intent === value ? 'support-intent selected' : 'support-intent'}
              type="button"
              key={value}
              onClick={() => { setIntent(value); setNote(''); }}
            >
              {SUPPORT_INTENT_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="support-script" dir="auto">{guidance.text}</p>
        {!guidance.localized && (
          <p className="muted small support-note">This guidance is currently scripted in English; more localized support scripts can be added after review.</p>
        )}
        <div className="support-voice-actions">
          <button className="primary-small" type="button" onClick={() => speaking ? stop() : speak(guidance.text)}>
            {speaking ? <Square size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            {speaking ? 'Stop support voice' : 'Speak gently'}
          </button>
          <span className="support-voice-status" role="status">
            {speaking ? <><Pause size={14} aria-hidden /> Speaking with an empathetic delivery</> : voiceAvailable ? 'Device voice ready' : `No ${guidance.language} voice detected`}
          </span>
        </div>
        <label className="support-custom-label" htmlFor="support-custom-text">Or write what you need to hear</label>
        <textarea
          id="support-custom-text"
          className="support-custom-text"
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          maxLength={600}
          rows={3}
          placeholder="I can take this one step at a time…"
        />
        <div className="support-custom-actions">
          <button className="ghost-small" type="button" onClick={() => speak(customText)} disabled={!customText.trim() || speaking}>
            <Mic size={15} aria-hidden /> Read my words
          </button>
          <span className="muted small">{customText.length}/600 · stays on this device</span>
        </div>
        {note && <p className="muted small support-note" role="status">{note}</p>}
        <p className="support-safety-note">{SUPPORT_SAFETY_NOTE}</p>
      </div>
    </details>
  );
}
