import type { Embed } from '../src/meaning';
import type { Notebook } from '../src/notebook';

/** An original, neutral sample notebook used across tests. */
export function sampleNotebook(): Notebook {
  return {
    version: 1,
    arc: { shape: 'conflict', stage: 'setup', turn: '', main: 'storm' },
    seeds: [
      { id: 'green-wax', detail: 'Oswin seals his letters with green wax.', payoff: 'The ring box in the next town is sealed with the same green wax, tying the sale to Oswin.', pays: 'stolen-ring', status: 'waiting' },
    ],
    story: { question: 'Will the stolen ring be returned before its owner finds out who took it?', stakes: 'The player\'s standing in Low Water.', direction: 'A return, a bargain, or a reckoning.', hiddenTruth: ['The harbor master took the ring to pay a gambling debt.'], twist: '', cameOut: [] },
    people: [
      { id: 'mira', name: 'Mira', aliases: ['the ferrywoman'], role: 'ferry keeper', wants: 'to keep the ferry running', doing: 'patching the chain', hint: 'dry humor, watches everyone', voice: 'Short, flat sentences; ferry terms; never asks a question she can answer herself. "Coin first. Then talk."', depth: '', sheet: '', own: '', met: true, status: 'active' },
      { id: 'cole', name: 'Cole', aliases: [], role: 'traveling barbarian', wants: 'work that pays in silver', doing: 'looking for the ring\'s owner to sell information', hint: 'loud, honest about money', voice: '', depth: '', sheet: '', own: '', met: false, status: 'active' },
      { id: 'harbor-master', name: 'Oswin', aliases: ['the harbor master'], role: 'harbor master', wants: 'the ring sold before anyone notices', doing: 'arranging a buyer in the next town', hint: 'polite, avoids questions about money', voice: '', depth: '', sheet: '', own: '', met: true, status: 'active' },
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
