import { isNewArc, type Moment, type Notebook, type Person, type Preferences } from './notebook';

/**
 * A story's world grows. Small cards (a house, a few people) stay small on
 * their own: a narrator plays the cast it is handed. Unless the player wants
 * the story kept close, Grimoire keeps a few people on hand the player hasn't
 * met yet, from places the story can go next, and brings back people who have
 * been away a while, so the cast becomes a town rather than a list of one-offs.
 */
const STARTING_CAST = { auto: 5, wide: 7 } as const;
/** People not yet met that a growing story keeps on hand. */
const WAITING = 2;

const active = (n: Notebook) => n.people.filter(p => p.status === 'active');

/** Sent back once, like the other story rules; a second answer is taken as it is. */
export function castProblems(previous: Notebook | null, revised: Notebook, prefs: Preferences): string[] {
  if (prefs.size === 'close') return [];
  const unmet = active(revised).filter(p => !p.met).length;
  const room = revised.people.length < 24;
  if (!previous) {
    const want = STARTING_CAST[prefs.size];
    const problems: string[] = [];
    if (active(revised).length < want && room) problems.push(`The cast is too small for a story with room to grow: plan at least ${want} people beyond the player character (the people in their life and the card's, and people from places the story can reach), each built as in 3b to 3d.`);
    if (unmet < WAITING && room) problems.push(`Add at least ${WAITING} people the player hasn't met yet, from places beyond where the story starts, each tied to a storyline or a place the story can go.`);
    return problems;
  }
  if (unmet < WAITING && room && unmet < active(previous).filter(p => !p.met).length + 1) {
    return [`Everyone the story has planned has been met or nearly so. Add ${unmet ? 'one or two' : 'two or three'} new people the player hasn't met yet, from places the story can go next (where people in this story work, study, shop, drink, worship, train, or live), each with a want of their own, built as in 3b to 3d, and tied to an open storyline or a new one.`];
  }
  return [];
}

/** The reply each person was last in a scene. People met before this was tracked count from now. */
export function noteSeen(seen: Record<string, number>, notebook: Notebook, present: Person[], reply: number): Record<string, number> {
  const next = { ...seen };
  for (const p of present) next[p.id] = reply;
  for (const p of notebook.people) if (p.met && next[p.id] === undefined) next[p.id] = reply;
  return next;
}
/** How long someone has to be away before they are worth bringing back, in replies. */
export const awayAfter = (m: Moment) => Math.max(10, m.waits?.steady ?? 15);
/** Met people who haven't been in a scene for a while, longest away first. */
export function awayPeople(notebook: Notebook, seen: Record<string, number>, present: Person[], m: Moment): Array<{ person: Person; replies: number }> {
  const reply = m.reply ?? 0, after = awayAfter(m);
  return notebook.people
    .filter(p => p.status === 'active' && p.met && !present.includes(p) && seen[p.id] !== undefined && reply - seen[p.id] >= after)
    .map(person => ({ person, replies: reply - seen[person.id] }))
    .sort((a, b) => b.replies - a.replies);
}

/**
 * A plan runs dry: every possible moment has happened, every secret is out, every lie has held without a wobble.
 * Nothing else notices, and the story coasts on one plot. A check-up that leaves the plan without fuel is sent
 * back once, like the other story rules.
 */
export function stockProblems(previous: Notebook, revised: Notebook, prefs: Preferences): string[] {
  const problems: string[] = [];
  const open = new Set(revised.threads.filter(t => t.status === 'open').map(t => t.id));
  const possible = revised.beats.filter(b => b.status === 'possible' && (!b.thread || open.has(b.thread))).length;
  if (possible < 2) problems.push(`The plan has ${possible ? 'only one possible moment' : 'no possible moments'} left. Add two or three new ones in "beats" that grow from what has happened and from what people want now, each with its conditions and purpose.`);
  if (!revised.story.hiddenTruth.length && prefs.size !== 'close') problems.push('Every secret has come out. Give the story one or two new hidden truths in story.hiddenTruth: things people here are keeping back that grow from what has happened, each with a breadcrumb in "seeds" pointing toward it.');
  if (prefs.twist && isNewArc(previous, revised) && !revised.story.twist && !revised.arc.turn) problems.push('This new part of the story has no twist planned, and the player allows one. Plan one in story.twist.');
  const live = revised.covers.filter(c => c.status !== 'exposed');
  if (live.length >= 5 && !revised.covers.some(c => c.status === 'strained') && !revised.covers.some(c => c.status === 'exposed' && !previous.covers.some(o => o.id === c.id && o.status === 'exposed')))
    problems.push('Several lies have held for a long time and nobody doubts any of them. Let one start to strain: mark it "strained", and plan the step or possible moment where someone notices something that doesn\'t add up.');
  return problems;
}

/**
 * Whether the narrator takes what Grimoire offers: of the recent replies where the quick check was looking for
 * something Grimoire had offered (a step that was due, a possible moment, a breadcrumb), how many showed any of it.
 */
export function followRate(log: Array<{ reply: number; ok: boolean; answers: Record<string, unknown>; marked: number; quiet?: boolean }>): { offered: number; used: number } | null {
  const byReply = new Map<number, { answers: Record<string, unknown>; marked: number }>();
  // Replies written while the note was holding back (an intimate scene) had nothing offered to them, so they don't count.
  for (const r of log) if (r.ok) byReply.set(r.reply, r);
  for (const r of log) if (r.quiet) byReply.delete(r.reply);
  const asked = [...byReply.values()].filter(r => Object.keys(r.answers).some(k => /^(due|moment|callback)_/.test(k))).slice(-12);
  return asked.length >= 4 ? { offered: asked.length, used: asked.filter(r => r.marked > 0).length } : null;
}
