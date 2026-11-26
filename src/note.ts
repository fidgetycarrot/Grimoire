import { describeClock, describeDuration, readDay, readTime, type StoryClock } from './clock';
import { mysteryNote } from './mystery';
import { spaces } from './history';
import { dueThreads, inOpening, overdue, type Moment, type Notebook, type Pace, type Person, type Seed, type Step, type StorySize, type Thread } from './notebook';
import type { FieldType } from './tracker';
import type { Look } from './look';

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
/**
 * People in the scene. The preset's tracker says who is present when it has such a line; without one, it is whoever
 * the narrator's own recent writing names. The player saying a name does not put that person in the room.
 */
export function presentPeople(notebook: Notebook, narrated: string, trackerPresent?: string): Person[] {
  const where = spaces(trackerPresent?.trim() ? trackerPresent : narrated);
  return notebook.people.filter(person => person.status === 'active' && mentioned(person, where));
}
/** People named in the last couple of messages who are not in the scene. */
export function spokenOf(notebook: Notebook, recent: string, here: Person[]): Person[] {
  const text = spaces(recent);
  return notebook.people.filter(person => person.status === 'active' && !here.includes(person) && mentioned(person, text));
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
/** Goon Mode: the scene is the main event, so it is played fully and the story's next step comes after. */
const GOON_INTIMATE = 'Pace: an intimate scene is under way, and in this story it is the main event. Give it everything, at its own pace, for as long as the player wants. Nothing from outside interrupts it: the story\'s next step comes after.';
/** Goon Mode while the player lets the story carry on through these scenes. */
const GOON_SCENE = 'An intimate scene is under way, and in this story it is the main event. A planned development comes in now only if it belongs inside the scene (someone joining, being caught, something said in the moment); anything else waits until it is over.';
const GUIDED = 'The player gave guidance for this reply. It comes first: follow it, and where anything below disagrees, the guidance wins. No new developments this time.';
const DEEPENING = 'Pace: the scene is deepening. Let it grow through what people say and do; there is no need to escalate.';
/** Narrators like to fix things for the player at once. Every note pushes back. */
export const GROUND = 'People hold their ground: pleading, charm, tears, flirting, or a good speech earn no automatic yes, and closeness does not make anyone more generous, patient, or agreeable. Before anyone speaks, know what they are not saying. Hard does not mean joyless: when the player earns something, let it land (people notice, something gets better, there is room to enjoy it), and let people be funny, warm, and at ease when the moment allows.';
export const PROBLEMS = 'Problems take time. Nothing gets solved in the scene it comes up in: a solution costs something, takes more than one step, and can fail. Nobody produces the money, the answer, the rescue, or the perfect plan out of nowhere, and no one fixes the player\'s trouble for them. Let problems weigh on people and grow until they are dealt with through effort.';
const OPENING = 'The story is just starting: keep the main storyline in front and moving, and keep side matters small for now.';
/** Replies a due main-storyline step may wait before the world brings it to the player. */
export const BRING_AFTER = 2;
/** Replies past its turn after which a big moment no longer holds the main storyline's next step back. */
const HOLD_LIMIT = 6;
/** Replies without a new face after which a big moment no longer keeps newcomers and returning people out. */
const NEW_FACE_GAP = 20;
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

export interface NoteInput { /** A ready-made plan for the main storyline's next step, written for the scene as it stood after the last reply. */ staged?: { step: string; look: Look }; /** Goon Mode: the intimate scenes are the main story. */ goon?: boolean; /** In Goon Mode, an intimate scene is under way and the player lets the story carry on through it. */ scene?: boolean; notebook: Notebook; pace: Pace; clock: StoryClock; now: number | Moment; /** Threads that no longer fit for now. */ held?: string[]; /** Due steps that cannot believably reach the player in the scene as it stands. */ blocked?: string[]; /** Due steps whose moment the quick check saw in the latest reply. Present only while the quick check works; then a step comes in at its moment, not on the clock. */ open?: string[]; /** Steps whose moment was there and passed two replies running. */ missed?: string[]; /** The player typed the codeword: move the story in this reply. `only` when the message held nothing else. `look` is the deep look's plan, when it came back in time. */ push?: { only: boolean; look?: Look }; /** The story just changed direction; old plans are being reworked. */ reworking?: boolean; recent: string; /** Where the scene is, from the preset's tracker. */ location?: string; /** The narrator's part of the recent messages, when the caller can tell it apart from the player's. */ narrated?: string; trackerPresent?: string; skipHours?: number; /** True when the time comes from the last check-up, not from a tracker reading of the latest reply. */ clockMayLag?: boolean; /** The player swiped with guidance: the note steps back so it never argues with them. */ guided?: boolean; /** Standing wishes the player pinned. */ notes?: string[]; /** An intimate scene is under way: the story stays out until it ends. */ intimate?: boolean; /** People the player has met who haven't been around for a while, longest away first. */ away?: Person[];
  /** Replies since someone new last turned up in a scene. */ sinceNewFace?: number; /** Where things are in the building the player is in. */ layout?: string; /** How big the world gets; a close story doesn't send the player anywhere. */ size?: StorySize; /** The chat's preset plans the story: the note keeps to people and memory. */ light?: boolean }
/**
 * The short private note added before a reply. Built by code from the
 * notebook; no model call. It carries reasons and narrator-safe hints, never
 * the hidden truth itself.
 */
/** Shorten to about `max` characters at a sentence or word end. */
export function fit(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max).replace(/[,;:\s]+$/, '')}…`;
}
/**
 * Room for the guidance, apart from the closing rules and the character sheets. The limit once counted the rules
 * too, and as the planner's own lines grew (a story question of 450 characters, a 600-character storyline line) it
 * cut off everything after them: in one long chat, 50 of 61 notes that had a step due lost the step itself and
 * kept only its heading. What the narrator must do is now never cut, and long background lines are shortened.
 */
const ROOM = 3600;
/** How many replies a drift fix keeps being shown before it is left to the next check-up to renew or clear. */
export const DRIFT_SHOW = 15;
/** A sheet's length on a reply that is busy with plot. */
const SHEET_SHORT = 700;
/**
 * The note when the chat's preset plans the story (Vexa and the like). Two planners steering one narrator pull it two
 * ways, so Grimoire leaves the plot alone: no pace, arc, storylines, moments, callbacks, time or layout. It keeps to
 * what a planner preset is weaker at over a long chat: who the people here are and how they sound (with fixes for
 * anyone who has drifted), what has come out and what the player character told people, and that a name being said
 * doesn't bring anyone in.
 */
/** The player asked for the story to move (the codeword). What the narrator does with their message either way. */
function pushLines(push: NonNullable<NoteInput['push']>): string[] {
  const lines = ['The player asked me to move the story in this reply: they want something to happen that they can react to.'];
  if (push.look) lines.push(`My plan for this reply: ${end(push.look.move)}${push.look.cause ? ` It grows out of this: ${end(push.look.cause)}` : ''} It ends with this in front of them: ${end(push.look.hands).replace(/[.!?]$/, '')}, and I stop there: what they do with it is theirs.`);
  lines.push(push.only
    ? 'Their message holds no action this time: their character carries on with what they were already doing. I write no new choices, words, or actions for them; the world moves.'
    : 'What they wrote happens first and fully, as they wrote it; the development builds on it.');
  return lines;
}
function lightNote(input: NoteInput): string {
  const { notebook } = input;
  const present = presentPeople(notebook, input.narrated ?? input.recent, input.trackerPresent);
  const guided = !!input.guided, m: Moment = typeof input.now === 'number' ? { hours: input.now } : input.now;
  // Parts in order of importance; if the note runs long, whole parts go from the end of this list, never half of one.
  const parts: string[][] = [];
  const head = ['Grimoire: private notes on the people in this story, for the narrator. Never mention, quote, or explain them. They do not plan anything: the story goes where it is going.'];
  if (guided) head.push(GUIDED);
  const wishes = (input.notes ?? []).map(n => n.trim()).filter(Boolean).slice(0, 8);
  if (wishes.length) head.push(`The player's standing wishes for this story: ${wishes.map(end).join(' ')}`.slice(0, 900));
  // The codeword: the player asked for the story to move. Without a deep look, the preset's own plans are what's ready.
  if (input.push && !guided) head.push(...pushLines(input.push), ...(input.push.look ? [] : ['My own plans in this chat (the notes and trackers I keep in my replies) are where it comes from: I take the development that is closest to ready and let it land now, with a cause they could have seen. Nothing from nowhere.']));
  parts.push(head);
  if (present.length) {
    const people = ['People here and what drives them (give each one their own voice; nobody should sound like anyone else; a sample line shows how someone sounds, never repeat it word for word):'];
    // Kept short: the full sheet follows below.
    for (const person of present.slice(0, 4)) people.push(`- ${person.name}${person.role ? ` (${fit(person.role, 80)})` : ''}: wants ${fit(end(person.wants || 'nothing stated yet'), 160)}${person.doing ? ` Currently: ${fit(end(person.doing), 160)}` : ''}${person.voice ? ` Voice: ${fit(end(person.voice), 200)}` : ''}`);
    if (!guided) for (const person of present.slice(0, 4)) if (person.drift && (m.reply === undefined || person.driftAt === undefined || m.reply - person.driftAt <= DRIFT_SHOW)) people.push(`${person.name} has been slipping. Bring them back: ${end(person.drift)}`);
    parts.push(people);
  }
  const told = guided ? [] : (notebook.covers ?? []).filter(c => c.by === 'player' && c.status !== 'exposed' && c.told.some(id => present.some(p => p.id === id))).slice(0, 2);
  if (told.length) parts.push(told.map(c => {
    const heard = notebook.people.filter(p => c.told.includes(p.id) && present.includes(p)).map(p => p.name).join(' and ');
    const bare = (t: string) => t.trim().replace(/[.!?]+$/, '');
    return `The player character told ${heard}: "${fit(bare(c.said), 240)}"${c.hides ? `, to cover ${fit(bare(c.hides), 160)}` : ''}. They remember it${c.status === 'strained' ? ' and are starting to doubt it' : ''}; details should stay consistent with it.`;
  }));
  // What has come out stays known, however far back in the chat it happened.
  const known = notebook.story.cameOut.slice(-3).map(r => fit(end(r.text), 260));
  if (known.length) parts.push([`Already out in the open (people know it now; keep to it): ${known.join(' ')}`]);
  const named = guided ? [] : spokenOf(notebook, input.recent, present).slice(0, 3);
  if (named.length) parts.push(['Named in the chat but not in the scene. Unless the latest messages already show them here, a name being said does not bring anyone in: they carry on with their own day elsewhere, until the player goes to them or they have a reason of their own to come.',
    ...named.map(person => `- ${person.name}: ${end(fit(person.doing || `wants ${person.wants || 'something of their own'}`, 160))}`)]);
  const voiced = guided ? [] : present.filter(p => p.voice).slice(0, 4);
  if (voiced.length >= 2) parts.push([`Before writing lines for ${voiced.map(p => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}, check each sounds like their own voice above and not like the others, and that each still shows more than their one most obvious trait.`]);
  while (parts.length > 1 && parts.flat().join('\n').length > ROOM) parts.pop();
  const sheets = present.filter(p => p.sheet || p.own).slice(0, 3).map(p => `${p.name}: ${`${p.own ? ` ${end(p.own)}` : ''}${p.sheet ? ` ${end(p.sheet)}` : ''}`.trim().slice(0, 2600)}`);
  const cast = sheets.length ? `\nWho they are, in full (play them true to this, and let it show in what they do, not in explanations):\n${sheets.join('\n')}` : '';
  return `${parts.flat().join('\n')}${cast}\nThe latest messages decide what actually happened. Keep secrets hidden and let them show only through small details.`;
}
/** What the main storyline does next, and how ready it is to come in. Shared by the note and the staged plan. */
export interface LeadState { pace: Pace; held?: string[]; blocked?: string[]; /** Steps whose moment the quick check saw; undefined without a working quick check. */ open?: string[]; /** Ids of the people in the scene. */ present?: string[]; /** Nothing is offered (an intimate scene kept clear, plans being reworked, a guided swipe). */ quiet?: boolean; /** Goon Mode, mid-scene: the scene is the main event, so the main storyline waits until it is over. */ scene?: boolean }
export interface Lead { thread: Thread; step: Step; waited: number; shut: boolean; holding: boolean; late: boolean; waiting: boolean; urgent: boolean; open: boolean; watching: boolean }
export function leadOf(notebook: Notebook, now: number | Moment, state: LeadState): Lead | null {
  if (state.quiet) return null;
  const held = new Set(state.held ?? []), m: Moment = typeof now === 'number' ? { hours: now } : now, pace = state.pace;
  const main = notebook.threads.find(t => t.id === notebook.arc.main && t.status === 'open' && !held.has(t.id));
  // Quiet pace still holds it back unless it is urgent.
  const found = main && dueThreads(notebook, now).find(d => d.thread.id === main.id && (pace !== 'quiet' || d.thread.speed === 'urgent'));
  if (!found) return null;
  const { thread, step } = found;
  const quietTime = pace === 'quiet' || (pace === 'auto' && (notebook.rhythm === 'aftermath' || notebook.rhythm === 'peak'));
  // With a working quick check, a step comes in at its moment (its opening), not on the clock. It is offered once the
  // quick check saw its moment in the latest reply and everyone it needs is here. While it waits, pressure builds: after
  // a while it makes its own believable way in. Without a quick check, steps come in on the clock as before.
  const watching = state.open !== undefined;
  const here = !step.with?.length || !state.present || step.with.every(id => state.present!.includes(id));
  const open = (state.open ?? []).includes(step.id) && here;
  // A big moment holds the main storyline back, but not forever: in a story that is one big moment after another
  // (a romance, an action run, a raunchy card), the plot would never move. Once the step has waited a while past its
  // turn, it comes in anyway. A quiet pace the player chose still holds it.
  const waited = overdue(notebook, thread, now);
  // Planned before the scene moved, and with no believable way in now: it waits for the scene to open up.
  const shut = (state.blocked ?? []).includes(step.id);
  const urgent = thread.speed === 'urgent';
  // In Goon Mode a scene under way holds it outright: the note says only what belongs inside the scene comes in, and a
  // ready-made plan for an arrival from outside would contradict that (it did, in a real chat).
  const holding = shut || !!state.scene || quietTime && !urgent && !(pace === 'auto' && waited >= HOLD_LIMIT);
  // Waiting for its opening, the pressure builds; at the threshold it makes its own way in.
  const threshold = Math.max(3, Math.round((m.waits?.[thread.speed] ?? 15) / 2));
  // A step meant to come at once (the story's opening moment, a push) doesn't wait for anything.
  const moment = !watching || urgent || !!step.now || open;
  const late = watching && !holding && !moment && waited >= threshold;
  const waiting = watching && !holding && !moment && !late;
  return { thread, step, waited, shut, holding, late, waiting, urgent, open, watching };
}
/** The lead is coming in with the next reply: the moment a ready-made plan is worth writing. */
export const leadComing = (lead: Lead | null): lead is Lead => !!lead && !lead.holding && !lead.waiting;
export function buildNote(input: NoteInput): string {
  if (input.light) return lightNote(input);
  const { notebook, pace, now } = input, lines: string[] = [], vital = new Set<string>();
  const must = (text: string) => { vital.add(text); lines.push(text); };
  const present = presentPeople(notebook, input.narrated ?? input.recent, input.trackerPresent);
  const quietTime = pace === 'quiet' || (pace === 'auto' && (notebook.rhythm === 'aftermath' || notebook.rhythm === 'peak'));
  must('Grimoire: my private notes for this story. Never mention, quote, or explain them.');
  // Why a storyline matters, in narrator-safe words. A thread with no safe hint falls back to its hidden reasons, except
  // while a mystery is open: then nothing hidden reaches the narrator, and the title has to do.
  const about = (t: { title: string; hint: string; why: string }) => t.hint || (notebook.mystery?.status === 'open' ? t.title : t.why);
  lines.push(`${input.clockMayLag ? 'Story time at the last check-up' : 'Story time'}: ${describeClock(input.clock)}.${input.clockMayLag ? ' Time may have moved on since; the chat decides what time it is now.' : ''}${input.skipHours ? ` About ${describeDuration(input.skipHours)} have passed since the last message: open with that gap and what changed during it.` : ''}`);
  if (input.layout) lines.push(input.layout);
  const gentle = notebook.arc.shape === 'kishotenketsu' && notebook.rhythm === 'rising';
  const guided = !!input.guided, intimate = !!input.intimate;
  // Guidance on a swipe is the player's say on this very reply. Pace, stage and plans could
  // pull against it, so they are left out; who people are and what the story is about stay.
  if (guided) must(GUIDED);
  else if (intimate) must(input.goon ? GOON_INTIMATE : INTIMATE);
  else if (input.goon && input.scene) must(GOON_SCENE);
  else {
    lines.push(pace === 'auto' ? (gentle ? DEEPENING : RHYTHM[notebook.rhythm]) : PACE[pace]);
    if (STAGE[notebook.arc.stage]) lines.push(STAGE[notebook.arc.stage]);
  }
  lines.push(`What the story is about: ${fit(notebook.story.question, 240)}`);
  // The co-author's standing wishes come before any plan, and are never cut for length.
  const wishes = (input.notes ?? []).map(n => n.trim()).filter(Boolean).slice(0, 8);
  if (wishes.length) must(`The player's standing wishes for this story (they outrank the plans below): ${wishes.map(end).join(' ')}`.slice(0, 900));
  const held = new Set(input.held ?? []), reworking = !!input.reworking, quiet = reworking || guided || intimate;
  const m: Moment = typeof now === 'number' ? { hours: now } : now;
  // The main storyline: the story the player is in. The note keeps it in front so the player never has to go looking for it.
  const main = quiet ? undefined : notebook.threads.find(t => t.id === notebook.arc.main && t.status === 'open' && !held.has(t.id));
  const opening = !!main && inOpening(notebook, m);
  if (main) lines.push(`The main storyline is ${main.title}: ${end(fit(about(main), 220))} This is the story the player is in. I keep it present through what people say and do, and let its next development arrive at its moment.`);
  if (opening) lines.push(OPENING);
  const seedsAll = seedPlan(notebook, now), used = new Set<string>();
  // While plans are reworked, no breadcrumbs: they may belong to storylines that no longer fit.
  const seeds = quiet ? { plant: null, ready: [] as Seed[], echo: null } : { plant: seedsAll.plant && !held.has(seedsAll.plant.pays) ? seedsAll.plant : null, ready: seedsAll.ready.filter(s => !held.has(s.pays)), echo: seedsAll.echo };
  if (reworking) must('The story has just changed direction. Follow the player\'s lead; older plans are being reworked, so do not steer back toward them. People left behind can still be thought of, but nothing needs to happen yet.');
  // A mystery: the narrator is told the question and its rules, never the answer while it is open.
  const mystery = mysteryNote(notebook, present, input.location ?? '', m, quiet);
  for (const line of mystery.vital) must(line);
  const callback = (seed: Seed) => { used.add(seed.id); return `I bring back something mentioned earlier: "${seed.detail}" (${seed.payoff.replace(/[.!?]+$/, '')}).`; };
  // The turn itself, only once the arc has reached it.
  if (!guided && !intimate && notebook.arc.shape === 'kishotenketsu' && notebook.arc.stage === 'ten' && notebook.arc.turn) {
    lines.push(`The turn: ${end(fit(notebook.arc.turn, 240))} Let it land through what happens, then give people room to react.`);
    for (const seed of seeds.ready.filter(s => s.pays === 'turn').slice(0, 2)) lines.push(`- ${callback(seed)}`);
  }

  // What is due, filtered by the pace: urgent things always press in; slower
  // ones wait for a break in quiet times and arrive one at a time otherwise.
  const asked = guided ? undefined : input.push;
  const due = quiet || asked ? [] : dueThreads(notebook, now).filter(d => !held.has(d.thread.id));
  if (asked) {
    for (const line of pushLines(asked)) must(line);
    // No deep look in time: the step that is closest to ready comes in now. The main storyline's next step first,
    // even if its moment hasn't come, then a side storyline's; failing those, something grown from what is already there.
    if (!asked.look) {
      const ready = dueThreads(notebook, now).filter(d => !held.has(d.thread.id));
      const mainThread = notebook.threads.find(t => t.id === notebook.arc.main && t.status === 'open' && !held.has(t.id));
      const next = ready.find(d => d.thread.id === mainThread?.id) ?? (mainThread && mainThread.steps.find(st => st.status === 'waiting') ? { thread: mainThread, step: mainThread.steps.find(st => st.status === 'waiting')! } : undefined) ?? ready[0];
      if (next) {
        const tied = notebook.people.filter(p => p.status === 'active' && next.thread.people.includes(p.id)).map(p => p.name).slice(0, 3);
        must(`- I bring this in now, in the most believable way for where they are: ${next.thread.title}: ${fit(next.step.sign || next.step.text, 320)} If it can't happen where they are, someone tied to it${tied.length ? ` (${tied.join(', ')})` : ''} comes looking for them with a reason of their own, or word reaches them. Never through a locked door or into a private moment by force. Why it matters: ${fit(about(next.thread), 200)}`);
      } else must('- Someone with a reason of their own brings them something to act on, grown from what has already happened: a person who wants something, or a detail mentioned earlier coming back. Nothing from nowhere.');
    }
  }
  // The main storyline's next step is what the story does now. Quiet pace still holds it back unless it is urgent;
  // right after a big moment it waits for the moment to settle.
  const leadInfo = asked ? null : leadOf(notebook, now, { pace, held: input.held, blocked: input.blocked, open: input.open, present: present.map(p => p.id), quiet, scene: !!(input.goon && input.scene) });
  const lead = leadInfo ? { thread: leadInfo.thread, step: leadInfo.step } : undefined;
  const watching = input.open !== undefined;
  const here = (step: { with?: string[] }) => !step.with?.length || step.with.every(id => present.some(p => p.id === id));
  const isOpen = (step: { id: string; with?: string[] }) => (input.open ?? []).includes(step.id) && here(step);
  const passed = (step: { id: string }) => (input.missed ?? []).includes(step.id);
  if (lead && leadInfo) {
    const { waited, shut, holding, late, waiting, urgent } = leadInfo;
    const when = shut ? 'once it can believably reach the player: not in this scene as it stands. I do not force it in; it waits, or word of it reaches them afterward' : holding ? 'as soon as this moment has settled' : watching && isOpen(lead.step) ? 'now, in this reply or the next: its moment is here' : quietTime && !urgent ? 'now, in this reply or the next, as the scene allows: it has waited long enough' : 'now, in this reply or the next';
    const tie = seeds.ready.find(s => s.pays === lead.thread.id && !used.has(s.id));
    const tied = notebook.people.filter(p => p.status === 'active' && lead.thread.people.includes(p.id)).map(p => p.name).slice(0, 3);
    const where = urgent || input.size === 'close' ? ', or it happens where they are' : ', with a reason to go where it is happening; it only comes to where they are if there is no other way';
    // Goon Mode, mid-scene: the main storyline waits for the scene to end, said plainly so nothing contradicts the scene line.
    const sceneHold = holding && !!(input.goon && input.scene);
    if (waiting || sceneHold) {
      must('What I am holding for its moment:');
      must(`- ${lead.thread.title}: ${fit(lead.step.sign || lead.step.text, 320)} I hold this until ${sceneHold ? 'the intimate scene is over' : lead.step.opening ? end(fit(lead.step.opening, 240)).replace(/[.!?]$/, '') : 'the scene gives it a natural way in'}. I do not force it in before then; when the scene gives that moment, I take it. Why it matters: ${fit(about(lead.thread), 200)}`);
    } else {
      must('What I bring in now:');
      const catchLine = lead.step.cost ? ` It comes with a catch: ${end(fit(lead.step.cost, 240))}` : '';
      // Only for a step coming in now: a held step's plan would tell the narrator to do what the note says to wait on.
      const staged = !holding && input.staged?.step === lead.step.id ? input.staged.look : undefined;
      if (staged) must(`- ${lead.thread.title}. My plan for this reply: ${end(staged.move)}${staged.cause ? ` It grows out of this: ${end(staged.cause)}` : ''}${catchLine} It ends with this in front of the player: ${end(staged.hands).replace(/[.!?]$/, '')}, and I stop there: what they do with it is theirs. Whatever the player just did happens first; if it makes this impossible where they are, it reaches them another believable way. Why it matters: ${fit(about(lead.thread), 200)}`);
      else must(late
        ? `- ${lead.thread.title}: ${fit(lead.step.sign || lead.step.text, 320)} It has waited long enough, so it makes its own way in: someone tied to it${tied.length ? ` (${tied.join(', ')})` : ''} comes looking for the player with a reason of their own, or word reaches them${where}. Never through a locked door or into a private moment by force.${catchLine} Why it matters: ${fit(about(lead.thread), 200)}${tie ? ` ${callback(tie)}` : ''}`
        : `- ${lead.thread.title}: ${fit(lead.step.sign || lead.step.text, 320)} (I bring it in ${when}). If the scene has moved since I planned this, I bring it in the way that fits where the player is now, never through a locked door or into a private moment by force.${catchLine} Why it matters: ${fit(about(lead.thread), 200)}${tie ? ` ${callback(tie)}` : ''}`);
      if (watching && passed(lead.step)) must('- Its moment came in the last reply and passed. I take it this time.');
      // Bringing everything to where the player already is keeps a story in one room. Unless it is urgent or the story is
      // kept close, the player is given a reason to go where it is happening instead.
      // The player acts; they don't invent. A development ends with something in front of them, and their move.
      if (!staged) must('- It lands as something the player can act on (a thing in their hands, an offer, a question put to them, someone waiting on their answer), and I stop there: what they do with it is theirs.');
      if (!watching && waited >= BRING_AFTER && !holding) must(`- If it has not reached the player yet, I bring it to them: someone tied to it seeks them out${tied.length ? ` (${tied.join(', ')})` : ''} or word reaches them${where}. They still choose what to do.`);
    }
  }
  const side = due.filter(d => d !== lead && d.thread.id !== main?.id);
  // In the opening stretch, side storylines stay small: only urgent ones press in, and signs meant to come at once (a push).
  const pressing = (d: { thread: { speed: string }; step: { afterHours: number } }) => d.thread.speed === 'urgent' || (!quietTime && d.step.afterHours === 0);
  const urgentSide = side.filter(pressing).slice(0, lead ? 1 : 2);
  // Watched by the quick check, a slower side storyline comes in only at its moment.
  const slower = quietTime || opening ? [] : side.filter(d => !pressing(d) && (!watching || isOpen(d.step))).slice(0, lead ? (pace === 'fast' ? 1 : 0) : pace === 'fast' ? 2 : 1);
  const developments = [...(lead ? [lead] : []), ...urgentSide, ...slower];
  if (urgentSide.length || slower.length) {
    must(lead ? 'Side storylines I can bring in, only if they fit what is happening:' : 'Developments I can bring in, only if they fit what is happening:');
    for (const { thread, step } of [...urgentSide, ...slower]) {
      const when = thread.speed === 'urgent' ? 'this can interrupt' : watching && isOpen(step) ? 'its moment is here' : pace === 'fast' || step.afterHours === 0 ? 'I bring this in soon' : 'at a natural break, such as the end of this scene';
      const tie = seeds.ready.find(s => s.pays === thread.id && !used.has(s.id));
      must(`- ${thread.title}: ${fit(step.sign || step.text, 320)} (${when}).${step.cost ? ` It comes with a catch: ${end(fit(step.cost, 200))}` : ''} Why it matters: ${fit(about(thread), 200)}${tie ? ` ${callback(tie)}` : ''}`);
    }
  }
  // Other open threads involving people in the scene, so they act with purpose.
  const shown = new Set(developments.map(d => d.thread.id));
  const nearby = quiet || asked ? [] : notebook.threads.filter(t => t.status === 'open' && !shown.has(t.id) && !held.has(t.id) && t.people.some(p => present.some(person => person.id === p))).slice(0, 3 - developments.length);
  if (nearby.length) {
    lines.push('Open threads near this scene, which I keep in mind (nothing is due from them):');
    for (const thread of nearby) lines.push(`- ${thread.title}: ${about(thread)}`);
  }
  if (present.length) {
    lines.push('People here and what drives them (give each one their own voice; nobody should sound like anyone else; a sample line shows how someone sounds, never repeat it word for word):');
    // A crowded scene: people have their own lives and leave, rather than everyone standing around for the whole scene.
    if (!guided && present.length > 4) lines.push('A lot of people are here. They have their own schedules and reasons: when it fits, let one or two drift off, get called away, or leave on business of their own, rather than everyone staying for the whole scene.');
    for (const person of present.slice(0, 4)) lines.push(`- ${person.name}${person.role ? ` (${person.role})` : ''}: wants ${end(person.wants || 'nothing stated yet')}${person.doing ? ` Currently: ${end(person.doing)}` : ''}${person.hint ? ` Play them as: ${end(person.hint)}` : ''}${person.voice ? ` Voice: ${end(person.voice)}` : ''}${person.depth ? ` More than their role: ${end(person.depth)}` : ''}`);
  }
  // Storylines that went against the player leave marks that keep showing.
  const scars = quiet ? [] : notebook.threads.filter(t => t.status === 'closed' && t.outcome === 'lost' && t.scar).slice(-2);
  if (scars.length) lines.push(`Still felt from earlier: ${scars.map(t => end(t.scar!)).join(' ')}`);
  // A detail planted long ago can come back on its own in a quiet stretch, so earlier mentions don't go to waste.
  const loose = !developments.length && (notebook.rhythm === 'calm' || notebook.rhythm === 'stalled') ? seeds.ready.find(s => !used.has(s.id) && s.pays !== 'turn') : undefined;
  if (loose) lines.push(`A quiet stretch is a good time for this, if it fits. ${callback(loose)}`);
  // One new detail to plant, as part of the scene. What it means stays hidden until it pays off.
  if (seeds.plant) lines.push(`A small detail I mention in passing, without drawing attention to it: ${end(seeds.plant.detail)}`);
  // Plot and character take turns, to keep the note lean: a reply that has a development or a clue to bring in gets
  // short sheets and no character upkeep; a reply without one gets full sheets and the fixes for anyone who has drifted.
  const heavy = !!asked || developments.length > 0 || mystery.vital.some(l => l.startsWith('A clue is within reach') || l.startsWith('The mystery has been quiet'));
  if (!heavy && !guided && present.length) {
    const reply = m.reply;
    for (const person of present.slice(0, 4)) if (person.drift && (reply === undefined || person.driftAt === undefined || reply - person.driftAt <= DRIFT_SHOW)) must(`${person.name} has been slipping. Bring them back: ${end(person.drift)}`);
    const voiced = present.filter(p => p.voice).slice(0, 4);
    if (voiced.length >= 2) lines.push(`Before writing lines for ${voiced.map(p => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}, check each sounds like their own voice above and not like the others, and that each still shows more than their one most obvious trait.`);
  }
  for (const line of mystery.suspects.slice(0, 3)) lines.push(line);
  for (const line of mystery.lines) lines.push(line);
  // People who were only talked about: a name being said is not an entrance. Anyone a planned step brings in is left out.
  const coming = new Set(developments.flatMap(d => d.thread.people));
  const named = guided ? [] : spokenOf(notebook, input.recent, present).filter(p => !coming.has(p.id)).slice(0, 3);
  if (named.length) {
    lines.push('Named in the chat but not in the scene. Unless the latest messages already show them here, a name being said does not bring anyone in: they carry on with their own day elsewhere, until the player goes to them or they have a reason of their own to come.');
    for (const person of named) lines.push(`- ${person.name}: ${end(fit(person.doing || `wants ${person.wants || 'something of their own'}`, 160))}`);
  }
  if (seeds.echo) lines.push(`Something that happened elsewhere can reach the player in passing, as news, a rumor, an overheard remark, or a message, only if it fits: ${end(seeds.echo.detail)}`);
  // Someone not met yet, so the world is not just the main cast.
  const unmet = notebook.people.filter(p => p.status === 'active' && !p.met && !present.includes(p) && !named.includes(p));
  // New and returning faces come in calm stretches. A story that is one big moment after another never has one, so
  // once nobody new has turned up for a long while, anything but the aftermath of a big moment will do.
  const roomForFaces = !quiet && pace !== 'quiet' && ((!quietTime && (notebook.rhythm === 'calm' || notebook.rhythm === 'stalled' || pace === 'fast'))
    || (pace === 'auto' && notebook.rhythm !== 'aftermath' && (input.sinceNewFace ?? 0) >= NEW_FACE_GAP));
  const newcomer = roomForFaces ? unmet.find(p => main?.people.includes(p.id)) ?? (opening ? undefined : unmet[0]) : undefined;
  if (newcomer && lines.length < 16) lines.push(`Someone who could appear if it fits: ${newcomer.name}${newcomer.role ? `, ${newcomer.role}` : ''}. Wants ${newcomer.wants || 'something of their own'}.`);
  // Someone met a while ago comes back, so the cast recurs instead of being met once and forgotten.
  const back = !newcomer && roomForFaces ? input.away?.find(p => !named.includes(p)) : undefined;
  if (back && lines.length < 16) lines.push(`Someone the player hasn't seen in a while could cross their path again, if it fits naturally (a run-in, a message, a visit), for reasons of their own: ${back.name}${back.role ? `, ${back.role}` : ''}. Wants ${back.wants || 'something of their own'}.`);
  // Lies the player character told someone in this scene: they remember what they were told.
  const told = guided ? [] : (notebook.covers ?? []).filter(c => c.by === 'player' && c.status !== 'exposed' && c.told.some(id => present.some(p => p.id === id))).slice(0, 2);
  for (const c of told) {
    const heard = notebook.people.filter(p => c.told.includes(p.id) && present.includes(p)).map(p => p.name).join(' and ');
    const bare = (t: string) => t.trim().replace(/[.!?]+$/, '');
    lines.push(`The player character told ${heard}: "${bare(c.said)}"${c.hides ? `, to cover ${bare(c.hides)}` : ''}. They remember it${c.status === 'strained' ? ' and are starting to doubt it' : ''}; it can come up, and details should stay consistent with it.`);
  }
  // Fuller sheets for the people here who have one, like short character cards: kept apart from the length limit above.
  // On a reply busy with plot, two short sheets; otherwise up to three in full.
  const sheets = present.filter(p => p.sheet || p.own).slice(0, heavy ? 2 : 3).map(p => { const whole = `${p.own ? ` ${end(p.own)}` : ''}${p.sheet ? ` ${end(p.sheet)}` : ''}`.trim(); return `${p.name}: ${heavy ? fit(whole, SHEET_SHORT) : whole.slice(0, 2600)}`; });
  const rules = 'The latest messages decide what actually happened; skip anything they have made impossible. Never write the player character\'s actions, words, thoughts, or feelings. Keep secrets hidden and let them show only through small details.\n' + PROBLEMS + ' ' + GROUND;
  // Too long: drop whole lines from the end of the guidance, but never what the narrator must do, and never the rules.
  while (lines.join('\n').length > ROOM) {
    let at = lines.length - 1;
    while (at >= 0 && vital.has(lines[at])) at--;
    if (at < 0) break;
    lines.splice(at, 1);
  }
  // A heading whose items were all dropped says nothing.
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].endsWith(':') && !vital.has(lines[i]) && !(lines[i + 1] ?? '').startsWith('- ')) lines.splice(i, 1);
  const cast = sheets.length ? `\nWho they are, in full (play them true to this, and let it show in what they do, not in explanations):\n${sheets.join('\n')}` : '';
  return `${lines.join('\n')}${cast}\n${rules}`;
}

/** One spoiler-free line for the macro and the panel. */
export function paceLine(pace: Pace, notebook: Notebook): string {
  return pace === 'auto' ? RHYTHM[notebook.rhythm] : PACE[pace];
}
