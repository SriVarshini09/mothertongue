'use client';

import { X } from 'lucide-react';

export type HistoryItem = {
  original: string;
  translated: string;
  language: string;
  source: 'text' | 'camera' | 'upload';
  date: number;
  translationEngine?: 'cloud' | 'local';
  speechEngine?: 'cloud' | 'device';
};

export default function HistoryDrawer({
  open,
  items,
  onClose,
  onSelect,
  onClearAll,
}: {
  open: boolean;
  items: HistoryItem[];
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
  onClearAll: () => void;
}) {
  if (!open) return null;
  return (
    <div className="history-panel" onClick={onClose}>
      <aside
        className="history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Translation history"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="history-head">
          <h2 className="serif">Your history</h2>
          <button className="icon-btn" type="button" aria-label="Close history" onClick={onClose} autoFocus>
            <X size={17} />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="muted">Translations you make will appear here on this device.</p>
        ) : (
          <>
            <button className="textbutton" type="button" onClick={onClearAll}>
              Clear all
            </button>
            <div className="history-list">
              {items.map((h, i) => (
                <button
                  key={`${h.date}-${i}`}
                  type="button"
                  className="history-item"
                  onClick={() => onSelect(h)}
                >
                  <strong>{h.language}</strong>
                  <div className="history-snippet">{h.original}</div>
                  <small className="muted">
                    {new Date(h.date).toLocaleString()} ·{' '}
                    {h.source === 'text' ? 'Text' : h.source === 'camera' ? 'Camera' : 'Upload'}
                    {h.speechEngine === 'device' ? ' · Offline voice' : ''}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
