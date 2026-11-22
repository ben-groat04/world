// Mobile smoke test (Playwright + Chromium, iPhone 13): node tools/smoke-mobile.js [--secs 20] [--seed 1] [--shot]
// Serves the repo root, loads the app, runs the sim at speed, opens every tab and a spread of people (child, migrant, retiree, someone who left town), and fails on any console error,
// page error, or "NaN" / "undefined" / "[object" / unfilled template slot in the visible text.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium, devices } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const secs = +arg('secs', 20), seed = +arg('seed', 1), shot = arg('shot', false);
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok));
const browser = await chromium.launch(); const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + String(e)));
await page.goto(`http://localhost:${srv.address().port}/index.html?seed=${seed}&speed=pause`);
await page.waitForFunction(() => window.larkfield && window.larkfield.store.s.ready, null, { timeout: 90000 });
const BAD = /\bNaN\b|\bundefined\b|\[object|\{[a-z$][\w.|:?-]*\}|#[a-z][\w.:-]*#|\bnull\b/;
const problems = []; const check = async (label) => { const t = await page.evaluate(() => document.body.innerText); const m = BAD.exec(t); if (m) problems.push(`${label}: "${t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, ' ')}"`); return t; };
await page.evaluate(() => window.larkfield.store.setSpeed('x5')); await page.waitForTimeout(secs * 1000); 
for (const tab of ['feed', 'people', 'town', 'god', 'feed']) { try { await page.locator(`#tabs [data-tab=${tab}]`).click({ timeout: 8000 }); await page.waitForTimeout(1200); await check('tab ' + tab); if (shot) await page.screenshot({ path: `/tmp/smoke-${tab}.png` }); } catch (e) { problems.push(`tab ${tab}: ${String(e).slice(0, 80)}`); } }
await page.evaluate(() => window.larkfield.store.setSpeed('pause'));
// a spread of people: oldest, youngest, a migrant, a student, anyone in the roster order
const picks = await page.evaluate(() => { const r = [...window.larkfield.store.s.roster.values()]; const ids = r.map((x) => x.id); const pick = (i) => ids[Math.min(ids.length - 1, Math.max(0, i))]; return [pick(0), pick(3), pick(Math.floor(ids.length / 3)), pick(Math.floor(ids.length / 2)), pick(ids.length - 1), pick(ids.length - 7)]; });
for (const id of picks) { await page.evaluate((id) => window.larkfield.store.select(id), id); try { await page.waitForFunction((id) => { const d = window.larkfield.store.s.detail; return d && d.id === id; }, id, { timeout: 8000 }); await page.waitForTimeout(500); const t = await check('person ' + id); if (/\bDied\b/.test(t)) { const alive = await page.evaluate(() => window.larkfield.store.s.detail.alive); if (alive) problems.push('person ' + id + ': "Died" tag on a living resident'); } if (shot) await page.screenshot({ path: `/tmp/smoke-person-${id}.png` }); } catch (e) { problems.push('person ' + id + ': ' + String(e).slice(0, 80)); } }
const nPlayers = await page.evaluate(() => { const d = window.larkfield.store.s.detail; return d ? d.name : ''; });
console.log(`smoke (iPhone 13, seed ${seed}, ${secs}s at x5): last person opened ${nPlayers}`);
for (const e of errs.slice(0, 8)) console.log('  ERROR ' + e); for (const p of problems.slice(0, 12)) console.log('  PROBLEM ' + p);
await browser.close(); srv.close();
console.log(errs.length || problems.length ? `SMOKE FAILED (${errs.length} errors, ${problems.length} problems)` : 'SMOKE OK: no console errors, no NaN/undefined/unfilled slots');
process.exit(errs.length || problems.length ? 1 : 0);
