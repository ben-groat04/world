// Labour helpers: sectors, promotion ladders, qualification ranks, job drawing and workplace construction. Pure data + functions of (world, rng, person).
import { clamp } from '../money/util.js';
export const QRANK = { in_school: 0, none: 0, level1: 1, level2: 2, apprenticeship: 2.5, level3: 3, level4plus: 4, other: 2 };
export const LADDER = {
  retail_assistant: ['shop_supervisor', 'store_manager'], shop_supervisor: ['store_manager'], barista_waiter: ['restaurant_manager'], bar_staff: ['publican'], kitchen_porter_cook: ['cook_chef'], cook_chef: ['restaurant_manager'],
  admin_clerk: ['bookkeeper_pa', 'operations_manager'], bookkeeper_pa: ['accountant_finance'], it_support_technician: ['software_engineer'], software_engineer: ['senior_manager'], hr_finance_associate: ['accountant_finance'],
  healthcare_assistant: ['nurse'], nurse: ['allied_health'], care_worker: ['social_worker'], warehouse_picker: ['operations_manager'], teaching_assistant: ['primary_teacher'], accountant_finance: ['senior_manager'],
  nursery_practitioner: ['nursery_manager'], receptionist: ['practice_manager'], electrician_plumber: ['small_business_owner'], builder_labourer_trades: ['electrician_plumber'],
};
const DEST_SECTOR = { city_centre_offices: 'office', business_park: 'office', teaching_hospital: 'health', secondary_school: 'education', university: 'education', industrial_estate: 'trades_industry', logistics_park: 'logistics', airport: 'logistics', city_centre_retail_leisure: 'retail_hospitality', retail_park: 'retail_hospitality', other_neighbourhood: 'care' };
const TEMPLATE_SECTOR = { cafe: 'retail_hospitality', pub: 'retail_hospitality', takeaway: 'retail_hospitality', restaurant: 'retail_hospitality', gp_surgery: 'health', pharmacy: 'health', dentist: 'health', primary_school: 'education', nursery: 'education' };
export const sectorOfOcc = (o) => (!o ? 'none' : o.where === 'home' ? 'self_employed' : o.where === 'onmap' ? (o.id.match(/teacher|school|nursery|teaching/) ? 'education' : o.id.match(/gp|nurse|pharm|dental|dentist|practice/) ? 'health' : 'retail_hospitality') : DEST_SECTOR[o.dest] || 'office');
export const SECTORS = ['office', 'health', 'education', 'trades_industry', 'logistics', 'retail_hospitality', 'care', 'self_employed'];
export const sectorOfBuilding = (w, b) => { const t = b.lf && b.lf.template; return TEMPLATE_SECTOR[t] || 'retail_hospitality'; };

const logn = (rng, p10, med, p90) => med * Math.exp(rng.gauss(0, Math.max(0.05, Math.log(p90 / p10) / (2 * 1.2816))));
const wpick = (rng, entries) => { let t = 0; for (const e of entries) t += e[1]; if (t <= 0) return null; let r = rng.next() * t; for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; } return entries[entries.length - 1][0]; };
const SOC_BY_EDU = { 4: { 1: 2, 2: 2.6, 3: 2.2, 4: 0.8, 5: 0.3, 6: 0.3, 7: 0.4, 8: 0.1, 9: 0.1 }, 3: { 1: 0.8, 2: 0.8, 3: 1.4, 4: 1.3, 5: 1.1, 6: 1, 7: 1, 8: 0.5, 9: 0.5 }, 2: { 1: 0.3, 2: 0.2, 3: 0.7, 4: 1.2, 5: 1.4, 6: 1.5, 7: 1.5, 8: 1.3, 9: 1 }, 1: { 1: 0.1, 2: 0.05, 3: 0.2, 4: 0.8, 5: 1, 6: 1.5, 7: 1.5, 8: 1.8, 9: 2 }, 0: { 1: 0.05, 2: 0.02, 3: 0.1, 4: 0.5, 5: 0.7, 6: 1.3, 7: 1.4, 8: 2, 9: 3 } };
const socTilt = (edu) => SOC_BY_EDU[Math.min(4, Math.max(0, Math.round(QRANK[edu] ?? 2)))] || SOC_BY_EDU[2];

/** Pick an occupation for person p. opts: {prior: occId, hasVacancy(occId)->bool, onlyOffmap}. Returns occupation object or null. */
export function drawOccupation(w, rng, p, opts = {}) {
  const pack = w.pack, OCC = occMap(w), q = p.ext.pop, age = w.ageOf(p), tilt = socTilt(q.edu), base = pack.calibration.occupationSOC.composite;
  const prior = opts.prior ? OCC[opts.prior] : null;
  for (let tries = 0; tries < 8; tries++) {
    let soc;
    if (prior && rng.chance(0.62)) soc = prior.soc;
    else soc = wpick(rng, Object.keys(pack.meta.socGroups).map((k) => [+k, (base[pack.meta.socGroups[k]] || 0.1) * (tilt[k] ?? 1)]));
    const pool = Object.entries(pack.meta.socToOcc[soc] || {}).map(([id, wt]) => {
      const o = OCC[id]; if (!o || o.studentOnly) return [id, 0];
      let x = wt;
      if (prior && id === prior.id) x *= 6;
      if (o.age && (age < o.age[0] - 1 || age > o.age[1] + 2)) x *= 0.05;
      if (QRANK[q.edu] < (QRANK[o.qual] ?? 0) - 0.5) x *= 0.08;
      if (o.where === 'onmap') { if (opts.onlyOffmap || !(opts.hasVacancy && opts.hasVacancy(id))) x = 0; else x *= 1.5; }
      if (['shop_owner_manager', 'cafe_owner', 'publican', 'gp', 'dentist', 'headteacher'].includes(id)) x *= 0.02;
      if (o.gig && age > 55) x *= 0.2;
      return [id, x];
    });
    const id = wpick(rng, pool); if (id) return OCC[id];
  }
  return OCC.retail_city;
}
export const occMap = (w) => w._occ || (w._occ = Object.fromEntries(w.pack.jobs.map((o) => [o.id, o])));
const COMMUTE_KEY = { drive: 'drive', rail: 'rail', bus: 'bus', cycle: 'cycle', walk: 'walk' };
export function commuteMode(w, rng, p, dest) {
  const hh = w.lf.households[p.ext.pop.hh], seg = w.pack.meta.segments.find((s) => s.id === p.ext.pop.seg), mm = seg.mobility, dm = dest.minutes, hasCar = p.ext.pop.car;
  const cand = [];
  if (dm.drive && hasCar) cand.push(['drive', 0.1 + mm.car * 3]);
  if (dm.rail) cand.push(['rail', (hasCar ? 0.3 : 1.0) * (0.4 + 1.2 * (1 - mm.car)) * (dm.rail <= 30 ? 1.2 : 0.3)]);
  if (dm.bus) cand.push(['bus', (hasCar ? 0.15 : 1.2) * (0.3 + mm.bus * 2)]);
  if (dm.cycle) cand.push(['cycle', (p.ext.pop.bike ? 1 : 0.05) * (0.2 + mm.bike * 6) * (dm.cycle <= 25 ? 1 : 0.3)]);
  if (dm.walk) cand.push(['walk', 0.4]);
  if (!cand.length) cand.push(['bus', 1]);
  void hh; return wpick(rng, cand);
}
/** Fill job fields on p.ext.pop for occupation o (offmap/home). Onmap workplace is set by the caller (slot). Returns the workplace. */
export function offmapWorkplace(w, rng, p, o) {
  if (o.where === 'home') return { kind: 'home', mode: null, mins: 0 };
  const dest = w.pack.meta.offmap[o.dest], mode = commuteMode(w, rng, p, dest), mins = Math.round((dest.minutes[COMMUTE_KEY[mode]] || 25) * rng.float(0.85, 1.25) + (mode === 'rail' || mode === 'bus' ? 8 : 3));
  const remote = o.pattern === 'remote' || rng.chance((o.remote || 0) * 0.5);
  const wp = { kind: remote ? 'home' : 'offmap', dest: o.dest, mode, mins, hybrid: o.pattern === 'office_hybrid' ? (rng.chance(0.55) ? [1, 2, 3] : [0, 1, 2, 3].filter(() => rng.chance(0.7)).concat(rng.chance(0.4) ? [4] : [])) : null };
  if (wp.hybrid && wp.hybrid.length === 0) wp.hybrid = [2];
  return wp;
}
export function hoursFor(rng, o, p, hh, w) {
  const [lo, typ, hi] = o.hours, age = w.ageOf(p);
  const ptp = (o.partTime || 0) + (hh && hh.seg === 'lone_parents' ? 0.25 : 0) + (age >= 60 ? 0.3 : 0) + (age < 22 ? 0.2 : 0);
  if (lo < 30 && rng.chance(clamp(ptp, 0, 0.85))) return Math.round(clamp(rng.gauss((lo + Math.min(typ, 28)) / 2 + 4, 4), Math.max(6, lo), 29));
  return Math.round(clamp(rng.gauss(Math.max(typ, 30), 3), Math.max(30, lo), hi));
}
export function contractFor(rng, o, hh) {
  if (o.gig) return 'gig'; if (rng.chance(o.selfEmployed || 0)) return 'self_employed';
  const sh = o.soc >= 6 ? 0.07 : 0;
  return rng.chance(0.06 + (o.partTime ? 0.08 : 0) + sh) ? 'zero_hours' : rng.chance(0.07) ? 'fixed_term' : 'permanent';
}
export function payFor(w, rng, p, o, macro, priorPay, samePrior) {
  const age = w.ageOf(p), exp = clamp(0.8 + 0.2 * (age - 20) / 10, 0.78, 1.18), z = ((p.personality ? p.personality.conscientiousness : 0.5) - 0.5) * 0.12 + (((p.skills && p.skills.digital) || 0.5) - 0.5) * 0.06;
  if (samePrior && priorPay) return Math.round(priorPay * rng.float(0.95, 1.12));
  return Math.round(logn(rng, o.pay.p10, o.pay.median, o.pay.p90) * exp * (age < 22 ? 0.9 : 1) * (1 + z) * macro.wage);
}
