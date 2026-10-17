import { describe, expect, test } from 'bun:test';
import { absoluteHours, advanceClock, describeClock, durationHours, readDay, readTime } from '../src/clock';
import { checkRecipe, readField, readTracker, trackerText, validateRecipe, type Recipe } from '../src/tracker';
import { dueThreads, keepTimes, mergeRevision, nextStep, stamp, validateNotebook, withoutTimes } from '../src/notebook';
import { buildNote, liveClock, presentPeople } from '../src/note';
import { conversation, covers, fingerprints, newestMatching } from '../src/history';
import { askJson, parseJson } from '../src/model';
import { sampleNotebook } from './fixtures';

describe('story time', () => {
  test('reads clock times, parts of the day, day counts, and dates', () => {
    expect(readTime('21:40')).toEqual({ hour: 21 + 40 / 60, exact: true });
    expect(readTime('9:15 PM')?.hour).toBeCloseTo(21.25);
    expect(readTime('12 am')).toEqual({ hour: 0, exact: true });
    expect(readTime('late in the evening')).toEqual({ hour: 19, exact: false });
    expect(readTime('25:00')).toBeNull();
    expect(readTime('a quiet room')).toBeNull();
    expect(readDay('Day 3, evening')).toEqual({ day: 3, kind: 'count' });
    expect(readDay('1892-03-14')?.kind).toBe('date');
    expect(readDay('March 15, 1892')!.day - readDay('1892-03-14')!.day).toBe(1);
    expect(readDay('14th of March 1892')).toEqual(readDay('1892-03-14'));
    expect(readDay('February 30')).toBeNull();
  });
  test('measures and moves time', () => {
    expect(absoluteHours({ day: 2, hour: 6 })).toBe(54);
    expect(absoluteHours({ day: 2, hour: null })).toBe(60);
    expect(advanceClock({ day: 1, hour: 22, label: 'night' }, 5)).toEqual({ day: 2, hour: 3, label: '' });
    expect(advanceClock({ day: 1, hour: null, label: '' }, 72)).toEqual({ day: 4, hour: null, label: '' });
    expect(durationHours(3, 'days')).toBe(72);
    expect(() => durationHours(-1, 'days')).toThrow();
    expect(() => durationHours(1, 'years')).toThrow();
    expect(describeClock({ day: 3, hour: 21.5, label: '' })).toBe('Day 3, 21:30');
    expect(describeClock({ day: 3, hour: 21.5, label: 'Day 3, late evening' })).toBe('Day 3, late evening');
  });
});

const block = (time: string, place: string) => `The rain eases.\n\n<status>\n**Time:** ${time}\n- Location: ${place}\nPresent: Mira, Cole\n</status>`;
const recipe = (): Recipe => validateRecipe({ fields: [
  { name: 'datetime', type: 'datetime', source: { kind: 'line', label: 'Time', region: { kind: 'tag', tag: 'status' } } },
  { name: 'location', type: 'text', source: { kind: 'line', label: 'Location', region: { kind: 'tag', tag: 'status' } } },
  { name: 'present', type: 'list', source: { kind: 'line', label: 'Present', region: { kind: 'tag', tag: 'status' } } },
] }).recipe;

describe('reading a tracker', () => {
  test('reads labeled lines inside a tag, ignoring markdown', () => {
    const reply = block('Day 3, 21:40', 'The Drowned Lantern inn');
    expect(readField(recipe().fields[0], reply, {})).toBe('Day 3, 21:40');
    expect(readField(recipe().fields[1], reply, {})).toBe('The Drowned Lantern inn');
    expect(readField(recipe().fields[1], 'Location: outside the tag', {})).toBeUndefined();
  });
  test('reads variables, tags, and JSON in a fence', () => {
    const { recipe: r } = validateRecipe({ fields: [
      { name: 'location', type: 'text', source: { kind: 'variable', name: 'loc' } },
      { name: 'time', type: 'time', source: { kind: 'tag', tag: 'time', region: { kind: 'whole' } } },
      { name: 'present', type: 'list', source: { kind: 'json', path: 'scene.present', region: { kind: 'fence', lang: 'json' } } },
    ] });
    const reply = 'Text <time>9:00 PM</time>\n```json\n{"scene":{"present":["Mira","Cole"]}}\n```';
    expect(readField(r.fields[0], reply, { loc: 'The inn' })).toBe('The inn');
    expect(readField(r.fields[1], reply, {})).toBe('9:00 PM');
    expect(readField(r.fields[2], reply, {})).toBe('Mira, Cole');
  });
  test('accepts only the described methods and drops the rest', () => {
    const { recipe: r, dropped } = validateRecipe({ fields: [
      { name: 'location', type: 'text', source: { kind: 'regex', pattern: '(.*)' } },
      { name: 'time', type: 'time', source: { kind: 'tag', tag: 'bad tag<' } },
      { name: 'present', type: 'list', source: { kind: 'json', path: 'a', region: { kind: 'whole' } } },
      { name: 'Bad Name', type: 'text', source: { kind: 'variable', name: 'x' } },
      { name: 'date', type: 'date', source: { kind: 'variable', name: 'day' } },
    ] });
    expect(dropped).toBe(4);
    expect(r.fields.map(f => f.name)).toEqual(['date']);
  });
  test('trusts a field only after it reads and fits in a real reply', () => {
    expect(checkRecipe(recipe(), [], {}).map(c => c.status)).toEqual(['waiting', 'waiting', 'waiting']);
    const checks = checkRecipe(recipe(), ['No tracker here.', block('Day 3, 21:40', 'The inn')], {});
    expect(checks.map(c => c.status)).toEqual(['verified', 'verified', 'verified']);
    const wrong = checkRecipe(recipe(), [block('soon', 'The inn')], {});
    expect(wrong[0].status).toBe('unavailable');
    expect(readTracker(recipe(), checks, [block('Day 4, 08:00', 'The ferry')], {})).toEqual({ datetime: 'Day 4, 08:00', location: 'The ferry', present: 'Mira, Cole' });
    expect(trackerText(recipe(), block('Day 4, 08:00', 'The ferry'))).toContain('Location: The ferry');
  });
  test('tracker-owned parts of the clock replace the notebook’s, one owner each', () => {
    const types = { datetime: 'datetime' as const };
    const both = liveClock({ day: 1, hour: 9, label: '' }, { datetime: 'Day 3, 21:40' }, types);
    expect(both.clock.day).toBe(3); expect(both.clock.hour).toBeCloseTo(21.67); expect(both.sources).toEqual({ day: 'tracker', hour: 'tracker', exact: true });
    const hourOnly = liveClock({ day: 2, hour: 9, label: '' }, { time: 'evening' }, { time: 'time' });
    expect(hourOnly.clock).toEqual({ day: 2, hour: 19, label: 'evening' });
    expect(hourOnly.sources).toEqual({ day: 'notebook', hour: 'tracker', exact: false });
    expect(liveClock({ day: 2, hour: null, label: '' }, {}, {}).sources).toEqual({ day: 'notebook', hour: 'unknown', exact: false });
  });
});

describe('the notebook', () => {
  test('validates a model notebook and rejects unsafe or oversized text', () => {
    const notebook = validateNotebook(sampleNotebook());
    expect(notebook.threads[0].steps).toHaveLength(3);
    const bad = (change: (n: any) => void) => { const n: any = sampleNotebook(); change(n); return () => validateNotebook(n); };
    expect(bad(n => { n.story.question = '{{setvar::x::1}}'; })).toThrow('template');
    expect(bad(n => { n.people[0].hint = '<b>bold</b>'; })).toThrow('HTML');
    expect(bad(n => { n.threads[0].id = 'Bad Id'; })).toThrow('short id');
    expect(bad(n => { n.threads[0].steps[0].afterHours = -3; })).toThrow('story hours');
    expect(bad(n => { n.threads.push(n.threads[0]); })).toThrow('repeated');
    expect(bad(n => { n.clock.hour = 30; })).toThrow('0 to 23');
    expect(bad(n => { n.threads = Array.from({ length: 13 }, (_, i) => ({ ...n.threads[0], id: `t${i}` })); })).toThrow('Merge or close');
  });
  test('unknown people in a thread are dropped, not trusted', () => {
    const n: any = sampleNotebook(); n.threads[0].people = ['cole', 'nobody'];
    expect(validateNotebook(n).threads[0].people).toEqual(['cole']);
  });
  test('code owns when threads began and steps happened', () => {
    const start = stamp(withoutTimes(validateNotebook({ ...sampleNotebook(), threads: [{ ...sampleNotebook().threads[0], startAt: 999 }] })), 42);
    expect(start.threads[0].startAt).toBe(42);
    const revised = validateNotebook(structuredClone(start));
    revised.threads[0].startAt = 0;
    revised.threads[0].steps[0].status = 'shown';
    revised.threads[0].steps[0].at = 1;
    const merged = mergeRevision(start, revised, 60);
    expect(merged.threads[0].startAt).toBe(42);
    expect(merged.threads[0].steps[0].at).toBe(60);
  });
  test('nothing disappears quietly and the past cannot un-happen', () => {
    const base = stamp(validateNotebook(sampleNotebook()), 42);
    const without = (change: (n: any) => void) => { const n: any = structuredClone(base); change(n); return () => mergeRevision(base, validateNotebook(n), 50); };
    expect(without(n => { n.people = n.people.slice(1); })).toThrow('Keep Mira');
    expect(without(n => { n.threads = n.threads.slice(1); })).toThrow('Keep the thread');
    expect(without(n => { n.threads[0].status = 'closed'; })).toThrow('Say why');
    expect(without(n => { n.threads[0].steps.pop(); })).toThrow('Keep step');
    const shown = structuredClone(base); shown.threads[0].steps[0].status = 'shown'; shown.threads[0].steps[0].at = 50;
    const back = structuredClone(shown); back.threads[0].steps[0].status = 'waiting';
    expect(() => mergeRevision(shown, validateNotebook(back), 60)).toThrow("can't go back");
    const happened = structuredClone(base); happened.beats[0].status = 'happened';
    const undone = structuredClone(happened); undone.beats[0].status = 'possible';
    expect(() => mergeRevision(happened, validateNotebook(undone), 60)).toThrow('already happened');
    // Your own edits may remove things, keeping recorded times.
    const edited = structuredClone(shown); edited.threads = edited.threads.slice(0, 1);
    expect(keepTimes(shown, validateNotebook(edited), 70).threads.map(t => t.id)).toEqual(['stolen-ring']);
    expect(keepTimes(shown, validateNotebook(edited), 70).threads[0].steps[0].at).toBe(50);
  });
  test('steps become due by story time, one at a time, from the step before', () => {
    const nb = stamp(validateNotebook(sampleNotebook()), absoluteHours({ day: 1, hour: 18 }));
    const start = nb.threads[0].startAt!;
    expect(nextStep(nb.threads[0], start + 11)?.due).toBe(false);
    expect(nextStep(nb.threads[0], start + 12)?.due).toBe(true);
    nb.threads[0].steps[0].status = 'shown'; nb.threads[0].steps[0].at = start + 20;
    expect(nextStep(nb.threads[0], start + 30)).toMatchObject({ due: false, step: { id: 'stranger-asks' } });
    expect(nextStep(nb.threads[0], start + 44)?.due).toBe(true);
    nb.threads[0].status = 'closed';
    expect(nextStep(nb.threads[0], start + 999)).toBeNull();
    expect(dueThreads(nb, start + 2).map(d => d.thread.id)).toEqual(['storm']);
  });
});

describe('the note before each reply', () => {
  const base = () => stamp(validateNotebook(sampleNotebook()), absoluteHours({ day: 1, hour: 18 }));
  const note = (pace: 'auto' | 'quiet' | 'fast', hoursLater: number, extra: Partial<Parameters<typeof buildNote>[0]> = {}, nb = base()) => {
    const now = absoluteHours({ day: 1, hour: 18 }) + hoursLater;
    return buildNote({ notebook: nb, pace, clock: { day: Math.floor(now / 24), hour: now % 24, label: '' }, now, recent: 'Mira looks up from the chain.', ...extra });
  };
  test('carries reasons and safe hints, never the hidden truth', () => {
    const text = note('auto', 13);
    expect(text).toContain('The stolen ring');
    expect(text).toContain('the owner is starting to look for it');
    expect(text).toContain('Mira (ferry keeper): wants to keep the ferry running');
    expect(text).not.toContain('gambling debt');
    expect(text).not.toContain('Oswin stole it');
    expect(text).toContain('Never write the player character');
    expect(text.length).toBeLessThanOrEqual(2400);
  });
  test('quiet holds slower developments but lets urgent ones play out', () => {
    const quiet = note('quiet', 13);
    expect(quiet).toContain('Do not start new trouble');
    expect(quiet).toContain('The coming storm');
    expect(quiet).not.toContain('A shout from the manor');
    expect(quiet).not.toContain('Someone recognizes the ring');
    expect(quiet).not.toContain('Someone who could appear');
    const auto = note('auto', 13);
    expect(auto).toContain('A shout from the manor');
    expect(auto).toContain('at a natural break');
  });
  test('fast brings things in sooner and offers the next moment', () => {
    const fast = note('fast', 13);
    expect(fast).toContain('Keep scenes tight');
    expect(fast).toContain('bring this in soon');
    expect(fast).toContain('Someone recognizes the ring');
  });
  test('auto follows the story’s rhythm', () => {
    const after = base(); after.rhythm = 'aftermath';
    const text = note('auto', 13, {}, after);
    expect(text).toContain('a big moment just happened');
    expect(text).not.toContain('A shout from the manor');
    const stalled = base(); stalled.rhythm = 'stalled';
    expect(note('auto', 1, {}, stalled)).toContain('Let an existing thread move');
  });
  test('nothing is due before its time, and a time skip is told once', () => {
    expect(note('auto', 1)).not.toContain('Developments that are due');
    expect(note('auto', 1, { skipHours: 72 })).toContain('About 3 days have passed');
  });
  test('finds people by name or alias, whole words only', () => {
    const nb = base();
    expect(presentPeople(nb, 'The ferrywoman nods.').map(p => p.id)).toEqual(['mira']);
    expect(presentPeople(nb, 'A coleslaw stand.').map(p => p.id)).toEqual([]);
    expect(presentPeople(nb, '', 'Oswin, Cole').map(p => p.id)).toEqual(['cole', 'harbor-master']);
  });
});

describe('history', () => {
  test('a version matches while the chat still starts with what it covered', async () => {
    const turns = conversation([
      { id: 'b', role: 'assistant', content: 'Welcome.', index_in_chat: 1 },
      { id: 'a', role: 'user', content: 'Hello', index_in_chat: 0 },
      { id: 's', role: 'system', content: 'note', index_in_chat: 2 },
    ]);
    expect(turns.map(t => t.id)).toEqual(['a', 'b']);
    const prints = await fingerprints(turns);
    const longer = [...prints, 'x'];
    expect(covers(prints, longer)).toBe(true);
    expect(covers(longer, prints)).toBe(false);
    expect(newestMatching([{ covered: [] }, { covered: prints }, { covered: longer }], prints)).toBe(1);
    const edited = await fingerprints([{ id: 'a', role: 'user', content: 'Hello!' }, turns[1]]);
    expect(newestMatching([{ covered: [] }, { covered: prints }], edited)).toBe(0);
    expect(conversation([{ id: 'a', role: 'user', content: 'x', index_in_chat: 0 }], 'a')).toEqual([]);
  });
});

describe('model replies', () => {
  test('finds JSON in a fence or after a lead-in, and repairs once', async () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Here you go: {"a":2}')).toEqual({ a: 2 });
    expect(() => parseJson('no json')).toThrow('valid JSON');
    const replies = ['not json', '{"ok":true}'], seen: number[] = [];
    const result = await askJson(async messages => { seen.push(messages.length); return replies.shift()!; }, [{ role: 'user', content: 'x' }], value => (value as any).ok === true ? 'good' : (() => { throw new Error('no'); })());
    expect(result).toBe('good');
    expect(seen).toEqual([1, 3]);
    await expect(askJson(async () => 'still not json', [{ role: 'user', content: 'x' }], v => v)).rejects.toThrow('valid JSON');
  });
});

describe('planning a long chat', () => {
  const { planHistory, EARLIER } = require('../src/history');
  const turns = (n: number, size: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'user' : 'assistant', content: `${i} ${'x'.repeat(size)}` }));
  test('short chats are sent whole', () => {
    expect(planHistory(turns(10, 100))).toMatchObject({ earlier: [] });
  });
  test('very long chats stay within a bounded number of parts', () => {
    const plan = planHistory(turns(3000, 2500));
    expect(plan.earlier.length).toBeLessThanOrEqual(EARLIER.maxParts);
    expect(plan.earlier.flat().length + plan.recent.length).toBe(3000);
  });
});

describe('tidying a revision', () => {
  const { tidyNotebook } = require('../src/tidy');
  test('what happened stays happened, and dropped parts come back', () => {
    const before = stamp(validateNotebook(sampleNotebook()), 42);
    before.threads[0].steps[0] = { ...before.threads[0].steps[0], status: 'shown', at: 50 };
    before.beats[0].status = 'happened';
    const revised: any = structuredClone(before);
    revised.threads[0].steps = revised.threads[0].steps.slice(1); revised.beats = []; revised.people = [];
    const tidy = validateNotebook(tidyNotebook(revised, before));
    const merged = mergeRevision(before, tidy, 60);
    expect(merged.threads[0].steps.map(s => [s.id, s.status])[0]).toEqual(['owner-notices', 'shown']);
    expect(merged.threads[0].steps[0].at).toBe(50);
    expect(merged.beats.find(b => b.id === 'ring-recognized')!.status).toBe('happened');
    expect(merged.people).toHaveLength(3);
  });
});

describe('presets that keep facts in tag attributes', () => {
  const reply = '<scene_header sky="day" location="The Lantern Market" time="9:40 PM · Night" />\n\nRain on the awnings.\n<status_panel>\n<day_box>\nDay: Day 4\nTime: Night (9:40 PM)\n</day_box>\n</status_panel>';
  test('an attribute is read, and a broken attribute recipe is dropped', () => {
    const { recipe, dropped } = validateRecipe({ fields: [
      { name: 'location', type: 'text', source: { kind: 'attribute', tag: 'scene_header', attribute: 'location' } },
      { name: 'time', type: 'time', source: { kind: 'attribute', tag: 'scene_header', attribute: 'time' } },
      { name: 'date', type: 'date', source: { kind: 'line', label: 'Day', region: { kind: 'tag', tag: 'day_box' } } },
      { name: 'present', type: 'list', source: { kind: 'attribute', tag: 'bad tag', attribute: 'x' } },
    ] });
    expect(dropped).toBe(1);
    const checks = checkRecipe(recipe, [reply], {});
    expect(checks.map(c => c.status)).toEqual(['verified', 'verified', 'verified']);
    expect(readTracker(recipe, checks, [reply], {})).toEqual({ location: 'The Lantern Market', time: '9:40 PM · Night', date: 'Day 4' });
    expect(trackerText(recipe, reply)).toContain('location="The Lantern Market"');
    expect(trackerText(recipe, reply)).toContain('Day: Day 4');
  });
});

describe('messages as words', () => {
  const { readable } = require('../src/history');
  test('styling goes, text and fact-carrying attributes stay', () => {
    const raw = '<scene_header location="The Lantern Market" time="9:40 PM" />\nShe <b>laughs</b>.\n<div style="color:red"><style>.x{color:red}</style><span class="a">PANEL &amp; NOTES</span></div><!-- hidden --><font color="#fff">"Hi."</font>';
    const text = readable(raw, 1000);
    expect(text).toContain('[scene_header location: The Lantern Market; time: 9:40 PM]');
    expect(text).toContain('She laughs .');
    expect(text).toContain('PANEL & NOTES');
    expect(text).not.toMatch(/color|style|hidden|<|>/);
    expect(readable('x'.repeat(50), 10)).toHaveLength(10);
  });
});

describe('quick check answers', () => {
  const { quickQuestions, applyQuick } = require('../src/quick');
  const { prune } = require('../src/controller');
  test('only confident answers move the story, and only forward', () => {
    const nb = stamp(validateNotebook(sampleNotebook()), absoluteHours({ day: 1, hour: 18 }));
    nb.threads[1].steps[0].afterHours = 0;
    nb.beats[1].status = 'dropped';
    const plan = quickQuestions(nb, absoluteHours({ day: 1, hour: 18 }));
    expect(Object.keys(plan.questions)).toEqual(['due_1', 'moment_1', 'detail_mentioned', 'rhythm', 'new_turn']);
    const out = applyQuick(nb, plan, { model: 'm', answers: { due_1: { type: 'noul', noul: 0.9 }, moment_1: { type: 'noul', noul: 0.69 }, rhythm: { type: 'choice', choice: 'nonsense', probabilities: {}, confidence: 1 }, new_turn: { type: 'noul', noul: 0.2 } } }, 99);
    expect(out.notebook.threads[1].steps[0]).toMatchObject({ status: 'shown', at: 99 });
    expect(out.notebook.beats[0].status).toBe('possible');
    expect(out.notebook.rhythm).toBe('calm');
    expect(out).toMatchObject({ changed: true, marked: 1, needsCheckup: false });
    // Something a check-up already settled is left alone.
    const settled = structuredClone(nb); settled.threads[1].steps[0].status = 'skipped';
    expect(applyQuick(settled, plan, { model: 'm', answers: { due_1: { type: 'noul', noul: 1 } } }, 99).notebook.threads[1].steps[0].status).toBe('skipped');
  });
  test('pruning keeps the first version and the last full update', () => {
    const v = (reason: string, quick = false) => ({ notebook: sampleNotebook(), covered: [], at: 0, reason, ...(quick ? { quick: true } : {}) });
    const versions = [v('Notebook written'), v('Check-up'), ...Array.from({ length: 20 }, (_, i) => v(`Quick ${i}`, true))];
    const kept = prune(versions);
    expect(kept).toHaveLength(16);
    expect(kept.map((x: any) => x.reason).slice(0, 3)).toEqual(['Notebook written', 'Check-up', 'Quick 6']);
    expect(kept.at(-1).reason).toBe('Quick 19');
  });
});

describe('finding a tracker without a model', () => {
  const { guessRecipe } = require('../src/tracker');
  const sola = (time: string, place: string, day: number) => `<scene_header sky="day" location="${place}" time="${time}" />\n\nThe crowd roars. Time: is relative, she says.\n<sola_hud>\n<date>\nDay: Day ${day}\nTime: Morning (${time})\n</date>\n<char_matrix>\nLocation: ${place} · booth\n</char_matrix>\n</sola_hud>`;
  test('reads attributes first, then labeled lines inside their tag', () => {
    const recipe = guessRecipe([sola('11:20 AM', 'Artist Alley', 1), sola('11:05 AM', 'Hall H', 1)]);
    expect(recipe.fields.map((f: any) => [f.name, f.source.kind, f.source.tag ?? f.source.region?.tag])).toEqual([
      ['date', 'line', 'date'], ['time', 'attribute', 'scene_header'], ['location', 'attribute', 'scene_header'],
    ]);
    const checks = checkRecipe(recipe, [sola('2:00 PM', 'Hall H', 2)], {});
    expect(readTracker(recipe, checks, [sola('2:00 PM', 'Hall H', 2)], {})).toEqual({ date: 'Day 2', time: '2:00 PM', location: 'Hall H' });
  });
  test('labeled lines work too, and a one-off line in prose is not a tracker', () => {
    const block = (t: string) => `Prose.\n\n**Time:** ${t}\n**Location:** The docks`;
    expect(guessRecipe([block('9:15 PM'), block('8:50 PM')]).fields.map((f: any) => f.name)).toEqual(['time', 'location']);
    expect(guessRecipe(['She said: Time: never.', 'No tracker here.']).fields).toEqual([]);
    expect(guessRecipe([]).fields).toEqual([]);
  });
});

describe('clock guesses', () => {
  const { tidyNotebook } = require('../src/tidy');
  test('a thread never counts as starting in the future', () => {
    // Written while the hour was unknown (noon assumed); the tracker then said 11:26.
    const nb = stamp(validateNotebook(sampleNotebook()), absoluteHours({ day: 1, hour: null }));
    nb.threads[1].steps[0].afterHours = 0;
    expect(nextStep(nb.threads[1], absoluteHours({ day: 1, hour: 11.43 }))!.due).toBe(true);
    expect(nextStep(nb.threads[0], absoluteHours({ day: 1, hour: 11.43 }))!.due).toBe(false);
  });
  test('words like late morning give an hour when the model leaves it out', () => {
    const raw: any = sampleNotebook(); raw.clock = { day: 1, hour: null, label: 'Day 1, late morning on the show floor' };
    expect(validateNotebook(tidyNotebook(raw)).clock.hour).toBe(11);
    raw.clock = { day: 1, hour: null, label: 'Sometime' };
    expect(validateNotebook(tidyNotebook(raw)).clock.hour).toBeNull();
  });
});

describe('replies as well as story time', () => {
  const { waitsFor, fillReplies } = require('../src/notebook');
  const thread = () => { const nb = stamp(validateNotebook(sampleNotebook()), { hours: 42, reply: 10 }); return nb; };
  test('a step is due after enough replies even when story time barely moves', () => {
    const nb = thread(), steady = nb.threads[0];
    expect(steady.startReply).toBe(10);
    const waits = waitsFor('medium', 'auto');
    expect(waits).toEqual({ urgent: 4, steady: 15, slow: 40 });
    expect(nextStep(steady, { hours: 43, reply: 24, waits })!.due).toBe(false);
    expect(nextStep(steady, { hours: 43, reply: 25, waits })!.due).toBe(true);
    // Story time still works alone, as before.
    expect(nextStep(steady, { hours: 54, reply: 11, waits })!.due).toBe(true);
    expect(nextStep(steady, 43)!.due).toBe(false);
  });
  test('fast pace halves the waits, and the size setting scales them', () => {
    expect(waitsFor('medium', 'fast')).toEqual({ urgent: 2, steady: 8, slow: 20 });
    expect(waitsFor('short', 'auto').steady).toBe(8);
    expect(waitsFor('long', 'quiet').steady).toBe(30);
  });
  test('the count restarts from the last step that happened, and survives a check-up', () => {
    const nb = thread();
    nb.threads[0].steps[0] = { ...nb.threads[0].steps[0], status: 'shown', at: 44, atReply: 20 };
    const waits = waitsFor('medium', 'auto');
    expect(nextStep(nb.threads[0], { hours: 45, reply: 34, waits })!.due).toBe(false);
    expect(nextStep(nb.threads[0], { hours: 45, reply: 35, waits })!.due).toBe(true);
    const merged = mergeRevision(nb, validateNotebook(withoutTimes(structuredClone(nb))), { hours: 46, reply: 36 });
    expect(merged.threads[0].startReply).toBe(10);
    expect(merged.threads[0].steps[0].atReply).toBe(20);
  });
  test('older notebooks without reply counts count from when they were made', () => {
    const old = stamp(validateNotebook(sampleNotebook()), 42);
    expect(old.threads[0].startReply).toBeUndefined();
    expect(fillReplies(old, 7).threads[0].startReply).toBe(7);
  });
});

describe('suggesting a time skip', () => {
  const { skipOffer, quietReplies, hoursToNext } = require('../src/skip');
  const { waitsFor } = require('../src/notebook');
  const waits = waitsFor('medium', 'auto');
  // Day 1, 18:00; the ring thread began at reply 10 and its first step is 12 story hours out. The urgent storm is paused.
  const quietBook = (rhythm = 'calm') => { const nb: any = { ...stamp(validateNotebook(sampleNotebook()), { hours: 42, reply: 10 }), rhythm }; nb.threads[1].status = 'paused'; return nb; };
  const at = (reply: number, hours = 42) => ({ hours, reply, waits });
  const clock = { day: 1, hour: 18, label: '' };
  test('a calm scene that has gone quiet for a while gets a suggestion that lands on the next development', () => {
    const nb = quietBook();
    expect(quietReplies(nb, 19)).toBe(9);
    expect(hoursToNext(nb, 42)).toBe(12);
    expect(skipOffer(nb, at(18), clock, 0)).toBeNull();
    expect(skipOffer(nb, at(19), clock, 0)).toEqual({ options: [
      { hours: 12, label: 'Skip ahead to when something happens (about 12 hours)' },
      { hours: 14, label: 'Skip to tomorrow morning' },
    ] });
    // Once the thread comes due by replies, the narrator brings it in; no skip needed.
    expect(skipOffer(nb, at(25), clock, 0)).toBeNull();
  });
  test('a stalled scene gets it sooner; building, big, or busy scenes never do', () => {
    expect(skipOffer(quietBook('stalled'), at(13), clock, 0)).not.toBeNull();
    for (const rhythm of ['rising', 'peak', 'aftermath']) expect(skipOffer(quietBook(rhythm), at(19), clock, 0)).toBeNull();
    // Something due right now: the narrator should bring that in instead.
    expect(skipOffer(quietBook(), at(19, 54), clock, 0)).toBeNull();
  });
  test('nothing planned means no suggestion, and Not now keeps it away for a while', () => {
    const done = quietBook(); done.threads.forEach((t: any) => { t.status = 'closed'; t.closedReason = 'done'; });
    expect(skipOffer(done, at(19), clock, 0)).toBeNull();
    expect(skipOffer(quietBook(), at(20), clock, 0)).not.toBeNull();
    expect(skipOffer(quietBook(), at(20), clock, 19)).toBeNull();
    expect(skipOffer(quietBook(), at(24), clock, 19)).toBeNull();
  });
  test('an earlier hour offers the evening instead', () => {
    expect(skipOffer(quietBook(), at(19), { day: 1, hour: 10, label: '' }, 0)!.options.at(-1)).toEqual({ hours: 9, label: 'Skip to this evening' });
    expect(skipOffer(quietBook(), at(19), { day: 1, hour: null, label: '' }, 0)!.options).toHaveLength(1);
  });
});

describe('arc shapes and breadcrumbs', () => {
  const { seedPlan, PLANT_GAP } = require('../src/note');
  const { waitsFor, holdTurn } = require('../src/notebook');
  const { tidyNotebook } = require('../src/tidy');
  const waits = waitsFor('medium', 'auto');
  const base = () => stamp(validateNotebook(sampleNotebook()), { hours: 42, reply: 10 });
  const note = (nb: any, reply: number, hours = 42) => buildNote({ notebook: nb, pace: 'auto', clock: { day: 1, hour: 18, label: '' }, now: { hours, reply, waits }, recent: 'Mira' });
  test('a detail is planted without its meaning, then brought back much later with it', () => {
    const nb = base();
    const first = note(nb, 10);
    expect(first).toContain('A small detail to mention in passing, without drawing attention to it: Oswin seals his letters with green wax.');
    expect(first).not.toContain('ring box');
    nb.seeds[0] = { ...nb.seeds[0], status: 'planted', plantedAt: 11 };
    expect(seedPlan(nb, { hours: 42, reply: 12, waits }).ready).toEqual([]);
    expect(note(nb, 12)).not.toContain('green wax');
    // Fifteen replies later the ring thread's first step comes due, and the detail is tied to it.
    const later = note(nb, 26);
    expect(later).toContain('A shout from the manor');
    expect(later).toContain('Bring back something mentioned earlier: "Oswin seals his letters with green wax." (The ring box in the next town is sealed with the same green wax, tying the sale to Oswin)');
  });
  test('planting is spaced out and waits out big moments', () => {
    const nb: any = base(); nb.seeds.push({ id: 'bell', detail: 'The ferry bell is cracked.', payoff: 'It fails during the storm.', pays: 'storm', status: 'waiting' });
    nb.seeds[0] = { ...nb.seeds[0], status: 'planted', plantedAt: 10 };
    expect(seedPlan(nb, { hours: 42, reply: 10 + PLANT_GAP - 1, waits }).plant).toBeNull();
    expect(seedPlan(nb, { hours: 42, reply: 10 + PLANT_GAP, waits }).plant.id).toBe('bell');
    expect(seedPlan({ ...nb, rhythm: 'peak' }, { hours: 42, reply: 20, waits }).plant).toBeNull();
  });
  test('kishōtenketsu: gentle stage lines, and the turn stays secret until the turn', () => {
    const nb: any = { ...base(), rhythm: 'rising', arc: { shape: 'kishotenketsu', stage: 'sho', turn: 'Mira is the ring owner’s sister.' } };
    nb.seeds.push({ id: 'locket', detail: 'Mira wears a locket she never opens.', payoff: 'It holds a portrait of the ring’s owner.', pays: 'turn', status: 'planted', plantedAt: 11 });
    const sho = note(nb, 30);
    expect(sho).toContain('Arc: development. Deepen what is here');
    expect(sho).toContain('Pace: the scene is deepening');
    expect(sho).not.toContain('tension is building');
    expect(sho).not.toContain('sister');
    expect(sho).not.toContain('portrait');
    const ten = note({ ...nb, arc: { ...nb.arc, stage: 'ten' } }, 30);
    expect(ten).toContain('The turn: Mira is the ring owner’s sister.');
    expect(ten).toContain('"Mira wears a locket she never opens." (It holds a portrait of the ring’s owner)');
  });
  test('the turn waits for its breadcrumbs', () => {
    const before: any = { ...base(), arc: { shape: 'kishotenketsu', stage: 'sho', turn: 'x' }, seeds: [
      { id: 'a', detail: 'A.', payoff: 'a', pays: 'turn', status: 'planted' }, { id: 'b', detail: 'B.', payoff: 'b', pays: 'turn', status: 'waiting' }] };
    const early = { ...before, arc: { ...before.arc, stage: 'ten' } };
    expect(holdTurn(before, early).arc.stage).toBe('sho');
    const ready = { ...early, seeds: early.seeds.map((s: any) => ({ ...s, status: 'planted' })) };
    expect(holdTurn(before, ready).arc.stage).toBe('ten');
  });
  test('shapes and stages are checked, and loose model words are tidied', () => {
    const raw: any = sampleNotebook();
    expect(() => validateNotebook({ ...raw, arc: { shape: 'kishotenketsu', stage: 'climax', turn: '' } })).toThrow('arc.stage must be one of: ki, sho, ten, ketsu');
    raw.arc = { shape: 'Kishōtenketsu', stage: 'Development', turn: '' };
    raw.seeds = [{ id: 'Green Wax', detail: 'Green wax.', payoff: 'Oswin.', pays: 'The stolen ring', status: 'mentioned' }];
    const tidy = validateNotebook(tidyNotebook(raw));
    expect(tidy.arc).toEqual({ shape: 'kishotenketsu', stage: 'sho', turn: '' });
    expect(tidy.seeds[0]).toMatchObject({ id: 'green-wax', pays: 'stolen-ring', status: 'planted' });
    // Older notebooks without an arc or seeds still load.
    const { arc: _a, seeds: _s, ...old } = sampleNotebook() as any;
    expect(validateNotebook(old)).toMatchObject({ arc: { shape: 'conflict', stage: 'setup' }, seeds: [] });
  });
  test('a long note drops extra lines, never its rules', () => {
    const nb: any = base(); nb.story.question = 'Q '.repeat(1100);
    const text = note(nb, 10);
    expect(text.length).toBeLessThanOrEqual(2400 + 400);
    expect(text).toContain("Never write the player character's actions");
  });
});

describe('at a glance', () => {
  const { glance } = require('../src/skip');
  const { waitsFor } = require('../src/notebook');
  test('counts and shapes only, with when the next development comes at the latest', () => {
    const nb: any = stamp(validateNotebook(sampleNotebook()), { hours: 42, reply: 10 });
    nb.threads[1].status = 'paused';
    const g = glance(nb, { hours: 42, reply: 13, waits: waitsFor('medium', 'auto') });
    expect(g).toEqual({ shape: 'conflict', stage: 'setup', threads: { open: 1, urgent: 0, steady: 1, slow: 0, closed: 0 }, seeds: { waiting: 1, planted: 0, paid: 0 },
      moments: { possible: 2, big: 1, happened: 0 }, people: { total: 3, met: 2 }, nextInReplies: 12, dueNow: 0 });
    expect(JSON.stringify(g)).not.toMatch(/ring|Oswin|Mira|wax/i);
  });
});
