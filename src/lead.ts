import { isNewArc, NotebookError, STAGES, type Notebook, type Preferences, type Shape, type Thread } from './notebook';

/**
 * Grimoire leads the story.
 *
 * Every part of the story has one main storyline (arc.main): the thread that
 * carries the story question and that the player is clearly in. A new part
 * opens with its inciting moment: the main storyline's first waiting step is
 * due at once. Side storylines support it.
 *
 * The shape of a part (conflict or kishōtenketsu) can be chosen by the
 * player for the first part, or kept for the whole chat.
 *
 * Like the pacing rules, a new part without a main storyline, or in the wrong
 * shape, is sent back to the model once; a second answer that still breaks a
 * rule gets the plainest fix from code. Within a part, code keeps arc.main
 * pointing at an open storyline.
 */
const ready = (t: Thread | undefined): t is Thread => !!t && t.status === 'open' && t.steps.some(s => s.status === 'waiting');

/** The shape this part must have, if the player chose one. */
export function shapeFor(previous: Notebook | null, revised: Notebook, prefs: Preferences): Shape | null {
  if (prefs.shape === 'auto') return null;
  if (!previous) return prefs.shape;
  if (!prefs.lockShape) return null;
  // Kept for the whole chat. A part already under way in another shape (the lock came later) may finish; the next part uses the kept one.
  return previous.arc.shape === prefs.shape || isNewArc(previous, revised) ? prefs.shape : null;
}

export function leadProblems(previous: Notebook | null, revised: Notebook, prefs: Preferences): string[] {
  const problems: string[] = [];
  const shape = shapeFor(previous, revised, prefs);
  if (shape && revised.arc.shape !== shape) problems.push(`The player chose the "${shape}" shape for this part of the story. Set arc.shape to "${shape}" and arc.stage to one of: ${STAGES[shape].join(', ')}.`);
  const fresh = !previous || isNewArc(previous, revised);
  const main = revised.threads.find(t => t.id === revised.arc.main);
  if (fresh) {
    if (!ready(main)) problems.push('Set arc.main to the id of this part\'s main storyline: the open thread that carries the story question and that the player is clearly in. Its first waiting step is the opening moment that draws the player in; it arrives at once.');
    else if (main.speed === 'slow') problems.push(`The main storyline "${main.id}" can't be slow at the start of a part. Make it steady or urgent.`);
  }
  // Within a part, a main storyline that ran out is replaced by code (fixLead), so an ordinary update is never sent back for it.
  return problems;
}

export function enforceLead(previous: Notebook | null, revised: Notebook, prefs: Preferences): void {
  const problems = leadProblems(previous, revised, prefs);
  if (problems.length) throw new NotebookError(problems.join(' '), 'The update had no clear main storyline or the wrong story shape, so it was sent back once.');
}

/** The plainest fix: the chosen shape, and a main storyline picked from what is open. */
export function fixLead(previous: Notebook | null, revised: Notebook, prefs: Preferences): Notebook {
  let out = revised;
  const shape = shapeFor(previous, out, prefs);
  if (shape && out.arc.shape !== shape) {
    // A new part starts at the first stage of the kept shape. Otherwise back to the part as it was, if it had
    // this shape, or the same point in the other shape.
    const index = Math.max(0, STAGES[out.arc.shape].indexOf(out.arc.stage));
    const starting = !previous || (index === 0 && STAGES[previous.arc.shape].indexOf(previous.arc.stage) > 0);
    const arc = previous && previous.arc.shape === shape && !starting
      ? { ...out.arc, shape, stage: previous.arc.stage, turn: previous.arc.turn }
      : { ...out.arc, shape, stage: STAGES[shape][index], turn: shape === 'kishotenketsu' ? out.arc.turn : '' };
    out = { ...out, arc };
  }
  const fresh = !previous || isNewArc(previous, out);
  const current = out.threads.find(t => t.id === out.arc.main);
  if (!ready(current) && (fresh || !current || STAGES[out.arc.shape].indexOf(out.arc.stage) < 2)) {
    const open = out.threads.filter(ready);
    const rank = { urgent: 0, steady: 1, slow: 2 } as const;
    const pick = open.find(t => t.id === previous?.arc.main) ?? [...open].sort((a, b) => rank[a.speed] - rank[b.speed])[0];
    out = { ...out, arc: { ...out.arc, main: pick?.id ?? '' } };
  }
  if (fresh) out = { ...out, threads: out.threads.map(t => t.id === out.arc.main && t.speed === 'slow' ? { ...t, speed: 'steady' } : t) };
  return out;
}

/**
 * A new part of the story begins: its opening moment arrives now, and the
 * opening stretch starts. Run after the merge, so code-owned times are set.
 */
export function openArc(notebook: Notebook, kind: 'story' | 'chapter'): Notebook {
  let first = true;
  // A main storyline already under way (an older chat, a storyline carried into the new part) has had its opening.
  const begun = notebook.threads.find(t => t.id === notebook.arc.main)?.steps.some(s => s.status === 'shown' || s.status === 'offscreen');
  return { ...notebook, arc: { ...notebook.arc, opening: kind }, threads: notebook.threads.map(thread => thread.id !== notebook.arc.main || begun ? thread : { ...thread, steps: thread.steps.map(step => {
    if (step.status !== 'waiting' || !first) return step;
    first = false;
    return { ...step, afterHours: 0 };
  }) }) };
}
