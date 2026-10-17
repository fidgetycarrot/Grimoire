import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { styles } from './styles';
import { describeDuration } from './clock';
import type { Notebook, Pace } from './notebook';
import { VERSION, type ChatView, type Settings, type Snapshot } from './types';

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v18"/><path d="M12 8h3M12 12h3"/></svg>';
const PACE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l4-5"/></svg>';
export const PACE_LABELS: Record<Pace, { name: string; help: string }> = {
  auto: { name: 'Auto', help: 'Grimoire reads the story’s rhythm and picks the pace.' },
  quiet: { name: 'Quiet', help: 'Room to breathe. No new trouble starts, but anything already urgent still plays out.' },
  fast: { name: 'Fast', help: 'Tight scenes. Things move toward what comes next, and consequences arrive sooner.' },
};
const ORDER: Pace[] = ['auto', 'quiet', 'fast'];
export const nextPace = (pace: Pace): Pace => ORDER[(ORDER.indexOf(pace) + 1) % ORDER.length];

type Rpc = Pick<SpindleFrontendContext, 'sendToBackend' | 'onBackendMessage'>;
/** Requests that always finish, even if the backend stops answering. */
export function createRpc(ctx: Rpc, onChanged: () => void, timeoutMs = 45_000) {
  let sequence = 0, closed = false;
  const prefix = Math.random().toString(36).slice(2);
  const pending = new Map<string, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const off = ctx.onBackendMessage(payload => {
    const message = payload as { type?: string; id?: string; result?: unknown; error?: string };
    if (message?.type === 'grimoire:changed') { onChanged(); return; }
    if (message?.type !== 'grimoire:response' || typeof message.id !== 'string') return;
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
  });
  return {
    request<T>(action: string, input?: unknown): Promise<T> {
      if (closed) return Promise.reject(new Error('Grimoire has closed. Reopen it and try again.'));
      const id = `gm-${prefix}-${++sequence}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Lumiverse did not answer in time. Try again.')); }, timeoutMs);
        pending.set(id, { resolve: v => resolve(v as T), reject, timer });
        try { ctx.sendToBackend({ type: 'grimoire:request', id, action, input }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))); }
      });
    },
    destroy() { closed = true; off(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Grimoire closed.')); } pending.clear(); },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}
const ago = (time: number) => { const s = Math.max(0, (Date.now() - time) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
const STATUS_WORDS = { verified: 'Read from your preset', waiting: 'Waiting for a reply to check', unavailable: 'Not found, Grimoire keeps this' } as const;
const FIELD_WORDS: Record<string, string> = { datetime: 'Date and time', date: 'Date', time: 'Time', location: 'Place', present: 'Who is here' };

export function setup(ctx: SpindleFrontendContext) {
  let destroyed = false, snapshot: Snapshot | null = null, page: 'chat' | 'settings' = 'chat', editing = false, confirmDelete = false;
  let refreshing: Promise<void> | null = null, again = false, againForced = false, polling: ReturnType<typeof setInterval> | undefined;
  /** What the panel last drew, so a refresh that changes nothing draws nothing. */
  let drawn = '', pendingDraw = false;
  const tab = ctx.ui.registerDrawerTab({ id: 'grimoire', title: 'Grimoire', shortName: 'Grimoire', description: 'The story behind your chat: where it is going, why, and how fast.', keywords: ['story', 'notebook', 'plot', 'pace', 'pacing'], iconSvg: ICON });
  const teardown: Array<() => void> = [ctx.dom.addStyle(styles)];
  const app = el('div', 'gm-app'); tab.root.append(app);
  const rpc = createRpc(ctx, () => { void refresh(); });
  const status = el('p', 'gm-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const notify = (text: string, kind: 'info' | 'error' = 'info') => { if (!destroyed) { status.textContent = text; status.dataset.kind = kind; } };
  const header = el('header', 'gm-header'), mark = el('div', 'gm-mark'), titles = el('div');
  titles.append(el('h1', '', 'Grimoire'), el('p', 'gm-sub', 'The story behind your chat: where it is going, why, and how fast.'));
  header.append(mark, titles);
  const tabs = el('div', 'gm-tabs'); tabs.setAttribute('role', 'tablist');
  const tabButtons = (['chat', 'settings'] as const).map(key => { const b = el('button', 'gm-tab', key === 'chat' ? 'This chat' : 'Settings'); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { page = key; render(); }); tabs.append(b); return [key, b] as const; });
  const body = el('div', 'gm-panel'), footer = el('footer', 'gm-footer', `Grimoire ${VERSION}`);
  app.append(header, tabs, status, body, footer);

  function button(label: string, action: () => unknown | Promise<unknown>, kind: '' | 'primary' | 'danger' = '') {
    const b = el('button', `gm-button${kind ? ` gm-${kind}` : ''}`, label); b.type = 'button';
    b.addEventListener('click', () => { void (async () => { b.disabled = true; try { await action(); } catch (error) { notify(error instanceof Error ? error.message : String(error), 'error'); } finally { if (!destroyed) b.disabled = false; } })(); });
    return b;
  }
  let fieldCount = 0;
  function labeled(label: string, control: HTMLElement, hint?: string) {
    const wrap = el('div', 'gm-field'), caption = el('label', 'gm-label', label), id = `gm-${++fieldCount}`;
    control.id = id; caption.htmlFor = id; wrap.append(caption, control);
    if (hint) wrap.append(el('p', 'gm-hint', hint));
    return wrap;
  }
  function select(options: Array<[string, string]>, value: string) {
    const s = el('select'); for (const [v, l] of options) { const o = el('option', '', l); o.value = v; s.append(o); } s.value = value; return s;
  }
  function details(title: string, open = false) { const d = el('details', 'gm-details'); const s = el('summary', '', title); const inner = el('div', 'gm-stack'); d.append(s, inner); d.open = open; return { root: d, body: inner }; }
  const chatId = () => ctx.getActiveChat().chatId ?? null;
  async function act<T>(action: string, input: Record<string, unknown> = {}): Promise<T> {
    const result = await rpc.request<T>(action, input); await refresh(true); return result;
  }

  // ----- This chat -----
  function renderStart(view: ChatView) {
    const card = el('section', 'gm-card gm-stack');
    card.append(el('h2', '', 'Start a story notebook'), el('p', 'gm-small', 'Grimoire reads this chat’s card, your persona, the card’s lorebook, and anything already said. It writes a private plan for the story: what is really going on, what people want, and the threads that will move over time. You won’t see it unless you open it.'));
    const tone = select([['light', 'Light'], ['balanced', 'Balanced'], ['dark', 'Dark']], view.preferences.tone);
    const twist = el('input'); twist.type = 'checkbox'; twist.checked = view.preferences.twist; twist.style.width = 'auto';
    const twistRow = el('label', 'gm-row gm-small'); twistRow.append(twist, document.createTextNode('A twist is allowed, if one fits'));
    const grid = el('div', 'gm-stack'); grid.append(labeled('Tone', tone, 'The story keeps going as long as you play: when its threads wrap up, a check-up starts the next part from what happened.'));
    const noConnection = !snapshot?.settings.connectionId;
    const parts = view.earlierParts ?? 0;
    const write = button('Write the notebook', async () => {
      await act('create', { chatId: view.chatId, preferences: { tone: tone.value, twist: twist.checked } });
      notify(parts ? `Reading the chat, then writing the notebook. This uses ${parts + 1} model requests and can take a few minutes.` : 'Writing the notebook. This uses one model request and can take a minute.');
    }, 'primary');
    write.classList.add('gm-wide'); write.disabled = noConnection || view.job?.status === 'running';
    card.append(grid, twistRow);
    if (parts) card.append(el('p', 'gm-hint', `This is a long chat. Grimoire reads it from the beginning first, in ${parts} ${parts === 1 ? 'part' : 'parts'} (one model request each), so the notebook knows the whole story so far. Then one more request writes the notebook.`));
    card.append(write);
    if (noConnection) card.append(el('p', 'gm-notice', 'Choose a model connection in Settings first.'), button('Open settings', () => { page = 'settings'; render(); }));
    return card;
  }
  function renderJob(view: ChatView) {
    if (!view.job || view.job.status === 'complete') return null;
    const box = el('div', view.job.status === 'failed' ? 'gm-notice' : 'gm-card gm-small');
    box.textContent = view.job.status === 'running' ? `${view.job.label}…` : `${view.job.label}. ${view.job.error ?? ''}`;
    return box;
  }
  function renderClock(view: ChatView) {
    const card = el('section', 'gm-card gm-stack');
    const s = view.sources;
    const source = !s ? '' : s.day === 'tracker' && s.hour === 'tracker' ? 'From your preset’s tracker' : s.day === 'tracker' || s.hour === 'tracker' ? `${s.day === 'tracker' ? 'Day' : 'Hour'} from your preset’s tracker, the rest kept by Grimoire` : 'Kept by Grimoire, updated at check-ups';
    card.append(el('h4', '', 'Story time'), el('p', 'gm-clock', view.clockText || 'Not set yet'), el('p', 'gm-source', `${source}${s && s.hour !== 'unknown' && !s.exact ? ' · approximate' : ''}`));
    if (view.skipHours) card.append(el('p', 'gm-hint', `The narrator will be told that about ${describeDuration(view.skipHours)} have passed.`));
    return card;
  }
  function renderPace(view: ChatView) {
    const card = el('section', 'gm-card gm-stack'), group = el('div', 'gm-pace'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Story pace');
    for (const pace of ORDER) {
      const b = el('button', '', PACE_LABELS[pace].name); b.type = 'button'; b.setAttribute('aria-pressed', String(view.pace === pace));
      b.addEventListener('click', () => { void act('pace', { chatId: view.chatId, pace }).catch(error => notify(error.message, 'error')); });
      group.append(b);
    }
    card.append(el('h4', '', 'Pace'), group, el('p', 'gm-hint', PACE_LABELS[view.pace].help));
    return card;
  }
  function renderActions(view: ChatView) {
    const card = el('section', 'gm-card gm-stack');
    const amount = el('input'); amount.type = 'number'; amount.min = '1'; amount.max = '999'; amount.value = '1';
    const unit = select([['hours', 'hours'], ['days', 'days'], ['weeks', 'weeks']], 'days');
    const busy = view.job?.status === 'running';
    const check = button('Check now', async () => { await act('checkup', { chatId: view.chatId }); notify('Checking the story against the chat. One model request.'); });
    const skip = button('Skip time', async () => { const hours = await act<number>('skip', { chatId: view.chatId, amount: Number(amount.value), unit: unit.value }); notify(`Skipped about ${describeDuration(hours)}. The narrator will open with that gap.`); });
    check.disabled = busy || !view.enabled; skip.disabled = busy || !view.enabled;
    const skipRow = el('div', 'gm-grid'); skipRow.append(labeled('Skip ahead by', amount), labeled('Unit', unit));
    card.append(el('h4', '', 'Story controls'), el('p', 'gm-small', view.summary || 'No updates yet.'),
      el('p', 'gm-hint', `${view.repliesSinceCheck} ${view.repliesSinceCheck === 1 ? 'reply' : 'replies'} since the last update${view.updatedAt ? ` · saved ${ago(view.updatedAt)}` : ''}`),
      check, el('p', 'gm-hint', 'Check now reads the latest chat and updates the plan. Check-ups also run on their own when a scene changes, time jumps, or enough replies pass.'), skipRow, skip);
    const quick = snapshot?.settings.quick.enabled ? view.quick : undefined;
    if (snapshot?.settings.quick.enabled) card.insertBefore(el('p', quick && !quick.ok ? 'gm-notice' : 'gm-hint', !quick ? 'Quick check is on. It runs after the next reply.' : quick.ok ? `Quick check ran ${ago(quick.at)}.` : `The last quick check didn’t run: ${quick.error}`), check);
    return card;
  }
  function renderTracker(view: ChatView) {
    const d = details('What Grimoire reads from your preset');
    if (!view.checks.length) { d.body.append(el('p', 'gm-small', 'No tracker was found in this chat, so Grimoire keeps the story time itself. If your preset adds a status block later, a check-up can learn to read it.')); return d.root; }
    const list = el('ul', 'gm-fields');
    for (const check of view.checks) { const li = el('li'); const state = el('span', 'gm-dot', STATUS_WORDS[check.status]); state.dataset.state = check.status; li.append(el('span', '', `${FIELD_WORDS[check.name] ?? check.name}${check.value ? `: ${check.value}` : ''}`), state); list.append(li); }
    d.body.append(list, el('p', 'gm-hint', 'Each fact has one owner. Anything read from your preset is never asked for twice.'));
    return d.root;
  }
  function renderBook(notebook: Notebook, due: string[]) {
    const book = el('div', 'gm-book'), section = (title: string) => { const s = el('section'); s.append(el('h4', '', title)); book.append(s); return s; };
    const about = section('What it is about'); about.append(el('p', '', notebook.story.question));
    if (notebook.story.stakes) about.append(el('p', 'gm-meta', `At stake: ${notebook.story.stakes}`));
    if (notebook.story.direction) about.append(el('p', 'gm-meta', `Could end: ${notebook.story.direction}`));
    if (notebook.story.hiddenTruth.length || notebook.story.twist) { const s = section('What is really going on'), ul = el('ul'); for (const t of notebook.story.hiddenTruth) ul.append(el('li', '', t)); if (notebook.story.twist) ul.append(el('li', '', `Twist: ${notebook.story.twist}`)); s.append(ul); }
    const people = section('People');
    for (const p of notebook.people) { const e = el('div', 'gm-entry'); const name = el('p'); name.append(el('strong', '', p.name), ...(p.role ? [document.createTextNode(`, ${p.role}`)] : [])); if (!p.met) name.append(el('span', 'gm-chip', 'not met')); if (p.status === 'gone') name.append(el('span', 'gm-chip', 'gone')); e.append(name, el('p', 'gm-small', `Wants ${p.wants}`), ...(p.doing ? [el('p', 'gm-meta', `Doing: ${p.doing}`)] : [])); people.append(e); }
    const threads = section('Threads');
    for (const t of notebook.threads) {
      const e = el('div', 'gm-entry'), title = el('p'); title.append(el('strong', '', t.title), el('span', 'gm-chip', t.status === 'open' ? t.speed : t.status));
      if (due.includes(t.id)) { const c = el('span', 'gm-chip', 'due'); c.dataset.tone = 'due'; title.append(c); }
      const steps = el('ol', 'gm-steps'); for (const step of t.steps) { const li = el('li', 'gm-small', step.text); li.dataset.status = step.status; if (step.status !== 'waiting') li.append(el('span', 'gm-chip', step.status)); steps.append(li); }
      e.append(title, el('p', 'gm-small', t.why), steps, ...(t.ifIgnored ? [el('p', 'gm-meta', `If left alone: ${t.ifIgnored}`)] : []), ...(t.closedReason ? [el('p', 'gm-meta', `Closed: ${t.closedReason}`)] : []));
      threads.append(e);
    }
    if (notebook.summary) section('Latest note from the model').append(el('p', 'gm-small', notebook.summary));
    const beats = section('Possible moments'), ul = el('ul');
    for (const b of notebook.beats) { const li = el('li', 'gm-small', b.text); if (b.status !== 'possible') { const c = el('span', 'gm-chip', b.status); if (b.status === 'happened') c.dataset.tone = 'done'; li.append(c); } ul.append(li); }
    beats.append(ul);
    if (notebook.events.length) { const s = section('What has happened'), list = el('ul'); for (const ev of notebook.events) list.append(el('li', 'gm-small', ev)); s.append(list); }
    return book;
  }
  function renderSpoilers(view: ChatView) {
    const d = details('Show the notebook · spoilers');
    if (!view.notebook) return d.root;
    if (!editing) {
      d.body.append(renderBook(view.notebook, view.dueIds ?? []), button('Edit as text', () => { editing = true; render(); d.root.open = true; }));
    } else {
      d.root.open = true;
      const area = el('textarea'); area.rows = 18; area.value = JSON.stringify(view.notebook, null, 2); area.setAttribute('aria-label', 'Notebook as text');
      d.body.append(el('p', 'gm-hint', 'Change anything you like. Grimoire checks it before saving and keeps the times it recorded.'), area,
        button('Save changes', async () => { let value: unknown; try { value = JSON.parse(area.value); } catch { throw new Error('That is not valid JSON. Check for a missing comma or quote.'); } await act('edit', { chatId: view.chatId, notebook: value }); editing = false; notify('Notebook saved.'); render(); }, 'primary'),
        button('Cancel', () => { editing = false; render(); }));
    }
    return d.root;
  }
  function renderChat() {
    const view = snapshot?.chat;
    if (!view) { const empty = el('div', 'gm-empty'); empty.append(el('p', '', snapshot?.notice || 'Open a chat to use Grimoire.')); body.append(empty); return; }
    if (!view.supported) { body.append(el('p', 'gm-notice', view.reason)); return; }
    const job = renderJob(view);
    if (!view.hasNotebook) { if (job) body.append(job); body.append(renderStart(view)); return; }
    const toggleRow = el('div', 'gm-card gm-switch'), toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = view.enabled; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', 'Use Grimoire in this chat');
    toggle.addEventListener('change', () => { void act('enable', { chatId: view.chatId, enabled: toggle.checked }).catch(error => { toggle.checked = !toggle.checked; notify(error.message, 'error'); }); });
    const words = el('div'); words.append(el('h3', '', view.name || 'This chat'), el('p', 'gm-hint', view.enabled ? 'Grimoire is guiding this story.' : 'Turned off. The narrator gets no notes from Grimoire.'));
    toggleRow.append(words, toggle);
    body.append(toggleRow);
    if (job) body.append(job);
    if (view.needsCheck && view.enabled && view.job?.status !== 'running') body.append(el('p', 'gm-notice', `${view.needsCheck} An update will run after the next reply, or choose Check now.`));
    else if (view.behind && view.enabled) body.append(el('p', 'gm-hint', 'You went back in the chat, so Grimoire is using its notebook from before that point. Nothing from the removed replies counts.'));
    body.append(renderClock(view), renderPace(view), renderActions(view), renderTracker(view), renderSpoilers(view));
    const remove = button(confirmDelete ? 'Tap again to delete this notebook' : 'Delete this notebook', async () => {
      if (!confirmDelete) { confirmDelete = true; render(); setTimeout(() => { confirmDelete = false; render(); }, 5000); return; }
      confirmDelete = false; await act('remove', { chatId: view.chatId }); notify('Notebook deleted for this chat.');
    }, 'danger');
    body.append(remove);
  }

  // ----- Settings -----
  function renderSettings() {
    const settings: Settings = { ...(snapshot?.settings ?? { connectionId: '', maxOutputTokens: 16000, reasoningMode: 'inherit', every: 8, placement: 'auto', quick: { enabled: false, connectionId: '', model: '' }, wait: 'medium' }) };
    const card = el('section', 'gm-card gm-stack');
    const connection = select([['', 'Choose a connection'], ...(snapshot?.connections ?? []).map(c => [c.id, `${c.name}${c.model ? ` · ${c.model}` : ''}`] as [string, string])], settings.connectionId);
    const every = el('input'); every.type = 'number'; every.min = '2'; every.max = '50'; every.value = String(settings.every);
    const tokens = select([['8000', '8,000'], ['16000', '16,000'], ['32000', '32,000'], ['64000', '64,000']], String(settings.maxOutputTokens));
    const reasoning = select([['inherit', 'Use the connection’s setting'], ['off', 'Off'], ['low', 'Low']], settings.reasoningMode);
    const wait = select([['short', 'A few replies (about 8)'], ['medium', 'Some replies (about 15)'], ['long', 'Many replies (about 30)']], settings.wait ?? 'medium');
    const placement = select([['auto', 'Added for me'], ['macro', 'In my preset, with {{grimoire_note}}']], settings.placement);
    const grid = el('div', 'gm-grid'); grid.append(labeled('Response room (tokens)', tokens), labeled('Reasoning', reasoning));
    card.append(el('h2', '', 'Settings'),
      labeled('Model connection', connection, 'Used to write notebooks and run check-ups. Your chat keeps its own connection. A cheaper model may do, but test it on a chat first.'),
      labeled('Longest a story thread waits', wait, 'A thread moves on when enough story time has passed, or after this many replies, whichever comes first, so a long scene never leaves the story stuck. Urgent threads wait less and slow ones longer. Big scenes still aren’t interrupted for slow threads; they come in at the next break.'),
      labeled('Check-up after this many replies', every, 'A fallback. Check-ups also run when the scene changes or time jumps.'), grid,
      labeled('Where the note goes', placement, 'Added for me puts a short private note before each reply. If your preset uses {{grimoire_note}}, choose that so the note is never added twice. {{grimoire_clock}} and {{grimoire_pace}} work either way.'));

    // Quick check: a small decision model after each reply.
    const decisions = snapshot?.decisions ?? { available: false, reason: '', connections: [] };
    const quickCard = el('section', 'gm-card gm-stack');
    const quickRow = el('label', 'gm-switch'), quickOn = el('input'); quickOn.type = 'checkbox'; quickOn.checked = settings.quick.enabled; quickOn.setAttribute('role', 'switch');
    quickOn.setAttribute('aria-label', 'Quick check after each reply');
    quickRow.append(el('h3', '', 'Quick check after each reply'), quickOn);
    const fallback = decisions.connections.find(c => c.isDefault);
    const decision = select([['', fallback ? `Your default: ${fallback.name}${fallback.model ? ` · ${fallback.model}` : ''}` : 'Your default decision connection'], ...decisions.connections.map(c => [c.id, `${c.name}${c.model ? ` · ${c.model}` : ''}`] as [string, string])], settings.quick.connectionId);
    const model = el('input'); model.type = 'text'; model.value = settings.quick.model; model.placeholder = 'Leave empty to use the connection’s model'; model.spellcheck = false;
    quickCard.append(quickRow, el('p', 'gm-hint', 'A small decision model reads each new reply and answers a few yes-or-no questions: did a planned development happen, how intense is the scene, did something new come up. The notebook stays current between check-ups, and a full check-up runs only when it’s needed. One small request per reply.'));
    if (!decisions.available) { quickOn.disabled = true; quickCard.append(el('p', 'gm-notice', decisions.reason || 'Decision models aren’t available.')); }
    else {
      if (!decisions.connections.length) quickCard.append(el('p', 'gm-notice', 'Add a decision connection in Lumiverse’s connection settings first (OpenRouter or TypeSafe).'));
      quickCard.append(labeled('Decision connection', decision), labeled('Model', model, 'Any decision model works. To use a different one than the connection’s, type its exact ID. Pick one with a version in its name rather than one ending in “latest”, so it doesn’t change without you knowing.'));
    }
    const save = button('Save settings', async () => { await act('settings', { settings: { connectionId: connection.value, every: Number(every.value), maxOutputTokens: Number(tokens.value), reasoningMode: reasoning.value, placement: placement.value, wait: wait.value, quick: { enabled: quickOn.checked, connectionId: decision.value, model: model.value } } }); notify('Settings saved.'); }, 'primary');
    body.append(card, quickCard, save);
  }

  function render() {
    if (destroyed) return;
    for (const [key, b] of tabButtons) { b.setAttribute('aria-selected', String(page === key)); }
    const openDetails = [...body.querySelectorAll('details')].map(d => d.open);
    // Redrawing empties the panel for a moment, and the drawer would jump to the top. Put every scroll position back.
    const scrolled: Array<[Element, number]> = [];
    for (let node: Element | null = app; node; node = node.parentElement) if (node.scrollTop > 0) scrolled.push([node, node.scrollTop]);
    body.replaceChildren();
    if (page === 'settings') renderSettings(); else renderChat();
    // Keep folds open across refreshes so a check-up never snaps the notebook shut.
    body.querySelectorAll('details').forEach((d, i) => { if (openDetails[i]) d.open = true; });
    for (const [node, top] of scrolled) node.scrollTop = top;
    drawn = page + JSON.stringify(snapshot); pendingDraw = false;
    updatePaceButton();
  }
  /** Background refreshes never redraw over something the player is in the middle of. */
  function busyHere(): boolean {
    if (page === 'settings') return true;
    const active = document.activeElement;
    return !!active && body.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName);
  }
  body.addEventListener('focusout', () => { setTimeout(() => { if (pendingDraw && !busyHere() && !editing) render(); }, 0); });

  // ----- Pace button above the input -----
  let mount: HTMLElement | null = null, paceButton: HTMLButtonElement | null = null;
  try { mount = ctx.ui.mount('chat_actions') as HTMLElement; } catch { mount = null; }
  if (mount) {
    paceButton = el('button', 'gm-pace-button'); paceButton.type = 'button'; paceButton.hidden = true;
    paceButton.addEventListener('click', () => void cyclePace());
    mount.append(paceButton);
    teardown.push(() => paceButton?.remove());
  }
  const extras = ctx.ui.registerInputBarAction({ id: 'grimoire-pace', label: 'Story pace', subtitle: 'Grimoire · change the pace', iconSvg: PACE_ICON, enabled: false });
  teardown.push(extras.onClick(() => void cyclePace()), () => extras.destroy());
  async function cyclePace() {
    const view = snapshot?.chat;
    if (!view?.hasNotebook || !view.enabled) { tab.activate(); return; }
    try { await act('pace', { chatId: view.chatId, pace: nextPace(view.pace) }); } catch (error) { notify(error instanceof Error ? error.message : String(error), 'error'); }
  }
  function updatePaceButton() {
    const view = snapshot?.chat, active = !!view?.hasNotebook && view.enabled;
    if (paceButton) {
      paceButton.hidden = !active;
      if (active) { paceButton.innerHTML = PACE_ICON; paceButton.append(document.createTextNode(PACE_LABELS[view!.pace].name)); paceButton.title = `Story pace: ${PACE_LABELS[view!.pace].name}. ${PACE_LABELS[view!.pace].help} Click to change.`; paceButton.setAttribute('aria-label', `Story pace: ${PACE_LABELS[view!.pace].name}. Click to change.`); }
    }
    extras.setLabel(active ? `Story pace: ${PACE_LABELS[view!.pace].name}` : 'Story pace');
    extras.setSubtitle(active ? `Grimoire · tap for ${PACE_LABELS[nextPace(view!.pace)].name}` : 'Grimoire is off in this chat');
    extras.setEnabled(active);
  }

  /** forced: after the player did something, or switched chats. Otherwise it is a background check for news. */
  async function refresh(forced = false): Promise<void> {
    if (destroyed) return;
    if (refreshing) { again = true; againForced ||= forced; return refreshing; }
    refreshing = (async () => {
      try {
        snapshot = await rpc.request<Snapshot>('snapshot', { chatId: chatId() });
        const running = snapshot.chat?.job?.status === 'running';
        if (running && !polling) polling = setInterval(() => void refresh(), 2500);
        if (!running && polling) { clearInterval(polling); polling = undefined; }
        tab.setBadge(running ? '…' : null);
        const changed = page + JSON.stringify(snapshot) !== drawn;
        if (editing || (!forced && (!changed || busyHere()))) { pendingDraw ||= changed; updatePaceButton(); }
        else render();
      } catch (error) { notify(error instanceof Error ? error.message : String(error), 'error'); }
      finally { refreshing = null; if (again && !destroyed) { const f = againForced; again = false; againForced = false; void refresh(f); } }
    })();
    return refreshing;
  }
  teardown.push(tab.onActivate(() => void refresh()), ctx.events.on('CHAT_CHANGED', () => { editing = false; void refresh(true); }), ctx.events.on('CHAT_SWITCHED', () => { editing = false; void refresh(true); }));
  render(); ctx.ready(); void refresh(true);
  return () => { if (destroyed) return; destroyed = true; if (polling) clearInterval(polling); rpc.destroy(); for (const fn of teardown.reverse()) fn(); app.remove(); tab.destroy(); };
}
