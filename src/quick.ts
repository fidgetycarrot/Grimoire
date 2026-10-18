import type { DecisionAnswer, DecisionQuestion, DecisionResult } from 'lumiverse-spindle-types';
import { describeClock, type StoryClock } from './clock';
import { dueThreads, type Moment, type Notebook, type Rhythm } from './notebook';
import { seedPlan } from './note';

/**
 * The quick check: after each reply, a decision model answers a few
 * multiple-choice questions so the notebook stays current between check-ups.
 *
 * - Did the reply show a development that was due? Then it is marked shown,
 *   and the note stops offering it.
 * - Did a possible moment happen? Then it is marked happened.
 * - What is the scene's rhythm now? Auto pace follows it.
 * - Did something happen that the notebook does not cover? Then a full
 *   check-up runs now instead of waiting.
 *
 * The answers are probabilities. Only confident ones change anything, and they
 * only ever move the story forward: nothing is un-marked here.
 */
export const QUICK = { yes: 0.7, no: 0.3, rhythm: 0.6, maxBeats: 6, maxFits: 6, soon: 5 } as const;

const RHYTHMS: Record<Rhythm, string> = {
  calm: 'Calm: ordinary time, nothing pressing in the scene.',
  rising: 'Rising: tension or trouble is building.',
  peak: 'Peak: a big moment is happening right now (a fight, a reveal, a crisis).',
  aftermath: 'Aftermath: just after a big moment; people are catching their breath.',
  stalled: 'Stalled: the scene is circling; nothing has changed for a while.',
};

export interface QuickPlan {
  questions: Record<string, DecisionQuestion>;
  /** Question key → what a "yes" marks. */
  marks: Record<string, { kind: 'step'; thread: string; step: string } | { kind: 'beat'; beat: string } | { kind: 'seed'; seed: string; to: 'planted' | 'paid' } | { kind: 'fits'; thread: string }>;
}

export function quickQuestions(notebook: Notebook, now: number | Moment): QuickPlan {
  const questions: Record<string, DecisionQuestion> = {}, marks: QuickPlan['marks'] = {};
  dueThreads(notebook, now).forEach(({ thread, step }, i) => {
    const key = `due_${i + 1}`;
    questions[key] = { type: 'noul', instructions: `In the latest reply, does this happen, or is its sign clearly shown? Event: ${step.text}${step.sign ? ` Sign: ${step.sign}` : ''}`,
      criteria: { true: 'The latest reply shows it or its sign.', false: 'The latest reply does not show it, or only hints vaguely.' } };
    marks[key] = { kind: 'step', thread: thread.id, step: step.id };
  });
  notebook.beats.filter(b => b.status === 'possible').slice(0, QUICK.maxBeats).forEach((beat, i) => {
    const key = `moment_${i + 1}`;
    questions[key] = { type: 'noul', instructions: `Does this moment happen in the latest reply? Moment: ${beat.text}`,
      criteria: { true: 'It happens in the latest reply.', false: 'It does not happen in the latest reply.' } };
    marks[key] = { kind: 'beat', beat: beat.id };
  });
  // Breadcrumbs: was the offered detail mentioned, and were ready ones brought back?
  const seeds = seedPlan(notebook, now);
  if (seeds.plant) {
    questions.detail_mentioned = { type: 'noul', instructions: `Does the latest reply mention this detail, even briefly or in passing? Detail: ${seeds.plant.detail}`,
      criteria: { true: 'The detail, or something plainly the same, appears in the latest reply.', false: 'It does not appear.' } };
    marks.detail_mentioned = { kind: 'seed', seed: seeds.plant.id, to: 'planted' };
  }
  if (seeds.echo) {
    questions.echo_heard = { type: 'noul', instructions: `Does the latest reply let the player hear of this, even in passing (news, a rumor, a remark, a message)? ${seeds.echo.detail}`,
      criteria: { true: 'It reaches the player in the latest reply.', false: 'It does not come up.' } };
    marks.echo_heard = { kind: 'seed', seed: seeds.echo.id, to: 'paid' };
  }
  seeds.ready.slice(0, 3).forEach((seed, i) => {
    const key = `callback_${i + 1}`;
    questions[key] = { type: 'noul', instructions: `Does the latest reply bring back this earlier detail and give it its meaning? Detail: ${seed.detail} Meaning: ${seed.payoff}`,
      criteria: { true: 'The detail comes back and its meaning lands, or clearly starts to.', false: 'It does not come back, or only in passing without its meaning.' } };
    marks[key] = { kind: 'seed', seed: seed.id, to: 'paid' };
  });
  // Do the developments that are due, or nearly due, still fit where the player is now? A clear no holds them.
  const m: Moment = typeof now === 'number' ? { hours: now } : now;
  const soon = dueThreads(notebook, m.reply === undefined ? m : { ...m, reply: m.reply + QUICK.soon });
  soon.slice(0, QUICK.maxFits).forEach(({ thread }, i) => {
    const key = `fits_${i + 1}`;
    questions[key] = { type: 'noul', instructions: `After the latest exchange, could this storyline still plausibly reach the player soon, where they are now? Storyline: ${thread.title}. ${thread.hint || ''}`.trim(),
      criteria: { true: 'Yes, it can still reach them (it could follow them, call them, or wait nearby).', false: 'No, the player has left it behind and it no longer fits for now.' } };
    marks[key] = { kind: 'fits', thread: thread.id };
  });
  questions.story_shift = { type: 'noul', instructions: 'Did the latest exchange take the story somewhere the story notes no longer fit: the player left the setting for good, walked away from the main situation, or changed what they are after?',
    criteria: { true: 'Yes, the story has changed direction and the notes need reworking.', false: 'No, the story is still on the same ground, even if something new happened.' } };
  questions.rhythm = { type: 'choice', instructions: 'Which best describes the scene at the end of the latest reply?', criteria: RHYTHMS };
  questions.new_turn = { type: 'noul', instructions: 'Did the latest exchange bring in something the story notes do not cover yet: a new named person who matters, a new problem or goal, a big change of place or time, or a choice that changes where the story is heading?',
    criteria: { true: 'Yes, something important is new.', false: 'No, it continues what the notes already cover.' } };
  return { questions, marks };
}

/** What the decision model sees: the exchange, and just enough of the notebook to judge it. */
export function quickState(notebook: Notebook, clock: StoryClock, playerMessage: string, latestReply: string) {
  return {
    storyTime: describeClock(clock),
    storyQuestion: notebook.story.question,
    people: notebook.people.filter(p => p.status === 'active').map(p => p.name),
    openThreads: notebook.threads.filter(t => t.status === 'open').map(t => t.title),
    playerMessage, latestReply,
  };
}

const yes = (answer: DecisionAnswer | undefined) => answer?.type === 'noul' && answer.noul >= QUICK.yes;

export interface QuickOutcome { notebook: Notebook; changed: boolean; marked: number; needsCheckup: boolean; /** The story changed direction: rework the notebook. */ shifted: boolean; /** Threads that clearly no longer fit for now. */ held: string[] }
/**
 * Apply answers onto the notebook as it is now (it may have changed while the
 * question was out). Only waiting steps and possible beats can be marked.
 */
export function applyQuick(current: Notebook, plan: QuickPlan, result: DecisionResult, now: number | Moment): QuickOutcome {
  const hours = typeof now === 'number' ? now : now.hours, reply = typeof now === 'number' ? undefined : now.reply;
  const answers = result.answers as Record<string, DecisionAnswer>;
  const notebook = structuredClone(current);
  let marked = 0;
  for (const [key, mark] of Object.entries(plan.marks)) {
    if (mark.kind === 'fits' || !yes(answers[key])) continue;
    if (mark.kind === 'step') {
      const step = notebook.threads.find(t => t.id === mark.thread)?.steps.find(s => s.id === mark.step);
      if (step?.status === 'waiting') { step.status = 'shown'; step.at = hours; if (reply !== undefined) step.atReply = reply; step.quick = true; marked++; }
    } else if (mark.kind === 'seed') {
      const seed = notebook.seeds.find(x => x.id === mark.seed);
      if (seed && mark.to === 'planted' && seed.status === 'waiting') { seed.status = 'planted'; if (reply !== undefined) seed.plantedAt = reply; seed.quick = true; marked++; }
      if (seed && mark.to === 'paid' && (seed.status === 'planted' || seed.status === 'echo')) { seed.status = 'paid'; if (reply !== undefined) seed.paidAt = reply; seed.quick = true; marked++; }
    } else {
      const beat = notebook.beats.find(b => b.id === mark.beat);
      if (beat?.status === 'possible') { beat.status = 'happened'; beat.quick = true; marked++; }
    }
  }
  const rhythm = answers.rhythm;
  let changed = marked > 0;
  if (rhythm?.type === 'choice' && rhythm.confidence >= QUICK.rhythm && rhythm.choice in RHYTHMS && rhythm.choice !== notebook.rhythm) { notebook.rhythm = rhythm.choice as Rhythm; changed = true; }
  const held = Object.entries(plan.marks).flatMap(([key, mark]) => mark.kind === 'fits' && answers[key]?.type === 'noul' && (answers[key] as { noul: number }).noul <= QUICK.no ? [mark.thread] : []);
  return { notebook, changed, marked, needsCheckup: yes(answers.new_turn) || held.length > 0, shifted: yes(answers.story_shift), held };
}

/** Fixed wording only: provider errors can echo what was sent. */
export function quickError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/permission/i.test(message)) return 'Grant decisions in Lumiverse’s Extensions panel.';
  if (/404|not found|no default|connection/i.test(message)) return 'Choose a decision connection in Grimoire settings, or set a default one in Lumiverse.';
  if (/timed?\s*out|timeout|504|deadline/i.test(message)) return 'The decision model took too long to answer.';
  if (/401|unauthori|api.?key|credential/i.test(message)) return 'The decision connection could not sign in. Check it in Lumiverse.';
  if (/429|rate|quota|credit/i.test(message)) return 'The decision provider reported a rate or credit limit.';
  if (/400|invalid|unsupported|protocol/i.test(message)) return 'The decision model could not answer these questions. Try another decision model.';
  return 'The decision model request failed.';
}
