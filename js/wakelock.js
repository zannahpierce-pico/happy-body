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
    keepAwakeAudio(true);      // iOS fallback: silent loop keeps the audio session alive
  } else {
    try { await lock?.release(); } catch { /* ignore */ }
    lock = null;
    keepAwakeAudio(false);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted) acquire();
});
