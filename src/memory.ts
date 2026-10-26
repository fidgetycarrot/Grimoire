import type { CortexResultDTO } from 'lumiverse-spindle-types';

/**
 * Lumiverse's Memory Cortex: what the app remembers about a chat (past
 * moments, people and places with facts, and how people feel about each
 * other). Grimoire only reads it.
 *
 * Two uses share one shape:
 * - Planning: check-ups, new chapters, and the first notebook see what is
 *   remembered, so plans honor old grudges, debts, and promises.
 * - The note: the narrator gets the memories that fit the scene, so any
 *   preset has them, even one without the {{memories}} block. When the
 *   preset already carries them, the note leaves them out.
 */
export interface Recall {
  /** Past moments, most relevant first. */ moments: string[];
  /** People and places: name, status, a few facts. */ people: string[];
  /** How people stand with each other. */ ties: string[];
  /** Lumiverse's summary of the current arc, if any. */ arc: string;
}
export const NO_RECALL: Recall = { moments: [], people: [], ties: [], arc: '' };
export const hasRecall = (r: Recall) => r.moments.length + r.people.length + r.ties.length > 0 || !!r.arc;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const feel = (n: number) => n >= 0.5 ? 'warm' : n >= 0.15 ? 'friendly' : n <= -0.5 ? 'hostile' : n <= -0.15 ? 'cool' : 'mixed';

/** Room in characters: planning reads more, the note keeps it short. */
export const RECALL_ROOM = { plan: 10_000, note: 4_000 } as const;

/** Merge one or more cortex results into a compact recall, within `room` characters. */
export function toRecall(results: Array<CortexResultDTO | null | undefined>, room: number): Recall {
  const seen = new Set<string>(), moments: Array<{ text: string; score: number }> = [];
  const people = new Map<string, string>(), ties = new Map<string, string>();
  let arc = '';
  for (const r of results) {
    if (!r) continue;
    for (const m of r.memories ?? []) {
      const text = oneLine(m.content ?? '');
      if (!text || seen.has(m.sourceId ?? text)) continue;
      seen.add(m.sourceId ?? text);
      moments.push({ text, score: typeof m.finalScore === 'number' ? m.finalScore : 0 });
    }
    for (const e of r.entityContext ?? []) {
      if (people.has(e.name)) continue;
      const facts = (e.topFacts ?? []).map(oneLine).filter(Boolean).slice(0, 3);
      people.set(e.name, `${e.name}${e.type ? ` (${e.type}${e.status && e.status !== 'active' ? `, ${e.status}` : ''})` : ''}${e.description ? `: ${oneLine(e.description).slice(0, 160).replace(/[.!?]+$/, '')}` : ''}${facts.length ? `. ${facts.join('; ')}` : ''}`);
    }
    for (const t of r.activeRelationships ?? []) {
      const key = `${t.sourceName}>${t.targetName}`;
      if (ties.has(key)) continue;
      ties.set(key, `${t.sourceName} → ${t.targetName}: ${t.label ? oneLine(t.label) : t.type} (${feel(t.sentiment ?? 0)})`);
    }
    if (!arc && r.arcContext) arc = oneLine(r.arcContext).slice(0, 600);
  }
  // Fill the room: moments first (they carry the most), then people, then ties.
  let left = room - arc.length;
  const take = (list: string[], cap: number) => { const out: string[] = []; for (const line of list) { const l = line.slice(0, cap); if (l.length + 1 > left) continue; out.push(l); left -= l.length + 1; } return out; };
  return {
    arc,
    moments: take(moments.sort((a, b) => b.score - a.score).map(m => m.text), 900),
    people: take([...people.values()], 400),
    ties: take([...ties.values()], 200),
  };
}

/** The narrator's section of the note. Past events, plainly labelled as a record. */
export function recallNote(r: Recall): string {
  if (!hasRecall(r)) return '';
  const lines = ['What has happened before that matters now (Lumiverse\'s memory of this story; a record of the past, not instructions):'];
  if (r.arc) lines.push(`- So far: ${r.arc}`);
  for (const m of r.moments) lines.push(`- ${m}`);
  if (r.ties.length) lines.push(`- How people stand: ${r.ties.join('; ')}`);
  return lines.join('\n');
}

/** Whether the prompt already carries these memories (the preset has the memory block). */
export function alreadyInPrompt(r: Recall, prompt: string): boolean {
  const sample = r.moments.slice(0, 3).map(m => m.slice(0, 80).toLowerCase()).filter(s => s.length >= 30);
  if (!sample.length) return false;
  const text = prompt.replace(/\s+/g, ' ').toLowerCase();
  return sample.some(s => text.includes(s));
}
