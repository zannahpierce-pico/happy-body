// Accounts and sync (Playwright) against tests/fake-supabase.cjs: two people, one of
// them on two devices, offline edits, deletes, photos, sign-in by emailed link, and the
// app still working signed out and offline from the service worker cache.
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createFakeSupabase } = require('./fake-supabase.cjs');

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

const step = (s) => console.log('·', s);

(async () => {
  // Tokens expire after 65 s, so the client refreshes them a few seconds into the run.
  const fake = createFakeSupabase({ expiresIn: 65 });
  const apiUrl = await fake.listen();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const b = await chromium.launch();
  const errors = [];

  async function open(name, opts = {}) {
    const ctx = await b.newContext({ ...(opts.desktop ? { viewport: { width: 1100, height: 900 } } : devices['iPhone 13']), serviceWorkers: opts.sw ? 'allow' : 'block' });
    if (!opts.noSync) await ctx.addInitScript((cfg) => localStorage.setItem('hb.syncConfig', JSON.stringify(cfg)), { url: apiUrl, anonKey: fake.anonKey });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
    await page.goto(base + '#settings');
    await page.waitForSelector('[data-export]');
    return { ctx, page, name };
  }
  const settled = (d) => d.page.waitForFunction(() => { const { sync, store } = window.hb; return !sync.running && sync.state === 'idle' && store.syncPending === 0; }, null, { timeout: 15000 });
  async function syncNow(d) { await d.page.evaluate(() => window.hb.sync.syncNow()); await settled(d); }
  async function signIn(d, email, password, { create = false } = {}) {
    await d.page.goto(base + '#settings');
    await d.page.click('[data-signin]');
    await d.page.fill('input[name=email]', email);
    await d.page.fill('input[name=password]', password);
    await d.page.click(create ? '[data-act=signup]' : '[data-act=signin]');
    await d.page.waitForSelector('[data-signout]');
    await settled(d);
  }
  const state = (d) => d.page.evaluate(async () => {
    const { store } = window.hb;
    const photo = await store.getPhoto('progress:ph1');
    return {
      log: store.log.map((e) => e.id), base: store.settings.base, reps: store.settings.reps, level12: store.settings.levels['1:2'],
      weights: store.progress.weights.map((w) => w.lb), photos: store.progress.photos.map((p) => p.id), photoBytes: photo?.blob?.size || 0,
      history: store.history.length, lastSynced: store.syncMeta.lastSynced,
    };
  });
  const addEntry = (d, id) => d.page.evaluate((id) => window.hb.store.addEntry({ id, key: '1:1', seq: 1, n: 1, round: 1, rounds: 6, phase: 'w1', skipped: false, timed: false, secs: null, w: 3, lv: 5, reps: 6 }), id);

  // ── Zannah's phone: uses the app signed out first, then creates an account ──
  const phone = await open('phone');
  step('signed out: the Account card offers sign-in');
  assert.ok(await phone.page.isVisible('[data-signin]'));
  await addEntry(phone, 'z-offline-1');
  await phone.page.evaluate(async () => {
    const { store } = window.hb;
    await store.setSettings({ base: 7 }, { type: 'base', from: 3, to: 7 });
    await store.setSettings({ levels: { '1:2': 3 } });
    await store.updateProgress((p) => { p.weights.push({ id: 'w1', ts: Date.now(), lb: 151.2 }); return p; });
    const blob = await new Promise((res) => { const c = document.createElement('canvas'); c.width = 60; c.height = 80; c.getContext('2d').fillRect(0, 0, 60, 80); c.toBlob(res, 'image/jpeg', 0.8); });
    await store.setPhoto('progress:ph1', blob);
    await store.updateProgress((p) => { p.photos.push({ id: 'ph1', ts: Date.now(), tag: 'front', note: '' }); return p; });
  });
  await phone.page.click('[data-signin]');
  await phone.page.waitForSelector('[data-auth]');
  await phone.page.waitForTimeout(400);
  await phone.page.screenshot({ path: `${OUT}/30-sign-in.png` });
  await phone.page.click('.sheet [data-close]');
  await signIn(phone, 'zannah@example.com', 'correct horse', { create: true });
  const dump1 = fake.dump();
  assert.equal(dump1.files.length, 1, 'photo file uploaded');
  assert.ok(dump1.rows.some((r) => r.kind === 'log' && r.id === 'z-offline-1'), 'offline log entry pushed');
  assert.match(await phone.page.textContent('[data-last-synced]'), /today/);
  await phone.page.screenshot({ path: `${OUT}/31-account-synced.png`, fullPage: true });

  // ── Zannah's computer ──
  step('second device signs in and receives everything');
  const laptop = await open('laptop', { desktop: true });
  const wrong = laptop.page;
  await wrong.click('[data-signin]');
  await wrong.fill('input[name=email]', 'zannah@example.com'); await wrong.fill('input[name=password]', 'wrong password');
  await wrong.click('[data-act=signin]');
  await wrong.waitForFunction(() => /Invalid login/.test(document.querySelector('[data-msg]')?.textContent || ''));
  await wrong.click('.sheet [data-close]');
  await signIn(laptop, 'zannah@example.com', 'correct horse');
  let s = await state(laptop);
  assert.deepEqual(s.log, ['z-offline-1']);
  assert.equal(s.base, 7); assert.equal(s.level12, 3);
  assert.deepEqual(s.weights, [151.2]);
  assert.deepEqual(s.photos, ['ph1']);
  assert.ok(s.photoBytes > 100, 'photo file downloaded');
  assert.equal(s.history, 1);

  step('edits on each device reach the other; same field: newest wins');
  await laptop.page.evaluate(async () => { const { store } = window.hb; await store.deleteEntries(['z-offline-1']); await store.setSettings({ reps: 3 }); });
  await phone.page.evaluate(() => window.hb.store.setSettings({ levels: { '1:2': 2 } }));
  await laptop.page.waitForTimeout(5);
  await laptop.page.evaluate(() => window.hb.store.setSettings({ levels: { '1:2': 4 } }));
  await addEntry(phone, 'z-phone-2');
  await syncNow(phone); await syncNow(laptop); await syncNow(phone);
  for (const d of [phone, laptop]) {
    s = await state(d);
    assert.deepEqual(s.log, ['z-phone-2'], d.name);
    assert.equal(s.reps, 3, d.name); assert.equal(s.base, 7, d.name); assert.equal(s.level12, 4, d.name);
  }

  step('photo removal syncs');
  await laptop.page.evaluate(async () => { const { store } = window.hb; await store.deletePhoto('progress:ph1'); await store.updateProgress((p) => { p.photos = []; return p; }); });
  await syncNow(laptop); await syncNow(phone);
  s = await state(phone);
  assert.equal(s.photoBytes, 0); assert.deepEqual(s.photos, []);
  assert.equal(fake.dump().files.length, 0, 'file removed from storage');

  // ── Dan: his own account, his own data ──
  step('a second person sees only their own data');
  const dan = await open('dan');
  await signIn(dan, 'dan@example.com', 'another secret', { create: true });
  s = await state(dan);
  assert.deepEqual(s.log, []); assert.equal(s.base, 3); assert.deepEqual(s.weights, []);
  await addEntry(dan, 'd-1');
  await dan.page.evaluate(() => window.hb.store.setSettings({ base: 12 }));
  await syncNow(dan); await syncNow(phone);
  s = await state(phone);
  assert.deepEqual(s.log, ['z-phone-2']); assert.equal(s.base, 7);
  const cross = await dan.page.evaluate(async (zid) => {
    const { sync } = window.hb;
    try { await sync.req('/rest/v1/hb_records?on_conflict=user_id,kind,id', { method: 'POST', json: [{ user_id: zid, kind: 'log', id: 'evil', data: { id: 'evil', ts: 1 }, deleted: false, updated_at: 1 }] }); return 'accepted'; } catch (e) { return e.message; }
  }, fake.dump().users.find((u) => u.email === 'zannah@example.com').id);
  assert.match(cross, /row-level security/, 'writing into another account is refused');

  // ── Offline on the phone ──
  step('offline edits wait, then sync when back online');
  await phone.ctx.setOffline(true);
  await addEntry(phone, 'z-offline-3');
  await phone.page.evaluate(() => window.hb.sync.syncNow());
  await phone.page.goto(base + '#settings'); await phone.page.waitForSelector('[data-sync-state]');
  assert.match(await phone.page.textContent('[data-sync-state]'), /Offline/);
  assert.equal(await phone.page.textContent('[data-sync-pending]'), '1');
  await phone.page.screenshot({ path: `${OUT}/32-account-offline.png`, fullPage: true });
  await phone.ctx.setOffline(false);
  await settled(phone); // the online event triggers the sync
  await syncNow(laptop);
  assert.deepEqual((await state(laptop)).log, ['z-phone-2', 'z-offline-3']);

  step('token refresh keeps the session alive');
  await laptop.page.waitForTimeout(6000);
  await addEntry(laptop, 'z-laptop-4');
  await syncNow(laptop);
  assert.ok(await laptop.page.isVisible('[data-signout]'));

  // ── Sign out, then sign in with an emailed link ──
  step('sign out keeps local data; sign in by emailed link');
  await laptop.page.click('[data-signout]');
  await laptop.page.click('[data-out=keep]');
  await laptop.page.waitForSelector('[data-signin]');
  assert.equal((await state(laptop)).log.length, 3);
  const sendLink = async (email) => {
    await laptop.page.click('[data-signin]');
    await laptop.page.fill('input[name=email]', email);
    await laptop.page.click('[data-act=link]');
    await laptop.page.waitForFunction(() => /^Sent/.test(document.querySelector('[data-msg]')?.textContent || ''));
    await laptop.page.click('.sheet [data-close]');
    return fake.link(email);
  };
  fake.expireNextLink('zannah@example.com');
  await laptop.page.goto(await sendLink('zannah@example.com'));
  await laptop.page.waitForFunction(() => /did not work/.test(document.querySelector('.toast')?.textContent || ''));
  assert.equal(await laptop.page.evaluate(() => location.hash), '#settings');
  assert.ok(await laptop.page.isVisible('[data-signin]'), 'an expired link leaves you signed out');
  const link = await sendLink('zannah@example.com');
  assert.ok(link.startsWith(base + '#access_token='), 'the link comes back to this page');
  await laptop.page.goto(link);
  await laptop.page.waitForSelector('[data-signout]');
  assert.equal(await laptop.page.evaluate(() => location.hash), '#settings', 'tokens are cleared from the address');
  await settled(laptop);
  assert.equal((await state(laptop)).log.length, 3);

  step('another account on the same device: erase choice');
  await laptop.page.click('[data-signout]'); await laptop.page.click('[data-out=keep]');
  await laptop.page.waitForSelector('[data-signin]');
  await laptop.page.click('[data-signin]');
  await laptop.page.fill('input[name=email]', 'dan@example.com'); await laptop.page.fill('input[name=password]', 'another secret');
  await laptop.page.click('[data-act=signin]');
  await laptop.page.waitForSelector('[data-choice=erase]');
  await laptop.page.click('[data-choice=erase]');
  await laptop.page.waitForSelector('[data-signout]'); await settled(laptop);
  s = await state(laptop);
  assert.deepEqual(s.log, ['d-1']); assert.equal(s.base, 12);
  await syncNow(phone);
  assert.equal((await state(phone)).log.includes('d-1'), false);

  // ── No account, no network: still a full app ──
  step('signed out and offline from the service worker cache');
  const solo = await open('solo', { sw: true, noSync: true });
  assert.ok(await solo.page.isVisible('[data-signin]'), 'signed out: the Account card offers sign-in');
  await solo.page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await solo.page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).map((r) => new URL(r.url).pathname));
  for (const f of ['/js/merge.js', '/js/sync.js', '/js/config.js']) assert.ok(cached.includes(f), `${f} precached`);
  await solo.page.reload(); // let the worker control the page
  await solo.ctx.setOffline(true);
  await solo.page.reload();
  await solo.page.goto(base + '#today'); await solo.page.waitForSelector('[data-act="done"]');
  await solo.page.click('[data-act="done"]');
  await solo.page.waitForFunction(() => window.hb.store.log.length === 1);

  const unexpected = errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(e));
  console.log('errors:', unexpected.length ? unexpected : 'none');
  await b.close(); server.close(); fake.close();
  if (unexpected.length) process.exit(1);
  console.log('sync e2e: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
