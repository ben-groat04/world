// Browser speed harness (Playwright + Chromium). node tools/browser-perf.js [--device iphone|desktop|desktop4x] [--secs 12] [--tiers life,x5,x20,max] [--shot]
// Serves the repo root statically, loads the app, and for each speed tier measures sim ticks/s (store.s.time.tick),
// game-years per real minute, main-thread rAF frame time, dropped frames (>34ms), long tasks, and frame-message rate/size.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium, devices } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const device = arg('device', 'desktop'), secs = +arg('secs', 12), tiers = String(arg('tiers', 'scene,life,x5,x20,max')).split(','), shot = arg('shot', false);
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok)); const url = `http://localhost:${srv.address().port}/index.html?seed=1&speed=pause`;
const browser = await chromium.launch();
const ctxOpts = device === 'iphone' ? { ...devices['iPhone 13'] } : device === 'se' ? { ...devices['iPhone SE'] } : { viewport: { width: 1280, height: 800 } };
const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage();
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
const cdp = await ctx.newCDPSession(page); if (device === 'desktop4x') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(url); await page.waitForFunction(() => window.larkfield && window.larkfield.store.s.ready, null, { timeout: 60000 });
await page.evaluate(() => { const st = window.larkfield.store, ap = st.apply.bind(st); window.__m = { n: 0, bytes: 0, tick: 0 }; st.apply = (m) => { if (m.t === 'frame') { window.__m.n++; window.__m.bytes += m.people.byteLength + m.occ.byteLength; } return ap(m); };
  window.__f = []; let l = performance.now(); const f = (n) => { window.__f.push(n - l); l = n; requestAnimationFrame(f); }; requestAnimationFrame(f);
  window.__lt = 0; try { new PerformanceObserver((l2) => { for (const e of l2.getEntries()) window.__lt += e.duration; }).observe({ entryTypes: ['longtask'] }); } catch (e) {} });
const out = [];
for (const t of tiers) {
  await page.evaluate((t) => window.larkfield.store.setSpeed(t), t); await page.waitForTimeout(2500);
  const a = await page.evaluate(() => { window.__f.length = 0; window.__lt = 0; window.__m.n = 0; window.__m.bytes = 0; const s = window.larkfield.store.s; return { tick: s.time.tick, t: performance.now(), tpy: s.tpy }; });
  // tap responsiveness: time from tap() to the handler running, sampled during the window
  const lat = []; const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { await page.waitForTimeout(1500); lat.push(await page.evaluate(() => new Promise((ok) => { const s = performance.now(); setTimeout(() => ok(performance.now() - s), 0); }))); }
  const taps = []; for (const k of ['town', 'god', 'feed']) { const t1 = Date.now(); await page.locator(`#tabs [data-tab=${k}]`).click({ timeout: 10000 }); await page.waitForFunction((k) => !document.getElementById('pane-' + k).hidden, k); taps.push(Date.now() - t1); }
  const b = await page.evaluate(() => { const s = window.larkfield.store.s, f = window.__f.slice(); f.sort((x, y) => x - y); return { tick: s.time.tick, t: performance.now(), n: f.length, p50: f[f.length >> 1], p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1], drop: f.filter((x) => x > 34).length, lt: window.__lt, msgs: window.__m.n, bytes: window.__m.bytes, pop: s.time.pop }; });
  const sec = (b.t - a.t) / 1000, tps = (b.tick - a.tick) / sec;
  out.push({ tier: t, tps: Math.round(tps), yrPerMin: +(tps * 60 / a.tpy).toFixed(2), yrPerHour: +(tps * 3600 / a.tpy).toFixed(1), fps: +(b.n / sec).toFixed(1), p50ms: +b.p50.toFixed(1), p95ms: +b.p95.toFixed(1), maxMs: +b.max.toFixed(0), dropped: b.drop, longTaskMsPerSec: +(b.lt / sec).toFixed(0), msgsPerSec: +(b.msgs / sec).toFixed(1), kbPerSec: +(b.bytes / 1024 / sec).toFixed(1), tapMs: Math.max(...taps), taskLagMaxMs: +Math.max(...lat).toFixed(0), pop: b.pop });
  if (shot) await page.screenshot({ path: path.join(root, `docs/screenshots/perf-${device}-${t}.png`) });
}
await page.evaluate(() => window.larkfield.store.setSpeed('pause'));
console.log(`device=${device}`); console.table(out); if (errs.length) console.log('ERRORS', errs.slice(0, 5));
await browser.close(); srv.close();
