'use client';

import { RefObject, useEffect, useState } from 'react';
import { Copy, Loader2, Pause, Play, RotateCcw, RefreshCw, X } from 'lucide-react';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export default function AudioPlayer({
  audioRef,
  audioUrl,
  preparing,
  prepareLabel,
  playingHighlight,
  onPlay,
  onRegenerate,
  onClear,
  translated,
}: {
  audioRef: RefObject<HTMLAudioElement>;
  audioUrl: string;
  preparing: boolean;
  prepareLabel: string;
  playingHighlight: boolean;
  onPlay: () => void;
  onRegenerate: () => void;
  onClear: () => void;
  translated: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      setProgress(el.currentTime);
      if (Number.isFinite(el.duration)) setDuration(el.duration);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
    };
    const onPlayEv = () => setPlaying(true);
    const onPauseEv = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlayEv);
    el.addEventListener('pause', onPauseEv);
    el.addEventListener('ended', onPauseEv);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlayEv);
      el.removeEventListener('pause', onPauseEv);
      el.removeEventListener('ended', onPauseEv);
    };
  }, [audioRef, audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [audioRef, rate, audioUrl]);

  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n < 0) return '0:00';
    return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  };

  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(rate);
    setRate(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(translated);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`result${playingHighlight && playing ? ' speaking' : ''}`}>
      <div className="result-head">
        <span className="result-title">Translation</span>
        <div className="result-actions">
          <button className="icon-btn" type="button" aria-label="Copy translation" onClick={copy}>
            {copied ? <Copy size={15} color="#315d4a" /> : <Copy size={15} />}
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Regenerate translation"
            title="Regenerate"
            onClick={onRegenerate}
          >
            <RefreshCw size={15} />
          </button>
          <button className="icon-btn" type="button" aria-label="Clear translation" onClick={onClear}>
            <X size={15} />
          </button>
        </div>
      </div>
      <p className="translation" dir="auto">
        {translated}
      </p>
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />
      {preparing && (
        <div className="audio-status" role="status">
          <Loader2 size={16} className="spin" /> {prepareLabel || 'Preparing your audio…'}
        </div>
      )}
      <div className="audio-controls">
        <button
          className="play"
          type="button"
          onClick={onPlay}
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={preparing}
        >
          {preparing ? (
            <Loader2 size={21} className="spin" />
          ) : playing ? (
            <Pause size={21} fill="white" aria-hidden />
          ) : (
            <Play size={21} fill="white" aria-hidden style={{ marginLeft: 2 }} />
          )}
        </button>
        <div className="track">
          {playing && (
            <div className="bars" aria-hidden>
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
          <div
            className="progress"
            role="progressbar"
            aria-label="Audio progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration || 0)}
            aria-valuenow={Math.round(progress || 0)}
          >
            <span style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }} />
          </div>
          <div className="time-row">
            <span>{fmt(progress)}</span>
            <span>{duration ? fmt(duration) : '—:——'}</span>
          </div>
        </div>
        <button
          className="speed"
          type="button"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${rate} times`}
          title="Playback speed"
        >
          {rate}×
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label="Restart audio"
          onClick={() => {
            const el = audioRef.current;
            if (!el || !audioUrl) return;
            el.currentTime = 0;
            void el.play();
          }}
          disabled={!audioUrl}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      {copied && (
        <div className="copied-note" role="status">
          Copied to clipboard
        </div>
      )}
    </div>
  );
}
