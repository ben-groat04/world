// Agenda scheduler: a timing wheel of people. Nobody is "ticked": each living person sits in exactly one bucket (the tick in p.wake) and runs code
// only when (a) the current activity ends, (b) an interrupt fires (appointment such as shift start / bed time, analytic need threshold,
// forced action, command, encounter-driven change), (c) a coarse staggered slow update (needs refresh every NEEDS_PERIOD_AGENDA ticks),
// (d) arrival after a walk. Walking is analytic: the arrival tick is computed from the route when the walk starts and positions are materialised
// lazily (World._syncWalkers) when somebody reads them, so a walker costs two wake-ups, not one per tick.
// Invariant: p.wake === the single valid entry's tick. Entries whose tick != p.wake are stale and skipped (so rescheduling is just "set p.wake and push").
// Buckets are processed in ascending person id (canonical order => straight run == snapshot-resumed run).
// mode 'legacy' = the old every-tick people loop (World._stepPeople) kept as a flag; 'agenda' = this.
export const WHEEL = 512, MASK = WHEEL - 1;
export const NEEDS_PERIOD_AGENDA = 24;   // ticks between staggered needs/mood refreshes for someone mid long activity (4 h)
const byId = (a, b) => a.id - b.id;

export class Scheduler {
  constructor(world, mode = 'agenda') {
    this.world = world; this.mode = mode;
    this.wheel = Array.from({ length: WHEEL }, () => []);
    this.far = []; this.farMin = Infinity;
    this.cur = null;                       // person being processed (their plan() is deferred until they finish)
    this.stats = { wakes: 0, stale: 0, decisions: 0, far: 0 };
  }
  get agenda() { return this.mode === 'agenda'; }
  setMode(m) { if (m !== 'agenda' && m !== 'legacy') throw new Error('sched.mode must be agenda|legacy'); this.mode = m; if (m === 'agenda') this.rebuild(); }
  /** Put p in the bucket for absolute tick t (clamped to the future) and record it in p.wake. */
  schedule(p, t) {
    const now = this.world.tick;
    if (t <= now) t = now + 1; else if (t % 1 !== 0) t = Math.ceil(t);
    if (p.wake === t) return;
    p.wake = t;
    if (t - now >= WHEEL) { this.far.push(p); if (t < this.farMin) this.farMin = t; this.stats.far++; return; }
    this.wheel[t & MASK].push(p);
  }
  /** Recompute p's next wake from its current activity. Call after ANY change to p.currentAction outside the person loop (World does). */
  plan(p) {
    if (!p.alive || this.cur === p) return;
    const w = this.world, tick = w.tick, ca = p.currentAction;
    let wk;
    if (ca === null) wk = tick + 1;
    else if (ca.status === 0) wk = ca.lazy ? ca.arrive : tick + 1;
    else {
      const def = ca._d;
      wk = ca.untilTick;
      const nn = p.needsTick + NEEDS_PERIOD_AGENDA; if (nn < wk) wk = nn;
      if (def.onTick !== undefined) { const nt = ca.tt + (def.tickEvery || 1); if (nt < wk) wk = nt; }
      if (def.interruptible && !ca.forced && p.nextThink < wk) wk = p.nextThink;
    }
    this.schedule(p, wk);
  }
  /** Process everyone due at `tick` (ascending id). */
  run(tick) {
    const w = this.world;
    if (this.farMin <= tick + WHEEL - 1) this._promote(tick);
    const slot = tick & MASK, b = this.wheel[slot];
    if (b.length === 0) return;
    this.wheel[slot] = [];
    if (b.length > 1) b.sort(byId);
    const attn = w.index._attention; attn.length = 0;
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (p.wake !== tick) { this.stats.stale++; continue; }
      if (!p.alive) continue;
      p.wake = -1; this.cur = p; attn.push(p);
      this.stats.wakes++;
      w._agendaPerson(p);
      this.cur = null;
      if (p.alive && p.wake === -1) this.plan(p);
    }
    attn.length = 0;
  }
  _promote(tick) {
    const lim = tick + WHEEL - 1; let min = Infinity; const keep = [];
    for (const p of this.far) { const t = p.wake; if (t < 0 || !p.alive) continue; if (t <= lim) this.wheel[t & MASK].push(p); else { keep.push(p); if (t < min) min = t; } }
    this.far = keep; this.farMin = min;
  }
  /** Rebuild the wheel from p.wake (after snapshot load / mode switch). */
  rebuild() {
    const w = this.world;
    for (const b of this.wheel) b.length = 0; this.far = []; this.farMin = Infinity;
    for (const p of w.living()) { const t = p.wake > w.tick ? p.wake : w.tick + 1; p.wake = -2; this.schedule(p, t); }
  }
}
