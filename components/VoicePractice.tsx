'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Mic, Square, Volume2, X } from 'lucide-react';
import { DeviceSpeechEngine } from '@/lib/engines/speech/local';
import { splitPracticeLines } from '@/lib/speech/practice';
import { type VoiceEmotion } from '@/types/speech';

export default function VoicePractice({
  translated,
  language,
  emotion,
}: {
  translated: string;
  language: string;
  emotion: VoiceEmotion;
}) {
  const [open, setOpen] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [note, setNote] = useState('');
  const speech = useRef<DeviceSpeechEngine | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const lines = splitPracticeLines(translated);
  const current = lines[lineIndex] ?? '';

  useEffect(() => {
    setLineIndex(0);
    setOpen(false);
    setNote('');
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl('');
    speech.current?.stop();
    setSpeaking(false);
    setRecording(false);
    recorder.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    // The translated passage is the practice source; reset only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translated, language]);

  useEffect(() => () => {
    speech.current?.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  if (lines.length === 0) return null;

  const getSpeech = () => {
    if (!speech.current) speech.current = new DeviceSpeechEngine();
    return speech.current;
  };

  const listen = () => {
    const engine = getSpeech();
    if (engine.voicesFor(language).length === 0) {
      setNote(`${language} voice is not installed on this device. Install it in system language settings first.`);
      return;
    }
    setNote('');
    setSpeaking(true);
    engine.speak({
      text: current,
      language,
      emotion,
      onEnd: () => setSpeaking(false),
      onError: (message) => {
        setSpeaking(false);
        setNote(message);
      },
    });
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNote('Voice recording is not supported in this browser.');
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
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(URL.createObjectURL(blob));
        setRecording(false);
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
      };
      nextRecorder.start();
      setNote('Recording stays on this device. Tap stop when you finish the line.');
      setRecording(true);
    } catch {
      setNote('Microphone permission was not granted. Your recording was not uploaded.');
    }
  };

  const stopRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const close = () => {
    getSpeech().stop();
    if (recording) stopRecording();
    setSpeaking(false);
    setOpen(false);
  };

  return (
    <section className="voice-practice" aria-label="Voice practice">
      <div className="voice-practice-head">
        <div>
          <span className="result-title">Voice practice</span>
          <p>Repeat one line at a time with your selected feeling.</p>
        </div>
        <button
          className="ghost-small"
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
        >
          {open ? <X size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
          {open ? 'Close' : 'Practice'}
        </button>
      </div>
      {open && (
        <div className="voice-practice-body">
          <div className="practice-progress">
            <span>Line {lineIndex + 1} of {lines.length}</span>
            <span>{emotion === 'auto' ? 'Automatic feeling' : `${emotion} feeling`}</span>
          </div>
          <p className="practice-line" dir="auto">{current}</p>
          <div className="practice-actions">
            <button className="primary-small" type="button" onClick={listen} disabled={speaking}>
              <Volume2 size={15} aria-hidden /> {speaking ? 'Listening…' : 'Listen first'}
            </button>
            <button className={recording ? 'primary-small recording' : 'ghost-small'} type="button" onClick={recording ? stopRecording : () => void startRecording()}>
              {recording ? <Square size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
              {recording ? 'Stop recording' : 'Record me'}
            </button>
          </div>
          <div className="practice-nav">
            <button className="icon-btn" type="button" aria-label="Previous practice line" disabled={lineIndex === 0} onClick={() => setLineIndex((value) => Math.max(0, value - 1))}>
              <ChevronLeft size={17} aria-hidden />
            </button>
            <span className="muted small">Listen, repeat, then move on.</span>
            <button className="icon-btn" type="button" aria-label="Next practice line" disabled={lineIndex >= lines.length - 1} onClick={() => setLineIndex((value) => Math.min(lines.length - 1, value + 1))}>
              <ChevronRight size={17} aria-hidden />
            </button>
          </div>
          {recordedUrl && (
            <div className="practice-recording">
              <audio controls src={recordedUrl} aria-label="Your practice recording" />
              <a className="textbutton" href={recordedUrl} download={`mothertongue-practice-${lineIndex + 1}.webm`}>
                <Download size={14} aria-hidden /> Save recording
              </a>
            </div>
          )}
          {note && <p className="muted small practice-note" role="status">{note}</p>}
        </div>
      )}
    </section>
  );
}
