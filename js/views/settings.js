// Settings: timer cues, appearance, backup/restore, storage health, about.
import { store } from '../store.js';
import { esc, on, $, toast, sheet, confirmSheet, fmtClock } from '../ui.js';
import * as audio from '../audio.js';

export function render(main) {
  const draw = () => { main.innerHTML = view(); fillEstimate(main); };
  draw();
  const unsub = store.subscribe((what) => { if (what === 'settings' || what === 'import' || what === 'status' || what === 'photos') draw(); });

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
    audio.unlock(); audio.configure(store.settings.timer);
    audio.cue('in'); setTimeout(() => audio.cue('move'), 500); setTimeout(() => audio.cue('repEnd'), 1000);
    audio.say('Inhale. Lift. Exhale.');
  });
  on(main, 'click', '[data-export]', exportFlow);
  on(main, 'click', '[data-import]', importFlow);
  on(main, 'click', '[data-wipe]', async () => {
    if (await confirmSheet({ title: 'Erase everything?', body: 'Settings, the whole log, history and photos on this device. Export a backup first if you want to keep anything. This cannot be undone.', okLabel: 'Erase all data', danger: true })) {
      await store.wipe(); toast('Erased'); applyTheme('auto');
    }
  });
  return unsub;
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

function view() {
  const s = store.settings;
  const t = s.timer;
  const st = store.status;
  const dotCls = st.error ? 'err' : st.pending ? 'pending' : '';
  const saved = st.error ? `Save failed: ${esc(st.error)}` : st.pending ? 'Saving…' : st.lastSaved ? `Saved ${fmtClock(st.lastSaved)}` : 'Nothing to save yet';
  return `<div class="stack">
    <section class="card">
      <div class="card-title"><h2>Timer</h2><button class="btn sm" data-test-audio>Test cues</button></div>
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

    <section class="card">
      <div class="card-title"><h2>Backup</h2><span class="hint"><span class="save-dot ${dotCls}"></span>${saved}</span></div>
      <p class="small muted">Everything lives on this device: ${store.mode === 'idb' ? 'IndexedDB with a localStorage mirror' : 'localStorage only (IndexedDB is unavailable here)'}. Export a file now and then, and before reinstalling. Photos are included.</p>
      <div class="btn-row">
        <button class="btn primary" data-export>Export backup</button>
        <button class="btn" data-import>Import</button>
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
      <p class="small muted" style="margin:0">A personal runner for the exercise program in <i>The Happy Body</i> by Aniela and Jerzy Gregorek. Not affiliated with the authors. Exercise text is paraphrased from chapter 8; drawings are original. Install: in Safari, Share → Add to Home Screen. Photos you add stay on this device.</p>
    </section>
  </div>`;
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

function importFlow() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json'; input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const f = input.files?.[0]; input.remove();
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast('That file is not valid JSON', { error: true }); return; }
    if (data?.app !== 'happy-body') { toast('Not a Happy Body backup', { error: true }); return; }
    const sh = sheet(`
      <div class="sheet-head"><div><h2>Import backup</h2><p class="muted small" style="margin:4px 0 0">${(data.log || []).length} log entries · exported ${esc((data.exportedAt || '').slice(0, 10))}</p></div><button class="close" data-close aria-label="Close">×</button></div>
      <p class="small">Merge adds entries and photos that are missing here and keeps your current settings. Replace wipes this device first and restores the file exactly.</p>
      <div class="btn-row"><button class="btn primary" data-mode="merge">Merge</button><button class="btn danger" data-mode="replace">Replace</button></div>`);
    on(sh.el, 'click', '[data-mode]', async (ev, b) => {
      try { await store.importData(data, b.dataset.mode); sh.close(); toast('Imported'); applyTheme(store.settings.theme); }
      catch (e) { toast(e.message || 'Import failed', { error: true }); }
    });
  });
  input.click();
}

async function fillEstimate(main) {
  const el = $('[data-estimate]', main);
  if (!el) return;
  const est = await store.estimate();
  if (!el.isConnected) return;
  el.textContent = est?.usage != null ? `${(est.usage / 1048576).toFixed(1)} MB used${est.quota ? ` of ${(est.quota / 1048576).toFixed(0)} MB` : ''}` : 'unknown';
}
