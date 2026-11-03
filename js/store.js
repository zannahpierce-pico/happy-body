// Persistent state. IndexedDB is the primary store; localStorage mirrors settings,
// the workout log and history so that data survives IndexedDB being unavailable,
// corrupted or wiped. All writes are serialised through a queue and awaited to
// transaction completion before the UI is told "saved". Photos live only in IDB
// (too large for localStorage) but are included in export files.
// Every change is also stamped into the sync metadata (see merge.js) so that
// sync.js can push it to the signed-in account and merge back what other devices wrote.

import { DEFAULT_SETTINGS, DEFAULT_PROGRESS } from './program.js';
import * as merge from './merge.js';

const DB_NAME = 'happybody';
const DB_VERSION = 1;
const LS = { settings: 'hb.settings', log: 'hb.log', history: 'hb.history', today: 'hb.today', progress: 'hb.progress', sync: 'hb.sync' };

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('log')) {
        const s = db.createObjectStore('log', { keyPath: 'id' });
        s.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

const txDone = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error || new Error('transaction failed'));
  tx.onabort = () => rej(tx.error || new Error('transaction aborted'));
});
const reqDone = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

function lsGet(k) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}

// Of two saved copies, the one saved last.
function newer(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return (b.savedAt || 0) > (a.savedAt || 0) ? b : a;
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
      ? deepMerge(base[k], v) : v;
  }
  return out;
}

class Store {
  constructor() {
    this.db = null;
    this.mode = 'init';        // 'idb' | 'ls' (fallback)
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.log = [];             // sorted by ts
    this.history = [];         // {ts, type, ...}
    this.today = null;         // {day, startedAt, relaxDoneAt, finishedAt}
    this.progress = structuredClone(DEFAULT_PROGRESS); // standards, check-ins, weigh-ins, progress photo metadata
    this.status = { lastSaved: null, error: null, pending: 0 };
    this.syncMeta = merge.emptyMeta(); // clock and dirty set for sync, see merge.js
    this.savedAt = {};         // when each section was last saved, for the first sync baseline
    this.listeners = new Set();
    this.queue = Promise.resolve();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) { try { fn(what, this); } catch (e) { console.error(e); } } }

  async init() {
    try {
      this.db = await openDB();
      this.mode = 'idb';
    } catch (e) {
      console.warn('IndexedDB unavailable, using localStorage only', e);
      this.mode = 'ls';
    }
    await this.loadAndReconcile();
    await this.loadSyncMeta();
    try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* ignore */ }
    return this;
  }

  async idbGetAll(storeName) {
    const tx = this.db.transaction(storeName, 'readonly');
    const rows = await reqDone(tx.objectStore(storeName).getAll());
    return rows;
  }
  async idbGetAllKeys(storeName) {
    const tx = this.db.transaction(storeName, 'readonly');
    return reqDone(tx.objectStore(storeName).getAllKeys());
  }
  async idbKv(key) {
    const tx = this.db.transaction('kv', 'readonly');
    return reqDone(tx.objectStore('kv').get(key));
  }

  // Load both copies, keep the newest, and repair the other.
  async loadAndReconcile() {
    let idb = { settings: null, log: null, history: null, today: null, progress: null };
    if (this.mode === 'idb') {
      try {
        idb.settings = await this.idbKv('settings');
        idb.history = await this.idbKv('history');
        idb.today = await this.idbKv('today');
        idb.progress = await this.idbKv('progress');
        idb.log = await this.idbGetAll('log');
      } catch (e) {
        console.warn('IndexedDB read failed', e);
        this.mode = 'ls';
      }
    }
    const ls = {
      settings: lsGet(LS.settings), log: lsGet(LS.log), history: lsGet(LS.history), today: lsGet(LS.today), progress: lsGet(LS.progress),
    };

    const pick = newer;

    const settings = pick(idb.settings, ls.settings);
    this.settings = settings ? deepMerge(structuredClone(DEFAULT_SETTINGS), settings) : structuredClone(DEFAULT_SETTINGS);
    delete this.settings.savedAt;

    const history = pick(idb.history, ls.history);
    this.history = history?.items || [];

    const progress = pick(idb.progress, ls.progress);
    this.progress = progress ? normalizeProgress(progress) : structuredClone(DEFAULT_PROGRESS);

    this.savedAt = { settings: settings?.savedAt, progress: progress?.savedAt, today: null };
    const todayMeta = pick(idb.today, ls.today);
    this.savedAt.today = todayMeta?.savedAt;
    this.today = todayMeta && todayMeta.day ? { ...todayMeta } : null;
    if (this.today) delete this.today.savedAt;

    // Log: union by id (a lost write on one side must not lose an entry).
    const byId = new Map();
    for (const e of idb.log || []) byId.set(e.id, e);
    for (const e of ls.log?.items || []) if (!byId.has(e.id)) byId.set(e.id, e);
    this.log = [...byId.values()].sort((a, b) => a.ts - b.ts);

    // Repair whichever side was stale/missing.
    const idbLogCount = (idb.log || []).length;
    const lsLogCount = (ls.log?.items || []).length;
    const needsRepair = this.mode === 'idb' && (
      !idb.settings || !idb.history || idbLogCount !== this.log.length || lsLogCount !== this.log.length || !ls.settings || !idb.progress || !ls.progress
    );
    if (needsRepair) {
      await this.enqueue(async () => {
        if (this.mode === 'idb') {
          const tx = this.db.transaction(['kv', 'log'], 'readwrite');
          tx.objectStore('kv').put({ ...this.settings, savedAt: Date.now() }, 'settings');
          tx.objectStore('kv').put({ items: this.history, savedAt: Date.now() }, 'history');
          if (this.today) tx.objectStore('kv').put({ ...this.today, savedAt: Date.now() }, 'today');
          tx.objectStore('kv').put({ ...this.progress, savedAt: Date.now() }, 'progress');
          const ls_ = tx.objectStore('log');
          for (const e of this.log) ls_.put(e);
          await txDone(tx);
        }
        this.mirrorAll();
      }).catch((e) => console.warn('repair failed', e));
    } else if (this.mode === 'ls') {
      this.mirrorAll();
    }
  }

  // Sync metadata lives beside the data. The first launch with sync support stamps
  // whatever is already here (see merge.baselineMeta).
  async loadSyncMeta() {
    let idbMeta = null;
    if (this.mode === 'idb') { try { idbMeta = await this.idbKv('sync'); } catch { /* rebuilt below */ } }
    const saved = newer(idbMeta, lsGet(LS.sync));
    if (saved?.v === 1 && saved.clock && saved.dirty) {
      this.syncMeta = { ...merge.emptyMeta(), ...saved };
      delete this.syncMeta.savedAt;
      return;
    }
    this.syncMeta = merge.baselineMeta(this, this.savedAt);
    if (this.mode === 'idb') {
      try {
        const tx = this.db.transaction('photos', 'readonly');
        const keys = await reqDone(tx.objectStore('photos').getAllKeys());
        const rows = await reqDone(tx.objectStore('photos').getAll());
        keys.forEach((k, i) => { this.syncMeta.clock[merge.keyOf('blob', k)] = [rows[i]?.updatedAt || 1, 'B']; });
      } catch (e) { console.warn('photo baseline failed', e); }
    }
    this.saveMeta();
  }

  saveMeta() {
    return this.enqueue(async () => {
      const stamped = { ...this.syncMeta, savedAt: Date.now() };
      let idbOk = false;
      if (this.mode === 'idb') {
        try { const tx = this.db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(stamped, 'sync'); await txDone(tx); idbOk = true; }
        catch (e) { console.warn('IDB sync meta write failed', e); }
      }
      if (!lsSet(LS.sync, stamped) && !idbOk) throw new Error('Could not save to this device');
    }).catch(() => {});
  }

  // Stamp whatever changed in settings, today, progress or history since the last call.
  track() {
    if (merge.track(this.syncMeta, merge.toRecords(this), Date.now())) { this.saveMeta(); this.emit('dirty'); }
  }
  trackLog(prev, next) {
    merge.trackLog(this.syncMeta, prev, next, Date.now());
    this.saveMeta(); this.emit('dirty');
  }

  mirrorAll() {
    const now = Date.now();
    lsSet(LS.settings, { ...this.settings, savedAt: now });
    lsSet(LS.history, { items: this.history, savedAt: now });
    lsSet(LS.today, this.today ? { ...this.today, savedAt: now } : null);
    lsSet(LS.progress, { ...this.progress, savedAt: now });
    lsSet(LS.log, { items: this.log, savedAt: now });
  }

  // Serialised write with status reporting.
  enqueue(fn) {
    this.status.pending++;
    const run = this.queue.then(fn).then(
      (r) => { this.status.lastSaved = Date.now(); this.status.error = null; return r; },
      (e) => { console.error('save failed', e); this.status.error = e?.message || String(e); throw e; },
    ).finally(() => { this.status.pending--; this.emit('status'); });
    this.queue = run.catch(() => {});
    return run;
  }

  async writeKv(key, value, lsKey) {
    const stamped = value == null ? null : { ...value, savedAt: Date.now() };
    return this.enqueue(async () => {
      let idbOk = false;
      if (this.mode === 'idb') {
        try {
          const tx = this.db.transaction('kv', 'readwrite');
          if (stamped == null) tx.objectStore('kv').delete(key); else tx.objectStore('kv').put(stamped, key);
          await txDone(tx);
          idbOk = true;
        } catch (e) { console.warn('IDB write failed, relying on localStorage', e); }
      }
      const lsOk = lsSet(lsKey, stamped);
      if (!idbOk && !lsOk) throw new Error('Could not save to this device');
    });
  }

  // ── Settings ──
  async setSettings(patch, historyNote) {
    const prev = this.settings;
    this.settings = deepMerge(this.settings, patch);
    if (historyNote) this.history.push({ ts: Date.now(), ...historyNote });
    this.emit('settings');
    this.track();
    try {
      await this.writeKv('settings', this.settings, LS.settings);
      if (historyNote) await this.writeKv('history', { items: this.history }, LS.history);
    } catch (e) { this.settings = prev; this.emit('settings'); this.track(); throw e; }
  }

  // Progress: pass a function that returns the next progress object (immutable update).
  async updateProgress(fn, what = 'progress') {
    const prev = this.progress;
    this.progress = normalizeProgress(fn(structuredClone(prev)));
    this.emit(what);
    this.track();
    try { await this.writeKv('progress', this.progress, LS.progress); }
    catch (e) { this.progress = prev; this.emit(what); this.track(); throw e; }
  }

  async setToday(meta) {
    this.today = meta ? { ...meta } : null;
    this.emit('today');
    this.track();
    await this.writeKv('today', this.today, LS.today);
  }

  // ── Log ──
  async addEntry(entry) {
    const e = { id: uid(), ts: Date.now(), ...entry };
    this.log.push(e);
    this.log.sort((a, b) => a.ts - b.ts);
    this.emit('log');
    this.trackLog([], [e]);
    await this.enqueue(async () => {
      let idbOk = false;
      if (this.mode === 'idb') {
        try { const tx = this.db.transaction('log', 'readwrite'); tx.objectStore('log').put(e); await txDone(tx); idbOk = true; }
        catch (err) { console.warn('IDB log write failed', err); }
      }
      const lsOk = lsSet(LS.log, { items: this.log, savedAt: Date.now() });
      if (!idbOk && !lsOk) throw new Error('Could not save to this device');
    });
    return e;
  }

  async deleteEntries(ids) {
    const set = new Set(ids);
    const removed = this.log.filter((e) => set.has(e.id));
    this.log = this.log.filter((e) => !set.has(e.id));
    this.emit('log');
    this.trackLog(removed, []);
    await this.enqueue(async () => {
      let idbOk = false;
      if (this.mode === 'idb') {
        try {
          const tx = this.db.transaction('log', 'readwrite');
          for (const id of set) tx.objectStore('log').delete(id);
          await txDone(tx); idbOk = true;
        } catch (err) { console.warn('IDB log delete failed', err); }
      }
      const lsOk = lsSet(LS.log, { items: this.log, savedAt: Date.now() });
      if (!idbOk && !lsOk) throw new Error('Could not save to this device');
    });
  }

  entriesForDay(day) {
    // day = YYYY-MM-DD local
    const out = [];
    for (const e of this.log) {
      const d = new Date(e.ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (key === day) out.push(e);
    }
    return out;
  }

  // ── Photos (IDB only) ──
  async setPhoto(key, blob) {
    if (this.mode !== 'idb') throw new Error('Photos need IndexedDB, which is unavailable on this device');
    await this.enqueue(async () => {
      const tx = this.db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put({ blob, type: blob.type, updatedAt: Date.now() }, key);
      await txDone(tx);
    });
    merge.trackBlob(this.syncMeta, key, blob.type || 'image/jpeg', Date.now());
    this.saveMeta();
    this.emit('photos');
    this.emit('dirty');
  }
  async getPhoto(key) {
    if (this.mode !== 'idb') return null;
    try { const tx = this.db.transaction('photos', 'readonly'); return await reqDone(tx.objectStore('photos').get(key)); }
    catch { return null; }
  }
  async deletePhoto(key) {
    if (this.mode !== 'idb') return;
    await this.enqueue(async () => {
      const tx = this.db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(key);
      await txDone(tx);
    });
    merge.trackBlob(this.syncMeta, key, null, Date.now());
    this.saveMeta();
    this.emit('photos');
    this.emit('dirty');
  }
  async photoKeys() {
    if (this.mode !== 'idb') return [];
    try { return await this.idbGetAllKeys('photos'); } catch { return []; }
  }

  // ── Backup ──
  async exportData() {
    const photos = {};
    for (const k of await this.photoKeys()) {
      const p = await this.getPhoto(k);
      if (p?.blob) photos[k] = { type: p.type, updatedAt: p.updatedAt, data: await blobToDataURL(p.blob) };
    }
    return {
      app: 'happy-body', format: 1, exportedAt: new Date().toISOString(),
      settings: this.settings, history: this.history, today: this.today, log: this.log, photos, progress: this.progress,
    };
  }

  // mode: 'replace' wipes local data first; 'merge' unions log entries and photos, keeps newer settings.
  async importData(data, mode = 'merge') {
    if (!data || data.app !== 'happy-body' || !Array.isArray(data.log)) throw new Error('Not a Happy Body backup file');
    const prevLog = this.log;
    const prevPhotos = mode === 'replace' ? await this.photoKeys() : [];
    if (mode === 'replace') {
      this.log = [];
      this.history = [];
      if (this.mode === 'idb') {
        await this.enqueue(async () => {
          const tx = this.db.transaction(['kv', 'log', 'photos'], 'readwrite');
          tx.objectStore('kv').clear(); tx.objectStore('log').clear(); tx.objectStore('photos').clear();
          await txDone(tx);
        });
      }
    }
    const byId = new Map(this.log.map((e) => [e.id, e]));
    for (const e of data.log) if (e && e.id && typeof e.ts === 'number' && !byId.has(e.id)) byId.set(e.id, e);
    this.log = [...byId.values()].sort((a, b) => a.ts - b.ts);
    const seen = new Set(this.history.map((h) => `${h.ts}:${h.type}`));
    for (const h of data.history || []) if (h && !seen.has(`${h.ts}:${h.type}`)) this.history.push(h);
    this.history.sort((a, b) => a.ts - b.ts);
    if (data.settings && (mode === 'replace' || !this.settings.programStart)) {
      this.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), data.settings);
      delete this.settings.savedAt;
    }
    if (data.today && mode === 'replace') this.today = data.today;
    if (data.progress) {
      if (mode === 'replace') this.progress = normalizeProgress(data.progress);
      else {
        const p = this.progress, q = normalizeProgress(data.progress);
        const mergeList = (a, b) => { const ids = new Set(a.map((x) => x.id)); return [...a, ...b.filter((x) => x && x.id && !ids.has(x.id))].sort((x, y) => x.ts - y.ts); };
        this.progress = { ...p, checkins: mergeList(p.checkins, q.checkins), weights: mergeList(p.weights, q.weights), photos: mergeList(p.photos, q.photos) };
      }
    }
    const now = Date.now();
    merge.trackLog(this.syncMeta, prevLog, this.log, now);
    merge.track(this.syncMeta, merge.toRecords(this), now);
    for (const k of prevPhotos) if (!data.photos?.[k]) merge.trackBlob(this.syncMeta, k, null, now);
    for (const [k, p] of Object.entries(data.photos || {})) merge.trackBlob(this.syncMeta, k, p.type || 'image/jpeg', now);
    this.saveMeta();

    await this.enqueue(async () => {
      if (this.mode === 'idb') {
        const tx = this.db.transaction(['kv', 'log', 'photos'], 'readwrite');
        tx.objectStore('kv').put({ ...this.settings, savedAt: Date.now() }, 'settings');
        tx.objectStore('kv').put({ items: this.history, savedAt: Date.now() }, 'history');
        if (this.today) tx.objectStore('kv').put({ ...this.today, savedAt: Date.now() }, 'today');
        tx.objectStore('kv').put({ ...this.progress, savedAt: Date.now() }, 'progress');
        for (const e of this.log) tx.objectStore('log').put(e);
        for (const [k, p] of Object.entries(data.photos || {})) {
          try { tx.objectStore('photos').put({ blob: dataURLToBlob(p.data), type: p.type, updatedAt: p.updatedAt || Date.now() }, k); }
          catch (e) { console.warn('photo import skipped', k, e); }
        }
        await txDone(tx);
      }
      this.mirrorAll();
    });
    this.emit('import');
    this.emit('dirty');
  }

  // Erases this device only. The caller signs out of sync first, so the account keeps its copy.
  async wipe() {
    this.log = []; this.history = []; this.today = null;
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.progress = structuredClone(DEFAULT_PROGRESS);
    await this.enqueue(async () => {
      if (this.mode === 'idb') {
        const tx = this.db.transaction(['kv', 'log', 'photos'], 'readwrite');
        tx.objectStore('kv').clear(); tx.objectStore('log').clear(); tx.objectStore('photos').clear();
        await txDone(tx);
      }
      for (const k of Object.values(LS)) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
    });
    const lastUserId = this.syncMeta.lastUserId;
    this.syncMeta = { ...merge.baselineMeta(this), lastUserId };
    this.saveMeta();
    this.emit('import');
  }

  // ── Sync (driven by sync.js) ──
  get hasData() {
    const p = this.progress;
    return this.log.length > 0 || p.checkins.length > 0 || p.weights.length > 0 || p.photos.length > 0;
  }
  get syncPending() { return Object.keys(this.syncMeta.dirty).length; }

  // Signing in marks everything here for pushing; the server keeps whichever copy is newer.
  setSyncUser(userId) {
    const m = this.syncMeta;
    m.userId = userId || null;
    m.cursor = 0;
    if (userId) { m.lastUserId = userId; merge.markAllDirty(m, this.log); }
    else { m.dirty = {}; m.lastSynced = null; }
    this.saveMeta();
  }
  setSyncDone(cursor) {
    this.syncMeta.cursor = Math.max(this.syncMeta.cursor || 0, cursor || 0);
    this.syncMeta.lastSynced = Date.now();
    this.saveMeta();
  }

  pendingRows() {
    return merge.pendingRows(this.syncMeta, merge.toRecords(this), new Map(this.log.map((e) => [e.id, e])));
  }
  pendingPhotos() {
    const out = [];
    for (const [key, stamp] of Object.entries(this.syncMeta.dirty)) {
      const [kind, id] = merge.splitKey(key);
      if (kind === 'blob') out.push({ id, updated_at: stamp, deleted: this.syncMeta.clock[key]?.[1] === null });
    }
    return out;
  }
  ackPushed(rows) {
    merge.ackPushed(this.syncMeta, rows);
    this.saveMeta();
  }

  // Merge rows pulled from the account. Returns the photo files to download or remove.
  async applyRemote(rows) {
    const res = merge.applyRemote(this.syncMeta, merge.toRecords(this), new Map(this.log.map((e) => [e.id, e])), rows);
    if (res.changed) {
      const s = merge.fromRecords(res.records);
      this.settings = s.settings;
      this.today = s.today?.day ? s.today : null;
      this.progress = normalizeProgress(s.progress);
      this.history = s.history;
      this.log = [...res.log.values()].sort((a, b) => a.ts - b.ts);
      merge.track(this.syncMeta, merge.toRecords(this), Date.now()); // defaults the server never had
      await this.enqueue(async () => {
        if (this.mode === 'idb') {
          const now = Date.now();
          const tx = this.db.transaction(['kv', 'log'], 'readwrite');
          tx.objectStore('kv').put({ ...this.settings, savedAt: now }, 'settings');
          tx.objectStore('kv').put({ items: this.history, savedAt: now }, 'history');
          if (this.today) tx.objectStore('kv').put({ ...this.today, savedAt: now }, 'today'); else tx.objectStore('kv').delete('today');
          tx.objectStore('kv').put({ ...this.progress, savedAt: now }, 'progress');
          for (const e of res.logPut) tx.objectStore('log').put(e);
          for (const id of res.logDel) tx.objectStore('log').delete(id);
          await txDone(tx);
        }
        this.mirrorAll();
      });
      this.emit('import');
    }
    this.saveMeta();
    return res;
  }

  // A photo file arrived from (or was removed on) another device: store it without marking it dirty.
  async putSyncedPhoto(key, blob, stamp) {
    const newerHere = () => (this.syncMeta.clock[merge.keyOf('blob', key)]?.[0] ?? -1) > stamp;
    if (this.mode !== 'idb' || newerHere()) return;
    await this.enqueue(async () => {
      if (newerHere()) return;
      const tx = this.db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put({ blob, type: blob.type, updatedAt: stamp }, key);
      await txDone(tx);
    });
    if (newerHere()) return;
    this.syncMeta.clock[merge.keyOf('blob', key)] = [stamp, 'B'];
    delete this.syncMeta.dirty[merge.keyOf('blob', key)];
    this.saveMeta();
    this.emit('photos');
  }
  async removeSyncedPhoto(key, stamp) {
    if (this.mode === 'idb') {
      await this.enqueue(async () => {
        const tx = this.db.transaction('photos', 'readwrite');
        tx.objectStore('photos').delete(key);
        await txDone(tx);
      });
    }
    this.syncMeta.clock[merge.keyOf('blob', key)] = [stamp, null];
    delete this.syncMeta.dirty[merge.keyOf('blob', key)];
    this.saveMeta();
    this.emit('photos');
  }

  async estimate() {
    try { return await navigator.storage?.estimate?.(); } catch { return null; }
  }
}

function normalizeProgress(p) {
  const base = structuredClone(DEFAULT_PROGRESS);
  const out = { ...base, ...p, standards: { ...base.standards } };
  delete out.savedAt;
  for (const [k, v] of Object.entries(p.standards || {})) if (base.standards[k]) out.standards[k] = { ...base.standards[k], ...v };
  for (const list of ['checkins', 'weights', 'photos']) out[list] = Array.isArray(p[list]) ? [...p[list]].sort((a, b) => a.ts - b.ts) : [];
  return out;
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function dataURLToBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export const store = new Store();
