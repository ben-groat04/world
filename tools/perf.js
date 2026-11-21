// Perf harness / gate. node tools/perf.js [--seed 1] [--pop 222] [--years 1] [--mode agenda|legacy] [--gate 5000] [--json]
// Reports ticks/s (steady state: first sim-month discarded as JIT warm-up), p50/p99 per-tick ms, decisions per person-day, wakes, heap.
// With --gate N exits 1 if ticks/s < N. Pop 500 is the roadmap gate size (--pop 500).
import { World } from '../sim/world.js';
import { TICKS_PER_DAY } from '../sim/time.js';

export function parse(argv) {
  const o = { seed: 1, pop: 222, years: 1, mode: 'agenda', gate: 0, json: false, prof: false };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--seed') o.seed = +argv[++i]; else if (a === '--pop') o.pop = +argv[++i]; else if (a === '--years') o.years = +argv[++i]; else if (a === '--mode') o.mode = argv[++i]; else if (a === '--gate') o.gate = +argv[++i]; else if (a === '--json') o.json = true; else if (a === '--prof') o.prof = true; }
  return o;
}
export function measure(o) {
  const w = new World({ seed: o.seed, population: o.pop, settings: { houses: Math.ceil(o.pop * 0.39) }, sched: o.mode });
  let dec = 0; const od = w.brain.decide.bind(w.brain); w.brain.decide = (p, d) => { dec++; return od(p, d); };
  if (o.prof) w.enableProfile();
  const warm = 28 * TICKS_PER_DAY, total = Math.round(o.years * 112 * TICKS_PER_DAY);
  w.run(warm); dec = 0;
  const ms = new Float64Array(total - warm);
  const t0 = performance.now(); let tl = t0;
  for (let i = 0; i < ms.length; i++) { w.step(); const t = performance.now(); ms[i] = t - tl; tl = t; }
  const secs = (tl - t0) / 1000, sorted = Float64Array.from(ms).sort();
  const pd = (ms.length / TICKS_PER_DAY) * w.living().length;
  return { mode: o.mode, seed: o.seed, pop: w.living().length, ticks: ms.length, secs: +secs.toFixed(2), ticksPerSec: Math.round(ms.length / secs), p50ms: +sorted[ms.length >> 1].toFixed(3), p99ms: +sorted[Math.floor(ms.length * 0.99)].toFixed(2), decisionsPerPersonDay: +(dec / pd).toFixed(2), wakes: w.sched.stats.wakes, heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), prof: w.prof };
}
if (process.argv[1] && process.argv[1].endsWith('perf.js')) {
  const o = parse(process.argv.slice(2)), r = measure(o);
  if (o.json) console.log(JSON.stringify(r)); else console.log(`perf ${r.mode} seed=${r.seed} pop=${r.pop}: ${r.ticksPerSec} ticks/s (${r.ticks} ticks in ${r.secs}s), p50 ${r.p50ms}ms p99 ${r.p99ms}ms, ${r.decisionsPerPersonDay} decisions/person-day, ${r.wakes} wakes, heap ${r.heapMB}MB`);
  if (o.gate && r.ticksPerSec < o.gate) { console.error(`PERF GATE FAILED: ${r.ticksPerSec} < ${o.gate}`); process.exit(1); }
}
