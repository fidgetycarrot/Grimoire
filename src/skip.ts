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
