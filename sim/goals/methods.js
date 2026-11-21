// Method resolution: method id -> [{move, v, role, n}] (explicit METHODS, then METHOD_RULES, then VERB_DEFAULT). Steps are parsed once and cached.
import { MOVE } from './moves.js';
const RE = /^([a-z_]+)(?:\.([\w]+))?(?:@([a-z_]+))?(?:\*(\d+))?$/;
export function parseStep(s) {
  const m = RE.exec(s); if (!m) throw new Error('bad step ' + s);
  if (!MOVE[m[1]]) throw new Error('unknown move ' + m[1] + ' in ' + s);
  return { move: m[1], v: m[2] || '', role: m[3] || null, n: m[4] ? +m[4] : 1 };
}
export class Methods {
  constructor(lib) { this.lib = lib; this.cache = new Map(); this.defaults = 0; }
  raw(id, verb) {
    const L = this.lib;
    if (L.METHODS[id]) return L.METHODS[id];
    for (const [re, st] of L.METHOD_RULES) if (re.test(id)) return st;
    this.defaults++; return L.VERB_DEFAULT[verb] || L.VERB_DEFAULT.default;
  }
  /** Expanded step list (repeats unrolled), each {move,v,role}. */
  steps(id, verb) {
    const k = id + '|' + verb; let r = this.cache.get(k); if (r) return r;
    r = []; for (const s of this.raw(id, verb)) { const p = parseStep(s); for (let i = 0; i < p.n; i++) r.push({ move: p.move, v: p.v, role: p.role }); }
    this.cache.set(k, r); return r;
  }
  validateAll(templates) { const bad = []; for (const t of templates) for (const m of t.by) try { this.steps(m, t.verb); } catch (e) { bad.push(t.id + ':' + m + ' ' + e.message); } return bad; }
}
