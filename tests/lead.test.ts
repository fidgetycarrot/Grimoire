import { describe, expect, test } from 'bun:test';
import { fixLead, leadProblems, openArc, shapeFor } from '../src/lead';
import { buildNote } from '../src/note';
import { dueThreads, inOpening, stamp, threadMoment, validateNotebook, waitsFor, type Notebook, type Preferences } from '../src/notebook';
import { sampleNotebook } from './fixtures';

const prefs = (p: Partial<Preferences> = {}): Preferences => ({ tone: 'balanced', twist: true, shape: 'auto', lockShape: false, ...p });
const waits = waitsFor('medium', 'auto');
/** The ring as the main storyline, opened at reply 10. */
function opened(): Notebook {
  const nb = validateNotebook({ ...sampleNotebook(), arc: { shape: 'conflict', stage: 'setup', turn: '', main: 'stolen-ring' } });
  return stamp(openArc(nb, 'story'), { hours: 42, reply: 10 });
}
const note = (nb: Notebook, reply: number, extra: Partial<Parameters<typeof buildNote>[0]> = {}) =>
  buildNote({ notebook: nb, pace: 'auto', clock: { day: 1, hour: 18, label: '' }, now: { hours: 42, reply, waits }, recent: 'Mira looks up.', ...extra });

describe('a main storyline in every part', () => {
  test('a new part needs one, open and not slow', () => {
    const nb = validateNotebook({ ...sampleNotebook(), arc: { shape: 'conflict', stage: 'setup', turn: '', main: '' } });
    expect(leadProblems(null, nb, prefs()).join(' ')).toContain('Set arc.main');
    const slow = structuredClone(nb); slow.arc.main = 'stolen-ring'; slow.threads[0].speed = 'slow';
    expect(leadProblems(null, slow, prefs()).join(' ')).toContain("can't be slow");
    slow.threads[0].speed = 'steady';
    expect(leadProblems(null, slow, prefs())).toEqual([]);
  });
  test('the plain fix keeps the old main storyline if it is still open, else the most pressing one, and never a slow one', () => {
    const nb = validateNotebook({ ...sampleNotebook(), arc: { shape: 'conflict', stage: 'setup', turn: '', main: '' } });
    expect(fixLead(null, nb, prefs()).arc.main).toBe('storm');
    const before = structuredClone(nb); before.arc.main = 'stolen-ring'; before.arc.stage = 'rising';
    expect(fixLead(before, { ...nb, arc: { ...nb.arc, stage: 'rising' } }, prefs()).arc.main).toBe('stolen-ring');
    const slow = structuredClone(nb); slow.threads[1].status = 'closed'; slow.threads[1].closedReason = 'It passed'; slow.threads[0].speed = 'slow';
    expect(fixLead(null, slow, prefs()).threads[0].speed).toBe('steady');
  });
  test('the opening moment arrives at once, unless the storyline already began', () => {
    const nb = opened();
    expect(nb.arc.opening).toBe('story');
    expect(nb.threads[0].steps[0].afterHours).toBe(0);
    expect(nb.threads[0].steps[1].afterHours).toBe(24);
    expect(dueThreads(nb, { hours: 42, reply: 10, waits }).map(d => d.thread.id)).toContain('stolen-ring');
    const begun = validateNotebook({ ...sampleNotebook(), arc: { shape: 'conflict', stage: 'setup', turn: '', main: 'stolen-ring' } });
    begun.threads[0].steps[0].status = 'shown';
    expect(openArc(begun, 'chapter').threads[0].steps[1].afterHours).toBe(24);
  });
  test('in the opening stretch the main storyline waits half as long; afterwards, the usual wait', () => {
    const nb = opened();
    expect(inOpening(nb, { hours: 42, reply: 39, waits })).toBe(true);
    expect(inOpening(nb, { hours: 42, reply: 40, waits })).toBe(false);
    expect(threadMoment(nb, nb.threads[0], { hours: 42, reply: 20, waits }).waits!.steady).toBe(8);
    expect(threadMoment(nb, nb.threads[1], { hours: 42, reply: 20, waits }).waits).toEqual(waits);
    expect(threadMoment(nb, nb.threads[0], { hours: 42, reply: 45, waits }).waits).toEqual(waits);
  });
});

describe('the story shape', () => {
  test('a chosen shape sets the first part; kept, it sets every new part', () => {
    const nb = validateNotebook(sampleNotebook());
    expect(shapeFor(null, nb, prefs({ shape: 'kishotenketsu' }))).toBe('kishotenketsu');
    expect(shapeFor(nb, nb, prefs({ shape: 'kishotenketsu' }))).toBeNull();
    // Kept: an ongoing part in the other shape may finish; a new part must use the kept one.
    expect(shapeFor(nb, nb, prefs({ shape: 'kishotenketsu', lockShape: true }))).toBeNull();
    const fresh = { ...nb, arc: { ...nb.arc, stage: 'setup' } }, ongoing = { ...nb, arc: { ...nb.arc, stage: 'climax' } };
    expect(shapeFor(ongoing, fresh, prefs({ shape: 'kishotenketsu', lockShape: true }))).toBe('kishotenketsu');
    expect(leadProblems(null, nb, prefs({ shape: 'kishotenketsu' })).join(' ')).toContain('"kishotenketsu" shape');
    expect(fixLead(null, nb, prefs({ shape: 'kishotenketsu' })).arc).toMatchObject({ shape: 'kishotenketsu', stage: 'ki' });
  });
});

describe('the note leads with the main storyline', () => {
  test('its next step is what the story does now, and side storylines stay small in the opening stretch', () => {
    const nb = opened();
    nb.threads[1].steps[0].afterHours = 0.5; nb.threads[1].speed = 'steady';
    const text = note(nb, 10, { now: { hours: 50, reply: 10, waits } });
    expect(text).toContain('The main storyline is The stolen ring: the owner is starting to look for it.');
    expect(text).toContain('The story is just starting');
    expect(text).toContain('What the story does now:\n- The stolen ring: A shout from the manor on the hill. (bring it in now, in this reply or the next)');
    expect(text).not.toContain('Shutters bang');
    expect(text).not.toContain('bring it to them');
  });
  test('an urgent side storyline still presses in', () => {
    const text = note(opened(), 12, { now: { hours: 50, reply: 12, waits } });
    expect(text).toContain('Side storylines that are due');
    expect(text).toContain('Shutters bang');
  });
  test('when the player has not come to it, the world brings it to them', () => {
    const text = note(opened(), 12);
    expect(text).toContain('If this has not reached the player yet, bring it to them: someone tied to it seeks them out (Cole, Oswin)');
    expect(text).toContain('They still choose what to do');
  });
  test('it waits for a big moment to settle, and quiet pace holds it back', () => {
    const nb = opened(); nb.rhythm = 'aftermath';
    expect(note(nb, 12)).toContain('bring it in as soon as this moment has settled');
    expect(note(nb, 12)).not.toContain('bring it to them');
    expect(note(opened(), 12, { pace: 'quiet' })).not.toContain('A shout from the manor');
  });
  test('it steps back for swipe guidance and intimate scenes', () => {
    expect(note(opened(), 12, { guided: true })).not.toContain('main storyline');
    expect(note(opened(), 12, { intimate: true })).not.toContain('A shout from the manor');
  });
});

describe('an opponent in every conflict part', () => {
  test('a conflict part’s main storyline must name someone in it', () => {
    const nb = validateNotebook({ ...sampleNotebook(), arc: { shape: 'conflict', stage: 'setup', turn: '', main: 'stolen-ring' } });
    expect(leadProblems(null, nb, prefs())).toEqual([]);
    nb.threads[0].people = [];
    expect(leadProblems(null, nb, prefs()).join(' ')).toContain('needs an opponent');
    expect(leadProblems(null, { ...nb, arc: { ...nb.arc, shape: 'kishotenketsu', stage: 'ki' } }, prefs())).toEqual([]);
  });
});

describe('problems take time', () => {
  test('every note tells the narrator not to fix things at once', () => {
    expect(note(opened(), 10)).toContain('Problems take time. Nothing gets solved in the scene it comes up in');
    expect(note(opened(), 10, { guided: true })).toContain('Problems take time');
  });
});
