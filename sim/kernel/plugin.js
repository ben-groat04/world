// Plugin loader + contract test mode. A plugin is `export default {name, version, deps, init, clocks, on, affordances, query, commands, serialize, deserialize, migrate}`.
// loadPlugins(world, plugins, pack): topologically orders by deps, validates shape, registers clocks/handlers/commands/affordances, calls init(world, pack).
// A system never touches another system's state: world.sys.<name> exposes ONLY `.query` (a frozen object of read-only functions) and `.version`.
// In contract mode (world.contractMode = true) `world.sys` access to unknown systems throws and query results that are objects get deep-frozen.
import { CLOCKS } from './types.js';

export function validatePlugin(p, registry) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['plugin is not an object'];
  if (typeof p.name !== 'string' || !/^[a-z][\w-]*$/.test(p.name)) errs.push('name must be a lowercase identifier');
  if (typeof p.version !== 'string') errs.push('version (string) required');
  if (p.deps !== undefined && !Array.isArray(p.deps)) errs.push('deps must be an array');
  for (const k of Object.keys(p.clocks || {})) { if (!CLOCKS.includes(k)) errs.push(`unknown clock '${k}'`); else if (typeof p.clocks[k] !== 'function') errs.push(`clocks.${k} must be a function`); }
  for (const k of Object.keys(p.on || {})) { if (registry && !registry.has(k)) errs.push(`on.${k}: unregistered event type`); if (typeof p.on[k] !== 'function') errs.push(`on.${k} must be a function`); }
  for (const t of [...((p.events || {}).emits || []), ...((p.events || {}).listens || [])]) if (registry && !registry.has(t)) errs.push(`events lists unregistered type ${t}`);
  for (const k of ['affordances', 'init', 'serialize', 'deserialize', 'migrate']) if (p[k] !== undefined && typeof p[k] !== 'function') errs.push(`${k} must be a function`);
  if ((p.serialize === undefined) !== (p.deserialize === undefined)) errs.push('serialize and deserialize must come as a pair');
  for (const k of Object.keys(p.query || {})) if (typeof p.query[k] !== 'function') errs.push(`query.${k} must be a function`);
  for (const k of Object.keys(p.commands || {})) if (typeof p.commands[k] !== 'function') errs.push(`commands.${k} must be a function`);
  return errs;
}
export function isPlugin(sys) { return sys && (sys.version !== undefined || sys.clocks !== undefined || sys.on !== undefined || sys.query !== undefined || sys.serialize !== undefined); }
function order(plugins) {
  const by = new Map(plugins.map((p) => [p.name, p])), out = [], state = new Map();
  const visit = (p, stack) => {
    if (state.get(p.name) === 2) return;
    if (state.get(p.name) === 1) throw new Error('plugin dependency cycle: ' + [...stack, p.name].join(' -> '));
    state.set(p.name, 1);
    for (const d of p.deps || []) { const q = by.get(d); if (!q) throw new Error(`plugin '${p.name}' needs missing dep '${d}'`); visit(q, [...stack, p.name]); }
    state.set(p.name, 2); out.push(p);
  };
  for (const p of plugins) visit(p, []);
  return out;
}
// Read-only view (Proxy): writes throw. Used in contract mode so a system mutating another system's data through a query result fails the test.
export function readonly(o) {
  if (o === null || typeof o !== 'object') return o;
  return new Proxy(o, {
    get(t, k, r) { const v = Reflect.get(t, k, r); return typeof v === 'object' && v !== null ? readonly(v) : v; },
    set(t, k) { throw new Error(`contract violation: write to read-only query result (.${String(k)})`); },
    deleteProperty(t, k) { throw new Error(`contract violation: delete on read-only query result (.${String(k)})`); },
    defineProperty() { throw new Error('contract violation: defineProperty on read-only query result'); },
  });
}

export function loadPlugins(world, plugins, pack) {
  const sorted = order(plugins);
  for (const p of sorted) {
    const errs = validatePlugin(p, world.events.registry);
    if (errs.length) throw new Error(`plugin '${p && p.name}' violates the plugin contract:\n  - ${errs.join('\n  - ')}`);
    if (world.plugins.some((q) => q.name === p.name)) throw new Error(`plugin '${p.name}' already loaded`);
    world.plugins.push(p);
    const q = Object.freeze({ ...(p.query || {}) });
    world.sys[p.name] = Object.freeze({ name: p.name, version: p.version, query: world.contractMode ? wrapFrozen(q) : q });
    for (const [clock, fn] of Object.entries(p.clocks || {})) world.clocks[clock].push({ name: p.name, fn });
    for (const [type, fn] of Object.entries(p.on || {})) world.events.on(type, (ev, w) => fn(w, ev));
    for (const [name, fn] of Object.entries(p.commands || {})) world.commands.register(name, fn);
    if (p.affordances) world.afford.addProvider(p.name, p.affordances);
  }
  for (const p of sorted) if (p.init) p.init(world, pack);
  return sorted;
}
function wrapFrozen(q) { const o = {}; for (const k of Object.keys(q)) o[k] = (...a) => readonly(q[k](...a)); return Object.freeze(o); }
