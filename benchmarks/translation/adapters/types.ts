/** Adapter contract. Adapters isolate all provider specifics. */

export type AdapterTranslateResult = {
  translation: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type TranslationAdapter = {
  /** Stable id, e.g. 'current-gpt'. */
  id: string;
  /** Human label, only used in reports (never sent to the judge). */
  label: string;
  /** Languages this adapter can target, e.g. ['Telugu', ...]. */
  supportedLanguages: string[];
  /** False when credentials/models are missing — runner skips gracefully. */
  isAvailable(): { available: boolean; reason?: string };
  translate(source: string, targetLanguage: string): Promise<AdapterTranslateResult>;
};
