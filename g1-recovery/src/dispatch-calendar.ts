/** Bounded calendar planning only. Admission, grants and missed-run policies belong
 * to the durable Dispatch controller. A preview never silently truncates backlog.
 * Daily gaps are skipped; folds resolve to exactly one explicitly selected instant. */
import {enumeration, object, positive, refined, revision, timestamp, RecoveryError, type Value} from './schema.js';

const DAY = 86_400_000;
export const MAX_CALENDAR_HORIZON_MS = 366 * DAY;
const intervalSchema = object({kind: enumeration('interval'), startAt: timestamp,
  everyMs: refined(positive, n => n <= MAX_CALENDAR_HORIZON_MS)});
const dailySchema = object({kind: enumeration('daily'), startAt: timestamp,
  hour: refined(revision, n => n < 24), minute: refined(revision, n => n < 60),
  gap: enumeration('skip'), fold: enumeration('earlier', 'later')});
export type Recurrence = Value<typeof intervalSchema> | Value<typeof dailySchema>;
function invalid(message: string): never {throw new RecoveryError('INVALID_INPUT', message);}

function formatter(timezone: unknown): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\-/]{0,127}$/.test(timezone))
    invalid('Explicit IANA timezone required');
  try {return new Intl.DateTimeFormat('en-GB', {timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});}
  catch {return invalid('Invalid IANA timezone');}
}
function instant(value: unknown): number {
  const iso = timestamp.parse(value);
  // Leave two days on both ends for resolving offsets, including date-line changes.
  if (iso < '0001-01-03T00:00:00.000Z' || iso > '9998-12-29T23:59:59.999Z') invalid('Calendar instant outside supported range');
  return Date.parse(iso);
}
export function validateCalendar(timezone: unknown, recurrence: unknown): Recurrence {
  formatter(timezone);
  const kind = recurrence && typeof recurrence === 'object' ? Object.getOwnPropertyDescriptor(recurrence, 'kind')?.value : null;
  const parsed = kind === 'interval' ? intervalSchema.parse(recurrence) : dailySchema.parse(recurrence);
  instant(parsed.startAt);
  return parsed;
}

interface Local {year: number; month: number; day: number; hour: number; minute: number; second: number}
function local(format: Intl.DateTimeFormat, ms: number): Local {
  const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return {year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second)};
}
function localAsUTC(value: Local): number {
  const date = new Date(0); date.setUTCFullYear(value.year, value.month - 1, value.day);
  date.setUTCHours(value.hour, value.minute, value.second, 0); return date.getTime();
}
function resolveDaily(format: Intl.DateTimeFormat, nominal: number, fold: 'earlier' | 'later'): number | null {
  // Sample both sides of the local date, retaining second-level historical offsets.
  // Then validate each candidate against the complete local tuple: gaps have none.
  const offsets = new Set<number>();
  for (let delta = -2 * DAY; delta <= 2 * DAY; delta += 6 * 3_600_000) {
    const sample = nominal + delta; offsets.add(localAsUTC(local(format, sample)) - sample);
  }
  const candidates = [...offsets].map(offset => nominal - offset)
    .filter(candidate => localAsUTC(local(format, candidate)) === nominal).sort((a, b) => a - b);
  if (!candidates.length) return null;
  return (fold === 'earlier' ? candidates[0] : candidates[candidates.length - 1])!;
}

/** Return all occurrences in (afterExclusive, throughInclusive], at/after startAt.
 * Limits reject the entire request, so callers must deliberately choose a bounded
 * planning window rather than advance a durable cursor over an omitted backlog. */
export function previewOccurrences(timezone: unknown, recurrence: unknown, afterExclusive: unknown, throughInclusive: unknown, limit = 100): string[] {
  const parsed = validateCalendar(timezone, recurrence); const format = formatter(timezone);
  const after = instant(afterExclusive), through = instant(throughInclusive), start = instant(parsed.startAt);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) invalid('Calendar limit must be 1..1000');
  if (through < after || through - after > MAX_CALENDAR_HORIZON_MS) invalid('Calendar horizon must be 0..366 days');
  const occurrences: number[] = [];
  function add(ms: number): void {
    if (ms > after && ms <= through && ms >= start) {
      occurrences.push(ms); if (occurrences.length > limit) invalid('Calendar occurrence limit exceeded; narrow the horizon');
    }
  }
  if (parsed.kind === 'interval') {
    const first = Math.max(0, Math.floor((after - start) / parsed.everyMs) + 1);
    for (let ms = start + first * parsed.everyMs; ms <= through; ms += parsed.everyMs) add(ms);
  } else {
    const firstDay = new Date(Math.max(after, start) - 2 * DAY); firstDay.setUTCHours(0, 0, 0, 0);
    const end = through + 2 * DAY;
    for (let day = firstDay.getTime(); day <= end; day += DAY) {
      const occurrence = resolveDaily(format, day + parsed.hour * 3_600_000 + parsed.minute * 60_000, parsed.fold);
      if (occurrence !== null) add(occurrence);
    }
  }
  return occurrences.sort((a, b) => a - b).map(ms => new Date(ms).toISOString());
}
