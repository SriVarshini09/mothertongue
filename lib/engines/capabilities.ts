/** Engine capability model. Cloud and local engines share interfaces. */

export type EngineKind = 'cloud' | 'local';
export type EngineStage = 'translation' | 'extraction' | 'speech';

export class EngineUnavailableError extends Error {
  readonly stage: EngineStage;
  readonly kind: EngineKind;
  constructor(stage: EngineStage, kind: EngineKind, message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
    this.stage = stage;
    this.kind = kind;
  }
}
