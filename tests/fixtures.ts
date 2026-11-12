import type { Embed } from '../src/meaning';
import type { Notebook } from '../src/notebook';

/** An original, neutral sample notebook used across tests. */
export function sampleNotebook(): Notebook {
  return {
    version: 1,
    covers: [],
    buildings: [],
    taste: [],
    recap: '',
    arc: { shape: 'conflict', stage: 'setup', turn: '', main: 'storm' },
    seeds: [
      { id: 'green-wax', detail: 'Oswin seals his letters with green wax.', payoff: 'The ring box in the next town is sealed with the same green wax, tying the sale to Oswin.', pays: 'stolen-ring', status: 'waiting' },
    ],
    story: { question: 'Will the stolen ring be returned before its owner finds out who took it?', stakes: 'The player\'s standing in Low Water.', direction: 'A return, a bargain, or a reckoning.', hiddenTruth: ['The harbor master took the ring to pay a gambling debt.'], twist: '', cameOut: [] },
    people: [
      { id: 'mira', name: 'Mira', aliases: ['the ferrywoman'], role: 'ferry keeper', wants: 'to keep the ferry running', doing: 'patching the chain', hint: 'dry humor, watches everyone', voice: 'Short, flat sentences; ferry terms; never asks a question she can answer herself. "Coin first. Then talk."', depth: '', sheet: '', own: '', met: true, status: 'active' },
      { id: 'cole', name: 'Cole', aliases: [], role: 'traveling barbarian', wants: 'work that pays in silver', doing: 'looking for the ring\'s owner to sell information', hint: 'loud, honest about money', voice: '', depth: '', sheet: '', own: '', met: false, status: 'active' },
      { id: 'harbor-master', name: 'Oswin', aliases: ['the harbor master'], role: 'harbor master', wants: 'the ring sold before anyone notices', doing: 'arranging a buyer in the next town', hint: 'polite, avoids questions about money', voice: '', depth: '', sheet: '', own: '', met: true, status: 'active' },
      { id: 'wren', name: 'Wren', aliases: [], role: 'rope maker up the hill', wants: 'a buyer for her winter stock', doing: 'drying hemp in the yard', hint: 'chatty, remembers every face', voice: '', depth: '', sheet: '', own: '', met: false, status: 'active' },
      { id: 'brother-hale', name: 'Brother Hale', aliases: [], role: 'keeper of the river shrine', wants: 'the shrine roof mended before the rains', doing: 'collecting coins from travelers', hint: 'gentle, stubborn about small things', voice: '', depth: '', sheet: '', own: '', met: false, status: 'active' },
    ],
    threads: [
      { id: 'stolen-ring', title: 'The stolen ring', speed: 'steady', why: 'Oswin stole it; its owner will search.', hint: 'the owner is starting to look for it', people: ['harbor-master', 'cole'], status: 'open', closedReason: '', ifFollowed: 'leads to Oswin', ifIgnored: 'the owner\'s search reaches the player',
        steps: [
          { id: 'owner-notices', text: 'The owner notices the ring is gone.', sign: 'A shout from the manor on the hill.', afterHours: 12, status: 'waiting' },
          { id: 'stranger-asks', text: 'A stranger asks the innkeeper about it.', sign: 'The innkeeper mentions a stranger asking about a ring.', afterHours: 24, status: 'waiting' },
          { id: 'searchers-arrive', text: 'Hired searchers come to the inn.', sign: 'Two armed strangers take a table by the door.', afterHours: 48, status: 'waiting' },
        ] },
      { id: 'storm', title: 'The coming storm', speed: 'urgent', why: 'A storm will close the river crossing.', hint: 'weather is turning fast', people: ['mira'], status: 'open', closedReason: '', ifFollowed: 'the player crosses in time', ifIgnored: 'the crossing closes for days',
        steps: [{ id: 'wind-rises', text: 'The wind rises.', sign: 'Shutters bang all along the street.', afterHours: 2, status: 'waiting' }] },
    ],
    beats: [
      { id: 'ring-recognized', text: 'Someone recognizes the ring', purpose: 'connects the theft to the harbor', conditions: 'the ring is visible', thread: 'stolen-ring', intensity: 'high', status: 'possible' },
      { id: 'quiet-supper', text: 'Mira shares supper and an old story', purpose: 'builds trust with Mira', conditions: 'the player stays at the ferry house', thread: '', intensity: 'low', status: 'possible' },
    ],
    events: ['The player arrived in Low Water at dusk.'],
    clock: { day: 1, hour: 18, label: '' },
    rhythm: 'calm',
    summary: 'Notebook written.',
  };
}

/** A stand-in for an embedding model: words hashed into a small vector, so shared words mean closeness. */
export function fakeEmbed(model = 'fake'): { embed: Embed; calls: Array<{ kind: string; count: number }> } {
  const calls: Array<{ kind: string; count: number }> = [];
  const vec = (text: string) => { const v = new Array(64).fill(0); for (const w of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 64; v[h] += 1; } return v; };
  return { calls, embed: async (texts, kind) => { calls.push({ kind, count: texts.length }); return { vectors: texts.map(vec), model }; } };
}

export const MYSTERY_ANSWER = 'Brother Hale took the chapel silver and hid it under the ferry landing to pay a debt.';
/** A mystery as a model would write it: names instead of ids here and there, loose words. */
export const rawMystery = () => ({
  question: 'Who took the chapel silver?', answer: MYSTERY_ANSWER, culprit: 'Brother Hale', how: 'He carried it out in the alms sack after evening prayer.', why: 'He owes money upriver and was threatened.',
  ifUnsolved: 'The silver turns up at a pawnbroker upriver, and an innocent is blamed first.', thread: 'stolen-ring',
  suspects: [
    { person: 'brother-hale', motive: 'He holds the chapel keys.', says: 'He locked up after prayer and saw nothing.', tell: 'He straightens things that are already straight.', did: 'Took the silver and hid it under the landing.' },
    { person: 'Cole', motive: 'He needs money and was seen near the chapel.', says: 'He was at the tavern all evening.', tell: 'He gets loud.', did: 'Was meeting a buyer for something else; saw Hale with a sack.' },
    { person: 'wren', motive: 'She cleans the chapel alone.', says: 'She left early with a headache.', tell: 'She will not meet your eye.', did: 'Left early to meet someone she should not; saw nothing.' },
  ],
  clues: [
    { id: 'wet-hem', text: 'The hem of Brother Hale\'s robe is wet with river mud.', where: 'the chapel porch', people: ['brother-hale'], means: 'He was down at the landing after prayer.', points: 'truth', status: 'hidden' },
    { id: 'alms-sack', text: 'The alms sack is missing from its hook.', where: 'the chapel vestry', people: [], means: 'The silver left in the sack.', points: 'truth' },
    { id: 'cole-saw', text: 'Cole says he saw a robed figure carrying a sack toward the river.', where: 'the tavern', people: ['cole'], means: 'Hale was seen.', points: 'truth' },
    { id: 'debt-letter', text: 'A letter demanding payment, addressed to the chapel.', where: 'the harbor office', people: ['harbor-master'], means: 'Hale has a debt.', points: 'truth' },
    { id: 'loose-board', text: 'One board under the ferry landing is newer than the rest.', where: 'the ferry landing', people: ['mira'], means: 'The silver is hidden there.', points: 'truth' },
    { id: 'wren-ribbon', text: 'A ribbon of Wren\'s lies by the chapel side door.', where: 'the chapel side door', people: ['wren'], means: 'She slipped out to meet someone; nothing to do with the silver.', points: 'red herring' },
  ],
});
