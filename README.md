# Grimoire

**The story behind your chat: where it is going, why, and how fast.**

Grimoire is a Lumiverse extension that gives the narrator a story of its own. It keeps a private notebook for each chat: what is really going on, what people want, which threads are open, and what happens if you leave them alone. Before each reply it gives the narrator a short private note from that notebook. Every so often it checks the notebook against the chat and updates it.

It works with any card: downloaded, homemade, or made with Set Points. It never puts prewritten text into your chat. The narrator writes every word; Grimoire only steers.

## What it does

- **Writes a notebook from your card.** It reads the card, your persona, the card's lorebook, and anything already said, then plans the story: the central question, the hidden truth, a small supporting cast with their own goals, a few threads, and moments the story could reach.
- **Works on old chats too.** A long chat is read from the very first message, in parts, into a record of the story so far. The notebook then picks up the threads and people the chat already has, and plans what comes next from there. The panel tells you how many parts it will read before you start.
- **Paced by story time and by your play.** Threads move at their own speed (urgent, steady, or slow burn). Story time keeps it plausible: ignore the stolen ring for one evening and nothing happens; leave it for days and the search reaches you. But a roleplay can spend a hundred replies in one story day, so a thread also moves on after a number of replies (Settings → Longest a story thread waits), whichever comes first. Warning signs come before consequences, and big scenes aren't interrupted for slow threads.
- **Open-ended.** There's no length to pick. Grimoire plans the first part of the story; when its threads wrap up, a check-up starts the next part from what actually happened.
- **Pace you can set.** One button above the message box switches between:
  - **Auto**: Grimoire reads the story's rhythm. Urgent things can interrupt; slower ones wait for a natural break. After a big moment it leaves room to breathe; when things stall, it lets an existing thread move.
  - **Quiet**: no new trouble starts. Anything already urgent still plays out, and the world keeps moving offscreen. It is room, not a pause button.
  - **Fast**: tight scenes, quicker consequences, short time skips.
- **Time-skip suggestions.** When a calm scene has gone quiet for a while and nothing is due, a small **Skip ahead?** button appears above the message box. Grimoire knows when the next planned development comes due, so it offers to skip to right then ("about 6 hours"), without saying what it is, plus a plain choice like "to this evening". It never skips on its own, never appears during big scenes, and **Not now** sends it away for a while.
- **Check-ups.** A check-up reads the recent chat next to the notebook. It marks what actually happened, moves clocks, adds people and threads you started, and redraws upcoming moments if you went somewhere else. It changes how the story gets somewhere, not why. Check-ups run when the scene changes, when time jumps, after a set number of replies, two replies after an urgent development was offered, or when you choose **Check now**. They read the chat as words: preset styling and panels are stripped, but facts in them are kept.
- **Reads your preset's tracker, whatever it is.** If your preset writes a status block (time, place, who is here), Grimoire learns where those lines live and reads them with fixed code. A field is trusted only after it has been read from a real reply. Common layouts (facts in tag attributes like `<scene_header location="…" time="…">`, or labeled lines like `Time:` and `Location:`) are found by Grimoire itself, for free, as soon as a reply has them. Anything else is described by the model when the notebook is written, or at the first check-up if the tracker only appears once the narrator starts replying (presets often leave it out of the greeting). Anything the tracker supplies is never asked for twice: if it keeps the time, Grimoire's clock reads from it. Saved chat variables can be read too.
- **Follows edits, swipes, and branches.** Each saved notebook version is tied to the exact messages it describes. Edit, delete, or swipe a reply and Grimoire falls back to the version from before it; nothing from the removed replies counts, and no extra check-up is needed. Only an edit to a message the first notebook was written from asks for one. Swipe back and the newer version returns. Forked chats start with a copy.
- **Quick check (optional).** A small decision model reads each new reply and answers a few multiple-choice questions: did a planned development happen, did a possible moment happen, how intense is the scene, did something new come up. The notebook stays current between check-ups, the note stops offering things that already happened, and a full check-up runs as soon as something new needs planning. It uses Lumiverse's decision connections, so any decision model works (OpenRouter or TypeSafe, including Jev).
- **Spoilers stay hidden.** The panel shows the story time, the pace, and a one-line update with no spoilers. The full notebook sits behind **Show the notebook · spoilers**, where you can read it or edit it as text.

## Install

Requires **Lumiverse 1.2.0 or newer**. The built files are included; no build step is needed.

1. Open Lumiverse's **Extensions** panel and install from this repository: `https://github.com/fidgetycarrot/Grimoire`
2. Enable **Grimoire** and grant its permissions.
3. Open the **Grimoire** drawer tab, go to **Settings**, and choose a model connection.
4. Open a chat, choose **Write the notebook**, and play.

| Permission | Used for |
| --- | --- |
| `generation` | Writing notebooks and running check-ups on the connection you choose |
| `interceptor` | Adding the short private note before each reply |
| `chats` | Finding the chat and its character |
| `chat_mutation` | Reading the chat's messages so the notebook matches them. Lumiverse puts message reading under this permission; Grimoire never changes, adds, or deletes messages. |
| `characters` | Reading the card |
| `personas` | Reading your active persona (optional) |
| `world_books` | Reading the card's lorebook (optional) |
| `decisions` | The quick check, on your decision connection (optional) |

## Quick check

Needs a Lumiverse with decision connections (spindle types 0.6.45+, host capability `decisions-v1`).

1. In Lumiverse, add a decision connection (OpenRouter or TypeSafe) and pick a model. Mark one as default if you like.
2. In **Grimoire → Settings → Quick check after each reply**, turn it on. Leave the connection on your default or choose one. The model field is optional: type any decision model ID to override the connection's model.

Only confident answers change anything (70% or more for yes-or-no questions), and they only move the story forward: a quick check never un-marks anything. Answers about a reply that was swiped or edited meanwhile are thrown away. Quick-check updates are tied to the reply they judged, so regenerating that reply goes back to the notebook from before it.

## Placing the note

By default the note is added for you, just before the reply (after any prefill is kept last). Prompt Breakdown labels it **Grimoire**.

If you'd rather place it yourself, set **Settings → Where the note goes** to **In my preset** and put `{{grimoire_note}}` in your preset. The note is never added twice. Two more macros work either way:

- `{{grimoire_clock}}`: the current story time.
- `{{grimoire_pace}}`: the current pace line.

## Costs

- Writing a notebook: one larger model request. A long chat adds one request per part of its earlier history (at most 12, shown before you start).
- Each check-up: one request.
- Ordinary replies: no extra request. The note adds a few hundred tokens to the prompt.
- With the quick check on: one small decision request per reply (a few questions, answers only). It replaces some check-ups, since those then run only when needed or after the set number of replies.

Small slips in the model's reply (an id with capitals, a field a little too long, one event too many, a stray tag) are tidied rather than rejected, and a check-up can't drop people or threads or undo what happened: anything it leaves out is put back. If a reply still can't be used, the panel says which field failed, without naming anything from the story.

If a check-up fails, the automatic ones wait for the story to move on a little before trying again. **Check now** always works.

## Limits in this version

- One character per chat. Group chats are not supported yet.
- Grimoire does not ask the narrator to write hidden updates. Between check-ups, a clock that Grimoire keeps itself can lag behind the chat; the note says so, and the chat wins. A preset tracker that records time avoids this.
- Tracker reading supports labeled lines, tags, tag attributes (like `<scene_header location="…">`), JSON in a tag or code block, and saved chat variables. Freely written status prose is still passed to check-ups as text.
- Editing a reply before the notebook was written keeps the first version and asks for a check-up.
- A time skip moves the parts of the clock Grimoire owns. If your tracker owns the time, the narrator is told about the skip and the tracker records it.
- The narrator can still ignore guidance or let a secret slip. The notebook makes the plan clear, current, and cheap to follow; it cannot force it.

## Development

```sh
npm install
npm run check
bun test
npm run build
```

`dev/preview.html` shows the panel with a mocked host: build it with `bun build dev/preview.ts --outdir dev/build --target browser`, serve the folder, and open `/dev/preview.html`.

## Credits

Inspired by [Waypoints](https://github.com/ajrc0re/LumiverseWaypoints) and designed to sit beside [LumiWorld](https://github.com/Archkr/Lumiverse-LumiWorld): LumiWorld handles how the world reacts right now; Grimoire handles where the story is going. No code from either is included.
