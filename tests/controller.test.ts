import { describe, expect, test } from 'bun:test';
import type { SpindleAPI } from 'lumiverse-spindle-types';
import { NotebookController } from '../src/controller';
import type { Message } from '../src/model';
import { sampleNotebook } from './fixtures';

const tracker = (time: string, place: string) => `\n<status>\nTime: ${time}\nLocation: ${place}\nPresent: Mira\n</status>`;
const recipe = { fields: [
  { name: 'datetime', type: 'datetime', source: { kind: 'line', label: 'Time', region: { kind: 'tag', tag: 'status' } } },
  { name: 'location', type: 'text', source: { kind: 'line', label: 'Location', region: { kind: 'tag', tag: 'status' } } },
  { name: 'present', type: 'list', source: { kind: 'line', label: 'Present', region: { kind: 'tag', tag: 'status' } } },
], note: 'status block' };

function host(options: { group?: boolean; granted?: string[]; decide?: (input: any) => unknown; noDecisionsHost?: boolean } = {}) {
  const storage = new Map<string, unknown>();
  const messages: any[] = [];
  let index = 0;
  const add = (role: 'user' | 'assistant', content: string) => { const m = { id: `m${index}`, role, content, index_in_chat: index++, swipe_id: 0, swipes: [content], metadata: {} }; messages.push(m); return m; };
  const granted = options.granted ?? ['generation', 'interceptor', 'chats', 'chat_mutation', 'characters', 'personas', 'world_books', 'decisions'];
  const decisionCalls: any[] = [];
  const api = {
    permissions: { has: (p: string) => granted.includes(p), getGranted: async () => [...granted] },
    userStorage: {
      getJson: async (key: string, o: any) => structuredClone(storage.has(key) ? storage.get(key) : o?.fallback),
      setJson: async (key: string, value: unknown) => { storage.set(key, structuredClone(value)); },
      list: async (prefix = '') => [...storage.keys()].filter(k => k.startsWith(prefix)),
    },
    chats: { get: async (id: string) => id === 'chat-1' || id === 'chat-2' ? { id, name: 'Low Water', character_id: 'card', metadata: options.group ? { group: true } : {}, updated_at: id === 'chat-1' ? 1_700_000_000 : 1_600_000_000 } : null },
    characters: { get: async () => ({ id: 'card', name: 'Mira', description: 'A ferry keeper in Low Water.', personality: 'Dry.', scenario: 'A stranger arrives.', first_mes: 'The ferry bell rings.', world_book_ids: ['book'] }) },
    personas: { getActive: async () => ({ id: 'p', name: 'Traveler', description: 'A tired traveler with a ring.' }) },
    world_books: { entries: { list: async () => ({ data: [{ comment: 'Low Water', content: 'A river town.', constant: true }], total: 1 }) } },
    // Like Lumiverse: reading messages needs chat_mutation.
    chat: { getMessages: async () => { if (!granted.includes('chat_mutation')) throw new Error('PERMISSION_DENIED: chat_mutation — Chat mutation permission not granted'); return structuredClone(messages); } },
    variables: { chat: { list: async () => ({}) } },
    connections: { list: async () => [{ id: 'model', name: 'Model', model: 'test', provider: 'test' }] },
    host: { descriptorVersion: 1, lumiverseVersion: 'test', capabilities: options.noDecisionsHost ? {} : { 'decisions-v1': 1 }, extensionInstallationId: 'x' },
    decisions: {
      listConnections: async () => [{ id: 'jev', name: 'Jev', provider: 'typesafe', model: '~typesafe/jev-latest', is_default: true }],
      evaluate: async (input: any) => { decisionCalls.push(input); const out = options.decide?.(input); if (out instanceof Error) throw out; return out; },
    },
  } as unknown as SpindleAPI;
  return { api, storage, messages, add, decisionCalls };
}
/** A scripted model: creation and check-up answers come from the given functions. */
function model(answers: { create?: (input: any) => unknown; checkup?: (input: any) => unknown; digest?: (input: any) => unknown }) {
  const calls: Array<{ task: string; input: any; messages: Message[] }> = [];
  let hold: Promise<void> | null = null;
  const ask = async (messages: Message[]) => {
    const input = JSON.parse(messages[1].content);
    calls.push({ task: input.task, input, messages });
    if (hold) await hold;
    const answer = input.task === 'grimoire-create-v1' ? answers.create?.(input) : input.task === 'grimoire-digest-v1' ? answers.digest?.(input) : answers.checkup?.(input);
    return typeof answer === 'string' ? answer : JSON.stringify(answer);
  };
  return { ask, calls, pause() { let release!: () => void; hold = new Promise(r => { release = () => { hold = null; r(); }; }); return release; } };
}
const created = () => ({ notebook: sampleNotebook(), tracker: recipe });
async function ready(h = host(), m = model({ create: created, checkup: input => ({ notebook: { ...input.notebook, summary: 'Notebook updated after the ferry.' }, tracker: null }) })) {
  h.add('assistant', `The ferry bell rings.${tracker('Day 1, 18:00', 'The ferry')}`);
  h.add('user', 'I step aboard.');
  h.add('assistant', `Mira takes your coin.${tracker('Day 1, 18:20', 'The ferry')}`);
  await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 3 }, {});
  const c = new NotebookController(h.api, undefined, () => {}, m.ask);
  await c.create('chat-1', { tone: 'balanced', twist: false });
  await c.waitForJobs();
  return { h, m, c };
}

describe('writing a notebook', () => {
  test('reads the card, persona, lore, chat, and tracker, then turns on', async () => {
    const { h, m, c } = await ready();
    const sent = m.calls[0].input;
    expect(sent.character).toMatchObject({ name: 'Mira', scenario: 'A stranger arrives.', firstMessage: 'The ferry bell rings.' });
    expect(sent.persona).toEqual({ name: 'Traveler', description: 'A tired traveler with a ring.' });
    expect(sent.lore).toEqual(['Low Water: A river town.']);
    expect(sent.chat).toHaveLength(3);
    expect(sent.replies).toHaveLength(2);
    expect(m.calls[0].messages[0].content).toContain('Do not plan a twist');
    // Pacing follows the chosen length, and threads are staggered.
    expect(m.calls[0].messages[0].content).toContain('The story is open-ended');
    expect(m.calls[0].messages[0].content).not.toContain('Story length');
    const view = (await c.view('chat-1'))!;
    expect(view).toMatchObject({ enabled: true, hasNotebook: true, behind: false, needsCheck: '', job: { status: 'complete' } });
    expect(view.checks.map(x => x.status)).toEqual(['verified', 'verified', 'verified']);
    // The tracker owns the clock it verifiably supplies.
    expect(view.clockText).toBe('Day 1, 18:20');
    expect(view.sources).toEqual({ day: 'tracker', hour: 'tracker', exact: true });
    expect((h.storage.get('chats/chat-1.json') as any).versions).toHaveLength(1);
  });
  test('a failed or invalid reply leaves no notebook and says why', async () => {
    const h = host(); h.add('assistant', 'Hello.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model' }, {});
    const m = model({ create: () => ({ notebook: 'nope', tracker: null }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    expect(m.calls).toHaveLength(2);
    const view = (await c.view('chat-1'))!;
    expect(view.hasNotebook).toBe(false);
    expect(view.job).toMatchObject({ status: 'failed', label: 'The notebook could not be written' });
    // The panel never names threads or people from a failed check; the model gets the details to fix its reply.
    // The panel's reason names only the field, never threads or people; the model gets the same reason to fix its reply.
    expect(view.job!.error).toBe('The model’s reply did not pass Grimoire’s checks, so nothing was changed. Details: story.question is required.');
    expect(m.calls[1].messages.at(-1)!.content).toContain('story.question is required');
  });
  test('a long chat is read from the beginning, part by part, before the notebook is written', async () => {
    const h = host();
    for (let i = 0; i < 120; i++) h.add(i % 2 ? 'user' : 'assistant', `Turn ${i}. ${'The river runs on. '.repeat(80)}`);
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model' }, {});
    const labels: string[] = [];
    const m = model({ create: created, digest: input => ({ record: `${input.record} Part ${input.part} read.`.trim() }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    const before = (await c.view('chat-1'))!;
    expect(before.earlierParts).toBeGreaterThan(1);
    const release = m.pause();
    await c.create('chat-1', {});
    for (let i = 0; i < 30 && !labels.length; i++) { await new Promise(r => setTimeout(r, 1)); const label = (await c.view('chat-1'))!.job!.label; if (label.startsWith('Reading')) labels.push(label); }
    release(); await c.waitForJobs();
    expect(labels[0]).toBe(`Reading the story so far (1 of ${before.earlierParts})`);
    const digests = m.calls.filter(x => x.task === 'grimoire-digest-v1');
    expect(digests).toHaveLength(before.earlierParts);
    // The first part starts at the first message; each part carries the record so far.
    expect(digests[0].input.chat[0].content).toStartWith('Turn 0.');
    expect(digests[1].input.record).toBe('Part 1 read.');
    const create = m.calls.find(x => x.task === 'grimoire-create-v1')!.input;
    expect(create.storySoFar).toContain(`Part ${before.earlierParts} read.`);
    expect(create.chat.at(-1).content).toStartWith('Turn 119.');
    // Together the parts and the recent messages cover every turn exactly once.
    const seen = [...digests.flatMap(d => d.input.chat), ...create.chat].map((t: any) => Number(/^Turn (\d+)/.exec(t.content)![1]));
    expect(seen).toEqual(Array.from({ length: 120 }, (_, i) => i));
    expect((await c.view('chat-1'))!).toMatchObject({ hasNotebook: true, job: { status: 'complete' }, earlierParts: 0 });
  });
  test('a short chat needs no extra reading', async () => {
    const { m, c } = await ready();
    expect(m.calls.filter(x => x.task === 'grimoire-digest-v1')).toHaveLength(0);
    expect(m.calls[0].input.storySoFar).toBe('');
    expect((await c.view('chat-1'))!.earlierParts).toBe(0);
  });
  test('without chat_mutation it explains what to grant before any model request', async () => {
    const h = host({ granted: ['generation', 'interceptor', 'chats', 'characters'] });
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model' }, {});
    const m = model({ create: created });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await expect(c.create('chat-1', {})).rejects.toThrow('Grant chat_mutation');
    expect(m.calls).toHaveLength(0);
    expect((await c.snapshot('chat-1')).notice).toContain('chat_mutation');
  });
  test('group chats are not supported yet', async () => {
    const h = host({ group: true });
    const c = new NotebookController(h.api, undefined, () => {}, model({}).ask);
    await expect(c.create('chat-1', {})).rejects.toThrow('Group chats');
  });
});

describe('the note in the prompt', () => {
  test('is added before a trailing prefill, labeled for Prompt Breakdown', async () => {
    const { c } = await ready();
    const prompt = [{ role: 'system' as const, content: 'Preset' }, { role: 'user' as const, content: 'I wave.' }, { role: 'assistant' as const, content: 'Prefill:' }];
    const result = await c.intercept(prompt, { chatId: 'chat-1', generationType: 'normal' }) as any;
    expect(result.messages).toHaveLength(4);
    expect(result.messages[2].role).toBe('system');
    expect(result.messages[2].content).toContain('Story time: Day 1, 18:20');
    expect(result.messages[3].content).toBe('Prefill:');
    expect(result.breakdown).toEqual([{ messageIndex: 2, name: 'Grimoire' }]);
    expect(await c.intercept(prompt, { chatId: 'chat-1', generationType: 'continue' })).toBe(prompt);
    expect(await c.intercept(prompt, { chatId: 'chat-1', generationType: 'impersonate' })).toBe(prompt);
  });
  test('the macro carries the note only when your preset places it, never both', async () => {
    const { h, c } = await ready();
    expect(await c.macro('note', 'chat-1')).toBe('');
    expect(await c.macro('clock', 'chat-1')).toBe('Day 1, 18:20');
    expect(await c.macro('pace', 'chat-1')).toContain('Pace: steady');
    await c.saveSettings({ ...(h.storage.get('settings.json') as object), placement: 'macro' });
    expect(await c.macro('note', 'chat-1')).toContain('Grimoire: private story guidance');
    const prompt = [{ role: 'user' as const, content: 'Hi' }];
    expect(await c.intercept(prompt, { chatId: 'chat-1', generationType: 'normal' })).toBe(prompt);
  });
  test('turning it off removes the note', async () => {
    const { c } = await ready();
    await c.setEnabled('chat-1', false);
    const prompt = [{ role: 'user' as const, content: 'Hi' }];
    expect(await c.intercept(prompt, { chatId: 'chat-1', generationType: 'normal' })).toBe(prompt);
    expect(await c.macro('clock', 'chat-1')).toBe('');
  });
  test('pace changes the note at once, with no model call', async () => {
    const { m, c } = await ready();
    await c.setPace('chat-1', 'quiet');
    const result = await c.intercept([{ role: 'user', content: 'Hi' }], { chatId: 'chat-1', generationType: 'normal' }) as any;
    expect(result.messages[1].content).toContain('Pace: quiet');
    expect(m.calls).toHaveLength(1);
    await expect(c.setPace('chat-1', 'pause')).rejects.toThrow('auto, quiet, or fast');
  });
});

describe('check-ups', () => {
  test('run after enough replies, and the update becomes the new version', async () => {
    const { h, m, c } = await ready();
    h.add('user', 'We cross.');
    h.add('assistant', `The far bank.${tracker('Day 1, 19:00', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(0);
    h.add('user', 'I wait.'); h.add('assistant', `Rain.${tracker('Day 1, 19:30', 'The ferry')}`);
    h.add('user', 'I sit.'); h.add('assistant', `Night falls.${tracker('Day 1, 20:00', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const checkups = m.calls.filter(x => x.task === 'grimoire-checkup-v1');
    expect(checkups).toHaveLength(1);
    expect(checkups[0].input.reason).toBe('3 replies since the last update');
    expect(checkups[0].input.preferences).toEqual({ tone: 'balanced', twist: false });
    expect(checkups[0].messages[0].content).toContain('open the next arc');
    expect(checkups[0].input.clockOwner).toEqual({ day: 'tracker', hour: 'tracker' });
    expect(checkups[0].input.trackerText).toContain('Location: The ferry');
    const view = (await c.view('chat-1'))!;
    // What shows outside the spoiler fold is made by code, never copied from the model.
    expect(view.summary).toBe('Last update: 3 replies since the last update');
    expect(view.job!.label).toBe('Notebook updated');
    expect(view.notebook!.summary).toBe('Notebook updated after the ferry.');
    expect(view.repliesSinceCheck).toBe(0);
    expect((h.storage.get('chats/chat-1.json') as any).versions).toHaveLength(2);
  });
  test('a scene change or a time jump starts one early', async () => {
    const { h, m, c } = await ready();
    h.add('user', 'Onward.'); h.add('assistant', `Docks.${tracker('Day 1, 18:40', 'The ferry')}`);
    h.add('user', 'To the inn.'); h.add('assistant', `The inn.${tracker('Day 1, 19:00', 'The Drowned Lantern')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.at(-1)!.input.reason).toBe('The scene moved');
    h.add('user', 'I sleep.'); h.add('assistant', `Morning.${tracker('Day 2, 08:00', 'The Drowned Lantern')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.at(-1)!.input.reason).toBe('Time moved on');
  });
  test('a check-up that drops a thread or un-happens a step gets them put back, in one request', async () => {
    const { m, c } = await ready(undefined, model({ create: created, checkup: input => {
      const n = structuredClone(input.notebook); n.threads = n.threads.slice(1); n.people = n.people.slice(1); return { notebook: n, tracker: null };
    } }));
    await c.checkup('chat-1', 'You asked for a check-up'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1').length).toBe(1);
    const view = (await c.view('chat-1'))!;
    expect(view.job).toMatchObject({ status: 'complete' });
    expect(view.notebook!.threads.map(t => t.id).sort()).toEqual(['stolen-ring', 'storm']);
    expect(view.notebook!.people.map(p => p.id)).toContain('mira');
  });
  test('model slips are tidied instead of rejected', async () => {
    const sloppy = () => {
      const n: any = sampleNotebook();
      n.people[1].id = 'Cole_The Barbarian'; n.threads[0].people = ['Oswin', 'Cole_The Barbarian'];
      n.threads[0].speed = 'medium'; n.threads[0].steps[0].afterHours = '12 hours'; n.threads[1].id = 'storm'; n.threads[1].status = 'active';
      n.people[0].wants = 'x '.repeat(500); n.people[0].hint = 'dry<br>humor {{char}}';
      n.events = Array.from({ length: 70 }, (_, i) => `Event ${i}`); n.clock = { day: '3', hour: 25, label: '' };
      return { notebook: n, tracker: null };
    };
    const { m, c } = await ready(undefined, model({ create: sloppy }));
    expect(m.calls).toHaveLength(1);
    const nb = (await c.view('chat-1'))!.notebook!;
    expect(nb.people[1].id).toBe('cole-the-barbarian');
    expect(nb.threads[0]).toMatchObject({ speed: 'steady', people: ['harbor-master', 'cole-the-barbarian'] });
    expect(nb.threads[0].steps[0].afterHours).toBe(12);
    expect(nb.threads[1].status).toBe('open');
    expect(nb.people[0].wants.length).toBeLessThanOrEqual(600);
    expect(nb.people[0].hint).toBe('dry humor');
    expect(nb.events).toHaveLength(40);
    expect(nb.events[0]).toStartWith('Earlier: Event 0; Event 1');
    expect(nb.events.at(-1)).toBe('Event 69');
  });
  test('a result is thrown away if the chat it read changed meanwhile', async () => {
    const m = model({ create: created, checkup: input => ({ notebook: { ...input.notebook, summary: 'Stale.' }, tracker: null }) });
    const { h, c } = await ready(undefined, m);
    const release = m.pause();
    await c.checkup('chat-1', 'You asked for a check-up');
    h.messages[2].content = 'Mira refuses your coin.';
    release(); await c.waitForJobs();
    const view = (await c.view('chat-1'))!;
    expect(view.job).toMatchObject({ status: 'failed', label: 'Skipped: the chat changed during the check-up' });
    expect(view.summary).not.toBe('Stale.');
    expect(view.needsCheck).toBeTruthy();
  });
  test('the clock never runs backwards where Grimoire keeps it, and the tracker wins where it owns it', async () => {
    const backwards = (input: any) => ({ notebook: { ...input.notebook, clock: { day: 0, hour: 1, label: '' } }, tracker: null });
    const tracked = await ready(undefined, model({ create: created, checkup: backwards }));
    await tracked.c.checkup('chat-1', 'test'); await tracked.c.waitForJobs();
    expect((await tracked.c.view('chat-1'))!).toMatchObject({ clockText: 'Day 1, 18:20', job: { status: 'complete' } });
    const h = host(); h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model' }, {});
    const c = new NotebookController(h.api, undefined, () => {}, model({ create: () => ({ notebook: sampleNotebook(), tracker: null }), checkup: backwards }).ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    await c.checkup('chat-1', 'test'); await c.waitForJobs();
    // A clock that went back keeps the time from before the check-up.
    expect((await c.view('chat-1'))!).toMatchObject({ clockText: 'Day 1, 18:00', job: { status: 'complete' } });
  });
  test('time cannot be skipped while an update is running', async () => {
    const m = model({ create: created, checkup: input => ({ notebook: input.notebook, tracker: null }) });
    const { c } = await ready(undefined, m);
    const release = m.pause();
    await c.checkup('chat-1', 'test');
    await expect(c.skipTime('chat-1', 1, 'days')).rejects.toThrow('Wait for the current update');
    release(); await c.waitForJobs();
  });
});

describe('presets that show their tracker only after the first replies', () => {
  const header = (time: string, place: string) => `<scene_header location="${place}" time="${time}" />\n\n`;
  const headerRecipe = { fields: [
    { name: 'time', type: 'time', source: { kind: 'attribute', tag: 'scene_header', attribute: 'time' } },
    { name: 'location', type: 'text', source: { kind: 'attribute', tag: 'scene_header', attribute: 'location' } },
  ], note: 'scene header attributes' };
  test('a header-style tracker is found in code after the first reply, with no model request', async () => {
    const h = host(); h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 8 }, {});
    const m = model({ create: () => ({ notebook: sampleNotebook(), tracker: { fields: [], note: 'none yet' } }), checkup: input => ({ notebook: input.notebook, tracker: null }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    h.add('user', 'I wait.'); h.add('assistant', `${header('7:15 PM', 'The ferry')}<div style="color:red"><style>.x{}</style>Mira coils the rope.</div>`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(0);
    const view = (await c.view('chat-1'))!;
    expect(view.checks.map(x => [x.name, x.status])).toEqual([['time', 'verified'], ['location', 'verified']]);
    expect(view.sources!.hour).toBe('tracker');
  });
  test('a tracker field the model missed is filled in from the replies, without replacing the model\'s', async () => {
    const h = host(); h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 8 }, {});
    const partial = { fields: [{ name: 'time', type: 'time', source: { kind: 'attribute', tag: 'scene_header', attribute: 'time' } }], note: 'time only' };
    const m = model({ create: () => ({ notebook: sampleNotebook(), tracker: partial }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    h.add('user', 'I wait.'); h.add('assistant', `${header('7:15 PM', 'The ferry')}<date>\nDay: Day 2\n</date>`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const view = (await c.view('chat-1'))!;
    expect(view.checks.map(x => [x.name, x.status])).toEqual([['time', 'verified'], ['date', 'verified'], ['location', 'verified']]);
    expect(view.sources).toMatchObject({ day: 'tracker', hour: 'tracker' });
  });
  test('switching presets: once the old tracker stops reading, a new common layout replaces it for free', async () => {
    const { h, m, c } = await ready();
    expect((await c.view('chat-1'))!.checks.every(x => x.status === 'verified')).toBe(true);
    const fresh = (t: string) => `New preset prose.\n\n**Time:** ${t}\n**Location:** The north bank`;
    for (const t of ['7:00 PM', '7:10 PM', '7:20 PM']) { h.add('user', 'Onward.'); h.add('assistant', fresh(t)); }
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const view = (await c.view('chat-1'))!;
    expect(view.checks.find(x => x.name === 'location')).toMatchObject({ status: 'verified', value: 'The north bank' });
    expect(view.checks.find(x => x.name === 'time')).toMatchObject({ status: 'verified', value: '7:20 PM' });
    expect(view.clockText).toBe('7:20 PM');
    expect(view.clock!.hour).toBeCloseTo(19.33);
    expect(view.sources).toMatchObject({ hour: 'tracker' });
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1').length).toBeLessThanOrEqual(1);
  });
  test('a layout only a model can describe gets one look, with the raw replies but not the greeting', async () => {
    const fence = (time: string) => `Mira coils the rope.\n\n\`\`\`status\n{"when": "${time}", "where": "The ferry"}\n\`\`\``;
    const jsonRecipe = { fields: [{ name: 'time', type: 'time', source: { kind: 'json', path: 'when', region: { kind: 'fence', lang: 'status' } } }], note: 'json block' };
    const h = host(); h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 8 }, {});
    const m = model({ create: () => ({ notebook: sampleNotebook(), tracker: { fields: [], note: 'none yet' } }),
      checkup: input => ({ notebook: input.notebook, tracker: input.replies.length ? jsonRecipe : null }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    h.add('user', 'I wait.'); h.add('assistant', `<div style="color:red"><style>.x{}</style>${fence('7:15 PM')}</div>`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const checkups = m.calls.filter(x => x.task === 'grimoire-checkup-v1');
    expect(checkups).toHaveLength(1);
    expect(checkups[0].input.reason).toBe('Looking for your preset’s tracker');
    expect(checkups[0].input.replies).toHaveLength(1);
    expect(checkups[0].input.replies[0]).toContain('"when": "7:15 PM"');
    expect(checkups[0].messages[0].content).toContain('The opening message is left out');
    // The chat itself is sent as words: the styling goes.
    expect(checkups[0].input.chat.at(-1).content).not.toContain('style');
    const view = (await c.view('chat-1'))!;
    expect(view.checks.map(x => x.status)).toEqual(['verified']);
    expect(view.sources!.hour).toBe('tracker');
    // It looks only once on its own; later replies wait for the usual reasons.
    h.add('user', 'I wait more.'); h.add('assistant', fence('7:30 PM'));
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(1);
  });
  test('an urgent development that was offered gets a check-up two replies later', async () => {
    const h = host(); h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 8 }, {});
    const urgent = () => { const n: any = sampleNotebook(); n.threads[1].steps[0].afterHours = 0; return { notebook: n, tracker: headerRecipe }; };
    const m = model({ create: urgent, checkup: input => ({ notebook: input.notebook, tracker: null }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    h.add('user', 'I look at the sky.'); h.add('assistant', `${header('6:00 PM', 'The ferry')}Wind.`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(0);
    h.add('user', 'I hurry.'); h.add('assistant', `${header('6:05 PM', 'The ferry')}Shutters bang.`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1').map(x => x.input.reason)).toEqual(['Checking on an urgent development']);
    // Still not shown after that look: no repeat every two replies.
    for (const line of ['I wait.', 'I wait again.']) { h.add('user', line); h.add('assistant', `${header('6:10 PM', 'The ferry')}Still windy.`); await c.afterReply('chat-1', 'normal'); await c.waitForJobs(); }
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(1);
  });
});

describe('the quick check', () => {
  const noul = (p: number) => ({ type: 'noul', noul: p });
  const answers = (over: Record<string, unknown> = {}) => (input: any) => ({ model: 'jev', answers: {
    ...Object.fromEntries(Object.keys(input.questions).map(k => [k, input.questions[k].type === 'noul' ? noul(k.startsWith('fits_') ? 0.9 : 0.1) : { type: 'choice', choice: 'rising', probabilities: { rising: 0.9 }, confidence: 0.9 }])), ...over } });
  // The storm thread's first step is due at once, so the note offers it.
  const urgentNotebook = () => { const n: any = sampleNotebook(); n.threads[1].steps[0].afterHours = 0; return { notebook: n, tracker: recipe }; };
  async function quickReady(decide: (input: any) => unknown, extra: Partial<Parameters<typeof host>[0]> = {}) {
    const h = host({ decide, ...extra });
    h.add('assistant', `The ferry bell rings.${tracker('Day 1, 18:00', 'The ferry')}`);
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 8, quick: { enabled: true, connectionId: '', model: '' } }, {});
    const m = model({ create: urgentNotebook, checkup: input => ({ notebook: input.notebook, tracker: null }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    return { h, m, c };
  }
  test('a development the reply showed is marked, and the note stops offering it', async () => {
    const { h, m, c } = await quickReady(answers({ due_1: noul(0.93) }));
    expect(await c.noteFor('chat-1')).toContain('Shutters bang');
    h.add('user', 'I look at the sky.'); h.add('assistant', `<div style="color:red">Shutters bang all along the street.</div>${tracker('Day 1, 18:10', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const sent = h.decisionCalls[0];
    expect(Object.keys(sent.questions)).toEqual(['due_1', 'moment_1', 'moment_2', 'detail_mentioned', 'fits_1', 'story_shift', 'rhythm', 'new_turn']);
    expect(sent.questions.due_1.instructions).toContain('Shutters bang');
    expect(sent.state.latestReply).toContain('Shutters bang all along the street.');
    expect(sent.state.latestReply).not.toContain('style');
    expect(sent.state.playerMessage).toBe('I look at the sky.');
    expect(sent.connection_id).toBeUndefined();
    const view = (await c.view('chat-1'))!;
    expect(view.notebook!.threads[1].steps[0].status).toBe('shown');
    expect(view.notebook!.rhythm).toBe('rising');
    expect(await c.noteFor('chat-1')).not.toContain('Shutters bang');
    // A quick check is not a check-up: the reply count keeps counting, and no check-up ran.
    expect(view.repliesSinceCheck).toBe(1);
    expect(view.summary).toBe('Last update: Notebook written');
    expect(view.quick).toMatchObject({ ok: true, error: '' });
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(0);
    // Regenerating that reply goes back to the notebook from before it.
    expect(await c.noteFor('chat-1', h.messages.at(-1).id)).toContain('Shutters bang');
  });
  test('a detail the narrator mentioned is marked planted, with the reply it happened in', async () => {
    const { h, c } = await quickReady(answers({ detail_mentioned: noul(0.91) }));
    expect(await c.noteFor('chat-1')).toContain('Oswin seals his letters with green wax');
    h.add('user', 'I watch Oswin.'); h.add('assistant', `Oswin presses green wax onto a letter.${tracker('Day 1, 18:05', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const seed = (await c.view('chat-1'))!.notebook!.seeds[0];
    expect(seed).toMatchObject({ status: 'planted', plantedAt: 2 });
    // Planted: it isn't offered again, and its meaning stays hidden for now.
    const note = await c.noteFor('chat-1');
    expect(note).not.toContain('green wax');
  });
  test('a change of direction holds old plans back and reworks the notebook without forgetting it', async () => {
    const { h, m, c } = await quickReady(answers({ story_shift: noul(0.92) }));
    const release = m.pause();
    h.add('user', 'I hot-wire a car and leave town.'); h.add('assistant', `The highway opens up ahead.${tracker('Day 1, 18:30', 'The coast road')}`);
    await c.afterReply('chat-1', 'normal');
    for (let i = 0; i < 20 && !m.calls.some(x => x.task === 'grimoire-checkup-v1'); i++) await new Promise(r => setTimeout(r, 1));
    // While the rework runs, the narrator follows the player and old plans wait.
    expect((await c.view('chat-1'))!.reworking).toBe(true);
    const note = await c.noteFor('chat-1');
    expect(note).toContain('The story has just changed direction');
    expect(note).not.toContain('Shutters bang');
    expect(note).not.toContain('green wax');
    const checkup = m.calls.find(x => x.task === 'grimoire-checkup-v1')!;
    expect(checkup.input).toMatchObject({ reason: 'The story changed direction', resync: true });
    expect(checkup.messages[0].content).toContain('Go through every open thread and decide how it applies now');
    expect(checkup.messages[0].content).toContain('Keep every breadcrumb');
    release(); await c.waitForJobs();
    const after = (await c.view('chat-1'))!;
    expect(after.reworking).toBe(false);
    expect(after.notebook!.seeds).toHaveLength(1);
    expect(await c.noteFor('chat-1')).not.toContain('The story has just changed direction');
  });
  test('a development that clearly no longer fits is held out of the note until a check-up decides', async () => {
    const { h, m, c } = await quickReady(answers({ fits_1: noul(0.05) }));
    const release = m.pause();
    h.add('user', 'I leave the ferry behind.'); h.add('assistant', `The road bends inland.${tracker('Day 1, 18:10', 'The road')}`);
    await c.afterReply('chat-1', 'normal');
    for (let i = 0; i < 20 && !m.calls.some(x => x.task === 'grimoire-checkup-v1'); i++) await new Promise(r => setTimeout(r, 1));
    expect(await c.noteFor('chat-1')).not.toContain('Shutters bang');
    const checkup = m.calls.find(x => x.task === 'grimoire-checkup-v1')!;
    expect(checkup.input.held).toEqual(['storm']);
    expect(checkup.input.resync).toBe(false);
    release(); await c.waitForJobs();
    expect(await c.noteFor('chat-1')).toContain('Shutters bang');
  });
  test('something new in the story starts a full check-up right away', async () => {
    const { h, m, c } = await quickReady(answers({ new_turn: noul(0.88) }));
    h.add('user', 'I follow the stranger.'); h.add('assistant', `A stranger named Pell waves you over.${tracker('Day 1, 18:10', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1').map(x => x.input.reason)).toEqual(['Something new happened in the story']);
  });
  test('an uncertain answer changes nothing', async () => {
    const { h, c } = await quickReady(answers({ due_1: noul(0.5), rhythm: { type: 'choice', choice: 'peak', probabilities: { peak: 0.4 }, confidence: 0.4 } }));
    h.add('user', 'Hm.'); h.add('assistant', `Maybe a breeze.${tracker('Day 1, 18:10', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const view = (await c.view('chat-1'))!;
    expect(view.notebook!.threads[1].steps[0].status).toBe('waiting');
    expect(view.notebook!.rhythm).toBe('calm');
    expect((h.storage.get('chats/chat-1.json') as any).versions).toHaveLength(1);
  });
  test('the chosen connection and any model ID are passed through', async () => {
    const h = host({ decide: answers() });
    h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', quick: { enabled: true, connectionId: 'jev', model: '~typesafe/jev-latest' } }, {});
    const c = new NotebookController(h.api, undefined, () => {}, model({ create: urgentNotebook }).ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    h.add('user', 'Go.'); h.add('assistant', 'Wind.');
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(h.decisionCalls[0]).toMatchObject({ connection_id: 'jev', model: '~typesafe/jev-latest' });
    expect((await c.snapshot('chat-1')).decisions).toMatchObject({ available: true, connections: [{ id: 'jev', isDefault: true }] });
  });
  test('after going back, quick checks on the new reply count from the update that still fits the chat', async () => {
    const { h, m, c } = await quickReady(answers({ due_1: noul(0.95) }));
    for (const line of ['Look.', 'Look again.']) { h.add('user', line); h.add('assistant', `Shutters bang.${tracker('Day 1, 18:10', 'The ferry')}`); }
    await c.checkup('chat-1', 'You asked for a check-up'); await c.waitForJobs();
    // Delete both exchanges, then play a different one.
    h.messages.splice(1);
    h.add('user', 'Stay inside.'); h.add('assistant', `Shutters bang somewhere.${tracker('Day 1, 18:10', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const view = (await c.view('chat-1'))!;
    expect(view.notebook!.threads[1].steps[0].status).toBe('shown');
    expect(view).toMatchObject({ repliesSinceCheck: 1, summary: 'Last update: Notebook written' });
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(1);
  });
  test('a failed decision call is reported in plain words and the usual rules still run', async () => {
    const { h, m, c } = await quickReady(() => new Error('502 upstream said: <the whole prompt echoed back>'));
    for (let i = 0; i < 8; i++) { h.add('user', `Wait ${i}.`); h.add('assistant', `Time passes.${tracker('Day 1, 18:00', 'The ferry')}`); }
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const view = (await c.view('chat-1'))!;
    expect(view.quick).toMatchObject({ ok: false, error: 'The decision model request failed.' });
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1')).toHaveLength(1);
  });
  test('answers about a reply that was swiped away meanwhile are thrown out', async () => {
    let release!: () => void; const gate = new Promise<void>(r => { release = r; });
    const { h, c } = await quickReady(async (input: any) => { await gate; return answers({ due_1: noul(0.95) })(input); });
    h.add('user', 'Look.'); h.add('assistant', `Shutters bang.${tracker('Day 1, 18:10', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal');
    h.messages.at(-1).content = `Nothing at all.${tracker('Day 1, 18:10', 'The ferry')}`;
    release(); await c.waitForJobs();
    expect((await c.view('chat-1'))!.notebook!.threads[1].steps[0].status).toBe('waiting');
  });
  test('on a Lumiverse without decision models it stays off and says why', async () => {
    const { h, c, m } = await quickReady(answers(), { noDecisionsHost: true });
    h.add('user', 'Look.'); h.add('assistant', 'Shutters bang.'); h.add('user', 'More.'); h.add('assistant', 'Still windy.');
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(h.decisionCalls).toHaveLength(0);
    expect((await c.snapshot('chat-1')).decisions).toMatchObject({ available: false, reason: expect.stringContaining('Update Lumiverse') });
    // Without it, the old rule checks on the urgent development instead.
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1').map(x => x.input.reason)).toEqual(['Checking on an urgent development']);
  });
});

describe('long scenes', () => {
  test('a planned development comes due after enough replies, even if story time barely moves', async () => {
    const h = host(); h.add('assistant', `The ferry bell rings.${tracker('Day 1, 18:00', 'The ferry')}`);
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 50, wait: 'short' }, {});
    const slowPlan = () => { const n: any = sampleNotebook(); n.threads[0].steps[0].afterHours = 48; n.threads[1].status = 'paused'; return { notebook: n, tracker: recipe }; };
    const c = new NotebookController(h.api, undefined, () => {}, model({ create: slowPlan }).ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    for (let i = 0; i < 7; i++) { h.add('user', `Talk ${i}.`); h.add('assistant', `They talk.${tracker('Day 1, 18:0' + i, 'The ferry')}`); }
    expect(await c.noteFor('chat-1')).not.toContain('A shout from the manor');
    expect((await c.view('chat-1'))!.dueIds).toEqual([]);
    h.add('user', 'Talk more.'); h.add('assistant', `They talk.${tracker('Day 1, 18:09', 'The ferry')}`);
    expect(await c.noteFor('chat-1')).toContain('A shout from the manor');
    expect((await c.view('chat-1'))!.dueIds).toEqual(['stolen-ring']);
  });
});

describe('time-skip suggestions', () => {
  test('a quiet stretch offers a skip that lands on the next development; Not now hides it', async () => {
    const h = host(); h.add('assistant', `The ferry bell rings.${tracker('Day 1, 18:00', 'The ferry')}`);
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 50 }, {});
    const calm = () => { const n: any = sampleNotebook(); n.threads[1].status = 'paused'; return { notebook: n, tracker: recipe }; };
    const c = new NotebookController(h.api, undefined, () => {}, model({ create: calm }).ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    for (let i = 0; i < 9; i++) { h.add('user', `Chat ${i}.`); h.add('assistant', `Small talk.${tracker('Day 1, 18:0' + i, 'The ferry')}`); }
    const offer = (await c.view('chat-1'))!.skipOffer!;
    expect(offer.options[0]).toEqual({ hours: 12, label: 'Skip ahead to when something happens (about 12 hours)' });
    expect(JSON.stringify(offer)).not.toMatch(/ring|manor|Oswin/i);
    await c.dismissSkip('chat-1');
    expect((await c.view('chat-1'))!.skipOffer).toBeNull();
  });
});

describe('your stories', () => {
  test('lists chats with a notebook, newest first, leaving out deleted chats and removed notebooks', async () => {
    const { h, c } = await ready();
    await c.fork('chat-1', 'chat-2');
    await h.api.userStorage.setJson('chats/chat-gone.json', { version: 1, chatId: 'chat-gone', versions: [] }, {});
    await h.api.userStorage.setJson('chats/chat-old.json', { removed: true }, {});
    const list = await c.stories();
    expect(list.map(s => s.chatId)).toEqual(['chat-1', 'chat-2']);
    expect(list[0]).toEqual({ chatId: 'chat-1', character: 'Mira', chatName: 'Low Water', playedAt: 1_700_000_000_000, enabled: true });
  });
});

describe('edits, swipes, and forks', () => {
  async function withUpdate() {
    const m = model({ create: created, checkup: input => { const n = structuredClone(input.notebook); n.threads[0].steps[0].status = 'shown'; n.summary = 'Updated.'; return { notebook: n, tracker: null }; } });
    const r = await ready(undefined, m);
    r.h.add('user', 'Ask about the shout.'); r.h.add('assistant', `"The manor," Mira says.${tracker('Day 1, 19:00', 'The ferry')}`);
    await r.c.checkup('chat-1', 'test'); await r.c.waitForJobs();
    return r;
  }
  test('regenerating a reply uses the notebook from before it', async () => {
    const { c } = await withUpdate();
    expect((await c.view('chat-1'))!.notebook!.threads[0].steps[0].status).toBe('shown');
    const note = await c.noteFor('chat-1', 'm4');
    expect(note).not.toContain('Updated.');
    const result = await c.intercept([{ role: 'user', content: 'x' }], { chatId: 'chat-1', generationType: 'regenerate', excludeMessageId: 'm4' }) as any;
    expect(result.messages[1].content).toContain('Story time: Day 1, 18:20');
  });
  test('deleting or editing a reply falls back to the notebook from before it, without paying for a check-up', async () => {
    const { h, m, c } = await withUpdate();
    const checkups = () => m.calls.filter(x => x.task === 'grimoire-checkup-v1').length, before = checkups();
    h.messages[4].content = 'Mira says nothing.';
    const view = (await c.view('chat-1'))!;
    expect(view.behind).toBe(true);
    expect(view.needsCheck).toBe('');
    expect(view.notebook!.threads[0].steps[0].status).toBe('waiting');
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(checkups()).toBe(before);
    // Deleting the last exchange works the same way.
    h.messages.splice(3, 2);
    expect((await c.view('chat-1'))!).toMatchObject({ behind: true, needsCheck: '', summary: 'Last update: Notebook written' });
    // A new reply counts from the notebook that fits, not from the update on the deleted branch.
    h.add('user', 'Try again.'); h.add('assistant', `Mira shrugs.${tracker('Day 1, 18:40', 'The ferry')}`);
    expect((await c.view('chat-1'))!.repliesSinceCheck).toBe(1);
  });
  test('editing a message the first notebook was written from does ask for a check-up', async () => {
    const { h, m, c } = await withUpdate();
    h.messages[0].content = 'A different opening.';
    expect((await c.view('chat-1'))!.needsCheck).toBe('The chat changed before the notebook was written.');
    h.add('user', 'Go on.'); h.add('assistant', 'Fine.');
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.at(-1)!.input.reason).toBe('The chat changed before the notebook was written');
  });
  test('swiping back to the old reply brings its version back', async () => {
    const { h, c } = await withUpdate();
    const original = h.messages[4].content;
    h.messages[4].content = 'Another swipe.';
    expect((await c.view('chat-1'))!.behind).toBe(true);
    h.messages[4].content = original;
    expect((await c.view('chat-1'))!.behind).toBe(false);
  });
  test('a forked chat starts with a copy that follows its own history', async () => {
    const { h, c } = await withUpdate();
    await c.fork('chat-1', 'chat-2');
    expect((h.storage.get('chats/chat-2.json') as any).chatId).toBe('chat-2');
    expect((await c.view('chat-2'))!.hasNotebook).toBe(true);
  });
});

describe('time skips', () => {
  test('the notebook moves the parts of the clock it owns and tells the narrator once', async () => {
    const h = host();
    h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model' }, {});
    const m = model({ create: () => ({ notebook: sampleNotebook(), tracker: null }), checkup: input => ({ notebook: input.notebook, tracker: null }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    expect((await c.view('chat-1'))!.sources).toEqual({ day: 'notebook', hour: 'notebook', exact: false });
    await c.skipTime('chat-1', 3, 'days'); await c.waitForJobs();
    expect((await c.view('chat-1'))!.clockText).toBe('Day 4, 18:00');
    expect(m.calls.at(-1)!.input.skipHours).toBe(72);
    expect(await c.noteFor('chat-1')).toContain('About 3 days have passed');
    h.add('user', 'Three days later I return.'); h.add('assistant', 'The river is high.');
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(await c.noteFor('chat-1')).not.toContain('have passed');
  });
  test('a tracker-owned clock is left for the narrator to move', async () => {
    const { c } = await ready();
    await c.skipTime('chat-1', 2, 'hours'); await c.waitForJobs();
    const view = (await c.view('chat-1'))!;
    expect(view.clockText).toBe('Day 1, 18:20');
    expect(await c.noteFor('chat-1')).toContain('About 2 hours have passed');
    await expect(c.skipTime('chat-1', 0, 'days')).rejects.toThrow('positive');
  });
});

describe('your edits', () => {
  test('you may change or remove anything; bad text is refused', async () => {
    const { c } = await ready();
    const view = (await c.view('chat-1'))!;
    const edited = structuredClone(view.notebook!); edited.threads = edited.threads.slice(0, 1); edited.story.question = 'A new question.';
    await c.editNotebook('chat-1', edited);
    const after = (await c.view('chat-1'))!;
    expect(after.notebook!.threads).toHaveLength(1);
    expect(after.notebook!.story.question).toBe('A new question.');
    await expect(c.editNotebook('chat-1', { ...edited, story: { ...edited.story, question: '{{char}}' } })).rejects.toThrow('template');
  });
  test('removing a notebook turns it off for that chat', async () => {
    const { c } = await ready();
    await c.remove('chat-1');
    expect((await c.view('chat-1'))!.hasNotebook).toBe(false);
  });
});

describe('safeguards', () => {
  test('a clock kept by Grimoire says it may lag once the chat has moved on', async () => {
    const h = host(); h.add('assistant', 'The ferry bell rings.');
    await h.api.userStorage.setJson('settings.json', { connectionId: 'model', every: 50 }, {});
    const c = new NotebookController(h.api, undefined, () => {}, model({ create: () => ({ notebook: sampleNotebook(), tracker: null }) }).ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    expect(await c.noteFor('chat-1')).toContain('Story time: Day 1, 18:00.');
    h.add('user', 'I wait a long while.'); h.add('assistant', 'Hours pass.');
    const note = await c.noteFor('chat-1');
    expect(note).toContain('Story time at the last check-up: Day 1, 18:00.');
    expect(note).toContain('the chat decides what time it is now');
  });
  test('a regenerate without the replaced reply named still uses the notebook from before it', async () => {
    const m = model({ create: created, checkup: input => { const n = structuredClone(input.notebook); n.summary = 'After the reply.'; n.threads[1].steps[0].status = 'shown'; return { notebook: n, tracker: null }; } });
    const { h, c } = await ready(undefined, m);
    h.add('user', 'Look outside.'); h.add('assistant', `Shutters bang.${tracker('Day 1, 19:00', 'The ferry')}`);
    await c.checkup('chat-1', 'test'); await c.waitForJobs();
    const fresh = await c.intercept([{ role: 'user', content: 'x' }], { chatId: 'chat-1', generationType: 'normal' }) as any;
    expect(fresh.messages[1].content).not.toContain('The coming storm: Shutters bang');
    const redo = await c.intercept([{ role: 'user', content: 'x' }], { chatId: 'chat-1', generationType: 'regenerate' }) as any;
    expect(redo.messages[1].content).toContain('Story time: Day 1, 18:20');
  });
  test('after a failed automatic check-up, the next tries wait for the story to move', async () => {
    const m = model({ create: created, checkup: () => 'not json at all' });
    const { h, c } = await ready(undefined, m);
    for (let i = 0; i < 3; i++) { h.add('user', `Turn ${i}`); h.add('assistant', `Reply ${i}.${tracker('Day 1, 18:30', 'The ferry')}`); }
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    const tries = () => m.calls.filter(x => x.task === 'grimoire-checkup-v1').length;
    expect(tries()).toBe(2);
    h.add('user', 'Again'); h.add('assistant', `More.${tracker('Day 1, 18:40', 'The ferry')}`);
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(tries()).toBe(2);
    await c.checkup('chat-1', 'You asked for a check-up'); await c.waitForJobs();
    expect(tries()).toBe(4);
  });
});
