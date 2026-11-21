// Day-plan builder for the routine (habit) layer. buildPlan(rt, world, p, D) -> flat entries [tick, act, ptype, pid, aux]* ending with a BUILD sentinel at the next wake.
// Deterministic: all randomness is dice(personId, day, k) (stateless hash). Anchors (work, school, school run, worship, commute) are placed first, then
// weekly-rate outings are fitted into the free gaps, then home activities fill the rest. The goals package overrides via world.sys.goals.query.override(p, slot) / command routine.insert.
import { dice, clamp } from '../../population/util.js';
import { openingsFor, isOpenAt } from '../../population/venues.js';
import { A, MODE_IDX, STRIDE } from './acts.js';

const SERVICE = new Set(['retail_rota', 'evening_shift', 'nhs_shifts', 'night', 'logistics_shifts', 'taxi_hours', 'gig_flexible', 'late', 'split_shifts', 'early', 'clinic', 'flexible']);
const OWNER_OCC = new Set(['shop_owner_manager', 'cafe_owner', 'publican', 'restaurant_manager']);
export const hourToTick = (cal, D, h) => cal.dayStart(D) + Math.round(h * 6);

const uniTerm = (r) => { const m = r.month, d = r.dom; return (m === 8 && d >= 28) || m === 9 || (m === 10) || (m === 11 && d <= 11) || (m === 0 && d >= 11) || m === 1 || (m === 2 && d <= 19) || (m === 3 && d >= 26) || m === 4 || (m === 5 && d <= 11); };

/** Work for person p on day D: null (not working) | {s, e, kind, night}. Hours are floats since midnight of D (e may exceed 24). */
export function workToday(W, p, D, rec) {
  const q = p.ext.pop, rt = p.ext.rt, pack = W.pack;
  if (q.activity !== 'employed' && !(q.activity === 'student' && q.occ)) return null;
  const pat = pack.meta.patterns[q.pattern]; if (!pat) return null;
  const dow = rec.dow, week = Math.floor((D + W.rt.startDow) / 7), id = p.id;
  if (rec.bankHoliday && !SERVICE.has(q.pattern) && dice(id, D, 21) < 0.97) return null;
  if (rec.bankHoliday && SERVICE.has(q.pattern) && dice(id, D, 22) < 0.45) return null;
  if (pat.termOnly === true && !rec.schoolDay) return null;
  if (pat.termOnly === 'university' && !(uniTerm(rec) && dow < 5)) return null;
  if (dice(id, week, 11) < (rec.schoolHoliday && rec.schoolHoliday.startsWith('Summer') ? 0.16 : 0.07) && !OWNER_OCC.has(q.occ)) return null; // annual leave weeks
  if (dice(id, D, 13) < 0.009 + 0.02 * (1 - (p.health || 0.8))) { rt.sickDay = D; return null; }
  // owners follow venue opening hours
  if (OWNER_OCC.has(q.occ) && q.workplace.kind === 'onmap') {
    const v = W.map.lf.venues[q.workplace.vid]; const iv = v ? openingsFor(pack, v, dow, rec.bankHoliday) : [];
    if (!iv.length) return dow === 6 && dice(id, D, 5) < 0.6 ? null : { s: 8, e: 16, kind: 'onmap' };
    return { s: Math.max(5, iv[0][0] - 0.5), e: Math.min(29, iv[iv.length - 1][1] + 0.5), kind: 'onmap', owner: true };
  }
  // weekly on-days
  let wk = rt.wk;
  if (!wk || wk.w !== week) {
    const allowed = new Set(); for (const sh of pat.shifts) for (const d of sh.days) allowed.add(d);
    const list = [...allowed].sort((a, b) => a - b);
    let n = pat.rotation && pat.rotation.shiftsPerWeek ? pat.rotation.shiftsPerWeek : pat.rotation && pat.rotation.offDaysPerWeek ? Math.max(1, list.length - pat.rotation.offDaysPerWeek) : list.length;
    if (q.hours < 30) n = clamp(Math.round(q.hours / 7.6), 1, n); else if (q.hours > 44 && !pat.rotation) n = Math.min(list.length, n);
    const on = [0, 0, 0, 0, 0, 0, 0];
    const rank = list.map((d) => [d, pat.rotation && pat.rotation.varies ? dice(id, week, 30 + d) : (d + dice(id, 77) * 7) % 7 * 0.01 + (q.hours < 30 ? dice(id, 78, d) : d * 0.001)]).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < Math.min(n, rank.length); i++) on[rank[i][0]] = 1;
    wk = rt.wk = { w: week, on };
  }
  if (!wk.on[dow]) return null;
  const sh = pat.shifts.filter((s) => s.days.includes(dow));
  if (!sh.length) return null;
  const s0 = pat.rotation && pat.rotation.fixedPerPerson ? sh[Math.floor(dice(id, 99) * sh.length)] : sh.length === 1 ? sh[0] : sh[Math.floor(dice(id, D, 5) * sh.length)];
  if (s0.prob !== undefined && dice(id, D, 6) > s0.prob) return null;
  const j = (dice(id, 3) - 0.5) * 0.5;
  let s = s0.from + j, e = s0.to + j;
  if (q.hours < 30 && e - s > q.hours / Math.max(1, wk.on.reduce((a, b) => a + b, 0)) + 0.5) e = s + Math.max(3, q.hours / Math.max(1, wk.on.reduce((a, b) => a + b, 0)));
  if (q.workplace.kind === 'home' || (q.workplace.hybrid && !q.workplace.hybrid.includes(dow))) return { s, e, kind: 'home' };
  return { s, e, kind: q.workplace.kind, night: e > 27 || s >= 21 };
}

/** wake hour for day D (hours since midnight of D). */
export function wakeHour(W, p, D) {
  const q = p.ext.pop, rt = p.ext.rt, L = rt.life, rec = W.cal.recAt(D), prev = D > 0 ? W.cal.recAt(D - 1) : rec;
  const wk = rec.dow >= 5 || rec.bankHoliday;
  let base = wk ? L.wakeWe : L.wakeWd;
  const age = W.ageOf(p), id = p.id;
  if (rec.schoolDay && age < 16) return clamp(L.wakeKid + (dice(id, D, 1) - 0.5) * 0.4, 6, 8);
  if (q.activity === 'employed' || q.occ) {
    const w = workToday(W, p, D, rec), pw = D > 0 ? workToday(W, p, D - 1, prev) : null;
    if (pw && pw.night && pw.e > 24) return clamp(pw.e - 24 + commuteH(q) + 0.5 + 6.5 + (dice(id, D, 2) - 0.5), 12.5, 17.5);
    if (w) {
      if (w.night || w.s >= 17) return clamp(w.s - 6.2 - commuteH(q) + (dice(id, D, 2) - 0.5) * 1.2, 11, 17);
      const pre = L.prep + commuteH(q) + (age >= 16 && W.hhKidsSchool(p, rec) ? 0.5 : 0);
      return clamp(w.s - pre - 0.15 + (dice(id, D, 2) - 0.5) * 0.3, 3.8, 11);
    }
  }
  if (q.school && rec.schoolDay && age < 19) return clamp((q.school.kind === 'primary' || q.school.kind === 'nursery' ? 7.1 : 6.9) + (dice(id, D, 1) - 0.5) * 0.5, 6, 8.3);
  return clamp(base + (dice(id, D, 1) - 0.5) * 1.1, 4.5, 12.5);
}
const commuteH = (q) => (q.workplace.kind === 'offmap' ? q.workplace.mins / 60 : q.workplace.kind === 'onmap' ? 0.08 : 0);

/** bed hour (since midnight of D, may be > 24) */
function bedHour(W, p, D, rec, w) {
  const L = p.ext.rt.life, id = p.id;
  let b = (rec.dow >= 4 && rec.dow <= 5 || (rec.dow === 6 ? false : rec.bankHoliday)) ? L.bedWe : L.bedWd;
  if (w && w.night) return 99;
  b += (dice(id, D, 3) - 0.5) * 1.2;
  const nx = W.cal.recAt(D + 1), age = W.ageOf(p);
  if (age >= 16 && p.ext.pop.activity === 'employed' && (nx.dow < 5 && !nx.bankHoliday)) { const w1 = workToday(W, p, D + 1, nx); if (w1 && !w1.night) b = Math.min(b, w1.s - L.prep - commuteH(p.ext.pop) - 7.3 + 24 - 24 + (dice(id, D, 4) - 0.5) * 0.4); }
  return clamp(b, age < 5 ? 19 : 20.2, 27);
}

const ALL_OUT = ['shop', 'cafe', 'pub', 'gym', 'park', 'library', 'community', 'pharmacy', 'launderette', 'takeaway', 'visit', 'offsocial', 'family_off', 'retail_trip', 'nightout', 'barber'];

/** Build the plan for the day on which the person wakes (day D). Returns flat array. */
export function buildPlan(W, p, D, wakeTickAt) {
  const q = p.ext.pop, rt = p.ext.rt, L = rt.life, rec = W.cal.recAt(D), age = W.ageOf(p), id = p.id, cal = W.cal;
  const out = [];
  const wake = wakeHour(W, p, D);
  const wend = rec.dow >= 5 || rec.bankHoliday;
  const w = age >= 16 ? workToday(W, p, D, rec) : null;
  const sick = rt.sickDay === D && q.activity === 'employed';
  const blocks = []; // {a,b,act,pt,pid,aux}
  const add = (a, b, act, pt = 0, pid = 0, aux = 0) => { if (b - a > 0.04) blocks.push({ a, b, act, pt, pid, aux }); };
  const home = p.homeId;
  const prep = L.prep;
  const bed = bedHour(W, p, D, rec, w);
  let busyFrom = wake;
  add(wake, wake + prep, A.getup, 0, 0);
  const dest = (k) => W.destIdx[k];
  const transit = (a, b, d, mode) => add(a, b, A.commute, 4, dest(d) * 8 + MODE_IDX[mode]);
  const hasKidsHome = q.role !== 'child' && W.hhKidsSchool(p, rec);
  // ---- children / school
  if (age < 16) {
    const sc = q.school || { kind: 'home' };
    if (rec.schoolDay && sc.kind === 'primary') { const sb = W.schoolB; add(8.75 - 0.0, 15.25, A.school, 1, sb); }
    else if (rec.schoolDay && sc.kind === 'secondary') { add(7.55, 8.35, A.commute, 4, dest('secondary_school') * 8 + MODE_IDX.bus); add(8.35, 15.35, A.school, 3, dest('secondary_school')); add(15.35, 16.05, A.commute, 4, dest('secondary_school') * 8 + MODE_IDX.bus); }
    else if (!rec.bankHoliday && rec.dow < 5 && sc.kind === 'nursery') add(8.1, 17.3, A.nursery, 1, W.nurseryB);
  } else if (q.activity === 'student' && q.school && q.school.kind !== 'none' && rec.dow < 5 && !rec.bankHoliday) {
    const term = q.school.kind === 'college' ? rec.schoolDay : uniTerm(rec);
    if (term && dice(id, Math.floor(D / 7), 40 + rec.dow) < (q.school.kind === 'college' ? 0.9 : 0.62)) {
      const s = 9 + Math.floor(dice(id, D, 41) * 2.5), e = s + 3.5 + dice(id, D, 42) * 3; const mn = (q.school.kind === 'college' ? 25 : 22) / 60;
      add(s - mn, s, A.commute, 4, dest(q.school.dest) * 8 + MODE_IDX.bus); add(s, e, A.uni, 3, dest(q.school.dest)); add(e, e + mn, A.commute, 4, dest(q.school.dest) * 8 + MODE_IDX.bus);
    }
  }
  // ---- school run duty (adults with primary-age kids): morning drop & pick-up by whoever is free
  if (age >= 18 && rec.schoolDay) {
    const duty = W.schoolRun(p, D, rec);
    if (duty & 1) add(8.4, 8.95, A.school_run, 1, W.schoolB);
    if (duty & 2) add(15.1, 15.55, A.school_run, 1, W.schoolB);
  }
  // ---- work
  if (w && !sick) {
    const wp = q.workplace;
    const s = w.s, e = w.e;
    if (w.kind === 'home') { add(s, e, A.work_home, 0, 0); }
    else if (w.kind === 'onmap' && wp.bid != null) {
      const lunchAt = s + 4.2;
      if (e - s >= 6.5) { add(s, lunchAt, w.owner ? A.business : A.work, 1, wp.bid); add(lunchAt, lunchAt + 0.6, A.lunch, dice(id, D, 8) < (L.homeLunch || 0.3) ? 0 : 1, dice(id, D, 8) < (L.homeLunch || 0.3) ? 0 : wp.bid); add(lunchAt + 0.6, e, w.owner ? A.business : A.work, 1, wp.bid); }
      else add(s, e, A.work, 1, wp.bid);
    } else if (w.kind === 'offmap') {
      const mn = wp.mins / 60, d = wp.dest;
      transit(s - mn, s, d, wp.mode);
      const night = w.night || e > 24;
      if (e - s >= 6.5) { const la = s + 4.3; add(s, la, night ? A.night_work : A.work, 3, dest(d)); add(la, la + 0.6, A.lunch, 3, dest(d)); add(la + 0.6, e, night ? A.night_work : A.work, 3, dest(d)); } else add(s, e, night ? A.night_work : A.work, 3, dest(d));
      transit(e, e + mn, d, wp.mode);
    }
  } else if (sick) add(wake + prep, wake + prep + 14, A.sick, 0, 0);
  // ---- unpaid non-work activity anchors
  if (age >= 16 && !w) {
    if (q.activity === 'unemployed' && !wend && dice(id, D, 50) < 0.5) add(10, 11.2, A.jobsearch, 0, 0);
    if (q.activity === 'sick_disabled' && !wend && dice(id, D, 51) < 0.25) add(10.2, 11.0, A.errand, 1, W.gpB);
    if (q.activity === 'home_family' && hasKidsHome === false && dice(id, D, 52) < 0.2 && age > 55) add(11, 13, A.carer, 0, 0);
  }
  // ---- worship anchors
  const rel = q.religion, wb = L.fav.worship;
  if (age >= 8 && q.religiosity > 0.35 && wb != null) {
    if (rel === 'Christian' && rec.dow === 6 && dice(id, D, 60) < q.religiosity * 0.85) add(10, 11.3, A.worship, 1, wb);
    else if (rel === 'Muslim' && rec.dow === 4 && p.sex === 'M' && age >= 12 && (!w || w.kind !== 'offmap') && dice(id, D, 60) < q.religiosity * 0.9) add(13.0, 14.0, A.worship, 1, wb);
    else if (rel === 'Muslim' && rec.dow === 6 && dice(id, D, 61) < q.religiosity * 0.3) add(10, 11.5, A.worship, 1, wb);
    else if ((rel === 'Hindu' || rel === 'Sikh') && rec.dow === 6 && dice(id, D, 60) < q.religiosity * 0.5) { const d = dest('hindu_temple_gurdwara'); add(10, 10.5, A.commute, 4, d * 8 + (q.car ? MODE_IDX.drive : MODE_IDX.bus)); add(10.5, 12.3, A.worship, 3, d); add(12.3, 12.8, A.commute, 4, d * 8 + (q.car ? MODE_IDX.drive : MODE_IDX.bus)); }
  }
  const fixed = blocks.filter((b) => true).sort((x, y) => x.a - y.a);
  // resolve overlaps among anchors (keep earlier-starting; trim later)
  const tl = []; let cur = wake;
  for (const b of fixed) { if (b.b <= cur) continue; if (b.a < cur) b.a = cur; tl.push(b); cur = b.b; }
  // ---- outings (weekly-rate sampling), placed into free gaps
  const kidsHomeOnly = age < 12;
  const wishes = [];
  const lv = L.lv;
  const dayF = wend ? 1.55 : 0.8, mild = rec.regime === 'rain' ? 0.8 : 1;
  const rain = 1;
  const want = (kind, rate, a, b, dur, opts = {}) => { if (rate <= 0) return; if (dice(id, D, 100 + wishes.length + kind.length) > clamp(rate / 7 * dayF * (opts.noDay ? 1 : mild), 0, 0.92)) return; const s = a + dice(id, D, 200 + kind.length) * Math.max(0, b - a - dur); wishes.push({ kind, a: s, dur, opts }); };
  if (!sick && age >= 5) {
    const night = w && w.night;
    const eve = [17.5, 22.5];
    if (age >= 16 && !night) {
      want('shop', lv.shop, wend ? 9.5 : 16.5, wend ? 18 : 20.5, 0.4 + dice(id, D, 5) * 0.3);
      want('cafe', lv.cafe, 9, 16.5, 0.9 + dice(id, D, 6) * 0.8);
      want('pub', lv.pub, wend ? 13 : 17.5, wend ? 23 : 22.5, 1.4 + dice(id, D, 7) * 1.8);
      want('gym', lv.gym, wend ? 9 : 17.5, wend ? 17 : 21, 1.1);
      want('library', lv.library, 10, 16.5, 0.8); want('community', lv.community, 10, 16, 1.5); want('pharmacy', lv.pharmacy, 9.5, 17.5, 0.3); want('launderette', lv.launderette, 9, 19, 1.2);
      want('takeaway', lv.takeaway, 17.5, 21.5, 0.35); want('barber', lv.barber, 10, 17.5, 0.8);
      if (L.dog) want('park', 5, 6.8, 8.6, 0.6, { dog: true, noDay: true });
      want('park', lv.park * (L.dog ? 0.6 : 1), wend ? 9.5 : 16.5, wend ? 17 : 19.5, 0.7 + dice(id, D, 9) * 0.9);
      want('visit', lv.visit, wend ? 12 : 18, wend ? 21 : 21.5, 1.8 + dice(id, D, 10) * 2);
      want('offsocial', lv.offsocial * (wend ? 1 : 0.5), wend ? 12 : 18.5, wend ? 18.5 : 21.5, 3.5 + dice(id, D, 11) * 2);
      want('nightout', lv.nightout * (rec.dow === 4 || rec.dow === 5 ? 2.2 : rec.dow === 3 ? 0.9 : 0.15), 20, 23, 4 + dice(id, D, 12) * 2, { noDay: true });
      if (wend) { want('family_off', lv.family, 11, 15, 5 + dice(id, D, 13) * 2); want('retail_trip', lv.retail, 11, 16, 3.2); }
    } else if (age >= 12 && age < 16) {
      want('park', 3.5, wend ? 11 : 16, wend ? 18 : 19, 1.2); want('shop', 1.5, wend ? 11 : 15.8, 18, 0.4); want('visit', 1.6, wend ? 11 : 16.5, 19.5, 2); if (wend) want('offsocial', 0.6, 12, 17, 3.5);
    } else { want('park', 4 * (wend ? 1.3 : 1), wend ? 9.5 : 16, wend ? 16 : 18, 1.0); want('visit', 1.2, wend ? 11 : 16.3, 18, 1.6); }
  }
  wishes.sort((x, y) => x.a - y.a);
  const placed = []; // [a,b,block]
  const gaps = () => { const g = []; let c = wake; for (const b of tl) { if (b.a > c) g.push([c, b.a]); c = Math.max(c, b.b); } g.push([c, bed]); return g; };
  const homeD = W.hdist; // not used
  for (const wsh of wishes) {
    const blk = W.makeOuting(p, D, rec, wsh, L, q);
    if (!blk) continue;
    const tot = blk.tripBefore + blk.dur + blk.tripAfter;
    for (const [g0, g1] of gaps()) {
      let a = Math.max(wsh.a - blk.tripBefore, g0 + 0.1);
      if (a + tot > g1 - 0.1) { if (g1 - g0 - 0.2 >= tot && a > g0 + 0.1) a = g1 - 0.1 - tot; else continue; }
      if (a < g0 + 0.05) continue;
      const parts = []; let t = a;
      if (blk.tripBefore) { parts.push({ a: t, b: t + blk.tripBefore, act: A.commute, pt: 4, pid: blk.tripId, aux: 0 }); t += blk.tripBefore; }
      parts.push({ a: t, b: t + blk.dur, act: blk.act, pt: blk.pt, pid: blk.pid, aux: blk.aux || 0 }); t += blk.dur;
      if (blk.tripAfter) parts.push({ a: t, b: t + blk.tripAfter, act: A.commute, pt: 4, pid: blk.tripId, aux: 0 });
      for (const b of parts) tl.push(b); tl.sort((x, y) => x.a - y.a); break;
    }
  }
  // ---- fill gaps with home activity; the final sleep block
  const final = [];
  let c = wake;
  const fill = (g0, g1) => {
    let t = g0;
    while (g1 - t > 0.04) {
      let act, len;
      const h = t % 24;
      const ev = h >= 19.3;
      if (bed - t < 0.75 && g1 >= bed - 0.01) { add2(t, g1, A.bedtime); break; }
      if (h < 9.4 && t - wake < 2.2 && h >= 5) { act = A.breakfast; len = 0.45; }
      else if (h >= 12 && h < 13.8 && !final.some((b) => b.act === A.lunch && b.a > t - 3)) { act = A.lunch; len = 0.6; }
      else if (h >= 17.3 && h < 19.8 && !final.some((b) => b.act === A.dinner && b.a > t - 4)) { act = A.dinner; len = 1.0; }
      else act = null;
      if (act === null) act = pickHome(W, p, rec, h, age, wend, ev, D, final.length, q);
      len = len || (act === A.nap ? 1.0 : (kidsHomeOnly ? 1.3 : 1.2 + dice(id, D, 300 + final.length) * 1.3));
      if (g1 - (t + len) < 0.5) len = g1 - t;
      add2(t, Math.min(g1, t + len), act); t += len;
    }
  };
  const add2 = (a, b, act) => { if (b - a > 0.02) final.push({ a, b, act, pt: act === A.nap && false ? 0 : 0, pid: 0, aux: 0 }); };
  const parts = []; // merged timeline
  c = wake;
  for (const b of tl) { if (b.a > c) { fill(c, b.a); } parts.push(...final.splice(0)); parts.push(b); c = Math.max(c, b.b); }
  fill(c, Math.max(c, bed)); parts.push(...final.splice(0));
  parts.sort((x, y) => x.a - y.a);
  // ---- emit entries; dedupe contiguous same-state
  const nextWake = wakeHour(W, p, D + 1) + 24;
  const night = w && w.night && !sick;
  let t0 = hourToTick(cal, D, wake);
  if (parts.length && wakeTickAt !== undefined) t0 = wakeTickAt;
  const e = [];
  let lastKey = '';
  for (const b of parts) {
    const k = b.act + ':' + b.pt + ':' + b.pid; const tk = Math.max(hourToTick(cal, D, b.a), (e.length ? e[e.length - STRIDE] + 1 : t0));
    if (k === lastKey) continue; lastKey = k;
    e.push(tk, b.act, b.pt, b.pid, b.aux || 0);
  }
  const lastEnd = parts.length ? parts[parts.length - 1].b : wake;
  const slAct = night || (w === null && false) ? A.sleep_day : (w && w.night ? A.sleep_day : A.sleep);
  const sleepStart = Math.max(lastEnd, bed >= 99 ? lastEnd : bed);
  const nextTick = Math.max(hourToTick(cal, D, nextWake), (e.length ? e[e.length - STRIDE] : t0) + 2);
  const nextW = hourToTick(cal, D + 1, wakeHour(W, p, D + 1));
  const endTick = Math.max(nextW, e.length ? e[e.length - STRIDE] + 2 : t0 + 2);
  const prevNight = false;
  const sleepAct = w && w.night ? A.sleep_day : A.sleep;
  e.push(Math.max(hourToTick(cal, D, sleepStart), (e.length ? e[e.length - STRIDE] + 1 : t0)), A.sleep, 0, 0, 0);
  // sleep after a night shift is labelled as day sleep
  const sa = e.length - STRIDE; const pwN = e[sa] < endTick; if (e[sa] >= endTick) e.length = sa + 0;
  if (e.length && e[e.length - STRIDE + 1] === A.sleep && W.isDaySleep(p, D, e[e.length - STRIDE])) e[e.length - STRIDE + 1] = A.sleep_day;
  e.push(Math.max(endTick, (e.length ? e[e.length - STRIDE] + 1 : t0 + 1)), A.build, 0, 0, 0);
  return e;
}

const HOME_W = {
  child: [['play', 3], ['tv', 2], ['gaming', 1], ['childcare', 0]],
  teen: [['gaming', 3], ['phone', 3], ['tv', 2], ['homework', 2], ['online', 2]],
  adult: [['tv', 2.5], ['phone', 2], ['chores', 3.2], ['rest', 1.5], ['gaming', 0.8], ['cook', 0.8], ['online', 1]],
};
function pickHome(W, p, rec, h, age, wend, ev, D, k, q) {
  const id = p.id, r = dice(id, D, 400 + k);
  if (age < 12) { if (h < 17 && !wend && rec.schoolDay) return A.play; const l = HOME_W.child; return pickW(l, r); }
  if (age < 16) { if (!wend && h >= 16 && h < 19.3 && dice(id, D, 410 + k) < 0.7) return A.homework; return pickW(HOME_W.teen, r); }
  const L = p.ext.rt.life;
  if (q.activity === 'student' && h >= 10 && h < 19 && !wend && dice(id, D, 411 + k) < 0.5) return A.study;
  if (age >= 66 && h >= 13.8 && h < 16.2 && r < 0.4) return A.nap;
  if (h >= 14 && h < 17 && q.activity === 'employed' && r < 0.04) return A.nap;
  if (p.ext.pop.pets && p.ext.pop.pets.dogs && h > 8 && h < 18 && r < 0.0) return A.park;
  if (q.hhKids && h >= 17.2 && h < 20.2 && r < 0.45) return A.childcare;
  if (q.hhKids && h >= 7 && h < 18 && r < 0.45 && wend) return A.childcare;
  if (!wend && q.hhKids && h >= 7 && h < 18 && q.activity === 'home_family') return pickW([['chores', 4], ['childcare', 2], ['tv', 1.5], ['phone', 1.5], ['rest', 1]], r);
  if (h >= 8 && h < 13 && wend && r < 0.25) return A.chores;
  if (q.activity === 'retired' && h < 17 && r < 0.18) return A.garden;
  if (q.activity === 'retired' && r < 0.3) return A.tv;
  const w = HOME_W.adult.map(([a, x]) => [a, x * (a === 'gaming' ? (age < 35 ? 1.6 : 0.4) : a === 'chores' ? (h < 12 ? 1.4 : 1) : a === 'cook' ? 0 : a === 'tv' ? (ev ? 2 : 0.9) : a === 'online' ? (L.digital ? 1.3 : 0.6) : 1)]);
  return pickW(w, r);
}
function pickW(list, r) { let t = 0; for (const [, w] of list) t += w; r *= t; for (const [a, w] of list) { r -= w; if (r <= 0) return A[a]; } return A[list[0][0]]; }
