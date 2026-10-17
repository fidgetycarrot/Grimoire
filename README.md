# Grimoire

**The story behind your chat: where it is going, why, and how fast.**

Grimoire is a Lumiverse extension that gives the narrator a story of its own. It keeps a private notebook for each chat: what is really going on, what people want, which threads are open, and what happens if you leave them alone. Before each reply it gives the narrator a short private note from that notebook. Every so often it checks the notebook against the chat and updates it.

It works with any card: downloaded, homemade, or made with Set Points. It never puts prewritten text into your chat. The narrator writes every word; Grimoire only steers.

## What it does

- **Writes a notebook from your card.** It reads the card, your persona, the card's lorebook, and anything already said, then plans the story: the central question, the hidden truth, a small supporting cast with their own goals, a few threads, and moments the story could reach.
- **Keeps time in story time, not replies.** Threads move at their own speed (urgent, steady, or slow burn). Ignore the stolen ring for one evening and nothing happens; leave it for three days and the search has had time to reach you. Warning signs come before consequences.
- **Pace you can set.** One button above the message box switches between:
  - **Auto**: Grimoire reads the story's rhythm. Urgent things can interrupt; slower ones wait for a natural break. After a big moment it leaves room to breathe; when things stall, it lets an existing thread move.
  - **Quiet**: no new trouble starts. Anything already urgent still plays out, and the world keeps moving offscreen. It is room, not a pause button.
  - **Fast**: tight scenes, quicker consequences, short time skips.
- **Check-ups.** A check-up reads the recent chat next to the notebook. It marks what actually happened, moves clocks, adds people and threads you started, and redraws upcoming moments if you went somewhere else. It changes how the story gets somewhere, not why. Check-ups run when the scene changes, when time jumps, after a set number of replies, or when you choose **Check now**.
- **Reads your preset's tracker, whatever it is.** If your preset writes a status block (time, place, who is here), Grimoire learns where those lines live and reads them with fixed code. A field is trusted only after it has been read from a real reply. Anything the tracker supplies is never asked for twice: if it keeps the time, Grimoire's clock reads from it. Saved chat variables can be read too.
- **Follows edits, swipes, and branches.** Each saved notebook version is tied to the exact messages it describes. Edit, delete, or swipe a reply and Grimoire falls back to the version from before it, then catches up at the next check-up. Swipe back and the newer version returns. Forked chats start with a copy.
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
| `chats` | Reading the chat so the notebook matches it |
| `characters` | Reading the card |
| `personas` | Reading your active persona (optional) |
| `world_books` | Reading the card's lorebook (optional) |

## Placing the note

By default the note is added for you, just before the reply (after any prefill is kept last). Prompt Breakdown labels it **Grimoire**.

If you'd rather place it yourself, set **Settings → Where the note goes** to **In my preset** and put `{{grimoire_note}}` in your preset. The note is never added twice. Two more macros work either way:

- `{{grimoire_clock}}`: the current story time.
- `{{grimoire_pace}}`: the current pace line.

## Costs

- Writing a notebook: one larger model request.
- Each check-up: one request.
- Ordinary replies: no extra request. The note adds a few hundred tokens to the prompt.

If a check-up fails, the automatic ones wait for the story to move on a little before trying again. **Check now** always works.

## Limits in this version

- One character per chat. Group chats are not supported yet.
- Grimoire does not ask the narrator to write hidden updates. Between check-ups, a clock that Grimoire keeps itself can lag behind the chat; the note says so, and the chat wins. A preset tracker that records time avoids this.
- Tracker reading supports labeled lines, tags, JSON in a tag or code block, and saved chat variables. Freely written status prose is still passed to check-ups as text.
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
