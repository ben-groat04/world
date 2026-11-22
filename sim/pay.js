// Pay arithmetic shared by money, population, life and the UI. `q.pay` (person.ext.pop.pay) is the HOURLY RATE EXPRESSED AS A FULL-TIME-EQUIVALENT ANNUAL FIGURE
// (rate x 1950 h = 37.5 h x 52 weeks), because ASHE and job adverts quote rates, and the content bands in content/larkfield/jobs.js are such FTE figures.
// What a person actually earns is annualPay = hourly rate x PAID hours x 52, so a cleaner on 20 h/week earns about half the FTE figure, not the FTE figure.
//   Salaried jobs (SOC 1-3: managers, professionals, associate professionals) are paid for at most 40 h/week (unpaid overtime above that: teachers' and
//   solicitors' recorded hours are working hours, not paid hours); hourly jobs (SOC 4-9) are paid for every hour up to 48.75 (the old 1.3 x 37.5 cap).
// Evidence: ONS ASHE reports hourly pay excluding overtime and annual pay as hourly x paid hours; National Living Wage 21+ is a hourly floor (GBP 12.71 from Apr 2026).
export const FTE_HOURS = 37.5 * 52;
export const NLW_FTE_2026 = 12.71 * FTE_HOURS;
export const hourlyRate = (q) => (q.pay || 0) / FTE_HOURS;
export function paidHours(q) {
  const h = q.hours || 0, c = q.contract;
  if (q.soc >= 1 && q.soc <= 3 && c !== 'self_employed' && c !== 'gig') return Math.min(h, 40);
  return Math.min(h, 48.75);
}
export const annualPay = (q) => (q.pay || 0) / 37.5 * paidHours(q);
/** floor a drawn FTE pay at the National Living Wage for employees (not the self-employed, gig workers or the under-21 rates the money system applies later) */
export const nlwFloor = (fte, contract, age) => (contract === 'self_employed' || contract === 'gig' || age < 21 ? fte : Math.max(fte, NLW_FTE_2026));
