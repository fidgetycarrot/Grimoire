/**
 * Tying the notebook to the chat it describes.
 *
 * Each saved notebook version records a fingerprint of every message it
 * covered (role and the active swipe's text, in order). If any of those
 * messages is edited, swiped, or deleted, that version no longer matches and
 * the newest version that still does is used instead. Fingerprints use text,
 * not message ids, so a forked chat matches its shared history.
 */
import { splitOoc, storyText } from './ooc';

/** ooc: a whole out-of-character message, or the narrator's answer to one. Not part of the story. */
export interface Turn { id: string; role: 'user' | 'assistant'; content: string; ooc?: true }
type Message = { id: string; role: string; content: string; index_in_chat: number };

export async function fingerprint(turn: Pick<Turn, 'role' | 'content'>): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${turn.role}\u0000${turn.content}`));
  return Array.from(new Uint8Array(bytes).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}
/** The conversation as the narrator sees it: user and assistant turns, in order, optionally without one message. Out-of-character exchanges are marked. */
export function conversation(messages: Message[], exclude?: string, isStory?: (reply: string) => boolean): Turn[] {
  const turns: Turn[] = messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== exclude)
    .sort((a, b) => a.index_in_chat - b.index_in_chat)
    .map(m => ({ id: m.id, role: m.role as Turn['role'], content: m.content }));
  // A whole out-of-character message, and the narrator's answer right after it, are outside the story.
  let outside = false;
  for (const turn of turns) {
    if (turn.role === 'user') { outside = splitOoc(turn.content).whole; if (outside) turn.ooc = true; }
    // "[ooc]: continue the story" gets a story reply; a reply carrying the preset's tracker is one.
    else if (outside) { if (!isStory?.(turn.content)) turn.ooc = true; outside = false; }
  }
  return turns;
}
/** The narrator's story replies: out-of-character answers don't count. */
export const storyReplies = (turns: Turn[]) => turns.filter(t => t.role === 'assistant' && !t.ooc);
/** A turn as words for a model, with out-of-character talk labeled so it is never taken as story events. */
export function told(turn: Turn, max: number): string {
  if (turn.role === 'user') return readable(storyText(turn.content), max);
  return turn.ooc ? `[Out of character, not part of the story] ${readable(turn.content, max)}` : readable(turn.content, max);
}
export async function fingerprints(turns: Turn[]): Promise<string[]> { return Promise.all(turns.map(fingerprint)); }
export function covers(covered: string[], current: string[]): boolean {
  return covered.length <= current.length && covered.every((print, i) => current[i] === print);
}
/** Newest version whose covered history is still the start of the current chat. */
export function newestMatching<T extends { covered: string[] }>(versions: T[], current: string[]): number {
  for (let i = versions.length - 1; i >= 0; i--) if (covers(versions[i].covered, current)) return i;
  return -1;
}

/**
 * Split a chat for writing a notebook: the recent part is sent as it is; a
 * long chat's earlier part is read first in parts, into a story-so-far record.
 * Parts are capped, so even a very long chat costs a bounded number of requests.
 */
export const RECENT = { turns: 40, chars: 60_000, perTurn: 8_000 } as const;
export const EARLIER = { part: 30_000, maxPart: 60_000, maxParts: 12, perTurn: 3_000 } as const;
export type Piece = { role: string; content: string };

const KEEP_ATTRIBUTE = /^(?!style$|class$|id$|color$|face$|size$|href$|src$|width$|height$|align$|data-|aria-|role$|on)[a-z][\w-]*$/i;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
/**
 * A message as words, for a model to read. Presets fill replies with styling,
 * panels, and markup; the story is the text. Style and script blocks go, tags
 * go but their text stays, and attributes that carry facts (a header's
 * location="…" or time="…") are kept as plain words. Then it is shortened.
 */
/**
 * Presets sometimes write odd space characters between words (braille blanks,
 * no-break or zero-width spaces). They look like spaces but don't match as
 * spaces, so anything that reads replies sees ordinary spaces instead.
 */
export const spaces = (text: string) => text.replace(/[\u2800\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ').replace(/[\u200b\u2060\ufeff]/g, '');
/**
 * A model's thinking, when the provider leaves it in the reply instead of a separate field (custom connections
 * often do, and presets ask for <thinking>, <thinking_mode>, and the like). It is plans and drafts, not story.
 */
const THINKING = /<((?:[\w-]*_)?think(?:ing)?(?:_[\w-]+)?|reasoning|ksc)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
const CLOSE_ONLY = /^[\s\S]*?<\/(?:(?:[\w-]*_)?think(?:ing)?(?:_[\w-]+)?|reasoning)\s*>/i;
export function withoutThinking(text: string): string {
  let s = text.replace(THINKING, ' ');
  // Some providers cut the opening tag and leave only the closing one: everything before it was thinking.
  if (CLOSE_ONLY.test(s) && !/<(?:[\w-]*_)?think|<reasoning/i.test(s.match(CLOSE_ONLY)![0].replace(/<\/[^>]*>$/, ''))) s = s.replace(CLOSE_ONLY, ' ');
  return s;
}
/**
 * Panels a preset adds after the story: stat blocks, HUDs, checklists, a group chat recapping the scene (Sola's
 * chatterbox even replays the player's older lines). They aren't story, and replayed lines read as new events.
 * When a reply is prose followed only by tagged blocks, the blocks are left out. The tracker reads its own
 * panel straight from the reply, so time and place still work. A reply whose story itself sits in a tag has
 * too little prose before the blocks, and is read whole.
 */
const INLINE = new Set(['font', 'b', 'i', 'u', 's', 'em', 'strong', 'span', 'small', 'big', 'sup', 'sub', 'a', 'br', 'q', 'code', 'mark', 'del', 'ins', 'abbr', 'cite', 'kbd', 'img', 'hr']);
const PROSE_BEFORE_PANELS = 300;
export function withoutPanels(text: string): string {
  const blocks: Array<{ start: number; end: number }> = [];
  const open = /(^|\n)[ \t]*<([a-z][\w:-]*)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text))) {
    const name = m[2].toLowerCase(), start = m.index + m[1].length;
    if (INLINE.has(name) || blocks.some(b => start < b.end)) continue;
    // The matching close, allowing the same tag nested inside.
    const tags = new RegExp(`<(/?)${name.replace(/[-:]/g, '\\$&')}\\b[^>]*>`, 'gi');
    tags.lastIndex = open.lastIndex;
    let depth = 1, t: RegExpExecArray | null, end = -1;
    while ((t = tags.exec(text))) { depth += t[1] ? -1 : t[0].endsWith('/>') ? 0 : 1; if (!depth) { end = t.index + t[0].length; break; } }
    if (end < 0) continue;
    blocks.push({ start, end });
    open.lastIndex = end;
  }
  // The longest run of blocks at the end, with nothing but blank lines or rules between them.
  const filler = (s: string) => !s.replace(/[\s\-–—_*=~#]+/g, '');
  let tail = text.length;
  for (const b of [...blocks].reverse()) { if (!filler(text.slice(b.end, tail))) break; tail = b.start; }
  if (tail === text.length) return text;
  const prose = text.slice(0, tail);
  return prose.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length >= PROSE_BEFORE_PANELS ? prose : text;
}
export function readable(text: string, max: number): string {
  let s = withoutPanels(withoutThinking(spaces(text))).replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<([a-z][\w:-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gi, (_, tag: string, attrs: string) => {
    const facts = [...attrs.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .filter(m => KEEP_ATTRIBUTE.test(m[1]) && (m[2] ?? m[3] ?? m[4] ?? '').trim()).map(m => `${m[1]}: ${(m[2] ?? m[3] ?? m[4]).trim()}`);
    return facts.length ? ` [${tag} ${facts.join('; ')}] ` : ' ';
  }).replace(/<\/[a-z][\w:-]*\s*>/gi, ' ');
  s = s.replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
export function planHistory(turns: Turn[]): { recent: Piece[]; earlier: Piece[][] } {
  const recent: Piece[] = []; let room: number = RECENT.chars, start = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const piece = told(turns[i], RECENT.perTurn);
    if (piece.length > room || recent.length >= RECENT.turns) break;
    recent.unshift({ role: turns[i].role, content: piece }); room -= piece.length; start = i;
  }
  const before = turns.slice(0, start);
  if (!before.length) return { recent, earlier: [] };
  const clean = before.map(t => ({ role: t.role, content: told(t, EARLIER.perTurn) }));
  const total = clean.reduce((sum, t) => sum + t.content.length, 0);
  let size = Math.min(Math.max(EARLIER.part, Math.ceil(total / EARLIER.maxParts)), EARLIER.maxPart), perTurn: number = EARLIER.perTurn;
  const split = () => {
    const parts: Piece[][] = []; let part: Piece[] = [], used = 0;
    for (const turn of clean) {
      const piece = turn.content.length > perTurn ? `${turn.content.slice(0, perTurn - 1)}…` : turn.content;
      if (part.length && used + piece.length > size) { parts.push(part); part = []; used = 0; }
      part.push({ role: turn.role, content: piece }); used += piece.length;
    }
    if (part.length) parts.push(part);
    return parts;
  };
  // A chat too long even for the largest parts is read with each message shortened, then with larger parts.
  let earlier = split();
  while (earlier.length > EARLIER.maxParts) {
    if (perTurn > 300) perTurn = Math.max(300, Math.floor(perTurn * 0.85)); else size = Math.ceil(size * 1.2);
    earlier = split();
  }
  return { recent, earlier };
}
