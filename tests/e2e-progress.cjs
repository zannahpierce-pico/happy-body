// Progress tab: weigh-ins + chart, standards check-ins, targets, progress photos, persistence, export.
const { chromium, devices } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const OUT = path.join(ROOT, 'tests', 'shots'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise((r) => server.listen(0, r)); const base = `http://localhost:${server.address().port}/`;
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '#progress'); await page.waitForSelector('.grid28');
  await page.click('[data-sub="standards"]'); await page.waitForSelector('.badges');
  await page.screenshot({ path: `${OUT}/20-standards-empty.png`, fullPage: true });
  // Seed 20 days of weigh-ins + a target, then add today's via the UI
  await page.evaluate(async () => { await window.hb.store.updateProgress((p) => { p.standards.weight.target = 120; for (let i = 20; i >= 1; i--) p.weights.push({ id: 'w' + i, ts: Date.now() - i * 86400000, lb: 128 - (20 - i) * 0.35 + (i % 3) * 0.3 }); return p; }); });
  await page.fill('[data-weigh-input]', '121.4'); await page.click('[data-weigh]'); await page.waitForTimeout(300);
  await page.click('[data-pass="flex|yes"]'); await page.waitForTimeout(200);
  await page.click('[data-pass="posture|no"]'); await page.waitForTimeout(200);
  await page.fill('[data-value-input="lean"]', '21'); await page.click('[data-save-value="lean"]'); await page.waitForTimeout(200);
  await page.fill('[data-target="lean"]', '20'); await page.press('[data-target="lean"]', 'Tab'); await page.waitForTimeout(300);
  await page.fill('[data-target="strength"]', '3'); await page.press('[data-target="strength"]', 'Tab'); await page.waitForTimeout(300);
  await page.hover('[data-chart]'); await page.waitForTimeout(100);
  console.log('met count:', await page.textContent('.card-title h2'));
  console.log('badges:', await page.$$eval('.badge', (els) => els.map((e) => e.className.replace('badge', '').trim() || 'unknown').join(',')));
  console.log('chart points:', await page.$$eval('.chart .mark:not(.hot)', (els) => els.length), 'tip:', await page.textContent('[data-tip]'));
  await page.screenshot({ path: `${OUT}/21-standards.png`, fullPage: true });
  // Photos: store two generated images programmatically (file picker can't be driven headlessly)
  await page.click('[data-sub="photos"]'); await page.waitForSelector('[data-add-photo]');
  await page.evaluate(async () => {
    const mk = (color, label) => new Promise((res) => { const c = document.createElement('canvas'); c.width = 300; c.height = 400; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 300, 400); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText(label, 60, 200); c.toBlob(res, 'image/jpeg', 0.8); });
    const { store } = window.hb;
    const a = await mk('#6f8fa6', 'Day 1'), b2 = await mk('#b8923d', 'Day 30');
    await store.setPhoto('progress:p1', a); await store.setPhoto('progress:p2', b2);
    await store.updateProgress((p) => { p.photos.push({ id: 'p1', ts: Date.now() - 30 * 86400000, tag: 'front', note: 'start' }, { id: 'p2', ts: Date.now(), tag: 'front', note: '' }); return p; });
  });
  await page.waitForTimeout(500);
  console.log('compare shown:', await page.$$eval('.compare .ph', (els) => els.map((e) => e.style.backgroundImage.length > 10).join(',')));
  await page.screenshot({ path: `${OUT}/22-photos.png`, fullPage: true });
  await page.click('.photo-grid .ph'); await page.waitForSelector('.sheet img'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/23-photo-open.png` });
  await page.click('.sheet .close');
  // Persistence
  await page.reload(); await page.waitForSelector('[data-add-photo]');
  const after = await page.evaluate(() => ({ w: window.hb.store.progress.weights.length, c: window.hb.store.progress.checkins.length, ph: window.hb.store.progress.photos.length, t: window.hb.store.progress.standards.lean.target }));
  console.log('after reload:', JSON.stringify(after));
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('.grid28');
  console.log('after LS wipe:', await page.evaluate(() => window.hb.store.progress.weights.length));
  const exp = await page.evaluate(async () => { const d = await window.hb.store.exportData(); return { photos: Object.keys(d.photos).length, weights: d.progress.weights.length, size: JSON.stringify(d).length }; });
  console.log('export:', JSON.stringify(exp));
  // Import into a fresh profile (replace) and check photos + progress arrive
  const json = await page.evaluate(async () => JSON.stringify(await window.hb.store.exportData()));
  const ctx2 = await b.newContext({ ...devices['iPhone 13'] }); const p2 = await ctx2.newPage(); await p2.goto(base); await p2.waitForSelector('.timer');
  await p2.evaluate(async (j) => { await window.hb.store.importData(JSON.parse(j), 'replace'); }, json);
  console.log('imported:', await p2.evaluate(async () => [window.hb.store.progress.weights.length, (await window.hb.store.photoKeys()).length]));
  // Dark mode standards shot
  const d = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' }); const dp = await d.newPage();
  await dp.goto(base + '#progress'); await dp.waitForSelector('.grid28');
  await dp.evaluate((j) => window.hb.store.importData(JSON.parse(j), 'replace'), json); await dp.click('[data-sub="standards"]'); await dp.waitForSelector('.chart'); await dp.waitForTimeout(300);
  await dp.screenshot({ path: `${OUT}/24-dark-standards.png`, fullPage: true });
  console.log('errors:', errors.length ? errors : 'none');
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
