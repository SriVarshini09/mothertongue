import OpenAI from 'openai';

/**
 * Single reusable server-side OpenAI client.
 * NEVER import this module (or the `openai` package) from client components.
 */

export class ApiKeyMissingError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured');
    this.name = 'ApiKeyMissingError';
  }
}

export function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ApiKeyMissingError();
  return new OpenAI({ apiKey: key });
}

type ServiceNoun = 'Translation' | 'Speech' | 'Image reading';

/**
 * Maps OpenAI/provider failures to distinct, user-safe messages so
 * auth and billing outages are a 10-second diagnosis instead of a
 * generic "something went wrong". Returns null for ordinary errors.
 */
export function classifyServiceError(error: unknown, service: ServiceNoun): string | null {
  if (error instanceof ApiKeyMissingError) {
    return `${service} service is not configured right now.`;
  }
  const status =
    error instanceof OpenAI.APIError
      ? error.status
      : typeof (error as { status?: unknown })?.status === 'number'
        ? ((error as { status: number }).status as number)
        : undefined;
  const code =
    typeof (error as { code?: unknown })?.code === 'string'
      ? ((error as { code: string }).code as string)
      : undefined;
  if (status === 401) {
    return `${service} service rejected its API key.`;
  }
  if (status === 429 && (code === 'insufficient_quota' || /quota|billing/i.test(code ?? ''))) {
    return `${service} quota is exhausted.`;
  }
  return null;
}
