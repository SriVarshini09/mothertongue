import type { Sensitivity, StructuralFlags } from '../types';

/**
 * Deterministic supporting signals. These do NOT pretend to understand
 * every language — pronoun-direction heuristics cover Telugu/Tamil/Hindi
 * (validated against prior regressions); everything else returns null
 * and defers to the LLM judge.
 */

const NEGATION_RE = /\b(not|never|no\b|n't|cannot|can't|don't|doesn't|didn't|won't|wouldn't|shouldn't)\b|^do not\b|^don't\b/i;
const PRONOUN_RE = /\b(i|me|my|mine|you|your|yours|we|us|our|he|him|his|she|her|hers|they|them|their)\b/i;
const IMPERATIVE_RE = /^(please|do|don't|do not|tell|write|explain|calculate|open|ignore|give|show|send|bring|wait|let's|let us|are you|can you|could you|will you|would you)/i;

export function analyzeSensitivity(source: string, category: string): Sensitivity {
  return {
    negation: NEGATION_RE.test(source) || category === 'negation',
    question:
      source.trimEnd().endsWith('?') ||
      category === 'question' ||
      category === 'academic-question',
    pronoun: PRONOUN_RE.test(source) || category === 'pronoun' || category === 'roles' || category === 'possession',
    imperative:
      IMPERATIVE_RE.test(source.trim()) ||
      category === 'instruction' ||
      category === 'request',
    adversarial: category === 'adversarial',
  };
}

// Recipient-direction markers, validated in prior Telugu/Tamil/Hindi regressions.
const ROLE_MARKERS: Record<string, { me: RegExp[]; you: RegExp[] }> = {
  Telugu: { me: [/నాకు|నన్ను/], you: [/నీకు|మీకు/] },
  Tamil: { me: [/எனக்கு|என்னை/], you: [/உனக்கு|உன்னை/] },
  Hindi: { me: [/मुझे|मुझको/], you: [/तुम्हें|तुमको|आपको/] },
};

const RECIPIENT_ME_SOURCE = /(teach|give|tell|show|send|bring)\s+(me\b|him\b|her\b|us\b|them\b)|to\s+(me|my\s+\w+|him|her|us|them)\b|about\s+me\b/i;
const RECIPIENT_YOU_SOURCE = /(teach|give|tell|show|send|bring)\s+you\b|to\s+you\b|about\s+you\b|your\s+(book|charger|sister|mother|exam)/i;

export function pronounDirectionOk(
  source: string,
  translation: string,
  targetLanguage: string
): boolean | null {
  const markers = ROLE_MARKERS[targetLanguage];
  if (!markers) return null;
  const srcMe = RECIPIENT_ME_SOURCE.test(source);
  const srcYou = RECIPIENT_YOU_SOURCE.test(source);
  if (!srcMe && !srcYou) return null;
  const hasMe = markers.me.some((re) => re.test(translation));
  const hasYou = markers.you.some((re) => re.test(translation));
  // Violation only when the WRONG dative appears without the right one.
  if (srcMe && !srcYou && hasYou && !hasMe) return false;
  if (srcYou && !srcMe && hasMe && !hasYou) return false;
  return true;
}

const ANSWER_PATTERNS = [
  /sorry/i, /\bi cannot\b/i, /can't\b/i, /\bas an ai\b/i, /\bi can help\b/i,
  /\bparis\b/i, /new delhi/i,
];

export function answerPatternFound(source: string, translation: string): boolean {
  if (ANSWER_PATTERNS.some((re) => re.test(translation))) return true;
  if (/2\s*\+\s*2/.test(source) && translation.trim() === '4') return true;
  return false;
}

export function structuralFlags(
  source: string,
  translation: string,
  targetLanguage: string,
  category: string
): StructuralFlags {
  const s = source.trim();
  return {
    negationSensitive: NEGATION_RE.test(s) || category === 'negation',
    questionSensitive:
      s.endsWith('?') || category === 'question' || category === 'academic-question',
    pronounSensitive:
      PRONOUN_RE.test(s) || category === 'pronoun' || category === 'roles' || category === 'possession',
    pronounDirectionOk: translation
      ? pronounDirectionOk(s, translation, targetLanguage)
      : null,
    answerPatternFound: translation ? answerPatternFound(s, translation) : false,
    emptyOutput: !translation || !translation.trim(),
  };
}
