// World: time, map, people, buildings, systems registry, event bus, action execution, spatial index.
import { RNG } from './rng.js';
import { timeOf, formatDate, formatDateTime, TICKS_PER_YEAR, TICKS_PER_DAY, DAYS_PER_YEAR } from './time.js';
import { generateMap, isOpen } from './map.js';
import { Pathfinder } from './path.js';
import { Chronicle } from './chronicle.js';
import { Brain } from './brain.js';
import { CORE_ACTIONS } from './actions.js';
import { stepNeeds, NEEDS_PERIOD } from './needs.js';
import { createPerson, generatePopulation, newRel, fullName } from './person.js';
import defaultSystems from './systems/index.js';

// ALL tunables live in world.settings (documented in ARCHITECTURE.md). Systems read them with `?? default` as well, but the
// defaults are declared here so a tuning agent has one place to look. Politics may move the policy axes at runtime.
const DEFAULT_SETTINGS = {
  prices: { food: 1, tavernMeal: 4, drink: 4 }, population: 220, houses: 86,
  taxRate: 0.15, watchFunding: 0.5, festivalBudget: 0.5, poorRelief: 0.3, publicWorks: 0.35,
  epidemicScale: 1, immigrationScale: 1, emigrationScale: 1, divorceScale: 1, affairScale: 1, fertilityScale: 1, childMortalityScale: 1, maternalRiskScale: 1,
  fertilityBoostUntil: 0,
};
const THINK_EVERY = 12; // ticks between re-evaluations of an interruptible action
const GSHIFT = 3; // spatial grid cell = 8 tiles
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export class World {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 1;
    this.rng = new RNG(this.seed);
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}), prices: { ...DEFAULT_SETTINGS.prices, ...((opts.settings || {}).prices || {}) } };
    if (opts.population) this.settings.population = opts.population;
    this.tick = 0;
    this.time = {};
    this._setTime();
    this.weather = { type: 'clear', temp: 12 };
    this.player = null;
    this.stats = { births: 0, deaths: 0 };
    this.town = { name: 'Hollowmere', treasury: 2000 };
    this.nextPersonId = 1;
    this.recordTrails = false;
    this.prof = null;
    // world keys holding persistent system state (serialized by sim/snapshot.js). Systems may push their own namespace.
    this.stateKeys = ['stats', 'town', 'weather', 'player', 'social', 'culture', 'econ', 'healthState', 'migrationState', 'politics', 'romanceState', 'crime'];
    this._handlers = new Map();
    this._rngs = new Map();
    this._interventions = new Map();
    this.people = new Map();
    this.buildings = new Map();
    this._byType = {};
    this._living = []; this._livingDirty = true;
    this.chronicle = new Chronicle(this);
    this.map = generateMap(this.rngFor('map'), { houses: this.settings.houses });
    this.path = new Pathfinder(this.map);
    this.gw = (this.map.W >> GSHIFT) + 1; this.gh = (this.map.H >> GSHIFT) + 1;
    this.grid = Array.from({ length: this.gw * this.gh }, () => new Set());
    for (const b of this.map.buildings) this.addBuilding(b);
    this.actions = new Map();
    this.brain = new Brain(this);
    for (const a of CORE_ACTIONS) this.registerAction(a);
    this.systems = [];
    for (const s of (opts.systems || defaultSystems)) this.registerSystem(s);
    generatePopulation(this, this.rngFor('population'), this.settings.population);
    this._dailyWeather();
    this.chronicle.add({ tick: 0, type: 'founding', importance: 3, text: `${this.town.name} wakes to a new dawn with ${this.living().length} souls.`, people: [] });
    for (const s of this.systems) if (s.init) s.init(this);
  }

  // ---------- basics ----------
  _setTime() { const t = timeOf(this.tick, this.time); t.day = t.dayOfYear; t.totalDays = t.dayAbs; return t; }
  rngFor(name) { let r = this._rngs.get(name); if (!r) { r = this.rng.fork(name); this._rngs.set(name, r); } return r; }
  formatDate(tick = this.tick) { return formatDate(tick); }
  formatDateTime(tick = this.tick) { return formatDateTime(tick); }
  ageOf(p) { return (this.tick - p.birthTick) / TICKS_PER_YEAR; }
  nameOf(p) { return fullName(p); }
  isOpen(b) { return isOpen(b, this.time.hourFloat); }
  living() {
    if (this._livingDirty) { this._living = []; for (const p of this.people.values()) if (p.alive) this._living.push(p); this._livingDirty = false; }
    return this._living;
  }
  buildingsOfType(type) { return this._byType[type] || (this._byType[type] = []); }
  building(id) { return this.buildings.get(id); }
  person(id) { return this.people.get(id); }
  log(text, o = {}) { return this.chronicle.add({ type: o.type || 'event', importance: o.importance || 2, text, people: o.people || [], buildingId: o.buildingId }); }

  // ---------- events ----------
  on(type, fn) { let l = this._handlers.get(type); if (!l) this._handlers.set(type, (l = [])); l.push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this._handlers.get(type); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(type, payload) { const l = this._handlers.get(type); if (l) for (let i = 0; i < l.length; i++) l[i](payload); }

  // ---------- registries ----------
  registerAction(def) { this.brain.register(def); this.actions.set(def.id, this.brain.list.find((d) => d.id === def.id)); }
  registerSystem(sys) {
    this.systems.push(sys);
    for (const a of sys.actions || []) this.registerAction(a);
    for (const m of sys.scoreModifiers || []) this.brain.addModifier(m);
  }
  registerIntervention(kind, fn) { this._interventions.set(kind, fn); }
  intervene(kind, params = {}) {
    const fn = this._interventions.get(kind);
    this.emit('intervention', { kind, params });
    return fn ? fn(this, params) : undefined;
  }

  // ---------- buildings / people ----------
  addBuilding(b) {
    b.occupants = new Set();
    if (b.condition === undefined) b.condition = 1;
    this.buildings.set(b.id, b);
    this.buildingsOfType(b.type).push(b);
    this.emit('buildingAdded', { building: b });
    return b;
  }
  createPerson(opts) { return createPerson(this, opts); }
  addPerson(p) {
    if (!this.people.has(p.id) && p.id >= this.nextPersonId) this.nextPersonId = p.id + 1;
    this.people.set(p.id, p); this._livingDirty = true;
    const f = p.family;
    for (const [pid] of [[f.motherId], [f.fatherId]]) {
      const par = pid != null ? this.people.get(pid) : null;
      if (!par) continue;
      if (!par.family.childrenIds.includes(p.id)) par.family.childrenIds.push(p.id);
      if (!p.relationships.has(par.id)) { const r = this.getRel(p, par); r.familiarity = 1; r.affinity = 0.7; r.trust = 0.8; r.tags.push('family'); const r2 = this.getRel(par, p); r2.familiarity = 1; r2.affinity = 0.75; r2.trust = 0.8; r2.tags.push('family'); }
    }
    const home = p.homeId != null ? this.buildings.get(p.homeId) : null;
    if (home) { if (!home.residents.includes(p.id)) home.residents.push(p.id); }
    if (p.locationId == null && home && !p.currentAction) { p.locationId = home.id; p.x = home.door.x; p.y = home.door.y; }
    if (p.locationId != null) {
      const b = this.buildings.get(p.locationId);
      b.occupants.add(p);
      p.inside = !b.open;
      if (b.open) this._gridAdd(p);
    } else { if (!p.x && !p.y) { p.x = this.map.center.x; p.y = this.map.center.y - 6; } this._gridAdd(p); }
    return p;
  }
  // Take a person out of the live world (buildings, spatial grid, jobs, households) without a death: used by killPerson
  // and by emigration. Sets alive=false; the caller records why (deathTick/causeOfDeath or emigrated*).
  removePerson(p) {
    p.alive = false;
    p.currentAction = null; p.path = null;
    if (p.locationId != null) { const b = this.buildings.get(p.locationId); if (b) b.occupants.delete(p); }
    this._gridRemove(p);
    p.locationId = null; p.inside = false;
    const wb = p.workId != null ? this.buildings.get(p.workId) : null;
    if (wb) { const i = wb.employees.indexOf(p.id); if (i >= 0) wb.employees.splice(i, 1); }
    p.lastWorkId = p.workId; p.workId = null;
    const hb = p.homeId != null ? this.buildings.get(p.homeId) : null;
    if (hb) { const i = hb.residents.indexOf(p.id); if (i >= 0) hb.residents.splice(i, 1); }
    this._livingDirty = true;
  }
  killPerson(p, cause = 'unknown') {
    if (!p.alive) return;
    p.deathTick = this.tick; p.causeOfDeath = cause;
    this.removePerson(p);
    this.stats.deaths++;
    this.emit('death', { person: p, cause });
  }
  // peopleAt: alive people currently inside/at a building. peopleNear: alive people OUTDOORS (incl. open places like park/square) within r tiles.
  peopleAt(buildingId, out = []) { const b = this.buildings.get(buildingId); if (b) for (const p of b.occupants) if (p.alive) out.push(p); return out; }
  peopleNear(x, y, r, out = []) {
    const x0 = Math.max(0, (x - r) >> GSHIFT), x1 = Math.min(this.gw - 1, (x + r) >> GSHIFT), y0 = Math.max(0, (y - r) >> GSHIFT), y1 = Math.min(this.gh - 1, (y + r) >> GSHIFT);
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const p of this.grid[cy * this.gw + cx]) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy <= r2 && p.alive) out.push(p); }
    return out;
  }
  nearestBuilding(type, x, y, filter) {
    let best = null, bd = Infinity;
    for (const b of this.buildingsOfType(type)) { if (filter && !filter(b)) continue; const d = Math.abs(b.door.x - x) + Math.abs(b.door.y - y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  _gridAdd(p) { const ci = (p.y >> GSHIFT) * this.gw + (p.x >> GSHIFT); this.grid[ci].add(p); p.cell = ci; }
  _gridRemove(p) { if (p.cell >= 0) { this.grid[p.cell].delete(p); p.cell = -1; } }

  // ---------- relationships / memory / mood ----------
  getRel(a, b) {
    const A = typeof a === 'object' ? a : this.people.get(a), bid = typeof b === 'object' ? b.id : b;
    let r = A.relationships.get(bid);
    if (!r) { r = newRel(); A.relationships.set(bid, r); }
    return r;
  }
  relScore(a, b) {
    const A = typeof a === 'object' ? a : this.people.get(a), bid = typeof b === 'object' ? b.id : b;
    const r = A && A.relationships.get(bid);
    if (!r) return 0;
    const v = r.affinity * 0.75 + (r.trust - 0.5) * 0.3 + r.respect * 0.15;
    return v > 1 ? 1 : v < -1 ? -1 : v;
  }
  addMemory(p, m) {
    const mem = { tick: m.tick ?? this.tick, type: m.type || 'event', text: m.text, otherIds: m.otherIds || [], weight: m.weight ?? 0, importance: m.importance ?? 2 };
    p.memories.push(mem);
    if (p.memories.length > 300) {
      let wi = 0, ws = Infinity;
      for (let i = 0; i < p.memories.length - 20; i++) { const s = p.memories[i].importance * 10 + Math.abs(p.memories[i].weight) * 5 + i * 0.01; if (s < ws) { ws = s; wi = i; } }
      p.memories.splice(wi, 1);
    }
    return mem;
  }
  // moodlet: {id, label, value (-1..1 contribution to mood), untilTick}; same id replaces; max 14 kept (oldest dropped).
  addMoodlet(p, m) {
    const L = p.moodlets;
    let i = -1;
    for (let k = 0; k < L.length; k++) if (L[k].id === m.id) { i = k; break; }
    if (i >= 0) L[i] = m; else { L.push(m); if (L.length > 14) L.shift(); }
    this._sumMoodlets(p);
  }
  moodlet(p, id, label, value, ticks) { this.addMoodlet(p, { id, label, value, untilTick: this.tick + ticks }); }
  removeMoodlet(p, id) { const L = p.moodlets; for (let k = L.length - 1; k >= 0; k--) if (L[k].id === id) { L.splice(k, 1); this._sumMoodlets(p); } }
  _sumMoodlets(p) { let s = 0; for (const m of p.moodlets) s += m.value; p.moodletSum = s > 1 ? 1 : s < -1 ? -1 : s; }

  // ---------- actions ----------
  _route(p, b, tile = -1) {
    const W = this.map.W, pf = this.path;
    const origin = p.y * W + p.x;
    const from = p.locationId != null ? this.buildings.get(p.locationId) : null;
    const segs = [];
    let start = origin;
    if (from && from.open && origin !== from.door.y * W + from.door.x && (b ? from.id !== b.id : true)) {
      const s = pf.cached(origin, from.door.y * W + from.door.x); if (!s) return null; segs.push(s); start = from.door.y * W + from.door.x;
    }
    if (b) {
      const dt = b.door.y * W + b.door.x;
      const s = pf.cached(start, dt); if (!s) return null; segs.push(s);
      if (b.open) { const spot = b.spots[this.rng.int(0, b.spots.length - 1)]; if (spot !== dt) { const s2 = pf.cached(dt, spot); if (!s2) return null; segs.push(s2); } }
    } else { const s = pf.cached(start, tile); if (!s) return null; segs.push(s); }
    if (segs.length === 1) return segs[0];
    let n = 0; for (const s of segs) n += s.length;
    const out = new Int32Array(n); let o = 0;
    for (const s of segs) { out.set(s, o); o += s.length; }
    return out;
  }
  // Start an action: target = building id | {x,y} | null (in place). Returns false if unreachable / refused.
  startAction(p, id, target = null, why = '', opts = {}) {
    const def = this.actions.get(id);
    if (!def) return false;
    const W = this.map.W;
    let b = null, tile = -1;
    if (typeof target === 'number') { b = this.buildings.get(target); if (!b) return false; }
    else if (target && typeof target === 'object') tile = target.y * W + target.x;
    let route = null;
    if (b ? p.locationId !== b.id : tile >= 0 && p.y * W + p.x !== tile) { route = this._route(p, b, tile); if (!route) return false; }
    if (p.currentAction) this.endAction(p);
    const ca = { id, label: typeof def.label === 'function' ? def.label(this, p) : def.label, targetId: b ? b.id : null, untilTick: 0, status: 1, startTick: this.tick, why: why || '', data: opts.data ?? null, forced: !!opts.forced, duration: opts.duration ?? null, thoughtText: opts.thought || null, _d: def, _b: b };
    p.currentAction = ca; p.wake = 0;
    this.emit('actionStart', { person: p, action: ca });
    if (route) {
      if (p.locationId != null) this._depart(p);
      ca.status = 0; p.path = route; p.pathIdx = 0;
      p.thought = this._thought(p, ca, false);
      return true;
    }
    return this._begin(p, ca);
  }
  forceAction(p, id, target, opts = {}) { return this.startAction(p, id, target, opts.why || '', { ...opts, forced: true }); }
  cancelAction(p) { if (p.currentAction) this.endAction(p); }
  endAction(p) {
    const ca = p.currentAction;
    if (!ca) return;
    const def = ca._d;
    stepNeeds(this, p); // settle needs under the ending action's effects
    if (ca.status === 1 && def.onTick !== undefined && this.tick > ca.tt) { const dt = this.tick - ca.tt; ca.tt = this.tick; def.onTick(this, p, ca._b, ca, dt); }
    if (ca.status === 1 && def.onEnd) def.onEnd(this, p, ca._b, ca);
    this.emit('actionEnd', { person: p, action: ca });
    p.currentAction = null; p.lastAction = ca.id; p.wake = 0;
  }
  _thought(p, ca, doing) {
    const def = ca._d, b = ca._b;
    if (ca.thoughtText) return ca.thoughtText;
    if (def.thought) { const t = def.thought(this, p, b, ca); if (t) return t; }
    const why = ca.why ? ` — ${ca.why}` : '';
    const home = b && b.id === p.homeId;
    if (doing) return `${cap(ca.label || ca.id)}${b ? (home ? ' at home' : ' at ' + b.name) : ''}${why}`;
    return `Heading ${b ? (home ? 'home' : 'to ' + b.name) : 'out'} (${ca.label || ca.id})${why}`;
  }
  _depart(p) {
    const b = this.buildings.get(p.locationId);
    if (b) b.occupants.delete(p);
    p.locationId = null;
    if (p.inside) { p.inside = false; this._gridAdd(p); }
  }
  _begin(p, ca) {
    const def = ca._d, b = ca._b;
    if (ca.status === 0) stepNeeds(this, p); // settle walking-time needs before perTick effects start
    this.brain.prepare(p);
    if (def.onStart && def.onStart(this, p, b, ca) === false) { p.currentAction = null; p.cooldown[def.id] = this.tick + 12; return false; }
    const dur = ca.duration ?? (def.duration ? def.duration(this, p, b, ca) : 6);
    ca.status = 1; ca.tt = this.tick; ca.untilTick = this.tick + Math.max(1, dur);
    p.nextThink = this.tick + 10 + (p.id % 5); p.wake = 0;
    p.path = null;
    p.thought = this._thought(p, ca, true);
    return true;
  }
  _arrive(p) {
    const ca = p.currentAction, b = ca._b;
    p.path = null;
    if (b) {
      p.locationId = b.id; b.occupants.add(p);
      if (!b.open) { p.inside = true; this._gridRemove(p); }
      this.emit('arrive', { person: p, buildingId: b.id });
    }
    this._begin(p, ca);
  }
  _walk(p) {
    const path = p.path, W = this.map.W, cost = this.map.cost, n = path.length;
    let i = p.pathIdx, budget = p.speed * 10;
    const rec = this.recordTrails;
    if (rec) { p.seg.length = 0; p.seg.push(p.x, p.y); p.segTick = this.tick; }
    while (budget > 0 && i < n) {
      const t = path[i++];
      p.x = t % W; p.y = (t / W) | 0;
      budget -= cost[t];
      if (rec) p.seg.push(p.x, p.y);
    }
    p.pathIdx = i;
    const ci = (p.y >> GSHIFT) * this.gw + (p.x >> GSHIFT);
    if (ci !== p.cell) { if (p.cell >= 0) this.grid[p.cell].delete(p); this.grid[ci].add(p); p.cell = ci; }
    return i >= n;
  }

  // ---------- main loop ----------
  step() {
    this.tick++;
    const t = this._setTime();
    const hourStart = t.minute === 0, dayStart = hourStart && t.hour === 0;
    if (dayStart) this._dayStart();
    const P = this.prof;
    if (P) { const t0 = performance.now(); this._stepPeople(); P.people += performance.now() - t0; } else this._stepPeople();
    this.emit('tick', this);
    this._hook('onTick');
    if (hourStart) {
      this._hourStart();
      this.emit('hour', this);
      this._hook('onHour');
    }
    if (dayStart) {
      this.emit('day', this);
      this._hook('onDay');
      for (const p of this.living()) p.workedTicks = 0; // after systems saw today's total
      if (t.dayOfSeason === 1) { this.emit('season', this); this._hook('onSeason'); }
      if (t.dayOfYear === 0) { this.emit('year', this); this._hook('onYear'); }
    }
  }
  // call a lifecycle hook on every system; when world.prof is set, accumulate ms per system (prof.sys[name])
  _hook(name) {
    const sys = this.systems, P = this.prof;
    if (!P) { for (let i = 0; i < sys.length; i++) if (sys[i][name]) sys[i][name](this); return; }
    for (let i = 0; i < sys.length; i++) if (sys[i][name]) { const t0 = performance.now(); sys[i][name](this); P.sys[sys[i].name] = (P.sys[sys[i].name] || 0) + performance.now() - t0; }
  }
  // enable per-section timing: world.enableProfile() then read world.prof {people, brain, walk, needs, sys:{name:ms}}
  enableProfile() {
    const P = this.prof = { people: 0, brain: 0, walk: 0, sys: {} };
    const wrap = (obj, fn, key) => { const orig = obj[fn]; obj[fn] = function (...a) { const t0 = performance.now(); const r = orig.apply(this, a); P[key] += performance.now() - t0; return r; }; };
    wrap(this.brain, 'decide', 'brain'); wrap(this, '_walk', 'walk');
    return P;
  }
  run(ticks) { for (let i = 0; i < ticks; i++) this.step(); }
  _hourStart() {
    for (const p of this.living()) if (p.moodlets.length) {
      let ch = false;
      for (let i = p.moodlets.length - 1; i >= 0; i--) if (p.moodlets[i].untilTick <= this.tick) { p.moodlets.splice(i, 1); ch = true; }
      if (ch) this._sumMoodlets(p);
    }
  }
  _dayStart() {
    for (const p of this.living()) { const a = (this.tick - p.birthTick) / TICKS_PER_YEAR; p.speed = a < 12 ? 5 : a > 65 ? 4 : 6; }
    this._dailyWeather();
  }
  _dailyWeather() {
    const s = this.time.season, r = this.rngFor('weather');
    const x = r.next();
    let type = 'clear';
    if (s === 3) type = x < 0.3 ? 'snow' : x < 0.55 ? 'cloudy' : x < 0.62 ? 'fog' : 'clear';
    else if (s === 1) type = x < 0.12 ? 'rain' : x < 0.3 ? 'cloudy' : 'clear';
    else type = x < 0.28 ? 'rain' : x < 0.5 ? 'cloudy' : x < 0.58 && s === 2 ? 'fog' : 'clear';
    this.weather = { type, temp: Math.round([11, 22, 10, -1][s] + r.gauss(0, 3)) };
  }
  _stepPeople() {
    const tick = this.tick, list = this.living();
    for (let li = 0; li < list.length; li++) {
      const p = list[li];
      if (tick < p.wake) continue; // asleep until its next scheduled event (see bottom of loop)
      if (!p.alive) continue;
      if (tick - p.needsTick >= NEEDS_PERIOD) stepNeeds(this, p);
      let ca = p.currentAction;
      if (ca === null) { this.brain.decide(p); ca = p.currentAction; if (ca === null) continue; }
      if (ca.status === 0) { if (this._walk(p)) this._arrive(p); continue; }
      // doing
      const def = ca._d;
      if (def.onTick !== undefined) { const dt = tick - ca.tt; ca.tt = tick; def.onTick(this, p, ca._b, ca, dt); if (!p.alive) continue; }
      if (tick >= ca.untilTick) {
        this.endAction(p);
        this.brain.decide(p);
        const na = p.currentAction;
        if (na && na.status === 0) { if (this._walk(p)) this._arrive(p); }
      } else {
        if (def.interruptible && !ca.forced && tick >= p.nextThink) { p.nextThink = tick + THINK_EVERY; this.brain.decide(p); }
        if (ca === p.currentAction) {
          let wk = p.needsTick + NEEDS_PERIOD; if (ca.untilTick < wk) wk = ca.untilTick;
          if (def.onTick !== undefined) { const nt = tick + (def.tickEvery || 1); if (nt < wk) wk = nt; }
          if (def.interruptible && !ca.forced && p.nextThink < wk) wk = p.nextThink;
          p.wake = wk;
        }
      }
    }
  }
}
