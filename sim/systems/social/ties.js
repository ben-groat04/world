// Tie lifecycle: import from the generated network, create/link, contact accounting by channel, weekly maintenance + decay, triadic closure, loneliness, legacy Rel mirror.
import { TPD, WEEK, CH, CH_EFF, GAIN, clamp, mkTie, emptyPS, relayer, isOff, kinOf } from './core.js';

const FREQ = { 'daily messages': [0.15, 0.5, 12], 'weekly call': [0.08, 1.0, 3], 'monthly meetup': [0.23, 0.15, 1.6], 'a few times a year': [0.06, 0.05, 0.45], 'weekly visit': [1, 0.5, 3], 'monthly visit': [0.23, 0.3, 2],
  rarely: [0.02, 0.02, 0.1], 'daily when nearby': [1.5, 0.3, 6], 'messages about the kids': [0.2, 0.1, 5], 'child handover weekly': [1, 0.2, 4], daily: [1, 0.5, 8], emails: [0, 0, 0.4] };
const FREQ_DEF = FREQ['monthly meetup'];

export function segInfo(w, S, id) {
  let s = S.seg[id]; if (s) return s;
  const m = w.pack.meta.segments.find((x) => x.id === id), so = m ? m.social : { neighbourChat: 0.5, messagesPerDay: 30, offMapMeetupsPerMonth: 4, trustNeighbours: 0.3 };
  return (S.seg[id] = { meetF: Math.sqrt(Math.max(0.1, (so.offMapMeetupsPerMonth ?? 4) / 4)), nc: so.neighbourChat ?? 0.5, msgs: so.messagesPerDay ?? 30, meet: so.offMapMeetupsPerMonth ?? 4, tn: so.trustNeighbours ?? 0.3, lone: m?.health?.lonelinessOften ?? 0.07 });
}
const doorDist = (w, a, b) => { const x = w.buildings.get(a.homeId), y = w.buildings.get(b.homeId); if (!x || !y) return 99; return x.id === y.id ? 0 : Math.abs(x.door.x - y.door.x) + Math.abs(x.door.y - y.door.y); };
export { doorDist };

export function psOf(w, S, id) { let s = S.ppl.get(id); if (s === undefined) { const p = w.people.get(id); s = p ? importPerson(w, S, p) : null; } return s; }

/** Build a person's social state from the generated network (p.ext.pop.ties) and personal parameters. */
export function importPerson(w, S, p) {
  const ps = emptyPS(p.id); S.ppl.set(p.id, ps);
  const q = p.ext.pop, seg = segInfo(w, S, q?.seg), age = w.ageOf(p), tick = w.tick, r = w.rngFor('soc.import', p.id);
  const E = p.personality.extraversion;
  ps.mr = Math.max(0.5, seg.msgs * (age < 13 ? 0.1 : age < 16 ? 0.7 : age > 75 ? 0.45 : 1) * (0.6 + 0.8 * E) * (0.6 + 0.8 * r.next()));
  ps.pr = clamp((age < 13 ? 0.01 : age < 25 ? 0.2 : age < 45 ? 0.13 : age < 65 ? 0.08 : 0.05) * (0.3 + 1.4 * E) * (0.4 + 1.2 * r.next()), 0, 0.6);
  ps.nf = Math.round(Math.exp(r.gauss(3.4 + 1.0 * E, 0.9)) * (age < 13 ? 0.1 : 1));
  ps.fm = 0; ps.dt = 0; ps.wk = r.int(0, 6);
  if (q && q.ties) {
    for (const t of q.ties) {
      const off = isOff(t.o), s = t.s, m = off ? S.metro.get(t.o) : null, kind = t.k === 'friction' ? 'friction' : t.k;
      let lv = 2, L = t.t === 1 ? 1 : t.t === 2 ? 2 : s >= 0.3 ? 3 : 4;
      if (!off && (kind === 'neighbour' || kind === 'schoolgate' || kind === 'regular') && s < 0.34) { // seen about, but never spoken: weaker for flats and for people who keep themselves to themselves
        const pk = clamp(0.04 + 0.42 * seg.nc + 0.12 * (E - 0.5), 0.02, 0.7); if (r.next() > pk) lv = 1;
      }
      const tie = mkTie(t.o, { k: kind, r: t.rel, L, c: clamp(s * 0.92, 0.02, 0.95), t: clamp(0.2 + 0.52 * s + (kind === 'kin' ? 0.06 : 0) + 0.13 * r.gauss(0, 1), 0, 1), l: t.fr ? -0.25 : clamp(0.1 + 0.8 * s, -1, 1), e: clamp(0.35 + 0.4 * s, -1, 1), v: off && kind === 'friend' && t.v !== 'family' && r.next() < (age < 20 ? 0.15 : age < 40 ? 0.22 : 0.06) ? 'online' : t.v, cf: t.fr ? 0.35 : 0, lv, on: off ? 0 : 1, a: kind === 'partner' ? 0.7 : 0 }, tick - r.int(0, 600));
      if (lv === 1) tie.c = Math.min(tie.c, 0.05);
      if (m) tie.fq = m.freq;
      ps.T.set(t.o, tie);
    }
  }
  relayer(ps);
  return ps;
}
/** Create/refresh a reciprocal tie (asymmetric: each side keeps its own numbers). Returns [tieAB, tieBA]. */
export function link(w, S, a, b, d, via) {
  const A = psOf(w, S, a.id), B = psOf(w, S, b.id), tick = w.tick; if (!A || !B) return null;
  let x = A.T.get(b.id), y = B.T.get(a.id), isNew = false;
  if (!x) { x = mkTie(b.id, { ...d, v: via || d.v }, tick); A.T.set(b.id, x); isNew = true; }
  if (!y) { y = mkTie(a.id, { ...d, c: (d.c ?? 0.1) * (0.8 + 0.4 * w.rngFor('soc.asym', a.id, b.id).next()), v: via || d.v }, tick); B.T.set(a.id, y); isNew = true; }
  if (isNew) { S.stats.newTies++; S.stats.yr.n++; }
  if (x.lv < 2 && d.lv >= 2) { x.lv = 2; x.c = Math.max(x.c, d.c ?? 0.08); isNew = true; } if (y.lv < 2 && d.lv >= 2) { y.lv = 2; y.c = Math.max(y.c, d.c ?? 0.08); }
  A.sk = 1; B.sk = 1; mirror(a, b, x); mirror(b, a, y);
  return [x, y];
}
export function mirror(a, b, t) { // legacy Rel used by goals/other packs: familiarity, affinity(liking), trust, respect, attraction, tags
  const r = a.relationships && a.relationships.get ? a.relationships.get(b.id) || (a.relationships.set(b.id, { familiarity: 0, affinity: 0, attraction: 0, trust: 0.5, respect: 0, lastTick: 0, tags: [] }), a.relationships.get(b.id)) : null; if (!r) return;
  r.familiarity = clamp(0.1 + t.c * 0.9 + (t.lv >= 2 ? 0.1 : 0), 0, 1); r.affinity = clamp(t.l, -1, 1); r.trust = t.t; r.respect = t.e; r.attraction = t.a; r.lastTick = t.la;
  if (t.k && r.tags[0] !== t.k) { r.tags = [t.k]; if (t.cf > 0.3) r.tags.push('rival'); }
  t.sy = t.c;
}
export function touch(t, ch, n, tick) { if (n <= 0) return; t.c += (1 - t.c) * (1 - Math.pow(1 - GAIN * CH_EFF[ch], n)); t.h += n; t.la = tick; t.ch = ch; }
const expN = (r, x) => { const f = Math.floor(x); return f + (r.next() < x - f ? 1 : 0); };

/** Expected background contacts per week for a tie (written into R = [f2f, call, msg]). Venue encounters and speech acts add real ones on top. */
const R = [0, 0, 0];
function rates(w, p, t, other, age, seg, mrF) {
  const k = t.k, L = t.L;
  if (!t.on) {
    const f = FREQ[t.fq] || FREQ_DEF; let ff = f[0] * seg.meetF, cc = f[1], mm = f[2] * mrF;
    if (t.v === 'work' || k === 'colleague') { if (p.ext.pop.activity !== 'employed') { ff = 0; cc *= 0.4; mm *= 0.5; } else ff = Math.max(ff, 0.5); }
    if (other) { ff *= 0.4; mm = Math.max(mm, 1.5) * 0.6; }
    R[0] = ff; R[1] = cc; R[2] = mm; return;
  }
  if (k === 'partner' || ((k === 'housemate' || k === 'kin') && other.ext.pop.hh === p.ext.pop.hh)) { R[0] = 6; R[1] = 0.2; R[2] = 5 * mrF; return; }
  if (k === 'housemate') { R[0] = 0.3; R[1] = 0.1; R[2] = mrF; return; }
  if (k === 'kin') { R[0] = L <= 2 ? 1.3 : 0.4; R[1] = 0.5; R[2] = (L <= 2 ? 3 : 1) * mrF; return; }
  if (k === 'colleague') { R[0] = p.ext.pop.workplace.bid != null && p.ext.pop.workplace.bid === other.ext.pop.workplace.bid && p.ext.pop.activity === 'employed' ? 4 : 0.2; R[1] = 0; R[2] = 1.2 * mrF; return; }
  if (k === 'friend') { R[0] = L === 1 ? 0.9 : L === 2 ? 0.4 : L === 3 ? 0.12 : 0.04; R[1] = L <= 2 ? 0.3 : 0.05; R[2] = (L === 1 ? 3 : L === 2 ? 1 : 0.2) * mrF; return; }
  if (k === 'schoolgate') { R[0] = age < 16 ? 2 : seg.nc; R[1] = 0; R[2] = 0.3 * mrF; return; }
  if (k === 'neighbour') { R[0] = (doorDist(w, p, other) < 30 ? 0.5 : 0.12) * seg.nc; R[1] = 0; R[2] = 0.1 * mrF; return; }
  if (k === 'faith') { R[0] = p.ext.pop.religiosity > 0.45 ? 0.5 : 0.08; R[1] = 0; R[2] = 0.1; return; }
  if (k === 'regular') { R[0] = 0.2; R[1] = 0; R[2] = 0.05; return; }
  R[0] = 0.05 + (L <= 2 ? 0.2 : 0); R[1] = 0; R[2] = 0.1 * mrF;
}
// per-layer weekly retention (kin decay slower); layer 4 acquaintances fade fastest
const PER = 8; // maintenance runs every 8th week per person: rates are per 8 weeks
const KEEP = [1, Math.exp(-0.014 * 0.6 * PER), Math.exp(-0.014 * 0.9 * PER), Math.exp(-0.014 * 1.4 * PER), Math.exp(-0.014 * 3.2 * PER)], KEEP_KIN = KEEP.map((x) => Math.pow(x, 0.45));
const G1 = GAIN * CH_EFF[0], G2 = GAIN * CH_EFF[1], G3 = GAIN * CH_EFF[2], G4 = GAIN * CH_EFF[3];
/** 4-weekly maintenance for one person (staggered by id): contacts, decay, layers, loneliness, legacy mirror. Expected-value accounting (no per-tie dice). */
export function maintain(w, S, p, r) {
  const ps = psOf(w, S, p.id); if (!ps) return;
  const tick = w.tick, q = p.ext.pop, age = w.ageOf(p), seg = segInfo(w, S, q.seg), E = p.personality.extraversion, mrF = clamp(ps.mr / Math.max(8, seg.msgs), 0.2, 3);
  let supply = 0, ctc = 0, drop = null;
  const chatBoost = ps.ch.length ? 0.4 : 0;
  for (const [key, t] of ps.T) {
    let other = null;
    if (typeof key === 'number') {
      other = w.people.get(key);
      if (!other || !other.alive) { if (other && other.emigrated) { if (t.on) { t.on = 0; t.fq = t.k === 'kin' || t.k === 'friend' ? 'weekly call' : 'a few times a year'; } } else { (drop || (drop = [])).push(key); continue; } }
      else if (!t.on) t.on = 1;
    }
    rates(w, p, t, other, age, seg, mrF);
    const f = R[0], c = R[1], m = R[2] + (t.L <= 3 ? chatBoost : 0);
    // expected-value contact accounting: c += (1-c) * (1-(1-g)^n)
    let gain = (f * G1 + c * G2 + m * G3) * PER; if (t.L >= 3 && other) { const op = S.ppl.get(key); if (op) gain += op.pr * 3.5 * G4 * PER; }
    if (gain > 0.9) gain = 0.9; t.c += (1 - t.c) * gain; t.h += (f + c + m * 0.3) * PER;
    if (f + c + m > 0.3) { t.la = tick - ((r.next() * 20 * TPD) | 0); t.ch = f > c && f > m * 0.3 ? 0 : c > m ? 1 : 2; }
    ctc += f + 0.5 * c + 0.15 * m; if (t.L <= 2) supply += t.c * (f + c + 0.3 * m > 0.25 ? 1 : 0.35);
    if (!(t.k === 'partner' || (other && (t.k === 'housemate' || t.k === 'kin') && other.ext.pop.hh === p.ext.pop.hh))) t.c *= (t.k === 'kin' ? KEEP_KIN[t.L] : KEEP[t.L]) * (t.cf > 0.3 ? 0.99 : 1);
    t.d *= 0.78; if (t.cf > 0) { t.cf *= 0.57; if (t.cf < 0.03) t.cf = 0; }
    if (t.cf < 0.2) t.l += (0.1 + 0.85 * t.c - t.l) * 0.15;
    if (t.c < (t.L >= 4 ? 0.07 : 0.035) && t.k !== 'kin' && t.k !== 'partner' && t.k !== 'ex') { if (t.lv >= 2) { t.lv = 1; S.stats.lostTies++; S.stats.yr.l++; if (t.L <= 3 && t.h > 8) S.stats.fades++; } else if (t.c < 0.008) (drop || (drop = [])).push(key); }
    if (other && (t.c - t.sy > 0.1 || t.sy - t.c > 0.1)) mirror(p, other, t);
  }
  if (drop) for (const k of drop) ps.T.delete(k);
  relayer(ps); ps.sk = 0;
  // loneliness: wanted contact vs the support actually received (partner/household count)
  const hh = q.hh != null ? w.lf.households[q.hh] : null, live = hh ? hh.members.length - 1 : 0;
  const need = 1 + 0.5 * (E - 0.5) + (age < 25 ? 0.25 : age > 78 ? 0.1 : 0) + 0.3 * (p.personality.neuroticism - 0.5);
  const sup = supply * 0.1 + Math.min(live, 3) * 0.14 + (p.romance && p.romance.partnerId != null ? 0.3 : 0) + Math.min(ctc, 12) * 0.03;
  ps.ls = clamp(ps.ls * 0.5 + 0.5 * (need - sup + 0.7), -1, 1.8);
  ps.sc = supply;
}
/** Weekly: triadic closure (a friend's friend becomes an acquaintance). */
export function closure(w, S, p, r) {
  const ps = S.ppl.get(p.id); if (!ps) return; const age = w.ageOf(p), E = p.personality.extraversion;
  // triadic closure: a friend's friend becomes an acquaintance (sometimes via a proper introduction)
  if (ps.top.length >= 2 && age >= 8 && r.next() < 0.25) {
    const fid = ps.top[(r.next() * ps.top.length) | 0], fps = S.ppl.get(fid);
    if (fps && fps.top.length) {
      const gid = fps.top[(r.next() * fps.top.length) | 0];
      if (gid !== p.id && !ps.T.has(gid)) { const g = w.people.get(gid); if (g && g.alive) { const tf = ps.T.get(fid), tg = fps.T.get(gid); if (tf && tg && r.next() < 0.4 * (tf.c + 0.3) * (tg.c + 0.3) * (0.5 + E)) { link(w, S, p, g, { k: 'friend', r: 'friend of a friend', L: 4, c: 0.07, lv: 2, l: 0.2, e: 0.35 }, 'friend of a friend'); if (r.next() < 0.2) w.emit('social.introduced', { actors: [p.id, g.id], salience: 0.05, payload: { via: fid, how: 'friend of a friend' } }); } } }
    }
  }
}
export function confidants(ps) { let n = 0; for (const t of ps.T.values()) if (t.L === 1 && t.t >= 0.55 && t.c >= 0.5) n++; return n; }
export function counts(ps) { const c = [0, 0, 0, 0, 0]; for (const t of ps.T.values()) if (t.lv >= 2) c[t.L]++; return c; }
