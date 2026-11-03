// Exercise detail sheet: setup, steps with images, levels (selectable), tempo, purpose.
import { store } from '../store.js';
import { key as keyOf } from '../data/exercises.js';
import { weightLabel, repsLabel } from '../program.js';
import { repSeconds } from '../data/exercises.js';
import { stepImages, levelImages } from '../figure.js';
import { photoKey, photoURL, replacePhoto } from '../photos.js';
import { sheet, esc, on, $, $$, toast, confirmSheet, ICONS } from '../ui.js';

export function tempoChips(e) {
  return `<div class="tempo-chips">${e.phases.map((p) => `<span class="chip k-${p[2]}">${esc(p[0])} <b>${p[1]}s</b></span>`).join('')}<span class="chip">${repSeconds(e)}s per rep</span></div>`;
}

export async function openExercise(e) {
  const k = keyOf(e);
  const s = store.settings;
  const steps = stepImages(e.images);
  const levels = levelImages(e.images);
  const camBtn = (pk) => `<button class="cam" data-photo="${pk}" aria-label="Replace with my photo">${ICONS.camera}</button>`;

  const html = `
    <div class="sheet-head">
      <div>
        <div class="ex-key">${k} · Sequence ${e.seq}</div>
        <h2 style="font-size:24px">${esc(e.name)}</h2>
        <div class="muted small">${esc(weightLabel(e, s.base))} · ${esc(repsLabel(e, s))} · Level <span data-lv-now>${s.levels[k] || 5}</span></div>
      </div>
      <button class="close" data-close aria-label="Close">×</button>
    </div>
    <div class="stack">
      <section class="card flat">
        <h3>Setup</h3>
        <p style="margin:6px 0 0">${esc(e.setup)}</p>
      </section>
      <section>
        <div class="card-title"><h3>Steps</h3><span class="hint">Tap the camera to use your own photo</span></div>
        <div class="steps">
          ${e.steps.map((t, i) => `
            <div class="step">
              <div class="img" data-img="${photoKey(k, 'step', i)}">${steps[i] || ''}${camBtn(photoKey(k, 'step', i))}</div>
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
              <div class="img" data-img="${photoKey(k, 'level', i)}">${levels[i] || ''}${camBtn(photoKey(k, 'level', i))}</div>
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
        if (!$('.rm', box)) {
          const rm = document.createElement('button'); rm.className = 'cam rm'; rm.style.right = 'auto'; rm.style.left = '-6px'; rm.style.background = 'var(--red)';
          rm.dataset.rmPhoto = box.dataset.img; rm.setAttribute('aria-label', 'Remove photo'); rm.textContent = '×';
          box.appendChild(rm);
        }
      }
    }
  }
  loadPhotos();

  on(root, 'click', '[data-photo]', async (ev, btn) => {
    ev.stopPropagation();
    try {
      if (await replacePhoto(btn.dataset.photo)) { toast('Photo saved'); rebuild(); }
    } catch (err) { toast(err.message || 'Could not save photo', { error: true }); }
  });
  on(root, 'click', '[data-rm-photo]', async (ev, btn) => {
    ev.stopPropagation();
    if (await confirmSheet({ title: 'Remove photo?', body: 'The drawing will be shown again.', okLabel: 'Remove', danger: true })) {
      await store.deletePhoto(btn.dataset.rmPhoto); toast('Photo removed'); rebuild();
    }
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

  function rebuild() { sh.close(); openExercise(e); }
  return sh;
}
