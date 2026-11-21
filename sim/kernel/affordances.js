// Affordance registry + declarative effect resolver STUB. Plugins expose `affordances(person, ctx) -> Affordance[]` (pure, read-only);
// the Goals/planner package scores them. world.afford.for(person, ctx) gathers from all plugins; world.afford.apply(aff) resolves effects:
// effects are DATA: {kind:'emit'|'transfer'|'cmd'|'rel'|'belief'|'set'}; cross-system writes go through commands owned by the target system.
export class Affordances {
  constructor(world) { this.world = world; this.providers = []; this.verbs = new Map(); }
  addProvider(name, fn) { this.providers.push({ name, fn }); }
  registerVerb(verb, def = {}) { this.verbs.set(verb, def); }
  for(person, ctx = {}) {
    const out = [];
    for (const p of this.providers) { const l = p.fn(person, ctx); if (l) for (const a of l) { if (a.preconds && !a.preconds.every((f) => f(this.world, a))) continue; out.push(a); } }
    return out;
  }
  /** Apply an affordance's effects in the 'full' resolver mode (or its own resolver.full if present). Returns the id of the first emitted event. */
  apply(aff, cause = 0) {
    const w = this.world; if (aff.resolver && aff.resolver.full) return aff.resolver.full(w, aff);
    let first = 0;
    for (const e of aff.effects || []) {
      switch (e.kind) {
        case 'emit': { const id = w.emit(e.type, { ...e.input, cause: e.input.cause || cause }); first = first || id; if (!cause) cause = id; break; }
        case 'transfer': w.ledger.transfer(e.from, e.to, e.amount, e.reason, cause); break;
        case 'cmd': w.cmd(e.name, e.args); break;
        case 'set': w.cmd(e.system + '.apply', e.args); break;
        case 'rel': { const r = w.getRel(e.a, e.b); for (const k of Object.keys(e.delta)) r[k] = (r[k] || 0) + e.delta[k]; break; }
        case 'belief': w.cmd('belief.write', { actor: e.actor, belief: e.belief }); break;
        default: throw new Error('unknown effect kind ' + e.kind);
      }
    }
    return first;
  }
}
