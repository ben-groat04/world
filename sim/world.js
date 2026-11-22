// World: time, map, people, buildings, systems registry, event bus, action execution, spatial index, kernel services.
// Kernel services (sim/kernel/*): events (registry + log), commands (queue/log/replay), ledger, text, lod, index, affordances, scheduler, plugins.
import { RNG } from './rng.js';
import { timeOf, formatDate, formatDateTime, TICKS_PER_YEAR, TICKS_PER_DAY } from './time.js';
import { Pathfinder } from './path.js';
import { Chronicle } from './chronicle.js';
import { createPerson, newRel, fullName } from './person.js';
import { subRng } from './kernel/rng.js';
import { EventBus } from './kernel/events.js';
import { LEGACY_EVENT_TYPES } from './kernel/event-types.js';
import { CommandBus } from './kernel/commands.js';
import { Ledger } from './kernel/ledger.js';
import { Text } from './kernel/text.js';
import { Lod } from './kernel/lod.js';
import { Indices } from './kernel/indices.js';
import { Affordances } from './kernel/affordances.js';
import { Scheduler } from './kernel/scheduler.js';
import { loadPlugins, isPlugin } from './kernel/plugin.js';
import { stateHash, saveSnapshot, loadSnapshot } from './snapshot.js';
import { archiveDeparted } from './kernel/archive.js';

// ALL tunables live in world.settings (documented in ARCHITECTURE.md). Systems read them with `?? default` as well, but the
// defaults are declared here so a tuning agent has one place to look. Politics may move the policy axes at runtime.
const DEFAULT_SETTINGS = {
  prices: { food: 1, tavernMeal: 4, drink: 4 }, population: 220, houses: 86,
  taxRate: 0.15, watchFunding: 0.5, festivalBudget: 0.5, poorRelief: 0.3, publicWorks: 0.35,
  epidemicScale: 1, immigrationScale: 1, emigrationScale: 1, divorceScale: 1, affairScale: 1, fertilityScale: 1, childMortalityScale: 1, maternalRiskScale: 1,
  fertilityBoostUntil: 0,
};
const GSHIFT = 3; // spatial grid cell = 8 tiles
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const LEGACY_CALENDAR = { weekStart: (t) => t.weekday === 0, monthStart: (t) => t.dayOfSeason === 1, yearStart: (t) => t.dayOfYear === 0 };

export class World {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 1;
    this.opts = opts;
    this.pack = opts.pack || null;
    this.rng = new RNG(this.seed);
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}), prices: { ...DEFAULT_SETTINGS.prices, ...((opts.settings || {}).prices || {}) } };
    if (opts.population) this.settings.population = opts.population;
    this.calendar = opts.calendar || LEGACY_CALENDAR;
    this.strictEvents = !!opts.strictEvents;
    this.contractMode = !!opts.contractMode;
    this._inStep = false; this.replaying = false;
    this.tick = 0;
    this.time = {};
    this._setTime();
    this.weather = { type: 'clear', temp: 12 };
    this.weatherShock = null; // god weather shock {kind:'heat', until, anomaly}: degrees ABOVE the day's seasonal draw (so it is season-relative), applied in _dailyWeather
    this.player = null;
    this.stats = { births: 0, deaths: 0 };
    this.town = { name: 'Hollowmere', treasury: 2000 };
    this.nextPersonId = 1;
    this.recordTrails = false;
    this.prof = null;
    // world keys holding persistent system state (serialized by sim/snapshot.js). Systems may push their own namespace.
    this.stateKeys = ['stats', 'town', 'weather', 'player', 'social', 'culture', 'econ', 'healthState', 'migrationState', 'politics', 'romanceState', 'crime', 'weatherShock'];
    this._handlers = new Map();
    for (const t of LEGACY_EVENT_TYPES) this._handlers.set(t, []);
    this._rngs = new Map();
    this._interventions = new Map();
    this.people = new Map(); this.archiveHooks = []; // fns(person) run when a departed person is archived (kernel/archive.js)
    this.buildings = new Map();
    this._byType = {};
    this._living = []; this._livingDirty = true;
        this._moodQ = new Map();
    this.hashLog = opts.hashDaily ? [] : null;
    // ---- kernel services
    this.sys = {}; this.plugins = [];
    this.clocks = { hour: [], day: [], week: [], month: [], year: [] };
    this.events = new EventBus(this, { validate: this.strictEvents || !!opts.validateEvents, cap: opts.eventCap });
    this.commands = new CommandBus(this);
    this.ledger = new Ledger(this);
    this.text = new Text(this);
    this.lod = new Lod(this);
    this.index = new Indices(this);
    this.afford = new Affordances(this);
    this.sched = new Scheduler(this);
    this.chronicle = new Chronicle(this);
    this.map = opts.generateMap(this.rngFor('map'), { houses: this.settings.houses });
    this.path = new Pathfinder(this.map);
    this.gw = (this.map.W >> GSHIFT) + 1; this.gh = (this.map.H >> GSHIFT) + 1;
    this.grid = Array.from({ length: this.gw * this.gh }, () => new Set());
    for (const b of this.map.buildings) this.addBuilding(b);
    this.systems = [];
    const plugins = [...(opts.plugins || [])];
    for (const s of (opts.systems || [])) { if (isPlugin(s)) plugins.push(s); }
    opts.populate(this, this.rngFor('population'), this.settings.population);
    this._dailyWeather();
    this.chronicle.add({ tick: 0, type: 'founding', importance: 3, text: `${this.town.name} wakes to a new dawn with ${this.living().length} souls.`, people: [] });
    for (const s of this.systems) if (s.init) s.init(this);
    if (plugins.length) loadPlugins(this, plugins, this.pack);
    this._tickSystems = this.systems.filter((s) => s.onTick);
    this.sched.rebuild();
  }

  // ---------- basics ----------
  _setTime() { const t = (this.calendar.timeOf || timeOf)(this.tick, this.time); t.day = t.dayOfYear; t.totalDays = t.dayAbs; return t; }
  /** rngFor(name): persistent named stream (snapshotted). rngFor(name, ...keys): stateless derived stream (pure function of seed+name+keys). */
  rngFor(name, ...keys) {
    if (keys.length) return subRng(this.seed, name, ...keys);
    let r = this._rngs.get(name); if (!r) { r = this.rng.fork(name); this._rngs.set(name, r); } return r;
  }
  formatDate(tick = this.tick) { return this.calendar.formatDate ? this.calendar.formatDate(tick) : formatDate(tick); }
  formatDateTime(tick = this.tick) { return this.calendar.formatDateTime ? this.calendar.formatDateTime(tick) : formatDateTime(tick); }
  ageOf(p) { return (this.tick - p.birthTick) / (this.calendar.ticksPerYear || TICKS_PER_YEAR); } // real-calendar packs set calendar.ticksPerYear
  nameOf(p) { return fullName(p); }
  living() {
    if (this._livingDirty) { this._living = []; for (const p of this.people.values()) if (p.alive) this._living.push(p); this._livingDirty = false; }
    return this._living;
  }
  buildingsOfType(type) { return this._byType[type] || (this._byType[type] = []); }
  building(id) { return this.buildings.get(id); }
  person(id) { return this.people.get(id); }
  log(text, o = {}) { return this.chronicle.add({ type: o.type || 'event', importance: o.importance || 2, text, people: o.people || [], buildingId: o.buildingId }); }

  // ---------- events ----------
  // Legacy payload events (names registered {legacy:true}, or unregistered without a '.') dispatch synchronously with the raw payload.
  // New-style events ('domain.verb', registered in the event registry) go through the bus: world.emit(type, {actors,objects,place,tags,cause,salience,payload}) -> eventId.
  _isNew(type) { const r = this.events.registry.map.get(type); return r !== undefined ? !r.legacy : type.indexOf('.') >= 0; }
  on(type, fn) {
    if (this._isNew(type)) return this.events.on(type, fn);
    let l = this._handlers.get(type); if (!l) this._handlers.set(type, (l = []));
    l.push(fn); return () => this.off(type, fn);
  }
  off(type, fn) {
    if (this._isNew(type)) { const l = this.events.handlers.get(type); if (l) { const i = l.findIndex((h) => h.fn === fn); if (i >= 0) l.splice(i, 1); } return; }
    const l = this._handlers.get(type); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  }
  emit(type, payload) {
    const l = this._handlers.get(type); // legacy types always have a (possibly empty) handler list: one Map lookup on the hot path
    if (l !== undefined) { for (let i = 0; i < l.length; i++) l[i](payload); return; }
    const reg = this.events.registry.map.get(type);
    if (reg === undefined ? type.indexOf('.') >= 0 : !reg.legacy) return this.events.emit(type, payload);
    if (reg === undefined && this.strictEvents) throw new Error(`unknown event type '${type}'`);
  }
  registerEventType(type, def) { this.events.register(type, def); return this; }

  // ---------- commands / kernel API ----------
  queueCommand(cmd) { return this.commands.queue(cmd); }
  registerCommand(name, fn) { this.commands.register(name, fn); }
  /** Cross-system call: run another system's command handler directly (not logged; its effects are a pure function of the logged inputs). */
  cmd(name, args = {}) { const h = this.commands.handlers.get(name); if (!h) throw new Error(`unknown command '${name}'`); return h(this, args, { actor: 'sys', name, args }); }
  snapshot() { return saveSnapshot(this); }
  static restore(snap, pack, opts = {}) { return loadSnapshot(snap, { ...opts, pack }); }
  /** Independent copy of this world (via snapshot). With `salt`, all RNG streams are re-seeded so the fork diverges from the original. */
  fork(salt) {
    const w = loadSnapshot(JSON.parse(JSON.stringify(saveSnapshot(this))), { systems: this.opts.systems, pack: this.pack, plugins: this.opts.plugins, worldOpts: this.opts });
    if (salt !== undefined) {
      const k = subRng(this.seed, 'fork', salt).int(1, 1 << 30);
      w.rng.s = (w.rng.s ^ k) >>> 0 || 1; for (const r of w._rngs.values()) r.s = (r.s ^ k) >>> 0 || 1;
    }
    return w;
  }
  stateHash() { return stateHash(this); }
  // after snapshot restore: rebuild every derived structure (indices, wheel, walkers, mood expiry queue, adapter views)
  _afterLoad() {
    this._living = []; this._livingDirty = true;
    this.index = new Indices(this); this.lod.counts = [0, 0, 0, 0];
    for (const p of this.living()) this.index._add(p);
    this._moodQ.clear();
    for (const p of this.living()) for (const m of p.moodlets) { const h = Math.ceil(m.untilTick / 6); let s = this._moodQ.get(h); if (!s) this._moodQ.set(h, (s = new Set())); s.add(p); }
    this._tickSystems = this.systems.filter((s) => s.onTick);
    for (const s of this.systems) if (s.afterLoad) s.afterLoad(this);
    this.sched.rebuild();
  }

  // ---------- registries ----------
  registerIntervention(kind, fn) { this._interventions.set(kind, fn); }
  /** God-mode hook. Goes through the command log (replayable): world.intervene(kind, params) === queueCommand({actor:'god', name:'intervene', args:{kind, params}}). */
  intervene(kind, params = {}) {
    if (!this.commands.has('intervene')) this.commands.register('intervene', (w, a) => w._intervene(a.kind, a.params));
    if (this.commands.running) return this._intervene(kind, params);
    return this.queueCommand({ actor: 'god', name: 'intervene', args: { kind, params } });
  }
  _intervene(kind, params) {
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
    if (p.alive) this.index._add(p);
    if (p.alive) { p.wake = -2; this.sched.schedule(p, this.tick + 1); }
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
    this.index._remove(p);
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
    if (p.memories.length > 150) {
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
    { const h = Math.ceil(m.untilTick / 6); let s = this._moodQ.get(h); if (!s) this._moodQ.set(h, (s = new Set())); s.add(p); }
  }
  moodlet(p, id, label, value, ticks) { this.addMoodlet(p, { id, label, value, untilTick: this.tick + ticks }); }
  removeMoodlet(p, id) { const L = p.moodlets; for (let k = L.length - 1; k >= 0; k--) if (L[k].id === id) { L.splice(k, 1); this._sumMoodlets(p); } }
  _sumMoodlets(p) { let s = 0; for (const m of p.moodlets) s += m.value; p.moodletSum = s > 1 ? 1 : s < -1 ? -1 : s; }

  // ---------- main loop ----------
  step() {
    this._inStep = true;
    if (this.commands.pending.length !== 0) this.commands.runDue();
    this.tick++;
    const t = this._setTime();
    const hourStart = t.minute === 0, dayStart = hourStart && t.hour === 0;
    if (dayStart) this._dayStart();
    const P = this.prof;
    if (P) { const t0 = performance.now(); this._people(); P.people += performance.now() - t0; } else this._people();
    this.emit('tick', this);
    this._hook('onTick');
    if (hourStart) {
      this._hourStart();
      this.emit('hour', this);
      this._hook('onHour');
      this._clock('hour');
    }
    if (dayStart) {
      this.emit('day', this);
      this._hook('onDay');
      this._clock('day');
      this.index._dailyStages();
      for (const p of this.living()) p.workedTicks = 0; // after systems saw today's total
      if (this.calendar.weekStart(t)) this._clock('week');
      if (t.dayOfSeason === 1) { this.emit('season', this); this._hook('onSeason'); }
      if (this.calendar.monthStart(t)) { this._clock('month'); archiveDeparted(this); }
      if (t.dayOfYear === 0) { this.emit('year', this); this._hook('onYear'); }
      if (this.calendar.yearStart(t)) this._clock('year');
      if (this.hashLog !== null) this.hashLog.push(this.stateHash());
    }
    this.events.flush();
    this._inStep = false;
  }
  _people() { this.sched.run(this.tick); }
  // call a lifecycle hook on every system; when world.prof is set, accumulate ms per system (prof.sys[name])
  _hook(name) {
    const sys = name === 'onTick' ? this._tickSystems : this.systems, P = this.prof;
    if (!P) { for (let i = 0; i < sys.length; i++) if (sys[i][name]) sys[i][name](this); return; }
    for (let i = 0; i < sys.length; i++) if (sys[i][name]) { const t0 = performance.now(); sys[i][name](this); P.sys[sys[i].name] = (P.sys[sys[i].name] || 0) + performance.now() - t0; }
  }
  _clock(name) {
    const l = this.clocks[name], P = this.prof;
    for (let i = 0; i < l.length; i++) { if (P) { const t0 = performance.now(); l[i].fn(this, this.time); P.sys[l[i].name] = (P.sys[l[i].name] || 0) + performance.now() - t0; } else l[i].fn(this, this.time); }
  }
  // enable per-section timing: world.enableProfile() then read world.prof {people, sys:{name:ms}}
  enableProfile() { return (this.prof = { people: 0, sys: {} }); }
  run(ticks) { for (let i = 0; i < ticks; i++) this.step(); }
  _hourStart() {
    const h = this.tick / 6, q = this._moodQ.get(h);
    if (q === undefined) return;
    this._moodQ.delete(h);
    for (const p of q) if (p.alive && p.moodlets.length) {
      let ch = false;
      for (let i = p.moodlets.length - 1; i >= 0; i--) if (p.moodlets[i].untilTick <= this.tick) { p.moodlets.splice(i, 1); ch = true; }
      if (ch) this._sumMoodlets(p);
    }
  }
  _dayStart() {
    for (const p of this.living()) { const a = (this.tick - p.birthTick) / TICKS_PER_YEAR; p.speed = a < 12 ? 5 : a > 65 ? 4 : 6; }
    this._dailyWeather();
  }
  /** Real-calendar weather (Larkfield): the pack's monthly UK climate table (calendar.weather.seasonal: mean temp, spread, regime weights, daily persistence `stick`)
   *  drives a daily regime Markov chain; precipitation type follows the regime and the day's temperature (snow only when it is cold enough). */
  _realWeather(rec) {
    const r = this.rngFor('weather'), W = this.calendar.yearTable(rec.year).weather, M = W.seasonal[rec.month], prev = this.weather && this.weather.regime;
    let regime = prev;
    if (!regime || !M.regimes[regime] || r.next() > M.stick) { const ks = Object.keys(M.regimes); regime = r.weighted(ks, ks.map((k) => M.regimes[k])); }
    const R = W.regimes[regime];
    const shift = regime === 'heatwave' ? 6 : regime === 'snap_snow' ? -4 : regime.startsWith('cold') ? -2.5 : regime === 'humid_thundery' ? 2.5 : regime === 'grey_mild' ? 1 : 0;
    const temp = Math.round(M.tMean + shift + r.gauss(0, M.tRange / 3));
    let type = 'clear'; const x = r.next();
    // the regime's wetness is scaled so the month's expected wet days equal the climate table (rainDays: days with >= 1 mm)
    let avg = 0, tw = 0; for (const k of Object.keys(M.regimes)) { avg += M.regimes[k] * W.regimes[k].rain; tw += M.regimes[k]; } const pr = Math.min(0.95, R.rain * (M.rainDays / 30) / Math.max(0.05, avg / tw));
    if (x < pr) type = temp <= 1 && (R.snow || 0) > 0 && r.next() < 0.7 ? 'snow' : 'rain';
    else if (x < pr + 0.25 + (regime === 'grey_mild' || regime === 'mixed' ? 0.2 : 0)) type = 'cloudy';
    if (type === 'cloudy' && temp <= 4 && (rec.month <= 1 || rec.month === 11) && r.next() < 0.18) type = 'fog';
    this.weather = { type, temp, regime };
  }
  _dailyWeather() {
    this._baseWeather(); const s = this.weatherShock;
    if (s) { if (s.until <= this.tick) this.weatherShock = null; else { this.weather.temp += s.anomaly; this.weather.shock = s.kind; } }
  }
  _baseWeather() {
    if (this.calendar.recAt && this.calendar.yearTable && this.time.rec) return this._realWeather(this.time.rec);
    const s = this.time.season, r = this.rngFor('weather');
    const x = r.next();
    let type = 'clear';
    if (s === 3) type = x < 0.3 ? 'snow' : x < 0.55 ? 'cloudy' : x < 0.62 ? 'fog' : 'clear';
    else if (s === 1) type = x < 0.12 ? 'rain' : x < 0.3 ? 'cloudy' : 'clear';
    else type = x < 0.28 ? 'rain' : x < 0.5 ? 'cloudy' : x < 0.58 && s === 2 ? 'fog' : 'clear';
    this.weather = { type, temp: Math.round([11, 22, 10, -1][s] + r.gauss(0, 3)) };
  }
}
