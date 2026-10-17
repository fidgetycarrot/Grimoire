import type { DecisionAnswer, DecisionQuestion, DecisionResult } from 'lumiverse-spindle-types';
import { describeClock, type StoryClock } from './clock';
import { dueThreads, type Moment, type Notebook, type Rhythm } from './notebook';

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
export const QUICK = { yes: 0.7, rhythm: 0.6, maxBeats: 6 } as const;

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
  marks: Record<string, { kind: 'step'; thread: string; step: string } | { kind: 'beat'; beat: string }>;
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
  questions.rhythm = { type: 'choice', instructions: 'Which best describes the scene at the end of the latest reply?', criteria: RHYTHMS };
  questions.new_turn = { type: 'noul', instructions: 'Did the latest exchange bring in something the story notes do not cover yet: a new named person who matters, a new problem or goal, a big change of place or time, or a choice that changes where the story is heading?',
    criteria: { true: 'Yes, something important is new.', false: 'No, it continues what the notes already cover.' } };
  return { questions, marks };
}

/** What the decision model sees: the exchange, and just enough of the notebook to judge it. */
export function quickState(notebook: Notebook, clock: StoryClock, playerMessage: string, latestReply: string) {
  return {
    storyTime: describeClock(clock),
    people: notebook.people.filter(p => p.status === 'active').map(p => p.name),
    openThreads: notebook.threads.filter(t => t.status === 'open').map(t => t.title),
    playerMessage, latestReply,
  };
}

const yes = (answer: DecisionAnswer | undefined) => answer?.type === 'noul' && answer.noul >= QUICK.yes;

export interface QuickOutcome { notebook: Notebook; changed: boolean; marked: number; needsCheckup: boolean }
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
    if (!yes(answers[key])) continue;
    if (mark.kind === 'step') {
      const step = notebook.threads.find(t => t.id === mark.thread)?.steps.find(s => s.id === mark.step);
      if (step?.status === 'waiting') { step.status = 'shown'; step.at = hours; if (reply !== undefined) step.atReply = reply; marked++; }
    } else {
      const beat = notebook.beats.find(b => b.id === mark.beat);
      if (beat?.status === 'possible') { beat.status = 'happened'; marked++; }
    }
  }
  const rhythm = answers.rhythm;
  let changed = marked > 0;
  if (rhythm?.type === 'choice' && rhythm.confidence >= QUICK.rhythm && rhythm.choice in RHYTHMS && rhythm.choice !== notebook.rhythm) { notebook.rhythm = rhythm.choice as Rhythm; changed = true; }
  return { notebook, changed, marked, needsCheckup: yes(answers.new_turn) };
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
