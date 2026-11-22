// Feed pace measurement (Playwright, iPhone 13): node tools/measure-feed.js [--secs 10] [--seed 1] [--speeds scene,life,x3,x8]
// For each speed and each Watch mode, counts how many NEW items per real second appear in the visible feed (and how many ticker updates), plus raw news per second from the sim.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/'); const { chromium, devices } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const secs = +arg('secs', 10), seed = +arg('seed', 1), speeds = String(arg('speeds', 'scene,life,x3,x8')).split(',');
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok));
const browser = await chromium.launch(); const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://localhost:${srv.address().port}/index.html?seed=${seed}&speed=pause`);
await page.waitForFunction(() => window.larkfield && window.larkfield.store.s.ready, null, { timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('lf_welcomed', '1'); } catch (e) {} });
await page.locator('#tabs [data-tab=feed]').click().catch(() => {});
const out = [];
for (const sp of speeds) {
  // warm up so the feeds have content, then measure each mode
  await page.evaluate((sp) => window.larkfield.store.setSpeed(sp), sp); await page.waitForTimeout(4000);
  for (const mode of ['local', 'stories', 'forum', 'posts']) {
    await page.evaluate((m) => { document.querySelector(`#fchips [data-m=${m}]`).click(); }, mode); await page.waitForTimeout(600);
    const r = await page.evaluate(async ({ secs, mode }) => {
      const body = document.querySelector('#fbody'), tk = document.querySelector('#ticker'), st = window.larkfield.store;
      const key = (a) => (a.textContent || '').trim().slice(0, 90); let seen = new Set([...body.querySelectorAll('article')].map(key)), added = 0, churn = 0, tickN = 0, lastTick = tk.textContent;
      const rawNews = { n: 0 }; const off = st.on('news', (it) => { rawNews.n += it.length; });
      const t0 = performance.now(); let renders = 0;
      const poll = setInterval(() => { const ks = [...body.querySelectorAll('article')].map(key); let ch = false; for (const k of ks) if (!seen.has(k)) { seen.add(k); added++; ch = true; } if (ch) renders++; if (tk.textContent !== lastTick) { lastTick = tk.textContent; tickN++; } }, 100);
      await new Promise((r) => setTimeout(r, secs * 1000)); clearInterval(poll); off();
      const dt = (performance.now() - t0) / 1000; return { added, perSec: +(added / dt).toFixed(2), renders, rendersPerSec: +(renders / dt).toFixed(2), ticker: +(tickN / dt).toFixed(2), raw: +(rawNews.n / dt).toFixed(2) };
    }, { secs, mode });
    out.push({ speed: sp, mode, ...r }); console.log(JSON.stringify({ speed: sp, mode, ...r }));
  }
}
await page.evaluate(() => window.larkfield.store.setSpeed('pause'));
console.log(errs.length ? 'ERRORS ' + errs.slice(0, 5).join(' | ') : 'no console errors');
await browser.close(); srv.close();
