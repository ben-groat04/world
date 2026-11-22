// Archive the departed. Long runs (50+ years) accumulate every person who ever lived or moved away (arrivals ~40/yr):
// without pruning, memory, snapshot size and every "for all people" loop grow without bound.
// After a grace period (GRACE_YEARS) a dead or emigrated person is reduced to a stub: identity, family links, birth/death facts
// and ext.pop (kept so kin lookups never dereference undefined) survive; relationships, rumours, per-system state and (for emigrants)
// memories are dropped, and living people's relationships/ties pointing at an archived person are cleared.
// Genealogy (grandparents, graves, obituaries) is unaffected because the stub keeps `family`, names, dates and cause of death.
const STUB_EXT_DROP = ['rt', 'hl', 'cr', 'civ'];
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
    if (p.ext) for (const k of STUB_EXT_DROP) delete p.ext[k];
    if (p.ext && p.ext.pop) { delete p.ext.pop.ties; delete p.ext.pop.drives; }
    for (const h of w.archiveHooks) h(p);
  }
  if (!fresh.length) return 0;
  const gone = new Set(fresh.map((p) => p.id));
  for (const p of w.living()) for (const k of p.relationships.keys()) { if (gone.has(k)) p.relationships.delete(k); else { const o = w.people.get(k); if (o && o._arch) p.relationships.delete(k); } }
  return fresh.length;
}
