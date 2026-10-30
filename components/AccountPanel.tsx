'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Check, UserRound, X } from 'lucide-react';
import { languages } from '@/lib/languages';
import {
  ACCOUNT_LANGUAGES,
  ACCOUNT_PROFILE_KEY,
  accountCopy,
  accountLanguageInfo,
  createLocalProfile,
  type AccountProfile,
} from '@/lib/account/profile';

function readProfile(): AccountProfile | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountProfile>;
    if (parsed.version !== 1 || typeof parsed.displayName !== 'string' || !parsed.displayName.trim()) return null;
    if (typeof parsed.interfaceLanguage !== 'string' || typeof parsed.preferredLanguage !== 'string') return null;
    return {
      version: 1,
      displayName: parsed.displayName.trim(),
      interfaceLanguage: parsed.interfaceLanguage,
      preferredLanguage: parsed.preferredLanguage,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export default function AccountPanel({
  currentTargetLanguage,
  onTargetLanguageChange,
}: {
  currentTargetLanguage: string;
  onTargetLanguageChange: (language: string) => void;
}) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [interfaceLanguage, setInterfaceLanguage] = useState('English');
  const [preferredLanguage, setPreferredLanguage] = useState(currentTargetLanguage);
  const [note, setNote] = useState('');
  const copy = accountCopy(interfaceLanguage);
  const languageInfo = accountLanguageInfo(interfaceLanguage);

  useEffect(() => {
    const saved = readProfile();
    if (saved) {
      setProfile(saved);
      setName(saved.displayName);
      setInterfaceLanguage(saved.interfaceLanguage);
      setPreferredLanguage(saved.preferredLanguage);
      document.documentElement.lang = accountLanguageInfo(saved.interfaceLanguage).tag;
      document.documentElement.dir = accountLanguageInfo(saved.interfaceLanguage).dir;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const openPanel = () => {
    setName(profile?.displayName ?? '');
    setInterfaceLanguage(profile?.interfaceLanguage ?? 'English');
    setPreferredLanguage(profile?.preferredLanguage ?? currentTargetLanguage);
    setNote('');
    setOpen(true);
  };

  const changeInterfaceLanguage = (value: string) => {
    setInterfaceLanguage(value);
    const info = accountLanguageInfo(value);
    document.documentElement.lang = info.tag;
    document.documentElement.dir = info.dir;
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNote(copy.nameLabel + ' is required.');
      return;
    }
    const next = createLocalProfile(name, interfaceLanguage, preferredLanguage);
    try {
      localStorage.setItem(ACCOUNT_PROFILE_KEY, JSON.stringify(next));
    } catch {
      setNote('This browser did not allow local storage. Your profile was not saved.');
      return;
    }
    setProfile(next);
    onTargetLanguageChange(preferredLanguage);
    setNote(copy.saved);
  };

  const remove = () => {
    localStorage.removeItem(ACCOUNT_PROFILE_KEY);
    setProfile(null);
    setName('');
    setNote('');
    setOpen(false);
  };

  return (
    <>
      <button className="quiet account-trigger" type="button" aria-label={profile ? `Open account for ${profile.displayName}` : copy.create} onClick={openPanel}>
        <UserRound size={18} aria-hidden />
        <span className="hide-mobile">{profile?.displayName || copy.create}</span>
      </button>
      {open && (
        <div className="account-panel" onClick={() => setOpen(false)}>
          <aside className="account-drawer" role="dialog" aria-modal="true" aria-label={copy.title} onClick={(event) => event.stopPropagation()} dir={languageInfo.dir}>
            <div className="account-head">
              <div>
                <span className="account-kicker">MotherTongue · {copy.localBadge}</span>
                <h2 className="serif">{copy.title}</h2>
              </div>
              <button className="icon-btn" type="button" aria-label={copy.close} onClick={() => setOpen(false)} autoFocus><X size={17} /></button>
            </div>
            <p className="account-privacy">{copy.privacy}</p>
            <form className="account-form" onSubmit={save}>
              <label htmlFor="account-name">{copy.nameLabel}
                <input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={copy.namePlaceholder} maxLength={80} autoComplete="nickname" />
              </label>
              <label htmlFor="account-interface-language">{copy.interfaceLabel}
                <select id="account-interface-language" value={interfaceLanguage} onChange={(event) => changeInterfaceLanguage(event.target.value)}>
                  {ACCOUNT_LANGUAGES.map((item) => <option key={item.name} value={item.name}>{item.native} · {item.name}</option>)}
                </select>
              </label>
              <label htmlFor="account-preferred-language">{copy.preferredLabel}
                <select id="account-preferred-language" value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)}>
                  {languages.map((item) => <option key={item.name} value={item.name}>{item.native} · {item.name}</option>)}
                </select>
              </label>
              <button className="primary-small account-save" type="submit"><Check size={16} aria-hidden /> {profile ? copy.save : copy.create}</button>
            </form>
            {note && <p className="account-note" role="status">{note}</p>}
            {profile && <button className="textbutton account-remove" type="button" onClick={remove}>{copy.remove}</button>}
            <p className="account-next-step">Cloud accounts, email sign-in, and cross-device sync will be added only with a secure authentication backend.</p>
          </aside>
        </div>
      )}
    </>
  );
}
