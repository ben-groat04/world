// Utility-AI decision making. Every candidate action is scored; a softmax over the top scores (personality-dependent
// temperature) picks one. Extension points: world.registerAction(def), brain.addModifier(fn(world,p,def,score)->score).
import { JOBS } from './map.js';
import { TICKS_PER_YEAR, ticksUntilHour } from './time.js';
import { DECAY } from './needs.js';

const DEFAULT_JOB = { shift: [8, 17] };
function inWindow(h, bed, wake) { if (bed >= 24) { const b = bed - 24; return h >= b && h < wake; } return h >= bed || h < wake; }

export class Brain {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.modifiers = [];
    this._openTick = -1; this._open = {};
    this._cd = []; this._cs = []; this._ct = []; this._cy = []; this._cx = []; this._wt = new Float64Array(64);
    this.ctx = { h: 0, tick: 0, weekday: 0, rest: false, age: 0, workDay: false, shift: false, shiftEnd: 0, mealAgo: 0, wake: 6.5, bed: 22, inWin: false, target: null, why: null, data: null };
  }
  register(def) {
    const i = this.list.findIndex((d) => d.id === def.id);
    if (def.perTick) def._pt = Object.entries(def.perTick);
    if (i >= 0) this.list[i] = def; else this.list.push(def);
    if (this._wt.length < this.list.length + 8) this._wt = new Float64Array(this.list.length * 2 + 16);
  }
  addModifier(fn) { this.modifiers.push(fn); }
  // buildings of `type` that are open right now (cached per tick; shared by all scorers)
  openOf(type) {
    const w = this.world;
    if (this._openTick !== w.tick) { this._openTick = w.tick; this._open = {}; }
    let l = this._open[type];
    if (l === undefined) { l = this._open[type] = []; for (const b of w.buildingsOfType(type)) if (w.isOpen(b)) l.push(b); }
    return l;
  }
  // Fill the shared context for person p (also usable by modifiers / UI).
  prepare(p) {
    const w = this.world, t = w.time, c = this.ctx, s = p.schedule;
    c.h = t.hourFloat; c.tick = w.tick; c.weekday = t.weekday; c.rest = t.restDay;
    c.age = (w.tick - p.birthTick) / TICKS_PER_YEAR;
    const J = p.workId != null ? (JOBS[p.job] || DEFAULT_JOB) : null;
    let wake = s.wake, bed = s.bed;
    if (J) {
      const [a, e] = J.shift;
      if (a >= 12) { wake = a - 3.5; bed = e + 0.7; } else if (a < 8) { wake = Math.min(wake, a - 1.1); bed = Math.min(bed, 22); }
      else wake = Math.min(wake, a - 1);
      c.workDay = J.service ? t.weekday !== s.offDay : !t.restDay;
      c.shift = c.workDay && c.h >= a && c.h < e;
      c.shiftEnd = e;
    } else { c.workDay = false; c.shift = false; c.shiftEnd = 0; }
    c.wake = wake; c.bed = bed; c.inWin = inWindow(c.h, bed, wake);
    c.mealAgo = w.tick - p.lastMeal;
    c.cur = p.currentAction ? p.currentAction.id : null;
    c.hfP = null; // household-food cache owner (see actions.householdFood)
    return c;
  }
  // Score all actions into the brain's parallel candidate arrays (no per-candidate allocation). Returns the candidate count.
  // If `out` is an array, also pushes {id,score,target,why} for every candidate (debug / UI "why" view).
  _eval(p, out) {
    const w = this.world, c = this.prepare(p), cd = p.cooldown, tick = c.tick, age = c.age;
    const list = this.list, mods = this.modifiers, nm = mods.length, cur = c.cur;
    const CD = this._cd, CS = this._cs, CT = this._ct, CY = this._cy, CX = this._cx;
    let n = 0;
    for (let di = 0; di < list.length; di++) {
      const def = list[di];
      if (def.minAge !== undefined && age < def.minAge) continue;
      if (def.maxAge !== undefined && age > def.maxAge) continue;
      if (cd[def.id] > tick) continue;
      c.target = null; c.why = null; c.data = null;
      let s = def.score(w, p);
      if (!(s > 0)) continue;
      const target = c.target, why = c.why, data = c.data;
      for (let i = 0; i < nm; i++) { const r = mods[i](w, p, def, s); if (typeof r === 'number') s = r; }
      const dm = def._mods;
      if (dm !== undefined) for (let i = 0; i < dm.length; i++) { const r = dm[i](w, p, def, s); if (typeof r === 'number') s = r; }
      if (cur === def.id) s += def.stickiness ?? 8;
      if (!(s > 0)) continue;
      CD[n] = def; CS[n] = s; CT[n] = target; CY[n] = why; CX[n] = data; n++;
      if (out) out.push({ id: def.id, score: s, target, why });
    }
    return n;
  }
  // AGENDA MODE. Absolute tick at which an interruptible action should be re-evaluated, or Infinity: the next scheduled obligation
  // (shift start, school bell, bed time) and the analytic time at which an urgent need threshold is crossed given the current action's
  // effects. Uses the context prepared for p (World._begin calls prepare first). Replaces the legacy "re-think every 12 ticks" polling.
  interruptAt(p, def) {
    const w = this.world, c = this.ctx, tick = w.tick;
    let t = Infinity, d;
    if (p.workId != null && c.workDay && !c.shift) {
      const J = JOBS[p.job] || DEFAULT_JOB;
      if (c.h < J.shift[0]) { d = ticksUntilHour(tick, J.shift[0]); if (tick + d < t) t = tick + d; }
    } else if (p.job === 'student' && !c.rest && c.h < 8) { d = ticksUntilHour(tick, 8); if (tick + d < t) t = tick + d; }
    if (!c.inWin) { d = ticksUntilHour(tick, c.bed % 24); if (tick + d < t) t = tick + d; }
    const n = p.needs, r = p.needRate, dm = def.decay, pt = def.perTick;
    d = this._cross(n.hunger, 0.68, DECAY.hunger * r.hunger * (dm && dm.hunger !== undefined ? dm.hunger : 1), pt && pt.hunger || 0); if (tick + d < t) t = tick + d;
    d = this._cross(n.energy, 0.3, DECAY.energy * r.energy * (dm && dm.energy !== undefined ? dm.energy : 1), pt && pt.energy || 0); if (tick + d < t) t = tick + d;
    d = this._cross(n.hygiene, 0.5, DECAY.hygiene * r.hygiene * (dm && dm.hygiene !== undefined ? dm.hygiene : 1), pt && pt.hygiene || 0); if (tick + d < t) t = tick + d;
    return t < tick + 2 ? tick + 2 : Math.ceil(t);
  }
  // ticks until need value v falls to thr given decay rate k per tick and perTick gain g (Infinity if it never will / already below)
  _cross(v, thr, k, g) { const rate = k - g; return v > thr && rate > 1e-9 ? (v - thr) / rate : Infinity; }
  explain(p) { const out = []; this._eval(p, out); return out.sort((a, b) => b.score - a.score); }
  // Pick and start an action for p (softmax over candidate scores; temperature from conscientiousness).
  decide(p) {
    const w = this.world;
    let n = this._eval(p);
    const CD = this._cd, CS = this._cs, CT = this._ct, CY = this._cy, CX = this._cx, WT = this._wt;
    const temp = 2 + 3 * (1 - p.personality.conscientiousness) + (p.traits.includes('lazy') ? 1 : 0);
    while (n > 0) {
      let max = -1;
      for (let k = 0; k < n; k++) if (CS[k] > max) max = CS[k];
      let tot = 0; const lim = max - 5 * temp;
      for (let k = 0; k < n; k++) { const v = CS[k] > lim ? Math.exp((CS[k] - max) / temp) : 0; WT[k] = v; tot += v; }
      let r = w.rng.next() * tot, pk = 0;
      for (let k = 0; k < n; k++) { r -= WT[k]; if (r <= 0 && WT[k] > 0) { pk = k; break; } }
      const def = CD[pk];
      let target = CT[pk];
      if (def.where) { const t = def.where(w, p); target = t === undefined ? null : t; }
      const cur = p.currentAction;
      if (cur && cur.id === def.id && cur.targetId === target && (target === null || typeof target === 'number')) return;
      if (w.startAction(p, def.id, target, CY[pk], { data: CX[pk] })) return;
      p.cooldown[def.id] = w.tick + 6;
      n--; CD[pk] = CD[n]; CS[pk] = CS[n]; CT[pk] = CT[n]; CY[pk] = CY[n]; CX[pk] = CX[n]; // order only matters for ties; swap-remove
    }
    if (!p.currentAction) w.startAction(p, 'idle', null, 'nothing to do');
  }
}
