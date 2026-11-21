// Real UK (England) calendar for Larkfield. DATA + pure functions, no randomness. buildCalendar(year) -> 365/366 day records.
// Day record: {doy, month(0-11), dom, dow(Mon=0..Sun=6), bankHoliday:name|null, term:'term'|'holiday', schoolDay:bool, schoolHoliday:name|null,
//   sunrise, sunset (local clock hours, lat 53.4N, GMT/BST applied), daylight, regime(weather key), special:[ids]}
// Term dates follow the common English LA pattern (not tied to any one council): autumn from first Tue-ish of Sept, half-terms late Oct/mid Feb/late May, etc.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y, m) => (m === 1 && isLeap(y) ? 29 : MONTH_DAYS[m]);
const dayMs = 86400000;
const utc = (y, m, d) => Date.UTC(y, m, d);
export const dowOf = (y, m, d) => (new Date(utc(y, m, d)).getUTCDay() + 6) % 7; // Mon=0
export function easter(y) { // anonymous Gregorian computus -> [month0, day]
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return [mo - 1, da];
}
const shiftDate = (y, m, d, n) => { const t = new Date(utc(y, m, d) + n * dayMs); return [t.getUTCMonth(), t.getUTCDate()]; };
const nthDow = (y, m, dow, n) => { let c = 0; for (let d = 1; d <= dim(y, m); d++) if (dowOf(y, m, d) === dow && ++c === n) return d; return -1; };
const lastDow = (y, m, dow) => { for (let d = dim(y, m); d >= 1; d--) if (dowOf(y, m, d) === dow) return d; return -1; };
const key = (m, d) => m * 100 + d;
/** England & Wales bank holidays with substitute days. */
export function bankHolidays(y) {
  const out = new Map(); const add = (m, d, n) => out.set(key(m, d), n);
  const subst = (m, d, n) => { let dd = d, mm = m; const w = dowOf(y, m, d); if (w === 5) { [mm, dd] = shiftDate(y, m, d, 2); } else if (w === 6) { [mm, dd] = shiftDate(y, m, d, 1); } while (out.has(key(mm, dd))) [mm, dd] = shiftDate(y, mm, dd, 1); add(mm, dd, n); };
  subst(0, 1, "New Year's Day");
  const [em, ed] = easter(y); const [gm, gd] = shiftDate(y, em, ed, -2), [om, od] = shiftDate(y, em, ed, 1);
  add(gm, gd, 'Good Friday'); add(om, od, 'Easter Monday');
  add(4, nthDow(y, 4, 0, 1), 'Early May bank holiday'); add(4, lastDow(y, 4, 0), 'Spring bank holiday'); add(7, lastDow(y, 7, 0), 'Summer bank holiday');
  subst(11, 25, 'Christmas Day');
  // Boxing Day: if Dec25 is Fri -> Mon 28; Sat -> Mon 28 (Dec 27 is substitute for Xmas); handle generically
  { const w = dowOf(y, 11, 26); let d = 26; if (w === 5) d = 28; else if (w === 6) d = 28; if (out.has(key(11, d))) d++; add(11, d, 'Boxing Day'); }
  return out;
}
/** School-term pattern (state primary/secondary, English LA typical). Returns Map key->holiday name for non-term WEEKDAYS. */
export function schoolHolidays(y) {
  const hol = new Map(); const range = (m0, d0, m1, d1, name) => { let t = utc(y, m0, d0); const e = utc(y, m1, d1); for (; t <= e; t += dayMs) { const dt = new Date(t); hol.set(key(dt.getUTCMonth(), dt.getUTCDate()), name); } };
  const [em, ed] = easter(y);
  range(0, 1, 0, 1, 'Christmas holiday'); // spill from prior year: Jan 1 and following days up to first Monday after Jan 2
  { const first = nthDow(y, 0, 0, 1); if (first > 2) range(0, 1, 0, first - 1, 'Christmas holiday'); else range(0, 1, 0, 1, 'Christmas holiday'); }
  { const m = nthDow(y, 1, 0, 3); range(1, m, 1, m + 4, 'February half-term'); }
  { const [sm, sd] = shiftDate(y, em, ed, -12), [fm, fd] = shiftDate(y, em, ed, 11); range(sm, sd, fm, fd, 'Easter holiday'); }
  { const m = lastDow(y, 4, 0); range(4, m, 4, m + 4, 'May half-term'); }
  range(6, 23, 7, 31, 'Summer holiday');
  { let d = 1; while (dowOf(y, 8, d) !== 1) d++; if (d > 1) range(8, 1, 8, d - 1, 'Summer holiday'); } // autumn term starts on the first Tuesday of September
  { const m = nthDow(y, 9, 0, 4); range(9, m, 9, m + 4, 'October half-term'); }
  range(11, 19, 11, 31, 'Christmas holiday');
  return hol;
}
// Solar position (NOAA-style approximation) for latitude/longitude; returns [sunriseUTChours, sunsetUTChours].
function sun(y, doy, lat = 53.4, lon = -2.2) {
  const g = (2 * Math.PI / (isLeap(y) ? 366 : 365)) * (doy - 1 + 0.5);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = lat * Math.PI / 180, ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(decl)) - Math.tan(la) * Math.tan(decl)) * 180 / Math.PI;
  return [(720 - 4 * (lon + ha) - eqt) / 60, (720 - 4 * (lon - ha) - eqt) / 60];
}
/** Seasonal weather regimes: per-month probabilities (Markov-style persistence set by `stick`) + daily temperature (C) mean/range. Weather generator in W1 systems draws regimes seeded. */
export const WEATHER_REGIMES = {
  settled_dry: { label: 'settled and dry', rain: 0.02, wind: 0.2 },
  mixed: { label: 'mixed, bright spells and showers', rain: 0.25, wind: 0.4 },
  unsettled_wet: { label: 'unsettled and wet', rain: 0.62, wind: 0.6 },
  grey_mild: { label: 'grey and mild', rain: 0.3, wind: 0.3 },
  cold_clear: { label: 'cold and clear', rain: 0.04, wind: 0.2 },
  cold_wet: { label: 'cold and wet/sleet', rain: 0.5, wind: 0.5 },
  snap_snow: { label: 'cold snap with snow risk', rain: 0.35, wind: 0.4, snow: 0.35 },
  heatwave: { label: 'hot spell', rain: 0.03, wind: 0.15 },
  humid_thundery: { label: 'humid with thundery downpours', rain: 0.3, wind: 0.3 },
  stormy: { label: 'named storm', rain: 0.7, wind: 0.95 },
};
export const SEASONAL_WEATHER = [ // per month Jan..Dec: tempMean, tempRange, regimes weights, stick (daily persistence), monthly rainDays typical
  { tMean: 4.5, tRange: 5, rainDays: 17, stick: 0.8, regimes: { cold_wet: 3, cold_clear: 2, grey_mild: 3, unsettled_wet: 2, snap_snow: 1, stormy: 0.5 } },
  { tMean: 4.8, tRange: 6, rainDays: 14, stick: 0.8, regimes: { cold_wet: 3, cold_clear: 2, grey_mild: 3, unsettled_wet: 2, snap_snow: 1, stormy: 0.7 } },
  { tMean: 7, tRange: 7, rainDays: 14, stick: 0.78, regimes: { mixed: 4, grey_mild: 2, cold_clear: 1, unsettled_wet: 2, settled_dry: 1, stormy: 0.3 } },
  { tMean: 9.5, tRange: 8, rainDays: 12, stick: 0.75, regimes: { mixed: 4, settled_dry: 2, unsettled_wet: 2, grey_mild: 1 } },
  { tMean: 12.5, tRange: 9, rainDays: 12, stick: 0.75, regimes: { mixed: 3, settled_dry: 3, unsettled_wet: 1.5, grey_mild: 1 } },
  { tMean: 15.5, tRange: 9, rainDays: 12, stick: 0.75, regimes: { mixed: 3, settled_dry: 3, unsettled_wet: 1.5, heatwave: 1, humid_thundery: 1 } },
  { tMean: 17.5, tRange: 10, rainDays: 12, stick: 0.75, regimes: { mixed: 3, settled_dry: 2, unsettled_wet: 2, heatwave: 1.5, humid_thundery: 1.5 } },
  { tMean: 17.2, tRange: 10, rainDays: 13, stick: 0.75, regimes: { mixed: 3, settled_dry: 2, unsettled_wet: 2, heatwave: 1, humid_thundery: 1.5 } },
  { tMean: 14.5, tRange: 9, rainDays: 13, stick: 0.75, regimes: { mixed: 3, settled_dry: 2, unsettled_wet: 2.5, grey_mild: 1.5, stormy: 0.4 } },
  { tMean: 11, tRange: 7, rainDays: 16, stick: 0.8, regimes: { grey_mild: 3, unsettled_wet: 3, mixed: 2, cold_clear: 1, stormy: 0.8 } },
  { tMean: 7.5, tRange: 6, rainDays: 16, stick: 0.8, regimes: { grey_mild: 3, unsettled_wet: 3, cold_wet: 2, cold_clear: 1.5, stormy: 0.6 } },
  { tMean: 5, tRange: 5, rainDays: 16, stick: 0.8, regimes: { grey_mild: 3, cold_wet: 2.5, cold_clear: 2, unsettled_wet: 2, snap_snow: 0.7, stormy: 0.6 } },
];
/** Non-bank-holiday observances that change behaviour (venue sessions, worship, retail). Dates are fixed or rule-based; lunar ones given per year in LUNAR (2024-2030). */
export const OBSERVANCES = {
  fixed: [
    { id: 'valentines', m: 1, d: 14, label: "Valentine's Day", effects: { restaurants: 1.5, flowers: 1 } },
    { id: 'halloween', m: 9, d: 31, label: 'Halloween', effects: { kidsTrickOrTreat: true } },
    { id: 'bonfire_night', m: 10, d: 5, label: 'Bonfire Night', effects: { fireworks: true, park: 1.4 } },
    { id: 'remembrance_sunday_nearest', m: 10, d: 11, label: 'Armistice Day', effects: { silence11am: true } },
    { id: 'christmas_eve', m: 11, d: 24, label: 'Christmas Eve', effects: { pubs: 1.7, shopsCloseEarly: 17 } },
    { id: 'nye', m: 11, d: 31, label: "New Year's Eve", effects: { pubs: 2.0, fireworks: true } },
    { id: 'diwali_approx', m: 9, d: 20, label: 'Diwali (approx; see LUNAR)', movable: true },
  ],
  rule: [
    { id: 'mothering_sunday', label: 'Mothering Sunday', easterOffset: -21 },
    { id: 'pancake_day', label: 'Shrove Tuesday', easterOffset: -47 },
    { id: 'ash_wednesday', label: 'Ash Wednesday', easterOffset: -46 },
    { id: 'palm_sunday', label: 'Palm Sunday', easterOffset: -7 },
    { id: 'easter_sunday', label: 'Easter Sunday', easterOffset: 0 },
    { id: 'pentecost', label: 'Pentecost', easterOffset: 49 },
    { id: 'fathers_day', label: "Father's Day", nthDow: [5, 0, 3] }, // [month, dow, n] 3rd Sunday June
    { id: 'clocks_forward', label: 'Clocks go forward (BST begins)', lastDow: [2, 6] },
    { id: 'clocks_back', label: 'Clocks go back (GMT)', lastDow: [9, 6] },
    { id: 'remembrance_sunday', label: 'Remembrance Sunday', nthDow: [10, 6, 2] },
    { id: 'black_friday', label: 'Black Friday', nthDow: [10, 4, 4] },
  ],
  // Lunar-calendar observances: approximate Gregorian dates by year [month0, day] (1-2 day uncertainty; moon sighting). Years 2024-2030.
  LUNAR: {
    ramadan_start: { 2024: [2, 11], 2025: [2, 1], 2026: [1, 18], 2027: [1, 8], 2028: [0, 28], 2029: [0, 16], 2030: [0, 5] },
    eid_al_fitr: { 2024: [3, 10], 2025: [2, 30], 2026: [2, 20], 2027: [2, 9], 2028: [1, 26], 2029: [1, 14], 2030: [1, 4] },
    eid_al_adha: { 2024: [5, 16], 2025: [5, 6], 2026: [4, 27], 2027: [4, 16], 2028: [4, 5], 2029: [3, 24], 2030: [3, 13] },
    diwali: { 2024: [10, 1], 2025: [9, 20], 2026: [10, 8], 2027: [9, 29], 2028: [9, 17], 2029: [10, 5], 2030: [9, 26] },
    vaisakhi: { 2024: [3, 13], 2025: [3, 14], 2026: [3, 14], 2027: [3, 14], 2028: [3, 13], 2029: [3, 14], 2030: [3, 14] },
    hanukkah_start: { 2024: [11, 25], 2025: [11, 14], 2026: [11, 4], 2027: [11, 25], 2028: [11, 12], 2029: [11, 1], 2030: [11, 20] },
    chinese_new_year: { 2024: [1, 10], 2025: [0, 29], 2026: [1, 17], 2027: [1, 6], 2028: [0, 26], 2029: [1, 13], 2030: [1, 3] },
  },
};
/** Build the year's day table. */
export function buildCalendar(year = 2026) {
  const bh = bankHolidays(year), sh = schoolHolidays(year); const days = []; let doy = 0;
  // BST: last Sunday March 01:00 UTC -> last Sunday October
  const bstStart = lastDow(year, 2, 6), bstEnd = lastDow(year, 9, 6);
  const special = new Map(); const addSp = (m, d, id) => { const k = key(m, d); if (!special.has(k)) special.set(k, []); special.get(k).push(id); };
  for (const o of OBSERVANCES.fixed) if (!o.movable) addSp(o.m, o.d, o.id);
  const [em, ed] = easter(year);
  for (const r of OBSERVANCES.rule) { if (r.easterOffset !== undefined) { const [m, d] = shiftDate(year, em, ed, r.easterOffset); addSp(m, d, r.id); } else if (r.nthDow) addSp(r.nthDow[0], nthDow(year, r.nthDow[0], r.nthDow[1], r.nthDow[2]), r.id); else if (r.lastDow) addSp(r.lastDow[0], lastDow(year, r.lastDow[0], r.lastDow[1]), r.id); }
  for (const [id, byYear] of Object.entries(OBSERVANCES.LUNAR)) { const v = byYear[year]; if (v) addSp(v[0], v[1], id); }
  const eidFitr = OBSERVANCES.LUNAR.eid_al_fitr[year], ramadan = OBSERVANCES.LUNAR.ramadan_start[year];
  const ramMs = ramadan ? utc(year, ramadan[0], ramadan[1]) : null, fitrMs = eidFitr ? utc(year, eidFitr[0], eidFitr[1]) : null;
  for (let m = 0; m < 12; m++) for (let d = 1; d <= dim(year, m); d++) {
    doy++; const dow = dowOf(year, m, d); const k = key(m, d); const isBst = (m > 2 && m < 9) || (m === 2 && d >= bstStart) || (m === 9 && d < bstEnd);
    const [sr, ss] = sun(year, doy); const off = isBst ? 1 : 0; const r2 = (x) => Math.round(x * 100) / 100;
    const bank = bh.get(k) || null; const wkday = dow < 5; const holName = sh.get(k) || null;
    const schoolDay = wkday && !bank && !holName;
    const t = utc(year, m, d); const ramadanDay = ramMs !== null && fitrMs !== null && t >= ramMs && t < fitrMs;
    days.push({ doy, month: m, dom: d, dow, bankHoliday: bank, term: holName || bank ? 'holiday' : 'term', schoolDay, schoolHoliday: holName, sunrise: r2(sr + off), sunset: r2(ss + off), daylight: r2(ss - sr), bst: isBst, ramadan: ramadanDay, special: special.get(k) || [] });
  }
  return { year, days, nDays: days.length, bankHolidays: [...bh.entries()].map(([k, n]) => ({ month: Math.floor(k / 100), dom: k % 100, name: n })), weather: { regimes: WEATHER_REGIMES, seasonal: SEASONAL_WEATHER }, observances: OBSERVANCES, monthNames: MONTH_NAMES, dowNames: DOW_NAMES, weekStartsOn: 0, startDow: days[0].dow };
}
export default buildCalendar(2026);
