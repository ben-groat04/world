// Business report:  node tools/report-business.js [--seed 1] [--years 10] [--seeds 1,2,3]   (also called from tools/report-larkfield.js)
// Openings/closures per year by type, vacancy rate, void durations, survival curve (Kaplan-Meier of businesses opened in the run), mix change, jobs, closure reasons, news sample, perf.
import { createLarkfieldWorld } from '../sim/larkfield.js';

const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n)), pc = (x) => (x * 100).toFixed(0) + '%';
export function businessSection(w, o = {}) {
  const out = [], q = w.sys.business.query, yr = q.yearly(), years = Object.keys(yr).sort(), past = q.past();
  out.push(`BUSINESS  trading ${q.stats().trading}  vacant ${q.stats().vacant} (vacancy ${pc(q.vacancyRate())}; UK high streets 11-14%, London ~7-10%)  rent index ${f(q.rentIndex(), 2)}  affluence ${f(q.affluence(), 2)}  jobs at managed venues ${q.jobs()}  fav moves ${q.stats().favMoves}`);
  const sum = (k) => years.map((y) => Object.values(yr[y][k]).reduce((a, b) => a + b, 0));
  out.push(`  openings/yr ${sum('open').join(' ')}   closures/yr ${sum('close').join(' ')}   (closure rate ${pc(sum('close').slice(1).reduce((a, b) => a + b, 0) / Math.max(1, years.length - 1) / Math.max(1, q.stats().trading + q.stats().vacant))}/yr of units; UK retail ~8-10%)`);
  const byT = (k) => { const m = {}; for (const y of years) for (const [t, n] of Object.entries(yr[y][k])) m[t] = (m[t] || 0) + n; return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', '); };
  out.push(`  opened by type: ${byT('open')}`); out.push(`  closed by type: ${byT('close')}`);
  const why = {}; for (const r of past) { const k = (r.init ? 'incumbent:' : 'entrant:') + r.why; why[k] = (why[k] || 0) + 1; } out.push(`  closure causes: ${Object.entries(why).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const s = q.survival(); out.push(`  survival of new businesses (KM, n=${s.n}, closed ${s.closed}): ${s.curve.map((c) => `${c.year}y ${f(c.surv * 100, 0)}% (at risk ${c.atRisk})`).join('  ')}   [UK ONS: 1y ~92%, 5y ~39%, food&drink ~33%]`);
  const v = q.voids().filter((x) => !x.init).map((x) => x.months).sort((a, b) => a - b); out.push(`  void durations (months, relets): median ${v.length ? v[v.length >> 1] : 'n/a'}  mean ${f(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), 1)}  >36m ${v.filter((x) => x > 36).length}/${v.length}  [LDC: ~1/3 of vacant units empty 3y+]`);
  { const t = q.vacTail(); out.push(`  vacant STOCK (held-out, unit-months over the run): ${f(100 * t.longMonths / Math.max(1, t.unitMonths), 0)}% of vacant unit-months are in units empty >36 months [LDC: ~1/3 of vacant units 3y+]; now vacant: ${q.vacant().map((v) => v.vacantMonths).sort((a, b) => b - a).join(',') || 'none'} months`); }
  const m0 = q.mix0(), m1 = q.mix(), ks = [...new Set([...Object.keys(m0), ...Object.keys(m1)])].sort(); out.push(`  mix day1 -> now: ${ks.map((k) => `${k} ${m0[k] || 0}>${m1[k] || 0}`).join(', ')}`);
  const own = {}; for (const b of q.list()) if (b.status === 'trading') own[b.owner.kind] = (own[b.owner.kind] || 0) + 1; out.push(`  owners now: ${Object.entries(own).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const tr = q.list().filter((b) => b.status === 'trading' && b.last); const mg = tr.map((b) => b.last.margin).sort((a, b) => a - b); out.push(`  monthly margin of trading units: median ${pc(mg[mg.length >> 1] || 0)}  p10 ${pc(mg[Math.floor(mg.length * 0.1)] || 0)}  p90 ${pc(mg[Math.floor(mg.length * 0.9)] || 0)}  rent/revenue median ${pc(tr.map((b) => b.last.rent / Math.max(1, b.last.rev)).sort((a, b) => a - b)[tr.length >> 1] || 0)} [cafes 10-15%]`);
  out.push('  news sample:'); for (const n of q.news(o.news || 8)) out.push(`    - ${n.line}`);
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('report-business.js')) {
  const a = process.argv.slice(2), val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const seeds = String(val('--seeds', val('--seed', '1'))).split(',').map(Number), years = +val('--years', 10);
  for (const seed of seeds) { const w = createLarkfieldWorld(seed), t0 = performance.now(); w.run(144 * 365 * years); console.log(`--- seed ${seed}, ${years}y, ${((performance.now() - t0) / 1000 / years).toFixed(1)}s/yr`); console.log(businessSection(w).join('\n')); }
}
