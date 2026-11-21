// Event bus + bounded event log with actor/place/type indices and causal query.
// New-style emit: world.emit('life.birth', {actors:[child,mother], place, salience, payload}) -> eventId. Stored, queued, and dispatched to
// handlers AFTER the emitting phase (world.events.flush(), called by the step loop after people, systems, clocks): handlers never run
// re-entrantly and run in registration order. Legacy types bypass all this (sync dispatch in World.emit).
// Log is a ring: the newest `cap` events (default 60000) are kept; per-actor/place/type indices are trimmed lazily.
import { makeRegistry } from './event-types.js';

const EMPTY = Object.freeze([]);
const CHECK = { number: (v) => typeof v === 'number', string: (v) => typeof v === 'string', boolean: (v) => typeof v === 'boolean', object: (v) => v !== null && typeof v === 'object', any: () => true };

export class EventBus {
  constructor(world, opts = {}) {
    this.world = world;
    this.registry = opts.registry || makeRegistry();
    this.cap = opts.cap || 60000;
    this.nextId = 1;
    this.log = new Map();                 // id -> record (insertion ordered => oldest first)
    this.byActor = new Map(); this.byPlace = new Map(); this.byType = new Map(); this.byCause = new Map();
    this.handlers = new Map();            // type -> [{fn, order}]
    this.queue = []; this.dispatching = false; this.hid = 0;
    this.stats = { emitted: 0, withCause: 0, dropped: 0, byType: {} };
    this.validate = !!opts.validate;      // payload schema checks (dev/test)
  }
  register(type, def) { this.registry.register(type, def); return this; }
  on(type, fn) {
    const reg = this.registry.get(type);
    if (!reg && this.world.strictEvents) throw new Error(`world.on: unknown event type '${type}' (register it in sim/kernel/event-types.js or registerEventType)`);
    let l = this.handlers.get(type); if (!l) this.handlers.set(type, (l = []));
    const h = { fn, order: this.hid++ }; l.push(h);
    return () => { const i = l.indexOf(h); if (i >= 0) l.splice(i, 1); };
  }
  emit(type, input = {}) {
    const reg = this.registry.get(type);
    if (!reg) { if (this.world.strictEvents) throw new Error(`unknown event type '${type}'`); this.registry.register(type, { legacy: false }); }
    if (this.validate && reg && reg.payload) this._check(reg, input);
    const id = this.nextId++;
    const rec = { id, type, tick: this.world.tick, actors: input.actors || EMPTY, objects: input.objects || EMPTY, place: input.place ?? null, tags: input.tags || null, cause: input.cause || 0, salience: input.salience ?? 0.1, payload: input.payload || null };
    this.log.set(id, rec);
    for (let i = 0; i < rec.actors.length; i++) push(this.byActor, rec.actors[i], id);
    if (rec.place !== null) push(this.byPlace, rec.place, id);
    push(this.byType, type, id);
    if (rec.cause) { push(this.byCause, rec.cause, id); this.stats.withCause++; }
    this.stats.emitted++; this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
    if (this.log.size > this.cap) this._trim();
    if (this.handlers.has(type)) this.queue.push(rec);
    return id;
  }
  _check(reg, input) {
    const p = input.payload || {};
    for (const k of Object.keys(reg.payload)) { const c = CHECK[reg.payload[k]]; if (!c) throw new Error(`event ${reg.type}: bad schema type ${reg.payload[k]}`); if (!(k in p)) throw new Error(`event ${reg.type}: payload.${k} missing`); if (!c(p[k])) throw new Error(`event ${reg.type}: payload.${k} should be ${reg.payload[k]}`); }
  }
  /** Run queued handlers. Safe to call any time; re-entrant calls are no-ops (events emitted by handlers are processed in the same flush). */
  flush() {
    if (this.dispatching || this.queue.length === 0) return;
    this.dispatching = true;
    try {
      let guard = 0;
      for (let i = 0; i < this.queue.length; i++) {
        if (++guard > 200000) throw new Error('event flush runaway (handler cycle?)');
        const rec = this.queue[i], l = this.handlers.get(rec.type);
        if (l) for (let k = 0; k < l.length; k++) l[k].fn(rec, this.world);
      }
    } finally { this.queue.length = 0; this.dispatching = false; }
  }
  get(id) { return this.log.get(id) || null; }
  /** query({actor, place, type, since, until, cause, minSalience, limit=50}) -> newest-first records. `cause` finds effects of that event. */
  query(q = {}) {
    const { actor, place, type, since = -Infinity, until = Infinity, cause, minSalience = 0, limit = 50 } = q;
    let src = null;
    const pick = (m, k) => { const l = m.get(k) || EMPTY; if (src === null || l.length < src.length) src = l; };
    if (actor !== undefined) pick(this.byActor, actor);
    if (place !== undefined) pick(this.byPlace, place);
    if (type !== undefined) pick(this.byType, type);
    if (cause !== undefined) pick(this.byCause, cause);
    const out = [];
    if (src === null) { const ids = [...this.log.keys()]; src = ids; }
    for (let i = src.length - 1; i >= 0 && out.length < limit; i--) {
      const r = this.log.get(src[i]); if (!r) continue;
      if (r.tick < since) break;
      if (r.tick > until || r.salience < minSalience) continue;
      if (actor !== undefined && !r.actors.includes(actor)) continue;
      if (place !== undefined && r.place !== place) continue;
      if (type !== undefined && r.type !== type) continue;
      if (cause !== undefined && r.cause !== cause) continue;
      out.push(r);
    }
    return out;
  }
  /** Follow `cause` links back to the root: [event, its cause, ...]. */
  chain(id, max = 20) { const out = []; let r = this.log.get(id); while (r && out.length < max) { out.push(r); r = r.cause ? this.log.get(r.cause) : null; } return out; }
  causeCoverage() { return this.stats.emitted ? this.stats.withCause / this.stats.emitted : 0; }
  _trim() {
    let n = this.log.size - this.cap + Math.ceil(this.cap * 0.1);
    for (const id of this.log.keys()) { if (n-- <= 0) break; this.log.delete(id); this.stats.dropped++; }
    const first = this.log.keys().next().value;
    for (const m of [this.byActor, this.byPlace, this.byType, this.byCause]) for (const [k, l] of m) {
      let i = 0; while (i < l.length && l[i] < first) i++;
      if (i === l.length) m.delete(k); else if (i > 0) l.splice(0, i);
    }
  }
  serialize() { return { nextId: this.nextId, stats: this.stats, log: [...this.log.values()] }; }
  restore(s) {
    this.log.clear(); for (const m of [this.byActor, this.byPlace, this.byType, this.byCause]) m.clear();
    this.nextId = s.nextId; this.stats = s.stats;
    for (const r of s.log) { this.log.set(r.id, r); for (const a of r.actors) push(this.byActor, a, r.id); if (r.place !== null) push(this.byPlace, r.place, r.id); push(this.byType, r.type, r.id); if (r.cause) push(this.byCause, r.cause, r.id); }
  }
}
function push(m, k, id) { const l = m.get(k); if (l) l.push(id); else m.set(k, [id]); }
