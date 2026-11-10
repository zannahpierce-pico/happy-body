// Entry point: boot the store, start sync, route between tabs, keep the top bar live, register the service worker.
import { store } from './store.js';
import { migrateStepPhotos } from './photos.js';
import { sync } from './sync.js';
import { session } from './session.js';
import { phaseById, repsFor } from './program.js';
import { byKey } from './data/exercises.js';
import { $, esc, fmtTime, ICONS, toast, confirmSheet } from './ui.js';
import * as todayView from './views/today.js';
import * as programView from './views/program.js';
import * as progressView from './views/progress.js';
import * as settingsView from './views/settings.js';
import { applyTheme } from './views/settings.js';

const TABS = [
  { id: 'today', label: 'Today', icon: ICONS.today, view: todayView, title: 'Happy Body' },
  { id: 'program', label: 'Program', icon: ICONS.program, view: programView, title: 'Program' },
  { id: 'progress', label: 'Progress', icon: ICONS.streak, view: progressView, title: 'Progress' },
  { id: 'settings', label: 'Settings', icon: ICONS.settings, view: settingsView, title: 'Settings' },
];

let cleanup = null;
let updateAccepted = false;
let current = null;

function route() {
  const id = (location.hash || '#today').slice(1).replace(/^streak$/, 'progress');
  const tab = TABS.find((t) => t.id === id) || TABS[0];
  if (current === tab.id) return;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
  current = tab.id;
  const main = $('#main');
  main.innerHTML = '';
  cleanup = tab.view.render(main);
  for (const b of $('#nav').children) b.classList.toggle('on', b.dataset.tab === tab.id);
  window.scrollTo(0, 0);
  drawTopbar();
}

function drawNav() {
  $('#nav').innerHTML = TABS.map((t) => `<button data-tab="${t.id}" aria-label="${t.label}">${t.icon}<span>${t.label}</span></button>`).join('');
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = b.dataset.tab; });
}

function drawTopbar() {
  const tab = TABS.find((t) => t.id === current) || TABS[0];
  const s = store.settings;
  const week = session.week;
  const phase = phaseById(s.phase);
  let title = tab.title;
  let sub = tab.id === 'program' ? 'Weights, levels and phase' : tab.id === 'progress' ? 'Streak, the six Standards, photos' : 'Cues, theme, account and backup';
  if (tab.id === 'today') {
    const pos = session.position;
    const cur = pos.current;
    title = cur ? `Sequence ${cur.seq}, round ${cur.round} of ${cur.rounds}` : 'Today';
    const left = cur ? minutesLeft(pos) : 0;
    sub = [week ? `Week ${week}` : esc(phase.label), left ? `about ${left} min left` : ''].filter(Boolean).join(', ');
  }
  $('#topbar').innerHTML = `<div><h1>${esc(title)}</h1><div class="sub">${sub}</div></div>${tab.id === 'today' ? clockBlock() : ''}`;
}

// The workout clock at the top right: Start workout, then Pause / Resume and
// Done. Starting an exercise starts it too, and pausing one pauses it.
function clockBlock() {
  const c = session.clock;
  const btn = (act, label) => `<button class="clock-btn" data-clock="${act}">${label}</button>`;
  if (c === 'off') return `<div class="right">${btn('start', 'Start workout')}</div>`;
  const label = c === 'done' ? 'Session' : c === 'paused' ? 'Paused' : 'Elapsed';
  let acts = '';
  if (c === 'running') acts = btn('pause', 'Pause') + btn('done', 'Done');
  else if (c === 'paused') acts = btn('start', 'Resume') + btn('restart', 'Start over') + btn('done', 'Done');
  else if (session.mode !== 'complete') acts = (session.entries.length ? btn('start', 'Resume') : '') + btn('restart', 'Start over');
  return `<div class="right">${label}<br><strong class="tnum" data-elapsed>${fmtTime(session.elapsedMs())}</strong>${acts ? `<div class="clock-acts">${acts}</div>` : ''}</div>`;
}

function onClockAct(act) {
  if (act === 'start') return session.startClock();
  if (act === 'pause') return session.pauseClock();
  if (act === 'restart') return startOver();
  if (act === 'done') return session.finishClock();
}

// Start the day's workout over: back to the first exercise, clock at zero.
async function startOver() {
  const n = session.entries.length;
  if (!n) return session.restartClock();
  const ok = await confirmSheet({ title: 'Start today over?', body: `Removes the ${n} exercise${n === 1 ? '' : 's'} logged today and resets the clock. The first exercise comes up again.`, okLabel: 'Start over', danger: true });
  if (ok) await session.clearToday();
}

// Levels used to default to 5, the full movement; the book has you start where
// you can and move up. One pass: a level still at 5 that was never changed on
// any device (no sync stamp) moves to the new default of 3.
async function migrateLevels() {
  try { if (localStorage.getItem('hb:levels:v3')) return; } catch { /* no localStorage: just try */ }
  const patch = {};
  for (const [k, v] of Object.entries(store.settings.levels || {})) {
    const c = store.syncMeta?.clock?.[`setting:levels.${k}`];
    if (v === 5 && (!c || c[0] === 0)) patch[k] = 3;
  }
  if (Object.keys(patch).length) await store.setSettings({ levels: patch });
  try { localStorage.setItem('hb:levels:v3', '1'); } catch { /* ignore */ }
}

// Minutes still to go today, from the tempo of every remaining slot.
function minutesLeft(pos) {
  const s = store.settings;
  let secs = 0;
  for (let i = pos.index; i < pos.slots.length; i++) {
    const e = byKey[pos.slots[i].key];
    const per = e.phases.reduce((a, p) => a + p[1], 0);
    secs += per * repsFor(e, s) + (s.timer?.getReady || 0);
  }
  return Math.max(1, Math.round(secs / 60));
}

setInterval(() => {
  const el = $('[data-elapsed]');
  if (el && !session.meta?.finishedAt) el.textContent = fmtTime(session.elapsedMs());
}, 1000);

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const go = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
        });
      });
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      // Coming back to the app (home-screen apps rarely reload): look for a new version.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch (e) { console.warn('SW registration failed', e); }
  };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  // Reload only after an update was applied, never on the first install.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateAccepted) location.reload(); });
}

// A new version applies itself (the page reloads; everything is saved as you go)
// unless that would interrupt something: a timer under way, or typing in a field.
// Then a banner offers it, and it applies on its own once the timer stops.
let pendingUpdate = null;
const BUSY_MODES = new Set(['running', 'paused', 'ready', 'ready-paused', 'relax']);
function updateWouldInterrupt() {
  const tag = document.activeElement?.tagName;
  return BUSY_MODES.has(session.mode) || tag === 'INPUT' || tag === 'TEXTAREA';
}
function applyUpdate(reg) {
  if (!reg.waiting) return;
  pendingUpdate = null;
  updateAccepted = true;
  reg.waiting.postMessage('skipWaiting');
}
function showUpdate(reg) {
  pendingUpdate = reg;
  if (!updateWouldInterrupt()) return applyUpdate(reg);
  if ($('.update-banner')) return;
  const b = document.createElement('div');
  b.className = 'update-banner';
  b.innerHTML = `<span>A new version is ready.</span><button class="btn sm primary">Update</button>`;
  b.querySelector('button').addEventListener('click', () => applyUpdate(reg));
  $('#topbar').after(b);
}
function maybeApplyUpdate() {
  if (pendingUpdate && !updateWouldInterrupt()) applyUpdate(pendingUpdate);
}

async function boot() {
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    toast('Storage could not be opened. Data may not save.', { error: true, ms: 6000 });
  }
  migrateStepPhotos().catch((e) => console.warn('step photo migration failed', e));
  await migrateLevels().catch((e) => console.warn('level migration failed', e));
  applyTheme(store.settings.theme);
  // Opened from an emailed sign-in link: take the session out of the address before routing.
  const linked = await sync.takeRedirect().catch((e) => { toast(e.network ? 'You are offline. Open the link again when connected.' : e.message, { error: true, ms: 6000 }); return null; })
    || (sync.pendingAttach ? sync.user : null);
  drawNav();
  $('#topbar').addEventListener('click', (e) => { const b = e.target.closest('[data-clock]'); if (b) onClockAct(b.dataset.clock)?.catch?.((err) => console.warn(err)); });
  route();
  // A sign-in link opened in a tab that already has the app: start over so boot reads it.
  window.addEventListener('hashchange', () => { if (/^#(access_token|error)=/.test(location.hash)) location.reload(); else route(); });
  store.subscribe((what) => { if (what === 'settings' || what === 'today' || what === 'import') drawTopbar(); if (what === 'status' && store.status.error) toast(`Save failed: ${store.status.error}`, { error: true, ms: 5000 }); });
  session.subscribe((what) => { if (what === 'state') { drawTopbar(); maybeApplyUpdate(); } });
  session.refresh();
  sync.start();
  if (linked) settingsView.afterSignIn(linked);
  registerSW();
  window.hb = { store, session, sync }; // handy in the console
}

boot();
