// Archive the departed. Long runs (50+ years) accumulate every person who ever lived or moved away (arrivals ~40/yr):
// without pruning, memory, snapshot size and every "for all people" loop grow without bound.
// After a grace period (GRACE_YEARS) a dead or emigrated person is reduced to a stub: identity, family links, birth/death facts
// and ext (kept, minus its tie list, so kin lookups never dereference undefined) survive; relationships, rumours, per-system state and (for emigrants)
// memories are dropped, and living people's relationships/ties pointing at an archived person are cleared.
// Genealogy (grandparents, graves, obituaries) is unaffected because the stub keeps `family`, names, dates and cause of death.
export const GRACE_DEAD_YEARS = 1;
// Emigrants can return for up to 6 years (life/stages.js boomerangScan revives adult children who left home), so they are archived after 7.
export const GRACE_EMIGRANT_YEARS = 7;

/** Run monthly. `w.archiveHooks` = [(person) => void] let plugins drop their per-person state. */
export function archiveDeparted(w) {
  const ty = w.calendar.ticksPerYear || 16128, now = w.tick, fresh = [];
  for (const p of w.people.values()) {
    if (p.alive || p._arch) continue;
    const t = p.emigrated ? p.emigratedTick : p.deathTick;
    if (t == null || now - t < (p.emigrated ? GRACE_EMIGRANT_YEARS : GRACE_DEAD_YEARS) * ty) continue;
    p._arch = 1; fresh.push(p);
    p.relationships = new Map(); p.rumors = []; p.moodlets = [];
    if (p.emigrated) p.memories = [];
    else if (p.memories.length > 12) p.memories = p.memories.filter((m) => (m.importance || 0) >= 3).slice(-12);
    if (p.ext && p.ext.pop) p.ext.pop.ties = []; // other ext state stays (small) so a stray revive/lookup never meets undefined
    for (const h of w.archiveHooks) h(p);
  }
  if (!fresh.length) return 0;
  const gone = new Set(fresh.map((p) => p.id));
  for (const p of w.living()) for (const k of p.relationships.keys()) { if (gone.has(k)) p.relationships.delete(k); else { const o = w.people.get(k); if (o && o._arch) p.relationships.delete(k); } }
  return fresh.length;
}

// Households are indexed by id (lf.households[id]) and never removed, so "for every household" loops would slow with history.
// liveHh returns the non-gone ones (same order). Cached per lf; rebuilt when households were added or every ~month (a household that
// went gone since the last rebuild is still listed, which callers already skip via `hh.gone`).
const LIVE = new WeakMap();
export function liveHh(w) {
  const lf = w.lf, h = lf.households; let c = LIVE.get(lf);
  if (!c || c.n !== h.length || w.tick - c.t > 4320 || c.t > w.tick) { const a = []; for (let i = 0; i < h.length; i++) if (!h[i].gone) a.push(h[i]); c = { a, n: h.length, t: w.tick }; LIVE.set(lf, c); }
  return c.a;
}
