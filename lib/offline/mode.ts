/** User engine mode. Persisted locally; default Auto. */

export type EngineMode = 'auto' | 'online' | 'offline';

const KEY = 'mothertongue-engine-mode';

export const MODE_DESCRIPTIONS: Record<EngineMode, { label: string; hint: string }> = {
  auto: { label: 'Auto', hint: 'Uses the best available option.' },
  online: { label: 'Best Quality', hint: 'Uses online models for the highest quality.' },
  offline: { label: 'Offline', hint: 'Uses downloaded language packs and device processing.' },
};

export function loadMode(): EngineMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'auto' || raw === 'online' || raw === 'offline') return raw;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function saveMode(mode: EngineMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
