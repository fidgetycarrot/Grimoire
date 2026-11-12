import { NotebookError, type Moment, type Notebook, type Person } from './notebook';

/**
 * A mystery the player can actually solve.
 *
 * The answer is decided once, when the mystery is written, and kept here. The narrator is never told it while the
 * mystery is open: it gets the question, one clue at a time, and how each suspect tells their side. A narrator
 * that does not know the answer cannot blurt it out, and cannot agree with whatever the player guesses.
 *
 * Code, not the model, keeps it fair after that:
 * - The answer, what each clue means, and what each suspect really did are locked. A later update can add clues,
 *   mark clues found, and record the player's guesses, but it cannot change what is true.
 * - A clue only ever goes from hidden to found. A mystery only ever goes from open to ended.
 * - The player's guess is judged against the locked answer. When it is right, the narrator is given the answer so
 *   it can come out; when it is wrong, nobody confirms it.
 */
export interface Clue {
  id: string; /** Exactly what the player sees, hears, or is told. Narrator-safe. */ text: string;
  /** The place, thing, or situation it is found in. Narrator-safe. */ where: string;
  /** Ids of people who hold it or can tell it. */ people: string[];
  /** What it really shows. Hidden. */ means: string;
  /** A true clue points to the answer; a false trail has an innocent explanation. */ points: 'truth' | 'false';
  status: 'hidden' | 'found'; /** Code-owned: the reply it was found at. */ foundAt?: number; quick?: true;
}
export interface Suspect {
  person: string; /** Why the player might suspect them. Narrator-safe. */ motive: string;
  /** Their side of it, as they tell it. Narrator-safe; may be a lie. */ says: string;
  /** How they act when pressed: outward behaviour only. Narrator-safe. */ tell: string;
  /** What they really did, saw, and know. Hidden. */ did: string;
}
export interface Theory { text: string; verdict: 'right' | 'partly' | 'wrong'; /** Code-owned. */ atReply?: number; quick?: true }
export interface Mystery {
  /** The mystery as the player meets it. Gives nothing away. */ question: string;
  answer: string; /** The person behind it, if one person is. */ culprit: string; how: string; why: string;
  /** How the answer comes out by itself, at a cost, if the player never works it out. Hidden. */ ifUnsolved: string;
  /** The thread that carries it. */ thread: string;
  suspects: Suspect[]; clues: Clue[]; theories: Theory[];
  /** solved: the player worked it out. revealed: it came out another way. */ status: 'open' | 'solved' | 'revealed';
  /** A narrator-safe correction, when the chat said something that does not fit the answer. */ fix: string;
  /** Code-owned reply counts. */ startReply?: number; endReply?: number;
}
export const MYSTERY = Object.freeze({ clues: 12, minClues: 6, minTrue: 4, minFalse: 1, suspects: 6, minSuspects: 3, theories: 8, /** Replies between clues, at the least. */ spacing: 3, /** How long the answer stays in the note after it comes out. */ aftermath: 8 });

type Raw = Record<string, unknown>;
const record = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
const plain = (v: unknown, max = 600) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (v: unknown) => plain(v, 80).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const VERDICT: Record<string, Theory['verdict']> = { right: 'right', correct: 'right', true: 'right', solved: 'right', partly: 'partly', partial: 'partly', partially: 'partly', close: 'partly', wrong: 'wrong', incorrect: 'wrong', false: 'wrong' };

/**
 * Changes to a mystery, laid over the one that exists: clues are matched by id (a clue given with only an id and a
 * status keeps everything else), guesses are added, and single fields replace. With no mystery yet, the changes
 * are the mystery.
 */
export function overlayMystery(base: Mystery | undefined, changes: unknown): unknown {
  if (!base) return changes;
  const c = record(changes), out: Raw = structuredClone(base) as unknown as Raw;
  const clues = [...base.clues] as unknown as Raw[];
  for (const item of array(c.clues)) {
    const raw = record(item), id = slug(raw.id), at = clues.findIndex(x => x.id === id);
    if (at >= 0) clues[at] = { ...clues[at], ...raw, id }; else clues.push(raw);
  }
  out.clues = clues;
  const suspects = [...base.suspects] as unknown as Raw[];
  for (const item of array(c.suspects)) {
    const raw = record(item), at = suspects.findIndex(x => x.person === slug(raw.person));
    if (at >= 0) suspects[at] = { ...suspects[at], ...raw, person: suspects[at].person }; else suspects.push(raw);
  }
  out.suspects = suspects;
  out.theories = [...base.theories, ...array(c.theories)];
  for (const key of ['status', 'fix'] as const) if (c[key] !== undefined && c[key] !== null) out[key] = c[key];
  return out;
}

/** Make a model's mystery regular: plain text, known people, known thread, sensible limits. Nothing is invented. */
export function tidyMystery(value: unknown, who: Map<string, string>, threads: Map<string, string>, previous?: Mystery): Mystery | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return previous ? structuredClone(previous) : undefined;
  const input = record(value), truth = record(input.truth);
  const person = (v: unknown) => who.get(slug(v)) ?? '';
  const seen = new Set<string>();
  const clues = array(input.clues).map(raw => {
    const c = record(raw), text = plain(c.text ?? c.detail, 300);
    let id = slug(c.id) || slug(text).slice(0, 30) || 'clue';
    for (let n = 2; seen.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    seen.add(id);
    const points = /false|red|herring|mislead|decoy/i.test(plain(c.points, 40)) ? 'false' as const : 'truth' as const;
    return { id, text, where: plain(c.where, 200), people: [...new Set(array(c.people).map(person).filter(Boolean))].slice(0, 4), means: plain(c.means, 400), points,
      status: /^(found|seen|known|discovered|shown|revealed)$/i.test(plain(c.status, 40)) ? 'found' as const : 'hidden' as const };
  }).filter(c => c.text);
  const taken = new Set<string>();
  const suspects = array(input.suspects).map(raw => {
    const s = record(raw);
    return { person: person(s.person ?? s.id ?? s.name), motive: plain(s.motive, 300), says: plain(s.says, 400), tell: plain(s.tell, 300), did: plain(s.did, 500) };
  }).filter(s => s.person && !taken.has(s.person) && !!taken.add(s.person));
  const theories = array(input.theories).map(raw => {
    const t = typeof raw === 'string' ? { text: raw } as Raw : record(raw), verdict = VERDICT[plain(t.verdict, 20).toLowerCase()];
    return verdict ? { text: plain(t.text, 300), verdict, ...(typeof t.atReply === 'number' ? { atReply: t.atReply } : {}), ...(t.quick === true ? { quick: true as const } : {}) } : null;
  }).filter((t): t is NonNullable<typeof t> => !!t && !!t.text);
  const word = plain(input.status, 20).toLowerCase();
  const answer = plain(input.answer ?? truth.answer ?? input.solution, 600);
  if (!answer && !plain(input.question, 300)) return previous ? structuredClone(previous) : undefined;
  return {
    question: plain(input.question, 300), answer, culprit: person(input.culprit ?? truth.who ?? truth.culprit),
    how: plain(input.how ?? truth.how, 500), why: plain(input.why ?? truth.why, 500), ifUnsolved: plain(input.ifUnsolved, 400),
    thread: threads.get(slug(input.thread)) ?? previous?.thread ?? '',
    suspects: suspects.slice(0, MYSTERY.suspects), clues: clues.slice(0, MYSTERY.clues + 4), theories,
    status: word === 'solved' ? 'solved' : /reveal|came|out|failed|lost|closed|ended/.test(word) ? 'revealed' : 'open',
    fix: plain(input.fix, 400),
    ...(typeof input.startReply === 'number' ? { startReply: input.startReply } : {}), ...(typeof input.endReply === 'number' ? { endReply: input.endReply } : {}),
  };
}

/** The strict check: a mystery the rest of the code can rely on. */
export function validateMystery(value: unknown, personIds: Set<string>, threadIds: Set<string>): Mystery | undefined {
  if (value === undefined || value === null) return undefined;
  const m = record(value), fail = (message: string): never => { throw new NotebookError(message); };
  const text = (v: unknown, path: string, max: number, required = false) => {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(`mystery.${path} must be text.`);
    const out = (v as string).trim();
    if (out.length > max) fail(`mystery.${path} must be at most ${max} characters.`);
    if (required && !out) fail(`mystery.${path} must not be empty.`);
    return out;
  };
  const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000_000 ? v : undefined;
  const ids = new Set<string>();
  const clues = array(m.clues).slice(0, MYSTERY.clues + 4).map((raw, i): Clue => {
    const c = record(raw), id = typeof c.id === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(c.id) ? c.id : fail(`mystery.clues[${i}].id must be a short lowercase id.`);
    if (ids.has(id)) fail(`mystery.clues has two clues with the id "${id}".`);
    ids.add(id);
    return { id, text: text(c.text, `clues[${i}].text`, 300, true), where: text(c.where, `clues[${i}].where`, 200), people: array(c.people).filter((p): p is string => typeof p === 'string' && personIds.has(p)).slice(0, 4),
      means: text(c.means, `clues[${i}].means`, 400), points: c.points === 'false' ? 'false' : 'truth', status: c.status === 'found' ? 'found' : 'hidden',
      ...(count(c.foundAt) !== undefined ? { foundAt: count(c.foundAt) } : {}), ...(c.quick === true ? { quick: true as const } : {}) };
  });
  const suspects = array(m.suspects).slice(0, MYSTERY.suspects).map((raw, i): Suspect | null => {
    const s = record(raw);
    if (typeof s.person !== 'string' || !personIds.has(s.person)) return null;
    return { person: s.person, motive: text(s.motive, `suspects[${i}].motive`, 300), says: text(s.says, `suspects[${i}].says`, 400), tell: text(s.tell, `suspects[${i}].tell`, 300), did: text(s.did, `suspects[${i}].did`, 500) };
  }).filter((s): s is Suspect => !!s);
  const theories = array(m.theories).slice(-MYSTERY.theories).map((raw, i): Theory => {
    const t = record(raw);
    return { text: text(t.text, `theories[${i}].text`, 300, true), verdict: t.verdict === 'right' || t.verdict === 'partly' ? t.verdict : 'wrong',
      ...(count(t.atReply) !== undefined ? { atReply: count(t.atReply) } : {}), ...(t.quick === true ? { quick: true as const } : {}) };
  });
  return {
    question: text(m.question, 'question', 300, true), answer: text(m.answer, 'answer', 600, true),
    culprit: typeof m.culprit === 'string' && personIds.has(m.culprit) ? m.culprit : '', how: text(m.how, 'how', 500), why: text(m.why, 'why', 500), ifUnsolved: text(m.ifUnsolved, 'ifUnsolved', 400),
    thread: typeof m.thread === 'string' && threadIds.has(m.thread) ? m.thread : '',
    suspects, clues, theories, status: m.status === 'solved' || m.status === 'revealed' ? m.status : 'open', fix: text(m.fix, 'fix', 400),
    ...(count(m.startReply) !== undefined ? { startReply: count(m.startReply) } : {}), ...(count(m.endReply) !== undefined ? { endReply: count(m.endReply) } : {}),
  };
}

/**
 * What is wrong with a newly written mystery, in words for the model. A mystery that can't be solved by reasoning,
 * or that the narrator could give away, is worse than none, and the player would not notice until much later.
 */
export function mysteryProblems(notebook: Notebook): string[] {
  const m = notebook.mystery, out: string[] = [];
  if (!m) return ['Return "mystery": the question, its full answer, the suspects, and the clues, as described.'];
  const real = m.clues.filter(c => c.points === 'truth'), decoys = m.clues.filter(c => c.points === 'false');
  if (m.answer.length < 30 || !m.how || !m.why) out.push('mystery: write the full answer in "answer" (one or two sentences), and fill in "how" and "why". Decide it completely before anything else.');
  if (m.culprit && !m.suspects.some(s => s.person === m.culprit)) out.push('mystery.suspects must include the person named in "culprit".');
  const culprit = notebook.people.find(p => p.id === m.culprit);
  if (culprit && culprit.status !== 'active') out.push('mystery.culprit must be someone active in the story, whom the player has met or can meet soon.');
  if (m.suspects.length < MYSTERY.minSuspects) out.push(`mystery.suspects needs at least ${MYSTERY.minSuspects} people from "people" (use their ids), each with "motive", "says", "tell", and "did". The innocent ones have something else to hide.`);
  for (const s of m.suspects) if (!s.says || !s.did || !s.motive) { out.push('Every suspect needs "motive" (why the player might suspect them), "says" (their side, as they tell it), and "did" (what they really did and know).'); break; }
  if (m.clues.length < MYSTERY.minClues || real.length < MYSTERY.minTrue) out.push(`mystery.clues needs at least ${MYSTERY.minClues} clues, at least ${MYSTERY.minTrue} of them true ("points": "truth"). Together the true clues must be enough to reach the answer by reasoning.`);
  if (decoys.length < MYSTERY.minFalse) out.push('mystery.clues needs at least one false trail ("points": "false") with an innocent explanation in "means".');
  if (decoys.length > real.length) out.push('mystery.clues has more false trails than true clues. The true clues must carry the mystery.');
  if (m.clues.some(c => !c.means || !c.where && !c.people.length)) out.push('Every clue needs "means" (what it really shows) and either "where" (the place or situation it is found in) or "people" (who can tell it).');
  if (m.clues.some(c => same(c.text, c.means) || same(c.text, m.answer))) out.push('A clue\'s "text" is only what is seen, heard, or said. What it shows goes in "means"; the two must differ, and no clue states the answer.');
  // Spread out: a mystery solved by searching one room or questioning one person is not a mystery.
  const spots = new Set(m.clues.map(c => c.people[0] ?? c.where.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3).slice(0, 2).join(' ')));
  if (m.clues.length >= MYSTERY.minClues && spots.size < 3) out.push('Spread the clues over at least three different places or people.');
  const thread = notebook.threads.find(t => t.id === m.thread);
  if (!thread) out.push('mystery.thread must be the id of the thread that carries the mystery.');
  else {
    if (thread.status !== 'open' || thread.steps.filter(s => s.status === 'waiting').length < 2) out.push(`The mystery's thread "${thread.id}" must be open with at least two waiting steps: things that happen while it is unsolved (another incident, pressure on someone, a deadline).`);
    if (!thread.hint) out.push(`The mystery's thread "${thread.id}" needs a narrator-safe "hint" that gives nothing away.`);
  }
  if (!m.ifUnsolved) out.push('mystery.ifUnsolved: say how the answer comes out by itself, at a cost, if the player never works it out.');
  const where = mysteryLeaks(notebook);
  if (where.length) out.push(`The answer must live only in "mystery". These seem to give it away: ${where.join('; ')}. Rewrite them as what would be seen from outside; they can reach the narrator or be surfaced early.`);
  return out;
}
/** On a second try: is it at least playable? A thin mystery is refused rather than run. */
export function mysteryPlayable(notebook: Notebook): boolean {
  const m = notebook.mystery;
  return !!m && m.answer.length >= 20 && m.clues.filter(c => c.points === 'truth' && c.means).length >= 3 && m.suspects.length >= 2 && !!notebook.threads.find(t => t.id === m.thread);
}
const STOP = new Set(['with', 'from', 'that', 'this', 'near', 'when', 'where', 'into', 'their', 'them', 'they', 'have', 'someone', 'something', 'about', 'after', 'before', 'while', 'there', 'under', 'over', 'took', 'take', 'then', 'what', 'were', 'been', 'will', 'would', 'could', 'because', 'which', 'only', 'also', 'really', 'himself', 'herself', 'itself', 'other', 'another', 'during', 'night', 'really']);
const tokens = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !STOP.has(w));
/**
 * Places the narrator can see (or that can be surfaced early) which seem to give the answer away.
 *
 * Word for word is certain. Beyond that it is a judgment by numbers: a line that names the one behind it together
 * with several of the answer's own words, or that carries many of them by itself, reads as the answer. The words
 * of the question are public and do not count.
 */
/** The test itself: does this text read as the answer? `own` is for the notes on the one behind it, who is named in them anyway. */
function leakTest(notebook: Notebook): ((text: string, own?: boolean) => boolean) | null {
  const m = notebook.mystery;
  if (!m || m.status !== 'open' || m.answer.length < 20) return null;
  const culprit = notebook.people.find(p => p.id === m.culprit);
  const names = culprit ? [culprit.name, ...culprit.aliases].map(n => n.toLowerCase()).filter(n => n.length >= 3) : [];
  const open = new Set([...tokens(m.question), ...names.flatMap(tokens)]);
  const key = new Set(tokens(`${m.answer} ${m.how} ${m.why}`).filter(w => !open.has(w)));
  const score = (text: string) => new Set(tokens(text).filter(w => key.has(w))).size;
  return (text, own = false) => {
    if (!text) return false;
    const low = text.toLowerCase();
    if (low.includes(m.answer.toLowerCase())) return true;
    const named = names.some(n => low.includes(n));
    return own ? score(text) >= 4 : (named && score(text) >= 3) || score(text) >= 5;
  };
}
export function mysteryLeaks(notebook: Notebook): string[] {
  const hit = leakTest(notebook), m = notebook.mystery;
  if (!hit || !m) return [];
  const out: string[] = [];
  if (notebook.story.hiddenTruth.some(t => hit(t))) out.push('story.hiddenTruth');
  if (hit(notebook.story.twist) || hit(notebook.arc.turn)) out.push('the twist');
  if (hit(notebook.recap) || hit(notebook.summary)) out.push('recap and summary');
  for (const t of notebook.threads) if (t.status !== 'closed' && (hit(t.hint) || t.steps.some(s => s.status === 'waiting' && (hit(s.text) || hit(s.sign))))) out.push(`the hint and waiting steps of thread "${t.id}"`);
  if (notebook.beats.some(b => b.status === 'possible' && (hit(b.text) || hit(b.purpose)))) out.push('possible beats');
  if (notebook.seeds.some(s => (s.status === 'waiting' || s.status === 'planted') && (hit(s.detail) || hit(s.payoff)))) out.push('seeds');
  for (const p of notebook.people) if (p.status === 'active' && [p.hint, p.doing, p.sheet, p.depth].some(f => hit(f, p.id === m.culprit))) out.push(`the hint, doing, depth, or sheet of "${p.id}"`);
  return [...new Set(out)].slice(0, 6);
}
/**
 * When asking did not help: take the answer back out by hand. Each line that reads as the answer goes back to what
 * it said before; one that is new is dropped or blanked. Nothing that already happened is touched.
 */
export function scrubLeaks(revised: Notebook, previous: Notebook | null): Notebook {
  const hit = leakTest(revised), m = revised.mystery;
  if (!hit || !m) return revised;
  const out = structuredClone(revised);
  out.story.hiddenTruth = out.story.hiddenTruth.filter(t => !hit(t));
  if (hit(out.story.twist)) out.story.twist = '';
  if (hit(out.arc.turn)) out.arc.turn = previous && !hit(previous.arc.turn) ? previous.arc.turn : '';
  if (hit(out.recap)) out.recap = previous && !hit(previous.recap) ? previous.recap : '';
  if (hit(out.summary)) out.summary = '';
  for (const t of out.threads) {
    if (t.status === 'closed') continue;
    const old = previous?.threads.find(x => x.id === t.id);
    if (hit(t.hint)) t.hint = old && !hit(old.hint) ? old.hint : t.id === m.thread ? m.question : '';
    t.steps = t.steps.flatMap(step => {
      if (step.status !== 'waiting' || !(hit(step.text) || hit(step.sign))) return [step];
      const before = old?.steps.find(x => x.id === step.id);
      // A step that existed must stay (steps are never removed): it goes back to its old words, or to a neutral line.
      if (before) return [hit(before.text) || hit(before.sign) ? { ...step, text: 'Something about this shifts.', sign: '' } : { ...step, text: before.text, sign: before.sign }];
      return [];
    });
  }
  for (const b of out.beats) if (b.status === 'possible' && (hit(b.text) || hit(b.purpose))) b.status = 'dropped';
  for (const seed of out.seeds) if ((seed.status === 'waiting' || seed.status === 'planted') && (hit(seed.detail) || hit(seed.payoff))) seed.status = 'dropped';
  for (const p of out.people) {
    if (p.status !== 'active') continue;
    const own = p.id === m.culprit, old = previous?.people.find(x => x.id === p.id);
    for (const field of ['hint', 'doing', 'sheet', 'depth'] as const) if (hit(p[field], own)) p[field] = old && !hit(old[field], own) ? old[field] : '';
  }
  return out;
}
/** For a later update: what to say when the answer has drifted into the narrator's view. */
export function leakProblems(notebook: Notebook): string[] {
  const where = mysteryLeaks(notebook);
  return where.length ? [`The mystery is still open, and its answer seems to have reached places the narrator can see: ${where.join('; ')}. Rewrite those so they give nothing away: what would be seen from outside, not what is really going on. The answer lives only in "mystery".`] : [];
}
/** Times a model wrote are dropped; a fresh mystery starts with nothing found by code's count. */
export function withoutMysteryTimes(m: Mystery | undefined): Mystery | undefined {
  if (!m) return undefined;
  const { startReply: _s, endReply: _e, ...rest } = m;
  return { ...rest, clues: m.clues.map(({ foundAt: _f, quick: _q, ...c }) => c), theories: m.theories.map(({ atReply: _a, quick: _q, ...t }) => t) };
}
/** After the player edits the notebook by hand: anything may change, but recorded reply counts stay with their clues. */
export function carryMysteryTimes(previous: Mystery | undefined, edited: Mystery | undefined): Mystery | undefined {
  if (!edited) return undefined;
  const bare = withoutMysteryTimes(edited)!;
  if (!previous) return bare;
  return { ...bare, ...(previous.startReply !== undefined ? { startReply: previous.startReply } : {}), ...(previous.endReply !== undefined && bare.status !== 'open' ? { endReply: previous.endReply } : {}),
    clues: bare.clues.map(c => { const old = previous.clues.find(x => x.id === c.id); return c.status === 'found' && old?.foundAt !== undefined ? { ...c, foundAt: old.foundAt } : c; }),
    theories: bare.theories.map(t => { const old = previous.theories.find(x => same(x.text, t.text)); return old?.atReply !== undefined ? { ...t, atReply: old.atReply } : t; }) };
}
/** Fill in code-owned reply counts. */
export function stampMystery(m: Mystery | undefined, now: Moment): Mystery | undefined {
  if (!m || now.reply === undefined) return m;
  const reply = now.reply;
  return { ...m, startReply: m.startReply ?? reply, ...(m.status !== 'open' && m.endReply === undefined ? { endReply: reply } : {}),
    clues: m.clues.map(c => c.status === 'found' && c.foundAt === undefined ? { ...c, foundAt: reply } : c), theories: m.theories.map(t => t.atReply === undefined ? { ...t, atReply: reply } : t) };
}

/**
 * The lock. Whatever a later update says, the mystery that was written stays true.
 *
 * `fresh` allows a mystery where there was none, or a new one once the last has ended. Otherwise a mystery only
 * appears when the player asks for one.
 */
export function lockMystery(previous: Mystery | undefined, revised: Mystery | undefined, fresh = false): Mystery | undefined {
  if (!previous || (fresh && previous.status !== 'open' && revised && !same(revised.question, previous.question))) {
    if (!fresh || !revised) return previous;
    return { ...withoutMysteryTimes(revised)!, status: 'open', theories: [], clues: revised.clues.slice(0, MYSTERY.clues) };
  }
  if (!revised) return previous;
  // Old clues keep their words and their meaning. Where a clue can be found may move with the story.
  const clues: Clue[] = previous.clues.map(old => {
    const next = revised.clues.find(c => c.id === old.id);
    if (!next) return old;
    const found = old.status === 'found' || next.status === 'found';
    const { quick: _quick, ...kept } = old;
    return { ...kept, where: next.where || old.where, people: next.people.length ? next.people : old.people, status: found ? 'found' : 'hidden' };
  });
  // New clues are welcome while it is open, as long as they add up: a late flood of false trails would bury it.
  if (previous.status === 'open') for (const clue of revised.clues) {
    if (clues.length >= MYSTERY.clues || clues.some(c => c.id === clue.id || same(c.text, clue.text)) || !clue.means) continue;
    if (clue.points === 'false' && clues.filter(c => c.points === 'false').length >= clues.filter(c => c.points === 'truth').length - 1) continue;
    const { foundAt: _f, ...rest } = clue;
    clues.push(rest);
  }
  // Suspects: what they really did is fixed. How they tell it can change as they are caught out.
  const suspects: Suspect[] = previous.suspects.map(old => {
    const next = revised.suspects.find(s => s.person === old.person);
    return next ? { ...old, motive: next.motive || old.motive, says: next.says || old.says, tell: next.tell || old.tell } : old;
  });
  for (const s of revised.suspects) if (previous.status === 'open' && suspects.length < MYSTERY.suspects && !suspects.some(x => x.person === s.person) && s.did) suspects.push(s);
  // Guesses already judged stay; new ones are added.
  const theories = [...previous.theories];
  for (const t of revised.theories) if (!theories.some(x => same(x.text, t.text))) theories.push(t);
  const status = previous.status !== 'open' ? previous.status : revised.status;
  return { ...previous, clues, suspects, theories: theories.slice(-MYSTERY.theories), status, fix: status === 'open' ? revised.fix : '' };
}

/**
 * Keep the notebook around the mystery in order: its thread stays open while it is open, and once the answer is
 * out it is an established fact like any other secret that came out.
 */
export function settleMystery(notebook: Notebook): Notebook {
  const m = notebook.mystery;
  if (!m) return notebook;
  if (m.status === 'open') {
    const thread = notebook.threads.find(t => t.id === m.thread);
    if (!thread || (thread.status === 'open' && thread.hint)) return notebook;
    return { ...notebook, threads: notebook.threads.map(t => t.id !== m.thread ? t : { ...t, status: 'open' as const, closedReason: '', hint: t.hint || m.question }) };
  }
  const told = notebook.story.cameOut.some(r => same(r.text, m.answer));
  return told ? notebook : { ...notebook, story: { ...notebook.story, hiddenTruth: notebook.story.hiddenTruth.filter(t => !same(t, m.answer)), cameOut: [...notebook.story.cameOut, { text: m.answer }].slice(-12) } };
}

// ----- The narrator's note ------------------------------------------------------

const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'near', 'room', 'when', 'where', 'into', 'their', 'them', 'they', 'have', 'someone', 'something', 'about', 'after', 'before', 'while', 'there'].includes(w)));
const shared = (a: string, b: string) => { const x = words(a), y = words(b); return [...x].filter(w => y.has(w)).length; };
const overlap = (a: string, b: string) => shared(a, b) > 0;
const lastProgress = (m: Mystery) => Math.max(m.startReply ?? 0, ...m.clues.map(c => c.foundAt ?? 0), ...m.theories.map(t => t.atReply ?? 0));

/** How many replies a quiet mystery waits before a clue comes to the player by itself. */
export const clueGap = (now: Moment) => Math.max(6, Math.round((now.waits?.steady ?? 15) * 0.6));
/**
 * The one clue on offer right now, if any. A clue is near when someone who holds it is in the scene or the scene
 * is where it is found. Clues are spaced out, so a suspect who is always around does not hand over everything at
 * once; and a mystery that has gone quiet sends its next clue to wherever the player is.
 */
export function clueNow(m: Mystery, present: string[], place: string, now: Moment): { clue: Clue; near: boolean } | null {
  if (m.status !== 'open') return null;
  const hidden = m.clues.filter(c => c.status === 'hidden');
  if (!hidden.length) return null;
  // The best fit for the scene: someone here holds it, or the place matches, the closer the better.
  const fit = (c: Clue) => (c.people.some(p => present.includes(p)) ? 2 : 0) + (place ? shared(c.where, place) : 0);
  const near = [...hidden].sort((a, b) => fit(b) - fit(a)).find(c => fit(c) > 0);
  if (now.reply === undefined) return near ? { clue: near, near: true } : null;
  const since = now.reply - lastProgress(m);
  if (near && since >= MYSTERY.spacing) return { clue: near, near: true };
  const gap = clueGap(now);
  if (since < gap) return null;
  // True clues first, so a player who waits is never fed only false trails; each gets a few replies before the next has a go.
  const order = [...hidden.filter(c => c.points === 'truth'), ...hidden.filter(c => c.points === 'false')];
  return { clue: order[Math.floor((since - gap) / 4) % order.length], near: false };
}
/** The mystery has run long enough without an answer that it now ends by itself. */
export function runsOut(m: Mystery, now: Moment): boolean {
  if (m.status !== 'open' || now.reply === undefined || m.startReply === undefined) return false;
  const steady = now.waits?.steady ?? 15, slow = now.waits?.slow ?? 40;
  const allFound = m.clues.filter(c => c.points === 'truth').every(c => c.status === 'found');
  return (allFound && now.reply - lastProgress(m) >= steady * 2) || now.reply - m.startReply >= slow * 4 && now.reply - lastProgress(m) >= steady;
}

export interface MysteryNote { /** Lines that are never cut. */ vital: string[]; /** Background that can be shortened or dropped. */ lines: string[]; /** One line per suspect in the scene. */ suspects: string[] }
const end = (text: string) => `${text.trim().replace(/[.!?]+$/, '')}.`;
/** A question keeps its question mark. */
const asked = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
const clip = (text: string, max: number) => { const t = text.trim(); return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`; };

/**
 * What the narrator is told. While the mystery is open that never includes the answer, what a clue means, or what
 * anyone really did. `quiet` (a guided swipe, an intimate scene, plans being reworked) keeps the rule and holds
 * the clues back.
 */
export function mysteryNote(notebook: Notebook, present: Person[], place: string, now: Moment, quiet: boolean): MysteryNote {
  const m = notebook.mystery, out: MysteryNote = { vital: [], lines: [], suspects: [] };
  if (!m) return out;
  const reply = now.reply;
  if (m.status !== 'open') {
    // The answer is out. For a while the narrator needs all of it, so the ending plays true.
    if (reply !== undefined && m.endReply !== undefined && reply - m.endReply > MYSTERY.aftermath) return out;
    const truth = `${end(m.answer)}${m.how ? ` How: ${end(m.how)}` : ''}${m.why ? ` Why: ${end(m.why)}` : ''}`;
    out.vital.push(m.status === 'solved'
      ? `The player has solved the mystery (${clip(m.question, 160)}). They are right, and now it comes out: ${truth} Let it play out through what people do and say (proof that can't be denied, someone breaking, a confession), over this reply and the next few rather than in one line, and let it land as the player's win.`
      : `The mystery's answer has come out (${clip(m.question, 160)}): ${truth} From here on this is established; keep everything consistent with it, and let people react to it.`);
    return out;
  }
  out.vital.push(`A mystery runs through this story: ${asked(clip(m.question, 220))} Its answer is kept from you so that it cannot slip out. Do not decide it, hint at who or what is behind it, or let anyone confess, be caught in the act, or confirm a guess. Do not make up evidence, witnesses, or new facts about it: only the clues given in these notes exist. If the player names an answer or accuses someone, nobody confirms or denies it in this reply: people react, and the moment hangs.`);
  if (m.fix) out.vital.push(`Something said earlier does not fit this mystery. Set it straight, without drawing attention to it: ${end(clip(m.fix, 300))}`);
  if (runsOut(m, now) && !quiet) {
    out.vital.push(`This mystery has run its course without being solved, and now comes out by itself${m.ifUnsolved ? `: ${end(clip(m.ifUnsolved, 300))}` : '.'} The answer, which you may now show: ${end(m.answer)}${m.how ? ` How: ${end(m.how)}` : ''}${m.why ? ` Why: ${end(m.why)}` : ''} Let it cost something, and let the player see what they missed.`);
    return out;
  }
  const last = m.theories.at(-1);
  if (last && reply !== undefined && last.atReply !== undefined && reply - last.atReply <= 2) {
    out.vital.push(last.verdict === 'partly'
      ? 'The player has just named an answer to the mystery, and has part of it. Nobody confirms which part. Those who know more show it without meaning to (a flinch, a silence, a denial that comes too fast), and the question stays open.'
      : 'The player has just named an answer to the mystery, and it is not right. Nobody tells them so outright. It falls short the way a wrong guess does: whoever they accused, if they are here, reacts as a person wrongly accused would, and what the player already knows still does not quite fit. Do not offer the real answer or point toward it.');
  }
  for (const person of present) {
    const s = m.suspects.find(x => x.person === person.id);
    if (s?.says) out.suspects.push(`- About the mystery, ${person.name} says: ${end(clip(s.says, 220))}${s.tell ? ` When pressed: ${end(clip(s.tell, 160))}` : ''}`);
  }
  const found = m.clues.filter(c => c.status === 'found').sort((a, b) => (a.foundAt ?? 0) - (b.foundAt ?? 0)).slice(-6);
  if (found.length) out.lines.push(`What the player has found out about the mystery so far (these are facts; keep them true, and do not explain what they mean): ${found.map(c => end(clip(c.text, 130))).join(' ')}`);
  if (quiet) return out;
  const offer = clueNow(m, present.map(p => p.id), place, now);
  if (offer) {
    const holder = notebook.people.find(p => offer.clue.people.includes(p.id) && p.status === 'active');
    out.vital.push(offer.near
      ? `A clue is within reach in this scene${offer.clue.where ? ` (${clip(offer.clue.where, 120)})` : ''}. If the player looks, asks, or pays attention, let them come across it; if they do nothing, let it catch their eye in passing. Show only what is seen or said, and do not explain what it means: ${end(clip(offer.clue.text, 300))}`
      : `The mystery has been quiet for a while. Let this clue reach the player where they are, by a route that fits (${holder ? `${holder.name} mentions it or lets it slip, ` : ''}something turns up, they notice it on the way). Show only what is seen or said, and do not explain what it means: ${end(clip(offer.clue.text, 300))}`);
  } else if (reply !== undefined && m.clues.filter(c => c.points === 'truth').every(c => c.status === 'found') && (reply - lastProgress(m)) % 6 === 2) {
    out.lines.push('The player now has what they need to work out the mystery. If the moment allows, give them an opening to say what they think: someone asks them outright, or a quiet moment invites it. Do not suggest an answer.');
  }
  return out;
}

// ----- The quick check ----------------------------------------------------------

/** Hidden clues to ask about after a reply: the ones the scene could have shown first. */
export function cluesToCheck(m: Mystery, scene: string, people: Person[], now: Moment, max = 5): Clue[] {
  if (m.status !== 'open') return [];
  const hidden = m.clues.filter(c => c.status === 'hidden');
  const text = scene.toLowerCase();
  const named = (c: Clue) => c.people.some(id => { const p = people.find(x => x.id === id); return !!p && [p.name, ...p.aliases].some(n => n.length >= 3 && text.includes(n.toLowerCase())); });
  const offered = clueNow(m, people.filter(p => [p.name, ...p.aliases].some(n => n.length >= 3 && text.includes(n.toLowerCase()))).map(p => p.id), scene, now)?.clue.id;
  const score = (c: Clue) => (c.id === offered ? 4 : 0) + (named(c) ? 2 : 0) + (overlap(c.where, scene) ? 1 : 0) + (overlap(c.text, scene) ? 2 : 0);
  return [...hidden].sort((a, b) => score(b) - score(a)).slice(0, max);
}

// ----- For the panel ------------------------------------------------------------

/** What the player may see outside the spoiler fold: the question, and the clues they have already found. */
export interface MysteryView { question: string; status: Mystery['status']; found: string[] }
export function mysteryView(m: Mystery | undefined): MysteryView | null {
  return m ? { question: m.question, status: m.status, found: m.clues.filter(c => c.status === 'found').sort((a, b) => (a.foundAt ?? 0) - (b.foundAt ?? 0)).map(c => c.text) } : null;
}
export const mysteryOpen = (notebook: Notebook | undefined | null) => notebook?.mystery?.status === 'open';

// ----- What the planner is told -------------------------------------------------

export const MYSTERY_SHAPE = `"mystery": {"question": "the mystery as the player meets it, in one sentence that gives nothing away", "answer": "the full solution, in one or two sentences", "culprit": "the id of the person behind it, or empty if no single person is", "how": "how it was done or came about", "why": "why",
 "ifUnsolved": "how the answer comes out by itself, at a cost, if the player never works it out", "thread": "the id of the thread that carries the mystery",
 "suspects": [{"person": "an id from people", "motive": "why the player might suspect them (narrator-safe)", "says": "their side of it, as they tell it; may be a lie (narrator-safe)", "tell": "how they act when pressed, as outward behaviour only, never what they hide (narrator-safe)", "did": "what they really did, saw, and know (hidden)"}],
 "clues": [{"id": "torn-ledger", "text": "exactly what the player sees, hears, or is told: plain facts, no interpretation (narrator-safe)", "where": "the place, thing, or situation it is found in (narrator-safe)", "people": ["ids of people who hold it or can tell it"], "means": "what it really shows (hidden)", "points": "truth|false", "status": "hidden|found"}],
 "theories": [], "status": "open", "fix": ""}`;

export const MYSTERY_RULES = `How to write a mystery the player can really solve:
- Decide the whole answer first: who or what, how, and why. Everything else is built backwards from it. It must fit everything already established in the card, the lorebook, and the chat, and contradict nothing that has happened. Scale it to this story and its tone: it need not be a murder. A theft, a disappearance, sabotage, a hidden identity, who is sending the letters, what really happened that night all work.
- Fair play. The true clues, taken together, must be enough to reach the answer by reasoning, with no guessing. No single clue gives it away. Whoever is behind it is someone the player has already met or will meet early, never a stranger brought in at the end. Nothing in the answer may rest on a fact the player has no way to learn. Nothing supernatural or convenient unless this world's established rules allow it and a clue shows it.
- The narrator never sees the answer. It sees only each clue's "text" and "where", and each suspect's "says" and "tell", so those must be safe: "text" is only what is seen, heard, or said, with no interpretation, and "tell" is outward behaviour only. What a clue shows goes in "means"; what someone really did goes in "did".
- Clues: six to ten. At least four true ones ("points": "truth"), of different kinds: a thing, something a person says, how someone behaves, a time that doesn't add up, something that should be there and is not. One to three false trails ("points": "false"), each with an innocent explanation in "means" that the player can also discover. Spread them over different places and people, so the player has to move and talk to people.
- Suspects: three to five people from "people", the one behind it among them. Each has a believable motive, and each has something to hide, so the innocent ones lie too, about something else. The guilty one's "says" is a lie that at least one true clue contradicts.
- Keep the answer only in "mystery". Not in story.hiddenTruth or twist, which can be surfaced early. Not in any thread hint, step, sign, beat, seed, recap, or summary, and not in anyone's "hint", "doing", "voice", "depth", or "sheet", which the narrator sees: for the one behind it, "doing" is what they appear to be doing.
- The mystery's thread: its waiting steps are things that happen while it stays unsolved, which the narrator can show without knowing the answer: another incident, pressure on a suspect, a deadline, a cost of delay. Its "hint" gives nothing away. The player is never told what to conclude.
- "ifUnsolved": how it comes out by itself in the end, at a cost, if the player never works it out.`;

/** For every later update, while a mystery is open. */
export const MYSTERY_KEEP = `- The mystery: "mystery" holds a mystery whose answer is locked. You cannot change its question, answer, culprit, how, why, what any existing clue says or means, or what any suspect really did; anything you return for those is ignored. In "changes" return "mystery" only with what moved: {"clues": [{"id": "an existing clue id", "status": "found"}], "theories": [{"text": "the answer the player stated", "verdict": "right|partly|wrong"}], "status": "open|solved|revealed", "fix": ""}.
  - Mark a clue "found" once the chat shows the player has seen or been told what its "text" says. A clue never goes back to hidden.
  - If the player has stated an answer or accused someone in the chat, add it to "theories" and judge it against the locked answer: right (the same person or cause), partly, or wrong. If it is right, set "status" to "solved". If the answer plainly came out in the chat another way, set "status" to "revealed". Never set either otherwise.
  - New clues: if the story has moved to new places or people and the remaining clues can no longer be reached, add a few (in full, with a new id) that fit the locked answer. You may also update where an existing clue can be found ("where", "people") when the story has moved it. Never add a clue that would make another answer true.
  - If the narrator invented evidence, a witness, a confession, or a fact that contradicts the locked answer, the answer still stands. Write "fix": one or two narrator-safe sentences that explain it away without revealing the answer (the witness was mistaken or lying, the item was planted, the confession covers for someone), and if it helps, add a clue that shows it. Empty "fix" once the chat has set it straight.
  - While it is open, keep its thread open with something still to happen, and keep the answer out of everything the narrator can see: thread hints, steps, signs, beats, seeds, recap, summary, story.hiddenTruth, twist, and people's hint, doing, voice, depth, and sheet. The one behind it keeps acting like someone with something to hide; their "doing" is what they appear to be doing.
  - Once it is solved or revealed, close its thread (outcome won if the player solved it, lost if it came out by itself), and let people's notes reflect that everyone now knows.
`;
