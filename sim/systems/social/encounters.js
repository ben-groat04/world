// Venue-session encounters (hourly, only venues with >= 2 people present) + doorstep neighbours + group meetings.
// Strangers who keep sharing a place first become "familiar faces" (weeks of co-presence), only later speak, and only then do ties form. Neighbours in flats often never speak.
import { TPD, clamp } from './core.js';
import { psOf, segInfo, doorDist, touch, link as linkT } from './ties.js';
import { converse } from './acts.js';

// how chatty a place is (0..1): chance an attending adult tries to engage someone, and the context for tie formation
export const SOC = { pub: 0.9, cafe: 0.75, community_centre: 0.9, church: 0.8, church_hall: 0.9, mosque: 0.8, park: 0.55, allotments: 0.8, primary_school: 0.75, nursery: 0.7, gym: 0.4, launderette: 0.6, barber: 0.7, salon: 0.6,
  library: 0.3, ethnic_grocer: 0.5, bakery: 0.4, small_supermarket: 0.22, charity_shop: 0.35, bookmaker: 0.5, takeaway: 0.18, restaurant: 0.3, off_licence: 0.3, pharmacy: 0.15, gp_surgery: 0.1, business_unit: 0.35, estate_green: 0.6, park_pavilion: 0.6, school_grounds: 0.6, station: 0.05, arch_unit: 0.3 };
export function buildVenues(w) {
  const out = [];
  for (const b of w.buildings.values()) { const t = b.lf && b.lf.template; if (t && SOC[t] !== undefined) out.push({ id: b.id, soc: SOC[t], t, b }); }
  return out;
}
export function hom(w, a, b) {
  const A = a.ext.pop, B = b.ext.pop, dA = w.ageOf(a), dB = w.ageOf(b);
  let x = Math.exp(-Math.pow((dA - dB) / (dA < 16 || dB < 16 ? 2.5 : 11), 2)) + 0.02;
  if (A.seg === B.seg) x *= 1.7; if (A.ethGroup === B.ethGroup) x *= 1.4; if (A.religion === B.religion && A.religion !== 'No religion') x *= 1.3;
  let sh = 0; for (const i of a.interests) if (b.interests.includes(i)) sh++; x *= 1 + 0.3 * sh;
  if (a.family.childrenIds.length && b.family.childrenIds.length) x *= 1.4;
  return x;
}
function shared(S, A, B) { let n = 0; for (const k of A.top) { if (B.T.has(k)) n++; } return n; }

/** One meeting of two people in a shared place: known -> maybe chat; stranger -> sighting -> familiar -> first words -> acquaintance. */
export function pair(w, S, r, a, b, ctx, soc) {
  const A = psOf(w, S, a.id), B = psOf(w, S, b.id); if (!A || !B) return;
  S.stats.enc.pairs++;
  const ta = A.T.get(b.id), tb = B.T.get(a.id), tick = w.tick, day = w.time.dayAbs;
  if (ta && ta.lv >= 2) { // already know each other
    const pk = ctx === 'work' ? 0.15 : 0.1 + 0.55 * Math.min(1, ta.c * 2) * (ta.L <= 2 ? 1.2 : 1);
    if (r.next() < pk * (0.5 + soc)) converse(w, S, r, a, b, 0, ctx);
    else { touch(ta, 0, 0.3, tick); }
    return;
  }
  // sighting memory (capped)
  for (const [X, Y, id] of [[A, B, b.id], [B, A, a.id]]) {
    let s = X.ST.get(id); if (!s) { if (X.ST.size >= 40) { let o = null, ot = 1e9; for (const [k, v] of X.ST) if (v[1] < ot) { ot = v[1]; o = k; } X.ST.delete(o); } s = [0, -1, 0]; X.ST.set(id, s); }
    s[0]++; if (s[1] !== day) { s[2]++; s[1] = day; }
  }
  const sa = A.ST.get(b.id), sb = B.ST.get(a.id);
  let t1 = ta, t2 = tb;
  if (!t1 && sa[2] >= (ctx === 'door' ? 2 : 3) && sa[0] >= 3 && r.next() < 0.5) t1 = mkFace(w, A, b);
  if (!t2 && sb[2] >= (ctx === 'door' ? 2 : 3) && sb[0] >= 3 && r.next() < 0.5) t2 = mkFace(w, B, a);
  if (!(t1 && t2)) return; // someone has not yet registered the other
  // first words
  const E = (a.personality.extraversion + b.personality.extraversion) * 0.5, A_ = (a.personality.agreeableness + b.personality.agreeableness) * 0.5;
  const sh = shared(S, A, B), h = hom(w, a, b);
  const pw = clamp(soc * 0.22 * (0.4 + 1.2 * E) * (0.7 + 0.6 * A_) * Math.min(2.2, h) * (1 + 0.5 * sh) * Math.min(2, 0.6 + 0.2 * Math.min(sa[2], 8)) * (ctx === 'door' ? segInfo(w, S, a.ext.pop.seg).nc + segInfo(w, S, b.ext.pop.seg).nc : 1), 0, 0.9);
  if (r.next() < pw) {
    const via = ctx === 'door' ? 'neighbours' : ctx === 'work' ? 'work' : ctx === 'school' ? 'school gate' : ctx === 'group' ? 'a group' : 'regulars at ' + ctx;
    const k = ctx === 'door' ? 'neighbour' : ctx === 'work' ? 'colleague' : ctx === 'school' ? 'schoolgate' : 'regular';
    const res = linkT(w, S, a, b, { k, r: k === 'neighbour' ? 'neighbour' : k === 'regular' ? 'regular' : k === 'colleague' ? 'colleague' : 'school gate parent', L: 4, c: 0.06 + 0.03 * h, lv: 2, l: 0.15, e: 0.3 }, via);
    if (res) { A.ST.delete(b.id); B.ST.delete(a.id); w.emit('social.acquaint', { actors: [a.id, b.id], place: a.locationId, salience: 0.03, tags: ['newcomer'], payload: { via: ctx, days: sa[2] } }); converse(w, S, r, a, b, 0, ctx, true); }
  }
}
function mkFace(w, X, other) {
  const ps = X; const S = w.soc; const t = ps.T.get(other.id);
  if (t) return t;
  const tt = { o: other.id, k: 'face', r: 'familiar face', L: 4, c: 0.02, t: 0.3, l: 0.1, e: 0.3, d: 0, a: 0, h: 0, f0: w.tick, la: w.tick, ch: 0, v: 'seen about', cf: 0, lv: 1, on: 1, sy: 0.02 }; ps.T.set(other.id, tt); return tt;
}

/** Hourly sweep over the (few) venues that have company. Cost ~ people currently out and about. */
export function sweep(w, S, r, hour) {
  if (hour < 7 || hour > 23) return;
  const vs = S.venues;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i], b = w.buildings.get(v.id); if (!b) continue; const occ = b.occupants; if (occ.size < 2) continue;
    const arr = Array.from(occ); const n = arr.length; S.stats.enc.sess++;
    const ctx = v.t === 'primary_school' || v.t === 'nursery' ? 'school' : v.t === 'business_unit' || v.t === 'arch_unit' ? 'work' : v.t;
    for (let j = 0; j < n; j++) {
      const a = arr[j]; if (!a.alive || a.ext.rt.off) continue;
      const E = a.personality.extraversion; if (r.next() > v.soc * (0.3 + 0.9 * E) * 0.55) continue;
      let k = (r.next() * (n - 1)) | 0; if (k >= j) k++; const b = arr[k];
      if (!b.alive || a.homeId === b.homeId) continue;
      if (ctx === 'work' && !(a.workId === v.id || b.workId === v.id || (a.ext.pop.workplace.bid === v.id) || b.ext.pop.workplace.bid === v.id)) continue;
      if (ctx === 'school' && (w.ageOf(a) >= 16) !== (w.ageOf(b) >= 16)) { /* parents with children: gate chat */ }
      pair(w, S, r, a, b, ctx, v.soc);
    }
  }
}
/** Doorstep and street neighbours: per person-week, one or two incidental meetings. Large blocks dilute it; people who keep to themselves rarely start. */
export function neighbours(w, S, r, p) {
  const b = w.buildings.get(p.homeId); if (!b) return;
  const seg = segInfo(w, S, p.ext.pop.seg), res = b.residents;
  let tries = r.next() < 0.5 + 0.8 * seg.nc ? 1 : 0; if (r.next() < 0.3 * seg.nc) tries++;
  for (let i = 0; i < tries; i++) {
    let o = null;
    if (res.length > 1 && r.next() < 0.6) { const id = res[(r.next() * res.length) | 0]; if (id !== p.id) o = w.people.get(id); }
    else { const st = S.street.get(b.lf.streetId); if (st && st.length) { for (let k = 0; k < 3; k++) { const c = st[(r.next() * st.length) | 0]; if (c !== p.id && doorDist(w, p, w.people.get(c) || p) < 35) { o = w.people.get(c); break; } } } }
    if (!o || !o.alive || o.homeId === p.homeId || o.emigrated) continue;
    if (w.ageOf(o) < 16 && w.ageOf(p) >= 16 && r.next() < 0.7) continue;
    pair(w, S, r, p, o, 'door', 0.5);
  }
}
/** A group meeting (goals/groups): a couple of attendee pairs get to talk. */
export function groupMeet(w, S, r, ids) {
  const n = ids.length; if (n < 2) return;
  for (let k = 0; k < Math.min(3, n - 1); k++) {
    const a = w.people.get(ids[(r.next() * n) | 0]), b = w.people.get(ids[(r.next() * n) | 0]); if (!a || !b || a === b || !a.alive || !b.alive) continue;
    pair(w, S, r, a, b, 'group', 0.9);
  }
}
