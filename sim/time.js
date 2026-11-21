// Calendar: 1 tick = 10 game minutes. 24h days, 4 seasons x 28 days = 112-day year (16 weeks of 7 days).
export const TICKS_PER_HOUR = 6;
export const TICKS_PER_DAY = 144;
export const DAYS_PER_SEASON = 28;
export const DAYS_PER_YEAR = 112;
export const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR; // 16128
export const START_HOUR = 6; // tick 0 is 06:00 on Spring 1, Year 1
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const REST_WEEKDAY = 6; // every 7th day is the rest day
const OFFSET = START_HOUR * TICKS_PER_HOUR;
const mod = (a, n) => ((a % n) + n) % n;

// Fills/returns a time object for a tick. Pass `out` to avoid allocation.
export function timeOf(tick, out = {}) {
  const t = tick + OFFSET;
  const dayAbs = Math.floor(t / TICKS_PER_DAY);
  const tod = t - dayAbs * TICKS_PER_DAY;
  const dayOfYear = mod(dayAbs, DAYS_PER_YEAR);
  out.tick = tick;
  out.dayAbs = dayAbs;                       // absolute day index (day 0 = Spring 1, Year 1)
  out.hour = Math.floor(tod / TICKS_PER_HOUR);
  out.minute = (tod % TICKS_PER_HOUR) * 10;
  out.hourFloat = tod / TICKS_PER_HOUR;      // 0..24
  out.dayOfYear = dayOfYear;                 // 0..111
  out.season = Math.floor(dayOfYear / DAYS_PER_SEASON); // 0..3
  out.seasonName = SEASON_NAMES[out.season];
  out.dayOfSeason = (dayOfYear % DAYS_PER_SEASON) + 1;  // 1..28
  out.year = Math.floor(dayAbs / DAYS_PER_YEAR) + 1;    // 1-based
  out.weekday = mod(dayAbs, 7);              // 0..6
  out.restDay = out.weekday === REST_WEEKDAY;
  return out;
}
const pad = (n) => (n < 10 ? '0' + n : '' + n);
export function formatDate(tick) { const t = timeOf(tick); return `${t.seasonName} ${t.dayOfSeason}, Year ${t.year}`; }
export function formatTime(tick) { const t = timeOf(tick); return `${pad(t.hour)}:${pad(t.minute)}`; }
export function formatDateTime(tick) { return `${formatDate(tick)}, ${formatTime(tick)}`; }
export function formatHour(h) { const hh = Math.floor(h) % 24; return `${pad(hh)}:${pad(Math.round((h - Math.floor(h)) * 60))}`; }
// ticks from `tick` until the next time the clock reads `hour` (0..24, may be fractional). 0 < result <= 144.
export function ticksUntilHour(tick, hour) {
  const tod = mod(tick + OFFSET, TICKS_PER_DAY);
  let d = hour * TICKS_PER_HOUR - tod;
  if (d <= 0) d += TICKS_PER_DAY;
  return Math.ceil(d);
}
export function ageYears(birthTick, tick) { return Math.floor((tick - birthTick) / TICKS_PER_YEAR); }
