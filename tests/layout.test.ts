import { describe, expect, test } from 'bun:test';
import { layoutLine, whereabouts } from '../src/layout';
import { buildNote } from '../src/note';
import { validateNotebook, waitsFor, type Building } from '../src/notebook';
import { tidyNotebook } from '../src/tidy';
import { sampleNotebook } from './fixtures';

const house: Building = { id: 'vance-house', name: 'the Vance house', aliases: ['Vance Residence'], floors: [
  { name: 'Upstairs', rooms: [{ name: 'Master bedroom', aliases: [], near: ['hall bathroom', 'landing'] }, { name: 'Lauren\'s room', aliases: [], near: ['hall bathroom'] }, { name: 'Hall bathroom', aliases: [], near: [] }, { name: 'Landing', aliases: ['upstairs hallway'], near: ['stairs'] }] },
  { name: 'Downstairs', rooms: [{ name: 'Kitchen', aliases: ['breakfast nook'], near: ['living room', 'patio door'] }, { name: 'Living room', aliases: [], near: ['kitchen', 'front door'] }] },
] };
const dorm: Building = { id: 'dorm', name: 'Hadley Hall', aliases: ['the dorm'], floors: [{ name: 'Third floor', rooms: [{ name: 'Kitchen', aliases: ['shared kitchen'], near: ['lounge'] }, { name: 'Room 312', aliases: [], near: [] }] }] };

describe('where things are', () => {
  test('the tracker\'s place is found in the right building, however it is worded', () => {
    expect(whereabouts([house, dorm], 'Kitchen, Vance Residence', '')?.room?.name).toBe('Kitchen');
    expect(whereabouts([house, dorm], 'Master Bedroom', 'vance-house')).toMatchObject({ building: { id: 'vance-house' }, floor: { name: 'Upstairs' }, room: { name: 'Master bedroom' } });
    expect(whereabouts([house, dorm], 'Upstairs Hallway', '')?.room?.name).toBe('Landing');
    // A room name both buildings have goes to the one named, or else the one the story was last in.
    expect(whereabouts([house, dorm], 'Kitchen, Hadley Hall', 'vance-house')?.building.id).toBe('dorm');
    expect(whereabouts([house, dorm], 'Kitchen', 'dorm')?.building.id).toBe('dorm');
    expect(whereabouts([house, dorm], 'Vance Residence front porch', '')).toMatchObject({ building: { id: 'vance-house' } });
    expect(whereabouts([house, dorm], 'David\'s Silverado Cab (Driveway)', 'vance-house')).toBeNull();
  });
  test('the narrator gets one line for the building the player is in, as background', () => {
    const line = layoutLine(whereabouts([house], 'Master Bedroom', '')!);
    expect(line).toContain('The player is in the master bedroom (upstairs), next to hall bathroom, landing.');
    expect(line).toContain('Downstairs: Kitchen, Living room.');
    expect(line).toContain('never list or describe the layout unless the scene calls for it');
    const nb = validateNotebook({ ...sampleNotebook(), buildings: [house] });
    const text = buildNote({ notebook: nb, pace: 'auto', clock: { day: 1, hour: 18, label: '' }, now: { hours: 10, reply: 5, waits: waitsFor('medium', 'auto') }, recent: '', layout: line });
    expect(text).toContain('Where things are in the Vance house');
  });
  test('a layout, once written, keeps its rooms when a later update leaves them out', () => {
    const before = validateNotebook({ ...sampleNotebook(), buildings: [house] });
    const raw: any = structuredClone(before);
    raw.buildings = [{ id: 'vance-house', name: 'the Vance house', floors: [{ name: 'Downstairs', rooms: ['Kitchen', 'Living room', { name: 'Laundry', near: ['kitchen'] }] }] }];
    const after = validateNotebook(tidyNotebook(raw, before));
    expect(after.buildings[0].floors.map(f => f.name)).toEqual(['Downstairs', 'Upstairs']);
    expect(after.buildings[0].floors[0].rooms.map(r => r.name)).toEqual(['Kitchen', 'Living room', 'Laundry']);
    expect(after.buildings[0].floors[1].rooms).toHaveLength(4);
    const dropped: any = structuredClone(before); dropped.buildings = [];
    expect(validateNotebook(tidyNotebook(dropped, before)).buildings).toHaveLength(1);
  });
  test('a crowded scene lets people leave', () => {
    const nb = validateNotebook(sampleNotebook());
    const note = (recent: string) => buildNote({ notebook: nb, pace: 'auto', clock: { day: 1, hour: 18, label: '' }, now: { hours: 10, reply: 5, waits: waitsFor('medium', 'auto') }, recent });
    expect(note('Mira, Cole, Oswin, Wren and Brother Hale are all at the table.')).toContain('let one or two drift off');
    expect(note('Mira and Cole talk.')).not.toContain('drift off');
  });
});

describe('waits a model wrote as clock times', () => {
  test('a wait close to a calendar clock counts from now; a year or more falls back to the usual wait', () => {
    const before = validateNotebook(sampleNotebook()); before.clock = { day: 20710, hour: 15, label: 'Monday' } as any;
    const now = 20710 * 24 + 15;
    const raw: any = structuredClone(before);
    raw.threads[0].steps[1].afterHours = now + 30; raw.threads[0].steps[2].afterHours = 8760;
    const after = validateNotebook(tidyNotebook(raw, before));
    expect(after.threads[0].steps[1].afterHours).toBe(30);
    expect(after.threads[0].steps[2].afterHours).toBe(24);
  });
  test('floors named the same way twice become one', () => {
    const raw: any = { ...sampleNotebook(), buildings: [{ id: 'c', name: 'Cathedral', floors: [{ name: 'Upper Level and Crypts', rooms: ['Crypt'] }, { name: 'Upper Level & Crypts', rooms: ['Bell tower', 'crypt'] }] }] };
    const nb = validateNotebook(tidyNotebook(raw));
    expect(nb.buildings[0].floors).toHaveLength(1);
    expect(nb.buildings[0].floors[0].rooms.map(r => r.name)).toEqual(['Crypt', 'Bell tower']);
  });
});
