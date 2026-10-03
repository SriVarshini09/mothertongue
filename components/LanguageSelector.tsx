'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, PenLine, Search } from 'lucide-react';
import { describeLanguage, languages } from '@/lib/languages';

export default function LanguageSelector({
  value,
  onChange,
  label = 'Translate into',
  allowAutoDetect = false,
  id = 'language-button',
}: {
  value: string;
  onChange: (name: string) => void;
  label?: string;
  allowAutoDetect?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = describeLanguage(value);
  const labelId = allowAutoDetect ? 'source-language-label' : 'target-language-label';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = q
      ? languages.filter((l) => `${l.name} ${l.native}`.toLowerCase().includes(q))
      : [
          ...languages.filter((l) => l.popular),
          ...languages.filter((l) => !l.popular),
        ];
    return all;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCustom(false);
      setCustomName('');
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open ]);

  const submitCustom = () => {
    const name = customName.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) return;
    onChange(name.charAt(0).toUpperCase() + name.slice(1));
    setOpen(false);
  };

  return (
    <div className="language-line">
      <label id={labelId} htmlFor={id}>
        {label}
      </label>
      <div className="select-wrap" ref={boxRef}>
        <button
          id={id}
          type="button"
          className="lang-button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${labelId} ${id}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span>
            <span className="lang-native">{selected.native}</span>
            <span className="muted"> — {selected.name}</span>
          </span>
          <ChevronDown size={16} aria-hidden />
        </button>
        {open && (
          <div className="lang-menu" role="listbox" aria-label="Target language">
            <div className="lang-search">
              <Search size={15} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCustom(false);
                }}
                placeholder={`Search ${languages.length} languages…`}
                aria-label="Search languages"
              />
            </div>
            <div className="lang-list">
              {allowAutoDetect && !query && !custom && (
                <button
                  type="button"
                  role="option"
                  aria-selected={value === 'Auto-detect'}
                  className={`lang-option${value === 'Auto-detect' ? ' selected' : ''}`}
                  onClick={() => {
                    onChange('Auto-detect');
                    setOpen(false);
                  }}
                >
                  <span><span className="muted">Auto-detect source language</span></span>
                  {value === 'Auto-detect' && <Check size={15} aria-hidden />}
                </button>
              )}
              {!query && !custom && <div className="lang-group">Popular</div>}
              {query && (
                <div className="lang-group">
                  {filtered.length} result{filtered.length === 1 ? '' : 's'}
                </div>
              )}
              {filtered.map((l) => (
                <button
                  key={l.name}
                  type="button"
                  role="option"
                  aria-selected={l.name === value}
                  className={`lang-option${l.name === value ? ' selected' : ''}`}
                  onClick={() => {
                    onChange(l.name);
                    setOpen(false);
                  }}
                >
                  <span>
                    <span className="lang-native">{l.native}</span>
                    <span className="muted"> — {l.name}</span>
                  </span>
                  {l.name === value && <Check size={15} aria-hidden />}
                </button>
              ))}
              {filtered.length === 0 && !custom && (
                <div className="lang-empty">No match. Try another spelling.</div>
              )}
              {!custom ? (
                <button
                  type="button"
                  className="lang-option lang-other"
                  onClick={() => setCustom(true)}
                >
                  <span>
                    <PenLine size={14} aria-hidden />{' '}
                    <span>Other language…</span>
                  </span>
                </button>
              ) : (
                <div className="lang-custom">
                  <input
                    autoFocus
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitCustom();
                    }}
                    placeholder="Type any language…"
                    aria-label="Type any language name"
                    maxLength={60}
                  />
                  <button type="button" className="primary-small" onClick={submitCustom}>
                    Use
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
