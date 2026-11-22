// Crime + civic report section (W2-C):  node tools/report.js --seed 1 --years N   (hooked from report-larkfield.js)  or  node tools/report-crime.js [seed] [years]
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { TYPES } from '../sim/systems/crime/data.js';
import { CAL_GROUPS } from '../sim/systems/crime/data.js';

const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n));
const BANDS = ['<16', '16-24', '25-34', '35-49', '50-64', '65+'];
export function runCrime({ seed = 1, years = 3 } = {}) {
  const out = [], yrs = Math.max(3, years), w = createLarkfieldWorld(seed); const t0 = performance.now();
  w.run(Math.round(yrs * 365.25 * 144)); const pop = w.living().length, per = (n) => (n || 0) / yrs / pop * 1000, s = w.sys.crime.query.stats(), cv = w.sys.civic.query, cs = cv.stats();
  out.push(`CRIME ${yrs}y pop ${pop} (rates per 1000 residents per year; recorded targets = urban-force P3 rates x1.35 inner-city factor; sexual offences (~5/1000) and homicide not modelled as events)`);
  out.push('  type            experienced recorded  | detected% charged conv');
  let totRec = 0, totExp = 0;
  for (const t of Object.keys(TYPES)) { const e = s.exp[t] || 0, r = s.rec[t] || 0; totRec += r; if (!TYPES[t].noRecord || true) totExp += e; out.push(`  ${t.padEnd(15)} ${f(per(e)).padStart(8)} ${f(per(r)).padStart(8)}   | ${f(r ? 100 * (s.det[t] || 0) / r : 0, 0).padStart(6)}% ${String(s.ch[t] || 0).padStart(6)} ${String(s.conv[t] || 0).padStart(4)}`); }
  out.push(`  TOTAL recorded ${f(per(totRec))}/1000 (= ${f(per(totRec) / 2, 0)} per 500; calibration ~128/1000 = 64 per 500)  experienced incl. fraud/ASB ${f(per(totExp))}  homicides ${s.hom}  moved-after-burglary ${s.moved}`);
  out.push('  pooled recorded vs calibration:  ' + Object.entries(CAL_GROUPS).map(([k, g]) => `${k} ${f(per(g.types.reduce((a, t) => a + (s.rec[t] || 0), 0)))}/${f(g.per1000)}`).join('  '));
  const ppl = [...w.people.values()], vict = ppl.filter((p) => p.ext.cr && p.ext.cr.vn > 0), rep = vict.filter((p) => p.ext.cr.vn >= 2);
  const burg = ppl.filter((p) => p.ext.cr && p.ext.cr.vt.burglary), burg2 = burg.filter((p) => p.ext.cr.vt.burglary >= 2);
  out.push(`  victims ${vict.length} (${f(100 * vict.length / pop, 0)}% of residents over ${yrs}y); repeat victims (2+) ${f(100 * rep.length / Math.max(1, vict.length), 0)}% of victims who hold ${f(100 * rep.reduce((a, p) => a + p.ext.cr.vn, 0) / Math.max(1, vict.reduce((a, p) => a + p.ext.cr.vn, 0)), 0)}% of incidents; burglary repeat ${burg2.length}/${burg.length}`);
  out.push('  ' + 'age/sex   offenders(local+recorded) victims  (counts)'); const row = (b) => `  ${b.padEnd(8)} M ${String(s.offBand[b + 'M'] || 0).padStart(4)} F ${String(s.offBand[b + 'F'] || 0).padStart(4)}  | victims M ${String(s.vicBand[b + 'M'] || 0).padStart(4)} F ${String(s.vicBand[b + 'F'] || 0).padStart(4)}`;
  for (const b of BANDS) out.push(row(b));
  const offs = w.sys.crime.query.offenders(); const prior = offs.filter((o) => o.prior > 0).length; out.push(`  active offenders (rate>0.02/yr) ${offs.length}; with a prior ${prior}; top-10% of them account for ${f(100 * offs.sort((a, b) => b.lam - a.lam).slice(0, Math.ceil(offs.length / 10)).reduce((a, o) => a + o.lam, 0) / Math.max(1e-9, offs.reduce((a, o) => a + o.lam, 0)), 0)}% of offending rate`);
  const det = Object.values(s.det).reduce((a, b) => a + b, 0) - (s.det.withdrawn || 0), recT = Object.values(s.rec).reduce((a, b) => a + b, 0);
  out.push(`  detection: ${f(100 * det / Math.max(1, recT))}% of recorded offences reach charge/caution (Home Office ~12% of all, ~6% excl. police-initiated)  victim withdrew ${s.det.withdrawn || 0}  sentences ${JSON.stringify(s.sent)}  median police attendance ${s.attendMedian}min  neighbourhood watches ${s.watch}`);
  // fear vs risk by age-sex group
  const G = (p) => (w.ageOf(p) < 25 ? 'under25' : w.ageOf(p) < 65 ? '25-64' : '65+') + (p.sex === 'M' ? 'M' : 'F'), g = {}; for (const p of ppl) { if (w.ageOf(p) < 16 || !p.ext.cr) continue; const k = G(p), e = g[k] || (g[k] = { n: 0, v: 0, fear: 0 }); e.n++; e.v += p.ext.cr.vn; e.fear += p.ext.cr.fear; }
  out.push('  fear vs risk (mean fear 0-1 | victimisations per person-year): ' + Object.entries(g).sort().map(([k, e]) => `${k} ${f(e.fear / e.n, 2)}|${f(e.v / e.n / yrs, 2)}`).join('  '));
  out.push('--- CIVIC ---');
  const el = cs.elections; out.push(`  elections ${el.length}: turnout ${el.map((e) => f(100 * e.turnout, 0) + '% (registered ' + f(100 * e.registered, 0) + '%)').join(', ') || 'none yet'}; control ${cs.control}; councillors ${cs.cllrs.map((c) => c.party).join('/')}`);
  const op = Object.values(cs.opened).reduce((a, b) => a + b, 0), cl = Object.values(cs.closed).reduce((a, b) => a + b, 0);
  out.push(`  casework ${op} opened ${JSON.stringify(cs.opened)}, ${cl} closed, median ${cs.medianDays}d, ${f(100 * cs.inTarget / Math.max(1, cl), 0)}% within 1.5x target, chased by councillor ${cs.chased}; mean trust in council ${cs.trustMean}`);
  out.push(`  planning ${cs.apps} applications, decisions ${JSON.stringify(cs.decided)}; campaigns ${JSON.stringify(cs.camp)} ${JSON.stringify(cv.campaigns().map((c) => c.name + ' (' + c.signatures + ')'))}; services ${JSON.stringify(Object.fromEntries(Object.entries(cs.svc).map(([k, v]) => [k, +v.toFixed(2)])))}`);
  out.push('  sample lines (crime then civic):'); for (const l of w.sys.crime.query.recent(4)) out.push('   - ' + l.text); for (const l of cv.feed(4)) out.push('   - ' + l.text);
  out.push(`  crime+civic world ${f((performance.now() - t0) / 1000, 1)}s`);
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('report-crime.js')) console.log(runCrime({ seed: +process.argv[2] || 1, years: +process.argv[3] || 3 }).join('\n'));
