/** Shared benchmark types. Benchmark code never touches UI components. */

export type BenchmarkCase = {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  source: string;
  category: string;
  criticalFacts?: Record<string, string>;
};

export type Sensitivity = {
  negation: boolean;
  question: boolean;
  pronoun: boolean;
  imperative: boolean;
  adversarial: boolean;
};

export type TranslationOutcome =
  | { status: 'ok'; translation: string; latencyMs: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; errorCategory: string; detail: string };

export type JudgeScore = {
  fidelity: number;
  semanticRoles: number;
  negation: number;
  tenseModality: number;
  naturalness: number;
  conversationalQuality: number;
  answeredInsteadOfTranslated: boolean;
  criticalError: boolean;
  notes: string;
};

export type CaseResult = {
  caseId: string;
  targetLanguage: string;
  category: string;
  source: string;
  sensitivity: Sensitivity;
  outputs: Record<string, string>; // adapterId -> translation (blinded at judge time)
  failures: Record<string, string>; // adapterId -> error/skipped reason
  latencies: Record<string, number>;
  judge: Record<string, JudgeScore | null>; // adapterId -> score (keyed back after blinding)
  structural: Record<string, StructuralFlags>;
  composite: Record<string, number | null>;
};

export type StructuralFlags = {
  negationSensitive: boolean;
  questionSensitive: boolean;
  pronounSensitive: boolean;
  pronounDirectionOk: boolean | null; // null = cannot determine for this language
  answerPatternFound: boolean;
  emptyOutput: boolean;
};

export type AdapterSummary = {
  id: string;
  label: string;
  available: boolean;
  unavailableReason?: string;
  cases: number;
  ok: number;
  failed: number;
  skipped: number;
  avgComposite: number | null;
  criticalErrors: number;
  answeredInstead: number;
  pronounRoleErrors: number;
  avgNaturalness: number | null;
  avgConversational: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  avgMs: number | null;
  estCostUsd: number;
  estInputTokens: number;
  estOutputTokens: number;
};

export type BenchmarkReport = {
  generatedAt: string;
  adapters: AdapterSummary[];
  byLanguage: Record<string, Record<string, { avgComposite: number | null; n: number }>>;
  byCategory: Record<string, Record<string, { avgComposite: number | null; n: number }>>;
  routingSimulation: string[];
  cases: CaseResult[];
};
