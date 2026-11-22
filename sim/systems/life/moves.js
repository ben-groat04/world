// Household membership moves, departures to / arrivals from the Metropolis, and materialising off-map people (partners, newcomers).
// The housing package owns "where people live"; life emits INTENTS as commands (housing.moveTogether / housing.leaveHome / housing.returnHome / housing.separate / housing.inherit).
// When a command is not registered (housing not loaded) the helpers here are the fallback, so the life course never stalls.
import { annualPay, nlwFloor } from '../../pay.js';
import NAMES from '../../../content/larkfield/names.js';
import { personalityFor, drivesFor, skillsFor, interestsFor, healthFor } from '../../population/persona.js';
import { logn } from '../../population/util.js';
import { clamp, clamp01, wpick, fullName, ageOf, tieOf, dropTie, setTie, setOffTie, newMetro, hhOf, metro } from './util.js';

const rt = (w, name, a) => { if (w.commands.has(name)) { try { w.cmd(name, a); } catch (e) { /* routine layer absent in unit tests */ } } };

export function leaveHh(w, p) {
  const hh = hhOf(w, p); if (hh) { const i = hh.members.indexOf(p.id); if (i >= 0) hh.members.splice(i, 1); }
  const b = p.homeId != null ? w.buildings.get(p.homeId) : null; if (b) { const i = b.residents.indexOf(p.id); if (i >= 0) b.residents.splice(i, 1); }
}
/** Put p into household hh (membership, home building, current location if at home). */
export function joinHh(w, p, hh, role) {
  if (p.alive && w.commands.has('housing.join')) { try { if (w.cmd('housing.join', { pid: p.id, hh: hh.id, role: role || 'other', reason: 'family' })) { p.ext.pop.yearsAtAddress = 0; return; } } catch (e) { /* fall back to our own move */ } }
  const q = p.ext.pop, old = p.homeId, wasHome = p.locationId === old;
  leaveHh(w, p);
  q.hh = hh.id; q.unit = hh.unit; if (role) q.role = role; p.homeId = hh.bid;
  if (!hh.members.includes(p.id)) hh.members.push(p.id);
  const b = w.buildings.get(hh.bid); if (b && !b.residents.includes(p.id)) b.residents.push(p.id);
  if (p.alive && wasHome && old !== hh.bid) { const ob = w.buildings.get(old); if (ob) ob.occupants.delete(p); p.locationId = hh.bid; b.occupants.add(p); p.x = b.door.x; p.y = b.door.y; }
  q.yearsAtAddress = 0;
  rt(w, 'routine.rehome', { pid: p.id });
}
export function bedsOf(w, hh) { const u = w.map.lf.units[hh.unit]; return u ? u.bedrooms : hh.bedrooms || 2; }
export function bedsNeeded(w, hh, extra = 0) {
  let adults = 0, kids = 0;
  for (const id of hh.members) { const p = w.people.get(id); if (!p || !p.alive) continue; if (ageOf(w, p) >= 16) adults++; else kids++; }
  const couples = Math.floor(adults / 2); return Math.max(1, couples + (adults - 2 * couples) + Math.ceil(kids / 2)) + extra;
}

/** People leave the neighbourhood for the Metropolis (not dead): off-map from now on. Ties of on-map others to them become off-map placeholders. */
export function depart(w, people, reason, to) {
  for (const p of people) {
    if (!p.alive) continue;
    const map = {};
    for (const t of p.ext.pop.ties) {
      if (!t.on || typeof t.o !== 'number') continue;
      const h = w.people.get(t.o); if (!h || !h.alive) continue;
      const ht = tieOf(h, p.id); if (!ht) continue;
      const m = newMetro(w, h.id, { name: fullName(p), age: ageOf(w, p), sex: p.sex, rel: ht.rel || 'friend', where: to || 'elsewhere in the city', how: 'former neighbour', kin: ht.k === 'kin' });
      dropTie(h, p.id); h.ext.pop.ties.push({ o: m.id, k: ht.k, rel: ht.rel, t: ht.t, s: ht.s, v: 'moved away', on: 0 }); map[h.id] = m.id;
    }
    p.ext.life.away = { tick: w.tick, to: to || 'elsewhere in the city', map, hh: p.ext.pop.hh };
    if (w.commands.has('labour.depart')) w.cmd('labour.depart', { pid: p.id });
    leaveHh(w, p);
    w.removePerson(p); p.emigrated = true; p.emigratedTick = w.tick; p.emigratedTo = to || 'elsewhere in the city';
    w.stats.emigrated = (w.stats.emigrated || 0) + 1;
  }
}
/** Someone who left comes back to household hh (boomerang). */
export function revive(w, p, hh, role) {
  const away = p.ext.life.away || { map: {} };
  p.alive = true; p.deathTick = null; p.emigrated = undefined; p.emigratedTick = undefined; p.emigratedTo = undefined;
  p.homeId = hh.bid; p.locationId = null; p.cell = -1; p.wake = -2;
  p.ext.pop.hh = hh.id; p.ext.pop.unit = hh.unit; if (role) p.ext.pop.role = role; p.ext.pop.yearsAtAddress = 0;
  if (!hh.members.includes(p.id)) hh.members.push(p.id);
  w.addPerson(p);
  for (const hid of Object.keys(away.map)) { const h = w.people.get(+hid); if (!h || !h.alive) continue; const mt = tieOf(h, away.map[hid]); const old = p.ext.pop.ties.find((t) => t.o === h.id); dropTie(h, away.map[hid]); if (old) setTie(w, p, h, old.k, old.rel, tieOf(h, p.id) ? tieOf(h, p.id).rel : old.rel, old.t, old.s, old.v); else if (mt) setTie(w, p, h, mt.k, mt.rel, mt.rel, mt.t, mt.s, mt.v); }
  p.ext.life.away = null;
  rt(w, 'routine.rehome', { pid: p.id });
}

// ---------------------------------------------------------------- materialise an off-map person as a resident
const OFFMAP_OCC = (w) => w.pack.jobs.filter((o) => o.where === 'offmap' && !o.studentOnly && !o.gig && o.soc >= 2 && o.soc <= 9 && (!o.age || o.age[0] <= 28));
/** assign a plausible job (off-map workplace) to an adult without one; returns true if employed. Labour package may override via 'labour.assign'. */
export function assignWork(w, p, rng, o = {}) {
  const q0 = p.ext.pop;
  if (w.commands.has('labour.initPerson')) { q0.activity = 'employed'; try { w.cmd('labour.initPerson', { pid: p.id, job: true }); if (q0.occ) return true; } catch (e) { /* fall back to our own draw */ } }
  const q = p.ext.pop, age = ageOf(w, p), pack = w.pack, soc = pack.calibration.occupationSOC.composite;
  const cands = OFFMAP_OCC(w).filter((x) => !x.age || (age >= x.age[0] - 2 && age <= x.age[1] + 6));
  if (!cands.length) return false;
  const edu = q.edu === 'level4plus' ? 1 : q.edu === 'level3' ? 0.5 : 0.2;
  const wt = cands.map((x) => [x, (soc[pack.meta.socGroups[x.soc]] || 0.1) * (x.soc <= 3 ? 0.3 + 1.5 * edu : 1.2 - 0.6 * edu)]);
  const occ = wpick(rng, wt);
  const [lo, typ, hi] = occ.hours; const part = lo < 30 && rng.chance((occ.partTime || 0) + (age >= 60 ? 0.25 : 0) + (o.partTime || 0));
  q.occ = occ.id; q.soc = occ.soc; q.pattern = occ.pattern; q.activity = 'employed'; q.contract = occ.selfEmployed && rng.chance(occ.selfEmployed) ? 'self_employed' : 'permanent';
  q.hours = Math.round(part ? clamp(rng.gauss(22, 5), Math.max(8, lo), 29) : clamp(rng.gauss(Math.max(typ, 32), 3), Math.max(30, lo), hi));
  q.pay = Math.round(nlwFloor(logn(rng, occ.pay.p10, occ.pay.median, occ.pay.p90) * clamp(0.8 + 0.2 * (age - 20) / 10, 0.78, 1.18), q.contract, age));
  const dest = pack.meta.offmap[occ.dest], dm = dest ? dest.minutes : { bus: 25 };
  const mode = dm.rail && rng.chance(0.4) ? 'rail' : dm.bus ? 'bus' : dm.drive ? 'drive' : 'walk';
  q.workplace = occ.where === 'home' || occ.pattern === 'remote' ? { kind: 'home', mode: null, mins: 0 } : { kind: 'offmap', dest: occ.dest, mode, mins: Math.round((dm[mode] || 25) * rng.float(0.85, 1.25) + 6), hybrid: occ.pattern === 'office_hybrid' ? [1, 2, 3] : null };
  p.job = occ.label;
  return true;
}

/** Build the full ext.pop record for a person created mid-run (newborn, partner moving in, arrival). */
export function buildPop(w, p, o) {
  const age = ageOf(w, p), hh = o.hh, rng = o.rng, pack = w.pack, seg = pack.meta.segments.find((s) => s.id === hh.seg) || pack.meta.segments[0];
  const origin = o.origin || NAMES.pickOrigin(rng, o.group, 2026 - Math.floor(age), o.like || null);
  const pers = p.personality;
  p.needsTick = Number.MAX_SAFE_INTEGER;
  const h = age < 1 ? { general: 'very good', conds: [], disabled: false, limiting: 0, score: 0.97 } : healthFor(rng, pack.calibration, age, seg.health, false);
  const rel = o.religion || 'No religion';
  p.ext.pop = {
    hh: hh.id, unit: hh.unit, seg: hh.seg, role: o.role, eth: o.group, ethGroup: origin.group, sub: origin.sub, bornUK: o.bornUK ?? origin.bornUK, birthplace: o.bornUK === true ? 'United Kingdom' : origin.birthplace, arrived: o.arrived ?? null,
    religion: rel, religiosity: o.religiosity ?? +(rel === 'No religion' ? rng.float(0, 0.12) : rng.next() * 0.9).toFixed(2),
    activity: age < 16 ? 'child' : 'unemployed', occ: null, soc: 0, contract: null, hours: 0, pay: 0, edu: age < 16 ? 'in_school' : o.edu || 'level3', workplace: { kind: 'none' }, pattern: null, school: age < 4 ? { kind: 'home' } : null,
    health: { general: h.general, conds: h.conds, disabled: h.disabled, limiting: h.limiting }, fin: { gross: 0, net: 0, savings: 0, debt: 0, arrears: 0, studentLoan: 0, cc: 0, payday: 0, od: 0, pension: 0, sp: 1, priv: 0, stress: 0 },
    car: false, bike: false, pets: { dogs: hh.dogs || 0, cats: hh.cats || 0 }, drives: age >= 14 ? drivesFor(rng, pack, pers, age, hh.seg) : {}, yearsAtAddress: 0, grewUp: o.grewUp || null, ties: [], life: null, K: [4, 13],
  };
  p.health = h.score;
  p.skills = skillsFor(rng, age, p.ext.pop.edu, null, pers); p.skills.driving = 0; p.skills.languages = p.ext.pop.bornUK ? 0 : rng.int(1, 3);
  p.interests = interestsFor(rng, age, p.sex, rel !== 'No religion' && p.ext.pop.religiosity > 0.45, false);
  p.values = { tradition: clamp01(rng.gauss(0.45 + 0.2 * p.ext.pop.religiosity, 0.18)), wealth: clamp01(rng.gauss(0.5, 0.2)), family: clamp01(rng.gauss(0.6, 0.2)), freedom: clamp01(rng.gauss(0.5, 0.2)), community: clamp01(rng.gauss(0.5, 0.2)), piety: p.ext.pop.religiosity };
  p.mood = clamp(0.25 + 0.5 * (0.5 - pers.neuroticism) + rng.gauss(0, 0.15), -0.6, 0.8);
  p.job = age < 5 ? 'child' : age < 16 ? 'student' : 'unemployed';
  return p.ext.pop;
}

/** A Metropolis placeholder (partner, friend) becomes a resident of household hh. Returns the new Person or null. */
export function materialise(w, m, hh, role, rng, o = {}) {
  const age = metroAgeNow(w, m), owner = w.people.get(m.owner);
  const [first, ...rest] = m.name.split(' '); const last = rest.join(' ') || (owner ? owner.lastName : 'Smith');
  const pers = personalityFor(rng, age, m.sex);
  const p = w.createPerson({ sex: m.sex, firstName: first, lastName: last, homeId: hh.bid, birthTick: w.tick - Math.round(age * w.calendar.ticksPerYear) - rng.int(0, 300), personality: pers, money: 0 });
  // the name was drawn from a tradition when the placeholder was made (m.g / m.sub): keep it, so first name, surname and birthplace stay together; older placeholders without one share the owner's tradition when of the same group
  const g = m.g || (owner && rng.chance(0.72) ? owner.ext.pop.eth : wpick(rng, Object.entries(w.pack.calibration.ethnicity.detail).map(([k, v]) => [NAMES.ETHNICITY_TO_GROUP[k], v])));
  const like = m.sub ? { sub: m.sub } : owner && g === owner.ext.pop.eth ? owner.ext.pop : null;
  const origin = NAMES.pickOrigin(rng, g, 2026 - Math.floor(age), like);
  const religion = owner && o.sameFaith ? owner.ext.pop.religion : wpick(rng, Object.entries(NAMES.RELIGION_BY_GROUP[g === 'mixed' ? 'mixed' : g] || { 'No religion': 1 }));
  buildPop(w, p, { hh, rng, group: g, origin, role, religion, bornUK: origin.bornUK, edu: o.edu || wpick(rng, [['level4plus', 0.45], ['level3', 0.25], ['level2', 0.2], ['apprenticeship', 0.1]]), grewUp: m.where, arrived: origin.bornUK ? null : w.tick - Math.round(rng.float(1, 8) * w.calendar.ticksPerYear) });
  p.ext.pop.fin.savings = Math.round(o.money ?? rng.float(200, 4000));
  if (age >= 30) p.ext.pop.fin.pension = Math.round((age - 22) * 6000 * 0.045 * rng.float(0.3, 1.4));
  if (age >= 18 && age < 67) assignWork(w, p, rng); else if (age >= 67) { p.ext.pop.activity = 'retired'; p.job = 'retired'; }
  if (p.ext.pop.activity === 'employed') { const f = p.ext.pop.fin; f.gross = Math.round(annualPay(p.ext.pop)); f.net = Math.round(f.gross * 0.78); }
  return p;
}
export const metroAgeNow = (w, m) => m.age + (w.tick - (m.t0 ?? 0)) / w.calendar.ticksPerYear;

/** give an arrival their savings (call AFTER world.addPerson: the ledger needs the person to exist) */
export function fundArrival(w, p) { const sv = p.ext.pop.fin.savings; if (sv > 0) w.ledger.transfer('metropolis', p.id, sv, 'arrival_savings'); }

/** A few off-map ties for a person who just arrived (friends, parents) so they are not socially empty. */
export function giveNetwork(w, p, rng) {
  const q = p.ext.pop, age = ageOf(w, p);
  const names = (sex, kin) => { const o = NAMES.pickOrigin(rng, q.eth, 2026 - Math.floor(age), kin ? q : null); return NAMES.pickName(rng, o, sex, 2026 - Math.floor(age)).full; };
  const mk = (rel, ageV, sex, how, kin) => newMetro(w, p.id, { name: names(sex, kin), age: ageV, sex, rel, how, kin, where: wpick(rng, [['elsewhere in the city', 5], ['another UK city', 3], ['a nearby town', 2]]) });
  for (let i = 0; i < 3 + rng.int(0, 2); i++) { const sx = rng.chance(0.5) ? 'F' : 'M'; const m = mk('friend', clamp(age + rng.gauss(0, 4), 18, 80), sx, wpick(rng, [['work', 3], ['university', 2], ['school', 2], ['club/gym', 1]])); setOffTie(p, m.id, 'friend', 'friend', i < 3 ? 1 : 2, 0.5 + rng.float(0, 0.3), m.how); }
  if (rng.chance(clamp(1.05 - Math.max(0, age - 25) * 0.012, 0.2, 0.95))) { const m = mk('mother', age + rng.int(22, 34), 'F', 'family', true); setOffTie(p, m.id, 'kin', 'mother', 2, 0.6, 'family'); }
  if (rng.chance(clamp(1.0 - Math.max(0, age - 25) * 0.015, 0.15, 0.9))) { const m = mk('father', age + rng.int(24, 38), 'M', 'family', true); setOffTie(p, m.id, 'kin', 'father', 2, 0.5, 'family'); }
}
export { metro };
