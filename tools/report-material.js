// Material-life section of the Larkfield report (W1-C: housing, labour, money). Imported by tools/report-larkfield.js; also runnable:
//   node tools/report-material.js --seed 1 --years 3
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { gini, median, mean } from '../sim/systems/money/util.js';

const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n));
const pc = (x, n = 0) => (x * 100).toFixed(n) + '%';
const BANDS = [['0-14', 0, 15], ['15-19', 15, 20], ['20-24', 20, 25], ['25-29', 25, 30], ['30-34', 30, 35], ['35-44', 35, 45], ['45-64', 45, 65], ['65+', 65, 120]];

export function materialSummary(w, years, w0) {
  const lf = w.lf, S = lf.housing, hhs = lf.households.filter((h) => !h.gone), people = w.living(), pack = w.pack, cal = pack.calibration;
  const out = {};
  const ten = {}; for (const h of hhs) ten[h.tenure] = (ten[h.tenure] || 0) + 1;
  const tt = {}; for (const [k, v] of Object.entries(cal.tenure.composite)) { const m = pack.meta.tenureFromCalibration[k]; if (m) tt[m] = (tt[m] || 0) + v; }
  out.tenure = Object.keys(tt).map((k) => `${k.replace('_', ' ')} ${pc((ten[k] || 0) / hhs.length)}/${pc(tt[k])}`).join('  ');
  const burden = {}; for (const h of hhs) if (h.rentPcm > 0 && h.fin && h.fin.income > 0) (burden[h.tenure] = burden[h.tenure] || []).push(h.rentPcm / h.fin.income);
  const nsh = hhs.filter((h) => h.tenure === 'private_rent' && h.arch !== 'sharers_students_multigen' && h.fin && h.fin.income > 0).map((h) => h.rentPcm / h.fin.income);
  out.burden = Object.entries(burden).map(([k, a]) => `${k} ${pc(median(a))} (n=${a.length})`).join('  ') + `  | private excl. house-shares ${pc(median(nsh))} (n=${nsh.length}) [target 30-45%]`;
  const ad = people.filter((p) => w.ageOf(p) >= 16), emp = ad.filter((p) => p.ext.pop.activity === 'employed').length, un = ad.filter((p) => p.ext.pop.activity === 'unemployed').length;
  const act = {}; for (const p of ad) act[p.ext.pop.activity] = (act[p.ext.pop.activity] || 0) + 1;
  out.labour = `unemployment rate ${pc(un / (emp + un), 1)} of active (${pc(un / ad.length, 1)} of 16+, calib ${pc(cal.economicActivity16plus.unemployed, 1)} of 16+)  employed ${pc(emp / ad.length)}/${pc(cal.economicActivity16plus.employed)} student ${pc((act.student || 0) / ad.length)} retired ${pc((act.retired || 0) / ad.length)} sick ${pc((act.sick_disabled || 0) / ad.length)} home/other ${pc(((act.home_family || 0) + (act.other_inactive || 0)) / ad.length)}`;
  const eq = hhs.map((h) => (h.fin ? h.fin.income : 0) / Math.sqrt(h.members.filter((id) => w.people.get(id).alive).length || 1));
  const nw = hhs.map((h) => w.sys.money.query.netWorth(h)), cash = hhs.map((h) => h.members.reduce((s, id) => s + Math.max(0, w.people.get(id).money), 0));
  out.gini = `income gini (equivalised hh net) ${f(gini(eq), 2)} [0.30-0.45]  wealth gini (cash+pension+equity-debt) ${f(gini(nw), 2)} [0.55-0.70]  median hh net income ${f(median(eq) * 12, 0)}/yr  median cash ${f(median(cash), 0)}  median net worth ${f(median(nw), 0)}`;
  const ft = ad.filter((p) => p.ext.pop.activity === 'employed' && p.ext.pop.hours >= 30).map((p) => p.ext.pop.pay);
  const bySoc = {}; for (const p of ad) if (p.ext.pop.activity === 'employed') (bySoc[p.ext.pop.soc] = bySoc[p.ext.pop.soc] || []).push(p.ext.pop.pay);
  out.pay = `FT median pay ${f(median(ft) / w.lf.money.macro.wage, 0)} in 2026 money (${f(median(ft), 0)} nominal; calib ~${cal.incomeAndRent.compositeResidentFullTimeMedianGrossAnnual_estimate})  by SOC: ` + Object.keys(bySoc).sort().map((k) => `${k}:${f(median(bySoc[k]) / 1000, 1)}k(n${bySoc[k].length})`).join(' ');
  const arr = hhs.filter((h) => h.fin && (h.fin.rentArrears + h.fin.billArrears) > 0).length, rentArr = hhs.filter((h) => h.fin && h.fin.rentArrears > 0).length, renters = hhs.filter((h) => h.rentPcm > 0).length;
  const stressed = hhs.filter((h) => h.fin && h.fin.stress >= 0.62).length, spiral = hhs.filter((h) => h.fin && h.fin.spiralEv).length, claim = hhs.filter((h) => h.fin && h.fin.claim).length;
  out.arrears = `arrears ${pc(arr / hhs.length, 1)} of hh (rent arrears ${pc(rentArr / Math.max(1, renters), 1)} of renters)  high cost-of-living stress ${pc(stressed / hhs.length)}  debt-spiral ${spiral}  claiming benefits ${pc(claim / hhs.length)}  median stress ${f(median(hhs.map((h) => h.fin ? h.fin.stress : 0)), 2)}`;
  const log = S.moveLog.filter((m) => m[0] >= w0), yrs = Math.max(0.25, (w.tick - w0) / 52560), npop = people.length;
  const row = BANDS.map(([n, lo, hi]) => { const pop = people.filter((p) => { const a = w.ageOf(p); return a >= lo && a < hi; }).length || 1, mv = log.filter((m) => m[2] !== 'out' && m[1] >= lo && m[1] < hi).length; return `${n} ${f(100 * mv / yrs / pop, 0)}`; });
  const inl = log.filter((m) => m[2] !== 'out').length, outl = log.filter((m) => m[2] === 'out').length, loc = log.filter((m) => m[2] === 'local').length;
  out.moves = `moves/yr per 100 residents by age: ${row.join(' | ')}  [calib 20-24 34, 25-29 34, 30-34 27, 35-44 13, 45-54 7, 65-74 4]  total ${f(100 * inl / yrs / npop, 1)}%/yr (calib ~16%)  in ${f(inl / yrs, 0)} out ${f(outl / yrs, 0)} local ${f(loc / yrs, 0)} persons/yr`;
  const privHH = hhs.filter((h) => h.tenure === 'private_rent').length, ev = S.stats.evictions;
  out.housing = `evictions ${ev} total (${pc(ev / yrs / Math.max(1, privHH), 1)} of private renters/yr [0-3%])  notices ${S.stats.notices}  overcrowded ${pc(S.list.length ? hhs.filter((h) => h.crowded).length / hhs.length : 0)} of hh  vacancy ${pc(w.sys.housing.query.stats().vacancyRate, 1)}  waitlist ${S.wait.length}  bought ${S.stats.bought}  homeless ${S.stats.homeless}  rent idx ${f(w.lf.money.macro.rent, 3)}  hpi ${f(w.lf.money.macro.hpi, 3)}  gentrification ${f(w.sys.housing.query.gentrification(), 3)}`;
  const L = lf.labour, dur = [...L.durations].sort((a, b) => a - b);
  out.flows = `jobs: hired ${L.stats.hired} lost ${L.stats.lost} (${f(L.stats.lost / yrs / Math.max(1, emp), 3)}/emp-yr) promoted ${L.stats.promoted} retired ${L.stats.retired} firm closures ${L.stats.closures} referral share ${pc(L.stats.referral / Math.max(1, L.stats.hired))}  median job-search spell ${f(dur[dur.length >> 1] || 0, 1)} mo (n=${dur.length})`;
  const inv = w.ledger.invariant(), fl = w.ledger.flows, M = lf.money.stats;
  out.money = `ledger invariant ${inv.ok ? 'OK' : 'FAIL'} (total ${inv.total}, drift ${inv.drift}, ${w.ledger.n} transfers)  fiscal: tax in ${f((fl.tax || 0) / yrs / 1000, 0)}k/yr, benefits out ${f((fl.benefit || 0) / yrs / 1000, 0)}k/yr  macro: cpi ${f(w.lf.money.macro.cpi, 1)} rate ${f(w.lf.money.macro.rate, 1)} recession ${f(w.lf.money.macro.recession, 2)}`;
  void M; void mean;
  return out;
}
export function runMaterial(o = {}) {
  const seed = o.seed || 1, years = o.years || 3, w = createLarkfieldWorld(seed, { goals: o.goals !== false });
  const t0 = performance.now(), ticks = Math.round(years * 365 * 144); const w0 = w.tick; w.run(ticks); const secs = (performance.now() - t0) / 1000;
  const m = materialSummary(w, years, w0), ev = w.events.stats.byType, cnt = Object.entries(ev).filter(([k]) => /^(housing|labour|money)\./.test(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.split('.')[1]} ${v}`).join(', ');
  return [`MATERIAL seed ${seed} ${years}y: ${Math.round(ticks / secs)} ticks/s, pop ${w.living().length}`, ' TENURE   ' + m.tenure, ' RENT BURDEN (median rent/net income) ' + m.burden, ' LABOUR   ' + m.labour, ' JOBS     ' + m.flows, ' PAY      ' + m.pay, ' INEQUALITY ' + m.gini, ' ARREARS  ' + m.arrears, ' MOVES    ' + m.moves, ' HOUSING  ' + m.housing, ' MONEY    ' + m.money, ' EVENTS   ' + cnt];
}
if (process.argv[1] && process.argv[1].endsWith('report-material.js')) {
  const a = process.argv.slice(2), g = (k, d) => { const i = a.indexOf(k); return i >= 0 ? +a[i + 1] : d; };
  console.log(runMaterial({ seed: g('--seed', 1), years: g('--years', 3), goals: !a.includes('--nogoals') }).join('\n'));
}
