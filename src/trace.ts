import { ModelError, type Ask } from './model';

/**
 * How long Grimoire's model requests take, so slowness can be measured instead of guessed at.
 *
 * Recorded per job: each request's step, how long it took, how much came back, the token counts the provider
 * reported (if it did), whether the answer was sent back for a second try and why, and failures by their fixed
 * category. Never any text from the prompt or the answer: only sizes, times, and Grimoire's own wording.
 */
export interface RequestTrace {
  step: string; ms: number; ok: boolean; error?: string; chars?: number;
  tokens?: { input?: number; output?: number; thinking?: number }; model?: string;
  /** Grimoire sent this answer back, and why (in Grimoire's spoiler-free words). */ sentBack?: string;
  /** The main connection declined, and the backup answered. */ backup?: true;
}
export interface JobTrace {
  kind: string; label: string; startedAt: number; ms: number; status: string; requests: RequestTrace[];
  /** Only while the job runs: the request still waiting for its answer. */ waiting?: { step: string; since: number };
}
export const TRACES_KEPT = 6;

export interface Usage { model?: string; input?: number; output?: number; thinking?: number }

export class Trace {
  step: string;
  readonly requests: RequestTrace[] = [];
  private usage: Usage | null = null;
  /** The request still waiting for its answer, if any. */
  private current: { step: string; since: number } | null = null;
  constructor(readonly kind: string, readonly label: string, readonly startedAt = Date.now(), private readonly onChange: () => void = () => {}) { this.step = label; }
  /** Called by the request itself with what the provider reported. */
  meter = (usage: Usage) => { this.usage = usage; };
  /** Mark the newest request as sent back, with Grimoire's reason. */
  sentBack = (reason: string) => { const last = this.requests.at(-1); if (last) last.sentBack = reason.slice(0, 200); };
  private nextBackup = false;
  /** The main connection declined: the next request is the backup's. */
  backup = () => { this.nextBackup = true; };
  /** Wrap an ask so every request it makes is timed and recorded. */
  wrap(ask: Ask): Ask {
    return async (messages, signal) => {
      const started = Date.now(); this.usage = null;
      this.current = { step: this.step.slice(0, 80), since: started }; this.onChange();
      try {
        const reply = await ask(messages, signal);
        this.requests.push(this.entry(started, true, { chars: reply.length }));
        return reply;
      } catch (error) {
        this.requests.push(this.entry(started, false, { error: error instanceof ModelError ? error.code : 'ERROR' }));
        throw error;
      } finally { this.current = null; this.onChange(); }
    };
  }
  private entry(started: number, ok: boolean, extra: Partial<RequestTrace>): RequestTrace {
    const u = this.usage, tokens = u && (u.input !== undefined || u.output !== undefined || u.thinking !== undefined) ? { ...(u.input !== undefined ? { input: u.input } : {}), ...(u.output !== undefined ? { output: u.output } : {}), ...(u.thinking !== undefined ? { thinking: u.thinking } : {}) } : undefined;
    const backup = this.nextBackup; this.nextBackup = false;
    return { step: this.step.slice(0, 80), ms: Date.now() - started, ok, ...extra, ...(backup ? { backup: true as const } : {}), ...(tokens ? { tokens } : {}), ...(u?.model ? { model: u.model.slice(0, 80) } : {}) };
  }
  done(status: string): JobTrace {
    return { kind: this.kind, label: this.label, startedAt: this.startedAt, ms: Date.now() - this.startedAt, status, requests: this.requests.slice(0, 20) };
  }
  /** The record so far, for showing while the job runs. */
  live(): JobTrace {
    return { ...this.done('running'), requests: this.requests.map(r => ({ ...r })), ...(this.current ? { waiting: { ...this.current } } : {}) };
  }
}

/** The usage block providers return, read loosely: only numbers are kept. */
export function readUsage(value: unknown): Omit<Usage, 'model'> {
  const u = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
  const details = (u.completion_tokens_details ?? u.output_tokens_details) as Record<string, unknown> | undefined;
  return { input: num(u.prompt_tokens ?? u.input_tokens), output: num(u.completion_tokens ?? u.output_tokens), thinking: num(details?.reasoning_tokens ?? u.reasoning_tokens) };
}
