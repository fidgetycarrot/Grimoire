import { absoluteHours, type StoryClock } from './clock';

/**
 * The notebook: the story behind the chat. Written by a model, checked here.
 *
 * Model-written text is limited and plain. Timestamps (when a thread began,
 * when a step happened) belong to code, so a model can't rewrite history.
 */
export type Speed = 'urgent' | 'steady' | 'slow';
export type StepStatus = 'waiting' | 'shown' | 'offscreen' | 'skipped';
export type Rhythm = 'calm' | 'rising' | 'peak' | 'aftermath' | 'stalled';
export type Pace = 'auto' | 'quiet' | 'fast';
export interface Step { id: string; text: string; sign: string; afterHours: number; status: StepStatus; at?: number }
export interface Thread {
  id: string; title: string; speed: Speed; why: string; hint: string; people: string[];
  status: 'open' | 'paused' | 'closed'; closedReason: string; ifFollowed: string; ifIgnored: string;
  steps: Step[]; startAt?: number;
}
export interface Person { id: string; name: string; aliases: string[]; role: string; wants: string; doing: string; hint: string; met: boolean; status: 'active' | 'gone' }
export interface Beat { id: string; text: string; purpose: string; conditions: string; thread: string; intensity: 'low' | 'high'; status: 'possible' | 'happened' | 'dropped' }
export interface Story { question: string; stakes: string; direction: string; hiddenTruth: string[]; twist: string }
export interface Notebook {
  version: 1; story: Story; people: Person[]; threads: Thread[]; beats: Beat[];
  events: string[]; clock: StoryClock; rhythm: Rhythm; summary: string;
}
export interface Preferences { length: 'short' | 'medium' | 'long'; tone: 'light' | 'balanced' | 'dark'; twist: boolean }
export const LIMITS = Object.freeze({ people: 24, threads: 12, steps: 6, beats: 16, events: 40, truths: 12, text: 600, short: 160 });

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
/**
 * A notebook that failed the checks. `message` goes back to the model so it can
 * fix its reply; `safe` is shown in the panel and never names people or threads.
 */
export class NotebookError extends Error {
  readonly safe: string;
  constructor(message: string, safe?: string) { super(message); this.name = 'NotebookError'; this.safe = safe ?? message; }
}
// Validation messages name only field paths and limits, so they are safe to show.
const fail = (message: string): never => { throw new NotebookError(message); };
const failMerge = (message: string): never => { throw new NotebookError(message, 'A check-up tried to remove or undo part of the notebook.'); };

/** Plain text only: no prompt templates, no markup, no control characters. */
export function text(value: unknown, path: string, max: number = LIMITS.text, allowEmpty = true): string {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail(`${path} must be text.`);
  const result = (value as string).replace(/\s+/g, ' ').trim();
  if (!allowEmpty && !result) fail(`${path} is required.`);
  if (result.length > max) fail(`${path} is longer than ${max} characters. Keep it shorter.`);
  if (/\{\{|\}\}|<%|%>/.test(result)) fail(`${path} contains template markers. Use plain words.`);
  if (/<\s*\/?\s*[a-z][a-z0-9:-]*(?:\s[^>]*|\/?)>/i.test(result)) fail(`${path} contains HTML. Use plain words.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) fail(`${path} contains control characters.`);
  return result;
}
function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !ID.test(value)) fail(`${path} must be a short id of lowercase letters, numbers, and hyphens.`);
  return value as string;
}
function list(value: unknown, path: string, max: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${path} must be a list.`);
  if ((value as unknown[]).length > max) fail(`${path} has more than ${max} items. Merge or close some.`);
  return value as unknown[];
}
function choice<T extends string>(value: unknown, options: readonly T[], path: string, fallback?: T): T {
  if (value === undefined && fallback) return fallback;
  if (!options.includes(value as T)) fail(`${path} must be one of: ${options.join(', ')}.`);
  return value as T;
}
function unique<T extends { id: string }>(items: T[], path: string): T[] {
  if (new Set(items.map(item => item.id)).size !== items.length) fail(`${path} has repeated ids.`);
  return items;
}
export function clock(value: unknown, path = 'clock'): StoryClock {
  const input = record(value);
  const day = input.day;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 10_000_000) fail(`${path}.day must be a whole number.`);
  const hour = input.hour === null || input.hour === undefined ? null : input.hour;
  if (hour !== null && (typeof hour !== 'number' || hour < 0 || hour >= 24)) fail(`${path}.hour must be from 0 to 23, or null when unknown.`);
  return { day: day as number, hour: hour as number | null, label: text(input.label, `${path}.label`, LIMITS.short) };
}

/** Check a notebook as a model wrote it, or as saved. Code-owned times are kept only if they are numbers. */
export function validateNotebook(value: unknown): Notebook {
  const input = record(value), story = record(input.story);
  const people = unique(list(input.people, 'people', LIMITS.people).map((item, i): Person => {
    const p = record(item), path = `people[${i}]`;
    return {
      id: id(p.id, `${path}.id`), name: text(p.name, `${path}.name`, 80, false),
      aliases: list(p.aliases, `${path}.aliases`, 8).map((a, j) => text(a, `${path}.aliases[${j}]`, 80, false)),
      role: text(p.role, `${path}.role`, LIMITS.short), wants: text(p.wants, `${path}.wants`), doing: text(p.doing, `${path}.doing`),
      hint: text(p.hint, `${path}.hint`), met: p.met === true, status: choice(p.status, ['active', 'gone'] as const, `${path}.status`, 'active'),
    };
  }), 'people');
  const personIds = new Set(people.map(p => p.id));
  const threads = unique(list(input.threads, 'threads', LIMITS.threads).map((item, i): Thread => {
    const t = record(item), path = `threads[${i}]`;
    const steps = unique(list(t.steps, `${path}.steps`, LIMITS.steps).map((raw, j): Step => {
      const s = record(raw), at = s.at, after = s.afterHours, p = `${path}.steps[${j}]`;
      if (typeof after !== 'number' || !Number.isFinite(after) || after < 0 || after > 24 * 365) fail(`${p}.afterHours must be a number of story hours.`);
      return { id: id(s.id, `${p}.id`), text: text(s.text, `${p}.text`, LIMITS.text, false), sign: text(s.sign, `${p}.sign`), afterHours: after as number,
        status: choice(s.status, ['waiting', 'shown', 'offscreen', 'skipped'] as const, `${p}.status`, 'waiting'), ...(typeof at === 'number' && Number.isFinite(at) ? { at } : {}) };
    }), `${path}.steps`);
    const peopleIds = list(t.people, `${path}.people`, 8).map((x, j) => id(x, `${path}.people[${j}]`)).filter(x => personIds.has(x));
    return {
      id: id(t.id, `${path}.id`), title: text(t.title, `${path}.title`, LIMITS.short, false), speed: choice(t.speed, ['urgent', 'steady', 'slow'] as const, `${path}.speed`),
      why: text(t.why, `${path}.why`), hint: text(t.hint, `${path}.hint`), people: [...new Set(peopleIds)],
      status: choice(t.status, ['open', 'paused', 'closed'] as const, `${path}.status`, 'open'), closedReason: text(t.closedReason, `${path}.closedReason`, LIMITS.short),
      ifFollowed: text(t.ifFollowed, `${path}.ifFollowed`), ifIgnored: text(t.ifIgnored, `${path}.ifIgnored`), steps,
      ...(typeof t.startAt === 'number' && Number.isFinite(t.startAt) ? { startAt: t.startAt } : {}),
    };
  }), 'threads');
  const threadIds = new Set(threads.map(t => t.id));
  const beats = unique(list(input.beats, 'beats', LIMITS.beats).map((item, i): Beat => {
    const b = record(item), path = `beats[${i}]`, thread = typeof b.thread === 'string' && threadIds.has(b.thread) ? b.thread : '';
    return { id: id(b.id, `${path}.id`), text: text(b.text, `${path}.text`, LIMITS.text, false), purpose: text(b.purpose, `${path}.purpose`), conditions: text(b.conditions, `${path}.conditions`),
      thread, intensity: choice(b.intensity, ['low', 'high'] as const, `${path}.intensity`, 'low'), status: choice(b.status, ['possible', 'happened', 'dropped'] as const, `${path}.status`, 'possible') };
  }), 'beats');
  return {
    version: 1,
    story: { question: text(story.question, 'story.question', LIMITS.text, false), stakes: text(story.stakes, 'story.stakes'), direction: text(story.direction, 'story.direction'),
      hiddenTruth: list(story.hiddenTruth, 'story.hiddenTruth', LIMITS.truths).map((x, i) => text(x, `story.hiddenTruth[${i}]`, LIMITS.text, false)), twist: text(story.twist, 'story.twist') },
    people, threads, beats,
    events: list(input.events, 'events', LIMITS.events).map((x, i) => text(typeof x === 'string' ? x : record(x).text, `events[${i}]`, LIMITS.text, false)),
    clock: clock(input.clock), rhythm: choice(input.rhythm, ['calm', 'rising', 'peak', 'aftermath', 'stalled'] as const, 'rhythm', 'calm'),
    summary: text(input.summary, 'summary', LIMITS.short),
  };
}

/**
 * Apply a model's revised notebook on top of the previous one.
 *
 * Nothing disappears quietly: every person and thread must still be there
 * (they can be marked gone or closed, with a reason), and something that
 * already happened can't un-happen. Code keeps the times it recorded.
 */
export function mergeRevision(previous: Notebook, revised: Notebook, now: number): Notebook {
  for (const person of previous.people) if (!revised.people.some(p => p.id === person.id)) failMerge(`Keep ${person.name} in the notebook (mark them gone if they have left the story).`);
  for (const thread of previous.threads) {
    const next = revised.threads.find(t => t.id === thread.id);
    if (!next) failMerge(`Keep the thread "${thread.title}" (close it with a reason if it is finished).`);
    if (next!.status === 'closed' && !next!.closedReason) failMerge(`Say why the thread "${thread.title}" closed.`);
    for (const step of thread.steps) {
      const after = next!.steps.find(s => s.id === step.id);
      if (!after) failMerge(`Keep step "${step.id}" of "${thread.title}".`);
      if ((step.status === 'shown' || step.status === 'offscreen') && after!.status === 'waiting') failMerge(`Step "${step.id}" of "${thread.title}" already happened and can't go back to waiting.`);
    }
  }
  for (const beat of previous.beats) if (beat.status === 'happened' && revised.beats.find(b => b.id === beat.id)?.status !== 'happened') failMerge(`Beat "${beat.id}" already happened. Keep it marked as happened.`);
  const fresh = withoutTimes(revised);
  return stamp({ ...fresh, threads: fresh.threads.map(thread => {
    const old = previous.threads.find(t => t.id === thread.id);
    return { ...thread, ...(old?.startAt !== undefined ? { startAt: old.startAt } : {}), steps: thread.steps.map(step => {
      const before = old?.steps.find(s => s.id === step.id);
      return before?.at !== undefined ? { ...step, at: before.at } : step;
    }) };
  }) }, now);
}
/** For edits made by the player: anything may change, but recorded times stay with their ids. */
export function keepTimes(previous: Notebook, edited: Notebook, now: number): Notebook {
  const fresh = withoutTimes(edited);
  return stamp({ ...fresh, threads: fresh.threads.map(thread => {
    const old = previous.threads.find(t => t.id === thread.id);
    return { ...thread, ...(old?.startAt !== undefined ? { startAt: old.startAt } : {}), steps: thread.steps.map(step => { const at = old?.steps.find(s => s.id === step.id)?.at; return at !== undefined && step.status !== 'waiting' ? { ...step, at } : step; }) };
  }) }, now);
}
/** Drop any times a model wrote. Only code records when things began or happened. */
export function withoutTimes(notebook: Notebook): Notebook {
  return { ...notebook, threads: notebook.threads.map(({ startAt: _start, ...thread }) => ({ ...thread, steps: thread.steps.map(({ at: _at, ...step }) => step) })) };
}
/** Fill in code-owned times: when a thread began, when a step happened. */
export function stamp(notebook: Notebook, now: number): Notebook {
  return { ...notebook, threads: notebook.threads.map(thread => ({ ...thread, startAt: thread.startAt ?? now,
    steps: thread.steps.map(step => step.status !== 'waiting' && step.at === undefined ? { ...step, at: now } : step) })) };
}

/** The next step of a thread, and whether enough story time has passed for it. */
export function nextStep(thread: Thread, now: number): { step: Step; due: boolean } | null {
  if (thread.status !== 'open') return null;
  const index = thread.steps.findIndex(step => step.status === 'waiting');
  if (index < 0) return null;
  const before = thread.steps.slice(0, index).reverse().find(step => step.at !== undefined);
  // Nothing starts in the future. A clock that turned out earlier than first guessed
  // (the notebook assumed noon, then the tracker said 11:20) counts from now.
  const base = Math.min(before?.at ?? thread.startAt ?? now, now);
  const step = thread.steps[index];
  return { step, due: now >= base + step.afterHours };
}
export function dueThreads(notebook: Notebook, now: number): Array<{ thread: Thread; step: Step }> {
  return notebook.threads.flatMap(thread => { const next = nextStep(thread, now); return next?.due ? [{ thread, step: next.step }] : []; });
}
export const nowOf = (notebook: Notebook) => absoluteHours(notebook.clock);
