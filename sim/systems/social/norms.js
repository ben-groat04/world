// Neighbourhood norms (noise, bins, parking, kids playing out, dogs) per street: incidents are noticed by neighbours, complaints (knock, forum, council, swallow it) follow from strictness
// and temperament; outcomes nudge the street norm, which drifts slowly. Conflicts here are the commonest source of mundane friction.
import { TPD, clamp } from './core.js';
import { psOf, segInfo, doorDist } from './ties.js';
import { learn, mkBelief, key as bkey } from './beliefs.js';
import { converse, ACT } from './acts.js';

export const NORMS = ['noise', 'bins', 'parking', 'kids', 'dogs'];
const RATE = { noise: 0.5, bins: 0.2, parking: 0.28, kids: 0.15, dogs: 0.15 };
const FORUM_KIND = { noise: 'noise', bins: 'bins', parking: 'parking', kids: 'kids', dogs: 'dogs' };
export function streetNorms(S, sid, w) {
  let n = S.norms[sid]; if (!n) { const r = w.rngFor('soc.norm', sid); n = S.norms[sid] = { s: {}, v: 0, c: 0 }; for (const k of NORMS) n.s[k] = +(0.35 + 0.4 * r.next()).toFixed(3); n.s0 = { ...n.s }; }
  return n;
}
export function rebuildStreets(w, S) {
  S.street = new Map();
  for (const p of w.living()) { const b = w.buildings.get(p.homeId); if (!b || !b.lf) continue; const sid = b.lf.streetId; let l = S.street.get(sid); if (!l) S.street.set(sid, (l = [])); l.push(p.id); }
}
/** Daily: incidents per street, witnesses, complaints. Cost ~ streets x incidents. */
export function daily(w, S, r) {
  for (const [sid, ids] of S.street) {
    if (ids.length < 4) continue;
    const nm = streetNorms(S, sid, w);
    for (const k of NORMS) {
      const lam = RATE[k] * ids.length / 60 * (1.25 - nm.s[k]) * (k === 'parking' ? 1 : 1);
      let n = Math.floor(lam) + (r.next() < lam % 1 ? 1 : 0);
      while (n-- > 0) incident(w, S, r, sid, ids, k, nm);
    }
  }
}
function culpritWeight(p, k, w) {
  const q = p.ext.pop, a = w.ageOf(p); if (a < 5) return k === 'kids' ? 1 : 0; if (a < 16) return k === 'kids' ? 1.2 : 0.05;
  if (k === 'noise') return (q.seg === 'students' ? 2.5 : q.seg === 'young_sharers' ? 1.8 : 0.7) * (1.3 - p.personality.conscientiousness);
  if (k === 'parking') return q.car ? 1.2 - p.personality.agreeableness * 0.6 : 0;
  if (k === 'dogs') return q.pets && q.pets.dogs ? 1.1 - p.personality.conscientiousness * 0.6 : 0;
  if (k === 'kids') return 0;
  return 1.3 - p.personality.conscientiousness;
}
function incident(w, S, r, sid, ids, k, nm) {
  let cul = null, tw = 0;
  for (let i = 0; i < 6; i++) { const p = w.people.get(ids[(r.next() * ids.length) | 0]); if (!p || !p.alive) continue; const x = culpritWeight(p, k, w) * r.next(); if (x > tw) { tw = x; cul = p; } }
  if (!cul || tw < 0.12) return;
  S.stats.norm.viol++; nm.v++;
  const cb = w.buildings.get(cul.homeId);
  // witnesses: housemates excluded; neighbours in the building, plus the street
  const wit = [];
  if (cb) for (const id of cb.residents) { if (id !== cul.id && w.people.get(id)?.homeId !== cul.homeId && r.next() < 0.5) wit.push(id); }
  for (let i = 0; i < 3; i++) { const id = ids[(r.next() * ids.length) | 0]; const o = w.people.get(id); if (o && o.alive && o.homeId !== cul.homeId && w.buildings.get(o.homeId) && doorDist(w, o, cul) < 30 && !wit.includes(id)) wit.push(id); }
  let complained = 0;
  for (const id of wit.slice(0, 5)) {
    const o = w.people.get(id); if (!o || !o.alive || w.ageOf(o) < 16) continue; const ps = psOf(w, S, id); if (!ps) continue;
    const kind = k === 'noise' || k === 'kids' ? 'noisy' : 'noisy';
    if (!ps.B.has(bkey('noisy', cul.id, 0)) || r.next() < 0.3) learn(S, ps, mkBelief(S, 'noisy', cul.id, 0, 1 + (r.next() < 0.3 ? 1 : 0), 0.85, -1, 1, w.tick, 1, { norm: k }));
    const t = ps.T.get(cul.id); if (t) { t.l = clamp(t.l - 0.012 * (1 + nm.s[k]), -1, 1); t.cf = clamp(t.cf + 0.02, 0, 1); }
    // complain?
    const pr = nm.s[k] * (0.15 + 0.55 * (1 - o.personality.agreeableness)) * (0.5 + o.personality.conscientiousness) * (complained ? 0.35 : 1) * (segInfo(w, S, o.ext.pop.seg).nc > 0.5 ? 1 : 0.6);
    if (r.next() > pr) continue;
    complained++; S.stats.norm.compl++; nm.c++;
    const u = r.next();
    if (u < 0.3 && t) { // knock on the door
      converse(w, S, r, o, cul, 0, k, false, r.next() < cul.personality.agreeableness ? 10 : 7); nm.s[k] = clamp(nm.s[k] + 0.004, 0, 1);
      if (r.next() < 0.5 * cul.personality.agreeableness) { nm.s[k] = clamp(nm.s[k] + 0.006, 0, 1); }
    } else if (u < 0.65 && ps.fm && w.commands.has('comms.forumPost')) { w.cmd('comms.forumPost', { author: o.id, kind: FORUM_KIND[k], about: cul.id, street: sid }); }
    else if (u < 0.8) { w.emit('civic.complaint', { actors: [o.id], place: cb ? cb.id : null, salience: 0.1, tags: ['community_problem', 'conflict'], payload: { kind: k, to: 'council' } }); nm.s[k] = clamp(nm.s[k] + 0.003, 0, 1); }
    else { o.mood = clamp(o.mood - 0.004, -1, 1); if (t) t.l = clamp(t.l - 0.02, -1, 1); }
  }
}
/** Monthly: norms drift (regress to the street's baseline, pulled up by complaints and forum agreement, down when nothing is ever said). */
export function monthly(w, S) {
  for (const [sid, nm] of Object.entries(S.norms)) {
    for (const k of NORMS) {
      const before = nm.s[k], pull = (nm.s0[k] - nm.s[k]) * 0.06, push = nm.c * 0.004, slack = nm.v > 3 && nm.c === 0 ? -0.02 : 0;
      nm.s[k] = clamp(nm.s[k] + pull + push * (k === 'noise' ? 1 : 0.7) + slack, 0.05, 0.95);
      if (Math.floor(nm.s[k] * 6.67) !== Math.floor(before * 6.67)) { /* crossed a 0.15 band */ w.emit('social.norm_shift', { salience: 0.1, tags: ['community_problem'], payload: { street: +sid, norm: k, to: +nm.s[k].toFixed(2) } }); }
    }
    nm.v = nm.c = 0;
  }
}
