// `npm run check`: all gates in one command. Exits 1 on any failure.   node tools/check.js [--full] [--quick] [--perf-gate N] [--only name,name]
//   grep      no Math.random / Date.now / new Date() / performance.now (outside the world.js profiler) in sim/ and content/
//   schema    content packs validate against sim/kernel/schema.js (legacy pack + content/*/index.js)
//   contract  node --test tests/ (rng, events, commands, plugins, ledger, indices, snapshot, schema, scheduler)
//   determinism same seed twice; snapshot-resume == straight run; command-log replay == original; fork   (--full = 3 sim-years, default 1)
//   perf      ticks/s at pop 222 >= gate (default 2500 or $PERF_GATE; roadmap target 10000, see ARCHITECTURE.md "Performance")
//   report    3-seed quick report; only the known balance FAILs may appear (invariant checks must pass)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), has = (f) => argv.includes(f), val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const only = val('--only', null) ? val('--only').split(',') : null;
const results = [];
function step(name, fn) {
  if (only && !only.includes(name)) return;
  const t0 = performance.now();
  let r; try { r = fn(); } catch (e) { r = { ok: false, msg: String(e && e.stack || e).split('\n').slice(0, 4).join(' | ') }; }
  results.push({ name, ok: r.ok, ms: performance.now() - t0, msg: r.msg || '' });
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name.padEnd(12)} ${((performance.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${r.msg || ''}`);
  if (!r.ok && r.detail) console.log(r.detail.split('\n').map((l) => '        ' + l).join('\n'));
}
const sh = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, ...opts });

step('grep', () => {
  const bad = [], re = /Math\.random|Date\.now|new Date\(\s*\)|performance\.now/;
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.js')) scan(p); } };
  const scan = (p) => {
    const rel = path.relative(ROOT, p);
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      const m = code.match(re); if (!m) return;
      if (m[0] === 'performance.now' && rel === path.join('sim', 'world.js') && /\bP\b|prof/.test(line)) return; // profiler only runs when world.prof is set
      if (line.includes('gate-ok')) return;
      bad.push(`${rel}:${i + 1}: ${m[0]}`);
    });
  };
  for (const d of ['sim', 'content']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  return { ok: bad.length === 0, msg: bad.length ? bad.length + ' banned call(s)' : 'clean', detail: bad.join('\n') };
});

step('schema', () => {
  const code = `import {validatePack, legacyPack} from './sim/kernel/index.js'; import fs from 'node:fs'; const out=[]; const r=validatePack(await legacyPack()); out.push(['hollowmere',r]);
    for (const d of fs.readdirSync('content',{withFileTypes:true})) if (d.isDirectory() && d.name!=='hollowmere' && fs.existsSync('content/'+d.name+'/index.js')) { const p=(await import('./content/'+d.name+'/index.js')).default; out.push([d.name, validatePack(p)]); }
    console.log(JSON.stringify(out.map(([n,r])=>({n, ok:r.ok, errors:r.errors, warnings:r.warnings}))));`;
  const r = sh(['--input-type=module', '-e', code]);
  if (r.status !== 0) return { ok: false, msg: 'validator crashed', detail: r.stderr };
  const packs = JSON.parse(r.stdout.trim().split('\n').pop());
  const bad = packs.filter((p) => !p.ok);
  const hasL = fs.existsSync(path.join(ROOT, 'content/larkfield/index.js'));
  return { ok: bad.length === 0, msg: packs.map((p) => `${p.n}:${p.ok ? 'ok' : 'INVALID'}`).join(' ') + (hasL ? '' : ' (larkfield/index.js not landed yet)'), detail: bad.map((p) => p.n + '\n' + p.errors.join('\n')).join('\n') };
});

step('contract', () => {
  const r = sh(['--test', 'tests/kernel.test.js']);
  const m = /# pass (\d+)/.exec(r.stdout), f = /# fail (\d+)/.exec(r.stdout);
  return { ok: r.status === 0, msg: `${m ? m[1] : '?'} passed, ${f ? f[1] : '?'} failed`, detail: r.status === 0 ? '' : (r.stdout + r.stderr).split('\n').filter((l) => /not ok|Error|expected|actual|at /.test(l)).slice(0, 30).join('\n') };
});

step('determinism', () => {
  const r = sh(['tools/determinism.js', '--years', has('--full') ? '3' : has('--quick') ? '0.25' : '1']);
  return { ok: r.status === 0, msg: (r.stdout.match(/PASS/g) || []).length + ' checks pass' + (r.status ? ', FAILED' : ''), detail: r.stdout + r.stderr };
});

step('perf', () => {
  const gate = +val('--perf-gate', process.env.PERF_GATE || 2500);
  const best = []; let last = null;
  for (let i = 0; i < 2; i++) { const r = sh(['tools/perf.js', '--years', '0.5', '--json', '--seed', String(i + 1)]); if (r.status !== 0) return { ok: false, msg: 'perf run crashed', detail: r.stderr }; last = JSON.parse(r.stdout.trim().split('\n').pop()); best.push(last.ticksPerSec); }
  const top = Math.max(...best); // best of 2: machine noise only ever slows a run
  return { ok: top >= gate, msg: `${top} ticks/s at pop ${last.pop} (gate ${gate}; ${last.decisionsPerPersonDay} decisions/person-day)` };
});

step('report', () => {
  const r = sh(['tools/report.js', '--seeds', '1,2,3', '--years', has('--full') ? '3' : '1', '--section', 'none']);
  if (r.status !== 0) return { ok: false, msg: 'report crashed', detail: r.stderr + r.stdout.slice(-600) };
  const KNOWN = [/life expectancy/, /age at first birth/, /completed fertility/, /gini of money/, /never married/, /first-marriage/, /infant mortality|under-5/];
  const line = r.stdout.split('\n').find((l) => l.startsWith('combined:')) || '';
  const fails = [...line.matchAll(/FAIL ([^;(]+?) \(/g)].map((m) => m[1]);
  const unknown = fails.filter((n) => !KNOWN.some((k) => k.test(n)));
  return { ok: unknown.length === 0, msg: `${fails.length} balance FAILs (known), ${unknown.length} unexpected`, detail: unknown.length ? 'unexpected: ' + unknown.join(', ') : '' };
});

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nCHECK FAILED: ${failed.map((f) => f.name).join(', ')}` : `\nCHECK OK (${results.length} gates, ${(results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0)}s)`);
process.exit(failed.length ? 1 : 0);
