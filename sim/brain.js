// Utility-AI decision making. Every candidate action is scored; a softmax over the top scores (personality-dependent
// temperature) picks one. Extension points: world.registerAction(def), brain.addModifier(fn(world,p,def,score)->score).
import { JOBS } from './map.js';
import { TICKS_PER_YEAR } from './time.js';

const DEFAULT_JOB = { shift: [8, 17] };
function inWindow(h, bed, wake) { if (bed >= 24) { const b = bed - 24; return h >= b && h < wake; } return h >= bed || h < wake; }

export class Brain {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.modifiers = [];
    this.ctx = { h: 0, tick: 0, weekday: 0, rest: false, age: 0, workDay: false, shift: false, shiftEnd: 0, mealAgo: 0, wake: 6.5, bed: 22, inWin: false, target: null, why: null, data: null };
  }
  register(def) {
    const i = this.list.findIndex((d) => d.id === def.id);
    if (def.perTick) def._pt = Object.entries(def.perTick);
    if (i >= 0) this.list[i] = def; else this.list.push(def);
  }
  addModifier(fn) { this.modifiers.push(fn); }
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
    return c;
  }
  // Score all actions. If `out` is an array, pushes {id,score,target,why} for every candidate (debug / UI "why" view).
  _eval(p, out) {
    const w = this.world, c = this.prepare(p), cd = p.cooldown;
    const cands = [];
    for (const def of this.list) {
      if (def.minAge !== undefined && c.age < def.minAge) continue;
      if (def.maxAge !== undefined && c.age > def.maxAge) continue;
      if (cd[def.id] > c.tick) continue;
      c.target = null; c.why = null; c.data = null;
      let s = def.score(w, p);
      if (!(s > 0)) continue;
      let target = c.target;
      for (const m of this.modifiers) { const r = m(w, p, def, s); if (typeof r === 'number') s = r; }
      for (const m of def._mods || []) { const r = m(w, p, def, s); if (typeof r === 'number') s = r; }
      if (c.cur === def.id) s += def.stickiness ?? 8;
      if (!(s > 0)) continue;
      cands.push({ def, score: s, target, why: c.why, data: c.data });
      if (out) out.push({ id: def.id, score: s, target, why: c.why });
    }
    return cands;
  }
  explain(p) { const out = []; this._eval(p, out); return out.sort((a, b) => b.score - a.score); }
  // Pick and start an action for p. depth guards retries when a chosen action is unreachable.
  decide(p, depth = 0) {
    const w = this.world;
    const cands = this._eval(p);
    const n = p.personality;
    const temp = 2 + 3 * (1 - n.conscientiousness) + (p.traits.includes('lazy') ? 1 : 0);
    while (cands.length) {
      let max = -1;
      for (const k of cands) if (k.score > max) max = k.score;
      let tot = 0;
      for (const k of cands) { k.wt = k.score > max - 5 * temp ? Math.exp((k.score - max) / temp) : 0; tot += k.wt; }
      let r = w.rng.next() * tot, pick = cands[0];
      for (const k of cands) { r -= k.wt; if (r <= 0 && k.wt > 0) { pick = k; break; } }
      let target = pick.target;
      if (pick.def.where) { const t = pick.def.where(w, p); target = t === undefined ? null : t; }
      const cur = p.currentAction;
      if (cur && cur.id === pick.def.id && cur.targetId === target && (target === null || typeof target === 'number')) return;
      if (w.startAction(p, pick.def.id, target, pick.why, { data: pick.data })) return;
      p.cooldown[pick.def.id] = w.tick + 6;
      cands.splice(cands.indexOf(pick), 1);
    }
    if (!p.currentAction) w.startAction(p, 'idle', null, 'nothing to do');
  }
}
