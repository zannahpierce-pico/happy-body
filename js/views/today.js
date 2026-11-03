// Today: where you are, the tempo timer, and the exercise cards for the current sequence.
import { store } from '../store.js';
import { session } from '../session.js';
import { byKey, sequence, key as keyOf } from '../data/exercises.js';
import { phaseById, weightLabel, repsFor, repsLabel, repSide, planMinutes } from '../program.js';
import { heroImage } from '../figure.js';
import { photoKey, photoURL } from '../photos.js';
import { esc, on, $, $$, fmtTime, confirmSheet, toast, ICONS } from '../ui.js';
import { openExercise, tempoChips } from './exercise.js';

export function render(main) {
  let unsubs = [];
  const draw = () => { main.innerHTML = view(); afterDraw(main); };
  draw();
  unsubs.push(session.subscribe((what, data) => { if (what === 'state') draw(); else if (what === 'tick') tick(main, data); }));
  on(main, 'click', '[data-act]', (ev, btn) => act(btn.dataset.act, btn));
  on(main, 'click', '[data-ex]', (ev, card) => { if (ev.target.closest('[data-act]')) return; openExercise(byKey[card.dataset.ex]); });
  return () => { for (const u of unsubs) u(); };
}

async function act(a) {
  try {
    switch (a) {
      case 'start': return session.start();
      case 'start-now': return session.start({ skipReady: true });
      case 'pause': return session.pause();
      case 'resume': return session.resume();
      case 'reset': return session.reset();
      case 'skip-ready': return session.skipReady();
      case 'done': return session.done();
      case 'skip': {
        if (await confirmSheet({ title: 'Skip this exercise?', body: 'It will be logged as skipped so the round still counts. You can undo it.', okLabel: 'Skip' })) await session.skip();
        return;
      }
      case 'undo': {
        if (await confirmSheet({ title: 'Undo last exercise?', body: 'Removes the most recent entry for today.', okLabel: 'Undo' })) { await session.undo(); toast('Undone'); }
        return;
      }
      case 'relax': return session.startRelax();
      case 'relax-done': return session.finishRelax();
      case 'relax-skip': return session.finishRelax();
      default: return null;
    }
  } catch (e) { toast(e.message || 'Something went wrong', { error: true }); }
}

function view() {
  const s = store.settings;
  const pos = session.position;
  const mode = session.mode;
  const phase = phaseById(s.phase);
  const parts = [];

  if (mode === 'complete') {
    parts.push(completeCard());
  } else if (mode === 'relaxWait' || mode === 'relax') {
    parts.push(relaxCard(mode));
  } else {
    parts.push(progressStrip(pos, phase));
    parts.push(timerPanel(pos, mode));
  }

  if (!pos.complete) parts.push(exerciseList(pos));
  else if (mode === 'complete') parts.push(dayRecap());

  parts.push(`<div class="row" style="justify-content:center;padding:4px 0">
    ${session.entries.length ? `<button class="btn ghost sm" data-act="undo">Undo last</button>` : `<span class="muted small">${phase.label}: ${esc(phase.short)} · about ${planMinutes(s.phase, s)} min</span>`}
  </div>`);
  return `<div class="stack">${parts.join('')}</div>`;
}

function progressStrip(pos, phase) {
  const cur = pos.current;
  const blocks = phase.plan.map(([seq, rounds]) => {
    const dots = [];
    for (let r = 1; r <= rounds; r++) {
      const doneIdx = pos.slots.findIndex((sl) => sl.seq === seq && sl.round === r);
      const endIdx = doneIdx + 6;
      const cls = pos.index >= endIdx ? 'done' : (cur && cur.seq === seq && cur.round === r) ? 'cur' : '';
      dots.push(`<i class="dot ${cls}"></i>`);
    }
    return `<div class="blk" title="Sequence ${seq}">${dots.join('')}</div>`;
  }).join('');
  const pct = Math.round((pos.index / pos.total) * 100);
  return `<div class="card" style="padding:14px 16px">
    <div class="progress-strip">
      <div><div class="seqname">Sequence ${cur.seq}</div><div class="muted small">Round <b class="tnum">${cur.round}</b> of ${cur.rounds} · Exercise ${cur.n} of 6</div></div>
      <div class="round-dots">${blocks}</div>
    </div>
    <div class="bar" aria-label="Progress ${pct}%"><i style="width:${pct}%"></i></div>
  </div>`;
}

function timerPanel(pos, mode) {
  const e = byKey[pos.current.key];
  const s = store.settings;
  const reps = repsFor(e, s);
  const lv = s.levels[keyOf(e)] || 5;
  const t = session.tstate;
  const k = keyOf(e);
  const running = mode === 'running' || mode === 'paused';
  const ready = mode === 'ready' || mode === 'ready-paused';

  let display;
  if (ready) {
    display = `<div class="phase-display k-count" data-phase-display>
      <div class="phase" data-phase>Get ready</div>
      <div class="count" data-count>${t ? t.remaining : s.timer.getReady}</div>
      <div class="rep">${esc(repsLabel(e, s))}</div>
    </div>`;
  } else if (running && t) {
    display = `<div class="phase-display k-${t.kind}" data-phase-display>
      <div class="phase" data-phase>${esc(t.label)}</div>
      <div class="count" data-count>${t.remaining}</div>
      <div class="rep" data-rep>${repLine(e, t, reps)}</div>
    </div>
    <div class="phase-track" data-track>${e.phases.map((p, i) => `<span class="k-${p[2]} ${i < t.phaseIdx ? 'done' : i === t.phaseIdx ? 'cur' : ''}" style="--w:${p[1]};--p:${Math.round(t.phaseProgress * 100)}%"></span>`).join('')}</div>
    <div class="rep-dots" data-dots>${Array.from({ length: reps }, (_, i) => `<i class="${i + 1 < t.rep ? 'done' : i + 1 === t.rep ? 'cur' : ''}"></i>`).join('')}</div>`;
  } else {
    display = `<div style="padding:12px 0 14px">${tempoChips(e)}</div>`;
  }

  let buttons;
  if (ready) {
    buttons = `<div class="btn-row">
      <button class="btn" data-act="${mode === 'ready' ? 'pause' : 'resume'}">${mode === 'ready' ? 'Pause' : 'Resume'}</button>
      <button class="btn primary" data-act="skip-ready">Start now</button>
      <button class="btn ghost" data-act="reset">Cancel</button>
    </div>`;
  } else if (mode === 'running') {
    buttons = `<div class="btn-row">
      <button class="btn" data-act="pause">Pause</button>
      <button class="btn primary" data-act="done">${ICONS.check} Done</button>
    </div>
    <div class="btn-row" style="margin-top:8px"><button class="btn ghost sm" data-act="reset">Reset timer</button><button class="btn ghost sm" data-act="skip">Skip</button></div>`;
  } else if (mode === 'paused') {
    buttons = `<div class="btn-row">
      <button class="btn brass" data-act="resume">Resume</button>
      <button class="btn primary" data-act="done">${ICONS.check} Done</button>
    </div>
    <div class="btn-row" style="margin-top:8px"><button class="btn ghost sm" data-act="reset">Reset timer</button><button class="btn ghost sm" data-act="skip">Skip</button></div>`;
  } else {
    buttons = `<button class="btn primary big block" data-act="start">Start timer</button>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn" data-act="done">${ICONS.check} Done without timer</button>
      <button class="btn ghost" data-act="skip" style="flex:0 0 auto">Skip</button>
    </div>`;
  }

  return `<section class="timer" data-timer="${k}">
    <div class="head">
      <div>
        <div class="ex-key">${k} · ${running || ready ? esc(mode === 'paused' || mode === 'ready-paused' ? 'Paused' : 'Now') : 'Up now'}</div>
        <div class="ex-name">${esc(e.name)}</div>
        <div class="ex-meta">${esc(weightLabel(e, s.base))} · ${esc(repsLabel(e, s))} · Level ${lv}</div>
      </div>
      <button class="hero" data-ex="${k}" aria-label="Show ${esc(e.name)} details" data-hero="${photoKey(k, 'step', 1)}" style="border:0;cursor:pointer">${heroImage(e.images)}</button>
    </div>
    ${display}
    ${buttons}
  </section>`;
}

function repLine(e, t, reps) {
  const side = repSide(e, t.rep, reps);
  return `Rep <b>${t.rep}</b> of ${reps}${side ? ` · <b>${esc(side)}</b>` : ''}`;
}

function tick(main, t) {
  const el = $('[data-phase-display]', main);
  if (!el) return;
  const mode = session.mode;
  const count = $('[data-count]', el);
  if (mode === 'relax') { if (count) count.textContent = fmtTime(Math.max(0, (1 - t.phaseProgress) * t.phaseSeconds * 1000)); return; }
  if (count && count.textContent !== String(t.remaining)) count.textContent = t.remaining;
  if (mode === 'ready' || mode === 'ready-paused') return;
  const e = session.exercise;
  if (!e) return;
  const reps = repsFor(e, store.settings);
  const ph = $('[data-phase]', el);
  if (ph.textContent !== t.label) { ph.textContent = t.label; el.className = `phase-display k-${t.kind}`; }
  const rep = $('[data-rep]', el);
  const line = repLine(e, t, reps);
  if (rep && rep.innerHTML !== line) rep.innerHTML = line;
  const track = $('[data-track]', main);
  if (track) {
    const spans = track.children;
    for (let i = 0; i < spans.length; i++) {
      const cls = i < t.phaseIdx ? 'done' : i === t.phaseIdx ? 'cur' : '';
      const want = `k-${e.phases[i][2]} ${cls}`;
      if (spans[i].className !== want) spans[i].className = want;
      if (i === t.phaseIdx) spans[i].style.setProperty('--p', `${Math.round(t.phaseProgress * 100)}%`);
    }
  }
  const dots = $('[data-dots]', main);
  if (dots) {
    const ds = dots.children;
    for (let i = 0; i < ds.length; i++) {
      const cls = i + 1 < t.rep ? 'done' : i + 1 === t.rep ? 'cur' : '';
      if (ds[i].className !== cls) ds[i].className = cls;
    }
  }
}

function exerciseList(pos) {
  const cur = pos.current;
  const s = store.settings;
  const exs = sequence(cur.seq);
  const entries = session.entries;
  // entries for this round: slots with same seq & round that are already done
  const doneMap = new Map();
  for (let i = 0; i < pos.index; i++) {
    const sl = pos.slots[i];
    if (sl.seq === cur.seq && sl.round === cur.round) doneMap.set(sl.key, entries[i]);
  }
  const cards = exs.map((e) => {
    const k = keyOf(e);
    const done = doneMap.get(k);
    const isCur = k === cur.key;
    const cls = done ? (done.skipped ? 'done skipped' : 'done') : isCur ? 'cur' : '';
    const st = done ? (done.skipped ? '–' : ICONS.check) : isCur ? '▶' : `<span class="muted">${e.n}</span>`;
    return `<div class="ex-card ${cls}" data-ex="${k}" data-thumb="${photoKey(k, 'step', 1)}" role="button" tabindex="0">
      <div class="thumb">${heroImage(e.images)}</div>
      <div><div class="k">${k}</div><div class="n">${esc(e.name)}</div><div class="m">${esc(weightLabel(e, s.base))} · ${repsFor(e, s)} reps · L${s.levels[k] || 5}</div></div>
      <div class="st">${st}</div>
    </div>`;
  }).join('');
  const nextBlocks = phaseById(s.phase).plan.filter(([seq]) => seq > cur.seq);
  const next = nextBlocks.length ? `<p class="muted small" style="margin:10px 0 0;text-align:center">Then ${nextBlocks.map(([seq, r]) => `Sequence ${seq} × ${r}`).join(', ')}</p>` : '';
  return `<section>
    <div class="card-title"><h2>Sequence ${cur.seq}</h2><span class="hint">tap a card for setup, steps and levels</span></div>
    <div class="ex-list">${cards}</div>${next}
  </section>`;
}

function relaxCard(mode) {
  const s = store.settings;
  const t = session.tstate;
  if (mode === 'relax') {
    return `<section class="timer">
      <div class="head"><div><div class="ex-key">Last step</div><div class="ex-name">Relax</div><div class="ex-meta">Lie still, breathe slowly, let the body settle.</div></div></div>
      <div class="phase-display k-count" data-phase-display>
        <div class="phase" data-phase>Lie still</div>
        <div class="count" data-count style="font-size:72px">${t ? fmtTime((t.phaseSeconds - (t.phaseSeconds * t.phaseProgress)) * 1000) : fmtTime(s.timer.relaxMinutes * 60000)}</div>
      </div>
      <button class="btn primary block" data-act="relax-done">${ICONS.check} Finish</button>
    </section>`;
  }
  return `<section class="timer">
    <div class="head"><div><div class="ex-key">All rounds done</div><div class="ex-name">Now relax</div><div class="ex-meta">The Gregoreks count rest as part of the program. ${s.timer.relaxMinutes} minutes lying still, then you're done for the day.</div></div></div>
    <div style="height:12px"></div>
    <button class="btn primary big block" data-act="relax">Start ${s.timer.relaxMinutes}-minute relax</button>
    <div class="btn-row" style="margin-top:8px"><button class="btn ghost" data-act="relax-skip">Skip and finish</button></div>
  </section>`;
}

function completeCard() {
  const m = session.meta;
  const ms = session.elapsedMs();
  return `<section class="card complete-card">
    <div class="ex-key">Today</div>
    <div class="big">Done. Nicely done.</div>
    <p class="muted">${m?.startedAt ? `Session time <b class="tnum">${fmtTime(ms)}</b>` : ''}</p>
    <p class="muted small" style="margin:0">Streak, Standards and photos live under Progress. Same time tomorrow.</p>
  </section>`;
}

function dayRecap() {
  const entries = session.entries;
  const timed = entries.filter((e) => e.timed).length;
  const skipped = entries.filter((e) => e.skipped).length;
  return `<section class="card flat">
    <div class="row"><span class="label">Exercises logged</span><b class="tnum">${entries.length}</b></div>
    <div class="row"><span class="label">With the timer</span><b class="tnum">${timed}</b></div>
    ${skipped ? `<div class="row"><span class="label">Skipped</span><b class="tnum">${skipped}</b></div>` : ''}
  </section>`;
}

// After each draw, swap generated drawings for stored photos where they exist.
async function afterDraw(main) {
  for (const el of $$('[data-thumb],[data-hero]', main)) {
    const key = el.dataset.thumb || el.dataset.hero;
    const url = await photoURL(key);
    if (!url || !el.isConnected) continue;
    const box = el.dataset.thumb ? $('.thumb', el) : el;
    const img = document.createElement('img'); img.src = url; img.alt = '';
    box.replaceChildren(img);
  }
}

