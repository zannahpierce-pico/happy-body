// Browser pass: serves the folder, screenshots tabs, runs a workout flow, checks persistence.
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.OUT || path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'light' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base);
  await page.waitForSelector('.timer');
  await page.screenshot({ path: `${OUT}/01-today.png`, fullPage: true });

  // Settings: get-ready off so the flow is fast; sound off for headless.
  await page.goto(base + '#settings'); await page.waitForSelector('[data-set="timer.getReady|0"]');
  await page.click('[data-set="timer.getReady|0"]');
  await page.click('[data-toggle="timer.sound"]');
  await page.click('[data-toggle="timer.voice"]');
  await page.click('[data-toggle="timer.autoStart"]');
  await page.screenshot({ path: `${OUT}/04-settings.png`, fullPage: true });
  await page.goto(base + '#program'); await page.waitForSelector('.wl');
  await page.screenshot({ path: `${OUT}/02-program.png`, fullPage: true });
  await page.goto(base + '#progress'); await page.waitForSelector('.grid28');
  await page.screenshot({ path: `${OUT}/03-streak.png`, fullPage: true });

  // Flow: start the timer, let it run 3.5 s, screenshot, then Done.
  await page.goto(base + '#today'); await page.waitForSelector('[data-act="start"]');
  await page.click('[data-act="start"]');
  await page.waitForTimeout(3400);
  const phase = await page.textContent('[data-phase]');
  console.log('phase after 3.4s:', phase);
  await page.screenshot({ path: `${OUT}/05-running.png`, fullPage: false });
  await page.click('[data-act="done"]');
  await page.waitForTimeout(300);
  await page.click('[data-act="done"]'); // 1:2 done without timer
  await page.waitForTimeout(300);
  let entries = await page.evaluate(() => window.hb.store.log.length);
  console.log('entries after 2 done:', entries);
  const nowName = await page.textContent('.timer .ex-name');
  console.log('current exercise:', nowName);

  // Persistence: reload and check both stores.
  await page.reload(); await page.waitForSelector('.timer');
  entries = await page.evaluate(() => window.hb.store.log.length);
  const lsCount = await page.evaluate(() => JSON.parse(localStorage.getItem('hb.log')).items.length);
  const idbCount = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('happybody'); r.onsuccess = () => { const db = r.result; const t = db.transaction('log').objectStore('log').count(); t.onsuccess = () => res(t.result); }; }));
  const settingsOk = await page.evaluate(() => window.hb.store.settings.timer.getReady === 0 && window.hb.store.settings.timer.sound === false);
  console.log('after reload: memory', entries, 'localStorage', lsCount, 'idb', idbCount, 'settings persisted', settingsOk);
  const nowName2 = await page.textContent('.timer .ex-name');
  console.log('current exercise after reload:', nowName2);

  // Wipe localStorage only; IDB should restore and re-mirror.
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForSelector('.timer');
  const afterLsWipe = await page.evaluate(() => [window.hb.store.log.length, JSON.parse(localStorage.getItem('hb.log') || '{"items":[]}').items.length]);
  console.log('after localStorage wipe (idb restores, mirror rebuilt):', afterLsWipe);

  // Wipe IDB only; localStorage should restore and IDB be repaired.
  await page.evaluate(() => new Promise((res) => { window.hb.store.db.close(); const r = indexedDB.deleteDatabase('happybody'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await page.reload(); await page.waitForSelector('.timer');
  const afterIdbWipe = await page.evaluate(async () => { const n = window.hb.store.log.length; const c = await new Promise((res) => { const r = indexedDB.open('happybody'); r.onsuccess = () => { const t = r.result.transaction('log').objectStore('log').count(); t.onsuccess = () => res(t.result); }; }); return [n, c]; });
  console.log('after idb wipe (ls restores, idb repaired):', afterIdbWipe);

  // Export shape
  const exp = await page.evaluate(async () => { const d = await window.hb.store.exportData(); return { app: d.app, log: d.log.length, hasSettings: !!d.settings }; });
  console.log('export:', JSON.stringify(exp));

  // Exercise sheet
  await page.click('.ex-row');
  await page.waitForSelector('.sheet'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06-exercise.png`, fullPage: false });
  await page.click('[data-level="3"]');
  await page.waitForTimeout(200);
  const lv = await page.evaluate(() => window.hb.store.settings.levels['1:1']);
  console.log('level after tap:', lv);
  await page.click('.sheet .close');

  // Complete the day quickly via store, check relax + complete states and streak
  await page.evaluate(async () => { const s = window.hb.session; while (!s.position.complete) await s.done(); });
  await page.waitForSelector('[data-act="relax"]');
  await page.screenshot({ path: `${OUT}/07-relax.png`, fullPage: false });
  await page.click('[data-act="relax-skip"]');
  await page.waitForSelector('.complete-card');
  await page.screenshot({ path: `${OUT}/08-complete.png`, fullPage: true });
  await page.goto(base + '#progress'); await page.waitForSelector('.grid28');
  const streak = await page.textContent('.streak-hero .num');
  console.log('streak:', streak);
  await page.screenshot({ path: `${OUT}/09-streak-done.png`, fullPage: true });

  // Dark mode shots
  const dctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
  const dp = await dctx.newPage();
  await dp.goto(base); await dp.waitForSelector('.timer, .complete-card');
  await dp.screenshot({ path: `${OUT}/10-dark-today.png`, fullPage: true });
  await dp.goto(base + '#program'); await dp.waitForSelector('.wl');
  await dp.screenshot({ path: `${OUT}/11-dark-program.png`, fullPage: true });

  // service worker registered?
  const swState = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (r.active ? 'active' : 'registered') : 'none'; });
  console.log('service worker:', swState);

  console.log('errors:', errors.length ? errors : 'none');
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
