// Streak: 28-day grid, streak counts, day details, clear-today.
import { store } from '../store.js';
import { session } from '../session.js';
import { groupByDay, streakFrom, bestStreak, dayComplete, today, addDays, slotsFor, daySummary } from '../program.js';
import { esc, on, $, fmtTime, fmtDate, fmtClock, confirmSheet, toast } from '../ui.js';

export function render(main) {
  let selected = today();
  const draw = () => { main.innerHTML = view(selected); };
  draw();
  const unsub = store.subscribe((what) => { if (what === 'log' || what === 'import' || what === 'today') draw(); });
  on(main, 'click', '[data-day]', (ev, b) => { selected = b.dataset.day; draw(); });
  on(main, 'click', '[data-clear-today]', async () => {
    const n = session.entries.length;
    if (!n) { toast('Nothing logged today'); return; }
    if (await confirmSheet({ title: 'Clear today?', body: `Removes all ${n} entries logged today so you can start the day over.`, okLabel: 'Clear today', danger: true })) {
      await session.clearToday();
      toast('Today cleared');
    }
  });
  on(main, 'click', '[data-clear-day]', async (ev, b) => {
    const day = b.dataset.clearDay;
    const ids = store.entriesForDay(day).map((e) => e.id);
    if (await confirmSheet({ title: `Clear ${fmtDate(new Date(day + 'T12:00'))}?`, body: `Removes ${ids.length} entries.`, okLabel: 'Clear', danger: true })) {
      await store.deleteEntries(ids);
      toast('Cleared');
    }
  });
  return unsub;
}

function view(selected) {
  const byDay = groupByDay(store.log);
  const t = today();
  const streak = streakFrom(byDay, t);
  const best = bestStreak(byDay);
  const totalDays = [...byDay.keys()].filter((d) => dayComplete(byDay.get(d))).length;

  // 28-day grid ending this week (Monday-start).
  const tDate = new Date(t + 'T12:00');
  const dow = (tDate.getDay() + 6) % 7; // 0 = Monday
  const gridStart = addDays(t, -(21 + dow));
  const cells = [];
  for (let i = 0; i < 28; i++) {
    const d = addDays(gridStart, i);
    const entries = byDay.get(d) || [];
    const full = dayComplete(entries);
    const part = !full && entries.length > 0;
    const future = d > t;
    cells.push(`<button class="day ${full ? 'full' : part ? 'part' : ''} ${d === t ? 'today' : ''} ${future ? 'future' : ''} ${d === selected ? 'sel' : ''}" data-day="${d}" aria-label="${d}${full ? ', complete' : part ? ', partial' : ''}">${Number(d.slice(-2))}</button>`);
  }

  return `<div class="stack">
    <section class="card">
      <div class="streak-hero">
        <div><div class="num tnum">${streak}</div><div class="lbl">Day streak</div></div>
        <div><div class="num tnum">${best}</div><div class="lbl">Best</div></div>
        <div><div class="num tnum">${totalDays}</div><div class="lbl">Days done</div></div>
      </div>
    </section>
    <section class="card">
      <div class="card-title"><h2>Last four weeks</h2><span class="hint">${streak ? (streak === 1 ? 'one day in. keep going.' : `${streak} in a row.`) : 'a day counts when every round is logged'}</span></div>
      <div class="grid28">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="dow">${d}</div>`).join('')}
        ${cells.join('')}
      </div>
    </section>
    ${dayCard(selected, byDay.get(selected) || [], selected === t)}
  </div>`;
}

function dayCard(day, entries, isToday) {
  const label = isToday ? 'Today' : fmtDate(new Date(day + 'T12:00'));
  if (!entries.length) {
    return `<section class="card flat"><div class="card-title"><h3>${esc(label)}</h3></div><p class="muted small" style="margin:0">${isToday ? 'Nothing logged yet.' : 'Nothing logged.'}</p></section>`;
  }
  const phase = entries[entries.length - 1].phase || 'w1';
  const sum = daySummary(phase, entries);
  const meta = isToday ? session.meta : null;
  const span = meta?.startedAt ? (meta.finishedAt || sum.last) - meta.startedAt : sum.last - sum.first;
  const rounds = {};
  for (const e of entries) { const k = `Seq ${e.seq}`; rounds[k] = Math.max(rounds[k] || 0, e.round || 0); }
  const skipped = entries.filter((e) => e.skipped).length;
  return `<section class="card flat">
    <div class="card-title"><h3>${esc(label)}</h3><span class="hint">${sum.complete ? '<span class="pill green">complete</span>' : `${sum.done} of ${sum.total}`}</span></div>
    <div class="row"><span class="label">Time</span><span class="tnum">${fmtClock(sum.first)} – ${fmtClock(sum.last)} · ${fmtTime(span)}</span></div>
    <div class="row"><span class="label">Rounds</span><span>${Object.entries(rounds).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span></div>
    ${skipped ? `<div class="row"><span class="label">Skipped</span><span class="tnum">${skipped}</span></div>` : ''}
    <div class="divider"></div>
    <div class="btn-row">
      ${isToday ? `<button class="btn danger" data-clear-today>Clear today</button>` : `<button class="btn danger" data-clear-day="${day}">Clear this day</button>`}
    </div>
  </section>`;
}

export const _s = slotsFor;
