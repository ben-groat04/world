// Shared helpers for the life-course (sim/systems/life) and health (sim/systems/health) packages. Pure functions over world state.
// Both packages keep per-person state under p.ext.life / p.ext.hl and global state under world.lf.life / world.lf.health (world.lf is a snapshot root).
export const TPD = 144;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sigm = (x) => 1 / (1 + Math.exp(-x));
/** Poisson-ish: probability of at least one event for a yearly rate over a fraction of a year. */
export const pOver = (annualP, frac) => 1 - Math.pow(1 - clamp(annualP, 0, 0.999999), frac);
export function wpick(rng, entries) {
  let t = 0; for (const e of entries) t += e[1];
  if (t <= 0) return entries[0][0];
  let r = rng.next() * t;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}
export const ageOf = (w, p) => (w.tick - p.birthTick) / w.calendar.ticksPerYear;
export const yearsSince = (w, t) => (w.tick - t) / w.calendar.ticksPerYear;
export const isLiving = (p) => p && p.alive;
export const L = (p) => p.ext.life;
export const H = (p) => p.ext.hl;
export const hhOf = (w, p) => (p.ext.pop ? w.lf.households[p.ext.pop.hh] : null);
export const days = (n) => Math.round(n * TPD);
export const months = (n) => Math.round(n * 30.4 * TPD);
export const years = (w, n) => Math.round(n * w.calendar.ticksPerYear);
export const fullName = (p) => `${p.firstName} ${p.lastName}`;
export const ageBand5 = (a) => Math.min(18, Math.floor(a / 5));
export const bandKey = (a) => (a < 1 ? '0' : a < 5 ? '1-4' : a >= 90 ? '90+' : `${Math.floor(a / 5) * 5}-${Math.floor(a / 5) * 5 + 4}`);

/** Register event types once (idempotent). list: [type, doc, payloadSchema] */
export function registerEvents(w, list) { for (const [type, doc, payload] of list) if (!w.events.registry.has(type)) w.registerEventType(type, { doc, payload: payload || null, template: type }); }

// ---------------------------------------------------------------- scheduled work queue (sorted by tick), processed by the hour clock
export function later(w, dt, kind, data) {
  const q = w.lf.life.q, t = w.tick + Math.max(1, Math.round(dt)), e = { t, k: kind, d: data };
  let lo = 0, hi = q.length; // insert after equal ticks (stable)
  while (lo < hi) { const m = (lo + hi) >> 1; if (q[m].t <= t) lo = m + 1; else hi = m; }
  q.splice(lo, 0, e);
  return e;
}
/** like later(), but lands at hour h (default 9-16, derived from tick) of the target day so inserted routine blocks fall in waking hours */
export function laterAt(w, dt, kind, data, h) {
  const t = w.tick + Math.max(1, Math.round(dt)), cal = w.calendar, di = cal.dayIdxOf(t), hr = h ?? 9 + ((t * 7 + (data && data.pid ? data.pid : 0)) % 8);
  let at = cal.dayStart(di) + hr * 6; if (at <= w.tick) at += 144;
  return later(w, at - w.tick, kind, data);
}
export const HANDLERS = {}; // queue kind -> fn(world, data, entry); filled by the life and health modules at import time (stateless functions)
export function runQueue(w, handlers = HANDLERS) {
  const q = w.lf.life.q;
  while (q.length && q[0].t <= w.tick) {
    const e = q.shift(), h = handlers[e.k];
    if (h) h(w, e.d, e);
  }
}
/** remove queued entries of a kind matching pred(d) */
export function cancelQueued(w, kind, pred) { const q = w.lf.life.q; for (let i = q.length - 1; i >= 0; i--) if (q[i].k === kind && pred(q[i].d)) q.splice(i, 1); }

// ---------------------------------------------------------------- ties (p.ext.pop.ties) and legacy relationship records
export function tieOf(p, oid) { const t = p.ext.pop.ties; for (let i = 0; i < t.length; i++) if (t[i].o === oid) return t[i]; return null; }
export function dropTie(p, oid) { const t = p.ext.pop.ties; for (let i = t.length - 1; i >= 0; i--) if (t[i].o === oid) t.splice(i, 1); }
function mirrorRel(w, a, b, tie) {
  const r = w.getRel(a, b), s = tie.s;
  r.familiarity = clamp(0.25 + 0.7 * s + (tie.t === 1 ? 0.1 : 0), 0, 1); r.affinity = clamp(0.1 + 0.8 * s, 0, 1); r.trust = clamp(0.3 + 0.6 * s, 0, 1); r.tags = [tie.k]; r.lastTick = w.tick;
}
/** reciprocal person-person tie (replaces an existing one) */
export function setTie(w, a, b, kind, relA, relB, tier, s, via) {
  dropTie(a, b.id); dropTie(b, a.id);
  const x = { o: b.id, k: kind, rel: relA, t: tier, s: +s.toFixed(2), v: via || '', on: 1 }, y = { o: a.id, k: kind, rel: relB, t: tier, s: +s.toFixed(2), v: via || '', on: 1 };
  a.ext.pop.ties.push(x); b.ext.pop.ties.push(y); mirrorRel(w, a, b, x); mirrorRel(w, b, a, y);
}
/** one-sided tie to an off-map (Metropolis) placeholder */
export function setOffTie(p, mid, kind, rel, tier, s, via) { dropTie(p, mid); p.ext.pop.ties.push({ o: mid, k: kind, rel, t: tier, s: +s.toFixed(2), v: via || '', on: 0 }); }
export function metro(w, id) {
  let ix = w._metroIdx; if (!ix || ix.n !== w.lf.metro.length) { ix = w._metroIdx = new Map(); ix.n = w.lf.metro.length; for (const m of w.lf.metro) ix.set(m.id, m); }
  return ix.get(id) || null;
}
export function newMetro(w, owner, o) {
  const lf = w.lf.life; const id = 'mx' + (lf.mid++); // own id space ('m<n>' belongs to the population / housing generators, which allocate by array length)
  const m = { id, name: o.name, age: Math.round(o.age), sex: o.sex, rel: o.rel, where: o.where || 'elsewhere in the city', how: o.how || '', owner, freq: o.freq || 'weekly call', t0: w.tick };
  if (o.kin) m.kin = true; w.lf.metro.push(m); return m;
}
export function metroAge(w, m) { return m.age + (w.tick - (m.t0 ?? 0)) / w.calendar.ticksPerYear; }

/** strongest living on-map ties (ids) of p up to n (tier <= maxTier), for ripples and mourning */
export function closeOnMap(w, p, maxTier = 2, n = 12) {
  const out = [];
  for (const t of p.ext.pop.ties) if (t.on && t.t <= maxTier && typeof t.o === 'number') { const q = w.people.get(t.o); if (q && q.alive) out.push(t); }
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, n).map((t) => t.o);
}
/** record a compact datum for the life report (not an event; the event log is a bounded ring) */
export function rec(w, kind, row) { const r = w.lf.life.rec; (r[kind] || (r[kind] = [])).push(row); }
export function bump(w, key, n = 1) { const s = w.lf.life.stats; s[key] = (s[key] || 0) + n; }
