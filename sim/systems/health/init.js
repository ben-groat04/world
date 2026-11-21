// Founding health state per resident (p.ext.hl) derived from the population generator's condition lists, general-health score, disability flags and age/sex/segment.
// hl = { c:{cond:{t0,sev,dx,tx}}, mh:{st,t0,n,sev,tx,trig,last}, stress, lone, smoke, alc, drug, acute, imm, dying, grief:[], gp:{n12,last}, adh, base, burden0, injury }
import { clamp, clamp01, wpick, ageOf, years, months } from '../life/util.js';
import { BURDEN } from './tables.js';

const MAP = { 'dementia (early)': 'dementia' };
export function burdenOf(hl) { let b = 0; for (const k in hl.c) b += (BURDEN[k] ?? 0.05) * (hl.c[k].rem ? 0.3 : 0.5 + hl.c[k].sev); return b + (hl.mh.st ? 0.07 + 0.08 * hl.mh.sev : 0); }
const SMOKE_BY_SEG = { benefit_dependent: 1.6, lone_parents: 1.4, shift_workers: 1.3, older_longterm: 1.0, students: 0.7, settled_professionals: 0.5, early_career: 0.75, young_sharers: 0.95, family_couples: 0.8, recent_arrivals: 0.9, local_business_families: 0.7 };

export function hlFor(w, p, rng, newborn) {
  const q = p.ext.pop, age = ageOf(w, p), T = w.tick;
  const hl = { c: {}, mh: { st: 0, t0: 0, n: 0, sev: 0, tx: 0, trig: '', last: 0 }, stress: 0.1, lone: 0.1, smoke: 0, alc: 0, drug: 0, acute: null, imm: 0, dying: null, grief: [], gp: { n12: 0, last: 0 }, adh: clamp01(0.45 + 0.5 * p.personality.conscientiousness + rng.gauss(0, 0.12)), base: p.health, burden0: 0, injury: null, frail: 1 };
  for (const name of q.health.conds || []) {
    const k = MAP[name] || name;
    if (k === 'depression/anxiety') { hl.mh = { st: rng.chance(0.55) ? 2 : 1, t0: T - months(rng.float(1, 18)), n: 1 + (rng.chance(0.5) ? 1 : 0), sev: rng.float(0.2, 0.7), tx: rng.chance(0.5) ? 1 : 0, trig: 'long-standing', last: T }; continue; }
    hl.c[k] = { t0: T - years(w, rng.float(0.3, Math.min(15, Math.max(0.5, age / 3)))), sev: k === 'dementia' ? rng.float(0.15, 0.6) : rng.float(0.1, 0.6), dx: T - months(rng.float(0, 60)), tx: rng.chance(0.7 * hl.adh + 0.3) ? 1 : 0 };
  }
  if (newborn) { /* congenital */ if (rng.chance(0.008)) hl.c.epilepsy = { t0: T, sev: 0.3, dx: T + months(rng.float(2, 30)), tx: 1 }; if (rng.chance(0.012)) { q.health.disabled = true; q.health.limiting = Math.max(q.health.limiting, 1); } }
  hl.burden0 = burdenOf(hl); hl.disBase = !!q.health.disabled; hl.lim2 = q.health.limiting === 2;
  // substances
  if (age >= 14) {
    const seg = SMOKE_BY_SEG[q.seg] ?? 1, ageF = age < 18 ? 0.25 : age < 25 ? 0.9 : age < 60 ? 1.1 : age < 75 ? 0.7 : 0.35;
    if (rng.chance(clamp(0.13 * seg * ageF * (p.sex === 'M' ? 1.15 : 0.88) * (q.religion === 'Muslim' && q.religiosity > 0.5 ? 0.6 : 1), 0, 0.5))) hl.smoke = 1;
    const dry = q.religion === 'Muslim' || q.religion === 'Sikh' && q.religiosity > 0.6 ? 0.08 : q.religion === 'Hindu' ? 0.4 : 1;
    if (age >= 18) { const pa = 0.2 * dry * (p.sex === 'M' ? 1.3 : 0.8) * (age > 70 ? 0.5 : 1) * (1.2 - p.personality.conscientiousness); if (rng.chance(pa)) hl.alc = rng.chance(0.075 + (q.seg === 'benefit_dependent' ? 0.05 : 0)) ? 2 : 1; if (rng.chance(0.014 * (age < 45 ? 1.6 : 0.5) * dry * (q.seg === 'benefit_dependent' ? 2.5 : 1))) hl.drug = rng.chance(0.15) ? 2 : 1; }
  }
  if (hl.smoke && !hl.c.COPD && age > 45 && rng.chance(0.03)) hl.c.COPD = { t0: T - months(12), sev: 0.2, dx: T - months(4), tx: 1 };
  return hl;
}
export { MAP };
