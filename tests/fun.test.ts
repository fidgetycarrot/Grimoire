import { describe, expect, test } from 'bun:test';
import { followRate, stockProblems } from '../src/cast';
import { validateNotebook, type Preferences } from '../src/notebook';
import { checkupMessages, creationMessages } from '../src/prompts';
import { applyChanges } from '../src/talk';
import { tidyNotebook } from '../src/tidy';
import { sampleNotebook } from './fixtures';

const prefs = (p: Partial<Preferences> = {}): Preferences => ({ tone: 'balanced', twist: true, shape: 'auto', lockShape: false, size: 'auto', ...p });

describe('a plan that runs dry', () => {
  test('no possible moments, no secrets, or lies nobody doubts are sent back', () => {
    const before = validateNotebook(sampleNotebook());
    expect(stockProblems(before, before, prefs())).toEqual([]);
    const dry = structuredClone(before);
    for (const b of dry.beats) b.status = 'happened';
    dry.story.hiddenTruth = [];
    dry.covers = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, by: 'player', told: ['mira'], said: `lie ${id}`, hides: 'x', status: 'holding' as const }));
    const text = stockProblems(before, dry, prefs()).join(' ');
    expect(text).toContain('no possible moments left');
    expect(text).toContain('Every secret has come out');
    expect(text).toContain('Let one start to strain');
    dry.covers[0].status = 'strained';
    expect(stockProblems(before, dry, prefs()).join(' ')).not.toContain('strain');
    expect(stockProblems(before, dry, prefs({ size: 'close' })).join(' ')).not.toContain('Every secret');
  });
});

describe('is the narrator listening', () => {
  const r = (reply: number, shown: number, keys: string[] = ['due_1']) => ({ reply, ok: true, marked: shown ? 1 : 0, answers: Object.fromEntries(keys.map(k => [k, k.startsWith('due_') && shown ? 0.9 : 0.1])) });
  test('counts replies told to bring in a due step, and how many did', () => {
    expect(followRate([r(1, 0), r(2, 1), r(3, 0)])).toBeNull();
    expect(followRate([r(1, 0), r(2, 1), r(3, 0), r(4, 2), r(5, 0, ['rushing'])])).toEqual({ offered: 4, used: 2 });
    // A swiped reply counts once, by its last check.
    expect(followRate([r(1, 0), r(1, 1), r(2, 0), r(3, 0), r(4, 0)])).toEqual({ offered: 4, used: 1 });
    // Optional moments left out are not a miss: only due steps count.
    expect(followRate([1, 2, 3, 4, 5].map(n => r(n, 0, ['moment_1', 'detail_mentioned'])))).toBeNull();
  });
});

describe('check-ups that list only what changes', () => {
  test('changed items replace their old ones, the rest stays, and top-level fields come along', () => {
    const base = validateNotebook(sampleNotebook());
    const thread = structuredClone(base.threads[0]); thread.steps[0].status = 'shown';
    const proposed = applyChanges(base, { threads: [thread], rhythm: 'peak', recap: 'The ring is still missing.', taste: ['lingers in quiet scenes'], events: ['A shout from the manor.'] })!;
    const after = validateNotebook(tidyNotebook(proposed, base));
    expect(after.threads[0].steps[0].status).toBe('shown');
    expect(after.threads).toHaveLength(base.threads.length);
    expect(after.people).toEqual(base.people);
    expect(after).toMatchObject({ rhythm: 'peak', recap: 'The ring is still missing.', taste: ['lingers in quiet scenes'] });
    expect(after.events.at(-1)).toBe('A shout from the manor.');
  });
  test('taste and recap survive an update that leaves them out', () => {
    const base = validateNotebook({ ...sampleNotebook(), taste: ['skips combat'], recap: 'So far.' });
    const raw: any = structuredClone(base); delete raw.taste; delete raw.recap;
    expect(validateNotebook(tidyNotebook(raw, base))).toMatchObject({ taste: ['skips combat'], recap: 'So far.' });
  });
  test('the planner is asked for changes, taste, a recap, wins, a real choice, and the player\'s own storyline', () => {
    const input: any = { notebook: validateNotebook(sampleNotebook()), pace: 'auto', chat: [], trackerText: '', trackerValues: {}, trackerChecks: [], recipe: { fields: [], note: '' }, clockOwner: { day: 'notebook', hour: 'notebook' }, due: [], skipHours: 0, reason: 'test', preferences: prefs(), resync: false, held: [], notes: [], part: { elapsed: 0, length: 60 }, replan: false, replies: [], lore: { rules: [], entries: [], index: [], more: 0 }, away: [], places: [] };
    const checkup = checkupMessages(input).map((m: any) => m.content).join('\n');
    expect(checkup).toContain('Return {"changes": {...}');
    expect(checkup).toContain('do not copy unchanged items');
    expect(checkup).toContain('What the player enjoys');
    expect(checkup).toContain('a long intimate scene says nothing by its length');
    const material = { character: { name: 'Claire', description: '', personality: '', scenario: '', firstMessage: '' }, persona: null, lore: { rules: [], entries: [], index: [], more: 0 }, storySoFar: '', chat: [], replies: [], variables: {} };
    const create = creationMessages(material, prefs())[0].content;
    for (const part of ['at least one win the player can earn', 'one real choice', 'a storyline of their own', 'never invent their past']) expect(create).toContain(part);
  });
});

describe('what the player says they like', () => {
  test('is kept with the chat and comes first for the planner', () => {
    const { validPreferences } = require('../src/controller');
    expect(validPreferences({ likes: '  slow build  ' }).likes).toBe('slow build');
    expect('likes' in validPreferences({ likes: '   ' })).toBe(false);
    const input: any = { notebook: validateNotebook(sampleNotebook()), pace: 'auto', chat: [], trackerText: '', trackerValues: {}, trackerChecks: [], recipe: { fields: [], note: '' }, clockOwner: { day: 'notebook', hour: 'notebook' }, due: [], skipHours: 0, reason: 'test', preferences: prefs({ likes: 'slow build' }), resync: false, held: [], notes: [], part: { elapsed: 0, length: 60 }, replan: false, replies: [], lore: { rules: [], entries: [], index: [], more: 0 }, away: [], places: [] };
    expect(checkupMessages(input).map((m: any) => m.content).join('\n')).toContain('It comes first: plan by it');
  });
});

describe('room for new moments in a long chat', () => {
  test('old finished moments and breadcrumbs are retired so new ones fit', () => {
    const { mergeRevision } = require('../src/notebook');
    const base: any = sampleNotebook();
    base.beats = Array.from({ length: 16 }, (_, i) => ({ id: `done-${i}`, text: `Moment ${i}`, purpose: 'p', conditions: '', thread: '', intensity: 'low', status: 'happened' }));
    base.seeds = Array.from({ length: 12 }, (_, i) => ({ id: `crumb-${i}`, detail: `Detail ${i}`, payoff: 'x', pays: '', status: i < 8 ? 'paid' : 'planted' }));
    const before = validateNotebook(base);
    const raw: any = structuredClone(before);
    raw.beats.push({ id: 'new-one', text: 'A new moment', purpose: 'p', status: 'possible' }, { id: 'new-two', text: 'Another', purpose: 'p', status: 'possible' });
    raw.seeds.push({ id: 'new-crumb', detail: 'A new detail', payoff: 'y', status: 'waiting' });
    const after = validateNotebook(tidyNotebook(raw, before));
    expect(after.beats.filter(b => b.status === 'possible').map(b => b.id)).toEqual(['new-one', 'new-two']);
    expect(after.beats.filter(b => b.status === 'happened').map(b => b.id)).toEqual(['done-10', 'done-11', 'done-12', 'done-13', 'done-14', 'done-15']);
    expect(after.seeds.map(s => s.id)).toContain('new-crumb');
    expect(after.seeds.filter(s => s.status === 'paid')).toHaveLength(4);
    expect(() => mergeRevision(before, after, 50)).not.toThrow();
  });
});
