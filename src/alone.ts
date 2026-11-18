import type { Moment, Notebook, Thread } from './notebook';

/**
 * Storylines left alone, and stakes nobody gets to decide in advance.
 *
 * Every storyline the player never takes part in still ends somewhere, so the world moves without them. It can end
 * well, in between, or badly. The planner writes all three; code rolls which one happens, tilted by what kind of
 * storyline it is, so knowing the rules doesn't tell the player what ignoring something will do. Only the result
 * reaches the narrator, as one more development; the other endings and the roll stay behind the spoiler fold.
 *
 * - It only rolls once the storyline's steps have all played out (its signs were there to see) and the player
 *   never got involved. Getting involved takes it off the table: what the player does decides it instead.
 * - A real threat leans bad, an ordinary storyline leans mild; any of them can land any way.
 * - After a bad ending, the next ones lean away from bad for a while, so bad luck can't pile up.
 * - One storyline lands at a time.
 * - Never the main storyline (the story brings that to the player) and never a mystery's.
 */
export type Ending = 'good' | 'mixed' | 'bad';
export interface Alone {
  /** A real threat (danger, enemies, debts) or an ordinary storyline. */ lean: 'threat' | 'ordinary';
  good: string; mixed: string; bad: string;
  /** Code-owned: which ending came up, and at which reply. */ landed?: Ending; landedAt?: number;
}
/** The odds, as good / mixed / bad. */
export const ODDS: Record<Alone['lean'], Record<Ending, number>> = {
  threat: { good: 0.15, mixed: 0.35, bad: 0.5 },
  ordinary: { good: 0.4, mixed: 0.4, bad: 0.2 },
};
/** For this many replies after a bad ending, bad endings are much less likely. */
export const GUARD_REPLIES = 40;
const GUARD = 0.3;
export const ALONE_STEP = 'left-alone';

/** Has this storyline run its course without the player, so its ending is due? */
export function dueAlone(notebook: Notebook, thread: Thread): boolean {
  return thread.status === 'open' && thread.id !== notebook.arc.main && thread.id !== notebook.mystery?.thread && !thread.involved
    && !!thread.alone && !thread.alone.landed && thread.steps.length > 0 && thread.steps.every(s => s.status !== 'waiting');
}

/** Roll an ending from the odds; `random` is in [0, 1). */
export function rollEnding(lean: Alone['lean'], guarded: boolean, random: number): Ending {
  const odds = { ...ODDS[lean] };
  if (guarded) odds.bad *= GUARD;
  const total = odds.good + odds.mixed + odds.bad;
  let at = random * total;
  for (const ending of ['bad', 'mixed', 'good'] as const) { if (at < odds[ending]) return ending; at -= odds[ending]; }
  return 'good';
}

/**
 * After a check-up: land at most one due ending (as a new step the narrator brings in, so it reaches the player
 * like any other development), and close storylines whose ending has played out.
 */
export function settleAlone(notebook: Notebook, now: Moment, random: () => number = Math.random): Notebook {
  const reply = now.reply ?? 0;
  let threads = notebook.threads.map(t => {
    // The ending has played out: the storyline is over, and a bad one leaves its mark.
    const step = t.steps.find(s => s.id === ALONE_STEP);
    if (t.status !== 'open' || !t.alone?.landed || !step || step.status === 'waiting') return t;
    const ending = t.alone[t.alone.landed];
    return { ...t, status: 'closed' as const, outcome: t.alone.landed === 'bad' ? 'lost' as const : 'faded' as const, closedReason: `Left alone: ${ending}`, ...(t.alone.landed === 'bad' && !t.scar ? { scar: ending } : {}) };
  });
  const due = threads.find(t => dueAlone({ ...notebook, threads }, t));
  if (due?.alone) {
    const guarded = threads.some(t => t.alone?.landed === 'bad' && t.alone.landedAt !== undefined && reply - t.alone.landedAt < GUARD_REPLIES);
    const landed = rollEnding(due.alone.lean, guarded, random());
    const text = due.alone[landed];
    threads = threads.map(t => t.id !== due.id ? t : {
      ...t, alone: { ...t.alone!, landed, landedAt: reply },
      steps: [...t.steps, { id: ALONE_STEP, text, sign: text, afterHours: t.speed === 'slow' ? 24 : 6, status: 'waiting' as const }],
    });
  }
  return { ...notebook, threads };
}
