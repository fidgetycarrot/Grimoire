import type { StoryClock } from './clock';
import type { ClockSources } from './note';
import type { Notebook, Pace, Preferences } from './notebook';
import type { ReasoningMode } from './model';
import type { FieldCheck, Recipe } from './tracker';

export const EXTENSION_ID = 'lumiverse_grimoire';
export const VERSION = '0.2.1';
export const MAX_VERSIONS = 16;

/** One saved state of the notebook and the chat history it describes. */
export interface Version { notebook: Notebook; covered: string[]; at: number; reason: string; location?: string; /** Made by a quick check, not a full check-up. */ quick?: true }
export interface Job { id: string; kind: 'create' | 'checkup'; status: 'running' | 'complete' | 'failed'; label: string; error?: string; startedAt: number; /** Chat length when it failed, so automatic retries wait a little. */ failedAtTurn?: number }
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
  job: Job | null; updatedAt: number;
}
/** The quick check after each reply. An empty connection means the default decision connection; an empty model means the connection's model. */
export interface QuickSettings { enabled: boolean; connectionId: string; model: string }
export interface Settings { connectionId: string; maxOutputTokens: number; reasoningMode: ReasoningMode; every: number; placement: 'auto' | 'macro'; quick: QuickSettings }
export const DEFAULT_SETTINGS: Settings = { connectionId: '', maxOutputTokens: 16000, reasoningMode: 'inherit', every: 8, placement: 'auto', quick: { enabled: false, connectionId: '', model: '' } };
export const DEFAULT_PREFERENCES: Preferences = { length: 'medium', tone: 'balanced', twist: true };

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
}
export interface Snapshot {
  version: string; permissions: string[]; connections: Array<{ id: string; name: string; model: string }>;
  settings: Settings; chat: ChatView | null; notice: string;
  /** Decision models for the quick check: whether this Lumiverse offers them, and the saved connections. */
  decisions: { available: boolean; reason: string; connections: Array<{ id: string; name: string; provider: string; model: string; isDefault: boolean }> };
}
export type { StoryClock, Notebook, Pace, Preferences, FieldCheck, Recipe };
