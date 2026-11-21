// Text service STUB (W1-G owns the real engine; keep this API). world.text.render(eventOrKey, ctx) -> string.
//   - eventOrKey: an EventRecord (uses its type's template key), or a template key string.
//   - templates: string | string[] (random pick, seeded) | function(ctx, helpers) -> string. Grammar: '#rule#' expands rules, '{actor}' looks up ctx.names.
//   - packs supply grammars: world.text.addGrammar(pack.text); engines can replace everything with world.text.setEngine({render(world, key, ctx)}).
// Rendering never consumes sim RNG: choice is hashed from (event id | ctx.seed | key) so reading text cannot change the simulation.
import { hash32 } from './rng.js';
export class Text {
  constructor(world) { this.world = world; this.templates = new Map(); this.rules = new Map(); this.engine = null; }
  add(key, tpl) { this.templates.set(key, tpl); return this; }
  addGrammar(g) { if (!g) return this; for (const [k, v] of Object.entries(g.templates || {})) this.templates.set(k, v); for (const [k, v] of Object.entries(g.rules || {})) this.rules.set(k, v); return this; }
  setEngine(e) { this.engine = e; }
  has(key) { return this.templates.has(key); }
  render(eventOrKey, ctx = {}) {
    const ev = typeof eventOrKey === 'object' ? eventOrKey : null;
    const key = ev ? (this.world.events.registry.get(ev.type)?.template || ev.type) : eventOrKey;
    if (this.engine) return this.engine.render(this.world, ev || key, ctx);
    let t = this.templates.get(key);
    if (t === undefined) return ev ? `[${ev.type}]` : `[${key}]`;
    const seed = hash32(ev ? ev.id : ctx.seed ?? 0, key);
    const pickIdx = (n, salt) => hash32(seed, salt) % n;
    const names = { ...(ctx.names || {}) };
    if (ev) ev.actors.forEach((id, i) => { if (!names['actor' + i]) names['actor' + i] = this._name(id); }), names.actor = names.actor ?? names.actor0;
    if (typeof t === 'function') return t({ ...ctx, ev, names }, { pick: (arr, salt = 0) => arr[pickIdx(arr.length, salt)] });
    if (Array.isArray(t)) t = t[pickIdx(t.length, 1)];
    return this._expand(t, names, seed, 0);
  }
  _name(id) { const p = this.world.people.get(id); return p ? `${p.firstName} ${p.lastName}` : 'someone'; }
  _expand(s, names, seed, depth) {
    if (depth > 6) return s;
    s = s.replace(/#(\w+)#/g, (m, r) => { const v = this.rules.get(r); if (v === undefined) return m; const pick = Array.isArray(v) ? v[hash32(seed, r, depth) % v.length] : v; return this._expand(pick, names, seed, depth + 1); });
    return s.replace(/\{([\w.]+)\}/g, (m, k) => (names[k] !== undefined ? names[k] : m));
  }
}
