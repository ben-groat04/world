// Founding life-course state for every resident: orientation, legal status, partner record, parity, child desire. Derived from the generated population
// (households, partners, ties, off-map placeholders) so the day-0 world is internally consistent with what the population generator wrote.
import { clamp, clamp01, wpick, ageOf, years, tieOf, metro } from './util.js';

/** P(LGB+) by age (inner-city skew over the national census floor). */
export function lgbShare(age) { return age < 25 ? 0.105 : age < 35 ? 0.075 : age < 50 ? 0.045 : age < 65 ? 0.025 : 0.012; }

export function initLife(w) {
  const rng = w.rngFor('life.init'), lf = w.lf;
  const maxM = lf.metro.reduce((m, x) => Math.max(m, parseInt(x.id.slice(1), 10) || 0), 0);
  lf.life = { ver: 1, q: [], rec: {}, stats: {}, mid: maxM + 1, fertScale: 1, boom: 0, seeded: w.tick, first: {}, yearStats: [] };
  const T0 = w.tick;
  for (const m of lf.metro) { if (m.t0 === undefined) m.t0 = T0; if (m.dead === undefined && m.age >= 95 && m.kin) m.dead = T0 - Math.round(rng.float(0.2, 12) * w.calendar.ticksPerYear); }
  const people = [...w.people.values()].filter((p) => p.alive && p.ext.pop);
  for (const p of people) {
    const q = p.ext.pop, age = ageOf(w, p);
    const L = p.ext.life = { or: 'S', mar: 'never', part: null, nPart: 0, parity: 0, firstCohab: null, firstMar: null, firstBirth: null, preg: null, lastBirth: null, desire: 0.5, away: null, left: null, caring: null, boost: 0, ex: 0, sepAt: null, widowedAt: null, planKid: 0 };
    // orientation
    if (age >= 12) { if (rng.chance(lgbShare(age))) L.or = wpick(rng, [['G', 0.42], ['B', 0.46], ['O', 0.12]]); }
    // children (on-map alive + off-map placeholders)
    L.parity = (p.family.childrenIds || []).length + p.ext.pop.ties.filter((t) => !t.on && t.rel && /^(son|daughter)$/.test(t.rel)).length;
    // desire for (more) children: family value, age, existing parity
    L.desire = clamp01(0.35 + 0.5 * (p.values ? p.values.family - 0.5 : 0) + rng.gauss(0, 0.18) - (rng.chance(0.1) ? 0.45 : 0) - 0.12 * Math.max(0, L.parity - 1));
    // partner
    const sp = p.family.spouseId != null ? w.people.get(p.family.spouseId) : null;
    if (sp && sp.alive) {
      const married = p.romance && p.romance.status === 'married';
      L.part = { id: sp.id, on: true, st: married ? 'married' : 'cohab', lat: false, since: (p.romance && p.romance.sinceTick) || T0 - years(w, 2), how: 'earlier' };
      L.mar = married ? 'married' : 'never'; L.nPart = 1; L.firstCohab = L.part.since;
      if (married) L.firstMar = L.part.since + years(w, rng.float(0.3, 5));
      else if (age > 34 && rng.chance(0.25)) L.mar = 'divorced';
      if (L.or !== 'S' && sp.sex !== p.sex) L.or = rng.chance(0.55) ? 'B' : 'S';
      if (L.or === 'G' && sp.sex !== p.sex) L.or = 'B';
    } else {
      // off-map partner placeholder from the network builder
      const t = q.ties.find((x) => !x.on && x.rel && x.rel.startsWith('partner'));
      if (t) { const m = metro(w, t.o); L.part = { id: t.o, on: false, st: 'dating', lat: true, since: T0 - years(w, rng.float(0.2, 3)), how: m && m.how || 'friends' }; L.nPart = 1; if (m) { if (L.or === 'S' && m.sex === p.sex) L.or = rng.chance(0.5) ? 'G' : 'B'; else if (L.or === 'G' && m.sex !== p.sex) L.or = 'B'; } p.romance = { partnerId: null, status: 'dating', sinceTick: L.part.since }; }
    }
    // legal status of the unpartnered / cohabiting
    if (!(L.part && L.part.on)) {
      {
        if (age >= 66) { L.mar = rng.chance(p.sex === 'F' ? 0.5 : 0.28) ? 'widowed' : rng.chance(0.28) ? 'divorced' : (L.mar === 'divorced' ? 'divorced' : 'never'); }
        else if (age >= 30) { const lone = q.role === 'head' && /^lone_parent/.test(w.lf.households[q.hh].arch); const pd = lone ? 0.4 : age > 45 ? 0.22 : 0.1; L.mar = rng.chance(pd) ? (rng.chance(0.28) ? 'separated' : 'divorced') : rng.chance(age > 55 ? 0.03 : 0.01) ? 'widowed' : L.mar === 'divorced' ? 'divorced' : 'never'; }
        if (L.mar === 'widowed') L.widowedAt = T0 - years(w, rng.float(1, 12));
        if (L.mar !== 'never' && L.mar !== 'widowed') { L.nPart = Math.max(L.nPart, 1); L.firstMar = T0 - years(w, rng.float(2, 15)); }
        if (L.mar === 'widowed') L.firstMar = T0 - years(w, rng.float(10, 40));
      }
    }
    if (L.part && !L.part.on) { /* partner elsewhere */ }
    if (age >= 20 && L.nPart === 0 && rng.chance(clamp((age - 18) * 0.03, 0, 0.7))) L.nPart = 1 + (rng.chance(0.4) ? 1 : 0);
    // last birth of mothers with a baby on the map
    if (p.sex === 'F') for (const cid of p.family.childrenIds || []) { const c = w.people.get(cid); if (c && c.alive) { const t = c.birthTick; if (L.lastBirth === null || t > L.lastBirth) L.lastBirth = t; if (L.firstBirth === null || t < L.firstBirth) L.firstBirth = t; } }
  }
}
