// Shared tiny helpers for sim code (pure, no world state).
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const has = (p, trait) => !!p && p.traits.includes(trait);
export const pid = (x) => (x !== null && typeof x === 'object' ? x.id : x);
export const fullName = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');

// Per-entity monthly stagger: instead of every household/person being processed on the 1st of the month (event clumping), each is processed once per calendar month on
// its own day-of-month ((id % 28) + 1; days 29-31 are nobody's). Use with a `day` clock.
export const dayOfMonth = (w) => w.calendar.recAt(Math.floor(w.tick / 144)).dom;
export const slotDay = (id, dom) => (id % 28) + 1 === dom;

/**
 * Whole years of age a child had on the most recent 1 September: the English school-intake age. A child starts Reception in the first September on or after their 4th birthday
 * (DfE school admissions code: "the September after they turn four"), so primary school needs this to be >= 4, secondary >= 11. dateOf gives month 0-11 and day-of-month.
 */
export function schoolYearAge(cal, tick, birthTick) {
  const d = cal.dateOf(tick), sinceSep = ((d.m >= 8 ? d.m - 8 : d.m + 4) * 30.44 + (d.d - 1)) / 365.25;
  return Math.floor((tick - birthTick) / cal.ticksPerYear - sinceSep + 1e-6);
}
