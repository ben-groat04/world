// Conversations as speech acts. An exchange between two people picks an act from personality, mood, tie state and what each has on their mind, then applies its outcome:
// tie dimensions (closeness/trust/liking/respect/obligation/attraction), belief transfer with distortion, secrets, conflict and repair, flirt hook, moods. Notable outcomes are events.
import { TPD, clamp, CH } from './core.js';
import { psOf, touch, link, mirror, segInfo } from './ties.js';
import { KINDS, KIDX, PROBLEM, learn, mkBelief, mutate, pickTopic, truthOf, key as bkey, fkey } from './beliefs.js';

export const ACT = ['small', 'news', 'joke', 'complain', 'advise', 'confide', 'gossip', 'argue', 'apologise', 'flirt', 'favour', 'comfort'];
const SECRETISH = new Set(['affair', 'in_debt', 'addiction', 'drugs', 'immigration', 'job_hunting', 'ill', 'lost_job', 'pregnant', 'evicted', 'breakup', 'planning_move']);

export function attractionPossible(w, a, b) {
  const A = w.ageOf(a), B = w.ageOf(b); if (A < 17 || B < 17 || Math.abs(A - B) > 12) return false;
  if ((a.romance && a.romance.partnerId != null) || (b.romance && b.romance.partnerId != null)) return false;
  const ok = (x, y) => { const o = x.ext.life ? x.ext.life.or : 'S'; return o === 'B' || o === 'O' || (o === 'G' ? x.sex === y.sex : x.sex !== y.sex); };
  return ok(a, b) && ok(b, a);
}
function weights(w, S, r, a, b, A, B, ta, tb, ctx, ch, first) {
  const pa = a.personality, E = pa.extraversion, Ag = pa.agreeableness, N = pa.neuroticism, g = (a.traits.includes('gossip') ? 1.8 : 1) * (0.55 + 0.7 * (1 - Ag) + 0.4 * E);
  const out = WS, l = ta.l, c = ta.c; out.fill(0);
  out[0] = 5; out[1] = first ? 0.3 : 2.4; out[2] = 0.7 + E;
  out[3] = l > -0.2 ? (0.5 + 1.4 * N) * (c > 0.2 ? 1 : 0.4) : 0;
  out[4] = b.mood < -0.15 || (B.B.size && c > 0.3) ? 0.6 : 0.2;
  const conf = c > 0.3 && ta.t > 0.5 && ctx !== 'pub_crowd';
  if (conf) { if (A.cfd) out[5] = (0.35 + (ta.t - 0.45) * 2) * (0.7 + 0.6 * (a.mood < 0 ? 1.5 : 1)) * (1 + 0.8 * Math.max(0, A.ls)); }
  out[6] = (A.B.size > 2 ? 2.2 * g : 0) * (first ? 0.2 : 1) * (ta.c > 0.12 ? 1 : 0.6);
  out[7] = ta.cf > 0.25 ? 2.6 * (1.2 - Ag) : l < -0.1 ? 1.2 : 0.05 * (1.3 - Ag) * (1 + (ctx === 'pub' ? 1.4 : 0));
  out[8] = ta.cf > 0.2 ? 2.2 * (Ag + 0.2) : 0;
  out[9] = ta.a >= 0.3 && ctx !== 'school' ? 1.3 * (0.4 + E) * (ta.a + 0.2) : 0;
  out[10] = c > 0.25 && (a.ext.pop.fin && a.ext.pop.fin.stress > 0.5) ? 0.5 : 0.03;
  out[11] = b.mood < -0.2 && c > 0.3 ? 1.8 * (Ag + 0.2) : 0;
  return out;
}
const WS = new Array(ACT.length).fill(0);
const pickW = (r, ws) => { let t = 0; for (let i = 0; i < ws.length; i++) t += ws[i]; let x = r.next() * t; for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x < 0) return i; } return 0; };

/** One conversation (a opens). ch: 0 face-to-face, 1 call, 2 message. Returns the act index. */
export function converse(w, S, r, a, b, ch = 0, ctx = '', first = false, force = null) {
  const A = psOf(w, S, a.id), B = psOf(w, S, b.id); if (!A || !B) return -1;
  let ta = A.T.get(b.id), tb = B.T.get(a.id); if (!ta || !tb) { const res = link(w, S, a, b, { k: 'acq', L: 4, c: 0.06, lv: 2 }, ctx || 'introduced'); if (!res) return -1; ta = res[0]; tb = res[1]; }
  const tick = w.tick; S.stats.conv++;
  const ws = weights(w, S, r, a, b, A, B, ta, tb, ctx, ch, first);
  const act = force !== null ? force : pickW(r, ws);
  S.stats.acts[act]++;
  const pa = a.personality, pb = b.personality;
  const q = clamp(0.5 + 0.22 * (pa.agreeableness + pb.agreeableness - 1) + 0.1 * (a.mood + b.mood) + 0.25 * (ta.l + tb.l) * 0.5 + (r.next() - 0.5) * 0.35, 0, 1);
  const lbefore = tb.l;
  let ev = 0;
  touch(ta, ch, 1, tick); touch(tb, ch, 1, tick);
  switch (act) {
    case 0: case 2: case 1: { // small talk, joke, news
      const dq = (q - 0.5) * 0.06 + (act === 2 ? 0.015 : 0); ta.l = clamp(ta.l + dq, -1, 1); tb.l = clamp(tb.l + dq * 0.9, -1, 1);
      if (act === 1) tell(w, S, r, a, b, A, B, ta, tb, ch, true);
      else if (r.next() < 0.18) tell(w, S, r, a, b, A, B, ta, tb, ch, false);
      break; }
    case 3: { // complain (to a sympathetic ear)
      const empathy = clamp(pb.agreeableness * 0.6 + tb.c * 0.5 + (r.next() - 0.5) * 0.3, 0, 1);
      ta.t = clamp(ta.t + 0.01, 0, 1); tb.l = clamp(tb.l + (empathy - 0.5) * 0.05, -1, 1); ta.l = clamp(ta.l + (empathy - 0.35) * 0.04, -1, 1);
      if (r.next() < 0.1) w.moodlet(a, 'vented', 'Got it off my chest', 0.05, 2 * TPD);
      break; }
    case 4: { ta.e = clamp(ta.e + 0.015, -1, 1); tb.e = clamp(tb.e + 0.03 * q, -1, 1); ta.t = clamp(ta.t + 0.015, 0, 1); break; }
    case 5: ev = confide(w, S, r, a, b, A, B, ta, tb); break;
    case 6: tell(w, S, r, a, b, A, B, ta, tb, ch, false, true); break;
    case 7: { // argument
      const heat = 0.1 + 0.18 * r.next() + 0.1 * (pa.neuroticism + pb.neuroticism) - 0.1 * (pa.agreeableness + pb.agreeableness) * 0.5;
      ta.l = clamp(ta.l - heat, -1, 1); tb.l = clamp(tb.l - heat, -1, 1); ta.t = clamp(ta.t - 0.06, 0, 1); tb.t = clamp(tb.t - 0.07, 0, 1);
      ta.cf = clamp(ta.cf + 0.3 + heat, 0, 1); tb.cf = clamp(tb.cf + 0.3 + heat, 0, 1); ta.e = clamp(ta.e - 0.03, -1, 1); tb.e = clamp(tb.e - 0.04, -1, 1);
      w.moodlet(a, 'row', 'Had a row', -0.12, 3 * TPD); w.moodlet(b, 'row', 'Had a row', -0.12, 3 * TPD);
      if ((ta.c > 0.15 || tb.c > 0.15) && (!ta.fo || tick - ta.fo > 28 * TPD)) { ta.fo = tb.fo = tick; ev = w.emit('social.fallout', { actors: [a.id, b.id], place: a.locationId, salience: 0.3 + 0.2 * Math.min(1, ta.c), tags: ['conflict'], payload: { over: ctx || 'words', c: +ta.c.toFixed(2) } }); }
      break; }
    case 8: { // apologise: repair depends on the other's agreeableness and the history
      const ok = r.next() < clamp(0.35 + 0.45 * pb.agreeableness + 0.3 * tb.c - 0.2 * tb.cf, 0.1, 0.92);
      if (ok) { const hot = tb.cf > 0.25; ta.cf = tb.cf = 0; ta.l = clamp(ta.l + 0.12, -1, 1); tb.l = clamp(tb.l + 0.15, -1, 1); tb.t = clamp(tb.t + 0.05, 0, 1); if (hot) ev = w.emit('social.reconcile', { actors: [a.id, b.id], place: a.locationId, salience: 0.3, tags: ['support'], payload: { c: +ta.c.toFixed(2) } }); }
      else { ta.cf *= 0.9; tb.l = clamp(tb.l - 0.02, -1, 1); }
      break; }
    case 9: { // flirt hook for the life package
      const resp = r.next() < clamp(0.2 + 0.6 * tb.a + 0.15 * q, 0, 0.9) && attractionPossible(w, b, a);
      if (resp) { tb.a = clamp(tb.a + 0.08, 0, 1); ta.a = clamp(ta.a + 0.06, 0, 1); } else { ta.a = clamp(ta.a - 0.04, 0, 1); ta.l = clamp(ta.l - 0.02, -1, 1); }
      if (resp && (!ta.fl || tick - ta.fl > 10 * TPD)) { ta.fl = tb.fl = tick; ev = w.emit('social.flirt', { actors: [a.id, b.id], place: a.locationId, salience: 0.12, tags: ['flirt', 'romance'], payload: { returned: true, a: +ta.a.toFixed(2) } }); }
      break; }
    case 10: { // ask a favour: obligation moves
      const yes = r.next() < clamp(0.3 + 0.5 * tb.c + 0.2 * tb.t + 0.15 * pb.agreeableness - 0.3 * Math.max(0, -tb.d), 0.05, 0.95);
      if (yes) { ta.d -= 0.25; tb.d += 0.25; tb.t = clamp(tb.t + 0.01, 0, 1); ta.t = clamp(ta.t + 0.02, 0, 1); } else { ta.l = clamp(ta.l - 0.04, -1, 1); }
      break; }
    case 11: { // comfort
      w.moodlet(b, 'comforted', 'Felt looked after', 0.1, 4 * TPD); ta.t = clamp(ta.t + 0.02, 0, 1); tb.t = clamp(tb.t + 0.045, 0, 1); tb.l = clamp(tb.l + 0.05, -1, 1); tb.d -= 0.15; ta.d += 0.15; touch(ta, ch, 1, tick); touch(tb, ch, 1, tick);
      if (r.next() < 0.3) ev = w.emit('social.kindness', { actors: [a.id, b.id], place: a.locationId, salience: 0.1, tags: ['support'], payload: { kind: 'comfort' } });
      break; }
  }
  // friendship milestone: acquaintance -> friend (once per tie)
  if (!ta.fr_ && ta.k !== 'kin' && ta.k !== 'partner' && ta.c >= 0.32 && ta.h >= 5 && tb.c >= 0.26 && ta.l > 0.2 && tb.l > 0.2 && ta.k !== 'friend' && ta.k !== 'housemate' && ta.k !== 'colleague') {
    ta.fr_ = tb.fr_ = 1; ta.k = tb.k = 'friend'; ta.r = tb.r = 'friend'; if (!ta.v || ta.v === 'seen about') ta.v = tb.v = 'mixing'; w.emit('social.friendship', { actors: [a.id, b.id], place: a.locationId, salience: 0.2, tags: ['support', 'newcomer'], payload: { via: ta.v || ctx } });
  }
  if (act === 7 || act === 8 || Math.abs(ta.c - ta.sy) > 0.03) mirror(a, b, ta); if (act === 7 || act === 8 || Math.abs(tb.c - tb.sy) > 0.03) mirror(b, a, tb);
  return act;
}
/** a tells b something: own news first, otherwise gossip about someone else. Distorted per hop; told-in-confidence items only leak by the teller's (dis)loyalty. */
export function tell(w, S, r, a, b, A, B, ta, tb, ch, selfFirst, gossip) {
  const gos = (a.traits.includes('gossip') ? 1.7 : 1) * (0.6 + 0.8 * (1 - a.personality.agreeableness));
  A.__now = w.tick;
  const loyal = clamp(ta.t * 0.7 + 0.3 * a.personality.agreeableness - 0.25 * (a.traits.includes('gossip') ? 1 : 0), 0, 1);
  const top = pickTopic(r, A, b, ta, loyal, selfFirst ? 0.6 : gos, w.tick);
  if (!top) return 0;
  const self = top.a === a.id, st = S.stats.rum;
  if (!self && b.id === top.o) return 0;
  const m = mutate(r, top, A, B, a.personality.neuroticism, ch, w, S);
  const conf = clamp(top.c * (0.72 + 0.28 * tb.t) * (self ? 1.05 : 0.95), 0.1, 0.97), h = self ? 1 : top.h + 1;
  const truth = truthOf(S, top.k, m.a, m.o, m.m), nb = mkBelief(S, top.k, m.a, m.o, m.m, conf, a.id, h, w.tick, truth, { d: top.d || m.d, ev: top.ev || 0 });
  if (m.a === b.id) return 0;
  learn(S, B, nb);
  (ta.tl || (ta.tl = [])).push(bkey(top.k, top.a, top.o)); if (ta.tl.length > 8) ta.tl.shift();
  ta.c += 0.002; // sharing news is a bonding act
  const f = S.facts.get(fkey(top.k, top.a)); if (f && !self) f.n = (f.n || 0) + 1;
  st.told++; const hb = Math.min(6, h); st.byHop[hb]++; if (!truth) st.wrongByHop[hb]++; if (m.d) { st.mut++; if (m.mis) st.mis++; } if (KINDS[top.k][0]) st.benign++; else st.nonBenign++;
  st.byKind[KIDX[top.k]]++;
  if (!self && S.rumours.length < 400 && r.next() < 0.1) S.rumours.push({ t: w.tick, from: a.id, to: b.id, subj: m.a, obj: m.o, kind: top.k, m: m.m, hops: h, tr: truth, d: m.d ? 1 : 0, nt: top.nt || 0, ch }); else if (!self && S.rumours.length >= 400 && r.next() < 0.1) { S.rumours.shift(); S.rumours.push({ t: w.tick, from: a.id, to: b.id, subj: m.a, obj: m.o, kind: top.k, m: m.m, hops: h, tr: truth, d: m.d ? 1 : 0, nt: top.nt || 0, ch }); }
  if (!self) {
    // what the hearer now thinks of the subject (reputation is distributed beliefs)
    const sub = B.T.get(m.a); if (sub && !KINDS[top.k][0]) { sub.e = clamp(sub.e - 0.025 * conf, -1, 1); sub.l = clamp(sub.l - 0.015 * conf, -1, 1); }
    if (nb.nt || (!KINDS[top.k][0] && h >= 2) || m.d || h >= 3) {
      const leak = top.nt;
      if (leak) { S.stats.secrets.leaked++; if (f) f.leak = (f.leak || 0) + 1; }
      w.emit('social.rumour', { actors: [a.id, m.a, b.id].filter((x, i, ar) => x !== 0 && ar.indexOf(x) === i), place: a.locationId, cause: top.ev || 0, salience: leak || !KINDS[top.k][0] ? 0.14 : 0.04, tags: leak ? ['gossip', 'secret'] : ['gossip'], payload: { kind: top.k, hops: h, distorted: !!m.d, truth: !!truth } });
    }
    if (f && f.sec && (f.n || 0) >= 6 && !f.out) { f.out = 1; S.stats.secrets.revealed++; w.emit('social.scandal', { actors: [top.a], salience: 0.45, cause: top.ev || 0, tags: ['gossip', 'secret'], payload: { kind: top.k, holders: f.n } }); }
  }
  return 1;
}
function confide(w, S, r, a, b, A, B, ta, tb) {
  let pick = null, pw = 0;
  for (const v of A.B.values()) if (v.a === a.id && (PROBLEM.has(v.k) || SECRETISH.has(v.k)) && !(ta.tl && ta.tl.includes(bkey(v.k, v.a, v.o)))) { const wv = (KINDS[v.k][2] + 0.3) * r.next(); if (wv > pw) { pw = wv; pick = v; } }
  if (!pick) return 0;
  const nb = mkBelief(S, pick.k, pick.a, pick.o, pick.m, 0.95, a.id, 1, w.tick, 1, { nt: 1, ev: pick.ev || 0 });
  learn(S, B, nb); (ta.tl || (ta.tl = [])).push(bkey(pick.k, pick.a, pick.o)); if (ta.tl.length > 8) ta.tl.shift();
  ta.t = clamp(ta.t + 0.05, 0, 1); tb.t = clamp(tb.t + 0.07, 0, 1); ta.c += 0.01; tb.c += 0.012; tb.d += 0.1; tb.e = clamp(tb.e + 0.02, -1, 1);
  const f = S.facts.get(fkey(pick.k, pick.a)); if (f) { if (!f.hold.includes(b.id)) f.hold.push(b.id); f.conf = (f.conf || 0) + 1; }
  if (KINDS[pick.k][2] > 0.5) S.stats.secrets.kept++;
  w.moodlet(a, 'confided', 'Told someone how things really are', 0.12, 4 * TPD);
  return w.emit('social.confide', { actors: [a.id, b.id], place: a.locationId, cause: pick.ev || 0, salience: 0.14, tags: KINDS[pick.k][2] > 0.5 ? ['secret', 'support'] : ['support'], payload: { kind: pick.k, c: +tb.c.toFixed(2) } });
}
