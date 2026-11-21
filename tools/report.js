// Compact plausibility report for the headless sim.
//   node tools/report.js --seed 1 --years 50 [--pop 220] [--quiet]
//   --section demo|econ|social|crime|stories[,..]   print only those parts (header, timing and CHECKS always print)
//   --seeds 1,2,3     run several seeds in parallel (worker_threads) and print one line per seed + combined check summary
//   --save snapshots/y30.json[.gz]   write a world snapshot after the run   --load <file>  continue from a snapshot (--years = extra years)
//   --hash            print the final state hash (same seed twice => identical hash)
//   --pop N           initial population (houses scale with it)
//   --noprof          disable per-system timing (tiny speedup)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { World } from '../sim/world.js';
import { saveSnapshot, loadSnapshot, stateHash } from '../sim/snapshot.js';
import { TICKS_PER_YEAR } from '../sim/time.js';
import { attachCollector, computeMetrics, runChecks } from './plausibility.js';

const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n));
const pc = (x) => (x == null ? 'n/a' : (x * 100).toFixed(0) + '%');
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : '?');

export function parseArgs(argv) {
  const o = { pack: null, seed: 1, years: 50, pop: null, quiet: false, sections: null, seeds: null, save: null, load: null, hash: false, prof: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = argv[i + 1];
    if (a === '--pack') o.pack = argv[++i]; else if (a === '--seed') o.seed = +argv[++i]; else if (a === '--years') o.years = +argv[++i]; else if (a === '--pop') o.pop = +argv[++i]; else if (a === '--life-years') o.lifeYears = +argv[++i];
    else if (a === '--quiet') o.quiet = true; else if (a === '--hash') o.hash = true; else if (a === '--noprof') o.prof = false;
    else if (a === '--section') o.sections = argv[++i].split(','); else if (a === '--seeds') o.seeds = argv[++i].split(',').map(Number);
    else if (a === '--save') o.save = argv[++i]; else if (a === '--load') o.load = argv[++i];
    else if (a === '--help' || a === '-h') { o.help = true; }
    else if (a.startsWith('--')) throw new Error('unknown option ' + a + ' ' + (nx ?? ''));
  }
  return o;
}

function readSnap(file) { const b = fs.readFileSync(file); return JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(b) : b).toString()); }
function writeSnap(file, w) { fs.mkdirSync(path.dirname(file), { recursive: true }); const s = JSON.stringify(saveSnapshot(w)); fs.writeFileSync(file, file.endsWith('.gz') ? zlib.gzipSync(s) : s); return s.length; }

// Run one simulation and return {lines, checks, summary}. Pure function of opts (safe inside a worker).
export function runOne(o) {
  const t00 = performance.now();
  const w = o.load ? loadSnapshot(readSnap(o.load)) : new World(o.pop ? { seed: o.seed, population: o.pop, settings: { houses: Math.ceil(o.pop * 0.39) } } : { seed: o.seed });
  const startTick = w.tick, y0 = Math.floor(startTick / TICKS_PER_YEAR);
  const d = attachCollector(w);
  const P = o.prof ? w.enableProfile() : null;
  const t0 = performance.now();
  const total = o.years * TICKS_PER_YEAR;
  for (let i = 0; i < total; i++) w.step();
  const secs = (performance.now() - t0) / 1000;
  const m = computeMetrics(w, d), checks = runChecks(w, d, m);
  const want = (s) => !o.sections || o.sections.includes(s);
  const out = [];
  out.push(`HOLLOWMERE seed=${w.seed}${o.load ? ' (from ' + path.basename(o.load) + ' @Y' + (y0 + 1) + ')' : ''} years=${o.years}: ${secs.toFixed(1)}s, ${Math.round(total / secs)} ticks/s (${f(o.years / secs, 2)} game-yrs/s); pop ${m.startPop} -> ${m.pop} (${m.popChange == null ? 'n/a' : (m.popChange * 100).toFixed(0) + '%'})`);
  if (P) {
    const sysT = Object.entries(P.sys).sort((a, b) => b[1] - a[1]), ms = (x) => Math.round(x / 10) / 100;
    out.push(`time(s): people-loop ${ms(P.people)} [brain ${ms(P.brain)}, walk ${ms(P.walk)}] | systems ${ms(sysT.reduce((s, x) => s + x[1], 0))}: ${sysT.map(([k, v]) => k + ' ' + ms(v)).join(', ')} | path searches ${w.path.stats.searches}`);
  }

  if (want('demo')) {
    out.push('decade   pop  birth death marr  div crime  imm  emi');
    for (let s = 0; s < o.years; s += 10) {
      const sum = { births: 0, deaths: 0, marriages: 0, divorces: 0, crimes: 0, imm: 0, emi: 0 }; let popEnd = null;
      for (let y = s; y < Math.min(o.years, s + 10); y++) { const Y = d.years[y0 + y]; if (!Y) continue; for (const k in sum) sum[k] += Y[k] || 0; if (Y.pop != null) popEnd = Y.pop; }
      out.push(`${String(y0 + s + 1).padStart(2)}-${String(y0 + Math.min(o.years, s + 10)).padEnd(3)} ${String(popEnd ?? '-').padStart(5)} ${String(sum.births).padStart(5)} ${String(sum.deaths).padStart(5)} ${String(sum.marriages).padStart(4)} ${String(sum.divorces).padStart(4)} ${String(sum.crimes).padStart(5)} ${String(sum.imm).padStart(4)} ${String(sum.emi).padStart(4)}`);
    }
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
    const ms = w.migrationState;
    if (ms) out.push(`migration: arrived ${ms.arrived}, departed ${ms.departed}`);
  }
  if (want('econ')) {
    out.push(`employment ${pc(m.employment)}; jobs: ${m.jobs.slice(0, 9).map(([j, n]) => j + ' ' + n).join(', ')}`);
    out.push(`gini ${f(m.gini, 2)}; richest: ` + m.rich.map((r) => `${nm(r.p)} ${Math.round(r.money)}c (${r.p.job}${r.owned.length ? ', owns ' + r.owned.join('/') : ''}${(r.p.family?.childrenIds || []).length ? ', ' + r.p.family.childrenIds.length + ' kids' : ''})`).join('; '));
    const e = w.econ, pr = w.settings.prices;
    out.push(`town treasury ${Math.round(w.town.treasury)}; tax ${pc(w.settings.taxRate)}; prices food ${f(pr.food, 2)} meal ${f(pr.tavernMeal, 2)} drink ${f(pr.drink, 2)}` + (e ? `; econ employment ${pc(e.employmentRate)} unemployed ${e.unemployed} gini ${f(e.gini, 2)} alms ${e.alms} evictions ${e.evictions} unmetGoods ${Math.round(e.unmetGoods)}` : ''));
    const bs = [...w.buildings.values()].filter((b) => b.type !== 'house' && b.funds != null);
    out.push('building funds: ' + bs.slice().sort((a, b) => b.funds - a.funds).slice(0, 4).map((b) => `${b.name} ${Math.round(b.funds)}`).join(', ') + ' ... poorest ' + bs.slice().sort((a, b) => a.funds - b.funds).slice(0, 2).map((b) => `${b.name} ${Math.round(b.funds)}`).join(', '));
  }
  if (want('social')) {
    const S = w.social?.stats;
    out.push(`mood avg ${f(m.mood, 2)}, depressed ${pc(m.depressed)}; relationship tags ${m.relTags} distinct; friends/person ${f(m.friendsPer, 1)}, enemies/person ${f(m.enemiesPer, 2)}; rumors spread ${d.rumors}`);
    if (S) out.push(`social: conversations ${S.conversations} gossips ${S.gossips} arguments ${S.arguments} reconciliations ${S.reconciliations} rumorsBorn ${S.rumorsBorn}; cliques ${w.social.cliques.length}; relationships/person ${f([...w.people.values()].filter((p) => p.alive).reduce((s, p) => s + p.relationships.size, 0) / Math.max(1, m.pop), 0)}`);
  }
  if (want('crime')) {
    const C = w.crime;
    out.push(`crimes ${m.crimes} (${Object.entries(d.crimeKinds).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => k + ' ' + n).join(', ') || 'none'}); murders ${d.murders}; per 1000/yr ${f(m.crimePer1000, 1)}` + (C ? `; convicted ${C.convicted} acquitted ${C.acquitted} unsolved ${C.unsolved} executions ${C.executions} jailed now ${C.jailed.size}` : ''));
  }
  if (want('stories') && !o.quiet) {
    const mayors = d.mayors.map((x) => `${nm(w.people.get(x.id))}(Y${Math.floor(x.tick / TICKS_PER_YEAR) + 1})`);
    out.push(`mayors (${mayors.length}): ${mayors.slice(0, 10).join(', ')}${mayors.length > 10 ? ', ...' : ''}`);
    const ents = (w.chronicle?.entries || []).filter((e) => e.importance >= 3);
    const pick = [], seenT = new Set();
    if (ents.length) {
      const wantN = Math.min(12, ents.length);
      for (let i = 0; i < wantN; i++) {
        const lo = Math.floor(i * ents.length / wantN), hi = Math.floor((i + 1) * ents.length / wantN);
        let best = null;
        for (let j = lo; j < Math.max(hi, lo + 1); j++) { const e = ents[j]; if (!seenT.has(e.type) || !best) { best = e; if (!seenT.has(e.type)) break; } }
        seenT.add(best.type); pick.push(best);
      }
    }
    out.push('chronicle sample:');
    for (const e of pick) out.push(' ' + w.chronicle.format(e).slice(0, 150));
    const cand = [...w.people.values()].filter((p) => (p.memories?.length || 0) >= 5).sort((a, b) => (w.chronicle.byPerson?.get(b.id)?.length || 0) - (w.chronicle.byPerson?.get(a.id)?.length || 0)).slice(0, 20);
    const chosen = cand.length > 1 ? [cand[0], cand[Math.min(cand.length - 1, 1 + ((w.seed * 7) % (cand.length - 1)))]] : cand;
    for (const p of chosen) {
      const ms = [...p.memories].filter((x) => (x.importance ?? 0) >= 3 || Math.abs(x.weight) >= 0.6).sort((a, b) => a.tick - b.tick);
      const step = Math.max(1, Math.ceil(ms.length / 3)), pick3 = ms.filter((_, i) => i % step === 0).slice(0, 3);
      out.push(`bio ${nm(p)} (${p.sex}, ${p.alive ? 'aged ' + f(w.ageOf(p), 0) : 'died ' + f((p.deathTick - p.birthTick) / TICKS_PER_YEAR, 0) + ' of ' + (p.causeOfDeath || '?')}, ${p.job || '?'}): ` + pick3.map((x) => `[${w.formatDate(x.tick)}] ${x.text}`).join(' | ').slice(0, 330));
    }
  }
  const by = { FAIL: [], WARN: [], PASS: [] };
  for (const c of checks) by[c.status].push(c);
  out.push(`CHECKS: ${by.PASS.length} PASS, ${by.WARN.length} WARN, ${by.FAIL.length} FAIL`);
  for (const c of [...by.FAIL, ...by.WARN]) out.push(`${c.status} ${c.name}: ${c.msg}`);
  if (by.PASS.length) out.push('PASS ' + by.PASS.map((c) => c.name + (c.msg && !/^no /.test(c.name) ? ` [${c.msg.split(' (')[0]}]` : '')).join('; '));
  let hash = null;
  if (o.hash || o.seeds) hash = stateHash(w);
  if (o.hash) out.push(`HASH ${hash}`);
  if (o.save) { const n = writeSnap(o.save, w); out.push(`saved snapshot ${o.save} (${(n / 1e6).toFixed(1)} MB json, tick ${w.tick})`); }
  const nCh = { PASS: by.PASS.length, WARN: by.WARN.length, FAIL: by.FAIL.length };
  const summary = { seed: w.seed, secs, tps: Math.round(total / secs), pop: m.pop, e0: lf0(m), fert: m.fertility, gini: m.gini, emp: m.employment, mood: m.mood, crimes: m.crimePer1000, hash, nCh, bad: [...by.FAIL, ...by.WARN].map((c) => c.status + ' ' + c.name), setup: (performance.now() - t00) / 1000 - secs };
  return { lines: out, summary };
}
const lf0 = (m) => (m.life ? m.life.e0 : null);

function runSeedsParallel(o) {
  const seeds = o.seeds, results = new Array(seeds.length);
  let next = 0, active = 0, done = 0;
  const maxPar = Math.max(1, Math.min(seeds.length, os.cpus().length));
  return new Promise((resolve, reject) => {
    const launch = () => {
      while (active < maxPar && next < seeds.length) {
        const i = next++; active++;
        const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { ...o, seed: seeds[i], seeds: null, quiet: true, sections: ['none'] } });
        wk.on('message', (r) => { results[i] = r; });
        wk.on('error', reject);
        wk.on('exit', () => { active--; done++; if (done === seeds.length) resolve(results); else launch(); });
      }
    };
    launch();
  });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 9).join('\n')); return; }
  if (o.pack === 'larkfield') { const { runLarkfieldReport } = await import('./report-larkfield.js'); console.log((await runLarkfieldReport(o)).join('\n')); return; } // Larkfield pack report (population/routine checks), see tools/report-larkfield.js
  if (!o.seeds) { console.log(runOne(o).lines.join('\n')); return; }
  const t0 = performance.now();
  const res = await runSeedsParallel(o);
  const out = [`SEEDS ${o.seeds.join(',')} x ${o.years} years, ${res.length} workers, wall ${((performance.now() - t0) / 1000).toFixed(1)}s`];
  out.push('seed   secs  ticks/s   pop    e0  fert  gini   emp  mood crime/k  P/W/F   hash');
  for (const { summary: s } of res) out.push(`${String(s.seed).padStart(4)} ${f(s.secs, 1).padStart(6)} ${String(s.tps).padStart(8)} ${String(s.pop).padStart(5)} ${f(s.e0).padStart(5)} ${f(s.fert, 2).padStart(5)} ${f(s.gini, 2).padStart(5)} ${pc(s.emp).padStart(5)} ${f(s.mood, 2).padStart(5)} ${f(s.crimes, 1).padStart(6)}  ${s.nCh.PASS}/${s.nCh.WARN}/${s.nCh.FAIL}  ${s.hash}`);
  const cnt = new Map();
  for (const { summary: s } of res) for (const b of s.bad) cnt.set(b, (cnt.get(b) || 0) + 1);
  out.push(`combined: ${cnt.size ? [...cnt].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n}/${res.length})`).join('; ') : 'all checks pass on every seed'}`);
  console.log(out.join('\n'));
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else parentPort.postMessage(runOne(workerData));
