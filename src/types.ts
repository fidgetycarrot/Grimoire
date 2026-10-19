import type { StoryClock } from './clock';
import type { ClockSources } from './note';
import type { Notebook, Pace, Preferences, WaitSetting } from './notebook';
import type { ReasoningMode } from './model';
import type { FieldCheck, Recipe } from './tracker';
import type { Glance, SkipOffer } from './skip';

export const EXTENSION_ID = 'lumiverse_grimoire';
export const VERSION = '0.8.0';
export const MAX_VERSIONS = 16;

/** One saved state of the notebook and the chat history it describes. */
export interface Version { notebook: Notebook; covered: string[]; at: number; reason: string; location?: string; /** Made by a quick check, not a full check-up. */ quick?: true }
export interface Job { id: string; kind: 'create' | 'checkup' | 'talk'; status: 'running' | 'complete' | 'failed'; label: string; error?: string; startedAt: number; /** Chat length when it failed, so automatic retries wait a little. */ failedAtTurn?: number }
export interface ChatState {
  version: 1; chatId: string; enabled: boolean; pace: Pace; preferences: Preferences;
  versions: Version[]; recipe: Recipe; checks: FieldCheck[];
  /** Hours of a time skip still to mention to the narrator. */
  skipHours: number;
  /** How many turns the chat had when the skip was made; cleared once a reply follows. */
  skipTurn: number;
  /** Why the next check-up should run soon, if anything. */
  needsCheck: string;
  /** A check-up has already looked for a tracker that appeared after the notebook was written. */
  trackerTried: boolean;
  /** The last quick check: when it ran and whether it worked. */
  quick: { at: number; ok: boolean; error: string } | null;
  /** The reply count when the player last waved off a time-skip suggestion. */
  skipDismissedAt: number;
  /** Threads the quick check found no longer fit for now; left out of the note until a check-up decides. */
  held: string[];
  /** The reply count when the story changed direction; the next check-up reworks the notebook. Null when none is due. */
  resync: number | null;
  /** The quick check's recent answers as plain numbers, for checking how it judges. No story text. */
  quickLog: QuickRecord[];
  /** Talking to Grimoire: the recent conversation, newest last. */
  talk: TalkLine[];
  /** Standing wishes the player pinned. They steer every check-up and the narrator note. */
  notes: PlayerNote[];
  job: Job | null; updatedAt: number;
}
/** One message in the talk with Grimoire. Grimoire's lines are written to be spoiler-free. */
export interface TalkLine {
  from: 'you' | 'grimoire'; text: string; at: number;
  /** Your message asked to pin what it says as a lasting note. */
  keep?: true;
  /** Grimoire asked a question back instead of acting. */
  asked?: true;
  /** What changed in the plans, as shapes and counts made by code. */
  changes?: string[];
  /** The notebook version this answer made, so it can be undone while it is the newest. */
  versionAt?: number;
  /** The note this answer pinned. */
  noteId?: string;
  /** Hours a new chapter jumped ahead, so undo can take the jump back. */
  skipHours?: number;
  undone?: true;
}
/**
 * One quick check: the probability for each yes-or-no question, keyed by
 * question (like due_1 or new_turn), and the scene choice with its confidence.
 */
export interface QuickRecord {
  reply: number; at: number; ok: boolean;
  answers: Record<string, number | { choice: string; confidence: number }>;
  marked: number; checkup: boolean; shifted: boolean; held: number;
}
export const QUICK_LOG = 40;
export interface PlayerNote { id: string; text: string; at: number }
export const TALK_LIMITS = { message: 1000, lines: 40, notes: 8, note: 200 } as const;
/** The quick check after each reply. An empty connection means the default decision connection; an empty model means the connection's model. */
export interface QuickSettings { enabled: boolean; connectionId: string; model: string }
export interface Settings { connectionId: string; maxOutputTokens: number; reasoningMode: ReasoningMode; every: number; placement: 'auto' | 'macro'; quick: QuickSettings; /** The most replies a planned development waits, as a size. */ wait: WaitSetting; /** List chats with a notebook on the home page. */ homeList: boolean }
export const DEFAULT_SETTINGS: Settings = { connectionId: '', maxOutputTokens: 16000, reasoningMode: 'inherit', every: 8, placement: 'auto', quick: { enabled: false, connectionId: '', model: '' }, wait: 'medium', homeList: true };
export const DEFAULT_PREFERENCES: Preferences = { tone: 'balanced', twist: true };

export interface ChatView {
  chatId: string; name: string; supported: boolean; reason: string;
  enabled: boolean; pace: Pace; preferences: Preferences; hasNotebook: boolean;
  summary: string; clock: StoryClock | null; clockText: string; sources: ClockSources | null;
  checks: FieldCheck[]; needsCheck: string; job: Job | null; updatedAt: number; repliesSinceCheck: number; skipHours: number;
  /** Shown only behind the spoiler fold. */
  notebook: Notebook | null; behind: boolean;
  /** Before a notebook exists: how many parts of a long chat are read first, one request each. */
  earlierParts: number;
  quick: ChatState['quick'];
  /** Threads whose next step is due now, for the spoiler fold. */
  dueIds: string[];
  /** A time skip worth suggesting because the scene has gone quiet, or null. */
  skipOffer: SkipOffer | null;
  /** Shapes and counts only, for the spoiler-free glance. */
  glance: Glance | null;
  /** The story changed direction and Grimoire is reworking its plans. */
  reworking: boolean;
  talk: TalkLine[]; notes: PlayerNote[]; quickLog: QuickRecord[];
  /** The newest answer changed the notebook and nothing came after it, so it can be undone. */
  canUndo: boolean;
}
/** A chat with a notebook, for the home page and the drawer. Names and times only. */
export interface StoryListing { chatId: string; character: string; chatName: string; playedAt: number; enabled: boolean }
export interface Snapshot {
  version: string; permissions: string[]; connections: Array<{ id: string; name: string; model: string }>;
  settings: Settings; chat: ChatView | null; notice: string;
  /** Decision models for the quick check: whether this Lumiverse offers them, and the saved connections. */
  decisions: { available: boolean; reason: string; connections: Array<{ id: string; name: string; provider: string; model: string; isDefault: boolean }> };
}
export type { StoryClock, Notebook, Pace, Preferences, FieldCheck, Recipe };
