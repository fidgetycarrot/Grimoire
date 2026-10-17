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

function harness(chat: Partial<NonNullable<Snapshot['chat']>> | null = {}, settings: Partial<Snapshot['settings']> = {}) {
  const window = new Window({ url: 'https://lumiverse.example/' });
  Object.assign(globalThis, { document: window.document });
  const root = window.document.createElement('div'), bar = window.document.createElement('div');
  window.document.body.append(root, bar);
  const state: Snapshot = {
    version: '0.1.0', permissions: ['generation', 'interceptor', 'chats', 'characters'], notice: '',
    connections: [{ id: 'model', name: 'Writer', model: 'm' }],
    settings: { connectionId: 'model', maxOutputTokens: 16000, reasoningMode: 'inherit', every: 8, placement: 'auto', ...settings },
    chat: chat === null ? null : { chatId: 'chat-1', name: 'Low Water', supported: true, reason: '', enabled: true, pace: 'auto', preferences: { length: 'medium', tone: 'balanced', twist: true }, hasNotebook: true,
      summary: 'Notebook updated after the tavern.', clock: { day: 2, hour: 21, label: '' }, clockText: 'Day 2, 21:00', sources: { day: 'notebook', hour: 'notebook', exact: false }, checks: [],
      needsCheck: '', job: null, updatedAt: Date.now(), repliesSinceCheck: 2, skipHours: 0, notebook: stamp(validateNotebook(sampleNotebook()), 40), behind: false, earlierParts: 0, ...chat },
  };
  const requests: Array<{ action: string; input: any }> = [];
  let receive: (m: unknown) => void = () => {};
  const extras: string[] = [];
  const ctx = {
    ui: { registerDrawerTab: () => ({ root, tabId: 'g', setBadge: () => {}, onActivate: () => () => {}, activate: () => {}, destroy: () => {} }),
      registerInputBarAction: () => ({ actionId: 'a', onClick: () => () => {}, destroy: () => {}, setLabel: (l: string) => extras.push(l), setSubtitle: () => {}, setEnabled: () => {} }), mount: () => bar },
    dom: { addStyle: () => () => {} }, events: { on: () => () => {} }, getActiveChat: () => ({ chatId: 'chat-1', characterId: 'card' }), ready: () => {},
    onBackendMessage: (cb: (m: unknown) => void) => { receive = cb; return () => {}; },
    sendToBackend: (m: any) => { requests.push(m); queueMicrotask(() => {
      if (m.action === 'pace' && state.chat) state.chat.pace = m.input.pace;
      if (m.action === 'enable' && state.chat) state.chat.enabled = m.input.enabled;
      receive({ type: 'grimoire:response', id: m.id, result: m.action === 'snapshot' ? structuredClone(state) : m.action === 'skip' ? 24 : null });
    }); },
  } as unknown as SpindleFrontendContext;
  cleanups.push(setup(ctx));
  const button = (text: string) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === text) as unknown as HTMLButtonElement | undefined;
  return { root, bar, state, requests, button, extras, window };
}

describe('the panel', () => {
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
    expect(h.requests.find(r => r.action === 'create')!.input).toEqual({ chatId: 'chat-1', preferences: { length: 'medium', tone: 'balanced', twist: true } });
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
    const area = h.root.querySelector('textarea') as unknown as HTMLTextAreaElement;
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

describe('requests', () => {
  test('time out instead of hanging, and close cleanly', async () => {
    const rpc = createRpc({ onBackendMessage: () => () => {}, sendToBackend: () => {} }, () => {}, 10);
    await expect(rpc.request('snapshot')).rejects.toThrow('did not answer');
    rpc.destroy();
    await expect(rpc.request('snapshot')).rejects.toThrow('closed');
  });
});
