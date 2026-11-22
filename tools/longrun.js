// Long-run drift check (run with `node --expose-gc` to also see live heap after a full GC; raw heapUsed includes uncollected garbage).  node tools/longrun.js [--seed 1] [--years 50] [--step 10] [--save dir] [--json]
// One row per `step` years (a decade table). Window quantities (TFR, churn, violence, loneliness) are measured over the preceding `step` years, sampled monthly.
//   pop, age shares (0-14 / 15-29 / 30-44 / 45-64 / 65+), period TFR, households, dwellings (units), overcrowded households %, churn (from outside / local movers / leavers, % of residents per year),
//   unemployment, 16-24 loneliness % (monthly mean of the 'often/always lonely' flag), assault victimisations per 1000 person-years by age band and sex, prison (per 100k), speed.
import { createLarkfieldWorld } from '../sim/larkfield.js';
import fs from 'node:fs';
const a = process.argv.slice(2), arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const seed = +arg('--seed', 1), years = +arg('--years', 50), step = +arg('--step', 10), save = arg('--save', null), asJson = a.includes('--json');
const w = createLarkfieldWorld(seed); const TPY = w.calendar.ticksPerYear, MONTH = Math.round(TPY / 12);
let births = 0, deaths = 0, inP = 0, locP = 0, outP = 0;
w.on('life.birth', () => births++); w.on('life.death', () => deaths++);
w.on('housing.moved_in', (e) => { const n = (e.actors || []).length; if (e.payload && e.payload.from === 'local') locP += n; else inP += n; });
w.on('housing.moved_out', (e) => { if (e.payload && e.payload.to !== 'local') outP += (e.actors || []).length; });
const BANDS = ['16-24', '25-34', '35-49', '50-64', '65+'], bandOf = (x) => (x < 16 ? '<16' : x < 25 ? '16-24' : x < 35 ? '25-34' : x < 50 ? '35-49' : x < 65 ? '50-64' : '65+');
let win = null, prev = { wm: [0, 0, 0, 0, 0, 0], nb: [0, 0, 0, 0, 0, 0], vic: {}, off: {}, offAll: {}, prison: 0, recV: 0 };
const lastVt = new Map(), lastNA = new Map(); let yrV = {}, yrO = {}, mCount = 0;
const newWin = () => ({ vy: { py: 0, pers: 0, rep: 0, incAll: 0, incRep: 0, persAll: 0, persRep: 0 }, recV: 0, n: 0, popSum: 0, lonely: 0, lonelyN: 0, lone1624: 0, lone1624N: 0, py: {}, lonelyBand: {}, offPy: {}, offPers: {} });
function flushYear() { // calendar-year victimisation of 16+ (assault, any outcome): young-male prevalence and repeat share
  for (const o of Object.values(yrV)) { const v = win.vy; if (o.ym) { v.py++; if (o.n > 0) v.pers++; if (o.n > 1) v.rep++; } if (o.n > 0) { v.persAll++; v.incAll += o.n; if (o.n > 1) { v.persRep++; v.incRep += o.n; } } } yrV = {};
  for (const o of Object.values(yrO)) { win.offPy[o.b] = (win.offPy[o.b] || 0) + 1; if (o.n > 0) win.offPers[o.b] = (win.offPers[o.b] || 0) + 1; } yrO = {};
}
function sample() { // monthly
  const L = w.living(); win.n++; win.popSum += L.length;
  for (const p of L) { const x = w.ageOf(p); if (x < 16) continue; const v = (p.ext.cr && p.ext.cr.vt.assault) || 0, d = v - (lastVt.get(p.id) || 0); lastVt.set(p.id, v); const o = yrV[p.id] || (yrV[p.id] = { n: 0, ym: p.sex === 'M' && x < 25 }); o.n += d; }
  for (const p of L) { if (p.sex !== 'M') continue; const x = w.ageOf(p); if (x < 16) continue; const n = (p.ext.cr && p.ext.cr.nAll) || 0, d = n - (lastNA.get(p.id) || 0); lastNA.set(p.id, n); const o = yrO[p.id] || (yrO[p.id] = { n: 0, b: bandOf(x) }); o.n += d; }
  if (++mCount % 12 === 0) flushYear();
  for (const p of L) { const x = w.ageOf(p), b = bandOf(x), k = b + p.sex; win.py[k] = (win.py[k] || 0) + 1 / 12; if (x >= 16 && p.ext.hl) { if (x < 25) { win.lone1624N++; win.lone1624 += p.ext.hl.lonely ? 1 : 0; } win.lonely += p.ext.hl.lonely ? 1 : 0; win.lonelyN++; } }
}
function tfrWindow() {
  const life = w.lf.life || {}, wm = life.wm || [0, 0, 0, 0, 0, 0], nb = [0, 0, 0, 0, 0, 0];
  for (const b of (life.rec && life.rec.births) || []) { const x = b[1]; nb[x < 20 ? 0 : x < 25 ? 1 : x < 30 ? 2 : x < 35 ? 3 : x < 40 ? 4 : 5]++; }
  let t = 0; for (let i = 0; i < 6; i++) { const dw = wm[i] - prev.wm[i], dn = nb[i] - prev.nb[i]; if (dw > 0) t += (dn / (dw / 12)) * 5; } prev.wm = wm.slice(); prev.nb = nb; return t;
}
const rows = [];
function row(y, secs, ticks) {
  const L = w.living(), ages = L.map((p) => w.ageOf(p)), pct = (f) => +(ages.filter(f).length / L.length * 100).toFixed(1);
  const lab = w.sys.labour.query.unemployment(), hs = w.sys.housing.query.stats(), cs = w.sys.crime.query.stats(), yrs = Math.max(1e-9, win ? win.n / 12 : 1), pop = win && win.n ? win.popSum / win.n : L.length;
  const r = { y, pop: L.length, u15: pct((x) => x < 15), a15_29: pct((x) => x >= 15 && x < 30), a30_44: pct((x) => x >= 30 && x < 45), a45_64: pct((x) => x >= 45 && x < 65), p65: pct((x) => x >= 65), tfr: y ? +tfrWindow().toFixed(2) : null, births, deaths, hh: hs.households, units: hs.units, built: hs.built, vac: +(hs.vacancyRate * 100).toFixed(1), crowded: +(hs.overcrowdedRate * 100).toFixed(1),
    churnIn: y ? +(inP / yrs / pop * 100).toFixed(1) : null, churnLocal: y ? +(locP / yrs / pop * 100).toFixed(1) : null, churnOut: y ? +(outP / yrs / pop * 100).toFixed(1) : null,
    unemp: typeof lab === 'object' ? +(lab.rate ?? lab.unemployment ?? NaN).toFixed?.(3) : lab, lone1624: win && win.lone1624N ? +(win.lone1624 / win.lone1624N * 100).toFixed(1) : null, loneAll: win && win.lonelyN ? +(win.lonely / win.lonelyN * 100).toFixed(1) : null, viol: {}, offM: {}, prisonPer100k: null,
    tps: Math.round(ticks / secs), mem: Math.round(process.memoryUsage().heapUsed / 1e6), memGC: typeof global.gc === 'function' ? (global.gc(), global.gc(), Math.round(process.memoryUsage().heapUsed / 1e6)) : null };
  if (win && y) {
    for (const b of BANDS) { const vic = (cs.vicT['assault|' + b + 'M'] || 0) - (prev.vic[b + 'M'] || 0), vicF = (cs.vicT['assault|' + b + 'F'] || 0) - (prev.vic[b + 'F'] || 0); r.viol[b] = [+(vic / Math.max(1e-9, win.py[b + 'M'] || 0) * 1000).toFixed(0), +(vicF / Math.max(1e-9, win.py[b + 'F'] || 0) * 1000).toFixed(0)]; r.offM[b] = [(cs.offBand[b + 'M'] || 0) - (prev.off[b + 'M'] || 0), (cs.offBand[b + 'F'] || 0) - (prev.off[b + 'F'] || 0)]; }
    r.offRate = {}; r.offPrev = {}; for (const b of BANDS) { const k = b + 'M', n = (cs.offAll[k] || 0) - (prev.offAll[k] || 0); r.offRate[b] = +(n / Math.max(1e-9, win.py[k] || 0) * 1000).toFixed(0); r.offPrev[b] = win.offPy[b] ? +((win.offPers[b] || 0) / win.offPy[b] * 100).toFixed(1) : null; prev.offAll[k] = cs.offAll[k] || 0; }
    for (const b of BANDS) for (const s of ['M', 'F']) { prev.vic[b + s] = cs.vicT['assault|' + b + s] || 0; prev.off[b + s] = cs.offBand[b + s] || 0; }
    r.prisonPer100k = +(((cs.prisonDays || 0) - prev.prison) / 365.25 / yrs / pop * 1e5).toFixed(0); prev.prison = cs.prisonDays || 0;
  }
  if (win && y) { const v = win.vy; r.youngMalePrev = v.py ? +(v.pers / v.py * 100).toFixed(1) : null; r.repeatVictimShare = v.persAll ? +(v.persRep / v.persAll * 100).toFixed(0) : null; r.repeatIncShare = v.incAll ? +(v.incRep / v.incAll * 100).toFixed(0) : null;
    const rc = cs.rec || {}, rv = (rc.assault || 0) + (rc.harass || 0); r.recViol = +((rv - prev.recV) / yrs / pop * 1000).toFixed(1); prev.recV = rv; } else if (y === 0) { const rc = w.sys.crime.query.stats().rec || {}; prev.recV = (rc.assault || 0) + (rc.harass || 0); }
  rows.push(r); console.log(asJson ? JSON.stringify(r) : `y${String(y).padStart(2)} pop ${r.pop} age% ${r.u15}/${r.a15_29}/${r.a30_44}/${r.a45_64}/${r.p65} TFR ${r.tfr} hh ${r.hh} dwell ${r.units} (built ${r.built}) vac ${r.vac}% crowded ${r.crowded}% churn in/local/out ${r.churnIn}/${r.churnLocal}/${r.churnOut}% unemp ${r.unemp} lonely16-24 ${r.lone1624}% all ${r.loneAll}% births ${births} deaths ${deaths} prison/100k ${r.prisonPer100k} | assault vic M/F per1000: ${BANDS.map((b) => b + ' ' + (r.viol[b] || []).join('/')).join(' ')} | offences M: ${BANDS.map((b) => b + ' ' + (r.offM[b] || [])[0]).join(' ')} | male offences /1000py (offenders %/yr) 16-24 ${(r.offRate||{})['16-24']} (${(r.offPrev||{})['16-24']}) 25-34 ${(r.offRate||{})['25-34']} (${(r.offPrev||{})['25-34']}) 35-49 ${(r.offRate||{})['35-49']} (${(r.offPrev||{})['35-49']}) | recorded violence+harass /1000/yr ${r.recViol} | 16-24M victim prevalence ${r.youngMalePrev}% repeat victims ${r.repeatVictimShare}% (incidents ${r.repeatIncShare}%) | ${r.tps} t/s ${r.mem}MB${r.memGC != null ? ' (' + r.memGC + 'MB after GC)' : ''}`);
  births = 0; deaths = 0; inP = 0; locP = 0; outP = 0; win = newWin();
}
win = newWin(); row(0, 1, 1);
for (let y = step; y <= years; y += step) {
  const t0 = performance.now(); for (let m = 0; m < step * 12; m++) { w.run(MONTH); sample(); }
  row(y, (performance.now() - t0) / 1000, step * TPY);
  if (save) fs.writeFileSync(`${save}/s${seed}-y${y}.json`, JSON.stringify(w.snapshot()));
}
