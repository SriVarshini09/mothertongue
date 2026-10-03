/**
 * Lightweight structured stage logging.
 * Logs metadata only (counts, durations, languages) — never student content.
 * Verbose in development; errors only in production.
 */

export type Stage =
  | 'extract.start'
  | 'extract.success'
  | 'extract.error'
  | 'translate.start'
  | 'translate.success'
  | 'translate.error'
  | 'speechStyle.start'
  | 'speechStyle.success'
  | 'tts.start'
  | 'tts.success'
  | 'tts.error';

export function logStage(
  stage: Stage,
  meta: Record<string, string | number | boolean> = {}
): void {
  if (process.env.NODE_ENV === 'production' && !stage.endsWith('.error')) return;
  const line = JSON.stringify({ stage, ...meta });
  if (stage.endsWith('.error')) console.error(line);
  else console.debug(line);
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : 'unknown';
}
