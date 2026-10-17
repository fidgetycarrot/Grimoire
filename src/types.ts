import type { StoryClock } from './clock';
import type { ClockSources } from './note';
import type { Notebook, Pace, Preferences } from './notebook';
import type { ReasoningMode } from './model';
import type { FieldCheck, Recipe } from './tracker';

export const EXTENSION_ID = 'lumiverse_grimoire';
export const VERSION = '0.1.3';
export const MAX_VERSIONS = 12;

/** One saved state of the notebook and the chat history it describes. */
export interface Version { notebook: Notebook; covered: string[]; at: number; reason: string; location?: string }
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
  job: Job | null; updatedAt: number;
}
export interface Settings { connectionId: string; maxOutputTokens: number; reasoningMode: ReasoningMode; every: number; placement: 'auto' | 'macro' }
export const DEFAULT_SETTINGS: Settings = { connectionId: '', maxOutputTokens: 16000, reasoningMode: 'inherit', every: 8, placement: 'auto' };
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
}
export interface Snapshot {
  version: string; permissions: string[]; connections: Array<{ id: string; name: string; model: string }>;
  settings: Settings; chat: ChatView | null; notice: string;
}
export type { StoryClock, Notebook, Pace, Preferences, FieldCheck, Recipe };
