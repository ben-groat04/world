// Life stages: nursery -> primary -> secondary -> sixth form / college / apprenticeship / work -> university -> graduate job; leaving home and boomeranging; retirement.
// Everything here edits the person's ext.pop (school, activity, role, workplace) which the routine layer reads; changes call routine.rehome so habits follow.
import { clamp, wpick, ageOf, fullName, later, months, years, tieOf, hhOf, rec, bump } from './util.js';
import { depart, revive, bedsNeeded, bedsOf, assignWork, leaveHh } from './moves.js';

const rehome = (w, p) => { if (w.commands.has('routine.rehome')) w.cmd('routine.rehome', { pid: p.id }); };
const parentsOf = (w, p) => [p.family.motherId, p.family.fatherId].map((id) => (id != null ? w.people.get(id) : null)).filter((x) => x && x.alive);
const moneyStress = (w, p) => { const m = w.sys && w.sys.money; if (!m) return 0.3; try { const x = m.query.pressure(p.id); return x ? x.stress || 0 : 0.3; } catch (e) { return 0.3; } };

/** 1 September: the school year turns over for everyone under 25 on the map */
export function septemberTransitions(w, people) {
  const rng = w.rngFor('life.school');
  for (const p of people) {
    const a = ageOf(w, p); if (a < 3.9) continue;
    const q = p.ext.pop, L = p.ext.life; let changed = false;
    if (a >= 25) { // mature/postgraduate students: the course simply runs its length (or is abandoned)
      if (q.uniStart != null && q.school && q.school.kind === 'university' && (w.tick - q.uniStart >= years(w, q.courseYears || 3) || rng.chance(0.04))) { graduate(w, p, rng); rehome(w, p); }
      continue;
    }
    if (a < 11) { if (a >= 4 && (!q.school || q.school.kind !== 'primary')) { q.school = { kind: 'primary' }; q.activity = 'child'; changed = true; } }
    else if (a < 16) { if (!q.school || q.school.kind !== 'secondary') { q.school = { kind: 'secondary', dest: 'secondary_school' }; q.activity = 'child'; if (q.edu === 'in_school') q.edu = 'in_school'; changed = true; emit(w, 'secondary', p); } }
    else if (a < 17) {
      const seg = q.seg, pc = seg === 'benefit_dependent' || seg === 'lone_parents' ? 0.58 : seg === 'family_couples' || seg === 'settled_professionals' || seg === 'local_business_families' ? 0.8 : 0.7;
      const x = wpick(rng, [['college', pc], ['apprenticeship', 0.07], ['work', 0.13 - (pc - 0.7) * 0.4], ['neet', 0.1 - (pc - 0.7) * 0.6]]);
      q.edu = 'level2'; L.post16 = x;
      if (x === 'college') { q.school = { kind: 'college', dest: 'secondary_school' }; q.activity = 'student'; q.occ = null; if (rng.chance(0.3)) { assignWork(w, p, rng, { partTime: 0.6 }); if (q.occ) { q.hours = rng.int(6, 14); } } }
      else if (x === 'apprenticeship' || x === 'work') { q.school = null; q.edu = x === 'apprenticeship' ? 'apprenticeship' : 'level2'; assignWork(w, p, rng, { partTime: x === 'work' ? 0.2 : 0 }); if (q.activity !== 'employed') q.activity = 'unemployed'; }
      else { q.school = null; q.activity = 'unemployed'; }
      if (q.role === 'child') q.role = 'child'; changed = true; emit(w, x, p);
    } else if (a < 18) { /* second sixth-form year */ }
    else if (a < 19 && q.school && q.school.kind === 'college') {
      const hi = q.seg === 'benefit_dependent' ? 0.28 : q.seg === 'lone_parents' || q.seg === 'shift_workers' ? 0.34 : q.seg === 'settled_professionals' || q.seg === 'family_couples' || q.seg === 'local_business_families' ? 0.55 : 0.42;
      if (rng.chance(hi)) {
        q.school = { kind: 'university', dest: 'university' }; q.activity = 'student'; q.edu = 'level3'; q.uniStart = w.tick; q.courseYears = rng.chance(0.2) ? 4 : 3; changed = true; emit(w, 'university', p);
        const away = rng.chance(0.55);
        if (away) later(w, rng.int(2, 25) * 144, 'leave.uni', { pid: p.id });
      } else { q.school = null; q.edu = 'level3'; q.activity = 'unemployed'; q.occ = q.occ || null; assignWork(w, p, rng); changed = true; emit(w, 'work', p); }
    }
    if (a >= 18 && q.role === 'child') q.role = 'adult_child';
    if (q.uniStart != null && q.school && q.school.kind === 'university' && (w.tick - q.uniStart >= years(w, q.courseYears || 3) || rng.chance(0.04))) { graduate(w, p, rng); changed = true; } // 4%/yr drop out
    if (changed) rehome(w, p);
  }
}
function emit(w, stage, p) { w.emit('life.school', { actors: [p.id], salience: stage === 'university' ? 0.25 : 0.12, tags: ['school'], payload: { stage } }); }
export function graduate(w, p, rng) {
  const q = p.ext.pop; q.school = null; q.edu = 'level4plus'; q.uniStart = null; q.activity = 'unemployed';
  assignWork(w, p, rng);
  w.emit('life.graduate', { actors: [p.id], salience: 0.35, tags: ['school'], payload: { course: q.occ || 'a degree' } });
  w.addMemory(p, { type: 'education', text: 'Graduated from university.', otherIds: [], weight: 0.8, importance: 3 });
  if (p.ext.life.away && !p.alive && rng.chance(0.4)) later(w, months(rng.float(1, 6)), 'boom', { pid: p.id });
  rehome(w, p);
}
/** university students (term-time away) leave home */
export const stageHandlers = {
  'leave.uni': (w, d) => { const p = w.people.get(d.pid); if (p && p.alive) leaveHome(w, p, 'university', true); },
  boom: (w, d) => boomerang(w, w.people.get(d.pid)),
};

// ---------------------------------------------------------------- leaving home / boomerang
const leaveHazard = (a) => (a < 19 ? 0.007 : a < 21 ? 0.012 : a < 23 ? 0.016 : a < 27 ? 0.019 : a < 31 ? 0.014 : a < 36 ? 0.007 : 0.003);
export function leavingHome(w, rng, people) {
  for (const p of people) {
    const q = p.ext.pop, L = p.ext.life; if (L.part && L.part.st !== 'dating') continue;
    const a = ageOf(w, p); if (a < 18 || (q.role !== 'adult_child' && q.role !== 'child')) continue;
    const hh = hhOf(w, p); if (!hh || hh.members.length < 2) continue;
    if (!parentsOf(w, p).some((x) => x.homeId === p.homeId)) continue;
    let h = leaveHazard(a);
    if (q.seg === 'students' || q.seg === 'early_career' || q.seg === 'young_sharers') h *= 1.4; else if (q.seg === 'family_couples') h *= 0.8; else if (q.seg === 'lone_parents') h *= 1.15;
    if (q.religiosity > 0.55 && ['Muslim', 'Hindu', 'Sikh'].includes(q.religion) && !L.part) h *= 0.35;
    if (bedsNeeded(w, hh) > bedsOf(w, hh)) h *= 1.5;
    if (q.activity === 'unemployed' || q.activity === 'sick_disabled') h *= 0.5;
    if (L.part && L.part.st === 'dating') h *= 1.2;
    if (rng.chance(h)) later(w, rng.int(1, 27) * 144, 'leave.home', { pid: p.id, why: q.activity === 'student' ? 'study' : q.activity === 'employed' ? 'job' : 'independence' });
  }
}
export const leaveHandlers = { 'leave.home': (w, d) => { const p = w.people.get(d.pid); if (p && p.alive) leaveHome(w, p, d.why, false); } };

export function leaveHome(w, p, why, term) {
  const rng = w.rngFor('life.leave'), L = p.ext.life, hh = hhOf(w, p); if (!hh) return;
  const age = ageOf(w, p), ps = parentsOf(w, p);
  const rr = w.cmd('housing.leaveHome', { pid: p.id, reason: why });
  if (!rr || !rr.ok) return;
  w.emit('life.leave_home', { actors: [p.id], salience: 0.3, tags: ['move'], payload: { reason: why, age: +age.toFixed(1) } });
  w.emit('life.move_out', { actors: [p.id], salience: 0.25, tags: ['move'], payload: { to: rr.where === 'local' ? 'a place of their own nearby' : rr.to, reason: why } });
  w.addMemory(p, { type: 'home', text: why === 'university' ? 'Left home for university.' : 'Moved out of the family home.', otherIds: ps.map((x) => x.id), weight: 0.4, importance: 4 });
  rec(w, 'leave', [w.tick, +age.toFixed(1), why]); bump(w, 'leave_home');
  if (rr.where === 'away') { // gone from the map: may come back (boomerang)
    L.left = { tick: w.tick, why, ph: hh.id }; w.lf.life.away.push(p.id);
    if (why === 'university' && rng.chance(0.4)) later(w, years(w, 2.95) + months(rng.float(0, 4)), 'boom', { pid: p.id });
  }
}
export function boomerang(w, p) {
  if (!p || p.alive || !p.ext.life.left) return;
  const L = p.ext.life, hh = w.lf.households[L.left.ph]; if (!hh) return;
  const live = hh.members.map((id) => w.people.get(id)).filter((x) => x && x.alive && ageOf(w, x) >= 30);
  if (!live.length) { L.left = null; return; }
  if (bedsNeeded(w, hh, 1) > bedsOf(w, hh) + 1) { later(w, months(3), 'boom', { pid: p.id }); return; }
  const rng = w.rngFor('life.boom'), age = ageOf(w, p);
  if (L.part) return;
  const from = L.away ? L.away.to : 'elsewhere';
  revive(w, p, hh, 'adult_child'); const i = w.lf.life.away.indexOf(p.id); if (i >= 0) w.lf.life.away.splice(i, 1);
  L.boom = (L.boom || 0) + 1; L.left = null; if (p.ext.pop.activity === 'student') { p.ext.pop.school = null; }
  const ev = w.emit('life.boomerang', { actors: [p.id], salience: 0.35, tags: ['move', 'family'], payload: { age: +age.toFixed(1), from } });
  w.emit('life.move_in', { actors: [p.id], salience: 0.2, cause: ev, tags: ['move'], payload: { from, reason: 'back with parents' } });
  rec(w, 'boom', [w.tick, +age.toFixed(1)]); bump(w, 'boomerang');
  w.addMemory(p, { type: 'home', text: 'Moved back in with the family for a while.', otherIds: [], weight: -0.2, importance: 3 });
}
/** monthly: people who left may come back (job loss, breakup, rent) */
export function boomerangScan(w, rng) {
  const away = w.lf.life.away;
  for (let i = away.length - 1; i >= 0; i--) {
    const p = w.people.get(away[i]); if (!p) { away.splice(i, 1); continue; }
    if (p.alive || !p.ext.life.left) { away.splice(i, 1); continue; }
    const L = p.ext.life, a = ageOf(w, p), since = (w.tick - L.left.tick) / w.calendar.ticksPerYear;
    if (a > 33 || since > 6 || since < 0.3 || L.part) { if (since > 6 || a > 33) away.splice(i, 1); continue; }
    if (rng.chance(0.0075 * (L.sepAt != null && w.tick - L.sepAt < months(8) ? 3 : 1) * (L.left.why === 'university' ? 1.5 : 1))) later(w, rng.int(1, 27) * 144, 'boom', { pid: p.id });
  }
}

// ---------------------------------------------------------------- retirement
const retireHazard = (a) => (a < 58 ? 0 : a < 60 ? 0.002 : a < 65 ? 0.006 : a < 66 ? 0.022 : a < 68 ? 0.05 : a < 71 ? 0.09 : 0.16);
export function retirement(w, rng, people) {
  for (const p of people) {
    const q = p.ext.pop; if (q.activity !== 'employed' && q.activity !== 'unemployed' && q.activity !== 'home_family') continue;
    const a = ageOf(w, p); if (a < 58) continue;
    let h = retireHazard(a) * (q.contract === 'self_employed' ? 0.55 : 1) * (q.soc >= 6 ? 1.2 : 0.9); if (q.activity !== 'employed') h = Math.max(h, a >= 62 ? 0.05 : 0.01);
    if (!rng.chance(h)) continue;
    retire(w, p);
  }
}
export function retire(w, p) {
  const q = p.ext.pop; const was = q.occ;
  const b = p.workId != null ? w.buildings.get(p.workId) : null; if (b) { const i = b.employees.indexOf(p.id); if (i >= 0) b.employees.splice(i, 1); }
  p.workId = null; q.activity = 'retired'; q.hours = 0; q.workplace = { kind: 'none' }; q.pattern = null; q.contract = null; p.job = 'retired';
  w.emit('life.retire', { actors: [p.id], salience: 0.25, tags: ['work'], payload: { age: +ageOf(w, p).toFixed(1), was: was || '' } });
  w.addMemory(p, { type: 'work', text: 'Retired from work.', otherIds: [], weight: 0.3, importance: 3 }); bump(w, 'retire');
  rehome(w, p);
}

/** nursery (age 1-3): parents' working pattern decides */
export function preschool(w, rng, people) {
  for (const p of people) {
    const q = p.ext.pop, a = ageOf(w, p); if (a < 1 || a >= 4) continue;
    if (q.school && q.school.kind === 'nursery') continue;
    if (q.school && q.school.decided) continue;
    const ps = parentsOf(w, p), working = ps.length && ps.every((x) => x.ext.pop.activity === 'employed' || x.ext.pop.activity === 'student');
    const pr = a >= 3 ? 0.78 : working ? 0.6 : 0.18;
    q.school = rng.chance(pr) ? { kind: 'nursery', decided: true } : { kind: 'home', decided: true }; rehome(w, p);
    for (const x of ps) rehome(w, x);
  }
}
