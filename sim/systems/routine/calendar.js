// Real-calendar clock for Larkfield worlds. 1 tick = 10 min, tick 0 = `start` (default Mon 7 Sep 2026 00:00, autumn term).
// Provides the World `calendar` hook ({timeOf, weekStart, monthStart, yearStart, ticksPerYear, formatDate...}) and day records from the pack calendar
// (bank holidays, school terms, sunrise/sunset, BST, observances). Pure and deterministic (Date.UTC arithmetic only).
import { buildCalendar, MONTH_NAMES, DOW_NAMES } from '../../../content/larkfield/calendar.js';

export const TPD = 144, TPH = 6, TICKS_PER_YEAR_REAL = Math.round(365.25 * TPD);
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const seasonOfMonth = (m) => (m >= 2 && m <= 4 ? 0 : m >= 5 && m <= 7 ? 1 : m >= 8 && m <= 10 ? 2 : 3);
const dayMs = 86400000;

export function makeCalendar(opts = {}) {
  const start = opts.start || { y: 2026, m: 8, d: 7, hour: 0 }; // m = month 0-11
  const startMs = Date.UTC(start.y, start.m, start.d);
  const off = Math.round((start.hour || 0) * TPH);
  const tables = new Map();
  const yearTable = (y) => { let t = tables.get(y); if (!t) { t = buildCalendar(y); tables.set(y, t); } return t; };
  const byIdx = new Map(); // dayIdx (days since start date; may be negative) -> day record (+ year, dayIdx)
  const dateOfIdx = (i) => { const d = new Date(startMs + i * dayMs); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
  const fill = (y) => { for (const r of yearTable(y).days) { const i = Math.round((Date.UTC(y, r.month, r.dom) - startMs) / dayMs); byIdx.set(i, { ...r, year: y, dayIdx: i }); } };
  const recAt = (i) => { let r = byIdx.get(i); if (r === undefined) { fill(dateOfIdx(i)[0]); r = byIdx.get(i); } return r; };
  const cal = {
    start, startMs, ticksPerYear: TICKS_PER_YEAR_REAL, recAt, yearTable, MONTH_NAMES, DOW_NAMES,
    dayStart: (idx) => idx * TPD - off,
    dayIdxOf: (tick) => Math.floor((tick + off) / TPD),
    /** day record for a tick (cheap: array lookup). */
    recOfTick: (tick) => recAt(Math.floor((tick + off) / TPD)),
    timeOf(tick, out = {}) {
      const t = tick + off, d = Math.floor(t / TPD), tod = t - d * TPD;
      out.tick = tick; out.hour = (tod / TPH) | 0; out.minute = (tod % TPH) * 10; out.hourFloat = tod / TPH;
      if (out._d !== d) {
        const r = recAt(d);
        out._d = d; out.dayAbs = d; out.rec = r; out.dayOfYear = r.doy - 1; out.month = r.month; out.dom = r.dom; out.dow = r.dow; out.weekday = r.dow; out.restDay = r.dow === 6;
        out.season = seasonOfMonth(r.month); out.seasonName = SEASONS[out.season];
        let s0 = r.month; while (s0 > 0 && seasonOfMonth(s0 - 1) === out.season) s0--;
        let dd = r.dom; for (let m = s0; m < r.month; m++) dd += [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m] + (m === 1 && r.doy > 59 && ((r.year % 4 === 0 && r.year % 100 !== 0) || r.year % 400 === 0) ? 1 : 0);
        out.dayOfSeason = dd; out.year = r.year;
        out.bankHoliday = r.bankHoliday; out.schoolDay = r.schoolDay; out.sunrise = r.sunrise; out.sunset = r.sunset;
      }
      return out;
    },
    weekStart: (t) => t.dow === 0, monthStart: (t) => t.dom === 1, yearStart: (t) => t.dayOfYear === 0,
    /** {y, m(0-11), d, dow, hour, minute} of a tick (works for negative ticks = history). */
    dateOf(tick) { const t = tick + off, d = Math.floor(t / TPD), tod = t - d * TPD; const [y, m, dd] = dateOfIdx(d); return { y, m, d: dd, dow: (new Date(startMs + d * dayMs).getUTCDay() + 6) % 7, hour: (tod / TPH) | 0, minute: (tod % TPH) * 10 }; },
    /** tick of a calendar date (hour 0). */
    tickOf(y, m, d, hour = 0) { return Math.round((Date.UTC(y, m, d) - startMs) / dayMs) * TPD - off + Math.round(hour * TPH); },
    formatDate(tick) { const x = cal.dateOf(tick); return `${DOW_NAMES[x.dow].slice(0, 3)} ${x.d} ${MONTH_NAMES[x.m].slice(0, 3)} ${x.y}`; },
    formatDateTime(tick) { const x = cal.dateOf(tick); return `${cal.formatDate(tick)} ${String(x.hour).padStart(2, '0')}:${String(x.minute).padStart(2, '0')}`; },
    /** month-year only, for biography ("Jun 2014"). */
    formatMonth(tick) { const x = cal.dateOf(tick); return `${MONTH_NAMES[x.m].slice(0, 3)} ${x.y}`; },
  };
  return cal;
}
export default makeCalendar;
