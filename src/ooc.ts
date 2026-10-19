/**
 * Out-of-character talk.
 *
 * Players step outside the story to talk to the narrator: "[ooc]: this is
 * moving fast", "(OOC: make him blush)", "((brb))". A whole message of that is
 * not part of the story: it and the narrator's answer don't count as story
 * replies, get no quick check, and get no story note. A short OOC aside inside
 * a story message is split off, so the story part counts as usual and the
 * aside is passed on as a wish, never as something that happened.
 */
// [ooc: …]  (ooc: …)  [OOC] …  ((…))  — bounded asides.
const BOUNDED = /\[\s*ooc\s*[:\-–—]?\s*([^\]]*)\]|\(\s*ooc\s*[:\-–—]\s*([^)]*)\)|\(\(([^()]*)\)\)/gi;
// A paragraph that starts with an OOC marker: "[ooc]: …", "(ooc) …", "OOC: …", "// …".
const LEADING = /^\s*(?:\[\s*ooc\s*\]|\(\s*ooc\s*\)|ooc\s*[:\-–—]|\/\/)\s*[:\-–—]?\s*/i;

export interface OocSplit {
  /** The message with out-of-character parts removed. */
  story: string;
  /** What the player said out of character, in order. */
  asides: string[];
  /** The whole message is out of character. */
  whole: boolean;
}

export function splitOoc(text: string): OocSplit {
  const asides: string[] = [];
  // A message that opens with an OOC marker is out of character from start to finish, however many paragraphs it runs.
  if (LEADING.test(text)) { const said = text.replace(LEADING, '').trim(); return { story: '', asides: said ? [said] : [], whole: true }; }
  const paragraphs = text.split(/\n\s*\n/).map(paragraph => {
    if (LEADING.test(paragraph)) { const said = paragraph.replace(LEADING, '').trim(); if (said) asides.push(said); return ''; }
    return paragraph.replace(BOUNDED, (whole, a, b, c) => {
      const said = String(a ?? b ?? c ?? '').trim();
      // "[ooc]" alone with nothing inside marks the rest of the paragraph.
      if (!said && /^\[\s*ooc\s*\]$/i.test(whole.trim())) return '\u0000';
      if (said) asides.push(said);
      return '';
    });
  }).map(paragraph => {
    const at = paragraph.indexOf('\u0000');
    if (at < 0) return paragraph;
    const rest = paragraph.slice(at + 1).replace(/^\s*[:\-–—]?\s*/, '').trim();
    if (rest) asides.push(rest);
    return paragraph.slice(0, at);
  });
  const story = paragraphs.map(p => p.trim()).filter(Boolean).join('\n\n');
  // Out of character as a whole: nothing else is left, or it opens with an OOC aside and only a stray word or two follows.
  // A short story action with an aside ("I wave. (ooc: thanks)") is still a story message.
  const words = story.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean).length;
  const opens = new RegExp(`^\\s*(?:${BOUNDED.source})`, 'i').test(text);
  return { story, asides, whole: asides.length > 0 && (words === 0 || (opens && words < 3)) };
}

/** The message as the story sees it: out-of-character asides become a labeled wish, never an event. */
export function storyText(text: string): string {
  const split = splitOoc(text);
  if (!split.asides.length) return text;
  if (split.whole) return `[Out of character, not part of the story] ${split.asides.join(' ')}`;
  return `${split.story}\n[Out-of-character note from the player, not part of the story: ${split.asides.join(' ')}]`;
}
