// Today: round bar, the current exercise with its tempo, the ring timer, and the
// day's sequences as collapsible ruled sections.
import { store } from '../store.js';
import { session } from '../session.js';
import { byKey, sequence, key as keyOf } from '../data/exercises.js';
import { phaseById, weightLabel, repsFor, repsLabel, repSide, kitFor } from '../program.js';
import { heroImage, stepImages } from '../figure.js';
import { photoKey, photoURL } from '../photos.js';
import { esc, on, $, $$, fmtTime, confirmSheet, toast, ICONS } from '../ui.js';
import { openExercise } from './exercise.js';

const RING_R = 128;
const RING_C = Math.round(2 * Math.PI * RING_R * 100) / 100;
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const CHEV_UP = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
const CHEV_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

// Which sequence sections the person has opened or closed by hand this visit.
const toggled = new Map();

export function render(main) {
  let unsubs = [];
  const draw = () => { main.innerHTML = view(); afterDraw(main); };
  draw();
  unsubs.push(session.subscribe((what, data) => { if (what === 'state') draw(); else if (what === 'tick') tick(main, data); }));
  on(main, 'click', '[data-act]', (ev, btn) => act(btn.dataset.act, btn));
  on(main, 'click', '[data-ex]', (ev, el) => { if (ev.target.closest('[data-act]')) return; openExercise(byKey[el.dataset.ex]); });
  on(main, 'click', '[data-seq]', (ev, btn) => {
    const seq = Number(btn.dataset.seq);
    toggled.set(seq, !isOpen(seq));
    draw();
  });
  return () => { for (const u of unsubs) u(); };
}

async function act(a) {
  try {
    switch (a) {
      case 'start': return session.start();
      case 'pause': return session.pause();
      case 'resume': return session.resume();
      case 'reset': return session.reset();
      case 'restart-rep': return session.restartRep();
      case 'skip-ready': return session.skipReady();
      case 'done': return session.done();
      case 'skip': {
        if (await confirmSheet({ title: 'Skip this exercise?', body: 'It is logged as skipped so the round still counts. You can undo it.', okLabel: 'Skip' })) await session.skip();
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

function isOpen(seq) {
  if (toggled.has(seq)) return toggled.get(seq);
  const cur = session.position.current;
  return !!cur && cur.seq === seq;
}

function view() {
  const pos = session.position;
  const mode = session.mode;
  const parts = [];

  if (mode === 'complete') {
    parts.push(completeCard(), dayRecap());
  } else if (mode === 'relaxWait' || mode === 'relax') {
    parts.push(relaxCard(mode));
  } else {
    parts.push(head(pos, mode));
    if (mode === 'idle' && !session.entries.length) parts.push(kitLine());
    parts.push(timerPanel(pos, mode));
    parts.push(sequences(pos));
  }

  if (session.entries.length && mode !== 'complete') {
    parts.push(`<div class="btn-row quiet"><button class="btn ghost sm" data-act="undo">Undo last</button></div>`);
  }
  return `<div class="stack">${parts.join('')}</div>`;
}

// Before the day starts: the dumbbells (and bench) the whole day needs.
function kitLine() {
  const s = store.settings;
  const kit = kitFor(s.phase, s);
  const parts = kit.dumbbells.map((d) => `<span><b>${d.n} × ${d.lb} lb</b>${d.or ? ` or two of the ${d.or} lb` : ''}</span>`);
  if (kit.bench) parts.push('<span><b>a bench or chair</b> for the squats</span>');
  if (!parts.length) return '';
  return `<div class="kit"><span class="kit-t">Have ready</span>${parts.join('')}</div>`;
}

// Round bar for the current sequence, and while the timer runs, the six-exercise strip.
function head(pos, mode) {
  const cur = pos.current;
  const bar = [];
  for (let r = 1; r <= cur.rounds; r++) {
    const cls = r < cur.round ? 'done' : r === cur.round ? 'cur' : '';
    bar.push(`<i class="${cls}"></i>`);
  }
  const active = mode !== 'idle';
  return `<div>
    <div class="round-bar" aria-label="Round ${cur.round} of ${cur.rounds}">${bar.join('')}</div>
    ${active ? `<div class="ex-strip" aria-label="Exercise ${cur.n} of 6">${strip(pos)}</div>` : ''}
  </div>`;
}

function strip(pos) {
  const cur = pos.current;
  const done = doneThisRound(pos);
  return sequence(cur.seq).map((e) => {
    const k = keyOf(e);
    const d = done.get(k);
    if (d) return `<i class="${d.skipped ? 'skipped' : 'done'}">${d.skipped ? '–' : ICONS.check}</i>`;
    return `<i class="${k === cur.key ? 'cur' : ''}">${e.n}</i>`;
  }).join('');
}

function doneThisRound(pos) {
  const cur = pos.current;
  const entries = session.entries;
  const map = new Map();
  for (let i = 0; i < pos.index; i++) {
    const sl = pos.slots[i];
    if (sl.seq === cur.seq && sl.round === cur.round) map.set(sl.key, entries[i]);
  }
  return map;
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
  const compact = running || ready;

  // The ring sits beside the current step's picture; the rep dots and tempo strip go under both.
  let body = '', below = '';
  if (ready) {
    body = ring('k-count', `
      <div class="phase" data-phase>Get ready</div>
      <div class="count" data-count>${t ? t.remaining : s.timer.getReady}</div>
      <div class="rep">${esc(repsLabel(e, s))}</div>`, 0);
  } else if (running && t) {
    body = ring(`k-${t.kind}`, `
      <div class="phase" data-phase>${esc(t.label)}</div>
      <div class="count" data-count>${t.remaining}</div>
      <div class="rep" data-rep>${repLine(e, t, reps)}</div>`, t.repProgress, t.phaseSeconds);
    below = `<div class="rep-dots ${reps > 6 ? 'many' : ''}" data-dots>${Array.from({ length: reps }, (_, i) => `<i class="${i + 1 < t.rep ? 'done' : i + 1 === t.rep ? 'cur' : ''}">${i + 1}</i>`).join('')}</div>`
      + track(e, t);
  } else {
    below = track(e, null);
  }

  let acts;
  if (ready) {
    acts = `<div class="btn-row">
      <button class="btn primary big" data-act="skip-ready">Start now</button>
      <button class="btn ghost" data-act="reset" style="flex:0 0 auto">Cancel</button>
    </div>`;
  } else if (mode === 'running') {
    // The timer logs the exercise itself when the last rep ends; marking it done early is the exception.
    acts = `<button class="btn big block" data-act="pause">Pause</button>
    <div class="btn-row quiet"><button class="btn ghost sm" data-act="done">Mark done</button><button class="btn ghost sm" data-act="skip">Skip</button></div>`;
  } else if (mode === 'paused') {
    acts = `<button class="btn brass big block" data-act="resume">Resume</button>
    <div class="btn-row quiet"><button class="btn ghost sm" data-act="restart-rep">Restart rep</button><button class="btn ghost sm" data-act="done">Mark done</button><button class="btn ghost sm" data-act="skip">Skip</button><button class="btn ghost sm" data-act="reset">Cancel</button></div>`;
  } else {
    acts = `<button class="btn primary big block" data-act="start">Start timer</button>
    <div class="btn-row quiet"><button class="btn ghost sm" data-act="done">Done without timer</button><button class="btn ghost sm" data-act="skip">Skip</button></div>`;
  }

  const meta = compact
    ? esc(weightLabel(e, s.base))
    : `${esc(weightLabel(e, s.base))}, ${esc(repsLabel(e, s))}, <button class="lvl" data-ex="${k}" aria-label="Level ${lv}, change level">level ${lv}${CHEV_SM}</button>`;

  return `<section class="timer ${compact ? 'compact' : ''}" data-timer="${k}">
    <div class="head">
      <div style="min-width:0">
        ${compact ? '' : `<div class="ex-key">Exercise ${e.n} of 6</div>`}
        <h1 class="ex-name">${esc(e.name)}</h1>
        <div class="ex-meta">${meta}</div>
      </div>
      <button class="hero" data-ex="${k}" aria-label="Show ${esc(e.name)} details" data-hero="${photoKey(k, 'step', 1)}">${heroImage(e.images)}</button>
    </div>
    ${compact ? `<div class="stage-wrap">${stage(e, k, running ? t : null)}${body}</div>` : ''}${below}
    <div class="acts">${acts}</div>
  </section>`;
}

// Which step the timer is on: stepOf maps each phase to a step, or to several
// steps spread over that phase's seconds. Before the timer runs, the start position.
function stepAt(e, t) {
  const m = t && e.stepOf ? e.stepOf[t.phaseIdx] : 0;
  if (Array.isArray(m)) return m[Math.min(m.length - 1, Math.floor(t.phaseProgress * m.length))];
  return m ?? 0;
}

// The current step, large: every step's drawing is in the DOM (photos replace them
// after the draw) and the tick only switches which one shows.
function stage(e, k, t) {
  const imgs = stepImages(e.images);
  const cur = stepAt(e, t);
  const n = e.steps.length;
  const figs = e.steps.map((_, i) => `<div class="step-fig ${i === cur ? 'cur' : ''}" data-step="${photoKey(k, 'step', i)}">${imgs[i] || ''}</div>`).join('');
  return `<button class="stage" data-ex="${k}" data-stage aria-label="Show ${esc(e.name)} details">
    <div class="step-figs">${figs}</div>
    <div class="step-cap" data-step-cap><b>Step ${cur + 1} of ${n}</b> ${esc(e.steps[cur])}</div>
  </button>`;
}

function showStep(main, e, i) {
  const figs = $('[data-stage] .step-figs', main);
  if (!figs || figs.children[i]?.classList.contains('cur')) return;
  for (let j = 0; j < figs.children.length; j++) figs.children[j].classList.toggle('cur', j === i);
  const cap = $('[data-step-cap]', main);
  if (cap) cap.innerHTML = `<b>Step ${i + 1} of ${e.steps.length}</b> ${esc(e.steps[i])}`;
}

function ring(kind, inner, progress, seconds = 2) {
  const off = Math.round(RING_C * (1 - progress) * 100) / 100;
  return `<div class="ring ${kind}" data-ring style="--dur:${seconds}s">
    <svg class="arc" viewBox="0 0 272 272" aria-hidden="true">
      <circle class="track" cx="136" cy="136" r="${RING_R}"/>
      <circle class="prog" cx="136" cy="136" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${off}" transform="rotate(-90 136 136)" data-arc/>
    </svg>
    <div class="breath"></div>
    <div class="phase-display ${kind}" data-phase-display>${inner}</div>
  </div>`;
}

// The tempo strip: one block per phase, width by seconds, labels under.
function track(e, t) {
  const blocks = e.phases.map((p, i) => {
    const cls = t ? (i < t.phaseIdx ? 'done' : i === t.phaseIdx ? 'cur' : '') : '';
    return `<span class="k-${p[2]} ${cls}" style="--w:${p[1]};--p:${t && i === t.phaseIdx ? Math.round(t.phaseProgress * 100) : 0}%"></span>`;
  }).join('');
  const words = e.phases.map((p, i) => `<span class="${t && i === t.phaseIdx ? 'cur' : ''}">${i ? esc(p[0].toLowerCase()) : esc(p[0])}${p[1] > 1 ? ` ${p[1]}` : ''}</span>`).join(', ');
  return `<div class="phase-track" data-track>${blocks}</div><div class="phase-labels" data-labels>${words}</div>`;
}

function repLine(e, t, reps) {
  const side = repSide(e, t.rep, reps);
  const next = e.phases[t.phaseIdx + 1];
  const then = next ? `then ${esc(next[0].toLowerCase())}, ${next[1]} s` : `rep ${t.rep} of ${reps}`;
  return side ? `<b>${esc(side)}</b>, ${then}` : then;
}

function tick(main, t) {
  const el = $('[data-phase-display]', main);
  if (!el) return;
  const mode = session.mode;
  const count = $('[data-count]', el);
  if (mode === 'relax') { if (count) count.textContent = fmtTime(Math.max(0, (1 - t.phaseProgress) * t.phaseSeconds * 1000)); return; }
  if (count && count.textContent !== String(t.remaining)) count.textContent = t.remaining;
  const arc = $('[data-arc]', main);
  // One full turn per rep (the count shows the phase). The ready countdown is a single phase.
  if (arc) arc.setAttribute('stroke-dashoffset', Math.round(RING_C * (1 - t.repProgress) * 100) / 100);
  if (mode === 'ready' || mode === 'ready-paused') return;
  const e = session.exercise;
  if (!e) return;
  const reps = repsFor(e, store.settings);
  showStep(main, e, stepAt(e, t));
  const ph = $('[data-phase]', el);
  if (ph.textContent !== t.label) {
    ph.textContent = t.label;
    el.className = `phase-display k-${t.kind}`;
    const r = $('[data-ring]', main);
    if (r) { r.className = `ring k-${t.kind}`; r.style.setProperty('--dur', `${t.phaseSeconds}s`); }
  }
  const rep = $('[data-rep]', el);
  const line = repLine(e, t, reps);
  if (rep && rep.innerHTML !== line) rep.innerHTML = line;
  const track = $('[data-track]', main);
  if (track) {
    const spans = track.children;
    const labels = $('[data-labels]', main)?.children;
    for (let i = 0; i < spans.length; i++) {
      const cls = i < t.phaseIdx ? 'done' : i === t.phaseIdx ? 'cur' : '';
      const want = `k-${e.phases[i][2]} ${cls}`;
      if (spans[i].className !== want) spans[i].className = want;
      if (i === t.phaseIdx) spans[i].style.setProperty('--p', `${Math.round(t.phaseProgress * 100)}%`);
      if (labels && labels[i]) { const lc = i === t.phaseIdx ? 'cur' : ''; if (labels[i].className !== lc) labels[i].className = lc; }
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
  const strip = $('.ex-strip', main);
  if (strip) {
    const cur = session.position.current;
    const items = strip.children;
    for (let i = 0; i < items.length; i++) {
      if (items[i].className === 'done' || items[i].className === 'skipped') continue;
      const want = cur && i + 1 === cur.n ? 'cur' : '';
      if (items[i].className !== want) items[i].className = want;
    }
  }
}

// The day's plan as sections: one per sequence, the current one open.
function sequences(pos) {
  const cur = pos.current;
  const s = store.settings;
  const plan = phaseById(s.phase).plan;
  const done = doneThisRound(pos);
  const parts = [];
  for (const [seq, rounds] of plan) {
    const open = isOpen(seq);
    const finished = seq < cur.seq;
    const current = seq === cur.seq;
    const sub = current ? `round ${cur.round} of ${rounds}` : finished ? 'done' : `${rounds === 1 ? 'one round' : rounds === 3 ? 'three rounds' : `${rounds} rounds`}`;
    parts.push(`<button class="seq-head ${open ? 'open' : ''}" data-seq="${seq}" aria-expanded="${open}">
      <span class="t">${finished ? `<span class="ok">${ICONS.check}</span>` : ''}<b>Sequence ${seq}</b><span>${sub}</span></span>${open ? CHEV_UP : CHEV}
    </button>`);
    const rows = sequence(seq).map((e) => {
      const k = keyOf(e);
      const d = current ? done.get(k) : null;
      const isCur = current && k === cur.key;
      const cls = finished || (d && !d.skipped) ? 'done' : d && d.skipped ? 'skipped' : isCur ? 'cur' : '';
      const fig = (finished || d)
        ? `<span class="mark">${d && d.skipped ? '–' : ICONS.check}</span>`
        : heroImage(e.images);
      return `<button class="ex-row ${cls}" data-ex="${k}" data-thumb="${(finished || d) ? '' : photoKey(k, 'step', 1)}">
        <span class="fig">${fig}</span>
        <span class="n">${esc(e.name)}</span>
        <span class="m">${esc(shortWeight(e, s.base))}</span>
      </button>`;
    }).join('');
    parts.push(`<div class="ex-list">${rows}</div>`);
  }
  return `<section class="seqs">${parts.join('')}</section>`;
}

function shortWeight(e, base) {
  const w = weightLabel(e, base);
  return w === 'No weight' ? 'no weight' : w.replace(', or two at', ' or two at');
}

function relaxCard(mode) {
  const s = store.settings;
  const t = session.tstate;
  if (mode === 'relax') {
    return `<section class="timer">
      <div class="head"><div><div class="ex-key">Last step</div><h1 class="ex-name">Relax</h1><div class="ex-meta">Lie still, breathe slowly, let the body settle.</div></div></div>
      ${ring('k-count', `
        <div class="phase" data-phase>Lie still</div>
        <div class="count time" data-count>${t ? fmtTime((t.phaseSeconds - (t.phaseSeconds * t.phaseProgress)) * 1000) : fmtTime(s.timer.relaxMinutes * 60000)}</div>
        <div class="rep"></div>`, t ? t.phaseProgress : 0, 1)}
      <div class="acts"><button class="btn primary big block" data-act="relax-done">Finish</button></div>
    </section>`;
  }
  return `<section class="timer">
    <div class="head"><div><div class="ex-key">All rounds done</div><h1 class="ex-name">Now relax</h1><div class="ex-meta">${s.timer.relaxMinutes} minutes lying still, then the day is done.</div></div></div>
    <div class="acts">
      <button class="btn primary big block" data-act="relax">Start the relax</button>
      <div class="btn-row quiet"><button class="btn ghost sm" data-act="relax-skip">Skip and finish</button></div>
    </div>
  </section>`;
}

function completeCard() {
  const m = session.meta;
  const ms = session.elapsedMs();
  return `<section class="card complete-card">
    <div class="ex-key" style="color:var(--accent);font-weight:600;font-size:13px">Today</div>
    <div class="big">Done.</div>
    <p class="muted">${m?.startedAt ? `Session time <b class="tnum">${fmtTime(ms)}</b>` : 'Same time tomorrow.'}</p>
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
  for (const el of $$('[data-thumb],[data-hero],[data-step]', main)) {
    const key = el.dataset.thumb || el.dataset.hero || el.dataset.step;
    if (!key) continue;
    const url = await photoURL(key);
    if (!url || !el.isConnected) continue;
    const box = el.dataset.thumb ? $('.fig', el) : el;
    const img = document.createElement('img'); img.src = url; img.alt = '';
    box.replaceChildren(img);
  }
}
