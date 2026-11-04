// Entry point: boot the store, start sync, route between tabs, keep the top bar live, register the service worker.
import { store } from './store.js';
import { sync } from './sync.js';
import { session } from './session.js';
import { phaseById, repsFor } from './program.js';
import { byKey } from './data/exercises.js';
import { $, esc, fmtTime, ICONS, toast } from './ui.js';
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
  const ms = session.elapsedMs();
  const right = tab.id === 'today' && session.meta?.startedAt
    ? `<div class="right">${session.meta.finishedAt ? 'Session' : 'Elapsed'}<br><strong class="tnum" data-elapsed>${fmtTime(ms)}</strong></div>` : '';
  $('#topbar').innerHTML = `<div><h1>${esc(title)}</h1><div class="sub">${sub}</div></div>${right}`;
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
    } catch (e) { console.warn('SW registration failed', e); }
  };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  // Reload only after the user accepted an update, never on the first install.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateAccepted) location.reload(); });
}

function showUpdate(reg) {
  if ($('.update-banner')) return;
  const b = document.createElement('div');
  b.className = 'update-banner';
  b.innerHTML = `<span>A new version is ready.</span><button class="btn sm primary">Update</button>`;
  b.querySelector('button').addEventListener('click', () => { updateAccepted = true; reg.waiting?.postMessage('skipWaiting'); });
  $('#topbar').after(b);
}

async function boot() {
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    toast('Storage could not be opened. Data may not save.', { error: true, ms: 6000 });
  }
  applyTheme(store.settings.theme);
  // Opened from an emailed sign-in link: take the session out of the address before routing.
  const linked = await sync.takeRedirect().catch((e) => { toast(e.network ? 'You are offline. Open the link again when connected.' : e.message, { error: true, ms: 6000 }); return null; })
    || (sync.pendingAttach ? sync.user : null);
  drawNav();
  route();
  // A sign-in link opened in a tab that already has the app: start over so boot reads it.
  window.addEventListener('hashchange', () => { if (/^#(access_token|error)=/.test(location.hash)) location.reload(); else route(); });
  store.subscribe((what) => { if (what === 'settings' || what === 'today' || what === 'import') drawTopbar(); if (what === 'status' && store.status.error) toast(`Save failed: ${store.status.error}`, { error: true, ms: 5000 }); });
  session.subscribe((what) => { if (what === 'state') drawTopbar(); });
  session.refresh();
  sync.start();
  if (linked) settingsView.afterSignIn(linked);
  registerSW();
  window.hb = { store, session, sync }; // handy in the console
}

boot();
