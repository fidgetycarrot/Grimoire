/**
 * Tying the notebook to the chat it describes.
 *
 * Each saved notebook version records a fingerprint of every message it
 * covered (role and the active swipe's text, in order). If any of those
 * messages is edited, swiped, or deleted, that version no longer matches and
 * the newest version that still does is used instead. Fingerprints use text,
 * not message ids, so a forked chat matches its shared history.
 */
export interface Turn { id: string; role: 'user' | 'assistant'; content: string }
type Message = { id: string; role: string; content: string; index_in_chat: number };

export async function fingerprint(turn: Pick<Turn, 'role' | 'content'>): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${turn.role}\u0000${turn.content}`));
  return Array.from(new Uint8Array(bytes).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}
/** The conversation as the narrator sees it: user and assistant turns, in order, optionally without one message. */
export function conversation(messages: Message[], exclude?: string): Turn[] {
  return messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== exclude)
    .sort((a, b) => a.index_in_chat - b.index_in_chat)
    .map(m => ({ id: m.id, role: m.role as Turn['role'], content: m.content }));
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
export const RECENT = { turns: 40, chars: 40_000, perTurn: 4_000 } as const;
export const EARLIER = { part: 30_000, maxPart: 60_000, maxParts: 12, perTurn: 3_000 } as const;
export type Piece = { role: string; content: string };
export function planHistory(turns: Turn[]): { recent: Piece[]; earlier: Piece[][] } {
  const recent: Piece[] = []; let room: number = RECENT.chars, start = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const piece = turns[i].content.slice(0, RECENT.perTurn);
    if (piece.length > room || recent.length >= RECENT.turns) break;
    recent.unshift({ role: turns[i].role, content: piece }); room -= piece.length; start = i;
  }
  const before = turns.slice(0, start);
  if (!before.length) return { recent, earlier: [] };
  const total = before.reduce((sum, t) => sum + Math.min(t.content.length, EARLIER.perTurn), 0);
  let size = Math.min(Math.max(EARLIER.part, Math.ceil(total / EARLIER.maxParts)), EARLIER.maxPart), perTurn: number = EARLIER.perTurn;
  const split = () => {
    const parts: Piece[][] = []; let part: Piece[] = [], used = 0;
    for (const turn of before) {
      const piece = turn.content.slice(0, perTurn);
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
