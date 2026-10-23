import type { LoreEntry } from './lore';

/**
 * Finding lore by meaning, with the player's own embedding connection.
 *
 * Most entries in a big setting book have no keywords (how rumors spread,
 * how debts work), so they can only be found by meaning. Each entry is turned
 * into a vector once and kept in memory while Lumiverse runs; only entries
 * that change are done again. Each search then embeds a few short queries
 * (the recent chat, each open storyline) and scores every entry by its
 * closeness to the best-matching query.
 */
export type Embed = (texts: string[], kind: 'query' | 'passage', signal?: AbortSignal) => Promise<{ vectors: number[][]; model: string }>;
export interface Query { text: string; /** 0 to 1: how much this query counts. */ weight: number }

const MAX_TEXT = 8000, BATCH = 128, KEEP = 4000;
/** A cheap fingerprint of an entry's text, so changed entries are embedded again. */
function sig(text: string): string { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return `${text.length}:${h}`; }
function unit(v: number[]): Float32Array { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return Float32Array.from(v, x => x / n); }
function dot(a: Float32Array, b: Float32Array): number { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; }
export const passageText = (e: LoreEntry) => `${e.title}\n${e.content}`.slice(0, MAX_TEXT);

export class MeaningIndex {
  private store = new Map<string, { sig: string; model: string; vec: Float32Array }>();
  constructor(private readonly embed: Embed) {}

  /** Entry id → closeness (about 0 to 1.3): the best weighted match over the queries, plus a little for being a query's top pick. */
  async scores(entries: LoreEntry[], queries: Query[], signal?: AbortSignal): Promise<Map<string, number>> {
    const wanted = queries.map(q => ({ ...q, text: q.text.trim().slice(0, MAX_TEXT) })).filter(q => q.text && q.weight > 0).slice(0, 12);
    const pool = entries.filter(e => !e.constant);
    if (!wanted.length || !pool.length) return new Map();
    const asked = await this.embed(wanted.map(q => q.text), 'query', signal);
    const qv = asked.vectors.map(unit);
    // Vectors from another model can't be compared: those entries are embedded again.
    const stale = pool.filter(e => { const s = this.store.get(e.id); return !s || s.model !== asked.model || s.sig !== sig(passageText(e)); });
    for (let i = 0; i < stale.length; i += BATCH) {
      const batch = stale.slice(i, i + BATCH);
      const done = await this.embed(batch.map(passageText), 'passage', signal);
      batch.forEach((e, j) => { this.store.delete(e.id); this.store.set(e.id, { sig: sig(passageText(e)), model: done.model, vec: unit(done.vectors[j]) }); });
    }
    while (this.store.size > KEEP) this.store.delete(this.store.keys().next().value as string);
    const out = new Map<string, number>(), best: Array<Array<[string, number]>> = wanted.map(() => []);
    for (const e of pool) {
      const v = this.store.get(e.id)?.vec;
      if (!v) continue;
      let top = 0;
      qv.forEach((q, i) => { const c = dot(q, v); top = Math.max(top, c * wanted[i].weight); best[i].push([e.id, c]); });
      out.set(e.id, top);
    }
    // Every query gets its own best two, so one storyline's lore isn't crowded out by another's.
    for (const list of best) for (const [id] of list.sort((a, b) => b[1] - a[1]).slice(0, 2)) out.set(id, (out.get(id) ?? 0) + 0.3);
    return out;
  }
}
