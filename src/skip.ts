import { describeDuration, type StoryClock } from './clock';
import { dueThreads, type Moment, type Notebook } from './notebook';

/**
 * Suggesting a time skip when a scene has gone quiet.
 *
 * Only a suggestion: a skip decides what the player character does with
 * those hours, so the player chooses. It appears rarely: the scene must be
 * calm or stalled, nothing may be due right now (then the narrator should
 * bring that in instead), and something must be planned to happen later, so
 * the skip lands on it. Once waved off, it stays away for a while.
 */
export interface SkipOption { hours: number; label: string }
export interface SkipOffer { options: SkipOption[] }

const MAX_HOURS = 24 * 7;

/** Replies since anything last happened: a thread began, or a step was shown or happened offscreen. */
export function quietReplies(notebook: Notebook, reply: number): number {
  let last = 0;
  for (const thread of notebook.threads) {
    if (thread.startReply !== undefined) last = Math.max(last, thread.startReply);
    for (const step of thread.steps) if (step.status !== 'waiting' && step.atReply !== undefined) last = Math.max(last, step.atReply);
  }
  return Math.max(0, reply - last);
}

/** Story hours until the next planned step comes due by story time, if any. */
export function hoursToNext(notebook: Notebook, now: number): number | null {
  let best: number | null = null;
  for (const thread of notebook.threads) {
    if (thread.status !== 'open') continue;
    const index = thread.steps.findIndex(s => s.status === 'waiting');
    if (index < 0) continue;
    const before = thread.steps.slice(0, index).reverse().find(s => s.at !== undefined)?.at ?? thread.startAt ?? now;
    const wait = Math.min(before, now) + thread.steps[index].afterHours - now;
    if (wait > 0 && (best === null || wait < best)) best = wait;
  }
  return best;
}

const about = (hours: number) => hours < 24 ? `about ${describeDuration(Math.max(1, Math.round(hours)))}` : `about ${describeDuration(Math.round(hours / 24) * 24)}`;

export function skipOffer(notebook: Notebook, moment: Moment, clock: StoryClock, dismissedAt: number): SkipOffer | null {
  const reply = moment.reply, waits = moment.waits;
  if (reply === undefined || !waits) return null;
  if (dismissedAt && reply < dismissedAt + waits.steady) return null;
  const quiet = quietReplies(notebook, reply);
  const stalled = notebook.rhythm === 'stalled' ? quiet >= 3 : notebook.rhythm === 'calm' ? quiet >= Math.ceil(waits.steady * 0.6) : false;
  if (!stalled || dueThreads(notebook, moment).length) return null;
  const next = hoursToNext(notebook, moment.hours);
  if (next === null || next < 1 || next > MAX_HOURS) return null;
  const options: SkipOption[] = [{ hours: Math.max(1, Math.ceil(next)), label: `Skip ahead to when something happens (${about(next)})` }];
  // One plain choice too, when the hour is known and it differs from the first.
  if (clock.hour !== null) {
    const toEvening = 19 - clock.hour, toMorning = 24 - clock.hour + 8;
    const plain = clock.hour < 16 ? { hours: Math.round(toEvening), label: 'Skip to this evening' } : { hours: Math.round(toMorning), label: 'Skip to tomorrow morning' };
    if (plain.hours >= 1 && Math.abs(plain.hours - options[0].hours) >= 2) options.push(plain);
  }
  return { options };
}

/** A spoiler-free picture of how the story is set up: shapes and counts, never names or text. */
export interface Glance {
  shape: Notebook['arc']['shape']; stage: string;
  threads: { open: number; urgent: number; steady: number; slow: number; closed: number };
  seeds: { waiting: number; planted: number; paid: number; echo: number };
  moments: { possible: number; big: number; happened: number };
  people: { total: number; met: number };
  /** Replies until the next planned development at the latest, if any is planned. */
  nextInReplies: number | null;
  dueNow: number;
}
export function glance(notebook: Notebook, moment: Moment): Glance {
  const open = notebook.threads.filter(t => t.status === 'open');
  let next: number | null = null;
  if (moment.reply !== undefined && moment.waits) for (const thread of open) {
    const index = thread.steps.findIndex(s => s.status === 'waiting');
    if (index < 0) continue;
    const from = thread.steps.slice(0, index).reverse().find(s => s.atReply !== undefined)?.atReply ?? thread.startReply;
    if (from === undefined) continue;
    const left = Math.max(0, from + moment.waits[thread.speed] - moment.reply);
    if (next === null || left < next) next = left;
  }
  return {
    shape: notebook.arc.shape, stage: notebook.arc.stage,
    threads: { open: open.length, urgent: open.filter(t => t.speed === 'urgent').length, steady: open.filter(t => t.speed === 'steady').length, slow: open.filter(t => t.speed === 'slow').length, closed: notebook.threads.filter(t => t.status === 'closed').length },
    seeds: { waiting: notebook.seeds.filter(s => s.status === 'waiting').length, planted: notebook.seeds.filter(s => s.status === 'planted').length, paid: notebook.seeds.filter(s => s.status === 'paid').length, echo: notebook.seeds.filter(s => s.status === 'echo').length },
    moments: { possible: notebook.beats.filter(b => b.status === 'possible').length, big: notebook.beats.filter(b => b.status === 'possible' && b.intensity === 'high').length, happened: notebook.beats.filter(b => b.status === 'happened').length },
    people: { total: notebook.people.filter(p => p.status === 'active').length, met: notebook.people.filter(p => p.status === 'active' && p.met).length },
    nextInReplies: next, dueNow: dueThreads(notebook, moment).length,
  };
}
