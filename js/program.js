// Pure program logic: weights, plans, positions, streaks. No DOM, no storage.
import { EXERCISES, key, sequence, repSeconds } from './data/exercises.js';

export const PHASES = [
  { id: 'w1', label: 'Week 1', short: 'Seq 1 × 6', plan: [[1, 6]],
    note: 'Sequence 1 only, six rounds a day.' },
  { id: 'w2', label: 'Week 2', short: 'Seq 1 × 4, Seq 2 × 4', plan: [[1, 4], [2, 4]],
    note: 'Add Sequence 2 after Sequence 1. Four rounds of each.' },
  { id: 'w3', label: 'Week 3 onward', short: 'Seq 1–3 × 3', plan: [[1, 3], [2, 3], [3, 3]],
    note: 'All three sequences, three rounds of each.' },
];
export const phaseById = (id) => PHASES.find((p) => p.id === id) || PHASES[0];

export const DEFAULT_SETTINGS = {
  version: 1,
  phase: 'w1',
  base: 3,            // lb per hand in 1:1
  reps: 6,            // 6 = gain muscle, 3 = lose muscle or stay the same (book, Learning the Exercises)
  sex: 'f',           // affects the week-7 increment hint only
  levels: Object.fromEntries(EXERCISES.map((e) => [key(e), 5])),
  programStart: null, // ISO date string of day 1
  timer: {
    sound: true,
    voice: true,
    getReady: 10,       // seconds before each exercise; 0 = tap to start
    autoStart: true,    // start next exercise automatically after Done
    relaxMinutes: 5,
    keepAwake: true,
  },
  theme: 'auto',      // auto | light | dark
};

// ── The six Happy Body Standards ─────────────────────────────────────────
// The tests and targets below are editable in the app. The book defines each
// standard with a specific test; the texts here are placeholders to be checked
// against your copy, except Speed (the ~30-minute session from chapter text).
export const STANDARDS = [
  { id: 'flex', name: 'Flexibility', kind: 'pass', auto: null,
    test: 'Full squat with heels flat on the floor and arms straight overhead. Edit this to match the book\'s test.' },
  { id: 'strength', name: 'Strength', kind: 'number', unit: 'lb per hand', auto: 'base',
    test: 'The dumbbell weight you complete the whole program with. The book sets the target from your ideal body weight; enter it here.' },
  { id: 'speed', name: 'Speed', kind: 'number', unit: 'min', auto: 'session', lowerIsBetter: true, target: 30,
    test: 'Time for the complete cycle, all sequences and rounds. Target: about 30 minutes once fluent.' },
  { id: 'lean', name: 'Leanness', kind: 'number', unit: '% body fat', auto: null, lowerIsBetter: true,
    test: 'Body fat percentage. Enter the target from the book for your sex.' },
  { id: 'weight', name: 'Ideal body weight', kind: 'number', unit: 'lb', auto: 'weight',
    test: 'Morning weight. Target from Table 2.1: women 104 lb at 5 ft plus 3 lb per inch, men 120 lb at 5 ft plus 5 lb per inch. Move toward it by 1% of the ideal weight a week, then hold within about 2%.' },
  { id: 'posture', name: 'Posture', kind: 'pass', auto: null,
    test: 'Stand with your back to a wall, arms raised overhead with elbows locked. Good: heels, buttocks, shoulder blades and back of the head touch the wall. Very good: the backs of the hands too. Excellent: the elbows too.' },
];

// Earlier placeholder texts. A stored copy that still matches one is replaced by the current default.
export const OLD_STANDARD_TEXTS = [
  'Morning weight. Set your ideal body weight from the book\'s table as the target; aim for about 1% of it per week.',
  'Stand with your back to a wall: heels, calves, glutes, shoulder blades and head all touching, standing tall and relaxed. Edit to match the book\'s test.',
];

export const DEFAULT_PROGRESS = {
  standards: Object.fromEntries(STANDARDS.map((s) => [s.id, { test: s.test, target: s.target ?? null }])),
  checkins: [],   // {id, ts, values: {flex: true, strength: 4.5, ...}, note}
  weights: [],    // {id, ts, lb}
  photos: [],     // {id, ts, tag: 'front'|'side'|'back'|'other', note}  (blob under photos store key progress:<id>)
};

// Is a standard met, given a value and target?
export function standardMet(def, value, target) {
  if (value == null || value === '') return null;
  if (def.kind === 'pass') return value === true;
  if (target == null || target === '') return null;
  const v = Number(value), t = Number(target);
  if (Number.isNaN(v) || Number.isNaN(t)) return null;
  return def.lowerIsBetter ? v <= t : (def.id === 'weight' ? Math.abs(v - t) <= Math.max(1, t * 0.02) : v >= t);
}

// Latest value per standard from check-ins, with automatic feeds filled in by the caller.
export function latestValues(checkins) {
  const out = {};
  for (const c of checkins) for (const [k, v] of Object.entries(c.values || {})) if (v != null && v !== '') out[k] = { value: v, ts: c.ts };
  return out;
}

// Weekly change from the weigh-in list: compare latest to the closest entry ~7 days earlier.
export function weeklyChange(weights) {
  if (weights.length < 2) return null;
  const last = weights[weights.length - 1];
  const target = last.ts - 7 * 86400000;
  let best = null;
  for (const w of weights) if (w.ts <= last.ts - 4 * 86400000 && (!best || Math.abs(w.ts - target) < Math.abs(best.ts - target))) best = w;
  return best ? { lb: last.lb - best.lb, days: Math.round((last.ts - best.ts) / 86400000) } : null;
}

// Durations (minutes) of complete days, newest last.
export function sessionMinutes(byDay) {
  const out = [];
  for (const [day, entries] of [...byDay.entries()].sort()) {
    if (!dayComplete(entries)) continue;
    const first = entries[0].ts, last = entries[entries.length - 1].ts;
    out.push({ day, minutes: Math.round((last - first) / 60000) });
  }
  return out;
}

// ── Weights ──────────────────────────────────────────────────────────────
export const round05 = (x) => Math.round(x * 2) / 2;

export function weightFor(e, base) {
  if (!e.lift) return null;
  return round05(base * e.pct / 100);
}

export function weightLabel(e, base) {
  const w = weightFor(e, base);
  if (w == null) return 'No weight';
  const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(x * 4 % 1 ? 2 : 1));
  if (e.seq === 3 && e.n === 1) return `${fmt(w)} lb, or two at ${fmt(round05(w / 2) || w / 2)}`;
  if (e.seq === 1 && e.n === 5) return `${fmt(w)} lb at the chin, or two at ${fmt(w / 2)}`;
  return `${fmt(w)} lb ${e.hands}`;
}

export function repsFor(e, settings) {
  if (!e.lift) return 6;
  return settings.reps === 3 ? 3 : 6;
}

// Describe how reps are split: 2:4 per arm, 2:2 alternating.
export function repsLabel(e, settings) {
  const r = repsFor(e, settings);
  if (e.perArm) return `${r} reps · ${r / 2} per arm`;
  if (e.alternate) return `${r} reps · alternate sides`;
  return `${r} reps`;
}

// Which side a given rep (1-based) is on, or null.
export function repSide(e, rep, total) {
  if (e.perArm) return rep <= total / 2 ? 'Left arm' : 'Right arm';
  if (e.alternate) return rep % 2 ? 'Left' : 'Right';
  return null;
}

// ── Plan & position ──────────────────────────────────────────────────────
// A plan is [[seq, rounds], ...]. Flatten to an ordered list of slots.
export function slotsFor(phaseId) {
  const plan = phaseById(phaseId).plan;
  const slots = [];
  for (const [seq, rounds] of plan) {
    const exs = sequence(seq);
    for (let r = 1; r <= rounds; r++) {
      for (const e of exs) slots.push({ seq, round: r, rounds, n: e.n, key: key(e) });
    }
  }
  return slots;
}

export function planMinutes(phaseId, settings) {
  const slots = slotsFor(phaseId);
  let s = 0;
  for (const slot of slots) {
    const e = EXERCISES.find((x) => key(x) === slot.key);
    s += repSeconds(e) * repsFor(e, settings) + (settings.timer?.getReady || 0);
  }
  return Math.round(s / 60);
}

// Local calendar day string YYYY-MM-DD for a timestamp.
export function dayOf(ts) {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const today = () => dayOf(Date.now());

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dayOf(dt.getTime());
}

// Position for a day derived purely from the log: how many slots are done.
export function positionFor(phaseId, entriesToday) {
  const slots = slotsFor(phaseId);
  const done = entriesToday.length;
  const idx = Math.min(done, slots.length);
  return {
    slots,
    index: idx,
    current: idx < slots.length ? slots[idx] : null,
    complete: idx >= slots.length,
    total: slots.length,
  };
}

// Summarise a day's entries against a plan.
export function daySummary(phaseId, entries) {
  const slots = slotsFor(phaseId);
  const doneCount = Math.min(entries.length, slots.length);
  const skipped = entries.filter((e) => e.skipped).length;
  const first = entries.length ? Math.min(...entries.map((e) => e.ts)) : null;
  const last = entries.length ? Math.max(...entries.map((e) => e.ts)) : null;
  return { done: doneCount, total: slots.length, complete: doneCount >= slots.length, skipped, first, last };
}

// Group log entries by local day. Entries: {ts, key, seq, n, round, phase, skipped}
export function groupByDay(entries) {
  const map = new Map();
  for (const e of entries) {
    const d = dayOf(e.ts);
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(e);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.ts - b.ts);
  return map;
}

// Streak: consecutive complete days ending today or yesterday.
// A day is "complete" if its entry count reaches the plan recorded on the entries
// (each entry stores the phase it was logged under, so phase changes don't rewrite history).
export function dayComplete(dayEntries) {
  if (!dayEntries.length) return false;
  const phase = dayEntries[dayEntries.length - 1].phase || 'w1';
  return dayEntries.length >= slotsFor(phase).length;
}

export function streakFrom(byDay, todayDay) {
  let d = todayDay;
  if (!dayComplete(byDay.get(d) || [])) d = addDays(d, -1);
  let n = 0;
  while (dayComplete(byDay.get(d) || [])) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak(byDay) {
  const days = [...byDay.keys()].filter((d) => dayComplete(byDay.get(d))).sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// Week number of the program (1-based) from the start date.
export function programWeek(programStart, todayDay) {
  if (!programStart) return null;
  const [y, m, d] = programStart.split('-').map(Number);
  const [y2, m2, d2] = todayDay.split('-').map(Number);
  const days = Math.round((new Date(y2, m2 - 1, d2) - new Date(y, m - 1, d)) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

export function suggestedPhase(week) {
  if (!week) return null;
  if (week <= 1) return 'w1';
  if (week === 2) return 'w2';
  return 'w3';
}

// Week-2 soreness rule: drop one level on each sore exercise; at level 1, drop base by 1 lb.
export function applySoreness(settings, soreKeys) {
  const next = { ...settings, levels: { ...settings.levels } };
  let baseDrop = false;
  for (const k of soreKeys) {
    const lv = next.levels[k] || 5;
    if (lv > 1) next.levels[k] = lv - 1;
    else baseDrop = true;
  }
  if (baseDrop) next.base = Math.max(0.5, round05(next.base - 1));
  return { settings: next, baseDropped: baseDrop };
}

export const increment = (sex) => (sex === 'm' ? 2 : 1);
