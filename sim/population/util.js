// Small pure helpers shared by the population generator and the routine layer. No randomness except through a passed RNG.
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Weighted pick from [[item, w], ...] or (items, weights). */
export function wpick(rng, entries) {
  let t = 0; for (const e of entries) t += e[1];
  if (t <= 0) return entries[0][0];
  let r = rng.next() * t;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}
export const wpickObj = (rng, o) => wpick(rng, Object.entries(o));
/** Lognormal sample given p10/median/p90. */
export function logn(rng, p10, med, p90) {
  const s = Math.max(0.05, Math.log(p90 / p10) / (2 * 1.2816));
  return med * Math.exp(rng.gauss(0, s));
}
/** Integer hash -> [0,1). Stateless "dice" for per-person-per-day decisions in the routine layer (cheap; no RNG object). */
export function dice(a, b = 0, c = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const ageBand = (a) => (a < 25 ? '18-24' : a < 35 ? '25-34' : a < 50 ? '35-49' : a < 65 ? '50-64' : '65+');
export const pcm = (annual) => Math.round(annual / 12);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function netFromGross(g, TAX, studentLoan = false) {
  if (g <= 0) return 0;
  const pa = g > 100000 ? Math.max(0, TAX.personalAllowance - (g - 100000) / 2) : TAX.personalAllowance;
  const taxable = Math.max(0, g - pa);
  let tax = Math.min(taxable, TAX.basicRateBand) * TAX.basicRate;
  if (taxable > TAX.basicRateBand) tax += (Math.min(g, TAX.additionalThreshold) - pa - TAX.basicRateBand) * TAX.higherRate;
  if (g > TAX.additionalThreshold) tax += (g - TAX.additionalThreshold) * TAX.additionalRate;
  let ni = 0;
  if (g > TAX.niPrimaryThreshold) ni = (Math.min(g, TAX.niUpperEarningsLimit) - TAX.niPrimaryThreshold) * TAX.niPrimaryRate + Math.max(0, g - TAX.niUpperEarningsLimit) * TAX.niUpperRate;
  const sl = studentLoan && g > TAX.studentLoanPlan2Threshold ? (g - TAX.studentLoanPlan2Threshold) * TAX.studentLoanRate : 0;
  return Math.max(0, g - tax - ni - sl);
}

/** Female share of employee jobs by SOC major group, ASHE 2026 (provisional) Table 14.6a jobs by sex (sum of 4-digit rows). Used to tilt the sex-blind SOC-group draw (calibration.occupationSOC is both sexes pooled). */
export const SOC_FEMALE = { 1: 0.39, 2: 0.51, 3: 0.50, 4: 0.71, 5: 0.11, 6: 0.76, 7: 0.59, 8: 0.11, 9: 0.50 };
export const socSexTilt = (soc, sex) => { const f = SOC_FEMALE[soc] ?? 0.5; return sex === 'F' ? f / 0.5 : (1 - f) / 0.5; };
/** Relative weight of occupation `o` for a person of `sex` ('F'|'M') GIVEN a SOC group whose female share is `base`: from the occupation's female share of employee jobs (content jobs.js `female`, ASHE 2026 jobs by sex),
 *  so within nursing/care women and within trades men are drawn in proportion to who does the job. `sexOnly` ('M'|'F') is a hard role rule (imam). */
export const sexFit = (o, sex, base = 0.5) => {
  if (!o) return 1;
  if (o.sexOnly) return o.sexOnly === sex ? 1 : 0;
  if (o.female == null) return 1;
  return Math.max(0.02, sex === 'F' ? o.female / base : (1 - o.female) / (1 - base));
};
