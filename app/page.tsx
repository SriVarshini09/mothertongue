'use client';

import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Camera,
  Download,
  FileText,
  History,
  Languages,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import AudioPlayer from '@/components/AudioPlayer';
import HistoryDrawer, { HistoryItem } from '@/components/HistoryDrawer';
import OfflineDrawer from '@/components/OfflineDrawer';
import LiveCamera from '@/components/LiveCamera';
import { languages } from '@/lib/languages';
import { releaseCachedAudioUrl } from '@/lib/cache/audio';
import { MAX_IMAGES, MAX_IMAGE_BYTES } from '@/lib/validation';
import { CloudTranslationEngine } from '@/lib/engines/translation/cloud';
import { LocalTranslationEngine } from '@/lib/engines/translation/local';
import { CloudExtractionEngine } from '@/lib/engines/extraction/cloud';
import { LocalExtractionEngine } from '@/lib/engines/extraction/local';
import { EngineUnavailableError } from '@/lib/engines/capabilities';
import { DeviceSpeechEngine } from '@/lib/engines/speech/local';
import { CloudSpeechEngine } from '@/lib/engines/speech/cloud';
import { resolveStage } from '@/lib/engines/router';
import {
  checkReachability,
  useConnectivity,
  type ConnectivityState,
} from '@/lib/offline/connectivity';
import { loadMode, saveMode, type EngineMode } from '@/lib/offline/mode';
import { packCapabilities, type PackCapabilitySummary } from '@/lib/offline/languagePacks';
import type { VoiceEmotion } from '@/types/speech';

type Tab = 'text' | 'camera' | 'upload';

type PageImage = { id: string; file: File; url: string };

const EXAMPLE =
  'Photosynthesis is the process by which green plants use sunlight to convert water and carbon dioxide into energy-rich glucose. Chlorophyll captures light energy, water is absorbed by the roots, and oxygen is released as a by-product.';

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
const UPLOAD_ACCEPT = '.pdf,.txt,image/png,image/jpeg,image/webp';

function friendlyError(message: string, fallback: string): string {
  if (!message) return fallback;
  if (/failed to fetch|network/i.test(message)) return fallback;
  return message;
}

/** Animated counter that counts up when scrolled into view. */
function Stat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const dur = 1200;
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    if (!('IntersectionObserver' in window)) {
      setN(value);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            run();
            io.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <div className="stat" ref={ref as React.RefObject<HTMLDivElement>}>
      <strong>
        {n}
        {suffix}
      </strong>
      <span>{label}</span>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('text');
  const [sourceText, setSourceText] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [target, setTarget] = useState('Telugu');
  const [sourceLanguage, setSourceLanguage] = useState('Auto-detect');
  const [detected, setDetected] = useState('');
  const [translated, setTranslated] = useState('');
  const [busy, setBusy] = useState<
    '' | 'extracting' | 'pdf-info' | 'pdf-extract' | 'translating' | 'speech'
  >('');
  const [speechLabel, setSpeechLabel] = useState('');
  const [error, setError] = useState('');
  const [images, setImages] = useState<PageImage[]>([]);
  const [reviewReady, setReviewReady] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState('');
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfFrom, setPdfFrom] = useState('1');
  const [pdfTo, setPdfTo] = useState('1');
  const [audioUrl, setAudioUrl] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [mode, setMode] = useState<EngineMode>('auto');
  const [showOffline, setShowOffline] = useState(false);
  const [packs, setPacks] = useState<PackCapabilitySummary[]>([]);
  const [deviceSpeech, setDeviceSpeech] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [speechEngineNote, setSpeechEngineNote] = useState('');
  const [voiceEmotion, setVoiceEmotion] = useState<VoiceEmotion>('auto');
  const [busyNote, setBusyNote] = useState('');
  const connectivity: ConnectivityState = useConnectivity();

  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const cloudTranslation = useRef(new CloudTranslationEngine());
  const localTranslation = useRef(new LocalTranslationEngine());
  const cloudExtraction = useRef(new CloudExtractionEngine());
  const localExtraction = useRef(new LocalExtractionEngine());
  const cloudSpeech = useRef(new CloudSpeechEngine());
  const deviceSpeechEngine = useRef<DeviceSpeechEngine | null>(null);

  const getDeviceSpeech = () => {
    if (!deviceSpeechEngine.current) deviceSpeechEngine.current = new DeviceSpeechEngine();
    return deviceSpeechEngine.current;
  };

  // Scroll-reveal: elements with [data-reveal] animate in once visible.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mothertongue-history-v1');
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setMode(loadMode());
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) releaseCachedAudioUrl(audioUrl);
      images.forEach((i) => URL.revokeObjectURL(i.url));
      try {
        deviceSpeechEngine.current?.stop();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showHistory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHistory(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showHistory]);

  const persistHistory = (next: HistoryItem[]) => {
    setHistory(next);
    try {
      localStorage.setItem('mothertongue-history-v1', JSON.stringify(next));
    } catch {
      /* storage full — ignore */
    }
  };

  const stopDeviceSpeech = () => {
    try {
      getDeviceSpeech().stop();
    } catch {
      /* ignore */
    }
    setDeviceSpeech('idle');
  };

  const clearAudio = () => {
    if (audioRef.current) audioRef.current.pause();
    if (audioUrl) releaseCachedAudioUrl(audioUrl);
    setAudioUrl('');
    stopDeviceSpeech();
    setSpeechEngineNote('');
  };

  const changeVoiceEmotion = (emotion: VoiceEmotion) => {
    clearAudio();
    setVoiceEmotion(emotion);
  };

  const openOffline = () => {
    try {
      setPacks(packCapabilities());
    } catch {
      setPacks([]);
    }
    setShowOffline(true);
  };

  const changeMode = (m: EngineMode) => {
    setMode(m);
    saveMode(m);
    stopDeviceSpeech();
  };

  // Release the offline model when switching target languages (§45).
  const changeTarget = (lang: string) => {
    if (lang !== target) {
      try {
        import('@/lib/offline/nllbClient').then((m) => m.releaseOfflineTranslator()).catch(() => {});
      } catch {
        /* ignore */
      }
    }
    setTarget(lang);
  };

  const clearTranslation = () => {
    clearAudio();
    setTranslated('');
    setDetected('');
  };

  const onSourceEdit = (value: string) => {
    setSourceText(value);
    if (translated) clearTranslation();
  };

  const addImageFiles = useCallback(
    (list: File[]) => {
      const valid: File[] = [];
      for (const f of list) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
          setError("This file type isn't supported yet. Try PDF, JPG, PNG, WEBP, or TXT.");
          continue;
        }
        if (f.size === 0 || f.size > MAX_IMAGE_BYTES) {
          setError('Each image must be under 10 MB. Try a smaller photo.');
          continue;
        }
        valid.push(f);
      }
      if (valid.length === 0) return;
      setImages((prev) => {
        const room = MAX_IMAGES - prev.length;
        if (room <= 0) {
          setError('You can add up to 10 pages per session. Remove one to add another.');
          return prev;
        }
        const take = valid.slice(0, room);
        if (valid.length > room) {
          setError('You can add up to 10 pages per session. Extra pages were skipped.');
        }
        const mapped: PageImage[] = take.map((file, idx) => ({
          id: `${Date.now()}-${idx}-${file.name}-${file.size}`,
          file,
          url: URL.createObjectURL(file),
        }));
        return [...prev, ...mapped];
      });
      setReviewReady(false);
      setError('');
    },
    []
  );

  const removeImage = (id: string) => {
    setImages((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const moveImage = (id: string, dir: -1 | 1) => {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const resetImages = () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
    setReviewReady(false);
  };

  const liveCameraSupported = () =>
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  const openCamera = () => {
    setError('');
    // Live preview first; the OS file picker is only a fallback.
    if (liveCameraSupported()) setCameraOpen(true);
    else cameraInput.current?.click();
  };

  const extractImages = async () => {
    if (images.length === 0 || busy === 'extracting') return;
    setError('');
    const decision = resolveStage({ mode, connectivity, stage: 'extraction' });
    if ('blocked' in decision) {
      setError(decision.blocked);
      return;
    }
    if (decision.engine === 'local') {
      setBusy('extracting');
      try {
        const result = await localExtraction.current.extractImages(
          images.map((i) => i.file),
          { sourceLanguage }
        );
        setSourceText(result.text ?? '');
        setSourceLabel(
          `${images.length} page${images.length > 1 ? 's' : ''} · check the text below · offline reading`
        );
        setReviewReady(true);
        clearTranslation();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Photo reading needs internet in this version.');
      } finally {
        setBusy('');
      }
      return;
    }
    setBusy('extracting');
    try {
      const result = await cloudExtraction.current.extractImages(images.map((i) => i.file));
      setSourceText(result.text ?? '');
      setSourceLabel(
        `${images.length} page${images.length > 1 ? 's' : ''} · check the text below`
      );
      setReviewReady(true);
      clearTranslation();
    } catch (e) {
      setError(
        friendlyError(
          e instanceof Error ? e.message : '',
          "We couldn't read this image clearly. Try another photo."
        )
      );
    } finally {
      setBusy('');
    }
  };

  const handleUploadFile = async (f: File) => {
    setError('');
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (f.type === 'text/plain' || ext === 'txt') {
      if (f.size > 2 * 1024 * 1024) {
        setError('This text file is too large. Try a file under 2 MB.');
        return;
      }
      const text = await f.text();
      if (!text.trim()) {
        setError("We couldn't find readable text in this file.");
        return;
      }
      setSourceText(text.slice(0, 100000));
      setSourceLabel(`${f.name} · text file`);
      clearTranslation();
      return;
    }
    if (f.type === 'application/pdf' || ext === 'pdf') {
      if (f.size > 25 * 1024 * 1024) {
        setError('This PDF is too large. Try a file under 25 MB or fewer pages.');
        return;
      }
      setPdfFile(f);
      setPdfName(f.name);
      setPdfPages(0);
      setPdfFrom('1');
      setPdfTo('1');
      const decision = resolveStage({ mode, connectivity, stage: 'extraction' });
      if ('blocked' in decision) {
        setError(decision.blocked);
        setPdfFile(null);
        return;
      }
      if (decision.engine === 'local') {
        try {
          await localExtraction.current.pdfInfo(f);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'PDF reading needs internet in this version.');
        }
        setPdfFile(null);
        return;
      }
      setBusy('pdf-info');
      try {
        const { pageCount } = await cloudExtraction.current.pdfInfo(f);
        const count = Number(pageCount) || 0;
        setPdfPages(count);
        setPdfTo(String(Math.min(count || 1, 5)));
        setSourceLabel(`${f.name} · ${count} pages`);
      } catch (e) {
        setError(
          friendlyError(e instanceof Error ? e.message : '', 'We could not read this PDF.')
        );
        setPdfFile(null);
      } finally {
        setBusy('');
      }
      return;
    }
    if (f.type.startsWith('image/')) {
      addImageFiles([f]);
      setTab('upload');
      return;
    }
    setError("This file type isn't supported yet. Try PDF, JPG, PNG, WEBP, or TXT.");
  };

  const extractPdf = async () => {
    if (!pdfFile || busy === 'pdf-extract') return;
    setError('');
    const decision = resolveStage({ mode, connectivity, stage: 'extraction' });
    if ('blocked' in decision) {
      setError(decision.blocked);
      return;
    }
    if (decision.engine === 'local') {
      try {
        await localExtraction.current.extractPdfPages(pdfFile, pdfFrom, pdfTo);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'PDF reading needs internet in this version.');
      }
      return;
    }
    setBusy('pdf-extract');
    try {
      const data = await cloudExtraction.current.extractPdfPages(pdfFile, pdfFrom, pdfTo);
      setSourceText(data.text ?? '');
      setSourceLabel(`${data.filename} · pages ${data.pages}`);
      if (typeof data.pageCount === 'number') setPdfPages(data.pageCount);
      clearTranslation();
    } catch (e) {
      setError(
        friendlyError(e instanceof Error ? e.message : '', 'We could not read this PDF.')
      );
    } finally {
      setBusy('');
    }
  };

  const translate = async () => {
    if (!sourceText.trim() || busy === 'translating') return;
    setError('');
    const decision = resolveStage({ mode, connectivity, stage: 'translation' });
    if ('blocked' in decision) {
      setError(decision.blocked);
      return;
    }
    if (decision.engine === 'local') {
      setBusy('translating');
      setBusyNote('Preparing offline translation… (first run loads the model, may take a minute)');
      try {
        const result = await localTranslation.current.translate({
          text: sourceText,
          sourceLanguage,
          targetLanguage: target,
        });
        const out = result.translatedText ?? '';
        setTranslated(out);
        setDetected(result.sourceLanguage ?? '');
        persistHistory(
          [
            {
              original: sourceText.slice(0, 5000),
              translated: out.slice(0, 8000),
              language: target,
              source: tab,
              date: Date.now(),
              translationEngine: result.engine,
            },
            ...history,
          ].slice(0, 20)
        );
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[offline-translation]', e instanceof Error ? e.message : e);
        }
        if (e instanceof EngineUnavailableError) {
          setError(
            `${e.message} Connect to the internet, or open Offline settings to see coming language packs.`
          );
        } else {
          setError('Offline translation failed on this device. Try cloud mode while online.');
        }
      } finally {
        setBusy('');
        setBusyNote('');
      }
      return;
    }
    setBusy('translating');
    clearAudio();
    setTranslated('');
    try {
      const result = await cloudTranslation.current.translate({
        text: sourceText,
        sourceLanguage,
        targetLanguage: target,
      });
      const out = result.translatedText ?? '';
      setTranslated(out);
      setDetected(result.sourceLanguage ?? '');
      persistHistory(
        [
          {
            original: sourceText.slice(0, 5000),
            translated: out.slice(0, 8000),
            language: target,
            source: tab,
            date: Date.now(),
            translationEngine: result.engine,
          },
          ...history,
        ].slice(0, 20)
      );
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) {
      setError(
        friendlyError(e instanceof Error ? e.message : '', 'Something went wrong while translating.')
      );
    } finally {
      setBusy('');
    }
  };

  const updateHistorySpeech = (engine: 'cloud' | 'device') => {
    setHistory((prev) => {
      const idx = prev.findIndex((h) => h.translated === translated.slice(0, 8000));
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], speechEngine: engine };
      try {
        localStorage.setItem('mothertongue-history-v1', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  /** Device-voice path: zero network, exact translated text, OS voice. */
  const speakWithDevice = () => {
    const engine = getDeviceSpeech();
    const voices = engine.voicesFor(target);
    if (voices.length === 0) {
      setError(
        `${target} voice isn't installed on this device. Install it in your system language settings, or reconnect for cloud voices.`
      );
      return false;
    }
    setError('');
    setSpeechEngineNote(`Offline voice · ${voices[0].name}`);
    engine.speak({
      text: translated,
      language: target,
      emotion: voiceEmotion,
      onEnd: () => setDeviceSpeech('idle'),
      onError: (message) => {
        setDeviceSpeech('idle');
        setError(message);
      },
    });
    setDeviceSpeech('speaking');
    updateHistorySpeech('device');
    return true;
  };

  const togglePlay = async () => {
    if (!translated || busy === 'speech') return;
    // A device voice already playing pauses/resumes locally.
    if (deviceSpeech === 'speaking') {
      getDeviceSpeech().pause();
      setDeviceSpeech('paused');
      return;
    }
    if (deviceSpeech === 'paused') {
      getDeviceSpeech().resume();
      setDeviceSpeech('speaking');
      return;
    }
    const el = audioRef.current;
    if (el && audioUrl) {
      if (el.paused) {
        try {
          await el.play();
        } catch {
          setError('Audio playback was blocked. Tap Play again.');
        }
      } else {
        el.pause();
      }
      return;
    }
    const decision = resolveStage({ mode, connectivity, stage: 'speech' });
    if ('blocked' in decision) {
      setError(decision.blocked);
      return;
    }
    if (decision.engine === 'local') {
      speakWithDevice();
      return;
    }
    setError('');
    setBusy('speech');
    try {
      const result = await cloudSpeech.current.synthesize({
        text: translated,
        language: target,
        emotion: voiceEmotion,
        onProgress: (done, total) => {
          setSpeechLabel(total > 1 ? `Preparing your audio… (${done + 1}/${total})` : 'Preparing your audio…');
        },
        beforeChunk: async () => {
          // Reachability: avoid hanging on dead networks when AUTO.
          if (mode !== 'offline' && !(await checkReachability())) {
            throw new Error('offline-during-speech');
          }
        },
      });
      if (audioUrl && audioUrl !== result.url) releaseCachedAudioUrl(audioUrl);
      setAudioUrl(result.url);
      setSpeechEngineNote('');
      updateHistorySpeech('cloud');
      setTimeout(async () => {
        try {
          if (audioRef.current) {
            audioRef.current.src = result.url;
            await audioRef.current.play();
          }
        } catch {
          setError('Audio is ready — tap Play to listen.');
        }
      }, 60);
    } catch (e) {
      const wentOffline =
        (e instanceof Error && e.message === 'offline-during-speech') ||
        (e instanceof TypeError && typeof navigator !== 'undefined' && !navigator.onLine);
      if (wentOffline && mode !== 'online') {
        // Mixed fallback: cloud speech died mid-flow — continue on-device.
        setBusy('');
        setSpeechLabel('');
        speakWithDevice();
        return;
      }
      setError(
        friendlyError(e instanceof Error ? e.message : '', 'We could not prepare the audio.')
      );
    } finally {
      setBusy('');
      setSpeechLabel('');
    }
  };

  const restoreHistory = (item: HistoryItem) => {
    clearAudio();
    setSourceText(item.original);
    setTranslated(item.translated);
    changeTarget(item.language);
    setTab(item.source);
    setDetected('');
    setSourceLabel('Restored from history');
    setShowHistory(false);
    setError('');
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  const onDropUpload = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length > 1) {
      addImageFiles(imgs.slice(0, MAX_IMAGES));
      return;
    }
    if (files[0]) void handleUploadFile(files[0]);
  };

  const busyLabel =
    busy === 'extracting'
      ? tab === 'camera'
        ? 'Reading your notes…'
        : 'Reading your document…'
      : busy === 'pdf-extract'
        ? `Extracting pages ${pdfFrom}–${pdfTo}…`
        : busy === 'pdf-info'
          ? 'Reading your document…'
          : busy === 'translating'
            ? 'Translating…'
            : '';
  const busyNoteText = busyNote && (busy === 'translating' || busy === 'extracting') ? busyNote : '';

  const showCameraPreview = tab === 'camera' && images.length > 0 && !reviewReady && busy !== 'extracting';
  const showCameraReview = tab === 'camera' && reviewReady && sourceText;
  const showUploadImages = tab === 'upload' && images.length > 0;

  return (
    <>
      <div className="bg-decor" aria-hidden>
        <span className="wash w1" />
        <span className="wash w2" />
        <span className="wash w3" />
      </div>
      <header className="topbar shell">
        <div className="brand" aria-label="MotherTongue home">
          <span className="mark" aria-hidden>
            M
          </span>
          MotherTongue
        </div>
        <div className="topbar-right">
          <span
            className={`status-pill ${connectivity}`}
            role="status"
            title={connectivity === 'online' ? 'Connected' : connectivity === 'offline' ? "You're offline" : 'Connection unknown'}
          >
            <span className={`status-dot ${connectivity}`} aria-hidden />
            <span className="hide-mobile">
              {connectivity === 'online' ? 'Online' : connectivity === 'offline' ? 'Offline' : '…'}
            </span>
          </span>
          <button className="quiet" type="button" aria-label="Offline settings" onClick={openOffline}>
            <Download size={18} aria-hidden />
            <span className="hide-mobile">Offline</span>
          </button>
          <button className="quiet" type="button" aria-label="Open history" onClick={() => setShowHistory(true)}>
            <History size={18} aria-hidden />
            <span className="hide-mobile">History</span>
          </button>
        </div>
      </header>

      <main className="shell">
        {connectivity === 'offline' && (
          <div className="offline-banner" role="status">
            <span className="status-dot offline" aria-hidden />
            <span>
              You&apos;re offline. Downloaded languages still work —{' '}
              <button className="textbutton" type="button" onClick={openOffline}>
                manage offline options
              </button>
            </span>
          </div>
        )}
        <section className="hero hero-stage">
          <div className="eyebrow-pill reveal" data-reveal>
            <span className="pulse-dot" aria-hidden />
            A calmer way to understand
          </div>
          <h1>
            <span className="line reveal" data-reveal>Understand anything</span>
            <span className="line accent reveal" data-reveal>
              in <em>your language.</em>
            </span>
          </h1>
          <p className="reveal" data-reveal>
            Paste text, take a photo, or upload your notes. Translate them into your mother
            tongue and listen.
          </p>
          <div className="hero-cta reveal" data-reveal>
            <button
              className="cta-primary"
              type="button"
              onClick={() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Start translating <ArrowDown size={16} aria-hidden />
            </button>
            <button
              className="cta-ghost"
              type="button"
              onClick={() => {
                setTab('camera');
                workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <Camera size={16} aria-hidden /> Use camera
            </button>
          </div>
          <div className="float-chips" aria-hidden>
            <span className="chip c1 serif">నమస్తే</span>
            <span className="chip c2 serif">வணக்கம்</span>
            <span className="chip c3 serif">नमस्ते</span>
            <span className="chip c4 serif">こんにちは</span>
            <span className="chip c5 serif">Hola</span>
          </div>
          <div className="hero-stats reveal" data-reveal>
            <Stat value={languages.length} suffix="" label="languages" />
            <Stat value={10} suffix="" label="pages per session" />
            <Stat value={5} suffix="" label="file types" />
          </div>
        </section>

        <div className="marquee reveal" data-reveal aria-hidden>
          <div className="marquee-track">
            {['తెలుగు', 'தமிழ்', 'हिन्दी', 'ಕನ್ನಡ', 'മലയാളം', 'বাংলা', 'मराठी', '日本語', '한국어', 'Español', 'Français', 'العربية'].map((l) => (
              <span key={l} className="serif">{l}</span>
            ))}
            {['తెలుగు', 'தமிழ்', 'हिन्दी', 'ಕನ್ನಡ', 'മലയാളം', 'বাংলা', 'मराठी', '日本語', '한국어', 'Español', 'Français', 'العربية'].map((l) => (
              <span key={`b-${l}`} className="serif">{l}</span>
            ))}
          </div>
        </div>

        <section className="workspace" ref={workspaceRef} aria-label="MotherTongue translator">
          <div className="tabs" role="tablist" aria-label="Choose input method">
            {(
              [
                { id: 'text', label: 'Text', Icon: FileText },
                { id: 'camera', label: 'Camera', Icon: Camera },
                { id: 'upload', label: 'Upload', Icon: Upload },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`tab${tab === id ? ' active' : ''}`}
                onClick={() => {
                  setTab(id);
                  setError('');
                }}
              >
                <Icon size={16} aria-hidden /> {label}
              </button>
            ))}
          </div>

          <div className="workpad">
            {tab === 'text' && (
              <div role="tabpanel" aria-label="Text input">
                <div className="labelrow">
                  <label htmlFor="original">Original text</label>
                  <span className="muted">{sourceText.length.toLocaleString()} / 100,000</span>
                </div>
                <textarea
                  id="original"
                  className="textarea-large"
                  value={sourceText}
                  maxLength={100000}
                  onChange={(e) => onSourceEdit(e.target.value)}
                  placeholder="Paste something you want to understand…"
                  rows={7}
                />
                <div className="toolrow">
                  <button className="textbutton" type="button" onClick={() => onSourceEdit(EXAMPLE)}>
                    Try an example
                  </button>
                  {sourceText && (
                    <button
                      className="textbutton"
                      type="button"
                      onClick={() => onSourceEdit('')}
                      aria-label="Clear text"
                    >
                      <Trash2 size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === 'camera' && (
              <div role="tabpanel" aria-label="Camera input">
                <input
                  ref={cameraInput}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Take a photo"
                  onChange={(e) => {
                    if (e.target.files?.length) addImageFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }}
                />
                <input
                  ref={libraryInput}
                  className="sr-only"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  multiple
                  aria-label="Add photo pages"
                  onChange={(e) => {
                    if (e.target.files?.length) addImageFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }}
                />

                {cameraOpen && (
                  <LiveCamera
                    onCapture={(file) => {
                      addImageFiles([file]);
                      setCameraOpen(false);
                    }}
                    onClose={() => setCameraOpen(false)}
                    onFallback={() => cameraInput.current?.click()}
                  />
                )}

                {images.length === 0 && busy !== 'extracting' && !cameraOpen && (
                  <div className="drop">
                    <Camera size={28} color="#315d4a" aria-hidden />
                    <strong>Take a photo of your notes</strong>
                    <span>Textbook, notebook, worksheet, whiteboard, or printed page.</span>
                    <div className="cta-row">
                      <button
                        className="primary-small"
                        type="button"
                        onClick={openCamera}
                      >
                        Open camera
                      </button>
                      <button
                        className="ghost-small"
                        type="button"
                        onClick={() => libraryInput.current?.click()}
                      >
                        Choose photos
                      </button>
                    </div>
                    <div className="tips">
                      <strong>For best results</strong>
                      <span>Flat page · good light · no shadows · full page visible · hold steady</span>
                    </div>
                  </div>
                )}

                {showCameraPreview && (
                  <div className="review-box">
                    <div className="labelrow">
                      <span>Photo preview</span>
                      <span className="muted">
                        Page {images.length} / {MAX_IMAGES}
                      </span>
                    </div>
                    <div className="thumbs">
                      {images.map((img, idx) => (
                        <div className="thumb" key={img.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={`Page ${idx + 1}`} />
                          <span className="thumb-label">Page {idx + 1} ✓</span>
                          <div className="thumb-actions">
                            <button
                              type="button"
                              aria-label={`Move page ${idx + 1} earlier`}
                              disabled={idx === 0}
                              onClick={() => moveImage(img.id, -1)}
                            >
                              <ArrowLeft size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move page ${idx + 1} later`}
                              disabled={idx === images.length - 1}
                              onClick={() => moveImage(img.id, 1)}
                            >
                              <ArrowRight size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove page ${idx + 1}`}
                              onClick={() => removeImage(img.id)}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="cta-row">
                      <button className="ghost-small" type="button" onClick={resetImages}>
                        Retake
                      </button>
                      <button
                        className="ghost-small"
                        type="button"
                        onClick={openCamera}
                      >
                        Add another page
                      </button>
                      <button className="primary-small" type="button" onClick={() => void extractImages()}>
                        Use photo{images.length > 1 ? 's' : ''}
                      </button>
                    </div>
                  </div>
                )}

                {busy === 'extracting' && (
                  <div className="loading-line" role="status">
                    <span className="scan">
                      <ScanLine size={20} aria-hidden />
                    </span>
                    Reading your notes…
                  </div>
                )}

                {showCameraReview && (
                  <div className="review-box">
                    <div className="labelrow">
                      <label htmlFor="camera-review">Check the text</label>
                      <span className="muted">{sourceLabel}</span>
                    </div>
                    <textarea
                      id="camera-review"
                      className="textarea-large"
                      value={sourceText}
                      onChange={(e) => onSourceEdit(e.target.value)}
                      rows={8}
                    />
                    <div className="cta-row">
                      <button
                        className="ghost-small"
                        type="button"
                        onClick={() => {
                          setReviewReady(false);
                        }}
                      >
                        Scan again
                      </button>
                      <button
                        className="ghost-small"
                        type="button"
                        onClick={openCamera}
                      >
                        Add another page
                      </button>
                      <span className="looks-good">
                        <X size={0} aria-hidden /> Looks good — choose a language below
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'upload' && (
              <div role="tabpanel" aria-label="File upload">
                <input
                  ref={uploadInput}
                  className="sr-only"
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  aria-label="Choose a file to upload"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleUploadFile(f);
                  }}
                />
                {!pdfFile && images.length === 0 && (
                  <div
                    className={`drop${dragActive ? ' drag' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={onDropUpload}
                  >
                    <Upload size={28} color="#315d4a" aria-hidden />
                    <strong>Drop your notes here</strong>
                    <span>PDF, image, or text file · up to 25 MB</span>
                    <button
                      className="primary-small"
                      type="button"
                      onClick={() => uploadInput.current?.click()}
                    >
                      Browse files
                    </button>
                    <span className="muted small">PDF · PNG · JPG · WEBP · TXT</span>
                  </div>
                )}

                {pdfFile && (
                  <div className="review-box">
                    <div className="preview">
                      <FileText size={26} color="#315d4a" aria-hidden />
                      <span>
                        <strong>{pdfName}</strong>
                        <br />
                        {busy === 'pdf-info'
                          ? 'Reading your document…'
                          : pdfPages
                            ? `${pdfPages} pages`
                            : 'PDF selected'}
                      </span>
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label="Remove PDF"
                        onClick={() => {
                          setPdfFile(null);
                          setPdfName('');
                          setPdfPages(0);
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {pdfPages > 0 && !sourceText && (
                      <div className="page-row">
                        <label>
                          From
                          <input
                            value={pdfFrom}
                            inputMode="numeric"
                            aria-label="First page"
                            onChange={(e) => setPdfFrom(e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </label>
                        <span className="muted">to</span>
                        <label>
                          To
                          <input
                            value={pdfTo}
                            inputMode="numeric"
                            aria-label="Last page"
                            onChange={(e) => setPdfTo(e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </label>
                        <button
                          className="primary-small"
                          type="button"
                          onClick={() => void extractPdf()}
                          disabled={busy === 'pdf-extract'}
                        >
                          {busy === 'pdf-extract' ? (
                            <>
                              <Loader2 size={15} className="spin" /> Extracting…
                            </>
                          ) : (
                            'Extract pages'
                          )}
                        </button>
                      </div>
                    )}
                    {busy === 'pdf-extract' && (
                      <div className="loading-line" role="status">
                        <Loader2 size={17} className="spin" aria-hidden />
                        Extracting pages {pdfFrom}–{pdfTo}…
                      </div>
                    )}
                    {sourceText && pdfFile && (
                      <>
                        <div className="labelrow">
                          <label htmlFor="pdf-review">Check the text</label>
                          <span className="muted">{sourceLabel}</span>
                        </div>
                        <textarea
                          id="pdf-review"
                          className="textarea-large"
                          value={sourceText}
                          onChange={(e) => onSourceEdit(e.target.value)}
                          rows={8}
                        />
                        <div className="cta-row">
                          <button
                            className="ghost-small"
                            type="button"
                            onClick={() => {
                              setPdfFile(null);
                              setSourceText('');
                              setSourceLabel('');
                            }}
                          >
                            Upload another file
                          </button>
                          <span className="looks-good">Looks good — choose a language below</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {showUploadImages && (
                  <div className="review-box">
                    <div className="thumbs">
                      {images.map((img, idx) => (
                        <div className="thumb" key={img.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={`Uploaded page ${idx + 1}`} />
                          <span className="thumb-label">Page {idx + 1} ✓</span>
                          <div className="thumb-actions">
                            <button
                              type="button"
                              aria-label={`Remove page ${idx + 1}`}
                              onClick={() => removeImage(img.id)}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {busy === 'extracting' ? (
                      <div className="loading-line" role="status">
                        <Loader2 size={17} className="spin" aria-hidden /> Reading your document…
                      </div>
                    ) : sourceText ? (
                      <>
                        <div className="labelrow">
                          <label htmlFor="upload-review">Check the text</label>
                          <span className="muted">{sourceLabel}</span>
                        </div>
                        <textarea
                          id="upload-review"
                          className="textarea-large"
                          value={sourceText}
                          onChange={(e) => onSourceEdit(e.target.value)}
                          rows={8}
                        />
                      </>
                    ) : (
                      <div className="cta-row">
                        <button className="primary-small" type="button" onClick={() => void extractImages()}>
                          Extract text
                        </button>
                        <button
                          className="ghost-small"
                          type="button"
                          onClick={() => resetImages()}
                        >
                          Upload another file
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!pdfFile && images.length === 0 && sourceText && (
                  <div className="review-box">
                    <div className="labelrow">
                      <label htmlFor="txt-review">Check the text</label>
                      <span className="muted">{sourceLabel}</span>
                    </div>
                    <textarea
                      id="txt-review"
                      className="textarea-large"
                      value={sourceText}
                      onChange={(e) => onSourceEdit(e.target.value)}
                      rows={8}
                    />
                    <div className="cta-row">
                      <button
                        className="ghost-small"
                        type="button"
                        onClick={() => {
                          setSourceText('');
                          setSourceLabel('');
                        }}
                      >
                        Upload another file
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {busyLabel && busy !== 'speech' && (
              <div className="loading-line subtle" role="status" aria-live="polite">
                {busyLabel}
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}

            {busyNoteText && (
              <div className="loading-line subtle" role="status" aria-live="polite">
                {busyNoteText}
              </div>
            )}

            <LanguageSelector
              value={sourceLanguage}
              onChange={setSourceLanguage}
              label="Source language"
              allowAutoDetect
              id="source-language-button"
            />
            <LanguageSelector value={target} onChange={changeTarget} />

            <button
              className="translate"
              type="button"
              disabled={!sourceText.trim() || busy === 'translating' || busy === 'extracting' || busy === 'pdf-extract'}
              onClick={() => void translate()}
            >
              {busy === 'translating' ? (
                <>
                  <span className="spinner" aria-hidden /> Translating…
                </>
              ) : (
                <>
                  <Sparkles size={17} aria-hidden /> Translate
                </>
              )}
            </button>
            {sourceLabel && !translated && (
              <div className="source-note">
                {sourceLabel} · {sourceText.length.toLocaleString()} characters
              </div>
            )}
          </div>

          {translated && (
            <div ref={resultRef} className="result-zone">
              <div className="result-grid">
                <div className="original-card">
                  <div className="result-head">
                    <span className="result-title">Original</span>
                    {detected && <span className="muted small">{detected}</span>}
                  </div>
                  <p className="original-text" dir="auto">{sourceText}</p>
                </div>
                <AudioPlayer
                  audioRef={audioRef}
                  audioUrl={audioUrl}
                  preparing={busy === 'speech'}
                  prepareLabel={speechLabel}
                  playingHighlight
                  onPlay={() => void togglePlay()}
                  onRegenerate={() => void translate()}
                  onClear={clearTranslation}
                  translated={translated}
                  emotion={voiceEmotion}
                  onEmotionChange={changeVoiceEmotion}
                />
              </div>
              {deviceSpeech !== 'idle' && (
                <div className="device-voice-bar" role="status">
                  <button
                    className="play play-small"
                    type="button"
                    onClick={() => void togglePlay()}
                    aria-label={deviceSpeech === 'speaking' ? 'Pause device voice' : 'Resume device voice'}
                  >
                    {deviceSpeech === 'speaking' ? (
                      <Pause size={18} fill="white" aria-hidden />
                    ) : (
                      <Play size={18} fill="white" aria-hidden style={{ marginLeft: 2 }} />
                    )}
                  </button>
                  <div className="track">
                    <div className="bars" aria-hidden>
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <span className="engine-note">{speechEngineNote || 'Offline voice'}</span>
                  </div>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label="Restart device voice"
                    onClick={() => {
                      stopDeviceSpeech();
                      setTimeout(() => speakWithDevice(), 60);
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="steps" aria-label="How it works">
          <article className="step-card reveal" data-reveal>
            <span className="step-num" aria-hidden>01</span>
            <FileText size={22} aria-hidden />
            <h3>Give</h3>
            <p>Paste text, snap your notes, or drop a file. Multiple pages welcome.</p>
          </article>
          <article className="step-card reveal" data-reveal>
            <span className="step-num" aria-hidden>02</span>
            <Languages size={22} aria-hidden />
            <h3>Translate</h3>
            <p>Faithful translation into your mother tongue — meaning first, always.</p>
          </article>
          <article className="step-card reveal" data-reveal>
            <span className="step-num" aria-hidden>03</span>
            <Volume2 size={22} aria-hidden />
            <h3>Listen</h3>
            <p>Press play and hear it read aloud naturally, at your own pace.</p>
          </article>
        </section>

        <div className="footer-note">
          Your files are processed temporarily and are never saved.{' '}
          <span className="serif">Read with confidence.</span>
        </div>
      </main>

      <HistoryDrawer
        open={showHistory}
        items={history}
        onClose={() => setShowHistory(false)}
        onSelect={restoreHistory}
        onClearAll={() => persistHistory([])}
      />
      <OfflineDrawer
        open={showOffline}
        onClose={() => setShowOffline(false)}
        mode={mode}
        onModeChange={changeMode}
        connectivity={connectivity}
        packs={packs}
      />
    </>
  );
}
