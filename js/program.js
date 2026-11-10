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

// The dumbbells and plates on hand: { lb, n, plate }. Loads are built from them
// (a dumbbell alone, a plate alone, or two plates held together in one hand), so
// every exercise shows the nearest weight you can actually pick up. Edited in Program.
export const DEFAULT_KIT = [
  { lb: 1.25, n: 2, plate: true }, { lb: 2.5, n: 2, plate: true },
  { lb: 2, n: 2 }, { lb: 3, n: 2 }, { lb: 5, n: 2 },
];

export const DEFAULT_SETTINGS = {
  version: 1,
  phase: 'w1',
  base: 3,            // lb per hand in 1:1
  kit: DEFAULT_KIT,
  reps: 6,            // 6 = gain muscle, 3 = lose muscle or stay the same (book, Learning the Exercises)
  sex: 'f',           // affects the week-7 increment hint only
  levels: Object.fromEntries(EXERCISES.map((e) => [key(e), 3])), // start mid-way; the book has you move up from where you can
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
    test: 'Five tests, each graded poor to excellent. Jerzy squat: feet together, toes curled up, a book on open palms overhead, elbows locked, heels down, no lean; excellent is sitting on your calves. Table: knees locked, back arched, bend forward; excellent is palms flat on the floor. Jackknife: sit, legs straight, toes up, bend forward; excellent is elbows to toes. Bow: lie face down, arch up; excellent is looking straight at the ceiling. Corkscrew: stick behind the neck, twist; excellent is facing the wall that was on your other side.' },
  { id: 'strength', name: 'Strength', kind: 'number', unit: 'lb per hand', auto: null,
    test: 'Overhead squat press with two dumbbells. The standard is 58% of body weight for men and 45% for women, split across both hands. Under a quarter of it is poor, to a half fair, to three quarters good, short of the full weight very good, the full weight excellent.' },
  { id: 'speed', name: 'Speed', kind: 'number', unit: 'min', auto: 'session', lowerIsBetter: true, target: 30,
    test: 'Time for the complete cycle, all sequences and rounds. Target: about 30 minutes once fluent.' },
  { id: 'lean', name: 'Leanness', kind: 'number', unit: '% body fat', auto: null, lowerIsBetter: true,
    test: 'Body fat percentage. The standard is 10% for men and 13% for women. Men: 20 and up is poor, 17 to 19 fair, 14 to 16 good, 11 to 13 very good. Women: 26 and up poor, 22 to 25 fair, 18 to 21 good, 14 to 17 very good.' },
  { id: 'weight', name: 'Ideal body weight', kind: 'number', unit: 'lb', auto: 'weight',
    test: 'Morning weight. Target from Table 2.1: women 104 lb at 5 ft plus 3 lb per inch, men 120 lb at 5 ft plus 5 lb per inch. Move toward it by 1% of the ideal weight a week, then hold within about 2%.' },
  { id: 'posture', name: 'Posture', kind: 'pass', auto: null,
    test: 'Stand with your back to a wall, arms raised overhead with elbows locked. Good: heels, buttocks, shoulder blades and back of the head touch the wall. Very good: the backs of the hands too. Excellent: the elbows too.' },
];

// Earlier placeholder texts. A stored copy that still matches one is replaced by the current default.
export const OLD_STANDARD_TEXTS = [
  'Full squat with heels flat on the floor and arms straight overhead. Edit this to match the book\'s test.',
  'The dumbbell weight you complete the whole program with. The book sets the target from your ideal body weight; enter it here.',
  'Body fat percentage. Enter the target from the book for your sex.',
  'Morning weight. Set your ideal body weight from the book\'s table as the target; aim for about 1% of it per week.',
  'Stand with your back to a wall: heels, calves, glutes, shoulder blades and head all touching, standing tall and relaxed. Edit to match the book\'s test.',
];

export const DEFAULT_PROGRESS = {
  standards: Object.fromEntries(STANDARDS.map((s) => [s.id, { test: s.test, target: s.target ?? null }])),
  checkins: [],   // {id, ts, values: {flex: true, strength: 4.5, ...}, note}
  weights: [],    // {id, ts, lb}
  photos: [],     // {id, ts, tag: 'front'|'side'|'back'|'other', note}  (blob under photos store key progress:<id>)
};

// A target the book fixes from sex and body weight, used when no target was typed.
// Strength: 58% (men) or 45% (women) of body weight in total, so half per hand.
// Leanness: 10% body fat for men, 13% for women.
export function autoTarget(def, settings, progress) {
  const man = settings.sex === 'm';
  if (def.id === 'lean') return man ? 10 : 13;
  if (def.id === 'strength') {
    const w = progress?.weights?.length ? progress.weights[progress.weights.length - 1].lb : null;
    if (!w) return null;
    return round05((w * (man ? 0.58 : 0.45)) / 2);
  }
  return null;
}

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

// Pounds without noise: 3, 4.5, 1.25.
export const fmtW = (x) => (Number.isInteger(x) ? String(x) : Number.isInteger(x * 2) ? x.toFixed(1) : x.toFixed(2));

// The book's figure for an exercise.
export function weightLabel(e, base) {
  const w = weightFor(e, base);
  if (w == null) return 'No weight';
  if (e.seq === 3 && e.n === 1) return `${fmtW(w)} lb, or two at ${fmtW(round05(w / 2) || w / 2)}`;
  if (e.seq === 1 && e.n === 5) return `${fmtW(w)} lb at the chin, or two at ${fmtW(w / 2)}`;
  return `${fmtW(w)} lb ${e.hands}`;
}

// ── Loads from the weights on hand ──
const usableKit = (settings) => (settings.kit || []).filter((k) => k && k.lb > 0 && k.n > 0);

// Every per-hand load the kit can make: a dumbbell, a plate, or two plates together.
function loadOptions(kit) {
  const opts = [];
  kit.forEach((it, i) => opts.push({ lb: it.lb, use: [i] }));
  const plates = kit.map((it, i) => [it, i]).filter(([it]) => it.plate);
  for (let a = 0; a < plates.length; a++) for (let b = a; b < plates.length; b++) {
    if (a === b && plates[a][0].n < 2) continue;
    opts.push({ lb: plates[a][0].lb + plates[b][0].lb, use: [plates[a][1], plates[b][1]] });
  }
  return opts;
}

// The option nearest `target` of which `hands` identical copies exist at once.
// Ties go to fewer pieces, then the lighter load.
function nearest(opts, kit, target, hands) {
  let best = null;
  for (const o of opts) {
    const counts = {};
    for (const i of o.use) counts[i] = (counts[i] || 0) + hands;
    if (Object.entries(counts).some(([i, c]) => kit[i].n < c)) continue;
    const err = Math.abs(o.lb - target);
    const better = !best || err < best.err - 1e-9
      || (Math.abs(err - best.err) < 1e-9 && (o.use.length < best.use.length || (o.use.length === best.use.length && o.lb < best.lb)));
    if (better) best = { ...o, err };
  }
  return best;
}

// What to pick up for an exercise: { target, lb, hands, items, err }. `items` is
// null when no weights are listed (then lb is the book's figure); lb is null when
// nothing listed comes close enough to count (over 1 lb off, or nothing at all).
export function loadFor(e, settings) {
  const target = weightFor(e, settings.base);
  if (target == null) return null;
  const kit = usableKit(settings);
  if (!kit.length) return { target, lb: target, hands: e.hands === 'each hand' ? 2 : 1, items: null, err: 0 };
  const opts = loadOptions(kit);
  const k = key(e);
  const two = e.hands === 'each hand';
  const pick = (t, hands) => { const b = nearest(opts, kit, t, hands); return b && { ...b, hands }; };
  let best = pick(target, two ? 2 : 1);
  if (k === '1:5' || k === '3:1') {            // one heavy dumbbell, or two at half the weight
    const alt = pick(target / 2, 2);
    if (alt && (!best || alt.err * 2 < best.err - 1e-9)) best = alt;
  }
  if (!best || best.err > 1.001) return { target, lb: null, hands: two ? 2 : 1, items: [], err: best ? best.err : null };
  return { target, lb: best.lb, hands: best.hands, items: best.use.map((i) => kit[i]), err: best.err };
}

// "a 5 lb dumbbell", "a 2.5 lb plate", "2.5 + 1.25 lb plates" (one hand's load).
function describeItems(items) {
  if (items.length === 1) return items[0].plate ? `a ${fmtW(items[0].lb)} lb plate` : `a ${fmtW(items[0].lb)} lb dumbbell`;
  return `${items.map((i) => fmtW(i.lb)).join(' + ')} lb plates`;
}

// "a 3 lb dumbbell in each hand", "a 5 lb dumbbell in both hands (book 4.5)",
// "a 1.25 lb plate in each hand (book 1.5)". The figure is always per hand.
export function loadLabel(e, settings) {
  const L = loadFor(e, settings);
  if (!L) return 'No weight';
  if (!L.items) return weightLabel(e, settings.base);
  if (L.lb == null) return `${weightLabel(e, settings.base)} (nothing close in your weights)`;
  const what = describeItems(L.items);
  const k = key(e);
  let how;
  if (e.hands === 'each hand' || L.hands === 2) how = `${what} in each hand`;
  else if (k === '1:5') how = `${what} at the chin`;
  else if (e.hands === 'one dumbbell, one arm') how = `${what} in one hand`;
  else how = `${what} in both hands`;
  const book = L.hands === 2 && e.hands !== 'each hand' ? L.target / 2 : L.target;
  return Math.abs(L.lb - book) < 0.01 ? how : `${how} (book ${fmtW(book)})`;
}

// What to have ready for a day: { items: [{ lb, n, plate?, or? }], bench }. With
// weights listed, the pieces each exercise's load uses, with how many of each at
// once (exercises run one after another, so the most any one of them needs).
// Without, the book's figures: Sitting Tower and Lying Long take one heavy
// dumbbell or two at half the weight, and `or` names the lighter pair when it is
// already needed. `bench` when a tower is at a level that squats to one (2 to 4).
export function kitFor(phaseId, settings) {
  const seqs = [...new Set(phaseById(phaseId).plan.map(([s]) => s))];
  const exs = seqs.flatMap((s) => sequence(s));
  const bench = exs.some((e) => e.n === 5 && [2, 3, 4].includes(settings.levels?.[key(e)] || 5));
  const need = new Map();
  if (usableKit(settings).length) {
    for (const e of exs) {
      const L = loadFor(e, settings);
      if (!L?.items?.length) continue;
      for (const it of new Set(L.items)) {
        const id = `${it.lb}|${it.plate ? 'p' : 'd'}`;
        const cur = need.get(id) || { lb: it.lb, n: 0, ...(it.plate ? { plate: true } : {}) };
        cur.n = Math.max(cur.n, L.items.filter((x) => x === it).length * L.hands);
        need.set(id, cur);
      }
    }
    return { items: [...need.values()].sort((a, b) => a.lb - b.lb || (a.plate ? 1 : -1)), bench };
  }
  const heavy = [];
  for (const e of exs) {
    const w = weightFor(e, settings.base);
    if (w == null) continue;
    const k = key(e);
    if (k === '1:5' || k === '3:1') heavy.push(w);
    else need.set(w, Math.max(need.get(w) || 0, e.hands === 'each hand' ? 2 : 1));
  }
  const items = [...need].map(([lb, n]) => ({ lb, n }));
  for (const w of new Set(heavy)) {
    const half = round05(w / 2);
    const item = { lb: w, n: 1 };
    if ((need.get(half) || 0) >= 2) item.or = half;
    const same = items.find((d) => d.lb === w);
    if (!same) items.push(item); else if (item.or && !same.or) same.or = item.or;
  }
  items.sort((a, b) => a.lb - b.lb);
  return { items, bench };
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
