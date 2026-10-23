import { describe, expect, test } from 'bun:test';
import { LORE_ROOM, mentions, pickLore, toEntry, type LoreEntry } from '../src/lore';

const entry = (id: string, keys: string[], content = `About ${id}.`, extra: Record<string, unknown> = {}) => toEntry({ id, comment: id, key: keys, content, ...extra }, id)!;

describe('lore', () => {
  test('skips disabled and empty entries, and names untitled ones by their keys', () => {
    expect(toEntry({ id: 'a', content: 'x', disabled: true }, 'a')).toBeNull();
    expect(toEntry({ id: 'a', content: '  ' }, 'a')).toBeNull();
    expect(toEntry({ id: 'a', key: ['Brackport', 'docks'], content: 'Wet.' }, 'a')!.title).toBe('Brackport, docks');
  });
  test('keys match whole words, ignoring case unless told otherwise', () => {
    const job = entry('jobs', ['Job']);
    expect(mentions(job, 'A new job came in.')).toBe(1);
    expect(mentions(job, 'He jobbed it.')).toBe(0);
    expect(mentions(entry('j2', ['Job'], 'x', { case_sensitive: true }), 'a job')).toBe(0);
    expect(mentions(entry('j3', ['mist'], 'x', { match_whole_words: false }), 'Mistwalk')).toBe(1);
    expect(mentions(entry('j4', ['/brack\\w+/i'], 'x', { use_regex: true }), 'BRACKPORT')).toBe(1);
  });
  test('rules first, then entries in play, then by how strongly the most important text mentions them', () => {
    const all: LoreEntry[] = [entry('rule', [], 'Always.', { constant: true }), entry('a', ['alpha']), entry('b', ['beta']), entry('c', ['gamma']), entry('d', ['delta'])];
    const lore = pickLore(all, ['beta', 'alpha beta'], new Set(['c']), LORE_ROOM.update);
    expect(lore.rules).toEqual(['rule: Always.']);
    expect(lore.entries).toEqual(['c: About c.', 'b: About b.', 'a: About a.']);
    expect(lore.index).toEqual(['d']);
  });
  test('stays within its room: big entries are cut, and the index counts what it leaves out', () => {
    const all = Array.from({ length: 400 }, (_, i) => entry(`An entry with a fairly long title, number ${i}`, [`k${i}`], 'x'.repeat(9000)));
    const lore = pickLore(all, [all.map((_, i) => `k${i}`).join(' ')], new Set(), LORE_ROOM.update);
    expect(lore.entries.every(e => e.length <= LORE_ROOM.update.entry)).toBe(true);
    expect(lore.entries.join('').length).toBeLessThanOrEqual(LORE_ROOM.update.entries);
    expect(lore.index.join('\n').length).toBeLessThanOrEqual(LORE_ROOM.update.index);
    expect(lore.entries.length + lore.index.length + lore.more).toBe(400);
  });
});
