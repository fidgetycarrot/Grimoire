import { describe, expect, test } from 'bun:test';
import { clueGap, clueNow, cluesToCheck, leakProblems, lockMystery, mysteryLeaks, mysteryPlayable, mysteryProblems, mysteryView, runsOut, scrubLeaks, type Mystery } from '../src/mystery';
import { buildNote } from '../src/note';
import { mergeRevision, stamp, validateNotebook, waitsFor, type Notebook } from '../src/notebook';
import { applyQuick, quickQuestions } from '../src/quick';
import { applyChanges, describeChanges } from '../src/talk';
import { tidyNotebook } from '../src/tidy';
import { MYSTERY_ANSWER as ANSWER, rawMystery, sampleNotebook } from './fixtures';

const waits = waitsFor('medium', 'auto');
const withMystery = (over: Record<string, unknown> = {}): Notebook => {
  const raw: any = sampleNotebook(); raw.mystery = { ...rawMystery(), ...over };
  for (const t of raw.threads) if (t.id === 'stolen-ring') t.hint = t.hint || 'Something is missing from the chapel.';
  return stamp(validateNotebook(tidyNotebook(raw)), { hours: 42, reply: 10, waits });
};
const note = (nb: Notebook, reply: number, extra: Partial<Parameters<typeof buildNote>[0]> = {}) =>
  buildNote({ notebook: nb, pace: 'auto', clock: { day: 1, hour: 18, label: '' }, now: { hours: 43, reply, waits }, recent: 'Mira looks up.', ...extra });
const SECRETS = [ANSWER, 'He carried it out in the alms sack', 'He owes money upriver', 'He was down at the landing after prayer', 'Took the silver and hid it', 'The silver is hidden there', 'pawnbroker'];

describe('a mystery is written soundly or not at all', () => {
  test('a model\'s mystery is made regular: names become ids, loose words become choices', () => {
    const m = withMystery().mystery!;
    expect(m.culprit).toBe('brother-hale');
    expect(m.suspects.map(s => s.person)).toEqual(['brother-hale', 'cole', 'wren']);
    expect(m.clues.find(c => c.id === 'wren-ribbon')!.points).toBe('false');
    expect(m.clues.every(c => c.status === 'hidden')).toBe(true);
    expect(m.status).toBe('open'); expect(m.startReply).toBe(10); expect(m.thread).toBe('stolen-ring');
    expect(mysteryProblems(withMystery())).toEqual([]);
  });
  test('a thin one is sent back with what is missing', () => {
    const thin = withMystery({ clues: rawMystery().clues.slice(0, 2), suspects: rawMystery().suspects.slice(0, 1), ifUnsolved: '' });
    const said = mysteryProblems(thin).join(' ');
    expect(said).toContain('at least 6 clues'); expect(said).toContain('at least 3 people'); expect(said).toContain('false trail'); expect(said).toContain('ifUnsolved');
    expect(mysteryPlayable(thin)).toBe(false);
    expect(mysteryProblems(validateNotebook(sampleNotebook())).join(' ')).toContain('Return "mystery"');
  });
  test('the answer may not sit where the narrator, or an early reveal, could reach it', () => {
    const raw: any = sampleNotebook(); raw.mystery = rawMystery(); raw.story.hiddenTruth = [ANSWER]; raw.people[0].doing = `Knows that ${ANSWER}`;
    const said = mysteryProblems(validateNotebook(tidyNotebook(raw))).join(' ');
    expect(said).toContain('story.hiddenTruth'); expect(said).toContain('doing');
  });
  test('a clue that states its own meaning, or clues all in one spot, are refused', () => {
    const same = withMystery({ clues: rawMystery().clues.map((c, i) => i ? c : { ...c, means: c.text }) });
    expect(mysteryProblems(same).join(' ')).toContain('must differ');
    const oneSpot = withMystery({ clues: rawMystery().clues.map(c => ({ ...c, people: ['mira'] })) });
    expect(mysteryProblems(oneSpot).join(' ')).toContain('three different places or people');
  });
});

describe('the answer is locked', () => {
  const revise = (nb: Notebook, change: (m: any) => void, reply = 20) => { const next: any = structuredClone(nb); change(next.mystery); return mergeRevision(nb, validateNotebook(next), { hours: 50, reply, waits }); };
  test('a later update cannot change what is true, however it tries', () => {
    const nb = withMystery();
    const after = revise(nb, m => { m.answer = 'Cole did it for the money, obviously.'; m.culprit = 'cole'; m.how = 'x'; m.why = 'y'; m.question = 'Why did Cole do it?'; m.clues[0].means = 'Cole borrowed the robe.'; m.clues[0].text = 'Cole has mud on his boots.'; m.clues[2].points = 'false'; m.suspects[0].did = 'Nothing at all.'; m.clues.splice(3, 1); m.suspects.pop(); });
    expect(after.mystery).toEqual(nb.mystery);
  });
  test('clues can be found but never lost, and guesses already judged stay', () => {
    const nb = withMystery();
    const found = revise(nb, m => { m.clues[0].status = 'found'; m.theories = [{ text: 'It was Wren.', verdict: 'wrong' }]; });
    expect(found.mystery!.clues[0]).toMatchObject({ status: 'found', foundAt: 20 });
    expect(found.mystery!.theories).toEqual([{ text: 'It was Wren.', verdict: 'wrong', atReply: 20 }]);
    const undone = revise(found, m => { m.clues[0].status = 'hidden'; m.theories = []; }, 30);
    expect(undone.mystery!.clues[0]).toMatchObject({ status: 'found', foundAt: 20 });
    expect(undone.mystery!.theories.length).toBe(1);
  });
  test('new clues may be added, but a flood of false trails is not', () => {
    const nb = withMystery();
    const more = revise(nb, m => { m.clues.push({ id: 'new-true', text: 'The vestry key is on the wrong hook.', where: 'the vestry', people: [], means: 'Hale put it back in a hurry.', points: 'truth', status: 'hidden' }); for (let i = 0; i < 6; i++) m.clues.push({ id: `decoy-${i}`, text: `A stranger was seen ${i} nights ago.`, where: 'the road', people: [], means: 'Just a peddler.', points: 'false', status: 'hidden' }); });
    const ids = more.mystery!.clues.map(c => c.id);
    expect(ids).toContain('new-true');
    expect(more.mystery!.clues.filter(c => c.points === 'false').length).toBeLessThan(more.mystery!.clues.filter(c => c.points === 'truth').length);
  });
  test('where a clue can be found may move with the story; how a suspect tells it may change', () => {
    const after = revise(withMystery(), m => { m.clues[1].where = 'the laundry, where the vestry things were taken'; m.suspects[1].says = 'All right, he stepped out of the tavern for a while.'; });
    expect(after.mystery!.clues[1].where).toContain('laundry');
    expect(after.mystery!.suspects[1].says).toContain('stepped out');
    expect(after.mystery!.suspects[1].did).toContain('saw Hale with a sack');
  });
  test('an ordinary update cannot start a mystery; only the player\'s request can', () => {
    const plain = stamp(validateNotebook(sampleNotebook()), { hours: 42, reply: 10, waits });
    const sneaked: any = structuredClone(plain); sneaked.mystery = withMystery().mystery;
    expect(mergeRevision(plain, validateNotebook(sneaked), { hours: 50, reply: 20, waits }).mystery).toBeUndefined();
    const asked = mergeRevision(plain, validateNotebook(sneaked), { hours: 50, reply: 20, waits }, { newMystery: true });
    expect(asked.mystery).toMatchObject({ status: 'open', startReply: 20, answer: ANSWER });
    expect(describeChanges(plain, asked)).toContain('Added a mystery');
  });
  test('while it is open its thread cannot be closed; once it ends it stays ended and the answer is an established fact', () => {
    const nb = withMystery();
    const closed: any = structuredClone(nb); closed.threads.find((t: any) => t.id === 'stolen-ring').status = 'closed'; closed.threads.find((t: any) => t.id === 'stolen-ring').closedReason = 'Dropped.';
    expect(mergeRevision(nb, validateNotebook(closed), { hours: 50, reply: 20, waits }).threads.find(t => t.id === 'stolen-ring')!.status).toBe('open');
    const solved = revise(nb, m => { m.status = 'solved'; });
    expect(solved.mystery).toMatchObject({ status: 'solved', endReply: 20 });
    expect(solved.story.cameOut.map(r => r.text)).toContain(ANSWER);
    expect(revise(solved, m => { m.status = 'open'; }, 30).mystery!.status).toBe('solved');
  });
  test('a check-up sends only what moved: a clue by id, a guess', () => {
    const nb = withMystery();
    const laid = applyChanges(nb, { mystery: { clues: [{ id: 'alms-sack', status: 'found' }], theories: [{ text: 'Cole took it.', verdict: 'wrong' }] } })!;
    const after = mergeRevision(nb, validateNotebook(tidyNotebook(laid, nb)), { hours: 50, reply: 22, waits });
    expect(after.mystery!.clues.find(c => c.id === 'alms-sack')).toMatchObject({ status: 'found', foundAt: 22, means: 'The silver left in the sack.' });
    expect(after.mystery!.clues.length).toBe(6);
    expect(after.mystery!.theories[0]).toMatchObject({ verdict: 'wrong' });
    expect(after.mystery!.answer).toBe(ANSWER);
  });
});

describe('what the narrator is told', () => {
  test('while it is open: the question and the rules, and never the answer, what a clue means, or what anyone did', () => {
    const nb = withMystery();
    for (const text of [note(nb, 11), note(nb, 14, { recent: 'Brother Hale and Cole and Wren stand with Mira.' }), note(nb, 40), note(nb, 14, { guided: true }), note(nb, 14, { intimate: true })]) {
      expect(text).toContain('A mystery runs through this story: Who took the chapel silver?');
      expect(text).toContain('nobody confirms or denies it');
      for (const secret of SECRETS) expect(text).not.toContain(secret);
    }
  });
  test('a clue is offered when someone who holds it is in the scene, once the last one has had room', () => {
    const nb = withMystery();
    expect(note(nb, 11, { recent: 'Brother Hale nods.' })).not.toContain('A clue is within reach');
    const text = note(nb, 13, { recent: 'Brother Hale nods.' });
    expect(text).toContain('A clue is within reach in this scene (the chapel porch)');
    expect(text).toContain('The hem of Brother Hale\'s robe is wet with river mud.');
    expect(text).toContain('do not explain what it means');
    expect(text).toContain('About the mystery, Brother Hale says: He locked up after prayer and saw nothing. When pressed: He straightens things that are already straight.');
  });
  test('the place counts too, and a guided swipe or an intimate scene holds clues back', () => {
    const nb = withMystery();
    const at = { location: 'Chapel vestry, Low Water', recent: 'The room is quiet.' };
    expect(note(nb, 13, at)).toContain('The alms sack is missing from its hook.');
    expect(note(nb, 13, { ...at, guided: true })).not.toContain('alms sack');
    expect(note(nb, 13, { ...at, intimate: true })).not.toContain('alms sack');
  });
  test('a mystery that has gone quiet sends a true clue to wherever the player is', () => {
    const nb = withMystery(), gap = clueGap({ hours: 0, reply: 0, waits });
    expect(clueNow(nb.mystery!, [], '', { hours: 0, reply: 10 + gap - 1, waits })).toBeNull();
    const offer = clueNow(nb.mystery!, [], '', { hours: 0, reply: 10 + gap, waits })!;
    expect(offer).toMatchObject({ near: false }); expect(offer.clue.points).toBe('truth');
    expect(note(nb, 10 + gap, { recent: 'The road is empty.' })).toContain('The mystery has been quiet for a while. Let this clue reach the player where they are');
    // A few replies later the next one has a go, so one the narrator can't place does not block the rest.
    expect(clueNow(nb.mystery!, [], '', { hours: 0, reply: 10 + gap + 4, waits })!.clue.id).not.toBe(offer.clue.id);
  });
  test('found clues are kept in front of the narrator as facts', () => {
    const nb = withMystery(); nb.mystery!.clues[0] = { ...nb.mystery!.clues[0], status: 'found', foundAt: 12 };
    const text = note(nb, 13);
    expect(text).toContain('What the player has found out about the mystery so far');
    expect(text).toContain('The hem of Brother Hale\'s robe is wet with river mud.');
    // Finding one makes room before the next.
    expect(note(nb, 13, { recent: 'Cole grins.' })).not.toContain('A clue is within reach');
  });
  test('a wrong guess is not confirmed, and nothing points to the real answer', () => {
    const nb = withMystery(); nb.mystery!.theories = [{ text: 'Wren took it.', verdict: 'wrong', atReply: 15 }];
    const text = note(nb, 15);
    expect(text).toContain('it is not right. Nobody tells them so outright');
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(note(nb, 19)).not.toContain('it is not right');
    nb.mystery!.theories = [{ text: 'A monk took it.', verdict: 'partly', atReply: 15 }];
    expect(note(nb, 16)).toContain('has part of it. Nobody confirms which part');
  });
  test('once solved, the narrator gets the whole answer so the ending plays true, for a while', () => {
    const nb = withMystery(); nb.mystery = { ...nb.mystery!, status: 'solved', endReply: 30 };
    const text = note(nb, 30);
    expect(text).toContain('The player has solved the mystery'); expect(text).toContain(ANSWER); expect(text).toContain('How: He carried it out in the alms sack'); expect(text).toContain('the player\'s win');
    expect(note(nb, 45)).not.toContain('solved the mystery');
  });
  test('with every true clue found, the player is given an opening to say what they think; left too long, it comes out by itself', () => {
    const nb = withMystery();
    nb.mystery!.clues = nb.mystery!.clues.map(c => c.points === 'truth' ? { ...c, status: 'found' as const, foundAt: 40 } : { ...c, status: 'found' as const, foundAt: 38 });
    expect(note(nb, 42)).toContain('give them an opening to say what they think');
    expect(runsOut(nb.mystery!, { hours: 0, reply: 60, waits })).toBe(false);
    expect(runsOut(nb.mystery!, { hours: 0, reply: 40 + waits.steady * 2, waits })).toBe(true);
    const text = note(nb, 40 + waits.steady * 2);
    expect(text).toContain('has run its course without being solved'); expect(text).toContain('pawnbroker'); expect(text).toContain(ANSWER);
  });
  test('a correction from a check-up reaches the narrator without the answer', () => {
    const nb = withMystery(); nb.mystery!.fix = 'The boy who said he saw Cole at the chapel was repeating a rumor.';
    expect(note(nb, 12)).toContain('Set it straight, without drawing attention to it: The boy who said he saw Cole at the chapel was repeating a rumor.');
  });
  test('the panel shows the question and found clues only', () => {
    const nb = withMystery(); nb.mystery!.clues[1] = { ...nb.mystery!.clues[1], status: 'found', foundAt: 12 };
    expect(mysteryView(nb.mystery)).toEqual({ question: 'Who took the chapel silver?', status: 'open', found: ['The alms sack is missing from its hook.'] });
    expect(JSON.stringify(mysteryView(nb.mystery))).not.toContain('Hale');
    expect(mysteryView(undefined)).toBeNull();
  });
});

describe('the quick check keeps score', () => {
  const noul = (p: number) => ({ type: 'noul' as const, noul: p });
  const now = { hours: 44, reply: 15, waits };
  const result = (plan: ReturnType<typeof quickQuestions>, over: Record<string, unknown>) => ({ model: 'jev', answers: { ...Object.fromEntries(Object.keys(plan.questions).map(k => [k, plan.questions[k].type === 'noul' ? noul(0.1) : { type: 'choice', choice: 'calm', confidence: 0.9 }])), ...over } }) as any;
  test('it asks about the clues the scene could have shown, and whether the player named an answer', () => {
    const nb = withMystery(), plan = quickQuestions(nb, now, 'Cole leans on the tavern bar.');
    const first = plan.marks.clue_1 as { kind: 'clue'; clue: string };
    expect(first).toEqual({ kind: 'clue', clue: 'cole-saw' });
    expect(Object.keys(plan.questions).filter(k => k.startsWith('clue_')).length).toBe(5);
    expect(plan.questions.theory_right.instructions).toContain(ANSWER);
    expect(cluesToCheck({ ...nb.mystery!, status: 'solved' }, '', nb.people, now)).toEqual([]);
    expect(quickQuestions(validateNotebook(sampleNotebook()), now).questions.theory).toBeUndefined();
  });
  test('a clue the reply showed is marked found', () => {
    const nb = withMystery(), plan = quickQuestions(nb, now, 'Cole leans on the tavern bar.');
    const out = applyQuick(nb, plan, result(plan, { clue_1: noul(0.9) }), now, 'I ask Cole what he saw.');
    expect(out.notebook.mystery!.clues.find(c => c.id === 'cole-saw')).toMatchObject({ status: 'found', foundAt: 15, quick: true });
    expect(out.changed).toBe(true); expect(out.mysteryEnded).toBe(false);
  });
  test('the right answer solves it; a wrong one is recorded and it stays open; an unsure reading never solves it', () => {
    const nb = withMystery(), plan = quickQuestions(nb, now);
    const right = applyQuick(nb, plan, result(plan, { theory: noul(0.95), theory_right: noul(0.9) }), now, 'It was you, Brother Hale. You took it down to the landing.');
    expect(right.notebook.mystery).toMatchObject({ status: 'solved', endReply: 15 });
    expect(right.notebook.mystery!.theories.at(-1)).toMatchObject({ verdict: 'right', atReply: 15 });
    expect(right.notebook.story.cameOut.map(r => r.text)).toContain(ANSWER);
    expect(right.mysteryEnded).toBe(true);
    const wrong = applyQuick(nb, plan, result(plan, { theory: noul(0.95), theory_right: noul(0.05) }), now, 'Wren, it was you.');
    expect(wrong.notebook.mystery!.status).toBe('open'); expect(wrong.notebook.mystery!.theories.at(-1)).toMatchObject({ verdict: 'wrong', text: 'Wren, it was you.' });
    const unsure = applyQuick(nb, plan, result(plan, { theory: noul(0.95), theory_right: noul(0.5) }), now, 'Someone from the chapel did it.');
    expect(unsure.notebook.mystery!.status).toBe('open'); expect(unsure.notebook.mystery!.theories.at(-1)!.verdict).toBe('partly');
    // No guess, no verdict, even if the model thinks the answer matches something.
    const none = applyQuick(nb, plan, result(plan, { theory: noul(0.1), theory_right: noul(0.9) }), now, 'I look around the chapel.');
    expect(none.notebook.mystery!.theories).toEqual([]); expect(none.notebook.mystery!.status).toBe('open');
  });
  test('if the narrator lets the answer out anyway, the mystery ends as come out, not as solved', () => {
    const nb = withMystery(), plan = quickQuestions(nb, now);
    const out = applyQuick(nb, plan, result(plan, { mystery_out: noul(0.9) }), now, 'I wait.');
    expect(out.notebook.mystery).toMatchObject({ status: 'revealed', endReply: 15 }); expect(out.mysteryEnded).toBe(true);
  });
});

describe('the lock function by itself', () => {
  test('with nothing before, a mystery appears only when asked for, and starts clean', () => {
    const m = withMystery().mystery as Mystery;
    expect(lockMystery(undefined, m, false)).toBeUndefined();
    const fresh = lockMystery(undefined, { ...m, status: 'solved', theories: [{ text: 'x', verdict: 'right' }] }, true)!;
    expect(fresh.status).toBe('open'); expect(fresh.theories).toEqual([]); expect(fresh.startReply).toBeUndefined();
  });
  test('a finished mystery can be followed by a new one, on request', () => {
    const old = { ...(withMystery().mystery as Mystery), status: 'solved' as const };
    const next = { ...old, status: 'open' as const, question: 'Who is leaving flowers at the grave?', answer: 'Mira leaves them, for a brother nobody knew she had.' };
    expect(lockMystery(old, next, false)!.question).toBe('Who took the chapel silver?');
    expect(lockMystery(old, next, true)!.question).toBe('Who is leaving flowers at the grave?');
  });
});

describe('the answer stays out of what the narrator sees', () => {
  test('an honest notebook raises nothing', () => {
    expect(mysteryLeaks(withMystery())).toEqual([]);
    expect(leakProblems(withMystery())).toEqual([]);
    expect(mysteryLeaks(validateNotebook(sampleNotebook()))).toEqual([]);
  });
  test('a step, a hint, or a note on a person that reads as the answer is caught, even reworded', () => {
    const nb = withMystery();
    nb.threads[1].steps.push({ id: 'seen', text: 'Brother Hale is seen carrying the alms sack down to the landing after evening prayer.', sign: '', afterHours: 5, status: 'waiting' });
    nb.people.find(p => p.id === 'brother-hale')!.doing = 'Waiting for dark to move the sack from under the landing, before the debt comes due upriver.';
    nb.seeds[0].payoff = 'It shows that Hale carried the sack to the landing because of money he owes.';
    const where = mysteryLeaks(nb).join(' | ');
    expect(where).toContain(`waiting steps of thread "${nb.threads[1].id}"`); expect(where).toContain('"brother-hale"'); expect(where).toContain('seeds');
    expect(leakProblems(nb)[0]).toContain('Rewrite those so they give nothing away');
  });
  test('if asking does not help, those lines are taken out by hand, and nothing else is', () => {
    const before = withMystery(), nb = structuredClone(before);
    nb.threads[1].steps.push({ id: 'seen', text: 'Brother Hale is seen carrying the alms sack down to the landing after evening prayer.', sign: '', afterHours: 5, status: 'waiting' });
    nb.threads[0].steps[0].sign = 'Hale counts the debt money he owes upriver, the alms sack at his feet by the landing.';
    nb.people.find(p => p.id === 'brother-hale')!.doing = 'Waiting for dark to move the sack from under the landing, before the debt comes due upriver.';
    nb.story.hiddenTruth.push('Hale carried the silver out in the alms sack after prayer and hid it under the landing.');
    const clean = scrubLeaks(nb, before);
    expect(mysteryLeaks(clean)).toEqual([]);
    expect(clean.threads[1].steps.some(s => s.id === 'seen')).toBe(false);
    expect(clean.threads[0].steps[0].sign).toBe(before.threads[0].steps[0].sign);
    expect(clean.people.find(p => p.id === 'brother-hale')!.doing).toBe(before.people.find(p => p.id === 'brother-hale')!.doing);
    expect(clean.story.hiddenTruth).toEqual(before.story.hiddenTruth);
    expect(clean.people.find(p => p.id === 'mira')).toEqual(before.people.find(p => p.id === 'mira'));
    expect(clean.mystery).toEqual(before.mystery);
  });
  test('while a mystery is open, a thread with no safe hint is described by its title, never by its hidden reasons', () => {
    const nb = withMystery(); const main = nb.threads.find(t => t.id === nb.arc.main)!; main.hint = '';
    expect(note(nb, 12)).toContain(`The main storyline is ${main.title}: ${main.title}.`);
    expect(note(nb, 12)).not.toContain(main.why);
  });
});

