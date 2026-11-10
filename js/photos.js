// Photos: pick/capture, downscale, store in IndexedDB, serve object URLs.
import { store } from './store.js';

const urlCache = new Map(); // key -> object URL
store.subscribe((what) => { if (what === 'photos' || what === 'import') { for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear(); } });

export const photoKey = (exKey, kind, i) => `${exKey}:${kind}:${i}`;
export const pageKey = (exKey) => `${exKey}:page:0`; // the whole book page for an exercise

export async function photoURL(key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const p = await store.getPhoto(key);
  if (!p?.blob) return null;
  const u = URL.createObjectURL(p.blob);
  urlCache.set(key, u);
  return u;
}

export function pickPhoto({ capture = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    input.click();
  });
}

export async function downscale(file, max = 1024, quality = 0.85) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return blob || file;
}

// Steps were renumbered to match the book (every exercise starts at its start position, and
// steps the data used to merge are separate again). Stored step photos keyed by the old index
// are copied to the index their pose now has. Copy only, never delete: a delete is a tombstone
// that syncs to every device, and one sent mid-migration from one device removed photos the
// others had already moved. Old indices stay valid (an import fills them with the right
// photo). Skipped for an exercise that already has photos beyond the old count: that set is
// the new numbering, whether imported here or synced from another device.
const STEP_REMAP = {
  '1:1': [2, 3, 4], '1:2': [1, 2, 3], '1:3': [1, 2, 3], '1:4': [1, 2, 3], '1:5': [1, 2], '1:6': [1, 2, 3, 4],
  '2:1': [1, 2, 3], '2:2': [1, 2, 3], '2:3': [1, 2, 3], '2:4': [1, 2, 3], '2:5': [3, 4, 5, 10], '2:6': [1, 2, 3, 4],
  '3:1': [1, 2, 3], '3:2': [2, 3, 4], '3:3': [1, 2, 3], '3:4': [2, 3, 4, 7], '3:5': [3, 4, 5, 6], '3:6': [1, 2, 3, 4],
};
const REMAP_FLAG = 'hb:stepPhotos:v2';
export async function migrateStepPhotos() {
  try { if (localStorage.getItem(REMAP_FLAG)) return; } catch { /* no localStorage: just try */ }
  const keys = new Set(await store.photoKeys());
  const byEx = {};
  for (const k of keys) {
    const m = /^(\d+:\d+):step:(\d+)$/.exec(k);
    if (m && STEP_REMAP[m[1]]) (byEx[m[1]] ||= []).push(Number(m[2]));
  }
  const copies = [];
  for (const [ex, idx] of Object.entries(byEx)) {
    const map = STEP_REMAP[ex];
    if (idx.some((i) => i >= map.length)) continue;               // already the new numbering
    for (const i of idx) {
      const to = map[i];
      if (to !== i) copies.push({ from: photoKey(ex, 'step', i), to: photoKey(ex, 'step', to) });
    }
  }
  // Read every source before writing: a target can be another step's old slot (1:1 step 2 moves to 4, step 0 to 2).
  const blobs = [];
  for (const c of copies) { const p = await store.getPhoto(c.from); if (p?.blob) blobs.push({ ...c, blob: p.blob }); }
  for (const c of blobs) await store.setPhoto(c.to, c.blob);
  try { localStorage.setItem(REMAP_FLAG, '1'); } catch { /* ignore */ }
}
