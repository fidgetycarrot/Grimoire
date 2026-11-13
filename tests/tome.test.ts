import { describe, expect, test } from 'bun:test';
import { stamp, validateNotebook } from '../src/notebook';
import { tidyNotebook } from '../src/tidy';
import { buildTome, distillScene } from '../src/tome';
import { MYSTERY_ANSWER, rawMystery, sampleNotebook } from './fixtures';

function makeBook() {
  const raw: any = sampleNotebook();
  raw.mystery = rawMystery();
  raw.story.twist = 'Mira knew about the debt all along.';
  raw.story.cameOut = [{ text: 'The ferry chain was cut from the inside.', atReply: 8 }];
  raw.covers = [
    { id: 'c1', by: 'player', told: ['mira'], said: 'You were only passing through on the cattle road.', hides: 'You came looking for the ring.', status: 'holding', atReply: 4 },
    { id: 'c2', by: 'harbor-master', told: ['player'], said: 'The ledger was lost in the flood.', hides: 'He burned it himself.', status: 'holding', atReply: 5 },
  ];
  const nb = stamp(validateNotebook(tidyNotebook(raw)), 24);
  nb.mystery!.clues[1] = { ...nb.mystery!.clues[1], status: 'found', foundAt: 10 };
  return nb;
}

describe('buildTome spoiler safety and modes', () => {
  test('never leaks hidden truths, twists, mystery answers, clue meanings, waiting steps, or NPC cover secrets', () => {
    const notebook = makeBook();
    const tome = buildTome({
      messageId: 'msg-10',
      reply: 10,
      latestReply: 'Mira sets the lantern on the wet planks and studies the empty hook in the vestry. "Someone knew where the spare key hung," she says. "What do we tell Oswin when he asks?"',
      recentChat: 'You check the vestry wall. Mira sets the lantern on the wet planks.',
      narrated: 'Mira sets the lantern on the wet planks.',
      location: 'The Chapel Vestry',
      notebook,
      pace: 'auto',
      clock: { day: 2, hour: 20, label: 'Day 2, 20:00' },
      sources: { day: 'tracker', hour: 'tracker', exact: true },
      moment: { hours: 44, reply: 10 },
      intimate: false,
      seen: { mira: 10 },
      quick: { at: Date.now(), ok: true, error: '' },
      memory: { people: 5, ties: 3, summaries: 1, last: { at: Date.now(), found: 2, to: 'note' } },
      skipOffer: null,
    });

    const serialized = JSON.stringify(tome);
    // Must contain found clue text and cameOut text
    expect(serialized).toContain('The alms sack is missing from its hook.');
    expect(serialized).toContain('The ferry chain was cut from the inside.');
    // Must NOT contain any secrets or un-revealed mystery/plot questions
    for (const secret of [
      MYSTERY_ANSWER,
      'Who took the chapel silver?',
      'Will the stolen ring be returned',
      'gambling debt',
      'Mira knew about the debt all along',
      'The silver left in the sack',
      'wet with river mud',
      'Took the silver and hid it',
      'The ring box in the next town',
      'The owner notices the ring is gone',
      'He burned it himself',
      'Cole',
      'Wren',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    // Active mode because a clue was found on reply 10
    expect(tome.mode).toBe('active');
    expect(tome.defaultTab).toBe('clue');
    expect(tome.tabs.map(t => t.short)).toEqual(['Because You…', 'Clue Found', 'Who’s Here', 'World & Pulse']);
  });

  test('switches to quiet mode when nothing new was stamped on this calm turn, and intimate mode when protected', () => {
    const notebook = makeBook();
    notebook.rhythm = 'calm';
    const quietTome = buildTome({
      messageId: 'msg-14',
      reply: 14,
      latestReply: 'Rain taps against the ferry house shutters while the kettle comes to a boil.',
      recentChat: 'Rain taps against the ferry house shutters.',
      narrated: 'Mira warms her hands by the stove.',
      location: 'Ferry House',
      notebook,
      pace: 'auto',
      clock: { day: 2, hour: 22, label: 'Day 2, 22:00' },
      sources: { day: 'notebook', hour: 'notebook', exact: false },
      moment: { hours: 46, reply: 14 },
      intimate: false,
      seen: { mira: 13 },
      quick: null,
      memory: null,
      skipOffer: null,
    });
    expect(quietTome.mode).toBe('quiet');

    const intimateTome = buildTome({
      messageId: 'msg-15',
      reply: 15,
      latestReply: 'The door is latched against the rain.',
      recentChat: 'The door is latched against the rain.',
      narrated: 'Mira stays close.',
      notebook,
      pace: 'auto',
      clock: { day: 2, hour: 22, label: 'Day 2, 22:00' },
      sources: { day: 'notebook', hour: 'notebook', exact: false },
      moment: { hours: 46, reply: 15 },
      intimate: true,
      seen: { mira: 15 },
      quick: null,
      memory: null,
      skipOffer: null,
    });
    expect(intimateTome.mode).toBe('intimate');
  });

  test('distillScene extracts spoken questions and concrete footholds for the Hook Whisper', () => {
    const notebook = makeBook();
    const present = notebook.people.filter(p => p.id === 'mira');
    const compass = distillScene(
      'The river fog thickens around the pilings. Mira holds out a rusted iron key and watches the toll house window. "Do you want to try the cellar door before the watch comes back?"',
      notebook,
      present,
      10,
      'The River Landing',
    );
    expect(compass).not.toBeNull();
    expect(compass!.hookCount).toBeGreaterThanOrEqual(2);
    expect(compass!.whisperLine).toContain('Mira’s Words');
    expect(compass!.footholds[0]!.kind).toBe('QUESTION IN THE AIR');
  });

  test('distillScene completes full sentences and never ends on an ellipsis even on long replies', () => {
    const notebook = makeBook();
    const present = notebook.people.filter(p => p.id === 'mira');
    const filler = 'The cold rain drums steadily against the slate roof of the boathouse while the lantern swings on its iron hook. '.repeat(45);
    const ending = 'Mira hesitates... then slides the brass key across the table toward your hand. "Take it before the watchmen reach the wharf, or tell me if you have a better plan."';
    const compass = distillScene(`${filler}${ending}`, notebook, present, 10, 'The Boathouse');
    expect(compass).not.toBeNull();
    expect(compass!.gist.endsWith('…')).toBe(false);
    expect(compass!.gist.endsWith('...')).toBe(false);
    expect(compass!.gist).toContain('Take it before the watchmen reach the wharf, or tell me if you have a better plan.');
    for (const fh of compass!.footholds) {
      expect(fh.prompt.endsWith('…')).toBe(false);
      expect(fh.prompt.endsWith('...')).toBe(false);
    }
  });
});
