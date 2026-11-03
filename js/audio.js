// Audio cues (Web Audio), spoken phase names (SpeechSynthesis) and an iOS
// keep-awake fallback (a looping silent <audio> element).

let ctx = null;
let silent = null;
let voiceEnabled = true;
let soundEnabled = true;

export function configure({ sound, voice }) {
  soundEnabled = sound !== false;
  voiceEnabled = voice !== false;
}

// Must be called from a user gesture at least once (iOS unlocks audio here).
export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    // Play a near-silent blip to fully unlock on iOS.
    const o = ctx.createOscillator(); const g = ctx.createGain();
    g.gain.value = 0.0001; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.02);
  } catch (e) { console.warn('audio unlock failed', e); }
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0; speechSynthesis.speak(u);
    }
  } catch { /* ignore */ }
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
}

// Distinct cue per phase kind so you can follow the tempo without looking.
export function cue(kind) {
  if (!ctx || ctx.state !== 'running') { try { ctx?.resume(); } catch { /* ignore */ } }
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

let lastUtterance = null;
export function say(text, { interrupt = true, rate = 1.05 } = {}) {
  if (!voiceEnabled || !('speechSynthesis' in window) || !text) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = 1; u.volume = 1;
    lastUtterance = u;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
export function hush() { try { speechSynthesis?.cancel(); } catch { /* ignore */ } }

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
    if (on) silent.play().catch(() => {}); else silent.pause();
  } catch { /* ignore */ }
}
