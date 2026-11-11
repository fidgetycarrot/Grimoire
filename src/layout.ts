import type { Building, Floor, Room } from './notebook';

/**
 * Where the player is inside a building the notebook has a layout for, read from the tracker's place. Trackers
 * word places freely ("Kitchen, Vance Residence", "Master Bedroom", "Upstairs Hallway"), so names match by their
 * words, and a place that names only a room is looked for in the building the story was last in.
 */
export interface Whereabouts { building: Building; floor?: Floor; room?: Room }

const GENERIC = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'house', 'home', 'residence', 'building', 'room', 'floor', 'level', 'inside', 'outside', 'near', 'by', 'main']);
const words = (s: string) => s.toLowerCase().replace(/['’]s\b/g, '').split(/[^\p{L}\p{N}]+/u).filter(w => w && !['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and'].includes(w));
const within = (name: string, place: Set<string>) => { const w = words(name); return w.length > 0 && w.every(x => place.has(x)); };
/** A building is named when one of its names fits inside the place, or they share a word that isn't generic ("Vance"). */
const names = (b: Building, place: Set<string>) => [b.name, ...b.aliases].some(n => within(n, place) || words(n).some(w => !GENERIC.has(w) && w.length > 2 && place.has(w)));
function roomIn(b: Building, place: Set<string>): { floor: Floor; room: Room; size: number } | null {
  let best: { floor: Floor; room: Room; size: number } | null = null;
  for (const floor of b.floors) for (const room of floor.rooms) for (const n of [room.name, ...room.aliases]) {
    if (!within(n, place)) continue;
    const size = words(n).length;
    if (!best || size > best.size) best = { floor, room, size };
  }
  return best;
}

export function whereabouts(buildings: Building[], location: string | undefined, last: string): Whereabouts | null {
  if (!location || !buildings.length) return null;
  const place = new Set(words(location));
  const named = buildings.filter(b => names(b, place));
  const order = [...(named.length ? named : buildings)].sort((a, b) => (b.id === last ? 1 : 0) - (a.id === last ? 1 : 0));
  for (const b of order) { const r = roomIn(b, place); if (r) return { building: b, floor: r.floor, room: r.room }; }
  return named[0] ? { building: named[0] } : null;
}

/** The narrator's line: the building the player is in, and where everything in it is. Background, not something to describe. */
export function layoutLine(at: Whereabouts, room = 460): string {
  const { building, floor, room: here } = at;
  const lead = here && floor ? `The player is in the ${here.name.toLowerCase()} (${floor.name.toLowerCase()})${here.near.length ? `, next to ${here.near.join(', ')}` : ''}.` : '';
  let text = `Where things are in ${building.name}, to keep the rooms consistent (background only; never list or describe the layout unless the scene calls for it): ${lead}`;
  for (const f of building.floors) {
    const part = ` ${f.name}: ${f.rooms.map(r => r.name).join(', ')}.`;
    if (text.length + part.length > room) break;
    text += part;
  }
  return text.replace(/:\s+ /, ': ').trim();
}
