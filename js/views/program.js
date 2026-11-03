// Program: phase, base weight, reps, computed weight table, per-exercise levels, soreness flow, history.
import { store } from '../store.js';
import { session } from '../session.js';
import { EXERCISES, key as keyOf, byKey } from '../data/exercises.js';
import { PHASES, phaseById, weightFor, repsFor, round05, applySoreness, increment, suggestedPhase, planMinutes } from '../program.js';
import { esc, on, $, $$, toast, sheet, confirmSheet, fmtLb, fmtDate } from '../ui.js';
import { openExercise } from './exercise.js';

export function render(main) {
  const draw = () => { main.innerHTML = view(); };
  draw();
  const unsub = store.subscribe((what) => { if (what === 'settings' || what === 'import') draw(); });

  on(main, 'click', '[data-phase]', async (ev, b) => {
    const id = b.dataset.phase;
    if (id === store.settings.phase) return;
    await store.setSettings({ phase: id }, { type: 'phase', to: id });
    toast(`${phaseById(id).label}: ${phaseById(id).short}`);
  });
  on(main, 'click', '[data-base]', async (ev, b) => {
    const delta = Number(b.dataset.base);
    const from = store.settings.base;
    const to = Math.max(0.5, round05(from + delta));
    if (to === from) return;
    await store.setSettings({ base: to }, { type: 'base', from, to });
  });
  on(main, 'click', '[data-reps]', async (ev, b) => {
    const r = Number(b.dataset.reps);
    if (r === store.settings.reps) return;
    await store.setSettings({ reps: r }, { type: 'reps', to: r });
  });
  on(main, 'click', '[data-sex]', (ev, b) => store.setSettings({ sex: b.dataset.sex }));
  on(main, 'click', '[data-lv]', async (ev, b) => {
    const [k, lv] = b.dataset.lv.split('|');
    const prev = store.settings.levels[k] || 5;
    if (Number(lv) === prev) return;
    await store.setSettings({ levels: { [k]: Number(lv) } }, { type: 'level', key: k, from: prev, to: Number(lv) });
  });
  on(main, 'click', '[data-open]', (ev, b) => openExercise(byKey[b.dataset.open]));
  on(main, 'click', '[data-sore]', () => soreFlow());
  on(main, 'click', '[data-raise]', () => raiseFlow());
  on(main, 'change', '[data-start]', async (ev, inp) => {
    await store.setSettings({ programStart: inp.value || null });
    toast(inp.value ? 'Start date saved' : 'Start date cleared');
  });
  return unsub;
}

function view() {
  const s = store.settings;
  const week = session.week;
  const sugg = suggestedPhase(week);
  const inc = increment(s.sex);
  return `<div class="stack">
    <section class="card">
      <div class="card-title"><h2>Phase</h2><span class="hint">${week ? `week ${week} of the program` : 'set a start date below'}</span></div>
      <div class="seg" role="radiogroup">
        ${PHASES.map((p) => `<button data-phase="${p.id}" class="${s.phase === p.id ? 'on' : ''}" role="radio" aria-checked="${s.phase === p.id}">${esc(p.label)}</button>`).join('')}
      </div>
      <p class="small muted" style="margin:10px 0 0">${esc(phaseById(s.phase).note)} About ${planMinutes(s.phase, s)} minutes with the current timer settings.</p>
      ${sugg && sugg !== s.phase ? `<p class="small" style="margin:8px 0 0"><span class="pill blue">Hint</span> By the calendar you're in week ${week}, which usually means <b>${esc(phaseById(sugg).label)}</b>. Stay where you are if you were sore or stiff this week.</p>` : ''}
      <div class="divider"></div>
      <div class="row">
        <span class="label">Program start<span class="small muted">Day 1 of week 1</span></span>
        <input type="date" data-start value="${esc(s.programStart || '')}" max="${new Date().toISOString().slice(0, 10)}">
      </div>
    </section>

    <section class="card">
      <div class="card-title"><h2>Base weight</h2><span class="hint">1:1 Standing Tall, per hand</span></div>
      <div class="row">
        <div class="stepper" aria-label="Base weight">
          <button data-base="-0.5" aria-label="Lower by half a pound">−</button>
          <div class="val tnum">${fmtLb(s.base)} lb</div>
          <button data-base="0.5" aria-label="Raise by half a pound">+</button>
        </div>
        <button class="btn sm brass" data-raise>Raise +${inc} lb</button>
      </div>
      <p class="small muted" style="margin:10px 0 0">Every other weight is a percentage of this one (Table 8.2 / 8.3), rounded to the nearest half pound. Follow the percentages even when a weight feels light.</p>
      <div class="divider"></div>
      <div class="row">
        <span class="label">Reps on lifts<span class="small muted">6 to gain or keep muscle · 3 to lose or maintain</span></span>
        <div class="seg compact" style="width:120px"><button data-reps="6" class="${s.reps === 6 ? 'on' : ''}">6</button><button data-reps="3" class="${s.reps === 3 ? 'on' : ''}">3</button></div>
      </div>
      <div class="row">
        <span class="label">Weekly increment<span class="small muted">once a session takes 30 min</span></span>
        <div class="seg compact" style="width:150px"><button data-sex="f" class="${s.sex !== 'm' ? 'on' : ''}">+1 lb</button><button data-sex="m" class="${s.sex === 'm' ? 'on' : ''}">+2 lb</button></div>
      </div>
      <div class="divider"></div>
      <button class="btn block" data-sore>Sore or stiff this week?</button>
    </section>

    <section class="card">
      <div class="card-title"><h2>Weights & levels</h2><span class="hint">tap a name for details</span></div>
      <div class="wl">
        ${phaseById(s.phase).plan.map(([seq]) => `
          <div class="seqh">Sequence ${seq}</div>
          ${EXERCISES.filter((e) => e.seq === seq).map((e) => {
            const k = keyOf(e);
            const lv = s.levels[k] || 5;
            return `<div class="wrow">
              <button class="name" data-open="${k}"><span class="k">${k}</span>${esc(e.name)}</button>
              <div class="w">${e.lift ? `${fmtLb(weightFor(e, s.base))} lb` : '<span class="muted">no weight</span>'}</div>
              <div class="meta">${e.lift ? `${e.pct}% · ${esc(e.hands)} · ${repsFor(e, s)} reps` : '6 reps'}</div>
              <div class="lv" role="radiogroup" aria-label="Level for ${esc(e.name)}">${[1, 2, 3, 4, 5].map((n) => `<button data-lv="${k}|${n}" class="${lv === n ? 'on' : ''}" aria-checked="${lv === n}">${n}</button>`).join('')}</div>
            </div>`;
          }).join('')}`).join('')}
      </div>
    </section>

    <section class="card flat">
      <div class="card-title"><h3>Rules of thumb</h3></div>
      <ul class="small muted" style="margin:0;padding-left:18px">
        <li><b>Week 1.</b> Sequence 1 only, six rounds.</li>
        <li><b>Week 2.</b> Sore or stiff? Repeat Sequence 1 another week and drop a level on the exercises causing it. Otherwise add Sequence 2 and do four rounds of each.</li>
        <li><b>Week 3.</b> Add Sequence 3; three rounds of each.</li>
        <li><b>Week 4–6.</b> Nothing sore and the weights feel comfortable? Raise the base weight and let the table recompute.</li>
        <li><b>Week 7+.</b> Aim for 40–50 minutes, then about 30. Once you're at 30, add ${inc} lb to the base, adapt, repeat until all six Happy Body Standards are met, then maintain.</li>
      </ul>
    </section>

    ${historyCard()}
  </div>`;
}

function historyCard() {
  const items = [...store.history].reverse().slice(0, 30);
  if (!items.length) return '';
  const line = (h) => {
    switch (h.type) {
      case 'base': return `Base weight ${fmtLb(h.from)} → <b>${fmtLb(h.to)} lb</b>`;
      case 'level': return `${h.key} ${esc(byKey[h.key]?.name || '')} level ${h.from} → <b>${h.to}</b>`;
      case 'phase': return `Phase → <b>${esc(phaseById(h.to).label)}</b>`;
      case 'reps': return `Reps on lifts → <b>${h.to}</b>`;
      case 'sore': return `Sore week: ${esc((h.keys || []).join(', '))}${h.baseDropped ? ' · base −1 lb' : ''}`;
      default: return esc(h.type);
    }
  };
  return `<section class="card flat">
    <div class="card-title"><h3>History</h3><span class="hint">${store.history.length} changes</span></div>
    <ul class="history">${items.map((h) => `<li><span>${line(h)}</span><span class="muted tnum">${fmtDate(h.ts)}</span></li>`).join('')}</ul>
  </section>`;
}

async function soreFlow() {
  const s = store.settings;
  const active = phaseById(s.phase).plan.map(([seq]) => seq);
  const exs = EXERCISES.filter((e) => active.includes(e.seq));
  const sh = sheet(`
    <div class="sheet-head"><div><h2>Sore or stiff?</h2><p class="muted small" style="margin:4px 0 0">Pick the exercises causing it. Each drops one level. An exercise already at level 1 drops the base weight by 1 lb instead.</p></div><button class="close" data-close aria-label="Close">×</button></div>
    <div class="ex-list" style="margin-bottom:14px">
      ${exs.map((e) => { const k = keyOf(e); return `<label class="ex-card" style="grid-template-columns:auto 1fr auto"><input type="checkbox" value="${k}" style="width:22px;height:22px"><div><div class="k">${k}</div><div class="n">${esc(e.name)}</div><div class="m">Level ${s.levels[k] || 5}${e.lift ? ` · ${fmtLb(weightFor(e, s.base))} lb` : ''}</div></div><span></span></label>`; }).join('')}
    </div>
    <div class="btn-row"><button class="btn" data-close>Cancel</button><button class="btn primary" data-apply>Apply</button></div>
    <p class="small muted" style="margin:12px 0 0">The book's rule for week 2 is to repeat the current week before moving on, so the phase stays as it is.</p>`);
  $('[data-apply]', sh.el).addEventListener('click', async () => {
    const keys = $$('input:checked', sh.el).map((i) => i.value);
    if (!keys.length) { toast('Nothing selected'); return; }
    const { settings, baseDropped } = applySoreness(store.settings, keys);
    await store.setSettings({ levels: settings.levels, base: settings.base }, { type: 'sore', keys, baseDropped });
    sh.close();
    toast(baseDropped ? 'Levels dropped and base weight −1 lb' : 'Levels dropped');
  });
}

async function raiseFlow() {
  const s = store.settings;
  const inc = increment(s.sex);
  const to = round05(s.base + inc);
  const ok = await confirmSheet({
    title: `Raise base to ${fmtLb(to)} lb?`,
    body: `Only if nothing is sore and the weights feel comfortable. Every exercise recomputes: 1:4 becomes ${fmtLb(weightFor(byKey['1:4'], to))} lb, 1:5 ${fmtLb(weightFor(byKey['1:5'], to))} lb, 1:6 ${fmtLb(weightFor(byKey['1:6'], to))} lb.`,
    okLabel: 'Raise',
  });
  if (!ok) return;
  await store.setSettings({ base: to }, { type: 'base', from: s.base, to });
  toast(`Base weight is now ${fmtLb(to)} lb`);
}

