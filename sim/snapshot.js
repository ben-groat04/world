// World snapshots: save/load the full mutable state as JSON (object-graph serializer that preserves shared references,
// Maps, Sets, typed arrays and RNG state). Load = build a fresh World with the same seed/settings (static map, systems,
// handlers) and restore state INTO it (in place, so closures that captured system state objects stay valid).
//   const snap = saveSnapshot(world)            // plain JSON-able object
//   const world = loadSnapshot(snap, opts)      // opts.systems optional (same default as World)
// What is state: world.stateKeys (system namespaces + core records), people, buildings, rng streams, tick.
// Derived data (spatial grid, path cache, living cache, building-by-type lists) is rebuilt on load.
import { RNG } from './rng.js';
import { World } from './world.js';

const TYPED = { Int32Array, Float32Array, Float64Array, Uint8Array, Uint32Array, Int16Array, Uint16Array };

export function saveSnapshot(world) {
  const ids = new Map(), table = [];
  const enc = (v) => {
    const t = typeof v;
    if (v === null || t === 'boolean' || t === 'string') return v;
    if (t === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (t === 'undefined' || t === 'function' || t === 'symbol') return undefined;
    if (v === world) return { $w: 1 };
    let id = ids.get(v);
    if (id !== undefined) return { $r: id };
    id = table.length; ids.set(v, id); table.push(null);
    let e;
    if (Array.isArray(v)) e = ['a', v.map((x) => { const r = enc(x); return r === undefined ? null : r; })];
    else if (v instanceof Map) e = ['m', [...v].map(([k, x]) => [enc(k), enc(x)])];
    else if (v instanceof Set) e = ['s', [...v].map(enc)];
    else if (v instanceof RNG) e = ['rng', { s: v.s, seed0: v.seed0, g: v._g }];
    else if (ArrayBuffer.isView(v)) e = ['t', v.constructor.name, Array.from(v)];
    else {
      const o = {};
      for (const k of Object.keys(v)) { if (k === '_d') { o.$def = v.id; continue; } const r = enc(v[k]); if (r !== undefined) o[k] = r; }
      e = ['o', o];
    }
    table[id] = e;
    return { $r: id };
  };
  const roots = {};
  for (const k of ['people', 'buildings', 'chronicle', ...world.stateKeys]) if (world[k] !== undefined) roots[k] = enc(world[k]);
  const rngs = {}; for (const [name, r] of world._rngs) rngs[name] = { s: r.s, g: r._g };
  return {
    v: 1, seed: world.seed, settings: world.settings, tick: world.tick, nextPersonId: world.nextPersonId,
    rng: { s: world.rng.s, g: world.rng._g }, rngs, roots, table,
  };
}

export function loadSnapshot(snap, opts = {}) {
  const w = new World({ seed: snap.seed, population: snap.settings.population, settings: snap.settings, systems: opts.systems });
  const table = snap.table, objs = new Array(table.length);
  // pass 1: containers
  for (let i = 0; i < table.length; i++) {
    const [k, d, d2] = table[i];
    objs[i] = k === 'a' ? [] : k === 'm' ? new Map() : k === 's' ? new Set() : k === 'rng' ? Object.assign(new RNG(d.seed0), { s: d.s, _g: d.g }) : k === 't' ? new TYPED[d](d2) : {};
  }
  // reuse the fresh world's objects for the roots (identity kept for captured references) and for static buildings
  const clear = (o) => {
    if (Array.isArray(o)) o.length = 0;
    else if (o instanceof Map || o instanceof Set) o.clear();
    else for (const k of Object.keys(o)) if (typeof o[k] !== 'function' && k !== 'world') delete o[k];
    return o;
  };
  const reuse = (ref, target) => { if (ref && ref.$r !== undefined && target && typeof target === 'object') objs[ref.$r] = clear(target); };
  for (const k of Object.keys(snap.roots)) if (k !== 'people' && k !== 'buildings') reuse(snap.roots[k], w[k]);
  reuse(snap.roots.people, w.people);
  const bm = table[snap.roots.buildings.$r][1];
  objs[snap.roots.buildings.$r] = w.buildings; w.buildings.clear();
  const freshB = new Map(); for (const b of w.map.buildings) freshB.set(b.id, b);
  for (const [k, ref] of bm) { const fb = freshB.get(k); if (fb) objs[ref.$r] = clear(fb); }
  const dec = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (v.$r !== undefined) return objs[v.$r];
    if (v.$w) return w;
    if (v.$n) return Number(v.$n);
    return v;
  };
  // pass 2: fill
  for (let i = 0; i < table.length; i++) {
    const [k, d] = table[i], o = objs[i];
    if (k === 'a') for (const x of d) o.push(dec(x));
    else if (k === 'm') for (const [a, b] of d) o.set(dec(a), dec(b));
    else if (k === 's') for (const x of d) o.add(dec(x));
    else if (k === 'o') { for (const key of Object.keys(d)) { if (key === '$def') { o._d = w.actions.get(d.$def); continue; } o[key] = dec(d[key]); } }
  }
  // roots that were not reusable (absent in the fresh world)
  for (const k of Object.keys(snap.roots)) if (k !== 'people' && k !== 'buildings') w[k] = dec(snap.roots[k]);
  w.people = objs[snap.roots.people.$r]; w.buildings = objs[snap.roots.buildings.$r];
  // scalars + rng streams
  w.tick = snap.tick; w.nextPersonId = snap.nextPersonId; w._setTime();
  w.rng.s = snap.rng.s; w.rng._g = snap.rng.g;
  for (const [name, r] of Object.entries(snap.rngs)) { const x = w.rngFor(name); x.s = r.s; x._g = r.g; }
  // rebuild derived indexes
  w._byType = {}; for (const b of w.buildings.values()) { (w._byType[b.type] || (w._byType[b.type] = [])).push(b); }
  for (const g of w.grid) g.clear();
  for (const p of w.people.values()) { p.cell = -1; if (p.alive && !p.inside && p.locationId == null || (p.alive && p.locationId != null && w.buildings.get(p.locationId)?.open && !p.inside)) w._gridAdd(p); }
  w._livingDirty = true;
  w.path.cache?.clear?.();
  w.brain._openTick = -1;
  return w;
}

// Cheap order-insensitive-ish fingerprint of the simulation state (for determinism checks).
export function stateHash(w) {
  let h = 2166136261 >>> 0;
  const mix = (n) => { h ^= (n | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  const mixf = (x) => mix(Math.round((x || 0) * 1000));
  mix(w.tick); mix(w.rng.s); mix(w.nextPersonId); mix(w.chronicle.entries.length); mix(w.stats.births); mix(w.stats.deaths);
  const ids = [...w.people.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const p = w.people.get(id);
    mix(id); mix(p.alive ? 1 : 0); mix(p.x); mix(p.y); mixf(p.money); mixf(p.health); mixf(p.mood); mixf(p.reputation);
    mixf(p.needs.hunger); mixf(p.needs.energy); mixf(p.needs.social); mix(p.relationships.size); mix(p.memories.length); mix(p.homeId ?? -1); mix(p.workId ?? -1);
  }
  for (const b of w.buildings.values()) { mixf(b.funds); mix(b.employees.length); mix(b.residents.length); }
  return h.toString(16).padStart(8, '0');
}
