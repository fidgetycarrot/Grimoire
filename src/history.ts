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
