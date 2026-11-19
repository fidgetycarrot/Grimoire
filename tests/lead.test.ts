import { describe, expect, test } from 'bun:test';
import { fixLead, leadProblems, openArc, shapeFor } from '../src/lead';
import { buildNote } from '../src/note';
import { dueThreads, inOpening, stamp, threadMoment, validateNotebook, waitsFor, type Notebook, type Preferences } from '../src/notebook';
import { sampleNotebook } from './fixtures';
import { applyQuick, quickQuestions } from '../src/quick';
import { followRate } from '../src/cast';

const prefs = (p: Partial<Preferences> = {}): Preferences => ({ tone: 'balanced', twist: true, shape: 'auto', lockShape: false, size: 'auto', ...p });
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
  test('someone the due step involves is not told to stay away when the player names them', () => {
    const nb = opened();
    nb.threads[1].steps[0].afterHours = 0.5; nb.threads[1].speed = 'steady';
    const text = note(nb, 10, { now: { hours: 50, reply: 10, waits }, recent: 'Mira looks up.\nWhere is Cole?', narrated: 'Mira looks up.' });
    expect(text).toContain('What I bring in now:\n- The stolen ring:');
    expect(text).not.toContain('- Cole:');
    for (const t of nb.threads) t.people = t.people.filter(p => p !== 'cole');
    expect(note(nb, 10, { now: { hours: 50, reply: 10, waits }, recent: 'Mira looks up.\nWhere is Cole?', narrated: 'Mira looks up.' })).toContain('- Cole:');
  });
  test('its next step is what the story does now, and side storylines stay small in the opening stretch', () => {
    const nb = opened();
    nb.threads[1].steps[0].afterHours = 0.5; nb.threads[1].speed = 'steady';
    const text = note(nb, 10, { now: { hours: 50, reply: 10, waits } });
    expect(text).toContain('The main storyline is The stolen ring: the owner is starting to look for it.');
    expect(text).toContain('The story is just starting');
    expect(text).toContain('What I bring in now:\n- The stolen ring: A shout from the manor on the hill. (I bring it in now, in this reply or the next)');
    // The player acts on the story; they don't have to invent it.
    expect(text).toContain('It lands as something the player can act on');
    expect(text).toContain('what they do with it is theirs');
    expect(text).not.toContain('Shutters bang');
    expect(text).not.toContain('bring it to them');
  });
  test('an urgent side storyline still presses in', () => {
    const text = note(opened(), 12, { now: { hours: 50, reply: 12, waits } });
    expect(text).toContain('Side storylines I can bring in');
    expect(text).toContain('Shutters bang');
  });
  test('when the player has not come to it, the world brings it to them', () => {
    const text = note(opened(), 12);
    expect(text).toContain('If it has not reached the player yet, I bring it to them: someone tied to it seeks them out (Cole, Oswin)');
    expect(text).toContain('They still choose what to do');
  });
  test('it waits for a big moment to settle, and quiet pace holds it back', () => {
    const nb = opened(); nb.rhythm = 'aftermath';
    expect(note(nb, 12)).toContain('I bring it in as soon as this moment has settled');
    expect(note(nb, 12)).not.toContain('bring it to them');
    expect(note(opened(), 12, { pace: 'quiet' })).not.toContain('A shout from the manor');
  });
  test('but a big moment can\'t hold it forever: once it has waited a while, it comes in as the scene allows', () => {
    const nb = opened(); nb.rhythm = 'peak';
    const text = note(nb, 17, { now: { hours: 42, reply: 17, waits } });
    expect(text).toContain('I bring it in now, in this reply or the next, as the scene allows: it has waited long enough');
    expect(text).toContain('bring it to them');
    expect(note(nb, 17, { pace: 'quiet', now: { hours: 42, reply: 17, waits } })).not.toContain('A shout from the manor');
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

describe('people who hold their ground, specific plans, and losses that leave a mark', () => {
  test('every note says people don’t give in to pleading or charm', () => {
    expect(note(opened(), 10)).toContain('People hold their ground: pleading, charm, tears, flirting, or a good speech earn no automatic yes');
  });
  test('a storyline that went against the player keeps showing', () => {
    const nb = opened();
    nb.threads[1] = { ...nb.threads[1], status: 'closed', closedReason: 'The storm hit.', outcome: 'lost', scar: 'the ferry is out of service and Mira blames the player' };
    expect(note(nb, 10)).toContain('Still felt from earlier: the ferry is out of service and Mira blames the player.');
    const won = opened(); won.threads[1] = { ...won.threads[1], status: 'closed', closedReason: 'They crossed.', outcome: 'won', scar: 'x' };
    expect(note(won, 10)).not.toContain('Still felt from earlier');
  });
  test('a new storyline needs someone driving it, and new steps need a sign', () => {
    const { specificProblems, fixSpecific } = require('../src/lead');
    const before = validateNotebook(sampleNotebook()), after = structuredClone(before);
    after.threads.push({ id: 'rumor', title: 'A rumor', speed: 'steady', why: 'Talk spreads.', hint: '', people: [], status: 'open', closedReason: '', ifFollowed: '', ifIgnored: '', steps: [{ id: 'talk', text: 'Tension rises.', sign: '', afterHours: 4, status: 'waiting' }] });
    const problems = specificProblems(before, after).join(' ');
    expect(problems).toContain('"rumor" needs someone who drives it');
    expect(problems).toContain('give each new step a "sign"');
    expect(specificProblems(before, before)).toEqual([]);
    expect(fixSpecific(after).threads.at(-1).steps[0].sign).toBe('Tension rises.');
  });
  test('how a storyline ended is kept when a later update leaves it out', () => {
    const { tidyNotebook } = require('../src/tidy');
    const prev = validateNotebook(sampleNotebook());
    prev.threads[1] = { ...prev.threads[1], status: 'closed', closedReason: 'The storm hit.', outcome: 'lost', scar: 'the ferry is out of service' };
    const raw: any = structuredClone(prev); delete raw.threads[1].outcome; delete raw.threads[1].scar;
    expect(validateNotebook(tidyNotebook(raw, prev)).threads[1]).toMatchObject({ outcome: 'lost', scar: 'the ferry is out of service' });
  });
});

describe('the note never loses what the narrator must do', () => {
  test('long background lines are shortened, and the step that is due always reaches the narrator, with the people in the scene', () => {
    const nb = opened();
    const long = 'At 3:54 PM inside the unit, one minute before the cord pull and six minutes before everyone arrives, how will the player get everyone out without anyone seeing what they should not see, and what happens next. '.repeat(3);
    nb.story.question = long.slice(0, 590); nb.threads[0].hint = long.slice(0, 590); nb.threads[0].why = long.slice(0, 590);
    for (const p of nb.people) { p.wants = long.slice(0, 300); p.doing = long.slice(0, 300); }
    const text = note(nb, 12, { layout: `Where things are in the house: ${'Kitchen, Living room, Hall. '.repeat(15)}`, recent: 'Mira, Cole and Oswin look up.' });
    expect(text).toContain('What I bring in now:\n- The stolen ring: A shout from the manor on the hill.');
    expect(text).toContain('If it has not reached the player yet');
    expect(text).toContain('People here and what drives them');
    expect(text).toContain('- Mira (ferry keeper)');
    expect(text).toContain('Problems take time');
    // No heading left without its items.
    const lines = text.split('\n');
    lines.forEach((l, i) => { if (/^(What I bring in now|Side storylines I can bring in|Developments I can bring in|People here|Open threads near this scene)/.test(l)) expect(lines[i + 1].startsWith('- ')).toBe(true); });
    expect(text.split('\n').find(l => l.startsWith('What the story is about'))!.length).toBeLessThan(280);
  });
});

describe('a planned step with no believable way in', () => {
  const noul = (p: number) => ({ type: 'noul' as const, noul: p });
  test('waits for the scene to open up, instead of being pushed through a locked door', () => {
    const nb = opened();
    const open = note(nb, 1);
    expect(open).toContain('(I bring it in now, in this reply or the next)');
    expect(open).toContain('never through a locked door or into a private moment by force');
    const step = nb.threads.find(t => t.id === nb.arc.main)!.steps.find(s => s.status === 'waiting')!;
    const shut = note(nb, 1, { blocked: [step.id] });
    expect(shut).toContain('once it can believably reach the player: not in this scene as it stands. I do not force it in');
    expect(shut).not.toContain('If it has not reached the player yet, I bring it to them');
  });
  test('the quick check asks, judges it afresh each reply, and does not count it against the narrator', () => {
    const nb = opened(), now = { hours: nb.arc.startReply ?? 0, reply: 2, waits };
    const plan = quickQuestions(nb, now);
    expect(plan.questions.reach_1.instructions).toContain('locked or barred door');
    const all = (over: Record<string, unknown>) => ({ model: 'jev', answers: { ...Object.fromEntries(Object.keys(plan.questions).map(k => [k, plan.questions[k].type === 'noul' ? noul(k.startsWith('fits_') ? 0.9 : 0.1) : { type: 'choice', choice: 'calm', confidence: 0.9 }])), ...over } }) as never;
    const step = (plan.marks.due_1 as { step: string }).step;
    expect(applyQuick(nb, plan, all({ reach_1: noul(0.05) }), now).blocked).toEqual([step]);
    expect(applyQuick(nb, plan, all({ reach_1: noul(0.9) }), now).blocked).toEqual([]);
    expect(applyQuick(nb, plan, all({ reach_1: noul(0.9) }), now).marked).toBe(0);
    const row = (reply: number, reach: number) => ({ reply, ok: true, marked: 0, answers: { due_1: 0.05, reach_1: reach } });
    expect(followRate([1, 2, 3, 4, 5].map(n => row(n, 0.1)))).toBeNull();
    expect(followRate([1, 2, 3, 4, 5].map(n => row(n, 0.8)))).toEqual({ offered: 5, used: 0 });
  });
});


describe('openings: a step comes in at its moment, not on the clock', () => {
  /** The ring's first step as an ordinary step that waits for its moment. */
  const waiting = (): Notebook => { const nb = opened(); const step = nb.threads[0].steps[0]; delete step.now; step.opening = 'Cole and the player are alone after closing'; return nb; };
  test('while its moment has not come, the note holds it, says what it waits for, and asks for nothing now', () => {
    const text = note(waiting(), 14, { open: [], missed: [] });
    expect(text).toContain('What I am holding for its moment:');
    expect(text).toContain('I hold this until Cole and the player are alone after closing. I do not force it in before then');
    expect(text).not.toContain('What I bring in now');
  });
  test('once the quick check saw its moment, it comes in now', () => {
    const text = note(waiting(), 14, { open: ['owner-notices'], missed: [] });
    expect(text).toContain('What I bring in now:');
    expect(text).toContain('its moment is here');
  });
  test('a moment seen and passed twice running is named, so the next reply takes it', () => {
    expect(note(waiting(), 14, { open: ['owner-notices'], missed: ['owner-notices'] })).toContain('Its moment came in the last reply and passed. I take it this time.');
  });
  test('someone the step needs has to be in the scene, checked in code', () => {
    const nb = waiting(); nb.threads[0].steps[0].with = ['cole'];
    expect(note(nb, 14, { open: ['owner-notices'], missed: [] })).toContain('What I am holding for its moment:');
    expect(note(nb, 14, { open: ['owner-notices'], missed: [], recent: 'Cole wipes the bar.' })).toContain('What I bring in now:');
  });
  test('waiting builds pressure: after a while it makes its own believable way in', () => {
    const text = note(waiting(), 22, { now: { hours: 42, reply: 22, waits }, open: [], missed: [] });
    expect(text).toContain('It has waited long enough, so it makes its own way in: someone tied to it (Cole, Oswin) comes looking for the player with a reason of their own, or word reaches them');
    expect(text).toContain('Never through a locked door');
  });
  test('without a working quick check, steps come in on the clock as before', () => {
    expect(note(waiting(), 14)).toContain('What I bring in now:');
  });
  test('the quick check asks about a step\'s own moment when it has one', () => {
    const nb = waiting(); nb.rhythm = 'calm';
    const plan = quickQuestions(nb, { hours: 42, reply: 14, waits });
    const reach = Object.entries(plan.questions).find(([k]) => k.startsWith('reach_'))!;
    expect(reach[1].instructions).toContain('It needs: Cole and the player are alone after closing');
  });
});

describe('the codeword in the note', () => {
  test('in light mode, the preset\'s own plans are what is ready when there is no deep look', () => {
    const text = buildNote({ light: true, push: { only: true }, notebook: opened(), pace: 'auto', clock: { day: 1, hour: 18, label: '' }, now: { hours: 42, reply: 12, waits }, recent: 'Mira looks up.' });
    expect(text).toContain('The player asked me to move the story in this reply');
    expect(text).toContain('My own plans in this chat (the notes and trackers I keep in my replies)');
    expect(text).toContain('their character carries on with what they were already doing');
  });
  test('a guided swipe is the player\'s say on the reply: the codeword steps back', () => {
    const text = note(opened(), 12, { guided: true, push: { only: false } });
    expect(text).not.toContain('The player asked me to move the story');
  });
});
