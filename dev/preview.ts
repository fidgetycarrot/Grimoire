import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { setup } from '../src/frontend';
import { stamp, validateNotebook } from '../src/notebook';
import { VERSION, type Snapshot } from '../src/types';
import { sampleNotebook } from '../tests/fixtures';

// A mocked host and backend for looking at the panel. No model is called.
const notebook = stamp(validateNotebook(sampleNotebook()), 24 + 18);
notebook.threads[0].steps[0].status = 'shown';
const state: Snapshot = {
  version: VERSION, permissions: ['generation', 'interceptor', 'chats', 'characters', 'personas', 'world_books'], notice: '', decisions: { available: true, reason: '', connections: [{ id: 'dec', name: 'OpenRouter decisions', provider: 'openrouter', model: '~typesafe/jev-latest', isDefault: true }] },
  connections: [{ id: 'model', name: 'My writing model', model: 'configured model' }],
  settings: { connectionId: 'model', maxOutputTokens: 16000, reasoningMode: 'inherit', every: 8, quick: { enabled: true, connectionId: '', model: '' }, wait: 'medium', homeList: true, intimate: 'protect' },
  chat: { chatId: 'preview', name: 'Low Water', supported: true, reason: '', enabled: true, pace: 'auto', preferences: { tone: 'balanced', twist: true },
    hasNotebook: new URLSearchParams(location.search).get('start') === null, summary: 'Notebook updated after the ferry crossing.', clock: { day: 2, hour: 21.67, label: 'Day 2, 21:40' }, clockText: 'Day 2, 21:40',
    sources: { day: 'tracker', hour: 'tracker', exact: true }, checks: [{ name: 'datetime', type: 'datetime', status: 'verified', value: 'Day 2, 21:40' }, { name: 'location', type: 'text', status: 'verified', value: 'The Drowned Lantern' }, { name: 'present', type: 'list', status: 'unavailable' }],
    needsCheck: '', job: null, updatedAt: Date.now() - 6 * 60_000, repliesSinceCheck: 3, skipHours: 0, notebook, behind: false, earlierParts: 0, quick: { at: Date.now() - 60_000, ok: true, error: '' }, dueIds: [], reworking: false, quickLog: [{ reply: 12, at: Date.now() - 60_000, ok: true, answers: { due_1: 0.91, moment_1: 0.12, detail_mentioned: 0.4, fits_1: 0.95, story_shift: 0.04, new_turn: 0.81, rhythm: { choice: 'peak', confidence: 0.72 } }, marked: 1, checkup: true, shifted: false, held: 0 }, { reply: 11, at: Date.now() - 600_000, ok: true, answers: { moment_1: 0.05, story_shift: 0.02, new_turn: 0.2, rhythm: { choice: 'rising', confidence: 0.64 } }, marked: 0, checkup: false, shifted: false, held: 0 }], canUndo: true, notes: [{ id: 'n1', text: 'Keep the romance a slow burn.', at: Date.now() - 3_600_000 }], talk: [{ from: 'you', text: 'Less romance for now, more trouble with the old crew.', at: Date.now() - 120_000 }, { from: 'grimoire', text: 'Got it. The romance can simmer while the old crew causes more trouble.', at: Date.now() - 100_000, changes: ['Sped up 1 storyline', 'Set aside 1 planned moment'], versionAt: 1 }], glance: { shape: 'kishotenketsu', stage: 'sho', threads: { open: 3, urgent: 0, steady: 2, slow: 1, closed: 1 }, seeds: { waiting: 3, planted: 2, paid: 1, echo: 0 }, moments: { possible: 5, big: 1, happened: 2 }, people: { total: 6, met: 4 }, nextInReplies: 7, dueNow: 0, part: { elapsed: 23, length: 60 } }, skipOffer: { options: [{ hours: 6, label: 'Skip ahead to when something happens (about 6 hours)' }, { hours: 9, label: 'Skip to this evening' }] } },
};
let receive: (payload: unknown) => void = () => {};
const root = document.getElementById('root')!, actions = document.getElementById('actions')!;
const ctx = {
  ui: {
    registerDrawerTab: () => ({ root, tabId: 'grimoire', setBadge: () => {}, activate: () => {}, setTitle: () => {}, setShortName: () => {}, destroy: () => {}, onActivate: () => () => {} }),
    registerInputBarAction: () => ({ actionId: 'x', onClick: () => () => {}, destroy: () => {}, setLabel: () => {}, setSubtitle: () => {}, setEnabled: () => {} }),
    mount: () => actions,
  },
  dom: { addStyle: (css: string) => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); return () => s.remove(); } },
  events: { on: () => () => {} }, getActiveChat: () => ({ chatId: 'preview', characterId: 'card' }), ready: () => {},
  onBackendMessage: (handler: (p: unknown) => void) => { receive = handler; return () => {}; },
  sendToBackend: (request: any) => setTimeout(() => {
    let result: unknown = null;
    if (request.action === 'snapshot') result = structuredClone(state);
    if (request.action === 'pace') { state.chat!.pace = request.input.pace; result = request.input.pace; }
    if (request.action === 'enable') state.chat!.enabled = request.input.enabled;
    if (request.action === 'skip') { state.chat!.skipHours = request.input.amount * 24; result = request.input.amount * 24; }
    if (request.action === 'create') { state.chat!.job = { id: 'j', kind: 'create', status: 'running', label: 'Writing the notebook', startedAt: Date.now() }; setTimeout(() => { state.chat!.job = null; state.chat!.hasNotebook = true; receive({ type: 'grimoire:changed' }); }, 1500); }
    receive({ type: 'grimoire:response', id: request.id, result });
  }, 60),
} as unknown as SpindleFrontendContext;
setup(ctx);
