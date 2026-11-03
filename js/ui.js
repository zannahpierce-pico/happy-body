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
  const close = () => { if (!back.isConnected) return; back.remove(); document.body.style.overflow = ''; onClose?.(); };
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
    $('[data-ok]', s.el).addEventListener('click', () => { resolve(true); s.el.parentElement.remove(); document.body.style.overflow = ''; });
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
  program: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12M6 12h12M6 16h8"/><rect x="3" y="4" width="18" height="16" rx="3"/></svg>',
  streak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 7"/></svg>',
};
