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
export interface Step { id: string; text: string; sign: string; afterHours: number; status: StepStatus; at?: number; /** Code-owned: how many replies the chat had when it happened. */ atReply?: number; /** Marked by a quick check; the next check-up confirms or corrects it. */ quick?: true }
export interface Thread {
  id: string; title: string; speed: Speed; why: string; hint: string; people: string[];
  status: 'open' | 'paused' | 'closed'; closedReason: string; ifFollowed: string; ifIgnored: string;
  steps: Step[]; startAt?: number; /** Code-owned: how many replies the chat had when the thread began. */ startReply?: number;
}
export interface Person { id: string; name: string; aliases: string[]; role: string; wants: string; doing: string; hint: string; met: boolean; status: 'active' | 'gone' }
export interface Beat { id: string; text: string; purpose: string; conditions: string; thread: string; intensity: 'low' | 'high'; status: 'possible' | 'happened' | 'dropped'; quick?: true }
export interface Story { question: string; stakes: string; direction: string; hiddenTruth: string[]; twist: string }
/**
 * The shape of the current arc. Conflict: setup, rising action, climax,
 * resolution. Kishōtenketsu: introduction (ki), development (shō), a turn
 * that casts what came before in a new light (ten), and bringing it together
 * (ketsu); no conflict is needed. The model picks the shape per arc.
 */
export type Shape = 'conflict' | 'kishotenketsu';
export const STAGES: Record<Shape, readonly string[]> = { conflict: ['setup', 'rising', 'climax', 'resolution'], kishotenketsu: ['ki', 'sho', 'ten', 'ketsu'] };
export interface Arc { shape: Shape; stage: string; /** Kishōtenketsu: what the turn is. Secret; the narrator learns it only at the turn. */ turn: string }
/**
 * A breadcrumb: an ordinary-looking detail mentioned in passing now and paid
 * off later. The narrator sees only the detail when planting it; what it
 * means (the payoff) is shown only when it is time to pay it off.
 */
export interface Seed {
  id: string; detail: string; payoff: string; /** A thread id, a beat id, "turn", or empty. */ pays: string;
  /** echo: its story played out offscreen, and the player may hear of it in passing (the detail says how). */
  status: 'waiting' | 'planted' | 'paid' | 'echo' | 'dropped';
  /** Code-owned reply counts. */ plantedAt?: number; paidAt?: number; echoAt?: number;
  quick?: true;
}
export interface Notebook {
  version: 1; story: Story; arc: Arc; people: Person[]; threads: Thread[]; beats: Beat[]; seeds: Seed[];
  events: string[]; clock: StoryClock; rhythm: Rhythm; summary: string;
}
export interface Preferences { tone: 'light' | 'balanced' | 'dark'; twist: boolean }
export const LIMITS = Object.freeze({ people: 24, threads: 12, steps: 6, beats: 16, seeds: 12, events: 40, truths: 12, text: 600, short: 160 });

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000_000 ? v : undefined;

/**
 * When something happens is measured two ways: story hours, and replies.
 * Story time says what is plausible (a search party can't arrive in five
 * minutes). Replies say when the story should move: in a roleplay one story
 * day can be a hundred replies, and a thread must not sit silent that long.
 * A step is due when either has passed. `waits` is the most replies a step
 * waits, by the thread's speed.
 */
export type Waits = Record<Speed, number>;
export interface Moment { hours: number; reply?: number; waits?: Waits }
const moment = (now: number | Moment): Moment => typeof now === 'number' ? { hours: now } : now;
export type WaitSetting = 'short' | 'medium' | 'long';
export const WAITS: Record<WaitSetting, Waits> = {
  short: { urgent: 2, steady: 8, slow: 20 },
  medium: { urgent: 4, steady: 15, slow: 40 },
  long: { urgent: 6, steady: 30, slow: 80 },
};
/** Fast pace halves the waits. Quiet keeps them; it holds slower developments back in the note instead. */
export function waitsFor(setting: WaitSetting, pace: Pace): Waits {
  const base = WAITS[setting] ?? WAITS.medium, f = pace === 'fast' ? 0.5 : 1;
  return { urgent: Math.max(1, Math.ceil(base.urgent * f)), steady: Math.max(1, Math.ceil(base.steady * f)), slow: Math.max(1, Math.ceil(base.slow * f)) };
}
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
        status: choice(s.status, ['waiting', 'shown', 'offscreen', 'skipped'] as const, `${p}.status`, 'waiting'), ...(typeof at === 'number' && Number.isFinite(at) ? { at } : {}), ...(count(s.atReply) !== undefined ? { atReply: count(s.atReply) } : {}), ...(s.quick === true ? { quick: true as const } : {}) };
    }), `${path}.steps`);
    const peopleIds = list(t.people, `${path}.people`, 8).map((x, j) => id(x, `${path}.people[${j}]`)).filter(x => personIds.has(x));
    return {
      id: id(t.id, `${path}.id`), title: text(t.title, `${path}.title`, LIMITS.short, false), speed: choice(t.speed, ['urgent', 'steady', 'slow'] as const, `${path}.speed`),
      why: text(t.why, `${path}.why`), hint: text(t.hint, `${path}.hint`), people: [...new Set(peopleIds)],
      status: choice(t.status, ['open', 'paused', 'closed'] as const, `${path}.status`, 'open'), closedReason: text(t.closedReason, `${path}.closedReason`, LIMITS.short),
      ifFollowed: text(t.ifFollowed, `${path}.ifFollowed`), ifIgnored: text(t.ifIgnored, `${path}.ifIgnored`), steps,
      ...(typeof t.startAt === 'number' && Number.isFinite(t.startAt) ? { startAt: t.startAt } : {}),
      ...(count(t.startReply) !== undefined ? { startReply: count(t.startReply) } : {}),
    };
  }), 'threads');
  const threadIds = new Set(threads.map(t => t.id));
  const beats = unique(list(input.beats, 'beats', LIMITS.beats).map((item, i): Beat => {
    const b = record(item), path = `beats[${i}]`, thread = typeof b.thread === 'string' && threadIds.has(b.thread) ? b.thread : '';
    return { id: id(b.id, `${path}.id`), text: text(b.text, `${path}.text`, LIMITS.text, false), purpose: text(b.purpose, `${path}.purpose`), conditions: text(b.conditions, `${path}.conditions`),
      thread, intensity: choice(b.intensity, ['low', 'high'] as const, `${path}.intensity`, 'low'), status: choice(b.status, ['possible', 'happened', 'dropped'] as const, `${path}.status`, 'possible'), ...(b.quick === true ? { quick: true as const } : {}) };
  }), 'beats');
  const arcInput = record(input.arc), shape = choice(arcInput.shape, ['conflict', 'kishotenketsu'] as const, 'arc.shape', 'conflict');
  const stage = arcInput.stage === undefined ? STAGES[shape][0] : arcInput.stage;
  if (!STAGES[shape].includes(stage as string)) fail(`arc.stage must be one of: ${STAGES[shape].join(', ')}.`);
  const linkable = new Set([...threadIds, ...beats.map(b => b.id), 'turn']);
  const seeds = unique(list(input.seeds, 'seeds', LIMITS.seeds).map((item, i): Seed => {
    const s = record(item), path = `seeds[${i}]`, pays = typeof s.pays === 'string' && linkable.has(s.pays) ? s.pays : '';
    return { id: id(s.id, `${path}.id`), detail: text(s.detail, `${path}.detail`, LIMITS.short, false), payoff: text(s.payoff, `${path}.payoff`), pays,
      status: choice(s.status, ['waiting', 'planted', 'paid', 'echo', 'dropped'] as const, `${path}.status`, 'waiting'),
      ...(count(s.plantedAt) !== undefined ? { plantedAt: count(s.plantedAt) } : {}), ...(count(s.paidAt) !== undefined ? { paidAt: count(s.paidAt) } : {}), ...(count(s.echoAt) !== undefined ? { echoAt: count(s.echoAt) } : {}), ...(s.quick === true ? { quick: true as const } : {}) };
  }), 'seeds');
  return {
    version: 1,
    arc: { shape, stage: stage as string, turn: text(arcInput.turn, 'arc.turn') },
    seeds,
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
export function mergeRevision(previous: Notebook, revised: Notebook, now: number | Moment): Notebook {
  for (const person of previous.people) if (!revised.people.some(p => p.id === person.id)) failMerge(`Keep ${person.name} in the notebook (mark them gone if they have left the story).`);
  for (const thread of previous.threads) {
    const next = revised.threads.find(t => t.id === thread.id);
    if (!next) failMerge(`Keep the thread "${thread.title}" (close it with a reason if it is finished).`);
    if (next!.status === 'closed' && !next!.closedReason) failMerge(`Say why the thread "${thread.title}" closed.`);
    for (const step of thread.steps) {
      const after = next!.steps.find(s => s.id === step.id);
      if (!after) failMerge(`Keep step "${step.id}" of "${thread.title}".`);
      if ((step.status === 'shown' || step.status === 'offscreen') && after!.status === 'waiting' && !step.quick) failMerge(`Step "${step.id}" of "${thread.title}" already happened and can't go back to waiting.`);
    }
  }
  for (const beat of previous.beats) if (beat.status === 'happened' && !beat.quick && revised.beats.find(b => b.id === beat.id)?.status !== 'happened') failMerge(`Beat "${beat.id}" already happened. Keep it marked as happened.`);
  for (const seed of previous.seeds) {
    const next = revised.seeds.find(s => s.id === seed.id);
    if (!next) failMerge(`Keep seed "${seed.id}" (mark it dropped if it no longer fits).`);
    if (seed.status !== 'waiting' && next!.status === 'waiting' && !seed.quick) failMerge(`Seed "${seed.id}" was already planted and can't go back to waiting.`);
  }
  const fresh = withoutTimes(holdTurn(previous, revised));
  return stamp({ ...fresh, seeds: carrySeedTimes(previous, fresh.seeds), threads: fresh.threads.map(thread => {
    const old = previous.threads.find(t => t.id === thread.id);
    return { ...thread, ...(old?.startAt !== undefined ? { startAt: old.startAt } : {}), ...(old?.startReply !== undefined ? { startReply: old.startReply } : {}), steps: thread.steps.map(step => {
      const before = old?.steps.find(s => s.id === step.id);
      if (step.status === 'waiting') return step;
      return { ...step, ...(before?.at !== undefined ? { at: before.at } : {}), ...(before?.atReply !== undefined ? { atReply: before.atReply } : {}) };
    }) };
  }) }, now);
}
/** For edits made by the player: anything may change, but recorded times stay with their ids. */
export function keepTimes(previous: Notebook, edited: Notebook, now: number | Moment): Notebook {
  const fresh = withoutTimes(edited);
  return stamp({ ...fresh, seeds: carrySeedTimes(previous, fresh.seeds), threads: fresh.threads.map(thread => {
    const old = previous.threads.find(t => t.id === thread.id);
    return { ...thread, ...(old?.startAt !== undefined ? { startAt: old.startAt } : {}), ...(old?.startReply !== undefined ? { startReply: old.startReply } : {}), steps: thread.steps.map(step => {
      const before = old?.steps.find(s => s.id === step.id);
      return step.status === 'waiting' ? step : { ...step, ...(before?.at !== undefined ? { at: before.at } : {}), ...(before?.atReply !== undefined ? { atReply: before.atReply } : {}) };
    }) };
  }) }, now);
}
/** Drop any times a model wrote. Only code records when things began or happened. */
export function withoutTimes(notebook: Notebook): Notebook {
  // Quick-check flags go too: a check-up or an edit has the final say.
  return { ...notebook, seeds: notebook.seeds.map(({ plantedAt: _p, paidAt: _q, echoAt: _e, quick: _k, ...seed }) => seed), beats: notebook.beats.map(({ quick: _k, ...beat }) => beat),
    threads: notebook.threads.map(({ startAt: _start, startReply: _reply, ...thread }) => ({ ...thread, steps: thread.steps.map(({ at: _at, atReply: _atReply, quick: _k, ...step }) => step) })) };
}
/** Fill in code-owned times: when a thread began, when a step happened. */
export function stamp(notebook: Notebook, now: number | Moment): Notebook {
  const m = moment(now), reply = m.reply;
  const seeds = reply === undefined ? notebook.seeds : notebook.seeds.map(seed => ({ ...seed,
    ...((seed.status === 'planted' || seed.status === 'paid') && seed.plantedAt === undefined ? { plantedAt: reply } : {}), ...(seed.status === 'paid' && seed.paidAt === undefined ? { paidAt: reply } : {}),
    ...(seed.status === 'echo' && seed.echoAt === undefined ? { echoAt: reply } : {}) }));
  return { ...notebook, seeds, threads: notebook.threads.map(thread => ({ ...thread, startAt: thread.startAt ?? m.hours,
    ...(thread.startReply === undefined && reply !== undefined ? { startReply: reply } : {}),
    steps: thread.steps.map(step => step.status === 'waiting' ? step : { ...step, at: step.at ?? m.hours, ...(step.atReply === undefined && reply !== undefined ? { atReply: reply } : {}) }) })) };
}
/** Older notebooks have no reply counts: count from the reply the version was made at. */
export function fillReplies(notebook: Notebook, reply: number): Notebook {
  return { ...notebook, seeds: notebook.seeds.map(seed => (seed.status === 'planted' || seed.status === 'paid') && seed.plantedAt === undefined ? { ...seed, plantedAt: reply } : seed.status === 'echo' && seed.echoAt === undefined ? { ...seed, echoAt: reply } : seed), threads: notebook.threads.map(thread => ({ ...thread, startReply: thread.startReply ?? reply,
    steps: thread.steps.map(step => step.status === 'waiting' || step.atReply !== undefined ? step : { ...step, atReply: reply }) })) };
}

/** Seeds keep the reply counts code recorded for them. */
function carrySeedTimes(previous: Notebook, seeds: Seed[]): Seed[] {
  return seeds.map(seed => {
    const old = previous.seeds.find(s => s.id === seed.id);
    // A corrected quick mark drops the time it recorded.
    if (old?.quick && seed.status === 'waiting') return seed;
    return { ...seed, ...(old?.plantedAt !== undefined && seed.status !== 'waiting' ? { plantedAt: old.plantedAt } : {}), ...(old?.paidAt !== undefined && seed.status === 'paid' ? { paidAt: old.paidAt } : {}), ...(old?.echoAt !== undefined && seed.status !== 'waiting' ? { echoAt: old.echoAt } : {}) };
  });
}
/**
 * The turn waits for its breadcrumbs: a kishōtenketsu arc can't move to its
 * turn until the seeds that prepare it have been planted (two, or all of
 * them if there are fewer). Otherwise it stays where it was.
 */
export function holdTurn(previous: Notebook, revised: Notebook): Notebook {
  if (revised.arc.shape !== 'kishotenketsu' || revised.arc.stage !== 'ten' || (previous.arc.shape === 'kishotenketsu' && previous.arc.stage === 'ten')) return revised;
  const prepared = revised.seeds.filter(s => s.pays === 'turn' && s.status !== 'dropped');
  const planted = prepared.filter(s => s.status === 'planted' || s.status === 'paid').length;
  if (planted >= Math.min(2, prepared.length)) return revised;
  return { ...revised, arc: { ...revised.arc, stage: previous.arc.shape === 'kishotenketsu' ? previous.arc.stage : 'sho' } };
}

/** The next step of a thread, and whether enough story time, or enough replies, have passed for it. */
export function nextStep(thread: Thread, now: number | Moment): { step: Step; due: boolean } | null {
  if (thread.status !== 'open') return null;
  const index = thread.steps.findIndex(step => step.status === 'waiting');
  if (index < 0) return null;
  const m = moment(now), earlier = thread.steps.slice(0, index).reverse();
  // Nothing starts in the future. A clock that turned out earlier than first guessed
  // (the notebook assumed noon, then the tracker said 11:20) counts from now.
  const base = Math.min(earlier.find(step => step.at !== undefined)?.at ?? thread.startAt ?? m.hours, m.hours);
  const step = thread.steps[index];
  const byTime = m.hours >= base + step.afterHours;
  const fromReply = earlier.find(step => step.atReply !== undefined)?.atReply ?? thread.startReply;
  const byReplies = m.reply !== undefined && m.waits !== undefined && fromReply !== undefined && m.reply - fromReply >= m.waits[thread.speed];
  return { step, due: byTime || byReplies };
}
export function dueThreads(notebook: Notebook, now: number | Moment): Array<{ thread: Thread; step: Step }> {
  return notebook.threads.flatMap(thread => { const next = nextStep(thread, now); return next?.due ? [{ thread, step: next.step }] : []; });
}
export const nowOf = (notebook: Notebook) => absoluteHours(notebook.clock);
