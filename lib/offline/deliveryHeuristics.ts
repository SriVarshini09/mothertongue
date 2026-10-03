/**
 * Lightweight local delivery classifier — no cloud LLM needed.
 * Tunes device-speech rate only; wording is never touched.
 * Categories mirror the cloud DeliveryProfile vocabulary (subset).
 */

export type LocalDelivery = {
  contentType: 'academic' | 'question' | 'warning' | 'conversation' | 'story' | 'neutral' | 'celebration';
  rate: number;
};

const WARNING_RE = /\b(danger|dangerous|careful|warning|warn|do not|don't|never|stop|emergency|risky|poison|electric|fire)\b/i;
const CELEBRATION_RE = /congratulations|congrats|won|winner|passed|celebrat|bravo|well done|first place/i;
const QUESTION_RE = /\?\s*$/;
const STORY_RE = /once upon|story|tale|opened the|found a|slowly|waiting for him|waiting for her/i;
const ACADEMIC_RE = /photosynthesis|mitochondria|newton|machine learning|energy|cell|force|mass|acceleration|process by which|chemical|equation|theorem/i;
const DIALOGUE_RE = /["“”]/;

export function classifyDelivery(text: string): LocalDelivery {
  const t = text.trim();
  if (QUESTION_RE.test(t)) return { contentType: 'question', rate: 1 };
  if (WARNING_RE.test(t)) return { contentType: 'warning', rate: 0.9 };
  if (CELEBRATION_RE.test(t)) return { contentType: 'celebration', rate: 1.05 };
  if (STORY_RE.test(t) || (DIALOGUE_RE.test(t) && t.length > 80)) {
    return { contentType: 'story', rate: 0.95 };
  }
  if (ACADEMIC_RE.test(t) || t.length > 200) return { contentType: 'academic', rate: 0.95 };
  if (DIALOGUE_RE.test(t)) return { contentType: 'conversation', rate: 1 };
  if (/!\s*$/.test(t)) return { contentType: 'conversation', rate: 1 };
  return { contentType: 'neutral', rate: 1 };
}
