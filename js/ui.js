// Tiny DOM helpers: escaping, toasts, bottom sheets, icons.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}

let toastTimer = null;
export function toast(msg, { error = false, ms = 2200 } = {}) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('err', error);
  el.style.display = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}

// Bottom sheet. Returns {el, close}. onClose called when dismissed.
export function sheet(innerHTML, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${innerHTML}</div>`;
  const close = () => { if (!back.isConnected) return; back.remove(); document.removeEventListener('keydown', onKey); if (!$('.sheet-backdrop')) document.body.style.overflow = ''; onClose?.(); };
  // Escape closes the sheet on top (not one under it, nor a photo viewer over it).
  const onKey = (e) => { if (e.key === 'Escape' && !$('.viewer') && back === $$('.sheet-backdrop').pop()) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  on(back, 'click', '[data-close]', close);
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  return { el: back.firstElementChild, close };
}

export function confirmSheet({ title, body, okLabel = 'OK', danger = false, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const s = sheet(`
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="close" data-close aria-label="Close">×</button></div>
      <p>${body}</p>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn" data-close>${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>
      </div>`, { onClose: () => resolve(false) });
    $('[data-ok]', s.el).addEventListener('click', () => { resolve(true); s.close(); }); // the later resolve(false) from onClose is a no-op
  });
}

export const fmtTime = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};
export const fmtLb = (x) => { if (x == null || x === '') return '—'; const r = Math.round(Number(x) * 10) / 10; return Number.isInteger(r) ? `${r}` : `${r}`; };
export const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtClock = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  program: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  streak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V11M10 19V5M16 19v-7M22 19H2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 7"/></svg>',
};
