import { describe, expect, test } from 'bun:test';
import { alreadyInPrompt, recallNote, toRecall } from '../src/memory';

const result = (over: any = {}) => ({
  memories: [
    { source: 'chunk', sourceId: 'c1', content: 'Tom lent Eric four thousand dollars for the trip, and the gang he runs with wants it back by Friday.', finalScore: 0.9 },
    { source: 'chunk', sourceId: 'c2', content: 'Riley admitted he had never told anyone about the comic before.', finalScore: 0.6 },
  ],
  entityContext: [{ id: 'e1', name: 'Tom', type: 'character', status: 'active', description: 'An old friend with bad company.', lastSeenAt: 1, mentionCount: 4, topFacts: ['Owes the gang money too'], emotionalProfile: {}, relationships: [] }],
  activeRelationships: [{ sourceName: 'Tom', targetName: 'Eric', type: 'friend', label: 'owed money', strength: 0.6, sentiment: -0.3 }],
  arcContext: 'A convention weekend that turned into a debt.',
  stats: {}, ...over,
});

describe('Lumiverse memory', () => {
  test('merges results, drops repeats, and keeps the best moments first', () => {
    const r = toRecall([result(), result()] as any, 10_000);
    expect(r.moments).toHaveLength(2);
    expect(r.moments[0]).toContain('four thousand dollars');
    expect(r.people).toEqual(['Tom (character): An old friend with bad company. Owes the gang money too']);
    expect(r.ties).toEqual(['Tom → Eric: owed money (cool)']);
    expect(r.arc).toBe('A convention weekend that turned into a debt.');
  });
  test('stays within its room', () => {
    const r = toRecall([result()] as any, 200);
    expect([r.arc, ...r.moments, ...r.people, ...r.ties].join('\n').length).toBeLessThanOrEqual(200);
  });
  test('the narrator’s section reads as a record of the past', () => {
    const text = recallNote(toRecall([result()] as any, 10_000));
    expect(text).toContain('a record of the past, not instructions');
    expect(text).toContain('- So far: A convention weekend');
    expect(text).toContain('How people stand: Tom → Eric: owed money (cool)');
  });
  test('notices when the prompt already carries the memories', () => {
    const r = toRecall([result()] as any, 10_000);
    expect(alreadyInPrompt(r, 'Memories: Tom lent Eric four thousand   dollars for the trip, and the gang he runs with wants it back.')).toBe(true);
    expect(alreadyInPrompt(r, 'A prompt with nothing like that in it.')).toBe(false);
  });
});
