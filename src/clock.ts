/**
 * Story time. A clock is a day number and, when known, an hour. Everything
 * else (labels like "evening", calendar dates) is turned into those two so
 * that code can tell how much story time has passed.
 */
export interface StoryClock { day: number; hour: number | null; label: string }
export interface TimeReading { hour: number; exact: boolean }
export interface DayReading { day: number; kind: 'count' | 'date' }

const PARTS: Array<[RegExp, number]> = [
  [/\bmidnight\b/i, 0], [/\b(?:dawn|daybreak|first light)\b/i, 5], [/\bsunrise\b/i, 6], [/\b(?:early morning)\b/i, 7],
  [/\bmorning\b/i, 9], [/\b(?:midday|noon)\b/i, 12], [/\b(?:late afternoon)\b/i, 17], [/\bafternoon\b/i, 15],
  [/\b(?:dusk|sunset|twilight)\b/i, 18], [/\bevening\b/i, 19], [/\b(?:late night)\b/i, 1], [/\bnight\b/i, 22],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "21:40", "9:40 PM", "9pm", or a part of the day. Exact only for clock times. */
export function readTime(text: string): TimeReading | null {
  const clock = /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i.exec(text);
  if (clock) {
    let hour = Number(clock[1]); const minute = Number(clock[2]), half = clock[3]?.toLowerCase().replace(/\./g, '');
    if (minute > 59 || hour > 23 || (half && (hour < 1 || hour > 12))) return null;
    if (half === 'pm' && hour < 12) hour += 12;
    if (half === 'am' && hour === 12) hour = 0;
    return { hour: hour + minute / 60, exact: true };
  }
  const short = /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i.exec(text);
  if (short) {
    let hour = Number(short[1]); const half = short[2].toLowerCase().replace(/\./g, '');
    if (hour < 1 || hour > 12) return null;
    if (half === 'pm' && hour < 12) hour += 12;
    if (half === 'am' && hour === 12) hour = 0;
    return { hour, exact: true };
  }
  for (const [pattern, hour] of PARTS) if (pattern.test(text)) return { hour, exact: false };
  return null;
}

/** "Day 3", an ISO date, or "March 14, 1892". Day counts and dates are never mixed. */
export function readDay(text: string): DayReading | null {
  const count = /\bday\s*(\d{1,5})\b/i.exec(text);
  if (count) return { day: Number(count[1]), kind: 'count' };
  const iso = /\b(\d{3,4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return date(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:,?\s+(\d{1,4})(?!\d))?/i.exec(text)
    ?? /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{1,4})(?!\d))?/i.exec(text);
  if (named) {
    const monthWord = /^\d/.test(named[1]) ? named[2] : named[1], dayText = /^\d/.test(named[1]) ? named[1] : named[2];
    const month = MONTHS.indexOf(monthWord.slice(0, 3).toLowerCase()) + 1;
    return date(named[3] ? Number(named[3]) : 2000, month, Number(dayText));
  }
  return null;
}
function date(year: number, month: number, day: number): DayReading | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const at = Date.UTC(year, month - 1, day);
  const check = new Date(at);
  if (check.getUTCDate() !== day) return null;
  return { day: Math.floor(at / 864e5), kind: 'date' };
}

/** Hours since the clock's day 0. An unknown hour counts as midday. */
export function absoluteHours(clock: Pick<StoryClock, 'day' | 'hour'>): number {
  return clock.day * 24 + (clock.hour ?? 12);
}

export function describeClock(clock: StoryClock): string {
  if (clock.label.trim()) return clock.label.trim();
  const hour = clock.hour === null ? '' : `, ${String(Math.floor(clock.hour)).padStart(2, '0')}:${String(Math.round((clock.hour % 1) * 60)).padStart(2, '0')}`;
  return `Day ${clock.day}${hour}`;
}

/** "3 days", "2 hours", "1 week" → hours. Only whole, positive amounts. */
export function durationHours(amount: number, unit: string): number {
  const scale: Record<string, number> = { minutes: 1 / 60, hours: 1, days: 24, weeks: 168 };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000 || !(unit in scale)) throw new Error('Choose a positive amount of time.');
  return amount * scale[unit];
}

/** Move a clock forward. The label is dropped because it no longer applies. */
export function advanceClock(clock: StoryClock, hours: number): StoryClock {
  if (clock.hour === null) return { day: clock.day + Math.max(0, Math.round(hours / 24)), hour: null, label: '' };
  const total = clock.day * 24 + clock.hour + hours;
  return { day: Math.floor(total / 24), hour: Math.round((total % 24) * 100) / 100, label: '' };
}

export function describeDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`;
  if (hours < 48) { const n = Math.round(hours); return `${n} hour${n === 1 ? '' : 's'}`; }
  if (hours < 24 * 14) { const n = Math.round(hours / 24); return `${n} days`; }
  const n = Math.round(hours / 168); return `${n} weeks`;
}
