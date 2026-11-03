import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, DEFAULT_PROGRESS } from '../js/program.js';
import {
  canon, keyOf, splitKey, toRecords, fromRecords, baselineMeta, track, trackLog, trackBlob,
  markAllDirty, pendingRows, ackPushed, applyRemote, emptyMeta,
} from '../js/merge.js';

// ── A tiny in-memory model of the server and of devices ─────────────────
// The server applies the same rule as the SQL trigger: an older write never
// replaces a newer one. Stored data has its keys reordered, as jsonb does.
const reorder = (x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).reverse().map((k) => [k, reorder(x[k])]))
  : Array.isArray(x) ? x.map(reorder) : x);

function server() { return new Map(); }
function serverPut(srv, r) {
  const k = keyOf(r.kind, r.id);
  const old = srv.get(k);
  if (old && r.updated_at < old.updated_at) return;
  srv.set(k, { kind: r.kind, id: r.id, data: reorder(r.data), deleted: r.deleted, updated_at: r.updated_at });
}

function freshState() {
  return { settings: structuredClone(DEFAULT_SETTINGS), today: null, progress: structuredClone(DEFAULT_PROGRESS), history: [], log: [] };
}
function device(state = freshState(), savedAt = {}) {
  const meta = baselineMeta(state, savedAt);
  return { state, meta };
}
const logMap = (log) => new Map(log.map((e) => [e.id, e]));
function edit(dev, fn, now) { fn(dev.state); track(dev.meta, toRecords(dev.state), now); }
function addLog(dev, e) { dev.state.log.push(e); trackLog(dev.meta, [], [e], e.ts); }
function delLog(dev, id, now) {
  const e = dev.state.log.find((x) => x.id === id);
  dev.state.log = dev.state.log.filter((x) => x.id !== id);
  trackLog(dev.meta, [e], [], now);
}
function signIn(dev, uid) { dev.meta.userId = uid; dev.meta.lastUserId = uid; markAllDirty(dev.meta, dev.state.log); }
// One sync cycle, as sync.js runs it: pull and merge, then push what is dirty.
function sync(dev, srv, now = 1e13) {
  const res = applyRemote(dev.meta, toRecords(dev.state), logMap(dev.state.log), [...srv.values()]);
  if (res.changed) {
    Object.assign(dev.state, fromRecords(res.records));
    dev.state.log = [...res.log.values()].sort((a, b) => a.ts - b.ts);
    track(dev.meta, toRecords(dev.state), now);
  }
  const rows = pendingRows(dev.meta, toRecords(dev.state), logMap(dev.state.log));
  for (const r of rows) serverPut(srv, r);
  ackPushed(dev.meta, rows);
  return res;
}

// ── Records ─────────────────────────────────────────────────────────────
test('canon ignores key order and undefined', () => {
  assert.equal(canon({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }), canon({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1, z: undefined }));
  assert.notEqual(canon({ a: 1 }), canon({ a: '1' }));
  assert.equal(canon(undefined), 'null');
});

test('splitKey keeps colons in ids', () => {
  assert.deepEqual(splitKey('blob:1:4:level:2'), ['blob', '1:4:level:2']);
  assert.deepEqual(splitKey('setting:levels.1:4'), ['setting', 'levels.1:4']);
});

test('state round-trips through records', () => {
  const s = freshState();
  s.settings.base = 7; s.settings.levels['2:3'] = 2; s.settings.timer.sound = false;
  s.today = { day: '2026-11-03', startedAt: 5 };
  s.progress.standards.lean.target = 22;
  s.progress.weights.push({ id: 'w2', ts: 20, lb: 150 }, { id: 'w1', ts: 10, lb: 151 });
  s.history.push({ ts: 3, type: 'base', from: 3, to: 7 });
  const recs = toRecords(s);
  assert.equal(recs.get('setting:base'), 7);
  assert.equal(recs.get('setting:levels.2:3'), 2);
  assert.equal(recs.get('setting:timer.sound'), false);
  assert.ok(recs.has('history:3:base'));
  const back = fromRecords(recs);
  assert.equal(back.settings.base, 7);
  assert.equal(back.settings.levels['2:3'], 2);
  assert.equal(back.settings.levels['1:1'], 5);
  assert.equal(back.settings.timer.sound, false);
  assert.deepEqual(back.today, s.today);
  assert.equal(back.progress.standards.lean.target, 22);
  assert.deepEqual(back.progress.weights.map((w) => w.id), ['w1', 'w2']);
  assert.deepEqual(back.history, s.history);
});

// ── Local change tracking ───────────────────────────────────────────────
test('baseline: defaults stamp 0, list items their ts, settings their save time', () => {
  const s = freshState();
  s.settings.base = 6;
  s.progress.checkins.push({ id: 'c1', ts: 111, values: { flex: true } });
  const m = baselineMeta(s, { settings: 999 });
  assert.deepEqual(m.clock['setting:reps'][0], 0);
  assert.equal(m.clock['setting:base'][0], 999);
  assert.equal(m.clock['checkin:c1'][0], 111);
  assert.deepEqual(m.dirty, {});
});

test('track stamps changes and deletions, leaves the rest alone', () => {
  const d = device();
  edit(d, (s) => { s.settings.base = 4; s.progress.weights.push({ id: 'w1', ts: 50, lb: 140 }); }, 100);
  assert.deepEqual(d.meta.dirty, { 'setting:base': 100, 'weight:w1': 100 });
  assert.equal(track(d.meta, toRecords(d.state), 200), false, 'no change, no stamp');
  edit(d, (s) => { s.progress.weights = []; }, 300);
  assert.deepEqual(d.meta.clock['weight:w1'], [300, null]);
  assert.equal(d.meta.dirty['weight:w1'], 300);
});

test('a local edit always gets a newer stamp than the version it replaces', () => {
  const d = device();
  d.meta.clock['setting:base'] = [5000, canon(3)]; // pulled from a device whose clock runs ahead
  edit(d, (s) => { s.settings.base = 9; }, 1000);
  assert.equal(d.meta.clock['setting:base'][0], 5001);
});

test('ackPushed keeps a record that changed again during the push', () => {
  const d = device();
  edit(d, (s) => { s.settings.base = 4; }, 100);
  const rows = pendingRows(d.meta, toRecords(d.state), logMap(d.state.log));
  edit(d, (s) => { s.settings.base = 5; }, 200);
  ackPushed(d.meta, rows);
  assert.equal(d.meta.dirty['setting:base'], 200);
});

test('log: added entries push with their own ts, deletes as tombstones', () => {
  const d = device();
  addLog(d, { id: 'e1', ts: 10, key: '1:1' });
  assert.equal(d.meta.dirty['log:e1'], 10);
  assert.equal(d.meta.clock['log:e1'], undefined);
  delLog(d, 'e1', 50);
  assert.deepEqual(d.meta.clock['log:e1'], [50, null]);
  const rows = pendingRows(d.meta, toRecords(d.state), logMap(d.state.log));
  assert.deepEqual(rows, [{ kind: 'log', id: 'e1', data: null, deleted: true, updated_at: 50 }]);
});

// ── Merging pulled rows ─────────────────────────────────────────────────
test('newer remote wins, older remote loses, same data is a no-op', () => {
  const d = device();
  edit(d, (s) => { s.settings.base = 4; }, 100);
  let res = applyRemote(d.meta, toRecords(d.state), new Map(), [{ kind: 'setting', id: 'base', data: 8, deleted: false, updated_at: 50 }]);
  assert.equal(res.changed, false);
  assert.equal(d.meta.dirty['setting:base'], 100, 'still waiting to push');
  res = applyRemote(d.meta, toRecords(d.state), new Map(), [{ kind: 'setting', id: 'base', data: 9, deleted: false, updated_at: 150 }]);
  assert.equal(res.changed, true);
  assert.equal(res.records.get('setting:base'), 9);
  assert.equal(d.meta.dirty['setting:base'], undefined);
  res = applyRemote(d.meta, res.records, new Map(), [{ kind: 'setting', id: 'base', data: 9, deleted: false, updated_at: 150 }]);
  assert.equal(res.changed, false);
});

test('remote deletes remove records and log entries', () => {
  const d = device();
  edit(d, (s) => { s.progress.checkins.push({ id: 'c1', ts: 10, values: {} }); }, 10);
  addLog(d, { id: 'e1', ts: 20 });
  const res = applyRemote(d.meta, toRecords(d.state), logMap(d.state.log), [
    { kind: 'checkin', id: 'c1', data: null, deleted: true, updated_at: 30 },
    { kind: 'log', id: 'e1', data: null, deleted: true, updated_at: 40 },
  ]);
  assert.equal(res.records.has('checkin:c1'), false);
  assert.equal(res.log.has('e1'), false);
  assert.deepEqual(res.logDel, ['e1']);
  assert.deepEqual(d.meta.dirty, {});
});

test('a local delete beats the older remote entry', () => {
  const d = device();
  addLog(d, { id: 'e1', ts: 20 });
  delLog(d, 'e1', 60);
  const res = applyRemote(d.meta, toRecords(d.state), logMap(d.state.log), [{ kind: 'log', id: 'e1', data: { id: 'e1', ts: 20 }, deleted: false, updated_at: 20 }]);
  assert.equal(res.log.has('e1'), false);
  assert.equal(d.meta.dirty['log:e1'], 60);
});

test('malformed or unknown rows are ignored', () => {
  const d = device();
  const res = applyRemote(d.meta, toRecords(d.state), new Map(), [
    { kind: 'log', id: 'x', data: { id: 'other', ts: 1 }, deleted: false, updated_at: 5 },
    { kind: 'weight', id: 'w', data: 'nope', deleted: false, updated_at: 5 },
    { kind: 'mystery', id: 'm', data: {}, deleted: false, updated_at: 5 },
    { kind: 'setting', id: 'base', data: 4, deleted: false, updated_at: '5' },
    null,
  ]);
  assert.equal(res.changed, false);
  assert.equal(res.log.size, 0);
});

test('photo files: download newer, remove deleted, skip what this device already has', () => {
  const d = device();
  trackBlob(d.meta, 'progress:p1', 'image/jpeg', 100);
  let res = applyRemote(d.meta, new Map(), new Map(), [
    { kind: 'blob', id: 'progress:p1', data: { path: 'u/p1' }, deleted: false, updated_at: 100 },
    { kind: 'blob', id: 'progress:p2', data: { path: 'u/p2' }, deleted: false, updated_at: 90 },
    { kind: 'blob', id: '1:4:level:2', data: null, deleted: true, updated_at: 95 },
  ]);
  assert.deepEqual(res.fetch.map((f) => f.id), ['progress:p2']);
  assert.deepEqual(res.remove.map((f) => f.id), ['1:4:level:2']);
  res = applyRemote(d.meta, new Map(), new Map(), [{ kind: 'blob', id: 'progress:p1', data: { path: 'u/p1' }, deleted: false, updated_at: 200 }]);
  assert.deepEqual(res.fetch.map((f) => f.id), ['progress:p1']);
  assert.deepEqual(pendingRows(d.meta, new Map(), new Map()), [], 'files are not pushed as plain rows');
});

// ── Devices end to end ──────────────────────────────────────────────────
test('two devices converge: different fields both survive, same field newest wins', () => {
  const srv = server();
  const phone = device(); const laptop = device();
  signIn(phone, 'u'); signIn(laptop, 'u');
  edit(phone, (s) => { s.settings.base = 5; s.settings.levels['1:2'] = 3; }, 1000);
  edit(laptop, (s) => { s.settings.reps = 3; s.settings.levels['1:2'] = 4; }, 2000);
  addLog(phone, { id: 'p1', ts: 1100, key: '1:1' });
  addLog(laptop, { id: 'l1', ts: 2100, key: '1:2' });
  // Laptop syncs first even though the phone's edit is older.
  sync(laptop, srv); sync(phone, srv); sync(laptop, srv);
  for (const d of [phone, laptop]) {
    assert.equal(d.state.settings.base, 5);
    assert.equal(d.state.settings.reps, 3);
    assert.equal(d.state.settings.levels['1:2'], 4, 'later write wins');
    assert.deepEqual(d.state.log.map((e) => e.id), ['p1', 'l1']);
    assert.deepEqual(d.meta.dirty, {});
  }
  // Nothing left to do: another round changes nothing.
  assert.equal(sync(phone, srv).changed, false);
  assert.equal(sync(laptop, srv).changed, false);
});

test('a delete on one device reaches the other', () => {
  const srv = server();
  const a = device(); const b = device();
  signIn(a, 'u'); signIn(b, 'u');
  addLog(a, { id: 'e1', ts: 100 });
  edit(a, (s) => { s.progress.weights.push({ id: 'w1', ts: 100, lb: 150 }); }, 100);
  sync(a, srv); sync(b, srv);
  assert.equal(b.state.log.length, 1);
  delLog(b, 'e1', 500);
  edit(b, (s) => { s.progress.weights = []; }, 500);
  sync(b, srv); sync(a, srv);
  assert.equal(a.state.log.length, 0);
  assert.equal(a.state.progress.weights.length, 0);
});

test('signing in on a fresh device never overwrites the account with defaults', () => {
  const srv = server();
  const phone = device();
  signIn(phone, 'u');
  edit(phone, (s) => { s.settings.base = 8; s.settings.phase = 'w3'; s.progress.standards.lean.target = 20; }, 1000);
  sync(phone, srv);
  // A new laptop: first launch writes its defaults much later than the phone's edits.
  const laptop = device(freshState(), { settings: 9e12, progress: 9e12 });
  signIn(laptop, 'u');
  sync(laptop, srv);
  assert.equal(laptop.state.settings.base, 8);
  assert.equal(laptop.state.settings.phase, 'w3');
  assert.equal(laptop.state.progress.standards.lean.target, 20);
  assert.equal(srv.get('setting:base').data, 8);
});

test('data made offline before signing in is added to the account', () => {
  const srv = server();
  const phone = device();
  signIn(phone, 'u');
  addLog(phone, { id: 'p1', ts: 100 });
  sync(phone, srv);
  const s = freshState();
  s.log.push({ id: 'old1', ts: 50 });
  s.progress.weights.push({ id: 'w1', ts: 60, lb: 150 });
  const laptop = device(s);
  signIn(laptop, 'u');
  sync(laptop, srv); sync(phone, srv);
  assert.deepEqual(phone.state.log.map((e) => e.id), ['old1', 'p1']);
  assert.equal(phone.state.progress.weights.length, 1);
});

test('emptyMeta starts signed out with nothing pending', () => {
  assert.deepEqual(emptyMeta(), { v: 1, clock: {}, dirty: {}, userId: null, lastUserId: null, cursor: 0, lastSynced: null });
});
