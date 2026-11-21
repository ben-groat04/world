// Small pure helpers for sim/goals. No ambient randomness: every roll comes from a stateless world.rngFor('goals.<what>', ...keys) stream.
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sig = (x) => 1 / (1 + Math.exp(-x));
export const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Weighted pick from [[item, weight]...] with u in [0,1). Returns item or undefined. */
export function pickW(list, u) {
  let tot = 0; for (let i = 0; i < list.length; i++) tot += list[i][1] > 0 ? list[i][1] : 0;
  if (tot <= 0) return undefined;
  let r = u * tot; for (let i = 0; i < list.length; i++) { const w = list[i][1] > 0 ? list[i][1] : 0; if ((r -= w) < 0) return list[i][0]; }
  return list[list.length - 1][0];
}
/** Binary min-heap on numeric key `k` (due ticks). Entries {k, ...}. Ties broken by insertion sequence => deterministic. */
export class Heap {
  constructor() { this.a = []; this.seq = 0; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(e) { e.s = this.seq++; const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (less(a[i], a[j])) { [a[i], a[j]] = [a[j], a[i]]; i = j; } else break; } }
  pop() { const a = this.a; if (!a.length) return undefined; const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } } return top; }
}
const less = (x, y) => x.k < y.k || (x.k === y.k && x.s < y.s);
/** Tiny template formatter: 'ask {t} about {g}' with vars; missing vars -> ''. */
export const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? '' : v[k])).replace(/\s*\(\)/g, '').replace(/\s+/g, ' ').trim();
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
