/**
 * The player's codeword: `$grimoire` anywhere in their message asks Grimoire to move the story in the next reply.
 * The narrator never sees it: it is taken out of every message before the prompt goes out, and out of everything
 * Grimoire reads from the chat (quick checks, check-ups, Read the Room), so it never becomes part of the story.
 */
export const CODEWORD = '$grimoire';
const PATTERN = /\$grimoire\b/gi;

export function hasCodeword(text: string): boolean { PATTERN.lastIndex = 0; return PATTERN.test(text); }

/** The message without the codeword, with the spacing it leaves behind tidied. */
export function stripCodeword(text: string): string {
  if (!hasCodeword(text)) return text;
  return text.replace(PATTERN, ' ').replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n').trim();
}

/**
 * A message that was only the codeword: the player's character carries on with what they were doing. Said by the
 * player, so the narrator never invents an action for them to fill the gap.
 */
export const CARRY_ON = '(I carry on with what I was doing.)';
