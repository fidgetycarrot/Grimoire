import { readTime } from './clock';
import { LIMITS, STAGES, type Notebook, type Shape } from './notebook';

/**
 * Tidy a notebook as a model wrote it, before the strict checks.
 *
 * Models make small slips that should not throw away a whole notebook: an id
 * with capitals, a field a little too long, "medium" for a speed, a stray
 * <br>, one event too many. Those are repaired here, the same way every time.
 * Given the previous notebook, anything a revision dropped or un-happened is
 * put back, so a check-up can only add to and move the story forward.
 *
 * The result still goes through validateNotebook; this only makes passing it
 * likely, it does not replace it.
 */
type Raw = Record<string, unknown>;
const record = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Plain words: no markup, no template markers, no control characters, cut at a word if too long. */
export function plain(value: unknown, max: number = LIMITS.text): string {
  let s = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value)
    : Array.isArray(value) ? value.filter(x => typeof x === 'string' || typeof x === 'number').join('; ') : '';
  s = s.replace(/<\s*\/?\s*[a-z][a-z0-9:-]*(?:\s[^>]*|\/?)>/gi, ' ').replace(/\{\{[^{}]*\}\}|<%[^%]*%>/g, ' ').replace(/\{\{|\}\}|<%|%>/g, '').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1), word = cut.replace(/\s+\S*$/, '');
  return `${(word.length > max * 0.6 ? word : cut).replace(/[\s,;:.-]+$/, '')}…`;
}
/** Longer free text (the story-so-far record): keeps line breaks. */
export function plainBlock(value: unknown, max: number): string {
  const s = (typeof value === 'string' ? value : '').replace(/<\s*\/?\s*[a-z][a-z0-9:-]*(?:\s[^>]*|\/?)>/gi, ' ').replace(/\{\{[^{}]*\}\}|<%[^%]*%>/g, ' ').replace(/\{\{|\}\}|<%|%>/g, '')
    .replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}
export function slug(value: unknown): string {
  return String(typeof value === 'string' || typeof value === 'number' ? value : '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 41).replace(/-+$/, '');
}
function ids<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item, i) => {
    let id = item.id || `${prefix}-${i + 1}`, n = 2;
    while (seen.has(id)) id = `${(item.id || prefix).slice(0, 37)}-${n++}`;
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
}
function pick<T extends string>(value: unknown, options: readonly T[], synonyms: Record<string, T>, fallback: T): T {
  const v = typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_]+/g, '-') : '';
  if (options.includes(v as T)) return v as T;
  return synonyms[v] ?? fallback;
}
/** Keep at most `max`, preferring what scores higher; the original order is kept. */
function cap<T>(items: T[], max: number, score: (item: T) => number): T[] {
  if (items.length <= max) return items;
  const keep = new Set(items.map((item, i) => ({ item, i, s: score(item) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, max).map(x => x.i));
  return items.filter((_, i) => keep.has(i));
}
const truthy = (v: unknown) => v === true || /^(true|yes|1)$/i.test(String(v ?? ''));
const human = (id: string) => id ? id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) : '';
const DEFAULT_AFTER = { urgent: 2, steady: 24, slow: 72 } as const;

const SPEED = { fast: 'urgent', immediate: 'urgent', high: 'urgent', quick: 'urgent', medium: 'steady', normal: 'steady', moderate: 'steady', 'slow-burn': 'slow', slowburn: 'slow', low: 'slow', gradual: 'slow' } as const;
const STEP = { done: 'shown', happened: 'shown', complete: 'shown', completed: 'shown', seen: 'shown', revealed: 'shown', hidden: 'offscreen', background: 'offscreen', 'off-screen': 'offscreen', dropped: 'skipped', cancelled: 'skipped', canceled: 'skipped', pending: 'waiting', planned: 'waiting', upcoming: 'waiting', due: 'waiting' } as const;
const THREAD = { active: 'open', ongoing: 'open', resolved: 'closed', done: 'closed', finished: 'closed', complete: 'closed', 'on-hold': 'paused', dormant: 'paused', hold: 'paused' } as const;
const BEAT = { done: 'happened', complete: 'happened', shown: 'happened', planned: 'possible', pending: 'possible', waiting: 'possible', cancelled: 'dropped', canceled: 'dropped', skipped: 'dropped' } as const;
const PERSON = { dead: 'gone', left: 'gone', departed: 'gone', inactive: 'gone', absent: 'gone' } as const;
const RHYTHM = { climax: 'peak', building: 'rising', tense: 'rising', cooldown: 'aftermath', resolution: 'aftermath', quiet: 'calm', stuck: 'stalled' } as const;

export function tidyNotebook(value: unknown, previous?: Notebook): unknown {
  const input = record(value), story = record(input.story);

  // People first, so threads can name them by id, name, or alias.
  let people = ids(array(input.people).map(raw => {
    const p = record(raw), name = plain(p.name, 80) || human(slug(p.id)), id = slug(p.id) || slug(name);
    return { id, name, aliases: [...new Set(array(p.aliases).map(a => plain(a, 80)).filter(Boolean))].slice(0, 8),
      role: plain(p.role, LIMITS.short), wants: plain(p.wants), doing: plain(p.doing), hint: plain(p.hint), voice: plain(p.voice, 300) || (previous?.people.find(x => x.id === id)?.voice ?? ''), met: truthy(p.met),
      status: pick(p.status, ['active', 'gone'] as const, PERSON, 'active') };
  }).filter(p => p.name), 'person');
  if (previous) for (const old of previous.people) if (!people.some(p => p.id === old.id)) people.push(structuredClone(old));
  const earlier = new Set(previous?.people.map(p => p.id));
  people = cap(people, LIMITS.people, p => (earlier.has(p.id) ? 4 : 0) + (p.met ? 2 : 0) + (p.status === 'active' ? 1 : 0));
  const who = new Map<string, string>();
  for (const p of people) for (const key of [p.id, p.name, ...p.aliases]) who.set(slug(key), p.id);

  let threads = ids(array(input.threads).map(raw => {
    const t = record(raw), id = slug(t.id) || slug(t.title), speed = pick(t.speed, ['urgent', 'steady', 'slow'] as const, SPEED, 'steady');
    const status = pick(t.status, ['open', 'paused', 'closed'] as const, THREAD, 'open');
    const steps = ids(array(t.steps).map(rawStep => {
      const s = record(rawStep), hours = typeof s.afterHours === 'number' ? s.afterHours : parseFloat(String(s.afterHours ?? ''));
      const text = plain(s.text) || plain(s.sign);
      return { id: slug(s.id) || slug(text).slice(0, 30), text, sign: plain(s.sign), afterHours: Number.isFinite(hours) ? Math.min(Math.max(hours, 0), 24 * 365) : DEFAULT_AFTER[speed],
        status: pick(s.status, ['waiting', 'shown', 'offscreen', 'skipped'] as const, STEP, 'waiting') };
    }).filter(s => s.text), 'step');
    return { id, title: plain(t.title, LIMITS.short) || human(id), speed, why: plain(t.why), hint: plain(t.hint),
      people: [...new Set(array(t.people).map(x => who.get(slug(x))).filter((x): x is string => !!x))].slice(0, 8),
      status, closedReason: plain(t.closedReason, LIMITS.short) || (status === 'closed' ? 'Resolved in the story' : ''),
      ifFollowed: plain(t.ifFollowed), ifIgnored: plain(t.ifIgnored), steps };
  }).filter(t => t.title), 'thread');

  if (previous) {
    for (const old of previous.threads) {
      const next = threads.find(t => t.id === old.id);
      if (!next) { threads.push(structuredClone(old)); continue; }
      // Put back steps the revision left out, where they were.
      old.steps.forEach((step, i) => { if (!next.steps.some(s => s.id === step.id)) next.steps.splice(Math.min(i, next.steps.length), 0, structuredClone(step)); });
      // What happened stays happened.
      next.steps = next.steps.map(s => { const before = old.steps.find(o => o.id === s.id); return before && before.status !== 'waiting' && !before.quick && s.status === 'waiting' ? { ...s, status: before.status } : s; });
    }
  }
  const knownThreads = new Set(previous?.threads.map(t => t.id));
  threads = cap(threads, LIMITS.threads, t => (knownThreads.has(t.id) ? 4 : 0) + (t.status === 'open' ? 2 : t.status === 'paused' ? 1 : 0));
  for (const t of threads) {
    const kept = new Set(previous?.threads.find(o => o.id === t.id)?.steps.map(s => s.id));
    t.steps = cap(t.steps, LIMITS.steps, s => (kept.has(s.id) ? 4 : 0) + (s.status !== 'waiting' ? 2 : 0));
    t.people = t.people.filter(id => people.some(p => p.id === id));
  }
  const threadIds = new Set(threads.map(t => t.id)), byTitle = new Map(threads.map(t => [slug(t.title), t.id]));

  let beats = ids(array(input.beats).map(raw => {
    const b = record(raw), text = plain(b.text), thread = slug(b.thread);
    return { id: slug(b.id) || slug(text).slice(0, 30), text, purpose: plain(b.purpose), conditions: plain(b.conditions),
      thread: threadIds.has(thread) ? thread : byTitle.get(thread) ?? '',
      intensity: pick(b.intensity, ['low', 'high'] as const, { big: 'high', major: 'high', strong: 'high', medium: 'low', small: 'low', minor: 'low' }, 'low'),
      status: pick(b.status, ['possible', 'happened', 'dropped'] as const, BEAT, 'possible') };
  }).filter(b => b.text), 'beat');
  if (previous) for (const old of previous.beats) {
    // A quick check's mark is provisional: the check-up may correct it.
    if (old.status !== 'happened' || old.quick) continue;
    const next = beats.find(b => b.id === old.id);
    if (!next) beats.push(structuredClone(old)); else next.status = 'happened';
  }
  beats = cap(beats, LIMITS.beats, b => (b.status === 'happened' ? 4 : b.status === 'possible' ? 2 : 0));

  // Breadcrumbs: details mentioned now and paid off later. Planted ones stay planted; dropped ones come back.
  const linkable = new Map<string, string>([...threads.map(t => [t.id, t.id] as [string, string]), ...threads.map(t => [slug(t.title), t.id] as [string, string]), ...beats.map(b => [b.id, b.id] as [string, string]), ['turn', 'turn']]);
  let seeds = ids(array(input.seeds).map(raw => {
    const s = record(raw), detail = plain(s.detail, LIMITS.short) || plain(s.text, LIMITS.short);
    return { id: slug(s.id) || slug(detail).slice(0, 30), detail, payoff: plain(s.payoff), pays: linkable.get(slug(s.pays)) ?? '',
      status: pick(s.status, ['waiting', 'planted', 'paid', 'echo', 'dropped'] as const, { mentioned: 'planted', shown: 'planted', used: 'paid', 'paid-off': 'paid', resolved: 'paid', done: 'paid', offscreen: 'echo', background: 'echo', rumor: 'echo', news: 'echo', cancelled: 'dropped', skipped: 'dropped' }, 'waiting') };
  }).filter(s => s.detail), 'seed');
  if (previous) for (const old of previous.seeds) {
    const next = seeds.find(s => s.id === old.id);
    if (!next) seeds.push(structuredClone(old));
    else if (old.status !== 'waiting' && !old.quick && next.status === 'waiting') next.status = old.status;
  }
  const keptSeeds = new Set(previous?.seeds.map(s => s.id));
  seeds = cap(seeds, LIMITS.seeds, s => (keptSeeds.has(s.id) ? 4 : 0) + (s.status === 'planted' ? 2 : s.status === 'waiting' ? 1 : 0));

  // The arc: a shape and a stage that belongs to it.
  const a = record(input.arc), shapeWord = typeof a.shape === 'string' ? a.shape.toLowerCase().replace(/[^a-z]/g, '') : '';
  const shape: Shape = shapeWord.startsWith('kish') ? 'kishotenketsu' : shapeWord === 'conflict' ? 'conflict' : previous?.arc.shape ?? 'conflict';
  const stageWord = typeof a.stage === 'string' ? a.stage.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '') : '';
  const STAGE_WORDS: Record<string, string> = { introduction: 'ki', development: 'sho', shou: 'sho', turn: 'ten', twist: 'ten', conclusion: 'ketsu', reconciliation: 'ketsu', together: 'ketsu', risingaction: 'rising', build: 'rising', resolve: 'resolution', aftermath: 'resolution' };
  const named = STAGES[shape].includes(stageWord) ? stageWord : STAGE_WORDS[stageWord];
  const stage = named && STAGES[shape].includes(named) ? named : previous && previous.arc.shape === shape ? previous.arc.stage : STAGES[shape][0];
  const arc = { shape, stage, turn: plain(a.turn) };

  // Too many events: fold the oldest into one line rather than lose them silently.
  let events = array(input.events).map(e => plain(typeof e === 'string' ? e : record(e).text)).filter(Boolean);
  if (events.length > LIMITS.events) { const fold = events.length - LIMITS.events + 1; events = [plain(`Earlier: ${events.slice(0, fold).join('; ')}`), ...events.slice(fold)]; }

  const c = record(input.clock), day = Math.round(Number(c.day)), hour = Number(c.hour), label = plain(c.label, LIMITS.short);
  const given = c.hour !== null && c.hour !== undefined && c.hour !== '' && Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : null;
  // No hour but words like "late morning": take the hour those words mean, rather than leaving it to a noon guess.
  const clock = { day: Number.isFinite(day) && day >= 0 && day <= 10_000_000 ? day : previous?.clock.day ?? 1, hour: given ?? readTime(label)?.hour ?? null, label };

  const question = plain(story.question) || plain(story.direction) || plain(story.stakes) || previous?.story.question || '';
  // Truths that came out: written as plain lines, no repeats, and no longer listed as hidden.
  const cameOut: Array<{ text: string }> = [];
  for (const item of array(story.cameOut)) { const t = plain(typeof item === 'string' ? item : record(item).text); if (t && cameOut.length < LIMITS.truths && !cameOut.some(r => r.text.toLowerCase() === t.toLowerCase())) cameOut.push({ text: t }); }
  const hiddenTruth = array(story.hiddenTruth).map(x => plain(x)).filter(t => t && !cameOut.some(r => r.text.toLowerCase() === t.toLowerCase())).slice(0, LIMITS.truths);
  return {
    version: 1,
    story: { question, stakes: plain(story.stakes), direction: plain(story.direction),
      hiddenTruth, twist: cameOut.some(r => r.text.toLowerCase() === plain(story.twist).toLowerCase()) ? '' : plain(story.twist), cameOut },
    arc, people, threads, beats, seeds, events, clock,
    rhythm: pick(input.rhythm, ['calm', 'rising', 'peak', 'aftermath', 'stalled'] as const, RHYTHM, 'calm'),
    summary: plain(input.summary, LIMITS.short),
  };
}
