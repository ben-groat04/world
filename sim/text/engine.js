// Larkfield text engine: weighted, conditional grammar expansion. Deterministic per (seed, key, event id); never touches sim RNG.
// Grammar: { rules: { name: Alt | Alt[] } }, Alt = "template" | { t, w=1, when:{feature:cond} }.
// Template syntax:  #rule#  #rule|cap|a#   {a.first} {a.They} {a.their} {a.v:go} {a.v:was}  {p.amount|gbp}  {when|time}  {place}
//                   [x:#rule#] (silent var set)  {$x} (var use)  {$x|cap}.   Roles: s,o,c = event actors[0..2]; a = author/viewer (ctx.a, default s); b = ctx.b (default o); x = ctx.other.
// cond: value | [any-of] | '<0.3' '>=60' '!teen'. Features: voice mood moodband age ageband seg rel reg genre type tags tag.* a.voice b.voice
//       a.trait.<name>, plus any ctx.features. Anti-repetition: recently used alternatives are down-weighted (ctx.memory=false to disable);
//       per-person idiolect gives each author stable favourite phrasings (ctx.idiolect=false to disable).
import { hash32 } from '../kernel/rng.js';
import { RNG } from '../rng.js';
import { pronounsOf, voiceOf, moodBand, titleOf, nameOf, ageBand } from './people.js';
import { MODS, tidy, timePhrase, datePhrase, daypart, DAYS, cap } from './mods.js';

const PH = '\u0001';
function evalCond(val, c) {
  if (Array.isArray(c)) return c.some((x) => evalCond(val, x));
  if (typeof c === 'string') {
    const m = /^(<=|>=|<|>|!)(.*)$/.exec(c);
    if (m) {
      const [, op, rhs] = m;
      if (op === '!') return Array.isArray(val) ? !val.includes(rhs) : String(val) !== rhs;
      if (val == null) return false;
      const x = +val, y = +rhs;
      return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
    }
    return Array.isArray(val) ? val.includes(c) : String(val) === c;
  }
  return val === c;
}
const V_IRREG = { be: ['is', 'are'], was: ['was', 'were'], have: ['has', 'have'], do: ['does', 'do'], had: ['had', 'had'], doesnt: ["doesn't", "don't"], isnt: ["isn't", "aren't"], wasnt: ["wasn't", "weren't"], hasnt: ["hasn't", "haven't"], cant: ["can't", "can't"], will: ['will', 'will'], would: ['would', 'would'] };
function conj(v, plural) {
  if (V_IRREG[v]) return V_IRREG[v][plural ? 1 : 0];
  if (plural) return v;
  if (/(s|x|z|ch|sh|o)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  return v + 's';
}

export class TextEngine {
  constructor(grammar = {}, opts = {}) {
    this.rules = new Map(); this.counter = 0; this.last = new Map(); this.recent = []; this.recentN = opts.recentN || 60;
    this.memoryWindow = opts.memoryWindow || 40; this.stats = { renders: 0, missing: new Map(), retries: 0 }; this.worldSeed = opts.seed || 0;
    this.sentiment = grammar.sentiment || {}; this.add(grammar);
  }
  add(g) { for (const [k, v] of Object.entries(g?.rules || (g?.sentiment ? {} : g) || {})) { const arr = Array.isArray(v) ? v : [v]; this.rules.set(k, (this.rules.get(k) || []).concat(arr.map((a) => (typeof a === 'string' ? { t: a } : a)))); } return this; }
  has(k) { return this.rules.has(k); }

  // ---- context resolution
  _person(ref, ctx, world) {
    if (ref == null) return null;
    if (typeof ref === 'object') return ref;
    const P = ctx.people || world?.people;
    try { return typeof P === 'function' ? P(ref) : P?.get ? P.get(ref) : P?.byId?.get ? P.byId.get(ref) : P?.[ref] ?? null; } catch { return null; }
  }
  _state(evOrKey, ctx, world, salt) {
    const ev = evOrKey && typeof evOrKey === 'object' ? evOrKey : null;
    const ids = ctx.actors || ev?.actors || [];
    const roles = { s: this._person(ids[0], ctx, world), o: this._person(ids[1], ctx, world), c: this._person(ids[2], ctx, world), x: this._person(ctx.other, ctx, world) };
    roles.a = this._person(ctx.a, ctx, world) ?? roles.s; roles.b = this._person(ctx.b, ctx, world) ?? roles.o;
    const p = { ...(ev?.payload || {}), ...(ctx.p || {}) };
    let place = ctx.placeName ?? p.placeName ?? ctx.place;
    if (place == null && ev?.place != null) { try { place = world?.venueName?.(ev.place) ?? world?.venues?.get?.(ev.place)?.name; } catch { /* none */ } }
    let when = ctx.date; if (!when && ev && world?.calendar?.date) { try { when = world.calendar.date(ev.tick); } catch { /* none */ } }
    const A = roles.a, B = roles.b;
    const f = { genre: ctx.genre || 'ev', type: ev?.type, reg: ctx.register || 'plain', rel: ctx.rel, mood: ctx.mood ?? A?.mood ?? 0.5, age: A?.age, seg: A?.segment, tags: ev?.tags || ctx.tags || [], salience: ev?.salience, ...(ctx.features || {}) };
    f.voice = ctx.voice || voiceOf(A); f.moodband = moodBand(f.mood); f.ageband = ageBand(A?.age); f['a.voice'] = f.voice; f['b.voice'] = voiceOf(B); f['b.age'] = B?.age;
    f['a.they'] = pronounsOf(A).they; f['b.they'] = pronounsOf(B).they; f.sex = A?.sex; f.self = roles.a && roles.a === roles.s ? 'yes' : 'no'; f['s.voice'] = voiceOf(roles.s); f.place = place != null ? 'yes' : 'no';
    for (const r of ['a', 'b']) for (const [k, v] of Object.entries(roles[r]?.traits || {})) f[`${r}.trait.${k}`] = v;
    if (when) { f.hour = when.hour; f.weekend = when.weekday >= 5 ? 'yes' : 'no'; }
    if (ev && f['p.sentiment'] === undefined && !p.sentiment) f['p.sentiment'] = this.sentiment[ev.type] || 'neutral';
    for (const [k, v] of Object.entries(p)) if (f['p.' + k] === undefined && (typeof v !== 'object')) f['p.' + k] = v;
    return { ev, ctx, roles, p, place, when, f, vars: {}, rng: new RNG(hash32(ctx.seed ?? 0, this.worldSeed, ev ? ev.id ?? 0 : 0, typeof evOrKey === 'string' ? evOrKey : ev.type, A?.id ?? 0, salt)), author: A, world };
  }

  // ---- expansion
  _pick(name, st, depth) {
    const alts = this.rules.get(name);
    if (!alts) { this.stats.missing.set(name, (this.stats.missing.get(name) || 0) + 1); return null; }
    const ok = [], ws = []; const mem = st.ctx.memory !== false, idio = st.ctx.idiolect !== false && st.author?.id != null;
    for (let i = 0; i < alts.length; i++) {
      const a = alts[i];
      if (a.when) { let pass = true; for (const k in a.when) if (!evalCond(st.f[k], a.when[k])) { pass = false; break; } if (!pass) continue; }
      let w = a.w ?? 1;
      if (a.when) w *= 1 + 0.15 * Object.keys(a.when).length; // more specific -> slightly favoured
      if (alts.length > 1) {
        const id = name + '#' + i;
        if (mem) { const l = this.last.get(id); if (l !== undefined) { const d = this.counter - l; if (d < this.memoryWindow) w *= 0.08 + 0.92 * (d / this.memoryWindow) ** 1.5; } }
        if (idio) w *= 0.45 + 1.1 * (hash32(st.author.id, id) / 4294967296);
      }
      ok.push(i); ws.push(w);
    }
    if (!ok.length) return null;
    let tot = 0; for (const w of ws) tot += w;
    let r = st.rng.next() * tot, j = 0; for (; j < ws.length - 1; j++) { r -= ws[j]; if (r < 0) break; }
    const idx = ok[j];
    if (st.ctx.memory !== false && alts.length > 1) st.used.push(name + '#' + idx);
    return this._expand(alts[idx].t, st, depth + 1);
  }
  _ref(key, arg, st) {
    const dot = key.indexOf('.'); const root = dot < 0 ? key : key.slice(0, dot), prop = dot < 0 ? '' : key.slice(dot + 1);
    if (root[0] === '$') return st.vars[root.slice(1)] ?? '';
    if (root === 'p') return st.p[prop] ?? '';
    if (root === 'when' || root === 'date') return '';
    if (roleKey.has(root)) {
      const P = st.roles[root]; const lp = prop.toLowerCase(); let v;
      const pr = pronounsOf(P);
      if (lp === 'first') v = P?.firstName ?? 'someone'; else if (lp === 'nick') v = P?.nickname || P?.firstName || 'someone';
      else if (lp === 'last') v = P?.lastName ?? ''; else if (lp === 'name') v = nameOf(P); else if (lp === 'title') v = `${titleOf(P || {})} ${P?.lastName ?? ''}`.trim();
      else if (lp === 'v') v = conj(arg, pr.plural); else if (lp === 'job') v = P?.job || 'work'; else if (lp === 'age') v = P?.age ?? ''; else if (lp === 'kids') v = Array.isArray(P?.children) ? P.children.length : P?.children ?? P?.kids ?? '';
      else if (lp === 'seg') v = P?.segment ?? ''; else if (lp === 'rel') v = st.ctx[root + 'Rel'] ?? st.ctx.relTerm ?? 'friend';
      else if (pr[lp] !== undefined) v = pr[lp];
      else v = P?.[prop] ?? '';
      return prop[0] && prop[0] === prop[0].toUpperCase() && prop[0] !== prop[0].toLowerCase() ? cap(String(v)) : v;
    }
    if (root === 'place') return st.place ?? 'round the corner';
    if (key === 'tick') return st.ev?.tick ?? '';
    const v = st.ctx.vars?.[key] ?? st.ctx[key]; return v == null ? '' : v;
  }
  _expand(s, st, depth) {
    if (depth > 14) return '';
    s = s.replace(/\[(\w+):([^\]]*)\]/g, (m, k, body) => { st.vars[k] = this._expand(body, st, depth + 1); return ''; });
    s = s.replace(/#([\w:*.-]+)((?:\|\w+)*)#/g, (m, name, mods) => {
      const out = this._pick(name, st, depth); if (out == null) return m === '#' ? m : m.replace(/#/g, PH);
      return mods ? this._mods(out, mods, st) : out;
    });
    return s.replace(/\{([$\w.]+)(?::([^}|?]*))?(?:\?([^}|]*))?((?:\|\w+)*)\}/g, (m, key, arg, fb, mods) => {
      if (key === 'when') return this._when(mods, st);
      let out = String(this._ref(key, arg, st)); if (out === '' && fb !== undefined) out = fb; return mods ? this._mods(out, mods, st) : out;
    });
  }
  _mods(s, mods, st) {
    if (s === '') return s;
    for (const m of mods.split('|')) { if (!m) continue; if (MODS[m]) s = MODS[m](s); else if (['date', 'time', 'dow', 'daypart'].includes(m)) s = this._when('|' + m, st); }
    return s;
  }
  _when(mods, st) {
    const w = st.when; if (!w) return '';
    const m = mods.split('|').filter(Boolean)[0] || 'date';
    return m === 'time' ? timePhrase(w.hour ?? 12, w.minute ?? 0) : m === 'dow' ? DAYS[w.weekday ?? 0] : m === 'daypart' ? daypart(w.hour ?? 12) : datePhrase(w);
  }

  _keys(evOrKey, genre) {
    if (typeof evOrKey === 'string') return [evOrKey, `${genre}:${evOrKey}`];
    const t = evOrKey.type, dom = t.split('.')[0];
    return [`${genre}:${t}`, `${genre}:${dom}.*`, `${genre}:*`, `ev:${t}`, `ev:${dom}.*`, `ev:*`];
  }
  /** render(evOrKey, ctx) -> string. ctx: {genre, a,b,c,other, people, register, rel, mood, date, placeName, seed, p, vars, memory, idiolect, world}. */
  render(evOrKey, ctx = {}, world = ctx.world) {
    const genre = ctx.genre || 'ev'; const keys = this._keys(evOrKey, genre).filter((k) => this.rules.has(k));
    if (!keys.length) return typeof evOrKey === 'string' ? `[${evOrKey}]` : `[${evOrKey.type}]`;
    this.stats.renders++;
    let out = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const st = this._state(evOrKey, ctx, world, attempt); st.used = []; out = '';
      for (const key of keys) { out = tidy(this._pick(key, st, 0) ?? ''); if (out) break; }
      if (ctx.memory === false || !out || !this.recent.includes(out) || attempt === 3) { this.counter++; for (const id of st.used) this.last.set(id, this.counter); break; }
      this.stats.retries++; this.counter++; for (const id of st.used) this.last.set(id, this.counter);
    }
    if (ctx.memory !== false) { this.recent.push(out); if (this.recent.length > this.recentN) this.recent.shift(); }
    return out;
  }
}
const roleKey = new Set(['a', 'b', 'c', 'x', 's', 'o']);

/** Wire into a kernel world: world.text.setEngine(...). Grammar pack = {rules}. */
export function installTextEngine(world, grammar, opts = {}) {
  const eng = new TextEngine(grammar, { seed: world.seed || 0, ...opts });
  world.text?.setEngine?.({ render: (w, k, c) => eng.render(k, c || {}, w) });
  return eng;
}
