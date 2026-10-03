import type OpenAI from 'openai';
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserText,
} from '@/lib/ai/prompts/extraction';

/**
 * Image text extraction service. ONE job: reproduce visible text.
 * Never answers, translates, summarizes, or solves. Pages stay ordered.
 */
export async function extractImageTexts(openai: OpenAI, files: File[]): Promise<string[]> {
  const texts: string[] = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildExtractionUserText(index + 1) },
            {
              type: 'image_url',
              image_url: { url: `data:${file.type};base64,${base64}`, detail: 'high' },
            },
          ],
        },
      ],
    });
    texts.push(result.choices[0]?.message.content?.trim() ?? '');
  }
  return texts;
}
