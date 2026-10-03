import type { EngineKind, EngineStage } from '../engines/capabilities';
import type { EngineMode } from '../offline/mode';
import type { ConnectivityState } from '../offline/connectivity';

/**
 * Capability router: picks cloud vs local per stage. Pure function of
 * explicit inputs (no browser access) so the matrix is unit-testable.
 *
 * - auto: cloud when online, local engines when offline.
 * - online (Best Quality): cloud only; offline connectivity is a hard error.
 * - offline: local engines only — callers must NEVER fetch on this path.
 * - unknown connectivity (e.g. SSR): attempt cloud; fetch errors surface.
 */

export type RouteDecision = { engine: EngineKind } | { blocked: string };

export const OFFLINE_CONNECTION_MESSAGE =
  'You appear to be offline. Connect to the internet, or switch Mode to Offline to use on-device options.';

export function resolveStage(input: {
  mode: EngineMode;
  connectivity: ConnectivityState;
  stage: EngineStage;
}): RouteDecision {
  const { mode, connectivity } = input;
  if (mode === 'offline') return { engine: 'local' };
  if (connectivity === 'offline') {
    if (mode === 'online') return { blocked: OFFLINE_CONNECTION_MESSAGE };
    return { engine: 'local' };
  }
  return { engine: 'cloud' };
}

/** Guard for callers: true only when a network call is permitted. */
export function mayUseNetwork(input: { mode: EngineMode; connectivity: ConnectivityState }): boolean {
  if (input.mode === 'offline') return false;
  return input.connectivity !== 'offline';
}
