import { describeClock, type StoryClock } from './clock';
import { readable } from './history';
import { whereabouts, type Whereabouts } from './layout';
import { type ClockSources, presentPeople, spokenOf } from './note';
import { type Moment, type Notebook, type Pace, type Person, type Rhythm } from './notebook';
import type { SkipOffer } from './skip';
import type { MemoryView } from './types';

/**
 * The Relic Tome card attached beneath the latest assistant reply in the chat.
 *
 * Purpose:
 * 1. Let the player see that Grimoire is working and what information it is
 *    using (story time, place, who is in the room vs. kept off-screen, active
 *    character sheets, rhythm, mystery progress, and callbacks) in plain,
 *    immersive English.
 * 2. Help the player proceed when a reply has dense or ambiguous prose via a
 *    collapsible-by-default "In Front of You" Hook Whisper at the top of the
 *    card ("Read the Room"), so the player always reads the story first.
 * 3. Never leak spoilers: hidden truths, twists, un-shown steps, un-paid
 *    breadcrumb meanings, unmet people, and locked mystery answers are never
 *    read here.
 */

export interface Foothold {
  kind: string;
  label: string;
  prompt: string;
}

export interface TomeItem {
  badge: string;
  label: string;
  detail: string;
  highlight?: boolean;
}

export interface TomeTab {
  id: 'because' | 'clue' | 'cast' | 'world';
  icon: string;
  short: string;
  subLabel: string;
  isNew: boolean;
  kicker: string;
  title: string;
  body: string;
  /** How this part of Grimoire works, in one plain sentence. Shown only when the player taps ⓘ, so it isn't read every reply. */
  about?: string;
  items: TomeItem[];
  footerLeft: string;
  footerRight: string;
  pips?: { found: number; total: number };
  seal?: boolean;
  eclipse?: boolean;
}

export interface TomeView {
  /** Stable Lumiverse message ID of the latest assistant story reply. */
  messageId: string;
  /** Current story reply number. */
  reply: number;
  /** 'active' opens the Tome to the new beat; 'quiet' folds to the spine; 'intimate' shows the veiled ribbon. */
  mode: 'active' | 'quiet' | 'intimate';
  defaultTab: TomeTab['id'];
  chapter: { label: string; title: string; recap: string } | null;
  compass: {
    hookCount: number;
    whisperLine: string;
    gist: string;
    footholds: Foothold[];
  } | null;
  pulse: {
    rhythm: Rhythm;
    label: string;
    color: string;
    statusLine: string;
  };
  tabs: TomeTab[];
  /** The player typed $grimoire for this reply: whether a deep look shaped it, and (once the reply checker has read it) whether the reply took it. Never the plan itself. */
  push?: { look: boolean; landed?: boolean; ready?: boolean; failed?: boolean };
}

export interface TomeInput {
  messageId: string;
  reply: number;
  latestReply: string;
  recentChat: string;
  narrated: string;
  trackerPresent?: string;
  location?: string;
  notebook: Notebook;
  pace: Pace;
  clock: StoryClock;
  sources: ClockSources;
  moment: Moment;
  intimate: boolean;
  seen: Record<string, number>;
  buildingId?: string;
  quick: { at: number; ok: boolean; error: string } | null;
  memory: MemoryView | null;
  skipOffer: SkipOffer | null;
}

const RHYTHM_META: Record<Rhythm, { label: string; title: string; color: string; desc: string }> = {
  calm: { label: 'Still Waters', title: 'Calm Waters', color: '#7cc4b8', desc: 'Ordinary time, with room to talk, look around, or take stock.' },
  rising: { label: 'Rising Tension', title: 'Tension is Building', color: '#f0b954', desc: 'Stakes and complications are building through what people say and do.' },
  peak: { label: 'Peak Moment', title: 'A Big Moment is Here', color: '#eb6b56', desc: 'A turning point, confrontation, or reveal is playing out right now.' },
  aftermath: { label: 'Aftermath', title: 'Catching Breath', color: '#9ca8e8', desc: 'Just after a big moment; Grimoire leaves room for the dust to settle.' },
  stalled: { label: 'Quiet Stretch', title: 'Ready to Move', color: '#d4a94e', desc: 'The scene has been circling; Grimoire is nudging an open thread forward.' },
};

const STAGE_NAMES: Record<string, string> = {
  setup: 'Setup',
  rising: 'Rising Action',
  climax: 'Climax',
  resolution: 'Resolution',
  ki: 'Introduction',
  sho: 'Development',
  ten: 'The Turn',
  ketsu: 'Bringing Together',
};

const PACE_NAMES: Record<Pace, string> = {
  auto: 'Auto',
  quiet: 'Quiet',
  fast: 'Fast',
};

const end = (text: string) => {
  const trimmed = text
    .trim()
    .replace(/(?:\.{2,}|…)+(["'”’)]*)$/g, '$1')
    .trim();
  if (!trimmed) return '';
  if (/[.!?]["'”’)]*$/.test(trimmed)) return trimmed;
  const quoteMatch = trimmed.match(/^(.*?)(["'”’)]+)$/);
  if (quoteMatch && quoteMatch[1]) return `${quoteMatch[1]}.${quoteMatch[2]}`;
  return `${trimmed}.`;
};

/** Split plain prose into complete sentences without breaking on inline ellipses ("...") or abbreviations. */
function sentences(prose: string): string[] {
  const clean = prose
    .replace(/(?:\.{3}|…)+$/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const token = '\uE000';
  const safe = clean.replace(/\.{3}|…/g, token);
  const matches = safe.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g) ?? [safe];
  return matches
    .map(s => s.replaceAll(token, '…').trim())
    .filter(s => s.length >= 4)
    .map(s => s.replace(/(?:\.{2,}|…)+(["'”’)]*)$/, '.$1'));
}

/** Extract the last spoken quote in a reply, if any, keeping the full spoken thought. */
function extractLastQuote(prose: string): string | null {
  const quotes = [...prose.matchAll(/(?:“([^”]{6,600})”|"([^"]{6,600})")/g)]
    .map(m => (m[1] ?? m[2] ?? '').trim().replace(/(?:\.{2,}|…)+$/, ''))
    .filter(q => q.length >= 6 && !/^[a-z0-9_-]+$/i.test(q));
  return quotes.at(-1) ?? null;
}

/** Find which present person is named closest to a quote in the reply. */
function speakerNearQuote(prose: string, quote: string, present: Person[]): Person | null {
  if (!present.length) return null;
  const idx = prose.lastIndexOf(quote);
  if (idx < 0) return present[0];
  const windowText = prose.slice(Math.max(0, idx - 140), Math.min(prose.length, idx + quote.length + 140)).toLowerCase();
  for (const p of present) {
    if ([p.name, ...p.aliases].some(n => n.length >= 2 && windowText.includes(n.toLowerCase()))) return p;
  }
  return present.length === 1 ? present[0] : null;
}

/** Describe the current room and building in one complete, natural sentence. */
function describeWhereabouts(at: Whereabouts | null, location?: string): string {
  if (at) {
    const { building, floor, room } = at;
    if (room && floor) {
      const near = room.near.length ? `, next to ${room.near.join(', ')}` : '';
      return `You are in the ${room.name.toLowerCase()} (${floor.name.toLowerCase()} of ${building.name})${near}.`;
    }
    return `You are in ${building.name}.`;
  }
  if (location) return `You are at ${end(location)}`;
  return '';
}

/**
 * Distill the latest reply and current scene into a plain-English landing beat
 * and 2–3 concrete footholds waiting on the player's move.
 * Uses only the reply itself and spoiler-safe, already-shown facts, always
 * finishing complete thoughts without trailing ellipses.
 */
export function distillScene(
  latestReply: string,
  notebook: Notebook,
  present: Person[],
  reply: number,
  location?: string,
  atBuilding?: Whereabouts | null,
): TomeView['compass'] {
  const clean = readable(latestReply, 50_000)
    .replace(/\[[a-z][\w:-]*\s+[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = sentences(clean);
  const lastTwo = lines.slice(-2).join(' ').trim();
  const lastOne = (lines.at(-1) ?? '').trim();
  const rawGist = (lastTwo.length > 480 && lastOne.length >= 40 ? lastOne : lastTwo) || notebook.recap || '';
  const gist = end(rawGist);
  if (!gist) return null;

  const footholds: Foothold[] = [];

  // 1. Direct speech or question in the latest reply
  const quote = extractLastQuote(clean);
  if (quote) {
    const speaker = speakerNearQuote(clean, quote, present);
    const isQuestion = quote.trim().endsWith('?');
    const cleanQuote =/[.!?]$/.test(quote) ? quote : `${quote}.`;
    footholds.push({
      kind: isQuestion ? 'QUESTION IN THE AIR' : 'SPOKEN IN THE SCENE',
      label: speaker ? `${speaker.name}’s Words` : isQuestion ? 'Question Put to You' : 'Spoken to You',
      prompt: `“${cleanQuote}”${isQuestion ? ' Waiting on your answer.' : ''}`,
    });
  }

  // 2. A clue or storyline development that just landed on this reply
  const newClue = notebook.mystery?.clues.find(c => c.status === 'found' && c.foundAt === reply);
  if (newClue) {
    footholds.push({
      kind: 'CLUE IN REACH',
      label: newClue.where || 'New Clue Noticed',
      prompt: end(newClue.text),
    });
  } else {
    const shownNow = notebook.threads
      .flatMap(t => t.steps.filter(s => s.status === 'shown' && s.atReply === reply).map(s => ({ thread: t, step: s })))[0];
    if (shownNow) {
      footholds.push({
        kind: 'WHAT JUST LANDED',
        label: shownNow.thread.title,
        prompt: end(shownNow.step.sign || shownNow.step.text),
      });
    }
  }

  // 3. People present in the room and what they are outwardly doing
  for (const person of present) {
    if (footholds.length >= 3) break;
    if (footholds.some(f => f.label.startsWith(person.name))) continue;
    const doing = person.doing ? end(person.doing) : 'Here with you.';
    footholds.push({
      kind: 'IN THE ROOM',
      label: `${person.name}${person.role ? ` · ${person.role}` : ''}`,
      prompt: doing,
    });
  }

  // 4. Place, nearby rooms, or story recap if room remains
  const placeSentence = describeWhereabouts(atBuilding ?? null, location);
  if (footholds.length < 3 && placeSentence) {
    footholds.push({
      kind: 'LAY OF THE LAND',
      label: location || atBuilding?.building.name || 'Where You Stand',
      prompt: placeSentence,
    });
  }
  if (footholds.length < 3 && notebook.recap) {
    footholds.push({
      kind: 'THE STORY SO FAR',
      label: 'Where Things Stand',
      prompt: end(notebook.recap),
    });
  }
  if (!footholds.length) {
    footholds.push({
      kind: 'THE SCENE AT HAND',
      label: 'Your Move',
      prompt: 'React to what is in front of you, ask a question, or take the scene somewhere new.',
    });
  }

  const whisperLine = footholds.map(f => f.label).join('  ·  ');
  return {
    hookCount: footholds.length,
    whisperLine,
    gist,
    footholds: footholds.slice(0, 3),
  };
}

export function buildTome(input: TomeInput): TomeView {
  const { notebook, reply, pace, clock, sources, intimate } = input;
  const present = presentPeople(notebook, input.narrated || input.recentChat, input.trackerPresent);
  const named = spokenOf(notebook, input.recentChat, present);

  // Building layout if known
  const atBuilding = whereabouts(notebook.buildings ?? [], input.location, input.buildingId ?? '');

  // 1. Chapter Crest when a part starts on this reply
  const isChapterStart = notebook.arc.startReply !== undefined && notebook.arc.startReply === reply && reply > 0;
  const stageName = STAGE_NAMES[notebook.arc.stage] ?? notebook.arc.stage;
  const mainThread = notebook.threads.find(t => t.id === notebook.arc.main);
  const mainHasShown = !!mainThread?.steps.some(s => s.status === 'shown');
  const chapter = isChapterStart
    ? {
        label: notebook.arc.opening === 'chapter' ? 'New Chapter' : 'Opening Chapter',
        title: (mainHasShown ? mainThread?.title : '') || stageName || 'A New Part Begins',
        recap: notebook.recap ? end(notebook.recap) : 'A new part of your story is under way.',
      }
    : null;

  // 2. Tab 1: "Because You…" (Callbacks, Paid Breadcrumbs, Truths that Came Out, Scars, Player Lies)
  const paidSeeds = notebook.seeds
    .filter(s => s.status === 'paid')
    .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
  const cameOut = [...notebook.story.cameOut].sort((a, b) => (b.atReply ?? 0) - (a.atReply ?? 0));
  const scars = notebook.threads.filter(t => t.status === 'closed' && t.outcome === 'lost' && t.scar);
  const playerCovers = (notebook.covers ?? []).filter(c => c.by === 'player' && c.status !== 'exposed');
  const plantedCount = notebook.seeds.filter(s => s.status === 'planted').length;

  const paidNow = paidSeeds.find(s => s.paidAt === reply);
  const truthNow = cameOut.find(r => r.atReply === reply);
  const becauseNew = !!paidNow || !!truthNow;

  const becauseItems: TomeItem[] = [];
  for (const s of paidSeeds.slice(0, 3)) {
    becauseItems.push({
      badge: s.paidAt === reply ? 'PAID OFF NOW' : s.plantedAt !== undefined ? `FROM REPLY ${s.plantedAt}` : 'CALLBACK',
      label: end(s.detail),
      detail: end(s.payoff),
      highlight: s.paidAt === reply,
    });
  }
  for (const r of cameOut.slice(0, 2)) {
    becauseItems.push({
      badge: r.atReply === reply ? 'CAME OUT NOW' : r.atReply !== undefined ? `REPLY ${r.atReply}` : 'KNOWN FACT',
      label: 'Out in the Open',
      detail: end(r.text),
      highlight: r.atReply === reply,
    });
  }
  for (const t of scars.slice(-2)) {
    becauseItems.push({
      badge: 'STILL FELT',
      label: t.title,
      detail: end(t.scar!),
    });
  }
  for (const c of playerCovers.slice(0, 2)) {
    const whoHeard = notebook.people.filter(p => c.told.includes(p.id)).map(p => p.name).join(' & ') || 'People here';
    becauseItems.push({
      badge: c.status === 'strained' ? 'DOUBTED LIE' : 'YOUR WORD',
      label: `Told to ${whoHeard}`,
      detail: `“${end(c.said)}”${c.status === 'strained' ? ' — starting to wear thin.' : ' — remembered when they are around.'}`,
    });
  }

  const topBecause = paidNow
    ? {
        sub: paidNow.plantedAt !== undefined ? `From Reply #${paidNow.plantedAt}` : 'Callback landed',
        kicker: `PAST DETAIL PAID OFF${paidNow.plantedAt !== undefined ? ` · PLANTED AT REPLY #${paidNow.plantedAt}` : ''}`,
        title: end(paidNow.detail),
        body: end(paidNow.payoff),
      }
    : truthNow
    ? {
        sub: 'Secret came out',
        kicker: 'OUT IN THE OPEN',
        title: end(truthNow.text),
        body: '',
        about: 'Grimoire marked this as known to you now, so people stop acting as if it were still secret.',
      }
    : paidSeeds[0]
    ? {
        sub: `${paidSeeds.length} paid · ${plantedCount} planted`,
        kicker: 'WHAT CAME BACK',
        title: end(paidSeeds[0].detail),
        body: end(paidSeeds[0].payoff),
      }
    : scars[0]
    ? {
        sub: 'Lasting mark',
        kicker: 'STILL FELT FROM EARLIER',
        title: scars[0].title,
        body: end(scars[0].scar!),
      }
    : playerCovers[0]
    ? {
        sub: `${playerCovers.length} cover ${playerCovers.length === 1 ? 'story' : 'stories'}`,
        kicker: 'WHAT PEOPLE REMEMBER YOU SAID',
        title: `“${end(playerCovers[0].said)}”`,
        body: '',
        about: 'Grimoire reminds the narrator of cover stories and promises you have made whenever those people are in the scene.',
      }
    : {
        sub: plantedCount ? `${plantedCount} planted so far` : 'Watching your choices',
        kicker: 'WHAT COMES BACK',
        title: plantedCount
          ? `${plantedCount} small ${plantedCount === 1 ? 'detail has' : 'details have'} been planted in passing`
          : 'Grimoire is watching what you say and do',
        body: '',
        about: 'When an earlier detail, promise, or choice comes back later in the story, it shows here with the reply it came from.',
      };

  const becauseTab: TomeTab = {
    id: 'because',
    icon: '↩',
    short: 'Because You…',
    subLabel: topBecause.sub,
    isNew: becauseNew,
    kicker: topBecause.kicker,
    title: topBecause.title,
    body: topBecause.body,
    ...('about' in topBecause && topBecause.about ? { about: topBecause.about } : {}),
    // The headline item is already the card's title.
    items: becauseItems.filter(i => i.label !== topBecause.title).slice(0, 3),
    footerLeft: paidSeeds.length ? `${paidSeeds.length} ${paidSeeds.length === 1 ? 'callback' : 'callbacks'} paid off` : 'No callbacks paid off yet',
    footerRight: plantedCount ? `${plantedCount} earlier ${plantedCount === 1 ? 'detail' : 'details'} waiting in the wings` : 'Spoiler-safe continuity',
    seal: true,
  };

  // 3. Tab 2: "Clue Found" (when a mystery exists) or "Story Beats" (shown developments)
  // Note: While a mystery is open, m.question is NEVER shown here because the mystery's subject
  // may not have surfaced in the chat yet; only clues the player has actually found are shown.
  let clueTab: TomeTab;
  const foundCluesCount = notebook.mystery ? notebook.mystery.clues.filter(c => c.status === 'found').length : 0;
  if (notebook.mystery) {
    const m = notebook.mystery;
    const found = m.clues.filter(c => c.status === 'found').sort((a, b) => (b.foundAt ?? 0) - (a.foundAt ?? 0));
    const foundNow = found.find(c => c.foundAt === reply);
    const mysteryJustEnded = m.endReply === reply && m.status !== 'open';
    const isNew = !!foundNow || mysteryJustEnded;
    const newest = foundNow ?? found[0];

    const items: TomeItem[] = found.slice(0, 5).map((c, idx) => ({
      badge: c.foundAt === reply ? 'FOUND NOW' : c.foundAt !== undefined ? `REPLY ${c.foundAt}` : `CLUE ${found.length - idx}`,
      label: c.where || 'Discovered Clue',
      detail: end(c.text),
      highlight: c.foundAt === reply,
    }));

    for (const t of m.theories.slice(-2).reverse()) {
      items.push({
        badge: t.verdict === 'right' ? 'SOLVED' : 'YOUR GUESS',
        label: 'Theory Tested in Chat',
        detail: `“${end(t.text)}”`,
        highlight: t.atReply === reply,
      });
    }

    clueTab = {
      id: 'clue',
      icon: '◆',
      short: 'Clue Found',
      subLabel: m.status === 'solved'
        ? 'Mystery solved'
        : m.status === 'revealed'
        ? 'Truth came out'
        : found.length
        ? `${found.length} of ${m.clues.length} found`
        : 'None found yet',
      isNew,
      kicker: m.status === 'solved'
        ? 'MYSTERY SOLVED · CASE CLOSED'
        : m.status === 'revealed'
        ? 'MYSTERY ENDED · TRUTH CAME OUT'
        : 'MYSTERY LEDGER',
      title: m.status !== 'open'
        ? end(m.question)
        : newest
        ? end(newest.text)
        : 'No clues discovered yet',
      body: m.status !== 'open'
        ? m.status === 'solved'
          ? 'You pieced together the mystery in the chat. The full truth is now in play.'
          : 'The mystery has come out in the story, and everyone in the scene can now react to it.'
        : newest?.where
        ? `Found at ${end(newest.where)}`
        : '',
      about: m.status === 'open' ? 'Clues are recorded as you find them in the chat. What they point to, and the answer, stay hidden until you work it out; the narrator doesn’t know the answer either.' : undefined,
      // The newest clue is already the card's title.
      items: items.filter(i => i.detail !== (newest ? end(newest.text) : '')).slice(0, 3),
      footerLeft: m.status === 'open' ? 'The narrator does not know the answer while open' : `Mystery ${m.status}`,
      footerRight: `${found.length} of ${m.clues.length} clues found`,
      pips: { found: found.length, total: m.clues.length },
    };
  } else {
    const shownSteps = notebook.threads
      .flatMap(t => t.steps.filter(s => s.status === 'shown').map(s => ({ thread: t, step: s })))
      .sort((a, b) => (b.step.atReply ?? 0) - (a.step.atReply ?? 0));
    const shownNow = shownSteps.find(x => x.step.atReply === reply);
    const openCount = notebook.threads.filter(t => t.status === 'open').length;
    const latest = shownNow ?? shownSteps[0];

    const items: TomeItem[] = shownSteps.slice(0, 4).map(x => ({
      badge: x.step.atReply === reply ? 'HAPPENED NOW' : x.step.atReply !== undefined ? `REPLY ${x.step.atReply}` : 'SHOWN',
      label: x.thread.title,
      detail: end(x.step.sign || x.step.text),
      highlight: x.step.atReply === reply,
    }));

    clueTab = {
      id: 'clue',
      icon: '◆',
      short: 'Story Beats',
      subLabel: shownNow ? 'New beat shown' : `${shownSteps.length} shown · ${openCount} open`,
      isNew: !!shownNow,
      kicker: 'STORY BEATS',
      title: latest ? end(latest.step.sign || latest.step.text) : 'Storylines are in motion',
      body: latest ? `From “${latest.thread.title}”.` : notebook.recap ? end(notebook.recap) : '',
      about: 'Developments show here once they play out in the chat, so the narrator moves on to what comes next.',
      items: items.filter(i => !(latest && i.detail === end(latest.step.sign || latest.step.text))).slice(0, 3),
      footerLeft: mainHasShown && mainThread ? `Main storyline: ${mainThread.title}` : `${openCount} ${openCount === 1 ? 'storyline' : 'storylines'} in play`,
      footerRight: `${shownSteps.length} ${shownSteps.length === 1 ? 'development' : 'developments'} shown so far`,
    };
  }

  // 4. Tab 3: "Who’s Here" (Present in scene vs. Mentioned & kept off-screen)
  const castItems: TomeItem[] = [];
  for (const p of present) {
    const hasSheet = !!(p.sheet || p.own);
    castItems.push({
      badge: 'HERE',
      label: `${p.name}${p.role ? ` · ${p.role}` : ''}`,
      detail: p.doing ? end(p.doing) : '',
      highlight: true,
    });
  }
  for (const p of named.slice(0, 3)) {
    castItems.push({
      badge: 'ELSEWHERE',
      label: `${p.name}${p.role ? ` · ${p.role}` : ''}`,
      detail: p.doing ? end(p.doing) : 'Busy with their own day.',
    });
  }

  const metCount = notebook.people.filter(p => p.status === 'active' && p.met).length;
  const castSub = present.length
    ? `${present.slice(0, 2).map(p => p.name).join(' · ')}${present.length > 2 ? ` +${present.length - 2}` : ''}`
    : named.length
    ? `${named.length} kept off-screen`
    : 'Solo scene';

  const castTab: TomeTab = {
    id: 'cast',
    icon: '👥',
    short: 'Who’s Here',
    subLabel: castSub,
    isNew: false,
    kicker: 'IN THE SCENE',
    title: present.length
      ? `${present.map(p => p.name).join(', ')} in the room`
      : 'Nobody else is in the room',
    body: '',
    about: 'Grimoire gives the narrator voices and character sheets only for people in the scene. Anyone just talked about stays busy elsewhere, so saying a name doesn’t bring them in.',
    items: castItems,
    footerLeft: `${present.filter(p => p.sheet || p.own).length} full character ${present.filter(p => p.sheet || p.own).length === 1 ? 'sheet' : 'sheets'} in this note`,
    footerRight: `${metCount} known ${metCount === 1 ? 'person' : 'people'} in your story`,
  };

  // 5. Tab 4: "World & Pulse" (Off-screen movement, Story Pulse, Clock/Location/Memory sources)
  const offscreenSteps = notebook.threads.flatMap(t => t.steps.filter(s => s.status === 'offscreen'));
  const offscreenNow = offscreenSteps.some(s => s.atReply === reply);
  const echoNow = notebook.seeds.some(s => s.status === 'echo' && s.echoAt === reply);
  const worldMovedNow = offscreenNow || echoNow;

  const rMeta = RHYTHM_META[notebook.rhythm] ?? RHYTHM_META.calm;
  const clockLabel = describeClock(clock);
  const clockSourceText = sources.day === 'tracker' && sources.hour === 'tracker'
    ? 'Read from your preset’s tracker'
    : sources.day === 'tracker' || sources.hour === 'tracker'
    ? 'Partly from your tracker, rest kept by Grimoire'
    : 'Kept by Grimoire’s story clock';

  const worldItems: TomeItem[] = [
    { badge: 'NOW', label: `${clockLabel}${input.location ? ` · ${input.location}` : ''}`, detail: '' },
    { badge: 'PACE', label: PACE_NAMES[pace], detail: '' },
  ];

  if (worldMovedNow || offscreenSteps.length > 0) {
    worldItems.push({
      badge: worldMovedNow ? 'MOVED THIS TURN' : 'OFF-SCREEN',
      label: worldMovedNow ? 'The World Moved Off-Screen' : `${offscreenSteps.length} Off-Screen ${offscreenSteps.length === 1 ? 'Step' : 'Steps'} So Far`,
      detail: '',
      highlight: worldMovedNow,
    });
  }

  // What fed the note (memories, the quick check) is in the drawer's Behind the scenes, not under every reply.

  const worldTab: TomeTab = {
    id: 'world',
    icon: '🌘',
    short: worldMovedNow ? 'World Moved' : 'World & Pulse',
    subLabel: worldMovedNow ? 'Off-screen shift' : `${rMeta.label} · ${PACE_NAMES[pace]}`,
    isNew: worldMovedNow,
    kicker: worldMovedNow
      ? 'UNSEEN CURRENTS'
      : 'STORY PULSE',
    title: worldMovedNow
      ? 'Something moved beyond the scene on this turn'
      : `${rMeta.title} (${stageName})`,
    body: worldMovedNow
      ? 'You’ll learn what happened when word reaches you or you run into it.'
      : rMeta.desc,
    about: `Story time is ${clockSourceText.toLowerCase()}.${atBuilding ? ` Grimoire knows the layout of ${atBuilding.building.name}, to keep rooms consistent.` : ''}`,
    items: worldItems,
    footerLeft: `Story time: ${clockLabel}`,
    footerRight: `${offscreenSteps.length} off-screen ${offscreenSteps.length === 1 ? 'step' : 'steps'} recorded`,
    eclipse: worldMovedNow,
  };

  const tabs: TomeTab[] = [becauseTab, clueTab, castTab, worldTab];
  const newTabs = tabs.filter(t => t.isNew);
  const mode: TomeView['mode'] = intimate
    ? 'intimate'
    : newTabs.length > 0 || chapter !== null
    ? 'active'
    : 'quiet';

  const defaultTab: TomeTab['id'] = newTabs[0]?.id ?? (notebook.mystery?.status === 'open' && foundCluesCount > 0 ? 'clue' : 'cast');

  const statusLine = mode === 'intimate'
    ? 'Grimoire has stepped back — story clocks and outside threads are paused while this scene plays out.'
    : newTabs.length > 0
    ? `${newTabs.length} new ${newTabs.length === 1 ? 'mark' : 'marks'} recorded on this reply`
    : `Quiet turn${present.length ? ` · ${present.slice(0, 2).map(p => p.name).join(', ')} present` : ''}`;

  const compass = intimate
    ? null
    : distillScene(
        input.latestReply,
        notebook,
        present,
        reply,
        input.location,
        atBuilding,
      );

  return {
    messageId: input.messageId,
    reply,
    mode,
    defaultTab,
    chapter,
    compass,
    pulse: {
      rhythm: notebook.rhythm,
      label: rMeta.label,
      color: rMeta.color,
      statusLine,
    },
    tabs,
  };
}
