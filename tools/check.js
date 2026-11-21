// `npm run check`: quick sanity (< 60 s). Boots Larkfield, runs 1 year on seed 1, then checks: no crash, no NaN in key person fields,
// money invariant, snapshot round-trip runs, and key metrics inside loose bands.   node tools/check.js [--seed 1] [--years 1]
import { createLarkfieldWorld, restoreLarkfieldWorld } from '../sim/larkfield.js';
import { TICKS_PER_DAY } from '../sim/time.js';

const argv = process.argv.slice(2), val = (f, d) => (argv.includes(f) ? +argv[argv.indexOf(f) + 1] : d);
const seed = val('--seed', 1), years = val('--years', 1);
const res = [];
const ok = (name, pass, msg = '') => { res.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${msg}`); };
const t0 = performance.now();
let w;
try {
  w = createLarkfieldWorld(seed);
  const pop0 = w.living().length;
  const t1 = performance.now();
  w.run(Math.round(years * 365 * TICKS_PER_DAY));
  const tps = Math.round(years * 365 * TICKS_PER_DAY / ((performance.now() - t1) / 1000));
  ok('boot+run', true, `${years}y, pop ${pop0} -> ${w.living().length}, ${tps} ticks/s`);
  const L = w.living(), ad = L.filter((p) => w.ageOf(p) >= 16);
  let bad = 0; for (const p of L) for (const k of ['money', 'mood', 'health', 'x', 'y']) if (typeof p[k] === 'number' && !Number.isFinite(p[k])) bad++;
  ok('no NaN', bad === 0, `${bad} bad fields`);
  const inv = w.ledger.invariant(); ok('money invariant', inv.ok, `drift ${inv.drift}`);
  const band = (name, v, lo, hi) => ok(name, v >= lo && v <= hi, `${v.toFixed(3)} in [${lo}, ${hi}]`);
  band('population change', L.length / pop0, 0.85, 1.15);
  const act = (a) => ad.filter((p) => p.ext.pop.activity === a).length / ad.length;
  band('employed share', act('employed'), 0.45, 0.70);
  band('student share', act('student'), 0.04, 0.16);
  band('unemployed share', act('unemployed'), 0.02, 0.12);
  band('median age', L.map((p) => w.ageOf(p)).sort((a, b) => a - b)[L.length >> 1], 28, 40);
  const snap = JSON.parse(JSON.stringify(w.snapshot()));
  const w2 = restoreLarkfieldWorld(snap); w2.run(TICKS_PER_DAY * 14);
  ok('snapshot resume', w2.living().length > 0.9 * L.length, `restored ${w2.living().length}/${L.length}, +14 days ok`);
} catch (e) { ok('crash', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); }
const failed = res.filter((r) => !r.pass);
console.log(failed.length ? `\nCHECK FAILED: ${failed.map((f) => f.name).join(', ')}` : `\nCHECK OK (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
process.exit(failed.length ? 1 : 0);
