import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_CALENDAR_HORIZON_MS, previewOccurrences, validateCalendar, type Recurrence} from '../src/dispatch-calendar.js';
import {RecoveryError} from '../src/schema.js';
const startAt = '2026-01-01T00:00:00.000Z';
const interval: Recurrence = {kind: 'interval', startAt, everyMs: 60_000};
const daily = (hour: number, minute: number, fold: 'earlier' | 'later' = 'earlier'): Recurrence =>
  ({kind: 'daily', startAt, hour, minute, gap: 'skip', fold});
const rejects = (work: () => unknown): void => {assert.throws(work, (e: unknown) => e instanceof RecoveryError && e.code === 'INVALID_INPUT');};

test('DISPATCH-CALENDAR/ interval starts inclusively, plans exclusive/inclusive boundaries, and replays stable UTC IDs', () => {
  const args = ['Asia/Kathmandu', interval, '2025-12-31T23:59:59.999Z', '2026-01-01T00:02:00.000Z'] as const;
  assert.deepEqual(previewOccurrences(...args), [startAt, '2026-01-01T00:01:00.000Z', '2026-01-01T00:02:00.000Z']);
  assert.deepEqual(previewOccurrences(...args), previewOccurrences(...args));
  assert.deepEqual(previewOccurrences('UTC', interval, startAt, '2026-01-01T00:01:00.000Z'), ['2026-01-01T00:01:00.000Z']);
  assert.deepEqual(previewOccurrences('UTC', interval, startAt, startAt), []);
  assert.deepEqual(previewOccurrences('UTC', {...interval, startAt: '2026-01-02T00:00:00.000Z'}, startAt, '2026-01-01T00:01:00.000Z'), []);
  assert.deepEqual(previewOccurrences('UTC', {...interval, everyMs: 1}, startAt, '2026-01-01T00:00:00.002Z'), ['2026-01-01T00:00:00.001Z', '2026-01-01T00:00:00.002Z']);
});
test('DISPATCH-CALENDAR/ daily New York spring gap skips absent local time', () => {
  assert.deepEqual(previewOccurrences('America/New_York', daily(2, 30), '2026-03-07T00:00:00.000Z', '2026-03-10T00:00:00.000Z'),
    ['2026-03-07T07:30:00.000Z', '2026-03-09T06:30:00.000Z']);
});
test('DISPATCH-CALENDAR/ New York fold explicitly chooses one occurrence and never doubles a fire', () => {
  const after = '2026-10-31T00:00:00.000Z', through = '2026-11-03T00:00:00.000Z';
  assert.deepEqual(previewOccurrences('America/New_York', daily(1, 30, 'earlier'), after, through),
    ['2026-10-31T05:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z']);
  assert.deepEqual(previewOccurrences('America/New_York', daily(1, 30, 'later'), after, through),
    ['2026-10-31T05:30:00.000Z', '2026-11-01T06:30:00.000Z', '2026-11-02T06:30:00.000Z']);
  assert.deepEqual(previewOccurrences('America/New_York', daily(1, 30, 'earlier'), '2026-11-01T05:45:00.000Z', '2026-11-01T07:00:00.000Z'), []);
  assert.deepEqual(previewOccurrences('America/New_York', daily(1, 30, 'later'), '2026-11-01T05:45:00.000Z', '2026-11-01T07:00:00.000Z'), ['2026-11-01T06:30:00.000Z']);
});
test('DISPATCH-CALENDAR/ non-hour Lord Howe transitions skip 30-minute gap and select 30-minute fold', () => {
  assert.deepEqual(previewOccurrences('Australia/Lord_Howe', daily(2, 15), '2026-10-02T00:00:00.000Z', '2026-10-05T00:00:00.000Z'),
    ['2026-10-02T15:45:00.000Z', '2026-10-04T15:15:00.000Z']);
  const after = '2026-04-04T00:00:00.000Z', through = '2026-04-05T00:00:00.000Z';
  assert.deepEqual(previewOccurrences('Australia/Lord_Howe', daily(1, 45, 'earlier'), after, through), ['2026-04-04T14:45:00.000Z']);
  assert.deepEqual(previewOccurrences('Australia/Lord_Howe', daily(1, 45, 'later'), after, through), ['2026-04-04T15:15:00.000Z']);
});
test('DISPATCH-CALENDAR/ quarter-hour timezone, year rollover, and startAt gating retain local date semantics', () => {
  assert.deepEqual(previewOccurrences('Asia/Kathmandu', {...daily(0, 0), startAt: '2025-12-30T00:00:00.000Z'}, '2025-12-31T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ['2025-12-31T18:15:00.000Z', '2026-01-01T18:15:00.000Z']);
  assert.deepEqual(previewOccurrences('Asia/Kathmandu', daily(0, 0), '2025-12-31T00:00:00.000Z', '2026-01-02T00:00:00.000Z'), ['2026-01-01T18:15:00.000Z']);
});
test('DISPATCH-CALENDAR/ IANA date-line gap skips a whole nonexistent date', () => {
  assert.deepEqual(previewOccurrences('Pacific/Apia', {...daily(12, 0), startAt: '2011-12-28T00:00:00.000Z'}, '2011-12-29T00:00:00.000Z', '2012-01-01T00:00:00.000Z'),
    ['2011-12-29T22:00:00.000Z', '2011-12-30T22:00:00.000Z', '2011-12-31T22:00:00.000Z']);
});
test('DISPATCH-CALENDAR/ validation is closed, immutable, accessor safe and rejects invalid explicit timezone', () => {
  assert.ok(Object.isFrozen(validateCalendar('UTC', interval)));
  for (const zone of ['', 'Mars/Olympus', 'America/Imaginary', '+01:00', '../UTC', null, 123]) rejects(() => validateCalendar(zone, interval));
  for (const everyMs of [0, -1, 0.5, NaN, Infinity, MAX_CALENDAR_HORIZON_MS + 1, '1000']) rejects(() => validateCalendar('UTC', {...interval, everyMs}));
  for (const change of [{hour: 24}, {hour: -1}, {minute: 60}, {minute: 1.5}, {fold: 'both'}, {gap: 'shift-forward'}, {kind: 'cron'}, {extra: true}])
    rejects(() => validateCalendar('UTC', {...daily(1, 0), ...change}));
  for (const date of ['2026-02-30T00:00:00.000Z', '2026-01-01', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00.000+00:00'])
    rejects(() => validateCalendar('UTC', {...interval, startAt: date}));
  rejects(() => validateCalendar('UTC', {...interval, [Symbol('extra')]: true}));
  rejects(() => validateCalendar('UTC', Object.create(interval)));
  rejects(() => validateCalendar('UTC', {...interval, get everyMs() {throw new Error('Getter must not execute');}}));
  rejects(() => validateCalendar('UTC', {...interval, get kind() {throw new Error('Getter must not execute');}}));
  const missing = {...interval} as Record<string, unknown>; delete missing.startAt; rejects(() => validateCalendar('UTC', missing));
});
test('DISPATCH-CALENDAR/ horizon and count overflow fail closed rather than truncate missed occurrences', () => {
  const through = '2026-01-01T00:02:00.000Z';
  rejects(() => previewOccurrences('UTC', interval, startAt, through, 1));
  assert.equal(previewOccurrences('UTC', interval, startAt, through, 2).length, 2);
  rejects(() => previewOccurrences('UTC', daily(12, 0), startAt, '2026-01-04T00:00:00.000Z', 2));
  for (const limit of [0, -1, 1.5, 1001, Infinity, NaN]) rejects(() => previewOccurrences('UTC', interval, startAt, through, limit));
  rejects(() => previewOccurrences('UTC', interval, through, startAt));
  rejects(() => previewOccurrences('UTC', interval, startAt, '2027-01-03T00:00:00.000Z'));
  const maximum = new Date(Date.parse(startAt) + MAX_CALENDAR_HORIZON_MS).toISOString();
  assert.equal(previewOccurrences('UTC', {...interval, everyMs: MAX_CALENDAR_HORIZON_MS}, startAt, maximum).length, 1);
  rejects(() => previewOccurrences('UTC', interval, '2026-01-01', through));
});
