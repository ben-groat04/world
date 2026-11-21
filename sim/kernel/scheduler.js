// Agenda scheduler: a timing wheel of people. Nobody is "ticked": each living person sits in exactly one bucket (the tick in p.wake) and runs code
// only when (a) the current activity ends, (b) an interrupt fires (appointment such as shift start / bed time, analytic need threshold,
// forced action, command, encounter-driven change).
// Invariant: p.wake === the single valid entry's tick. Entries whose tick != p.wake are stale and skipped (so rescheduling is just "set p.wake and push").
// Buckets are processed in ascending person id (canonical order => straight run == snapshot-resumed run).
export const WHEEL = 512, MASK = WHEEL - 1;
const byId = (a, b) => a.id - b.id;

export class Scheduler {
  constructor(world) {
    this.world = world;
    this.wheel = Array.from({ length: WHEEL }, () => []);
    this.far = []; this.farMin = Infinity;
    this.cur = null;                       // person being processed (their plan() is deferred until they finish)
    this.stats = { wakes: 0, stale: 0, decisions: 0, far: 0 };
  }
  /** Put p in the bucket for absolute tick t (clamped to the future) and record it in p.wake. */
  schedule(p, t) {
    const now = this.world.tick;
    if (t <= now) t = now + 1; else if (t % 1 !== 0) t = Math.ceil(t);
    if (p.wake === t) return;
    p.wake = t;
    if (t - now >= WHEEL) { this.far.push(p); if (t < this.farMin) this.farMin = t; this.stats.far++; return; }
    this.wheel[t & MASK].push(p);
  }
  /** Process everyone due at `tick` (ascending id). */
  run(tick) {
    const w = this.world;
    if (this.farMin <= tick + WHEEL - 1) this._promote(tick);
    const slot = tick & MASK, b = this.wheel[slot];
    if (b.length === 0) return;
    this.wheel[slot] = [];
    if (b.length > 1) { if (b.length > 24) b.sort(byId); else for (let i = 1; i < b.length; i++) { const x = b[i], id = x.id; let j = i - 1; while (j >= 0 && b[j].id > id) { b[j + 1] = b[j]; j--; } b[j + 1] = x; } }
    const attn = w.index._attention; attn.length = 0;
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (p.wake !== tick) { this.stats.stale++; continue; }
      if (!p.alive) continue;
      p.wake = -1; this.cur = p; attn.push(p);
      this.stats.wakes++;
      w._agendaPerson(p);
      this.cur = null;
      if (p.alive && p.wake === -1) this.schedule(p, tick + 1);
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
