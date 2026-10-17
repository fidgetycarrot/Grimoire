import type { SpindleAPI, GenerationRequestDTO } from 'lumiverse-spindle-types';

export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type ReasoningMode = 'inherit' | 'off' | 'low';
export interface ModelSettings { connectionId: string; maxOutputTokens: number; reasoningMode: ReasoningMode }
export type Ask = (messages: Message[], signal?: AbortSignal) => Promise<string>;
// Lumiverse 1.2's raw worker API requires provider and model even with connection_id.
type RawRequest = GenerationRequestDTO & { provider: string; model: string };
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export class ModelError extends Error {
  constructor(readonly code: string, message: string) { super(`${message} (${code})`); this.name = 'ModelError'; }
}
/** Fixed categories only: provider errors can echo the prompt, so their text is never kept. */
function explain(error: unknown): ModelError {
  const value = record(error), message = typeof value.message === 'string' ? value.message : String(error ?? '');
  const status = Number(value.status ?? value.statusCode ?? /\b([45]\d\d)\b/.exec(message)?.[1]);
  if (value.name === 'TimeoutError' || /timed?\s*out|timeout/i.test(message)) return new ModelError('TIMEOUT', 'The model took too long to answer.');
  if (value.name === 'AbortError' || /abort|cancel/i.test(message)) return new ModelError('CANCELLED', 'The request was cancelled.');
  if (/refus|content[ _-]?(?:filter|policy)|safety|moderation/i.test(message)) return new ModelError('DECLINED', 'The provider declined this request.');
  if (status === 401 || /unauthori|api.?key/i.test(message)) return new ModelError('AUTHENTICATION', 'The connection could not sign in. Check it in Lumiverse.');
  if (status === 429 || status === 402 || /rate.limit|quota|credits/i.test(message)) return new ModelError('RATE_LIMIT', 'The provider reported a rate or credit limit.');
  if (/context|too.long|maximum.*token/i.test(message)) return new ModelError('CONTEXT_LIMIT', 'The request was too long for this model.');
  if (status >= 500) return new ModelError('PROVIDER_UNAVAILABLE', 'The provider had a server error. Try again later.');
  return new ModelError('REQUEST_FAILED', 'The model request failed.');
}

/** Send one raw request on the chosen connection. */
export async function askModel(api: SpindleAPI, userId: string | undefined, settings: ModelSettings, messages: Message[], signal?: AbortSignal): Promise<string> {
  if (!api.permissions.has('generation')) throw new ModelError('PERMISSION', 'Grant generation in Lumiverse’s Extensions panel.');
  const connection = await api.connections.get(settings.connectionId, userId);
  if (!connection) throw new ModelError('NO_CONNECTION', 'Choose a connection in Grimoire settings.');
  if (!connection.model?.trim() || !connection.provider?.trim()) throw new ModelError('NO_MODEL', 'The chosen connection has no model set. Pick one in Lumiverse.');
  const deadline = AbortSignal.timeout(600_000), combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const request: RawRequest = { type: 'raw', connection_id: connection.id, provider: connection.provider, model: connection.model, userId, messages, parameters: { temperature: 0.4, max_tokens: settings.maxOutputTokens }, signal: combined };
  if (settings.reasoningMode !== 'inherit') request.reasoning = settings.reasoningMode === 'off' && connection.provider !== 'openrouter' ? { source: 'off' } : { source: 'custom', apiReasoning: true, effort: settings.reasoningMode === 'off' ? 'none' : 'low' };
  let result: unknown;
  let onAbort: (() => void) | undefined;
  try {
    result = await Promise.race([api.generate.raw(request), new Promise<never>((_, reject) => { onAbort = () => reject(combined.reason); combined.addEventListener('abort', onAbort, { once: true }); if (combined.aborted) onAbort(); })]);
  } catch (error) {
    throw explain(deadline.aborted && !signal?.aborted ? new DOMException('Timed out', 'TimeoutError') : error);
  } finally { if (onAbort) combined.removeEventListener('abort', onAbort); }
  const value = record(result), finish = String(value.finish_reason ?? '').toLowerCase();
  if (value.refusal || /refusal|content_filter|safety|blocked/.test(finish)) throw new ModelError('DECLINED', 'The provider declined this request.');
  if (/length|max_tokens/.test(finish)) throw new ModelError('OUTPUT_LIMIT', 'The model ran out of room before finishing. Raise the response allowance in settings.');
  if (typeof value.content !== 'string' || !value.content.trim()) throw new ModelError('EMPTY_RESPONSE', 'The model returned nothing.');
  return value.content;
}

/** Find the JSON object in a reply, allowing a code fence or a short lead-in. */
export function parseJson(content: string): unknown {
  let text = content.trim();
  const fence = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i.exec(text);
  if (fence) text = fence[1].trim();
  if (!text.startsWith('{')) { const start = text.indexOf('{'), end = text.lastIndexOf('}'); if (start >= 0 && end > start) text = text.slice(start, end + 1); }
  try { return JSON.parse(text); }
  catch { throw new ModelError('MALFORMED_JSON', 'The model did not return valid JSON.'); }
}

/**
 * Ask for JSON and check it. A reply that is malformed or fails the check
 * gets one corrected attempt with the reason; then the step stops.
 */
export async function askJson<T>(ask: Ask, messages: Message[], check: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
  let attempt = messages;
  for (let round = 0; round < 2; round++) {
    const reply = await ask(attempt, signal);
    try { return check(parseJson(reply)); }
    catch (error) {
      if (round > 0 || error instanceof ModelError && error.code !== 'MALFORMED_JSON') throw error;
      const reason = error instanceof Error ? error.message : 'The reply did not match.';
      attempt = [...messages, { role: 'assistant', content: reply }, { role: 'user', content: `That reply could not be used: ${reason} Return the complete corrected JSON object only.` }];
    }
  }
  throw new ModelError('UNREACHABLE', 'Unexpected state.');
}
