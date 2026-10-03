/**
 * Safe normalization for extracted text. Cleans up line endings and
 * extraction artifacts only — never rewrites sentences, paraphrases,
 * fixes meaning, answers questions, or translates.
 */
export function normalizeExtractedText(text: string): string {
  return (
    text
      // Normalize line endings.
      .replace(/\r\n?/g, '\n')
      // Collapse 3+ blank lines into one paragraph break.
      .replace(/\n{3,}/g, '\n\n')
      // Collapse runs of spaces/tabs (keep newlines intact).
      .replace(/[ \t\u00a0]{2,}/g, ' ')
      // Trim trailing spaces on each line.
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim()
  );
}
