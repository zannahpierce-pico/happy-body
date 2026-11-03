// "Replace with my photo": pick/capture, downscale, store in IndexedDB, serve object URLs.
import { store } from './store.js';

const urlCache = new Map(); // key -> object URL
store.subscribe((what) => { if (what === 'photos' || what === 'import') { for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear(); } });

export const photoKey = (exKey, kind, i) => `${exKey}:${kind}:${i}`;

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

export async function replacePhoto(key) {
  const file = await pickPhoto();
  if (!file) return false;
  const blob = await downscale(file);
  await store.setPhoto(key, blob);
  return true;
}
