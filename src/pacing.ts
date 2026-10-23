import { nextStep, NotebookError, threadMoment, type Moment, type Notebook, type Speed } from './notebook';

/**
 * Keeping the plan's pacing from drifting.
 *
 * - One emergency at a time: only one open storyline may be urgent. A second
 *   one is sent back to be rethought as something that builds (or waits).
 * - Storylines don't speed up on their own: an existing storyline may only
 *   get faster, or have its waiting steps pulled closer together, when
 *   something the player did made it more pressing, and the check-up has to
 *   say what.
 *
 * A check-up gets one chance to fix it. If the second answer still breaks a
 * rule, code fixes it in the plainest way rather than failing the check-up.
 */
const RANK: Record<Speed, number> = { urgent: 0, steady: 1, slow: 2 };

export interface PaceRules { /** The player asked for this change themselves (talk, a push): speed-ups need no reason. */ playerAsked?: boolean; speedUps?: Record<string, string> }

/** Which open storyline keeps the one urgent place: one that was already urgent, else the first. */
/** Story hours the waiting steps kept from before add up to, before and after. A quarter less (and at least two hours) is pulling them closer. */
function tightened(was: Notebook['threads'][number], now: Notebook['threads'][number]): { before: number; after: number } | null {
  let before = 0, after = 0;
  for (const step of now.steps) {
    const old = was.steps.find(s => s.id === step.id);
    if (step.status !== 'waiting' || old?.status !== 'waiting') continue;
    before += old.afterHours; after += step.afterHours;
  }
  return before - after >= 2 && after < before * 0.75 ? { before, after } : null;
}
function keeper(previous: Notebook | null, revised: Notebook): string | undefined {
  const urgent = revised.threads.filter(t => t.status === 'open' && t.speed === 'urgent');
  return (urgent.find(t => previous?.threads.some(p => p.id === t.id && p.status === 'open' && p.speed === 'urgent')) ?? urgent[0])?.id;
}

export function paceProblems(previous: Notebook | null, revised: Notebook, rules: PaceRules = {}): string[] {
  const problems: string[] = [];
  const urgent = revised.threads.filter(t => t.status === 'open' && t.speed === 'urgent');
  if (urgent.length > 1) {
    const keep = keeper(previous, revised), others = urgent.filter(t => t.id !== keep).map(t => `"${t.id}"`).join(', ');
    problems.push(`Only one storyline may be urgent at a time. Keep "${keep}" urgent. Rethink ${others}: make it steady or slow and rewrite its waiting steps so it builds with small signs first (raise afterHours), or let it wait until "${keep}" ends. A later emergency can be prepared with a breadcrumb or two, not started early.`);
  }
  if (previous && !rules.playerAsked) {
    for (const thread of revised.threads) {
      const was = previous.threads.find(t => t.id === thread.id);
      if (!was || thread.status !== 'open' || RANK[thread.speed] >= RANK[was.speed]) continue;
      if (!(rules.speedUps?.[thread.id] ?? '').trim()) problems.push(`"${thread.id}" got faster (${was.speed} to ${thread.speed}). Only make a storyline faster when something the player did made it more pressing, and say what in "speedUps": {"${thread.id}": "what the player did"}. Otherwise keep it ${was.speed}.`);
    }
    for (const thread of revised.threads) {
      const was = previous.threads.find(t => t.id === thread.id);
      if (!was || thread.status !== 'open' || (rules.speedUps?.[thread.id] ?? '').trim()) continue;
      const pulled = tightened(was, thread);
      if (pulled) problems.push(`"${thread.id}" had its waiting steps pulled closer together (${pulled.before} to ${pulled.after} story hours in all). Only do that when something the player did made it more pressing, and say what in "speedUps": {"${thread.id}": "what the player did"}. Otherwise keep the waits as they were, or make them longer.`);
    }
  }
  return problems;
}

/** Throw the problems back to the model, so it can rethink the plan. */
export function enforcePace(previous: Notebook | null, revised: Notebook, rules: PaceRules = {}): void {
  const problems = paceProblems(previous, revised, rules);
  if (problems.length) throw new NotebookError(problems.join(' '), 'The update broke a pacing rule, so it was sent back once.');
}

/** The plainest fix, for a second answer that still breaks a rule: slow the extras down, put unexplained speed-ups back. */
export function fixPace(previous: Notebook | null, revised: Notebook, rules: PaceRules = {}): Notebook {
  const keep = keeper(previous, revised);
  return { ...revised, threads: revised.threads.map(thread => {
    const was = previous?.threads.find(t => t.id === thread.id);
    if (thread.status !== 'open') return thread;
    const unexplained = !!was && !rules.playerAsked && !(rules.speedUps?.[thread.id] ?? '').trim();
    if (unexplained && RANK[thread.speed] < RANK[was!.speed]) thread = { ...thread, speed: was!.speed };
    // Waits pulled closer for no reason go back to what they were.
    if (unexplained && tightened(was!, thread)) thread = { ...thread, steps: thread.steps.map(step => { const old = was!.steps.find(s => s.id === step.id); return step.status === 'waiting' && old?.status === 'waiting' ? { ...step, afterHours: Math.max(step.afterHours, old.afterHours) } : step; }) };
    if (thread.speed === 'urgent' && thread.id !== keep) {
      // Steps written for an emergency come hours apart; a steadier storyline needs room between them.
      thread = { ...thread, speed: 'steady', steps: thread.steps.map(step => step.status === 'waiting' ? { ...step, afterHours: Math.max(step.afterHours * 4, step.afterHours + 6) } : step) };
    }
    return thread;
  }) };
}

/** Steps a check-up found had happened before Grimoire offered them: the narrator ran ahead of the plan. */
export function earlySteps(previous: Notebook, revised: Notebook, now: Moment): number {
  let early = 0;
  for (const thread of previous.threads) {
    const next = nextStep(thread, threadMoment(previous, thread, now));
    const after = revised.threads.find(t => t.id === thread.id);
    if (!after) continue;
    thread.steps.forEach((step, i) => {
      if (step.status !== 'waiting') return;
      const done = after.steps.find(s => s.id === step.id);
      if (!done || (done.status !== 'shown' && done.status !== 'offscreen')) return;
      // The step that was due is on plan; one that wasn't due yet, or a later one, came early.
      const onPlan = next && next.step.id === step.id && next.due;
      if (!onPlan && i >= 0) early++;
    });
  }
  return early;
}
