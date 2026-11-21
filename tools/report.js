// node tools/report.js --seed 1 --years 50 [--pop 220] [--quiet]
// Runs the sim headless and prints a compact (<80 line) demographic/economic/plausibility report.
import { World } from '../sim/world.js';
import { TICKS_PER_YEAR } from '../sim/time.js';
import { attachCollector, computeMetrics, runChecks, BINS } from './plausibility.js';

const args = process.argv.slice(2);
const arg = (k, def) => { const i = args.indexOf('--' + k); return i < 0 ? def : (args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const seed = +arg('seed', 1), years = +arg('years', 50), pop = arg('pop', null), quiet = args.includes('--quiet');
const w = new World(pop ? { seed, population: +pop } : { seed });
const d = attachCollector(w);
const t0 = performance.now();
let ticks = 0;
for (let y = 0; y < years; y++) for (let i = 0; i < TICKS_PER_YEAR; i++) { w.step(); ticks++; }
const secs = (performance.now() - t0) / 1000;
const m = computeMetrics(w, d), checks = runChecks(w, d, m);
const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n));
const pc = (x) => (x == null ? 'n/a' : (x * 100).toFixed(0) + '%');
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : '?');
const out = [];
out.push(`HOLLOWMERE seed=${seed} years=${years}: ${secs.toFixed(1)}s, ${Math.round(ticks / secs)} ticks/s (${f(years / secs, 1)} game-yrs/s); pop ${m.startPop} -> ${m.pop} (${m.popChange == null ? 'n/a' : (m.popChange * 100).toFixed(0) + '%'})`);

// per-decade table
out.push('decade   pop  birth death marr  div crime  imm  emi');
for (let s = 0; s < years; s += 10) {
  const sum = { births: 0, deaths: 0, marriages: 0, divorces: 0, crimes: 0, imm: 0, emi: 0 }; let popEnd = null;
  for (let y = s; y < Math.min(years, s + 10); y++) { const Y = d.years[y]; if (!Y) continue; for (const k in sum) sum[k] += Y[k] || 0; if (Y.pop != null) popEnd = Y.pop; }
  out.push(`${String(s + 1).padStart(2)}-${String(Math.min(years, s + 10)).padEnd(3)} ${String(popEnd ?? '-').padStart(5)} ${String(sum.births).padStart(5)} ${String(sum.deaths).padStart(5)} ${String(sum.marriages).padStart(4)} ${String(sum.divorces).padStart(4)} ${String(sum.crimes).padStart(5)} ${String(sum.imm).padStart(4)} ${String(sum.emi).padStart(4)}`);
}

// age pyramid, 5-year bins (first bin merges 0-4), two columns
const L = w.living(), cnt = { M: [], F: [] };
const grp = (a) => Math.min(17, Math.floor(a / 5));
for (let i = 0; i < 18; i++) { cnt.M[i] = 0; cnt.F[i] = 0; }
for (const p of L) cnt[p.sex === 'F' ? 'F' : 'M'][grp(w.ageOf(p))]++;
const mx = Math.max(1, ...cnt.M, ...cnt.F), bar = (v, ch) => ch.repeat(Math.round(v / mx * 10));
const row = (i) => `${(i * 5 + (i === 17 ? '+' : '-' + (i * 5 + 4))).padStart(5)} ${bar(cnt.M[i], '#').padStart(10)}|${bar(cnt.F[i], 'o').padEnd(10)} ${cnt.M[i]}/${cnt.F[i]}`;
out.push(`age pyramid (M#|oF, M/F counts), sex ratio M:F=${f(m.sexRatio, 2)}, median age ${f(m.medianAge)}`);
for (let i = 0; i < 9; i++) out.push(row(i) + '   ' + row(i + 9));

const lf = m.life;
out.push(`life exp: e0=${f(lf?.e0)} e15=${lf ? f(15 + lf.e15) : 'n/a'}(total) | infant mort ${pc(lf?.infant)} under5 ${pc(lf?.under5)} | deaths ${m.deathsN}`);
out.push('causes: ' + (m.causes.slice(0, 8).map(([c, n]) => `${c} ${Math.round(n / m.deathsN * 100)}%`).join(', ') || 'n/a'));
out.push(`first marriage age M ${f(m.marrAge.M)}(n${m.marrAge.nM}) F ${f(m.marrAge.F)}(n${m.marrAge.nF}); first birth ${f(m.firstBirthAge)}; completed fertility ${f(m.fertility, 2)}(n${m.fertilityN}); married adults ${pc(m.marriedPct)}; never-married 50+ ${pc(m.neverMarried50)}`);
out.push(`employment ${pc(m.employment)}; jobs: ${m.jobs.slice(0, 9).map(([j, n]) => j + ' ' + n).join(', ')}`);
out.push(`gini ${f(m.gini, 2)}; richest: ` + m.rich.map((r) => `${nm(r.p)} ${Math.round(r.money)}c (${r.p.job}${r.owned.length ? ', owns ' + r.owned.join('/') : ''}${(r.p.family?.childrenIds || []).length ? ', ' + r.p.family.childrenIds.length + ' kids' : ''})`).join('; '));
const mayors = d.mayors.map((x) => `${nm(w.people.get(x.id))}(Y${Math.floor(x.tick / TICKS_PER_YEAR) + 1})`);
out.push(`mayors (${mayors.length}): ${mayors.slice(0, 10).join(', ')}${mayors.length > 10 ? ', ...' : ''}`);
out.push(`mood avg ${f(m.mood, 2)}, depressed ${pc(m.depressed)}; relationship tags ${m.relTags} distinct; friends/person ${f(m.friendsPer, 1)}, enemies/person ${f(m.enemiesPer, 2)}; rumors spread ${d.rumors}; crimes ${m.crimes} (${Object.entries(d.crimeKinds).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => k + ' ' + n).join(', ') || 'none'}); murders ${d.murders}`);

// checks: failures/warnings in full, passes condensed
const by = { FAIL: [], WARN: [], PASS: [] };
for (const c of checks) by[c.status].push(c);
out.push(`CHECKS: ${by.PASS.length} PASS, ${by.WARN.length} WARN, ${by.FAIL.length} FAIL`);
for (const c of [...by.FAIL, ...by.WARN]) out.push(`${c.status} ${c.name}: ${c.msg}`);
if (by.PASS.length) out.push('PASS ' + by.PASS.map((c) => c.name + (c.msg && !/^no /.test(c.name) ? ` [${c.msg.split(' (')[0]}]` : '')).join('; '));

if (!quiet) {
  const ents = (w.chronicle?.entries || []).filter((e) => e.importance >= 3);
  const pick = [], seenT = new Set();
  if (ents.length) {
    const want = Math.min(12, ents.length);
    for (let i = 0; i < want; i++) {
      const lo = Math.floor(i * ents.length / want), hi = Math.floor((i + 1) * ents.length / want);
      let best = null;
      for (let j = lo; j < Math.max(hi, lo + 1); j++) { const e = ents[j]; if (!seenT.has(e.type) || !best) { best = e; if (!seenT.has(e.type)) break; } }
      seenT.add(best.type); pick.push(best);
    }
  }
  out.push('chronicle sample:');
  for (const e of pick) out.push(' ' + w.chronicle.format(e).slice(0, 150));
  // biographies of 2 notable people: most-memorable people (dead or alive) with a deterministic spread
  const cand = [...w.people.values()].filter((p) => (p.memories?.length || 0) >= 5).sort((a, b) => (w.chronicle.byPerson?.get(b.id)?.length || 0) - (w.chronicle.byPerson?.get(a.id)?.length || 0)).slice(0, 20);
  const chosen = cand.length > 1 ? [cand[0], cand[Math.min(cand.length - 1, 1 + ((seed * 7) % (cand.length - 1)))]] : cand;
  for (const p of chosen) {
    const ms = [...p.memories].filter((x) => (x.importance ?? 0) >= 3 || Math.abs(x.weight) >= 0.6).sort((a, b) => a.tick - b.tick);
    const step = Math.max(1, Math.ceil(ms.length / 3)), pick3 = ms.filter((_, i) => i % step === 0).slice(0, 3);
    out.push(`bio ${nm(p)} (${p.sex}, ${p.alive ? 'aged ' + f(w.ageOf(p), 0) : 'died ' + f((p.deathTick - p.birthTick) / TICKS_PER_YEAR, 0) + ' of ' + (p.causeOfDeath || '?')}, ${p.job || '?'}): ` + pick3.map((x) => `[${w.formatDate ? w.formatDate(x.tick) : x.tick}] ${x.text}`).join(' | ').slice(0, 330));
  }
}
console.log(out.join('\n'));
