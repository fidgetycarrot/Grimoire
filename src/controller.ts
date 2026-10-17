import type { SpindleAPI, LlmMessageDTO, InterceptorContextDTO, InterceptorResultDTO } from 'lumiverse-spindle-types';
import { absoluteHours, advanceClock, describeClock, durationHours, type StoryClock } from './clock';
import { conversation, fingerprints, newestMatching, covers, type Turn } from './history';
import { askJson, askModel, ModelError, type Ask } from './model';
import { buildNote, liveClock, paceLine, type ClockSources } from './note';
import { dueThreads, keepTimes, mergeRevision, NotebookError, stamp, validateNotebook, withoutTimes, type Pace, type Preferences } from './notebook';
import { checkupMessages, creationMessages, type Material } from './prompts';
import { checkRecipe, readTracker, trackerText, validateRecipe, type FieldType, type Recipe } from './tracker';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS, MAX_VERSIONS, VERSION, type ChatState, type ChatView, type Job, type Settings, type Snapshot, type Version } from './types';

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const PACES: Pace[] = ['auto', 'quiet', 'fast'];
type Messages = Awaited<ReturnType<SpindleAPI['chat']['getMessages']>>;
interface Live { state: ChatState; turns: Turn[]; prints: string[]; index: number; version: Version; replies: string[]; values: Record<string, string>; types: Record<string, FieldType>; clock: StoryClock; sources: ClockSources; now: number; text: string }

function validPreferences(value: unknown): Preferences {
  const v = record(value);
  return { length: ['short', 'medium', 'long'].includes(v.length as string) ? v.length as Preferences['length'] : 'medium', tone: ['light', 'balanced', 'dark'].includes(v.tone as string) ? v.tone as Preferences['tone'] : 'balanced', twist: v.twist !== false };
}
export function validSettings(value: unknown): Settings {
  const v = record(value), every = Number(v.every), tokens = Number(v.maxOutputTokens);
  return {
    connectionId: typeof v.connectionId === 'string' ? v.connectionId : '',
    maxOutputTokens: [8000, 16000, 32000, 64000].includes(tokens) ? tokens : DEFAULT_SETTINGS.maxOutputTokens,
    reasoningMode: ['inherit', 'off', 'low'].includes(v.reasoningMode as string) ? v.reasoningMode as Settings['reasoningMode'] : 'inherit',
    every: Number.isInteger(every) && every >= 2 && every <= 50 ? every : DEFAULT_SETTINGS.every,
    placement: v.placement === 'macro' ? 'macro' : 'auto',
  };
}

/**
 * One user's notebooks. Work on a chat is queued so writes never interleave.
 * Model calls (writing a notebook, check-ups) run in the background and only
 * apply if the chat they read is still the chat's history.
 */
export class NotebookController {
  private queues = new Map<string, Promise<unknown>>();
  private running = new Map<string, AbortController>();
  private tasks = new Set<Promise<void>>();
  constructor(private api: SpindleAPI, private userId?: string, private changed: () => void = () => {}, private ask?: Ask) {}

  private serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    this.queues.set(key, next);
    void next.finally(() => { if (this.queues.get(key) === next) this.queues.delete(key); }).catch(() => {});
    return next;
  }
  private path(chatId: string) { if (!/^[\w-]{1,120}$/.test(chatId)) throw new Error('Unknown chat.'); return `chats/${chatId}.json`; }
  async settings(): Promise<Settings> { return validSettings(await this.api.userStorage.getJson('settings.json', { fallback: DEFAULT_SETTINGS, userId: this.userId })); }
  private async load(chatId: string): Promise<ChatState | null> {
    const saved = record(await this.api.userStorage.getJson(this.path(chatId), { fallback: null, userId: this.userId }));
    if (saved.version !== 1 || saved.chatId !== chatId) return null;
    try {
      const versions = (Array.isArray(saved.versions) ? saved.versions : []).map((v): Version => {
        const item = record(v);
        if (!Array.isArray(item.covered) || !item.covered.every(x => typeof x === 'string')) throw new Error('Bad version');
        return { notebook: validateNotebook(item.notebook), covered: item.covered as string[], at: Number(item.at) || 0, reason: String(item.reason ?? ''), ...(typeof item.location === 'string' ? { location: item.location } : {}) };
      });
      const job = saved.job ? record(saved.job) as unknown as Job : null;
      return {
        version: 1, chatId, enabled: saved.enabled === true, pace: PACES.includes(saved.pace as Pace) ? saved.pace as Pace : 'auto', preferences: validPreferences(saved.preferences),
        versions, recipe: validateRecipe(saved.recipe).recipe, checks: Array.isArray(saved.checks) ? saved.checks as ChatState['checks'] : [],
        skipHours: Number(saved.skipHours) > 0 ? Number(saved.skipHours) : 0, skipTurn: Number(saved.skipTurn) > 0 ? Number(saved.skipTurn) : 0, needsCheck: typeof saved.needsCheck === 'string' ? saved.needsCheck : '',
        // A job cannot survive a restart; its request may or may not have finished.
        job: job && job.status === 'running' && !this.running.has(chatId) ? { ...job, status: 'failed', label: 'Stopped when Lumiverse restarted', error: 'Run it again when ready.' } : job,
        updatedAt: Number(saved.updatedAt) || 0,
      };
    } catch {
      await this.api.userStorage.setJson(`recovery/${chatId}-${Date.now()}.json`, saved, { userId: this.userId });
      return null;
    }
  }
  private async save(state: ChatState) {
    state.updatedAt = Date.now();
    await this.api.userStorage.setJson(this.path(state.chatId), state, { userId: this.userId });
  }
  private blank(chatId: string): ChatState {
    return { version: 1, chatId, enabled: false, pace: 'auto', preferences: { ...DEFAULT_PREFERENCES }, versions: [], recipe: { fields: [], note: '' }, checks: [], skipHours: 0, skipTurn: 0, needsCheck: '', job: null, updatedAt: 0 };
  }
  private async chatInfo(chatId: string): Promise<{ name: string; supported: boolean; reason: string; characterId: string }> {
    const chat = await this.api.chats.get(chatId, this.userId);
    if (!chat) return { name: '', supported: false, reason: 'This chat is not available.', characterId: '' };
    const meta = record(chat.metadata);
    if (!chat.character_id || meta.group === true || meta.is_group === true || meta.group_id || (Array.isArray(meta.character_ids) && meta.character_ids.length > 1)) return { name: chat.name, supported: false, reason: 'Group chats are not supported yet. Use a chat with one character.', characterId: '' };
    return { name: chat.name, supported: true, reason: '', characterId: chat.character_id };
  }

  /** Everything the note and the panel need, read fresh from the chat. */
  private async live(state: ChatState, messages: Messages, exclude?: string): Promise<Live | null> {
    if (!state.versions.length) return null;
    const turns = conversation(messages, exclude), prints = await fingerprints(turns);
    let index = newestMatching(state.versions, prints);
    // The first version describes the chat as it was when the notebook began;
    // an edit before that point still leaves it as the base, with a check due.
    if (index < 0) index = 0;
    const version = state.versions[index];
    const replies = turns.filter(t => t.role === 'assistant').map(t => t.content).reverse();
    let variables: Record<string, string> = {};
    if (state.recipe.fields.some(f => f.source.kind === 'variable')) { try { variables = await this.api.variables.chat.list(state.chatId); } catch { /* unavailable */ } }
    const checks = checkRecipe(state.recipe, replies, variables);
    const values = readTracker(state.recipe, checks, replies, variables);
    const types = Object.fromEntries(state.recipe.fields.map(f => [f.name, f.type])) as Record<string, FieldType>;
    const { clock, sources } = liveClock(version.notebook.clock, values, types);
    state.checks = checks;
    return { state, turns, prints, index, version, replies, values, types, clock, sources, now: absoluteHours(clock), text: replies[0] ? trackerText(state.recipe, replies[0]) : '' };
  }
  private repliesSince(live: Live) { return live.turns.slice(live.version.covered.length).filter(t => t.role === 'assistant').length; }

  async view(chatId: string | null): Promise<ChatView | null> {
    if (!chatId) return null;
    return this.serial(chatId, async () => {
      const info = await this.chatInfo(chatId);
      const state = await this.load(chatId) ?? this.blank(chatId);
      const live = info.supported && state.versions.length && this.api.permissions.has('chats') && this.api.permissions.has('chat_mutation') ? await this.live(state, await this.api.chat.getMessages(chatId)) : null;
      const notebook = live?.version.notebook ?? null;
      return {
        chatId, name: info.name, supported: info.supported, reason: info.reason, enabled: state.enabled, pace: state.pace, preferences: state.preferences,
        // Only code-made words reach the panel outside the spoiler fold; a model-written line could give something away.
        hasNotebook: !!notebook, summary: live ? `Last update: ${live.version.reason}` : '', clock: live?.clock ?? null, clockText: live ? describeClock(live.clock) : '', sources: live?.sources ?? null,
        checks: live ? state.checks : [], needsCheck: state.needsCheck || (live && live.index !== state.versions.length - 1 ? 'The chat changed since the last update.' : ''),
        job: state.job, updatedAt: state.updatedAt, repliesSinceCheck: live ? this.repliesSince(live) : 0, skipHours: state.skipHours, notebook, behind: !!live && live.index !== state.versions.length - 1,
      };
    });
  }
  async snapshot(chatId: string | null): Promise<Snapshot> {
    const permissions = await this.api.permissions.getGranted();
    let connections: Snapshot['connections'] = [];
    if (permissions.includes('generation')) { try { connections = (await this.api.connections.list(this.userId)).map(c => ({ id: c.id, name: c.name, model: c.model })); } catch { /* unavailable */ } }
    let chat: ChatView | null = null, notice = '';
    for (const need of ['chats', 'chat_mutation', 'characters', 'interceptor', 'generation']) if (!permissions.includes(need)) notice = `Grant ${need} in Lumiverse’s Extensions panel so Grimoire can work.`;
    try { chat = permissions.includes('chats') ? await this.view(chatId) : null; } catch (error) { notice = error instanceof Error ? error.message : 'This chat could not be read.'; }
    return { version: VERSION, permissions, connections, settings: await this.settings(), chat, notice };
  }

  // ----- Writing the notebook -------------------------------------------------
  private asker(settings: Settings): Ask {
    if (this.ask) return this.ask;
    if (!settings.connectionId) throw new Error('Choose a connection in Grimoire settings first.');
    return (messages, signal) => askModel(this.api, this.userId, settings, messages, signal);
  }
  private async material(chatId: string, characterId: string, messages: Messages): Promise<Material> {
    const character = await this.api.characters.get(characterId, this.userId);
    if (!character) throw new Error('This chat’s character could not be read.');
    let persona: Material['persona'] = null;
    if (this.api.permissions.has('personas')) { try { const p = await this.api.personas.getActive(this.userId); if (p) persona = { name: p.name, description: p.description.slice(0, 6000) }; } catch { /* optional */ } }
    const lore: string[] = [];
    if (this.api.permissions.has('world_books')) {
      let room = 12_000;
      for (const bookId of character.world_book_ids.slice(0, 4)) {
        try {
          const page = await this.api.world_books.entries.list(bookId, { limit: 100, userId: this.userId });
          const entries = [...page.data].filter(e => !record(e).disabled).sort((a, b) => Number(record(b).constant === true) - Number(record(a).constant === true));
          for (const entry of entries) { const piece = `${entry.comment ? `${entry.comment}: ` : ''}${entry.content}`.slice(0, 2000); if (piece.length > room) break; lore.push(piece); room -= piece.length; }
        } catch { /* optional */ }
      }
    }
    const turns = conversation(messages);
    const chat: Material['chat'] = []; let room = 40_000;
    for (const turn of [...turns].reverse()) { const piece = turn.content.slice(0, 4000); if (piece.length > room || chat.length >= 40) break; chat.unshift({ role: turn.role, content: piece }); room -= piece.length; }
    let variables: Record<string, string> = {};
    try { variables = Object.fromEntries(Object.entries(await this.api.variables.chat.list(chatId)).slice(0, 40).map(([k, v]) => [k, String(v).slice(0, 500)])); } catch { /* none */ }
    return { character: { name: character.name, description: character.description.slice(0, 12_000), personality: character.personality.slice(0, 4000), scenario: character.scenario.slice(0, 4000), firstMessage: character.first_mes.slice(0, 6000) },
      persona, lore, chat, replies: turns.filter(t => t.role === 'assistant').slice(-3).map(t => t.content.slice(0, 6000)), variables };
  }
  private startJob(state: ChatState, kind: Job['kind'], label: string): { job: Job; signal: AbortSignal } {
    if (this.running.has(state.chatId)) throw new Error('The notebook is already being updated. Wait for it to finish.');
    const controller = new AbortController();
    this.running.set(state.chatId, controller);
    const job: Job = { id: crypto.randomUUID(), kind, status: 'running', label, startedAt: Date.now() };
    state.job = job;
    return { job, signal: controller.signal };
  }
  private track(task: Promise<void>) { this.tasks.add(task); void task.finally(() => this.tasks.delete(task)); }
  async waitForJobs() { while (this.tasks.size) await Promise.all([...this.tasks]); }
  private explain(error: unknown) {
    // Check failures name threads and people, so the panel gets a spoiler-free version. The model still sees the details when asked to fix its reply.
    if (error instanceof NotebookError) return 'The model’s update did not pass Grimoire’s checks, so the notebook was left as it was.';
    if (error instanceof ModelError) return error.message;
    return error instanceof Error && error.message.length < 300 ? error.message : 'Something went wrong. Your notebook was not changed.';
  }

  async create(chatId: string, preferencesInput: unknown): Promise<Job> {
    return this.serial(chatId, async () => {
      const info = await this.chatInfo(chatId);
      if (!info.supported) throw new Error(info.reason);
      // Lumiverse groups reading a chat's messages under chat_mutation. Grimoire only reads them.
      if (!this.api.permissions.has('chat_mutation')) throw new Error('Grant chat_mutation in Lumiverse’s Extensions panel. Grimoire needs it to read the chat’s messages; it never changes them.');
      const settings = await this.settings(), ask = this.asker(settings);
      const state = await this.load(chatId) ?? this.blank(chatId);
      state.preferences = validPreferences(preferencesInput);
      const { job, signal } = this.startJob(state, 'create', 'Writing the notebook');
      await this.save(state); this.changed();
      this.track((async () => {
        try {
          const messages = await this.api.chat.getMessages(chatId);
          const material = await this.material(chatId, info.characterId, messages);
          const result = await askJson(ask, creationMessages(material, state.preferences), value => {
            const output = record(value);
            return { notebook: withoutTimes(validateNotebook(output.notebook)), recipe: validateRecipe(output.tracker).recipe };
          }, signal);
          await this.serial(chatId, async () => {
            const current = await this.load(chatId) ?? state;
            if (current.job?.id !== job.id) return;
            current.recipe = result.recipe;
            const after = await this.api.chat.getMessages(chatId);
            const turns = conversation(after), prints = await fingerprints(turns);
            const replies = turns.filter(t => t.role === 'assistant').map(t => t.content).reverse();
            let variables: Record<string, string> = {};
            try { variables = await this.api.variables.chat.list(chatId); } catch { /* none */ }
            const checks = checkRecipe(result.recipe, replies, variables), values = readTracker(result.recipe, checks, replies, variables);
            const types = Object.fromEntries(result.recipe.fields.map(f => [f.name, f.type])) as Record<string, FieldType>;
            const { clock } = liveClock(result.notebook.clock, values, types);
            const notebook = stamp({ ...result.notebook, clock }, absoluteHours(clock));
            // Covers only what the model actually read, so a reply that arrived meanwhile is picked up by the next check-up.
            const covered = await fingerprints(conversation(messages));
            current.versions = [{ notebook, covered, at: Date.now(), reason: 'Notebook written', ...(values.location ? { location: values.location } : {}) }];
            current.checks = checks; current.enabled = true; current.needsCheck = covers(covered, prints) ? '' : 'The chat changed while the notebook was being written.';
            current.job = { ...job, status: 'complete', label: 'Notebook ready' };
            await this.save(current);
          });
        } catch (error) { await this.failJob(chatId, job, error); }
        finally { this.running.delete(chatId); this.changed(); }
      })());
      return job;
    });
  }
  private async failJob(chatId: string, job: Job, error: unknown) {
    await this.serial(chatId, async () => {
      const current = await this.load(chatId);
      if (!current || current.job?.id !== job.id) return;
      let turns: number | undefined;
      try { turns = conversation(await this.api.chat.getMessages(chatId)).length; } catch { /* unknown */ }
      current.job = { ...job, status: 'failed', label: job.kind === 'create' ? 'The notebook could not be written' : 'The check-up could not finish', error: this.explain(error), ...(turns !== undefined ? { failedAtTurn: turns } : {}) };
      await this.save(current);
    }).catch(() => {});
  }

  // ----- Check-ups --------------------------------------------------------------
  async checkup(chatId: string, reason: string): Promise<Job | null> {
    return this.serial(chatId, () => this.startCheckup(chatId, reason));
  }
  /** Must run inside the chat's queue. */
  private async startCheckup(chatId: string, reason: string): Promise<Job | null> {
    if (this.running.has(chatId)) return null;
    const state = await this.load(chatId);
    if (!state?.versions.length || !state.enabled) throw new Error('Turn the notebook on for this chat first.');
    const settings = await this.settings(), ask = this.asker(settings);
    const live = await this.live(state, await this.api.chat.getMessages(chatId));
    if (!live) return null;
    const { job, signal } = this.startJob(state, 'checkup', 'Updating the notebook');
    await this.save(state); this.changed();
    const base = live.version, read = live.prints.slice();
    const chat = live.turns.slice(Math.max(0, base.covered.length - 4)).slice(-60).map(t => ({ role: t.role, content: t.content.slice(0, 4000) }));
    const input = {
      notebook: { ...base.notebook, clock: live.clock }, pace: state.pace, chat, trackerText: live.text, trackerValues: live.values, trackerChecks: live.state.checks, recipe: state.recipe,
      clockOwner: { day: live.sources.day, hour: live.sources.hour }, due: dueThreads(base.notebook, live.now).map(d => ({ thread: d.thread.id, step: d.step.id })),
      skipHours: state.skipHours, reason,
    };
    this.track((async () => {
      try {
        const result = await askJson(ask, checkupMessages(input), value => {
          const output = record(value);
          const revised = validateNotebook(output.notebook);
          const merged = mergeRevision(base.notebook, revised, live.now);
          // Only the parts of the clock the notebook owns can go wrong here; tracker-owned parts are read again below.
          if (absoluteHours(liveClock(merged.clock, live.values, live.types).clock) < absoluteHours(live.clock)) throw new NotebookError('The story clock went backwards. Time only moves forward.');
          return { notebook: merged, recipe: output.tracker ? validateRecipe(output.tracker).recipe : null };
        }, signal);
        await this.serial(chatId, async () => {
          const current = await this.load(chatId);
          if (!current || current.job?.id !== job.id) return;
          const prints = await fingerprints(conversation(await this.api.chat.getMessages(chatId)));
          // The chat it read must still be the chat. A swipe or edit meanwhile means the result describes a different story.
          if (!covers(read, prints)) {
            current.job = { ...job, status: 'failed', label: 'Skipped: the chat changed during the check-up', error: 'It will run again shortly.' };
            current.needsCheck = 'The chat changed during the last check-up.';
            await this.save(current); return;
          }
          if (result.recipe && result.recipe.fields.length) current.recipe = result.recipe;
          const types = Object.fromEntries(current.recipe.fields.map(f => [f.name, f.type])) as Record<string, FieldType>;
          const { clock } = liveClock(result.notebook.clock, live.values, types);
          const version: Version = { notebook: { ...result.notebook, clock }, covered: read, at: Date.now(), reason, ...(live.values.location ? { location: live.values.location } : {}) };
          // Keep the base version and anything before it; drop versions from a history that no longer matches.
          const kept = current.versions.filter((v, i) => i === 0 || covers(v.covered, read));
          current.versions = [kept[0], ...kept.slice(1).slice(-(MAX_VERSIONS - 2)), version].filter((v, i, all) => all.indexOf(v) === i);
          current.needsCheck = '';
          current.job = { ...job, status: 'complete', label: 'Notebook updated' };
          await this.save(current);
        });
      } catch (error) { await this.failJob(chatId, job, error); }
      finally { this.running.delete(chatId); this.changed(); }
    })());
    return job;
  }

  // ----- Player controls ---------------------------------------------------------
  async setEnabled(chatId: string, enabled: boolean) {
    return this.serial(chatId, async () => { const state = await this.load(chatId); if (!state?.versions.length) throw new Error('Write a notebook for this chat first.'); state.enabled = enabled; await this.save(state); });
  }
  async setPace(chatId: string, pace: unknown) {
    if (!PACES.includes(pace as Pace)) throw new Error('Choose auto, quiet, or fast.');
    return this.serial(chatId, async () => { const state = await this.load(chatId) ?? this.blank(chatId); state.pace = pace as Pace; await this.save(state); return state.pace; });
  }
  async skipTime(chatId: string, amount: unknown, unit: unknown) {
    const hours = durationHours(Number(amount), String(unit));
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.versions.length || !state.enabled) throw new Error('Turn the notebook on for this chat first.');
      // A check-up in progress would finish from the time before the skip.
      if (this.running.has(chatId)) throw new Error('Wait for the current update to finish, then skip time.');
      const live = await this.live(state, await this.api.chat.getMessages(chatId));
      if (!live) throw new Error('Write a notebook for this chat first.');
      // Only the parts of the clock the notebook owns move here. A tracker-owned
      // clock is moved by the narrator, who is told about the skip in the next note.
      const moved = advanceClock(live.version.notebook.clock, hours);
      const clock = { day: live.sources.day === 'tracker' ? live.version.notebook.clock.day : moved.day, hour: live.sources.hour === 'tracker' ? live.version.notebook.clock.hour : moved.hour, label: '' };
      state.versions.push({ ...live.version, notebook: { ...live.version.notebook, clock }, covered: live.prints, at: Date.now(), reason: 'Time skip' });
      state.versions = [state.versions[0], ...state.versions.slice(1).slice(-(MAX_VERSIONS - 1))];
      state.skipHours = (state.skipHours || 0) + hours;
      state.skipTurn = live.turns.length;
      state.needsCheck = 'Time skip';
      await this.save(state);
      await this.startCheckup(chatId, `Time skip of ${hours} hours`).catch(() => null);
      return hours;
    });
  }
  async editNotebook(chatId: string, value: unknown) {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.versions.length) throw new Error('Write a notebook for this chat first.');
      if (this.running.has(chatId)) throw new Error('Wait for the current update to finish before editing.');
      const live = await this.live(state, await this.api.chat.getMessages(chatId));
      if (!live) throw new Error('Write a notebook for this chat first.');
      // Your edits may remove things; only the recorded times are carried over.
      const edited = keepTimes(live.version.notebook, validateNotebook(value), live.now);
      state.versions.push({ ...live.version, notebook: edited, at: Date.now(), reason: 'Edited by you' });
      state.versions = [state.versions[0], ...state.versions.slice(1).slice(-(MAX_VERSIONS - 1))];
      await this.save(state);
    });
  }
  async remove(chatId: string) {
    return this.serial(chatId, async () => { this.running.get(chatId)?.abort(); this.running.delete(chatId); await this.api.userStorage.setJson(this.path(chatId), { removed: true }, { userId: this.userId }); });
  }
  async saveSettings(value: unknown) { const settings = validSettings(value); await this.api.userStorage.setJson('settings.json', settings, { userId: this.userId }); return settings; }

  // ----- The prompt -------------------------------------------------------------
  async noteFor(chatId: string, exclude?: string): Promise<string> {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.enabled || !state.versions.length) return '';
      const live = await this.live(state, await this.api.chat.getMessages(chatId), exclude);
      if (!live) return '';
      const recent = live.turns.slice(-2).map(t => t.content).join('\n');
      const clockMayLag = (live.sources.day !== 'tracker' || live.sources.hour !== 'tracker') && this.repliesSince(live) > 0;
      return buildNote({ notebook: live.version.notebook, pace: state.pace, clock: live.clock, now: live.now, recent, trackerPresent: live.values.present, skipHours: state.skipHours, clockMayLag });
    });
  }
  async macro(name: 'note' | 'clock' | 'pace', chatId: string | undefined): Promise<string> {
    if (!chatId) return '';
    if (name === 'note') return (await this.settings()).placement === 'macro' ? this.noteFor(chatId) : '';
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.enabled || !state.versions.length) return '';
      const live = await this.live(state, await this.api.chat.getMessages(chatId));
      if (!live) return '';
      return name === 'clock' ? describeClock(live.clock) : paceLine(state.pace, live.version.notebook);
    });
  }
  async intercept(messages: LlmMessageDTO[], context: Pick<InterceptorContextDTO, 'chatId' | 'generationType' | 'excludeMessageId'>): Promise<LlmMessageDTO[] | InterceptorResultDTO> {
    if (!['normal', 'regenerate', 'swipe'].includes(context.generationType) || !context.chatId) return messages;
    if ((await this.settings()).placement !== 'auto') return messages;
    let note = '', exclude = context.excludeMessageId;
    // Some hosts leave out which reply is being replaced. Then the newest reply is the one being redone.
    if (!exclude && context.generationType !== 'normal') { try { const last = conversation(await this.api.chat.getMessages(context.chatId)).at(-1); if (last?.role === 'assistant') exclude = last.id; } catch { /* use the whole chat */ } }
    try { note = await this.noteFor(context.chatId, exclude); } catch { return messages; }
    if (!note) return messages;
    // Keep a trailing assistant prefill last, so the note never breaks it.
    const at = messages.at(-1)?.role === 'assistant' ? messages.length - 1 : messages.length;
    return { messages: [...messages.slice(0, at), { role: 'system', content: note }, ...messages.slice(at)], breakdown: [{ messageIndex: at, name: 'Grimoire' }] };
  }

  /** After a reply is saved: clear a mentioned time skip and start a check-up when the story has moved. */
  async afterReply(chatId: string, generationType: string | undefined): Promise<void> {
    await this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.enabled || !state.versions.length || this.running.has(chatId)) return;
      const live = await this.live(state, await this.api.chat.getMessages(chatId));
      if (!live) return;
      // The skip has been told once a new reply exists after it.
      if (state.skipHours && live.turns.length > (state.skipTurn ?? 0) && live.turns.at(-1)?.role === 'assistant' && (generationType ?? 'normal') !== 'continue') { state.skipHours = 0; state.skipTurn = 0; }
      const settings = await this.settings(), since = this.repliesSince(live);
      const behind = live.index !== state.versions.length - 1;
      const moved = !!live.values.location && !!live.version.location && live.values.location.toLowerCase() !== live.version.location.toLowerCase() && since >= 2;
      const jumped = live.now - absoluteHours(live.version.notebook.clock) >= 6 && since >= 1;
      // After a failed check-up, wait for the story to move on before paying for another try. Check now always works.
      if (state.job?.kind === 'checkup' && state.job.status === 'failed' && state.job.failedAtTurn !== undefined && live.turns.length < state.job.failedAtTurn + 2 * Math.min(settings.every, 4)) { await this.save(state); return; }
      const reason = state.needsCheck ? state.needsCheck : behind ? 'The chat changed since the last update' : moved ? 'The scene moved' : jumped ? 'Time moved on' : since >= settings.every ? `${since} replies since the last update` : '';
      await this.save(state);
      if (reason && settings.connectionId || reason && this.ask) await this.startCheckup(chatId, reason).catch(() => null);
    });
  }
  /** A forked chat starts with a copy; history matching sorts out where they part. */
  async fork(sourceChatId: string, forkedChatId: string) {
    const source = await this.serial(sourceChatId, () => this.load(sourceChatId));
    if (!source?.versions.length) return;
    await this.serial(forkedChatId, async () => { await this.save({ ...structuredClone(source), chatId: forkedChatId, job: null }); });
  }
  dispose() { for (const controller of this.running.values()) controller.abort(); }
}
