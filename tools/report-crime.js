// Crime + civic report section (W2-C):  node tools/report.js --seed 1 --years N   (hooked from report-larkfield.js)  or  node tools/report-crime.js [seed] [years]
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { TYPES } from '../sim/systems/crime/data.js';
import { CAL_GROUPS, CAL_TOTAL, TYPE_IDS } from '../sim/systems/crime/data.js';

const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n));
const BANDS = ['<16', '16-24', '25-34', '35-49', '50-64', '65+'];
const bandOf = (a) => (a < 16 ? '<16' : a < 25 ? '16-24' : a < 35 ? '25-34' : a < 50 ? '35-49' : a < 65 ? '50-64' : '65+');
export function runCrime({ seed = 1, years = 3 } = {}) {
  const out = [], yrs = Math.max(3, years), w = createLarkfieldWorld(seed); const t0 = performance.now();
  w.run(Math.round(yrs * 365.25 * 144)); const pop = w.living().length, per = (n) => (n || 0) / yrs / pop * 1000, s = w.sys.crime.query.stats(), cv = w.sys.civic.query, cs = cv.stats();
  const ad = (b) => w.living().filter((p) => (b === 'all' ? true : bandOf(w.ageOf(p)) === b)), ppl = [...w.people.values()];
  out.push(`CRIME ${yrs}y pop ${pop}. ONE METRIC: recorded offences per 1000 residents per year with a resident as victim (on the map + on a night out in the city). TARGET = ONS P3 urban-force rate x1.35 inner-city factor; total target ${f(CAL_TOTAL)}/1000 is TUNED (PARAMS.OUT/NTE), per-type/age mix emergent. Fraud/ASB are not police-recorded.`);
  out.push('  type            experienced recorded target(group) | positive-outcome% charged%');
  let totRec = 0, totExp = 0;
  for (const t of Object.keys(TYPES)) { const e = s.exp[t] || 0, r = s.rec[t] || 0; totRec += r; totExp += e; const dn = s.det[t] || 0; out.push(`  ${t.padEnd(15)} ${f(per(e)).padStart(8)} ${f(per(r)).padStart(8)}   | ${r ? f(100 * dn / r, 0).padStart(6) + '%' + f(100 * (s.ch[t] || 0) / r, 0).padStart(7) + '%' : '     -'}`); }
  out.push(`  TOTAL recorded ${f(per(totRec))}/1000 vs target ${f(CAL_TOTAL)} (${f(100 * (per(totRec) / CAL_TOTAL - 1), 0)}%)   experienced incl. fraud/ASB ${f(per(totExp))}   of experienced, in the city centre on a night out: ${JSON.stringify(s.city || {})}   homicides ${s.hom}`);
  out.push('  pooled recorded vs target:  ' + Object.entries(CAL_GROUPS).map(([k, g]) => `${k} ${f(per(g.types.reduce((a, t) => a + (s.rec[t] || 0), 0)))}/${f(g.per1000)}`).join('  '));
  // victimisation by age and sex, per 1000 person-years (violence = assault); HELD-OUT: CSEW 16-24 men highest, then women 16-24
  const pyr = {}; for (const p of ppl) { if (!p.alive) continue; const k = bandOf(w.ageOf(p)) + p.sex; pyr[k] = (pyr[k] || 0) + 1; }
  const rate = (type, k) => ((s.vicT[type + '|' + k] || 0) / yrs / Math.max(1, pyr[k] || 1) * 1000);
  const mean = (type) => Object.keys(pyr).reduce((a, k) => a + (s.vicT[type + '|' + k] || 0), 0) / yrs / Math.max(1, Object.values(pyr).reduce((a, b) => a + b, 0)) * 1000;
  out.push(`  violence (assault) victimisations per 1000 person-years by age/sex (all-age mean ${f(mean('assault'), 0)}; relative = band / mean):`);
  out.push('   ' + BANDS.map((b) => `${b} M ${f(rate('assault', b + 'M'), 0)} (${f(rate('assault', b + 'M') / Math.max(1e-9, mean('assault')), 1)}x) F ${f(rate('assault', b + 'F'), 0)}`).join(' | '));
  const vict = ppl.filter((p) => p.ext.cr && p.ext.cr.vn > 0), rep = vict.filter((p) => p.ext.cr.vn >= 2);
  out.push(`  victims ${vict.length} (${f(100 * vict.length / pop, 0)}% of residents over ${yrs}y); repeat victims (2+) ${f(100 * rep.length / Math.max(1, vict.length), 0)}% of victims hold ${f(100 * rep.reduce((a, p) => a + p.ext.cr.vn, 0) / Math.max(1, vict.reduce((a, p) => a + p.ext.cr.vn, 0)), 0)}% of incidents`);
  const offs = w.sys.crime.query.offenders(); out.push(`  active offenders (rate>0.02/yr) ${offs.length}; offences by age/sex band (local, recorded): ` + BANDS.map((b) => `${b} M${s.offBand[b + 'M'] || 0}/F${s.offBand[b + 'F'] || 0}`).join(' '));
  const VB = TYPE_IDS.filter((t) => !TYPES[t].policeInitiated && !TYPES[t].noRecord), PI = TYPE_IDS.filter((t) => TYPES[t].policeInitiated), sm = (ts, o) => ts.reduce((a, t) => a + (o[t] || 0), 0);
  out.push(`  OUTCOMES per recorded offence (Home Office YE Mar 2024: victim-based 5.5% charged + 2.2% out-of-court = 7.7%; police-initiated (drugs, public order) 11% + 10% = 21%; held-out): victim-based positive ${f(100 * sm(VB, s.det) / Math.max(1, sm(VB, s.rec)))}% (charged ${f(100 * sm(VB, s.ch) / Math.max(1, sm(VB, s.rec)))}%)  police-initiated positive ${f(100 * sm(PI, s.det) / Math.max(1, sm(PI, s.rec)))}%  victim withdrew ${s.det.withdrawn || 0}  sentences ${JSON.stringify(s.sent)}  watches ${s.watch}`);
  const pdays = s.prisonDays || 0; out.push(`  PRISON: ${pdays} days served in ${yrs}y = ${f(pdays / 365.25 / yrs / pop * 1e5, 0)} per 100k residents (held-out: E&W ~139 per 100k, Oct 2025; inner-city higher); in custody now ${ppl.filter((p) => p.ext.cr && p.ext.cr.cust > w.tick).length}`);
  const sx = ppl.filter((p) => p.ext.cr && p.ext.cr.vt.sexual), sxF = sx.filter((p) => p.sex === 'F').length, adultN = ad('all').filter((p) => w.ageOf(p) >= 16).length;
  out.push(`  SEXUAL (aggregate only): experienced ${f((s.exp.sexual || 0) / yrs / Math.max(1, adultN) * 1000)} per 1000 adults/yr (CSEW ~19; women 30, men 7), ${f(100 * sxF / Math.max(1, sx.length), 0)}% of victims women, told police ${f(100 * (s.rep.sexual || 0) / Math.max(1, s.exp.sexual || 1), 0)}% (CSEW ~17%), recorded ${f(per(s.rec.sexual))}/1000 residents (target ${f(CAL_GROUPS.sexual.per1000)}); never in feeds`);
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
