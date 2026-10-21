import type { SpindleAPI, LlmMessageDTO, InterceptorContextDTO, InterceptorResultDTO } from 'lumiverse-spindle-types';
import { absoluteHours, advanceClock, describeClock, describeDuration, durationHours, type StoryClock } from './clock';
import { conversation, fingerprints, newestMatching, covers, planHistory, readable, storyReplies, told, type Piece, type Turn } from './history';
import { splitOoc } from './ooc';
import { askJson, askModel, ModelError, type Ask } from './model';
import { buildNote, liveClock, paceLine, type ClockSources } from './note';
import { dueThreads, fillReplies, keepTimes, mergeRevision, NotebookError, partProgress, stamp, validateNotebook, waitsFor, withoutTimes, type Moment, type Notebook, type Pace, type Preferences } from './notebook';
import { checkupMessages, creationMessages, digestMessages, talkMessages, type Material } from './prompts';
import { describeChanges, openExchange } from './talk';
import { checkPush, launchPush, PUSH_KINDS, secretsLeft, type PushKind } from './push';
import { earlySteps, enforcePace, fixPace } from './pacing';
import { plain, plainBlock, tidyNotebook } from './tidy';
import { applyQuick, quickError, quickQuestions, quickState } from './quick';
import { glance, skipOffer } from './skip';
import type { DecisionResult } from 'lumiverse-spindle-types';
import { checkRecipe, guessRecipe, readField, readTracker, trackerText, validateRecipe, type FieldType, type Recipe } from './tracker';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS, MAX_VERSIONS, QUICK_LOG, TALK_LIMITS, type QuickRecord, VERSION, type ChatState, type PlayerNote, type TalkLine, type ChatView, type Job, type Settings, type Snapshot, type StoryListing, type Version } from './types';

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const PACES: Pace[] = ['auto', 'quiet', 'fast'];
const TALK_REASON = 'Changed after you talked to Grimoire';
const PUSH_REASON = 'You asked to get things moving';
const CHAPTER_REASON = 'You started a new chapter';
const PUSH_LABELS: Record<PushKind, string> = { person: 'Get things moving: someone makes a move', secret: 'Get things moving: a secret starts to surface', consequence: 'Get things moving: something catches up with me', surprise: 'Get things moving: surprise me', chapter: 'Start a new chapter' };
/** Fixed words, never the model's: a push must not give away what it is. */
function pushReply(kind: PushKind, skip: number): string {
  if (kind === 'chapter') return `A new chapter is set. It starts with the next reply${skip ? `, about ${describeDuration(skip)} later` : ''}.`;
  return 'Something is in motion. Watch for it over the next few replies.';
}
function talkLines(value: unknown): TalkLine[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-TALK_LIMITS.lines).flatMap((v): TalkLine[] => {
    const x = record(v);
    if ((x.from !== 'you' && x.from !== 'grimoire') || typeof x.text !== 'string') return [];
    return [{ from: x.from, text: x.text.slice(0, 2000), at: Number(x.at) || 0,
      ...(x.keep === true ? { keep: true as const } : {}), ...(x.asked === true ? { asked: true as const } : {}), ...(x.undone === true ? { undone: true as const } : {}),
      ...(Array.isArray(x.changes) ? { changes: x.changes.filter((c): c is string => typeof c === 'string').slice(0, 20) } : {}),
      ...(Number(x.versionAt) > 0 ? { versionAt: Number(x.versionAt) } : {}), ...(Number(x.skipHours) > 0 ? { skipHours: Number(x.skipHours) } : {}), ...(typeof x.noteId === 'string' ? { noteId: x.noteId } : {}) }];
  });
}
function quickLog(value: unknown): QuickRecord[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-QUICK_LOG).flatMap((v): QuickRecord[] => {
    const x = record(v), answers: QuickRecord['answers'] = {};
    for (const [key, a] of Object.entries(record(x.answers)).slice(0, 40)) {
      if (!/^[a-z_0-9]{1,30}$/.test(key)) continue;
      if (typeof a === 'number' && Number.isFinite(a)) answers[key] = a;
      else { const c = record(a); if (typeof c.choice === 'string' && Number.isFinite(Number(c.confidence))) answers[key] = { choice: c.choice.slice(0, 20), confidence: Number(c.confidence) }; }
    }
    return Number.isInteger(x.reply) ? [{ reply: Number(x.reply), at: Number(x.at) || 0, ok: x.ok === true, answers, marked: Number(x.marked) || 0, checkup: x.checkup === true, shifted: x.shifted === true, held: Number(x.held) || 0 }] : [];
  });
}
/** Numbers only: what the decision model answered, never the questions' story text. */
export function quickRecord(reply: number, result: DecisionResult | null, outcome: { marked: number; needsCheckup: boolean; shifted: boolean; held: string[] } | null): QuickRecord {
  const answers: QuickRecord['answers'] = {};
  for (const [key, a] of Object.entries((result?.answers ?? {}) as Record<string, { type: string; noul?: number; choice?: string; confidence?: number }>)) {
    if (a?.type === 'noul' && typeof a.noul === 'number') answers[key] = Math.round(a.noul * 100) / 100;
    else if (a?.type === 'choice' && typeof a.choice === 'string') answers[key] = { choice: a.choice, confidence: Math.round((a.confidence ?? 0) * 100) / 100 };
  }
  return { reply, at: Date.now(), ok: !!result, answers, marked: outcome?.marked ?? 0, checkup: !!outcome && (outcome.needsCheckup || outcome.shifted), shifted: !!outcome?.shifted, held: outcome?.held.length ?? 0 };
}
function playerNotes(value: unknown): PlayerNote[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, TALK_LIMITS.notes).flatMap((v): PlayerNote[] => { const x = record(v); return typeof x.id === 'string' && typeof x.text === 'string' && x.text ? [{ id: x.id, text: x.text.slice(0, TALK_LIMITS.note), at: Number(x.at) || 0 }] : []; });
}
type Messages = Awaited<ReturnType<SpindleAPI['chat']['getMessages']>>;
interface Live { state: ChatState; turns: Turn[]; prints: string[]; index: number; /** False when no saved version fits the chat, so the oldest one stands in. */ matched: boolean; version: Version; replies: string[]; values: Record<string, string>; types: Record<string, FieldType>; clock: StoryClock; sources: ClockSources; now: number; /** Story hours, replies so far, and how long steps may wait. */ moment: Moment; text: string }

function validPreferences(value: unknown): Preferences {
  const v = record(value);
  return { tone: ['light', 'balanced', 'dark'].includes(v.tone as string) ? v.tone as Preferences['tone'] : 'balanced', twist: v.twist !== false };
}
/**
 * Keep the base version, the newest full update, and the most recent ones.
 * Quick checks add versions often; they must not push out the last check-up.
 */
export function prune(versions: Version[]): Version[] {
  if (versions.length <= MAX_VERSIONS) return versions;
  let lastFull = 0;
  versions.forEach((v, i) => { if (!v.quick) lastFull = i; });
  const keep = new Set([0, lastFull]);
  for (let i = versions.length - 1; i >= 0 && keep.size < MAX_VERSIONS; i--) keep.add(i);
  return versions.filter((_, i) => keep.has(i));
}
const plainSetting = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
export function validSettings(value: unknown): Settings {
  const v = record(value), every = Number(v.every), tokens = Number(v.maxOutputTokens), quick = record(v.quick);
  return {
    connectionId: typeof v.connectionId === 'string' ? v.connectionId : '',
    maxOutputTokens: [8000, 16000, 32000, 64000].includes(tokens) ? tokens : DEFAULT_SETTINGS.maxOutputTokens,
    reasoningMode: ['inherit', 'off', 'low'].includes(v.reasoningMode as string) ? v.reasoningMode as Settings['reasoningMode'] : 'inherit',
    every: Number.isInteger(every) && every >= 2 && every <= 50 ? every : DEFAULT_SETTINGS.every,
    placement: v.placement === 'macro' ? 'macro' : 'auto',
    quick: { enabled: quick.enabled === true, connectionId: plainSetting(quick.connectionId, 120), model: plainSetting(quick.model, 200) },
    wait: v.wait === 'short' || v.wait === 'long' ? v.wait : 'medium',
    homeList: v.homeList !== false,
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
  private quickRunning = new Set<string>();
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
        return { notebook: validateNotebook(item.notebook), covered: item.covered as string[], at: Number(item.at) || 0, reason: String(item.reason ?? ''), ...(typeof item.location === 'string' ? { location: item.location } : {}), ...(item.quick === true ? { quick: true as const } : {}) };
      });
      const job = saved.job ? record(saved.job) as unknown as Job : null;
      return {
        version: 1, chatId, enabled: saved.enabled === true, pace: PACES.includes(saved.pace as Pace) ? saved.pace as Pace : 'auto', preferences: validPreferences(saved.preferences),
        versions, recipe: validateRecipe(saved.recipe).recipe, checks: Array.isArray(saved.checks) ? saved.checks as ChatState['checks'] : [],
        skipHours: Number(saved.skipHours) > 0 ? Number(saved.skipHours) : 0, skipTurn: Number(saved.skipTurn) > 0 ? Number(saved.skipTurn) : 0, needsCheck: typeof saved.needsCheck === 'string' ? saved.needsCheck : '', trackerTried: saved.trackerTried === true, skipDismissedAt: Number(saved.skipDismissedAt) > 0 ? Number(saved.skipDismissedAt) : 0,
        held: Array.isArray(saved.held) ? saved.held.filter((x): x is string => typeof x === 'string').slice(0, 12) : [], resync: Number.isInteger(saved.resync) ? Number(saved.resync) : null,
        talk: talkLines(saved.talk), notes: playerNotes(saved.notes), quickLog: quickLog(saved.quickLog),
        paceSignals: Array.isArray(saved.paceSignals) ? saved.paceSignals.filter((x): x is number => Number.isInteger(x)).slice(-12) : [], replan: saved.replan === true, replannedAt: Number(saved.replannedAt) || 0,
        quick: saved.quick && typeof saved.quick === 'object' ? { at: Number(record(saved.quick).at) || 0, ok: record(saved.quick).ok === true, error: String(record(saved.quick).error ?? '').slice(0, 200) } : null,
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
    return { version: 1, chatId, enabled: false, pace: 'auto', preferences: { ...DEFAULT_PREFERENCES }, versions: [], recipe: { fields: [], note: '' }, checks: [], skipHours: 0, skipTurn: 0, needsCheck: '', trackerTried: false, quick: null, skipDismissedAt: 0, held: [], resync: null, talk: [], notes: [], quickLog: [], paceSignals: [], replan: false, replannedAt: 0, job: null, updatedAt: 0 };
  }
  private async chatInfo(chatId: string): Promise<{ name: string; supported: boolean; reason: string; characterId: string }> {
    const chat = await this.api.chats.get(chatId, this.userId);
    if (!chat) return { name: '', supported: false, reason: 'This chat is not available.', characterId: '' };
    const meta = record(chat.metadata);
    if (!chat.character_id || meta.group === true || meta.is_group === true || meta.group_id || (Array.isArray(meta.character_ids) && meta.character_ids.length > 1)) return { name: chat.name, supported: false, reason: 'Group chats are not supported yet. Use a chat with one character.', characterId: '' };
    return { name: chat.name, supported: true, reason: '', characterId: chat.character_id };
  }

  /** The chat's turns. A reply to out-of-character talk that carries the preset's tracker is a story reply after all. */
  private turns(recipe: Recipe, messages: Messages, exclude?: string): Turn[] {
    const fields = recipe.fields.filter(f => f.source.kind !== 'variable');
    return conversation(messages, exclude, fields.length ? reply => fields.some(f => readField(f, reply, {}) !== undefined) : undefined);
  }
  /** Everything the note and the panel need, read fresh from the chat. */
  private async live(state: ChatState, messages: Messages, exclude?: string): Promise<Live | null> {
    if (!state.versions.length) return null;
    const turns = this.turns(state.recipe, messages, exclude), prints = await fingerprints(turns);
    let index = newestMatching(state.versions, prints);
    // The first version describes the chat as it was when the notebook began;
    // an edit before that point still leaves it as the base, with a check due.
    const matched = index >= 0;
    if (index < 0) index = 0;
    const version = state.versions[index];
    // Older notebooks have no reply counts: count from the reply the version was made at.
    version.notebook = fillReplies(version.notebook, storyReplies(turns.slice(0, version.covered.length)).length);
    const replies = storyReplies(turns).map(t => t.content).reverse();
    let variables: Record<string, string> = {};
    if (state.recipe.fields.some(f => f.source.kind === 'variable')) { try { variables = await this.api.variables.chat.list(state.chatId); } catch { /* unavailable */ } }
    const checks = checkRecipe(state.recipe, replies, variables);
    const values = readTracker(state.recipe, checks, replies, variables);
    const types = Object.fromEntries(state.recipe.fields.map(f => [f.name, f.type])) as Record<string, FieldType>;
    const { clock, sources } = liveClock(version.notebook.clock, values, types);
    state.checks = checks;
    const now = absoluteHours(clock), settings = await this.settings();
    const moment: Moment = { hours: now, reply: replies.length, waits: waitsFor(settings.wait, state.pace) };
    return { state, turns, prints, index, matched, version, replies, values, types, clock, sources, now, moment, text: replies[0] ? trackerText(state.recipe, replies[0]) : '' };
  }
  /** The newest full update at or before the version in use. Quick checks keep the notebook current, but don't count as a check-up. */
  private fullVersion(live: Live): Version {
    // Only versions that still fit the chat: a check-up on a deleted branch doesn't count.
    for (let i = live.index; i >= 0; i--) { const v = live.state.versions[i]; if (!v.quick && covers(v.covered, live.prints)) return v; }
    return live.state.versions[0];
  }
  /** Replies to learn a tracker from, newest first. An opening message seldom has one, so it doesn't count. */
  private trackerSamples(turns: Turn[]): string[] {
    return turns.filter((t, i) => t.role === 'assistant' && !t.ooc && !(i === 0)).map(t => t.content).reverse();
  }
  /** Try to find the tracker in code, for free. Returns true if one was found. */
  private learnTracker(state: ChatState, turns: Turn[]): boolean {
    const found = guessRecipe(this.trackerSamples(turns));
    // A field that stopped reading (a new preset, a changed format) may be replaced; one that still reads stays as it is.
    const broken = new Set(state.checks.filter(c => c.status === 'unavailable').map(c => c.name));
    const covers = (name: string) => found.fields.some(g => g.name === name || (name === 'datetime' && (g.name === 'date' || g.name === 'time')));
    const kept = state.recipe.fields.filter(f => !broken.has(f.name) || !covers(f.name));
    const have = new Set(kept.map(f => f.name)), time = have.has('datetime');
    const extra = found.fields.filter(f => !have.has(f.name) && !(time && (f.name === 'date' || f.name === 'time')));
    if (!extra.length) return false;
    state.recipe = { fields: [...kept, ...extra], note: state.recipe.note || found.note };
    return true;
  }
  private repliesSince(live: Live) { return storyReplies(live.turns.slice(this.fullVersion(live).covered.length)).length; }

  async view(chatId: string | null): Promise<ChatView | null> {
    if (!chatId) return null;
    return this.serial(chatId, async () => {
      const info = await this.chatInfo(chatId);
      const state = await this.load(chatId) ?? this.blank(chatId);
      const readable = info.supported && this.api.permissions.has('chats') && this.api.permissions.has('chat_mutation');
      const messages = readable ? await this.api.chat.getMessages(chatId) : null;
      const live = messages && state.versions.length ? await this.live(state, messages) : null;
      // Before a notebook exists, say how much of a long chat has to be read first (one request per part).
      const earlierParts = messages && !live ? planHistory(conversation(messages)).earlier.length : 0;
      const notebook = live?.version.notebook ?? null;
      return {
        chatId, name: info.name, supported: info.supported, reason: info.reason, enabled: state.enabled, pace: state.pace, preferences: state.preferences,
        // Only code-made words reach the panel outside the spoiler fold; a model-written line could give something away.
        hasNotebook: !!notebook, summary: live ? `Last update: ${this.fullVersion(live).reason}` : '', clock: live?.clock ?? null, clockText: live ? describeClock(live.clock) : '', sources: live?.sources ?? null,
        checks: live ? state.checks : [], needsCheck: state.needsCheck || (live && !live.matched ? 'The chat changed before the notebook was written.' : ''),
        job: state.job, updatedAt: state.updatedAt, repliesSinceCheck: live ? this.repliesSince(live) : 0, skipHours: state.skipHours, notebook, behind: !!live && live.index !== state.versions.length - 1, earlierParts, quick: state.quick, dueIds: live ? dueThreads(live.version.notebook, live.moment).map(d => d.thread.id) : [],
        glance: live ? glance(live.version.notebook, live.moment) : null, reworking: !!live && this.reworking(state, live),
        talk: state.talk, notes: state.notes, quickLog: state.quickLog, canUndo: this.undoable(state) !== null,
        skipOffer: live && state.enabled && state.job?.status !== 'running' && !state.skipHours && !this.reworking(state, live) ? skipOffer(live.version.notebook, live.moment, live.clock, state.skipDismissedAt) : null,
      };
    });
  }
  /** Chats that have a notebook, most recently played first. Chats that were deleted are left out. */
  async stories(limit = 12): Promise<StoryListing[]> {
    let paths: string[] = [];
    try { paths = await this.api.userStorage.list('chats/', this.userId); } catch { return []; }
    const ids = [...new Set(paths.map(p => /([\w-]{1,120})\.json$/.exec(p)?.[1]).filter((x): x is string => !!x))];
    const found = await Promise.all(ids.slice(0, 200).map(async (chatId): Promise<StoryListing | null> => {
      try {
        const state = await this.load(chatId);
        if (!state?.versions.length) return null;
        const chat = await this.api.chats.get(chatId, this.userId);
        if (!chat) return null;
        const character = chat.character_id ? await this.api.characters.get(chat.character_id, this.userId).catch(() => null) : null;
        const played = Number((chat as { updated_at?: number }).updated_at) || 0;
        return { chatId, character: character?.name ?? '', chatName: chat.name ?? '', playedAt: played > 1e11 ? played : played * 1000, enabled: state.enabled };
      } catch { return null; }
    }));
    return found.filter((x): x is StoryListing => !!x).sort((a, b) => b.playedAt - a.playedAt).slice(0, limit);
  }
  async snapshot(chatId: string | null): Promise<Snapshot> {
    const permissions = await this.api.permissions.getGranted();
    let connections: Snapshot['connections'] = [];
    if (permissions.includes('generation')) { try { connections = (await this.api.connections.list(this.userId)).map(c => ({ id: c.id, name: c.name, model: c.model })); } catch { /* unavailable */ } }
    let chat: ChatView | null = null, notice = '';
    for (const need of ['chats', 'chat_mutation', 'characters', 'interceptor', 'generation']) if (!permissions.includes(need)) notice = `Grant ${need} in Lumiverse’s Extensions panel so Grimoire can work.`;
    try { chat = permissions.includes('chats') ? await this.view(chatId) : null; } catch (error) { notice = error instanceof Error ? error.message : 'This chat could not be read.'; }
    const decisions: Snapshot['decisions'] = { available: this.decisionsReady(), reason: this.decisionsReason(), connections: [] };
    if (decisions.available) { try { decisions.connections = (await this.api.decisions.listConnections(this.userId ? { userId: this.userId } : undefined)).map(c => ({ id: c.id, name: c.name, provider: c.provider, model: c.model, isDefault: c.is_default })); } catch { /* unavailable */ } }
    return { version: VERSION, permissions, connections, settings: await this.settings(), chat, notice, decisions };
  }

  // ----- Writing the notebook -------------------------------------------------
  private asker(settings: Settings): Ask {
    if (this.ask) return this.ask;
    if (!settings.connectionId) throw new Error('Choose a connection in Grimoire settings first.');
    return (messages, signal) => askModel(this.api, this.userId, settings, messages, signal);
  }
  private async character(characterId: string) {
    const character = await this.api.characters.get(characterId, this.userId);
    if (!character) throw new Error('This chat’s character could not be read.');
    return character;
  }
  private async persona(): Promise<Material['persona']> {
    if (!this.api.permissions.has('personas')) return null;
    try { const p = await this.api.personas.getActive(this.userId); return p ? { name: p.name, description: p.description.slice(0, 6000) } : null; } catch { return null; }
  }
  private async material(chatId: string, characterId: string, messages: Messages, recent: Piece[], storySoFar: string): Promise<Material> {
    const character = await this.character(characterId);
    const persona = await this.persona();
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
    let variables: Record<string, string> = {};
    try { variables = Object.fromEntries(Object.entries(await this.api.variables.chat.list(chatId)).slice(0, 40).map(([k, v]) => [k, String(v).slice(0, 500)])); } catch { /* none */ }
    return { character: { name: character.name, description: character.description.slice(0, 12_000), personality: character.personality.slice(0, 4000), scenario: character.scenario.slice(0, 4000), firstMessage: character.first_mes.slice(0, 6000) },
      persona, lore, storySoFar, chat: recent, replies: storyReplies(turns).slice(-3).map(t => t.content.slice(0, 20_000)), variables };
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
    if (error instanceof NotebookError) return `The model’s reply did not pass Grimoire’s checks, so nothing was changed. Details: ${error.safe}`;
    if (error instanceof ModelError) return error.message;
    return error instanceof Error && error.message.length < 300 ? error.message : 'Something went wrong. Your notebook was not changed.';
  }

  async create(chatId: string, preferencesInput: unknown, ideasInput: unknown = '', keepIdeas: unknown = false): Promise<Job> {
    // Your ideas for the story, if any: the first notebook is built around them.
    const ideas = typeof ideasInput === 'string' ? ideasInput.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
    if (ideas.length > TALK_LIMITS.message) throw new Error(`Keep your ideas under ${TALK_LIMITS.message} characters.`);
    const pin = keepIdeas === true && !!ideas;
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
          const plan = planHistory(conversation(messages));
          // A long chat is read from the start first, part by part, so older chats keep their history.
          let storySoFar = '';
          if (plan.earlier.length) {
            const character = (await this.character(info.characterId)).name, persona = (await this.persona())?.name ?? '';
            for (const [i, part] of plan.earlier.entries()) {
              await this.progress(chatId, job, `Reading the story so far (${i + 1} of ${plan.earlier.length})`);
              storySoFar = await askJson(ask, digestMessages({ character, persona, part: i + 1, parts: plan.earlier.length, record: storySoFar, chat: part }), value => {
                const text = plainBlock(record(value).record, 12_000);
                if (!text) throw new NotebookError('"record" is empty. Write the story so far as plain text.');
                return text;
              }, signal);
            }
            await this.progress(chatId, job, 'Writing the notebook');
          }
          const material = await this.material(chatId, info.characterId, messages, plan.recent, storySoFar);
          let round = 0;
          const result = await askJson(ask, creationMessages(material, state.preferences, ideas, pin), value => {
            round++;
            const output = record(value);
            const first = validateNotebook(tidyNotebook(output.notebook));
            if (round === 1) enforcePace(null, first);
            const notes = pin ? (Array.isArray(output.notes) ? output.notes : []).map(n => plain(n, TALK_LIMITS.note)).filter(Boolean).slice(0, 4) : [];
            return { notebook: withoutTimes(round === 1 ? first : fixPace(null, first)), recipe: validateRecipe(output.tracker).recipe, notes };
          }, signal);
          await this.serial(chatId, async () => {
            const current = await this.load(chatId) ?? state;
            if (current.job?.id !== job.id) return;
            current.recipe = result.recipe;
            const after = await this.api.chat.getMessages(chatId);
            const turns = this.turns(current.recipe, after), prints = await fingerprints(turns);
            this.learnTracker(current, turns);
            const learned = current.recipe;
            const replies = storyReplies(turns).map(t => t.content).reverse();
            let variables: Record<string, string> = {};
            try { variables = await this.api.variables.chat.list(chatId); } catch { /* none */ }
            const checks = checkRecipe(learned, replies, variables), values = readTracker(learned, checks, replies, variables);
            const types = Object.fromEntries(learned.fields.map(f => [f.name, f.type])) as Record<string, FieldType>;
            const { clock } = liveClock(result.notebook.clock, values, types);
            const notebook = stamp({ ...result.notebook, clock }, { hours: absoluteHours(clock), reply: storyReplies(this.turns(current.recipe, messages)).length });
            // Covers only what the model actually read, so a reply that arrived meanwhile is picked up by the next check-up.
            const covered = await fingerprints(conversation(messages));
            current.versions = [{ notebook, covered, at: Date.now(), reason: 'Notebook written', ...(values.location ? { location: values.location } : {}) }];
            // Ideas you asked to keep become pinned notes, in the model's short form or your own words.
            if (pin) { const texts = result.notes.length ? result.notes : [plain(ideas, TALK_LIMITS.note)]; current.notes = [...current.notes, ...texts.map(text => ({ id: crypto.randomUUID(), text, at: Date.now() }))].slice(-TALK_LIMITS.notes); }
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
  /** Show how far a long job has got. */
  private async progress(chatId: string, job: Job, label: string) {
    await this.serial(chatId, async () => {
      const current = await this.load(chatId);
      if (!current || current.job?.id !== job.id) return;
      current.job = { ...current.job, label }; await this.save(current);
    });
    this.changed();
  }
  private async failJob(chatId: string, job: Job, error: unknown) {
    await this.serial(chatId, async () => {
      const current = await this.load(chatId);
      if (!current || current.job?.id !== job.id) return;
      let turns: number | undefined;
      try { turns = conversation(await this.api.chat.getMessages(chatId)).length; } catch { /* unknown */ }
      current.job = { ...job, status: 'failed', label: job.kind === 'create' ? 'The notebook could not be written' : job.kind === 'talk' ? 'Grimoire could not answer' : 'The check-up could not finish', error: this.explain(error), ...(turns !== undefined ? { failedAtTurn: turns } : {}) };
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
    // Words, not markup: preset panels and styling can be most of a reply.
    // From the last full check-up: quick checks don't read the story for the notebook.
    const chat = live.turns.slice(Math.max(0, this.fullVersion(live).covered.length - 4)).slice(-60).map(t => ({ role: t.role, content: told(t, 8000) }));
    // The raw replies, only while a tracker still has to be learned or fixed.
    const learning = !state.recipe.fields.length || live.state.checks.some(c => c.status === 'unavailable');
    const input = {
      notebook: { ...base.notebook, clock: live.clock }, pace: state.pace, chat, trackerText: live.text, trackerValues: live.values, trackerChecks: live.state.checks, recipe: state.recipe,
      clockOwner: { day: live.sources.day, hour: live.sources.hour }, due: dueThreads(base.notebook, live.moment).map(d => ({ thread: d.thread.id, step: d.step.id })),
      skipHours: state.skipHours, reason, preferences: state.preferences, resync: state.resync !== null, held: state.held, notes: state.notes.map(n => n.text), part: partProgress(base.notebook, live.moment), replan: state.replan, replies: learning ? this.trackerSamples(live.turns).slice(0, 2).map(r => r.slice(0, 20_000)) : [],
    };
    this.track((async () => {
      try {
        let round = 0;
        const result = await askJson(ask, checkupMessages(input), value => {
          round++;
          const output = record(value);
          let revised = validateNotebook(tidyNotebook(output.notebook, base.notebook));
          // Pacing rules: the first answer that breaks one is sent back; a second gets the plainest fix.
          const rules = { speedUps: Object.fromEntries(Object.entries(record(output.speedUps)).map(([k, v]) => [k, typeof v === 'string' ? v : ''])) };
          if (round === 1) enforcePace(base.notebook, revised, rules); else revised = fixPace(base.notebook, revised, rules);
          let merged = mergeRevision(base.notebook, revised, live.moment);
          // Time only moves forward. A clock that went back keeps the time from before the check-up;
          // tracker-owned parts are read again below either way.
          if (absoluteHours(liveClock(merged.clock, live.values, live.types).clock) < absoluteHours(live.clock)) merged = { ...merged, clock: live.clock };
          return { notebook: merged, recipe: output.tracker ? validateRecipe(output.tracker).recipe : null, early: earlySteps(base.notebook, merged, live.moment) };
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
          else this.learnTracker(current, live.turns);
          const types = Object.fromEntries(current.recipe.fields.map(f => [f.name, f.type])) as Record<string, FieldType>;
          const { clock } = liveClock(result.notebook.clock, live.values, types);
          const version: Version = { notebook: { ...result.notebook, clock }, covered: read, at: Date.now(), reason, ...(live.values.location ? { location: live.values.location } : {}) };
          // Keep the base version and anything before it; drop versions from a history that no longer matches.
          const kept = current.versions.filter((v, i) => i === 0 || covers(v.covered, read));
          current.versions = prune([...kept, version].filter((v, i, all) => all.indexOf(v) === i));
          current.needsCheck = ''; current.held = []; current.resync = null;
          // A re-plan done; otherwise steps that happened before they were offered count as running ahead.
          if (input.replan) { current.replan = false; current.replannedAt = live.moment.reply ?? 0; current.paceSignals = []; }
          else if (result.early) this.paceSignal(current, live.moment, result.early);
          current.job = { ...job, status: 'complete', label: 'Notebook updated' };
          await this.save(current);
        });
      } catch (error) { await this.failJob(chatId, job, error); }
      finally { this.running.delete(chatId); this.changed(); }
    })());
    return job;
  }

  // ----- Talking to Grimoire ------------------------------------------------------
  /**
   * The player's message to Grimoire. One model request: it either asks one
   * short question back, or changes the plans and says what it will do.
   */
  async talk(chatId: string, text: unknown, keep: unknown): Promise<Job> {
    const message = typeof text === 'string' ? text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
    if (!message) throw new Error('Write something for Grimoire first.');
    if (message.length > TALK_LIMITS.message) throw new Error(`Keep it under ${TALK_LIMITS.message} characters.`);
    return this.startTalk(chatId, message, keep === true, null);
  }
  /** The buttons: get a stalled story moving, or start a new chapter. One model request. */
  async push(chatId: string, kind: unknown): Promise<Job> {
    if (!PUSH_KINDS.includes(kind as PushKind)) throw new Error('Pick how to get things moving.');
    if (kind === 'secret') {
      const state = await this.serial(chatId, () => this.load(chatId));
      const notebook = state?.versions.at(-1)?.notebook;
      if (notebook && !secretsLeft(notebook)) throw new Error('Every secret in this story has already come out. Try another kind.');
    }
    return this.startTalk(chatId, PUSH_LABELS[kind as PushKind], false, kind as PushKind);
  }
  private startTalk(chatId: string, message: string, keep: boolean, push: PushKind | null): Promise<Job> {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.versions.length) throw new Error('Write a notebook for this chat first.');
      if (this.running.has(chatId)) throw new Error('Grimoire is busy updating the notebook. Try again in a moment.');
      const settings = await this.settings(), ask = this.asker(settings);
      const live = await this.live(state, await this.api.chat.getMessages(chatId));
      if (!live) throw new Error('Write a notebook for this chat first.');
      state.talk = [...state.talk, { from: 'you' as const, text: message, at: Date.now(), ...(keep ? { keep: true as const } : {}) }].slice(-TALK_LIMITS.lines);
      const { job, signal } = this.startJob(state, 'talk', push ? 'Grimoire is setting something in motion' : 'Grimoire is thinking');
      await this.save(state); this.changed();
      const base = live.version, read = live.prints.slice();
      // A button press is its own request, not part of a conversation.
      const open = push ? state.talk.slice(-1) : openExchange(state.talk), earlier = state.talk.slice(0, state.talk.length - open.length).slice(-6);
      const pinning = open.some(line => line.from === 'you' && line.keep);
      const input = {
        notebook: base.notebook, preferences: state.preferences, storyTime: describeClock(live.clock),
        chat: live.turns.slice(-12).map(t => ({ role: t.role, content: told(t, 4000) })),
        earlier: earlier.map(l => ({ from: l.from, text: l.text })), exchange: open.map(l => ({ from: l.from, text: l.text })),
        notes: state.notes.map(n => n.text), keep: pinning, push,
      };
      this.track((async () => {
        try {
          let round = 0;
          const result = await askJson(ask, talkMessages(input), value => {
            round++;
            const output = record(value);
            const asked = !push && output.ask === true;
            const kind: PushKind | null = push ?? (!asked && output.push && PUSH_KINDS.includes(output.pushKind as PushKind) ? output.pushKind as PushKind : null);
            const reply = kind ? pushReply(kind, 0) : plainBlock(output.reply, 600);
            if (!reply) throw new NotebookError('"reply" is empty. Answer the player in one or two short sentences.');
            if (kind && !(output.notebook && typeof output.notebook === 'object')) throw new NotebookError('Return the revised notebook and "push".');
            let notebook: Notebook | null = null, skip = 0, moment = live.moment, clock = live.clock;
            if (!asked && output.notebook && typeof output.notebook === 'object') {
              let revised = validateNotebook(tidyNotebook(output.notebook, base.notebook));
              if (kind) revised = launchPush(revised, checkPush(base.notebook, revised, output.push, kind));
              if (round === 1) enforcePace(base.notebook, revised, { playerAsked: true }); else revised = fixPace(base.notebook, revised, { playerAsked: true });
              // A new chapter may open after a jump in time. Only the parts of the clock Grimoire owns move; the narrator is told.
              if (kind === 'chapter') skip = Math.min(720, Math.max(0, Math.round(Number(output.skipHours) || 0)));
              if (skip) {
                const moved = advanceClock(live.clock, skip);
                clock = { day: live.sources.day === 'tracker' ? live.clock.day : moved.day, hour: live.sources.hour === 'tracker' ? live.clock.hour : moved.hour, label: '' };
                moment = { ...live.moment, hours: absoluteHours(clock) };
              }
              notebook = { ...mergeRevision(base.notebook, revised, moment), ...(skip ? { clock } : {}) };
            }
            return { reply: kind ? pushReply(kind, skip) : reply, asked, notebook, kind, skip, note: !asked && pinning ? plain(output.note, TALK_LIMITS.note) : '' };
          }, signal);
          await this.serial(chatId, async () => {
            const current = await this.load(chatId);
            if (!current || current.job?.id !== job.id) return;
            const prints = await fingerprints(conversation(await this.api.chat.getMessages(chatId)));
            const line: TalkLine = { from: 'grimoire', text: result.reply, at: Date.now(), ...(result.asked ? { asked: true as const } : {}) };
            // The chat it read must still be the chat; otherwise the answer stands but the plans wait.
            const fits = covers(read, prints);
            if (result.notebook && fits) {
              const changes = describeChanges(base.notebook, result.notebook);
              line.changes = changes;
              if (changes.length || result.kind) {
                const at = Date.now();
                const kept = current.versions.filter((v, i) => i === 0 || covers(v.covered, read));
                current.versions = prune([...kept, { notebook: result.notebook, covered: read, at, reason: result.kind === 'chapter' ? CHAPTER_REASON : result.kind ? PUSH_REASON : TALK_REASON, ...(live.values.location ? { location: live.values.location } : {}) }]);
                line.versionAt = at;
                if (result.skip) { current.skipHours = (current.skipHours || 0) + result.skip; current.skipTurn = live.turns.length; line.skipHours = result.skip; }
              }
            } else if (!result.asked) line.changes = [];
            if (result.notebook && !fits) line.text = result.kind ? 'The chat changed while I was working, so nothing was set in motion. Try again.' : `${line.text} The chat changed while I was thinking, so I left the plans as they were. Tell me again and I will apply it.`;
            if (!result.asked && pinning) {
              const fallback = open.filter(l => l.from === 'you' && l.keep).at(-1)?.text ?? '';
              const text = result.note || plain(fallback, TALK_LIMITS.note);
              if (text) {
                const note: PlayerNote = { id: crypto.randomUUID(), text, at: Date.now() };
                current.notes = [...current.notes, note].slice(-TALK_LIMITS.notes);
                line.noteId = note.id;
              }
            }
            current.talk = [...current.talk, line].slice(-TALK_LIMITS.lines);
            current.job = { ...job, status: 'complete', label: result.kind ? 'Something is in motion' : 'Grimoire answered' };
            await this.save(current);
          });
        } catch (error) { await this.failJob(chatId, job, error); }
        finally { this.running.delete(chatId); this.changed(); }
      })());
      return job;
    });
  }
  /** The newest answer that changed the plans, while its version is still the newest one. */
  private undoable(state: ChatState): TalkLine | null {
    const line = [...state.talk].reverse().find(l => l.from === 'grimoire' && !l.asked);
    const last = state.versions.at(-1);
    return line?.versionAt && !line.undone && [TALK_REASON, PUSH_REASON, CHAPTER_REASON].includes(last?.reason ?? '') && last!.at === line.versionAt ? line : null;
  }
  /** Put the plans back as they were before the last answer, and unpin its note. */
  async undoTalk(chatId: string) {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state) return;
      if (this.running.has(chatId)) throw new Error('Wait for Grimoire to finish first.');
      const line = state ? this.undoable(state) : null;
      if (!line) throw new Error('There is nothing to undo. The story has moved on since then.');
      state.versions = state.versions.slice(0, -1);
      if (line.noteId) state.notes = state.notes.filter(n => n.id !== line.noteId);
      if (line.skipHours) state.skipHours = Math.max(0, (state.skipHours || 0) - line.skipHours);
      line.undone = true;
      state.talk = [...state.talk, { from: 'grimoire' as const, text: 'Undone. The plans are back the way they were.', at: Date.now(), changes: [] }].slice(-TALK_LIMITS.lines);
      await this.save(state);
    });
  }
  async unpin(chatId: string, noteId: unknown) {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state) return;
      state.notes = state.notes.filter(n => n.id !== noteId);
      await this.save(state);
    });
  }
  async clearTalk(chatId: string) {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state) return;
      if (this.running.has(chatId) && state.job?.kind === 'talk') throw new Error('Wait for Grimoire to finish first.');
      state.talk = [];
      await this.save(state);
    });
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
      state.versions = prune(state.versions);
      state.skipHours = (state.skipHours || 0) + hours;
      state.skipTurn = live.turns.length;
      state.needsCheck = 'Time skip';
      await this.save(state);
      await this.startCheckup(chatId, `Time skip of ${hours} hours`).catch(() => null);
      return hours;
    });
  }
  /** "Not now" on a time-skip suggestion: it stays away for a while. */
  async dismissSkip(chatId: string) {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.versions.length) return;
      state.skipDismissedAt = storyReplies(this.turns(state.recipe, await this.api.chat.getMessages(chatId))).length;
      await this.save(state);
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
      const edited = keepTimes(live.version.notebook, validateNotebook(value), live.moment);
      state.versions.push({ ...live.version, notebook: edited, at: Date.now(), reason: 'Edited by you' });
      state.versions = prune(state.versions);
      await this.save(state);
    });
  }
  async remove(chatId: string) {
    return this.serial(chatId, async () => { this.running.get(chatId)?.abort(); this.running.delete(chatId); await this.api.userStorage.setJson(this.path(chatId), { removed: true }, { userId: this.userId }); });
  }
  async saveSettings(value: unknown) { const settings = validSettings(value); await this.api.userStorage.setJson('settings.json', settings, { userId: this.userId }); return settings; }

  // ----- The prompt -------------------------------------------------------------
  async noteFor(chatId: string, exclude?: string, guided = false): Promise<string> {
    return this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.enabled || !state.versions.length) return '';
      const live = await this.live(state, await this.api.chat.getMessages(chatId), exclude);
      if (!live) return '';
      // The narrator is answering out-of-character talk: no story guidance, and nothing from the notebook to repeat.
      if (live.turns.at(-1)?.role === 'user' && live.turns.at(-1)?.ooc) return '';
      const recent = live.turns.slice(-2).map(t => t.content).join('\n');
      const clockMayLag = (live.sources.day !== 'tracker' || live.sources.hour !== 'tracker') && this.repliesSince(live) > 0;
      return buildNote({ notebook: live.version.notebook, pace: state.pace, clock: live.clock, now: live.moment, held: state.held, reworking: this.reworking(state, live), recent, trackerPresent: live.values.present, skipHours: state.skipHours, clockMayLag, guided, notes: state.notes.map(n => n.text) });
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
  async intercept(messages: LlmMessageDTO[], context: Pick<InterceptorContextDTO, 'chatId' | 'generationType' | 'excludeMessageId'> & { regenFeedback?: string }): Promise<LlmMessageDTO[] | InterceptorResultDTO> {
    if (!['normal', 'regenerate', 'swipe'].includes(context.generationType) || !context.chatId) return messages;
    if ((await this.settings()).placement !== 'auto') return messages;
    let note = '', exclude = context.excludeMessageId;
    // Some hosts leave out which reply is being replaced. Then the newest reply is the one being redone.
    if (!exclude && context.generationType !== 'normal') { try { const last = conversation(await this.api.chat.getMessages(context.chatId)).at(-1); if (last?.role === 'assistant') exclude = last.id; } catch { /* use the whole chat */ } }
    // A swipe with guidance: the player has said what this reply should be, so the note must not pull another way.
    const guided = context.generationType !== 'normal' && typeof context.regenFeedback === 'string' && context.regenFeedback.trim().length > 0;
    try { note = await this.noteFor(context.chatId, exclude, guided); } catch { return messages; }
    if (!note) return messages;
    // Keep a trailing assistant prefill last, so the note never breaks it.
    const at = messages.at(-1)?.role === 'assistant' ? messages.length - 1 : messages.length;
    return { messages: [...messages.slice(0, at), { role: 'system', content: note }, ...messages.slice(at)], breakdown: [{ messageIndex: at, name: 'Grimoire' }] };
  }

  /**
   * After a reply is saved: clear a mentioned time skip, run the quick check if
   * it is on, and start a check-up when the story has moved.
   */
  async afterReply(chatId: string, generationType: string | undefined): Promise<void> {
    const quick = await this.serial(chatId, async () => {
      const state = await this.load(chatId);
      if (!state?.enabled || !state.versions.length || this.running.has(chatId)) return null;
      const live = await this.live(state, await this.api.chat.getMessages(chatId));
      if (!live) return null;
      // The skip has been told once a new reply exists after it.
      if (state.skipHours && live.turns.length > (state.skipTurn ?? 0) && live.turns.at(-1)?.role === 'assistant' && (generationType ?? 'normal') !== 'continue') { state.skipHours = 0; state.skipTurn = 0; }
      // Out-of-character talk isn't story: nothing to check, nothing counted.
      if (live.turns.at(-1)?.ooc) { await this.save(state); return null; }
      const settings = await this.settings();
      // The quick check runs outside the chat's queue so the next reply's note never waits on it.
      if (settings.quick.enabled && this.decisionsReady() && !this.quickRunning.has(chatId) && live.turns.at(-1)?.role === 'assistant') { await this.save(state); return { live, settings }; }
      await this.decide(state, live, settings, '');
      return null;
    });
    if (quick) this.runQuick(chatId, quick.live, quick.settings);
  }
  /** Must run inside the chat's queue. Saves the state, then starts a check-up if one is due. */
  private async decide(state: ChatState, live: Live, settings: Settings, extra: string) {
    const chatId = state.chatId;
    // A tracker that shows up once the narrator starts replying is looked for in code first, for free.
    if (this.learnTracker(state, live.turns)) live = (await this.live(state, await this.api.chat.getMessages(chatId)))!;
    const full = this.fullVersion(live), since = this.repliesSince(live);
    // Going back (deleting, editing, or swiping a reply) picks the version from before it, which already fits the chat.
    // A check-up is only needed right away when no saved version fits at all.
    const unmatched = !live.matched;
    const moved = !!live.values.location && !!full.location && live.values.location.toLowerCase() !== full.location.toLowerCase() && since >= 2;
    const jumped = live.now - absoluteHours(full.notebook.clock) >= 6 && since >= 1;
    // After a failed check-up, wait for the story to move on before paying for another try. Check now always works.
    if (state.job?.kind === 'checkup' && state.job.status === 'failed' && state.job.failedAtTurn !== undefined && live.turns.length < state.job.failedAtTurn + 2 * Math.min(settings.every, 4)) { await this.save(state); return; }
    // A tracker that only shows up once the narrator starts writing replies is looked for once, early.
    const findTracker = !state.recipe.fields.length && !state.trackerTried && since >= 1;
    // An urgent development was offered: see whether it happened before offering it again, once per stretch.
    // The quick check answers this itself, so it is only needed without one.
    const urgent = !(settings.quick.enabled && this.decisionsReady()) && since >= 2 && full.reason !== 'Checking on an urgent development' && dueThreads(live.version.notebook, live.moment).some(d => d.thread.speed === 'urgent');
    const reason = state.needsCheck ? (state.needsCheck.startsWith('The chat changed') ? 'Caught up after the chat changed' : state.needsCheck) : unmatched ? 'The chat changed before the notebook was written' : extra ? extra : state.replan ? 'The story ran ahead of its plan' : moved ? 'The scene moved' : jumped ? 'Time moved on'
      : findTracker ? 'Looking for your preset’s tracker' : urgent ? 'Checking on an urgent development' : since >= settings.every ? `${since} replies since the last update` : '';
    if (findTracker) state.trackerTried = true;
    await this.save(state);
    if (reason && settings.connectionId || reason && this.ask) await this.startCheckup(chatId, reason).catch(() => null);
  }

  /**
   * Running ahead of the plan, counted by reply. Three signs within ten replies
   * ask for a re-plan of this part's timing, at most once per steady wait.
   */
  private paceSignal(state: ChatState, now: Moment, count: number) {
    const reply = now.reply ?? 0;
    state.paceSignals = [...state.paceSignals, ...Array.from({ length: Math.min(count, 3) }, () => reply)].slice(-12);
    const recent = state.paceSignals.filter(r => r > reply - 10).length;
    const gap = now.waits?.steady ?? 15;
    if (!state.replan && recent >= 3 && (!state.replannedAt || reply - state.replannedAt >= gap)) state.replan = true;
  }
  /** Hold mode lasts until the rework lands, or a few replies at most if it can't. */
  private reworking(state: ChatState, live: Live) { return state.resync !== null && (live.moment.reply ?? 0) - state.resync <= 6; }

  // ----- The quick check ----------------------------------------------------------
  private decisionsReady(): boolean {
    const host = (this.api as { host?: { capabilities?: Record<string, number> } }).host;
    return this.api.permissions.has('decisions') && (host?.capabilities?.['decisions-v1'] ?? 0) >= 1 && typeof this.api.decisions?.evaluate === 'function';
  }
  private decisionsReason(): string {
    const host = (this.api as { host?: { capabilities?: Record<string, number> } }).host;
    if ((host?.capabilities?.['decisions-v1'] ?? 0) < 1 || !this.api.decisions) return 'This version of Lumiverse doesn’t offer decision models. Update Lumiverse to use the quick check.';
    if (!this.api.permissions.has('decisions')) return 'Grant decisions in Lumiverse’s Extensions panel to use the quick check.';
    return '';
  }
  private runQuick(chatId: string, live: Live, settings: Settings) {
    this.quickRunning.add(chatId);
    const task = (async () => {
      const plan = quickQuestions(live.version.notebook, live.moment);
      const reply = live.turns.at(-1)!, player = [...live.turns].reverse().find(t => t.role === 'user');
      let result: DecisionResult | null = null, error = '';
      try {
        result = await this.api.decisions.evaluate({
          ...(settings.quick.connectionId ? { connection_id: settings.quick.connectionId } : {}), ...(settings.quick.model ? { model: settings.quick.model } : {}),
          state: quickState(live.version.notebook, live.clock, readable(splitOoc(player?.content ?? '').story, 2000), readable(reply.content, 8000)), questions: plan.questions,
          ...(this.userId ? { userId: this.userId } : {}),
        }, { signal: AbortSignal.timeout(35_000) });
      } catch (e) { error = quickError(e); }
      await this.serial(chatId, async () => {
        const state = await this.load(chatId);
        if (!state?.enabled || !state.versions.length) return;
        const messages = await this.api.chat.getMessages(chatId);
        let now = await this.live(state, messages);
        if (!now) return;
        state.quick = { at: Date.now(), ok: !!result, error };
        let extra = '', outcome: ReturnType<typeof applyQuick> | null = null;
        // The reply it judged must still be in the chat. A swipe or edit meanwhile means the answers are about a reply that is gone.
        if (result && covers(live.prints, now.prints)) {
          outcome = applyQuick(now.version.notebook, plan, result, now.moment);
          if (outcome.changed) {
            state.versions.push({ notebook: outcome.notebook, covered: live.prints, at: Date.now(), reason: 'Quick check', quick: true, ...(now.values.location ? { location: now.values.location } : {}) });
            state.versions = prune(state.versions);
            now = (await this.live(state, messages))!;
          }
          if (outcome.needsCheckup) extra = 'Something new happened in the story';
          if (outcome.rushing) this.paceSignal(state, now.moment, 1);
          if (outcome.held.length) state.held = [...new Set([...state.held, ...outcome.held])];
          // The story changed direction: hold old plans back and rework the notebook now.
          if (outcome.shifted) { state.resync = now.moment.reply ?? 0; extra = 'The story changed direction'; }
        }
        state.quickLog = [...state.quickLog, quickRecord(live.moment.reply ?? 0, result, outcome)].slice(-QUICK_LOG);
        // A check-up can't start while one runs; the next reply looks again.
        if (this.running.has(chatId)) { await this.save(state); return; }
        await this.decide(state, now, settings, extra);
      });
    })();
    this.track(task.catch(() => {}).finally(() => { this.quickRunning.delete(chatId); this.changed(); }));
  }
  /** A forked chat starts with a copy; history matching sorts out where they part. */
  async fork(sourceChatId: string, forkedChatId: string) {
    const source = await this.serial(sourceChatId, () => this.load(sourceChatId));
    if (!source?.versions.length) return;
    await this.serial(forkedChatId, async () => { await this.save({ ...structuredClone(source), chatId: forkedChatId, job: null }); });
  }
  dispose() { for (const controller of this.running.values()) controller.abort(); }
}
