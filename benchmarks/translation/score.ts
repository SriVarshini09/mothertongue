import type { JudgeScore, StructuralFlags } from './types';

/**
 * Weighted composite out of 100.
 * Fidelity 30 / roles 20 / naturalness 15 / conversational 15 /
 * negation 5 / tense-modality 5 / question-request preservation 5 /
 * answer-vs-translate safety 5. Critical errors penalized hard.
 */

const WEIGHTS = {
  fidelity: 0.3,
  semanticRoles: 0.2,
  naturalness: 0.15,
  conversationalQuality: 0.15,
  negation: 0.05,
  tenseModality: 0.05,
  structure: 0.05,
  safety: 0.05,
};

function structureScore(
  structural: StructuralFlags,
  translation: string
): number {
  // Supporting heuristic for the question/request-preservation dimension:
  // a question source should still read as a question. MT output in these
  // languages overwhelmingly preserves the ASCII question mark; its absence
  // is a real (if imperfect) signal. Non-question cases score neutral.
  if (!structural.questionSensitive) return 5;
  return /[?？]\s*$/.test(translation.trim()) ? 5 : 2;
}

export function compositeScore(
  judge: JudgeScore | null,
  structural: StructuralFlags,
  translation: string
): number | null {
  if (!judge) return null;
  if (structural.emptyOutput) return 0;
  const safety = judge.answeredInsteadOfTranslated || structural.answerPatternFound ? 1 : 5;
  const struct = structureScore(structural, translation);
  const weighted =
    judge.fidelity * WEIGHTS.fidelity +
    judge.semanticRoles * WEIGHTS.semanticRoles +
    judge.naturalness * WEIGHTS.naturalness +
    judge.conversationalQuality * WEIGHTS.conversationalQuality +
    judge.negation * WEIGHTS.negation +
    judge.tenseModality * WEIGHTS.tenseModality +
    struct * WEIGHTS.structure +
    safety * WEIGHTS.safety;
  let score = ((weighted - 1) / 4) * 100;
  if (judge.criticalError) score -= 20;
  if (judge.answeredInsteadOfTranslated || structural.answerPatternFound) score -= 30;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export function pronounRoleError(judge: JudgeScore | null, structural: StructuralFlags): boolean {
  if (structural.pronounDirectionOk === false) return true;
  if (judge && judge.semanticRoles <= 2) return true;
  return false;
}
