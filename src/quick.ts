import type { DecisionAnswer, DecisionQuestion, DecisionResult } from 'lumiverse-spindle-types';
import { describeClock, type StoryClock } from './clock';
import { dueThreads, type Moment, type Notebook, type Rhythm } from './notebook';
import { seedPlan } from './note';
import { cluesToCheck, settleMystery } from './mystery';

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
 * - With a mystery: did the player find a clue, and did they name an answer?
 *   A guess is judged here, against the locked answer, so the very next reply
 *   can treat it as right or wrong.
 *
 * The answers are probabilities. Only confident ones change anything, and they
 * only ever move the story forward: nothing is un-marked here.
 */
export const QUICK = { yes: 0.7, no: 0.3, rhythm: 0.6, maxBeats: 6, maxFits: 6, maxTruths: 4, soon: 5 } as const;

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
  marks: Record<string, { kind: 'step'; thread: string; step: string } | { kind: 'beat'; beat: string } | { kind: 'seed'; seed: string; to: 'planted' | 'paid' } | { kind: 'fits'; thread: string } | { kind: 'truth' } | { kind: 'clue'; clue: string } | { kind: 'reach'; thread: string; step: string }>;
}

export function quickQuestions(notebook: Notebook, now: number | Moment, /** The latest exchange, to pick which clues to ask about. */ scene = ''): QuickPlan {
  const questions: Record<string, DecisionQuestion> = {}, marks: QuickPlan['marks'] = {};
  dueThreads(notebook, now).forEach(({ thread, step }, i) => {
    const key = `due_${i + 1}`;
    questions[key] = { type: 'noul', instructions: `In the latest reply, does this happen, or is its sign clearly shown? Event: ${step.text}${step.sign ? ` Sign: ${step.sign}` : ''}`,
      criteria: { true: 'The latest reply shows it or its sign.', false: 'The latest reply does not show it, or only hints vaguely.' } };
    marks[key] = { kind: 'step', thread: thread.id, step: step.id };
    // Whether it could arrive at all, as things stand. A step planned before the scene moved may no longer have a way in.
    questions[`reach_${i + 1}`] = { type: 'noul', instructions: `Where the player is now and what is going on there, could this reach them in the next reply in a believable way? It could not if that would mean someone getting through a locked or barred door, walking in on a private moment no one would interrupt, or something turning up where it could not be. A message, a knock, or word arriving can still be believable. Event: ${step.text}${step.sign ? ` Sign: ${step.sign}` : ''}`,
      criteria: { true: 'Yes, it could believably reach them now, in some form.', false: 'No, not in the scene as it stands; it would have to wait for the scene to change.' } };
    marks[`reach_${i + 1}`] = { kind: 'reach', thread: thread.id, step: step.id };
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
  // A secret that came out needs a check-up: people's notes were written to keep it.
  notebook.story.hiddenTruth.slice(0, QUICK.maxTruths).forEach((truth, i) => {
    const key = `truth_${i + 1}`;
    questions[key] = { type: 'noul', instructions: `In the latest exchange, does the player learn this, or does it come out where they can see? A hint or a suspicion does not count. Hidden truth: ${truth}`,
      criteria: { true: 'The player now knows it, or it plainly came out in front of them.', false: 'It stays hidden, or is only hinted at.' } };
    marks[key] = { kind: 'truth' };
  });
  // The mystery: clues the reply may have shown, and whether the player named an answer.
  const mystery = notebook.mystery;
  if (mystery?.status === 'open') {
    cluesToCheck(mystery, scene, notebook.people, typeof now === 'number' ? { hours: now } : now).forEach((clue, i) => {
      const key = `clue_${i + 1}`;
      questions[key] = { type: 'noul', instructions: `In the latest reply, does the player see, hear, or get told this? ${clue.text}`,
        criteria: { true: 'Yes: it is shown or said to the player in the latest reply, plainly enough that they now know it.', false: 'No, or it is only vaguely hinted at.' } };
      marks[key] = { kind: 'clue', clue: clue.id };
    });
    questions.theory = { type: 'noul', instructions: `In the player's message, does the player's character put an answer to this question to someone, out loud or by acting on it: accusing or confronting a person, telling someone what they believe really happened, reporting it? Private thoughts, wondering, asking questions, and listing suspects do not count. Question: ${mystery.question}`,
      criteria: { true: 'Yes, the player states an answer or makes an accusation.', false: 'No answer is stated.' } };
    questions.theory_right = { type: 'noul', instructions: `The true answer is: ${mystery.answer} Does the player's message name that same answer, in substance (the same person or the same cause)? If the player's message names no answer, or names someone or something else, the answer is no.`,
      criteria: { true: 'The player named the true answer.', false: 'The player named something else, or nothing.' } };
    questions.mystery_out = { type: 'noul', instructions: `Does the latest reply reveal or confirm this to the player as a fact? Suspicion, hints, and accusations do not count. ${mystery.answer}`,
      criteria: { true: 'The reply states or confirms it as fact, where the player can see.', false: 'It stays unknown or unconfirmed.' } };
  }
  questions.story_shift = { type: 'noul', instructions: 'Did the latest exchange take the story somewhere the story notes no longer fit: the player left the setting for good, walked away from the main situation, or changed what they are after?',
    criteria: { true: 'Yes, the story has changed direction and the notes need reworking.', false: 'No, the story is still on the same ground, even if something new happened.' } };
  questions.rushing = { type: 'noul', instructions: 'Did the latest reply rush the story: wrap up a problem, jump ahead, or move straight to the next big thing faster than the scene allowed, instead of letting it play out?',
    criteria: { true: 'Yes, it hurried past things that needed room.', false: 'No, it took the time the scene needed, even if a lot happened.' } };
  questions.intimate = { type: 'noul', instructions: 'Is the latest reply an intimate or sexual scene that is still going on at the end of the reply?',
    criteria: { true: 'Yes, an intimate or sexual scene is under way and has not ended.', false: 'No, or it has ended.' } };
  // Narrators like to fix the player's trouble at once. A new problem, or one solved too easily, gets a check-up to make it a storyline.
  questions.new_problem = { type: 'noul', instructions: 'Did the player\'s message or the latest reply bring up a new problem for the player character (a debt, a threat, a loss, someone against them, something at risk) that the open storylines do not already cover?',
    criteria: { true: 'Yes, a new problem came up.', false: 'No new problem, or it is one the storylines already cover.' } };
  questions.easy_fix = { type: 'noul', instructions: 'Did the latest reply solve a problem too easily: in one go, at no real cost, through money, luck, or someone fixing it for the player character?',
    criteria: { true: 'Yes, a problem was solved too easily.', false: 'No, or the solution took real effort or cost something.' } };
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

export interface QuickOutcome { notebook: Notebook; changed: boolean; marked: number; /** Due steps that could not believably reach the player in this scene. */ blocked: string[]; needsCheckup: boolean; /** A new problem came up that no storyline covers. */ problem: boolean; /** A problem was solved too easily. */ easyFix: boolean; /** A secret came out. People's notes were written to keep it, so it can't wait. */ revealed: boolean; /** The reply hurried past things that needed room. */ rushing: boolean; /** The player named the mystery's answer, or it came out some other way: a check-up follows at once. */ mysteryEnded: boolean; /** An intimate scene is under way. */ intimate: boolean; /** The story changed direction: rework the notebook. */ shifted: boolean; /** Threads that clearly no longer fit for now. */ held: string[] }
/**
 * Apply answers onto the notebook as it is now (it may have changed while the
 * question was out). Only waiting steps and possible beats can be marked.
 */
export function applyQuick(current: Notebook, plan: QuickPlan, result: DecisionResult, now: number | Moment, /** What the player wrote, kept as their guess when they name an answer. */ playerMessage = ''): QuickOutcome {
  const hours = typeof now === 'number' ? now : now.hours, reply = typeof now === 'number' ? undefined : now.reply;
  const answers = result.answers as Record<string, DecisionAnswer>;
  let notebook = structuredClone(current);
  let marked = 0, mysteryEnded = false;
  for (const [key, mark] of Object.entries(plan.marks)) {
    if (mark.kind === 'fits' || mark.kind === 'truth' || mark.kind === 'reach' || !yes(answers[key])) continue;
    if (mark.kind === 'clue') {
      const clue = notebook.mystery?.status === 'open' ? notebook.mystery.clues.find(c => c.id === mark.clue) : undefined;
      if (clue?.status === 'hidden') { clue.status = 'found'; if (reply !== undefined) clue.foundAt = reply; clue.quick = true; marked++; }
    } else if (mark.kind === 'step') {
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
  // A guess is judged against the locked answer. Unsure answers count as a part-right guess, never as solved.
  const mystery = notebook.mystery;
  if (mystery?.status === 'open') {
    const right = answers.theory_right, score = right?.type === 'noul' ? right.noul : 0.5;
    const said = playerMessage.replace(/\s+/g, ' ').trim().slice(0, 300);
    // A swipe or a regenerated reply judges the same message again: the guess is counted once.
    const again = mystery.theories.some(t => t.text === said);
    if (yes(answers.theory) && said && !again) {
      const verdict = score >= QUICK.yes ? 'right' as const : score <= QUICK.no ? 'wrong' as const : 'partly' as const;
      mystery.theories = [...mystery.theories, { text: said, verdict, ...(reply !== undefined ? { atReply: reply } : {}), quick: true as const }].slice(-8);
      if (verdict === 'right') { mystery.status = 'solved'; if (reply !== undefined) mystery.endReply = reply; mysteryEnded = true; }
      marked++;
    } else if (yes(answers.mystery_out)) { mystery.status = 'revealed'; if (reply !== undefined) mystery.endReply = reply; mysteryEnded = true; marked++; }
    if (mysteryEnded) notebook = settleMystery(notebook);
  }
  const rhythm = answers.rhythm;
  let changed = marked > 0;
  if (rhythm?.type === 'choice' && rhythm.confidence >= QUICK.rhythm && rhythm.choice in RHYTHMS && rhythm.choice !== notebook.rhythm) { notebook.rhythm = rhythm.choice as Rhythm; changed = true; }
  // Due steps that could not believably arrive in the scene as it stands, and did not.
  const blocked = Object.entries(plan.marks).flatMap(([key, mark]) => mark.kind === 'reach' && answers[key]?.type === 'noul' && (answers[key] as { noul: number }).noul <= QUICK.no && !yes(answers[key.replace('reach_', 'due_')]) ? [mark.step] : []);
  const held = Object.entries(plan.marks).flatMap(([key, mark]) => mark.kind === 'fits' && answers[key]?.type === 'noul' && (answers[key] as { noul: number }).noul <= QUICK.no ? [mark.thread] : []);
  const cameOut = Object.entries(plan.marks).some(([key, mark]) => mark.kind === 'truth' && yes(answers[key]));
  const problem = yes(answers.new_problem), easyFix = yes(answers.easy_fix);
  return { notebook, changed, marked, blocked, needsCheckup: yes(answers.new_turn) || held.length > 0 || cameOut || problem || easyFix, mysteryEnded, problem, easyFix, revealed: cameOut, rushing: yes(answers.rushing), intimate: yes(answers.intimate), shifted: yes(answers.story_shift), held };
}

/** Fixed wording only: provider errors can echo what was sent. */
export function quickError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/permission/i.test(message)) return 'Grant decisions in Lumiverse’s Extensions panel.';
  if (/moderat|flagged|content.?(policy|filter|rules)|safety|refus|violat|not allowed/i.test(message)) return 'The decision model refused this reply, most likely because of its content rules.';
  if (/404|not found|no default|connection/i.test(message)) return 'Choose a decision connection in Grimoire settings, or set a default one in Lumiverse.';
  if (/timed?\s*out|timeout|504|deadline/i.test(message)) return 'The decision model took too long to answer.';
  if (/401|unauthori|api.?key|credential/i.test(message)) return 'The decision connection could not sign in. Check it in Lumiverse.';
  if (/429|rate|quota|credit/i.test(message)) return 'The decision provider reported a rate or credit limit.';
  if (/400|invalid|unsupported|protocol/i.test(message)) return 'The decision model could not answer these questions. Try another decision model.';
  // Codes only, never the provider's words (they can echo what was sent): enough to tell failures apart.
  const code = /\b([45]\d\d)\b/.exec(message)?.[1] ?? (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' && /^[A-Z_]{3,40}$/.test((error as { code: string }).code) ? (error as { code: string }).code : '');
  return `The decision model request failed${code ? ` (code ${code})` : ''}.`;
}
