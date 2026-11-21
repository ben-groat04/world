// Small multi-seed parameter search over MECHANISTIC parameters (world.settings.tune.*); see docs/CALIBRATION-METHOD.md.
//   node tools/tune.js [--seeds 1,2,3] [--years 4] [--trials 8] [--param fertRef=0.15:0.35 --param loneThr=0.3:0.6 ...]
// Random search; each trial = mean over seeds of metrics (tools/metrics.js), loss = sum of squared relative errors on TARGETS. Seeds run in parallel (worker_threads).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { metrics, TARGETS } from './metrics.js';

if (!isMainThread) {
  const { createLarkfieldWorld } = await import('../sim/larkfield.js');
  const { seed, years, tune } = workerData; const w = createLarkfieldWorld(seed, { settings: { tune } }); const pop0 = w.living().length;
  w.run(Math.round(years * 365 * 144)); parentPort.postMessage(metrics(w, pop0, years));
} else {
  const argv = process.argv.slice(2), val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
  const seeds = val('--seeds', '1,2,3').split(',').map(Number), years = +val('--years', 4), trials = +val('--trials', 8);
  const params = {}; argv.forEach((a, i) => { if (a === '--param') { const [k, r] = argv[i + 1].split('='); params[k] = r.split(':').map(Number); } });
  if (!Object.keys(params).length) { params.fertRef = [0.12, 0.35]; params.loneThr = [0.3, 0.6]; }
  const run = (tune) => Promise.all(seeds.map((seed) => new Promise((res, rej) => { const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { seed, years, tune } }); wk.on('message', res); wk.on('error', rej); })));
  const loss = (m) => Object.entries(TARGETS).reduce((s, [k, t]) => s + ((m[k] - t) / t) ** 2, 0);
  let seedState = 12345; const rnd = () => ((seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0) / 4294967296);
  let best = null;
  for (let i = 0; i < trials; i++) {
    const tune = Object.fromEntries(Object.entries(params).map(([k, [a, b]]) => [k, +(a + rnd() * (b - a)).toFixed(3)]));
    const rs = await run(tune), m = {}; for (const k of Object.keys(rs[0])) m[k] = rs.reduce((s, r) => s + r[k], 0) / rs.length;
    const L = loss(m); console.log(`trial ${i} loss ${L.toFixed(3)} ${JSON.stringify(tune)} -> ` + Object.keys(TARGETS).map((k) => `${k} ${m[k].toFixed(2)}/${TARGETS[k]}`).join(' '));
    if (!best || L < best.L) best = { L, tune, m };
  }
  console.log('BEST', JSON.stringify(best.tune), 'loss', best.L.toFixed(3));
}
