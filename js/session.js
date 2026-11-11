// Workout session controller: where you are today (derived from the log), the
// running tempo timer, cues, and the Done / Skip / Undo actions.

import { store } from './store.js';
import { byKey } from './data/exercises.js';
import { positionFor, today, repsFor, weightFor, loadFor, loadSpeech, repSide, programWeek } from './program.js';
import { TempoTimer, countdown } from './timer.js';
import * as audio from './audio.js';
import { keepAwake } from './wakelock.js';

class Session {
  constructor() {
    this.mode = 'idle';     // idle | ready | running | paused | relax | complete
    this.timer = null;
    this.tstate = null;     // latest timer state
    this.listeners = new Set();
    this.day = today();
    store.subscribe((what) => {
      // Cue and keep-awake switches take effect at once, even mid-timer.
      if (what === 'settings' || what === 'import') this.applyTimerSettings();
      if (what === 'log' || what === 'settings' || what === 'import' || what === 'today') this.refresh();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.rollDay(); });
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what, data) { for (const fn of this.listeners) { try { fn(what, data); } catch (e) { console.error(e); } } }

  // If the calendar day changed while open, drop any running timer and recompute.
  rollDay() {
    const d = today();
    if (d !== this.day) { this.day = d; this.reset(); this.refresh(); }
  }

  get settings() { return store.settings; }
  get entries() { return store.entriesForDay(this.day); }
  get meta() { return store.today && store.today.day === this.day ? store.today : null; }
  get position() { return positionFor(this.settings.phase, this.entries); }
  get exercise() { const c = this.position.current; return c ? byKey[c.key] : null; }
  get week() { return programWeek(this.settings.programStart, this.day); }

  // The workout clock: today's record holds startedAt, pausedMs (time paused so
  // far), pausedAt (while paused) and finishedAt. Starting an exercise starts or
  // resumes it; the top bar has Start, Pause, Resume and Done.
  elapsedMs() {
    const m = this.meta;
    if (!m?.startedAt) return 0;
    return (m.finishedAt || m.pausedAt || Date.now()) - m.startedAt - (m.pausedMs || 0);
  }
  get clock() {
    const m = this.meta;
    if (!m?.startedAt) return 'off';
    return m.finishedAt ? 'done' : m.pausedAt ? 'paused' : 'running';
  }
  async startClock() {
    const m = this.meta;
    if (!m?.startedAt) {
      if (!this.settings.programStart) await store.setSettings({ programStart: this.day });
      await store.setToday({ day: this.day, startedAt: Date.now(), pausedMs: 0, pausedAt: null, relaxDoneAt: null, finishedAt: null });
    } else if (m.finishedAt && !this.entries.length) {
      // A false start: nothing logged, so begin again from zero.
      await store.setToday({ day: this.day, startedAt: Date.now(), pausedMs: 0, pausedAt: null, relaxDoneAt: null, finishedAt: null });
    } else if (m.finishedAt || m.pausedAt) {
      // Resume: the stopped stretch counts as a pause.
      const since = m.pausedAt || m.finishedAt;
      await store.setToday({ ...m, pausedMs: (m.pausedMs || 0) + (Date.now() - since), pausedAt: null, finishedAt: null, relaxDoneAt: null });
    }
  }
  async pauseClock() {
    if (this.mode === 'running' || this.mode === 'ready') this.pause(); // pauses the clock too
    else await this.holdClock();
  }
  async holdClock() {
    const m = this.meta;
    if (!m?.startedAt || m.pausedAt || m.finishedAt) return;
    await store.setToday({ ...m, pausedAt: Date.now() });
  }
  // Start over from zero, whatever the clock was doing. Logged exercises stay.
  async restartClock() {
    this.stopTimer();
    if (this.mode === 'running' || this.mode === 'paused' || this.mode === 'ready' || this.mode === 'ready-paused') this.mode = 'idle';
    await store.setToday({ day: this.day, startedAt: Date.now(), pausedMs: 0, pausedAt: null, relaxDoneAt: null, finishedAt: null });
  }
  async finishClock() {
    const m = this.meta;
    if (!m?.startedAt || m.finishedAt) return;
    this.stopTimer();
    if (this.mode === 'running' || this.mode === 'paused' || this.mode === 'ready' || this.mode === 'ready-paused') this.mode = 'idle';
    const now = Date.now();
    const pausedMs = (m.pausedMs || 0) + (m.pausedAt ? now - m.pausedAt : 0);
    await store.setToday({ ...m, pausedMs, pausedAt: null, finishedAt: now });
  }

  refresh() {
    const pos = this.position;
    if (pos.complete) {
      if (this.mode !== 'relax') {
        this.stopTimer();
        this.mode = this.meta?.relaxDoneAt ? 'complete' : 'relaxWait';
      }
    } else if (this.mode === 'relax' || this.mode === 'relaxWait' || this.mode === 'complete') {
      this.stopTimer();
      this.mode = 'idle';
    }
    this.emit('state');
  }

  async touchStart() { await this.startClock(); }

  stopTimer() {
    if (this.timer) { this.timer.stop(); this.timer = null; }
    this.tstate = null;
    audio.release();
    keepAwake(false);
  }

  configureAudio() { audio.configure(this.settings.timer); }

  applyTimerSettings() {
    this.configureAudio();
    const active = this.mode === 'running' || this.mode === 'ready' || this.mode === 'relax';
    if (active) keepAwake(this.settings.timer.keepAwake !== false);
  }

  // ── Actions ──
  // Start the current exercise: optional get-ready countdown, then the tempo timer.
  async start({ skipReady = false } = {}) {
    const e = this.exercise;
    if (!e) return;
    // Everything audible happens before the first await, so iOS still counts it
    // as part of the tap.
    this.stopTimer();
    this.configureAudio();
    const ready = skipReady ? 0 : (this.settings.timer.getReady || 0);
    // What to pick up, said after "Next, …". A load with no recording is
    // synthesized a moment after the tap, which Safari only allows once primed.
    const load = ready > 0 ? loadSpeech(e, this.settings) : [];
    audio.unlock({ prime: !(ready > 0) || !load.every(audio.hasClip) });
    if (ready > 0) {
      audio.say(`Next, ${e.name}`);
      audio.sayAll(load);
    }
    await this.touchStart();
    if (this.settings.timer.keepAwake !== false) keepAwake(true);
    if (ready > 0) {
      this.mode = 'ready';
      let lastSec = null;
      this.timer = countdown(ready, 'Get ready', {
        onUpdate: (s) => {
          this.tstate = s; this.emit('tick', s);
          if (s.remaining !== lastSec) { lastSec = s.remaining; if (s.remaining <= 3 && s.remaining > 0) audio.cue('count'); }
        },
        onDone: () => this.runExercise(e),
      });
      this.timer.start();
      this.emit('state');
    } else {
      this.runExercise(e);
    }
  }

  runExercise(e) {
    this.stopTimer();
    if (this.settings.timer.keepAwake !== false) keepAwake(true);
    const reps = repsFor(e, this.settings);
    this.mode = 'running';
    audio.cue('start');
    this.timer = new TempoTimer({
      phases: e.phases, reps,
      onUpdate: (s) => { this.tstate = s; this.emit('tick', s); },
      onPhase: (s) => {
        audio.cue(s.kind);
        const side = s.phaseIdx === 0 ? repSide(e, s.rep, reps) : null;
        if (side) audio.say(side);
        audio.say(s.label, { interrupt: !side });
      },
      onRepEnd: (rep, s) => { if (!s.done) audio.cue('repEnd'); },
      onDone: () => this.onTimerDone(e),
    });
    this.timer.start();
    this.emit('state');
  }

  async onTimerDone(e) {
    audio.cue('done');
    audio.say('Done', { interrupt: false });
    const secs = Math.round((this.timer?.totalMs || 0) / 1000);
    await this.logDone(e, { timed: true, secs });
    this.afterAdvance();
  }

  afterAdvance() {
    const pos = this.position;
    if (pos.complete) {
      this.stopTimer();
      this.mode = 'relaxWait';
      this.emit('state');
      audio.say('Sequence complete. Time to relax.', { interrupt: false });
      return;
    }
    if (this.settings.timer.autoStart !== false) this.start();
    else { this.stopTimer(); this.mode = 'idle'; this.emit('state'); }
  }

  pause() {
    if (this.mode !== 'running' && this.mode !== 'ready') return;
    this.timer?.pause();
    audio.release(0);
    keepAwake(false);
    this.mode = this.mode === 'ready' ? 'ready-paused' : 'paused';
    this.emit('state');
    this.holdClock();
  }
  resume() {
    if (!this.timer) return;
    audio.unlock({ prime: false });
    if (this.settings.timer.keepAwake !== false) keepAwake(true);
    this.timer.resume();
    this.mode = this.mode === 'ready-paused' ? 'ready' : 'running';
    this.emit('state');
    this.startClock();
  }
  // Abandon the current timer without logging.
  reset() {
    this.stopTimer();
    this.mode = 'idle';
    this.emit('state');
  }
  // Back to the start of the rep under way (stays paused if it was paused).
  restartRep() {
    if (!this.timer || this.mode !== 'running' && this.mode !== 'paused') return;
    this.timer.restartRep();
    this.emit('state');
  }
  skipReady() {
    if (this.mode === 'ready' || this.mode === 'ready-paused') this.start({ skipReady: true });
  }

  async logDone(e, { timed = false, secs = null, skipped = false } = {}) {
    const pos = this.position;
    const slot = pos.current;
    if (!slot) return;
    const s = this.settings;
    await store.addEntry({
      key: slot.key, seq: slot.seq, n: slot.n, round: slot.round, rounds: slot.rounds,
      phase: s.phase, skipped, timed, secs,
      w: weightFor(e, s.base), load: loadFor(e, s)?.lb ?? null, lv: s.levels[slot.key] || 5, reps: repsFor(e, s),
    });
  }

  // Manual Done: log the current exercise regardless of timer.
  async done() {
    const e = this.exercise;
    if (!e) return;
    audio.unlock();
    this.configureAudio();
    await this.touchStart();
    const secs = this.tstate && this.mode !== 'ready' ? Math.round(this.tstate.elapsedMs / 1000) : null;
    const wasRunning = this.mode === 'running' || this.mode === 'paused';
    this.stopTimer();
    audio.cue('done');
    await this.logDone(e, { timed: false, secs });
    if (wasRunning) this.afterAdvance();
    else { this.mode = this.position.complete ? 'relaxWait' : 'idle'; this.emit('state'); }
  }

  async skip() {
    const e = this.exercise;
    if (!e) return;
    await this.touchStart();
    this.stopTimer();
    await this.logDone(e, { skipped: true });
    this.mode = this.position.complete ? 'relaxWait' : 'idle';
    this.emit('state');
  }

  async undo() {
    const entries = this.entries;
    if (!entries.length) return;
    this.stopTimer();
    await store.deleteEntries([entries[entries.length - 1].id]);
    if (this.meta?.finishedAt || this.meta?.relaxDoneAt) await this.startClock(); // the clock runs again (or starts over if nothing is left)
    this.mode = 'idle';
    this.emit('state');
  }

  startRelax() {
    audio.unlock();
    this.configureAudio();
    this.stopTimer();
    if (this.settings.timer.keepAwake !== false) keepAwake(true);
    const mins = this.settings.timer.relaxMinutes || 5;
    this.mode = 'relax';
    audio.say('Lie still. Breathe slowly. Let everything go.');
    this.timer = countdown(mins * 60, 'Relax', {
      onUpdate: (s) => { this.tstate = s; this.emit('tick', s); },
      onDone: () => this.finishRelax(),
    });
    this.timer.start();
    this.emit('state');
  }

  async finishRelax() {
    this.stopTimer();
    audio.cue('done');
    const now = Date.now();
    const m = this.meta || { day: this.day, startedAt: now, pausedMs: 0 };
    const pausedMs = (m.pausedMs || 0) + (m.pausedAt ? now - m.pausedAt : 0);
    await store.setToday({ ...m, pausedMs, pausedAt: null, relaxDoneAt: now, finishedAt: now });
    this.mode = 'complete';
    this.emit('state');
  }

  async clearToday() {
    this.stopTimer();
    const ids = this.entries.map((e) => e.id);
    if (ids.length) await store.deleteEntries(ids);
    await store.setToday(null);
    this.mode = 'idle';
    this.emit('state');
  }
}

export const session = new Session();
