// SOCIAL plugin (W1-E): relationships, encounters, beliefs/gossip/secrets, reputation, norms, loneliness. Pairs with plugin 'comms' (phones, group chats, feeds, dating hooks).
//   STATE  world.soc  (see core.js).  One PS per person: ties (asymmetric multi-dimensional, off-map ties included), sightings of strangers, beliefs (cap 48).
//   QUERY  world.sys.social.query: ties(pid,{layer,max}) tie(a,b) knows(a,b) layers(pid) confidants(pid) beliefs(pid,{about}) believes(pid,kind,about) secrets(pid) reputation(pid) loneliness(pid) support(pid)
//          neighbourKnown(pid) norms(street) compat(a,b) stats() rumourSample(n) introducible(pid,n)
//   COMMANDS social.spreadRumour{about,claim:{kind,obj,m},seeds} social.revealSecret{person} social.introduce{a,b} social.feud{a,b} social.gossip{from,to,about} social.confide{from,to}
//            social.befriend{a,b} social.converse{a,b,act,ch} social.fact{kind,about,obj,m,knowers,secret}
//   EVENTS social.acquaint social.introduced social.friendship social.fallout social.reconcile social.rumour social.secret social.confide social.scandal social.kindness social.flirt
//          social.betray social.fade social.isolation social.feud social.norm_shift civic.complaint   (all with `cause` where the originating fact is an event)
import { newSoc, relayer, clamp, TPD, isOff, YEAR } from './core.js';
import { psOf, importPerson, maintain, closure, link, touch, mirror, counts, confidants, segInfo } from './ties.js';
import { buildVenues, sweep, neighbours, groupMeet, hom } from './encounters.js';
import { converse, ACT, tell, attractionPossible } from './acts.js';
import { KINDS, learn, mkBelief, truthOf, pruneFacts, addFact, key as bkey } from './beliefs.js';
import { news, everyday, neighboursLearn, placeId, isPlace } from './news.js';
import { encode, decode } from './persist.js';
import { doorDist } from './ties.js';
import { daily as normsDaily, monthly as normsMonthly, rebuildStreets, streetNorms } from './norms.js';

const N = 'number', S_ = 'string', B = 'boolean';
const EVENTS = [
  ['social.acquaint', 'Two regulars exchanged their first words', { via: S_, days: N }], ['social.introduced', 'Someone was introduced to a friend of a friend', { via: N, how: S_ }],
  ['social.friendship', 'An acquaintance became a friend', { via: S_ }], ['social.fallout', 'A row damaged a tie', { over: S_, c: N }], ['social.reconcile', 'Two people made up', { c: N }],
  ['social.rumour', 'News about someone passed along (distorted, a secret leaking, or deep in a chain)', { kind: S_, hops: N, distorted: B, truth: B }], ['social.secret', 'Someone is keeping a secret', { kind: S_ }],
  ['social.confide', 'Someone confided in a friend', { kind: S_, c: N }], ['social.scandal', 'A secret became common knowledge', { kind: S_, holders: N }], ['social.kindness', 'An act of care or comfort', { kind: S_ }],
  ['social.flirt', 'A flirtation that was returned (hook for the life package)', { returned: B, a: N }], ['social.betray', 'A lie or broken confidence was found out', { kind: S_ }],
  ['social.fade', 'A friendship drifted apart', { kind: S_ }], ['social.isolation', 'A person has become markedly isolated', { ls: N }], ['social.feud', 'A feud was declared (god command)', { why: S_ }],
  ['social.norm_shift', 'A street norm moved', { street: N, norm: S_, to: N }], ['civic.complaint', 'A formal or semi-formal complaint about a neighbourhood nuisance', { kind: S_, to: S_ }],
];
const bandOf = (a) => (a < 13 ? '0-12' : a < 18 ? '13-17' : a < 25 ? '18-24' : a < 35 ? '25-34' : a < 50 ? '35-49' : a < 65 ? '50-64' : '65+');
export { bandOf };

function registerAll(w, list) { for (const [type, doc, payload] of list) if (!w.events.registry.has(type)) w.registerEventType(type, { doc, payload }); }
function rebuild(w, S) {
  S.seg = {}; S.metro = new Map(w.lf.metro.map((m) => [m.id, m])); S.venues = buildVenues(w).map((v) => ({ id: v.id, soc: v.soc, t: v.t })); S.bk = Array.from({ length: 168 }, () => []);
  for (const id of S.ppl.keys()) S.bk[id % 168].push(id);
  rebuildStreets(w, S);
}
const adults = (w, ids) => ids.map((i) => w.people.get(i)).filter((p) => p && p.alive);

export function createSocial() {
  let W = null;
  return {
  name: 'social', version: '1.0.0', deps: [],
  init(world) {
    W = world; const S = world.soc = newSoc(); registerAll(world, EVENTS);
    S.seg = {}; S.metro = new Map(world.lf.metro.map((m) => [m.id, m]));
    for (const p of world.people.values()) if (p.alive && p.ext && p.ext.pop && !S.ppl.has(p.id)) importPerson(world, S, p);
    rebuild(world, S); S.venues = buildVenues(world).map((v) => ({ id: v.id, soc: v.soc, t: v.t }));
    S.stats.yr.y0 = world.tick;
    S.bigBlock = (w, p) => { const b = w.buildings.get(p.homeId); return !!(b && b.lf.units.length > 8); };
    wire(world);
  },
  clocks: {
    hour: (w) => hourly(w),
    day: (w) => dailyJobs(w),
    month: (w) => monthlyJobs(w),
    year: (w) => { const y = w.soc.stats.yr; w.soc.stats.lastYr = { n: y.n, l: y.l }; y.n = 0; y.l = 0; y.y0 = w.tick; },
  },
  serialize() { return encode(W.soc); },
  deserialize(st) { const st0 = decode(W, st); W.soc = st0; const keep = st0.street; rebuild(W, W.soc); W.soc.street = keep; W.soc.bigBlock = (w, p) => { const b = w.buildings.get(p.homeId); return !!(b && b.lf.units.length > 8); }; },
  commands: {
    'social.spreadRumour': (w, a) => cmdRumour(w, a),
    'social.revealSecret': (w, a) => cmdReveal(w, a),
    'social.introduce': (w, a) => { const x = w.people.get(a.a), y = w.people.get(a.b); if (!x || !y || !x.alive || !y.alive) return false; const res = link(w, w.soc, x, y, { k: 'friend', r: 'introduced', L: 4, c: 0.12, lv: 2, l: 0.25, e: 0.4 }, 'introduced'); w.emit('social.introduced', { actors: [x.id, y.id], salience: 0.12, tags: ['newcomer'], payload: { via: a.via || 0, how: 'introduced by hand' } }); if (res) converse(w, w.soc, w.rngFor('social'), x, y, 0, 'introduced', true); return true; },
    'social.feud': (w, a) => { const x = w.people.get(a.a), y = w.people.get(a.b); if (!x || !y) return false; const S = w.soc, res = link(w, S, x, y, { k: 'friction', r: 'feud', L: 4, c: 0.2, lv: 2, l: -0.5 }, 'feud'); if (!res) return false; for (const t of res) { t.l = -0.7; t.t = Math.min(t.t, 0.1); t.cf = 0.95; t.e = -0.4; t.k = 'friction'; } mirror(x, y, res[0]); mirror(y, x, res[1]); w.emit('social.feud', { actors: [x.id, y.id], salience: 0.5, tags: ['conflict', 'harm'], payload: { why: a.why || 'declared' } }); return true; },
    'social.gossip': (w, a) => pairCmd(w, a.from, a.to, 6), 'social.confide': (w, a) => pairCmd(w, a.from, a.to, 5), 'social.converse': (w, a) => pairCmd(w, a.a, a.b, a.act == null ? null : (typeof a.act === 'number' ? a.act : ACT.indexOf(a.act)), a.ch || 0),
    'social.befriend': (w, a) => { const x = w.people.get(a.a), y = w.people.get(a.b); if (!x || !y || !x.alive || !y.alive) return false; const S = w.soc, res = link(w, S, x, y, { k: 'friend', r: 'friend', L: 4, c: 0.1, lv: 2, l: 0.25 }, 'befriended'); if (!res) return false; for (let i = 0; i < 3; i++) converse(w, S, w.rngFor('social'), x, y, 0, 'befriend', false, i === 0 ? 0 : 1); for (const t of res) { t.c = Math.max(t.c, 0.3); t.k = 'friend'; } relayer(psOf(w, S, x.id)); relayer(psOf(w, S, y.id)); return true; },
    'social.fact': (w, a) => { const r = w.rngFor('social'); news(w, w.soc, r, a.kind, a.about, a.obj || 0, a.m || 1, a.cause, { sec: a.secret ? 1 : undefined, knowers: a.knowers }); return true; },
  },
  query: {
    ties: (pid, o = {}) => tiesOf(W, pid, o), tie: (a, b) => { const ps = W.soc.ppl.get(a), t = ps && ps.T.get(b); return t ? { ...t, tl: undefined } : null; },
    knows: (a, b) => { const ps = W.soc.ppl.get(a), t = ps && ps.T.get(b); return !!(t && t.lv >= 2); },
    layers: (pid) => { const ps = W.soc.ppl.get(pid); return ps ? counts(ps).slice(1) : [0, 0, 0, 0]; },
    confidants: (pid) => { const ps = W.soc.ppl.get(pid); return ps ? confidants(ps) : 0; },
    beliefs: (pid, o = {}) => { const ps = W.soc.ppl.get(pid); return ps ? [...ps.B.values()].filter((b) => (o.about == null || b.a === o.about) && (!o.kind || b.k === o.kind)).map((b) => ({ ...b })) : []; },
    believes: (pid, kind, about) => { const ps = W.soc.ppl.get(pid); if (!ps) return null; for (const b of ps.B.values()) if (b.k === kind && b.a === about) return { ...b }; return null; },
    secrets: (pid) => { const o = []; for (const f of W.soc.facts.values()) if (f.a === pid && f.sec) o.push({ kind: f.k, holders: f.hold.length, out: !!f.out }); return o; },
    reputation: (pid) => { const p = W.people.get(pid); return p ? p.reputation : 0; },
    loneliness: (pid) => { const ps = W.soc.ppl.get(pid); return ps ? ps.ls : 0; },
    support: (pid) => { const ps = W.soc.ppl.get(pid); return ps ? counts(ps)[1] + counts(ps)[2] : 0; },
    neighbourKnown: (pid) => neighbourKnown(W, pid),
    norms: (street) => { const n = W.soc.norms[street]; return n ? { ...n.s } : null; },
    compat: (a, b) => { const x = W.people.get(a), y = W.people.get(b); return x && y ? hom(W, x, y) : 0; },
    stats: () => JSON.parse(JSON.stringify(W.soc.stats)),
    rumourSample: (n = 6) => W.soc.rumours.slice(-n).map((x) => ({ ...x })),
    introducible: (pid, n = 5) => introducible(W, pid, n),
    attractionPossible: (a, b) => { const x = W.people.get(a), y = W.people.get(b); return !!(x && y && attractionPossible(W, x, y)); },
  },
  };
}
export default createSocial();
function neighbourKnown(w, pid) {
  const p = w.people.get(pid), ps = w.soc.ppl.get(pid); if (!p || !ps) return false;
  for (const [k, t] of ps.T) { if (isOff(k) || t.lv < 2 || t.k !== 'neighbour') continue; const o = w.people.get(k); if (!o || o.ext.pop.hh === p.ext.pop.hh || !o.alive) continue; if (o.ext.pop.hh === p.ext.pop.hh || (o.homeId != null && w.buildings.get(o.homeId) && (o.ext.pop.hh === p.ext.pop.hh || doorDist(w, p, o) <= 20))) return true; }
  return false;
}
function introducible(w, pid, n) {
  const S = w.soc, ps = S.ppl.get(pid); if (!ps) return []; const out = [];
  for (const f of ps.top) { const fp = S.ppl.get(f); if (!fp) continue; for (const g of fp.top) if (g !== pid && !ps.T.has(g)) out.push(g); if (out.length >= n * 3) break; }
  return [...new Set(out)].slice(0, n);
}
function tiesOf(w, pid, o) {
  const ps = w.soc.ppl.get(pid); if (!ps) return []; const out = [];
  for (const t of ps.T.values()) { if (t.lv < 2 || (o.layer && t.L > o.layer)) continue; const q = typeof t.o === 'number' ? w.people.get(t.o) : null; out.push({ o: t.o, name: q ? q.firstName + ' ' + q.lastName : (w.soc.metro.get(t.o) || {}).name || '?', k: t.k, r: t.r, L: t.L, c: +t.c.toFixed(3), t: +t.t.toFixed(2), l: +t.l.toFixed(2), e: +t.e.toFixed(2), d: +t.d.toFixed(2), a: +t.a.toFixed(2), on: t.on, v: t.v, cf: +t.cf.toFixed(2), last: t.la }); }
  out.sort((x, y) => y.c - x.c); return o.max ? out.slice(0, o.max) : out;
}
function pairCmd(w, ai, bi, act, ch = 0) { const a = w.people.get(ai), b = w.people.get(bi); if (!a || !b || !a.alive || !b.alive) return false; return converse(w, w.soc, w.rngFor('social'), a, b, ch, 'asked', false, act) >= 0; }

function cmdRumour(w, a) {
  const S = w.soc, r = w.rngFor('social'), about = a.about, cl = a.claim || { kind: 'affair' }, kind = KINDS[cl.kind] ? cl.kind : 'affair';
  const subj = w.people.get(about); if (!subj) return false;
  // a rumour (not a fact): nothing in world.soc.facts backs it unless the claim happens to be true
  const seeds = a.seeds || 3; const pool = a.from != null ? [a.from] : [...(psOf(w, S, about)?.top || [])];
  let n = 0; const ids = pool.length ? pool : [...S.ppl.keys()].slice(0, 20);
  for (let i = 0; i < Math.max(seeds, 1) && ids.length; i++) { const id = ids[(r.next() * ids.length) | 0], ps = psOf(w, S, id); if (!ps || id === about) continue; learn(S, ps, mkBelief(S, kind, about, cl.obj || 0, cl.m || 1, 0.7, -5, 1, w.tick, undefined, { d: 1 })); n++; }
  w.emit('social.rumour', { actors: [about], salience: 0.15, tags: ['gossip'], payload: { kind, hops: 1, distorted: true, truth: !!truthOf(S, kind, about, cl.obj || 0, cl.m || 1) } });
  return n;
}
function cmdReveal(w, a) {
  const S = w.soc, r = w.rngFor('social'), p = w.people.get(a.person); if (!p) return false; const ps = psOf(w, S, p.id); let n = 0;
  for (const [k, f] of S.facts) { if (f.a !== p.id || !f.sec || f.out) continue; f.out = 1; S.stats.secrets.revealed++; n++; S.stats.secrets.lifeTicks.push(w.tick - f.t);
    for (const t of ps.T.values()) { if (t.L > 3 || typeof t.o !== 'number') continue; const q = S.ppl.get(t.o); if (q) learn(S, q, mkBelief(S, f.k, f.a, f.o, f.m, 0.85, -4, 2, w.tick, 1, { ev: f.ev })); }
    w.emit('social.scandal', { actors: [p.id], salience: 0.5, cause: f.ev || 0, tags: ['gossip', 'secret'], payload: { kind: f.k, holders: (f.hold || []).length } }); }
  return n;
}

function hourly(w) {
  const S = w.soc, r = w.rngFor('social'), t = w.time, hour = t.hour;
  sweep(w, S, r, hour);
  const how = t.dow * 24 + hour, ids = S.bk[how], wn = Math.floor(w.tick / 1008);
  for (let i = 0; i < ids.length; i++) {
    const p = w.people.get(ids[i]); if (!p || !p.alive || !p.ext.pop) continue;
    if ((wn + p.id) % 13 === 0) maintain(w, S, p, r);
    if ((wn + p.id) % 2 === 0) { closure(w, S, p, r); everyday(w, S, r, p); neighbours(w, S, r, p); neighbours(w, S, r, p); chatter(w, S, r, p); }
  }
  if (S.q.length) { let k = 0; while (k < S.q.length && S.q[k].t <= w.tick) { const it = S.q[k++]; if (it.f === 'lie') detectLie(w, S, r, it); } if (k) S.q.splice(0, k); }
}
/** Remote contact: messages and calls with close on-map ties carry news too (beliefs flow without co-presence). */
function chatter(w, S, r, p) {
  const ps = S.ppl.get(p.id); if (!ps || ps.top.length === 0) return;
  const age = w.ageOf(p); if (age < 12) return;
  const rate = 0.4 + Math.min(1.2, ps.mr / 60); let n = Math.floor(rate) + (r.next() < rate % 1 ? 1 : 0);
  while (n-- > 0) {
    const id = ps.top[(r.next() * ps.top.length) | 0], q = w.people.get(id); if (!q || !q.alive) continue;
    const t = ps.T.get(id); if (!t || t.lv < 2) continue;
    converse(w, S, r, p, q, r.next() < 0.28 ? 1 : 2, 'remote');
  }
  // household table talk: news travels inside a home too
  const b = w.buildings.get(p.homeId); if (b && b.residents.length > 1 && r.next() < 0.12) { const id = b.residents[(r.next() * b.residents.length) | 0]; const q = w.people.get(id); if (q && q.alive && q !== p && q.ext.pop.hh === p.ext.pop.hh && w.ageOf(q) >= 8) { const A = ps, B = psOf(w, S, q.id), ta = A.T.get(q.id), tb = B && B.T.get(p.id); if (B && ta && tb) tell(w, S, r, p, q, A, B, ta, tb, 0, true); } }
}
function detectLie(w, S, r, it) {
  const ps = S.ppl.get(it.b); const b = ps && ps.B.get(it.key); if (!b || !b.lie) return;
  if (r.next() < 0.35) { const t = ps.T.get(it.a); if (t) { t.t = clamp(t.t - 0.25, 0, 1); t.l = clamp(t.l - 0.2, -1, 1); t.cf = clamp(t.cf + 0.4, 0, 1); } ps.B.delete(it.key); w.emit('social.betray', { actors: [it.b, it.a], salience: 0.3, tags: ['conflict', 'harm'], payload: { kind: 'lie' } }); }
  else S.q.push({ t: w.tick + 21 * TPD, f: 'lie', a: it.a, b: it.b, key: it.key });
}
function dailyJobs(w) {
  const S = w.soc, r = w.rngFor('social.d');
  normsDaily(w, S, r); pruneFacts(S, w.tick);
  // secrets get found out: more holders, more risk (partners notice, bailiffs call, a friend lets it slip)
  if (w.time.dow === 2) for (const [k, f] of S.facts) { if (!f.sec || f.out) continue; const risk = 0.004 + 0.006 * (f.hold.length - 1) + 0.01 * ((f.leak || 0)); if (r.next() < risk) { f.out = 1; S.stats.secrets.revealed++; S.stats.secrets.lifeTicks.push(w.tick - f.t); const p = w.people.get(f.a); const ps = p && S.ppl.get(p.id); if (ps) { let c = 0; for (const t of ps.T.values()) { if (t.L > 2 || typeof t.o !== 'number' || c > 4) continue; const q = S.ppl.get(t.o); if (q) { learn(S, q, mkBelief(S, f.k, f.a, f.o, f.m, 0.8, -4, 2, w.tick, 1, { ev: f.ev })); c++; } } w.emit('social.scandal', { actors: [f.a], salience: 0.4, cause: f.ev || 0, tags: ['gossip', 'secret'], payload: { kind: f.k, holders: f.hold.length } }); } } }
}
function monthlyJobs(w) {
  const S = w.soc, r = w.rngFor('social.m');
  rebuildStreets(w, S); normsMonthly(w, S);
  for (const p of w.living()) {
    const ps = S.ppl.get(p.id); if (!ps || !p.ext.pop) continue;
    if ((p.id + (w.tick / 4032 | 0)) % 3) continue;
    // reputation = distributed opinion of those who know me (aggregated on read, mirrored for the legacy field)
    let sum = 0, wt = 0; for (const [k, t] of ps.T) { if (isOff(k) || t.lv < 2) continue; const o = S.ppl.get(k); const ot = o && o.T.get(p.id); if (!ot) continue; const x = 0.3 + ot.c; sum += (ot.e * 0.5 + ot.l * 0.5) * x; wt += x; }
    p.reputation = wt > 0.2 ? clamp(sum / wt, -1, 1) : 0;
    if (ps.ls > 0.85 && w.ageOf(p) >= 16 && r.next() < 0.15 && w.tick - (ps.lastIso || -1e9) > 120 * TPD) { ps.lastIso = w.tick; w.emit('social.isolation', { actors: [p.id], salience: 0.15, tags: ['lonely'], payload: { ls: +ps.ls.toFixed(2) } }); }
  }
}
// ---- event wiring: facts, announcements and goal moves -------------------------------------------------------------------------------------------------------------
function wire(w) {
  const on = (type, fn) => { if (w.events.registry.has(type)) w.on(type, (ev) => fn(ev)); };
  const S = () => w.soc, R = () => w.rngFor('social.ev');
  const sub = (ev) => ev.actors[0];
  const adult = (ev) => { for (const id of ev.actors) { const p = w.people.get(id); if (p && w.ageOf(p) >= 16) return id; } return ev.actors[0]; };
  on('life.couple', (ev) => { const [a, b] = ev.actors; news(w, S(), R(), 'new_couple', a, b || 0, 1, ev.id, { knowers: b ? [a, b] : [a] }); });
  on('life.breakup', (ev) => { const [a, b] = ev.actors; news(w, S(), R(), 'breakup', a, b || 0, 1, ev.id, { knowers: b ? [a, b] : [a] }); });
  on('life.marriage', (ev) => { const [a, b] = ev.actors; news(w, S(), R(), 'wedding', a, b || 0, 1, ev.id, { knowers: b ? [a, b] : [a] }); });
  on('life.pregnant', (ev) => news(w, S(), R(), 'pregnant', sub(ev), 0, 1, ev.id));
  on('life.birth', (ev) => { const a = adult(ev); news(w, S(), R(), 'new_baby', a, 0, 1, ev.id, { sec: 0 }); const p = w.people.get(a); if (p) neighboursLearn(w, S(), p.homeId, 'new_baby', a, 0, 1, ev.id, 0.7); });
  on('life.death', (ev) => { const a = sub(ev); const ps = S().ppl.get(a), p = w.people.get(a); const kn = []; if (ps) for (const t of ps.T.values()) if (typeof t.o === 'number' && (t.L <= 3 || t.k === 'neighbour')) kn.push(t.o); news(w, S(), R(), 'died', a, 0, 3, ev.id, { sec: 0, knowers: kn.slice(0, 60), quiet: true }); if (p) neighboursLearn(w, S(), p.homeId, 'died', a, 0, 3, ev.id, 0.9); });
  on('life.kin_death', (ev) => news(w, S(), R(), 'family_news', sub(ev), 0, 3, ev.id, { sec: 0 }));
  for (const t of ['housing.moved_out', 'life.move_out']) on(t, (ev) => { if (ev.payload && ev.payload.to === 'local') return; for (const id of ev.actors.slice(0, 3)) news(w, S(), R(), 'moving_out', id, 0, 1, ev.id); });
  on('housing.moved_in', (ev) => { if (ev.payload && ev.payload.reason === 'flatmate_arrival') return; const a = sub(ev); neighboursLearn(w, S(), ev.place, 'moved_in', a, 0, 1, ev.id, 0.75, a); });
  on('labour.hired', (ev) => news(w, S(), R(), 'new_job', sub(ev), 0, 1, ev.id));
  on('labour.promoted', (ev) => news(w, S(), R(), 'promotion', sub(ev), 0, 1, ev.id));
  on('labour.job_lost', (ev) => news(w, S(), R(), 'lost_job', sub(ev), 0, 1, ev.id));
  on('labour.applied', (ev) => { const p = w.people.get(sub(ev)); if (p && p.ext.pop.activity === 'employed' && w.rngFor('soc.app', p.id, w.tick).next() < 0.7) news(w, S(), R(), 'job_hunting', p.id, 0, 1, ev.id, { sec: 1, emit: false }); });
  on('housing.rent_rise', (ev) => { const a = sub(ev); news(w, S(), R(), 'rent_rise', a, 0, ev.payload.pct > 12 ? 2 : 1, ev.id, { sec: 0 }); neighboursLearn(w, S(), ev.place, 'rent_rise', a, 0, 1, ev.id, 0.55); });
  on('housing.eviction', (ev) => news(w, S(), R(), 'evicted', sub(ev), 0, 2, ev.id));
  for (const t of ['money.arrears', 'money.debt_spiral']) on(t, (ev) => { if (ev.actors.length) { const a = adult(ev); news(w, S(), R(), 'in_debt', a, 0, t === 'money.debt_spiral' ? 2 : 1, ev.id, { sec: w.rngFor('soc.debt', a, w.tick).next() < 0.85 ? 1 : 0 }); } });
  on('health.diagnosis', (ev) => news(w, S(), R(), 'ill', sub(ev), 0, 2, ev.id));
  on('health.ill', (ev) => { if (ev.payload.severity >= 2) news(w, S(), R(), 'ill', sub(ev), 0, 1, ev.id, { quiet: false }); });
  on('health.substance', (ev) => { if (ev.payload.change === 'dependent' || ev.payload.change === 'started') news(w, S(), R(), 'addiction', sub(ev), 0, 2, ev.id, { sec: 1 }); });
  on('labour.firm_closed', (ev) => { const b = w.buildings.get(ev.place); const kn = b ? b.employees.slice(0, 12) : []; news(w, S(), R(), 'shop_closing', placeId(ev.place), 0, 2, ev.id, { sec: 0, knowers: kn, quiet: true }); });
  on('labour.firm_opened', (ev) => { const b = w.buildings.get(ev.place); news(w, S(), R(), 'shop_opening', placeId(ev.place), 0, 1, ev.id, { sec: 0, knowers: b ? b.employees.slice(0, 12) : [], quiet: true }); });
  for (const t of ['crime.burglary', 'crime.bike_theft', 'crime.antisocial', 'crime.assault']) on(t, (ev) => { const a = sub(ev); if (a == null) return; news(w, S(), R(), 'crime_nearby', a, 0, t === 'crime.assault' ? 3 : 2, ev.id, { sec: 0 }); const p = w.people.get(a); if (p) neighboursLearn(w, S(), p.homeId, 'crime_nearby', a, 0, 2, ev.id, 0.85); });
  on('group.meeting', (ev) => groupMeet(w, S(), R(), ev.actors));
  on('goal.step', (ev) => goalMove(w, S(), w.rngFor('social.mv'), ev));
}
function goalMove(w, S, r, ev) {
  const pl = ev.payload; if (!pl || ev.actors.length < 2) { if (pl && pl.move === 'post' && pl.ok === 'ok' && w.commands.has('comms.post')) w.cmd('comms.post', { author: ev.actors[0], kind: 'goal', cause: ev.id }); return; }
  const a = w.people.get(ev.actors[0]), b = w.people.get(ev.actors[1]); if (!a || !b || !a.alive || !b.alive) return;
  const ok = pl.ok === 'ok', m = pl.move;
  if (!ok) { if (pl.why === 'refused') { const A = psOf(w, S, a.id), t = A && A.T.get(b.id); if (t) { t.l = clamp(t.l - 0.015, -1, 1); } } return; }
  const act = { gossip: 6, confide: 5, confront: 7, apologise: 8, comfort: 11, ask: 10, borrow: 10, persuade: 0, recruit: 0, invite: 0, visit: 0, message: 2, befriend: 0, gift: 0, lend: 11, flatter: 0, mediate: 8 }[m];
  if (act === undefined) { if (m === 'lie') lie(w, S, r, a, b, ev); return; }
  const ch = m === 'message' ? 2 : 0; const A = psOf(w, S, a.id), B = psOf(w, S, b.id); if (!A || !B) return;
  converse(w, S, r, a, b, ch, 'goal', false, act);
  const ta = A.T.get(b.id), tb = B.T.get(a.id);
  if (ta && tb) { if (m === 'befriend' || m === 'invite' || m === 'visit') { touch(ta, 0, 1.5, w.tick); touch(tb, 0, 1.5, w.tick); } if (m === 'gift') { tb.d -= 0.2; ta.d += 0.2; tb.l = clamp(tb.l + 0.05, -1, 1); } if (m === 'lend' || m === 'borrow') { const x = m === 'borrow' ? tb : ta, y = m === 'borrow' ? ta : tb; x.d += 0.3; y.d -= 0.3; } }
}
function lie(w, S, r, a, b, ev) {
  const B = psOf(w, S, b.id); if (!B) return; const kind = ['holiday', 'new_job', 'family_news', 'hobby_news'][(r.next() * 4) | 0];
  const bel = learn(S, B, mkBelief(S, kind, a.id, 0, 1, 0.8, a.id, 1, w.tick, 0, { lie: 1, d: 1, ev: ev.id })); S.q.push({ t: w.tick + 14 * TPD, f: 'lie', a: a.id, b: b.id, key: bkey(kind, a.id, 0) });
}
