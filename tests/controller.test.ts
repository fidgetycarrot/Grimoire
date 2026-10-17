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

function host(options: { group?: boolean; granted?: string[] } = {}) {
  const storage = new Map<string, unknown>();
  const messages: any[] = [];
  let index = 0;
  const add = (role: 'user' | 'assistant', content: string) => { const m = { id: `m${index}`, role, content, index_in_chat: index++, swipe_id: 0, swipes: [content], metadata: {} }; messages.push(m); return m; };
  const granted = options.granted ?? ['generation', 'interceptor', 'chats', 'characters', 'personas', 'world_books'];
  const api = {
    permissions: { has: (p: string) => granted.includes(p), getGranted: async () => [...granted] },
    userStorage: {
      getJson: async (key: string, o: any) => structuredClone(storage.has(key) ? storage.get(key) : o?.fallback),
      setJson: async (key: string, value: unknown) => { storage.set(key, structuredClone(value)); },
    },
    chats: { get: async (id: string) => id === 'chat-1' || id === 'chat-2' ? { id, name: 'Low Water', character_id: 'card', metadata: options.group ? { group: true } : {} } : null },
    characters: { get: async () => ({ id: 'card', name: 'Mira', description: 'A ferry keeper in Low Water.', personality: 'Dry.', scenario: 'A stranger arrives.', first_mes: 'The ferry bell rings.', world_book_ids: ['book'] }) },
    personas: { getActive: async () => ({ id: 'p', name: 'Traveler', description: 'A tired traveler with a ring.' }) },
    world_books: { entries: { list: async () => ({ data: [{ comment: 'Low Water', content: 'A river town.', constant: true }], total: 1 }) } },
    chat: { getMessages: async () => structuredClone(messages) },
    variables: { chat: { list: async () => ({}) } },
    connections: { list: async () => [{ id: 'model', name: 'Model', model: 'test', provider: 'test' }] },
  } as unknown as SpindleAPI;
  return { api, storage, messages, add };
}
/** A scripted model: creation and check-up answers come from the given functions. */
function model(answers: { create?: (input: any) => unknown; checkup?: (input: any) => unknown }) {
  const calls: Array<{ task: string; input: any; messages: Message[] }> = [];
  let hold: Promise<void> | null = null;
  const ask = async (messages: Message[]) => {
    const input = JSON.parse(messages[1].content);
    calls.push({ task: input.task, input, messages });
    if (hold) await hold;
    const answer = input.task === 'grimoire-create-v1' ? answers.create?.(input) : answers.checkup?.(input);
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
  await c.create('chat-1', { length: 'short', tone: 'balanced', twist: false });
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
    const m = model({ create: () => ({ notebook: { ...sampleNotebook(), threads: 'nope' }, tracker: null }) });
    const c = new NotebookController(h.api, undefined, () => {}, m.ask);
    await c.create('chat-1', {}); await c.waitForJobs();
    expect(m.calls).toHaveLength(2);
    const view = (await c.view('chat-1'))!;
    expect(view.hasNotebook).toBe(false);
    expect(view.job).toMatchObject({ status: 'failed', label: 'The notebook could not be written' });
    expect(view.job!.error).toContain('threads must be a list');
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
    expect(checkups[0].input.clockOwner).toEqual({ day: 'tracker', hour: 'tracker' });
    expect(checkups[0].input.trackerText).toContain('Location: The ferry');
    const view = (await c.view('chat-1'))!;
    expect(view.summary).toBe('Notebook updated after the ferry.');
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
  test('a check-up that would drop a thread is asked once to fix it, then left out', async () => {
    const { m, c } = await ready(undefined, model({ create: created, checkup: input => ({ notebook: { ...input.notebook, threads: input.notebook.threads.slice(1) }, tracker: null }) }));
    await c.checkup('chat-1', 'You asked for a check-up'); await c.waitForJobs();
    expect(m.calls.filter(x => x.task === 'grimoire-checkup-v1').length).toBe(2);
    expect(m.calls.at(-1)!.messages.at(-1)!.content).toContain('Keep the thread "The stolen ring"');
    const view = (await c.view('chat-1'))!;
    expect(view.job).toMatchObject({ status: 'failed', label: 'The check-up could not finish' });
    expect(view.notebook!.threads).toHaveLength(2);
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
    expect((await c.view('chat-1'))!.job!.error).toContain('went backwards');
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
  test('editing a covered message falls back and asks for a check-up', async () => {
    const { h, m, c } = await withUpdate();
    h.messages[4].content = 'Mira says nothing.';
    const view = (await c.view('chat-1'))!;
    expect(view.behind).toBe(true);
    expect(view.notebook!.threads[0].steps[0].status).toBe('waiting');
    await c.afterReply('chat-1', 'normal'); await c.waitForJobs();
    expect(m.calls.at(-1)!.input.reason).toBe('The chat changed since the last update');
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
