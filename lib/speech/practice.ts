/** Split translated text into short, repeatable lines for voice practice. */
export function splitPracticeLines(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu) ?? [normalized];
  const lines: string[] = [];
  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (clean.length <= 180) {
      lines.push(clean);
      continue;
    }
    const words = clean.split(' ');
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && next.length > 180) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
