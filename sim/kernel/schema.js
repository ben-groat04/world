// Content-pack schema + validator. A pack (content/<id>/index.js default export) is DATA validated here; the sim reads only pack data for anything
// setting-specific. Tiny schema DSL so packages can extend sections:  t.obj({a: t.num({min:0})}, {open:true})  t.arr(item)  t.rec(valueSchema) (string->value map)
// Required top level: id, version, contractVersion (major must match CONTRACT_VERSION), calibration. Everything else is an OPTIONAL section so partial
// packs validate; the section schemas below are deliberately loose (shape, not content) and tighten as packages land. Unknown top-level keys are warnings.
//   validatePack(pack) -> {ok, errors:[string], warnings:[string]}      assertPack(pack) throws on errors
import { CONTRACT_VERSION } from './types.js';
const ok = null;
const mk = (check) => (v, path, ctx) => check(v, path, ctx);
const fail = (path, msg) => `${path || '<root>'}: ${msg}`;
export const t = {
  any: mk(() => ok),
  num: (o = {}) => mk((v, p) => (typeof v !== 'number' || !Number.isFinite(v) ? fail(p, 'expected finite number') : o.min !== undefined && v < o.min ? fail(p, `< ${o.min}`) : o.max !== undefined && v > o.max ? fail(p, `> ${o.max}`) : o.int && !Number.isInteger(v) ? fail(p, 'expected integer') : ok)),
  str: (o = {}) => mk((v, p) => (typeof v !== 'string' ? fail(p, 'expected string') : o.nonEmpty && !v ? fail(p, 'empty string') : o.re && !o.re.test(v) ? fail(p, `does not match ${o.re}`) : ok)),
  bool: () => mk((v, p) => (typeof v !== 'boolean' ? fail(p, 'expected boolean') : ok)),
  fn: () => mk((v, p) => (typeof v !== 'function' ? fail(p, 'expected function') : ok)),
  oneOf: (...vals) => mk((v, p) => (vals.includes(v) ? ok : fail(p, `expected one of ${vals.join('|')}`))),
  opt: (s) => mk((v, p, c) => (v === undefined ? ok : s(v, p, c))),
  arr: (item, o = {}) => mk((v, p, c) => { if (!Array.isArray(v)) return fail(p, 'expected array'); if (o.min !== undefined && v.length < o.min) return fail(p, `fewer than ${o.min} items`); for (let i = 0; i < v.length; i++) { const e = item(v[i], `${p}[${i}]`, c); if (e) return e; } return ok; }),
  rec: (val) => mk((v, p, c) => { if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(p, 'expected object map'); for (const k of Object.keys(v)) { const e = val(v[k], `${p}.${k}`, c); if (e) return e; } return ok; }),
  obj: (shape, o = {}) => mk((v, p, c) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(p, 'expected object');
    for (const k of Object.keys(shape)) { const e = shape[k](v[k], p ? `${p}.${k}` : k, c); if (e) return e; }
    if (!o.open) for (const k of Object.keys(v)) if (!(k in shape)) return fail(`${p}.${k}`, 'unknown key');
    return ok;
  }),
  required: (s) => mk((v, p, c) => (v === undefined ? fail(p, 'required') : s(v, p, c))),
};
const R = t.required, O = t.opt;
// weights: [{id, weight}] style or {id: weight}; both accepted for names/drives
const weightMap = t.rec(t.num({ min: 0 }));
/** Top-level section schemas (each section validated independently so errors are located). Packages may add via registerSection(). */
export const SECTIONS = {
  calibration: t.obj({}, { open: true }),
  names: t.obj({}, { open: true }),                                   // origin-conditioned name tables (W1-A defines inner shape)
  jobs: t.any,                                                       // array or map of occupation defs; items need an `id` or are keyed
  buildings: t.any,                                                  // building archetypes
  venues: O(t.any), unitTypes: O(t.any), drives: O(t.any), goalTemplates: O(t.any),
  text: O(t.obj({ templates: O(t.rec(t.any)), rules: O(t.rec(t.any)) }, { open: true })),
  calendar: O(t.obj({}, { open: true })),
  settings: O(t.obj({}, { open: true })), meta: O(t.obj({}, { open: true })),
};
export function registerSection(name, schema) { SECTIONS[name] = schema; }
const idOf = (x) => (x && typeof x === 'object' ? x.id : undefined);
function checkIds(name, section, errors) {
  if (Array.isArray(section)) { const seen = new Set(); section.forEach((x, i) => { const id = idOf(x); if (id === undefined) errors.push(`${name}[${i}]: missing id`); else if (seen.has(id)) errors.push(`${name}[${i}]: duplicate id '${id}'`); else seen.add(id); }); }
}
export function validatePack(pack) {
  const errors = [], warnings = [];
  if (!pack || typeof pack !== 'object') return { ok: false, errors: ['pack must be an object'], warnings };
  for (const e of [R(t.str({ nonEmpty: true, re: /^[a-z][\w-]*$/ }))(pack.id, 'id'), R(t.str({ re: /^\d+\.\d+\.\d+$/ }))(pack.version, 'version'), R(t.str({ re: /^\d+\.\d+\.\d+$/ }))(pack.contractVersion, 'contractVersion')]) if (e) errors.push(e);
  if (typeof pack.contractVersion === 'string' && pack.contractVersion.split('.')[0] !== CONTRACT_VERSION.split('.')[0]) errors.push(`contractVersion ${pack.contractVersion} incompatible with kernel ${CONTRACT_VERSION}`);
  for (const k of Object.keys(SECTIONS)) { const req = !(SECTIONS[k].length === 3 && false); const v = pack[k]; if (v === undefined && ['calibration', 'names', 'jobs', 'buildings'].includes(k)) { errors.push(`${k}: required section missing`); continue; } if (v === undefined) continue; const e = SECTIONS[k](v, k); if (e) errors.push(e); else checkIds(k, v, errors); }
  for (const k of Object.keys(pack)) if (!(k in SECTIONS) && !['id', 'version', 'contractVersion'].includes(k)) warnings.push(`unknown top-level key '${k}' (register a section schema or keep it under meta)`);
  return { ok: errors.length === 0, errors, warnings };
}
export function assertPack(pack) { const r = validatePack(pack); if (!r.ok) throw new Error('invalid content pack:\n  - ' + r.errors.join('\n  - ')); return r; }
