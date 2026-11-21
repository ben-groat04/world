// Incremental arc sifter. consume(ev) per emitted event (cheap: O(#patterns matching ev.type)); arcs live in sifter.arcs (a.k.a. world.arcs).
// Event shape: {id,type,tick,actors,objects,place,tags,cause,salience,payload}. Pure over plain data, no kernel dependency.
// Pattern DSL (see patterns.js): {kind, scope:'pair'|'person'|'object'|'place', window:days, min:beats, stages:[{name,m:[matchers],repeat?,terminal?,outcome?,dir?:'reverse',guard?}], compose?}
// matcher: 'life.couple' | 'life.*' | 'tag:romance'.  An arc opens on a stage-0 match, advances monotonically through stages, and closes on a terminal stage or lapses after `window` days silent.
const DOMAIN = (t) => t.split('.')[0];
export class Sifter {
  /** @param {{ticksPerDay?:number, patterns:Array, quietBelow?:number, keepDepth?:number}} o */
  constructor(o) {
    this.tpd = o.ticksPerDay || 144; this.patterns = o.patterns; this.quietBelow = o.quietBelow ?? 1.2;
    this.arcs = []; this.open = new Map(); this.byCause = new Map(); this.depth = new Map(); this.nextId = 1; this.consumed = 0; this.lastSweep = 0; this.composed = new Set(); this.byActorIdx = new Map(); this.thenKinds = new Set(o.patterns.flatMap((p) => (p.compose || []).map((c) => c.then)));
    this.exact = new Map(); this.wild = new Map(); this.tagIdx = new Map();
    this.patterns.forEach((p, pi) => p.stages.forEach((s, si) => s.m.forEach((m) => {
      const [map, key] = m.startsWith('tag:') ? [this.tagIdx, m.slice(4)] : m.endsWith('.*') ? [this.wild, m.slice(0, -2)] : [this.exact, m];
      if (!map.has(key)) map.set(key, []); map.get(key).push([pi, si]);
    })));
  }
  _cands(ev) {
    const out = []; const a = this.exact.get(ev.type); if (a) out.push(...a);
    const w = this.wild.get(DOMAIN(ev.type)); if (w) out.push(...w);
    if (ev.tags) for (const t of ev.tags) { const x = this.tagIdx.get(t); if (x) out.push(...x); }
    return out;
  }
  _keys(p, ev) {
    const A = ev.actors || [];
    switch (p.scope) {
      case 'pair': return A.length >= 2 && A[0] !== A[1] ? [A[0] < A[1] ? `${A[0]}-${A[1]}` : `${A[1]}-${A[0]}`] : [];
      case 'person': return A.slice(0, p.allActors ? 3 : 1).map(String);
      case 'object': return ev.objects?.length ? [String(ev.objects[0])] : [];
      case 'place': return ev.place != null ? [String(ev.place)] : [];
      default: return [];
    }
  }
  consume(ev) {
    this.consumed++;
    const cd = ev.cause >= 0 && this.depth.has(ev.cause) ? this.depth.get(ev.cause) + 1 : 0; this.depth.set(ev.id, cd);
    const touched = new Set();
    const seen = new Set();
    for (const [pi, si] of this._cands(ev)) {
      const p = this.patterns[pi]; const st = p.stages[si]; if (seen.has(pi * 64 + si)) continue; seen.add(pi * 64 + si);
      for (const key of this._keys(p, ev)) {
        const ok = `${p.kind}|${key}`; let arc = this.open.get(ok);
        if (arc && ev.tick - arc.last > p.window * this.tpd) { this._close(arc, 'lapsed'); arc = null; }
        if (!arc) { if (si !== 0 || (st.guard && !st.guard(ev, null))) continue; arc = this._open(p, key, ev); this.open.set(ok, arc); }
        else {
          if (si < arc.stageIdx && !(p.stages[si].repeat && si > 0)) continue;
          if (si === 0 && arc.stageIdx === 0 && !st.repeat && arc.beats.length) { if (!st.reopen) continue; }
          if (st.dir === 'reverse' && ev.actors[0] !== arc.actors[1]) continue;
          if (st.guard && !st.guard(ev, arc)) continue;
          if (arc.beats.some((b) => b.eid === ev.id)) continue;
        }
        this._beat(arc, ev, st, si, cd); touched.add(arc);
        if (st.terminal) this._close(arc, st.outcome || 'resolved');
      }
    }
    // causal attach: events caused by an arc's events join it as consequences (cross-system reach)
    if (ev.cause >= 0 && this.byCause.has(ev.cause)) {
      for (const arc of this.byCause.get(ev.cause)) if (arc.status === 'open' && !touched.has(arc) && arc.beats.length < 40) { this._beat(arc, ev, { name: 'consequence' }, arc.stageIdx, cd); touched.add(arc); }
    }
    for (const arc of touched) { this._score(arc); if (arc.confirmed && this.thenKinds.has(arc.kind)) this._compose(arc); }
    if (ev.tick - this.lastSweep > 7 * this.tpd) this.sweep(ev.tick);
  }
  _open(p, key, ev) {
    const arc = { id: this.nextId++, kind: p.kind, scope: p.scope, key, actors: ev.actors.slice(0, 3), status: 'open', outcome: null, stage: p.stages[0].name, stageIdx: 0, start: ev.tick, last: ev.tick, beats: [], systems: new Set(), maxDepth: 0, sum: 0, score: 0, quiet: true, confirmed: false, sig: '', pat: p };
    return arc;
  }
  _register(arc) { this.arcs.push(arc); for (const a of arc.actors) { let l = this.byActorIdx.get(a); if (!l) this.byActorIdx.set(a, l = []); l.push(arc); } }
  _beat(arc, ev, st, si, depth) {
    arc.beats.push({ eid: ev.id, tick: ev.tick, type: ev.type, stage: st.name, sal: ev.salience ?? 0.3, depth });
    arc.sum += ev.salience ?? 0.3; arc.last = ev.tick; if (si > arc.stageIdx) { arc.stageIdx = si; arc.stage = st.name; }
    arc.systems.add(DOMAIN(ev.type)); if (depth > arc.maxDepth) arc.maxDepth = depth;
    for (const a of ev.actors || []) if (!arc.actors.includes(a) && arc.actors.length < 4) arc.actors.push(a);
    let l = this.byCause.get(ev.id); if (!l) this.byCause.set(ev.id, l = []); l.push(arc);
  }
  _score(arc) {
    arc.score = arc.sum + 0.4 * arc.maxDepth + 0.6 * (arc.systems.size - 1) + (arc.status === 'resolved' ? 0.5 : 0) + (arc.bonus || 0);
    const was = arc.confirmed; arc.confirmed = arc.beats.length >= (arc.pat.min || 2); if (arc.confirmed && !was && !arc.registered) { arc.registered = true; this._register(arc); }
    arc.quiet = arc.score < this.quietBelow;
  }
  /** kind:stage>stage=outcome, computed on demand (stable arc signature for variety metrics). */
  signature(arc) {
    if (arc.parts) return arc.sig;
    const path = []; for (const b of arc.beats) if (path[path.length - 1] !== b.stage) path.push(b.stage);
    return `${arc.kind}:${path.join('>')}${arc.outcome ? '=' + arc.outcome : ''}`;
  }
  _close(arc, outcome) {
    if (arc.status !== 'open') return;
    arc.status = outcome === 'lapsed' ? 'lapsed' : 'resolved'; arc.outcome = outcome; this.open.delete(`${arc.kind}|${arc.key}`);
    this._score(arc); if (arc.confirmed && this.thenKinds.has(arc.kind)) this._compose(arc);
  }
  /** Two-arc compositions: pattern.compose = [{kind:'redemption', after:'fall', within:days}] fires when this arc (kind second) is confirmed and a finished `after` arc exists on a shared actor. */
  _compose(arc) {
    for (const p of this.patterns) for (const c of p.compose || []) {
      if (c.then !== arc.kind) continue; const actor = arc.actors[0];
      const id = `${c.kind}|${arc.id}`; if (this.composed.has(id)) continue;
      for (const o of this.byActorIdx.get(actor) || []) {
        if (o === arc || o.kind !== c.after || !o.confirmed || !o.actors.includes(actor)) continue;
        if (c.needClosed !== false && o.status === 'open') continue;
        if (arc.start < o.last || arc.start - o.last > c.within * this.tpd) continue;
        this.composed.add(id);
        const m = { kind: c.kind, scope: 'person', key: String(actor), actors: [actor], status: arc.status === 'open' ? 'open' : 'resolved', outcome: c.outcome || null, stage: 'composite', stageIdx: 0, start: o.start, last: arc.last, beats: [...o.beats, ...arc.beats].sort((x, y) => x.tick - y.tick), systems: new Set([...o.systems, ...arc.systems]), maxDepth: Math.max(o.maxDepth, arc.maxDepth), sum: 0, score: 0, quiet: true, confirmed: false, sig: '', pat: { min: 1 }, parts: [o.id, arc.id] };
        m.registered = true; this._register(m); this._score(m); m.sig = `${c.kind}:${o.kind}>${arc.kind}`; m.sum = [...o.beats, ...arc.beats].reduce((x, b) => x + b.sal, 0); m.bonus = 0.8; this._score(m); break;
      }
    }
  }
  sweep(tick) {
    this.lastSweep = tick;
    for (const arc of [...this.open.values()]) if (tick - arc.last > arc.pat.window * this.tpd) this._close(arc, 'lapsed');
    if (this.depth.size > 20000) { let n = 0; for (const k of this.depth.keys()) { this.depth.delete(k); this.byCause.delete(k); if (++n > 10000) break; } }
  }
  ranked(n = 10, { minScore = 0, includeQuiet = false, kind } = {}) {
    return this.arcs.filter((a) => a.confirmed && (includeQuiet || !a.quiet) && a.score >= minScore && (!kind || a.kind === kind)).sort((a, b) => b.score - a.score).slice(0, n);
  }
  byActor(id) { return (this.byActorIdx.get(id) || []).filter((a) => a.confirmed); }
  /** Plain summary with causal-chain stats. */
  summarise(arc, names = (id) => `#${id}`) {
    const stages = []; for (const b of arc.beats) if (stages[stages.length - 1]?.stage !== b.stage) stages.push({ stage: b.stage, n: 1, tick: b.tick }); else stages[stages.length - 1].n++;
    return `${arc.kind} [${arc.status}${arc.outcome ? ':' + arc.outcome : ''}] ${arc.actors.map(names).join(' & ')}: ${stages.map((s) => s.stage + (s.n > 1 ? 'x' + s.n : '')).join(' > ')} over ${Math.round((arc.last - arc.start) / this.tpd)}d, ${arc.beats.length} beats, ${arc.systems.size} systems, depth ${arc.maxDepth}${arc.quiet ? ' (quiet)' : ''}`;
  }
  stats() {
    const c = this.arcs.filter((a) => a.confirmed); const byKind = {}; for (const a of c) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
    return { events: this.consumed, arcs: c.length, open: this.open.size, byKind, quiet: c.filter((a) => a.quiet).length };
  }
  serialize() { return { v: 1, nextId: this.nextId, arcs: this.arcs.map((a) => ({ ...a, systems: [...a.systems], pat: undefined, patKind: a.kind })) }; }
}
