// Perf harness. node tools/perf.js [--seed 1] [--years 1] [--gate 5000] [--json] [--prof]
// Reports ticks/s (steady state: first sim-month discarded as JIT warm-up), p50/p99 per-tick ms, wakes per person-day.
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { TICKS_PER_DAY } from '../sim/time.js';

export function parse(argv) {
  const o = { seed: 1, years: 1, gate: 0, json: false, prof: false };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--seed') o.seed = +argv[++i]; else if (a === '--years') o.years = +argv[++i]; else if (a === '--gate') o.gate = +argv[++i]; else if (a === '--json') o.json = true; else if (a === '--prof') o.prof = true; }
  return o;
}
export function measure(o) {
  const w = createLarkfieldWorld(o.seed);
  if (o.prof) w.enableProfile();
  const warm = 28 * TICKS_PER_DAY, total = Math.round(o.years * 365 * TICKS_PER_DAY);
  w.run(warm); const w0 = w.sched.stats.wakes;
  const ms = new Float64Array(total - warm);
  const t0 = performance.now(); let tl = t0;
  for (let i = 0; i < ms.length; i++) { w.step(); const t = performance.now(); ms[i] = t - tl; tl = t; }
  const secs = (tl - t0) / 1000, sorted = Float64Array.from(ms).sort();
  const pd = (ms.length / TICKS_PER_DAY) * w.living().length;
  return { seed: o.seed, pop: w.living().length, ticks: ms.length, secs: +secs.toFixed(2), ticksPerSec: Math.round(ms.length / secs), p50ms: +sorted[ms.length >> 1].toFixed(3), p99ms: +sorted[Math.floor(ms.length * 0.99)].toFixed(3), wakesPerPersonDay: +((w.sched.stats.wakes - w0) / pd).toFixed(2), prof: w.prof };
}
if (process.argv[1] && process.argv[1].endsWith('perf.js')) {
  const o = parse(process.argv.slice(2)), r = measure(o);
  if (o.json) console.log(JSON.stringify(r)); else console.log(`perf seed=${r.seed} pop=${r.pop}: ${r.ticksPerSec} ticks/s (${r.ticks} ticks in ${r.secs}s), p50 ${r.p50ms}ms p99 ${r.p99ms}ms, ${r.wakesPerPersonDay} wakes/person-day` + (r.prof ? '\n' + JSON.stringify(r.prof.sys) : ''));
  if (o.gate && r.ticksPerSec < o.gate) { console.error(`PERF GATE FAILED: ${r.ticksPerSec} < ${o.gate}`); process.exit(1); }
}
