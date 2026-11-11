/**
 * A small crystal ball on the home page's own recent-chat cards, for characters whose chats have a notebook.
 *
 * Lumiverse gives extensions no hook on its cards and shows one card per character, so a card is found by the
 * name in its heading. If the home page changes and nothing matches, there are simply no marks; nothing else
 * is touched. Safe to run again and again.
 */
export interface Marked { character: string; enabled: boolean }

const NAMES = '[data-component="LandingPageChats"] h3';
const text = (node: Element) => [...node.children].filter(c => !c.classList.contains('gm-badge')).map(c => c.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim() || (node.querySelector('.gm-badge') ? '' : (node.textContent ?? '').trim());

export function markStories(root: ParentNode, stories: Marked[], icon: string): number {
  // One card per character: on if any of that character's notebooks is on.
  const wanted = new Map<string, boolean>();
  for (const story of stories) if (story.character) wanted.set(story.character, wanted.get(story.character) || story.enabled);
  let placed = 0;
  for (const name of [...root.querySelectorAll(NAMES)]) {
    const on = wanted.get(text(name)), old = name.querySelector('.gm-badge') as HTMLElement | null;
    // Lists reuse their cards as you scroll: a mark on a card that now shows someone else goes.
    if (on === undefined) { old?.remove(); continue; }
    placed++;
    const off = on ? '' : 'true';
    if (old) { if ((old.dataset.off ?? '') !== off) { if (off) old.dataset.off = off; else delete old.dataset.off; } continue; }
    const badge = name.ownerDocument.createElement('span');
    badge.className = 'gm-badge'; badge.innerHTML = icon;
    badge.title = on ? 'Grimoire is keeping a notebook for this story' : 'Grimoire has a notebook for this story (turned off)';
    if (off) badge.dataset.off = off;
    name.append(badge);
  }
  for (const stray of [...root.querySelectorAll('.gm-badge')]) if (!stray.closest(NAMES)) stray.remove();
  return placed;
}
