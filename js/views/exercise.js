// Exercise detail sheet: setup, steps with images, levels (selectable), tempo, purpose.
import { store } from '../store.js';
import { key as keyOf } from '../data/exercises.js';
import { weightLabel, repsLabel } from '../program.js';
import { repSeconds } from '../data/exercises.js';
import { stepImages, levelImages } from '../figure.js';
import { photoKey, pageKey, photoURL } from '../photos.js';
import { sheet, esc, on, $, $$, toast } from '../ui.js';

export function tempoChips(e) {
  return `<div class="tempo-chips">${e.phases.map((p) => `<span class="chip k-${p[2]}">${esc(p[0])} <b>${p[1]}s</b></span>`).join('')}<span class="chip">${repSeconds(e)}s per rep</span></div>`;
}

export async function openExercise(e) {
  const k = keyOf(e);
  const s = store.settings;
  const steps = stepImages(e.images);
  const levels = levelImages(e.images);

  const html = `
    <div class="sheet-head">
      <div>
        <div class="ex-key">${k} · Sequence ${e.seq}</div>
        <h2 style="font-size:24px">${esc(e.name)}</h2>
        <div class="muted small">${esc(weightLabel(e, s.base))} · ${esc(repsLabel(e, s))} · Level <span data-lv-now>${s.levels[k] || 5}</span></div>
        <button class="book-btn" data-book hidden>Book page</button>
      </div>
      <button class="close" data-close aria-label="Close">×</button>
    </div>
    <div class="stack">
      <section class="card flat">
        <h3>Setup</h3>
        <p style="margin:6px 0 0">${esc(e.setup)}</p>
      </section>
      <section>
        <div class="card-title"><h3>Steps</h3></div>
        <div class="steps">
          ${e.steps.map((t, i) => `
            <div class="step">
              <div class="img" data-img="${photoKey(k, 'step', i)}">${steps[i] || ''}</div>
              <div class="txt">${esc(t)}</div>
            </div>`).join('')}
        </div>
      </section>
      <section>
        <div class="card-title"><h3>Tempo</h3><span class="hint">one breath per rep</span></div>
        ${tempoChips(e)}
      </section>
      <section>
        <div class="card-title"><h3>Level</h3><span class="hint">5 is the full movement</span></div>
        <div class="levels">
          ${e.levels.map((t, i) => `
            <div class="level ${(s.levels[k] || 5) === i + 1 ? 'on' : ''}" data-level="${i + 1}" role="radio" aria-checked="${(s.levels[k] || 5) === i + 1}">
              <div class="img" data-img="${photoKey(k, 'level', i)}">${levels[i] || ''}</div>
              <div class="t"><b>Level ${i + 1}</b>${esc(t)}</div>
              <span class="radio"></span>
            </div>`).join('')}
        </div>
      </section>
      <section class="card flat">
        <h3>Why</h3>
        <p style="margin:6px 0 0">${esc(e.why)}</p>
      </section>
    </div>`;

  const sh = sheet(html);
  const root = sh.el;

  // Swap in stored photos.
  async function loadPhotos() {
    for (const box of $$('[data-img]', root)) {
      const url = await photoURL(box.dataset.img);
      const old = $('img, svg', box);
      if (url) {
        const img = document.createElement('img'); img.src = url; img.alt = '';
        if (old) old.replaceWith(img); else box.prepend(img);
      }
    }
  }
  loadPhotos();

  // The whole book page for this exercise, if one has been imported.
  photoURL(pageKey(k)).then((url) => {
    const b = $('[data-book]', root);
    if (url && b) { b.hidden = false; b.addEventListener('click', () => viewPhoto(url, `${e.name}, book page`)); }
  });

  // Tap a photo to see it full screen.
  on(root, 'click', '[data-img] img', (ev, img) => {
    ev.stopImmediatePropagation(); // don't also pick the level
    viewPhoto(img.src);
  });

  on(root, 'click', '[data-level]', async (ev, el) => {
    const lv = Number(el.dataset.level);
    const prev = store.settings.levels[k] || 5;
    if (lv === prev) return;
    await store.setSettings({ levels: { [k]: lv } }, { type: 'level', key: k, from: prev, to: lv });
    for (const l of $$('[data-level]', root)) { const onIt = Number(l.dataset.level) === lv; l.classList.toggle('on', onIt); l.setAttribute('aria-checked', onIt); }
    $('[data-lv-now]', root).textContent = lv;
    toast(`${e.name}: level ${lv}`);
  });

  return sh;
}

// Full-screen photo: tap to zoom in on that spot, scroll to pan, tap again to fit.
function viewPhoto(url, alt = '') {
  const v = document.createElement('div');
  v.className = 'viewer';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-modal', 'true');
  v.innerHTML = `<img alt="${esc(alt)}"><button class="close" aria-label="Close">×</button>`;
  const img = $('img', v);
  img.src = url;
  const close = () => { v.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  $('.close', v).addEventListener('click', close);
  img.addEventListener('click', (ev) => {
    // Where the tap lands on the picture itself (it is letterboxed while fitted).
    const r = img.getBoundingClientRect();
    const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const clamp = (x) => Math.min(1, Math.max(0, x));
    const fx = clamp((ev.clientX - r.left - (r.width - w) / 2) / w);
    const fy = clamp((ev.clientY - r.top - (r.height - h) / 2) / h);
    const zoomed = v.classList.toggle('zoomed');
    if (!zoomed) return;
    const z = img.getBoundingClientRect();
    v.scrollLeft = fx * z.width - v.clientWidth / 2;
    v.scrollTop = fy * z.height - v.clientHeight / 2;
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(v);
}
