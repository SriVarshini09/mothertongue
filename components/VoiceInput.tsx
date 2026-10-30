'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { speechTagsFor } from '@/lib/engines/speech/local';

type RecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEvent = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: RecognitionResult;
  };
};

type RecognitionErrorEvent = Event & { error?: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

export default function VoiceInput({
  sourceLanguage,
  value,
  onChange,
}: {
  sourceLanguage: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [note, setNote] = useState('');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(Boolean(recognitionConstructor()));
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  const stop = () => {
    recognition.current?.stop();
    setListening(false);
    setInterim('');
  };

  const start = () => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setNote('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (sourceLanguage === 'Auto-detect') {
      setNote('Choose the source language below before speaking. Speech recognition needs a language.');
      return;
    }
    const [languageTag] = speechTagsFor(sourceLanguage);
    if (!languageTag) {
      setNote(`${sourceLanguage} speech recognition is not available in this browser yet.`);
      return;
    }
    recognition.current?.abort();
    const next = new Constructor();
    next.lang = languageTag;
    next.continuous = true;
    next.interimResults = true;
    next.maxAlternatives = 1;
    next.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interimText += result[0].transcript;
      }
      const combined = finalText.trim();
      if (combined) onChange(combined);
      setInterim(interimText.trim());
    };
    next.onerror = (event) => {
      setListening(false);
      setInterim('');
      const message = event.error === 'not-allowed'
        ? 'Microphone permission was not granted.'
        : event.error === 'no-speech'
          ? 'No speech was detected. Try again.'
          : 'Speech recognition stopped. Try again.';
      setNote(message);
    };
    next.onend = () => {
      setListening(false);
      setInterim('');
    };
    recognition.current = next;
    setNote(`Listening in ${sourceLanguage}… Your words stay editable before translation.`);
    setInterim('');
    onChange('');
    try {
      next.start();
      setListening(true);
    } catch {
      setListening(false);
      setNote('Microphone could not start. Check browser permission and try again.');
    }
  };

  return (
    <div className="voice-input" role="region" aria-label="Speak and translate">
      <div className="voice-input-head">
        <div>
          <strong>Speak and translate</strong>
          <p>Say a sentence, review the words, then translate them.</p>
        </div>
        <span className="voice-input-badge">{supported ? 'browser voice' : 'not supported'}</span>
      </div>
      <div className="voice-input-card">
        <button className={listening ? 'voice-mic-button recording' : 'voice-mic-button'} type="button" onClick={listening ? stop : start} aria-label={listening ? 'Stop speaking' : 'Start speaking'}>
          {listening ? <Square size={22} fill="currentColor" aria-hidden /> : <Mic size={25} aria-hidden />}
        </button>
        <div className="voice-input-copy">
          <strong>{listening ? 'Listening…' : value ? 'Review your words' : 'Tap the microphone to speak'}</strong>
          <span>{interim || (value ? `${value.length.toLocaleString()} characters captured` : 'The transcription will appear here.')}</span>
        </div>
      </div>
      <p className="voice-input-privacy">Audio is handled by your browser’s speech service and is not stored by MotherTongue. Edit the transcription before translating.</p>
      {note && <p className="muted small voice-input-note" role="status">{note}</p>}
    </div>
  );
}
