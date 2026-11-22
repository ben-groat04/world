// Round-10 evaluation: node tools/eval10.js [--seed 1] [--years 20] [--json]
// One line of measured quantities for the FEEL-REVIEW-3 sim-number fixes (see docs/CALIBRATION-METHOD.md Round 10):
//   ILO unemployment (16-64) | age-standardised mortality ratio vs the calibration life table (ONS) | marriages per 1000 unmarried adults, divorces per 1000 married,
//   cohabitation/dating dissolutions | hourly and annual pay by occupation | social lets by household type | posts per day | credentials gate checks.
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { qxAnnual } from '../sim/systems/health/tables.js';
const a = process.argv.slice(2), arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const seed = +arg('--seed', 1), years = +arg('--years', 20), asJson = a.includes('--json');
const w = createLarkfieldWorld(seed), TPY = w.calendar.ticksPerYear, MONTH = Math.round(TPY / 12), cal = w.pack.calibration;
const obs = { d: 0, ecount: 0 }, ageBandObs = {}, ageBandExp = {};
const band = (x) => (x < 1 ? '0' : x < 15 ? '1-14' : x < 30 ? '15-29' : x < 45 ? '30-44' : x < 65 ? '45-64' : x < 75 ? '65-74' : '75+');
let marr = 0, div = 0, brk = { dating: 0, cohab: 0, engaged: 0, other: 0 }, cohabForm = 0, hiredN = 0;
const moves = []; // job switches
w.on('life.death', (e) => { const p = w.people.get(e.actors[0]); const x = e.payload.age; obs.d++; const b = band(x); ageBandObs[b] = (ageBandObs[b] || 0) + 1; });
w.on('life.marriage', () => marr++); w.on('life.divorce', () => div++);
w.on('life.breakup', (e) => { const k = e.payload.kind; brk[k in brk ? k : 'other']++; });
w.on('life.cohabit', () => cohabForm++);
let unmPY = 0, marPY = 0, cohPY = 0, adPY = 0, uSum = 0, uN = 0, popSum = 0, n = 0, e16 = 0;
const unmByAge = {};
for (let m = 0; m < years * 12; m++) {
  w.run(MONTH);
  const L = w.living(); n++; popSum += L.length; const u = w.sys.labour.query.unemployment(); uSum += u.rate; uN++;
  for (const p of L) {
    const x = w.ageOf(p), sex = p.sex === 'F' ? 'female' : 'male', q = qxAnnual(cal, x, p.sex) / 12, b = band(x); ageBandExp[b] = (ageBandExp[b] || 0) + q; obs.ecount += q;
    if (x >= 16) { adPY += 1 / 12; const lf = p.ext.life; if (lf && lf.mar === 'married' && lf.part && lf.part.st === 'married') marPY += 1 / 12; else unmPY += 1 / 12; if (lf && lf.part && lf.part.st === 'cohab') cohPY += 0.5 / 12; }
  }
}
const stats = w.sys.comms.query.stats(), days = years * 365.25, hs = w.sys.housing.query.stats();
const pop = popSum / n, f = (x, d = 1) => +x.toFixed(d);
// pay by occupation
const byOcc = {}; for (const p of w.living()) { const q = p.ext.pop; if (q.activity !== 'employed' || !q.occ || !q.hours) continue; (byOcc[q.occ] = byOcc[q.occ] || []).push({ h: q.rate != null ? q.rate : q.pay / (q.hours * 52 / 1), pay: q.pay, hours: q.hours }); }
const med = (arr) => { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const pay = {}; for (const [o, arr] of Object.entries(byOcc)) pay[o] = { n: arr.length, hourly: f(med(arr.map((x) => x.h)), 2), annual: Math.round(med(arr.map((x) => x.pay))), hours: med(arr.map((x) => x.hours)) };
const out = { seed, years, pop: Math.round(pop), iloUnemp: f(uSum / uN * 100), deaths: obs.d, deathsPerYr: f(obs.d / years), expectedPerYr: f(obs.ecount / years), SMR: f(obs.d / obs.ecount, 2), crudeDeathRatePer1000: f(obs.d / years / pop * 1000),
  smrByBand: Object.fromEntries(Object.keys(ageBandExp).map((b) => [b, `${ageBandObs[b] || 0}/${f(ageBandExp[b], 1)}`])),
  marriagesPer1000Unmarried: f(marr / unmPY * 1000), divorcesPer1000Married: f(div / marPY * 1000), marriagesPerYr: f(marr / years), divorcesPerYr: f(div / years), breakupsPerYr: Object.fromEntries(Object.entries(brk).map(([k, v]) => [k, f(v / years)])),
  cohabDissolutionsPer100CoupleYears: f(brk.cohab / cohPY * 100), cohabFormPerYr: f(cohabForm / years), adults: f(adPY / years, 0),
  pay, socialLets: hs.socialLets || null, posts: { perDay: f(stats.posts.feed / days), daily: f(stats.posts.daily / days), event: f(stats.posts.event / days), forum: f((stats.posts.forum || 0) / days) } };
console.log(asJson ? JSON.stringify(out) : JSON.stringify(out, null, 1));
