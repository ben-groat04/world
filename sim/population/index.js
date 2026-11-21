// Larkfield founding population: segments x household archetypes x calibration -> ~250 households placed in the generated map's dwellings, people with
// personality / drives / skills / health / education / occupation / money, then pre-history (bio.js) and the social network incl. off-map life (network.js).
//   populate(world, rng)  — the World `populate` hook (runs inside the World constructor; world.calendar, world.map, world.pack must be set).
// Everything person-level the routine layer / goals / social / housing / labour packages need lives under p.ext.pop (see PERSON RECORD below) and world.lf.
//
// PERSON RECORD  p.ext.pop = { hh, unit, seg, role, eth, sub, bornUK, birthplace, arrived (tick|null), religion, religiosity, activity('employed'|'student'|'retired'|'unemployed'|'home_family'|'sick_disabled'|'other_inactive'|'child'),
//   occ (occupation id|null), soc, contract, hours (paid h/wk), pay (gross FTE £/yr), edu, workplace{kind:'onmap'|'offmap'|'home'|'none', bid, dest, mode, mins, hybrid[], flex}, pattern, school{kind,bid|dest}, health{general,conds,disabled,limiting},
//   fin{gross,net,benefits,savings,debt,arrears,studentLoan,spend}, car (drives), bike, pets, drives{}, interests[], life{chrono,wake,bed,lv{},fav{},sociability,homebody}, yearsAtAddress, grewUp, ties[] }
//   world.lf = { households:[{id,unit,bid,seg,arch,members[],tenure,rentPcm,mortgagePcm,income,cars,dogs,cats,since}], metro:[{id,name,age,sex,rel,where,how,owner,freq}], slots, stats }
import NAMES from '../../content/larkfield/names.js';
import { clamp, clamp01, wpick, wpickObj, logn, netFromGross, ageBand, pcm } from './util.js';
import { planHouseholds, composeHousehold } from './households.js';
import { personalityFor, drivesFor, skillsFor, interestsFor, healthFor, savingsFor } from './persona.js';
import { buildNetwork } from './network.js';
import { writeBiographies } from './bio.js';
import { venueStaff } from './venues.js';

const GROUPS = ['white_british', 'other_white', 'indian', 'pakistani', 'bangladeshi', 'chinese', 'other_asian', 'african', 'caribbean', 'mixed', 'other'];
const ETH_TILT = {
  older_longterm: { white_british: 2.1, caribbean: 1.6, other_white: 0.6, pakistani: 0.5, bangladeshi: 0.4, african: 0.3, chinese: 0.5 },
  family_couples: { pakistani: 1.7, bangladeshi: 1.6, indian: 1.3, african: 1.1, white_british: 0.85 },
  lone_parents: { caribbean: 1.8, white_british: 1.25, mixed: 1.6, african: 1.1, chinese: 0.3, indian: 0.6 },
  students: { chinese: 3.5, indian: 1.6, other_asian: 1.4, white_british: 0.8, caribbean: 0.5, pakistani: 0.8 },
  young_sharers: { white_british: 1.2, other_white: 1.6, mixed: 1.4, caribbean: 0.7, pakistani: 0.6, bangladeshi: 0.4 },
  early_career: { white_british: 1.1, other_white: 1.3, indian: 1.4, chinese: 1.5, mixed: 1.2, pakistani: 0.7 },
  settled_professionals: { white_british: 1.35, indian: 1.5, other_white: 1.0, mixed: 1.3, pakistani: 0.7, bangladeshi: 0.4, african: 0.8 },
  shift_workers: { african: 1.5, white_british: 0.95, caribbean: 1.2, pakistani: 1.0, other_white: 1.1 },
  recent_arrivals: { white_british: 0.02, other_white: 3.5, african: 2.2, other_asian: 2.5, bangladeshi: 1.4, pakistani: 1.2, indian: 1.6, chinese: 1.4, other: 2.5, caribbean: 0.1, mixed: 0.1 },
  local_business_families: { pakistani: 2.6, indian: 2.2, bangladeshi: 1.4, other: 1.5, other_asian: 1.4, white_british: 0.45, caribbean: 0.4 },
  benefit_dependent: { white_british: 1.4, caribbean: 1.3, other_white: 0.7, indian: 0.5, chinese: 0.3, african: 0.9 },
};
// SOC multipliers by segment (applied to calibration.occupationSOC shares when drawing an employed person's SOC group)
const SOC_TILT = {
  older_longterm: { 1: 0.9, 2: 0.7, 3: 0.7, 4: 1.2, 5: 1.2, 6: 1.3, 7: 1.0, 8: 1.2, 9: 1.4 },
  family_couples: { 1: 1, 2: 1, 3: 1, 4: 1.1, 5: 1, 6: 1.1, 7: 1, 8: 1, 9: 0.9 },
  lone_parents: { 1: 0.3, 2: 0.5, 3: 0.6, 4: 1.4, 5: 0.5, 6: 2.0, 7: 1.8, 8: 0.5, 9: 1.5 },
  students: { 1: 0.1, 2: 0.3, 3: 0.4, 4: 0.5, 5: 0.2, 6: 1.5, 7: 2.0, 8: 0.1, 9: 2.0 },
  young_sharers: { 1: 0.3, 2: 1.7, 3: 1.6, 4: 1.1, 5: 0.7, 6: 1.1, 7: 1.4, 8: 0.5, 9: 0.9 },
  early_career: { 1: 0.8, 2: 2.0, 3: 1.8, 4: 1.0, 5: 0.5, 6: 0.5, 7: 0.8, 8: 0.3, 9: 0.4 },
  settled_professionals: { 1: 2.4, 2: 2.6, 3: 1.6, 4: 0.5, 5: 0.3, 6: 0.3, 7: 0.3, 8: 0.1, 9: 0.1 },
  shift_workers: { 1: 0.2, 2: 0.5, 3: 0.4, 4: 0.5, 5: 1.2, 6: 3.0, 7: 1.5, 8: 3.0, 9: 2.5 },
  recent_arrivals: { 1: 0.3, 2: 0.6, 3: 0.4, 4: 0.5, 5: 1.6, 6: 2.0, 7: 1.0, 8: 1.8, 9: 3.0 },
  local_business_families: { 1: 3, 2: 0.3, 3: 0.4, 4: 0.5, 5: 1.0, 6: 1, 7: 1, 8: 0.5, 9: 0.5 },
  benefit_dependent: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.8, 5: 0.9, 6: 1.5, 7: 1.4, 8: 1.5, 9: 3.0 },
};
const SHIFTY = new Set(['nhs_shifts', 'logistics_shifts', 'night', 'evening_shift', 'late', 'early', 'retail_rota', 'taxi_hours', 'gig_flexible', 'split_shifts']);
const OWNER_OCC = { corner_shop: 'shop_owner_manager', ethnic_grocer: 'shop_owner_manager', small_supermarket: null, bakery: 'baker', off_licence: 'shop_owner_manager', cafe: 'cafe_owner', pub: 'publican', takeaway: 'kitchen_porter_cook', restaurant: 'restaurant_manager', barber: 'barber_hairdresser', salon: 'barber_hairdresser', launderette: 'launderette_attendant', money_phone: 'retail_assistant' };
const UK_PLACES = ['Larkfield (this neighbourhood)', 'elsewhere in the city', 'a nearby town', 'a town in the north', 'a Midlands town', 'London', 'a small town in Wales', 'Scotland', 'the south coast', 'a village in the countryside', 'another northern city'];

export function populate(world, rng) {
  const pack = world.pack, M = world.map.lf, cal = pack.calibration, cl = world.calendar, TAX = pack.meta.tax, BEN = pack.meta.benefits;
  const SEG = Object.fromEntries(pack.meta.segments.map((s) => [s.id, s]));
  const OCC = Object.fromEntries(pack.jobs.map((o) => [o.id, o]));
  const lf = world.lf = { households: [], metro: [], slots: [], stats: {}, ver: 1 };
  if (!world.stateKeys.includes('lf')) world.stateKeys.push('lf');
  world.popQuery = { // read-only helpers for other packages (goals/housing/labour/social): world.popQuery.household(p) etc.
    household: (p) => world.lf.households[p.ext.pop.hh], ties: (p) => p.ext.pop.ties, metro: (id) => world.lf.metro.find((m) => m.id === id) || null,
    venueStaff: (bid) => (world.buildings.get(bid) || { lf: { staff: [] } }).lf.staff, venues: () => world.map.lf.venues,
  };
  const T0 = world.tick;
  const units = M.units.filter((u) => u.kind !== 'venue' && !u.vacant);
  const specs = planHouseholds(rng, pack, units);
  specs.sort((a, b) => a.unit.id - b.unit.id);
  const hhs = specs.map((s, i) => ({ id: i, spec: s, unit: s.unit, seg: s.seg, arch: s.arch, members: composeHousehold(rng, pack, s) }));

  // ---------- on-map job slots (venue staff; filled by residents with on-map occupations) ----------
  for (const v of M.venues) for (const st of venueStaff(pack, v)) { const n = Array.isArray(st.n) ? rng.int(st.n[0], st.n[1]) : st.n; lf.slots.push({ vid: v.id, bid: v.buildingId, occ: st.occ, n, filled: [] }); }
  const slotsFor = (occ) => lf.slots.filter((s) => s.occ === occ && s.filled.length < s.n);

  // ---------- ethnicity by quota ----------
  const totalPeople = hhs.reduce((a, h) => a + h.members.length, 0);
  const share = { ...Object.fromEntries(Object.entries(cal.ethnicity.detail).map(([k, v]) => [NAMES.ETHNICITY_TO_GROUP[k], v])), mixed: cal.ethnicity.shares.Mixed, other: cal.ethnicity.shares['Other (incl Arab)'] };
  const remain = {}; for (const g of GROUPS) remain[g] = (share[g] || 0) * totalPeople;
  const order = hhs.map((h) => h.id); rng.shuffle(order);
  for (const id of order) {
    const h = hhs[id], tilt = ETH_TILT[h.seg] || {};
    const w = GROUPS.map((g) => (tilt[g] ?? 1) * Math.max(0.04, remain[g] / ((share[g] || 0.01) * totalPeople + 1) + 0.15) * (share[g] || 0.001));
    h.group = rng.weighted(GROUPS, w);
    remain[h.group] -= h.members.length;
  }

  // ---------- people ----------
  const birthTickOf = (age) => T0 - Math.round(age * cl.ticksPerYear) - rng.int(0, cl.ticksPerYear - 1);
  const people = [];
  for (const h of hhs) {
    const seg = SEG[h.seg], hm = h.members, headStub = hm[0];
    h.kidsMixed = false;
    // household-level origin & surname
    const surnameOrigin = null;
    for (let i = 0; i < hm.length; i++) {
      const m = hm[i];
      let group = h.group;
      if (m.role === 'partner' && rng.chance(0.11)) group = wpick(rng, GROUPS.map((g) => [g, (share[g] || 0.001)]));
      if (m.role === 'sharer' && i > 0 && rng.chance(0.4)) group = wpick(rng, GROUPS.map((g) => [g, (ETH_TILT[h.seg] || {})[g] ?? 1 * (share[g] || 0.001)]));
      if (m.role === 'child' || (m.role === 'adult_child' && m.parents)) { const ps = m.parents.map((k) => hm[k].group); group = ps.length > 1 && ps[0] !== ps[1] ? 'mixed' : ps[0]; }
      m.group = group;
      const by = 2026 - Math.floor(m.age);
      let origin = NAMES.pickOrigin(rng, group, by);
      if (h.seg === 'recent_arrivals' && m.age >= 18 && origin.bornUK) { origin = NAMES.pickOrigin(rng, group, by); origin.bornUK = false; if (origin.birthplace === 'United Kingdom') origin.birthplace = (NAMES.GROUPS[group].birth.other || [['Poland', 1]])[0][0]; }
      if (m.role === 'child' && h.seg === 'recent_arrivals' && rng.chance(0.4)) origin.bornUK = false;
      if (m.parents && m.role !== 'sharer') { const par = hm[m.parents[0]]; if (par.origin && par.origin.bornUK === false && h.seg !== 'recent_arrivals' && rng.chance(0.15)) origin.bornUK = true; }
      m.origin = origin;
      m.birthTick = birthTickOf(m.age);
    }
    // names: children share the head's surname; couples share with prob; religion; everything else per person
    for (let i = 0; i < hm.length; i++) {
      const m = hm[i];
      const n = NAMES.pickName(rng, m.origin, m.sex, 2026 - Math.floor(m.age));
      m.firstName = n.first; m.lastName = n.last;
    }
    for (const m of hm) {
      if (m.role === 'partner' && rng.chance(h.arch.includes('married') ? 0.7 : 0.35)) m.lastName = hm[0].lastName;
      if (m.role === 'child' || (m.role === 'adult_child' && m.parents)) { const par = hm[m.parents[m.parents.length > 1 && hm[m.parents[1]].sex === 'M' && rng.chance(0.8) ? 1 : 0]]; m.lastName = par.lastName; if (m.parents.length === 1 || rng.chance(0.85)) m.lastName = hm[m.parents[0]].sex === 'M' || m.parents.length === 1 ? hm[m.parents[0]].lastName : hm[m.parents[1]].lastName; }
      if (m.role === 'parent' || m.role === 'sibling') { /* own surname (mother's maiden name) */ if (m.role === 'sibling' && rng.chance(0.7)) m.lastName = hm[0].lastName; }
      if (m.role === 'grandparent') m.lastName = hm[0].lastName;
      // religion
      const sub = m.origin.sub && NAMES.RELIGION_BY_SUB[m.origin.sub];
      const base = sub || NAMES.RELIGION_BY_GROUP[m.origin.group === 'mixed' ? 'mixed' : m.origin.lastGroup === 'arab_other' ? 'other' : m.origin.firstGroup || m.origin.group] || NAMES.RELIGION_BY_GROUP[m.group];
      const w = Object.entries(base).map(([k, v]) => [k, v * (k === 'Christian' ? 0.55 + 0.9 * clamp((m.age - 20) / 60, 0, 1) : k === 'No religion' ? 1.55 - 0.9 * clamp((m.age - 20) / 60, 0, 1) : 1)]);
      m.religion = wpick(rng, w);
    }
    for (const m of hm) if ((m.role === 'child' || m.role === 'partner') && m.parents !== undefined && rng.chance(0.82)) m.religion = hm[m.parents[0]].religion;
    for (const m of hm) if (m.role === 'partner' && rng.chance(0.75)) m.religion = hm[0].religion;
    for (const m of hm) { const hmm = m; m.religiosity = hmm.religion === 'No religion' ? rng.float(0, 0.12) : clamp01(Math.pow(rng.next(), 0.8) * (hmm.religion === 'Muslim' ? 1.1 : 0.9) * (0.5 + 0.7 * (m.age > 60 ? 1 : 0.6))); }
  }

  // ---------- activity / occupation / workplace / finance ----------
  const socShares = cal.occupationSOC.composite, socKeys = Object.keys(pack.meta.socGroups).map(Number);
  const socBase = Object.fromEntries(socKeys.map((k) => [k, socShares[pack.meta.socGroups[k]] || 0.1]));
  const gwDest = pack.meta.offmap;
  const ownerVenuesFree = M.venues.filter((v) => OWNER_OCC[v.template] !== undefined && OWNER_OCC[v.template] !== null);
  const ownerTaken = new Set();
  const activityOf = (h, m, i) => {
    const seg = SEG[h.seg], a = m.age;
    if (a < 16) return 'child';
    if (a < 18) return rng.chance(0.9) ? 'student' : 'employed';
    let act;
    if (m.role === 'head' || m.role === 'sharer' || m.role === 'sibling') act = wpickObj(rng, seg.head.activity);
    else if (m.role === 'partner') { const ha = { ...seg.head.activity }; if (hm0kids(h)) { ha.lookingAfterHomeFamily = (ha.lookingAfterHomeFamily || 0.05) * (m.sex === 'F' ? 4 : 0.5); ha.employed = (ha.employed || 0.5) * (m.sex === 'F' ? 0.75 : 1.05); } act = wpickObj(rng, ha); }
    else if (m.role === 'adult_child') act = a < 22 ? wpick(rng, [['student', 0.45], ['employed', 0.4], ['unemployed', 0.1], ['otherInactive', 0.05]]) : a < 30 ? wpick(rng, [['employed', 0.6], ['student', 0.12], ['unemployed', 0.12], ['longTermSickDisabled', 0.08], ['otherInactive', 0.08]]) : wpick(rng, [['employed', 0.55], ['unemployed', 0.12], ['longTermSickDisabled', 0.15], ['lookingAfterHomeFamily', 0.12], ['otherInactive', 0.06]]);
    else if (m.role === 'parent' || m.role === 'grandparent') act = a >= 66 ? 'retired' : wpick(rng, [['retired', 0.5], ['longTermSickDisabled', 0.3], ['employed', 0.2]]);
    else act = wpickObj(rng, seg.head.activity);
    if (a >= 67) act = rng.chance(h.seg === 'local_business_families' ? 0.5 : 0.92) ? 'retired' : act === 'student' ? 'retired' : act;
    else if (a >= 60 && act !== 'longTermSickDisabled') { if (rng.chance(clamp((a - 58) / 12, 0, 0.8) * (seg.id === 'older_longterm' ? 1 : 0.5))) act = 'retired'; }
    if (act === 'retired' && a < 55) act = 'employed';
    if (act === 'student' && a > 32 && !(seg.id === 'students')) act = 'employed';
    if (act === 'student' && a > 40) act = 'employed';
    return { employed: 'employed', student: 'student', retired: 'retired', unemployed: 'unemployed', lookingAfterHomeFamily: 'home_family', longTermSickDisabled: 'sick_disabled', otherInactive: 'other_inactive', child: 'child' }[act] || act;
  };
  const hm0kids = (h) => h.members.some((x) => x.role === 'child' && x.age < 12);
  const eduFor = (m, occ, act, h) => {
    const a = m.age, c = cal.qualifications16plus;
    if (a < 16) return 'in_school';
    if (a < 19 && act === 'student') return a < 17 ? 'level2' : 'level2';
    const draw = (tiltNone) => wpick(rng, [['none', c.none * tiltNone], ['level1', c.level1], ['level2', c.level2], ['apprenticeship', c.apprenticeship], ['level3', c.level3], ['level4plus', c.level4plus * (h.seg === 'benefit_dependent' ? 0.4 : 1)], ['other', c.other]]);
    if (occ) {
      const q = occ.qual;
      if (q === 'level4plus') return rng.chance(0.93) ? 'level4plus' : 'level3';
      if (q === 'level3') return wpick(rng, [['level3', 0.55], ['level4plus', 0.3], ['apprenticeship', 0.1], ['level2', 0.05]]);
      if (q === 'level2') return wpick(rng, [['level2', 0.5], ['level3', 0.2], ['level1', 0.1], ['level4plus', 0.12], ['none', 0.08]]);
      if (q === 'apprenticeship') return wpick(rng, [['apprenticeship', 0.7], ['level3', 0.2], ['level2', 0.1]]);
      if (q === 'level1') return wpick(rng, [['level1', 0.45], ['level2', 0.25], ['none', 0.3]]);
    }
    if (act === 'student') return a < 22 ? 'level3' : 'level4plus';
    return draw(a < 35 ? 0.35 : a > 60 ? 1.6 : 1);
  };
  const drawOcc = (h, m, act) => {
    const seg = SEG[h.seg], tilt = SOC_TILT[h.seg] || {};
    if (m.role === 'head' && h.seg === 'local_business_families') {
      // owner of the venue in the same building (flat above the shop) or the next free owner-type venue
      let v = M.venues.find((x) => x.buildingId === h.unit.buildingId && OWNER_OCC[x.template]);
      if (!v) v = ownerVenuesFree.find((x) => !ownerTaken.has(x.id));
      if (v) { ownerTaken.add(v.id); return { occ: OCC[OWNER_OCC[v.template]], venue: v, owner: true }; }
    }
    if (act === 'student' && m.age >= 17) return rng.chance(0.35) ? { occ: OCC.student_part_time } : null;
    for (let tries = 0; tries < 6; tries++) {
      const soc = wpick(rng, socKeys.map((k) => [k, socBase[k] * (tilt[k] ?? 1)]));
      const pool = Object.entries(pack.meta.socToOcc[soc] || {}).map(([id, w]) => {
        const o = OCC[id]; if (!o) return [id, 0];
        let x = w;
        if (o.age && (m.age < o.age[0] - 1 || m.age > o.age[1] + 2)) x *= 0.05;
        if (o.studentOnly) x = 0;
        if (o.where === 'onmap') { const free = slotsFor(id); if (!free.length) x = 0; else x *= Math.min(2, free.length) * 1.3; }
        if (h.seg === 'shift_workers' && SHIFTY.has(o.pattern)) x *= 6; else if (h.seg === 'shift_workers') x *= 0.4;
        if (h.seg === 'lone_parents' || (h.seg === 'family_couples' && m.sex === 'F' && hm0kids(h))) { if (o.pattern === 'school_day' || o.partTime) x *= 3; if (o.pattern === 'nhs_shifts' || o.pattern === 'night') x *= 0.3; }
        if (['owner'].includes(o.id) || o.id === 'shop_owner_manager' || o.id === 'cafe_owner' || o.id === 'publican') x *= h.seg === 'local_business_families' ? 0 : 0.02;
        if (o.id === 'gp' || o.id === 'dentist' || o.id === 'headteacher') x *= 0.2;
        return [id, x];
      });
      if (pool.every((e) => e[1] === 0)) continue;
      const id = wpick(rng, pool); return { occ: OCC[id] };
    }
    return { occ: OCC.retail_city };
  };
  const hoursFor = (o, h, m) => {
    const [lo, typ, hi] = o.hours;
    let ptp = (o.partTime || 0) + (h.seg === 'lone_parents' ? 0.25 : 0) + (h.seg === 'family_couples' && m.sex === 'F' && hm0kids(h) ? 0.35 : 0) + (m.age >= 60 ? 0.3 : 0) + (m.age < 22 ? 0.2 : 0);
    if (o.pattern === 'school_day' && o.partTime) ptp += 0.1;
    if (lo < 30 && rng.chance(clamp(ptp, 0, 0.85))) return Math.round(clamp(rng.gauss((lo + Math.min(typ, 28)) / 2 + 4, 4), Math.max(6, lo), 29));
    return Math.round(clamp(rng.gauss(Math.max(typ, 30), 3), Math.max(30, lo), hi));
  };
  const commuteMode = (h, m, dest) => {
    const seg = SEG[h.seg], mm = seg.mobility, dm = dest.minutes, hasCar = m.drives;
    const cand = [];
    if (dm.drive && hasCar) cand.push(['drive', 0.1 + mm.car * 3]);
    if (dm.rail) cand.push(['rail', (hasCar ? 0.3 : 1.0) * (0.4 + 1.2 * (1 - mm.car)) * (dm.rail <= 30 ? 1.2 : 0.3)]);
    if (dm.bus) cand.push(['bus', (hasCar ? 0.15 : 1.2) * (0.3 + mm.bus * 2)]);
    if (dm.cycle) cand.push(['cycle', (m.bike ? 1 : 0.05) * (0.2 + mm.bike * 6) * (dm.cycle <= 25 ? 1 : 0.3)]);
    if (dm.walk) cand.push(['walk', 0.4]);
    if (!cand.length) cand.push(['bus', 1]);
    return wpick(rng, cand);
  };
  const MODE_KEY = { drive: 'drive', rail: 'rail', bus: 'bus', cycle: 'cycle', walk: 'walk' };
  const pets = (h) => { const hasDog = rng.chance(cal.social.pets.innerCityDogHouseholds_estimate * (['older_longterm', 'settled_professionals', 'family_couples'].includes(h.seg) ? 1.8 : h.seg === 'students' ? 0.1 : 0.7)); const hasCat = rng.chance(cal.social.pets.innerCityCatHouseholds_estimate * (h.seg === 'students' || h.seg === 'recent_arrivals' ? 0.5 : 1.1)); return { dogs: hasDog ? 1 + (rng.chance(0.15) ? 1 : 0) : 0, cats: hasCat ? 1 + (rng.chance(0.2) ? 1 : 0) : 0 }; };

  for (const h of hhs) {
    const seg = SEG[h.seg], hm = h.members, nAdults = hm.filter((x) => x.age >= 17).length;
    // cars (household) then drivers
    const carP = seg.mobility.car * (h.unit.kind === 'flat' ? 0.8 : 1.05);
    h.cars = rng.chance(carP) ? (nAdults >= 2 && rng.chance(0.3 + 0.2 * (seg.money.pressure < 0.4 ? 1 : 0)) ? 2 : 1) : 0;
    h.pets = pets(h);
    let carLeft = h.cars;
    for (const m of hm) { m.drives = m.age >= 17 && carLeft > 0 && rng.chance(0.85); if (m.drives) carLeft--; m.bike = m.age >= 10 && rng.chance(Math.min(0.9, seg.mobility.bike * 3 + (m.age < 18 ? 0.25 : 0))); }
    for (let i = 0; i < hm.length; i++) {
      const m = hm[i];
      m.activity = activityOf(h, m, i);
      m.occId = null; m.workplace = { kind: 'none' }; m.pay = 0; m.hours = 0; m.contract = null; m.pattern = null; m.soc = 0;
      if (m.activity === 'employed' || (m.activity === 'student' && m.age >= 17)) {
        const d = drawOcc(h, m, m.activity);
        if (d && d.occ) {
          const o = d.occ; m.occId = o.id; m.soc = o.soc; m.pattern = o.pattern; m.hours = m.activity === 'student' ? rng.int(8, 18) : hoursFor(o, h, m);
          m.contract = o.gig ? 'gig' : rng.chance(o.selfEmployed || 0) ? 'self_employed' : m.activity === 'student' ? 'zero_hours' : rng.chance(0.06 + (o.partTime ? 0.08 : 0) + (SHIFTY.has(o.pattern) && o.soc >= 6 ? 0.07 : 0)) ? 'zero_hours' : rng.chance(0.06) ? 'fixed_term' : 'permanent';
          const exp = clamp(0.8 + 0.2 * (m.age - 20) / 10, 0.78, 1.18); // experience premium
          m.pay = Math.round(logn(rng, o.pay.p10, o.pay.median, o.pay.p90) * (o.id === 'student_part_time' ? 1 : exp * (m.age < 22 ? 0.9 : 1)));
          if (o.where === 'onmap') {
            let slot = d.venue ? { vid: d.venue.id, bid: d.venue.buildingId } : null;
            if (!slot) { const free = slotsFor(o.id); slot = rng.pick(free); if (slot) slot.filled.push(m); }
            m.workplace = { kind: 'onmap', bid: slot.bid, vid: slot.vid, mode: 'walk', mins: 3 };
          } else if (o.where === 'home') m.workplace = { kind: 'home', mode: null, mins: 0 };
          else {
            const dest = gwDest[o.dest], mode = commuteMode(h, m, dest), mins = Math.round((dest.minutes[MODE_KEY[mode]] || 25) * rng.float(0.85, 1.25) + (mode === 'rail' || mode === 'bus' ? 8 : 3));
            const remote = (o.pattern === 'remote') || rng.chance((o.remote || 0) * 0.5);
            m.workplace = { kind: remote ? 'home' : 'offmap', dest: o.dest, mode, mins, hybrid: o.pattern === 'office_hybrid' ? (rng.chance(0.55) ? o.pattern && [1, 2, 3] : [0, 1, 2, 3].filter(() => rng.chance(0.7)).concat(rng.chance(0.4) ? [4] : [])) : null };
            if (m.workplace.hybrid && m.workplace.hybrid.length === 0) m.workplace.hybrid = [2];
          }
          if (o.pattern === 'school_day' && o.where === 'onmap') m.workplace.mins = 4;
        } else { m.activity = m.age < 18 ? 'student' : 'unemployed'; }
      }
      const occ = m.occId ? OCC[m.occId] : null;
      m.edu = eduFor(m, occ, m.activity, h);
      m.health = healthFor(rng, cal, m.age, seg.health, m.activity === 'sick_disabled');
      if (m.activity === 'sick_disabled' && m.health.general === 'very good') { m.health.general = 'fair'; m.health.disabled = true; m.health.limiting = 1; m.health.score = 0.62; }
      m.school = null;
      if (m.age < 16) m.school = m.age < 4 ? (rng.chance(clamp(0.35 + (h.seg === 'family_couples' ? 0.1 : 0) - (h.seg === 'lone_parents' ? 0.0 : 0), 0, 0.8)) && m.age >= 1 ? { kind: 'nursery' } : { kind: 'home' }) : m.age < 11 ? { kind: 'primary' } : { kind: 'secondary', dest: 'secondary_school' };
      else if (m.activity === 'student') m.school = m.age < 19 ? { kind: 'college', dest: 'secondary_school' } : { kind: 'university', dest: 'university' };
    }
    // household finances
    let gross = 0, net = 0, ben = 0;
    const adults = hm.filter((x) => x.age >= 16);
    for (const m of adults) {
      let g = 0, personalBen = 0;
      if (m.activity === 'employed' || m.occId) { g = m.pay * clamp(m.hours / 37.5, 0.15, 1.25); if (m.activity === 'student') g = m.pay * m.hours / 37.5; }
      else if (m.activity === 'retired') { g = BEN.statePensionWeeklyNewFull * 52 * (rng.chance(0.8) ? 1 : 0.7) + (rng.chance(h.seg === 'settled_professionals' ? 0.8 : 0.35) ? logn(rng, 1500, 5500, 18000) : 0); personalBen = 0; }
      else if (m.activity === 'student') { g = logn(rng, seg.money.incomeBand[0] * 0.8, seg.money.incomeBand[1], seg.money.incomeBand[2]) * (seg.id === 'students' ? 0.95 : 0.4); }
      m.gross = Math.round(g); m.netAnnual = Math.round(m.activity === 'retired' ? g * 0.93 : netFromGross(g, TAX, (m.edu === 'level4plus' && m.age < 45 && m.age >= 21))); gross += m.gross; net += m.netAnnual;
    }
    const nKids = hm.filter((x) => x.age < 16).length, hasPartner = adults.length >= 2 && hm.some((x) => x.role === 'partner');
    const workless = adults.filter((x) => x.activity !== 'employed' && x.activity !== 'retired' && x.activity !== 'student' && x.age < 66);
    const ucMonthly = (hasPartner ? BEN.universalCreditCouple25plus : BEN.universalCreditStandardAllowanceMonthlySingle25plus) * (workless.length ? 1 : 0) + nKids * BEN.childElementMonthly * (net < 26000 ? 1 : 0.35);
    if (workless.length && (seg.money.universalCredit === undefined || rng.chance(0.55 + (seg.money.universalCredit || 0) * 0.5))) ben += ucMonthly * 12;
    if (nKids && net < 55000) ben += (BEN.childBenefitWeeklyFirst + (nKids - 1) * BEN.childBenefitWeeklyOther) * 52;
    if (adults.some((x) => x.health.disabled && x.health.limiting === 2 && x.age < 66) && rng.chance(0.45)) ben += BEN.disabilityPIPWeeklyStandardDaily * 7 * 52 * 0.6;
    if (h.unit.tenure !== 'owned_outright' && h.unit.tenure !== 'mortgage' && workless.length && ucMonthly > 0 && rng.chance(0.7)) ben += (BEN.housingBenefitLHAByBedrooms[Math.min(4, Math.max(1, h.unit.bedrooms))] || 700) * 12 * 0.8;
    h.income = { gross: Math.round(gross + ben), net: Math.round(net + ben), benefits: Math.round(ben) };
    const rentPcm = h.unit.tenure === 'private_rent' ? Math.round(h.unit.rentGBPMonth || 900) : h.unit.tenure === 'council' ? Math.round(300 + 90 * h.unit.bedrooms) : h.unit.tenure === 'housing_assoc' ? Math.round(360 + 100 * h.unit.bedrooms) : h.unit.tenure === 'shared_ownership' ? 650 : 0;
    h.rentPcm = rentPcm;
    h.mortgagePcm = h.unit.tenure === 'mortgage' ? Math.round((h.unit.valueGBP || 200000) * rng.float(0.35, 0.8) * 0.0059) : 0;
    h.sav = savingsFor(rng, seg, pcm(h.income.net), h.unit.tenure);
    const earners = adults.filter((x) => x.activity !== 'child');
    for (const m of earners) { m.sav = { savings: Math.round(h.sav.savings / earners.length * rng.float(0.5, 1.5)), debt: Math.round(h.sav.debt / earners.length * rng.float(0.5, 1.5)), arrears: earners[0] === m ? h.sav.arrears : 0 }; }
    if (seg.money.studentLoan || (seg.id === 'young_sharers' && seg.money.studentLoanRepay)) for (const m of earners) if (m.edu === 'level4plus' && m.age < 40) m.studentLoan = Math.round(logn(rng, 16000, 38000, 55000));
    // years at address (household), moved-in tick
    const ym = seg.yearsInArea, maxY = Math.max(0.1, Math.min(...hm.filter((x) => x.age >= 17).map((x) => x.age - 17), 60));
    h.yearsAt = clamp(logn(rng, ym.p10, ym.median, ym.p90) * (h.unit.tenure === 'council' ? 1.1 : 1), 0.05, Math.max(0.15, maxY));
    const youngest = Math.min(...hm.map((x) => x.age)); if (youngest < h.yearsAt && hm.some((x) => x.role === 'child')) h.yearsAt = Math.max(h.yearsAt, 0.3);
    h.sinceTick = T0 - Math.round(h.yearsAt * cl.ticksPerYear);
  }

  // ---------- create world persons ----------
  const parentOf = [];
  for (const h of hhs) {
    const bid = h.unit.buildingId, hh = { id: h.id, unit: h.unit.id, bid, seg: h.seg, arch: h.arch, members: [], tenure: h.unit.tenure, rentPcm: h.rentPcm, mortgagePcm: h.mortgagePcm, income: h.income, cars: h.cars, dogs: h.pets.dogs, cats: h.pets.cats, since: h.sinceTick, group: h.group, landlord: h.unit.landlord, address: h.unit.address, bedrooms: h.unit.bedrooms, sav: h.sav };
    lf.households.push(hh);
    const created = [];
    for (let i = 0; i < h.members.length; i++) {
      const m = h.members[i];
      const pers = personalityFor(rng, m.age, m.sex);
      const p = world.createPerson({ sex: m.sex, firstName: m.firstName, lastName: m.lastName, homeId: bid, birthTick: m.birthTick, personality: pers, money: m.sav ? m.sav.savings : 0 });
      const occ = m.occId ? OCC[m.occId] : null;
      p.skills = skillsFor(rng, m.age, m.edu, occ, pers);
      if (m.drives) p.skills.driving = +rng.float(0.5, 0.95).toFixed(2); if (!m.origin.bornUK) p.skills.languages = rng.int(1, 3); else if (rng.chance(0.15)) p.skills.languages = 1;
      p.interests = interestsFor(rng, m.age, m.sex, m.religiosity > 0.45, m.role === 'head' && h.members.some((x) => x.age < 16));
      p.values = { tradition: clamp01(rng.gauss(0.45 + 0.2 * m.religiosity + 0.004 * (m.age - 40), 0.18)), wealth: clamp01(rng.gauss(0.5, 0.2)), family: clamp01(rng.gauss(0.6, 0.2)), freedom: clamp01(rng.gauss(0.55 - 0.004 * (m.age - 40), 0.2)), community: clamp01(rng.gauss(0.5, 0.2)), piety: m.religiosity };
      p.job = m.age < 5 ? 'child' : m.age < 16 ? 'student' : m.activity === 'retired' ? 'retired' : occ ? occ.label : m.activity === 'student' ? 'student' : m.activity === 'unemployed' ? 'unemployed' : m.activity;
      p.workId = m.workplace.kind === 'onmap' ? m.workplace.bid : null;
      if (p.workId != null) { const wb = world.buildings.get(p.workId); if (wb && !wb.employees.includes(p.id)) wb.employees.push(p.id); }
      p.health = m.health.score; p.mood = clamp(0.25 + 0.5 * (0.5 - pers.neuroticism) + rng.gauss(0, 0.15), -0.6, 0.8);
      p.needsTick = Number.MAX_SAFE_INTEGER; // routine layer owns the day; legacy needs integration is off for Larkfield people
      p.ext.pop = { hh: h.id, unit: h.unit.id, seg: h.seg, role: m.role, eth: m.group, ethGroup: m.origin.group, sub: m.origin.sub, bornUK: m.origin.bornUK, birthplace: m.origin.birthplace, arrived: null, religion: m.religion, religiosity: +m.religiosity.toFixed(2),
        activity: m.activity, occ: m.occId, soc: m.soc, contract: m.contract, hours: m.hours, pay: m.pay, edu: m.edu, workplace: m.workplace, pattern: m.pattern, school: m.school, health: { general: m.health.general, conds: m.health.conds, disabled: m.health.disabled, limiting: m.health.limiting },
        fin: { gross: m.gross || 0, net: m.netAnnual || 0, savings: m.sav ? m.sav.savings : 0, debt: m.sav ? m.sav.debt : 0, arrears: m.sav ? m.sav.arrears : 0, studentLoan: m.studentLoan || 0 }, car: !!m.drives, bike: !!m.bike, pets: { dogs: h.pets.dogs, cats: h.pets.cats },
        drives: drivesFor(rng, pack, pers, m.age, h.seg), yearsAtAddress: 0, grewUp: null, ties: [], life: null };
      p.ext.pop.yearsAtAddress = +(m.role === 'partner' && rng.chance(0.15) ? h.yearsAt * rng.float(0.2, 0.9) : (m.age < h.yearsAt ? m.age : h.yearsAt)).toFixed(2);
      m.person = p; created.push(p); people.push(p);
      hh.members.push(p.id);
    }
    // kin links in the legacy family record (spouse/parents/children) for the first generation present
    const hm = h.members;
    for (let i = 0; i < hm.length; i++) {
      const m = hm[i], p = m.person;
      if (m.partnerOf !== undefined) { const q = hm[m.partnerOf].person; p.family.spouseId = q.id; q.family.spouseId = p.id; const married = h.arch.includes('married') || h.arch === 'couple_66plus'; p.romance = { partnerId: q.id, status: married ? 'married' : 'dating', sinceTick: h.sinceTick - rng.int(0, 3 * cl.ticksPerYear) }; q.romance = { partnerId: p.id, status: married ? 'married' : 'dating', sinceTick: p.romance.sinceTick }; }
      if (m.parents) { const [a, b] = m.parents; const A = hm[a].person, B = b !== undefined ? hm[b].person : null; const mom = A.sex === 'F' ? A : B && B.sex === 'F' ? B : null, dad = A.sex === 'M' ? A : B && B.sex === 'M' ? B : null; p.family.motherId = mom ? mom.id : null; p.family.fatherId = dad ? dad.id : null; for (const par of [A, B]) if (par && !par.family.childrenIds.includes(p.id)) par.family.childrenIds.push(p.id); }
      if (m.childIdx) for (const ci of m.childIdx) { const c = hm[ci].person; if (p.sex === 'F') c.family.motherId = p.id; else c.family.fatherId = p.id; if (!p.family.childrenIds.includes(c.id)) p.family.childrenIds.push(c.id); }
    }
    for (const p of created) world.addPerson(p);
  }
  lf.stats.people = people.length;
  // work slots bookkeeping on buildings
  for (const s of lf.slots) { const b = world.buildings.get(s.bid); if (b) b.lf.staff.push({ vid: s.vid, occ: s.occ, n: s.n, filled: s.filled.map((p) => p.id) }); }
  for (const s of lf.slots) s.filled = s.filled.map((p) => p.id);

  // ---------- network + biography ----------
  buildNetwork(world, rng, hhs, people);
  writeBiographies(world, rng, hhs, people, { UK_PLACES });
  return people;
}
export default populate;
