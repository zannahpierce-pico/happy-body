// Timestamp-driven tempo timer. State is computed from wall-clock elapsed time on
// every tick, so background throttling or a locked screen cannot drift the sequence;
// when the tab wakes up, the timer lands on the correct phase.

export class TempoTimer {
  // phases: [[label, seconds, kind]], reps: number
  constructor({ phases, reps = 1, onUpdate, onPhase, onRepEnd, onDone }) {
    this.phases = phases;
    this.reps = reps;
    this.onUpdate = onUpdate || (() => {});
    this.onPhase = onPhase || (() => {});
    this.onRepEnd = onRepEnd || (() => {});
    this.onDone = onDone || (() => {});
    this.repMs = phases.reduce((t, p) => t + p[1], 0) * 1000;
    this.totalMs = this.repMs * reps;
    this.cum = [];
    let c = 0;
    for (const p of phases) { this.cum.push(c); c += p[1] * 1000; }
    this.startedAt = null;   // wall-clock ms when (re)started
    this.offset = 0;         // elapsed ms accumulated before the last start
    this.running = false;
    this.finished = false;
    this.lastKey = null;
    this._int = null;
    this._raf = null;
    this.state = this.compute(0);
  }

  elapsed() {
    return this.running ? this.offset + (Date.now() - this.startedAt) : this.offset;
  }

  compute(ms) {
    const clamped = Math.min(Math.max(ms, 0), this.totalMs);
    const repIdx = Math.min(Math.floor(clamped / this.repMs), this.reps - 1);
    const inRep = clamped - repIdx * this.repMs;
    let phaseIdx = 0;
    for (let i = this.phases.length - 1; i >= 0; i--) if (inRep >= this.cum[i]) { phaseIdx = i; break; }
    const phase = this.phases[phaseIdx];
    const phaseMs = phase[1] * 1000;
    const inPhase = inRep - this.cum[phaseIdx];
    return {
      elapsedMs: clamped,
      rep: repIdx + 1,
      reps: this.reps,
      phaseIdx,
      label: phase[0],
      kind: phase[2],
      phaseSeconds: phase[1],
      remaining: Math.max(0, Math.ceil((phaseMs - inPhase) / 1000)),
      phaseProgress: Math.min(1, inPhase / phaseMs),
      repProgress: inRep / this.repMs,
      totalProgress: clamped / this.totalMs,
      done: clamped >= this.totalMs,
    };
  }

  start() {
    if (this.running || this.finished) return;
    this.running = true;
    this.startedAt = Date.now();
    this.loop();
    this.tick(true);
  }

  pause() {
    if (!this.running) return;
    this.offset = this.elapsed();
    this.running = false;
    this.stopLoop();
    this.state = this.compute(this.offset);
    this.onUpdate(this.state);
  }

  resume() { this.start(); }

  stop() {
    this.running = false;
    this.finished = true;
    this.stopLoop();
  }

  loop() {
    this.stopLoop();
    this._int = setInterval(() => this.tick(), 100);
    const raf = () => { if (!this.running) return; this.tick(); this._raf = requestAnimationFrame(raf); };
    if (typeof requestAnimationFrame === 'function') this._raf = requestAnimationFrame(raf);
  }
  stopLoop() {
    if (this._int) clearInterval(this._int);
    if (this._raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
    this._int = null; this._raf = null;
  }

  tick(initial = false) {
    if (!this.running) return;
    const s = this.compute(this.elapsed());
    this.state = s;
    const key = `${s.rep}:${s.phaseIdx}`;
    if (key !== this.lastKey) {
      const prev = this.lastKey;
      this.lastKey = key;
      // Rep ended if we moved to a new rep (and it's not the very first tick)
      if (prev && prev.split(':')[0] !== String(s.rep)) this.onRepEnd(s.rep - 1, s);
      this.onPhase(s, initial);
    }
    this.onUpdate(s);
    if (s.done) {
      this.running = false;
      this.finished = true;
      this.stopLoop();
      this.onRepEnd(this.reps, s);
      this.onDone(s);
    }
  }
}

// Simple countdown built on the same engine.
export function countdown(seconds, label, { onUpdate, onDone }) {
  return new TempoTimer({ phases: [[label, seconds, 'count']], reps: 1, onUpdate, onDone });
}
