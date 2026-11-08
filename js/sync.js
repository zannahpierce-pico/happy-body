// Sign-in and background sync with the person's own Supabase account, over plain
// fetch (no SDK, so nothing extra to load or precache). IndexedDB stays the source
// of truth and the app works the same signed out or offline: this only pulls what
// other devices wrote, hands it to store.applyRemote for the last-write-wins merge
// (merge.js), and pushes what changed here.

import { store } from './store.js';
import { SYNC_CONFIG } from './config.js';

const AUTH = 'hb.auth';
const TABLE = 'hb_records';
const BUCKET = 'hb-photos';
const BATCH = 500;
const PAGE = 1000;
const OVERLAP = 60000;      // re-pull the last minute so rows that committed out of order are not missed
const EVERY = 5 * 60000;    // background sync while the app is open

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

// A secret or service_role key would bypass row-level security: refuse to use one.
export function isSecretKey(k) {
  if (k.startsWith('sb_secret_')) return true;
  try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; }
  catch { return false; }
}

// js/config.js, or a localStorage override (hb.syncConfig) for testing against another project.
function config() {
  const o = lsGet('hb.syncConfig');
  const c = o?.url && o?.anonKey ? o : SYNC_CONFIG;
  const url = (c.url || '').replace(/\/+$/, '');
  if (!url || !c.anonKey) return null;
  if (isSecretKey(c.anonKey)) { console.error('Sync disabled: js/config.js holds a secret key. Use the publishable (anon) key.'); return null; }
  return { url, key: c.anonKey };
}

// Storage object names: photo keys contain ':', keep names to [A-Za-z0-9-] plus escapes.
export const objectName = (k) => k.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`);

const netErr = () => Object.assign(new Error('Offline'), { network: true });
const errMsg = (j, status) => j?.msg || j?.error_description || j?.message || j?.error || `Server error ${status}`;

class Sync {
  constructor() {
    this.session = lsGet(AUTH); // {access_token, refresh_token, expires_at, user: {id, email}}
    this.state = 'idle';        // idle | syncing | offline | error
    this.error = null;
    this.listeners = new Set();
    this.running = null;
    this.again = false;
    this.timer = null;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) { try { fn(this); } catch (e) { console.error(e); } } }
  setState(state, error = null) { this.state = state; this.error = error; this.emit(); }

  get configured() { return !!config(); }
  get user() { return this.session?.user || null; }
  // Signed in from an emailed link, and afterSignIn has not attached this device yet.
  get pendingAttach() { return !!this.session?.pending; }
  get lastSynced() { return store.syncMeta.lastSynced; }

  start() {
    // Keep the store's idea of who is signed in in step with the saved session.
    if (this.user && !this.pendingAttach && store.syncMeta.userId !== this.user.id) store.setSyncUser(this.user.id);
    if (!this.user && store.syncMeta.userId) store.setSyncUser(null);
    store.subscribe((what) => { if (what === 'dirty') this.schedule(); });
    window.addEventListener('online', () => this.schedule(0));
    window.addEventListener('offline', () => { if (this.user) this.setState('offline'); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.schedule(0); });
    setInterval(() => { if (document.visibilityState === 'visible') this.schedule(0); }, EVERY);
    this.schedule(0);
  }

  schedule(delay = 2000) {
    if (!this.user || !this.configured) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.syncNow().catch(() => {}); }, delay);
  }

  // ── Auth ──
  async auth(path, body) {
    const c = config();
    if (!c) throw new Error('Sync is not set up for this copy of the app');
    let res;
    try {
      res = await fetch(`${c.url}/auth/v1/${path}`, { method: 'POST', cache: 'no-store', headers: { apikey: c.key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw netErr(); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(errMsg(j, res.status)), { status: res.status });
    return j;
  }

  keep(j) {
    if (!j?.access_token || !j.user?.id) return false;
    this.session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000,
      user: { id: j.user.id, email: j.user.email },
    };
    lsSet(AUTH, this.session);
    return true;
  }

  async signIn(email, password) {
    this.keep(await this.auth('token?grant_type=password', { email, password }));
    return this.user;
  }
  // Returns the user, or null when the project wants the email confirmed first.
  async signUp(email, password) {
    return this.keep(await this.auth('signup', { email, password })) ? this.user : null;
  }
  // Emails a one-time sign-in link back to this page (Supabase falls back to the
  // project's Site URL when this address is not on its allow list).
  async sendLink(email) {
    const back = encodeURIComponent(location.origin + location.pathname);
    await this.auth(`otp?redirect_to=${back}`, { email, create_user: false });
  }

  // Opened from the emailed link: the session arrives in the address hash
  // (#access_token=…&refresh_token=…). Returns the user, or null; throws the
  // link's error (expired, already used). Always leaves the hash on #settings.
  async takeRedirect() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has('access_token') && !h.has('error_description')) return null;
    history.replaceState(null, '', `${location.pathname}${location.search}#settings`);
    if (h.has('error_description')) throw new Error(`That sign-in link did not work: ${h.get('error_description')}`);
    const c = config();
    if (!c) return null;
    let res;
    try { res = await fetch(`${c.url}/auth/v1/user`, { cache: 'no-store', headers: { apikey: c.key, authorization: `Bearer ${h.get('access_token')}` } }); }
    catch { throw netErr(); }
    const user = await res.json().catch(() => null);
    if (!res.ok || !user?.id) throw new Error(errMsg(user, res.status));
    const expiresIn = Number(h.get('expires_in')) || 3600;
    this.keep({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_at: Number(h.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn, user });
    this.session.pending = true;
    lsSet(AUTH, this.session);
    return this.user;
  }

  // After signing in: attach this device's data to the account and sync.
  attach() {
    if (this.session?.pending) { delete this.session.pending; lsSet(AUTH, this.session); }
    store.setSyncUser(this.user.id);
    this.setState('idle');
    return this.syncNow();
  }

  async signOut() {
    const s = this.session;
    const c = config();
    this.session = null;
    lsSet(AUTH, null);
    clearTimeout(this.timer);
    store.setSyncUser(null);
    this.setState('idle');
    if (s && c) fetch(`${c.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: c.key, authorization: `Bearer ${s.access_token}` } }).catch(() => {});
  }

  async token() {
    if (!this.session) throw new Error('Signed out');
    if (this.session.expires_at - Date.now() > 60000) return this.session.access_token;
    return this.refresh();
  }

  async refresh() {
    try {
      this.keep(await this.auth('token?grant_type=refresh_token', { refresh_token: this.session.refresh_token }));
      return this.session.access_token;
    } catch (e) {
      if (e.network || !(e.status >= 400 && e.status < 500)) throw e;
      await this.signOut(); // the data stays on this device; signing in again pushes it
      throw new Error('Your sign-in expired. Sign in again to keep syncing.');
    }
  }

  async req(path, { method = 'GET', headers = {}, json, body, raw = false } = {}, retry = true) {
    const c = config();
    const tok = await this.token();
    let res;
    try {
      res = await fetch(c.url + path, {
        method, cache: 'no-store',
        headers: { apikey: c.key, authorization: `Bearer ${tok}`, ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        body: json !== undefined ? JSON.stringify(json) : body,
      });
    } catch { throw netErr(); }
    if (res.status === 401 && retry) { await this.refresh(); return this.req(path, { method, headers, json, body, raw }, false); }
    if (!res.ok) throw Object.assign(new Error(errMsg(await res.json().catch(() => null), res.status)), { status: res.status });
    if (raw) return res;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ── Sync ──
  // One cycle at a time; a request that arrives mid-cycle runs one more after it.
  syncNow() {
    if (!this.user || this.pendingAttach || !this.configured) return Promise.resolve();
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      do { this.again = false; await this.cycle(); } while (this.again && this.user);
    })().finally(() => { this.running = null; });
    return this.running;
  }

  async cycle() {
    if (navigator.onLine === false) { this.setState('offline'); return; }
    this.setState('syncing');
    try {
      // Pull first so a newer copy elsewhere wins before anything here is uploaded over it.
      await this.pull();
      await this.push();
      this.setState('idle');
    } catch (e) {
      console.warn('sync failed', e);
      this.setState(e.network ? 'offline' : 'error', e.message || String(e));
    }
  }

  async pull() {
    const since = Math.max(0, (store.syncMeta.cursor || 0) - OVERLAP);
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.req(`/rest/v1/${TABLE}?select=kind,id,data,deleted,updated_at,synced_at&synced_at=gt.${since}&order=synced_at.asc,kind.asc,id.asc&limit=${PAGE}&offset=${offset}`);
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    const res = await store.applyRemote(rows.map((r) => ({ ...r, updated_at: Number(r.updated_at) })));
    const uid = this.user.id;
    // Download photo files a few at a time; a fresh device may need well over a hundred.
    const queue = res.fetch.filter((f) => typeof f.data?.path === 'string' && f.data.path.startsWith(`${uid}/`));
    const worker = async () => {
      for (let f; (f = queue.shift());) {
        try {
          const r = await this.req(`/storage/v1/object/authenticated/${BUCKET}/${f.data.path}`, { raw: true });
          const blob = await r.blob();
          await store.putSyncedPhoto(f.id, f.data.type ? new Blob([blob], { type: f.data.type }) : blob, f.updated_at);
        } catch (e) { if (e.network) { queue.length = 0; throw e; } console.warn('photo download failed', f.id, e); }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    for (const r of res.remove) await store.removeSyncedPhoto(r.id, r.updated_at);
    store.setSyncDone(rows.reduce((m, r) => Math.max(m, Number(r.synced_at) || 0), 0));
  }

  upsert(rows) {
    const uid = this.user.id;
    return this.req(`/rest/v1/${TABLE}?on_conflict=user_id,kind,id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      json: rows.map((r) => ({ user_id: uid, kind: r.kind, id: r.id, data: r.data, deleted: r.deleted, updated_at: r.updated_at })),
    });
  }

  async push() {
    const rows = store.pendingRows();
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await this.upsert(batch);
      store.ackPushed(batch);
    }
    // Photo files: upload (or remove) the file, then the record that points at it.
    const uid = this.user.id;
    for (const p of store.pendingPhotos()) {
      const path = `${uid}/${objectName(p.id)}`;
      let type = null;
      if (p.deleted) {
        await this.req(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', json: { prefixes: [path] } });
      } else {
        const ph = await store.getPhoto(p.id);
        if (!ph?.blob) { store.ackPushed([{ kind: 'blob', id: p.id, updated_at: p.updated_at }]); continue; }
        type = ph.type || ph.blob.type || 'image/jpeg';
        await this.req(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'content-type': type, 'x-upsert': 'true', 'cache-control': 'max-age=0' }, body: ph.blob });
      }
      const row = { kind: 'blob', id: p.id, data: p.deleted ? null : { path, type }, deleted: p.deleted, updated_at: p.updated_at };
      await this.upsert([row]);
      store.ackPushed([row]);
    }
  }
}

export const sync = new Sync();
