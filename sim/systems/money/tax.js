// UK tax, NI, student loan, Universal-Credit-style benefit maths from pack.meta.tax / pack.meta.benefits. Pure; amounts in GBP/year unless the name says Month.
export function taxNI(g, T, o = {}) {
  if (g <= 0) return { tax: 0, ni: 0, sl: 0 };
  const idx = o.idx || 1, pa0 = T.personalAllowance * idx, bb = T.basicRateBand * idx, add = T.additionalThreshold * idx;
  const pa = g > 100000 * idx ? Math.max(0, pa0 - (g - 100000 * idx) / 2) : pa0;
  const taxable = Math.max(0, g - pa);
  let tax = Math.min(taxable, bb) * T.basicRate;
  if (taxable > bb) tax += (Math.min(g, add) - pa - bb) * T.higherRate;
  if (g > add) tax += (g - add) * T.additionalRate;
  const nt = T.niPrimaryThreshold * idx, nu = T.niUpperEarningsLimit * idx;
  let ni = g > nt ? (Math.min(g, nu) - nt) * (o.selfEmployed ? 0.06 : T.niPrimaryRate) + Math.max(0, g - nu) * T.niUpperRate : 0;
  const sl = o.studentLoan && g > T.studentLoanPlan2Threshold ? (g - T.studentLoanPlan2Threshold) * T.studentLoanRate : 0;
  return { tax: Math.max(0, tax), ni: Math.max(0, ni), sl };
}
/** Employer NI (15% above GBP 5,000 secondary threshold). */
export const employerNI = (g) => (g > 5000 ? (g - 5000) * 0.15 : 0);
export const NMW = { adult: 12.71, y18: 10.85, u18: 8.0 };
export const minHourly = (age, apprentice = false) => (apprentice ? NMW.u18 : age >= 21 ? NMW.adult : age >= 18 ? NMW.y18 : NMW.u18);
/** Universal Credit-style monthly entitlement. in: {couple, age (youngest claimant), kids, lcw (n adults with limited capability for work), rent, lhaCap, social, netEarn, hasChildOrLcw, childcare}. */
export function universalCredit(B, i, idx = 1) {
  const std = (i.couple ? B.universalCreditCouple25plus : i.age >= 25 ? B.universalCreditStandardAllowanceMonthlySingle25plus : B.universalCreditStandardAllowanceMonthlySingle25plus * 0.8) * idx;
  const child = i.kids * B.childElementMonthly * idx, lcw = i.lcw * 423 * idx;
  const housing = i.rent > 0 ? (i.social ? i.rent : Math.min(i.rent, i.lhaCap * idx)) : 0;
  const cc = Math.min(i.childcare * 0.85, i.kids > 1 ? 1760 : 1030);
  const allowance = (i.hasChildOrLcw ? (housing > 0 ? 411 : 684) : 0) * idx;
  const taper = Math.max(0, i.netEarn - allowance) * 0.55;
  return Math.max(0, std + child + lcw + housing + cc - taper);
}
/** Child benefit monthly (High Income Child Benefit Charge tapers it away between GBP 60k and 80k of the higher earner). */
export function childBenefit(B, kids, topEarnerGross, idx = 1) {
  if (!kids) return 0;
  const f = topEarnerGross <= 60000 ? 1 : topEarnerGross >= 80000 ? 0 : 1 - (topEarnerGross - 60000) / 20000;
  return ((B.childBenefitWeeklyFirst + (kids - 1) * B.childBenefitWeeklyOther) * 52 / 12) * f * idx;
}
export const statePensionMonth = (B, rate = 1, idx = 1) => B.statePensionWeeklyNewFull * 52 / 12 * rate * idx;
/** Pension Credit guarantee (monthly): tops a pensioner household up to this floor. */
export const pensionCreditFloor = (couple) => (couple ? 363 : 238) * 52 / 12;
export const lhaFor = (B, beds) => B.housingBenefitLHAByBedrooms[Math.min(4, Math.max(1, beds))] || 700;
