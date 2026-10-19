import type { Notebook } from './notebook';
import type { TalkLine } from './types';

/**
 * Talking to Grimoire: the player's say as co-author.
 *
 * Grimoire's answers are meant to be read without spoilers, so what changed
 * is described by code from the two notebooks, in shapes and counts only. The
 * model's own words say what it understood, and are told to name nothing the
 * player hasn't.
 */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function describeChanges(before: Notebook, after: Notebook): string[] {
  const out: string[] = [];
  const old = new Map(before.threads.map(t => [t.id, t]));
  const added = after.threads.filter(t => !old.has(t.id) && t.status === 'open').length;
  const closed = after.threads.filter(t => old.get(t.id)?.status === 'open' && t.status === 'closed').length;
  let faster = 0, slower = 0, later = 0, sooner = 0, rewritten = 0;
  const RANK = { urgent: 0, steady: 1, slow: 2 } as const;
  for (const thread of after.threads) {
    const was = old.get(thread.id);
    if (!was || thread.status !== 'open') continue;
    if (RANK[thread.speed] < RANK[was.speed]) faster++;
    if (RANK[thread.speed] > RANK[was.speed]) slower++;
    const waiting = thread.steps.filter(s => s.status === 'waiting'), wasWaiting = was.steps.filter(s => s.status === 'waiting');
    let moved = 0;
    for (const step of waiting) { const prior = wasWaiting.find(s => s.id === step.id); if (prior) moved += step.afterHours - prior.afterHours; }
    if (moved > 0) later++; else if (moved < 0) sooner++;
    const words = (steps: typeof waiting) => steps.map(s => [s.id, s.text, s.sign]);
    if (!same(words(waiting), words(wasWaiting))) rewritten++;
  }
  if (added) out.push(`Added ${count(added, 'storyline')}`);
  if (closed) out.push(`Closed ${count(closed, 'storyline')}`);
  if (slower) out.push(`Slowed ${count(slower, 'storyline')}`);
  if (faster) out.push(`Sped up ${count(faster, 'storyline')}`);
  if (later) out.push(`Moved ${count(later, 'storyline')} further out`);
  if (sooner) out.push(`Brought ${count(sooner, 'storyline')} closer`);
  if (rewritten) out.push(`Reworked what comes next in ${count(rewritten, 'storyline')}`);

  const beats = new Map(before.beats.map(b => [b.id, b]));
  const setAside = after.beats.filter(b => beats.get(b.id)?.status === 'possible' && b.status === 'dropped').length;
  const newBeats = after.beats.filter(b => !beats.has(b.id) && b.status === 'possible').length;
  const reshaped = after.beats.filter(b => { const w = beats.get(b.id); return w?.status === 'possible' && b.status === 'possible' && (w.text !== b.text || w.intensity !== b.intensity || w.conditions !== b.conditions); }).length;
  if (setAside) out.push(`Set aside ${count(setAside, 'planned moment')}`);
  if (newBeats) out.push(`Added ${count(newBeats, 'possible moment')}`);
  if (reshaped) out.push(`Changed ${count(reshaped, 'planned moment')}`);

  const seeds = new Map(before.seeds.map(s => [s.id, s]));
  const newSeeds = after.seeds.filter(s => !seeds.has(s.id)).length;
  const dropped = after.seeds.filter(s => { const w = seeds.get(s.id); return !!w && w.status !== 'dropped' && s.status === 'dropped'; }).length;
  if (newSeeds) out.push(`Added ${count(newSeeds, 'breadcrumb')}`);
  if (dropped) out.push(`Dropped ${count(dropped, 'breadcrumb')}`);

  const people = new Map(before.people.map(p => [p.id, p]));
  const newPeople = after.people.filter(p => !people.has(p.id)).length;
  const replayed = after.people.filter(p => { const w = people.get(p.id); return !!w && (w.wants !== p.wants || w.hint !== p.hint || w.doing !== p.doing || w.status !== p.status); }).length;
  if (newPeople) out.push(`Added ${count(newPeople, 'person', 'people')}`);
  if (replayed) out.push(`Changed what ${count(replayed, 'person', 'people')} ${replayed === 1 ? 'wants or how they act' : 'want or how they act'}`);

  if (before.story.question !== after.story.question || before.story.direction !== after.story.direction || before.story.stakes !== after.story.stakes) out.push('Changed where the story is heading');
  if (!same(before.story.hiddenTruth, after.story.hiddenTruth) || before.story.twist !== after.story.twist || before.arc.turn !== after.arc.turn || before.story.cameOut.length !== after.story.cameOut.length) out.push('Changed what is really going on');
  if (before.arc.shape !== after.arc.shape) out.push('Changed the shape of this part of the story');
  return out;
}

/** The lines of the conversation still open: everything after Grimoire last answered without a question. */
export function openExchange(lines: TalkLine[]): TalkLine[] {
  let start = 0;
  lines.forEach((line, i) => { if (line.from === 'grimoire' && !line.asked) start = i + 1; });
  return lines.slice(start);
}
