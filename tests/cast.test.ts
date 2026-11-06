import { describe, expect, test } from 'bun:test';
import { awayPeople, castProblems, noteSeen } from '../src/cast';
import { buildNote } from '../src/note';
import { mergeRevision, validateNotebook, waitsFor, type Notebook, type Preferences } from '../src/notebook';
import { creationMessages } from '../src/prompts';
import { tidyNotebook } from '../src/tidy';
import { sampleNotebook } from './fixtures';

const prefs = (p: Partial<Preferences> = {}): Preferences => ({ tone: 'balanced', twist: true, shape: 'auto', lockShape: false, size: 'auto', ...p });
const waits = waitsFor('medium', 'auto');
const note = (nb: Notebook, extra: Partial<Parameters<typeof buildNote>[0]> = {}) =>
  buildNote({ notebook: nb, pace: 'auto', clock: { day: 1, hour: 18, label: '' }, now: { hours: 10, reply: 40, waits }, recent: 'Mira looks up.', ...extra });

describe('a world that grows', () => {
  test('a first notebook with a tiny cast, or nobody left to meet, is sent back; kept close, it is not', () => {
    const nb = validateNotebook(sampleNotebook());
    const small = structuredClone(nb); small.people = small.people.slice(0, 3);
    expect(castProblems(null, small, prefs()).join(' ')).toContain('at least 5 people');
    expect(castProblems(null, small, prefs({ size: 'wide' })).join(' ')).toContain('at least 7 people');
    expect(castProblems(null, nb, prefs())).toEqual([]);
    expect(castProblems(null, small, prefs({ size: 'close' }))).toEqual([]);
  });
  test('a check-up that leaves nobody new to meet is asked for new people, unless it added some', () => {
    const before = validateNotebook(sampleNotebook());
    const allMet = structuredClone(before); for (const p of allMet.people) p.met = true;
    expect(castProblems(before, allMet, prefs()).join(' ')).toContain('Add two or three new people');
    const grown = structuredClone(allMet); grown.people.push({ ...grown.people[0], id: 'pell', name: 'Pell', aliases: [], met: false });
    expect(castProblems(allMet, grown, prefs())).toEqual([]);
    expect(castProblems(before, allMet, prefs({ size: 'close' }))).toEqual([]);
  });
  test('the planner is told how big the world gets', () => {
    const material = { character: { name: 'Claire', description: '', personality: '', scenario: '', firstMessage: '' }, persona: null, lore: { rules: [], entries: [], index: [], more: 0 }, storySoFar: '', chat: [], replies: [], variables: {} };
    expect(creationMessages(material, prefs())[0].content).toContain('the story should not stay in one place with the same few people');
    expect(creationMessages(material, prefs({ size: 'close' }))[0].content).toContain('kept close');
    expect(creationMessages(material, prefs())[0].content).toContain('"covers"');
  });
});

describe('a recurring cast', () => {
  test('people met but away for a while are found, and one is brought back in a calm stretch', () => {
    const nb = validateNotebook(sampleNotebook());
    const mira = nb.people.find(p => p.id === 'mira')!, oswin = nb.people.find(p => p.id === 'harbor-master')!;
    let seen = noteSeen({}, nb, [mira], 5);
    expect(seen).toEqual({ mira: 5, 'harbor-master': 5 });
    seen = noteSeen(seen, nb, [mira], 38);
    const away = awayPeople(nb, seen, [mira], { hours: 10, reply: 40, waits });
    expect(away.map(a => [a.person.id, a.replies])).toEqual([['harbor-master', 35]]);
    for (const p of nb.people) p.met = true;
    expect(note(nb, { away: [oswin] })).toContain('Someone the player hasn\'t seen in a while could cross their path again');
    expect(note(nb, { away: [oswin], pace: 'quiet' })).not.toContain('hasn\'t seen in a while');
  });
});

describe('lies that need upkeep', () => {
  const lie = (over: Record<string, unknown> = {}) => ({ id: 'upset-stomach', by: 'player', told: ['mira'], said: 'his stomach was upset', hides: 'why he took so long upstairs', status: 'holding', ...over });
  test('they are tidied, kept, and once exposed stay exposed', () => {
    const raw: any = { ...sampleNotebook(), covers: [lie({ by: 'User', told: ['Mira', 'nobody'], status: 'believed' })] };
    const nb = validateNotebook(tidyNotebook(raw));
    expect(nb.covers).toEqual([lie()] as any);
    const exposed = structuredClone(nb); exposed.covers[0].status = 'exposed';
    const dropped: any = structuredClone(exposed); dropped.covers = [];
    expect(validateNotebook(tidyNotebook(dropped, exposed)).covers[0].status).toBe('exposed');
    const undone = structuredClone(exposed); undone.covers[0].status = 'holding';
    expect(() => mergeRevision(exposed, undone, 10)).toThrow('Keep it exposed');
  });
  test('the narrator hears of the player\'s lie only when someone who was told is in the scene; others\' lies stay secret', () => {
    const nb = validateNotebook({ ...sampleNotebook(), covers: [lie(), lie({ id: 'ring-alibi', by: 'harbor-master', told: ['mira'], said: 'he was at the shrine all night', hides: 'the theft' })] });
    const text = note(nb);
    expect(text).toContain('The player character told Mira: "his stomach was upset", to cover why he took so long upstairs. They remember it;');
    expect(text).not.toContain('shrine all night');
    expect(note(nb, { recent: 'Cole waves.' })).not.toContain('stomach');
    const out = structuredClone(nb); out.covers[0].status = 'exposed';
    expect(note(out)).not.toContain('stomach');
  });
});

describe('getting out of the house', () => {
  test('a storyline that waited too long gives the player a reason to go, unless it is urgent or the story is kept close', () => {
    const nb = validateNotebook({ ...sampleNotebook(), arc: { shape: 'conflict', stage: 'setup', turn: '', main: 'stolen-ring' } });
    nb.threads[0].steps[0].afterHours = 0; nb.threads[0].steps[0].now = true; nb.threads[0].startReply = 10;
    const at = (extra = {}) => note(nb, { now: { hours: 10, reply: 14, waits }, ...extra });
    expect(at()).toContain('or word reaches them, with a reason to go where it is happening');
    expect(at({ size: 'close' })).toContain('or word reaches them, or it happens where they are');
  });
  test('a story of nonstop big moments still meets new people, after a long while without anyone new', () => {
    const nb = validateNotebook(sampleNotebook()); nb.rhythm = 'peak';
    expect(note(nb, { sinceNewFace: 5 })).not.toContain('Someone who could appear');
    expect(note(nb, { sinceNewFace: 25 })).toContain('Someone who could appear if it fits: Cole');
    expect(note(nb, { sinceNewFace: 25, pace: 'quiet' })).not.toContain('Someone who could appear');
    nb.rhythm = 'aftermath';
    expect(note(nb, { sinceNewFace: 25 })).not.toContain('Someone who could appear');
  });
  test('check-ups see where recent scenes took place, and are told to vary the pull', () => {
    const { recentPlaces } = require('../src/controller');
    const v = (location: string) => ({ location, covered: [] });
    expect(recentPlaces([v('Kitchen, Vance Residence'), v('Vance Residence, kitchen'), v('Master Bedroom'), v('Kitchen, Vance Residence')], 'Backyard Patio'))
      .toEqual(['Kitchen, Vance Residence', 'Master Bedroom', 'Kitchen, Vance Residence', 'Backyard Patio']);
    const { checkupMessages } = require('../src/prompts');
    const input: any = { notebook: validateNotebook(sampleNotebook()), pace: 'auto', chat: [], trackerText: '', trackerValues: {}, trackerChecks: [], recipe: { fields: [], note: '' }, clockOwner: { day: 'notebook', hour: 'notebook' }, due: [], skipHours: 0, reason: 'test', preferences: prefs(), resync: false, held: [], notes: [], part: { elapsed: 0, length: 60 }, replan: false, replies: [], lore: { rules: [], entries: [], index: [], more: 0 }, away: [], places: ['Kitchen'] };
    const text = checkupMessages(input).map((m: any) => m.content).join('\n');
    expect(text).toContain('never the same shape twice running and never on a schedule');
    expect(checkupMessages({ ...input, preferences: prefs({ size: 'close' }) }).map((m: any) => m.content).join('\n')).not.toContain('Where the story goes');
  });
});
