import { describe, expect, test } from 'bun:test';
import { toEntry } from '../src/lore';
import { MeaningIndex } from '../src/meaning';
import { fakeEmbed } from './fixtures';

const entry = (id: string, title: string, content: string, extra: Record<string, unknown> = {}) => toEntry({ id, comment: title, content, ...extra }, id)!;

describe('finding lore by meaning', () => {
  const book = [
    entry('rule', 'Core – Rules', 'Always on.', { constant: true }),
    entry('debt', 'Economy – Debt and Credit', 'Debts are owed to lenders; unpaid debts bring collectors and interest.'),
    entry('bridge', 'Geography – Bridges', 'Four crossings span the canyon; bridge wardens collect tolls.'),
    entry('food', 'Food and Drink – Stews', 'Taverns serve thick stews with bread.'),
  ];
  test('the closest entry wins, and each entry is embedded once', async () => {
    const { embed, calls } = fakeEmbed();
    const index = new MeaningIndex(embed);
    const first = await index.scores(book, [{ text: 'He owes a debt to the lenders and the collectors are coming.', weight: 1 }]);
    expect([...first].sort((a, b) => b[1] - a[1])[0][0]).toBe('debt');
    expect(first.has('rule')).toBe(false);
    expect(calls).toEqual([{ kind: 'query', count: 1 }, { kind: 'passage', count: 3 }]);
    await index.scores(book, [{ text: 'tolls at the bridge', weight: 1 }]);
    expect(calls.at(-1)).toEqual({ kind: 'query', count: 1 });
    // A changed entry is embedded again; nothing else is.
    await index.scores([...book.slice(0, 3), entry('food', 'Food and Drink – Stews', 'Taverns serve thin soup now.')], [{ text: 'soup', weight: 1 }]);
    expect(calls.at(-1)).toEqual({ kind: 'passage', count: 1 });
  });
  test('a different embedding model means embedding everything again', async () => {
    let model = 'one';
    const fake = fakeEmbed();
    const index = new MeaningIndex(async (texts, kind) => ({ ...(await fake.embed(texts, kind)), model }));
    await index.scores(book, [{ text: 'debt', weight: 1 }]);
    model = 'two';
    await index.scores(book, [{ text: 'debt', weight: 1 }]);
    expect(fake.calls.at(-1)).toEqual({ kind: 'passage', count: 3 });
  });
  test('every query gets its own best picks', async () => {
    const index = new MeaningIndex(fakeEmbed().embed);
    const scores = await index.scores(book, [{ text: 'debts lenders collectors interest owed', weight: 1 }, { text: 'stews bread taverns', weight: 0.5 }]);
    expect(scores.get('food')!).toBeGreaterThan(scores.get('bridge')!);
  });
});
