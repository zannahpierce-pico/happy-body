// Screen Wake Lock with automatic re-acquire when the page becomes visible again.
import { keepAwakeAudio } from './audio.js';

let lock = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock) return;
  try {
    if ('wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    }
  } catch (e) { lock = null; console.warn('wake lock failed', e); }
}

export async function keepAwake(on) {
  wanted = !!on;
  if (wanted) {
    await acquire();
    // Fallback only: a playing <audio> element changes the iOS audio session and
    // can silence speech, so skip it when the Wake Lock API worked.
    if (!lock) keepAwakeAudio(true);
  } else {
    try { await lock?.release(); } catch { /* ignore */ }
    lock = null;
    keepAwakeAudio(false);
  }
}

document.addEventListener('visibilitychange', () => {
  // Back in the app with a timer still running: take the screen lock again (the
  // audio fallback stopped when the page was hidden).
  if (document.visibilityState === 'visible' && wanted) acquire().then(() => { if (wanted && !lock) keepAwakeAudio(true); });
});
