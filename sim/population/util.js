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
