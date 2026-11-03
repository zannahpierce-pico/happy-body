// Sync records and the last-write-wins merge. Pure functions (no DOM, no network)
// so they run under node --test.
//
// The app state is cut into small records keyed "kind:id":
//   setting:<key> or setting:<key>.<sub>   one per settings value (timer.sound, levels.1:4, base…)
//   today:today                            today's session meta
//   standard:<id>                          a Standard's editable test and target
//   checkin:<id> weight:<id> photo:<id>    progress lists (photo = metadata only)
//   history:<ts>:<type>                    program history
//   log:<id>                               workout log entries (immutable once written)
//   blob:<photo store key>                 photo files, synced through file storage
//
// Sync metadata (one object per device):
//   clock[key] = [stamp, hash]   when this device last saw the record change, and its
//                                canonical JSON (null = deleted). Log entries are only
//                                in the clock when deleted or re-added: otherwise their
//                                stamp is their own ts.
//   dirty[key] = stamp           changed here and not yet pushed.
// A remote row replaces the local record when its updated_at is >= the local stamp.
// The server applies the same rule, so every device converges on the newest write.

import { DEFAULT_SETTINGS, DEFAULT_PROGRESS } from './program.js';

const TRACKED = new Set(['setting', 'today', 'standard', 'checkin', 'weight', 'photo', 'history']);
const LISTS = { checkin: 'checkins', weight: 'weights', photo: 'photos' };
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

export const keyOf = (kind, id) => `${kind}:${id}`;
export function splitKey(key) {
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}
export const historyId = (h) => `${h.ts}:${h.type}`;

// Canonical JSON: sorted keys, so a record that round-trips through the server
// (where key order is not preserved) hashes the same.
export function canon(x) {
  if (x === undefined || x === null || typeof x !== 'object') return JSON.stringify(x ?? null);
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`;
  return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`;
}

export function emptyMeta() {
  return { v: 1, clock: {}, dirty: {}, userId: null, lastUserId: null, cursor: 0, lastSynced: null };
}

// State (minus the log) → Map of records.
export function toRecords({ settings, today, progress, history }) {
  const m = new Map();
  for (const [k, v] of Object.entries(settings || {})) {
    if (k === 'savedAt') continue;
    if (isObj(v)) for (const [sub, sv] of Object.entries(v)) m.set(keyOf('setting', `${k}.${sub}`), sv);
    else m.set(keyOf('setting', k), v);
  }
  if (today) m.set('today:today', today);
  for (const [id, v] of Object.entries(progress?.standards || {})) m.set(keyOf('standard', id), v);
  for (const [kind, list] of Object.entries(LISTS)) for (const x of progress?.[list] || []) m.set(keyOf(kind, x.id), x);
  for (const h of history || []) m.set(keyOf('history', historyId(h)), h);
  return m;
}

// Records → state, filled out with defaults.
export function fromRecords(m) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const progress = structuredClone(DEFAULT_PROGRESS);
  const history = [];
  let today = null;
  for (const [key, v] of m) {
    const [kind, id] = splitKey(key);
    if (kind === 'setting') {
      const dot = id.indexOf('.');
      if (dot < 0) settings[id] = v;
      else {
        const k = id.slice(0, dot);
        if (!isObj(settings[k])) settings[k] = {};
        settings[k][id.slice(dot + 1)] = v;
      }
    } else if (kind === 'today') today = v;
    else if (kind === 'standard') { if (progress.standards[id]) progress.standards[id] = { ...progress.standards[id], ...v }; }
    else if (LISTS[kind]) progress[LISTS[kind]].push(v);
    else if (kind === 'history') history.push(v);
  }
  for (const list of Object.values(LISTS)) progress[list].sort((a, b) => a.ts - b.ts);
  history.sort((a, b) => a.ts - b.ts);
  return { settings, today, progress, history };
}

let defaultHashes = null;
function isDefault(key, hash) {
  if (!defaultHashes) {
    defaultHashes = new Map();
    for (const [k, v] of toRecords({ settings: DEFAULT_SETTINGS, progress: DEFAULT_PROGRESS })) defaultHashes.set(k, canon(v));
  }
  return defaultHashes.get(key) === hash;
}

// First run on a device: stamp what is already here as well as we can, so that
// signing in on a fresh device never lets its defaults beat real data elsewhere.
// Defaults get 0, list items their own ts, other values the time their section was saved.
export function baselineMeta(state, savedAt = {}) {
  const meta = emptyMeta();
  for (const [key, v] of toRecords(state)) {
    const h = canon(v);
    const [kind] = splitKey(key);
    let stamp;
    if (isDefault(key, h)) stamp = 0;
    else if ((LISTS[kind] || kind === 'history') && typeof v?.ts === 'number') stamp = v.ts;
    else stamp = savedAt[kind === 'setting' ? 'settings' : kind === 'standard' ? 'progress' : 'today'] || 0;
    meta.clock[key] = [stamp, h];
  }
  return meta;
}

const next = (now, c) => Math.max(now, (c ? c[0] : -1) + 1);

// Diff the current records against the clock and stamp what changed. Mutates meta.
export function track(meta, records, now) {
  let changed = false;
  for (const [key, v] of records) {
    const h = canon(v);
    const c = meta.clock[key];
    if (c && c[1] === h) continue;
    if (!c && isDefault(key, h)) { meta.clock[key] = [0, h]; changed = true; continue; }
    const t = next(now, c);
    meta.clock[key] = [t, h];
    meta.dirty[key] = t;
    changed = true;
  }
  for (const [key, c] of Object.entries(meta.clock)) {
    if (c[1] === null || records.has(key) || !TRACKED.has(splitKey(key)[0])) continue;
    const t = next(now, c);
    meta.clock[key] = [t, null];
    meta.dirty[key] = t;
    changed = true;
  }
  return changed;
}

export function logStamp(meta, id, entry) {
  const c = meta.clock[keyOf('log', id)];
  return c ? c[0] : entry ? entry.ts : -1;
}

// Log entries added (in next, not prev) and removed (in prev, not next). Mutates meta.
export function trackLog(meta, prev, nextLog, now) {
  const before = new Map(prev.map((e) => [e.id, e]));
  const after = new Map(nextLog.map((e) => [e.id, e]));
  for (const [id, e] of after) {
    if (before.has(id)) continue;
    const key = keyOf('log', id);
    const c = meta.clock[key];
    if (c) { const t = next(now, c); meta.clock[key] = [t, 'L']; meta.dirty[key] = t; } // re-added after a delete
    else meta.dirty[key] = e.ts;
  }
  for (const [id, e] of before) {
    if (after.has(id)) continue;
    const key = keyOf('log', id);
    const t = Math.max(now, logStamp(meta, id, e) + 1);
    meta.clock[key] = [t, null];
    meta.dirty[key] = t;
  }
}

// A photo file was stored (or deleted, blobType null) on this device. Mutates meta.
export function trackBlob(meta, photoKey, blobType, now) {
  const key = keyOf('blob', photoKey);
  const t = next(now, meta.clock[key]);
  meta.clock[key] = [t, blobType ? 'B' : null];
  meta.dirty[key] = t;
  return t;
}

// Everything this device knows about, marked for pushing (on sign-in).
export function markAllDirty(meta, log) {
  for (const [key, c] of Object.entries(meta.clock)) if (c[0] > 0 || c[1] === null) meta.dirty[key] = c[0];
  for (const e of log) meta.dirty[keyOf('log', e.id)] = logStamp(meta, e.id, e);
}

// Rows to push (photo files excluded: they need an upload first).
export function pendingRows(meta, records, logById) {
  const rows = [];
  for (const [key, stamp] of Object.entries(meta.dirty)) {
    const [kind, id] = splitKey(key);
    if (kind === 'blob') continue;
    const data = kind === 'log' ? logById.get(id) : records.get(key);
    rows.push({ kind, id, data: data === undefined ? null : data, deleted: data === undefined, updated_at: stamp });
  }
  return rows;
}

// The server has these rows: clear them from dirty unless they changed again meanwhile.
export function ackPushed(meta, rows) {
  for (const r of rows) {
    const key = keyOf(r.kind, r.id);
    if (meta.dirty[key] === r.updated_at) delete meta.dirty[key];
  }
}

const validRow = (r) => {
  if (!r || typeof r.kind !== 'string' || typeof r.id !== 'string' || typeof r.updated_at !== 'number') return false;
  if (r.deleted) return true;
  if (r.kind === 'log' || LISTS[r.kind] || r.kind === 'history') return isObj(r.data) && typeof r.data.ts === 'number' && (r.kind === 'history' || r.data.id === r.id);
  if (r.kind === 'today' || r.kind === 'standard') return isObj(r.data);
  if (r.kind === 'blob') return isObj(r.data);
  return r.kind === 'setting';
};

// Merge pulled rows into local records (Map key → data) and log (Map id → entry).
// Returns new maps plus the photo files to download or remove. Mutates meta.
export function applyRemote(meta, records, logById, rows) {
  const recs = new Map(records);
  const log = new Map(logById);
  const out = { records: recs, log, changed: false, logPut: [], logDel: [], fetch: [], remove: [] };
  for (const r of rows) {
    if (!validRow(r)) continue;
    const key = keyOf(r.kind, r.id);
    const h = r.deleted ? null : canon(r.data);
    if (r.kind === 'blob') {
      const c = meta.clock[key];
      if (c && (r.updated_at < c[0] || (r.updated_at === c[0] && (c[1] === null) === !!r.deleted))) continue;
      if (r.deleted) out.remove.push({ id: r.id, updated_at: r.updated_at });
      else out.fetch.push({ id: r.id, updated_at: r.updated_at, data: r.data });
      continue;
    }
    if (r.kind === 'log') {
      const local = log.get(r.id);
      const stamp = logStamp(meta, r.id, local);
      if (r.updated_at < stamp) continue;
      delete meta.dirty[key];
      if (r.deleted) {
        meta.clock[key] = [r.updated_at, null];
        if (local) { log.delete(r.id); out.logDel.push(r.id); out.changed = true; }
      } else {
        if (r.updated_at === r.data.ts) delete meta.clock[key]; else meta.clock[key] = [r.updated_at, 'L'];
        if (!local || canon(local) !== h) { log.set(r.id, r.data); out.logPut.push(r.data); out.changed = true; }
      }
      continue;
    }
    if (!TRACKED.has(r.kind)) continue;
    const c = meta.clock[key];
    if (c && r.updated_at < c[0]) continue;
    const cur = recs.has(key) ? canon(recs.get(key)) : null;
    meta.clock[key] = [r.updated_at, h];
    delete meta.dirty[key];
    if (cur === h) continue;
    if (r.deleted) recs.delete(key); else recs.set(key, r.data);
    out.changed = true;
  }
  return out;
}
