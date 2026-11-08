// Settings: timer cues, appearance, account and sync, backup/restore, storage health, about.
import { store } from '../store.js';
import { sync } from '../sync.js';
import { esc, on, $, toast, sheet, confirmSheet, fmtClock, fmtDate } from '../ui.js';
import * as audio from '../audio.js';

let audioLog = '';

export function render(main) {
  const showLog = () => { const o = $('[data-audio-log]', main); if (o && audioLog) { o.hidden = false; o.textContent = audioLog; } };
  const draw = () => { main.innerHTML = view(); fillEstimate(main); showLog(); };
  draw();
  // Saves and photo arrivals only touch the save line and the storage figure, so
  // update those in place: a full redraw on each of them made the page flicker
  // while sync downloaded photos one by one, and could drop a file being picked.
  let estTimer = null;
  const refresh = () => {
    const h = $('[data-save-hint]', main);
    if (h) h.innerHTML = saveHint();
    clearTimeout(estTimer);
    estTimer = setTimeout(() => fillEstimate(main), 400);
  };
  const unsub = store.subscribe((what) => {
    if (what === 'settings' || what === 'import') draw();
    else if (what === 'status' || what === 'photos') refresh();
  });
  const unsubSync = sync.subscribe(draw);

  on(main, 'click', '[data-toggle]', async (ev, b) => {
    const path = b.dataset.toggle;
    const cur = get(store.settings, path);
    await store.setSettings(setPath(path, !cur));
  });
  on(main, 'click', '[data-set]', async (ev, b) => {
    const [path, raw] = b.dataset.set.split('|');
    const val = raw === 'true' ? true : raw === 'false' ? false : isNaN(Number(raw)) ? raw : Number(raw);
    await store.setSettings(setPath(path, val));
    if (path === 'theme') applyTheme(val);
  });
  on(main, 'click', '[data-test-audio]', () => {
    audio.configure(store.settings.timer);
    audio.unlock({ prime: false });
    audioLog = '';
    audio.diagnose((line) => { audioLog += (audioLog ? '\n' : '') + line; showLog(); });
  });
  on(main, 'click', '[data-export]', exportFlow);
  // The Import button is a <label> around the file input, so the tap itself opens
  // the picker (some browsers ignore a scripted click on a hidden input).
  on(main, 'change', '[data-import-file]', (ev, input) => { const f = input.files?.[0]; input.value = ''; importFile(f); });
  on(main, 'click', '[data-wipe]', async () => {
    const account = sync.user ? ' You will also be signed out; your account keeps its copy.' : '';
    if (await confirmSheet({ title: 'Erase everything?', body: `Settings, the whole log, history and photos on this device. Export a backup first if you want to keep anything. This cannot be undone.${account}`, okLabel: 'Erase all data', danger: true })) {
      if (sync.user) await sync.signOut();
      await store.wipe(); toast('Erased'); applyTheme('auto');
    }
  });
  on(main, 'click', '[data-signin]', signInFlow);
  on(main, 'click', '[data-signout]', signOutFlow);
  on(main, 'click', '[data-sync-now]', () => sync.syncNow());
  return () => { unsub(); unsubSync(); clearTimeout(estTimer); };
}

const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(path, val) {
  const keys = path.split('.');
  const out = {}; let cur = out;
  keys.forEach((k, i) => { cur[k] = i === keys.length - 1 ? val : {}; cur = cur[k]; });
  return out;
}

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

const sw = (path, on_) => `<button class="switch ${on_ ? 'on' : ''}" role="switch" aria-checked="${on_}" data-toggle="${path}"></button>`;

function saveHint() {
  const st = store.status;
  const dotCls = st.error ? 'err' : st.pending ? 'pending' : '';
  const saved = st.error ? `Save failed: ${esc(st.error)}` : st.pending ? 'Saving…' : st.lastSaved ? `Saved ${fmtClock(st.lastSaved)}` : 'Nothing to save yet';
  return `<span class="save-dot ${dotCls}"></span>${saved}`;
}

function view() {
  const s = store.settings;
  const t = s.timer;
  return `<div class="stack">
    <section class="card">
      <div class="card-title"><h2>Timer</h2><button class="btn sm" data-test-audio>Test cues</button></div>
      <pre class="audio-log small muted" data-audio-log hidden></pre>
      <div class="row"><span class="label">Sound cues<span class="small muted">a different tone per phase, a chime per rep</span></span>${sw('timer.sound', t.sound !== false)}</div>
      <div class="row"><span class="label">Spoken phases<span class="small muted">"Inhale", "Lift", "Exhale"…</span></span>${sw('timer.voice', t.voice !== false)}</div>
      <div class="row"><span class="label">Get-ready countdown<span class="small muted">time to pick up the right dumbbells</span></span>
        <div class="seg compact" style="width:200px">${[0, 5, 10, 15].map((n) => `<button data-set="timer.getReady|${n}" class="${(t.getReady ?? 10) === n ? 'on' : ''}">${n ? n + 's' : 'Off'}</button>`).join('')}</div></div>
      <div class="row"><span class="label">Auto-start next<span class="small muted">flow straight into the next exercise</span></span>${sw('timer.autoStart', t.autoStart !== false)}</div>
      <div class="row"><span class="label">Relax at the end<span class="small muted">minutes lying still</span></span>
        <div class="seg compact" style="width:200px">${[3, 5, 8, 10].map((n) => `<button data-set="timer.relaxMinutes|${n}" class="${(t.relaxMinutes || 5) === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="row"><span class="label">Keep screen awake<span class="small muted">while a timer runs</span></span>${sw('timer.keepAwake', t.keepAwake !== false)}</div>
    </section>

    <section class="card">
      <div class="card-title"><h2>Appearance</h2></div>
      <div class="seg">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button data-set="theme|${v}" class="${(s.theme || 'auto') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    </section>

    ${accountCard()}

    <section class="card">
      <div class="card-title"><h2>Backup</h2><span class="hint" data-save-hint>${saveHint()}</span></div>
      <p class="small muted">Everything lives on this device: ${store.mode === 'idb' ? 'IndexedDB with a localStorage mirror' : 'localStorage only (IndexedDB is unavailable here)'}${sync.user ? ', with a copy in your account' : ''}. Export a file now and then, and before reinstalling. Photos are included.</p>
      <div class="btn-row">
        <button class="btn primary" data-export>Export backup</button>
        <label class="btn file-btn">Import<input type="file" accept=".json,application/json" data-import-file></label>
      </div>
      <div class="divider"></div>
      <div class="row"><span class="label small">Log entries</span><span class="tnum">${store.log.length}</span></div>
      <div class="row"><span class="label small">History entries</span><span class="tnum">${store.history.length}</span></div>
      <div class="row" id="storage-row"><span class="label small">Storage</span><span class="tnum muted" data-estimate>…</span></div>
      <div class="divider"></div>
      <button class="btn danger block" data-wipe>Erase all data</button>
    </section>

    <section class="card flat">
      <div class="card-title"><h3>About</h3></div>
      <p class="small muted" style="margin:0">A personal runner for the exercise program in <i>The Happy Body</i> by Aniela and Jerzy Gregorek. Not affiliated with the authors. Exercise text is paraphrased from chapter 8; drawings are original. Install: in Safari, Share → Add to Home Screen. Photos you add stay on this device unless you sign in to sync them.</p>
    </section>
  </div>`;
}

const fmtWhen = (ts) => (new Date(ts).toDateString() === new Date().toDateString() ? `today ${fmtClock(ts)}` : `${fmtDate(ts)} ${fmtClock(ts)}`);
const INPUT = 'style="width:100%"';

function accountCard() {
  if (!sync.configured) {
    return `<section class="card">
      <div class="card-title"><h2>Account</h2></div>
      <p class="small muted" style="margin:0">Accounts and sync are not set up for this copy of the app, so everything stays on this device.</p>
    </section>`;
  }
  const u = sync.user;
  const err = sync.error && sync.state !== 'offline' ? `<p class="small" style="color:var(--red);margin:10px 0 0">${esc(sync.error)}</p>` : '';
  if (!u) {
    return `<section class="card">
      <div class="card-title"><h2>Account</h2></div>
      <p class="small muted">Sign in to keep your log, settings, progress and photos in step on your phone and computer. Each person signs in with their own email and sees only their own data. Without an account everything stays on this device and works offline as before.</p>
      <button class="btn primary block" data-signin>Sign in</button>${err}
    </section>`;
  }
  const st = sync.state;
  const dot = st === 'error' ? 'err' : st === 'syncing' || st === 'offline' ? 'pending' : '';
  const status = st === 'syncing' ? 'Syncing…' : st === 'offline' ? 'Offline' : st === 'error' ? 'Sync failed' : 'Synced';
  const last = sync.lastSynced;
  return `<section class="card">
    <div class="card-title"><h2>Account</h2><span class="small muted" data-sync-state><span class="save-dot ${dot}"></span>${status}</span></div>
    <div class="row"><span class="label small">Signed in as</span><span>${esc(u.email)}</span></div>
    <div class="row"><span class="label small">Last synced</span><span class="tnum" data-last-synced>${last ? fmtWhen(last) : 'not yet'}</span></div>
    <div class="row"><span class="label small">Changes waiting to sync</span><span class="tnum" data-sync-pending>${store.syncPending}</span></div>
    ${err}
    <div class="btn-row" style="margin-top:10px"><button class="btn" data-sync-now ${st === 'syncing' ? 'disabled' : ''}>Sync now</button><button class="btn ghost" data-signout>Sign out</button></div>
  </section>`;
}

function signInFlow() {
  const sh = sheet(`
    <div class="sheet-head"><h2>Sign in</h2><button class="close" data-close aria-label="Close">×</button></div>
    <form class="stack" data-auth novalidate>
      <input type="email" name="email" autocomplete="username" placeholder="Email" aria-label="Email" ${INPUT}>
      <input type="password" name="password" autocomplete="current-password" placeholder="Password" aria-label="Password" ${INPUT}>
      <div class="btn-row"><button class="btn primary" data-act="signin">Sign in</button><button type="button" class="btn" data-act="signup">Create account</button></div>
      <button type="button" class="btn ghost block" data-act="link">Email me a sign-in link instead</button>
      <p class="small muted" data-msg style="margin:0"></p>
    </form>`);
  const form = $('[data-auth]', sh.el);
  const msg = (t, error = false) => { const m = $('[data-msg]', sh.el); m.textContent = t; m.style.color = error ? 'var(--red)' : ''; };
  const val = (n) => form.elements[n].value.trim();
  let busy = false;
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { msg(e.network ? 'You are offline. Try again when connected.' : e.message || 'Something went wrong', true); }
    finally { busy = false; }
  };
  const done = async (user) => { sh.close(); await afterSignIn(user); };
  const need = (password) => {
    if (!/^\S+@\S+\.\S+$/.test(val('email'))) throw new Error('Enter your email address');
    if (password && form.elements.password.value.length < 6) throw new Error('Passwords are at least 6 characters');
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); run(async () => { need(true); msg('Signing in…'); await done(await sync.signIn(val('email'), form.elements.password.value)); }); });
  on(form, 'click', '[data-act]', (e, b) => {
    const act = b.dataset.act;
    if (act === 'signin') return;
    run(async () => {
      if (act === 'signup') {
        need(true); msg('Creating your account…');
        const user = await sync.signUp(val('email'), form.elements.password.value);
        if (user) await done(user); else msg('Check your email to confirm the account, then sign in here.');
      } else if (act === 'link') {
        need(false); msg('Sending…');
        await sync.sendLink(val('email'));
        msg('Sent. Open the link in the email on this device to sign in. On an iPhone the link opens in Safari, so in the home-screen app sign in with your password instead.');
      }
    });
  });
}

// Data left by a different account on this device: erase it or add it to this account.
export async function afterSignIn(user) {
  const last = store.syncMeta.lastUserId;
  if (last && last !== user.id && store.hasData) {
    const choice = await new Promise((resolve) => {
      const sh = sheet(`
        <div class="sheet-head"><h2>Data from another account</h2><button class="close" data-close aria-label="Close">×</button></div>
        <p class="small">This device has a log or progress from a different account. Erase it from this device before loading yours, or add it to ${esc(user.email)}?</p>
        <div class="btn-row"><button class="btn danger" data-choice="erase">Erase it</button><button class="btn" data-choice="merge">Add it</button></div>`,
      { onClose: () => resolve(null) });
      on(sh.el, 'click', '[data-choice]', (e, b) => { resolve(b.dataset.choice); sh.close(); });
    });
    if (!choice) { await sync.signOut(); toast('Signed out'); return; }
    if (choice === 'erase') { await store.wipe(); applyTheme('auto'); }
  }
  toast(`Signed in as ${user.email}`);
  await sync.attach();
  applyTheme(store.settings.theme);
}

function signOutFlow() {
  const sh = sheet(`
    <div class="sheet-head"><h2>Sign out?</h2><button class="close" data-close aria-label="Close">×</button></div>
    <p class="small">Your account keeps everything synced so far${store.syncPending ? `, but ${store.syncPending} change${store.syncPending === 1 ? ' has' : 's have'} not synced yet and will only be on this device` : ''}. You can keep a copy on this device or erase it.</p>
    <div class="btn-row"><button class="btn" data-out="keep">Sign out</button><button class="btn danger" data-out="erase">Sign out and erase</button></div>`);
  on(sh.el, 'click', '[data-out]', async (e, b) => {
    sh.close();
    await sync.signOut();
    if (b.dataset.out === 'erase') { await store.wipe(); applyTheme('auto'); }
    toast('Signed out');
  });
}

async function exportFlow() {
  try {
    const data = await store.exportData();
    const json = JSON.stringify(data);
    const name = `happy-body-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Happy Body backup' }); toast('Backup shared'); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Backup downloaded');
  } catch (e) { toast(e.message || 'Export failed', { error: true }); }
}

async function importFile(f) {
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { toast('That file is not valid JSON', { error: true }); return; }
  if (data?.app !== 'happy-body') { toast('Not a Happy Body backup', { error: true }); return; }
  const nPhotos = Object.keys(data.photos || {}).length;
  const sh = sheet(`
    <div class="sheet-head"><div><h2>Import backup</h2><p class="muted small" style="margin:4px 0 0">${nPhotos} photos · ${(data.log || []).length} log entries · exported ${esc((data.exportedAt || '').slice(0, 10))}</p></div><button class="close" data-close aria-label="Close">×</button></div>
    <p class="small">Merge adds entries and photos that are missing here and keeps your current settings. Replace wipes this device first and restores the file exactly.</p>
    <div class="btn-row"><button class="btn primary" data-mode="merge">Merge</button><button class="btn danger" data-mode="replace">Replace</button></div>`);
  on(sh.el, 'click', '[data-mode]', async (ev, b) => {
    try { await store.importData(data, b.dataset.mode); sh.close(); toast(nPhotos ? `Imported ${nPhotos} photos` : 'Imported'); applyTheme(store.settings.theme); }
    catch (e) { toast(e.message || 'Import failed', { error: true }); }
  });
}

async function fillEstimate(main) {
  const el = $('[data-estimate]', main);
  if (!el) return;
  const est = await store.estimate();
  if (!el.isConnected) return;
  el.textContent = est?.usage != null ? `${(est.usage / 1048576).toFixed(1)} MB used${est.quota ? ` of ${(est.quota / 1048576).toFixed(0)} MB` : ''}` : 'unknown';
}
