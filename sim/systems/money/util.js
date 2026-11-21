// Shared helpers for the three W1-C material systems (money / housing / labour). Pure functions over world.lf households and people.
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
/** Gini of non-negative values (negatives clipped to 0). */
export function gini(a) {
  const s = a.map((x) => Math.max(0, x)).sort((x, y) => x - y), n = s.length; let c = 0, t = 0;
  for (let i = 0; i < n; i++) { c += (i + 1) * s[i]; t += s[i]; }
  return n && t ? (2 * c) / (n * t) - (n + 1) / n : 0;
}
export const livePeople = (w, hh) => { const o = []; for (const id of hh.members) { const p = w.people.get(id); if (p && p.alive) o.push(p); } return o; };
export const ageOf = (w, p) => w.ageOf(p);
export const isAdult = (w, p) => w.ageOf(p) >= 16;
/** Household is "joint" (one pot) unless it is a house-share of unrelated adults. */
export const isSharers = (hh) => hh.arch === 'sharers_students_multigen';
/** ONS-style bedroom standard: one room per couple / single adult, under-10s share (any sex), 10-15s share by sex. */
export function bedNeed(w, ps) {
  let adultsN = 0, couples = 0, u10 = 0, b = 0, g = 0; const seen = new Set();
  for (const p of ps) {
    const a = w.ageOf(p);
    if (a >= 16) { adultsN++; const sp = p.romance && p.romance.partnerId; if (sp != null && !seen.has(p.id) && ps.some((q) => q.id === sp)) { seen.add(sp); seen.add(p.id); couples++; } }
    else if (a < 10) u10++; else if (p.sex === 'F') g++; else b++;
  }
  const singles = adultsN - couples * 2;
  return Math.max(1, couples + singles + Math.ceil(u10 / 2) + Math.ceil(b / 2) + Math.ceil(g / 2));
}
export const hhOf = (w, p) => (p && p.ext && p.ext.pop ? w.lf.households[p.ext.pop.hh] : null);
/** Register a list of [type, doc, payloadSchema] event types (idempotent per world). */
export function registerEvents(w, list) { for (const [type, doc, payload] of list) if (!w.events.registry.has(type)) w.registerEventType(type, { doc, payload: payload || null }); }
/** Monthly calendar facts. */
export const monthOf = (w) => w.time.month;
export const SEASON_ENERGY = [1.45, 1.4, 1.15, 0.95, 0.7, 0.6, 0.58, 0.6, 0.72, 0.95, 1.2, 1.4];
