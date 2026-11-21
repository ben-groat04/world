// Beliefs and theory of mind. Truth lives in world.soc.facts (derived from the event log + generated everyday news); decisions and speech read beliefs only.
//   belief {k kind, a about (person id), o other party (person id | 0), m magnitude 1..3, c confidence 0..1, s source (person id | -1 direct | -2 feed | -3 forum | -4 news | -5 injected),
//           t tick learned, h hops from the original, tr truth flag (1 true, 0 false), sal salience, nt 1 = told in confidence, d 1 = distorted on the way, lie 1 = a lie told to me}
//   fact   {k, a, o, m, t, sec (1 = private), holders (ids who knew first-hand)}
import { clamp, TPD } from './core.js';

// kind: [benign, salience, private-probability, base weight for everyday news (0 = event-driven only)]
export const KINDS = {
  moving_out: [1, 0.6, 0.1, 0], moved_in: [1, 0.4, 0, 0], new_baby: [1, 0.9, 0.05, 0], pregnant: [1, 0.8, 0.5, 0], wedding: [1, 0.8, 0, 0], new_couple: [1, 0.7, 0.25, 0.6], breakup: [1, 0.7, 0.35, 0],
  new_job: [1, 0.5, 0.05, 0], promotion: [1, 0.5, 0.05, 0], lost_job: [1, 0.7, 0.4, 0], holiday: [1, 0.35, 0, 2.2], new_car: [1, 0.3, 0, 0.7], new_dog: [1, 0.4, 0, 0.5], kid_news: [1, 0.4, 0, 1.6],
  ill: [1, 0.6, 0.5, 0.5], died: [1, 1, 0, 0], shop_closing: [1, 0.7, 0, 0], shop_opening: [1, 0.6, 0, 0], rent_rise: [1, 0.5, 0, 0], building_works: [1, 0.35, 0, 0.5], evicted: [1, 0.7, 0.5, 0],
  crime_nearby: [1, 0.7, 0, 0], job_hunting: [1, 0.5, 0.9, 0.35], planning_move: [1, 0.5, 0.4, 0.5], hobby_news: [1, 0.3, 0, 1.5], family_news: [1, 0.4, 0.1, 1.2], new_look: [1, 0.25, 0, 0.5],
  // not benign (kept to well under 15% of what circulates)
  addiction: [0, 0.7, 0.9, 0.05], affair: [0, 0.9, 0.95, 0.07], in_debt: [0, 0.7, 0.85, 0.25], arrested: [0, 0.9, 0.5, 0], row: [0, 0.6, 0.1, 0.25], noisy: [0, 0.5, 0, 0.2], drugs: [0, 0.8, 0.8, 0.04], immigration: [0, 0.8, 0.97, 0.0],
};
export const KIND_LIST = Object.keys(KINDS).filter((k) => KINDS[k][3] > 0);
export const PROBLEM = new Set(['lost_job', 'ill', 'in_debt', 'evicted', 'job_hunting', 'breakup', 'addiction', 'row']);
export const KNAMES = Object.keys(KINDS), KIDX = Object.fromEntries(KNAMES.map((k, i) => [k, i]));
// numeric keys (kind index + 64 * (about + 262144 * other)): no string building on the hot path
export const key = (k, a, o) => KIDX[k] + 64 * (a + 262144 * (o || 0));
export const fkey = (k, a) => KIDX[k] + 64 * a;

export function addFact(S, w, k, a, o = 0, m = 1, opts = {}) {
  const sec = opts.sec ?? (w.rngFor('soc.sec', a, k, w.tick).next() < KINDS[k][2] ? 1 : 0);
  const f = { k, a, o, m, t: w.tick, sec, hold: opts.holders || [a] };
  S.facts.set(fkey(k, a), f);
  if (sec) S.stats.secrets.made++;
  return f;
}
export function truthOf(S, k, a, o, m) { const f = S.facts.get(fkey(k, a)); return f !== undefined && (!o || f.o === o || f.o === 0) && Math.abs(f.m - m) <= 1 ? 1 : 0; }
export function pruneFacts(S, tick) { if (S.facts.size < 4000) return; const lim = tick - 120 * TPD; for (const [k, f] of S.facts) if (f.t < lim && !f.sec) S.facts.delete(k); }

/** Insert/merge a belief into a person's capped store. Returns the stored belief. */
export function learn(S, ps, b) {
  const B = ps.B, kk = key(b.k, b.a, b.o), old = B.get(kk);
  if (b.a === ps.id && (PROBLEM.has(b.k) || KINDS[b.k][2] > 0.3)) ps.cfd = 1;
  if (old) {
    if (b.c > old.c) { old.c = old.c + (b.c - old.c) * 0.5; if (b.h < old.h) { old.h = b.h; old.s = b.s; } }
    old.t = b.t; if (b.nt) old.nt = 1; return old;
  }
  if (B.size >= 48) { let worst = null, wv = 1e9; for (const [x, v] of B) { const val = v.sal * (0.4 + v.c) * (v.a === ps.id ? 1.4 : 1) * (1 + 40 / (1 + (b.t - v.t) / TPD)); if (val < wv) { wv = val; worst = x; } } if (worst !== null) B.delete(worst); }
  B.set(kk, b); return b;
}
export function mkBelief(S, k, a, o, m, c, s, h, t, truth, extra) {
  return { k, a, o: o || 0, m, c, s, t, h, tr: truth === undefined ? truthOf(S, k, a, o, m) : truth, sal: KINDS[k][1], nt: 0, d: 0, ...(extra || {}) };
}
/** Plausible distortion of a proposition on the way from teller to hearer. Returns a (possibly new) {k,a,o,m,d} or the same belief copy. */
export function mutate(r, b, aPs, bPs, N, chan, w, S) {
  let { k, a, o, m } = b, d = 0, mis = 0;
  const pm = 0.035 + 0.05 * N + 0.04 * b.h + (chan === 2 ? 0.02 : 0);
  if (r.next() < pm) {
    const u = r.next();
    if (u < 0.5) { m = clamp(m + 1, 1, 3); d = 1; }                                                   // exaggerate
    else if (u < 0.72 && o) { o = 0; d = 1; }                                                          // omit the other party
    else if (u < 0.9 && aPs.top.length > 1) { const x = aPs.top[(r.next() * aPs.top.length) | 0]; if (x !== a && x !== bPs.id) { if (o) o = x; else a = x; d = 1; } } // swap in a similar person
    else if (u < 0.96) { m = clamp(m - 1, 1, 3); d = 1; }
  }
  if (!d) { const pmis = chan === 2 ? 0.015 : 0.01; if (r.next() < pmis) { m = clamp(m + (r.next() < 0.5 ? 1 : -1), 1, 3); mis = 1; d = 1; } }
  return { k, a, o, m, d, mis };
}
/** Pick what `ps` would like to say to `other`: self-news first, then gossip about third parties. Never beliefs about the hearer, told-in-confidence ones, or ones recently told. */
const TW = new Float64Array(64);
export function pickTopic(r, ps, other, tie, loyal, gossipy, now) {
  const tl = tie.tl; let tot = 0, i = 0; const arr = TOPICS; arr.length = 0;
  for (const [kk, v] of ps.B) {
    if (v.a === other.id || v.o === other.id) continue;
    if (tl && tl.includes(kk)) continue;
    if (v.nt && r.next() > (1 - loyal) * 0.3) continue;
    let w = v.sal * (0.25 + v.c) * (v.a === ps.id ? 2.2 : gossipy) / (1 + (now - v.t) / (40 * TPD));
    if (KINDS[v.k][0] === 0) w *= gossipy;
    tot += w; TW[i++] = w; arr.push(v);
  }
  if (!i) return null;
  let x = r.next() * tot; for (let j = 0; j < i; j++) { x -= TW[j]; if (x < 0) return arr[j]; }
  return arr[i - 1];
}
const TOPICS = [];
export function nontrivial(b) { return b.k !== 'moved_in'; }
