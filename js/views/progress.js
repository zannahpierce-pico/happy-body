// Progress: Streak (the 28-day grid), Standards (the six Happy Body Standards with
// check-ins and weigh-ins) and Photos (dated progress photos with side-by-side compare).
import { store } from '../store.js';
import { STANDARDS, standardMet, latestValues, weeklyChange, sessionMinutes, groupByDay, dayOf } from '../program.js';
import { render as renderStreak } from './streak.js';
import { pickPhoto, downscale, photoURL } from '../photos.js';
import { esc, on, $, $$, toast, sheet, confirmSheet, fmtDate, fmtLb, ICONS } from '../ui.js';

const SUB_KEY = 'hb.progressTab';
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const TAGS = [['front', 'Front'], ['side', 'Side'], ['back', 'Back'], ['other', 'Other']];

export function render(main) {
  let sub = 'streak';
  try { sub = localStorage.getItem(SUB_KEY) || 'streak'; } catch { /* ignore */ }
  if (!['streak', 'standards', 'photos'].includes(sub)) sub = 'streak';
  let unsub = null;
  main.innerHTML = `<div class="stack">
    <div class="seg" role="tablist">
      <button data-sub="streak" role="tab">Streak</button>
      <button data-sub="standards" role="tab">Standards</button>
      <button data-sub="photos" role="tab">Photos</button>
    </div>
    <div id="sub"></div>
  </div>`;
  const mount = () => {
    if (unsub) { try { unsub(); } catch (e) { console.error(e); } }
    for (const b of $$('[data-sub]', main)) b.classList.toggle('on', b.dataset.sub === sub);
    const el = $('#sub', main);
    el.innerHTML = '';
    unsub = sub === 'streak' ? renderStreak(el) : sub === 'standards' ? renderStandards(el) : renderPhotos(el);
  };
  on(main, 'click', '[data-sub]', (ev, b) => { sub = b.dataset.sub; try { localStorage.setItem(SUB_KEY, sub); } catch { /* ignore */ } mount(); });
  mount();
  return () => { if (unsub) unsub(); };
}

// ── Standards ────────────────────────────────────────────────────────────
function currentValues() {
  const p = store.progress;
  const latest = latestValues(p.checkins);
  const out = {};
  const sessions = sessionMinutes(groupByDay(store.log));
  for (const def of STANDARDS) {
    let value = latest[def.id]?.value ?? null, source = latest[def.id] ? `check-in ${fmtDate(latest[def.id].ts)}` : null;
    if (def.auto === 'base') { value = store.settings.base; source = 'from your base weight'; }
    if (def.auto === 'session' && sessions.length) { const s = sessions[sessions.length - 1]; value = s.minutes; source = `last complete session, ${fmtDate(new Date(s.day + 'T12:00'))}`; }
    if (def.auto === 'weight' && p.weights.length) { const w = p.weights[p.weights.length - 1]; value = w.lb; source = `weigh-in ${fmtDate(w.ts)}`; }
    const target = p.standards[def.id]?.target;
    out[def.id] = { value, source, target, met: standardMet(def, value, target) };
  }
  return out;
}

function renderStandards(el) {
  let editing = null;
  const draw = () => { el.innerHTML = standardsView(editing); };
  draw();
  const unsub = store.subscribe((what) => { if (['progress', 'import', 'settings', 'log'].includes(what)) draw(); });

  on(el, 'click', '[data-pass]', async (ev, b) => {
    const [id, val] = b.dataset.pass.split('|');
    await addCheckin({ [id]: val === 'yes' });
    toast(val === 'yes' ? 'Marked as met' : 'Noted. Keep at it.');
  });
  on(el, 'click', '[data-save-value]', async (ev, b) => {
    const id = b.dataset.saveValue;
    const inp = $(`[data-value-input="${id}"]`, el);
    const v = parseFloat(inp.value);
    if (Number.isNaN(v)) { toast('Enter a number'); return; }
    await addCheckin({ [id]: v });
    toast('Saved');
  });
  on(el, 'change', '[data-target]', async (ev, inp) => {
    const id = inp.dataset.target;
    const v = inp.value === '' ? null : parseFloat(inp.value);
    await store.updateProgress((p) => { p.standards[id].target = Number.isNaN(v) ? null : v; return p; });
    toast('Target saved');
  });
  on(el, 'click', '[data-edit-test]', (ev, b) => { editing = editing === b.dataset.editTest ? null : b.dataset.editTest; draw(); });
  on(el, 'click', '[data-save-test]', async (ev, b) => {
    const id = b.dataset.saveTest;
    const text = $(`[data-test-input="${id}"]`, el).value.trim();
    await store.updateProgress((p) => { p.standards[id].test = text || STANDARDS.find((s) => s.id === id).test; return p; });
    editing = null; draw(); toast('Test text saved');
  });
  on(el, 'click', '[data-weigh]', async () => {
    const inp = $('[data-weigh-input]', el);
    const v = parseFloat(inp.value);
    if (Number.isNaN(v) || v <= 0) { toast('Enter your weight in lb'); return; }
    const day = dayOf(Date.now());
    await store.updateProgress((p) => {
      p.weights = p.weights.filter((w) => dayOf(w.ts) !== day);  // one weigh-in per day
      p.weights.push({ id: uid(), ts: Date.now(), lb: Math.round(v * 10) / 10 });
      return p;
    });
    toast('Weigh-in saved');
  });
  on(el, 'click', '[data-del-weight]', async (ev, b) => {
    await store.updateProgress((p) => { p.weights = p.weights.filter((w) => w.id !== b.dataset.delWeight); return p; });
  });
  on(el, 'click', '[data-del-checkin]', async (ev, b) => {
    if (await confirmSheet({ title: 'Delete check-in?', body: 'This removes the entry from the history.', okLabel: 'Delete', danger: true })) {
      await store.updateProgress((p) => { p.checkins = p.checkins.filter((c) => c.id !== b.dataset.delCheckin); return p; });
    }
  });
  // Chart tap/hover: show nearest value
  on(el, 'pointermove', '[data-chart]', (ev, svg) => chartHover(svg, ev));
  on(el, 'pointerdown', '[data-chart]', (ev, svg) => chartHover(svg, ev));
  return unsub;
}

async function addCheckin(values) {
  await store.updateProgress((p) => { p.checkins.push({ id: uid(), ts: Date.now(), values }); return p; });
}

function standardsView(editing) {
  const p = store.progress;
  const cur = currentValues();
  const metCount = STANDARDS.filter((d) => cur[d.id].met === true).length;
  const badge = (d) => {
    const m = cur[d.id].met;
    return `<div class="badge ${m === true ? 'met' : m === false ? 'no' : ''}"><span class="ic">${m === true ? ICONS.check : m === false ? '○' : '–'}</span><span>${esc(d.name)}</span></div>`;
  };
  const fmtVal = (d, v) => v == null ? '—' : d.kind === 'pass' ? (v ? 'Met' : 'Not yet') : `${fmtLb(v)} ${d.unit}`;
  const cards = STANDARDS.map((d) => {
    const c = cur[d.id];
    const status = c.met === true ? '<span class="pill green">met</span>' : c.met === false ? '<span class="pill">not yet</span>' : '<span class="pill blue">no target</span>';
    const isEditing = editing === d.id;
    let action = '';
    if (d.kind === 'pass') {
      action = `<div class="btn-row"><button class="btn sm" data-pass="${d.id}|no">Not yet</button><button class="btn sm primary" data-pass="${d.id}|yes">${ICONS.check} Met today</button></div>`;
    } else if (!d.auto) {
      action = `<div class="row"><input type="number" inputmode="decimal" step="0.1" placeholder="${esc(d.unit)}" data-value-input="${d.id}" style="flex:1"><button class="btn sm" data-save-value="${d.id}">Save</button></div>`;
    }
    const target = d.kind === 'number'
      ? `<div class="row" style="margin-top:8px"><span class="label small">Target<span class="small muted">${d.lowerIsBetter ? 'at or under' : d.id === 'weight' ? 'within 1%' : 'at or above'}</span></span><input type="number" inputmode="decimal" step="0.5" data-target="${d.id}" value="${p.standards[d.id].target ?? ''}" placeholder="${esc(d.unit)}" style="width:120px"></div>`
      : '';
    return `<section class="card std">
      <div class="card-title"><h3>${esc(d.name)}</h3>${status}</div>
      <div class="row"><span class="label">Now<span class="small muted">${esc(c.source || 'no entry yet')}</span></span><b class="tnum" style="font-size:18px">${fmtVal(d, c.value)}</b></div>
      ${target}
      ${isEditing
        ? `<div style="margin-top:10px"><textarea data-test-input="${d.id}" rows="3" style="width:100%;font:inherit;padding:8px 10px;border-radius:10px;border:1.5px solid var(--line);background:var(--surface);color:var(--text)">${esc(p.standards[d.id].test)}</textarea><div class="btn-row" style="margin-top:6px"><button class="btn sm" data-edit-test="${d.id}">Cancel</button><button class="btn sm primary" data-save-test="${d.id}">Save text</button></div></div>`
        : `<p class="small muted" style="margin:8px 0 10px">${esc(p.standards[d.id].test)} <button class="btn ghost sm" style="min-height:0;padding:0 4px" data-edit-test="${d.id}">Edit</button></p>`}
      ${action}
    </section>`;
  }).join('');

  const recent = [...p.checkins].reverse().slice(0, 12);
  const name = (id) => STANDARDS.find((s) => s.id === id)?.name || id;
  const history = recent.length ? `<section class="card flat"><div class="card-title"><h3>Check-ins</h3><span class="hint">${p.checkins.length} total</span></div><ul class="history">${recent.map((c) => `<li><span>${Object.entries(c.values).map(([k, v]) => `${esc(name(k))}: <b>${v === true ? 'met' : v === false ? 'not yet' : fmtLb(v)}</b>`).join(' · ')}</span><span class="muted tnum">${fmtDate(c.ts)} <button class="btn ghost sm" style="min-height:0;padding:0 4px" data-del-checkin="${c.id}" aria-label="Delete">×</button></span></li>`).join('')}</ul></section>` : '';

  return `<div class="stack">
    <section class="card">
      <div class="card-title"><h2>${metCount} of 6 Standards</h2><span class="hint">the goal of the whole program</span></div>
      <div class="badges">${STANDARDS.map(badge).join('')}</div>
      <p class="small muted" style="margin:10px 0 0">The book defines each Standard with a specific test. The test text and targets here are editable: check them against your copy and adjust. Strength, Speed and Weight fill in automatically from your base weight, sessions and weigh-ins.</p>
    </section>
    ${weightCard(p)}
    ${cards}
    ${history}
  </div>`;
}

function weightCard(p) {
  const ws = p.weights;
  const last = ws[ws.length - 1];
  const change = weeklyChange(ws);
  const target = p.standards.weight?.target;
  const recent = [...ws].reverse().slice(0, 7);
  return `<section class="card">
    <div class="card-title"><h2>Weigh-in</h2><span class="hint">daily, in the morning</span></div>
    <div class="row"><input type="number" inputmode="decimal" step="0.1" placeholder="${last ? fmtLb(last.lb) : 'lb'}" data-weigh-input style="flex:1" aria-label="Weight in lb"><button class="btn primary" data-weigh>Save today</button></div>
    ${last ? `<div class="row" style="margin-top:12px"><span class="label">Latest<span class="small muted">${fmtDate(last.ts)}</span></span><b class="tnum" style="font-size:22px">${fmtLb(last.lb)} lb</b></div>` : ''}
    ${change ? `<div class="row"><span class="label">Change<span class="small muted">over ${change.days} days${target ? ` · weekly target about ${fmtLb(Math.round(target * 0.01 * 10) / 10)} lb` : ''}</span></span><b class="tnum">${change.lb > 0 ? '+' : ''}${fmtLb(Math.round(change.lb * 10) / 10)} lb</b></div>` : ''}
    ${ws.length >= 2 ? lineChart(ws.map((w) => ({ ts: w.ts, v: w.lb })), { target }) : `<p class="small muted" style="margin:10px 0 0">${ws.length ? 'One more weigh-in and the trend appears here.' : 'Log a weigh-in each morning to see the trend.'}</p>`}
    ${recent.length ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">Recent entries</summary><ul class="history" style="margin-top:6px">${recent.map((w) => `<li><span class="tnum">${fmtLb(w.lb)} lb</span><span class="muted tnum">${fmtDate(w.ts)} <button class="btn ghost sm" style="min-height:0;padding:0 4px" data-del-weight="${w.id}" aria-label="Delete">×</button></span></li>`).join('')}</ul></details>` : ''}
  </section>`;
}

// Single-series line chart: one hue, 2px line, visible markers, recessive grid, tap for values.
function lineChart(points, { target = null, days = 90 } = {}) {
  const now = Date.now();
  const pts = points.filter((p) => p.ts >= now - days * 86400000).slice(-200);
  if (pts.length < 2) return '';
  const W = 320, H = 150, L = 36, R = 10, T = 14, B = 24;
  const xs = pts.map((p) => p.ts), ys = pts.map((p) => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys, target ?? Infinity), y1 = Math.max(...ys, target ?? -Infinity);
  const pad = Math.max(1, (y1 - y0) * 0.15); y0 -= pad; y1 += pad;
  const X = (t) => L + ((t - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad].map((v) => Math.round(v * 2) / 2);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const first = pts[0], last = pts[pts.length - 1];
  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" class="chart" data-chart data-pts="${esc(JSON.stringify(pts.map((p) => [Math.round(X(p.ts)), Math.round(Y(p.v)), p.v, p.ts])))}" role="img" aria-label="Weight over the last ${days} days">
      ${ticks.map((v) => `<g><line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(Y(v) + 3.5).toFixed(1)}" class="tick" text-anchor="end">${fmtLb(v)}</text></g>`).join('')}
      ${target != null ? `<line x1="${L}" x2="${W - R}" y1="${Y(target).toFixed(1)}" y2="${Y(target).toFixed(1)}" class="target"/><text x="${W - R}" y="${(Y(target) - 4).toFixed(1)}" class="tick" text-anchor="end">target ${fmtLb(target)}</text>` : ''}
      <path d="${path}" class="line"/>
      ${pts.map((p) => `<circle cx="${X(p.ts).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4" class="mark"/>`).join('')}
      <text x="${X(first.ts).toFixed(1)}" y="${H - 6}" class="tick" text-anchor="start">${fmtDate(first.ts)}</text>
      <text x="${X(last.ts).toFixed(1)}" y="${H - 6}" class="tick" text-anchor="end">${fmtDate(last.ts)}</text>
      <g data-cursor style="display:none"><line class="cursor" y1="${T}" y2="${H - B}"/><circle r="6" class="mark hot"/></g>
    </svg>
    <div class="chart-tip tnum" data-tip>${fmtLb(last.v)} lb · ${fmtDate(last.ts)}</div>
  </div>`;
}

function chartHover(svg, ev) {
  const pts = JSON.parse(svg.dataset.pts || '[]');
  if (!pts.length) return;
  const rect = svg.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 320;
  let best = pts[0];
  for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
  const g = $('[data-cursor]', svg);
  g.style.display = '';
  const line = g.querySelector('line'); line.setAttribute('x1', best[0]); line.setAttribute('x2', best[0]);
  const c = g.querySelector('circle'); c.setAttribute('cx', best[0]); c.setAttribute('cy', best[1]);
  const tip = svg.parentElement.querySelector('[data-tip]');
  if (tip) tip.textContent = `${fmtLb(best[2])} lb · ${fmtDate(best[3])}`;
}

// ── Photos ───────────────────────────────────────────────────────────────
function renderPhotos(el) {
  let tag = 'front';
  let compare = { a: null, b: null };
  const draw = async () => { el.innerHTML = photosView(tag, compare); await fillPhotos(el); };
  draw();
  const unsub = store.subscribe((what) => { if (what === 'progress' || what === 'import' || what === 'photos') draw(); });

  on(el, 'click', '[data-add-photo]', async (ev, b) => {
    const t = $('[data-new-tag].on', el)?.dataset.newTag || 'front';
    const note = $('[data-new-note]', el)?.value.trim() || '';
    try {
      const file = await pickPhoto();
      if (!file) return;
      const blob = await downscale(file, 1280, 0.85);
      const id = uid();
      await store.setPhoto(`progress:${id}`, blob);
      await store.updateProgress((p) => { p.photos.push({ id, ts: Date.now(), tag: t, note }); return p; });
      toast('Photo saved');
    } catch (e) { toast(e.message || 'Could not save photo', { error: true }); }
  });
  on(el, 'click', '[data-new-tag]', (ev, b) => { for (const x of $$('[data-new-tag]', el)) x.classList.toggle('on', x === b); });
  on(el, 'click', '[data-cmp-tag]', (ev, b) => { tag = b.dataset.cmpTag; compare = { a: null, b: null }; draw(); });
  on(el, 'change', '[data-cmp-sel]', (ev, sel) => { compare[sel.dataset.cmpSel] = sel.value; draw(); });
  on(el, 'click', '[data-open-photo]', (ev, b) => openPhoto(b.dataset.openPhoto));
  return unsub;
}

function photosView(tag, compare) {
  const photos = store.progress.photos;
  const ofTag = photos.filter((p) => p.tag === tag);
  const a = ofTag.find((p) => p.id === compare.a) || ofTag[0];
  const b = ofTag.find((p) => p.id === compare.b) || ofTag[ofTag.length - 1];
  const sel = (which, chosen) => `<select data-cmp-sel="${which}" style="width:100%">${ofTag.map((p) => `<option value="${p.id}" ${chosen?.id === p.id ? 'selected' : ''}>${fmtDate(p.ts)}</option>`).join('')}</select>`;
  const byDay = new Map();
  for (const p of [...photos].reverse()) { const d = dayOf(p.ts); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(p); }
  return `<div class="stack">
    <section class="card">
      <div class="card-title"><h2>Add a photo</h2><span class="hint">same spot, same light</span></div>
      <div class="seg compact" style="margin-bottom:10px">${TAGS.map(([v, l], i) => `<button data-new-tag="${v}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row"><input type="text" data-new-note placeholder="Note (optional)" style="flex:1;font:inherit;padding:8px 10px;border-radius:10px;border:1.5px solid var(--line);background:var(--surface);color:var(--text);min-height:40px"><button class="btn primary" data-add-photo>${ICONS.camera} Add</button></div>
      <p class="small muted" style="margin:10px 0 0">Photos stay on this device and go into your backup file. They never leave the phone unless you export.</p>
    </section>
    ${photos.length ? `<section class="card">
      <div class="card-title"><h2>Compare</h2><span class="hint">first vs latest by default</span></div>
      <div class="seg compact" style="margin-bottom:10px">${TAGS.map(([v, l]) => `<button data-cmp-tag="${v}" class="${v === tag ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${ofTag.length >= 2 ? `<div class="compare">
        <div><div class="ph" data-ph="progress:${a.id}" data-open-photo="${a.id}"></div>${sel('a', a)}</div>
        <div><div class="ph" data-ph="progress:${b.id}" data-open-photo="${b.id}"></div>${sel('b', b)}</div>
      </div>` : `<p class="small muted" style="margin:0">${ofTag.length ? 'Add a second ' + tag + ' photo to compare.' : 'No ' + tag + ' photos yet.'}</p>`}
    </section>` : ''}
    <section>
      <div class="card-title"><h2>All photos</h2><span class="hint">${photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''}</span></div>
      ${photos.length ? [...byDay.entries()].map(([d, list]) => `<div class="small muted" style="margin:10px 0 6px;font-weight:600">${fmtDate(new Date(d + 'T12:00'))}</div><div class="photo-grid">${list.map((p) => `<button class="ph" data-ph="progress:${p.id}" data-open-photo="${p.id}" aria-label="${esc(p.tag)} photo ${fmtDate(p.ts)}"><span class="tag">${esc(p.tag)}</span></button>`).join('')}</div>`).join('') : '<p class="empty">No progress photos yet. Add one today so you have a starting point.</p>'}
    </section>
  </div>`;
}

async function fillPhotos(root) {
  for (const el of $$('[data-ph]', root)) {
    const url = await photoURL(el.dataset.ph);
    if (!url || !el.isConnected) continue;
    el.style.backgroundImage = `url("${url}")`;
  }
}

async function openPhoto(id) {
  const p = store.progress.photos.find((x) => x.id === id);
  if (!p) return;
  const url = await photoURL(`progress:${id}`);
  const sh = sheet(`
    <div class="sheet-head"><div><div class="ex-key">${esc(p.tag)}</div><h2>${fmtDate(p.ts)}</h2>${p.note ? `<p class="muted small" style="margin:4px 0 0">${esc(p.note)}</p>` : ''}</div><button class="close" data-close aria-label="Close">×</button></div>
    ${url ? `<img src="${url}" alt="" style="width:100%;border-radius:14px;max-height:70vh;object-fit:contain;background:var(--surface)">` : '<p class="empty">Photo missing</p>'}
    <div class="btn-row" style="margin-top:12px"><button class="btn danger" data-del>Delete photo</button></div>`);
  $('[data-del]', sh.el).addEventListener('click', async () => {
    if (await confirmSheet({ title: 'Delete this photo?', body: 'It cannot be recovered unless you have a backup.', okLabel: 'Delete', danger: true })) {
      await store.deletePhoto(`progress:${id}`);
      await store.updateProgress((q) => { q.photos = q.photos.filter((x) => x.id !== id); return q; });
      sh.close(); toast('Deleted');
    }
  });
}
