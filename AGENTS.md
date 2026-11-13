# Working on Grimoire

Read "Who it is for" in README.md before changing anything. In short:

- Grimoire is for roleplayers who play the scene in front of them and don't want to manage the whole story.
- "Passive" means the player doesn't want to invent or direct the story. It does not mean they do nothing: they react, choose, and act in the scene. Grimoire and the narrator supply what happens and where it is going (the glowing orb in the chest); the player decides what to do with it. Never design as if the player won't act, never decide their actions for them, and make what they do matter afterward.
- It is a roleplaying tool that strives to feel like a good story. Its priorities, in order:
  1. Fun. Play should be enjoyable; a scene may go somewhere sooner than a novel would.
  2. A cohesive story, close behind: threads that pay off, breadcrumbs that come back, people who keep wanting things, a world that makes sense.
  3. Good pacing, also close behind: things build and arrive at a believable rate, and big moments stay big.
  Don't trade the second and third away for the first; they are much of what makes it fun over a long chat.
- Features work without the player's attention. Anything that asks for input is optional.
- Nothing outside the spoiler fold may reveal the notebook's plans or secrets.
- Panel and under-reply chronicle text uses plain, simple, in-world words.
- The Under-Reply Chronicle (`src/tome.ts`, rendered into the latest assistant reply bubble in `src/frontend.ts`) is both a spoiler-free pulse point (showing that Grimoire is working and what context it is feeding the narrator) and a reading-comprehension tool (`In Front of You` / `Read the Room`). Keep the `In Front of You` Hook Whisper collapsed by default so the player always reads the story reply first, keep tab labels self-explanatory (`Because You…`, `Clue Found` / `Story Beats`, `Who’s Here`, `World & Pulse`), fold to the slim spine on quiet turns and the veiled ribbon during protected intimate scenes, and never leak hidden truths, mystery answers, clue meanings, un-paid payoffs, or waiting/off-screen step text.

Run `bun test` and `npx tsc --noEmit` before committing, and `npm run build` so `dist/` matches `src/`.
