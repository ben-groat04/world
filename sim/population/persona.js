// Person-level attribute generators: Big Five (age/sex trends + correlated factors), drives (pack drives + segment shifts), interests, skills, health, money.
import { clamp, clamp01, ageBand, logn, wpick, netFromGross } from './util.js';

const INTERESTS = [ // [id, base weight, age-peak, sexBias(F share)]
  ['football', 1.0, 28, 0.25], ['music', 1.2, 24, 0.5], ['cooking', 1.0, 40, 0.6], ['gaming', 0.9, 22, 0.3], ['running', 0.7, 33, 0.5], ['reading', 0.9, 50, 0.6], ['gardening', 0.7, 62, 0.55],
  ['faith', 0.6, 60, 0.55], ['politics', 0.5, 45, 0.4], ['tv', 1.2, 55, 0.5], ['fashion', 0.6, 25, 0.7], ['cars', 0.5, 40, 0.15], ['travel', 0.8, 34, 0.55], ['pubs', 0.8, 40, 0.35], ['diy', 0.5, 50, 0.3],
  ['art', 0.5, 35, 0.6], ['pets', 0.6, 40, 0.6], ['fitness', 0.9, 30, 0.5], ['film', 0.8, 30, 0.45], ['history', 0.4, 62, 0.4], ['kids', 0.5, 36, 0.65], ['dancing', 0.4, 28, 0.6], ['cricket', 0.4, 40, 0.25], ['community', 0.4, 55, 0.55],
];
export const INTEREST_IDS = INTERESTS.map((x) => x[0]);

export function interestsFor(rng, age, sex, religious, hasKids) {
  const w = INTERESTS.map(([id, b, peak, fem]) => {
    let x = b * Math.exp(-Math.pow((age - peak) / 28, 2)) * (sex === 'F' ? fem * 2 : (1 - fem) * 2);
    if (id === 'faith') x *= religious ? 3 : 0.15; if (id === 'kids') x *= hasKids ? 3 : 0.3; if (id === 'pubs' && age < 18) x = 0;
    return x;
  });
  const out = [];
  const n = age < 12 ? 2 : 3 + (rng.chance(0.4) ? 1 : 0);
  while (out.length < n) { const id = wpick(rng, INTERESTS.map((x, i) => [x[0], w[i]])); if (!out.includes(id)) out.push(id); }
  return out;
}

/** Big Five on 0..1 (mean ~0.5, sd ~0.17) with maturation trends and two correlated factors (stability: -N +A +C; plasticity: +E +O). */
export function personalityFor(rng, age, sex) {
  const s1 = rng.gauss(0, 1), s2 = rng.gauss(0, 1), a = clamp(age, 14, 80);
  const f = sex === 'F';
  const mk = (mean, sd, load, factor) => clamp(mean + sd * (load * factor + Math.sqrt(1 - load * load) * rng.gauss(0, 1)), 0.03, 0.97);
  return {
    openness: mk(0.54 - 0.0016 * (a - 30) + (f ? 0.01 : 0), 0.17, 0.3, s2),
    conscientiousness: mk(0.42 + 0.0045 * Math.min(a - 14, 40) + (f ? 0.02 : 0), 0.16, 0.3, s1),
    extraversion: mk(0.52 - 0.0012 * (a - 30) + (f ? 0.01 : 0), 0.18, 0.3, s2),
    agreeableness: mk(0.47 + 0.0025 * Math.min(a - 14, 50) + (f ? 0.05 : 0), 0.16, 0.3, s1),
    neuroticism: mk(0.52 - 0.0016 * (a - 25) + (f ? 0.06 : 0), 0.18, -0.35, s1),
  };
}

const z = (v) => clamp((v - 0.5) / 0.17, -2, 2);
/** drive weights per pack/drives.js: clamp(base + sum(loading * z-trait) + lifeStage + segment shift + noise(sd)). */
export function drivesFor(rng, pack, pers, age, segId) {
  const Z = { O: z(pers.openness), C: z(pers.conscientiousness), E: z(pers.extraversion), A: z(pers.agreeableness), N: z(pers.neuroticism) };
  const shift = (pack.meta.segmentShifts || {})[segId] || {}, band = age >= 18 ? ageBand(age) : null, out = {};
  for (const d of pack.drives) {
    let w = d.base + (shift[d.id] || 0) + (band && d.lifeStage ? d.lifeStage[band] || 0 : 0);
    for (const [k, l] of Object.entries(d.traits || {})) w += l * Z[k];
    out[d.id] = +clamp01(w + rng.gauss(0, d.sd * 0.8)).toFixed(3);
  }
  return out;
}

/** Modern skills 0..1 from age, education, occupation. */
export function skillsFor(rng, age, edu, occ, pers) {
  const e = { none: 0.15, level1: 0.25, level2: 0.38, apprenticeship: 0.45, level3: 0.5, level4plus: 0.7, other: 0.4 }[edu] ?? 0.35;
  const g = (m, sd = 0.12) => +clamp01(m + rng.gauss(0, sd)).toFixed(2);
  const mat = clamp01((age - 8) / 14);
  const o = occ ? occ.soc : 0;
  return {
    literacy: g(e * 0.7 + 0.25 * mat), numeracy: g(e * 0.7 + 0.2 * mat - (age > 70 ? 0.1 : 0)), digital: g(e * 0.4 + 0.5 * (age < 40 ? 1 : age < 60 ? 0.7 : 0.35) * mat + (o === 2 || o === 3 ? 0.1 : 0)),
    social: g(0.3 + 0.35 * pers.extraversion + 0.25 * pers.agreeableness), practical: g(0.3 + 0.3 * (o === 5 || o === 8 ? 1 : 0.3) + 0.2 * pers.conscientiousness), cooking: g(0.25 + 0.5 * clamp01((age - 14) / 30)),
    driving: 0, languages: 0, professional: occ ? g(0.25 + 0.55 * clamp01((age - 20) / 20) * (1 - (o >= 8 ? 0.4 : 0))) : 0,
  };
}

const CONDITIONS = [['asthma', 0.09, 0, 60], ['diabetes', 0.07, 30, 100], ['hypertension', 0.14, 40, 100], ['depression/anxiety', 0.13, 14, 80], ['back pain', 0.09, 25, 100], ['arthritis', 0.12, 55, 100], ['heart disease', 0.05, 55, 100], ['COPD', 0.04, 55, 100], ['mobility impairment', 0.05, 50, 100], ['dementia (early)', 0.04, 78, 100], ['epilepsy', 0.01, 5, 100], ['autism/ADHD', 0.04, 3, 60], ['hearing/sight loss', 0.06, 55, 100], ['chronic fatigue', 0.01, 20, 70]];
/** Health: general (very good..bad), conditions, disability (Equality Act), limiting-a-lot. Calibrated to calibration.health (crude shares) with a steep age gradient. */
export function healthFor(rng, cal, age, segHealth, forceSick) {
  const g = cal.health.generalHealthCrude;
  // age-scaled probability of fair-or-worse: logistic around ~65, centred so the crude average ~ calibration
  const pBad = clamp(0.02 + 0.5 / (1 + Math.exp(-(age - 68) / 11)), 0.01, 0.8);
  let tilt = (segHealth && segHealth.limitingLongTerm ? segHealth.limitingLongTerm / 0.12 : 1);
  let u = rng.next();
  if (forceSick) tilt = 4;
  const bad = clamp(pBad * (0.55 + 0.45 * tilt) * 1.35, 0, 0.92);
  let general;
  if (u < bad * 0.25) general = 'very bad'; else if (u < bad * 0.6) general = 'bad'; else if (u < bad) general = 'fair'; else if (u < bad + (1 - bad) * (g.good / (g.good + g.veryGood))) general = 'good'; else general = 'very good';
  const conds = [];
  const sev = { 'very good': 0.2, good: 0.5, fair: 1.2, bad: 2.2, 'very bad': 3 }[general];
  for (const [name, p, lo, hi] of CONDITIONS) if (age >= lo && age <= hi && rng.chance(p * sev * (age > 60 ? 1.6 : 0.8))) conds.push(name);
  const disabled = general === 'bad' || general === 'very bad' ? rng.chance(0.85) : general === 'fair' ? rng.chance(0.3) : conds.length ? rng.chance(0.12) : rng.chance(0.02);
  const limitingALot = disabled && (general === 'very bad' || (general === 'bad' && rng.chance(0.6)) || rng.chance(0.12));
  return { general, conds: conds.slice(0, 3), disabled, limiting: limitingALot ? 2 : disabled ? 1 : 0, score: { 'very good': 0.95, good: 0.82, fair: 0.62, bad: 0.4, 'very bad': 0.25 }[general] };
}

/** Savings / debt for a household given segment money profile and net monthly income. */
export function savingsFor(rng, seg, netPcm, tenure) {
  const m = seg.money;
  const spend = Math.max(700, netPcm * 0.82);
  let months = logn(rng, Math.max(0.02, m.savingsMonthsMedian * 0.15), Math.max(0.03, m.savingsMonthsMedian), Math.max(0.4, m.savingsMonthsMedian * 6));
  if (m.savingsMonthsMedian < 0.5 && rng.chance(0.35)) months = rng.float(0, 0.05);
  const savings = Math.round(months * spend);
  const debtP = m.debtProb * (tenure === 'mortgage' ? 0.7 : 1);
  const debt = rng.chance(debtP) ? Math.round(logn(rng, 400, 3000, 15000) * (m.pressure + 0.5)) : 0;
  const arrears = rng.chance(m.arrearsProb) ? Math.round(Math.max(50, debt * 0.2 + rng.float(50, 600))) : 0;
  return { savings, debt, arrears, spend: Math.round(spend) };
}

export { netFromGross };
