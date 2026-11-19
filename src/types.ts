import type { Look } from './look';
import type { StoryClock } from './clock';
import type { JobTrace } from './trace';
import type { MysteryView } from './mystery';
import type { ClockSources } from './note';
import type { Notebook, Pace, Preferences, WaitSetting } from './notebook';
import type { ReasoningMode } from './model';
import type { FieldCheck, Recipe } from './tracker';
import type { Glance, SkipOffer } from './skip';
import type { TomeView } from './tome';

export const EXTENSION_ID = 'lumiverse_grimoire';
export const VERSION = '0.39.1';
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
  /** Something the quick check noticed that can wait: it runs once a few replies have passed since the last check-up. */
  queued: string;
  /** The reply each person was last in a scene, by person id, so people who have been away a while can come back. */
  seen: Record<string, number>;
  /** The reply someone new last turned up in a scene. */
  newFaceAt: number;
  /** The building the story was last in, by id, so a place that names only a room is found in it. */
  building: string;
  /** A check-up has already looked for a tracker that appeared after the notebook was written. */
  trackerTried: boolean;
  /** The last quick check: when it ran and whether it worked. */
  quick: { at: number; ok: boolean; error: string } | null;
  /** The reply count when the player last waved off a time-skip suggestion. */
  skipDismissedAt: number;
  /** Threads the quick check found no longer fit for now; left out of the note until a check-up decides. */
  held: string[];
  /** Due steps the quick check found could not believably reach the player in the scene as it stands (a locked or private room, somewhere they could not be). They wait for the scene to open up. */
  blocked?: string[];
  /** The codeword's last deep look: the player message it answers (id and fingerprint) and its plan, so a swipe reuses it. */
  look?: { key: string; look: Look; at: number };
  /** How many check-ups this chat has had, to send every few to the main connection for a full review. */
  checkups?: number;
  /** Due steps whose moment the quick check saw in the latest reply, which the reply didn't take: the next reply should. */
  open?: string[];
  /** Steps whose moment was there two replies running and was passed both times. */
  missed?: string[];
  /** How long recent notebook jobs' model requests took (sizes and times only), newest last. */
  traces?: JobTrace[];
  /** The reply count when the story changed direction; the next check-up reworks the notebook. Null when none is due. */
  resync: number | null;
  /** The quick check's recent answers as plain numbers, for checking how it judges. No story text. */
  quickLog: QuickRecord[];
  /** Replies where the story ran ahead of its plan (a step happened before it was offered, or the quick check saw rushing). */
  paceSignals: number[];
  /** A re-plan of this part's timing is due at the next check-up. */
  replan: boolean;
  /** The reply of the last re-plan, so they stay rare. */
  replannedAt: number;
  /** Fingerprints of replies the quick check found were intimate scenes. They don't count toward moving storylines along. */
  intimate: string[];
  /** The latest reply is an intimate scene still going on. */
  intimateNow: boolean;
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
  reply: number; at: number; ok: boolean; /** Fixed wording for why it didn't run. */ error?: string;
  answers: Record<string, number | { choice: string; confidence: number }>;
  marked: number; checkup: boolean; shifted: boolean; held: number;
  /** The note for this reply offered nothing (an intimate scene it was protecting), so it says nothing about whether the narrator listens. */ quiet?: true;
  /** The due steps asked about, in question order (due_1 is the first). */ steps?: string[];
  /** Steps whose moment the reply left open: the next note offers them. */ open?: string[];
}
export const QUICK_LOG = 40;
export interface PlayerNote { id: string; text: string; at: number }
export const TALK_LIMITS = { message: 1000, ideas: 3000, lines: 40, notes: 8, note: 200 } as const;
/** The quick check after each reply. An empty connection means the default decision connection; an empty model means the connection's model. */
export interface QuickSettings { enabled: boolean; connectionId: string; model: string }
export interface Settings { connectionId: string; /** Tried when the main connection declines a request. */ backupId: string; maxOutputTokens: number; reasoningMode: ReasoningMode; /** Thinking for check-ups only: they are bookkeeping, and thinking is most of their cost. */ checkupReasoning?: ReasoningMode; /** A cheaper connection for routine check-ups; empty uses the main one. Big moments and every few check-ups still use the main one. */ checkupConnectionId?: string; /** Another model for routine check-ups, by its exact ID, on the check-up connection (or the main one). Empty uses the connection's own model. */ checkupModel?: string; /** Seconds the reply waits for the codeword's deep look before going ahead without it. */ lookWait?: number; every: number; quick: QuickSettings; /** The most replies a planned development waits, as a size. */ wait: WaitSetting; /** List chats with a notebook on the home page. */ homeList: boolean; /** During intimate scenes: keep the story out until they end, or let urgent things in. */ intimate: 'protect' | 'allow'; /** Add Lumiverse's memories to the note when the preset doesn't already. */ memories: boolean; /** Show the Paged Relic Tome chronicle card under the latest assistant reply. */ replyCard?: boolean; /** The connection Read the Room uses for its plain retelling; empty uses Grimoire's own. */ roomConnectionId?: string; /** A different model on that connection, by its exact ID; empty uses the connection's. */ roomModel?: string }
export const DEFAULT_SETTINGS: Settings = { connectionId: '', backupId: '', maxOutputTokens: 16000, reasoningMode: 'inherit', checkupReasoning: 'low', checkupConnectionId: '', checkupModel: '', lookWait: 15, every: 8, quick: { enabled: false, connectionId: '', model: '' }, wait: 'medium', homeList: true, intimate: 'protect', memories: true, replyCard: true };
export const DEFAULT_PREFERENCES: Preferences = { tone: 'balanced', twist: true, shape: 'auto', lockShape: false, size: 'auto' };

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
  /** This part of the story has nothing left to happen: a new chapter is offered. */
  spent: boolean;
  /** Of recent replies where the note asked for a due step now, how many showed it. */ follow: { offered: number; used: number } | null; /** Of recent replies with someone who had been slipping, how many had them sound like themselves again. */ voices?: { asked: number; landed: number } | null;
  /** How long recent notebook jobs' requests took. */ traces?: JobTrace[];
  /** Where the story stands, for the player. */ recap: string;
  /** The mystery as the player may see it: the question and the clues they have found. Never the answer. */ mystery?: MysteryView | null;
  /** How much Lumiverse's Memory Cortex holds for this chat, and what the last reply got from it. Counts only. */
  memory?: MemoryView | null;
  /** The spoiler-safe Relic Tome chronicle card attached beneath the latest assistant reply. */
  tome?: TomeView | null;
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

/** Job labels for a new chapter, so the panel can show its progress where the button is. */
export const CHAPTER_WORKING = 'Starting a new chapter';
/** A mystery story whose mystery could not be written: the notebook is kept without one. */
export const NO_MYSTERY = 'Notebook ready, without the mystery';
export const CHAPTER_DONE = 'New chapter ready';

export interface MemoryView {
  people: number; ties: number; summaries: number;
  /** The last reply: how many memories were found, and where they went. */
  last: { at: number; found: number; to: 'note' | 'preset' | 'none' | 'off' | 'error' } | null;
}
