import { describe, expect, test } from 'bun:test';
import { ALONE_STEP, dueAlone, GUARD_REPLIES, rollEnding, settleAlone } from '../src/alone';
import { mergeRevision, validateNotebook, waitsFor, type Notebook } from '../src/notebook';
import { creationMessages } from '../src/prompts';
import { tidyNotebook } from '../src/tidy';
import { sampleNotebook } from './fixtures';

const waits = waitsFor('medium', 'auto');
const ENDINGS = { lean: 'ordinary', good: 'The neighbors patch it up on their own.', mixed: 'Someone else takes the job; you hear about it later.', bad: 'The feud turns ugly and a window gets broken.' };
/** A side storyline whose steps have all played out, never touched by the player. */
const book = (over: Record<string, unknown> = {}): Notebook => {
  const raw: any = sampleNotebook();
  const side = raw.threads.find((t: any) => t.id !== raw.arc.main);
  Object.assign(side, { alone: { ...ENDINGS }, stakes: ['Will the neighbors make peace?'], ...over });
  side.steps = side.steps.map((s: any) => ({ ...s, status: 'shown' }));
  return validateNotebook(tidyNotebook(raw));
};
const side = (nb: Notebook) => nb.threads.find(t => t.id !== nb.arc.main && t.alone)!;

describe('the roll', () => {
  test('a threat leans bad, an ordinary storyline leans mild, and any can land any way', () => {
    expect(rollEnding('threat', false, 0.3)).toBe('bad');
    expect(rollEnding('ordinary', false, 0.3)).toBe('mixed');
    expect(rollEnding('ordinary', false, 0.1)).toBe('bad');
    expect(rollEnding('threat', false, 0.95)).toBe('good');
    const count = (lean: 'threat' | 'ordinary') => { let bad = 0; for (let i = 0; i < 10_000; i++) if (rollEnding(lean, false, (i + 0.5) / 10_000) === 'bad') bad++; return bad / 10_000; };
    expect(count('threat')).toBeCloseTo(0.5, 2);
    expect(count('ordinary')).toBeCloseTo(0.2, 2);
  });
  test('after a bad ending, bad is much less likely for a while', () => {
    expect(rollEnding('threat', false, 0.3)).toBe('bad');
    expect(rollEnding('threat', true, 0.3)).toBe('mixed');
  });
});

describe('storylines left alone', () => {
  test('only one the player never took part in, whose steps have all played out, and never the main one', () => {
    const nb = book();
    expect(dueAlone(nb, side(nb))).toBe(true);
    expect(dueAlone(nb, { ...side(nb), involved: true })).toBe(false);
    expect(dueAlone(nb, { ...side(nb), steps: [...side(nb).steps, { id: 'more', text: 'More.', sign: '', afterHours: 5, status: 'waiting' }] })).toBe(false);
    expect(dueAlone(nb, { ...side(nb), id: nb.arc.main })).toBe(false);
  });
  test('the rolled ending arrives as a development, then closes the storyline; a bad one leaves a mark', () => {
    const nb = settleAlone(book(), { hours: 50, reply: 30, waits }, () => 0.05);
    const t = side(nb);
    expect(t.alone).toMatchObject({ landed: 'bad', landedAt: 30 });
    expect(t.steps.at(-1)).toMatchObject({ id: ALONE_STEP, text: ENDINGS.bad, status: 'waiting' });
    expect(t.status).toBe('open');
    // Rolled once: a later check-up doesn't roll it again.
    expect(side(settleAlone(nb, { hours: 60, reply: 34, waits }, () => 0.99)).alone!.landed).toBe('bad');
    // Once it has played out, the storyline is over.
    const played = structuredClone(nb); side(played).steps.at(-1)!.status = 'shown';
    const closed = side(settleAlone(played, { hours: 70, reply: 36, waits }));
    expect(closed).toMatchObject({ status: 'closed', outcome: 'lost', scar: ENDINGS.bad });
    const good = settleAlone(book(), { hours: 50, reply: 30, waits }, () => 0.99); side(good).steps.at(-1)!.status = 'shown';
    expect(side(settleAlone(good, { hours: 60, reply: 32, waits }))).toMatchObject({ status: 'closed', outcome: 'faded' });
  });
  test('one lands at a time, and a recent bad one makes the next lean away from bad', () => {
    const nb = book(); const two = structuredClone(nb);
    const other = structuredClone(side(nb)); other.id = 'second'; other.title = 'Second'; two.threads.push(other);
    const once = settleAlone(validateNotebook(two), { hours: 50, reply: 30, waits }, () => 0.3);
    expect(once.threads.filter(t => t.alone?.landed).length).toBe(1);
    const recentBad = structuredClone(once); for (const t of recentBad.threads) if (t.alone?.landed) t.alone.landed = 'bad';
    const next = settleAlone(recentBad, { hours: 52, reply: 31, waits }, () => 0.15);
    expect(next.threads.find(t => t.id === 'second')!.alone!.landed).toBe('mixed');
    const later = settleAlone(recentBad, { hours: 52, reply: 30 + GUARD_REPLIES, waits }, () => 0.15);
    expect(later.threads.find(t => t.id === 'second')!.alone!.landed).toBe('bad');
  });
});

describe('a model cannot steer the roll', () => {
  const update = (nb: Notebook, change: (t: any) => void) => { const next: any = structuredClone(nb); change(side(next)); return mergeRevision(nb, validateNotebook(tidyNotebook(next, nb)), { hours: 60, reply: 40, waits }); };
  test('it cannot pick an ending, change one that landed, or rewrite its step', () => {
    expect(side(update(book(), t => { t.alone.landed = 'good'; })).alone!.landed).toBeUndefined();
    const landed = settleAlone(book(), { hours: 50, reply: 30, waits }, () => 0.05);
    const after = side(update(landed, t => { t.alone.bad = 'Nothing much happens.'; t.alone.landed = 'good'; t.steps.at(-1).text = 'Everyone is fine.'; t.steps.at(-1).sign = 'Everyone is fine.'; }));
    expect(after.alone).toMatchObject({ landed: 'bad', bad: ENDINGS.bad });
    expect(after.steps.at(-1)).toMatchObject({ text: ENDINGS.bad, sign: ENDINGS.bad });
  });
  test('taking part is for good', () => {
    const took = update(book(), t => { t.involved = true; });
    expect(side(update(took, t => { t.involved = false; })).involved).toBe(true);
  });
});

test('the planner is told about stakes questions and left-alone endings', () => {
  const sent = creationMessages({ character: { name: 'Mira', description: '', personality: '', scenario: '', firstMessage: '' }, persona: null, lore: { rules: [], entries: [], index: [], more: 0 } as never, storySoFar: '', chat: [], replies: [], variables: {} }, { tone: 'balanced', twist: true, shape: 'auto', lockShape: false, size: 'auto' })[0].content;
  expect(sent).toContain('never answer them in advance');
  expect(sent).toContain('you never choose it');
  expect(sent).toContain('"alone": {"lean": "threat|ordinary"');
});
