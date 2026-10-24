import { describeClock, describeDuration, readDay, readTime, type StoryClock } from './clock';
import { spaces } from './history';
import { dueThreads, inOpening, overdue, type Moment, type Notebook, type Pace, type Person, type Seed } from './notebook';
import type { FieldType } from './tracker';

export interface ClockSources { day: 'tracker' | 'notebook'; hour: 'tracker' | 'notebook' | 'unknown'; exact: boolean }
/**
 * The clock to use right now. Fields the tracker verifiably supplies win;
 * the notebook keeps the rest. Never two owners for the same part.
 */
export function liveClock(saved: StoryClock, values: Record<string, string>, types: Record<string, FieldType>): { clock: StoryClock; sources: ClockSources } {
  const clock = { ...saved }, sources: ClockSources = { day: 'notebook', hour: saved.hour === null ? 'unknown' : 'notebook', exact: false };
  const labels: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    const type = types[name];
    if (type === 'date' || type === 'datetime') {
      const day = readDay(value);
      if (day) { clock.day = day.day; sources.day = 'tracker'; labels.push(value); }
    }
    if (type === 'time' || type === 'datetime') {
      const time = readTime(value);
      if (time) { clock.hour = time.hour; sources.hour = 'tracker'; sources.exact = time.exact; if (!labels.includes(value)) labels.push(value); }
    }
  }
  if (labels.length) clock.label = labels.join(', ').slice(0, 160);
  return { clock, sources };
}

const words = (text: string) => text.trim().length >= 3;
/** One sentence ending, whether or not the model added a full stop. */
const end = (text: string) => `${text.trim().replace(/[.!?]+$/, '')}.`;
function mentioned(person: Person, text: string): boolean {
  return [person.name, ...person.aliases].filter(words).some(name => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(text));
}
/** People in the scene: named by the tracker or in the last couple of messages. */
export function presentPeople(notebook: Notebook, recent: string, trackerPresent?: string): Person[] {
  const where = spaces(`${recent}\n${trackerPresent ?? ''}`);
  return notebook.people.filter(person => person.status === 'active' && mentioned(person, where));
}

const PACE: Record<Pace, string> = {
  quiet: 'Pace: quiet. Let this scene breathe. Do not start new trouble or new threads. Anything already urgent still plays out.',
  fast: 'Pace: fast. Keep scenes tight and moving. Cover slow stretches with short transitions. Move toward the next development.',
  auto: '',
};
const RHYTHM: Record<Notebook['rhythm'], string> = {
  calm: 'Pace: steady. Let scenes play out, and keep the story moving.',
  rising: 'Pace: tension is building. Let it build through what people say and do; do not rush the payoff.',
  peak: 'Pace: a big moment is happening. Play it out fully before anything new begins.',
  aftermath: 'Pace: a big moment just happened. Leave room for talk and aftermath. Only urgent matters press in.',
  stalled: 'Pace: things have been quiet for a while. Move the story now: the main storyline first, using what is below.',
};

const STAGE: Record<string, string> = {
  setup: 'Arc: setup. The main storyline has begun: show what it is, who it involves, and what is at stake, and draw the player into it.',
  rising: 'Arc: rising action. Complications build in the main storyline; each scene should change the situation a little.',
  climax: 'Arc: climax. The main conflict comes to a head; let it play out fully.',
  resolution: 'Arc: resolution. Let consequences settle and leave room for what it all meant.',
  ki: 'Arc: introduction. The main storyline opens with something worth following. Let people, places, and routines show themselves around it. No trouble is needed.',
  sho: 'Arc: development. Deepen what is here: closeness, habits, small changes. Do not escalate or invent conflict.',
  ten: 'Arc: the turn. Something unexpected casts what came before in a new light. It does not have to be a threat.',
  ketsu: 'Arc: bringing it together. Let the turn and what came before settle into something new: an understanding, a choice, a changed bond.',
};
const INTIMATE = 'Pace: an intimate scene is under way. Let it play out at its own pace, for as long as the player wants. Nothing from outside interrupts it: planned developments wait until it is over.';
const GUIDED = 'The player gave guidance for this reply. It comes first: follow it, and where anything below disagrees, the guidance wins. No new developments this time.';
const DEEPENING = 'Pace: the scene is deepening. Let it grow through what people say and do; there is no need to escalate.';
/** Narrators like to fix things for the player at once. Every note pushes back. */
export const GROUND = 'People hold their ground: pleading, charm, tears, flirting, or a good speech earn no automatic yes, and closeness does not make anyone more generous, patient, or agreeable. Before anyone speaks, know what they are not saying.';
export const PROBLEMS = 'Problems take time. Nothing gets solved in the scene it comes up in: a solution costs something, takes more than one step, and can fail. Nobody produces the money, the answer, the rescue, or the perfect plan out of nowhere, and no one fixes the player\'s trouble for them. Let problems weigh on people and grow until they are dealt with through effort.';
const OPENING = 'The story is just starting: keep the main storyline in front and moving, and keep side matters small for now.';
/** Replies a due main-storyline step may wait before the world brings it to the player. */
export const BRING_AFTER = 2;
/** Replies between planting one detail and the next, so breadcrumbs stay subtle. */
export const PLANT_GAP = 4;

/**
 * Breadcrumbs for this reply: at most one detail to plant, and the planted
 * details that are ready to pay off. A detail is ready once enough replies
 * have passed since it was planted (the same wait a steady thread gets), so a
 * callback lands well after the mention. A turn's details are ready at the turn.
 */
export function seedPlan(notebook: Notebook, now: number | Moment): { plant: Seed | null; ready: Seed[]; echo: Seed | null } {
  const m = typeof now === 'number' ? { hours: now } as Moment : now, reply = m.reply, gap = m.waits?.steady ?? 15;
  const planted = notebook.seeds.filter(s => s.status === 'planted');
  // Planting and echoes share one rhythm: one background detail at a time, spaced out.
  const last = Math.max(-Infinity, ...notebook.seeds.map(s => s.plantedAt ?? -Infinity), ...notebook.seeds.filter(s => s.status === 'paid' && s.echoAt !== undefined).map(s => s.paidAt ?? -Infinity));
  const open = (s: Seed) => !s.pays || s.pays === 'turn' || notebook.threads.some(t => t.id === s.pays && t.status !== 'closed') || notebook.beats.some(b => b.id === s.pays && b.status === 'possible');
  const spaced = notebook.rhythm !== 'peak' && (reply === undefined || reply - last >= PLANT_GAP);
  // An echo is something that played out offscreen; it reaches the player in passing a while after it happened.
  const echo = spaced && reply !== undefined ? notebook.seeds.find(s => s.status === 'echo' && s.echoAt !== undefined && reply - s.echoAt >= PLANT_GAP + 1) ?? null : null;
  const plant = !spaced || echo ? null : notebook.seeds.find(s => s.status === 'waiting' && open(s)) ?? null;
  const atTurn = notebook.arc.shape === 'kishotenketsu' && notebook.arc.stage === 'ten';
  const ready = planted.filter(s => (s.pays === 'turn' ? atTurn : reply !== undefined && s.plantedAt !== undefined && reply - s.plantedAt >= gap) && open(s));
  return { plant, ready, echo };
}

export interface NoteInput { notebook: Notebook; pace: Pace; clock: StoryClock; now: number | Moment; /** Threads that no longer fit for now. */ held?: string[]; /** The story just changed direction; old plans are being reworked. */ reworking?: boolean; recent: string; trackerPresent?: string; skipHours?: number; /** True when the time comes from the last check-up, not from a tracker reading of the latest reply. */ clockMayLag?: boolean; /** The player swiped with guidance: the note steps back so it never argues with them. */ guided?: boolean; /** Standing wishes the player pinned. */ notes?: string[]; /** An intimate scene is under way: the story stays out until it ends. */ intimate?: boolean }
/**
 * The short private note added before a reply. Built by code from the
 * notebook; no model call. It carries reasons and narrator-safe hints, never
 * the hidden truth itself.
 */
export function buildNote(input: NoteInput): string {
  const { notebook, pace, now } = input, lines: string[] = [];
  const present = presentPeople(notebook, input.recent, input.trackerPresent);
  const quietTime = pace === 'quiet' || (pace === 'auto' && (notebook.rhythm === 'aftermath' || notebook.rhythm === 'peak'));
  lines.push('Grimoire: private story guidance for the narrator. Never mention, quote, or explain it.');
  lines.push(`${input.clockMayLag ? 'Story time at the last check-up' : 'Story time'}: ${describeClock(input.clock)}.${input.clockMayLag ? ' Time may have moved on since; the chat decides what time it is now.' : ''}${input.skipHours ? ` About ${describeDuration(input.skipHours)} have passed since the last message: open with that gap and what changed during it.` : ''}`);
  const gentle = notebook.arc.shape === 'kishotenketsu' && notebook.rhythm === 'rising';
  const guided = !!input.guided, intimate = !!input.intimate;
  // Guidance on a swipe is the player's say on this very reply. Pace, stage and plans could
  // pull against it, so they are left out; who people are and what the story is about stay.
  if (guided) lines.push(GUIDED);
  else if (intimate) lines.push(INTIMATE);
  else {
    lines.push(pace === 'auto' ? (gentle ? DEEPENING : RHYTHM[notebook.rhythm]) : PACE[pace]);
    if (STAGE[notebook.arc.stage]) lines.push(STAGE[notebook.arc.stage]);
  }
  lines.push(`What the story is about: ${notebook.story.question}`);
  // The co-author's standing wishes come before any plan, and are never cut for length.
  const wishes = (input.notes ?? []).map(n => n.trim()).filter(Boolean).slice(0, 8);
  if (wishes.length) lines.push(`The player's standing wishes for this story (they outrank the plans below): ${wishes.map(end).join(' ')}`.slice(0, 900));
  const held = new Set(input.held ?? []), reworking = !!input.reworking, quiet = reworking || guided || intimate;
  const m: Moment = typeof now === 'number' ? { hours: now } : now;
  // The main storyline: the story the player is in. The note keeps it in front so the player never has to go looking for it.
  const main = quiet ? undefined : notebook.threads.find(t => t.id === notebook.arc.main && t.status === 'open' && !held.has(t.id));
  const opening = !!main && inOpening(notebook, m);
  if (main) lines.push(`The main storyline is ${main.title}: ${end(main.hint || main.why)} This is the story the player is in. Keep it present through what people say and do, and let its next development arrive when it is due.`);
  if (opening) lines.push(OPENING);
  const seedsAll = seedPlan(notebook, now), used = new Set<string>();
  // While plans are reworked, no breadcrumbs: they may belong to storylines that no longer fit.
  const seeds = quiet ? { plant: null, ready: [] as Seed[], echo: null } : { plant: seedsAll.plant && !held.has(seedsAll.plant.pays) ? seedsAll.plant : null, ready: seedsAll.ready.filter(s => !held.has(s.pays)), echo: seedsAll.echo };
  if (reworking) lines.push('The story has just changed direction. Follow the player\'s lead; older plans are being reworked, so do not steer back toward them. People left behind can still be thought of, but nothing needs to happen yet.');
  const callback = (seed: Seed) => { used.add(seed.id); return `Bring back something mentioned earlier: "${seed.detail}" (${seed.payoff.replace(/[.!?]+$/, '')}).`; };
  // The turn itself, only once the arc has reached it.
  if (!guided && !intimate && notebook.arc.shape === 'kishotenketsu' && notebook.arc.stage === 'ten' && notebook.arc.turn) {
    lines.push(`The turn: ${end(notebook.arc.turn)} Let it land through what happens, then give people room to react.`);
    for (const seed of seeds.ready.filter(s => s.pays === 'turn').slice(0, 2)) lines.push(`- ${callback(seed)}`);
  }

  // What is due, filtered by the pace: urgent things always press in; slower
  // ones wait for a break in quiet times and arrive one at a time otherwise.
  const due = quiet ? [] : dueThreads(notebook, now).filter(d => !held.has(d.thread.id));
  // The main storyline's next step is what the story does now. Quiet pace still holds it back unless it is urgent;
  // right after a big moment it waits for the moment to settle.
  const lead = due.find(d => d.thread.id === main?.id && (pace !== 'quiet' || d.thread.speed === 'urgent'));
  if (lead) {
    const late = !quietTime && overdue(notebook, lead.thread, now) >= BRING_AFTER;
    const when = quietTime && lead.thread.speed !== 'urgent' ? 'as soon as this moment has settled' : 'now, in this reply or the next';
    const tie = seeds.ready.find(s => s.pays === lead.thread.id && !used.has(s.id));
    const tied = notebook.people.filter(p => p.status === 'active' && lead.thread.people.includes(p.id)).map(p => p.name).slice(0, 3);
    lines.push('What the story does now:');
    lines.push(`- ${lead.thread.title}: ${lead.step.sign || lead.step.text} (bring it in ${when}). Why it matters: ${lead.thread.hint || lead.thread.why}${tie ? ` ${callback(tie)}` : ''}`);
    if (late) lines.push(`- If this has not reached the player yet, bring it to them: someone tied to it seeks them out${tied.length ? ` (${tied.join(', ')})` : ''}, word reaches them, or it happens where they are. They still choose what to do.`);
  }
  const side = due.filter(d => d !== lead && d.thread.id !== main?.id);
  // In the opening stretch, side storylines stay small: only urgent ones press in, and signs meant to come at once (a push).
  const pressing = (d: { thread: { speed: string }; step: { afterHours: number } }) => d.thread.speed === 'urgent' || (!quietTime && d.step.afterHours === 0);
  const urgent = side.filter(pressing).slice(0, lead ? 1 : 2);
  const slower = quietTime || opening ? [] : side.filter(d => !pressing(d)).slice(0, lead ? (pace === 'fast' ? 1 : 0) : pace === 'fast' ? 2 : 1);
  const developments = [...(lead ? [lead] : []), ...urgent, ...slower];
  if (urgent.length || slower.length) {
    lines.push(lead ? 'Side storylines that are due (bring in only if they fit what is happening):' : 'Developments that are due (bring in only if they fit what is happening):');
    for (const { thread, step } of [...urgent, ...slower]) {
      const when = thread.speed === 'urgent' ? 'this can interrupt' : pace === 'fast' || step.afterHours === 0 ? 'bring this in soon' : 'at a natural break, such as the end of this scene';
      const tie = seeds.ready.find(s => s.pays === thread.id && !used.has(s.id));
      lines.push(`- ${thread.title}: ${step.sign || step.text} (${when}). Why it matters: ${thread.hint || thread.why}${tie ? ` ${callback(tie)}` : ''}`);
    }
  }
  // Other open threads involving people in the scene, so they act with purpose.
  const shown = new Set(developments.map(d => d.thread.id));
  const nearby = quiet ? [] : notebook.threads.filter(t => t.status === 'open' && !shown.has(t.id) && !held.has(t.id) && t.people.some(p => present.some(person => person.id === p))).slice(0, 3 - developments.length);
  if (nearby.length) {
    lines.push('Open threads near this scene:');
    for (const thread of nearby) lines.push(`- ${thread.title}: ${thread.hint || thread.why}`);
  }
  if (present.length) {
    lines.push('People here and what drives them (give each one their own voice; nobody should sound like anyone else; a sample line shows how someone sounds, never repeat it word for word):');
    for (const person of present.slice(0, 4)) lines.push(`- ${person.name}${person.role ? ` (${person.role})` : ''}: wants ${end(person.wants || 'nothing stated yet')}${person.doing ? ` Currently: ${end(person.doing)}` : ''}${person.hint ? ` Play them as: ${end(person.hint)}` : ''}${person.voice ? ` Voice: ${end(person.voice)}` : ''}${person.depth ? ` More than their role: ${end(person.depth)}` : ''}`);
  }
  // A possible beat, matched to the pace. Quiet keeps only gentle ones.
  const beat = quiet ? undefined : notebook.beats.find(b => b.status === 'possible' && !held.has(b.thread) && (!quietTime || b.intensity === 'low') && (!b.thread || notebook.threads.find(t => t.id === b.thread)?.status === 'open'));
  if (beat && (pace === 'fast' || !developments.length || notebook.rhythm === 'stalled')) {
    const tie = seeds.ready.find(s => s.pays === beat.id && !used.has(s.id));
    lines.push(`A possible next moment, only if it follows naturally: ${beat.text}${beat.conditions ? ` (only if ${beat.conditions})` : ''}. Purpose: ${beat.purpose}${tie ? ` ${callback(tie)}` : ''}`);
  }
  // Storylines that went against the player leave marks that keep showing.
  const scars = quiet ? [] : notebook.threads.filter(t => t.status === 'closed' && t.outcome === 'lost' && t.scar).slice(-2);
  if (scars.length) lines.push(`Still felt from earlier: ${scars.map(t => end(t.scar!)).join(' ')}`);
  // A detail planted long ago can come back on its own in a quiet stretch, so earlier mentions don't go to waste.
  const loose = !developments.length && (notebook.rhythm === 'calm' || notebook.rhythm === 'stalled') ? seeds.ready.find(s => !used.has(s.id) && s.pays !== 'turn') : undefined;
  if (loose) { const line = callback(loose); lines.push(`If it fits, now is a good time to ${line.charAt(0).toLowerCase()}${line.slice(1)}`); }
  // One new detail to plant, as part of the scene. What it means stays hidden until it pays off.
  if (seeds.plant) lines.push(`A small detail to mention in passing, without drawing attention to it: ${end(seeds.plant.detail)}`);
  if (seeds.echo) lines.push(`Something that happened elsewhere can reach the player in passing, as news, a rumor, an overheard remark, or a message, only if it fits: ${end(seeds.echo.detail)}`);
  // Someone not met yet, so the world is not just the main cast.
  const unmet = notebook.people.filter(p => p.status === 'active' && !p.met && !present.includes(p));
  const newcomer = !quiet && !quietTime && (notebook.rhythm === 'calm' || notebook.rhythm === 'stalled' || pace === 'fast') ? unmet.find(p => main?.people.includes(p.id)) ?? (opening ? undefined : unmet[0]) : undefined;
  if (newcomer && lines.length < 16) lines.push(`Someone who could appear if it fits: ${newcomer.name}${newcomer.role ? `, ${newcomer.role}` : ''}. Wants ${newcomer.wants || 'something of their own'}.`);
  // Fuller sheets for the people here who have one, like short character cards: kept apart from the length limit above.
  const sheets = present.filter(p => p.sheet || p.own).slice(0, 3).map(p => `${p.name}:${p.own ? ` ${end(p.own)}` : ''}${p.sheet ? ` ${end(p.sheet)}` : ''}`.slice(0, 2600));
  const rules = 'The latest messages decide what actually happened; skip anything they have made impossible. Never write the player character\'s actions, words, thoughts, or feelings. Keep secrets hidden and let them show only through small details.\n' + PROBLEMS + ' ' + GROUND;
  // Too long: drop whole lines from the end of the guidance, never the rules.
  while (lines.length > 4 && lines.join('\n').length + rules.length + 1 > 2800) lines.pop();
  const cast = sheets.length ? `\nWho they are, in full (play them true to this, and let it show in what they do, not in explanations):\n${sheets.join('\n')}` : '';
  return `${lines.join('\n')}${cast}\n${rules}`;
}

/** One spoiler-free line for the macro and the panel. */
export function paceLine(pace: Pace, notebook: Notebook): string {
  return pace === 'auto' ? RHYTHM[notebook.rhythm] : PACE[pace];
}
