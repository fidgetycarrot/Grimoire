import { describeClock, type StoryClock } from './clock';
import { readable, spaces } from './history';
import { layoutLine, whereabouts } from './layout';
import { type ClockSources, fit, presentPeople, spokenOf } from './note';
import { STAGES, type Moment, type Notebook, type Pace, type Person, type Rhythm } from './notebook';
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
  const trimmed = text.trim().replace(/[.!?]+$/, '');
  return trimmed ? `${trimmed}.` : '';
};

/** Split plain prose into clean sentences. */
function sentences(prose: string): string[] {
  const clean = prose.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const matches = clean.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g) ?? [clean];
  return matches.map(s => s.trim()).filter(s => s.length >= 4);
}

/** Extract the last spoken quote in a reply, if any. */
function extractLastQuote(prose: string): string | null {
  const quotes = [...prose.matchAll(/(?:“([^”]{6,220})”|"([^"]{6,220})")/g)]
    .map(m => (m[1] ?? m[2] ?? '').trim())
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

/**
 * Distill the latest reply and current scene into a plain-English landing beat
 * and 2–3 concrete footholds waiting on the player's move.
 * Uses only the reply itself and spoiler-safe, already-shown facts.
 */
export function distillScene(
  latestReply: string,
  notebook: Notebook,
  present: Person[],
  reply: number,
  location?: string,
  buildingLine?: string,
): TomeView['compass'] {
  const clean = readable(latestReply, 4000)
    .replace(/\[[a-z][\w:-]*\s+[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = sentences(clean);
  const tail = lines.slice(-2).join(' ').trim();
  const gist = fit(tail || notebook.recap || notebook.summary || notebook.story.question, 340);
  if (!gist) return null;

  const footholds: Foothold[] = [];

  // 1. Direct speech or question in the latest reply
  const quote = extractLastQuote(clean);
  if (quote) {
    const speaker = speakerNearQuote(clean, quote, present);
    const isQuestion = quote.trim().endsWith('?');
    footholds.push({
      kind: isQuestion ? 'QUESTION IN THE AIR' : 'SPOKEN IN THE SCENE',
      label: speaker ? `${speaker.name}’s Words` : isQuestion ? 'Question Put to You' : 'Spoken to You',
      prompt: `“${fit(quote, 150)}” — ${isQuestion ? 'Waiting on your answer, or you can turn the question back.' : 'You can answer, press further, or act on what is around you.'}`,
    });
  }

  // 2. A clue or storyline development that just landed on this reply
  const newClue = notebook.mystery?.clues.find(c => c.status === 'found' && c.foundAt === reply);
  if (newClue) {
    footholds.push({
      kind: 'CLUE IN REACH',
      label: newClue.where ? fit(newClue.where, 48) : 'New Clue Noticed',
      prompt: `${end(fit(newClue.text, 160))} You can inspect it closer, ask someone here about it, or keep it to yourself.`,
    });
  } else {
    const shownNow = notebook.threads
      .flatMap(t => t.steps.filter(s => s.status === 'shown' && s.atReply === reply).map(s => ({ thread: t, step: s })))[0];
    if (shownNow) {
      footholds.push({
        kind: 'WHAT JUST LANDED',
        label: fit(shownNow.thread.title, 48),
        prompt: `${end(fit(shownNow.step.sign || shownNow.step.text, 160))} What you do with it next is yours.`,
      });
    }
  }

  // 3. People present in the room and what they are outwardly doing
  for (const person of present) {
    if (footholds.length >= 3) break;
    if (footholds.some(f => f.label.startsWith(person.name))) continue;
    const doing = person.doing ? end(fit(person.doing, 140)) : 'Here with you in the scene.';
    footholds.push({
      kind: 'IN THE ROOM',
      label: `${person.name}${person.role ? ` · ${fit(person.role, 28)}` : ''}`,
      prompt: `${doing} You can talk with ${person.name}, watch their reaction, or make a move.`,
    });
  }

  // 4. Place, nearby rooms, or main storyline direction if room remains
  if (footholds.length < 3 && (location || buildingLine)) {
    footholds.push({
      kind: 'LAY OF THE LAND',
      label: fit(location || 'Where You Stand', 48),
      prompt: buildingLine
        ? end(fit(buildingLine.replace(/^Layout of /i, ''), 160))
        : `You are at ${end(fit(location!, 120))} You can stay in the moment or move somewhere new.`,
    });
  }
  if (footholds.length < 3 && notebook.recap) {
    footholds.push({
      kind: 'THE STORY SO FAR',
      label: 'Where Things Stand',
      prompt: fit(notebook.recap, 170),
    });
  }
  if (!footholds.length) {
    footholds.push({
      kind: 'THE SCENE AT HAND',
      label: 'Your Move',
      prompt: fit(notebook.story.question || 'React to what is in front of you, ask a question, or take the scene somewhere new.', 170),
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
  const buildingText = atBuilding ? layoutLine(atBuilding) : undefined;

  // 1. Chapter Crest when a part starts on this reply
  const isChapterStart = notebook.arc.startReply !== undefined && notebook.arc.startReply === reply && reply > 0;
  const stageName = STAGE_NAMES[notebook.arc.stage] ?? notebook.arc.stage;
  const mainThread = notebook.threads.find(t => t.id === notebook.arc.main);
  const chapter = isChapterStart
    ? {
        label: notebook.arc.opening === 'chapter' ? 'New Chapter' : 'Opening Chapter',
        title: mainThread?.title || stageName || 'A New Part Begins',
        recap: notebook.recap || fit(notebook.story.question, 180),
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
      label: fit(s.detail, 70),
      detail: end(fit(s.payoff, 180)),
      highlight: s.paidAt === reply,
    });
  }
  for (const r of cameOut.slice(0, 2)) {
    becauseItems.push({
      badge: r.atReply === reply ? 'CAME OUT NOW' : r.atReply !== undefined ? `REPLY ${r.atReply}` : 'KNOWN FACT',
      label: 'Out in the Open',
      detail: end(fit(r.text, 180)),
      highlight: r.atReply === reply,
    });
  }
  for (const t of scars.slice(-2)) {
    becauseItems.push({
      badge: 'STILL FELT',
      label: t.title,
      detail: end(fit(t.scar!, 160)),
    });
  }
  for (const c of playerCovers.slice(0, 2)) {
    const whoHeard = notebook.people.filter(p => c.told.includes(p.id)).map(p => p.name).join(' & ') || 'People here';
    becauseItems.push({
      badge: c.status === 'strained' ? 'DOUBTED LIE' : 'YOUR WORD',
      label: `Told to ${whoHeard}`,
      detail: `“${fit(c.said, 120)}”${c.status === 'strained' ? ' — starting to wear thin.' : ' — remembered when they are around.'}`,
    });
  }

  const topBecause = paidNow
    ? {
        sub: paidNow.plantedAt !== undefined ? `From Reply #${paidNow.plantedAt}` : 'Callback landed',
        kicker: `PAST DETAIL PAID OFF${paidNow.plantedAt !== undefined ? ` · PLANTED AT REPLY #${paidNow.plantedAt}` : ''}`,
        title: fit(paidNow.detail, 110),
        body: end(fit(paidNow.payoff, 240)),
      }
    : truthNow
    ? {
        sub: 'Secret came out',
        kicker: 'NOW ESTABLISHED · OUT IN THE OPEN',
        title: fit(truthNow.text, 110),
        body: 'Grimoire marked this as known to you now, so people stop acting as if it were still secret.',
      }
    : paidSeeds[0]
    ? {
        sub: `${paidSeeds.length} paid · ${plantedCount} planted`,
        kicker: 'CONTINUITY & CALLBACKS · WHAT CAME BACK',
        title: fit(paidSeeds[0].detail, 110),
        body: end(fit(paidSeeds[0].payoff, 240)),
      }
    : scars[0]
    ? {
        sub: 'Lasting mark',
        kicker: 'STILL FELT FROM EARLIER',
        title: scars[0].title,
        body: end(fit(scars[0].scar!, 240)),
      }
    : playerCovers[0]
    ? {
        sub: `${playerCovers.length} cover ${playerCovers.length === 1 ? 'story' : 'stories'}`,
        kicker: 'WHAT PEOPLE REMEMBER YOU SAID',
        title: `“${fit(playerCovers[0].said, 90)}”`,
        body: 'Grimoire reminds the narrator of cover stories and promises you have made whenever those people are in the scene.',
      }
    : {
        sub: plantedCount ? `${plantedCount} planted so far` : 'Watching your choices',
        kicker: 'CONTINUITY & CONSEQUENCES',
        title: plantedCount
          ? `${plantedCount} small ${plantedCount === 1 ? 'detail has' : 'details have'} been planted in passing`
          : 'Grimoire is watching what you say and do',
        body: 'When an earlier detail, promise, or choice comes back later in the story, this seal lights up with the reply it came from.',
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
    items: becauseItems.slice(0, 4),
    footerLeft: paidSeeds.length ? `${paidSeeds.length} ${paidSeeds.length === 1 ? 'callback' : 'callbacks'} paid off` : 'No callbacks paid off yet',
    footerRight: plantedCount ? `${plantedCount} earlier ${plantedCount === 1 ? 'detail' : 'details'} waiting in the wings` : 'Spoiler-safe continuity',
    seal: true,
  };

  // 3. Tab 2: "Clue Found" (when a mystery exists) or "Story Beats" (shown developments)
  let clueTab: TomeTab;
  if (notebook.mystery) {
    const m = notebook.mystery;
    const found = m.clues.filter(c => c.status === 'found').sort((a, b) => (b.foundAt ?? 0) - (a.foundAt ?? 0));
    const foundNow = found.find(c => c.foundAt === reply);
    const mysteryJustEnded = m.endReply === reply && m.status !== 'open';
    const isNew = !!foundNow || mysteryJustEnded;
    const newest = foundNow ?? found[0];

    const items: TomeItem[] = found.slice(0, 5).map((c, idx) => ({
      badge: c.foundAt === reply ? 'FOUND NOW' : c.foundAt !== undefined ? `REPLY ${c.foundAt}` : `CLUE ${found.length - idx}`,
      label: c.where ? fit(c.where, 50) : 'Discovered Clue',
      detail: end(fit(c.text, 190)),
      highlight: c.foundAt === reply,
    }));

    for (const t of m.theories.slice(-2).reverse()) {
      items.push({
        badge: t.verdict === 'right' ? 'SOLVED' : 'YOUR GUESS',
        label: 'Theory Tested in Chat',
        detail: `“${fit(t.text, 150)}”`,
        highlight: t.atReply === reply,
      });
    }

    clueTab = {
      id: 'clue',
      icon: '◆',
      short: 'Clue Found',
      subLabel: m.status === 'solved' ? 'Mystery solved' : m.status === 'revealed' ? 'Truth came out' : `${found.length} of ${m.clues.length} found`,
      isNew,
      kicker: m.status === 'solved'
        ? 'MYSTERY SOLVED · CASE CLOSED'
        : m.status === 'revealed'
        ? 'MYSTERY ENDED · TRUTH CAME OUT'
        : `MYSTERY LEDGER · ${found.length} OF ${m.clues.length} CLUES DISCOVERED`,
      title: newest ? fit(newest.text, 120) : fit(m.question, 120),
      body: newest
        ? `Mystery question: ${end(fit(m.question, 180))}${newest.where ? ` Noticed at: ${end(fit(newest.where, 90))}` : ''}`
        : `Mystery question: ${end(fit(m.question, 200))} Clues appear in the story when you are in the right place or with someone who holds one.`,
      items,
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
      detail: end(fit(x.step.sign || x.step.text, 180)),
      highlight: x.step.atReply === reply,
    }));

    clueTab = {
      id: 'clue',
      icon: '◆',
      short: 'Story Beats',
      subLabel: shownNow ? 'New beat shown' : `${shownSteps.length} shown · ${openCount} open`,
      isNew: !!shownNow,
      kicker: `STORY DEVELOPMENTS · ${openCount} OPEN ${openCount === 1 ? 'STORYLINE' : 'STORYLINES'}`,
      title: latest ? fit(latest.step.sign || latest.step.text, 120) : fit(notebook.story.question, 120),
      body: latest
        ? `From storyline “${latest.thread.title}”. Grimoire marked this development as shown so the narrator moves on to what comes next.`
        : `Main question: ${end(fit(notebook.story.question, 200))}`,
      items,
      footerLeft: mainThread ? `Main storyline: ${mainThread.title}` : `${openCount} storylines in play`,
      footerRight: `${shownSteps.length} ${shownSteps.length === 1 ? 'development' : 'developments'} shown so far`,
    };
  }

  // 4. Tab 3: "Who’s Here" (Present in scene vs. Mentioned & kept off-screen)
  const castItems: TomeItem[] = [];
  for (const p of present) {
    const hasSheet = !!(p.sheet || p.own);
    castItems.push({
      badge: hasSheet ? 'SHEET IN NOTE' : 'VOICE IN NOTE',
      label: `${p.name}${p.role ? ` · ${fit(p.role, 36)}` : ''}`,
      detail: `${p.doing ? end(fit(p.doing, 140)) : 'In the scene.'}${hasSheet ? ' Full character sheet active.' : ' Voice and goals active.'}`,
      highlight: true,
    });
  }
  for (const p of named.slice(0, 3)) {
    castItems.push({
      badge: 'KEPT OFF-SCREEN',
      label: `${p.name}${p.role ? ` · ${fit(p.role, 36)}` : ''}`,
      detail: `Mentioned only — Grimoire told the narrator they stay busy elsewhere (${fit(p.doing || 'with their own day', 110)}) so a name being said doesn’t walk them in.`,
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
    kicker: `IN THE SCENE · ${present.length} PRESENT${named.length ? ` · ${named.length} KEPT OFF-SCREEN` : ''}`,
    title: present.length
      ? `${present.map(p => p.name).join(', ')} in the room`
      : 'No other tracked characters are in the room right now',
    body: present.length
      ? 'Grimoire only loads character sheets and voices for people actually in the scene. Anyone merely talked about is kept busy elsewhere.'
      : named.length
      ? 'You talked about people who aren’t here; Grimoire told the narrator what they are busy with elsewhere so they don’t appear out of nowhere.'
      : 'Grimoire is watching for when known faces or new ones enter the scene.',
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
    {
      badge: sources.day === 'tracker' || sources.hour === 'tracker' ? 'TRACKER SYNC' : 'STORY CLOCK',
      label: `${clockLabel}${input.location ? ` · ${fit(input.location, 45)}` : ''}`,
      detail: `${clockSourceText}.${atBuilding ? ` Room layout loaded for ${atBuilding.building.name}.` : ''}`,
      highlight: true,
    },
    {
      badge: `PACE: ${PACE_NAMES[pace].toUpperCase()}`,
      label: `${rMeta.label} · ${notebook.arc.shape === 'kishotenketsu' ? 'Kishōtenketsu' : 'Conflict'} (${stageName})`,
      detail: rMeta.desc,
    },
  ];

  if (worldMovedNow || offscreenSteps.length > 0) {
    worldItems.push({
      badge: worldMovedNow ? 'MOVED THIS TURN' : 'OFF-SCREEN',
      label: worldMovedNow ? 'The World Moved Off-Screen' : `${offscreenSteps.length} Off-Screen ${offscreenSteps.length === 1 ? 'Step' : 'Steps'} So Far`,
      detail: 'Something shifted elsewhere while you were here. Grimoire keeps the details hidden until they cross your path in the story.',
      highlight: worldMovedNow,
    });
  }

  if (input.memory?.last || input.quick) {
    const memPart = input.memory?.last
      ? input.memory.last.to === 'note'
        ? `${input.memory.last.found} Lumiverse ${input.memory.last.found === 1 ? 'memory' : 'memories'} added to the note`
        : input.memory.last.to === 'preset'
        ? 'Your preset already included Lumiverse memories'
        : 'No extra memories needed for this turn'
      : '';
    const quickPart = input.quick?.ok ? 'Quick check read this reply' : '';
    const combined = [quickPart, memPart].filter(Boolean).join(' · ');
    if (combined) {
      worldItems.push({
        badge: 'UNDER THE HOOD',
        label: 'What Fed This Turn',
        detail: `${combined}.`,
      });
    }
  }

  const worldTab: TomeTab = {
    id: 'world',
    icon: '🌘',
    short: worldMovedNow ? 'World Moved' : 'World & Pulse',
    subLabel: worldMovedNow ? 'Off-screen shift' : `${rMeta.label} · ${PACE_NAMES[pace]}`,
    isNew: worldMovedNow,
    kicker: worldMovedNow
      ? 'UNSEEN CURRENTS · SOMETHING SHIFTED OFF-SCREEN'
      : `STORY PULSE & SOURCES · ${rMeta.label.toUpperCase()}`,
    title: worldMovedNow
      ? 'Something moved beyond the scene on this turn'
      : `${rMeta.title} (${stageName})`,
    body: worldMovedNow
      ? 'While you were in this scene, an open thread moved a step forward off-screen. Nothing is spoiled here—you will only learn what happened when word reaches you or you run into it.'
      : `${rMeta.desc} Grimoire is guiding the narrator using ${clockSourceText.toLowerCase()}.`,
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

  const defaultTab: TomeTab['id'] = newTabs[0]?.id ?? (notebook.mystery?.status === 'open' ? 'clue' : 'cast');

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
        buildingText,
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
