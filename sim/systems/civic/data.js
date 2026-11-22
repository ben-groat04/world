// Civic data. Parties are generic UK labels with a left-right/values position x (-1..1), a base appeal, and a slate size. Positions are inputs (the spatial voting model's
// party locations); vote shares are outputs. services: exposure = how much of a budget cut falls on the service (discretionary services are cut hardest: CIPFA, Unison library
// survey, YMCA "Out of Service" youth-work report). case kinds: days = council target resolution time (bins 5d, potholes 28d, fly-tipping 7d, council repairs ~56d, noise ~30d).
export const PARTIES = {
  Labour: { x: -0.4, base: 0.55, slate: 3 }, Conservative: { x: 0.5, base: 0.1, slate: 3 }, 'Liberal Democrats': { x: -0.05, base: 0.0, slate: 2 },
  Green: { x: -0.6, base: 0.05, slate: 3, env: 1 }, 'Reform UK': { x: 0.85, base: -0.1, slate: 1 }, Independent: { x: 0, base: -0.5, slate: 1 },
};
export const SERVICES = {
  library: { exposure: 1.0, cutText: (l) => `The council has cut library opening hours to ${Math.round(40 * l)} a week.` },
  youth: { exposure: 1.4, cutText: (l) => (l < 0.4 ? 'The ward youth club is to close on most evenings.' : 'The youth club will run fewer sessions a week.') },
  bins: { exposure: 0.3, cutText: () => 'Collections have moved to a three-weekly cycle for some streets.' },
  roads: { exposure: 0.8, cutText: () => 'The council has delayed road and pavement repairs in the ward.' },
  repairs: { exposure: 0.4, cutText: () => 'Council housing repairs now have a longer waiting list.' },
  noise: { exposure: 0.7, cutText: () => 'The noise and enforcement team has lost two officers.' },
};
export const CASE_KINDS = {
  bins: { days: 5, service: 'bins' }, pothole: { days: 28, service: 'roads' }, flytip: { days: 7, service: 'noise' }, damp: { days: 56, service: 'repairs' }, repair: { days: 56, service: 'repairs' }, noise: { days: 30, service: 'noise' },
};
// planning application kinds: perMonth = arrivals/month per 550 residents, weeks = statutory decision period (8 minor, 13 major), fit = typical policy compliance (national approval ~86%),
// objBase = relative objection propensity among notified neighbours (change of use to HMO and takeaway attract the most), supportBase = baseline support share.
const pick = (r, a) => a[(r.next() * a.length) | 0];
// flats: net additions to a built-up inner-city ward ~0.7%/yr of stock (0.0125 applications/month x ~85% approved x 14 homes = ~1.8 homes/yr on ~260). London net additions 2022-23 were ~36-40k on a ~3.7M stock = ~1.0%/yr
// (GLA London Plan AMR); built-up inner wards run ~0.5-1.5%. Before: 0.025 x pop/550 (~1.6%/yr and growing with the population: stock 259 -> ~480 in 50 y).
export const APP_KINDS = {
  extension: { perMonth: 0.28, weeks: 8, fit: 0.92, objBase: 0.4, supportBase: 0.01, n: 1, label: 'extension', name: (r) => pick(r, ['a rear extension', 'a loft conversion', 'a two-storey side extension']) },
  hmo: { perMonth: 0.06, weeks: 8, fit: 0.78, objBase: 1.3, supportBase: 0.01, n: 1, label: 'HMO conversion', name: (r) => pick(r, ['conversion of a family house to a seven-bed HMO', 'change of use to a house in multiple occupation']) },
  flats: { fixed: 1, perMonth: 0.0125, weeks: 13, fit: 0.8, objBase: 1.1, supportBase: 0.03, n: 14, major: 1, label: 'development', name: (r) => pick(r, ['14 flats on the former garage site', 'a four-storey block of flats on the old depot', '12 homes on a vacant yard']) },
  takeaway: { perMonth: 0.05, weeks: 8, fit: 0.75, objBase: 1.2, supportBase: 0.025, n: 1, major: 1, label: 'takeaway licence', name: (r) => pick(r, ['a hot food takeaway near the school', 'a late-night takeaway licence on the high street']) },
  pub: { perMonth: 0.03, weeks: 8, fit: 0.88, objBase: 0.6, supportBase: 0.02, n: 1, label: 'licence variation', name: (r) => pick(r, ['an extension of pub licensing hours to 1am', 'a beer garden at the pub']) },
};
