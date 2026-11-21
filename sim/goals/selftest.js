// node sim/goals/selftest.js [--years 1] [--seed 1] [--pop 240] [--full]   compact W1-B report
import { makeFixture, makeLarkfield } from './fixture.js';
import { TICKS_PER_DAY, DAYS_PER_YEAR } from '../time.js';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const years = arg('years', 1), seed = arg('seed', 1), pop = arg('pop', 240);
const legacy = process.argv.includes('--legacy');
const w = legacy ? await makeFixture({ seed, population: pop }) : await makeLarkfield(seed);
const q = w.sys.goals.query, E = w.goals;
const snaps = []; const t0 = Date.now(); let goalMs = 0;
const days = Math.round(years * E.cfg.yearDays);
for (let d = 0; d < days; d++) { w.run(TICKS_PER_DAY); if (d % 14 === 13) snaps.push(q.activeKinds()); }
const secs = (Date.now() - t0) / 1000; const yd = E.cfg.yearDays;
const st = q.stats(), agg = {}; let tot = 0; for (const s of snaps.slice(Math.floor(snaps.length / 3))) for (const [k, v] of Object.entries(s)) { agg[k] = (agg[k] || 0) + v; tot += v; }
const top = Object.entries(agg).sort((a, b) => b[1] - a[1]);
console.log(`world seed ${seed} pop ${w.living().length} ${years}y ${secs.toFixed(1)}s | goals formed ${st.formed} done ${st.completed} failed ${st.failed} abandoned ${st.abandoned} active ${st.active} transformed ${st.transformed} invented ${st.invented} | templates ${st.templates} methodDefaults ${st.methodDefaults}`);
console.log(`kinds active (sampled): ${top.length}; top: ${top.slice(0, 8).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(1)}%`).join(', ')}; max share ${(100 * top[0][1] / tot).toFixed(1)}%`);
console.log(`steps ${st.steps} ok ${(100 * st.stepOk / Math.max(1, st.steps)).toFixed(0)}% fail ${(100 * st.stepFail / Math.max(1, st.steps)).toFixed(0)}% replans ${st.replans}`);
// outcome by kind
const rows = Object.entries(st.out).filter(([k]) => !(E.tpl.get(k).mundane || E.tpl.get(k).ordinary)).sort((a, b) => (b[1][0] + b[1][1] + b[1][2]) - (a[1][0] + a[1][1] + a[1][2])).slice(0, 14);
console.log('salient outcomes done/fail/aband: ' + rows.map(([k, v]) => `${k} ${v[0]}/${v[1]}/${v[2]}`).join('; '));
let D = 0, F2 = 0, A2 = 0, mD = 0, mT = 0; for (const [k, v] of Object.entries(st.out)) { if (E.tpl.get(k).mundane || E.tpl.get(k).ordinary) { mD += v[0]; mT += v[0] + v[1] + v[2]; } else { D += v[0]; F2 += v[1]; A2 += v[2]; } }
console.log(`success rate: salient ${(100 * D / Math.max(1, D + F2 + A2)).toFixed(0)}% (${D + F2 + A2} ended), mundane ${(100 * mD / Math.max(1, mT)).toFixed(0)}% (${mT}); mundane share of formed ${(100 * Object.entries(st.byTpl).filter(([k]) => E.tpl.get(k).mundane || E.tpl.get(k).ordinary).reduce((a, [, v]) => a + v, 0) / st.formed).toFixed(0)}%`);
console.log(`groups: ${JSON.stringify(st.groups)} kinds: ${JSON.stringify(Object.entries(q.groups({ all: true })).reduce((m, [, g]) => ((m[g.kind] = (m[g.kind] || 0) + 1), m), {}))}`);
const ev = w.events.stats; console.log(`events ${ev.emitted} cause-coverage ${(100 * w.events.causeCoverage()).toFixed(0)}% goals-types ${Object.keys(ev.byType).filter((t) => /^(goal|group|project|self)\./.test(t)).length}`);
// life stories
const stories = []; const seen = new Set();
for (const g of E.S.goals.values()) { if (g.status === 'active' || g.log.length < 3) continue; const t = E.tpl.get(g.tpl); if (t.mundane || seen.has(g.tpl)) continue; seen.add(g.tpl); stories.push(g); }
stories.sort((a, b) => b.log.length - a.log.length);
for (const g of stories.slice(0, arg('stories', 3))) {
  const p = w.people.get(g.p); console.log(`\n${p.firstName} ${p.lastName} (${Math.round(w.ageOf(p))}): ${E.phrase(g.tpl)}${g.origin ? ` [pressure: ${g.origin}]` : ''}${g.parent ? ' [after a failed goal]' : ''} -> ${g.status}${g.endWhy ? ' (' + g.endWhy + ')' : ''}`);
  for (const [tick, mv, res, txt] of g.log) console.log(`  ${w.formatDate(tick)}: ${mv} ${res}: ${txt}`);
  const chain = w.events.chain(g.eid).length; console.log(`  causal chain depth of last event: ${chain}`);
}
if (process.argv.includes('--groups')) for (const g of q.groups({ all: true }).slice(0, 6)) console.log(JSON.stringify(q.group(g.id)).slice(0, 400));
