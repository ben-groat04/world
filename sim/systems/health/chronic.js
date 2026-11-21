// Chronic conditions: age-onset hazards with a social gradient (deprivation, smoking, ethnicity, sex, comorbidity), diagnosis lag set by GP / referral waiting times, progression,
// treatment adherence, occasional remission (cancer, asthma), and the resulting 0..1 health score, general-health band and disability flags that other packages read.
import { clamp, clamp01, ageOf, later, laterAt, months, days, years, bump } from '../life/util.js';
import { INC, bandIdx, BURDEN, DISABLING, DX_DELAY } from './tables.js';
import { burdenOf } from './init.js';
import { diagnose } from './mortality.js';

const SEGM = { benefit_dependent: 1.35, lone_parents: 1.18, older_longterm: 1.08, shift_workers: 1.1, family_couples: 0.97, settled_professionals: 0.82, early_career: 0.9, students: 0.9, young_sharers: 0.92, recent_arrivals: 0.9, local_business_families: 0.95 };
const SASIAN = new Set(['indian', 'pakistani', 'bangladeshi']), BLACK = new Set(['african', 'caribbean']);
const PROG = { dementia: 0.09, COPD: 0.04, 'heart disease': 0.03, diabetes: 0.02, arthritis: 0.035, hypertension: 0.005, 'mobility impairment': 0.03, 'hearing/sight loss': 0.04, 'back pain': 0.0, asthma: 0, cancer: 0.0 };

function mult(p, hl, cond, age) {
  const q = p.ext.pop, has = (k) => !!hl.c[k], M = p.sex === 'M', eth = q.eth; let m = SEGM[q.seg] ?? 1;
  switch (cond) {
    case 'hypertension': m *= (BLACK.has(eth) ? 1.4 : 1) * (hl.smoke ? 1.1 : 1) * (has('diabetes') ? 1.5 : 1) * (hl.alc ? 1.15 : 1) * (M ? 1.12 : 1); break;
    case 'diabetes': m *= (SASIAN.has(eth) ? 2.1 : BLACK.has(eth) ? 1.6 : eth === 'white_british' ? 0.85 : 1) * (has('hypertension') ? 1.4 : 1); break;
    case 'heart disease': m *= (hl.smoke ? 1.7 : 1) * (has('hypertension') ? 1.6 : 1) * (has('diabetes') ? 1.8 : 1) * (SASIAN.has(eth) ? 1.4 : 1) * (M ? 1.7 : 1); break;
    case 'stroke': m *= (has('hypertension') ? 2.0 : 1) * (hl.smoke ? 1.5 : 1) * (has('heart disease') ? 1.5 : 1) * (BLACK.has(eth) ? 1.3 : 1); break;
    case 'COPD': m *= hl.smoke ? 5.5 : 0.35; break;
    case 'cancer': m *= (hl.smoke ? 1.5 : 1) * (hl.alc ? 1.25 : 1) * (eth === 'white_british' ? 1.1 : 0.9); break;
    case 'dementia': m *= (has('stroke') ? 1.5 : 1) * (hl.alc === 2 ? 1.6 : 1) * (has('hypertension') ? 1.15 : 1) * (p.sex === 'F' ? 1.2 : 1); break;
    case 'arthritis': m *= p.sex === 'F' ? 1.4 : 0.8; break;
    case 'asthma': m *= age < 15 ? 3.2 : 1; break;
    case 'mobility impairment': m *= has('arthritis') || has('stroke') ? 2 : 1; break;
    default: break;
  }
  return m;
}

export function monthlyChronic(w, rng, people) {
  const st = w.lf.health, T = w.tick, scale = st.incScale || 1, wait = st.svc.gpWait;
  for (const p of people) {
    const hl = p.ext.hl; if (!hl || hl.dying) continue; const age = ageOf(w, p), b = bandIdx(age);
    if (age >= 2) for (const cond in INC) {
      if (hl.c[cond]) continue; const r = INC[cond][b] / 12000; if (r <= 0) continue;
      if (rng.chance(r * mult(p, hl, cond, age) * scale)) onset(w, rng, p, hl, cond, wait);
    }
    // progression, treatment, remission
    for (const cond in hl.c) {
      const c = hl.c[cond], pr = PROG[cond] ?? 0.02;
      c.sev = clamp(c.sev + (pr / 12) * (1 - 0.4 * c.tx * hl.adh) + rng.gauss(0, 0.006), 0.02, 1);
      if (cond === 'stroke') c.sev = Math.max(0.15, c.sev - 0.01);
      if (c.dx && !c.tx && c.dx < T - months(1) && rng.chance(0.2)) c.tx = rng.chance(0.55 + 0.4 * hl.adh) ? 1 : 0;
      if (cond === 'cancer' && c.dx && rng.chance(0.011 * (1 + c.tx))) { delete hl.c.cancer; hl.cancerHist = T; const q2 = p.ext.pop.health; q2.conds = q2.conds.filter((x) => x !== 'cancer'); w.emit('health.recovered', { actors: [p.id], salience: 0.45, tags: ['illness'], payload: { condition: 'cancer' } }); bump(w, 'cancer_cured'); }
      else if (cond === 'asthma' && age > 18 && rng.chance(0.0006)) delete hl.c.asthma;
    }
    if (hl.injury && hl.injury.until < T) hl.injury = null;
    if (rng.chance(0.03)) hl.adh = clamp01(hl.adh + rng.gauss(0, 0.06));
    updateScore(w, p, hl);
  }
}
function onset(w, rng, p, hl, cond, wait) {
  const T = w.tick; hl.c[cond] = { t0: T, sev: cond === 'dementia' ? 0.08 : 0.12, dx: null, tx: 0 };
  const mean = (DX_DELAY[cond] ?? 4) * (0.6 + 0.4 * wait / 8) * (cond === 'cancer' ? w.lf.health.svc.refWait / 14 : 1);
  laterAt(w, months(-Math.log(1 - rng.next() * 0.98) * mean) + days(rng.int(1, 10)), 'dx', { pid: p.id, cond });
  bump(w, 'onset_' + cond);
}
export function updateScore(w, p, hl) {
  const q = p.ext.pop.health, age = ageOf(w, p);
  let b = burdenOf(hl) + (hl.mh.st ? 0.07 + 0.08 * hl.mh.sev : 0) + (hl.acute ? 0.1 * hl.acute.sev : 0) + (hl.injury ? 0.18 * hl.injury.sev : 0) + (hl.dying ? 0.3 : 0);
  const score = clamp(hl.base - (b - hl.burden0), 0.05, 1); p.health = score;
  q.general = score >= 0.9 ? 'very good' : score >= 0.72 ? 'good' : score >= 0.52 ? 'fair' : score >= 0.33 ? 'bad' : 'very bad';
  let dis = q.disabled; for (const k in hl.c) if (DISABLING.has(k) && hl.c[k].sev > 0.3 && hl.c[k].dx) dis = true;
  if (score < 0.58) dis = true; if (hl.injury && hl.injury.sev >= 0.5) dis = true;
  q.disabled = dis; const lim = score < 0.4 || (hl.c.dementia && hl.c.dementia.sev > 0.55) ? 2 : dis ? 1 : 0; q.limiting = Math.max(lim, hl.injury && hl.injury.sev >= 0.7 ? 2 : 0, age < 18 && q.limiting === 1 ? 1 : 0, q.limiting === 2 && score < 0.5 ? 2 : 0);
  if (!dis) q.limiting = 0;
  if (age >= 16 && q.activity === 'employed' && q.limiting === 2 && p.ext.pop.health.conds.length && w.rngFor('health.sick', p.id, w.tick).chance(0.04)) { /* long-term sickness exit is labour's call; flag for it */ hl.workLimited = true; }
}
export const chronicHandlers = {
  dx(w, d) {
    const p = w.people.get(d.pid); if (!p || !p.alive || !p.ext.hl) return; const hl = p.ext.hl, c = hl.c[d.cond]; if (!c || c.dx) return;
    const rng = w.rngFor('health.dx', p.id, w.tick); const ev = diagnose(w, p, d.cond, false);
    c.tx = rng.chance(0.55 + 0.4 * hl.adh) ? 1 : 0;
    if (w.commands.has('routine.insert')) { const gp = w.rtx && w.rtx.gpB; if (gp != null) { try { w.cmd('routine.insert', { pid: p.id, from: w.tick + 2, to: w.tick + 8, label: 'At the GP surgery', ptype: 1, bid: gp }); } catch (e) { /* plan */ } } }
    return ev;
  },
};
