// Pay arithmetic shared by money, population, life and the UI. `q.pay` (person.ext.pop.pay) is the HOURLY RATE EXPRESSED AS A FULL-TIME-EQUIVALENT ANNUAL FIGURE
// (rate x 1950 h = 37.5 h x 52 weeks), because ASHE and job adverts quote rates, and the content bands in content/larkfield/jobs.js are such FTE figures.
// What a person actually earns is annualPay = hourly rate x PAID hours x 52, so a cleaner on 20 h/week earns about half the FTE figure, not the FTE figure.
//   Salaried jobs (SOC 1-3: managers, professionals, associate professionals) are paid for at most 37.5 h/week (a full-time salary) (unpaid overtime above full-time: teachers' and
//   solicitors' recorded hours are working hours, not paid hours); hourly jobs (SOC 4-9) are paid for every hour up to MAX_PAID_HOURS.
// Evidence: ONS ASHE reports hourly pay excluding overtime and annual pay as hourly x paid hours; National Living Wage 21+ is a hourly floor (GBP 12.71 from Apr 2026).
export const FTE_HOURS = 37.5 * 52;
export const NLW_FTE_2026 = 12.71 * FTE_HOURS;
export const hourlyRate = (q) => (q.pay || 0) / FTE_HOURS;
// Paid hours: ASHE 2026 Table 14.9a, all full-time employees: paid hours (basic + paid overtime) median 37.5, p75 40, p90 44. Hours above ~44 are overwhelmingly unpaid (salaried) or unpremiumed; the old cap of 48.75
// (1.3 x 37.5) paid a 58-hour week at straight time, which with the occupation's own pay draw gave a chef or cook GBP 45-60k. 44 = ASHE p90 of FT paid hours.
export const MAX_PAID_HOURS = 44;
export function paidHours(q) {
  const h = q.hours || 0, c = q.contract;
  if (q.soc >= 1 && q.soc <= 3 && c !== 'self_employed' && c !== 'gig') return Math.min(h, 37.5);
  return Math.min(h, MAX_PAID_HOURS);
}
export const annualPay = (q) => (q.pay || 0) / 37.5 * paidHours(q);
/** floor a drawn FTE pay at the National Living Wage for employees (not the self-employed, gig workers or the under-21 rates the money system applies later) */
export const nlwFloor = (fte, contract, age) => (contract === 'self_employed' || contract === 'gig' || age < 21 ? fte : Math.max(fte, NLW_FTE_2026));

/**
 * Draw a person's FTE pay from an occupation band {p10, median, p90} (ASHE percentiles for the occupation's employees of ALL ages, so the band already contains the age effect).
 * Two-piece lognormal through the three published points (ASHE pay is right-skewed: p90/median > median/p10). The person's rank within the occupation shifts with age (`ageShift`: ASHE 22-29s earn
 * ~10% less than the all-age median, 40-49s ~10% more) but is NOT multiplied on top of the band, which double counted age (old code: x0.78-1.18 on the draw, so a p90 chef became 1.18 x p90).
 * extra = further z shift (e.g. conscientiousness). Returns the FTE annual figure.
 */
export const ageShift = (age) => Math.max(-0.6, Math.min(0.3, 0.03 * (age - 38)));
export function payFte(rng, band, age, extra = 0) {
  const z = rng.gauss(0, 0.95) + ageShift(age) + extra;
  const s = z >= 0 ? Math.log(band.p90 / band.median) / 1.2816 : Math.log(band.median / band.p10) / 1.2816;
  return band.median * Math.exp(Math.max(0.03, s) * z);
}
