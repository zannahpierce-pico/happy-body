import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, byKey, key, repSeconds } from '../js/data/exercises.js';
import { weightFor, kitFor, loadFor, loadLabel, fmtW, slotsFor, positionFor, streakFrom, groupByDay, addDays, applySoreness, DEFAULT_SETTINGS, repsFor, repSide, dayComplete, bestStreak, programWeek, suggestedPhase } from '../js/program.js';
import { TempoTimer } from '../js/timer.js';

test('18 exercises, lifts on 1/4/5/6', () => {
  assert.equal(EXERCISES.length, 18);
  for (const e of EXERCISES) {
    assert.equal(e.lift, [1, 4, 5, 6].includes(e.n), key(e));
    assert.equal(e.levels.length, 5, key(e));
    assert.ok(e.steps.length >= 2);
  }
});

test('rep tempo totals match the brief', () => {
  const expected = { '1:1': 11, '1:2': 9, '1:3': 8, '1:4': 11, '1:5': 6, '1:6': 10, '2:1': 10, '2:2': 9, '2:3': 8, '2:4': 9, '2:5': 9, '2:6': 10, '3:1': 10, '3:2': 10, '3:3': 8, '3:4': 11, '3:5': 9, '3:6': 10 };
  for (const e of EXERCISES) assert.equal(repSeconds(e), expected[key(e)], key(e));
});

test('weights at base 3 lb match the user defaults', () => {
  const expected = { '1:1': 3, '1:4': 4.5, '1:5': 6, '1:6': 4.5, '2:1': 1.5, '2:4': 6, '2:5': 3, '2:6': 4.5, '3:1': 4.5, '3:4': 1.5, '3:5': 3, '3:6': 4.5 };
  for (const [k, w] of Object.entries(expected)) assert.equal(weightFor(byKey[k], 3), w, k);
  assert.equal(weightFor(byKey['1:2'], 3), null);
  assert.equal(weightFor(byKey['1:4'], 4), 6);
  assert.equal(weightFor(byKey['2:1'], 3.5), 2); // 1.75 rounds to 2
});

test('reps: 2/3 always 6; lifts follow setting; sides', () => {
  const s3 = { ...DEFAULT_SETTINGS, reps: 3 };
  assert.equal(repsFor(byKey['1:2'], s3), 6);
  assert.equal(repsFor(byKey['1:1'], s3), 3);
  assert.equal(repSide(byKey['2:4'], 1, 6), 'Left arm');
  assert.equal(repSide(byKey['2:4'], 4, 6), 'Right arm');
  assert.equal(repSide(byKey['2:2'], 2, 6), 'Right');
  assert.equal(repSide(byKey['1:1'], 2, 6), null);
});

test('plans flatten to the right number of slots', () => {
  assert.equal(slotsFor('w1').length, 36);
  assert.equal(slotsFor('w2').length, 48);
  assert.equal(slotsFor('w3').length, 54);
  const w2 = slotsFor('w2');
  assert.deepEqual([w2[0].seq, w2[0].round, w2[0].n], [1, 1, 1]);
  assert.deepEqual([w2[23].seq, w2[23].round, w2[23].n], [1, 4, 6]);
  assert.deepEqual([w2[24].seq, w2[24].round, w2[24].n], [2, 1, 1]);
});

test('position derives from the log', () => {
  const p0 = positionFor('w1', []);
  assert.equal(p0.index, 0); assert.equal(p0.current.key, '1:1');
  const p7 = positionFor('w1', new Array(7).fill({}));
  assert.deepEqual([p7.current.seq, p7.current.round, p7.current.n], [1, 2, 2]);
  const done = positionFor('w1', new Array(36).fill({}));
  assert.equal(done.complete, true); assert.equal(done.current, null);
  const over = positionFor('w1', new Array(40).fill({}));
  assert.equal(over.complete, true);
});

test('streaks', () => {
  const mk = (day, n, phase = 'w1') => Array.from({ length: n }, (_, i) => ({ ts: new Date(day + 'T08:00:00').getTime() + i * 60000, phase }));
  const t = '2026-11-03';
  const log = [...mk(addDays(t, -2), 36), ...mk(addDays(t, -1), 36), ...mk(t, 10)];
  const byDay = groupByDay(log);
  assert.equal(dayComplete(byDay.get(t)), false);
  assert.equal(streakFrom(byDay, t), 2);        // today partial: streak counts through yesterday
  const log2 = [...log, ...mk(t, 26)];
  assert.equal(streakFrom(groupByDay(log2), t), 3);
  const gap = [...mk(addDays(t, -5), 36), ...mk(addDays(t, -1), 36)];
  assert.equal(streakFrom(groupByDay(gap), t), 1);
  assert.equal(bestStreak(groupByDay(log2)), 3);
  // phase recorded on entries decides completeness
  const w2day = mk(t, 36, 'w2');
  assert.equal(dayComplete(w2day), false);
});

test('soreness rule', () => {
  const s = { ...DEFAULT_SETTINGS, levels: { ...DEFAULT_SETTINGS.levels, '1:5': 1 } };
  const r = applySoreness(s, ['1:1', '1:5']);
  assert.equal(r.settings.levels['1:1'], 2); // one level down from the default of 3
  assert.equal(r.settings.levels['1:5'], 1);
  assert.equal(r.baseDropped, true);
  assert.equal(r.settings.base, 2);
});

test('program week and suggestion', () => {
  assert.equal(programWeek('2026-11-03', '2026-11-03'), 1);
  assert.equal(programWeek('2026-11-03', '2026-11-09'), 1);
  assert.equal(programWeek('2026-11-03', '2026-11-10'), 2);
  assert.equal(programWeek('2026-11-03', '2026-11-24'), 4);
  assert.equal(suggestedPhase(4), 'w3');
});

test('tempo timer computes phases from elapsed time', () => {
  const e = byKey['1:1'];
  const t = new TempoTimer({ phases: e.phases, reps: 6 });
  assert.equal(t.totalMs, 66000);
  let s = t.compute(0); assert.equal(s.label, 'Inhale'); assert.equal(s.rep, 1); assert.equal(s.remaining, 2);
  s = t.compute(1999); assert.equal(s.label, 'Inhale'); assert.equal(s.remaining, 1);
  s = t.compute(2000); assert.equal(s.label, 'Lift'); assert.equal(s.remaining, 1);
  s = t.compute(11000); assert.equal(s.rep, 2); assert.equal(s.label, 'Inhale');
  s = t.compute(65999); assert.equal(s.rep, 6); assert.equal(s.label, 'Exhale');
  s = t.compute(66000); assert.equal(s.done, true);
  // jump across many phases (backgrounded): state is still right
  s = t.compute(30500); assert.equal(s.rep, 3); assert.equal(s.label, 'Lower');
  s = t.compute(28000); assert.equal(s.rep, 3); assert.equal(s.label, 'Hold');
});

test('loads from the weights on hand', () => {
  const s = { ...DEFAULT_SETTINGS, base: 3 };
  assert.equal(loadLabel(byKey['1:1'], s), 'a 3 lb dumbbell in each hand');
  assert.equal(loadLabel(byKey['1:4'], s), 'a 5 lb dumbbell in both hands (book 4.5)');      // 5 lb beats 2.5 + 2.5 plates: fewer pieces
  assert.equal(loadLabel(byKey['1:5'], s), 'a 3 lb dumbbell in each hand');                   // two at half the weight, exact
  assert.equal(loadLabel(byKey['1:6'], s), 'a 5 lb dumbbell in each hand (book 4.5)');
  assert.equal(loadLabel(byKey['2:1'], s), 'a 1.25 lb plate in each hand (book 1.5)');
  assert.equal(loadLabel(byKey['1:2'], s), 'No weight');
  assert.equal(loadLabel(byKey['1:4'], { ...s, kit: [] }), '4.5 lb one dumbbell, both hands');
  assert.equal(loadFor(byKey['1:4'], { ...s, kit: [{ lb: 10, n: 2 }] }).lb, null); // nothing within a pound
  assert.equal(fmtW(1.25), '1.25'); assert.equal(fmtW(2.5), '2.5'); assert.equal(fmtW(3), '3');
});

test('kit for the day', () => {
  const k = kitFor('w1', { ...DEFAULT_SETTINGS, base: 3 });
  assert.deepEqual(k.items, [{ lb: 3, n: 2 }, { lb: 5, n: 2 }]);
  assert.equal(k.bench, true); // Sitting Tower at the default level 3 squats to a bench
  const book = kitFor('w1', { ...DEFAULT_SETTINGS, base: 3, kit: [] });
  assert.deepEqual(book.items, [{ lb: 3, n: 2 }, { lb: 4.5, n: 2 }, { lb: 6, n: 1, or: 3 }]);
  const full = kitFor('w1', { ...DEFAULT_SETTINGS, base: 3, levels: { ...DEFAULT_SETTINGS.levels, '1:5': 5 } });
  assert.equal(full.bench, false);
  const w3 = kitFor('w3', { ...DEFAULT_SETTINGS, base: 2 });
  assert.ok(w3.items.some((d) => d.lb === 1.25 && d.plate && d.n === 2), 'Opening Wide and Working Hinges at 1 lb: the 1.25 plates');
});
