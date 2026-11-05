// Audio cues (Web Audio), spoken phase names (SpeechSynthesis) and an iOS
// keep-awake fallback (a looping silent <audio> element).

let ctx = null;
let silent = null;
let voiceEnabled = true;
let soundEnabled = true;
let speechPrimed = false;
let toneUntil = 0;          // performance.now() when the last scheduled tone ends
let voice = null;

const synth = () => ('speechSynthesis' in window ? window.speechSynthesis : null);

export function configure({ sound, voice: v }) {
  soundEnabled = sound !== false;
  voiceEnabled = v !== false;
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

function tone(freq, start, dur, { type = 'sine', vol = 0.35 } = {}) {
  if (!ctx || !soundEnabled) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
  toneUntil = Math.max(toneUntil, performance.now() + (start + dur) * 1000);
}

function playCue(kind) {
  switch (kind) {
    case 'in':      tone(523, 0, 0.12); tone(659, 0.13, 0.16); break;           // rising: breathe in
    case 'out':     tone(659, 0, 0.12); tone(523, 0.13, 0.22); break;           // falling: let it go
    case 'move':    tone(784, 0, 0.14, { type: 'triangle' }); break;            // single bright tick
    case 'lower':   tone(440, 0, 0.18, { type: 'triangle' }); break;            // single low tick
    case 'pause':   tone(880, 0, 0.06, { vol: 0.2 }); break;                    // soft tap
    case 'stretch': tone(988, 0, 0.08, { vol: 0.25 }); break;
    case 'hold':    tone(880, 0, 0.06, { vol: 0.2 }); tone(880, 0.1, 0.06, { vol: 0.2 }); break;
    case 'count':   tone(880, 0, 0.08, { vol: 0.25 }); break;
    case 'repEnd':  tone(1047, 0, 0.1, { vol: 0.3 }); tone(1319, 0.11, 0.18, { vol: 0.3 }); break;
    case 'done':    tone(784, 0, 0.12); tone(988, 0.13, 0.12); tone(1175, 0.26, 0.3); break;
    case 'start':   tone(659, 0, 0.1); tone(784, 0.11, 0.14); break;
    default: tone(700, 0, 0.1);
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

// Safari drops utterances that get garbage-collected before they finish.
const live = new Set();
function keep(u) {
  live.add(u);
  const drop = () => live.delete(u);
  u.addEventListener('end', drop); u.addEventListener('error', drop);
  setTimeout(drop, 30000);
}

let sayTimer = null;
export function say(text, { interrupt = true, rate = 1.05 } = {}) {
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
    const wait = Math.max(interrupt && busy ? 80 : 0, toneUntil - performance.now() + 30);
    if (wait > 0) sayTimer = setTimeout(() => { sayTimer = null; s.speak(u); wake(); }, wait);
    else { s.speak(u); wake(); }
  } catch { /* ignore */ }
}
export function hush() {
  clearTimeout(sayTimer); sayTimer = null;
  try { const s = synth(); if (s && (s.speaking || s.pending)) s.cancel(); } catch { /* ignore */ }
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
    if (delay > 0 && s && (s.speaking || s.pending || sayTimer)) { releaseTimer = setTimeout(go, 500); return; }
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
