import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { styles } from './styles';
import { markStories } from './badges';
import { describeDuration } from './clock';
import type { Notebook, Pace } from './notebook';
import type { TomeTab, TomeView } from './tome';
import { CHAPTER_DONE, CHAPTER_WORKING, NO_MYSTERY, VERSION, type ChatView, type Settings, type Snapshot, type StoryListing } from './types';

const CORNER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 20V6a4 4 0 0 1 4-4h14"/><path d="M6 14V8a2 2 0 0 1 2-2h6"/><circle cx="6" cy="6" r="1.4" fill="currentColor"/></svg>';

/** A crystal ball: Grimoire sees where the story is going. Picked to stand apart from the book and notebook icons other extensions use. */
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="7"/><path d="M8.5 7.5a4 4 0 0 1 3-1.8"/><path d="M7 20h10"/><path d="M8.5 16.5 7.5 20M15.5 16.5l1 3.5"/><path d="M14.5 9.2l.5-1.4.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5z" fill="currentColor" stroke-width="0.8"/></svg>';
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
export function createRpc(ctx: Rpc, onChanged: () => void, defaultTimeoutMs = 45_000) {
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
    request<T>(action: string, input?: unknown, timeoutMs = defaultTimeoutMs): Promise<T> {
      if (closed) return Promise.reject(new Error('Grimoire has closed. Reopen it and try again.'));
      const id = `gm-${prefix}-${++sequence}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Grimoire is busy and hasn’t answered yet. If the notebook is updating, give it a few minutes; what you asked for may already be under way.')); }, timeoutMs);
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
const elapsed = (from: number) => { const s = Math.max(0, Math.round((Date.now() - from) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ago = (time: number) => { const s = Math.max(0, (Date.now() - time) / 1000), d = Math.round(s / 86400); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${d} ${d === 1 ? 'day' : 'days'} ago`; };
const STATUS_WORDS = { verified: 'Read from your preset', waiting: 'Waiting for a reply to check', unavailable: 'Not found, Grimoire keeps this' } as const;
const FIELD_WORDS: Record<string, string> = { datetime: 'Date and time', date: 'Date', time: 'Time', location: 'Place', present: 'Who is here' };

export function setup(ctx: SpindleFrontendContext) {
  let destroyed = false, snapshot: Snapshot | null = null, page: 'chat' | 'settings' = 'chat', editing = false, confirmDelete = false;
  /** What you are writing to Grimoire, kept across redraws. */
  let draft = '', draftKeep = false, draftChat = '';
  let refreshing: Promise<void> | null = null, again = false, againForced = false, polling: ReturnType<typeof setInterval> | undefined;
  /** What the panel last drew, so a refresh that changes nothing draws nothing. */
  let drawn = '', pendingDraw = false, drawnPage: 'chat' | 'settings' = 'chat';
  const tab = ctx.ui.registerDrawerTab({ id: 'grimoire', title: 'Grimoire', shortName: 'Grimoire', description: 'The story behind your chat: where it is going, why, and how fast.', keywords: ['story', 'notebook', 'plot', 'pace', 'pacing'], iconSvg: ICON });
  const teardown: Array<() => void> = [ctx.dom.addStyle(styles)];
  const app = el('div', 'gm-app'); tab.root.append(app);
  const rpc = createRpc(ctx, () => { void refresh(); });
  const status = el('p', 'gm-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const notify = (text: string, kind: 'info' | 'error' = 'info') => { if (!destroyed) { status.textContent = text; status.dataset.kind = kind; } };
  const header = el('header', 'gm-header'), mark = el('span', 'gm-mark'); mark.innerHTML = ICON; mark.setAttribute('aria-hidden', 'true');
  header.append(mark, el('h1', '', 'Grimoire'), el('span', 'gm-spacer'));
  const tabs = el('div', 'gm-tabs'); tabs.setAttribute('role', 'tablist');
  const tabButtons = (['chat', 'settings'] as const).map(key => { const b = el('button', 'gm-tab', key === 'chat' ? 'This chat' : 'Settings'); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { page = key; render(); }); tabs.append(b); return [key, b] as const; });
  const body = el('div', 'gm-panel'), footer = el('footer', 'gm-footer', `Grimoire ${VERSION}`);
  header.append(tabs);
  app.append(header, status, body, footer);

  function button(label: string, action: () => unknown | Promise<unknown>, kind: '' | 'primary' | 'danger' = '') {
    const b = el('button', `gm-button${kind ? ` gm-${kind}` : ''}`, label); b.type = 'button';
    b.addEventListener('click', () => { void (async () => { b.disabled = true; try { await action(); } catch (error) { notify(error instanceof Error ? error.message : String(error), 'error'); } finally { if (!destroyed) b.disabled = false; } })(); });
    return b;
  }
  let fieldCount = 0;
  /** Explanations the player opened, kept open across redraws. */
  const openTips = new Set<string>();
  /**
   * A quiet ⓘ that opens a plain explanation in place. Tap or click, so it works on a phone, where hover tooltips
   * don't. Returns the button and the explanation; put the explanation where it should open.
   */
  function tip(key: string, text: string) {
    const b = el('button', 'gm-tip', 'i'), more = el('p', 'gm-tip-text', text);
    b.type = 'button'; b.setAttribute('aria-label', 'What is this?'); b.title = 'What is this?';
    const sync = () => { const on = openTips.has(key); more.hidden = !on; b.setAttribute('aria-expanded', String(on)); };
    b.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (openTips.has(key)) openTips.delete(key); else openTips.add(key); sync(); });
    sync();
    return { button: b, text: more };
  }
  /** A labelled control: a short line under it that is always shown, and, behind ⓘ, the longer explanation. */
  function labeled(label: string, control: HTMLElement, hint?: string, more?: string) {
    const wrap = el('div', 'gm-field'), caption = el('label', 'gm-label', label), id = `gm-${++fieldCount}`;
    control.id = id; caption.htmlFor = id;
    if (more) { const t = tip(`field:${label}`, more), row = el('div', 'gm-row'); row.style.gap = '0'; row.append(caption, t.button); wrap.append(row, t.text, control); }
    else wrap.append(caption, control);
    if (hint) wrap.append(el('p', 'gm-hint', hint));
    return wrap;
  }
  /** A heading with an optional ⓘ beside it. */
  function heading(tag: 'h2' | 'h3' | 'h4', text: string, more?: string) {
    const box = el('div', 'gm-section-head'), row = el('div', 'gm-row'); row.style.gap = '0';
    row.append(el(tag, '', text)); box.append(row);
    if (more) { const t = tip(`head:${text}`, more); row.append(t.button); box.append(t.text); }
    return box;
  }
  function select(options: Array<[string, string]>, value: string) {
    const s = el('select'); for (const [v, l] of options) { const o = el('option', '', l); o.value = v; s.append(o); } s.value = value; return s;
  }
  /** A section that stays closed until opened: a title, a few words on what is inside, and a chevron. */
  function details(title: string, sub = '', open = false) {
    const d = el('details', 'gm-details'), s = el('summary'), words = el('span', 'gm-sum-words'), inner = el('div', 'gm-stack');
    words.append(el('span', 'gm-sum-title', title)); if (sub) words.append(el('span', 'gm-sum-sub', sub));
    s.append(words); d.append(s, inner); d.open = open; return { root: d, body: inner };
  }
  const chatId = () => ctx.getActiveChat().chatId ?? null;
  async function act<T>(action: string, input: Record<string, unknown> = {}): Promise<T> {
    const result = await rpc.request<T>(action, input); await refresh(true); return result;
  }

  const GOON_HINT = 'The intimate scenes are the main story, and the plot is there to lead to the next one. Grimoire plans storylines around who wants whom, builds the heat between scenes, and counts those scenes as the story moving rather than a pause in it.';
  const PLANNER_CHOICES: Array<[string, string]> = [['grimoire', 'Grimoire'], ['preset', 'My preset (Grimoire keeps people and memory)']];
const SIZE_CHOICES: Array<[string, string]> = [['auto', 'Let it grow naturally'], ['wide', 'A big world: new places and people often'], ['close', 'Keep it close: a few places and people']];
  const SHAPE_CHOICES: Array<[string, string]> = [['auto', 'Let Grimoire choose'], ['conflict', 'Conflict: a problem that builds to a climax'], ['kishotenketsu', 'Kishōtenketsu: people and discovery, with a turn instead of a fight']];
  // ----- This chat -----
  function renderStart(view: ChatView) {
    const card = el('section', 'gm-card gm-stack');
    card.append(el('h2', '', 'Start a story notebook'), el('p', 'gm-small', 'Grimoire reads this chat’s card, your persona, the card’s and the chat’s lorebooks, and anything already said. It writes a private plan for the story: what is really going on, what people want, and the threads that will move over time. You won’t see it unless you open it.'));
    const tone = select([['light', 'Light'], ['balanced', 'Balanced'], ['dark', 'Dark']], view.preferences.tone);
    const twist = el('input'); twist.type = 'checkbox'; twist.checked = view.preferences.twist; twist.style.width = 'auto';
    const twistRow = el('label', 'gm-row gm-small'); twistRow.append(twist, document.createTextNode('A twist is allowed, if one fits'));
    const grid = el('div', 'gm-stack'); grid.append(labeled('Tone', tone, 'The story keeps going as long as you play: when its threads wrap up, a check-up starts the next part from what happened.'));
    const shape = select(SHAPE_CHOICES, view.preferences.shape ?? 'auto');
    const lock = el('input'); lock.type = 'checkbox'; lock.checked = !!view.preferences.lockShape; lock.style.width = 'auto';
    const lockRow = el('label', 'gm-row gm-small'); lockRow.append(lock, document.createTextNode('Keep this shape for the whole chat'));
    const syncLock = () => { lock.disabled = shape.value === 'auto'; if (lock.disabled) lock.checked = false; };
    shape.addEventListener('change', syncLock); syncLock();
    grid.append(labeled('How the story is built', shape, 'Grimoire can switch shapes between parts of the story as it goes, unless you keep one.'), lockRow);
    const size = select(SIZE_CHOICES, view.preferences.size ?? 'auto');
    grid.append(labeled('How big the world gets', size, 'Grow naturally: new people and places now and then, and people you’ve met come back. A big world: more of both, more often. Keep it close: the story stays with the places and people it has.'));
    const planner = select(PLANNER_CHOICES, view.preferences.planner ?? 'grimoire');
    grid.append(labeled('Who plans the story', planner, 'Grimoire: it plans where the story goes and steers the narrator there. Your preset: for presets that plan the story themselves (their own arc, foreshadowing, off-screen events). Grimoire then leaves the plot alone and keeps the people true and the long memory: voices, who’s here, what came out, what you’ve told people.'));
    const ideas = el('textarea', 'gm-talk-input'); ideas.rows = 4; ideas.maxLength = 3000; ideas.placeholder = 'Like “a slow-burn romance, trouble with old friends, a trip that goes sideways”, or someone you’d like to meet';
    const keepIdeas = el('input'); keepIdeas.type = 'checkbox'; keepIdeas.style.width = 'auto';
    const keepRow = el('label', 'gm-row gm-small'); keepRow.append(keepIdeas, document.createTextNode('Keep these as lasting notes'));
    grid.append(labeled('Anything you’d like in this story? (optional)', ideas, 'Grimoire builds the story around your ideas and paces them in over time. It won’t tell you how. Describe someone you’d like to meet and they keep your words.'), keepRow);
    const mystery = el('input'); mystery.type = 'checkbox'; mystery.checked = !!view.preferences.mystery; mystery.style.width = 'auto';
    const mysteryRow = el('label', 'gm-row gm-small'); mysteryRow.append(mystery, document.createTextNode('Make it a mystery I can solve'));
    grid.append(mysteryRow, el('p', 'gm-hint', 'Grimoire decides the answer now and never changes it. The narrator is not told, so it can’t give it away or agree with a wrong guess. You can also add one later.'));
    const goon = el('input'); goon.type = 'checkbox'; goon.checked = !!view.preferences.goon; goon.style.width = 'auto';
    const goonRow = el('label', 'gm-row gm-small'); goonRow.append(goon, document.createTextNode('Goon Mode'));
    grid.append(goonRow, el('p', 'gm-hint', GOON_HINT));
    const noConnection = !snapshot?.settings.connectionId;
    const parts = view.earlierParts ?? 0;
    const write = button('Write the notebook', async () => {
      await act('create', { chatId: view.chatId, preferences: { tone: tone.value, twist: twist.checked, shape: shape.value, lockShape: lock.checked, size: size.value, mystery: mystery.checked && planner.value !== 'preset', planner: planner.value, goon: goon.checked }, ideas: ideas.value.trim(), keepIdeas: keepIdeas.checked });
      notify(parts ? `Reading the chat, then writing the notebook. This uses ${parts + 1} model requests and can take a few minutes.` : 'Writing the notebook. This uses one model request and can take several minutes.');
    }, 'primary');
    write.classList.add('gm-wide'); write.disabled = noConnection || view.job?.status === 'running';
    card.append(grid, twistRow);
    if (parts) card.append(el('p', 'gm-hint', `This is a long chat. Grimoire reads it from the beginning first, in ${parts} ${parts === 1 ? 'part' : 'parts'} (one model request each), so the notebook knows the whole story so far. Then one more request writes the notebook.`));
    card.append(write);
    if (noConnection) card.append(el('p', 'gm-notice', 'Choose a model connection in Settings first.'), button('Open settings', () => { page = 'settings'; render(); }));
    return card;
  }
  /** A running clock next to work in progress, so you can see it is still going. */
  function since(startedAt: number) { const t = el('span', 'gm-since'); t.dataset.gmSince = String(startedAt); t.textContent = elapsed(startedAt); return t; }
  function renderJob(view: ChatView) {
    if (view.job?.status === 'complete' && view.job.label === NO_MYSTERY) return el('p', 'gm-notice', 'The notebook is ready, but the model couldn’t write a solid mystery for it, so this story starts without one. You can add one under Mystery.');
    if (!view.job || view.job.status === 'complete') return null;
    // Talking shows its progress in the conversation instead.
    if (view.job.status === 'running' && view.job.kind === 'talk') return null;
    const box = el('div', view.job.status === 'failed' ? 'gm-notice' : 'gm-card gm-small gm-row gm-spread');
    if (view.job.status === 'running') {
      const words = el('span'); words.append(document.createTextNode(`${view.job.label}… `), since(view.job.startedAt));
      // Which model is at work, so it's clear whether the story planner or the record keeper took this one.
      const running = view.traces?.find(t => t.status === 'running'), model = running?.waiting?.model ?? running?.requests.at(-1)?.model;
      if (model) words.append(el('span', 'gm-meta', ` · ${model}`));
      box.append(words, button('Stop', async () => { await act('cancel', { chatId: view.chatId }); notify('Stopped. Nothing was changed.'); }));
    } else box.textContent = `${view.job.label}. ${view.job.error ?? ''}`;
    return box;
  }
  function renderSkipOffer(view: ChatView) {
    const card = el('section', 'gm-card gm-stack gm-skip');
    card.append(el('h3', '', 'This scene has gone quiet'), el('p', 'gm-hint', 'Skipping ahead is up to you. The next reply opens with the time that passed.'));
    const choices = el('div', 'gm-chips');
    for (const option of view.skipOffer!.options) choices.append(button(option.label, async () => {
      await act('skip', { chatId: view.chatId, amount: option.hours, unit: 'hours' });
      notify(`Skipped about ${describeDuration(option.hours)}. The narrator will open with that gap.`);
    }));
    choices.append(button('Not now', async () => { await act('dismiss-skip', { chatId: view.chatId }); }));
    card.append(choices);
    return card;
  }
  /**
   * The story as it stands, at a glance and with no spoilers: where you are, where you left off, what's in front of
   * you, who's here, what came back from earlier, and what has happened. The chronicle under a reply shows one of these
   * at a time; this shows them together. It reads only what the chronicle reads, so it can't give anything away.
   */
  function renderGlance(view: ChatView) {
    const card = el('section', 'gm-card gm-glance'), tome = view.tome;
    card.append(heading('h4', 'At a glance', 'Your story as it stands, with no spoilers: only what has already happened in the chat, the people you can see, and what you already know. The plans themselves stay in The notebook at the bottom.'));
    const place = view.checks.find(c => c.name === 'location' && c.value)?.value ?? '';
    const where = el('div', 'gm-glance-where');
    where.append(el('span', 'gm-glance-place', place || view.name || 'This story'));
    if (view.clockText) where.append(el('span', 'gm-glance-time', `${view.clockText} · ${PACE_LABELS[view.pace].name} pace`));
    card.append(where);
    if (view.recap) card.append(el('p', 'gm-glance-recap', view.recap));
    if (!tome) { if (!view.recap) card.append(el('p', 'gm-glance-empty', 'Play a reply and this fills in.')); return card; }
    const block = (title: string, about: string, items: Array<{ badge: string; label: string; detail: string; highlight?: boolean }>, empty: string) => {
      const b = el('div', 'gm-glance-block');
      b.append(heading('h4', title, about));
      if (!items.length) b.append(el('p', 'gm-glance-empty', empty));
      for (const item of items) {
        const row = el('div', 'gm-glance-item'), words = el('span', 'gm-glance-text');
        if (item.highlight) row.dataset.hot = 'true';
        if (item.label) words.append(el('span', 'gm-glance-label', item.label));
        if (item.detail) words.append(document.createTextNode(item.detail));
        row.append(el('span', 'gm-glance-badge', item.badge), words);
        b.append(row);
      }
      return b;
    };
    const tab = (id: TomeTab['id']) => tome.tabs.find(t => t.id === id);
    // What's in front of you right now.
    if (tome.compass && tome.compass.hookCount) {
      const front = el('div', 'gm-glance-block');
      front.append(heading('h4', `In front of you · ${tome.compass.hookCount} waiting on your move`, 'Things the latest reply left for you to pick up: someone waiting on an answer, an offer, something in reach. Open Read the Room under the reply for a plain retelling and ideas for what to do.'));
      front.append(el('p', 'gm-small', tome.compass.whisperLine));
      card.append(front);
    }
    const cast = tab('cast');
    if (cast) card.append(block('Who’s here', cast.about ?? '', cast.items, 'Nobody else is in the scene.'));
    const beats = tab('clue');
    if (beats) {
      const items = [{ badge: beats.isNew ? 'NEW' : 'LATEST', label: '', detail: beats.title, highlight: beats.isNew }, ...beats.items];
      const b = block(beats.short === 'Clue Found' ? 'Clues you’ve found' : 'What has happened', beats.about ?? '', beats.title && !/^No clues|^Storylines are in motion/.test(beats.title) ? items : beats.items, beats.short === 'Clue Found' ? 'No clues found yet. Look around, ask people.' : 'Nothing has played out yet.');
      if (beats.pips) b.append(el('p', 'gm-meta', `${beats.pips.found} of ${beats.pips.total} clues found`));
      card.append(b);
    }
    const because = tab('because');
    if (because) {
      const items = because.title && !/^Grimoire is watching/.test(because.title) ? [{ badge: because.isNew ? 'NOW' : 'EARLIER', label: because.title, detail: because.body, highlight: because.isNew }, ...because.items] : because.items;
      card.append(block('Because of what you did', because.about ?? 'Details from earlier that came back, things that came out in the open, and what people remember you said.', items, 'Nothing has come back yet. Small details you notice now can matter later.'));
    }
    const world = tab('world');
    if (world) {
      const pulse = el('div', 'gm-glance-pulse'), dot = el('i'); dot.style.background = tome.pulse.color; dot.style.color = tome.pulse.color;
      pulse.append(dot, document.createTextNode(`${world.title}${world.body ? `. ${world.body}` : ''}`));
      const b = el('div', 'gm-glance-block'); b.append(heading('h4', 'The story’s pulse', 'How the story feels right now (building, a big moment, the aftermath, quiet), and whether the world moved somewhere you weren’t. Grimoire paces what comes next by it.'), pulse);
      card.append(b);
    }
    return card;
  }
  /** Where the story stands: time, pace, and when Grimoire last updated. */
  function renderNow(view: ChatView, toggle: HTMLElement) {
    const card = el('section', 'gm-card gm-stack');
    // The chat, whether Grimoire is on, and the switch.
    const hero = el('div', 'gm-hero'), words = el('div');
    words.append(el('h2', '', view.name || 'This chat'), el('p', 'gm-hint', view.enabled ? 'Grimoire is guiding this story.' : 'Turned off. The narrator gets no notes from Grimoire.'));
    hero.append(words, toggle); card.append(hero);
    // Story time and pace, side by side.
    const s = view.sources;
    const source = !s ? '' : s.day === 'tracker' && s.hour === 'tracker' ? 'From your preset’s tracker' : s.day === 'tracker' || s.hour === 'tracker' ? `${s.day === 'tracker' ? 'Day' : 'Hour'} from your preset’s tracker, the rest kept by Grimoire` : 'Kept by Grimoire, updated at check-ups';
    const time = el('div', 'gm-stat');
    time.append(heading('h4', 'Story time', 'What time it is in the story. Grimoire uses it to keep things believable: a search party can’t arrive in five minutes, and a shop is shut at night.'), el('p', 'gm-clock', view.clockText || 'Not set yet'), el('p', 'gm-source', `${source}${s && s.hour !== 'unknown' && !s.exact ? ' · approximate' : ''}`));
    const group = el('div', 'gm-pace'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Story pace');
    for (const pace of ORDER) {
      const b = el('button', '', PACE_LABELS[pace].name); b.type = 'button'; b.setAttribute('aria-pressed', String(view.pace === pace));
      b.addEventListener('click', () => { void act('pace', { chatId: view.chatId, pace }).catch(error => notify(error.message, 'error')); });
      group.append(b);
    }
    const pace = el('div', 'gm-stat'); pace.append(heading('h4', 'Pace', 'Auto: Grimoire reads the story’s rhythm and picks. Quiet: no new trouble, so a scene can breathe. Fast: things happen sooner. The same button sits above the message box.'), group, el('p', 'gm-source', PACE_LABELS[view.pace].help));
    const stats = el('div', 'gm-stats'); stats.append(time, pace); card.append(stats);
    if (view.skipHours) card.append(el('p', 'gm-hint', `The narrator will be told that about ${describeDuration(view.skipHours)} have passed.`));
    card.append(renderChapter(view));
    // The last update, in one quiet line.
    const foot = el('div', 'gm-foot');
    foot.append(el('span', '', view.summary || 'No updates yet.'), el('span', '', `${view.repliesSinceCheck} ${view.repliesSinceCheck === 1 ? 'reply' : 'replies'} since the last update${view.updatedAt ? ` · saved ${ago(view.updatedAt)}` : ''}`));
    const quick = snapshot?.settings.quick.enabled ? view.quick : undefined;
    if (snapshot?.settings.quick.enabled && (!quick || quick.ok)) foot.append(el('span', quick ? 'gm-ok' : '', !quick ? 'Quick check is on. It runs after the next reply.' : `Quick check ran ${ago(quick.at)}.`));
    card.append(foot);
    if (quick && !quick.ok) card.append(el('p', 'gm-notice', `The last quick check didn’t run: ${quick.error}`));
    return card;
  }
  /** A new chapter: easy to find, and visibly at work while it's being written. */
  function renderChapter(view: ChatView) {
    const box = el('div', 'gm-stack');
    const job = view.job, offline = !snapshot?.settings.connectionId;
    if (job?.status === 'running' && job.label === CHAPTER_WORKING) {
      const live = el('div', 'gm-live'), words = el('span', 'gm-live-words');
      words.append(document.createTextNode('Writing the next chapter… '), since(job.startedAt));
      live.append(el('span', 'gm-pulse-dot'), words, button('Stop', async () => { await act('cancel', { chatId: view.chatId }); notify('Stopped. Nothing was changed.'); }));
      box.append(live, el('p', 'gm-hint', 'Grimoire is wrapping up what’s run its course and planning what comes next. This takes a minute or two.'));
      return box;
    }
    if (job?.status === 'complete' && job.label === CHAPTER_DONE && Date.now() - job.startedAt < 10 * 60_000) box.append(el('p', 'gm-done', 'A new chapter is set. It begins with the next reply.'));
    else if (view.spent) box.append(el('p', 'gm-notice', 'This part of the story has wrapped up. Start a new chapter to begin the next one.'));
    const start = button('Start a new chapter', async () => { await act('push', { chatId: view.chatId, kind: 'chapter' }); notify('Starting a new chapter. One model request.'); }, view.spent ? 'primary' : '');
    start.disabled = job?.status === 'running' || offline || !view.enabled;
    const row = el('div', 'gm-act'), about = el('div');
    about.append(heading('h4', 'Chapter', 'Ends this part of the story the way it has gone so far, and plans the next one from what happened. You won’t be told what’s coming. One request to the story planner.'), el('p', 'gm-source', 'Wraps up this part and starts the next, sometimes after a jump in time. No spoilers.'));
    row.append(about, start); box.append(row);
    return box;
  }
  const PUSHES: Array<[string, string]> = [['person', 'Someone makes a move'], ['secret', 'A secret starts to surface'], ['consequence', 'Something catches up with me'], ['surprise', 'Surprise me']];
  /** Your say as co-author: talk, pinned notes, and the buttons for a stalled story. */
  function renderSteer(view: ChatView) {
    const card = el('section', 'gm-card gm-stack gm-talk');
    if (draftChat !== view.chatId) { draft = ''; draftKeep = false; draftChat = view.chatId; }
    const busy = view.job?.status === 'running', offline = !snapshot?.settings.connectionId;
    card.append(heading('h4', 'Talk to Grimoire', 'Tell Grimoire what you’d like, like “less romance for now” or “I want a road trip”. The story planner changes its plans to fit, without telling you how. Tick “Keep this as a lasting note” for wishes that should always apply. You can undo a change until the next reply.'), el('p', 'gm-hint', 'Say what you’d like from the story, or ask for ideas. Grimoire changes its plans without telling you what they are.'));
    if (view.notes.length) {
      const notes = el('div', 'gm-stack gm-notes'); notes.append(el('p', 'gm-label', 'Your notes'));
      for (const note of view.notes) {
        const row = el('div', 'gm-note'); row.append(el('p', 'gm-small', note.text), button('Remove', async () => { await act('unpin', { chatId: view.chatId, noteId: note.id }); notify('Note removed.'); }));
        notes.append(row);
      }
      notes.append(el('p', 'gm-hint', 'Notes steer every check-up and every reply until you remove them.'));
      card.append(notes);
    }
    const lines = view.talk.slice(-6);
    if (lines.length) {
      const log = el('div', 'gm-talk-log');
      for (const line of lines) {
        const item = el('div', `gm-line gm-line-${line.from}`);
        item.append(el('p', 'gm-line-who', line.from === 'you' ? 'You' : 'Grimoire'), el('p', 'gm-small', line.text));
        if (line.from === 'you' && line.keep) item.append(el('p', 'gm-meta', 'Asked to keep as a note'));
        if (line.changes?.length) { const ul = el('ul', 'gm-changes'); for (const c of line.changes) ul.append(el('li', '', c)); item.append(ul); }
        else if (line.changes && !line.asked && line.from === 'grimoire' && !line.text.startsWith('Undone')) item.append(el('p', 'gm-meta', 'No plans changed.'));
        if (line.undone) item.append(el('p', 'gm-meta', 'Undone'));
        log.append(item);
      }
      // A new chapter shows its progress up top, by its button.
      const talking = busy && view.job?.kind === 'talk' && view.job.label !== CHAPTER_WORKING;
      if (talking) {
        const wait = el('div', 'gm-line gm-line-grimoire gm-waiting');
        const words = el('p', 'gm-small'); words.append(document.createTextNode(`${view.job!.label}… `), since(view.job!.startedAt));
        wait.append(el('p', 'gm-line-who', 'Grimoire'), words, el('p', 'gm-meta', 'Changing the plans can take a minute or two.'));
        log.append(wait);
      }
      const actions = el('div', 'gm-row gm-quiet');
      if (talking) actions.append(button('Stop', async () => { await act('cancel', { chatId: view.chatId }); notify('Stopped. Nothing was changed.'); }));
      if (view.canUndo) actions.append(button('Undo the last change', async () => { await act('undo-talk', { chatId: view.chatId }); notify('The plans are back the way they were.'); }));
      actions.append(button('Clear conversation', async () => { await act('clear-talk', { chatId: view.chatId }); }));
      card.append(log, actions);
    }
    const box = el('textarea', 'gm-talk-input'); box.rows = 3; box.maxLength = 1000; box.value = draft; box.placeholder = 'Like “This is moving too fast”, “I’d love a road trip someday”, or “Any ideas for Sam?”';
    box.setAttribute('aria-label', 'Message to Grimoire');
    box.addEventListener('input', () => { draft = box.value; });
    const keep = el('input'); keep.type = 'checkbox'; keep.checked = draftKeep; keep.style.width = 'auto';
    keep.addEventListener('change', () => { draftKeep = keep.checked; });
    const keepRow = el('label', 'gm-row gm-small'); keepRow.append(keep, document.createTextNode('Keep this as a lasting note'));
    const send = button('Send', async () => {
      const text = box.value.trim(); if (!text) { notify('Write something for Grimoire first.', 'error'); return; }
      await act('talk', { chatId: view.chatId, text, keep: keep.checked });
      draft = ''; draftKeep = false; render();
      notify('Grimoire is thinking. One model request.');
    }, 'primary');
    send.disabled = busy || offline;
    box.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !send.disabled) send.click(); });
    const sendRow = el('div', 'gm-row gm-spread'); sendRow.append(keepRow, send);
    card.append(box, sendRow);
    if (busy && view.job?.kind !== 'talk') card.append(el('p', 'gm-hint', 'Grimoire is updating the notebook. You can send once it’s done.'));
    // A stalled story: say so in the box above, or tap one of these.
    const stuck = el('div', 'gm-sub gm-stack');
    stuck.append(el('p', 'gm-label', 'Story feeling stuck?'), el('p', 'gm-hint', 'Type $grimoire anywhere in your next message and something happens in that very reply. Or tap one of these: it sets something already in your story in motion, starts small, and you won’t be told what it is.'));
    const chips = el('div', 'gm-chips');
    for (const [kind, label] of PUSHES) {
      const b = button(label, async () => { await act('push', { chatId: view.chatId, kind }); notify('Setting something in motion. One model request.'); });
      b.disabled = busy || offline; chips.append(b);
    }
    stuck.append(chips);
    card.append(stuck);
    return card;
  }
  /** Things you seldom need: a check-up on demand, a manual time skip, deleting the notebook. */
  function renderMore(view: ChatView) {
    const d = details('More', 'Check-ups, time skips, story shape and size, Goon Mode, delete');
    const kept = select([['off', 'No, let Grimoire choose'], ...SHAPE_CHOICES.slice(1)], view.preferences.lockShape ? view.preferences.shape : 'off');
    const keep = button('Save', async () => { await act('shape', { chatId: view.chatId, shape: kept.value === 'off' ? 'auto' : kept.value, lockShape: kept.value !== 'off' }); notify(kept.value === 'off' ? 'Grimoire will choose the shape of each part.' : 'Saved. Every part of the story will use this shape.'); });
    const size = select(SIZE_CHOICES, view.preferences.size ?? 'auto');
    size.addEventListener('change', async () => { await act('size', { chatId: view.chatId, size: size.value }); notify('Saved. Check-ups use it from now on.'); });
    const planner = select(PLANNER_CHOICES, view.preferences.planner ?? 'grimoire');
    planner.addEventListener('change', async () => {
      try { await act('planner', { chatId: view.chatId, planner: planner.value }); notify(planner.value === 'preset' ? 'Saved. Grimoire now leaves the plot to your preset, from the next reply.' : 'Saved. Grimoire plans the story again, from the next reply.'); }
      catch (error) { planner.value = view.preferences.planner ?? 'grimoire'; notify(error instanceof Error ? error.message : String(error)); }
    });
    const goon = el('input'); goon.type = 'checkbox'; goon.checked = !!view.preferences.goon; goon.style.width = 'auto';
    goon.addEventListener('change', async () => { await act('goon', { chatId: view.chatId, goon: goon.checked }); notify(goon.checked ? 'Goon Mode on. Check-ups plan by it from now on.' : 'Goon Mode off.'); });
    const goonRow = el('label', 'gm-row gm-small'); goonRow.append(goon, document.createTextNode('Goon Mode'));
    const amount = el('input'); amount.type = 'number'; amount.min = '1'; amount.max = '999'; amount.value = '1';
    const unit = select([['hours', 'hours'], ['days', 'days'], ['weeks', 'weeks']], 'days');
    const busy = view.job?.status === 'running';
    const check = button('Check now', async () => { await act('checkup', { chatId: view.chatId }); notify('Checking the story against the chat. One model request.'); });
    const skip = button('Skip time', async () => { const hours = await act<number>('skip', { chatId: view.chatId, amount: Number(amount.value), unit: unit.value }); notify(`Skipped about ${describeDuration(hours)}. The narrator will open with that gap.`); });
    check.disabled = busy || !view.enabled; skip.disabled = busy || !view.enabled;
    const skipRow = el('div', 'gm-grid'); skipRow.append(labeled('Skip ahead by', amount), labeled('Unit', unit));
    const remove = button(confirmDelete ? 'Tap again to delete this notebook' : 'Delete this notebook', async () => {
      if (!confirmDelete) { confirmDelete = true; render(); setTimeout(() => { confirmDelete = false; render(); }, 5000); return; }
      confirmDelete = false; await act('remove', { chatId: view.chatId }); notify('Notebook deleted for this chat.');
    }, 'danger');
    d.body.append(check, el('p', 'gm-hint', 'Reads the latest chat and updates the plan. Check-ups also run on their own when a scene changes, time jumps, or enough replies pass.'),
      el('div', 'gm-sub'), skipRow, skip, el('div', 'gm-sub'),
      labeled('Keep one story shape for this chat', kept, 'If this part of the story already has the other shape, the change starts with the next part.'), keep, el('div', 'gm-sub'),
      labeled('Who plans the story', planner, 'Grimoire: it plans where the story goes and steers the narrator there. Your preset: for presets that plan the story themselves (their own arc, foreshadowing, off-screen events). Grimoire then leaves the plot alone and keeps the people true and the long memory: voices, who’s here, what came out, what you’ve told people.'),
      labeled('How big the world gets', size, 'Grow naturally: new people and places now and then, and people you’ve met come back. A big world: more of both, more often. Keep it close: the story stays with the places and people it has.'), el('div', 'gm-sub'), goonRow, el('p', 'gm-hint', GOON_HINT), el('div', 'gm-sub'), remove);
    return d.root;
  }
  const QUICK_WORDS: Array<[RegExp, string]> = [[/^due_/, 'Planned development shown'], [/^reach_/, 'It could reach you here'], [/^moment_/, 'Possible moment happened'], [/^detail_mentioned$/, 'Breadcrumb mentioned'], [/^echo_heard$/, 'Echo heard'], [/^callback_/, 'Breadcrumb paid off'], [/^fits_/, 'Storyline still fits'], [/^truth_/, 'Secret came out'], [/^clue_/, 'Clue found'], [/^theory$/, 'You named an answer'], [/^story_shift$/, 'Change of direction'], [/^rushing$/, 'Rushing'], [/^intimate$/, 'Intimate scene'], [/^new_turn$/, 'Something new'], [/^new_problem$/, 'New problem'], [/^easy_fix$/, 'Solved too easily'], [/^voice_/, 'Back to themselves'], [/^self_/, 'Still themselves'], [/^push_/, '$grimoire move came in']];
  const RHYTHM_WORDS: Record<string, string> = { calm: 'calm', rising: 'building', peak: 'big moment', aftermath: 'aftermath', stalled: 'stalled' };
  const STAGE_WORDS: Record<string, string> = { setup: 'setup', rising: 'rising action', climax: 'climax', resolution: 'resolution', ki: 'introduction', sho: 'development', ten: 'the turn', ketsu: 'bringing it together' };
  const part = (title: string, about?: string) => { const s = el('section', 'gm-stack gm-part'); s.append(heading('h4', title, about)); return s; };
  function glancePart(view: ChatView) {
    const s = part('The plan in numbers', 'Counts from the notebook, so you can see it’s working without reading any of it: how many storylines are open, how many small details have been planted and paid off, how many people you’ve met.'), g = view.glance;
    if (!g) return s;
    const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
    const speeds = [g.threads.urgent && `${g.threads.urgent} urgent`, g.threads.steady && `${g.threads.steady} steady`, g.threads.slow && `${g.threads.slow} slow`].filter(Boolean).join(', ');
    const rows: Array<[string, string]> = [
      ['Story shape', `${g.shape === 'kishotenketsu' ? 'Kishōtenketsu' : 'Conflict'}, ${STAGE_WORDS[g.stage] ?? g.stage}`],
      ['Story threads', `${plural(g.threads.open, 'open thread')}${speeds ? ` (${speeds})` : ''}${g.threads.closed ? `, ${g.threads.closed} finished` : ''}`],
      ['Next development', g.dueNow ? `${plural(g.dueNow, 'development')} ready now` : g.nextInReplies === null ? 'Nothing planned yet' : `within about ${plural(g.nextInReplies, 'reply', 'replies')}, sooner if story time moves`],
      ['Breadcrumbs', `${g.seeds.planted} planted, ${g.seeds.waiting} waiting, ${g.seeds.paid} paid off${g.seeds.echo ? `, ${g.seeds.echo} still out in the world` : ''}`],
      ['Planned moments', `${g.moments.possible} possible (${g.moments.big} big)${g.moments.happened ? `, ${g.moments.happened} happened` : ''}`],
      ['People', `${g.people.total}, ${g.people.met} met so far`],
      ...(g.part ? [['This part of the story', `about ${g.part.elapsed} of roughly ${g.part.length} replies in`] as [string, string]] : []),
    ];
    const list = el('ul', 'gm-fields');
    for (const [label, value] of rows) { const li = el('li'); li.append(el('span', '', label), el('span', 'gm-dot', value)); list.append(li); }
    s.append(list);
    return s;
  }
  function quickPart(view: ChatView) {
    const s = part('Quick check answers', 'After each reply, the reply checker answers a few yes-or-no questions. These are its answers, as how sure it was (70% or more counts as yes). “Is the narrator listening” counts how often a planned step whose moment had come actually happened. If it’s low, your preset may be following its own plans instead.');
    const records = [...(view.quickLog ?? [])].reverse().slice(0, 12);
    if (!records.length) { s.append(el('p', 'gm-small', 'No quick checks yet.')); return s; }
    if (view.voices) s.append(el('p', 'gm-small', `Voice fixes: in ${view.voices.landed} of the last ${view.voices.asked} replies with someone who had been slipping, they sounded like themselves again.`));
    if (view.follow) s.append(el('p', 'gm-small', `Is the narrator listening? In ${view.follow.used} of the last ${view.follow.offered} replies where Grimoire asked for something to happen now, it happened.${view.follow.used * 4 < view.follow.offered ? ' That is low: this preset or writer may be ignoring Grimoire’s note.' : ''}`));
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    for (const r of records) {
      const item = el('div', 'gm-entry');
      const outcome = [r.marked ? `marked ${r.marked}` : '', r.shifted ? 'change of direction' : r.checkup ? 'asked for a check-up' : '', r.held ? `held back ${r.held}` : '', r.quiet ? 'intimate scene: nothing offered' : ''].filter(Boolean).join(' · ');
      item.append(el('p', 'gm-small', `Reply ${r.reply} · ${ago(r.at)}${r.ok ? '' : ` · didn’t run${r.error ? `: ${r.error.replace(/\.$/, '')}` : ''}`}${outcome ? ` · ${outcome}` : ''}`));
      const parts: string[] = [];
      const scene = r.answers.rhythm;
      if (scene && typeof scene === 'object') parts.push(`Scene: ${RHYTHM_WORDS[scene.choice] ?? scene.choice} (${pct(scene.confidence)})`);
      for (const [key, value] of Object.entries(r.answers)) {
        if (typeof value !== 'number') continue;
        const label = QUICK_WORDS.find(([re]) => re.test(key))?.[1] ?? key;
        const n = /_(\d+)$/.exec(key)?.[1];
        parts.push(`${label}${n ? ` ${n}` : ''}: ${pct(value)}`);
      }
      if (parts.length) item.append(el('p', 'gm-meta', parts.join(' · ')));
      s.append(item);
    }
    s.append(el('p', 'gm-hint', `How sure the decision model was about each question. Yes counts at ${pct(0.7)} or more.`));
    return s;
  }
  function trackerPart(view: ChatView) {
    const s = part('What Grimoire reads from your preset', 'If your preset writes a status block (time, place, who’s here), Grimoire reads it instead of guessing. These are the facts it found and where they come from.');
    if (!view.checks.length) { s.append(el('p', 'gm-small', 'No tracker was found in this chat, so Grimoire keeps the story time itself. If your preset adds a status block later, a check-up can learn to read it.')); return s; }
    const list = el('ul', 'gm-fields');
    for (const check of view.checks) { const li = el('li'); const state = el('span', 'gm-dot', STATUS_WORDS[check.status]); state.dataset.state = check.status; li.append(el('span', '', `${FIELD_WORDS[check.name] ?? check.name}${check.value ? `: ${check.value}` : ''}`), state); list.append(li); }
    s.append(list, el('p', 'gm-hint', 'Each fact has one owner. Anything read from your preset is never asked for twice.'));
    return s;
  }
  /** What the player enjoys: what Grimoire has worked out from how they play, and what they choose to tell it. Closed until opened. */
  /** The mystery, as the player may see it: the question and the clues they have found. Never the answer. */
  function renderMystery(view: ChatView) {
    const m = view.mystery, open = m?.status === 'open', begun = !!m && (!open || m.found.length > 0);
    const d = details('Mystery', open ? `${m!.found.length} ${m!.found.length === 1 ? 'clue' : 'clues'} found` : m ? 'Finished' : 'Add one to this story', open && begun);
    if (m) {
      d.body.append(
        el('h4', '', open ? 'The mystery' : m.status === 'solved' ? 'Solved. You worked it out.' : 'It came out before you named the answer.'),
        el('p', '', begun ? m.question : 'A mystery is waiting in this story. What it is about stays hidden until you come across its first sign in play.'),
      );
      d.body.append(el('h4', '', 'Clues you have found'));
      if (m.found.length) { const list = el('ul'); for (const clue of m.found) list.append(el('li', 'gm-small', clue)); d.body.append(list); }
      else d.body.append(el('p', 'gm-small', 'None yet. They turn up as you play: look around, ask people, pay attention.'));
      if (open) d.body.append(el('p', 'gm-hint', 'The answer was fixed when the mystery was written, and the narrator is not told it. When you think you know, say so in the story. A mystery stays until it ends.'));
      if (open && !snapshot?.settings.quick.enabled) d.body.append(el('p', 'gm-notice', 'The quick check is off, so clues and guesses are only counted at check-ups, a few replies late. Turn it on in Settings for a mystery.'));
    }
    if (!open) {
      const about = el('input'); about.type = 'text'; about.maxLength = 300; about.placeholder = 'For example: something goes missing at the Spire';
      const add = button(m ? 'Add another mystery' : 'Add a mystery', async () => { await act('mystery', { chatId: view.chatId, about: about.value.trim() }); notify('Writing a mystery. One model request; it can take a minute or two.'); }, 'primary');
      add.disabled = !snapshot?.settings.connectionId || view.job?.status === 'running';
      if (!m) d.body.append(el('p', 'gm-small', 'Grimoire hides a real puzzle in this story, built from what has already happened. It decides the answer once and keeps it from the narrator, so the answer can’t slip out or bend to a guess.'));
      d.body.append(labeled('What should it be about? (optional)', about, 'Leave it empty and Grimoire picks something that fits.'), add, el('p', 'gm-hint', 'Once added, a mystery can’t be turned off. It ends when you solve it, or when the truth comes out on its own.'));
    }
    return d.root;
  }
  function renderTaste(view: ChatView) {
    const d = details('What you enjoy', 'What Grimoire has noticed, and what you tell it');
    const learned = view.notebook?.taste ?? [];
    d.body.append(el('h4', '', 'What Grimoire has noticed'));
    if (learned.length) { const list = el('ul'); for (const line of learned) list.append(el('li', 'gm-small', line)); d.body.append(list); }
    else d.body.append(el('p', 'gm-small', 'Nothing yet. Grimoire works this out as you play.'));
    const box = el('textarea'); box.rows = 3; box.maxLength = 600; box.value = view.preferences.likes ?? ''; box.placeholder = 'For example: slow build, more banter, less fighting, more of Tara';
    box.addEventListener('change', async () => { await act('likes', { chatId: view.chatId, likes: box.value }); notify(box.value.trim() ? 'Saved. Grimoire plans by it from the next check-up.' : 'Cleared.'); });
    d.body.append(labeled('Tell Grimoire yourself (optional)', box, 'Leave it empty and Grimoire goes by what it notices. Anything you write here comes first.'));
    return d.root;
  }
  /** How Grimoire is doing, in shapes, counts, and numbers only. */
  function renderBehind(view: ChatView) {
    const d = details('Behind the scenes', 'How Grimoire is doing · no spoilers');
    d.body.append(glancePart(view));
    if (snapshot?.settings.quick.enabled || view.quickLog?.length) d.body.append(quickPart(view));
    d.body.append(trackerPart(view));
    if (view.memory) d.body.append(memoryPart(view.memory));
    if (view.codewords?.length) {
      const s = part('$grimoire', 'What came of the last few times you typed $grimoire: when Grimoire saw it, when the deep look started and finished, or why it wasn’t used. Never what it picked.');
      const list = el('ul', 'gm-fields');
      for (const c of [...view.codewords].reverse()) { const li = el('li'); li.append(el('span', '', ago(c.at)), el('span', 'gm-dot', c.what)); list.append(li); }
      s.append(list); d.body.append(s);
    }
    if (view.traces?.length) d.body.append(timingPart(view.traces));
    d.body.append(el('p', 'gm-hint', 'Only shapes, counts, and numbers: no names, no plans.'));
    return d.root;
  }
  /** How long Grimoire's model requests took, newest job first: to find out what makes a job slow. */
  function timingPart(traces: NonNullable<ChatView['traces']>) {
    const s = part('How long Grimoire took', 'Each recent job, how long it took, and which model did it. Tokens out (thinking included) are what costs the most. Useful when something feels slow or pricey.');
    const time = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
    const num = (n: number) => n.toLocaleString('en-US');
    const KIND: Record<string, string> = { create: 'Writing the notebook', checkup: 'Check-up', talk: 'Talk', look: 'Deep look ($grimoire)' };
    for (const t of [...traces].reverse().slice(0, 4)) {
      const head = el('p', 'gm-small');
      if (t.status === 'running') head.append(el('strong', '', KIND[t.kind] ?? t.kind), document.createTextNode(' · still going · '), since(t.startedAt));
      else head.append(el('strong', '', KIND[t.kind] ?? t.kind), document.createTextNode(` · ${time(t.ms)} · ${t.requests.length} ${t.requests.length === 1 ? 'request' : 'requests'}${t.status === 'failed' ? ' · didn’t finish' : ''} · ${ago(t.startedAt)}`));
      const list = el('ul', 'gm-fields');
      for (const r of t.requests) {
        const li = el('li');
        const bits = [time(r.ms), r.tokens?.thinking ? `${num(r.tokens.thinking)} thinking tokens` : '', r.tokens?.output !== undefined ? `${num(r.tokens.output)} tokens out` : r.chars ? `${num(r.chars)} characters out` : '', r.tokens?.input !== undefined ? `${num(r.tokens.input)} tokens in` : '', r.model ? r.model.split('/').at(-1)! : '', r.backup ? 'backup connection' : '', r.ok ? '' : `failed (${r.error ?? 'error'})`].filter(Boolean);
        li.append(el('span', '', r.step), el('span', 'gm-dot', bits.join(' · ')));
        list.append(li);
        if (r.sentBack) list.append(el('li', 'gm-meta', `↳ sent back for a second try: ${r.sentBack}`));
      }
      if (t.waiting) { const li = el('li'), wait = el('span', 'gm-dot'); wait.append(document.createTextNode('waiting for the model · '), since(t.waiting.since)); li.append(el('span', '', t.waiting.step), wait); list.append(li); }
      s.append(head, list);
    }
    return s;
  }
  /** How well Lumiverse's Memory Cortex is keeping up with this chat, in counts. */
  function memoryPart(m: NonNullable<ChatView['memory']>) {
    const s = part('Lumiverse memory', 'What Lumiverse’s Memory Cortex remembers about this chat, and whether Grimoire passed any of it to the narrator on the last reply.');
    const list = el('ul', 'gm-fields');
    const row = (label: string, value: string) => { const li = el('li'); li.append(el('span', '', label), el('span', 'gm-dot', value)); list.append(li); };
    row('People and places remembered', String(m.people));
    row('Relationships remembered', String(m.ties));
    row('Story summaries', String(m.summaries));
    const last = m.last;
    const words = !last ? 'Not used yet. It runs with the next reply.'
      : last.to === 'note' ? `${last.found} ${last.found === 1 ? 'memory' : 'memories'} added to the note, ${ago(last.at)}`
      : last.to === 'preset' ? `Your preset already includes them, so the note left them out (${ago(last.at)})`
      : last.to === 'none' ? `Nothing remembered fit the scene (${ago(last.at)})`
      : last.to === 'off' ? 'Off in Settings. Grimoire still reads it when it plans.'
      : `Lumiverse’s memory didn’t answer in time (${ago(last.at)})`;
    row('Last reply', words);
    s.append(list);
    if (!m.people && !m.ties) s.append(el('p', 'gm-hint', 'Nothing is remembered for this chat yet. Check that Memory Cortex is on in Lumiverse’s settings.'));
    return s;
  }
  function renderBook(notebook: Notebook, due: string[]) {
    const book = el('div', 'gm-book'), section = (title: string) => { const s = el('section'); s.append(el('h4', '', title)); book.append(s); return s; };
    const about = section('What it is about'); about.append(el('p', '', notebook.story.question));
    if (notebook.story.stakes) about.append(el('p', 'gm-meta', `At stake: ${notebook.story.stakes}`));
    if (notebook.story.direction) about.append(el('p', 'gm-meta', `Could end: ${notebook.story.direction}`));
    if (notebook.story.hiddenTruth.length || notebook.story.twist) { const s = section('What is really going on'), ul = el('ul'); for (const t of notebook.story.hiddenTruth) ul.append(el('li', '', t)); if (notebook.story.twist) ul.append(el('li', '', `Twist: ${notebook.story.twist}`)); s.append(ul); }
    if (notebook.story.cameOut?.length) { const s = section('What has come out'), ul = el('ul'); for (const r of notebook.story.cameOut) ul.append(el('li', '', `${r.text}${r.atReply !== undefined ? ` (reply ${r.atReply})` : ''}`)); s.append(ul); }
    if (notebook.mystery) {
      const m = notebook.mystery, s = section(`The mystery${m.status === 'open' ? '' : m.status === 'solved' ? ' (solved)' : ' (came out)'}`), who = (id: string) => notebook.people.find(p => p.id === id)?.name ?? id;
      s.append(el('p', '', m.question), el('p', '', `Answer: ${m.answer}`), ...(m.how ? [el('p', 'gm-meta', `How: ${m.how}`)] : []), ...(m.why ? [el('p', 'gm-meta', `Why: ${m.why}`)] : []), ...(m.ifUnsolved ? [el('p', 'gm-meta', `If never solved: ${m.ifUnsolved}`)] : []));
      for (const x of m.suspects) { const e = el('div', 'gm-entry'), name = el('p'); name.append(el('strong', '', who(x.person))); if (x.person === m.culprit) name.append(el('span', 'gm-chip', 'behind it')); e.append(name, el('p', 'gm-small', `Says: ${x.says}`), el('p', 'gm-meta', `Really: ${x.did}`)); s.append(e); }
      const clues = el('ul');
      for (const c of m.clues) { const li = el('li', 'gm-small', `${c.text} `); li.append(el('span', 'gm-chip', c.status === 'found' ? 'found' : 'hidden'), ...(c.points === 'false' ? [el('span', 'gm-chip', 'false trail')] : []), el('p', 'gm-meta', `Shows: ${c.means}${c.where ? ` · Found: ${c.where}` : ''}`)); clues.append(li); }
      s.append(clues);
      if (m.theories.length) { const ul = el('ul'); for (const t of m.theories) ul.append(el('li', 'gm-small', `Your guess (${t.verdict === 'right' ? 'right' : t.verdict === 'partly' ? 'part right' : 'not right'}): ${t.text}`)); s.append(ul); }
    }
    const STAGE_WORDS: Record<string, string> = { setup: 'Setup', rising: 'Rising action', climax: 'Climax', resolution: 'Resolution', ki: 'Introduction', sho: 'Development', ten: 'The turn', ketsu: 'Bringing it together' };
    const arc = section('Shape of this part');
    arc.append(el('p', '', `${notebook.arc.shape === 'kishotenketsu' ? 'Kishōtenketsu' : 'Conflict'}: ${STAGE_WORDS[notebook.arc.stage] ?? notebook.arc.stage}`));
    if (notebook.arc.turn) arc.append(el('p', 'gm-meta', `The turn: ${notebook.arc.turn}`));
    const people = section('People');
    for (const p of notebook.people) { const e = el('div', 'gm-entry'); const name = el('p'); name.append(el('strong', '', p.name), ...(p.role ? [document.createTextNode(`, ${p.role}`)] : [])); if (!p.met) name.append(el('span', 'gm-chip', 'not met')); if (p.status === 'gone') name.append(el('span', 'gm-chip', 'gone')); e.append(name, el('p', 'gm-small', `Wants ${p.wants}`), ...(p.doing ? [el('p', 'gm-meta', `Doing: ${p.doing}`)] : []), ...(p.voice ? [el('p', 'gm-meta', `Voice: ${p.voice}`)] : []), ...(p.drift ? [el('p', 'gm-meta', `Slipping: ${p.drift}`)] : []), ...(p.depth ? [el('p', 'gm-meta', `More than their role: ${p.depth}`)] : []), ...(p.own ? [el('p', 'gm-meta', `Your description: ${p.own}`)] : []), ...(p.sheet ? [el('p', 'gm-meta', `Sheet: ${p.sheet}`)] : [])); people.append(e); }
    const threads = section('Threads');
    for (const t of notebook.threads) {
      const e = el('div', 'gm-entry'), title = el('p'); title.append(el('strong', '', t.title), el('span', 'gm-chip', t.status === 'open' ? t.speed : t.status));
      if (t.id === notebook.arc.main) title.append(el('span', 'gm-chip', 'main storyline'));
      if (due.includes(t.id)) { const c = el('span', 'gm-chip', 'due'); c.dataset.tone = 'due'; title.append(c); }
      const steps = el('ol', 'gm-steps'); for (const step of t.steps) { const li = el('li', 'gm-small', step.text); li.dataset.status = step.status; if (step.status !== 'waiting') li.append(el('span', 'gm-chip', step.status)); else if (step.opening) li.append(el('span', 'gm-meta', ` · waits for: ${step.opening}`)); steps.append(li); }
      e.append(title, el('p', 'gm-small', t.why), steps, ...(t.stakes?.length ? [el('p', 'gm-meta', `Open questions: ${t.stakes.join(' ')}`)] : []), ...(t.alone ? [el('p', 'gm-meta', t.alone.landed ? `Left alone, it went ${({ good: 'well', mixed: 'somewhere in between', bad: 'badly' } as const)[t.alone.landed]}: ${t.alone[t.alone.landed]}` : `If left alone (${t.alone.lean === 'threat' ? 'leans bad' : 'leans mild'}): well: ${t.alone.good} · in between: ${t.alone.mixed} · badly: ${t.alone.bad}${t.involved ? ' (you took part, so this won’t be rolled)' : ''}`)] : t.ifIgnored ? [el('p', 'gm-meta', `If left alone: ${t.ifIgnored}`)] : []), ...(t.closedReason ? [el('p', 'gm-meta', `Closed${t.outcome ? ` (${({ won: 'went your way', lost: 'went against you', faded: 'faded out' } as const)[t.outcome]})` : ''}: ${t.closedReason}`)] : []), ...(t.scar ? [el('p', 'gm-meta', `Still felt: ${t.scar}`)] : []));
      threads.append(e);
    }
    if (notebook.summary) section('Latest note from the model').append(el('p', 'gm-small', notebook.summary));
    const beats = section('Possible moments'), ul = el('ul');
    for (const b of notebook.beats) { const li = el('li', 'gm-small', b.text); if (b.status !== 'possible') { const c = el('span', 'gm-chip', b.status); if (b.status === 'happened') c.dataset.tone = 'done'; li.append(c); } ul.append(li); }
    beats.append(ul);
    if (notebook.buildings?.length) {
      const s = section('Where things are'), list = el('ul');
      for (const b of notebook.buildings) {
        const li = el('li', 'gm-small', b.name);
        for (const f of b.floors) li.append(el('div', 'gm-meta', `${f.name}: ${f.rooms.map(r => r.name).join(', ')}`));
        list.append(li);
      }
      s.append(list);
    }
    if (notebook.covers?.length) {
      const s = section('Lies and cover stories'), list = el('ul');
      const name = (id: string) => id === 'player' ? 'You' : notebook.people.find(p => p.id === id)?.name ?? id;
      for (const c of notebook.covers) {
        const li = el('li', 'gm-small', `${name(c.by)} told ${c.told.map(name).join(', ') || 'someone'}: ${c.said}`);
        if (c.status !== 'holding') { const chip = el('span', 'gm-chip', c.status === 'strained' ? 'doubted' : 'came apart'); if (c.status === 'exposed') chip.dataset.tone = 'done'; li.append(chip); }
        if (c.hides) li.append(el('div', 'gm-meta', `Covers: ${c.hides}`));
        list.append(li);
      }
      s.append(list);
    }
    if (notebook.seeds.length) {
      const s = section('Breadcrumbs'), list = el('ul');
      for (const seed of notebook.seeds) { const li = el('li', 'gm-small', seed.detail); if (seed.status !== 'waiting') { const c = el('span', 'gm-chip', seed.status); if (seed.status === 'paid') c.dataset.tone = 'done'; li.append(c); } li.append(el('div', 'gm-meta', `Later: ${seed.payoff}`)); list.append(li); }
      s.append(list);
    }
    if (notebook.events.length) { const s = section('What has happened'), list = el('ul'); for (const ev of notebook.events) list.append(el('li', 'gm-small', ev)); s.append(list); }
    return book;
  }
  function renderSpoilers(view: ChatView) {
    const d = details('The notebook', 'The plan itself · spoilers inside');
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
    if (!view) {
      const empty = el('div', 'gm-empty'); empty.append(el('p', '', snapshot?.notice || 'Open a chat to use Grimoire.')); body.append(empty);
      if (stories.length) { const card = el('section', 'gm-card gm-stack'); card.append(el('h4', '', 'Your stories'), storyList('gm-story-list')); body.append(card); }
      return;
    }
    if (!view.supported) { body.append(el('p', 'gm-notice', view.reason)); return; }
    const job = renderJob(view);
    if (!view.hasNotebook) {
      if (job) body.append(job);
      body.append(renderStart(view));
      // No notebook yet, so no Behind the scenes: show the timing here, while it is written and after a try that failed.
      if (view.traces?.length) { const card = el('section', 'gm-card gm-stack'); card.append(timingPart(view.traces)); body.append(card); }
      return;
    }
    const toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = view.enabled; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', 'Use Grimoire in this chat');
    toggle.addEventListener('change', () => { void act('enable', { chatId: view.chatId, enabled: toggle.checked }).catch(error => { toggle.checked = !toggle.checked; notify(error.message, 'error'); }); });
    if (job) body.append(job);
    if (view.needsCheck && view.enabled && view.job?.status !== 'running') body.append(el('p', 'gm-notice', `${view.needsCheck} An update will run after the next reply, or choose Check now under More.`));
    else if (view.behind && view.enabled) body.append(el('p', 'gm-hint', 'You went back in the chat, so Grimoire is using its notebook from before that point. Nothing from the removed replies counts.'));
    if (view.reworking && view.enabled) body.append(el('p', 'gm-hint', 'The story changed direction. Grimoire is reworking its plans to fit, and holds older plans back meanwhile. Nothing it already set up is forgotten.'));
    body.append(renderNow(view, toggle));
    if (view.enabled) body.append(renderGlance(view));
    if (view.skipOffer && view.enabled) body.append(renderSkipOffer(view));
    body.append(renderSteer(view), ...(view.hasNotebook ? [...(view.preferences.planner === 'preset' && view.mystery?.status !== 'open' ? [] : [renderMystery(view)]), renderTaste(view)] : []), renderBehind(view), renderSpoilers(view), renderMore(view));
  }

  // ----- Settings -----
  /** The connection list as choices, with what the first choice means. */
  function connectionChoices(first: string): Array<[string, string]> {
    return [['', first], ...(snapshot?.connections ?? []).map(c => [c.id, `${c.name}${c.model ? ` · ${c.model}` : ''}`] as [string, string])];
  }
  /** Which model a helper ends up using, in a few words, so it is clear at a glance a week later. */
  function usesLine(connectionId: string, model: string, fallback: string) {
    const c = (snapshot?.connections ?? []).find(x => x.id === connectionId);
    return model.trim() ? `Uses: ${c?.name ?? fallback} · ${model.trim()}` : c ? `Uses: ${c.name}${c.model ? ` · ${c.model}` : ''}` : `Uses: ${fallback}`;
  }
  function renderSettings() {
    const settings: Settings = { ...(snapshot?.settings ?? { connectionId: '', backupId: '', maxOutputTokens: 16000, reasoningMode: 'inherit', checkupReasoning: 'low', checkupConnectionId: '', checkupModel: '', lookWait: 15, every: 8, quick: { enabled: false, connectionId: '', model: '' }, wait: 'medium', homeList: true, intimate: 'protect', memories: true }) };
    const status = el('p', 'gm-hint', 'Changes save on their own.');
    const text = (value: string, placeholder: string) => { const i = el('input'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.spellcheck = false; return i; };
    const MODEL_HINT = 'Leave empty to use the connection’s model';
    const MODEL_MORE = 'To use a different model on the same connection without making a new one, type its exact ID as the provider lists it (for example anthropic/claude-sonnet-5.5 on OpenRouter). Pick one with a version in its name rather than one ending in “latest”, so it doesn’t change without you knowing.';

    // Who does what: one row per helper, with how often it runs and which model it uses.
    const roles = el('section', 'gm-card gm-stack');
    roles.append(heading('h2', 'Who does what', 'Your chat’s own connection, picked in Lumiverse, always writes the story replies. These are Grimoire’s helpers. Each can use a different model: a strong one where judgment matters, cheap ones for the frequent small jobs.'),
      el('p', 'gm-hint', 'Your chat’s own connection writes the story replies. These are Grimoire’s helpers, from the one that matters most to the one you’ll rarely need.'), status);
    const list = el('div', 'gm-roles');
    const role = (icon: string, name: string, when: string, does: string, more: string, ...controls: HTMLElement[]) => {
      const box = el('div', 'gm-role'), head = el('div', 'gm-role-head'), ic = el('span', 'gm-role-icon', icon), words = el('div', 'gm-role-words'), title = el('div', 'gm-role-name');
      ic.setAttribute('aria-hidden', 'true');
      const t = tip(`role:${name}`, more);
      title.append(document.createTextNode(name), el('span', 'gm-when', when), t.button);
      words.append(title, el('p', 'gm-role-does', does));
      head.append(ic, words); box.append(head, t.text, ...controls); list.append(box);
      return box;
    };
    const connection = select(connectionChoices('Choose a connection'), settings.connectionId);
    const plannerUses = el('p', 'gm-uses');
    role('✦', 'Story planner', 'Now and then', 'Plans the story: writes the notebook, new chapters and mysteries, check-ups after big moments, and the $grimoire deep look.',
      'This is the helper that needs good judgment, so give it your best model. It runs when a notebook is written, a chapter starts, a mystery is added, you talk to Grimoire, you type $grimoire, after big moments (a secret coming out, the story changing direction), and for a full review every 5 check-ups.',
      labeled('Connection', connection), plannerUses);
    const checkupConnection = select(connectionChoices('Same as the story planner'), settings.checkupConnectionId ?? '');
    const checkupModel = text(settings.checkupModel ?? '', MODEL_HINT);
    const keeperUses = el('p', 'gm-uses');
    role('✎', 'Record keeper', 'Every few replies', 'Routine check-ups: writes down what happened so the notebook stays true to the chat. It only runs once something has happened.',
      'Most check-ups are this one, so it’s where most of Grimoire’s cost goes. It mostly keeps records, so a cheaper model does fine. You can pick another connection, or keep the same connection and type a cheaper model below. Big moments and the review every 5 check-ups still go to the story planner.',
      labeled('Connection', checkupConnection), labeled('Model (optional)', checkupModel, undefined, MODEL_MORE), keeperUses);
    const decisions = snapshot?.decisions ?? { available: false, reason: '', connections: [] };
    const quickRow = el('label', 'gm-switch'), quickOn = el('input'); quickOn.type = 'checkbox'; quickOn.checked = settings.quick.enabled; quickOn.setAttribute('role', 'switch');
    quickOn.setAttribute('aria-label', 'Quick check after each reply');
    quickRow.append(el('span', 'gm-small', 'Quick check after each reply'), quickOn);
    const fallback = decisions.connections.find(c => c.isDefault);
    const decision = select([['', fallback ? `Your default: ${fallback.name}${fallback.model ? ` · ${fallback.model}` : ''}` : 'Your default decision connection'], ...decisions.connections.map(c => [c.id, `${c.name}${c.model ? ` · ${c.model}` : ''}`] as [string, string])], settings.quick.connectionId);
    const decisionModel = text(settings.quick.model, MODEL_HINT);
    const checker = role('◎', 'Reply checker', 'Every reply', 'Reads each new reply and answers a few yes-or-no questions: did the planned moment happen, is now a good moment for the next one, did a secret come out.',
      'A tiny, cheap model, one small request per reply. A lot depends on it: things arriving at their moment instead of on a clock, clues and guesses in a mystery, keeping intimate scenes undisturbed, and check-ups only running when something happened. Leave it on unless you have a reason not to.',
      quickRow);
    checker.dataset.role = 'quick';
    if (!decisions.available) { quickOn.disabled = true; checker.append(el('p', 'gm-notice', decisions.reason || 'Decision models aren’t available.')); }
    else {
      if (!decisions.connections.length) checker.append(el('p', 'gm-notice', 'Add a decision connection in Lumiverse’s connection settings first (OpenRouter or TypeSafe).'));
      checker.append(labeled('Decision connection', decision), labeled('Model (optional)', decisionModel, undefined, MODEL_MORE));
    }
    const room = select(connectionChoices('Same as the story planner'), settings.roomConnectionId ?? '');
    const roomModel = text(settings.roomModel ?? '', MODEL_HINT);
    const roomUses = el('p', 'gm-uses');
    role('❖', 'Room reader', 'When you open it', 'When you open Read the Room under a reply, it retells that reply in plain words, with a few things you could do next.',
      'One small request each time you open it on a new reply, and none if you don’t. A fast, cheap model is plenty. It only sees what you can already see, so it can’t spoil anything.',
      labeled('Connection', room), labeled('Read the Room model', roomModel, undefined, MODEL_MORE), roomUses);
    const backup = select(connectionChoices('None'), settings.backupId ?? '');
    role('⛨', 'Backup', 'Only if needed', 'If a model refuses a request (some do, for some stories), Grimoire tries it here instead, so the work isn’t lost.',
      'Only used when the story planner or record keeper declines. A model that refused once may refuse again, so pick one from a different maker.',
      labeled('Connection', backup));
    roles.append(list);
    const refreshUses = () => {
      plannerUses.textContent = connection.value ? usesLine(connection.value, '', '') : 'Choose a connection: nothing can be planned without one.';
      keeperUses.textContent = usesLine(checkupConnection.value || connection.value, checkupModel.value, 'the story planner’s connection');
      roomUses.textContent = usesLine(room.value || connection.value, roomModel.value, 'the story planner’s connection');
    };
    refreshUses();

    // How the story moves.
    const moves = el('section', 'gm-card gm-stack');
    const wait = select([['short', 'A few replies (about 8)'], ['medium', 'Some replies (about 15)'], ['long', 'Many replies (about 30)']], settings.wait ?? 'medium');
    const every = el('input'); every.type = 'number'; every.min = '2'; every.max = '50'; every.value = String(settings.every);
    const lookWait = select([['10', '10 seconds'], ['15', '15 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes']], String(settings.lookWait ?? 15));
    moves.append(heading('h2', 'How the story moves'),
      labeled('Longest a story thread waits', wait, 'Shorter keeps things happening; longer gives scenes room.', 'Each step of a storyline waits for a good moment, like the right people being there. If that moment doesn’t come, it finds its own way in after about half this many replies: someone comes looking, or word reaches you. A whole storyline moves on after about this many replies at most. Urgent storylines wait less, slow ones longer, and big scenes aren’t interrupted for slow ones.'),
      labeled('Check-up after this many replies', every, 'How often the record keeper catches up, once something has happened.', 'With the reply checker on, a check-up waits until something has happened (a new scene, a step in a storyline, someone new) and then this many replies. A quiet stretch waits 15 replies. With the reply checker off, check-ups also run whenever the scene changes or time jumps.'),
      labeled('When you type $grimoire, wait up to', lookWait, 'Type $grimoire anywhere in your message when you’re stuck or bored, and the story planner picks what happens next.', 'The narrator never sees the word. The story planner looks at the story and picks one thing that grows out of what’s already there. Your message happens first; if it was only $grimoire, your character carries on with what they were doing. If the planner takes longer than this, that reply uses the notebook’s best ready step, and the planner’s idea is kept for a swipe. Grimoire tells Lumiverse to wait for it up to 2½ minutes, so any choice here works without changing Lumiverse’s own extension settings.'));

    // Scenes and memory.
    const scenes = el('section', 'gm-card gm-stack');
    const intimate = select([['protect', 'Keep the story out until the scene ends'], ['allow', 'Let the story carry on as usual']], settings.intimate ?? 'protect');
    const memRow = el('label', 'gm-row gm-small'), mem = el('input'); mem.type = 'checkbox'; mem.checked = settings.memories !== false; mem.style.width = 'auto';
    memRow.append(mem, document.createTextNode('Add Lumiverse’s memories to the note'));
    const memTip = tip('field:memories', 'Gives the narrator what Lumiverse’s Memory Cortex remembers about the scene, so any preset has it. Skipped on its own when your preset already includes memories. Grimoire also reads the memory when it plans, either way.');
    memRow.append(memTip.button);
    scenes.append(heading('h2', 'Scenes and memory'),
      labeled('During intimate scenes', intimate, 'Needs the reply checker.', 'Kept out: while one plays out, nothing planned interrupts it, and its replies don’t count toward moving storylines along, so nothing piles up for afterward. Carry on: the story keeps moving through them like any other scene, which suits a card where most scenes are intimate.'),
      memRow, memTip.text);

    // On screen.
    const screen = el('section', 'gm-card gm-stack');
    const cardRow = el('label', 'gm-row gm-small'), replyCard = el('input'); replyCard.type = 'checkbox'; replyCard.checked = settings.replyCard !== false; replyCard.style.width = 'auto';
    cardRow.append(replyCard, document.createTextNode('Show the story chronicle under the latest reply'));
    const homeRow = el('label', 'gm-row gm-small'), home = el('input'); home.type = 'checkbox'; home.checked = settings.homeList !== false; home.style.width = 'auto';
    homeRow.append(home, document.createTextNode('Mark my stories on the home page'));
    screen.append(heading('h2', 'On screen'), cardRow, el('p', 'gm-hint', 'A spoiler-free panel under the newest reply: who’s here, what came back from earlier, clues you found, and Read the Room.'), homeRow);

    // Cost and thinking, for later.
    const cost = details('Cost and thinking', 'How hard the helpers think, and how long they may answer');
    const tokens = select([['8000', '8,000'], ['16000', '16,000'], ['32000', '32,000'], ['64000', '64,000']], String(settings.maxOutputTokens));
    const reasoning = select([['inherit', 'Use the connection’s setting'], ['off', 'Off'], ['low', 'Low']], settings.reasoningMode);
    const checkupReasoning = select([['low', 'Low'], ['off', 'Off'], ['inherit', 'Same as the story planner']], settings.checkupReasoning ?? 'low');
    cost.body.append(el('p', 'gm-hint', 'Thinking makes answers better but costs more, and you pay for it even though you never see it. In Grimoire’s records, thinking was about two thirds of a check-up’s cost.'),
      labeled('How hard the story planner thinks', reasoning, 'Planning is where thinking pays off.'),
      labeled('How hard the record keeper thinks', checkupReasoning, 'Low is usually enough for keeping records, and costs much less.'),
      labeled('Longest answer (tokens)', tokens, 'Room for the answer, thinking included. Raise it if Grimoire says a model ran out of room.'));

    const save = async () => {
      // Saved without redrawing the page, so the next change isn't interrupted.
      refreshUses();
      try { await rpc.request('settings', { settings: { connectionId: connection.value, backupId: backup.value, every: Number(every.value), maxOutputTokens: Number(tokens.value), reasoningMode: reasoning.value, checkupReasoning: checkupReasoning.value, checkupConnectionId: checkupConnection.value, checkupModel: checkupModel.value.trim(), lookWait: Number(lookWait.value), wait: wait.value, homeList: home.checked, replyCard: replyCard.checked, roomConnectionId: room.value, roomModel: roomModel.value.trim(), intimate: intimate.value, memories: mem.checked, quick: { enabled: quickOn.checked, connectionId: decision.value, model: decisionModel.value } } }); }
      catch (error) { notify(error instanceof Error ? error.message : String(error), 'error'); return; }
      status.textContent = 'Saved.';
      void refresh();
    };
    for (const part of [roles, moves, scenes, screen, cost.root]) part.addEventListener('change', () => { void save(); });
    body.append(roles, moves, scenes, screen, cost.root);
  }

  function render() {
    if (destroyed) return;
    for (const [key, b] of tabButtons) { b.setAttribute('aria-selected', String(page === key)); }
    // Folds are matched by position, so only within the same tab: another tab's folds are different ones.
    const openDetails = drawnPage === page ? [...body.querySelectorAll('details')].map(d => d.open) : [];
    drawnPage = page;
    // Redrawing empties the panel for a moment, and the drawer would jump to the top. Put every scroll position back.
    const scrolled: Array<[Element, number]> = [];
    for (let node: Element | null = app; node; node = node.parentElement) if (node.scrollTop > 0) scrolled.push([node, node.scrollTop]);
    body.replaceChildren();
    // After an update, Lumiverse can keep running the old backend until the extension restarts. Say so plainly.
    const backend = snapshot?.version;
    footer.textContent = backend && backend !== VERSION ? `Grimoire ${VERSION} · the background part is still ${backend}` : `Grimoire ${VERSION}`;
    if (backend && backend !== VERSION) body.append(el('p', 'gm-notice', `Grimoire updated, but its background part is still running version ${backend}. Restart Lumiverse (or turn Grimoire off and on in Extensions) to finish the update.`));
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

  // ----- Your stories: chats with a notebook, on the home page and in the drawer -----
  let stories: StoryListing[] = [];
  function openChat(chatId: string) {
    const surfaces = (ctx as { host?: { surfaces?: { invoke(ref: { kind: string; id: string }, params?: Record<string, string>): unknown } } }).host?.surfaces;
    if (surfaces) { void Promise.resolve(surfaces.invoke({ kind: 'route', id: '/chat/:chatId' }, { chatId })).catch(error => notify(error instanceof Error ? error.message : String(error), 'error')); return; }
    // Older hosts: the app follows the address bar.
    history.pushState(null, '', `/chat/${encodeURIComponent(chatId)}`); window.dispatchEvent(new PopStateEvent('popstate'));
  }
  function storyList(className: string) {
    const list = el('div', className);
    for (const story of stories) {
      const item = el('button', 'gm-story'); item.type = 'button';
      item.append(el('span', 'gm-story-name', story.character || story.chatName || 'A chat'), el('span', 'gm-story-meta', `${story.chatName && story.character ? `${story.chatName} · ` : ''}played ${ago(story.playedAt)}${story.enabled ? '' : ' · Grimoire off'}`));
      item.title = `Open ${story.character || 'this chat'}`;
      item.addEventListener('click', () => openChat(story.chatId));
      list.append(item);
    }
    return list;
  }
  // On the home page, chats with a notebook get a small crystal ball on Lumiverse's own cards (no second list).
  let marking: ReturnType<typeof setTimeout> | null = null;
  function renderHome() {
    const on = !!snapshot && snapshot.settings.homeList !== false && !chatId();
    try { markStories(document.body, on ? stories : [], ICON); } catch { /* the home page changed shape: no marks */ }
  }
  if (typeof MutationObserver !== 'undefined') {
    // Cards load, scroll and get reused; mark again shortly after the page changes, and attach the Tome if a message bubble mounts late.
    const watcher = new MutationObserver(() => {
      if (marking || destroyed) return;
      if (!chatId() && stories.length) { marking = setTimeout(() => { marking = null; renderHome(); }, 200); return; }
      if (chatId() && snapshot?.chat?.tome && (!tomeHost || !tomeHost.isConnected)) { marking = setTimeout(() => { marking = null; syncReplyTome(); }, 120); }
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    teardown.push(() => { watcher.disconnect(); if (marking) clearTimeout(marking); try { markStories(document.body, [], ICON); } catch { /* nothing to clear */ } });
  }
  async function refreshStories() {
    if (destroyed || chatId()) { renderHome(); return; }
    try { stories = await rpc.request<StoryListing[]>('stories'); } catch { stories = []; }
    renderHome(); if (!snapshot?.chat) render();
  }

  // ----- Pace button above the input -----
  let mount: HTMLElement | null = null, paceButton: HTMLElement | null = null, skipButton: HTMLElement | null = null;
  try { mount = ctx.ui.mount('chat_actions') as HTMLElement; } catch { mount = null; }
  /**
   * The pills above the input are not <button>s: chat themes often force every
   * button in that bar into a fixed square icon, which squashes text. These
   * behave like buttons (focus, Enter, Space) without being styled as one.
   */
  const pill = (className: string, text: string, action: () => void) => {
    const node = el('span', className, text); node.setAttribute('role', 'button'); node.tabIndex = 0; node.hidden = true;
    node.addEventListener('click', action);
    node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); } });
    return node;
  };
  if (mount) {
    paceButton = pill('gm-pace-button', '', () => void cyclePace());
    skipButton = pill('gm-pace-button gm-skip-button', 'Skip ahead?', () => { page = 'chat'; render(); tab.activate(); });
    skipButton.title = 'This scene has gone quiet. Open Grimoire to skip ahead, or wave it off.';
    mount.append(paceButton, skipButton);
    teardown.push(() => paceButton?.remove(), () => skipButton?.remove());
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
    if (skipButton) skipButton.hidden = !(active && view!.skipOffer);
    extras.setLabel(active ? `Story pace: ${PACE_LABELS[view!.pace].name}` : 'Story pace');
    extras.setSubtitle(active ? `Grimoire · tap for ${PACE_LABELS[nextPace(view!.pace)].name}` : 'Grimoire is off in this chat');
    extras.setEnabled(active);
    syncReplyTome();
  }

  // ----- Under-Reply Chronicle ("Paged Relic Tome") -----
  let tomeHost: Element | null = null, tomeTargetId = '', tomeDrawnKey = '';
  const tomeUiState = new Map<string, { tab: TomeTab['id']; compassOpen: boolean; expanded: boolean }>();

  function clearReplyTome() {
    if (tomeHost) {
      try { ctx.dom.uninject?.(tomeHost); } catch { /* host already removed */ }
      try { tomeHost.remove(); } catch { /* ignore */ }
      tomeHost = null;
    }
    tomeTargetId = '';
    tomeDrawnKey = '';
  }
  teardown.push(clearReplyTome);

  function findBubble(messageId: string): Element | null {
    try {
      const direct = ctx.dom.findMessageElement?.(messageId);
      if (direct) return direct;
      const all = ctx.dom.listMessageElements?.() ?? [];
      const match = all.find(m => m.messageId === messageId);
      return match?.element ?? all.at(-1)?.element ?? null;
    } catch { return null; }
  }

  /** Plain retellings by chat, reply and its text, so a swipe gets a fresh one. */
  const rooms = new Map<string, { plain: string; moves: string[] } | { loading: true } | { error: string }>();
  function readRoom(chatId: string, messageId: string, key: string, redraw: () => void) {
    if (rooms.has(key)) return;
    rooms.set(key, { loading: true });
    // A model answering, maybe thinking first: wait as long as the backend lets it run.
    rpc.request<{ plain: string; moves: string[] }>('readRoom', { chatId, messageId }, 130_000)
      .then(reading => { rooms.set(key, reading); })
      .catch(error => { rooms.set(key, { error: error instanceof Error ? error.message : String(error) }); })
      .finally(() => {
        if (destroyed) return;
        // The retelling makes the reply taller: keep Read the Room where it is on screen.
        const clasp = tomeHost?.querySelector('.gm-tome-clasp') as HTMLElement | null;
        if (clasp) keepInPlace(clasp, '.gm-tome-clasp', redraw); else redraw();
      });
  }
  /**
   * Redraw without moving the page. Opening Read the Room or switching tabs changes the height of the latest reply,
   * and the chat then jumped to the bottom, so the player had to scroll back up to read what they had just opened.
   * The button that was pressed is kept where it was on screen, for long enough to outlast the chat's own scrolling.
   */
  function keepInPlace(pressed: HTMLElement, find: string, redraw: () => void) {
    // Lumiverse's chat follows the newest reply as it grows, which pulled the page to the bottom. Its own
    // disclosures (reasoning, long replies) say "the reader opened this" with this event, and the chat then holds
    // still for that reply. Grimoire's chronicle says the same.
    try { const Made = pressed.ownerDocument.defaultView?.CustomEvent ?? CustomEvent; pressed.dispatchEvent(new Made('lumiverse:collapsible-toggle-layout', { bubbles: true, composed: true })); } catch { /* nothing to tell */ }
    let scroller: HTMLElement | null = null, before = 0;
    try { scroller = scrollParent(pressed); before = pressed.getBoundingClientRect().top; } catch { /* nothing to measure: just redraw */ }
    redraw();
    if (!scroller) return;
    const hold = () => {
      try {
        const now = tomeHost?.querySelector(find) as HTMLElement | null;
        if (!now) return;
        const drift = now.getBoundingClientRect().top - before;
        if (Math.abs(drift) > 1) scroller!.scrollTop += drift;
      } catch { /* the reply was redrawn away */ }
    };
    hold();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { hold(); requestAnimationFrame(hold); });
    for (const ms of [60, 160, 320, 600]) setTimeout(hold, ms);
  }
  function scrollParent(node: HTMLElement): HTMLElement | null {
    for (let at = node.parentElement; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && at.scrollHeight > at.clientHeight) return at;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
  }

  function buildOpenTome(view: ChatView, tome: TomeView, ui: { tab: TomeTab['id']; compassOpen: boolean; expanded: boolean }, redraw: () => void): HTMLElement {
    const box = el('section', 'gm-tome');
    box.setAttribute('aria-label', 'Grimoire story chronicle');
    for (const pos of ['tl', 'tr', 'bl', 'br'] as const) {
      const c = el('span', `gm-tome-corner ${pos}`); c.innerHTML = CORNER_SVG; c.setAttribute('aria-hidden', 'true');
      box.append(c);
    }
    if (tome.chapter) {
      const ch = el('header', 'gm-tome-chapter');
      ch.append(el('div', 'gm-tome-chapter-kicker', tome.chapter.label), el('h3', 'gm-tome-chapter-title', tome.chapter.title));
      if (tome.chapter.recap) ch.append(el('p', 'gm-tome-chapter-recap', tome.chapter.recap));
      box.append(ch);
    }
    if (tome.compass) {
      const comp = el('div', 'gm-tome-compass');
      const clasp = el('button', 'gm-tome-clasp'); clasp.type = 'button';
      clasp.setAttribute('aria-expanded', String(ui.compassOpen));
      const left = el('div', 'gm-tome-clasp-left');
      left.append(el('span', 'gm-tome-compass-gem', '❖'));
      const words = el('div', 'gm-tome-clasp-words');
      words.append(
        el('div', 'gm-tome-clasp-kicker', `In Front of You · ${tome.compass.hookCount} waiting on your move`),
        el('div', 'gm-tome-clasp-sub', tome.compass.whisperLine),
      );
      left.append(words);
      const btn = el('span', 'gm-tome-clasp-btn', ui.compassOpen ? 'Fold ▴' : 'Read the Room ▾');
      clasp.append(left, btn);
      clasp.addEventListener('click', () => { ui.compassOpen = !ui.compassOpen; keepInPlace(clasp, '.gm-tome-clasp', redraw); });
      comp.append(clasp);
      if (ui.compassOpen) {
        const drawer = el('div', 'gm-tome-compass-drawer');
        const head = el('div', 'gm-tome-compass-head');
        head.append(el('span', '', 'The Moment in Plain Sight'), el('span', '', `Reply ${tome.reply}`));
        drawer.append(head);
        // The plain retelling is written on request: one small model call, kept for this reply.
        const roomKey = `${view.chatId}:${tome.messageId}:${tome.compass.gist}`, reading = rooms.get(roomKey);
        if (reading && 'plain' in reading) {
          drawer.append(el('p', 'gm-tome-gist', reading.plain));
          if (reading.moves.length) {
            drawer.append(el('div', 'gm-tome-foothold-title', 'What you could do'));
            const list = el('ul', 'gm-tome-moves');
            for (const move of reading.moves) list.append(el('li', '', move));
            drawer.append(list);
          }
        } else if (reading && 'error' in reading) {
          drawer.append(el('p', 'gm-tome-about', `Couldn’t read the scene this time: ${reading.error}`));
          const again = el('button', 'gm-tome-pill subtle', 'Try again'); again.type = 'button';
          again.addEventListener('click', () => { rooms.delete(roomKey); readRoom(view.chatId, tome.messageId, roomKey, redraw); redraw(); });
          drawer.append(again);
        } else {
          drawer.append(el('p', 'gm-tome-about', 'Reading the scene…'));
          readRoom(view.chatId, tome.messageId, roomKey, redraw);
        }
        comp.append(drawer);
      }
      box.append(comp);
    }

    const tabBar = el('div', 'gm-tome-tabs'); tabBar.setAttribute('role', 'tablist');
    for (const t of tome.tabs) {
      const b = el('button', 'gm-tome-tab'); b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(ui.tab === t.id));
      b.dataset.tabId = t.id;
      const words = el('span', 'gm-tome-tab-words');
      words.append(el('span', 'gm-tome-tab-short', t.short));
      b.append(el('span', 'gm-tome-tab-icon', t.icon), words);
      if (t.isNew) { const dot = el('span', 'gm-tome-tab-dot'); dot.title = 'New on this reply'; b.append(dot); }
      b.addEventListener('click', () => { ui.tab = t.id; keepInPlace(b, `.gm-tome-tab[data-tab-id="${t.id}"]`, redraw); });
      tabBar.append(b);
    }
    box.append(tabBar);

    const active = tome.tabs.find(t => t.id === ui.tab) ?? tome.tabs[0];
    if (active) {
      const card = el('div', 'gm-tome-card');
      const top = el('div', 'gm-tome-card-top'), head = el('div');
      head.append(el('div', 'gm-tome-kicker', active.kicker), el('h4', 'gm-tome-title', active.title));
      top.append(head);
      // How this part works, once, when asked: not read every reply.
      let about: HTMLElement | null = null;
      if (active.about) {
        const info = el('button', 'gm-tome-info', 'ⓘ'); info.type = 'button'; info.title = active.about; info.setAttribute('aria-label', 'What is this?');
        about = el('p', 'gm-tome-about', active.about); about.hidden = true;
        info.addEventListener('click', () => { about!.hidden = !about!.hidden; });
        head.querySelector('.gm-tome-kicker')!.append(info);
      }
      if (active.seal) {
        const seal = el('span', 'gm-tome-seal', '✦'); seal.title = 'Earned from your earlier move';
        top.append(seal);
      } else if (active.pips && active.pips.total > 0) {
        const pips = el('div', 'gm-tome-pips'); pips.title = `${active.pips.found} of ${active.pips.total} clues found`;
        for (let i = 0; i < active.pips.total; i++) pips.append(el('span', `gm-tome-pip${i < active.pips.found ? ' found' : ''}`));
        top.append(pips);
      }
      card.append(top);
      if (about) card.append(about);
      if (active.body) card.append(el('p', 'gm-tome-body', active.body));
      if (active.items.length) {
        const list = el('div', 'gm-tome-items');
        for (const item of active.items) {
          const row = el('div', `gm-tome-item${item.highlight ? ' highlight' : ''}`);
          const text = el('div', 'gm-tome-item-text');
          text.append(el('span', 'gm-tome-item-label', item.label), ...(item.detail ? [document.createTextNode(item.detail)] : []));
          row.append(el('span', 'gm-tome-badge', item.badge), text);
          list.append(row);
        }
        card.append(list);
      }
      // The tabs and card already say it all; the foot only folds the chronicle back up.
      if (tome.mode !== 'active') {
        const foot = el('div', 'gm-tome-foot');
        const foldBtn = el('button', 'gm-tome-pill subtle', 'Fold Chronicle ▴'); foldBtn.type = 'button';
        foldBtn.addEventListener('click', () => { ui.expanded = false; redraw(); });
        foot.append(foldBtn);
        card.append(foot);
      }
      box.append(card);
    }
    return box;
  }

  function syncReplyTome() {
    if (destroyed) return;
    const view = snapshot?.chat;
    const tome = view?.enabled && snapshot?.settings.replyCard !== false ? view.tome : null;
    if (!view || !tome || !ctx.dom.inject) { clearReplyTome(); return; }
    const bubble = findBubble(tome.messageId);
    if (!bubble) { clearReplyTome(); return; }

    const stateKey = `${view.chatId}:${tome.messageId}:${tome.reply}`;
    let ui = tomeUiState.get(stateKey);
    if (!ui) {
      ui = { tab: tome.defaultTab, compassOpen: false, expanded: false };
      tomeUiState.set(stateKey, ui);
    }
    const drawKey = `${stateKey}:${JSON.stringify({ tome, ui, skip: view.skipOffer })}`;
    if (tomeHost && tomeTargetId === tome.messageId && bubble.contains(tomeHost) && tomeDrawnKey === drawKey) return;

    if (!tomeHost || tomeTargetId !== tome.messageId || !bubble.contains(tomeHost)) {
      clearReplyTome();
      try { tomeHost = ctx.dom.inject(bubble, '<div class="gm-tome-host"></div>', 'beforeend'); }
      catch { tomeHost = null; return; }
      tomeTargetId = tome.messageId;
    }

    const redraw = () => { tomeDrawnKey = ''; syncReplyTome(); };
    tomeHost.replaceChildren();
    // The player typed $grimoire for this reply: say what came of it, never what was planned.
    if (tome.push) {
      const p = tome.push, ribbon = el('div', 'gm-tome-push');
      if (p.landed !== undefined) ribbon.dataset.landed = String(p.landed);
      if (!p.look) ribbon.dataset.state = p.ready ? 'ready' : p.failed ? 'failed' : 'working';
      const words = !p.look ? (p.ready ? 'This reply went ahead without the deep look. It’s ready now: swipe to use it.'
          : p.failed ? 'This reply went ahead without the deep look, and it didn’t finish. Send $grimoire again to retry.'
          : 'This reply went ahead without the deep look. Grimoire is still working on it; this line updates when it’s ready.')
        : p.landed === true ? 'Grimoire’s deep look shaped this reply, and it landed.'
        : p.landed === false ? 'Grimoire picked a move, but the narrator went another way. A swipe tries the same move again.'
        : 'Grimoire’s deep look shaped this reply.';
      ribbon.append(el('span', 'gm-tome-push-mark', '✦ $grimoire'), el('span', '', words));
      tomeHost.append(ribbon);
    }

    if (tome.mode === 'intimate' && !ui.expanded) {
      const veil = el('div', 'gm-tome-veil');
      const left = el('div', 'gm-tome-veil-left');
      left.append(el('span', 'gm-tome-veil-dot'), document.createTextNode('Grimoire has stepped back — story clocks and outside threads are paused while this scene plays out.'));
      const peek = el('button', 'gm-tome-pill subtle', 'Peek at Chronicle ▾'); peek.type = 'button';
      peek.addEventListener('click', () => { ui!.expanded = true; redraw(); });
      veil.append(left, peek);
      tomeHost.append(veil);
    } else if (tome.mode === 'quiet' && !ui.expanded) {
      const spine = el('div', 'gm-tome-spine');
      const left = el('div', 'gm-tome-spine-left');
      const dot = el('span', 'gm-tome-pulse-dot'); dot.style.background = tome.pulse.color; dot.style.boxShadow = `0 0 8px ${tome.pulse.color}`;
      const castTab = tome.tabs.find(t => t.id === 'cast');
      const worldTab = tome.tabs.find(t => t.id === 'world');
      left.append(dot, document.createTextNode(`${tome.pulse.label} · ${castTab?.subLabel ?? 'Quiet turn'} · ${worldTab?.subLabel ?? ''}`));
      const actions = el('div', 'gm-tome-spine-actions');
      if (view.skipOffer?.options.length) {
        const first = view.skipOffer.options[0];
        const skipBtn = el('button', 'gm-tome-pill', `⏳ ${first.label}`); skipBtn.type = 'button';
        skipBtn.addEventListener('click', () => { void act('skip', { chatId: view.chatId, amount: first.hours, unit: 'hours' }); });
        const dismissBtn = el('button', 'gm-tome-pill subtle', 'Not now'); dismissBtn.type = 'button';
        dismissBtn.addEventListener('click', () => { void act('dismiss-skip', { chatId: view.chatId }); });
        actions.append(skipBtn, dismissBtn);
      }
      if (tome.compass) {
        const roomBtn = el('button', 'gm-tome-pill', '❖ Read the Room ▾'); roomBtn.type = 'button';
        roomBtn.addEventListener('click', () => { ui!.expanded = true; ui!.compassOpen = true; redraw(); });
        actions.append(roomBtn);
      }
      const openBtn = el('button', 'gm-tome-pill subtle', 'Open Chronicle ▾'); openBtn.type = 'button';
      openBtn.addEventListener('click', () => { ui!.expanded = true; redraw(); });
      actions.append(openBtn);
      spine.append(left, actions);
      tomeHost.append(spine);
    } else {
      tomeHost.append(buildOpenTome(view, tome, ui, redraw));
    }
    tomeDrawnKey = drawKey;
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
  teardown.push(tab.onActivate(() => void refresh()), ctx.events.on('CHAT_CHANGED', () => { editing = false; void refresh(true); }), ctx.events.on('CHAT_SWITCHED', () => { editing = false; void refresh(true).then(refreshStories); }));
  // A phone that slept, or a dropped connection, can leave the panel showing old news (a chapter still "being
  // written" long after it finished). Look again whenever the page comes back, and whenever the clock jumps.
  const wake = () => { if (!destroyed && document.visibilityState !== 'hidden') void refresh(true); };
  const win = typeof window === 'undefined' ? null : window;
  const targets: Array<[EventTarget, string]> = [[document, 'visibilitychange'], ...(win ? [[win, 'pageshow'], [win, 'online'], [win, 'focus']] as Array<[EventTarget, string]> : [])];
  for (const [target, name] of targets) { target.addEventListener(name, wake); teardown.push(() => target.removeEventListener(name, wake)); }
  let lastTick = Date.now();
  // Work-in-progress clocks tick without redrawing the panel.
  const ticker = setInterval(() => { const gap = Date.now() - lastTick; lastTick = Date.now(); if (gap > 5000) wake(); for (const node of app.querySelectorAll<HTMLElement>('[data-gm-since]')) node.textContent = elapsed(Number(node.dataset.gmSince)); }, 1000);
  teardown.push(() => clearInterval(ticker));
  render(); ctx.ready(); void refresh(true).then(refreshStories);
  return () => { if (destroyed) return; destroyed = true; if (polling) clearInterval(polling); rpc.destroy(); for (const fn of teardown.reverse()) fn(); app.remove(); tab.destroy(); };
}
