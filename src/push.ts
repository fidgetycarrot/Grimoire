import { NotebookError, STAGES, type Notebook } from './notebook';
import { slug } from './tidy';

/**
 * Getting a stalled story moving, believably.
 *
 * The push always grows out of something the notebook already holds: a person
 * with a want, a storyline, a planted detail, something that happened, or a
 * secret. Code checks that tie; a push from nowhere is sent back. It arrives
 * as a small sign first (an urgent storyline whose next step is due now), and
 * the bigger part follows over the next replies, at the urgent pace.
 */
export type PushKind = 'person' | 'secret' | 'consequence' | 'surprise' | 'chapter';
export const PUSH_KINDS: PushKind[] = ['person', 'secret', 'consequence', 'surprise', 'chapter'];
export interface PushTie { kind: 'person' | 'thread' | 'seed' | 'event' | 'truth' | 'revealed'; ref: string }
export interface Push { thread: string; from: PushTie }

/** What the model is told: one shared rule set for the buttons and for talk. */
export const PUSH_RULES = `How to move the story:
- Grow it out of something already established, never from nowhere: a person and what they want, an open or finished storyline, a planted breadcrumb, something that happened, or a hidden truth. The player should feel it was coming, not that it fell from the sky.
- Prefer causes people chose: someone acts on a want, a choice catches up, a secret leaks because someone let it slip. No coincidences, no strangers with no tie to anyone, no disasters out of nowhere.
- It arrives as a small sign first: a message, a visitor, a rumor, a noticed change. The bigger part comes over the next few replies. Put it in one thread: an existing one (rewrite its next waiting step as the sign if needed) or a new one; that thread's first waiting step must be the sign.
- The world moves; the player's character does not. Never plan what they do, say, or feel.
- Keep it in the story's tone and setting, and respect the player's notes.
- Return "push": {"thread": "the thread id that carries it", "from": {"kind": "person|thread|seed|event|truth|revealed", "ref": "the existing id it grows from, or for event, truth, and revealed the index in events, hiddenTruth, or cameOut, counting from 0"}}.`;

export const PUSH_ASKS: Record<PushKind, string> = {
  person: 'Someone the player knows, or knows of, makes a move: a person already in the notebook acts on what they want.',
  secret: 'A secret starts to surface: something still in hiddenTruth (never anything in cameOut, which the player already knows), or what a planted breadcrumb really means, begins to come out.',
  consequence: 'Something catches up with the player: a consequence of something that already happened in the chat, or of a storyline left alone, arrives.',
  surprise: 'Choose whatever established thing would move this story best right now.',
  chapter: 'Start a new chapter: a new part of the story, not one storyline reworked. Wrap up what is spent (close threads with a reason; keep anything still alive), then open the next part of the story from where things stand now: what people want now, what is unresolved, what the player set in motion. Set a new story question if the old one is answered or tired, set arc.stage to the first stage of its shape, and set arc.main to the main storyline of the chapter: its first waiting step is the opening moment that draws the player in, arriving with the next reply. Give the chapter what a new part needs: a main storyline and one to three side storylines, new breadcrumbs, and new possible moments. If a jump in time would give the chapter a fresh start, set "skipHours" (up to 720); otherwise 0.',
};

const ALLOWED: Record<PushKind, PushTie['kind'][]> = {
  person: ['person'], secret: ['truth', 'seed'], consequence: ['event', 'thread', 'seed', 'revealed'],
  surprise: ['person', 'thread', 'seed', 'event', 'truth', 'revealed'], chapter: ['person', 'thread', 'seed', 'event', 'truth', 'revealed'],
};
const TIE_KINDS: PushTie['kind'][] = ['person', 'thread', 'seed', 'event', 'truth', 'revealed'];
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const bad = (message: string): never => { throw new NotebookError(message, 'The model’s push wasn’t tied to anything already in the story, so nothing was changed.'); };

/**
 * Read and check the push against the notebook from before. Ids are matched
 * loosely (a title or name works too). A new chapter grows from everything
 * that has happened, so it may bring in new people, and on a second try a
 * tie that still doesn't check out is let go rather than failing the chapter.
 */
export function checkPush(previous: Notebook, revised: Notebook, value: unknown, kind: PushKind, lenient = false): Push {
  const input = record(value), from = record(input.from);
  const named = (list: Array<{ id: string; title?: string; name?: string; aliases?: string[] }>, ref: string) =>
    list.find(x => x.id === ref) ?? list.find(x => [x.id, x.title, x.name, ...(x.aliases ?? [])].some(k => k && slug(k) === slug(ref)));
  const thread = named(revised.threads, typeof input.thread === 'string' ? input.thread : '')?.id ?? (typeof input.thread === 'string' ? input.thread : '');
  const rawKind = typeof from.kind === 'string' ? from.kind.toLowerCase() : '';
  const tie: PushTie = { kind: (TIE_KINDS.includes(rawKind as PushTie['kind']) ? rawKind : rawKind === 'cameout' ? 'revealed' : rawKind) as PushTie['kind'], ref: String(from.ref ?? '') };
  if (tie.kind === 'person' || tie.kind === 'thread' || tie.kind === 'seed') tie.ref = named((tie.kind === 'person' ? previous.people : tie.kind === 'thread' ? previous.threads : previous.seeds) as Array<{ id: string }>, tie.ref)?.id ?? tie.ref;
  const carrier = revised.threads.find(t => t.id === thread);
  if (!carrier) bad('"push.thread" must name a thread in the returned notebook.');
  if (carrier!.status !== 'open' || !carrier!.steps.some(s => s.status === 'waiting')) bad(`Thread "${thread}" must be open with a waiting step: its first waiting step is the sign.`);
  const index = (n: number) => /^\d+$/.test(tie.ref) && Number(tie.ref) < n;
  const exists = ALLOWED[kind].includes(tie.kind) && (tie.kind === 'person' ? previous.people.some(p => p.id === tie.ref && (p.status === 'active' || kind !== 'person'))
    : tie.kind === 'thread' ? previous.threads.some(t => t.id === tie.ref)
    : tie.kind === 'seed' ? previous.seeds.some(s => s.id === tie.ref)
    : tie.kind === 'event' ? index(previous.events.length)
    : tie.kind === 'revealed' ? index(previous.story.cameOut.length)
    : index(previous.story.hiddenTruth.length));
  if (!exists && !(lenient && kind === 'chapter')) {
    if (!ALLOWED[kind].includes(tie.kind)) bad(`"push.from.kind" must be one of: ${ALLOWED[kind].join(', ')}.`);
    bad(`"push.from" must point at something already in the notebook before this change (${tie.kind} "${tie.ref}" isn't there). For people, threads, and seeds use their id; for event, truth, and revealed use the index in events, hiddenTruth, or cameOut, counting from 0.`);
  }
  const old = previous.threads.find(t => t.id === thread);
  if (!old && kind !== 'chapter' && !carrier!.people.some(id => previous.people.some(p => p.id === id))) bad(`New thread "${thread}" must involve at least one person already in the notebook.`);
  if (kind === 'chapter' && revised.arc.stage !== STAGES[revised.arc.shape][0]) bad(`A new chapter starts at arc.stage "${STAGES[revised.arc.shape][0]}".`);
  // A new chapter is a new part of the story, not one storyline reworked: it needs room to grow.
  if (kind === 'chapter' && !lenient) {
    const open = revised.threads.filter(t => t.status === 'open' && t.steps.some(s => s.status === 'waiting')).length;
    const seeds = revised.seeds.filter(s => s.status === 'waiting' && !previous.seeds.some(p => p.id === s.id)).length;
    const beats = revised.beats.filter(b => b.status === 'possible').length;
    const missing = [open < 2 && 'at least two open storylines with steps to come (the main storyline and a side storyline)', seeds < 2 && 'at least two new breadcrumbs', beats < 2 && 'at least two possible moments'].filter(Boolean);
    if (missing.length) bad(`A new chapter opens a new part of the story, so it needs ${missing.join(', ')}. Grow them from what has happened and what people want now.`);
  }
  return { thread, from: tie };
}

/** The push arrives now: its thread runs at the urgent pace and its sign is due at once. */
export function launchPush(notebook: Notebook, push: Push): Notebook {
  return { ...notebook, threads: notebook.threads.map(thread => {
    if (thread.id !== push.thread) return thread;
    let first = true;
    // One emergency at a time: with another urgent storyline open, the push builds at a steady pace; its sign still comes now.
    const busy = notebook.threads.some(t => t.id !== thread.id && t.status === 'open' && t.speed === 'urgent');
    return { ...thread, speed: busy ? (thread.speed === 'urgent' ? 'steady' : thread.speed === 'slow' ? 'steady' : thread.speed) : 'urgent', steps: thread.steps.map(step => {
      if (step.status !== 'waiting' || !first) return step;
      first = false;
      return { ...step, afterHours: 0, now: true as const };
    }) };
  }) };
}

/** Whether there is anything left to surface: a truth still hidden, or a breadcrumb whose meaning hasn't come out. */
export function secretsLeft(notebook: Notebook): boolean {
  return notebook.story.hiddenTruth.length > 0 || !!notebook.story.twist || notebook.seeds.some(s => s.status === 'planted' || s.status === 'waiting');
}
