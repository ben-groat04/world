// Determinism harness. node tools/determinism.js [--seed 1] [--pop 222] [--years 1] [--mode agenda|legacy]
//  1. same seed twice => identical per-day state hashes
//  2. snapshot (JSON round trip) at 40% of the run, restore, resume => per-day hashes equal the straight run
//  3. command log replay: a run with queued god commands, replayed from seed + log, equals the original
// Exports run(opts) -> {ok, results:[{name, ok, detail}]} for tools/check.js. Exit 1 on failure.
import { World } from '../sim/world.js';
import { replay } from '../sim/kernel/commands.js';
import { TICKS_PER_DAY } from '../sim/time.js';

export function run(o = {}) {
  const seed = o.seed ?? 1, pop = o.pop ?? 222, mode = o.mode ?? 'agenda', days = Math.round((o.years ?? 1) * 112);
  const mk = () => new World({ seed, population: pop, hashDaily: true, sched: mode });
  const ticks = days * TICKS_PER_DAY, results = [];
  const add = (name, ok, detail = '') => results.push({ name, ok, detail });
  const firstDiff = (a, b) => { const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `first divergence at day ${i}: ${a[i]} vs ${b[i]}`; return ''; };

  const a = mk(); a.run(ticks);
  const b = mk(); b.run(ticks);
  add('same seed twice', a.hashLog.join() === b.hashLog.join() && a.stateHash() === b.stateHash(), firstDiff(a.hashLog, b.hashLog));

  const c = mk(); c.run(Math.floor(ticks * 0.4) - (Math.floor(ticks * 0.4) % 1));
  const snap = JSON.parse(JSON.stringify(c.snapshot()));
  const d = World.restore(snap, null); d.run(ticks - d.tick);
  add('snapshot-resume equals straight run', a.hashLog.join() === d.hashLog.join() && a.stateHash() === d.stateHash(), firstDiff(a.hashLog, d.hashLog));

  const cmds = [[Math.floor(days * 0.3)], [Math.floor(days * 0.6)]];
  const mkCmd = () => { const w = mk(); w.registerCommand('test.bump', (ww, args) => { for (const p of ww.living()) if (p.id % args.mod === 0) p.money += args.amt; }); return w; };
  const e = mkCmd();
  for (const [day] of cmds) { e.run(day * TICKS_PER_DAY - e.tick); e.queueCommand({ actor: 'god', name: 'test.bump', args: { mod: 3, amt: day } }); }
  e.run(ticks - e.tick);
  const f = replay(mkCmd, e.commands.log, ticks);
  add('command-log replay equals original', e.commands.log.length === 2 && e.stateHash() === f.stateHash(), `log=${e.commands.log.length} ${e.stateHash()} vs ${f.stateHash()}`);
  const g = World.restore(JSON.parse(JSON.stringify(e.snapshot())), null);
  add('snapshot round trip preserves hash', g.stateHash() === e.stateHash(), `${g.stateHash()} vs ${e.stateHash()}`);

  const h = a.fork(7), h2 = a.fork(7), h3 = a.fork(8);
  h.run(TICKS_PER_DAY * 5); h2.run(TICKS_PER_DAY * 5); h3.run(TICKS_PER_DAY * 5);
  add('fork(salt) deterministic and divergent', h.stateHash() === h2.stateHash() && h.stateHash() !== h3.stateHash());
  return { ok: results.every((r) => r.ok), results };
}
if (process.argv[1] && process.argv[1].endsWith('determinism.js')) {
  const A = process.argv.slice(2), o = {};
  for (let i = 0; i < A.length; i++) { const k = A[i].replace(/^--/, ''); if (k === 'mode') o.mode = A[++i]; else o[k] = +A[++i]; }
  const r = run(o);
  for (const x of r.results) console.log(`${x.ok ? 'PASS' : 'FAIL'} ${x.name}${x.ok ? '' : ' :: ' + x.detail}`);
  process.exit(r.ok ? 0 : 1);
}
