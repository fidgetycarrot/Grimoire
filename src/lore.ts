/**
 * Reading lorebooks, including big setting books with a hundred or more
 * entries, without sending all of them.
 *
 * Grimoire gets three things:
 * - rules: the always-on entries, which the narrator always sees too;
 * - entries: the full text of the entries that matter right now (the ones the
 *   narrator has in play, then the ones the card, the chat, or the notebook's
 *   own plans mention);
 * - index: the titles of everything else, so Grimoire knows the whole world
 *   exists and can plan toward parts of it the player hasn't seen yet. Once the
 *   plan mentions one of them, its full entry comes in at the next check-up.
 */
export interface LoreEntry { id: string; title: string; keys: string[]; content: string; constant: boolean; caseSensitive: boolean; wholeWords: boolean; regex: boolean }
export interface Lore { rules: string[]; entries: string[]; index: string[]; /** Titles left out of the index for room. */ more: number }
export interface LoreRoom { rules: number; rule: number; entries: number; entry: number; index: number }

/** In characters. Writing a notebook reads more; check-ups and talk keep to what they need. */
export const LORE_ROOM: Record<'create' | 'update', LoreRoom> = {
  create: { rules: 16_000, rule: 4_000, entries: 32_000, entry: 6_000, index: 10_000 },
  update: { rules: 15_000, rule: 3_000, entries: 10_000, entry: 4_000, index: 9_000 },
};
export const NO_LORE: Lore = { rules: [], entries: [], index: [], more: 0 };
export const hasLore = (lore: Lore) => lore.rules.length + lore.entries.length + lore.index.length > 0;

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const strings = (v: unknown) => Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string').map(k => k.trim()).filter(Boolean) : [];
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** One host entry, or null for a disabled or empty one. */
export function toEntry(raw: unknown, fallbackId: string): LoreEntry | null {
  const e = record(raw);
  if (e.disabled === true || e.disable === true) return null;
  const content = typeof e.content === 'string' ? e.content.trim() : '';
  if (!content) return null;
  const keys = strings(e.key ?? e.keys);
  const comment = typeof e.comment === 'string' ? oneLine(e.comment) : '';
  return {
    id: typeof e.id === 'string' && e.id ? e.id : fallbackId,
    title: comment || keys.slice(0, 3).join(', ') || oneLine(content).slice(0, 60),
    keys, content, constant: e.constant === true,
    caseSensitive: e.case_sensitive === true, wholeWords: e.match_whole_words !== false, regex: e.use_regex === true,
  };
}

function matcher(key: string, entry: LoreEntry): RegExp | null {
  try {
    if (entry.regex) { const m = /^\/(.+)\/([a-z]*)$/s.exec(key); return m ? new RegExp(m[1], m[2].replace(/[gy]/g, '')) : new RegExp(key, entry.caseSensitive ? '' : 'i'); }
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(entry.wholeWords ? `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])` : escaped, `u${entry.caseSensitive ? '' : 'i'}`);
  } catch { return null; }
}
/** How many of the entry's keys appear in the text. */
export function mentions(entry: LoreEntry, text: string): number {
  if (!text) return 0;
  let found = 0;
  for (const key of entry.keys) { const m = matcher(key, entry); if (m?.test(text)) found++; }
  return found;
}

/**
 * Choose what to send. `focus` is texts in order of importance (the newest
 * chat first, say); `active` is the entries the narrator has in play now.
 */
export function pickLore(all: LoreEntry[], focus: string[], active: ReadonlySet<string>, room: LoreRoom): Lore {
  const used = new Set<string>();
  const rules: string[] = [], entries: string[] = [];
  let left = room.rules;
  for (const entry of all.filter(e => e.constant)) {
    const piece = `${entry.title}: ${entry.content}`.slice(0, room.rule);
    if (piece.length > left) continue;
    rules.push(piece); used.add(entry.id); left -= piece.length;
  }
  const scored = all.filter(e => !e.constant).map((entry, order) => {
    let score = active.has(entry.id) ? 1000 : 0;
    focus.forEach((text, i) => { score += mentions(entry, text) * (focus.length - i); });
    return { entry, order, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
  left = room.entries;
  for (const { entry } of scored) {
    const piece = `${entry.title}: ${entry.content}`.slice(0, room.entry);
    if (piece.length > left) continue;
    entries.push(piece); used.add(entry.id); left -= piece.length;
  }
  const index: string[] = [];
  let more = 0;
  left = room.index;
  for (const entry of all) {
    if (used.has(entry.id)) continue;
    const line = entry.title.slice(0, 90);
    if (line.length + 1 > left) { more++; continue; }
    index.push(line); left -= line.length + 1;
  }
  return { rules, entries, index, more };
}
