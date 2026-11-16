import type { Message } from './model';

/**
 * Read the Room: the latest reply retold in plain words, with a few things the player's character could do next.
 *
 * Asked for only when the player opens Read the Room, one small request per reply. The model is given only what
 * the player can already see (the reply, their own last message, their persona, who is here and where), never the
 * notebook's plans or secrets, so what it writes cannot give anything away.
 */
export interface RoomReading { plain: string; moves: string[] }
export interface RoomInput {
  reply: string; said: string;
  persona: { name: string; description: string } | null;
  people: Array<{ name: string; role: string }>;
  place: string;
}

/**
 * Room for the answer. The connection's own thinking setting is used, like Grimoire's other requests: forcing
 * thinking off made some models (Gemini on OpenRouter) refuse the request outright, and a thinking model needs
 * room to think before it answers.
 */
export const ROOM_TOKENS = 4000;

export function roomMessages(input: RoomInput): Message[] {
  const you = input.persona?.name || 'the player character';
  const system = `You help someone playing a roleplay story keep up with it. Stories are often written in dense, flowery prose; your job is to say plainly what just happened, so they can decide what their character does next.

You get the latest reply, what the player last wrote, who they play, who else is here, and where, as JSON.
Return only JSON: {"plain": "…", "moves": ["…", "…", "…"]}

"plain": what just happened and where things stand now, in 3 to 5 short sentences of everyday words. Write to the player as "you" (they play ${you}). Say who did what, what was said or asked of you, what changed, and anything left hanging. Only what the reply actually shows: no guessing at hidden motives, no predictions, no judging. No flowery language and no quotes longer than a few words.
"moves": 3 or 4 different, concrete things ${you} could do next, each one short line starting with a verb. Base them on what is really in the scene: someone to answer, a question to ask, something to look at or take, somewhere to go. Make them different in kind (say something, do something, look closer, leave or change course), and fit them to who ${you} is. These are options, not advice; never say which is best.

Apart from the short options in "moves", do not continue the story or write anything ${you} says, does, thinks, or feels.`;
  const material = {
    task: 'grimoire-room-v1',
    player: input.persona ? { plays: input.persona.name, about: input.persona.description } : null,
    place: input.place, others: input.people, playerWrote: input.said, latestReply: input.reply,
  };
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(material) }];
}

const line = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
export function checkRoom(value: unknown): RoomReading {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const plain = line(v.plain, 1200);
  const moves = (Array.isArray(v.moves) ? v.moves : []).map(m => line(m, 200)).filter(Boolean).slice(0, 4);
  if (plain.length < 20) throw new Error('Return "plain": what just happened, in a few plain sentences.');
  return { plain, moves };
}
