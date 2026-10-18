import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { createRpc, nextPace, setup } from '../src/frontend';
import { stamp, validateNotebook } from '../src/notebook';
import type { Snapshot } from '../src/types';
import { sampleNotebook } from './fixtures';

const cleanups: Array<() => void> = [];
afterEach(() => { for (const fn of cleanups.splice(0)) fn(); });
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

const storyList = [{ chatId: 'chat-9', character: 'Riley', chatName: 'Comic-Con', playedAt: Date.now() - 3_600_000, enabled: true }, { chatId: 'chat-8', character: 'Mira', chatName: 'Low Water', playedAt: Date.now() - 86_400_000 * 2, enabled: false }];
function harness(chat: Partial<NonNullable<Snapshot['chat']>> | null = {}, settings: Partial<Snapshot['settings']> = {}) {
  const window = new Window({ url: 'https://lumiverse.example/' });
  Object.assign(globalThis, { document: window.document });
  const root = window.document.createElement('div'), bar = window.document.createElement('div'), landing = window.document.createElement('div');
  window.document.body.append(root, bar, landing);
  const opened: Array<{ ref: unknown; params: unknown }> = [];
  const state: Snapshot = {
    version: '0.1.0', permissions: ['generation', 'interceptor', 'chats', 'characters'], notice: '',
    connections: [{ id: 'model', name: 'Writer', model: 'm' }],
    settings: { connectionId: 'model', maxOutputTokens: 16000, reasoningMode: 'inherit', every: 8, placement: 'auto', quick: { enabled: false, connectionId: '', model: '' }, wait: 'medium', homeList: true, ...settings },
    decisions: { available: true, reason: '', connections: [{ id: 'dec', name: 'Jev', provider: 'typesafe', model: '~typesafe/jev-latest', isDefault: true }] },
    chat: chat === null ? null : { chatId: 'chat-1', name: 'Low Water', supported: true, reason: '', enabled: true, pace: 'auto', preferences: { tone: 'balanced', twist: true }, hasNotebook: true,
      summary: 'Notebook updated after the tavern.', clock: { day: 2, hour: 21, label: '' }, clockText: 'Day 2, 21:00', sources: { day: 'notebook', hour: 'notebook', exact: false }, checks: [],
      needsCheck: '', job: null, updatedAt: Date.now(), repliesSinceCheck: 2, skipHours: 0, notebook: stamp(validateNotebook(sampleNotebook()), 40), behind: false, earlierParts: 0, quick: null, dueIds: [], skipOffer: null, glance: null, reworking: false, talk: [], notes: [], canUndo: false, ...chat },
  };
  const requests: Array<{ action: string; input: any }> = [];
  let receive: (m: unknown) => void = () => {};
  const extras: string[] = [];
  const ctx = {
    ui: { registerDrawerTab: () => ({ root, tabId: 'g', setBadge: () => {}, onActivate: () => () => {}, activate: () => {}, destroy: () => {} }),
      registerInputBarAction: () => ({ actionId: 'a', onClick: () => () => {}, destroy: () => {}, setLabel: (l: string) => extras.push(l), setSubtitle: () => {}, setEnabled: () => {} }), mount: (point: string) => point === 'landing_hero' ? landing : bar },
    dom: { addStyle: () => () => {} }, events: { on: () => () => {} }, getActiveChat: () => ({ chatId: chat === null ? null : 'chat-1', characterId: 'card' }), ready: () => {},
    host: { surfaces: { invoke: (ref: unknown, params: unknown) => { opened.push({ ref, params }); } } },
    onBackendMessage: (cb: (m: unknown) => void) => { receive = cb; return () => {}; },
    sendToBackend: (m: any) => { requests.push(m); queueMicrotask(() => {
      if (m.action === 'pace' && state.chat) state.chat.pace = m.input.pace;
      if (m.action === 'enable' && state.chat) state.chat.enabled = m.input.enabled;
      receive({ type: 'grimoire:response', id: m.id, result: m.action === 'snapshot' ? structuredClone(state) : m.action === 'skip' ? 24 : m.action === 'stories' ? structuredClone(storyList) : null });
    }); },
  } as unknown as SpindleFrontendContext;
  cleanups.push(setup(ctx));
  const button = (text: string) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === text) as unknown as HTMLButtonElement | undefined;
  return { root, bar, landing, opened, state, requests, button, extras, window, changed: () => receive({ type: 'grimoire:changed' }) };
}

describe('the panel', () => {
  test('talking to Grimoire: send with keep, see changes, remove a note, undo', async () => {
    const h = harness({ notes: [{ id: 'n1', text: 'Keep the romance a slow burn.', at: 1 }], canUndo: true,
      talk: [{ from: 'you', text: 'Slow down.', at: 1 }, { from: 'grimoire', text: 'Got it.', at: 2, changes: ['Slowed 1 storyline'], versionAt: 2 }] }); await tick();
    expect(h.root.textContent).toContain('Keep the romance a slow burn.');
    expect(h.root.textContent).toContain('Slowed 1 storyline');
    const box = h.root.querySelector('textarea[aria-label="Message to Grimoire"]') as unknown as HTMLTextAreaElement;
    box.value = 'More trouble, please.'; box.dispatchEvent(new h.window.Event('input') as unknown as Event);
    const keep = Array.from(h.root.querySelectorAll('label')).find(l => l.textContent === 'Keep this as a lasting note')!.querySelector('input') as unknown as HTMLInputElement;
    keep.checked = true; keep.dispatchEvent(new h.window.Event('change') as unknown as Event);
    h.button('Send')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'talk')!.input).toEqual({ chatId: 'chat-1', text: 'More trouble, please.', keep: true });
    h.button('Remove')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'unpin')!.input).toEqual({ chatId: 'chat-1', noteId: 'n1' });
    h.button('Undo the last change')!.click(); await tick();
    expect(h.requests.some(r => r.action === 'undo-talk')).toBe(true);
  });
  test('shows story time, pace, and controls, and keeps the notebook folded', async () => {
    const h = harness(); await tick();
    expect(h.root.textContent).toContain('Day 2, 21:00');
    expect(h.root.textContent).toContain('Kept by Grimoire');
    expect(h.root.textContent).toContain('Notebook updated after the tavern.');
    const spoilers = Array.from(h.root.querySelectorAll('details')).find(d => d.textContent?.includes('Show the notebook'))!;
    expect(spoilers.open).toBe(false);
    expect(h.button('Check now')).toBeTruthy();
  });
  test('pace buttons set the pace, and the action-bar button cycles it', async () => {
    const h = harness(); await tick();
    h.button('Quiet')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'pace')!.input).toEqual({ chatId: 'chat-1', pace: 'quiet' });
    expect(h.root.textContent).toContain('No new trouble starts');
    const pill = h.bar.querySelector('button')!;
    expect(pill.hidden).toBe(false); expect(pill.textContent).toBe('Quiet');
    pill.click(); await tick();
    expect(h.requests.filter(r => r.action === 'pace').at(-1)!.input.pace).toBe('fast');
    expect(h.extras.at(-1)).toBe('Story pace: Fast');
    expect([nextPace('auto'), nextPace('quiet'), nextPace('fast')]).toEqual(['quiet', 'fast', 'auto']);
  });
  test('the pace button hides when Grimoire is off in the chat', async () => {
    const h = harness({ enabled: false }); await tick();
    expect(h.bar.querySelector('button')!.hidden).toBe(true);
    expect(h.root.textContent).toContain('Turned off');
  });
  test('time skips send the amount and unit', async () => {
    const h = harness(); await tick();
    const amount = h.root.querySelector('input[type=number]') as unknown as HTMLInputElement; amount.value = '3';
    h.button('Skip time')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'skip')!.input).toEqual({ chatId: 'chat-1', amount: 3, unit: 'days' });
  });
  test('a chat without a notebook offers to write one, and needs a connection first', async () => {
    const h = harness({ hasNotebook: false, notebook: null }); await tick();
    h.button('Write the notebook')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'create')!.input).toEqual({ chatId: 'chat-1', preferences: { tone: 'balanced', twist: true } });
    const none = harness({ hasNotebook: false, notebook: null }, { connectionId: '' }); await tick();
    expect(none.button('Write the notebook')!.disabled).toBe(true);
    expect(none.root.textContent).toContain('Choose a model connection in Settings first.');
  });
  test('deleting needs a second tap', async () => {
    const h = harness(); await tick();
    h.button('Delete this notebook')!.click(); await tick();
    expect(h.requests.some(r => r.action === 'remove')).toBe(false);
    h.button('Tap again to delete this notebook')!.click(); await tick();
    expect(h.requests.some(r => r.action === 'remove')).toBe(true);
  });
  test('editing as text refuses broken JSON without sending it', async () => {
    const h = harness(); await tick();
    h.button('Edit as text')!.click(); await tick();
    const area = h.root.querySelector('textarea[aria-label="Notebook as text"]') as unknown as HTMLTextAreaElement;
    area.value = '{ broken';
    h.button('Save changes')!.click(); await tick();
    expect(h.requests.some(r => r.action === 'edit')).toBe(false);
    expect(h.root.querySelector('.gm-status')!.textContent).toContain('not valid JSON');
  });
  test('group chats and no chat get a plain explanation', async () => {
    const h = harness({ supported: false, reason: 'Group chats are not supported yet. Use a chat with one character.' }); await tick();
    expect(h.root.textContent).toContain('Group chats are not supported yet');
    const none = harness(null); await tick();
    expect(none.root.textContent).toContain('Open a chat to use Grimoire.');
  });
});

describe('at a glance', () => {
  test('shows shapes and counts in its own fold, closed by default', async () => {
    const h = harness({ glance: { shape: 'kishotenketsu', stage: 'sho', threads: { open: 3, urgent: 0, steady: 2, slow: 1, closed: 1 }, seeds: { waiting: 3, planted: 2, paid: 1, echo: 0 }, moments: { possible: 5, big: 1, happened: 2 }, people: { total: 6, met: 4 }, nextInReplies: 7, dueNow: 0 } }); await tick();
    const fold = Array.from(h.root.querySelectorAll('details')).find(d => d.textContent?.includes('At a glance'))!;
    expect(fold.open).toBe(false);
    for (const text of ['Kishōtenketsu, development', '3 open threads (2 steady, 1 slow), 1 finished', 'within about 7 replies', '2 planted, 3 waiting, 1 paid off', '5 possible (1 big), 2 happened', '6, 4 met so far'])
      expect(fold.textContent).toContain(text);
  });
});

describe('time-skip suggestions', () => {
  const offer = { options: [{ hours: 12, label: 'Skip ahead to when something happens (about 12 hours)' }, { hours: 14, label: 'Skip to tomorrow morning' }] };
  test('show above the message box and in the panel, and skip or wave off', async () => {
    const h = harness({ skipOffer: offer }); await tick();
    const pill = Array.from(h.bar.querySelectorAll('button')).find(b => b.textContent === 'Skip ahead?')!;
    expect(pill.hidden).toBe(false);
    expect(h.root.textContent).toContain('This scene has gone quiet');
    h.button('Skip ahead to when something happens (about 12 hours)')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'skip')!.input).toEqual({ chatId: 'chat-1', amount: 12, unit: 'hours' });
    h.button('Not now')!.click(); await tick();
    expect(h.requests.some(r => r.action === 'dismiss-skip')).toBe(true);
  });
  test('stay hidden when there is nothing to suggest', async () => {
    const h = harness(); await tick();
    expect(Array.from(h.bar.querySelectorAll('button')).find(b => b.textContent === 'Skip ahead?')!.hidden).toBe(true);
    expect(h.root.textContent).not.toContain('This scene has gone quiet');
  });
});

describe('pacing settings', () => {
  test('the longest wait is saved, and starting a notebook asks no length question', async () => {
    const start = harness({ hasNotebook: false, notebook: null }); await tick();
    expect(start.root.textContent).not.toContain('Story length');
    expect(start.root.textContent).toContain('The story keeps going as long as you play');
    const h = harness(); await tick();
    Array.from(h.root.querySelectorAll('button')).find(b => b.textContent === 'Settings')!.click(); await tick();
    expect(h.root.textContent).toContain('Longest a story thread waits');
    const wait = Array.from(h.root.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === 'long')) as unknown as HTMLSelectElement;
    wait.value = 'long';
    h.button('Save settings')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'settings')!.input.settings.wait).toBe('long');
  });
});

describe('the quick check settings', () => {
  test('save the switch, the connection, and any model ID', async () => {
    const h = harness(); await tick();
    Array.from(h.root.querySelectorAll('button')).find(b => b.textContent === 'Settings')!.click(); await tick();
    expect(h.root.textContent).toContain('Quick check after each reply');
    expect(h.root.textContent).toContain('Your default: Jev · ~typesafe/jev-latest');
    const toggle = Array.from(h.root.querySelectorAll('input[type=checkbox]')).at(-1) as unknown as HTMLInputElement; toggle.checked = true;
    const model = h.root.querySelector('input[type=text]') as unknown as HTMLInputElement; model.value = 'openai/some-decider';
    h.button('Save settings')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'settings')!.input.settings.quick).toEqual({ enabled: true, connectionId: '', model: 'openai/some-decider' });
  });
  test('explain plainly when this Lumiverse has no decision models', async () => {
    const h = harness();
    h.state.decisions = { available: false, reason: 'This version of Lumiverse doesn’t offer decision models. Update Lumiverse to use the quick check.', connections: [] };
    await tick();
    Array.from(h.root.querySelectorAll('button')).find(b => b.textContent === 'Settings')!.click(); await tick();
    expect(h.root.textContent).toContain('Update Lumiverse to use the quick check');
    expect((Array.from(h.root.querySelectorAll('input[type=checkbox]')).at(-1) as unknown as HTMLInputElement).disabled).toBe(true);
  });
  test('the chat page says when the quick check last ran', async () => {
    const h = harness({ quick: { at: Date.now() - 120_000, ok: false, error: 'The decision model took too long to answer.' } }, { quick: { enabled: true, connectionId: '', model: '' } }); await tick();
    expect(h.root.textContent).toContain('The last quick check didn’t run: The decision model took too long to answer.');
  });
});

describe('background updates', () => {
  test('a refresh that changes nothing leaves the panel alone', async () => {
    const h = harness(); await tick();
    const before = h.button('Check now');
    h.changed(); await tick();
    expect(h.button('Check now')).toBe(before);
  });
  test('a refresh that changes something keeps the scroll position', async () => {
    const h = harness(); await tick();
    const scroller = h.root as unknown as HTMLElement; scroller.scrollTop = 420;
    h.state.chat!.repliesSinceCheck = 5; h.changed(); await tick();
    expect(h.root.textContent).toContain('5 replies since the last update');
    expect(scroller.scrollTop).toBe(420);
  });
  test('settings being edited are never redrawn by a background update', async () => {
    const h = harness(); await tick();
    Array.from(h.root.querySelectorAll('button')).find(b => b.textContent === 'Settings')!.click(); await tick();
    const every = h.root.querySelector('input[type=number]') as unknown as HTMLInputElement; every.value = '12';
    h.state.chat!.repliesSinceCheck = 6; h.changed(); await tick();
    expect((h.root.querySelector('input[type=number]') as unknown as HTMLInputElement).value).toBe('12');
    h.button('Save settings')!.click(); await tick();
    expect(h.requests.find(r => r.action === 'settings')!.input.settings.every).toBe(12);
  });
  test('typing in the chat page is not interrupted either, and the update lands afterwards', async () => {
    const h = harness(); await tick();
    const amount = h.root.querySelector('input[type=number]') as unknown as HTMLInputElement; amount.focus(); amount.value = '4';
    h.state.chat!.repliesSinceCheck = 7; h.changed(); await tick();
    expect(h.root.querySelector('input[type=number]') as unknown).toBe(amount);
    amount.blur(); await tick();
    expect(h.root.textContent).toContain('7 replies since the last update');
  });
});

describe('your stories', () => {
  test('on the home page, chats with a notebook are listed and open with a tap', async () => {
    const h = harness(null); await tick(20);
    const home = h.landing.querySelector('.gm-home') as unknown as HTMLElement;
    expect(home.hidden).toBe(false);
    expect(home.textContent).toContain('Your stories');
    expect(home.textContent).toContain('Riley');
    expect(home.textContent).toContain('Comic-Con · played 1 h ago');
    expect(home.textContent).toContain('Grimoire off');
    (home.querySelector('.gm-story') as unknown as HTMLButtonElement).click();
    expect(h.opened[0]).toEqual({ ref: { kind: 'route', id: '/chat/:chatId' }, params: { chatId: 'chat-9' } });
    // The drawer lists them too when no chat is open.
    expect(h.root.textContent).toContain('Your stories');
  });
  test('stays hidden inside a chat, and when turned off', async () => {
    const inChat = harness(); await tick(20);
    expect((inChat.landing.querySelector('.gm-home') as unknown as HTMLElement).hidden).toBe(true);
    const off = harness(null, { homeList: false }); await tick(20);
    expect((off.landing.querySelector('.gm-home') as unknown as HTMLElement).hidden).toBe(true);
  });
});

describe('requests', () => {
  test('time out instead of hanging, and close cleanly', async () => {
    const rpc = createRpc({ onBackendMessage: () => () => {}, sendToBackend: () => {} }, () => {}, 10);
    await expect(rpc.request('snapshot')).rejects.toThrow('did not answer');
    rpc.destroy();
    await expect(rpc.request('snapshot')).rejects.toThrow('closed');
  });
});
