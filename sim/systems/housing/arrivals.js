// Arrival generator (minimal, compatible with sim/population): builds a new household for a unit from the pack's segment x archetype tables and
// creates real Person records (ext.pop, kin links, off-map ties). Used for households and single sharers who move into Larkfield from the Metropolis.
import { sampleActivity } from '../../population/activity.js';
import NAMES from '../../../content/larkfield/names.js';
import { composeHousehold, separateSiblings } from '../../population/households.js';
import { personalityFor, drivesFor, skillsFor, interestsFor, healthFor, savingsFor } from '../../population/persona.js';
import { clamp, wpick, wpickObj, clamp01 } from '../../population/util.js';
import { schoolYearAge } from '../../util.js';

const GROUPS = ['white_british', 'other_white', 'indian', 'pakistani', 'bangladeshi', 'chinese', 'other_asian', 'african', 'caribbean', 'mixed', 'other'];
const ARRIVAL_TILT = { students: 3.5, young_sharers: 1.5, early_career: 1.4, recent_arrivals: 2.5, family_couples: 0.9, lone_parents: 0.7, benefit_dependent: 0.5, older_longterm: 0.1, settled_professionals: 0.9, shift_workers: 0.8, local_business_families: 0.1 };
const need = { one_person_66plus: 1, one_person_u66: 1, married_no_kids: 2, cohab_no_kids: 2, couple_66plus: 2, sharers_students_multigen: 3, married_dep_kids: 3, cohab_dep_kids: 3, lone_parent_dep: 2, lone_parent_nondep: 2, married_nondep: 3, cohab_nondep: 3, other_single_family: 3, multi_family_dep_kids: 4 };

// Letting-agent behaviour: a unit marketed as a student let (unit.studentLet) is re-let to students (agents market to the university, landlords like 12-month cohorts).
// Tunable mechanism parameter (relative weight of a student household for a student let).
const STUDENT_LET_STICKY = 40;
let shareCache = new WeakMap();
function ethShare(pack) {
  let s = shareCache.get(pack); if (s) return s;
  const cal = pack.calibration; s = Object.fromEntries(Object.entries(cal.ethnicity.detail).map(([k, v]) => [NAMES.ETHNICITY_TO_GROUP[k], v])); s.mixed = cal.ethnicity.shares.Mixed; s.other = cal.ethnicity.shares['Other (incl Arab)'];
  shareCache.set(pack, s); return s;
}
/** Choose (segment, archetype) for a unit being let/sold. */
export function pickSegArch(w, rng, unit, forceSeg) {
  const pack = w.pack, joint = pack.meta.segmentComposition, cells = [];
  for (const seg of pack.meta.segments) {
    if (forceSeg && seg.id !== forceSeg) continue;
    const tn = seg.tenure[unit.tenure] || 0.003, base = seg.householdShare * (seg.mobility.annualMoveProb + 0.05) * (ARRIVAL_TILT[seg.id] ?? 1) * tn * (unit.studentLet ? (seg.id === 'students' ? STUDENT_LET_STICKY : 0.02) : seg.id === 'students' ? 0.5 : 1);
    for (const [arch, wt] of Object.entries(joint[seg.id] || {})) {
      const n = need[arch] || 2, d = unit.bedrooms - (n > 3 ? 3 : n === 3 ? 2 : n === 1 ? 1 : 1), fit = d < 0 ? Math.exp(0.9 * d) : Math.exp(-0.45 * d);
      const sh = arch === 'sharers_students_multigen' ? (unit.kind === 'shared_house' || unit.bedrooms >= 3 ? 1 : 0.15) : (unit.kind === 'shared_house' ? 0.05 : 1);
      cells.push([{ seg: seg.id, arch }, base * wt * fit * sh + 1e-9]);
    }
  }
  return wpick(rng, cells);
}
const eduDraw = (rng, cal, age, seg, act) => {
  if (age < 16) return 'in_school'; if (act === 'student') return age < 19 ? 'level2' : age < 22 ? 'level3' : 'level4plus';
  const c = cal.qualifications16plus; return wpick(rng, [['none', c.none * (age < 35 ? 0.35 : 1)], ['level1', c.level1], ['level2', c.level2], ['apprenticeship', c.apprenticeship], ['level3', c.level3], ['level4plus', c.level4plus * (seg === 'benefit_dependent' ? 0.4 : 1) * (seg === 'settled_professionals' || seg === 'early_career' ? 2 : 1)], ['other', c.other]]);
};
const actFor = (w, rng, seg, m, kids) => {
  const a = m.age; if (a < 16) return 'child'; if (a < 18) return rng.chance(0.9) ? 'student' : 'employed';
  let act = sampleActivity(rng, w.pack.meta.segments, seg, a, { sex: m.sex, youngKids: m.role === 'partner' && kids, role: m.role });
  if (a >= 67) act = rng.chance(0.92) ? 'retired' : act === 'student' ? 'retired' : act;
  if (act === 'retired' && a < 55) act = 'employed'; if (act === 'student' && a > 32 && seg.id !== 'students') act = 'employed'; if (act === 'student' && a > 40) act = 'employed';
  return { employed: 'employed', student: 'student', retired: 'retired', unemployed: 'unemployed', lookingAfterHomeFamily: 'home_family', longTermSickDisabled: 'sick_disabled', otherInactive: 'other_inactive' }[act] || act;
};
/** A student who moves into town starts a NEW course this academic year (September intake): first-years 18-20 (3 y, 20% 4 y), older entrants mostly 1-year taught
 *  postgraduates (HESA: ~1/3 of UK HE entrants are postgraduate; many international). Previously arrivals were dropped mid-course at a random point and graduated within months. */
function startCourse(w, rng, q, age) {
  const t = w.time, dsm = ((t.month >= 8 ? t.month - 8 : t.month + 4) * 30 + (t.dom - 1)); // days since 1 Sept
  q.uniStart = w.tick - dsm * w.calendar.ticksPerYear / 365;
  q.courseYears = age >= 21 && rng.chance(0.7) ? 0.9 : rng.chance(0.2) ? 3.9 : 2.9;
  if (age >= 18) { q.school = { kind: 'university', dest: 'university' }; q.edu = 'level3'; }
}
function makePerson(w, rng, hh, m, seg, hhKids, opts = {}) {
  const pack = w.pack, cal = pack.calibration, cl = w.calendar, age = m.age, share = ethShare(pack);
  const group = opts.group || m.group;
  const by = 2026 - Math.floor(age), origin = NAMES.pickOrigin(rng, group, by, opts.like || null); if (seg.id === 'recent_arrivals' && age >= 18) { origin.bornUK = false; if (origin.birthplace === 'United Kingdom') origin.birthplace = (NAMES.GROUPS[group].birth.other || [['Poland', 1]])[0][0]; }
  const nm = NAMES.pickName(rng, origin, m.sex, by);
  // surname: a child takes a parent's by the origin's convention (patronymic / gendered forms), a partner usually the head's, everyone else their own tradition's
  const par = opts.parents || [], fa = par.find((x) => x.sex === 'M'), mo = par.find((x) => x.sex === 'F'), rec = (x) => x && { first: x.firstName, last: x.lastName};
  if (par.length) nm.last = NAMES.childSurname(rng, origin, m.sex, rec(fa), rec(mo), !!fa && (!mo || rng.chance(0.85))); else if (opts.sameLast) nm.last = opts.sameLast;
  const pers = personalityFor(rng, age, m.sex);
  const act = actFor(w, rng, seg, m, hhKids), edu = eduDraw(rng, cal, age, seg.id, act);
  const rel = (NAMES.RELIGION_BY_SUB[origin.sub] || NAMES.RELIGION_BY_GROUP[group] || NAMES.RELIGION_BY_GROUP.white_british); const religion = wpick(rng, Object.entries(rel));
  const religiosity = religion === 'No religion' ? rng.float(0, 0.12) : clamp01(Math.pow(rng.next(), 0.8));
  const hs = healthFor(rng, cal, age, seg.health, act === 'sick_disabled');
  const p = w.createPerson({ sex: m.sex, firstName: nm.first, lastName: nm.last, homeId: hh.bid, birthTick: w.tick - Math.round(age * cl.ticksPerYear) - rng.int(0, cl.ticksPerYear - 1), personality: pers, money: 0 });
  const sy = schoolYearAge(w.calendar, w.tick, p.birthTick); // school year, not integer age: reception starts the September after the 4th birthday
  p.skills = skillsFor(rng, age, edu, null, pers); p.skills.languages = origin.bornUK ? 0 : rng.int(1, 3);
  p.interests = interestsFor(rng, age, m.sex, religiosity > 0.45, false);
  p.values = { tradition: clamp01(rng.gauss(0.45, 0.18)), wealth: clamp01(rng.gauss(0.5, 0.2)), family: clamp01(rng.gauss(0.6, 0.2)), freedom: clamp01(rng.gauss(0.55, 0.2)), community: clamp01(rng.gauss(0.5, 0.2)), piety: religiosity };
  p.job = age < 16 ? 'student' : act; p.health = hs.score; p.mood = clamp(0.25 + 0.5 * (0.5 - pers.neuroticism) + rng.gauss(0, 0.15), -0.6, 0.8); p.needsTick = Number.MAX_SAFE_INTEGER;
  const drives = age >= 17 && rng.chance(0.45) && seg.mobility.car > 0.2;
  p.ext.pop = { hh: hh.id, unit: hh.unit, seg: seg.id, role: m.role, eth: group, ethGroup: origin.group, sub: origin.sub, bornUK: origin.bornUK, birthplace: origin.birthplace, arrived: w.tick, religion, religiosity: +religiosity.toFixed(2),
    activity: act, occ: null, soc: 0, contract: null, hours: 0, pay: 0, edu, workplace: { kind: 'none' }, pattern: null, school: age < 16 ? (sy < 4 ? (age >= 3 && rng.chance(0.78) ? { kind: 'nursery' } : { kind: 'home' }) : sy < 11 ? { kind: 'primary' } : { kind: 'secondary', dest: 'secondary_school' }) : act === 'student' ? (age < 19 ? { kind: 'college', dest: 'secondary_school' } : { kind: 'university', dest: 'university' }) : null,
    health: { general: hs.general, conds: hs.conds, disabled: hs.disabled, limiting: hs.limiting }, fin: { gross: 0, net: 0, savings: 0, debt: 0, arrears: 0, studentLoan: 0 }, car: drives, bike: age >= 10 && rng.chance(Math.min(0.9, seg.mobility.bike * 3)), pets: { dogs: 0, cats: 0 },
    drives: drivesFor(rng, pack, pers, age, seg.id), interests: p.interests, yearsAtAddress: 0, grewUp: null, ties: [], life: null };
  if (drives) p.skills.driving = +rng.float(0.5, 0.95).toFixed(2);
  if (act === 'student' && age >= 17 && age < 35) startCourse(w, rng, p.ext.pop, age);
  return p;
}
const REL_OFF = [['mother', 'kin'], ['father', 'kin'], ['sibling', 'kin'], ['best friend', 'friend'], ['old friend', 'friend'], ['uni friend', 'friend']];
function addTies(w, rng, hh, people) {
  const lf = w.lf;
  for (const a of people) {
    const q = a.ext.pop;
    for (const b of people) if (b !== a) q.ties.push({ o: b.id, k: b.family.spouseId === a.id ? 'partner' : 'housemate', rel: b.family.spouseId === a.id ? 'partner' : 'housemate', t: 1, s: 0.6, v: 'same household', on: 1 });
    if (w.ageOf(a) < 16) continue;
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const [rel, k] = REL_OFF[rng.int(0, REL_OFF.length - 1)], id = 'm' + (lf.metro.length + 1), age = clamp(Math.round(w.ageOf(a) + (rel === 'mother' || rel === 'father' ? 28 : rng.int(-4, 4))), 18, 95), sex = rel === 'mother' ? 'F' : rel === 'father' ? 'M' : rng.chance(0.5) ? 'F' : 'M';
      const nm = NAMES.pickName(rng, NAMES.pickOrigin(rng, q.eth, 2026 - age, k === 'kin' ? q : null), sex, 2026 - age);
      lf.metro.push({ id, name: `${nm.first} ${nm.last}`, age, sex, rel, where: rng.pick(['elsewhere in the city', 'a nearby town', 'London', 'a Midlands town', 'a town in the north']), how: k, owner: a.id, freq: rng.pick(['weekly', 'a few times a month', 'a few times a year']) });
      q.ties.push({ o: id, k, rel, t: i === 0 ? 1 : 2, s: +rng.float(0.4, 0.85).toFixed(2), v: k === 'kin' ? 'family' : 'friends', on: 0 });
    }
  }
}
/** Create and register a whole household in `unit` (already reserved by the caller). Returns the lf household record. */
export function createArrivalHousehold(w, rng, unit, forceSeg) {
  const pack = w.pack, lf = w.lf, cal = pack.calibration, share = ethShare(pack);
  const spec = pickSegArch(w, rng, unit, forceSeg), seg = pack.meta.segments.find((s) => s.id === spec.seg);
  const M = composeHousehold(rng, pack, { seg: spec.seg, arch: spec.arch, unit: { bedrooms: unit.bedrooms, kind: unit.kind } });
  const tilt = { recent_arrivals: { other_white: 3.5, african: 2.2, other_asian: 2.5, white_british: 0.05 }, students: { chinese: 3.5, indian: 1.6, other_asian: 1.4 } }[spec.seg] || {};
  const group = wpick(rng, GROUPS.map((g) => [g, (share[g] || 0.001) * (tilt[g] ?? 1)]));
  const hh = { id: lf.households.length, unit: unit.id, bid: unit.bid, seg: spec.seg, arch: spec.arch, members: [], tenure: unit.tenure, rentPcm: 0, mortgagePcm: 0, income: { gross: 0, net: 0, benefits: 0 }, cars: 0, dogs: 0, cats: 0, since: w.tick, group, landlord: unit.landlord, address: unit.address, bedrooms: unit.bedrooms, sav: null };
  const kids = M.some((m) => m.role === 'child' && m.age < 12), people = [];
  for (const m of M) m.group = m.role === 'sharer' && rng.chance(0.4) ? wpick(rng, GROUPS.map((g) => [g, share[g] || 0.001])) : group;
  for (const m of M) { // household members share ONE naming tradition: a child follows a parent (already created), a partner usually the head's, so a household never mixes Horn-of-Africa and Sierra Leonean names
    const pr = m.parents && m.role !== 'sharer' ? m.parents.map((k) => M[k] && M[k].person).filter(Boolean) : [], headP = M[0] !== m ? M[0].person : null;
    const like = pr.length ? pr[0].ext.pop : m.role === 'partner' && headP && rng.chance(0.9) ? headP.ext.pop : null;
    const p = makePerson(w, rng, hh, m, seg, kids, { like, parents: pr, sameLast: m.role === 'partner' && like && headP && rng.chance(0.6) ? headP.lastName : null }); m.person = p; people.push(p); hh.members.push(p.id); }
  for (const m of M) {
    const p = m.person;
    if (m.partnerOf !== undefined) { const q = M[m.partnerOf].person; p.family.spouseId = q.id; q.family.spouseId = p.id; const married = spec.arch.includes('married') || spec.arch === 'couple_66plus'; p.romance = { partnerId: q.id, status: married ? 'married' : 'dating', sinceTick: w.tick - rng.int(0, 3 * w.calendar.ticksPerYear) }; q.romance = { partnerId: p.id, status: married ? 'married' : 'dating', sinceTick: p.romance.sinceTick }; }
    if (m.parents) { const [a, b] = m.parents, A = M[a].person, B = b !== undefined ? M[b].person : null; const mom = A.sex === 'F' ? A : B && B.sex === 'F' ? B : null, dad = A.sex === 'M' ? A : B && B.sex === 'M' ? B : null; p.family.motherId = mom ? mom.id : null; p.family.fatherId = dad ? dad.id : null; for (const par of [mom, dad]) if (par && !par.family.childrenIds.includes(p.id)) par.family.childrenIds.push(p.id); }
    if (m.childIdx) for (const ci of m.childIdx) { const c = M[ci].person; if (p.sex === 'F') c.family.motherId = p.id; else c.family.fatherId = p.id; if (!p.family.childrenIds.includes(c.id)) p.family.childrenIds.push(c.id); }
  }
  // Religion within a household is correlated, as in the founding population (Census 2021 RM083: most multi-person households share one religion): children
  // usually take a parent's, partners usually share. (makePerson draws each person from the ethnic-group conditional table independently.)
  for (const m of M) { const p = m.person; if ((m.role === 'child' || m.role === 'partner') && M[0].person !== p && rng.chance(m.role === 'child' ? 0.82 : 0.75)) { const h = (m.parents && M[m.parents[0]] ? M[m.parents[0]] : M[0]).person; if (h && h !== p) { p.ext.pop.religion = h.ext.pop.religion; p.ext.pop.religiosity = +(h.ext.pop.religion === 'No religion' ? rng.float(0, 0.12) : Math.min(1, h.ext.pop.religiosity * rng.float(0.6, 1.1))).toFixed(2); p.values.piety = p.ext.pop.religiosity; } } }
  { const sib = people.filter((p) => p.family.motherId != null || p.family.fatherId != null).map((p) => ({ p, birthTick: p.birthTick, age: Math.floor(w.ageOf(p)) })); // same-mother siblings need a feasible birth gap (or shared twin birth)
    separateSiblings(rng, sib, (x) => String(x.p.family.motherId ?? 'f' + x.p.family.fatherId), w.calendar.ticksPerYear); for (const x of sib) x.p.birthTick = x.birthTick; }
  lf.households.push(hh);
  for (const p of people) { w.addPerson(p); }
  addTies(w, rng, hh, people);
  // household economics: cars, savings, debt
  const nAd = people.filter((p) => w.ageOf(p) >= 17).length;
  hh.cars = rng.chance(Math.min(0.9, seg.mobility.car * 1.4)) ? (nAd >= 2 && rng.chance(0.4) ? 2 : 1) : 0; let cl = hh.cars; for (const p of people) { p.ext.pop.car = w.ageOf(p) >= 17 && cl > 0 && rng.chance(0.85); if (p.ext.pop.car) cl--; }
  hh.dogs = rng.chance(0.08) ? 1 : 0; hh.cats = rng.chance(0.1) ? 1 : 0;
  return { hh, people, seg, M };
}
/** Create one new adult (a flatmate joining a house-share) as a member of hh. */
export function createSharer(w, rng, hh, ageHint) {
  const seg = w.pack.meta.segments.find((s) => s.id === hh.seg), share = ethShare(w.pack);
  const stud = hh.seg === 'students', sAge = stud ? (rng.chance(0.6) ? rng.int(18, 19) : rng.int(20, 25)) : null; // a student house re-lets to the new cohort: mostly first-years
  const m = { role: 'sharer', age: stud ? sAge : clamp(Math.round(ageHint + rng.int(-3, 4)), 18, 45), sex: rng.chance(0.5) ? 'F' : 'M', group: wpick(rng, GROUPS.map((g) => [g, share[g] || 0.001])) };
  const p = makePerson(w, rng, hh, m, seg, false); hh.members.push(p.id); w.addPerson(p); addTies(w, rng, hh, [p]);
  return p;
}
export { savingsFor };
