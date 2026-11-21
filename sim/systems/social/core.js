// Social core (W1-E): shared constants, state, tie model, helpers. All state lives in world.soc (plain JSON-able; Maps are re-built on load).
//   tie (asymmetric, one per direction): {o: personId | 'm<n>' off-map, k kind, r relation label, L layer 1..4 (support/sympathy/band/acquaintance), c closeness 0..1, t trust, l liking -1..1,
//        e respect -1..1, d obligation (+ they owe me), a attraction 0..1, h contacts, f0 first tick, la last contact tick, ch last channel, v how it formed, cf open conflict 0..1,
//        lv 1 recognised / 2 known by name, on 1 on-map / 0 off-map or away, sy last c mirrored into the legacy Rel, tl recently-told belief keys}
import { hash32 } from '../../kernel/rng.js';
export const TPD = 144, WEEK = 7 * TPD, YEAR = 365 * TPD;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const CH = { F2F: 0, CALL: 1, MSG: 2, SOC: 3 };
export const CH_NAME = ['face-to-face', 'call', 'message', 'social media'];
export const CH_EFF = [1, 0.6, 0.3, 0.08];
export const GAIN = 0.03;                 // closeness gained per face-to-face contact at c=0
export const LAYER_CAP = [0, 5, 15, 50, 150];
export const NOT_FOLLOWED = new Set(['m', 'x']);
export const ageOf = (w, p) => w.ageOf(p);
export const fullName = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
export const isOff = (k) => typeof k === 'string';

export function newSoc() {
  return {
    ppl: new Map(), facts: new Map(), chats: [], nextChat: 1, posts: [], nextPost: 1, forum: { members: [], posts: [], n: 0 }, norms: {}, q: [], rumours: [], dating: { users: [], day: -1 },
    stats: { newTies: 0, lostTies: 0, fades: 0, conv: 0, acts: new Array(12).fill(0), rum: { told: 0, mut: 0, mis: 0, byHop: [0, 0, 0, 0, 0, 0, 0], wrongByHop: [0, 0, 0, 0, 0, 0, 0], benign: 0, nonBenign: 0, falseDriven: 0, byKind: new Array(40).fill(0) },
      secrets: { made: 0, kept: 0, leaked: 0, revealed: 0, lifeTicks: [] }, msgs: { dm: 0, grp: 0, byBand: {} }, calls: 0, posts: { feed: 0, forum: 0, daily: 0, event: 0 }, viral: 0, pile: 0, matches: 0, norm: { viol: 0, compl: 0 }, enc: { sess: 0, pairs: 0 }, yr: { n: 0, l: 0, y0: 0 } },
    sync: 0,
  };
}
export const emptyPS = (id) => ({ id, T: new Map(), ST: new Map(), B: new Map(), top: [], ch: [], ls: 0, pr: 0, mr: 0, fm: 0, dt: 0, nf: 0, wk: 0, mt: 0, sc: 0, lt: 0, sk: 0, lastPost: 0 });
export const kinOf = (k) => k === 'kin' || k === 'partner' || k === 'ex';

export function mkTie(o, d, tick) {
  const c = d.c ?? 0.1;
  return { o, k: d.k || 'acq', r: d.r || '', L: d.L || 4, c, t: d.t ?? clamp(0.2 + c * 0.7, 0, 1), l: d.l ?? clamp(0.1 + c * 0.8, -1, 1), e: d.e ?? 0.3, d: d.d || 0, a: d.a || 0, h: d.h || 0, f0: tick, la: tick, ch: d.ch || 0, v: d.v || '', cf: d.cf || 0, lv: d.lv || 2, on: d.on ?? 1, sy: c };
}
/** Re-rank one person's ties into layers (support <=5, sympathy <=15, band <=50, acquaintance rest). Kin/partners are sticky within their rank. */
export function relayer(ps) {
  const arr = [];
  for (const t of ps.T.values()) if (t.lv >= 2) arr.push(t); else t.L = 4;
  arr.sort((x, y) => y.c - x.c || (x.k > y.k ? 1 : -1));
  const top = []; let i = 0;
  for (const t of arr) {
    const L = i < 5 && t.c >= 0.45 ? 1 : i < 15 && t.c >= 0.28 ? 2 : i < 50 && t.c >= 0.12 ? 3 : 4;
    t.L = L; i++; if (L <= 3 && !isOff(t.o)) top.push(t.o);
  }
  ps.top = top;
}
export const hashU = (...a) => hash32(...a) / 4294967296;
