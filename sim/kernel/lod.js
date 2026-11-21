// Level-of-detail / fidelity tiers STUB (Wave 2 fills it). T0 observed/featured, T1 full agenda sim (default), T2 statistical, T3 off-map.
// API: world.lod.tierOf(p), world.lod.setTier(p, tier, reason), world.lod.observe(personId|null) (observers promote to T0),
// world.lod.onChange(fn(person, newTier, oldTier)). Tier storage is p.tier (declared lazily here; person factory should declare it).
import { TIER } from './types.js';
export class Lod {
  constructor(world) { this.world = world; this.observed = new Set(); this.listeners = []; this.counts = [0, 0, 0, 0]; }
  tierOf(p) { return p.tier === undefined ? TIER.T1 : p.tier; }
  setTier(p, tier) {
    const old = this.tierOf(p); if (old === tier) return false;
    p.tier = tier; this.counts[old]--; this.counts[tier]++;
    this.world.index._tierMove(p, old, tier);
    for (const f of this.listeners) f(p, tier, old);
    return true;
  }
  observe(id) { if (id === null || id === undefined) { for (const i of [...this.observed]) this.unobserve(i); return; } this.observed.add(id); const p = this.world.people.get(id); if (p) this.setTier(p, TIER.T0); }
  unobserve(id) { this.observed.delete(id); const p = this.world.people.get(id); if (p && this.tierOf(p) === TIER.T0) this.setTier(p, TIER.T1); }
  onChange(fn) { this.listeners.push(fn); }
}
