/**
 * Reading lorebooks, including big setting books with hundreds of entries,
 * without sending all of them.
 *
 * Grimoire gets three things:
 * - rules: the always-on entries, which the narrator always sees too;
 * - entries: the full text of the entries that matter right now: the ones the
 *   narrator has in play, then the ones closest in meaning to the chat and to
 *   the notebook's own plans (or, without embeddings, the ones whose keywords
 *   or chapter names they mention);
 * - index: the titles of everything else, grouped by chapter, so Grimoire
 *   knows the whole world exists and can plan toward parts the player hasn't
 *   seen yet. Once a plan heads there, those entries come in at the next check-up.
 */
export interface LoreEntry {
  id: string; title: string; keys: string[]; content: string; constant: boolean; caseSensitive: boolean; wholeWords: boolean; regex: boolean;
  /** The chapter the title names ("Brackport" in "Brackport – Walkways"), or empty. */ chapter: string;
  /** The rest of the title, for the index. */ section: string;
}
export interface Lore { rules: string[]; entries: string[]; index: string[]; /** Entries left out of the index for room. */ more: number }
export interface LoreRoom { rules: number; rule: number; entries: number; entry: number; index: number; /** Fill leftover room with the rest of the book, most relevant first, so the first plan sees the world broadly. */ fill?: boolean }

/**
 * In characters (about four to a token). The first notebook is where the
 * story is set up, so it reads widely: up to about 40,000 tokens. Check-ups
 * and talk keep to what they need: about 9,000.
 */
export const LORE_ROOM: Record<'create' | 'update', LoreRoom> = {
  create: { rules: 24_000, rule: 6_000, entries: 130_000, entry: 8_000, index: 16_000, fill: true },
  update: { rules: 15_000, rule: 3_000, entries: 14_000, entry: 3_000, index: 6_000 },
};
export const NO_LORE: Lore = { rules: [], entries: [], index: [], more: 0 };
export const hasLore = (lore: Lore) => lore.rules.length + lore.entries.length + lore.index.length > 0;

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const strings = (v: unknown) => Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string').map(k => k.trim()).filter(Boolean) : [];
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "Brackport – Walkways, Bridges" → chapter "Brackport", section "Walkways, Bridges". */
function chapterOf(title: string): { chapter: string; section: string } {
  const m = /^(.{2,60}?)\s+[–—-]\s+(.+)$/.exec(title) ?? /^(.{2,40}?):\s+(.+)$/.exec(title);
  return m ? { chapter: m[1].trim(), section: m[2].trim() } : { chapter: '', section: title };
}

/** One host entry, or null for a disabled or empty one. */
export function toEntry(raw: unknown, fallbackId: string): LoreEntry | null {
  const e = record(raw);
  if (e.disabled === true || e.disable === true) return null;
  const content = typeof e.content === 'string' ? e.content.trim() : '';
  if (!content) return null;
  const keys = strings(e.key ?? e.keys);
  const comment = typeof e.comment === 'string' ? oneLine(e.comment) : '';
  const title = comment || keys.slice(0, 3).join(', ') || oneLine(content).slice(0, 60);
  return {
    id: typeof e.id === 'string' && e.id ? e.id : fallbackId,
    title, keys, content, constant: e.constant === true,
    caseSensitive: e.case_sensitive === true, wholeWords: e.match_whole_words !== false, regex: e.use_regex === true,
    ...chapterOf(title),
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (s: string, caseSensitive = false) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(s)}(?![\\p{L}\\p{N}])`, `u${caseSensitive ? '' : 'i'}`);
function matcher(key: string, entry: LoreEntry): RegExp | null {
  try {
    if (entry.regex) { const m = /^\/(.+)\/([a-z]*)$/s.exec(key); return m ? new RegExp(m[1], m[2].replace(/[gy]/g, '')) : new RegExp(key, entry.caseSensitive ? '' : 'i'); }
    return entry.wholeWords ? word(key, entry.caseSensitive) : new RegExp(escape(key), `u${entry.caseSensitive ? '' : 'i'}`);
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
 * chat first, say); `active` is the entries the narrator has in play now;
 * `meaning`, when embeddings are available, is how close each entry is in
 * meaning to the chat and the plans.
 */
export function pickLore(all: LoreEntry[], focus: string[], active: ReadonlySet<string>, room: LoreRoom, meaning?: ReadonlyMap<string, number>): Lore {
  const used = new Set<string>();
  const rules: string[] = [], entries: string[] = [];
  let left = room.rules;
  for (const entry of all.filter(e => e.constant)) {
    const piece = `${entry.title}: ${entry.content}`.slice(0, room.rule);
    if (piece.length > left) continue;
    rules.push(piece); used.add(entry.id); left -= piece.length;
  }
  // Without embeddings, a chapter named in the text counts a little: it points at the right part of the book, not the right section.
  const chapters = new Map<string, number[]>();
  if (!meaning) for (const chapter of new Set(all.map(e => e.chapter).filter(c => c.length >= 4))) chapters.set(chapter, focus.map(text => word(chapter).test(text) ? 1 : 0));
  const scored = all.filter(e => !e.constant).map((entry, order) => {
    let score = active.has(entry.id) ? 1000 : 0;
    focus.forEach((text, i) => { score += mentions(entry, text) * (focus.length - i); });
    if (meaning) score += (meaning.get(entry.id) ?? 0) * 10;
    else focus.forEach((_, i) => { score += (chapters.get(entry.chapter)?.[i] ?? 0) * (focus.length - i) * 0.25; });
    return { entry, order, score };
  });
  const ranked = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
  const rest = room.fill ? scored.filter(s => s.score <= 0).sort((a, b) => a.order - b.order) : [];
  left = room.entries;
  for (const { entry } of [...ranked, ...rest]) {
    const piece = `${entry.title}: ${entry.content}`.slice(0, room.entry);
    if (piece.length > left) continue;
    entries.push(piece); used.add(entry.id); left -= piece.length;
  }
  return { rules, entries, ...indexOf(all.filter(e => !used.has(e.id)), room.index) };
}

/**
 * The titles left over, grouped by chapter ("Brackport: Walkways; Docks").
 * If they don't all fit, each chapter lists as many sections as its share of
 * the room allows, then how many more it has.
 */
function indexOf(left: LoreEntry[], room: number): { index: string[]; more: number } {
  const groups = new Map<string, LoreEntry[]>();
  for (const entry of left) { const key = entry.chapter || entry.title; groups.set(key, [...(groups.get(key) ?? []), entry]); }
  const line = (name: string, list: LoreEntry[], cap: number) => {
    if (list.length === 1 && !list[0].chapter) return list[0].title.slice(0, Math.min(90, cap));
    let text = `${name}: `, shown = 0;
    for (const e of list) {
      const part = `${shown ? '; ' : ''}${e.section.slice(0, 60)}`, tail = ` (and ${list.length - shown - 1} more)`;
      if (text.length + part.length + (shown + 1 < list.length ? tail.length : 0) > cap) break;
      text += part; shown++;
    }
    return shown === list.length ? text : shown ? `${text} (and ${list.length - shown} more)` : `${name} (${list.length} ${list.length === 1 ? 'section' : 'sections'})`;
  };
  const all = [...groups];
  const full = all.map(([name, list]) => line(name, list, 10_000));
  const lines = full.join('\n').length <= room ? full : all.map(([name, list]) => line(name, list, Math.max(40, Math.floor(room / all.length) - 1)));
  const index: string[] = [];
  let more = 0, used = 0;
  all.forEach(([, list], i) => {
    if (used + lines[i].length + 1 > room) { more += list.length; return; }
    index.push(lines[i]); used += lines[i].length + 1;
  });
  return { index, more };
}
