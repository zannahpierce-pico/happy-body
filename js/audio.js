// Audio cues (Web Audio), spoken phrases (recorded clips, with SpeechSynthesis
// for any phrase that has no clip) and an iOS keep-awake fallback (a looping
// silent <audio> element).

import { CLIPS } from './data/clips.js';

let ctx = null;
let silent = null;
let voiceEnabled = true;
let soundEnabled = true;
let speechPrimed = false;
let toneUntil = 0;          // performance.now() when the last scheduled tone ends
let voice = null;

const synth = () => ('speechSynthesis' in window ? window.speechSynthesis : null);

export function configure({ sound, voice: v } = {}) {
  soundEnabled = sound !== false;
  const wasOn = voiceEnabled;
  voiceEnabled = v !== false;
  if (wasOn && !voiceEnabled) hush();   // stop anything already queued or speaking
}

function pickVoice() {
  const s = synth();
  if (!s || voice) return;
  const vs = s.getVoices();
  const lang = (navigator.language || 'en-US').toLowerCase();
  voice = vs.find((x) => x.lang.toLowerCase() === lang && x.localService)
    || vs.find((x) => x.lang.toLowerCase().startsWith('en') && x.localService)
    || vs.find((x) => x.lang.toLowerCase().startsWith('en')) || null;
}
try { synth()?.addEventListener?.('voiceschanged', pickVoice); } catch { /* ignore */ }

// iOS parks the context as 'suspended' or 'interrupted' (speech, calls, other
// apps); resume() brings it back.
function wake() {
  if (!ctx) return;
  if (ctx.state !== 'running') { try { ctx.resume().catch(() => {}); } catch { /* ignore */ } }
}

// Must be called from a user gesture (iOS unlocks audio and speech only there).
export function unlock({ prime = true } = {}) {
  clearTimeout(releaseTimer);
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    wake();
    preloadClips();
    // Play a near-silent blip to fully unlock on iOS.
    const o = ctx.createOscillator(); const g = ctx.createGain();
    g.gain.value = 0.0001; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.02);
  } catch (e) { console.warn('audio unlock failed', e); }
  // Safari only lets a page speak on its own after it has spoken inside a tap.
  // Prime once with a real (quiet) word; never cancel it straight after.
  const s = synth();
  if (s && prime && !speechPrimed) {
    try {
      pickVoice();
      if (s.paused) s.resume();
      const u = new SpeechSynthesisUtterance('ok');
      u.volume = 0.01; if (voice) u.voice = voice;
      keep(u); s.speak(u);
      speechPrimed = true;
    } catch { /* ignore */ }
  }
}

// A soft mallet tap rather than a beep: a sine fundamental with a faint, quickly
// fading partial two octaves up (a marimba's second mode), a few ms of attack and
// a natural decay. `dur` is how long the note rings.
function tone(freq, start, dur, { vol = 0.22 } = {}) {
  if (!ctx || !soundEnabled) return;
  const t0 = ctx.currentTime + start;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);
  const partial = (mult, level, decay) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mult, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + decay + 0.05);
  };
  partial(1, vol, dur);
  partial(4, vol * 0.12, Math.min(dur, 0.09));
  // Speech waits for this; the tail of the decay is inaudible, so count half of it.
  toneUntil = Math.max(toneUntil, performance.now() + (start + dur * 0.5) * 1000);
}

// Pitches an octave or two below the old beeps; the small phases are quiet taps.
function playCue(kind) {
  switch (kind) {
    case 'in':      tone(330, 0, 0.3); tone(415, 0.16, 0.4); break;             // rising: breathe in
    case 'out':     tone(415, 0, 0.3); tone(330, 0.16, 0.5); break;             // falling: let it go
    case 'move':    tone(523, 0, 0.3); break;                                   // single wooden tap
    case 'lower':   tone(262, 0, 0.4); break;                                   // single low tap
    case 'pause':   tone(659, 0, 0.12, { vol: 0.1 }); break;                    // faint tick
    case 'stretch': tone(740, 0, 0.14, { vol: 0.12 }); break;
    case 'hold':    tone(659, 0, 0.12, { vol: 0.1 }); tone(659, 0.14, 0.12, { vol: 0.1 }); break;
    case 'count':   tone(440, 0, 0.2, { vol: 0.14 }); break;
    case 'repEnd':  tone(523, 0, 0.25, { vol: 0.16 }); tone(659, 0.14, 0.4, { vol: 0.16 }); break;
    case 'done':    tone(392, 0, 0.3); tone(523, 0.16, 0.3); tone(659, 0.32, 0.7); break;
    case 'start':   tone(392, 0, 0.25); tone(523, 0.14, 0.4); break;
    default: tone(440, 0, 0.25);
  }
}

// Distinct cue per phase kind so you can follow the tempo without looking.
export function cue(kind) {
  if (!ctx || !soundEnabled || document.hidden) return;
  clearTimeout(releaseTimer);
  if (ctx.state === 'running') return playCue(kind);
  // Not running (iOS interrupts it while speech plays): resume, then play.
  try { ctx.resume().then(() => playCue(kind)).catch(() => {}); } catch { /* ignore */ }
}

// ── Recorded phrases ──
// One MP3 per phrase in CLIPS (audio/say/<file>.mp3), decoded once into the
// audio context. Leading and trailing silence is measured at decode time so the
// word lands on the beat whatever padding the recording has.
const clips = new Map();     // text → Promise<{ buffer, start, dur } | null>
let clipSrc = null;          // the last clip scheduled
const clipSrcs = new Set();  // every clip playing or queued
let clipEndAt = 0;           // context time when it ends

function loadClip(text) {
  const file = CLIPS[text];
  if (!file || !ctx) return Promise.resolve(null);
  if (!clips.has(text)) {
    const p = fetch(`./audio/say/${file}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buffer) => {
        const d = buffer.getChannelData(0);
        const th = 0.012;
        let a = 0, b = d.length - 1;
        while (a < b && Math.abs(d[a]) < th) a++;
        while (b > a && Math.abs(d[b]) < th) b--;
        const sr = buffer.sampleRate;
        const start = Math.max(0, a / sr - 0.02);
        const dur = Math.min(buffer.duration - start, (b - a) / sr + 0.14);
        let peak = 0;
        for (let i = a; i <= b; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
        const gain = peak > 0 ? Math.min(2.5, 0.8 / peak) : 1; // even out the recordings' levels
        return { buffer, start, dur, gain };
      })
      .catch((e) => { console.warn('voice clip failed', text, e); clips.delete(text); return null; });
    clips.set(text, p);
  }
  return clips.get(text);
}

// Fetch and decode every clip once there is a context (after the first tap).
let preloaded = false;
function preloadClips() {
  if (preloaded || !ctx) return;
  preloaded = true;
  for (const text of Object.keys(CLIPS)) loadClip(text);
}

function stopClip() {
  for (const src of clipSrcs) { try { src.stop(); } catch { /* already ended */ } }
  clipSrcs.clear(); clipSrc = null;
  clipEndAt = 0;
}

// Play a phrase's clip now, or after the one playing when `interrupt` is false.
// Resolves false when there is no usable clip, so the caller can fall back.
async function playClip(text, interrupt, gen = sayGen) {
  const c = await loadClip(text);
  if (gen !== sayGen) return true;   // interrupted while loading
  if (!c || !ctx || !voiceEnabled || document.hidden) return !!c && (!voiceEnabled || document.hidden);
  wake();
  if (interrupt) stopClip();
  const at = Math.max(ctx.currentTime, interrupt ? 0 : clipEndAt);
  const src = ctx.createBufferSource();
  src.buffer = c.buffer;
  const g = ctx.createGain();
  g.gain.value = c.gain;
  src.connect(g); g.connect(ctx.destination);
  src.start(at, c.start, c.dur);
  src.onended = () => { clipSrcs.delete(src); if (clipSrc === src) clipSrc = null; };
  clipSrc = src; clipSrcs.add(src);
  clipEndAt = at + c.dur;
  return true;
}

// Safari drops utterances that get garbage-collected before they finish.
const live = new Set();
function keep(u) {
  live.add(u);
  const drop = () => live.delete(u);
  u.addEventListener('end', drop); u.addEventListener('error', drop);
  setTimeout(drop, 30000);
}

let sayTimer = null;
let clipQueue = Promise.resolve();   // settles once the latest clip is scheduled
let sayGen = 0;                      // bumped by anything that interrupts
export const hasClip = (text) => !!CLIPS[text];
export function say(text, opts = {}) {
  if (!voiceEnabled || !text || document.hidden) return;
  const interrupt = opts.interrupt !== false;
  if (interrupt) sayGen++;
  if (CLIPS[text] && ctx) {
    if (interrupt) hushSpeech();   // a queued synthesized phrase must not talk over the clip
    // Queued clips are scheduled in the order asked for, however long each takes
    // to load, and dropped if something interrupts before their turn.
    const gen = sayGen;
    clipQueue = (interrupt ? Promise.resolve() : clipQueue)
      .then(() => (gen === sayGen ? playClip(text, interrupt, gen) : true))
      .then((ok) => { if (!ok) speak(text, opts); });
    return;
  }
  if (interrupt) { speak(text, opts); return; }
  // Queued behind a clip: wait until it is scheduled so speak() knows when it ends.
  const gen = sayGen;
  clipQueue.then(() => { if (gen === sayGen) speak(text, opts); });
}
// Several phrases in a row, after whatever is playing. Recorded clips when every
// part has one; otherwise one synthesized sentence, so voices never alternate.
export function sayAll(parts) {
  if (parts.every(hasClip)) for (const p of parts) say(p, { interrupt: false });
  else say(parts.join(', '), { interrupt: false });
}
function hushSpeech() {
  clearTimeout(sayTimer); sayTimer = null;
  try { const s = synth(); if (s && (s.speaking || s.pending)) s.cancel(); } catch { /* ignore */ }
}
function speak(text, { interrupt = true, rate = 1.05 } = {}) {
  const s = synth();
  if (!voiceEnabled || !s || !text || document.hidden) return;
  try {
    pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = 1; u.volume = 1;
    if (voice) u.voice = voice; else u.lang = navigator.language || 'en-US';
    keep(u);
    speechPrimed = true;
    clearTimeout(sayTimer); sayTimer = null;
    const busy = s.speaking || s.pending;
    if (interrupt && busy) s.cancel();
    if (s.paused) s.resume();
    // Speaking right after cancel() is silently dropped on iOS, and speech that
    // starts on top of a tone cuts the tone off: wait for both to clear.
    // A queued phrase also waits for the recorded clip before it.
    const clipLeft = !interrupt && ctx && clipEndAt > ctx.currentTime ? (clipEndAt - ctx.currentTime) * 1000 + 150 : 0;
    const wait = Math.max(interrupt && busy ? 80 : 0, toneUntil - performance.now() + 30, clipLeft);
    if (wait > 0) sayTimer = setTimeout(() => { sayTimer = null; s.speak(u); wake(); }, wait);
    else { s.speak(u); wake(); }
  } catch { /* ignore */ }
}
export function hush() {
  sayGen++;
  stopClip();
  hushSpeech();
}

// Give the phone's audio back (so a podcast or music can play) once the app has
// nothing to say: stop speech and suspend the audio context. `delay` lets a final
// chime finish. The next cue or tap wakes it again.
let releaseTimer = null;
// A delayed release lets speech already under way ("Sequence complete…") finish;
// an immediate one (pause, switching away) cuts it off.
export function release(delay = 1500) {
  clearTimeout(releaseTimer);
  const go = () => {
    const s = synth();
    if (delay > 0 && ((s && (s.speaking || s.pending)) || sayTimer || clipSrc)) { releaseTimer = setTimeout(go, 500); return; }
    hush();
    try { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); } catch { /* ignore */ }
  };
  if (delay > 0) releaseTimer = setTimeout(go, delay); else go();
}

// Switching away (another app, another tab, locking the phone): go silent at
// once and stop the keep-awake loop, whatever the timer is doing.
function onHidden() {
  if (!document.hidden) return;
  release(0);
  try { silent?.pause(); } catch { /* ignore */ }
}
document.addEventListener('visibilitychange', onHidden);
window.addEventListener('pagehide', () => { release(0); try { silent?.pause(); } catch { /* ignore */ } });

// Settings "Test cues": play a chime and a phrase and report what the browser did.
export function diagnose(onLine) {
  const t0 = performance.now();
  const ms = () => `${Math.round(performance.now() - t0)} ms`;
  const s = synth();
  onLine(`Sound ${soundEnabled ? 'on' : 'off'}, voice ${voiceEnabled ? 'on' : 'off'}. Audio ${ctx ? ctx.state : 'not created'}.`);
  cue('in');
  setTimeout(() => onLine(`Chime sent, audio ${ctx ? ctx.state : 'none'}.`), 300);
  if (ctx) {
    preloadClips();
    Promise.all(Object.keys(CLIPS).map(loadClip)).then((all) => {
      const n = all.filter(Boolean).length;
      onLine(`${n} of ${all.length} recorded phrases loaded.`);
      if (!n) return synthTest();
      say('Inhale'); say('Lift', { interrupt: false }); say('Exhale', { interrupt: false });
      onLine(`Playing "Inhale. Lift. Exhale." from the recordings at ${ms()}.`);
      setTimeout(() => cue('repEnd'), 2600);
    });
  } else synthTest();
  function synthTest() {
  if (!s) { onLine('This browser has no speech synthesis.'); return; }
  pickVoice();
  onLine(`${s.getVoices().length} voices, using ${voice ? voice.name : 'the default'}.`);
  const u = new SpeechSynthesisUtterance('Inhale. Lift. Exhale.');
  if (voice) u.voice = voice;
  keep(u);
  let started = false;
  u.addEventListener('start', () => { started = true; onLine(`Speech started at ${ms()}.`); });
  u.addEventListener('end', () => { onLine(`Speech ended at ${ms()}. Audio ${ctx ? ctx.state : 'none'}.`); cue('repEnd'); });
  u.addEventListener('error', (e) => onLine(`Speech error: ${e.error}.`));
  setTimeout(() => { if (s.paused) s.resume(); s.speak(u); }, 400);
  setTimeout(() => { if (!started) onLine(`Speech never started (speaking ${s.speaking}, pending ${s.pending}, paused ${s.paused}).`); }, 4000);
  }
}

// 1 s of silence as a WAV data URI (8 kHz, 8-bit mono).
function silentWav() {
  const rate = 8000, samples = rate;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  let bin = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
}

export function keepAwakeAudio(on) {
  try {
    if (!silent) {
      silent = new Audio(silentWav());
      silent.loop = true;
      silent.volume = 0.01;
      silent.setAttribute('playsinline', '');
    }
    if (on && !document.hidden) silent.play().catch(() => {}); else silent.pause();
  } catch { /* ignore */ }
}
