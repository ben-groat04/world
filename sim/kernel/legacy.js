// Adapters that let the OLD medieval systems (sim/systems/*, not owned by the kernel) run on the new scheduler without editing them.
//  * social: its per-tick encounter pass (bucket every living person by place every 6th tick) is replaced by a VENUE-SESSION pass over the
//    maintained occupancy sets (b.occupants) + analytic walkers: only venues with >=2 awake people are touched. Conversation logic is the
//    system's own world.social_api.converse (unchanged); the pass is a port of social.js onTick/startProb.
//    social's `S.at` (place -> people) becomes a lazy per-tick view over b.occupants (read by socialBias / converse).
// Only active when sched.mode === 'agenda' (legacy mode keeps the system verbatim).
import { has } from '../util.js';
import { TICKS_PER_YEAR } from '../time.js';

const TALK_EVERY = 6;
const byId = (a, b) => a.id - b.id;
const OUT = 100000;

class AtView {
  constructor(world) { this.w = world; this.t = -1; this.b = new Map(); this.out = new Map(); }
  _fresh() { if (this.t !== this.w.tick) { this.t = this.w.tick; this.b.clear(); } }
  get(key) {
    if (key >= OUT) return this.out.get(key);
    this._fresh();
    let a = this.b.get(key);
    if (a === undefined) { const bd = this.w.buildings.get(key); if (!bd || bd.occupants.size === 0) return undefined; a = Array.from(bd.occupants); this.b.set(key, a); }
    return a;
  }
  has(key) { return this.get(key) !== undefined; }
}

function startProb(world, p, loc) {
  const pe = p.personality.extraversion;
  let m = 0.11 * (0.45 + pe) * (1.5 - p.needs.social * 0.8);
  if (has(p, 'shy')) m *= 0.6;
  if (has(p, 'gossip')) m *= 1.2;
  if (!loc) return m * 0.25;
  const t = loc.type;
  if (t === 'house') m *= 0.45;
  else if (p.workId === loc.id) m *= 0.4;
  else if (t === 'tavern' || t === 'market' || t === 'square' || t === 'park' || t === 'well') m *= 1.3;
  else if (t === 'school') m *= 0.9;
  else if (t === 'temple') m *= 0.6;
  if (p.currentAction && p.currentAction.id === 'work') m *= 0.8;
  return m;
}

function encounterGroup(world, S, converse, arr, loc, tick, hour, minBorn) {
  const n = arr.length, rng = world.rng;
  for (let i = 0; i < n; i++) {
    const p = arr[i];
    if (p._nextTalk > tick || p.birthTick > minBorn || !p.alive) continue;
    if (p.id === world.player) continue;
    const ca = p.currentAction;
    if (ca !== null && (ca.id === 'sleep' || ca.id === 'bathe')) continue;
    if (loc && loc.id === p.homeId && (hour >= 22 || hour < 6)) continue;
    if (p.illness && p.illness.severity > 0.6) continue;
    if (rng.next() >= Math.min(0.95, startProb(world, p, loc) * TALK_EVERY)) continue;
    const cands = [];
    for (let k = 0; k < 4 && cands.length < 3; k++) {
      const q = arr[rng.int(0, n - 1)];
      if (q === p || !q.alive || cands.includes(q) || q._nextTalk > tick || q.birthTick > minBorn) continue;
      const qa = q.currentAction;
      if (qa !== null && (qa.id === 'sleep' || qa.id === 'bathe')) continue;
      const r = p.relationships.get(q.id);
      if (r && tick - (r._talk || -999) < 6) continue;
      cands.push(q);
    }
    if (!cands.length) continue;
    const other = rng.weighted(cands, (q) => {
      const r = p.relationships.get(q.id);
      let w = 0.4;
      if (r) w += r.familiarity * 2 + Math.max(0, r.affinity) * 2 + (r.attraction > 0.3 ? 1 : 0) - Math.max(0, -r.affinity) * 0.8 + (r.grudge || 0) * (has(p, 'hothead') ? 2 : 0);
      if (p._visitFriendId === q.id) w += 4;
      if (tick - p.birthTick < 12 * TICKS_PER_YEAR && tick - q.birthTick < 12 * TICKS_PER_YEAR) w += 1;
      return Math.max(0.05, w);
    });
    if (!loc) {
      const r = p.relationships.get(other.id);
      if (!r || r.familiarity < 0.2) { converse(world, p, other, { type: 'greeting' }); p._nextTalk = other._nextTalk = tick + 2; continue; }
    }
    const dur = rng.int(2, 5);
    converse(world, p, other);
    p._nextTalk = tick + dur; other._nextTalk = tick + dur;
  }
}

function encounterPass(world) {
  const tick = world.tick;
  if (tick % TALK_EVERY !== 0) return;
  const S = world.social, api = world.social_api;
  if (!S || !api) return;
  const converse = api.converse, hour = world.time.hour, minBorn = tick - 3 * TICKS_PER_YEAR;
  const view = S.at;
  // venues: only those with >= 2 occupants (maintained by the engine); ascending building id, people ascending id
  for (const b of world.buildings.values()) {
    if (b.occupants.size < 2) continue;
    if (b.type === 'house' && (hour >= 22 || hour < 6)) continue; // everyone home at night is asleep/ignored by the encounter rules
    const arr = Array.from(b.occupants); arr.sort(byId);
    encounterGroup(world, S, converse, arr, b, tick, hour, minBorn);
  }
  // outdoor walkers: 4-tile cells (legacy keys); materialise positions first
  if (world._walkers.size >= 2) {
    world._syncWalkers();
    const cells = new Map();
    for (const p of world._walkers) { const k = OUT + ((p.y >> 2) << 8) + (p.x >> 2); const a = cells.get(k); if (a === undefined) cells.set(k, [p]); else a.push(p); }
    view.out = cells;
    const keys = [...cells.keys()].sort((a, b) => a - b);
    for (const k of keys) { const arr = cells.get(k); if (arr.length < 2) continue; arr.sort(byId); encounterGroup(world, S, converse, arr, null, tick, hour, minBorn); }
    view.out = new Map();
  }
}

/** Wrap a legacy system for agenda mode (returns the same object when no adaptation applies). */
export function adaptLegacySystem(world, sys) {
  if (!world.sched.agenda || !sys || sys.name !== 'social') return sys;
  const a = Object.create(sys);
  a.onTick = encounterPass;
  a.init = function (w) { sys.init(w); a.afterLoad(w); };
  a.afterLoad = function (w) { if (w.social) w.social.at = new AtView(w); };
  return a;
}
