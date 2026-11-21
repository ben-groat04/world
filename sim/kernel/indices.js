// Maintained indices (never scan world.living() in hot paths). All reads are O(1) / return live collections: DO NOT MUTATE them.
//   world.index.byVenue(buildingId)     -> Set<Person> currently inside/at that venue (engine-maintained: building.occupants)
//   world.index.byHousehold(homeId)     -> number[] resident ids (legacy: house residents; W1-C swaps in households)
//   world.index.byEmployer(buildingId)  -> number[] employee ids          world.index.byOrg(orgId) -> Set<Person> (orgs register members)
//   world.index.byTier(tier)            -> Set<Person>                    world.index.byStage(stage) -> Set<Person>   (stages below)
//   world.index.needsAttention()        -> Person[] people whose wake/interrupt is due this tick (scheduler fills it while processing)
//   world.index.count / world.index.counts() : O(1) aggregates (living, by stage, by sex)
import { TIER } from './types.js';
export const STAGES = ['infant', 'child', 'teen', 'adult', 'senior']; // <2, <12, <18, <65, 65+
const STAGE_YEARS = [2, 12, 18, 65];
export function stageOf(age) { return age < 2 ? 0 : age < 12 ? 1 : age < 18 ? 2 : age < 65 ? 3 : 4; }
export class Indices {
  constructor(world) {
    this.world = world; this.count = 0;
    this.tier = [new Set(), new Set(), new Set(), new Set()];
    this.stage = STAGES.map(() => new Set()); this._stageOf = new Map();
    this.org = new Map(); this._attention = []; this.sex = { M: 0, F: 0 };
  }
  byVenue(id) { const b = this.world.buildings.get(id); return b ? b.occupants : EMPTY_SET; }
  byHousehold(id) { const b = this.world.buildings.get(id); return b ? b.residents : EMPTY_ARR; }
  byEmployer(id) { const b = this.world.buildings.get(id); return b ? b.employees : EMPTY_ARR; }
  byOrg(id) { return this.org.get(id) || EMPTY_SET; }
  orgJoin(orgId, p) { let s = this.org.get(orgId); if (!s) this.org.set(orgId, (s = new Set())); s.add(p); }
  orgLeave(orgId, p) { const s = this.org.get(orgId); if (s) s.delete(p); }
  byTier(t) { return this.tier[t]; }
  byStage(s) { return this.stage[typeof s === 'string' ? STAGES.indexOf(s) : s]; }
  needsAttention() { return this._attention; }
  counts() { return { living: this.count, stages: this.stage.map((s) => s.size), tiers: this.tier.map((s) => s.size), M: this.sex.M, F: this.sex.F }; }
  // --- maintenance (called by World) ---
  _add(p) {
    if (this._stageOf.has(p.id)) return;
    this.count++; this.sex[p.sex === 'F' ? 'F' : 'M']++;
    const t = p.tier === undefined ? TIER.T1 : p.tier; this.tier[t].add(p);
    const s = stageOf(this.world.ageOf(p)); this._stageOf.set(p.id, s); this.stage[s].add(p);
  }
  _remove(p) {
    const s = this._stageOf.get(p.id); if (s === undefined) return;
    this._stageOf.delete(p.id); this.stage[s].delete(p); this.count--; this.sex[p.sex === 'F' ? 'F' : 'M']--;
    this.tier[p.tier === undefined ? TIER.T1 : p.tier].delete(p);
  }
  _tierMove(p, from, to) { if (this._stageOf.has(p.id)) { this.tier[from].delete(p); this.tier[to].add(p); } }
  /** Daily: move people whose age crossed a stage boundary (emits kernel.stage). Cheap: one pass over live people once a day. */
  _dailyStages() {
    const w = this.world;
    for (const p of w.living()) {
      const s = stageOf(w.ageOf(p)), o = this._stageOf.get(p.id);
      if (o !== undefined && s !== o) { this.stage[o].delete(p); this.stage[s].add(p); this._stageOf.set(p.id, s); w.emit('kernel.stage', { actors: [p.id], payload: { stage: STAGES[s] } }); }
    }
  }
}
const EMPTY_SET = new Set(), EMPTY_ARR = [];
