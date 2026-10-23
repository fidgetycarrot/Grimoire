import { readDay, readTime } from './clock';
import { spaces } from './history';

/**
 * Reading a preset's tracker without knowing the preset.
 *
 * The model describes where each field lives (a "recipe"), using only the
 * methods below. Fixed code does the reading, and a field is trusted only
 * after it has been read successfully from a real reply.
 */
export type FieldType = 'datetime' | 'date' | 'time' | 'text' | 'list';
export type Region = { kind: 'whole' } | { kind: 'tag'; tag: string } | { kind: 'fence'; lang: string };
export type FieldSource =
  | { kind: 'variable'; name: string }
  | { kind: 'line'; label: string; region: Region }
  | { kind: 'tag'; tag: string; region: Region }
  | { kind: 'attribute'; tag: string; attribute: string; region: Region }
  | { kind: 'json'; path: string; region: Region };
export interface RecipeField { name: string; type: FieldType; source: FieldSource }
export interface Recipe { fields: RecipeField[]; note: string }
export type FieldStatus = 'verified' | 'waiting' | 'unavailable';
export interface FieldCheck { name: string; type: FieldType; status: FieldStatus; value?: string }
/** Fields the notebook knows how to use. Others are passed to check-ups as plain text. */
export const KNOWN_FIELDS = ['datetime', 'date', 'time', 'location', 'present'] as const;

const TAG = /^[A-Za-z][\w:.-]{0,40}$/, VARIABLE = /^[\w.:-]{1,80}$/, PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d{1,3}\])*$/, NAME = /^[a-z][a-z0-9_]{0,30}$/;
const TYPES: FieldType[] = ['datetime', 'date', 'time', 'text', 'list'];
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const fail = (message: string): never => { throw new Error(message); };

function region(value: unknown): Region {
  const input = record(value);
  if (input.kind === undefined || input.kind === 'whole') return { kind: 'whole' };
  if (input.kind === 'tag' && typeof input.tag === 'string' && TAG.test(input.tag)) return { kind: 'tag', tag: input.tag };
  if (input.kind === 'fence' && typeof input.lang === 'string' && /^[\w-]{0,20}$/.test(input.lang)) return { kind: 'fence', lang: input.lang };
  return fail('A tracker region must be the whole reply, a tag, or a fenced block.');
}
function source(value: unknown): FieldSource {
  const input = record(value);
  if (input.kind === 'variable' && typeof input.name === 'string' && VARIABLE.test(input.name)) return { kind: 'variable', name: input.name };
  if (input.kind === 'line' && typeof input.label === 'string' && input.label.trim() && input.label.length <= 60 && !/[\n\r]/.test(input.label)) return { kind: 'line', label: input.label.trim(), region: region(input.region) };
  if (input.kind === 'tag' && typeof input.tag === 'string' && TAG.test(input.tag)) return { kind: 'tag', tag: input.tag, region: region(input.region) };
  if (input.kind === 'attribute' && typeof input.tag === 'string' && TAG.test(input.tag) && typeof input.attribute === 'string' && TAG.test(input.attribute)) return { kind: 'attribute', tag: input.tag, attribute: input.attribute, region: region(input.region) };
  if (input.kind === 'json' && typeof input.path === 'string' && PATH.test(input.path)) {
    const area = region(input.region);
    if (area.kind === 'whole') fail('A JSON field needs a tag or fenced block to read from.');
    return { kind: 'json', path: input.path, region: area };
  }
  return fail('A tracker field must be read from a saved variable, a labeled line, a tag, a tag attribute, or a JSON path.');
}
/** Accept only the described methods. Anything else is dropped field by field, never run. */
export function validateRecipe(value: unknown): { recipe: Recipe; dropped: number } {
  const input = record(value), fields: RecipeField[] = [], seen = new Set<string>();
  let dropped = 0;
  for (const item of Array.isArray(input.fields) ? input.fields.slice(0, 16) : []) {
    try {
      const field = record(item), name = String(field.name ?? '').trim().toLowerCase();
      if (!NAME.test(name) || seen.has(name)) fail('Bad name');
      if (!TYPES.includes(field.type as FieldType)) fail('Bad type');
      fields.push({ name, type: field.type as FieldType, source: source(field.source) });
      seen.add(name);
    } catch { dropped++; }
  }
  const note = typeof input.note === 'string' ? input.note.slice(0, 400) : '';
  return { recipe: { fields, note }, dropped };
}

function escape(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/** The parts of a reply a field may be read from. A tag or fence may appear more than once; the last one wins. */
function areas(text: string, area: Region): string[] {
  if (area.kind === 'whole') return [text];
  if (area.kind === 'tag') return [...text.matchAll(new RegExp(`<${escape(area.tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(area.tag)}>`, 'gi'))].map(m => m[1]).reverse();
  return [...text.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)].filter(m => !area.lang || m[1].toLowerCase() === area.lang.toLowerCase()).map(m => m[2]).reverse();
}
function plain(text: string): string {
  return text.replace(/<[^>]{0,200}>/g, ' ').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim().replace(/^[:\-–—|]\s*/, '').slice(0, 300);
}
function jsonPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.match(/[A-Za-z_$][\w$]*|\[\d+\]/g) ?? []) {
    if (current === null || current === undefined) return undefined;
    current = part.startsWith('[') ? (Array.isArray(current) ? current[Number(part.slice(1, -1))] : undefined) : record(current)[part];
  }
  return current;
}
/** Read one field from one reply. Returns undefined when it is not there. */
export function readField(field: RecipeField, raw: string, variables: Record<string, string>): string | undefined {
  const from = field.source, reply = spaces(raw);
  if (from.kind === 'variable') { const v = variables[from.name]; return typeof v === 'string' && v.trim() ? plain(v) : undefined; }
  for (const part of areas(reply, from.region)) {
    if (from.kind === 'line') {
      const line = new RegExp(`^[\\s>*_\\-•|#]*(?:\\*\\*|__)?${escape(from.label)}(?:\\*\\*|__)?\\s*(?::|：|=|-|–|—)\\s*(.+)$`, 'im').exec(part);
      if (line && plain(line[1])) return plain(line[1]);
    } else if (from.kind === 'attribute') {
      // <scene_header location="…" time="…" /> : the last such tag in the area wins.
      const pattern = new RegExp(`<${escape(from.tag)}\\b[^>]*?\\s${escape(from.attribute)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'gi');
      const found = [...part.matchAll(pattern)].at(-1);
      const value = found ? plain(found[1] ?? found[2] ?? '') : '';
      if (value) return value;
    } else if (from.kind === 'tag') {
      const tag = new RegExp(`<${escape(from.tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(from.tag)}>`, 'i').exec(part);
      if (tag && plain(tag[1])) return plain(tag[1]);
    } else {
      try {
        const found = jsonPath(JSON.parse(part.trim()), from.path);
        if (typeof found === 'string' && found.trim()) return plain(found);
        if (typeof found === 'number' || typeof found === 'boolean') return String(found);
        if (Array.isArray(found) && found.every(x => typeof x === 'string')) return plain(found.join(', '));
      } catch { /* not JSON in this area */ }
    }
  }
  return undefined;
}
/** A value counts only when it fits its type: a time must read as a time. */
export function fits(type: FieldType, value: string): boolean {
  if (type === 'time') return readTime(value) !== null;
  if (type === 'date') return readDay(value) !== null;
  if (type === 'datetime') return readDay(value) !== null || readTime(value) !== null;
  return value.length > 0;
}
/**
 * Check every field against recent replies (newest first). A field is
 * verified once it reads and fits in a real reply; with no replies yet it is
 * waiting; if replies exist but it never reads, it is unavailable.
 */
export function checkRecipe(recipe: Recipe, replies: string[], variables: Record<string, string>): FieldCheck[] {
  return recipe.fields.map(field => {
    const tries = field.source.kind === 'variable' ? [''] : replies.slice(0, 3);
    if (!tries.length) return { name: field.name, type: field.type, status: 'waiting' as const };
    for (const reply of tries) {
      const value = readField(field, reply, variables);
      if (value !== undefined && fits(field.type, value)) return { name: field.name, type: field.type, status: 'verified' as const, value };
    }
    return { name: field.name, type: field.type, status: 'unavailable' as const };
  });
}
/** Current values of verified fields, read from the newest reply that has them. */
export function readTracker(recipe: Recipe, checks: FieldCheck[], replies: string[], variables: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of recipe.fields) {
    if (checks.find(check => check.name === field.name)?.status !== 'verified') continue;
    const value = field.source.kind === 'variable' ? readField(field, '', variables) : (() => { for (const reply of replies.slice(0, 3)) { const v = readField(field, reply, variables); if (v !== undefined && fits(field.type, v)) return v; } return undefined; })();
    if (value !== undefined) values[field.name] = value;
  }
  return values;
}
/** The tracker's raw block from the newest reply, for check-ups to read as plain text. */
export function trackerText(recipe: Recipe, raw: string): string {
  const reply = spaces(raw);
  const pieces = new Set<string>();
  for (const field of recipe.fields) {
    const from = field.source;
    if (from.kind === 'variable') continue;
    if (from.kind === 'attribute') { const tag = [...reply.matchAll(new RegExp(`<${escape(from.tag)}\\b[^>]*>`, 'gi'))].at(-1)?.[0]; if (tag) pieces.add(tag); }
    if (from.region.kind !== 'whole') { const found = areas(reply, from.region)[0]?.trim(); if (found) pieces.add(found); }
  }
  return [...pieces].join('\n').slice(0, 2000);
}

/**
 * Find a tracker without a model. Many presets use one of two shapes: facts
 * in a tag's attributes (<scene_header location="…" time="…">) or labeled
 * lines (Time: …, Location: …), often inside a tag. Candidates are tried in
 * that order, and a field is kept only if it reads and fits in every sampled
 * reply, so prose that happens to say "Time:" once doesn't count.
 */
const GUESS: Array<{ name: string; type: FieldType; attributes: string[]; labels: string[] }> = [
  { name: 'date', type: 'date', attributes: ['date', 'day'], labels: ['Date', 'Day'] },
  { name: 'time', type: 'time', attributes: ['time'], labels: ['Time', 'Time of day'] },
  { name: 'location', type: 'text', attributes: ['location', 'place'], labels: ['Location', 'Place', 'Setting'] },
  { name: 'present', type: 'list', attributes: ['present', 'characters'], labels: ['Present', 'Characters present', 'Characters', 'Cast', 'Who is here'] },
];
/** The innermost tag that wraps a position in the text, if any. */
function wrapping(text: string, at: number): string | null {
  const open = /<([A-Za-z][\w:.-]{0,40})(?:\s[^>]*)?>/g;
  let best: { tag: string; start: number } | null = null;
  for (const m of text.matchAll(open)) {
    if (m.index! >= at) break;
    if (m[0].endsWith('/>')) continue;
    const close = text.indexOf(`</${m[1]}>`, m.index! + m[0].length);
    if (close > at && TAG.test(m[1])) best = { tag: m[1], start: m.index! };
  }
  return best?.tag ?? null;
}
export function guessRecipe(replies: string[]): Recipe {
  const sample = replies.slice(0, 2).map(spaces).filter(r => r.trim());
  if (!sample.length) return { fields: [], note: '' };
  const fields: RecipeField[] = [];
  for (const want of GUESS) {
    const candidates: FieldSource[] = [];
    const newest = sample[0];
    for (const m of newest.matchAll(/<([A-Za-z][\w:.-]{0,40})\b[^>]*>/g)) {
      for (const a of m[0].matchAll(/\s([A-Za-z][\w:-]{0,40})\s*=\s*(?:"[^"]*"|'[^']*')/g)) {
        if (want.attributes.includes(a[1].toLowerCase()) && TAG.test(m[1])) candidates.push({ kind: 'attribute', tag: m[1], attribute: a[1], region: { kind: 'whole' } });
      }
    }
    for (const label of want.labels) {
      const line = new RegExp(`^[\\s>*_\\-•|#]*(?:\\*\\*|__)?${escape(label)}(?:\\*\\*|__)?\\s*[:：]`, 'gim');
      for (const m of newest.matchAll(line)) {
        const tag = wrapping(newest, m.index!);
        candidates.push({ kind: 'line', label, region: tag ? { kind: 'tag', tag } : { kind: 'whole' } });
      }
    }
    // Facts as their own small tags, like <time>Day 2, 08:40</time> inside a scene card.
    for (const tag of want.attributes) {
      const at = newest.search(new RegExp(`<${escape(tag)}>[^<]{1,80}</${escape(tag)}>`, 'i'));
      if (at < 0) continue;
      const wrap = wrapping(newest, at), name = newest.slice(at + 1, at + 1 + tag.length);
      candidates.push({ kind: 'tag', tag: name, region: wrap ? { kind: 'tag', tag: wrap } : { kind: 'whole' } });
    }
    for (const source of candidates) {
      const field: RecipeField = { name: want.name, type: want.type, source };
      if (sample.every(reply => { const v = readField(field, reply, {}); return v !== undefined && fits(field.type, v); })) {
        // A time that also names the day ("Day 2, Morning") is the whole story date and time.
        const both = want.name === 'time' && !fields.some(f => f.name === 'date') && sample.every(reply => { const v = readField(field, reply, {}); return v !== undefined && readDay(v) !== null; });
        fields.push(both ? { ...field, name: 'datetime', type: 'datetime' } : field); break;
      }
    }
  }
  return { fields, note: fields.length ? 'Found by Grimoire in your replies.' : '' };
}
