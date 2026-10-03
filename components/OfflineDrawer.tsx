'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Search, Star, Trash2, X } from 'lucide-react';
import type { ConnectivityState } from '@/lib/offline/connectivity';
import { MODE_DESCRIPTIONS, type EngineMode } from '@/lib/offline/mode';
import {
  getPackStatus,
  type LanguagePackDef,
  type PackCapabilitySummary,
  verifyStoredPack,
} from '@/lib/offline/languagePacks';
import {
  downloadPack,
  removePack,
  validateManifest,
  type DownloadProgress,
  type PackManifest,
} from '@/lib/offline/downloadManager';
import { storageEstimate } from '@/lib/offline/modelStorage';

function capabilityLine(label: string, state: string, detail?: string) {
  return (
    <div className="pack-cap">
      <span>{label}</span>
      <strong className={state.startsWith('✓') || state === 'Downloaded' ? 'ok' : ''}>
        {state}
        {detail ? ` · ${detail}` : ''}
      </strong>
    </div>
  );
}

function prettyBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GB`;
  if (n >= 1 << 20) return `${Math.round(n / (1 << 20))} MB`;
  return `${Math.round(n / 1024)} KB`;
}

type DlView =
  | { kind: 'idle' }
  | { kind: 'confirm'; totalBytes: number }
  | { kind: 'busy'; loadedBytes: number; totalBytes: number; percent: number }
  | { kind: 'error'; message: string };

const FAVORITES_KEY = 'mothertongue-offline-language-favorites-v1';

function readFavorites(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

async function deviceCheck(totalBytes: number): Promise<string | null> {
  try {
    const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof dm === 'number' && dm < 4) {
      return 'This download is large and this device reports limited memory. Offline translation may be slow or fail here.';
    }
    const est = await storageEstimate();
    if (est.quota && est.usage !== undefined && est.quota - est.usage < totalBytes * 1.2) {
      return 'Not enough free storage on this device for this download.';
    }
  } catch {
    /* checks are best-effort */
  }
  return null;
}

/**
 * Offline settings drawer: engine mode, connectivity status, and honest
 * per-language offline capabilities with real downloads where manifests
 * exist — never a fake download button.
 */
export default function OfflineDrawer({
  open,
  onClose,
  mode,
  onModeChange,
  connectivity,
  packs,
}: {
  open: boolean;
  onClose: () => void;
  mode: EngineMode;
  onModeChange: (m: EngineMode) => void;
  connectivity: ConnectivityState;
  packs: PackCapabilitySummary[];
}) {
  const [manifests, setManifests] = useState<Record<string, PackManifest>>({});
  const [dl, setDl] = useState<Record<string, DlView>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [packSearch, setPackSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const aborts = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, PackManifest> = {};
      const urls = [...new Set(
        packs
          .filter((p) => p.def.translation === 'downloadable' && p.def.manifestUrl)
          .map((p) => p.def.manifestUrl as string)
      )];
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          const manifest = validateManifest(await res.json());
          if (manifest) next[url] = manifest;
        } catch {
          /* size display degrades gracefully */
        }
      }
      if (!cancelled) setManifests(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, packs]);

  if (!open) return null;

  const manifestFor = (def: LanguagePackDef) => def.manifestUrl ? manifests[def.manifestUrl] : undefined;
  const isRepresentative = (def: LanguagePackDef) => Boolean(
    def.manifestUrl && packs.find((p) => p.def.manifestUrl === def.manifestUrl)?.def.language === def.language
  );

  const startDownload = async (def: LanguagePackDef) => {
    const manifest = manifestFor(def);
    if (!def.manifestUrl) return;
    if (!manifest) {
      setDl((d) => ({ ...d, [def.language]: { kind: 'error', message: 'Could not load download info. Reconnect and retry.' } }));
      return;
    }
    const totalBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
    const warn = await deviceCheck(totalBytes);
    if (warn) {
      setDl((d) => ({ ...d, [def.language]: { kind: 'error', message: warn } }));
      return;
    }
    setDl((d) => ({ ...d, [def.language]: { kind: 'confirm', totalBytes } }));
  };

  const confirmDownload = async (def: LanguagePackDef) => {
    if (!def.manifestUrl) return;
    const ctrl = new AbortController();
    aborts.current[def.language] = ctrl;
    setDl((d) => ({ ...d, [def.language]: { kind: 'busy', loadedBytes: 0, totalBytes: 0, percent: 0 } }));
    try {
      await downloadPack({
        language: def.language,
        manifestUrl: def.manifestUrl,
        expectedVersion: def.version,
        expectedManifestId: def.manifestId,
        signal: ctrl.signal,
        onProgress: (p: DownloadProgress) =>
          setDl((d) => ({ ...d, [def.language]: { kind: 'busy', ...p } })),
      });
      setDl((d) => ({ ...d, [def.language]: { kind: 'idle' } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'download-failed';
      console.error('[offline-pack-download]', def.language, message);
      if (message === 'download-cancelled') {
        setDl((d) => ({ ...d, [def.language]: { kind: 'idle' } }));
      } else {
        setDl((d) => ({ ...d, [def.language]: { kind: 'error', message: 'Download failed. Check connection and retry.' } }));
      }
    } finally {
      delete aborts.current[def.language];
    }
  };

  const cancelDownload = (language: string) => {
    aborts.current[language]?.abort();
  };

  const remove = async (def: LanguagePackDef) => {
    try {
      await removePack(def.language);
    } catch {
      /* status cleared regardless */
    }
    setDl((d) => ({ ...d, [def.language]: { kind: 'idle' } }));
  };

  const verifyPack = async (def: LanguagePackDef) => {
    setChecking((current) => ({ ...current, [def.language]: true }));
    try {
      const valid = await verifyStoredPack(def.language);
      setDl((d) => valid
        ? { ...d, [def.language]: { kind: 'idle' } }
        : { ...d, [def.language]: { kind: 'error', message: 'Pack verification failed. Download it again.' } });
    } finally {
      setChecking((current) => ({ ...current, [def.language]: false }));
    }
  };

  const downloaded = new Set(
    packs
      .filter((p) => getPackStatus(p.def.language, 'translation') === 'ready')
      .map((p) => p.def.manifestUrl ?? p.def.id)
  );
  const normalizedPackSearch = packSearch.trim().toLocaleLowerCase();
  const visiblePacks = normalizedPackSearch
    ? packs.filter((p) => `${p.def.language} ${p.def.native}`.toLocaleLowerCase().includes(normalizedPackSearch))
    : packs;
  const orderedPacks = [...visiblePacks].sort(
    (a, b) => Number(!favorites.includes(a.def.language)) - Number(!favorites.includes(b.def.language))
  );
  const sharedRepresentative = packs.find((p) => p.def.translation === 'downloadable' && p.def.manifestUrl);
  const sharedControlHidden = Boolean(
    sharedRepresentative && !visiblePacks.some((p) => isRepresentative(p.def))
  );

  const toggleFavorite = (language: string) => {
    setFavorites((current) => {
      const next = current.includes(language)
        ? current.filter((value) => value !== language)
        : [...current, language];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* favorites are a convenience; offline translation does not depend on them */
      }
      return next;
    });
  };

  const renderTranslationRow = (def: LanguagePackDef) => {
    const view = dl[def.language] ?? { kind: 'idle' as const };
    const stored = getPackStatus(def.language, 'translation');
    if (def.translation !== 'downloadable' || !def.manifestUrl) {
      return capabilityLine('Translation', 'Coming soon');
    }
    if (!isRepresentative(def)) {
      return capabilityLine(
        'Translation',
        stored === 'ready' ? '✓ Included offline' : 'Included in multilingual pack',
        stored === 'ready' ? def.version : 'one shared download'
      );
    }
    if (stored === 'ready' && view.kind === 'idle') {
      return (
        <>
          {capabilityLine('Translation', 'Downloaded', def.version)}
          <button
            className="ghost-small pack-remove"
            type="button"
            disabled={checking[def.language]}
            onClick={() => void verifyPack(def)}
          >
            {checking[def.language] ? 'Checking…' : 'Verify files'}
          </button>
          <button className="ghost-small pack-remove" type="button" onClick={() => void remove(def)}>
            <Trash2 size={14} aria-hidden /> Remove
          </button>
        </>
      );
    }
    if (view.kind === 'busy') {
      return (
        <div className="dl-box">
          <div className="dl-progress" role="progressbar" aria-label={`Downloading ${def.language}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.percent}>
            <span style={{ width: `${view.percent}%` }} />
          </div>
          <div className="dl-row">
            <span className="muted small">
              {prettyBytes(view.loadedBytes)} / {prettyBytes(view.totalBytes)} · {view.percent}%
            </span>
            <button className="textbutton" type="button" onClick={() => cancelDownload(def.language)}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    if (view.kind === 'confirm') {
      return (
        <div className="dl-box">
          <p className="small" style={{ margin: '4px 0 8px' }}>
            Download the multilingual translation pack for offline use? About <strong>{prettyBytes(view.totalBytes)}</strong>.
            First run loads the model and may take a minute.
          </p>
          <div className="cta-row" style={{ marginTop: 0 }}>
            <button className="primary-small" type="button" onClick={() => void confirmDownload(def)}>
              <Download size={15} aria-hidden /> Download
            </button>
            <button className="ghost-small" type="button" onClick={() => setDl((d) => ({ ...d, [def.language]: { kind: 'idle' } }))}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    if (view.kind === 'error') {
      return (
        <div className="dl-box">
          <p className="error" role="alert">{view.message}</p>
          <button className="ghost-small" type="button" onClick={() => void startDownload(def)}>
            Try again
          </button>
        </div>
      );
    }
    const manifest = manifestFor(def);
    const size = manifest ? prettyBytes(manifest.files.reduce((n, f) => n + f.bytes, 0)) : null;
    return (
      <div className="dl-box">
        <button className="ghost-small" type="button" onClick={() => void startDownload(def)}>
          <Download size={15} aria-hidden /> Download{size ? ` (~${size})` : ''}
        </button>
      </div>
    );
  };

  return (
    <div className="history-panel" onClick={onClose}>
      <aside
        className="history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Offline settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="history-head">
          <h2 className="serif">Offline &amp; voice</h2>
          <button className="icon-btn" type="button" aria-label="Close offline settings" onClick={onClose} autoFocus>
            <X size={17} />
          </button>
        </div>

        <div className="offline-status" role="status">
          <span className={`status-dot ${connectivity}`} aria-hidden />
          {connectivity === 'online' && 'Connected'}
          {connectivity === 'offline' && "You're offline"}
          {connectivity === 'unknown' && 'Connection unknown'}
        </div>

        <h3 className="drawer-sub">Mode</h3>
        <div className="mode-group" role="radiogroup" aria-label="Engine mode">
          {(Object.keys(MODE_DESCRIPTIONS) as EngineMode[]).map((m) => (
            <label key={m} className={`mode-option${mode === m ? ' selected' : ''}`}>
              <input
                type="radio"
                name="engine-mode"
                value={m}
                checked={mode === m}
                onChange={() => onModeChange(m)}
              />
              <span>
                <strong>{MODE_DESCRIPTIONS[m].label}</strong>
                <small className="muted">{MODE_DESCRIPTIONS[m].hint}</small>
              </span>
            </label>
          ))}
        </div>

        <h3 className="drawer-sub">Offline languages</h3>
        <div className="lang-search pack-search">
          <Search size={15} aria-hidden />
          <input
            aria-label="Filter offline languages"
            placeholder="Search offline languages"
            value={packSearch}
            onChange={(e) => setPackSearch(e.target.value)}
          />
        </div>
        {sharedControlHidden && sharedRepresentative && (
          <div className="pack-shared-control">
            <span className="small"><strong>Multilingual translation pack</strong> · shared by all languages</span>
            {renderTranslationRow(sharedRepresentative.def)}
          </div>
        )}
        {connectivity === 'offline' && downloaded.size === 0 && (
          <p className="muted small">
            You&apos;re offline. Downloaded languages would still work here — none are stored yet.
          </p>
        )}
        <div className="pack-list">
          {orderedPacks.map(({ def, speechVoice, speech, ocr }) => (
            <div className="pack-item" key={def.id}>
              <div className="pack-head">
                <strong>
                  <span className="lang-native">{def.native}</span>{' '}
                  <span className="muted">{def.language}</span>
                </strong>
                <button
                  className={`pack-favorite${favorites.includes(def.language) ? ' active' : ''}`}
                  type="button"
                  aria-label={`${favorites.includes(def.language) ? 'Remove' : 'Add'} ${def.language} ${favorites.includes(def.language) ? 'from' : 'to'} offline favorites`}
                  aria-pressed={favorites.includes(def.language)}
                  onClick={() => toggleFavorite(def.language)}
                >
                  <Star size={16} fill={favorites.includes(def.language) ? 'currentColor' : 'none'} aria-hidden />
                </button>
              </div>
              {renderTranslationRow(def)}
              {speech === 'device-ready' && speechVoice
                ? capabilityLine('Speech', '✓ Device voice', speechVoice.name)
                : capabilityLine('Speech', 'No device voice', `${def.language} voice isn't installed on this device`)}
              {capabilityLine('Text reading (OCR)', ocr === 'printed-offline' ? '✓ Printed text on-device' : 'Online for now')}
            </div>
          ))}
          {visiblePacks.length === 0 && <p className="lang-empty">No offline language matches that search.</p>}
        </div>
        <p className="muted small pack-note">
          The app always asks before large downloads and shows real sizes. Device voices come
          from your phone or computer settings.
        </p>
      </aside>
    </div>
  );
}
