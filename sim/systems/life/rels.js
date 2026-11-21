// Relationships: how people meet (apps, friends, work, chance, nights out, uni, neighbourhood, family introductions; most partners are OFF-MAP), how couples progress
// (dating -> living together / engaged -> married), how they end (breakup, separation, divorce) and the ripples. LGBTQ+ couples use the same machinery.
import NAMES from '../../../content/larkfield/names.js';
import { clamp, clamp01, wpick, ageOf, fullName, later, months, days, years, setTie, setOffTie, dropTie, tieOf, metro, newMetro, hhOf, rec, bump, closeOnMap, yearsSince, metroAge } from './util.js';
import { leaveHh, joinHh, depart, materialise, giveNetwork, fundArrival, bedsOf, bedsNeeded, metroAgeNow } from './moves.js';

export const wantsSex = (L, sex) => (L.or === 'S' ? (sex === 'M' ? 'F' : 'M') : L.or === 'G' ? sex : null); // null = either (bi/other)
export function accepts(L, mySex, otherSex) { return L.or === 'S' ? mySex !== otherSex : L.or === 'G' ? mySex === otherSex : true; }
const FAITHS = new Set(['Muslim', 'Hindu', 'Sikh']);
const arranged = (p) => FAITHS.has(p.ext.pop.religion) && p.ext.pop.religiosity > 0.55;

/** monthly probability that a single person starts a relationship (before channel/pool effects) */
export function seekRate(w, p, age) {
  const L = p.ext.life, q = p.ext.pop;
  let r = age < 17 ? 0 : age < 20 ? 0.017 : age < 25 ? 0.03 : age < 30 ? 0.034 : age < 35 ? 0.031 : age < 40 ? 0.025 : age < 50 ? 0.016 : age < 60 ? 0.0095 : age < 70 ? 0.0055 : 0.0025;
  if (r === 0) return 0;
  const E = p.personality.extraversion;
  r *= 0.65 + 0.7 * E; r *= 0.75 + 0.5 * (p.genes ? p.genes.looks : 0.5);
  if (L.or === 'G') r *= 0.75;
  if (L.sepAt != null && w.tick - L.sepAt < months(5)) r *= 0.35;
  if (L.widowedAt != null && w.tick - L.widowedAt < months(18)) r *= 0.1;
  const kids = (p.family.childrenIds || []).reduce((n, id) => { const c = w.people.get(id); return n + (c && c.alive && ageOf(w, c) < 5 ? 2 : c && c.alive && ageOf(w, c) < 16 ? 1 : 0); }, 0);
  r *= kids >= 2 ? 0.55 : kids === 1 ? 0.75 : 1;
  if (q.health && q.health.limiting === 2) r *= 0.6;
  if (q.seg === 'students') r *= 1.25; else if (q.seg === 'recent_arrivals') r *= 0.8; else if (q.seg === 'older_longterm') r *= 0.8;
  if (L.boost > w.tick) r *= 1.7;
  if (arranged(p) && age < 38) r *= 1.15;
  return r * (w.lf.life.seekScale || 1);
}
const APP_P = (a) => (a < 30 ? 0.16 : a < 40 ? 0.22 : a < 50 ? 0.12 : a < 60 ? 0.06 : 0.03);
function pickChannel(w, rng, p, age) {
  const q = p.ext.pop, st = q.seg === 'students', emp = q.activity === 'employed' && q.workplace.kind !== 'none';
  const ch = [['app', APP_P(age) * (q.seg === 'older_longterm' ? 0.4 : 1)], ['friends', 0.2], ['work', emp ? 0.2 : 0.02], ['chance', 0.14], ['nightout', age < 35 ? 0.22 : age < 50 ? 0.08 : 0.02], ['uni', st ? 0.45 : age < 24 ? 0.1 : 0.02], ['community', 0.06 + (age > 55 ? 0.14 : 0) + (q.religiosity > 0.5 ? 0.08 : 0)], ['family', arranged(p) ? 0.3 : 0.015]];
  return wpick(rng, ch);
}
const ON_P = { app: 0.1, friends: 0.3, work: 0.04, chance: 0.5, nightout: 0.05, uni: 0.1, community: 0.85, family: 0.12 };

function sim(w, a, b, ageA, ageB) {
  const A = a.ext.pop, B = b.ext.pop; let x = Math.exp(-Math.pow((ageA - ageB) / 6, 2)) + 0.02;
  if (A.seg === B.seg) x *= 1.7; if (A.eth === B.eth) x *= 1.6; if (A.religion === B.religion && A.religion !== 'No religion') x *= 1.5;
  const lv = { none: 0, level1: 1, level2: 2, apprenticeship: 2, level3: 3, level4plus: 4 }; x *= Math.exp(-Math.abs((lv[A.edu] ?? 2) - (lv[B.edu] ?? 2)) / 3);
  let sh = 0; for (const i of a.interests) if (b.interests.includes(i)) sh++; x *= 1 + 0.3 * sh;
  const t = tieOf(a, b.id); if (t) x *= t.k === 'kin' ? 0 : 3.5;
  if (A.workplace.kind === 'onmap' && A.workplace.bid === B.workplace.bid) x *= 3;
  return x;
}

/** off-map partner placeholder */
export function makeOffPartner(w, rng, p, how) {
  const L = p.ext.life, age = ageOf(w, p), q = p.ext.pop;
  let sex = wantsSex(L, p.sex); if (sex === null) sex = rng.chance(0.58) ? (p.sex === 'M' ? 'F' : 'M') : p.sex;
  const gap = (sex === p.sex ? 0 : p.sex === 'F' ? 2.2 : -2.2) + rng.gauss(0, 4.2), pa = clamp(age + gap, 17, 88);
  const g = rng.chance(0.78) ? q.eth : wpick(rng, Object.entries(w.pack.calibration.ethnicity.detail).map(([k, v]) => [NAMES.ETHNICITY_TO_GROUP[k], v]));
  const o = NAMES.pickOrigin(rng, g, 2026 - Math.floor(pa)), nm = NAMES.pickName(rng, o, sex, 2026 - Math.floor(pa));
  return newMetro(w, p.id, { name: nm.full, age: pa, sex, rel: 'partner', where: wpick(rng, [['elsewhere in the city', 5], ['the city centre', 3], ['another UK city', 2], ['a nearby town', 2]]), how, freq: 'daily messages' });
}

export function matchmaking(w, rng, people) {
  const pool = { M: [], F: [] };
  const seekers = [];
  for (const p of people) {
    const L = p.ext.life, age = ageOf(w, p);
    if (age < 17 || L.part || L.away || (L.dying)) continue;
    if (p.ext.hl && p.ext.hl.dying) continue;
    pool[p.sex].push(p); seekers.push([p, age]);
  }
  for (const [p, age] of seekers) {
    const r = seekRate(w, p, age); if (r <= 0 || !rng.chance(r)) continue;
    const L = p.ext.life, how = pickChannel(w, rng, p, age);
    let onP = ON_P[how]; if (how === 'work' && p.ext.pop.workplace.kind === 'onmap') onP = 0.5;
    let partner = null;
    if (rng.chance(onP)) {
      const ws = wantsSex(L, p.sex), sexes = ws ? [ws] : ['M', 'F'], cands = [];
      for (let k = 0; k < 40 && cands.length < 8; k++) {
        const arr = pool[sexes[sexes.length === 1 ? 0 : rng.int(0, 1)]]; if (!arr.length) break; const c = arr[rng.int(0, arr.length - 1)];
        if (c === p || c.ext.life.part || cands.some((x) => x[0] === c) || c.ext.pop.hh === p.ext.pop.hh || !accepts(c.ext.life, c.sex, p.sex)) continue;
        const ca = ageOf(w, c), gap = Math.abs(ca - age); if (gap > Math.max(7, age * 0.22)) continue;
        cands.push([c, sim(w, p, c, age, ca)]);
      }
      if (cands.length) { const c = rng.weighted(cands, cands.map((x) => x[1]))[0]; if (c && rng.chance(0.6)) partner = c; }
      if (!partner && !rng.chance(0.25)) continue; // wanted a local, nobody suitable: no match this month
    }
    later(w, rng.int(1, 27) * 144, 'rel.start', { a: p.id, b: partner ? partner.id : null, how });
  }
}
export function startCouple(w, d) {
  const rng = w.rngFor('life.start'), a = w.people.get(d.a); if (!a || !a.alive) return;
  const La = a.ext.life; if (La.part) return;
  if (d.b != null) {
    const b = w.people.get(d.b); if (!b || !b.alive || b.ext.life.part) return;
    return formCouple(w, a, b, d.how);
  }
  const m = makeOffPartner(w, rng, a, d.how);
  La.part = { id: m.id, on: false, st: 'dating', lat: true, since: w.tick, how: d.how }; La.nPart++; a.romance = { partnerId: null, status: 'dating', sinceTick: w.tick };
  setOffTie(a, m.id, 'partner', 'partner', 1, 0.5, d.how);
  La.part.ev = w.emit('life.couple', { actors: [a.id], salience: 0.3, tags: ['romance'], payload: { how: d.how, on: false, name: m.name } });
  rec(w, 'unions', [w.tick, 'off', +ageOf(w, a).toFixed(1), m.age, d.how, a.sex, m.sex]); bump(w, 'couples_off');
  w.addMemory(a, { type: 'romance', text: `Started seeing ${m.name}${d.how === 'app' ? ' (met on a dating app)' : ''}.`, otherIds: [], weight: 0.7, importance: 3 });
}
export function formCouple(w, a, b, how, st = 'dating') {
  const La = a.ext.life, Lb = b.ext.life;
  La.part = { id: b.id, on: true, st, lat: true, since: w.tick, how }; Lb.part = { id: a.id, on: true, st, lat: true, since: w.tick, how };
  La.nPart++; Lb.nPart++;
  a.romance = { partnerId: b.id, status: 'dating', sinceTick: w.tick }; b.romance = { partnerId: a.id, status: 'dating', sinceTick: w.tick };
  setTie(w, a, b, 'partner', 'partner', 'partner', 1, 0.55, how);
  const ev = w.emit('life.couple', { actors: [a.id, b.id], salience: 0.45, tags: ['romance'], payload: { how, on: true, name: fullName(b) } });
  La.part.ev = Lb.part.ev = ev;
  rec(w, 'unions', [w.tick, 'on', +ageOf(w, a).toFixed(1), +ageOf(w, b).toFixed(1), how, a.sex, b.sex]); bump(w, 'couples_on');
  for (const [x, y] of [[a, b], [b, a]]) w.addMemory(x, { type: 'romance', text: `Started seeing ${y.firstName}.`, otherIds: [y.id], weight: 0.8, importance: 3 });
  return ev;
}

// ---------------------------------------------------------------- couple dynamics (monthly)
const ageF = (a, tbl) => { for (const [lim, v] of tbl) if (a < lim) return v; return tbl[tbl.length - 1][1]; };
export function divorceHazard(durYears, ageAtMarriage, kidsU5, stress) {
  let h = durYears < 2 ? 0.0006 : durYears < 10 ? 0.0016 : durYears < 20 ? 0.0011 : 0.0005;
  h *= ageAtMarriage < 25 ? 1.9 : ageAtMarriage < 30 ? 1.25 : 1; if (kidsU5) h *= 0.8; h *= 1 + 0.7 * (stress || 0);
  return h * 1.05;
}
export const cohabEndHazard = (dur, age, kids) => (dur < 3 ? 0.0075 : 0.0042) * (age < 25 ? 1.5 : age > 40 ? 0.7 : 1) * (kids ? 0.65 : 1);
export const datingEndHazard = (monthsIn, age) => (monthsIn < 3 ? 0.07 : monthsIn < 12 ? 0.038 : 0.02) * (age < 22 ? 1.5 : age > 40 ? 0.7 : 1);

function moneyStress(w, p) { const m = w.sys && w.sys.money; if (!m) return 0; try { const x = m.query.pressure(p.id); return x ? x.stress || 0 : 0; } catch (e) { return 0; } }
const kidsIn = (w, p, maxAge) => (p.family.childrenIds || []).some((id) => { const c = w.people.get(id); return c && c.alive && ageOf(w, c) < maxAge; });

export function coupleStep(w, rng, people) {
  for (const p of people) {
    const L = p.ext.life, pt = L.part; if (!pt) continue;
    const other = pt.on ? w.people.get(pt.id) : null;
    if (pt.on && (!other || !other.alive)) { L.part = null; continue; }
    if (pt.on && p.id > pt.id) continue; // process each on-map couple once (lower id owns it)
    const age = ageOf(w, p), dur = yearsSince(w, pt.since), mIn = dur * 12;
    const partnerAge = pt.on ? ageOf(w, other) : metroAge(w, metro(w, pt.id) || { age, t0: w.tick });
    const minAge = Math.min(age, partnerAge);
    if (pt.st === 'dating') {
      if (rng.chance(datingEndHazard(mIn, minAge))) { later(w, rng.int(1, 27) * 144, 'rel.end', { a: p.id, how: 'dating' }); continue; }
      if (mIn < 3.5) continue;
      const kids = kidsIn(w, p, 16) || (other && kidsIn(w, other, 16));
      let pc = 0.07 * ageF(minAge, [[19, 0.1], [22, 0.5], [25, 0.85], [32, 1.25], [42, 1.0], [200, 0.5]]) * (kids ? 0.55 : 1) * (pt.on ? 1.2 : 1) * (pt.lat && mIn > 30 ? 0.6 : 1);
      if (p.ext.life.boost > w.tick) pc *= 1.5;
      const trad = arranged(p) || (other && arranged(other));
      if (trad) { if (rng.chance(0.032 * ageF(minAge, [[20, 0.3], [24, 1], [200, 1.2]]))) later(w, rng.int(1, 20) * 144, 'rel.engage', { a: p.id }); continue; }
      if (rng.chance(pc)) later(w, rng.int(1, 27) * 144, 'rel.cohab', { a: p.id });
      else if (mIn > 14 && rng.chance(0.0035 * ageF(minAge, [[24, 0.4], [40, 1], [200, 0.6]]))) later(w, rng.int(1, 20) * 144, 'rel.engage', { a: p.id });
    } else if (pt.st === 'cohab') {
      const kids = kidsIn(w, p, 16) || (other && kidsIn(w, other, 16));
      if (rng.chance(cohabEndHazard(dur, minAge, kids))) { later(w, rng.int(1, 27) * 144, 'rel.end', { a: p.id, how: 'cohab' }); continue; }
      const preg = (p.ext.life.preg || (other && other.ext.life.preg)) ? 3.5 : 1;
      let pm = 0.0058 * preg * ageF(minAge, [[22, 0.3], [25, 0.55], [30, 1.0], [40, 1.35], [55, 0.7], [200, 0.25]]) * (dur < 1 ? 0.45 : 1) * (p.ext.pop.religiosity > 0.5 ? 1.5 : 1) * (kids ? 1.25 : 1);
      if (rng.chance(pm)) later(w, rng.int(1, 20) * 144, 'rel.engage', { a: p.id });
    } else if (pt.st === 'engaged') {
      if (rng.chance(0.0035)) later(w, rng.int(1, 27) * 144, 'rel.end', { a: p.id, how: 'engaged' });
    } else if (pt.st === 'married') {
      const mar = L.marAt || pt.since, durM = yearsSince(w, mar), stress = Math.max(moneyStress(w, p), other ? moneyStress(w, other) : 0);
      const a0 = age - durM, h = divorceHazard(durM, a0, kidsIn(w, p, 5), stress) * (L.ex ? 1.4 : 1);
      if (rng.chance(h)) later(w, rng.int(1, 27) * 144, 'rel.end', { a: p.id, how: 'married' });
    }
  }
}

// ---------------------------------------------------------------- queued relationship handlers
export const relHandlers = {
  'rel.start': startCouple,
  'rel.cohab': (w, d) => cohabit(w, d.a),
  'rel.engage': (w, d) => engage(w, d.a),
  'rel.wed': (w, d) => wedding(w, d.a),
  'rel.end': (w, d) => endRel(w, d.a, d.how, d.why),
  'sep.leave': (w, d) => sepLeave(w, d),
  'rel.moved': (w, d) => cohabit(w, d.a, true),
};
const partnerPerson = (w, p) => { const pt = p.ext.life.part; return pt && pt.on ? w.people.get(pt.id) : null; };

export function engage(w, aid) {
  const a = w.people.get(aid); if (!a || !a.alive) return; const La = a.ext.life, pt = La.part; if (!pt || pt.st === 'engaged' || pt.st === 'married') return;
  const b = partnerPerson(w, a), rng = w.rngFor('life.engage');
  pt.st0 = pt.st; pt.st = 'engaged'; if (b) { b.ext.life.part.st0 = b.ext.life.part.st; b.ext.life.part.st = 'engaged'; b.romance.status = 'engaged'; }
  a.romance.status = 'engaged';
  const ev = w.emit('life.engaged', { actors: b ? [a.id, b.id] : [a.id], salience: 0.5, cause: pt.ev || 0, tags: ['romance'], payload: { after: +yearsSince(w, pt.since).toFixed(1) } });
  pt.ev = ev; if (b) b.ext.life.part.ev = ev;
  const delay = months(rng.float(4, 15)); later(w, delay, 'rel.wed', { a: a.id }); bump(w, 'engagements');
}
export function wedding(w, aid) {
  const a = w.people.get(aid); if (!a || !a.alive) return; const La = a.ext.life, pt = La.part; if (!pt || pt.st !== 'engaged') return;
  const b = partnerPerson(w, a), rng = w.rngFor('life.wed');
  const kind = (a.ext.pop.religiosity > 0.5 || (b && b.ext.pop.religiosity > 0.5)) && rng.chance(0.6) ? 'religious' : 'civil';
  const A = [a, b].filter(Boolean);
  for (const x of A) { const lp = x.ext.life.part; lp.st = 'married'; lp.marAt = w.tick; x.ext.life.marAt = w.tick; x.ext.life.mar = 'married'; if (x.ext.life.firstMar == null) x.ext.life.firstMar = w.tick; x.romance.status = 'married'; if (!lp.lat) x.family.spouseId = lp.id; }
  if (!b) { La.part.st = 'married'; La.part.marAt = w.tick; const m = metro(w, pt.id); if (m) m.rel = 'spouse'; }
  const age = ageOf(w, a);
  if (b && b.sex !== a.sex) { const wf = a.sex === 'F' ? a : b; if (rng.chance(0.6) && wf.lastName !== (a.sex === 'F' ? b : a).lastName) { wf.ext.life.maiden = wf.lastName; wf.lastName = (a.sex === 'F' ? b : a).lastName; } }
  const ev = w.emit('life.marriage', { actors: b ? [a.id, b.id] : [a.id], salience: 0.6, cause: pt.ev || 0, tags: ['romance', 'family'], payload: { kind, how: pt.how || '', first: La.firstMar === w.tick } });
  pt.ev = ev; if (b) b.ext.life.part.ev = ev;
  rec(w, 'marriages', [w.tick, +age.toFixed(1), b ? +ageOf(w, b).toFixed(1) : null, a.sex, b ? b.sex : null, kind, !!b]); bump(w, 'marriages');
  for (const x of A) w.addMemory(x, { type: 'romance', text: 'Got married.', otherIds: b ? [b.id === x.id ? a.id : b.id] : [], weight: 0.95, importance: 4 });
  // LAT couples (religious / arranged-style) move in after the wedding
  if (pt.lat) later(w, months(rng.float(0.5, 3)), 'rel.moved', { a: a.id });
}

/** couple starts living together. force = already decided (after a wedding). */
export function cohabit(w, aid, force) {
  const a = w.people.get(aid); if (!a || !a.alive) return; const La = a.ext.life, pt = La.part; if (!pt || !pt.lat) return;
  const rng = w.rngFor('life.cohab'), b = partnerPerson(w, a);
  if (b) return cohabOn(w, rng, a, b);
  const m = metro(w, pt.id); if (!m) { La.part = null; return; }
  const q = a.ext.pop, hh = hhOf(w, a), age = ageOf(w, a);
  const dependants = (hh ? hh.members : []).map((id) => w.people.get(id)).filter((c) => c && c.alive && c.id !== a.id && ageOf(w, c) < 18 && (c.family.motherId === a.id || c.family.fatherId === a.id));
  const room = hh && bedsNeeded(w, hh, 1) <= bedsOf(w, hh) + 1;
  const ownTenancy = q.role === 'head' || q.role === 'partner';
  const wts = [['in', ownTenancy && room ? 0.44 : !ownTenancy && room && hh.members.length <= 3 ? 0.1 : 0], ['out', dependants.length ? 0.3 : 0.45], ['wait', force ? 0.02 : 0.14]];
  const how = wpick(rng, wts);
  if (how === 'wait') { pt.waited = (pt.waited || 0) + 1; return; }
  if (how === 'in') {
    const np = materialise(w, m, hh, 'partner', rng, { sameFaith: a.ext.pop.religiosity > 0.5 && rng.chance(0.7) });
    w.addPerson(np); fundArrival(w, np); w.cmd('routine.init', { pid: np.id });
    np.ext.life = { or: La.or === 'S' ? 'S' : (np.sex === a.sex ? (La.or === 'B' || La.or === 'O' ? 'B' : 'G') : 'B'), mar: 'never', part: { id: a.id, on: true, st: 'cohab', lat: false, since: pt.since, how: pt.how, ev: pt.ev }, nPart: 1 + (rng.chance(0.4) ? 1 : 0), parity: 0, firstCohab: w.tick, firstMar: null, firstBirth: null, preg: null, lastBirth: null, desire: clamp01(0.4 + rng.gauss(0, 0.2)), away: null, left: null, caring: null, boost: 0, ex: 0, sepAt: null, widowedAt: null, planKid: 0, arrivedFor: a.id };
    if (La.or === 'G' && np.sex !== a.sex) La.or = 'B';
    if (np.sex === a.sex && La.or === 'S') La.or = 'B';
    np.ext.hl = null;
    m.gone = true; m.rel = 'partner (moved in)'; dropTie(a, m.id);
    setTie(w, a, np, 'partner', 'partner', 'partner', 1, 0.7, pt.how); giveNetwork(w, np, rng);
    pt.id = np.id; pt.on = true; pt.st = pt.st === 'engaged' || pt.st === 'married' ? pt.st : 'cohab'; pt.lat = false;
    a.family.spouseId = np.id; np.family.spouseId = a.id; a.romance.partnerId = np.id; np.romance = { partnerId: a.id, status: pt.st === 'married' ? 'married' : a.romance.status, sinceTick: pt.since };
    if (pt.st === 'married') { np.ext.life.mar = 'married'; np.ext.life.part.marAt = pt.marAt; np.ext.life.marAt = pt.marAt; }
    if (La.firstCohab == null) La.firstCohab = w.tick;
    w.emit('life.move_in', { actors: [np.id], salience: 0.3, cause: pt.ev || 0, tags: ['romance'], payload: { from: m.where, reason: 'partner' } });
    w.emit('life.cohabit', { actors: [a.id, np.id], salience: 0.4, cause: pt.ev || 0, tags: ['romance'], payload: { how: 'partner moved in', on: true } });
    rec(w, 'cohab', [w.tick, +age.toFixed(1), 'in', a.sex]); bump(w, 'cohab_in');
    return;
  }
  // 'out': a (and dependants) move to the partner's place elsewhere
  // housing owns where people live: ask it to move the partner (and dependants) to the partner's place elsewhere
  if (!force && (q.role === 'head' && (hh ? hh.members.filter((id) => { const c = w.people.get(id); return c && c.alive && ageOf(w, c) >= 18; }).length : 0) <= 1 && dependants.length === 0 && q.activity === 'employed' && rng.chance(0.25))) { pt.waited = (pt.waited || 0) + 1; return; }
  const r = w.cmd('housing.leaveHome', { pid: a.id, reason: 'partner', dependants: dependants.map((c) => c.id), dest: m.where });
  if (!r || !r.ok) { pt.waited = (pt.waited || 0) + 1; return; }
  w.emit('life.move_out', { actors: [a.id], salience: 0.4, cause: pt.ev || 0, tags: ['romance', 'move'], payload: { to: m.where, reason: 'partner' } });
  finishLeave(w, a, pt, m, age, 'out');
}
function finishLeave(w, a, pt, m, age, how) {
  const La = a.ext.life; if (La.firstCohab == null) La.firstCohab = w.tick; pt.st = pt.st === 'engaged' || pt.st === 'married' ? pt.st : 'cohab'; pt.lat = false;
  rec(w, 'cohab', [w.tick, +age.toFixed(1), how, a.sex]); bump(w, 'cohab_out');
  w.emit('life.cohabit', { actors: [a.id], salience: 0.35, cause: pt.ev || 0, tags: ['romance'], payload: { how: 'moved to partner', on: false } });
  m.rel = 'partner (lives with)';
}
function cohabOn(w, rng, a, b) {
  const La = a.ext.life, Lb = b.ext.life, pt = La.part, ha = hhOf(w, a), hb = hhOf(w, b), age = ageOf(w, a);
  if (!pt.lat) return;
  if (ha.id === hb.id) { settle(w, a, b, pt); return; }
  const r = w.cmd('housing.moveTogether', { a: a.id, b: b.id, reason: 'couple', cause: pt.ev || 0, force: (pt.waited || 0) >= 4 });
  if (r && r.ok) { settle(w, a, b, pt); if (r.how === 'joined') w.emit('life.move_in', { actors: [r.host === a.id ? b.id : a.id], salience: 0.25, tags: ['romance', 'move'], payload: { from: 'down the road', reason: 'partner' } }); return; }
  pt.waited = (pt.waited || 0) + 1; // no room in either home yet: they keep looking
}
function settle(w, a, b, pt, gone) {
  const age = ageOf(w, a);
  for (const x of [a, b]) { const lp = x.ext.life.part; lp.st = lp.st === 'engaged' || lp.st === 'married' ? lp.st : 'cohab'; lp.lat = false; if (x.ext.life.firstCohab == null) x.ext.life.firstCohab = w.tick; x.family.spouseId = lp.id; }
  rec(w, 'cohab', [w.tick, +age.toFixed(1), 'on', a.sex]); bump(w, 'cohab_on');
  w.emit('life.cohabit', { actors: [a.id, b.id], salience: 0.4, cause: pt.ev || 0, tags: ['romance'], payload: { how: 'moved in together', on: true } });
  for (const x of [a, b]) w.addMemory(x, { type: 'romance', text: `Moved in with ${x === a ? b.firstName : a.firstName}.`, otherIds: [x === a ? b.id : a.id], weight: 0.7, importance: 3 });
}

// ---------------------------------------------------------------- endings
export function endRel(w, aid, how, why) {
  const a = w.people.get(aid); if (!a || !a.alive) return; const La = a.ext.life, pt = La.part; if (!pt) return;
  const rng = w.rngFor('life.end'), b = pt.on ? w.people.get(pt.id) : null, kind = pt.st;
  const dur = yearsSince(w, pt.since), married = kind === 'married';
  const ev = w.emit(married ? 'life.divorce' : 'life.breakup', { actors: b ? [a.id, b.id] : [a.id], salience: married ? 0.65 : 0.45, cause: pt.ev || 0, tags: ['romance', 'ending'], payload: { years: +dur.toFixed(1), kind } });
  const ids = [a, b].filter(Boolean);
  for (const x of ids) {
    const lx = x.ext.life; lx.part = null; lx.ex++; lx.sepAt = w.tick; if (married) { lx.mar = 'divorced'; x.family.exSpouseIds.push(x === a ? (b ? b.id : -1) : a.id); }
    x.family.spouseId = null; x.romance = { partnerId: null, status: null, sinceTick: w.tick };
    w.addMemory(x, { type: 'romance', text: married ? 'Marriage ended.' : `Relationship ${b ? 'with ' + (x === a ? b.firstName : a.firstName) + ' ' : ''}ended.`, otherIds: b ? [x === a ? b.id : a.id] : [], weight: -0.7, importance: 4 });
    w.moodlet(x, 'breakup', 'Heartbroken', -0.45, months(2)); if (w.commands.has('health.stress')) w.cmd('health.stress', { pid: x.id, amount: married ? 0.55 : 0.35, why: 'breakup', cause: ev });
  }
  if (b) {
    setTie(w, a, b, 'ex', 'ex', 'ex', 3, 0.12, 'former partner');
    const sharedKids = (a.family.childrenIds || []).filter((id) => (b.family.childrenIds || []).includes(id));
    // friends take sides
    for (const fa of closeOnMap(w, a, 2, 10)) { if (fa === b.id) continue; const f = w.people.get(fa), tb = tieOf(f, b.id), ta = tieOf(f, a.id); if (tb && ta && tb.t <= 2) { const loser = rng.chance(0.5) ? tb : ta; loser.s = clamp(loser.s - rng.float(0.15, 0.35), 0.05, 1); if (loser.s < 0.3 && loser.t < 3) loser.t = 3; } }
    // the one who is not the main carer of the children leaves the shared home (after a while)
    const ha = hhOf(w, a), hb = hhOf(w, b);
    if (ha && hb && ha.id === hb.id) {
      let leaver = null;
      const kids = ha.members.map((id) => w.people.get(id)).filter((c) => c && c.alive && ageOf(w, c) < 16 && (c.family.motherId === a.id || c.family.fatherId === a.id || c.family.motherId === b.id || c.family.fatherId === b.id));
      const mom = a.sex === 'F' ? a : b.sex === 'F' ? b : null, other = (x) => (x === a ? b : a);
      if (kids.length) leaver = mom && a.sex !== b.sex && rng.chance(0.82) ? other(mom) : rng.chance(0.5) ? a : b;
      else { const ownerOf = (x) => (x.ext.pop.role === 'head' ? 1 : 0) + rng.next() * 0.5; leaver = ownerOf(a) >= ownerOf(b) ? b : a; }
      later(w, months(rng.float(0.5, 5)), 'sep.leave', { pid: leaver.id, other: other(leaver).id });
    }
  } else { const m = metro(w, pt.id); if (m) { m.rel = 'ex-partner'; const t = tieOf(a, m.id); if (t) { t.rel = 'ex'; t.t = 3; t.s = 0.1; } } }
  rec(w, married ? 'divorces' : 'breakups', [w.tick, +ageOf(w, a).toFixed(1), +dur.toFixed(2), kind, !!b]); bump(w, married ? 'divorces' : 'breakups');
}
export function sepLeave(w, d) {
  const p = w.people.get(d.pid), o = w.people.get(d.other); if (!p || !p.alive) return;
  const hh = hhOf(w, p); if (!hh || (o && o.alive && hhOf(w, o).id !== hh.id)) return; // someone already moved
  const rng = w.rngFor('life.sepleave');
  const r = w.cmd('housing.separate', { leaver: p.id, stayer: o ? o.id : null });
  if (!r || !r.ok) { if (r && r.retry) later(w, months(2), 'sep.leave', { pid: d.pid, other: d.other }); return; } // still sharing a roof for now
  w.emit('life.move_out', { actors: [p.id], salience: 0.35, tags: ['move', 'ending'], payload: { to: r.where === 'local' ? 'a place of their own nearby' : r.to, reason: 'separation' } });
  if (r.where === 'away' && o && o.alive && p.family.childrenIds.length) { const m = newMetro(w, o.id, { name: fullName(p), age: ageOf(w, p), sex: p.sex, rel: 'ex-partner', where: 'elsewhere in the city', how: 'previous relationship', freq: 'child handovers' }); setOffTie(o, m.id, 'kin', 'ex-partner', 2, 0.25, 'co-parent'); }
}

/** player / god: force-form or force-end couples */
export function forceStartOn(w, a, b, how = 'matchmake') { if (a.ext.life.part || b.ext.life.part) return false; formCouple(w, a, b, how); return true; }
