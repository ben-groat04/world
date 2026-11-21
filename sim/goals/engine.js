// Goals engine: state, goal generation (daily, amortised), HTN-lite planner, step execution, completion/failure/transformation, template invention.
// Nothing is polled per tick: scans sit in a heap keyed by tick (each person ~weekly), steps in a heap keyed by due tick (resolved on the hour clock), groups on the day clock.
import { hash32 } from '../kernel/rng.js';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../time.js';
import { clamp, pickW, Heap, fmt, cap1 } from './util.js';
import { computeFacts, WHO, personalityZ, tieStrength, latent } from './facts.js';
import { MOVE, OUTCOME_TEXT, VARIANT_NOUN } from './moves.js';
import { Methods } from './methods.js';
import { SelfModels } from './selfmodel.js';
import { stepLabel, goalLine, render } from './describe.js';
import { Groups } from './groups.js';

export const EVENTS = {
  'goal.formed': { goal: 'number', tpl: 'string', intensity: 'number' }, 'goal.planned': { goal: 'number', method: 'string', steps: 'number' },
  'goal.step': { goal: 'number', move: 'string', ok: 'string', why: 'string', step: 'number', steps: 'number' }, 'goal.replanned': { goal: 'number', method: 'string', why: 'string' },
  'goal.completed': { goal: 'number', tpl: 'string', want: 'string', days: 'number' }, 'goal.failed': { goal: 'number', tpl: 'string', why: 'string' }, 'goal.abandoned': { goal: 'number', tpl: 'string', why: 'string' },
  'goal.deferred': { goal: 'number', tpl: 'string' }, 'goal.transformed': { goal: 'number', from: 'string', to: 'string' }, 'goal.invented': { tpl: 'string', label: 'string', from: 'string' }, 'goal.template_retired': { tpl: 'string' },
  'goal.effect': { goal: 'number', want: 'string', kind: 'string' }, 'self.shifted': { belief: 'string', from: 'number', to: 'number' },
  'group.founded': { group: 'number', kind: 'string', name: 'string' }, 'group.joined': { group: 'number', role: 'string' }, 'group.left': { group: 'number', why: 'string' }, 'group.meeting': { group: 'number', attended: 'number', members: 'number' },
  'group.conflict': { group: 'number', severity: 'number' }, 'group.leader_changed': { group: 'number', how: 'string' }, 'group.split': { group: 'number', newGroup: 'number' }, 'group.dissolved': { group: 'number', why: 'string', members: 'number', days: 'number' },
  'group.institution': { group: 'number' }, 'group.rivalry': { a: 'number', b: 'number' },
  'project.started': { project: 'number', kind: 'string', group: 'number' }, 'project.progress': { project: 'number', pct: 'number' }, 'project.done': { project: 'number', kind: 'string', ok: 'boolean' }, 'project.effect': { project: 'number', kind: 'string', effect: 'string' },
  'opportunity.created': { kind: 'string', key: 'string' }, 'request.pending': { from: 'number', to: 'number', move: 'string' },
};
const PERIOD = 14;
const INV_NEEDS = new Set(['loneliness', 'boredom', 'community_problem', 'routine_fatigue', 'inspiration', 'new_arrival', 'neighbour_need', 'friends_going_out']);                      // days between scans of one person
const STAGES = ['18-24', '25-34', '35-49', '50-64', '65+'];
const band = (a) => (a < 25 ? '18-24' : a < 35 ? '25-34' : a < 50 ? '35-49' : a < 65 ? '50-64' : '65+');

export class Engine {
  constructor(world, pack, lib, opts = {}) {
    this.world = world; this.pack = pack; this.lib = lib; this.opts = opts;
    this.cfg = { moneyScale: opts.moneyScale ?? (world.lf ? 1 : 0.05), yearDays: world.calendar?.ticksPerYear ? world.calendar.ticksPerYear / TICKS_PER_DAY : DAYS_PER_YEAR, maxInvent: opts.maxInvent ?? 200, flags: { invention: true, selfModel: true, groups: true, ...(opts.flags || {}) } };
    this.cfg.dayScale = this.cfg.yearDays / 365; this.cfg.mundaneScale = opts.mundaneScale ?? 0.5; this.cfg.salientScale = opts.salientScale ?? 0.5; this.cfg.groupScale = opts.groupScale ?? 0.12;
    this.drives = pack.drives || lib.DRIVES; this.driveIdx = Object.fromEntries(this.drives.map((d, i) => [d.id, i]));
    this.selfm = new SelfModels(lib.SELF_BELIEFS); this.methods = new Methods(lib); this.groups = new Groups(this);
    this.tpl = new Map(); this.tplList = [];
    for (const t of pack.goalTemplates || lib.GOAL_TEMPLATES) this.addTemplate(t);
    this.pressEv = this._compilePressureEvents(lib.PRESSURE_EVENTS);
    this.S = this.fresh();
    this.scanHeap = new Heap(); this.stepHeap = new Heap();
    this.tmp = { wantStats: {} };
  }
  fresh() { return { goalSeq: 1, groupSeq: 1, projSeq: 1, tplSeq: 1, ps: new Map(), goals: new Map(), groups: new Map(), projects: new Map(), fit: {}, opps: [], requests: [], inventedThisYear: 0, nPeople: 0, active: new Map(), wins: new Map(), stats: { formed: 0, completed: 0, failed: 0, abandoned: 0, steps: 0, stepOk: 0, stepFail: 0, replans: 0, transformed: 0, invented: 0, byTpl: {}, out: {} }, ended: [] }; }
  addTemplate(t) {
    if (!t.gen) t.gen = { base: 0 };
    t.habit = t.habit ?? (t.gen.base >= 2.5); this.tpl.set(t.id, t); if (!this.tplList.includes(t)) this.tplList.push(t);
  }
  _compilePressureEvents(list) { const m = new Map(); for (const r of list) for (const k of r.m) { const key = k.startsWith('tag:') ? k.slice(4) : k; let l = m.get(key); if (!l) m.set(key, (l = [])); l.push(r); } return m; }
  rng(tag, ...k) { return this.world.rngFor('goals.' + tag, ...k); }
  get day() { return this.world.time.dayAbs ?? this.world.time.totalDays; }
  sd(days) { return days * this.cfg.dayScale; }                          // real days -> sim days
  tickAt(dayOffset, hour) { const w = this.world, t = w.time; return Math.max(w.tick + 1, Math.round(w.tick + dayOffset * TICKS_PER_DAY + (hour - t.hourFloat) * 6)); }
  phrase(tplId) { const t = this.tpl.get(tplId); return t ? (t.phrase || this.lib.PHRASES[tplId] || tplId.replace(/_/g, ' ')) : tplId; }
  name(id) { const q = this.world.people.get(id); return q ? `${q.firstName} ${q.lastName}` : 'someone'; }
  fn(id) { const q = this.world.people.get(id); return q ? q.firstName : 'someone'; }

  // ---------------- person state ----------------
  ps(p) {
    let s = this.S.ps.get(p.id); if (s) return s;
    const w = this.world, f = null, r = this.rng('ps', p.id);
    let parentVec = null; const fam = p.family || {};
    for (const pid of [fam.motherId, fam.fatherId]) { const q = pid != null ? this.S.ps.get(pid) : null; if (q) { parentVec = parentVec ? parentVec.map((x, i) => (x + q.self[i]) / 2) : q.self.slice(); } }
    s = { dw: null, band: '', press: {}, self: this.selfm.init(w, p, parentVec), goals: [], groups: [], cool: {}, trace: [], nextScan: 0, lastScan: w.tick, wins: [], ident: {}, next: null, out: [], stress: 0, inventedAt: -1e9 };
    this.S.ps.set(p.id, s); return s;
  }
  driveWeights(p, f, s) {
    const b = band(f.age); if (s.dw && s.band === b) return s.dw; s.band = b;
    const own = p.ext?.pop?.drives; if (own) { s.dw = this.drives.map((d) => clamp(own[d.id] ?? d.base, 0.05, 1)); return s.dw; }
    const r = this.rng('dw', p.id), z = f.z, seg = f.seg, shifts = this.pack.meta?.segmentShifts || this.lib.SEGMENT_SHIFTS || {};
    s.dw = this.drives.map((d) => {
      let x = d.base; for (const [t, w] of Object.entries(d.traits || {})) x += w * z[t]; if (d.lifeStage && d.lifeStage[b] !== undefined) x += d.lifeStage[b]; if (seg && shifts[seg] && shifts[seg][d.id]) x += shifts[seg][d.id];
      return clamp(x + (hash32(this.world.seed, 'dn', p.id, d.id) % 1000 / 1000 - 0.5) * 2.2 * d.sd, 0.05, 1);
    });
    return s.dw;
  }
  // pressure value 0..1: decayed spike, or state-derived
  press(s, key, now) { const e = s.press[key]; if (!e) return 0; const hl = (this.lib.PRESSURES[key]?.halfLife || 60) * this.cfg.dayScale; return e[0] * Math.pow(0.5, (now - e[1]) / (hl * TICKS_PER_DAY)); }
  addPress(s, key, v, cause) { const now = this.world.tick, cur = this.press(s, key, now); s.press[key] = [clamp(Math.max(cur, 0) + v, 0, 1), now, cause || (s.press[key] ? s.press[key][2] : 0)]; if (s.press[key][0] < 0.02) delete s.press[key]; }

  getFacts(p) { return computeFacts(this.world, p, this.cfg); }   // uncached on purpose: caching would make snapshot-resume diverge from a straight run
  // ---------------- scanning (goal generation) ----------------
  seedPeople() {
    const w = this.world;
    for (const p of w.people.values()) if (p.alive && !this.S.ps.has(p.id)) { const s = this.ps(p); s.nextScan = w.tick + (hash32(w.seed, 'sc0', p.id) % (PERIOD * TICKS_PER_DAY)) + 1; this.scanHeap.push({ k: s.nextScan, id: p.id }); }
    this.S.nPeople = w.people.size;
    if (this.cfg.flags.groups && this.opts.seedGroups !== false) this.groups.seed();
  }
  daily() {
    const w = this.world; if (w.people.size !== this.S.nPeople) this.seedPeople();
    const h = this.scanHeap, until = w.tick + TICKS_PER_DAY;
    while (h.size && h.peek().k <= until) { const e = h.pop(), p = w.people.get(e.id); if (!p || !p.alive) continue; const s = this.ps(p); if (s.nextScan !== e.k) continue; this.scan(p, s); }
    this.groups.daily();
  }
  scan(p, s) {
    const w = this.world, now = w.tick, f = this.getFacts(p); s.age = f.age;
    // events since last scan -> pressures
    const evs = w.events.query({ actor: p.id, since: s.lastScan - 1, limit: 40 });
    for (const ev of evs) this._eventPressure(p, s, ev);
    this._statePressure(s, f, now);
    s.lastScan = now; s.nextScan = now + Math.round(PERIOD * TICKS_PER_DAY * (0.8 + 0.4 * this.rng('sj', p.id, now).next())); this.scanHeap.push({ k: s.nextScan, id: p.id });
    const dw = this.driveWeights(p, f, s);
    s.stress = this._stress(s, now);
    this.review(p, s, f); this.planOutings(p, s, f);
    if (!f.adult && f.age < 15) return;
    const cap = this.maxActive(f, s); if (s.goals.length >= cap + 2) return;
    let contag = null; const lazyContag = () => contag || (contag = this._contagion(p, s));
    const ctx = { pressure: (k) => this.press(s, k, now) };
    const h0 = hash32(w.seed, 'gen', p.id, now), cand = [], seed = w.seed, pw = PERIOD / this.cfg.yearDays, hasOpps = this.S.opps.length > 0, N = this.tplList.length;
    for (let i = 0; i < N; i++) {
      const t = this.tplList[i]; if (t.habit || t.retired || !t.gen.base) continue;
      // cheap pre-draw against an upper bound of the rate: most templates stop here (stateless draw => order-independent, deterministic)
      let hh = Math.imul(h0 ^ Math.imul(i + 1, 0x9e3779b1), 0x85ebca6b); hh ^= hh >>> 13; hh = Math.imul(hh, 0xc2b2ae35); hh = (hh ^ (hh >>> 16)) >>> 0; const u = (hh % 1000003) / 1000003;
      if (t._ub === undefined) this._bound(t);
      if (u > 1 - Math.exp(-t._ub * pw * (hasOpps ? 6 : 1))) continue;
      if ((s.cool[t.id] || 0) > now || this._has(s, t.id)) continue;
      const who = WHO[t.gen.who || 'adult']; if (who ? !who(f, s, ctx) : !f.adult) continue;
      let dsum = 0; const di = t._di; for (let k = 0; k < di.length; k++) dsum += dw[di[k]] || 0.4; dsum /= di.length;
      let pf = 1, maxP = 0; const bo = t._boost; for (let k = 0; k < bo.length; k += 2) { const pv = this.press(s, bo[k], now); if (pv > maxP) maxP = pv; pf *= 1 + (bo[k + 1] - 1) * pv; }
      const oppF = hasOpps ? this._oppFactor(t) : 1;
      const bias = this.cfg.flags.selfModel && t.bias ? Math.exp(0.55 * this.selfm.goalBias(s, t.bias)) : 1;
      const fit = t.invented ? 0.4 + this.fitness(t.id) : 1;
      const stage = f.z.N > 1 && t.rareTail ? 1.4 : 1;
      let rate = t.gen.base * (0.45 + 1.1 * dsum) * Math.min(pf, 14) * oppF * bias * fit * stage * (t.rareTail ? this._tailPropensity(p, f) : 1) * t._scale;
      if (t.social) { if (u > 1 - Math.exp(-rate * (1 + t.social * 3) * pw)) continue; const c = lazyContag(); rate *= 1 + t.social * Math.min(3, (c.pursuing[t.id] || 0) * 1.3 + (c.won[t.id] || 0) * 2.4); }
      if (u < 1 - Math.exp(-rate * pw)) cand.push([t, dsum, maxP, rate]);
    }
    cand.sort((a, b) => b[3] - a[3]);
    let made = 0;
    for (const [t, dsum, maxP] of cand) { if (made >= 2) break; if (this.spawn(p, s, f, t, { dsum, maxP, via: 'scan' })) made++; }
    if (this.cfg.flags.invention && f.z.O > 0.4 && now - s.inventedAt > 112 * TICKS_PER_DAY) this.maybeInvent(p, s, f);
  }
  _bound(t) { let b = 1.55; let pf = 1; t._boost = []; if (t.gen.boost) for (const [k, m] of Object.entries(t.gen.boost)) { t._boost.push(k, m); if (m > 1) pf *= m; } b *= Math.min(pf, 14); if (t.social) b *= 1 + t.social * 3; if (t.bias) b *= Math.exp(0.55 * Object.values(t.bias).reduce((a, x) => a + Math.abs(x), 0)); if (t.invented) b *= 1.4; b *= 1.4; if (t.rareTail) b *= 5; t._scale = (t.ordinary || t.mundane ? this.cfg.mundaneScale : this.cfg.salientScale) * (t.group && t.group !== 'existing' ? this.cfg.groupScale : 1); t._ub = t.gen.base * b * t._scale; t._di = t.drive.map((d) => this.driveIdx[d]); }
  _tailPropensity(p, f) { const u = (hash32(this.world.seed, 'tail', p.id) % 10000) / 10000; return u < 0.06 ? 5 : u < 0.3 ? 1 : 0.15; }   // heavy tail: a few people, most never
  _has(s, tplId) { for (const gid of s.goals) if (this.S.goals.get(gid).tpl === tplId) return true; return false; }
  _oppFactor(t) { const o = this.S.opps; if (!o.length) return 1; let f = 1; for (const x of o) if (x.until > this.world.tick && x.boosts && x.boosts[t.id]) f *= x.boosts[t.id]; return f; }
  fitness(id) { const f = this.S.fit[id]; return f ? (f[1] + 1) / (f[0] + 3) : 0.33; }
  maxActive(f, s) { const [lo, hi] = this.lib.SCARCITY.maxActiveGoals; return Math.round(clamp(lo + (hi - lo) * (0.35 + 0.25 * f.z.C) - s.stress * 2, lo - 1, hi)); }
  _stress(s, now) { let m = 0; for (const k of this.lib.SCARCITY.stressPressures) { const v = this.press(s, k, now); if (v > m) m = v; } return m; }
  _eventPressure(p, s, ev) {
    const now = this.world.tick; if (ev.type === 'kernel.command') return;
    const seen = new Set(), keys = [ev.type]; if (ev.tags) for (const t of ev.tags) keys.push(t);
    for (const k of keys) { const rules = this.pressEv.get(k); if (!rules) continue; for (const r of rules) { if (seen.has(r)) continue; seen.add(r); const self = ev.actors[0] === p.id; if (r.who === 'self' && !self) continue; if (r.who === 'others' && self) continue; for (const [pk, v] of Object.entries(r.to)) { if (v < 0) { const c = this.press(s, pk, now); if (c > 0) this.addPress(s, pk, v * c, 0); } else this.addPress(s, pk, v * (0.8 + 0.4 * ((ev.salience || 0.3))), ev.id); } } }
  }
  _statePressure(s, f, now) {
    const set = (k, v) => { if (v > 0.05 && v > this.press(s, k, now)) s.press[k] = [v, now, s.press[k] ? s.press[k][2] : 0]; };
    if (f.debt > 0) set('debt', clamp(Math.log10(1 + f.debt / this.cfg.moneyScale) / 4, 0, 1));
    set('low_buffer', f.adult && f.richness < 0.3 ? 0.6 - f.richness : 0); set('loneliness', f.adult && f.closeTies < 2 ? 0.5 + (f.closeTies === 0 ? 0.2 : 0) : 0);
    if (f.single && f.age < 45) set('single', 0.35); if (f.age >= 55) set('ageing', clamp((f.age - 50) / 40, 0, 0.9)); if (f.has_condition && f.health < 0.7) set('illness', 0.4);
    if (f.lives_with_parents_adult) set('overcrowding', 0.35); if (s.goals.length === 0 && f.adult) set('boredom', 0.4); if (f.kids > 0 && f.youngestKid < 5) set('fatigue', 0.4);
    if (f.employed && f.z.N > 0.5) set('stagnation', 0.25);
  }
  _contagion(p, s) {
    const out = { pursuing: {}, won: {} }, S = this.S, now = this.world.tick; if (!p.relationships) return out;
    for (const [oid, r] of p.relationships) {
      const st = tieStrength(r); if (st < 0.18) continue; const q = S.ps.get(oid); if (!q) continue;
      for (const gid of q.goals) { const g = S.goals.get(gid); if (g && !g.secret) out.pursuing[g.tpl] = (out.pursuing[g.tpl] || 0) + st; }
      for (const [tid, tk] of q.wins) if (now - tk < 180 * TICKS_PER_DAY * this.cfg.dayScale) out.won[tid] = (out.won[tid] || 0) + st;
    }
    return out;
  }
  // periodic review of the person's goals: intensity decay, interest loss (conscientiousness), deadline, deferral
  review(p, s, f) {
    const now = this.world.tick;
    for (const gid of s.goals.slice()) {
      const g = this.S.goals.get(gid), t = this.tpl.get(g.tpl); if (!g || g.status !== 'active') continue;
      const age = (now - g.last) / TICKS_PER_DAY, hz = this.sd((t.horizon[0] + t.horizon[1]) / 2);
      g.int = clamp(g.int * 0.985 + this.press(s, this._mainPress(t), now) * 0.01, 0, 1);
      if (now > g.deadline) { this.fail(g, 'ran out of time'); continue; }
      const hazard = (1 - clamp(0.5 + f.z.C * 0.2, 0.1, 0.95)) * 0.07 * (1 - t.patience * 0.8) * (1 + age / Math.max(hz, 4)) / (0.4 + g.int);
      if (!t.mundane && this.rng('lose', gid, now).next() < hazard) this.abandon(g, 'lost interest');
      else if (g.int < 0.08) this.abandon(g, 'faded');
    }
    for (const gid of s.goals.slice()) { const g = this.S.goals.get(gid); if (g.status === 'deferred' && s.goals.filter((x) => this.S.goals.get(x).status === 'active').length < this.maxActive(f, s)) { g.status = 'active'; g.last = now; this._schedule(g); } else if (g.status === 'deferred' && now - g.born > 120 * TICKS_PER_DAY * this.cfg.dayScale * 3) this.abandon(g, 'never got round to it'); }
  }
  _mainPress(t) { const b = t.gen.boost; if (!b) return 'x'; let best = 'x', m = 0; for (const [k, v] of Object.entries(b)) if (v > m) { m = v; best = k; } return best; }

  // ---------------- ordinary social outings (not goals): seeing friends, visiting family (often off-map), nights out; claimed through the routine hook ----------------
  planOutings(p, s, f) {
    const w = this.world, now = w.tick; s.out = s.out.filter((o) => o.t > now - 6 && !o.done); if (!f.adult && f.age < 14) return;
    const r = this.rng('out', p.id, now), pop = p.ext?.pop, ties = pop?.ties || null, z = f.z;
    const soc = clamp(pop?.life?.sociability ?? 0.5 + 0.15 * z.E, 0.1, 1), ageF = f.age < 30 ? 1.3 : f.age > 65 ? 0.7 : 1, win = 14, per = win / 14;
    const dow0 = w.time.dow ?? w.time.weekday ?? 0;
    const pickTie = (pred) => { if (!ties) return null; let tot = 0; const c = []; for (const x of ties) if (pred(x)) { const wt = (x.s ?? 0.3) * (x.t === 1 ? 2 : x.t === 2 ? 1.2 : 0.6); c.push([x, wt]); } return pickW(c, r.next()); };
    const mk = (kind, x, alias, dest, hrs, weekendBias) => {
      let d = Math.floor(r.next() * win), tries = 0; const wk = () => { const dw = (dow0 + d) % 7; return dw >= 5; };
      while (tries++ < 6 && (r.next() < weekendBias ? !wk() : wk())) d = Math.floor(r.next() * win);
      const hour = hrs[0] + r.next() * (hrs[1] - hrs[0]); s.out.push({ t: this.tickAt(d + 1 + (s.out.length ? 0 : 0), hour), kind, w: x ? x.o : null, name: x ? this.tieName(x.o) : '', alias, dest, done: false });
    };
    const nF = this.poisson(r, 1.5 * soc * ageF * per), nK = this.poisson(r, 0.55 * per * (f.has_family_elsewhere ? 1.2 : 0.8)), nN = f.age < 40 ? this.poisson(r, 0.55 * soc * (f.age < 28 ? 1.3 : 0.7) * per) : 0;
    for (let i = 0; i < nF && s.out.length < 7; i++) { const x = pickTie((q) => q.k === 'friend' || q.k === 'neighbour' && r.next() < 0.1); if (!x) break; if (typeof x.o === 'number') mk('friend', x, ['pub', 'cafe', 'park', 'home'][Math.floor(r.next() * 4)], null, [12, 20], 0.65); else mk('friend_off', x, null, r.next() < 0.5 ? 'city_centre_retail_leisure' : 'other_neighbourhood', [13, 20], 0.7); }
    for (let i = 0; i < nK && s.out.length < 7; i++) { const x = pickTie((q) => q.k === 'kin' || q.k === 'partner' && false); if (!x) break; if (typeof x.o === 'number') mk('family', x, 'home', null, [11, 18], 0.8); else mk('family_off', x, null, 'family_elsewhere', [11, 17], 0.85); }
    for (let i = 0; i < nN && s.out.length < 8; i++) mk('night_out', null, null, 'city_centre_retail_leisure', [20, 22.5], 0.6);
    s.out.sort((a, b) => a.t - b.t);
  }
  poisson(r, lam) { let L = Math.exp(-lam), k = 0, pr = 1; do { k++; pr *= r.next(); } while (pr > L && k < 6); return k - 1; }
  tieName(o) { if (typeof o === 'number') return this.fn(o); if (!this.metro) { this.metro = new Map((this.world.lf?.metro || []).map((m) => [m.id, m])); } const m = this.metro.get(o); return m ? m.name.split(' ')[0] : 'family'; }
  // ---------------- goal creation ----------------
  spawn(p, s, f, t, o = {}) {
    if (!o.force && this.isPlayer(p) && !this.opts.autoPlayer) return null; // the player's person only gets goals the player adopts (player plugin)
    const w = this.world, now = w.tick, S = this.S, r = this.rng('spawn', p.id, now, hash32(t.id));
    const active = s.goals.filter((x) => S.goals.get(x).status === 'active');
    const intensity = clamp(0.25 + 0.45 * (o.dsum ?? 0.5) + 0.35 * (o.maxP ?? 0) + (o.int ?? 0) + r.gauss(0, 0.06), 0.1, 1);
    if (active.length >= this.maxActive(f, s)) {
      let weakest = null; for (const x of active) { const g = S.goals.get(x); if (!weakest || g.int < weakest.int) weakest = g; }
      if (!weakest || weakest.int >= intensity || o.force !== true && t.mundane) return null;
      weakest.status = 'deferred'; w.emit('goal.deferred', { actors: [p.id], payload: { goal: weakest.id, tpl: weakest.tpl }, salience: 0.05 });
    }
    // origin: strongest pressure among the template's boosters -> its cause event
    let cause = o.cause || 0, origin = ''; if (t.gen.boost) { let m = 0.15; for (const k of Object.keys(t.gen.boost)) { const e = s.press[k]; if (e) { const v = this.press(s, k, now); if (v > m) { m = v; cause = cause || e[2]; origin = k; } } } }
    if (t.group && t.group !== 'existing' && !o.force) { let n = 0; for (const G of S.groups.values()) if (G.purpose === t.id && G.status !== 'dissolved') n++; if (n >= Math.max(1, Math.round((w.index.count || 100) / 200)) + (t.invented ? 0 : 1)) return null; }
    const g = { id: S.goalSeq++, tpl: t.id, p: p.id, status: 'active', int: intensity, secret: r.next() < (t.secret || 0), born: now, last: now, deadline: now + Math.round(this.sd(t.horizon[1]) * TICKS_PER_DAY * 1.5 * (1 - 0.3 * s.stress)), cause, origin, parent: o.parent || 0, target: null, methods: [], steps: [], si: 0, method: '', attempts: 0, diff: t.diff ?? 0.5, flags: {}, ex: [], res: {}, group: 0, log: [], endWhy: '' };
    const tg = this.pickGoalTarget(p, f, t, g); if (tg === false) return null; if (tg != null) g.target = tg;
    S.goals.set(g.id, g); s.goals.push(g.id); let a = S.active.get(t.id); if (!a) S.active.set(t.id, (a = new Set())); a.add(p.id);
    S.stats.formed++; S.stats.byTpl[t.id] = (S.stats.byTpl[t.id] || 0) + 1; const fit = (S.fit[t.id] ||= [0, 0]); fit[0]++;
    g.eid = w.emit('goal.formed', { actors: g.target != null && typeof g.target === 'number' ? [p.id, g.target] : [p.id], cause, salience: t.mundane ? 0.05 : 0.2 + 0.2 * t.stakes, tags: g.secret ? ['secret', 'goal'] : ['goal'], payload: { goal: g.id, tpl: t.id, intensity } });
    this.plan(p, s, f, g, 'initial');
    return g;
  }
  pickGoalTarget(p, f, t, g) {
    const needs = t.by.some((m) => this.methods.steps(m, t.verb).some((st) => st.role === 'target')) || ['win_back_ex', 'reconcile_with_person', 'avoid_person', 'avenge_wrong', 'expose_secret', 'ask_out', 'get_engaged_or_commit', 'befriend_isolated_neighbour', 'mentor_young_person', 'support_friend_in_crisis'].includes(t.id);
    if (!needs) return null;
    const rel = p.relationships, w = this.world; let best = null, bs = -9, r = this.rng('tgt', p.id, g.id);
    const want = t.id;
    if (want === 'get_engaged_or_commit' || want === 'introduce_partner_to_family') return f.partnerId ?? false;
    if (rel) for (const [oid, rl] of rel) {
      const q = w.people.get(oid); if (!q || !q.alive || oid === p.id) continue; const age = w.ageOf(q); let sc;
      if (want === 'win_back_ex') sc = rl.tags && rl.tags.includes('ex') ? 2 + (rl.affinity || 0) : -9;
      else if (want === 'reconcile_with_person') sc = oid === f.estrangedId ? 3 : -9;
      else if (want === 'avoid_person' || want === 'avenge_wrong' || want === 'expose_secret') sc = (rl.familiarity || 0) > 0.25 ? -(rl.affinity || 0) * 2 + (rl.familiarity || 0) - (rl.tags && rl.tags.includes('family') ? 3 : 0) : -9;
      else if (want === 'ask_out') sc = (rl.attraction || 0) + (rl.affinity || 0) * 0.5 - (q.romance?.partnerId != null ? 2 : 0) - Math.abs(age - f.age) / 20;
      else if (want === 'befriend_isolated_neighbour' || want === 'support_friend_in_crisis' || want === 'mentor_young_person') sc = want === 'mentor_young_person' ? (age < 25 ? (rl.familiarity || 0) : -9) : (rl.familiarity || 0) + (rl.affinity || 0) * 0.5 - (want === 'befriend_isolated_neighbour' && (rl.familiarity || 0) > 0.7 ? 1 : 0);
      else sc = (rl.familiarity || 0) + (rl.affinity || 0);
      sc += r.next() * 0.3; if (sc > bs) { bs = sc; best = oid; }
    }
    if (want === 'avoid_person' || want === 'avenge_wrong' || want === 'expose_secret') { const ce = g.cause ? w.events.get(g.cause) : null; if (ce) { const o = ce.actors.find((a) => a !== p.id && w.people.get(a)?.alive); if (o != null) return o; } }
    return bs > -3 && best != null ? best : (t.by.some((m) => this.methods.steps(m, t.verb).some((st) => st.role === 'target')) || want === 'avenge_wrong' || want === 'win_back_ex' || want === 'reconcile_with_person' || want === 'expose_secret' ? false : null);
  }

  // ---------------- planning (HTN-lite: goal -> method -> steps; prerequisites inserted at execution, depth <= 3) ----------------
  plan(p, s, f, g, why) {
    const t = this.tpl.get(g.tpl), w = this.world, now = w.tick, r = this.rng('plan', g.id, g.attempts, now);
    const opts = t.by.filter((m) => !g.methods.includes(m));
    if (!opts.length) return false;
    const stress = s.stress, scored = [];
    for (const m of opts.slice(0, 6)) {
      const st = this.methods.steps(m, t.verb); let cost = 0, soc = 0, bias = 0, n = 0, savey = false;
      for (const x of st) { const mv = MOVE[x.move]; cost += mv.money * this.cfg.moneyScale; if (mv.kind === 'social') { soc++; } if (x.move === 'save' || x.move === 'borrow') savey = true; bias += this.selfm.moveBias(s, mv); n++; }
      const afford = cost <= f.money * 0.9 || savey ? 0 : -clamp(cost / Math.max(f.money, 1) - 0.9, 0, 2);
      const shy = -(f.z.E < -0.5 ? soc * 0.12 : 0) + (f.z.E > 0.5 ? soc * 0.05 : 0);
      const sc = 1 + afford + shy + (this.cfg.flags.selfModel ? 0.35 * bias / Math.max(n, 1) : 0) - stress * this.lib.SCARCITY.cheapBias * (n / 6) + (m === opts[0] ? 0.12 : 0) + r.gauss(0, 0.25);
      scored.push([m, sc]);
    }
    const exp = scored.map(([m, sc]) => [m, Math.exp(sc * 2)]);
    const m = pickW(exp, r.next());
    s.trace.push({ t: now, kind: 'method', goal: g.id, top: scored.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, b]) => [a, +b.toFixed(2)]), drives: this.topDrives(p, s) }); if (s.trace.length > 16) s.trace.shift();
    g.method = m; g.methods.push(m); g.attempts++;
    g.steps = this.methods.steps(m, t.verb).map((x, i) => ({ i, move: x.move, v: x.v, role: x.role, target: null, state: 'todo', tries: 0, due: 0, note: '', depth: 0 }));
    if (t.group && t.group !== 'existing' && t.group !== 'business' && !g.steps.some((x) => x.move === 'recruit' || x.move === 'join' || (x.move === 'ask' && x.v === 'join') || (x.move === 'invite' && x.role))) { const at = Math.max(0, g.steps.findIndex((x) => x.move === 'organise' || x.move === 'book' || x.move === 'found')); const ins = [0, 1].map(() => ({ i: 0, move: 'recruit', v: 'member', role: 'contact', target: null, state: 'todo', tries: 0, due: 0, note: '', depth: 0 })); g.steps.splice(at, 0, ...ins); g.steps.forEach((x, i) => (x.i = i)); }
    g.si = 0;
    if (!g.steps.length) g.steps.push({ i: 0, move: 'wait', v: 'time', role: null, target: null, state: 'todo', tries: 0, due: 0, note: '', depth: 0 });
    g.last = now;
    const ev = w.emit(why === 'initial' ? 'goal.planned' : 'goal.replanned', { actors: [p.id], cause: g.eid, salience: 0.05, payload: why === 'initial' ? { goal: g.id, method: m, steps: g.steps.length } : { goal: g.id, method: m, why } });
    g.eid = ev; this._schedule(g, true); return true;
  }
  topDrives(p, s) { const dw = s.dw || []; return this.drives.map((d, i) => [d.id, +(dw[i] || 0).toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 2); }
  // total planned span (sim days) spread over remaining steps, stressed people plan shorter
  _schedule(g, first) {
    const t = this.tpl.get(g.tpl), s = this.S.ps.get(g.p), st = g.steps[g.si]; if (!st) return;
    const mv = MOVE[st.move], r = this.rng('sched', g.id, g.si, st.tries, this.world.tick), left = Math.max(1, g.steps.length - g.si);
    const span = this.sd((t.horizon[0] + t.horizon[1]) / 2) * (0.35 + 0.35 * t.patience) * (1 - (1 - this.lib.SCARCITY.horizonMult) * (s ? s.stress : 0));
    let gap = (span / g.steps.length) * (0.4 + 1.4 * r.next()); if (mv.kind === 'wait') gap = Math.max(gap, this.sd(4) + r.next() * this.sd(10)); if (st.tries) gap = Math.max(gap, this.sd(2) + r.next() * this.sd(6));
    if (first) gap *= 0.6; gap = Math.max(gap, 0.3);
    const hrs = mv.hrs || [10, 17], hour = hrs[0] + r.next() * (hrs[1] - hrs[0]);
    st.due = this.tickAt(gap, hour); if (mv.venue && mv.venue[0] === 'pub' && r.next() < 0.3) st.due += 0;
    this.stepHeap.push({ k: st.due, gid: g.id, si: g.si, tries: st.tries });
    if (s) s.next = { goal: g.id, i: g.si, due: st.due };
  }

  // ---------------- execution (hour clock) ----------------
  hourly() {
    const h = this.stepHeap, now = this.world.tick; let guard = 0;
    while (h.size && h.peek().k <= now && guard++ < 5000) {
      const e = h.pop(), g = this.S.goals.get(e.gid); if (!g || g.status !== 'active' || g.si !== e.si || g.steps[g.si].tries !== e.tries || g.steps[g.si].state === 'done') continue;
      const p = this.world.people.get(g.p); if (!p || !p.alive) { this.end(g, 'void', 'died or left'); continue; }
      this.runStep(p, g, g.steps[g.si]);
    }
    this.groups.hourly();
    const rq = this.S.requests; for (let i = rq.length - 1; i >= 0; i--) if (rq[i].until <= now) { this.answerRequest(rq[i], null); rq.splice(i, 1); }
  }
  pickRole(p, f, g, st, role) {
    const w = this.world, r = this.rng('role', g.id, st.i, st.tries, w.tick), fam = p.family || {};
    if (role === 'target') return g.target;
    if (typeof g.target === 'number' && (g.tpl === 'help_neighbour' || g.tpl === 'befriend_isolated_neighbour') && !g.ex.includes(g.target)) return g.target; // popping round to a named neighbour (e.g. the newcomer they just met)
    if (role === 'member') { const G = g.group ? this.S.groups.get(g.group) : null; if (G) { const ids = Object.keys(G.members).map(Number).filter((x) => x !== p.id && !g.ex.includes(x)); return ids.length ? ids[Math.floor(r.next() * ids.length)] : null; } role = 'contact'; }
    if (role === 'partner') return f.partnerId ?? null;
    if (['employer', 'authority', 'landlord', 'expert'].includes(role)) return { label: { employer: 'the manager', authority: 'the council', landlord: 'the landlord', expert: 'an adviser' }[role], inst: role };
    const pool = []; const rel = p.relationships; if (!rel) return null;
    if (role === 'family') { for (const k of [fam.motherId, fam.fatherId, fam.spouseId, ...(fam.childrenIds || []), ...(fam.siblingIds || [])]) if (k != null && !g.ex.includes(k)) { const q = w.people.get(k); if (q && q.alive) pool.push([k, 1 + (rel.get(k)?.affinity || 0)]); } if (!pool.length) for (const [oid, rl] of rel) if (rl.tags && rl.tags.includes('family') && !g.ex.includes(oid)) pool.push([oid, 1]); }
    else for (const [oid, rl] of rel) {
      if (g.ex.includes(oid) || oid === p.id) continue; const q = w.people.get(oid); if (!q || !q.alive) continue; const a = w.ageOf(q); if (a < 16 && g.tpl !== 'mentor_young_person') continue;
      let wt = tieStrength(rl); if (role === 'friend') wt = (rl.affinity || 0) > 0.25 && (rl.familiarity || 0) > 0.35 ? wt + 0.2 : wt * 0.2; if (role === 'neighbour' && !(rl.tags && rl.tags.includes('neighbour'))) wt *= 0.4; if (g.group) { const gr = this.S.groups.get(g.group); if (gr && gr.members[oid]) wt = 0; }
      if (st.move === 'recruit' && this.S.ps.get(oid)?.goals.length > 6) wt *= 0.3; if (wt > 0.05) pool.push([oid, wt]);
    }
    return pickW(pool, r.next()) ?? null;
  }
  runStep(p, g, st) {
    const w = this.world, S = this.S, t = this.tpl.get(g.tpl), mv = MOVE[st.move], s = this.ps(p), f = { z: personalityZ(p), money: w.ledger.balance(p.id), partnerId: p.romance?.partnerId ?? p.partnerId ?? p.family?.spouseId ?? null }, now = w.tick, r = this.rng('step', g.id, st.i, st.tries, now);
    if (st.target == null && typeof g.target === 'number' && (g.tpl === 'help_neighbour' || g.tpl === 'befriend_isolated_neighbour') && !g.ex.includes(g.target)) st.target = g.target; // the named neighbour
    if (st.role && st.target == null) { st.target = this.pickRole(p, f, g, st, st.role); if (st.target == null && !['employer', 'authority', 'landlord', 'expert'].includes(st.role)) { st.target = null; this.stepFail(p, s, f, g, st, 'busy', 'no one to turn to'); return; } }
    const tp = typeof st.target === 'number' ? w.people.get(st.target) : null;
    if (typeof st.target === 'number' && (!tp || !tp.alive)) { st.target = null; this.stepFail(p, s, f, g, st, 'bad_luck', 'they were not around'); return; }
    // cost / prerequisite (shortfall -> insert a prerequisite step, depth<=3)
    const cost = mv.money * this.cfg.moneyScale * (st.move === 'rent' ? (1 + g.diff) : 1);
    if (cost > 0 && f.money < cost) {
      if (st.depth < 2 && (g.res.pre || 0) < 2 && !g.flags.noPrereq) { g.res.pre = (g.res.pre || 0) + 1; g.res.need = (cost - f.money) * 1.15; const pre = (f.z.A > 0 || this.selfm.get(s, 'asking_works') > 0.55) && st.move !== 'borrow' ? { move: 'borrow', v: 'loan', role: 'family' } : { move: 'save', v: 'lump', role: null }; this.insertStep(g, st, pre, st.depth + 1); this._schedule(g); return; }
      this.stepFail(p, s, f, g, st, 'no_money', ''); return;
    }
    // intrinsic interest
    const stakes = t.stakes ?? 0.4;
    let pr = mv.base; for (const [k, wt] of Object.entries(mv.tr)) pr += wt * f.z[k];
    const rl = tp ? p.relationships?.get(tp.id) : null; if (rl) pr += (rl.trust - 0.5) * 0.25 + (rl.affinity || 0) * 0.2 + ((rl.familiarity || 0) - 0.5) * 0.08;
    if (st.move === 'ask' && rl && g.tpl && (rl.affinity || 0) < -0.2) pr -= 0.2;
    pr += this.selfm.moveBias(s, mv) * 0.06 + (g.int - 0.5) * 0.1 - (g.diff - 0.5) * 0.45 * mv.diffw - s.stress * 0.12 * mv.diffw;
    if (g.flags.lied) pr += 0.1; if (st.move === 'save' || st.move === 'maintain' || st.move === 'train') pr -= s.stress * 0.35;
    const comp = t.claim ? this.competitors(g, t.claim) : 0; pr -= 0.1 * comp;
    let opposed = false; if (tp) { const q = S.ps.get(tp.id); if (q) for (const gid of q.goals) { const og = S.goals.get(gid); if (og && og.status === 'active' && og.target === p.id && (og.tpl === 'avoid_person' || og.tpl === 'avenge_wrong')) { pr -= 0.3; opposed = true; } } }
    if (tp && this.isPlayer(tp) && mv.kind === 'social' && !this.opts.autoPlayer) { const rq = { id: (this.rid = (this.rid || 0) + 1), goal: g.id, from: p.id, to: tp.id, move: st.move, until: now + 3 * TICKS_PER_DAY }; S.requests.push(rq); w.emit('request.pending', { actors: [p.id, tp.id], salience: 0.3, cause: g.eid, payload: { from: p.id, to: tp.id, move: st.move } }); return; }
    const special = this.groups.step(p, s, f, g, st, mv, tp, r); if (special) { pr = special.pr ?? pr; if (special.res) { this.finishStep(p, s, f, g, st, special.res, special.why || '', special.note); return; } }
    pr = clamp(pr, 0.03, 0.97); const u = r.next(); let res, why = '';
    if (u < pr) res = 'ok'; else if (mv.kind === 'social' && st.tries === 0 && u < pr + 0.13 && tp) res = 'maybe';
    else { res = 'fail'; why = st.move === 'save' || st.move === 'budget' ? (r.next() < 0.55 ? 'no_money' : 'busy') : opposed && r.next() < 0.5 ? 'opposed' : mv.kind === 'social' && tp ? (r.next() < 0.85 ? 'refused' : 'busy') : mv.kind === 'inst' || mv.kind === 'econ' ? (r.next() < (comp ? 0.8 : 0.55) ? 'competition' : 'bad_luck') : 'busy'; if (g.tpl && comp && why !== 'opposed' && mv.kind !== 'self') why = 'competition'; }
    if (cost > 0 && res !== 'fail') { const to = 'metropolis'; w.ledger.transfer(p.id, to, cost, 'goal.' + st.move, g.eid); g.res.spent = (g.res.spent || 0) + cost; }
    this.finishStep(p, s, f, g, st, res, why);
  }
  competitors(g, claim) { let n = 0; for (const o of this.S.goals.values()) if (o !== g && o.status === 'active' && this.tpl.get(o.tpl).claim === claim && o.p !== g.p) n++; return Math.min(n, 4); }
  insertStep(g, before, pre, depth) { const st = { i: 0, move: pre.move, v: pre.v, role: pre.role, target: null, state: 'todo', tries: 0, due: 0, note: 'to cover the cost', depth }; g.steps.splice(g.si, 0, st); g.steps.forEach((x, i) => (x.i = i)); }
  finishStep(p, s, f, g, st, res, why, note) {
    const w = this.world, S = this.S, t = this.tpl.get(g.tpl), mv = MOVE[st.move], n = g.steps.length;
    if (res === 'defer') { st.defers = (st.defers || 0) + 1; st.note = note || 'not ready yet'; g.log.push([w.tick, st.move, 'defer', st.note]); if (g.log.length > 12) g.log.shift(); if (st.defers > 4) { this.stepFail(p, s, f, g, st, 'busy', 'it never got ready', false); return; } st.tries++; this._schedule(g); return; }
    S.stats.steps++;
    const tn = typeof st.target === 'number' ? this.fn(st.target) : st.target ? st.target.label : '';
    const txt = note || this.outcomeText(res, why, tn, mv, st, g);
    st.note = txt; g.log.push([w.tick, st.move, res, txt]); if (g.log.length > 12) g.log.shift();
    const beliefs = mv.bel ? [mv.bel] : []; const z = f.z;
    if (res === 'ok') {
      S.stats.stepOk++; st.state = 'done'; g.last = w.tick; this.stepEffects(p, f, g, st, mv); if (beliefs.length && !t.mundane) this.selfm.creditOwn(s, beliefs, +1, '', z, 0.03);
      this._emitStep(p, g, st, 'ok', '', n, tn);
      if (g.si >= g.steps.length - 1) { const ff = Math.max(0, (t.diff ?? 0.4) - 0.22) * 0.5 * (1 - 0.15 * z.C); if (ff > 0 && this.rng('final', g.id, w.tick).next() < ff) { this.fail(g, ['it did not come to much', 'fell short in the end', 'did not work out'][hash32(g.id, 7) % 3]); return; } this.complete(g); return; }
      const hz = Math.max(0, (t.diff ?? 0.4) - 0.2) * 0.2 * (1 - 0.25 * z.C) * (1.25 - t.patience * 0.5) * (1 + s.stress * 0.5);
      if (hz > 0 && this.rng('lapse', g.id, st.i, w.tick).next() < hz) { this.abandon(g, ['lost interest', 'life got in the way', 'other things took over'][hash32(g.id, st.i) % 3]); return; }
      g.si++; this._schedule(g);
    } else if (res === 'maybe') {
      st.tries++; this._emitStep(p, g, st, 'maybe', 'maybe', n, tn); g.last = w.tick; this._schedule(g);
    } else {
      S.stats.stepFail++; if (beliefs.length && !t.mundane) this.selfm.creditOwn(s, beliefs, -1, why, z, 0.04); this._emitStep(p, g, st, 'fail', why, n, tn);
      this.stepFail(p, s, f, g, st, why, txt, true);
    }
  }
  stepFail(p, s, f, g, st, why, txt, emitted) {
    const w = this.world; st.tries++; if (!emitted) { st.note = txt || this.outcomeText('fail', why, '', MOVE[st.move], st, g); g.log.push([w.tick, st.move, 'fail', st.note]); this._emitStep(p, g, st, 'fail', why, g.steps.length, ''); this.S.stats.stepFail++; }
    if (typeof st.target === 'number' && (why === 'refused' || why === 'opposed')) { g.ex.push(st.target); }
    // retry with someone else / later (cheap), else the method is dead -> replan or give up
    const retryable = (why === 'refused' || why === 'busy' || why === 'bad_luck') && st.tries < (why === 'busy' ? 2 : 3) && this.rng('retry', g.id, st.i, st.tries).next() < 0.55 + 0.25 * (s.self ? this.selfm.get(s, 'effort_pays') : 0.5);
    if (retryable) { if (why === 'refused') st.target = null; this._schedule(g); return; }
    const t = this.tpl.get(g.tpl); g.last = w.tick;
    if (g.attempts < 3 && g.methods.length < t.by.length && this.rng('replan', g.id, g.attempts).next() < 0.7) { S_replan: { this.S.stats.replans++; if (this.plan(p, s, f, g, why)) break S_replan; this.fail(g, why); } }
    else this.fail(g, why === 'competition' ? 'lost out' : why === 'no_money' ? 'could not afford it' : why === 'refused' ? 'people said no' : 'it fell through');
  }
  outcomeText(res, why, tn, mv, st, g) {
    const vn = VARIANT_NOUN[st.v] || st.v || '', pick = (a, k) => a[hash32(g.id, st.i, st.tries, k) % a.length];
    if (res === 'ok') { if (tn && MOVE[st.move].kind === 'social' && ['ask', 'recruit', 'persuade', 'invite', 'borrow'].includes(st.move)) return fmt(pick(OUTCOME_TEXT.okT, 1), { t: tn }); const d = fmt(mv.doing, { t: tn || 'them', g: this.phrase(g.tpl), v: this._v(st.v) }); return cap1(d) + ': ' + pick(['went fine', 'went well', 'done', 'no problems'], 2); }
    if (res === 'maybe') return fmt(pick(OUTCOME_TEXT.maybe, 3), { t: tn || 'they', v: vn });
    return fmt(pick(OUTCOME_TEXT[why] || OUTCOME_TEXT.bad_luck, 4), { t: tn || 'they', v: vn });
  }
  _emitStep(p, g, st, ok, why, n, tn) {
    const t = this.tpl.get(g.tpl), w = this.world; if (t.mundane && ok === 'ok' && st.i < n - 1) return;
    const tags = []; if (ok === 'fail') tags.push('setback'); if (ok === 'ok') tags.push('progress'); if (g.secret) tags.push('secret'); if (['confront', 'sabotage', 'threaten', 'gossip'].includes(st.move)) tags.push('conflict', 'harm');
    g.eid = w.emit('goal.step', { actors: typeof st.target === 'number' ? [p.id, st.target] : [p.id], cause: g.eid, salience: ok === 'fail' ? 0.12 : 0.08, tags, payload: { goal: g.id, move: st.move, ok, why, step: st.i + 1, steps: n } });
  }
  stepEffects(p, f, g, st, mv) {
    const w = this.world, t = this.tpl.get(g.tpl), tp = typeof st.target === 'number' ? w.people.get(st.target) : null;
    if (tp && mv.kind === 'social' && w.getRel) { const a = w.getRel(p, tp), b = w.getRel(tp, p); const d = st.move === 'confront' || st.move === 'threaten' || st.move === 'sabotage' || st.move === 'gossip' ? -0.12 : st.move === 'avoid' || st.move === 'observe' ? 0 : 0.04; a.familiarity = clamp((a.familiarity || 0) + 0.04, 0, 1); b.familiarity = clamp((b.familiarity || 0) + 0.04, 0, 1); a.affinity = clamp((a.affinity || 0) + d * 0.6, -1, 1); b.affinity = clamp((b.affinity || 0) + d, -1, 1); a.lastTick = b.lastTick = w.tick; if (st.move === 'confront' || st.move === 'sabotage' || st.move === 'gossip') { b.tags = b.tags || []; if (!b.tags.includes('rival')) b.tags.push('rival'); } if (st.move === 'confide') { a.trust = clamp((a.trust || 0) + 0.05, 0, 1); b.trust = clamp((b.trust || 0) + 0.05, 0, 1); } }
    if (st.move === 'lend' && tp) { const amt = Math.min(mv.money * this.cfg.moneyScale, Math.max(0, f.money * 0.2)); if (amt > 0) { w.ledger.transfer(p.id, tp.id, amt, 'goal.lend', g.eid); } }
    if (st.move === 'borrow' && typeof st.target === 'number') { const q = w.people.get(st.target); const need = (g.res.need || 120 * this.cfg.moneyScale); const amt = Math.min(need, Math.max(0, q.money * 0.25)); if (amt > 0) { w.ledger.transfer(q.id, p.id, amt, 'goal.borrow', g.eid); g.res.debtTo = st.target; } }
    if (st.move === 'borrow' && typeof st.target !== 'number') { /* institutional loan */ w.ledger.transfer('metropolis', p.id, 100 * this.cfg.moneyScale, 'goal.loan', g.eid); }
    if (st.move === 'save') { const amt = Math.min(Math.max(0, f.money * 0.12), 60 * this.cfg.moneyScale * 2); g.res.saved = (g.res.saved || 0) + amt; }
    if (st.move === 'train' || st.move === 'learn') { const k = t.object || 'skill'; if (p.skills) { p.skills[k] = clamp((p.skills[k] || 0) + 0.03, 0, 1); } }
    if (st.move === 'lie') g.flags.lied = true;
    if (st.move === 'attend' || st.move === 'volunteer') { if (w.moodlet) w.moodlet(p, 'goal_social', 'Got out and did something', 0.05, 6 * 24); }
  }
  // ---------------- outcomes ----------------
  complete(g) {
    const w = this.world, S = this.S, t = this.tpl.get(g.tpl), p = w.people.get(g.p), s = this.ps(p), days = Math.round((w.tick - g.born) / TICKS_PER_DAY);
    g.status = 'done'; S.stats.completed++; (S.stats.out[t.id] ||= [0, 0, 0])[0]++; this._detach(g); (S.fit[t.id] ||= [0, 0])[1]++;
    const eid = w.emit('goal.completed', { actors: [g.p], cause: g.eid, salience: t.mundane ? 0.05 : 0.25 + 0.3 * t.stakes, tags: ['success', ...(t.mundane ? [] : ['first'].slice(0, 0))], payload: { goal: g.id, tpl: t.id, want: t.want, days } });
    g.eid = eid; g.endWhy = 'done'; this.finalise(g);
    s.wins.push([t.id, w.tick]); if (s.wins.length > 4) s.wins.shift(); s.ident[t.id] = (s.ident[t.id] || 0) + 1;
    s.cool[t.id] = w.tick + Math.round(this.sd(Math.max(t.horizon[1], 30)) * TICKS_PER_DAY * 0.8);
    const z = personalityZ(p);
    if (!t.mundane) { const bel = new Set(); for (const st of g.steps) { const b = MOVE[st.move].bel; if (b) bel.add(b); } bel.add('effort_pays'); this.selfm.creditOwn(s, [...bel], +1, '', z, 0.06); this._observeTies(p, [...bel], +1); }
    if (w.moodlet) w.moodlet(p, 'goal_done', `Achieved: ${this.phrase(t.id)}`, 0.05 + 0.25 * (t.stakes || 0.3), 14 * 24);
    if (w.addMemory && !t.mundane) w.addMemory(p, { type: 'goal', text: `Managed to ${this.phrase(t.id)}.`, otherIds: [], weight: 0.5, importance: t.stakes > 0.5 ? 3 : 2 });
    for (const d of t.drive) { const pk = Object.entries(this.lib.PRESSURES).filter(([, v]) => v.drives.includes(d)).map(([k]) => k); for (const k of pk) if (s.press[k]) s.press[k][0] *= 0.5; }
    w.emit('goal.effect', { actors: [g.p], cause: eid, salience: 0.05, payload: { goal: g.id, want: t.want, kind: t.verb } });
    this.groups.onGoalEnd(g, true);
  }
  fail(g, why) { this.end(g, 'failed', why); }
  abandon(g, why) { this.end(g, 'abandoned', why); }
  end(g, status, why) {
    const w = this.world, S = this.S, t = this.tpl.get(g.tpl), p = w.people.get(g.p); if (g.status !== 'active' && g.status !== 'deferred') return;
    g.status = status; g.endWhy = why; this._detach(g);
    if (status === 'void') { this.finalise(g); return; }
    S.stats[status === 'failed' ? 'failed' : 'abandoned']++; (S.stats.out[t.id] ||= [0, 0, 0])[status === 'failed' ? 1 : 2]++;
    const s = p ? this.ps(p) : null;
    const eid = w.emit(status === 'failed' ? 'goal.failed' : 'goal.abandoned', { actors: [g.p], cause: g.eid, salience: t.mundane ? 0.04 : 0.15 + 0.2 * (t.stakes || 0.3), tags: ['setback'], payload: { goal: g.id, tpl: t.id, why } });
    g.eid = eid; this.finalise(g);
    if (s) {
      s.cool[t.id] = w.tick + Math.round(this.cfg.yearDays * TICKS_PER_DAY * (0.4 + 0.4 * this.rng('cool', g.id).next()));
      if (!t.mundane && status === 'failed') { this.selfm.creditOwn(s, ['effort_pays'], -1, why.includes('lost') ? 'competition' : 'bad_luck', personalityZ(p), 0.04); if ((t.stakes || 0) > 0.4) this.addPress(s, 'stagnation', 0.2, eid); }
      if (!t.mundane && w.addMemory && (t.stakes || 0) > 0.45) w.addMemory(p, { type: 'goal', text: `Never managed to ${this.phrase(t.id)} (${why}).`, otherIds: [], weight: -0.3, importance: 2 });
      this._transform(p, s, g, t, eid);
    }
    this.groups.onGoalEnd(g, false);
  }
  _transform(p, s, g, t, eid) {
    if (!t.transform) return; const r = this.rng('xform', g.id);
    for (const x of t.transform) { if (r.next() >= x.p) continue; const nt = this.tpl.get(x.to); if (!nt || (s.cool[x.to] || 0) > this.world.tick || this._has(s, x.to)) continue; const f = computeFacts(this.world, p, this.cfg);
      const ng = this.spawn(p, s, f, nt, { cause: eid, parent: g.id, int: 0.1, dsum: 0.5, force: true }); if (ng) { this.S.stats.transformed++; ng.eid = this.world.emit('goal.transformed', { actors: [p.id], cause: eid, salience: 0.2, tags: ['setback'], payload: { goal: g.id, from: t.id, to: nt.id } }); return; } }
  }
  finalise(g) { const S = this.S; S.ended.push(g.id); if (S.ended.length > 800) { for (const id of S.ended.splice(0, 300)) { const o = S.goals.get(id); if (o && o.status !== 'active' && o.status !== 'deferred') S.goals.delete(id); } } }
  _detach(g) { const S = this.S, s = S.ps.get(g.p); if (s) { const i = s.goals.indexOf(g.id); if (i >= 0) s.goals.splice(i, 1); if (s.next && s.next.goal === g.id) s.next = null; } const a = S.active.get(g.tpl); if (a) a.delete(g.p); }
  _observeTies(p, bel, out) { const S = this.S; if (!p.relationships) return; let n = 0; for (const [oid, r] of p.relationships) { const st = tieStrength(r); if (st < 0.3) continue; const q = S.ps.get(oid); if (!q) continue; this.selfm.observe(q, bel, out, st); if (++n >= 6) break; } }

  // ---------------- invention / imitation (bounded, logged) ----------------
  maybeInvent(p, s, f) {
    const S = this.S, w = this.world, now = w.tick, pop = w.index.count || w.living().length;
    const inv = this.lib.INVENTION; if (!inv) return;
    const cap = Math.max(1, Math.round(pop / 100)); if (S.inventedThisYear >= cap || this.tplList.length >= this.cfg.maxInvent) return;
    const r = this.rng('inv', p.id, now); if (r.next() > 0.004 * (0.5 + f.z.O * 0.3)) return;
    // an unmet need: strongest pressure or a recently failed goal's drive
    let need = null, m = 0.2; const OK = INV_NEEDS; for (const k of Object.keys(s.press)) { if (!OK.has(k)) continue; const v = this.press(s, k, now); if (v > m) { m = v; need = k; } } if (!need) return;
    const nd = this.lib.PRESSURES[need]?.drives || []; const acts = inv.activities.filter((a) => a.drives.some((d) => nd.includes(d)) || r.next() < 0.1); if (!acts.length) return;
    // imitation: prefer an activity/format used by a successful tie goal
    const act = acts[Math.floor(r.next() * acts.length)]; const fmts = inv.formats.filter((x) => !x.tags.length || x.tags.some((t) => act.tags.includes(t))); if (!fmts.length) return; const fm = fmts[Math.floor(r.next() * fmts.length)];
    const id = `inv_${act.id}_${fm.id}`; if (this.tpl.has(id)) return;
    const label = fm.label.replace('{a}', act.noun); if (new Set(label.split(' ')).size < label.split(' ').length || (fm.id === 'swapshop' && act.id === 'swap')) return;
    const t = { id, verb: 'create', drive: act.drives.slice(0, 2), want: 'running', object: label, by: fm.by, phrase: `start ${label}`, gen: { base: 0.006, who: 'adult', boost: Object.fromEntries(nd.slice(0, 1).length ? [[need, 3]] : []) }, horizon: [60, 400], patience: 0.5, stakes: 0.25, diff: 0.6, group: fm.group, project: fm.project || undefined, social: 0.5, invented: true, inventedBy: p.id, inventedAt: now };
    this.addTemplate(t); this.S.fit[id] = [0, 0]; S.inventedThisYear++; S.stats.invented++; s.inventedAt = now;
    w.emit('goal.invented', { actors: [p.id], salience: 0.3, cause: s.press[need]?.[2] || 0, tags: ['creative'], payload: { tpl: id, label, from: need } });
    this.spawn(p, s, f, t, { dsum: 0.6, maxP: m, via: 'invention', int: 0.1 });
  }
  yearly() {
    const S = this.S; S.inventedThisYear = 0;
    for (const t of this.tplList) if (t.invented && !t.retired) { const f = S.fit[t.id]; if (f && f[0] >= 8 && (f[1] + 0.5) / (f[0] + 1) < 0.08) { t.retired = true; this.world.emit('goal.template_retired', { salience: 0.05, payload: { tpl: t.id } }); } }
    this.groups.yearly();
  }

  // ---------------- requests aimed at the player ----------------
  answerRequest(rq, yes) { const g = this.S.goals.get(rq.goal); if (!g || g.status !== 'active') return; const p = this.world.people.get(g.p), st = g.steps[g.si]; if (!p || !st) return; const s = this.ps(p), f = computeFacts(this.world, p, this.cfg); this.finishStep(p, s, f, g, st, yes === true ? 'ok' : yes === 'maybe' ? 'maybe' : 'fail', yes === null ? 'busy' : 'refused', yes === null ? 'got no reply' : undefined); }

  // ---------------- lines & queries ----------------
  _v(v) { return !v || /^(practise|rehearse|exercise|study|time|routine|generic|help)$/.test(v) ? '' : v.replace(/_/g, ' '); }
  line(g) { return goalLine(this.world, this.stepTarget(g), this.phrase(g.tpl)); }
  stepTarget(g) { return g; }
  view(g) { const t = this.tpl.get(g.tpl), st = g.steps[g.si]; return { id: g.id, tpl: g.tpl, phrase: this.phrase(g.tpl), status: g.status, intensity: +g.int.toFixed(2), secret: g.secret, born: g.born, cause: g.cause, origin: g.origin, method: g.method, step: st ? { i: g.si + 1, n: g.steps.length, label: stepLabel(this.world, st), note: st.note, due: st.due } : null, target: typeof g.target === 'number' ? g.target : null, group: g.group, parent: g.parent, line: this.line(g), log: g.log.slice(-4), mundane: !!t.mundane }; }
}

// ---------------- persistence, queries, commands (mixed into Engine) ----------------
const P = Engine.prototype;
P.serialize = function () {
  const S = this.S, ps = []; for (const [id, s] of S.ps) ps.push([id, { ...s, wins: s.wins }]);
  return { v: 1, goalSeq: S.goalSeq, groupSeq: S.groupSeq, projSeq: S.projSeq, ps, goals: [...S.goals.values()], groups: [...S.groups.values()], projects: [...S.projects.values()], fit: S.fit, opps: S.opps, requests: S.requests, inventedThisYear: S.inventedThisYear, stats: S.stats, ended: S.ended, nPeople: S.nPeople, rid: this.rid || 0,
    invented: this.tplList.filter((t) => t.invented).map((t) => ({ ...t })), retired: this.tplList.filter((t) => t.retired).map((t) => t.id) };
};
P.deserialize = function (st) {
  const S = this.fresh(); this.S = S; S.goalSeq = st.goalSeq; S.groupSeq = st.groupSeq; S.projSeq = st.projSeq; S.fit = st.fit; S.opps = st.opps; S.requests = st.requests; S.inventedThisYear = st.inventedThisYear; S.stats = st.stats; S.ended = st.ended; S.nPeople = st.nPeople; this.rid = st.rid;
  for (const t of st.invented) if (!this.tpl.has(t.id)) this.addTemplate(t); for (const id of st.retired) { const t = this.tpl.get(id); if (t) t.retired = true; }
  for (const [id, s] of st.ps) S.ps.set(id, s); for (const g of st.goals) S.goals.set(g.id, g); for (const g of st.groups) S.groups.set(g.id, g); for (const p of st.projects) S.projects.set(p.id, p);
  this.scanHeap = new Heap(); this.stepHeap = new Heap();
  for (const [id, s] of S.ps) this.scanHeap.push({ k: s.nextScan, id });
  for (const g of S.goals.values()) { if (g.status === 'active' || g.status === 'deferred') { let a = S.active.get(g.tpl); if (!a) S.active.set(g.tpl, (a = new Set())); a.add(g.p); if (g.status === 'active' && g.steps[g.si]) this.stepHeap.push({ k: g.steps[g.si].due, gid: g.id, si: g.si, tries: g.steps[g.si].tries }); } }
};
P.activeKinds = function () { const m = {}, S = this.S; for (const g of S.goals.values()) if (g.status === 'active') m[g.tpl] = (m[g.tpl] || 0) + 1; return m; };
P.statsView = function () { const S = this.S; let act = 0; for (const g of S.goals.values()) if (g.status === 'active') act++; const gs = { forming: 0, active: 0, institution: 0, dissolved: 0 }; for (const g of S.groups.values()) gs[g.status] = (gs[g.status] || 0) + 1; return { ...S.stats, active: act, people: S.ps.size, groups: gs, templates: this.tplList.filter((t) => !t.retired).length, methodDefaults: this.methods.defaults, projects: S.projects.size }; };
P.groupView = function (g, full) {
  const v = { id: g.id, name: g.name, kind: g.kind, status: g.status, size: this.groups.size(g), leader: g.leader, founder: g.founder, venue: g.venue, cohesion: +g.cohesion.toFixed(2), rep: +g.rep.toFixed(2), born: g.born, rivals: g.rivals.slice(), purpose: g.purpose, project: g.project ? { ...this.S.projects.get(g.project) } : null, meetings: g.meetings };
  if (full) { v.members = Object.entries(g.members).map(([id, m]) => ({ id: +id, role: m.role, commit: +m.commit.toFixed(2), att: m.att })); v.history = g.history.slice(); v.funds = g.funds; }
  return v;
};
const hold = (name) => name;
const NO_OVERRIDE = new Set(['build', 'sleep', 'getup', 'commute', 'work', 'work_home', 'school', 'nursery', 'uni', 'school_run', 'nap', 'sick', 'bedtime', 'night_work', 'sleep_day', 'childcare', 'carer', 'breakfast', 'goal']);
const CAT = { social: 'social', group: 'social', inst: 'errand', econ: 'errand', self: 'home', wait: 'home' };
// Routine hook (see sim/systems/routine/index.js): slot = {tick, until, act, ptype, pid}. Returns null or {label, thought, ptype, pid, cat, ...} replacing that plan entry. O(1) when nothing is due.
P.override = function (p, slot) {
  const s = this.S.ps.get(p.id); if (!s || (s.next === null && s.groups.length === 0 && s.out.length === 0)) return null; const w = this.world;
  const t0 = slot ? (slot.tick ?? slot.start ?? w.tick) : w.tick, t1 = slot ? (slot.until ?? slot.end ?? t0 + 30) : t0 + 30;
  if (slot && slot.act && NO_OVERRIDE.has(slot.act)) { for (const o of s.out) if (!o.done && o.t >= t0 && o.t < t1 && (o.re = (o.re || 0) + 1) <= 3) o.t = t1 + 1; return null; }
  if (s.next) { const g = this.S.goals.get(s.next.goal); if (g && g.status === 'active' && s.next.due >= t0 && s.next.due < t1) { const st = g.steps[g.si]; if (st && st.state !== 'done') return this._activity(p, g, st); } }
  for (const o of s.out) { if (o.done || o.t < t0 || o.t >= t1) continue; o.done = true; this.S.stats.outings = (this.S.stats.outings || 0) + 1; return this._outing(p, o); }
  for (const gid of s.groups) { const G = this.S.groups.get(gid); if (G && (G.status === 'active' || G.status === 'institution') && G.nextMeet >= t0 && G.nextMeet < t1 && G.kind !== 'online_community' && G.kind !== 'business') return { kind: 'group_meeting', activity: 'group_meeting', label: `${G.name}: meeting`, thought: `${G.name} tonight. ${G.status === 'institution' ? 'Always is.' : 'Hope enough people come.'}`, ptype: G.venue != null ? 1 : undefined, pid: G.venue != null ? G.venue : undefined, cat: 'social', venue: G.venue, venueKind: G.venueKind, ticks: 12, group: G.id, why: `member of ${G.name}` }; }
  return null;
};
P._outing = function (p, o) {
  const w = this.world; let label, thought, ptype, pid;
  if (typeof o.w === 'number' && w.getRel) { const q = w.people.get(o.w); if (q && q.alive) { const a = w.getRel(p, q), b = w.getRel(q, p); a.familiarity = clamp((a.familiarity || 0) + 0.03, 0, 1); b.familiarity = clamp((b.familiarity || 0) + 0.03, 0, 1); a.affinity = clamp((a.affinity || 0) + 0.015, -1, 1); b.affinity = clamp((b.affinity || 0) + 0.015, -1, 1); a.lastTick = b.lastTick = w.tick; } }
  const where = { pub: 'at the pub', cafe: 'for a coffee', park: 'in the park', home: 'at home' };
  if (o.kind === 'friend') { label = `Seeing ${o.name} ${where[o.alias]}`; thought = `Catching up with ${o.name}. Been too long.`; if (o.alias !== 'home') { const v = this.groups.venueByAlias(o.alias, p.id); if (v != null) { ptype = 1; pid = v; } } }
  else if (o.kind === 'family') { label = `Visiting ${o.name}`; thought = `Popping round to see ${o.name}.`; }
  else if (o.kind === 'friend_off') { label = `Meeting ${o.name} in town`; thought = `Into town to see ${o.name}.`; ptype = 3; pid = w.rtx?.destKeys ? w.rtx.destKeys.indexOf(o.dest) : undefined; }
  else if (o.kind === 'family_off') { label = `Visiting ${o.name} and the family`; thought = `Off to see ${o.name}. Should do this more often.`; ptype = 3; pid = w.rtx?.destKeys ? w.rtx.destKeys.indexOf(o.dest) : undefined; }
  else { label = 'Out in town with friends'; thought = 'Night out. Properly this time.'; ptype = 3; pid = w.rtx?.destKeys ? w.rtx.destKeys.indexOf(o.dest) : undefined; }
  if (ptype === 3 && (pid === undefined || pid < 0)) { ptype = undefined; pid = undefined; }
  return { kind: 'outing', activity: 'outing_' + o.kind, label, thought, ptype, pid, cat: 'social', ticks: 12 };
};
P._activity = function (p, g, st) {
  const mv = MOVE[st.move], w = this.world, tgt = typeof st.target === 'number' ? this.fn(st.target) : st.target ? st.target.label : '';
  const vars = { t: tgt || 'someone', g: this.phrase(g.tpl), v: this._v(st.v) };
  const doing = fmt(mv.doing, vars), thought = mv.thought ? fmt(mv.thought, vars) : '';
  let ptype, pid; const vk = mv.venue || ['home']; if (vk[0] !== 'home') for (const alias of vk) { const v = this.groups.venueByAlias(alias, p.id); if (v != null) { ptype = 1; pid = v; break; } if (alias === 'street') { ptype = 2; break; } }
  return { kind: 'goal_step', activity: 'goal_' + st.move, label: doing.charAt(0).toUpperCase() + doing.slice(1) + ` (${this.phrase(g.tpl)})`, thought, ptype, pid, cat: CAT[mv.kind] || 'out', venueKind: mv.venue ? mv.venue[0] : 'home', venueAlts: mv.venue || ['home'], withPerson: typeof st.target === 'number' ? st.target : null, ticks: mv.dur, goal: g.id, step: g.si, why: this.line(g) };
};
P.getChoices = function (id) {
  const p = this.world.people.get(id), s = this.S.ps.get(id); if (!p || !s) return [];
  const out = []; for (const gid of s.goals) { const g = this.S.goals.get(gid); if (!g || g.status !== 'active') continue; const st = g.steps[g.si]; if (!st) continue; out.push({ kind: 'step', goal: g.id, move: st.move, label: stepLabel(this.world, st), reason: `part of: ${this.phrase(g.tpl)}`, score: +(g.int * (1 - 0.1 * g.si)).toFixed(2) }); }
  const f = computeFacts(this.world, p, this.cfg);
  for (const o of this.S.opps) if (o.until > this.world.tick && o.boosts) for (const k of Object.keys(o.boosts)) if (!this._has(s, k) && this.tpl.get(k)) out.push({ kind: 'goal', tpl: k, label: this.phrase(k), reason: `opportunity: ${o.kind}`, score: 0.3 });
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
};
P.cmdPlant = function (a, how) {
  const p = this.world.people.get(a.person), t = this.tpl.get(a.tpl); if (!p || !t) return false;
  const s = this.ps(p), f = computeFacts(this.world, p, this.cfg); this.seedPeople();
  if (this._has(s, t.id)) return false;
  const g = this.spawn(p, s, f, t, { dsum: 0.6, maxP: a.intensity ?? 0.5, force: true, via: how, cause: a.cause || 0 });
  if (g) { if (a.target != null) g.target = a.target; if (a.secret != null) g.secret = !!a.secret; if (a.intensity != null) g.int = a.intensity; }
  return g ? g.id : false;
};
P.cmdMove = function (a) {
  const p = this.world.people.get(a.person); if (!p || !MOVE[a.move]) return false; const s = this.ps(p), f = computeFacts(this.world, p, this.cfg), t = this.tpl.get('ad_hoc_move');
  const g = this.spawn(p, s, f, t, { force: true, dsum: 0.5 }); if (!g) return false;
  g.steps = [{ i: 0, move: a.move, v: a.variant || '', role: null, target: a.target ?? null, state: 'todo', tries: 0, due: this.world.tick, note: '', depth: 0 }]; g.si = 0; g.group = a.group || 0; g.target = a.target ?? null;
  this.runStep(p, g, g.steps[0]); return g.id;
};
P.isPlayer = function (tp) { const pl = this.world.player; return tp && pl != null && (pl === tp.id || pl.id === tp.id || pl.personId === tp.id); };
P.cmdRespond = function (a) { const rq = this.S.requests.find((r) => r.id === a.request); if (!rq) return false; this.S.requests.splice(this.S.requests.indexOf(rq), 1); this.answerRequest(rq, a.answer === 'yes' ? true : a.answer === 'maybe' ? 'maybe' : false); return true; };
P.cmdOpportunity = function (a) {
  const w = this.world, days = a.days ?? 60; this.S.opps.push({ kind: a.kind, key: a.key || a.kind, boosts: a.boosts || {}, place: a.place ?? null, until: w.tick + Math.round(this.sd(days) * TICKS_PER_DAY) });
  w.emit('opportunity.created', { place: a.place ?? null, salience: 0.15, tags: ['opportunity'], payload: { kind: a.kind, key: a.key || a.kind } }); return true;
};
P.cmdGroupCreate = function (a) {
  const g = this.groups.create({ kind: a.kind, founder: a.founder, name: a.name, purpose: a.purpose || '', members: a.members || [] }); g.status = 'active'; this.groups.announce(g); return g.id;
};
P.cmdGroupJoin = function (a) { const g = this.S.groups.get(a.group); if (!g || g.status === 'dissolved') return false; return this.groups.addMember(g, a.person, a.role || 'member', 0.6, false); };
