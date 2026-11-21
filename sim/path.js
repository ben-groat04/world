// A* on the tile grid (8-neighbour, no corner cutting) with a path cache keyed by (startTile, goalTile).
const EMPTY = new Int32Array(0);
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class Pathfinder {
  constructor(map) {
    this.map = map;
    const N = map.W * map.H;
    this.g = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.stamp = 0;
    this.cap = 4096;
    this.hk = new Float64Array(this.cap);
    this.hv = new Int32Array(this.cap);
    this.hn = 0;
    this.cache = new Map();
    this.N = N;
    this.stats = { searches: 0, hits: 0 };
  }
  _push(k, v) {
    if (this.hn >= this.cap) {
      this.cap *= 2;
      const nk = new Float64Array(this.cap); nk.set(this.hk); this.hk = nk;
      const nv = new Int32Array(this.cap); nv.set(this.hv); this.hv = nv;
    }
    const hk = this.hk, hv = this.hv;
    let i = this.hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p]; hv[i] = hv[p]; i = p;
    }
    hk[i] = k; hv[i] = v;
  }
  _pop() {
    const hk = this.hk, hv = this.hv;
    const top = hv[0];
    const n = --this.hn;
    if (n > 0) {
      const k = hk[n], v = hv[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= k) break;
        hk[i] = hk[c]; hv[i] = hv[c]; i = c;
      }
      hk[i] = k; hv[i] = v;
    }
    return top;
  }
  // Uncached A*. Returns Int32Array of tile indices (excluding start, including goal); null if unreachable.
  find(start, goal) {
    const { W, H, cost, comp } = this.map;
    if (start === goal) return EMPTY;
    if (!cost[goal] || !cost[start] || comp[start] !== comp[goal]) return null;
    this.stats.searches++;
    const st = ++this.stamp, g = this.g, parent = this.parent, seen = this.seen, closed = this.closed;
    const gx = goal % W, gy = (goal / W) | 0;
    this.hn = 0;
    g[start] = 0; parent[start] = -1; seen[start] = st;
    this._push(0, start);
    let found = false;
    while (this.hn > 0) {
      const cur = this._pop();
      if (closed[cur] === st) continue;
      closed[cur] = st;
      if (cur === goal) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0, gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx, c = cost[ni];
        if (!c || closed[ni] === st) continue;
        let step = c;
        if (d >= 4) { if (!cost[cy * W + nx] || !cost[ny * W + cx]) continue; step = c * 1.4; }
        const ng = gc + step;
        if (seen[ni] !== st || ng < g[ni]) {
          g[ni] = ng; parent[ni] = cur; seen[ni] = st;
          const dx = Math.abs(nx - gx), dy = Math.abs(ny - gy);
          this._push(ng + (dx > dy ? 10 * dx + 4 * dy : 10 * dy + 4 * dx), ni);
        }
      }
    }
    if (!found) return null;
    let n = 0;
    for (let c = goal; c !== start; c = parent[c]) n++;
    const out = new Int32Array(n);
    for (let c = goal, i = n - 1; c !== start; c = parent[c], i--) out[i] = c;
    return out;
  }
  // Cached path between two tile indices. Canonical: the path is always computed for (min,max) and reversed for the
  // other direction, so results never depend on cache history (needed for snapshot/determinism). Shared arrays: never mutate.
  cached(start, goal) {
    const key = start * this.N + goal;
    let p = this.cache.get(key);
    if (p !== undefined) { this.stats.hits++; return p; }
    if (start === goal) { p = this.find(start, goal); this.cache.set(key, p); return p; }
    const fwd = start < goal, a = fwd ? start : goal, z = fwd ? goal : start;
    let f = this.find(a, z), r = null;
    if (f && f.length > 0) { r = new Int32Array(f.length); for (let i = 0; i < f.length - 1; i++) r[i] = f[f.length - 2 - i]; r[f.length - 1] = a; }
    else r = f;
    this.cache.set(a * this.N + z, f); this.cache.set(z * this.N + a, r);
    return fwd ? f : r;
  }
}
export { EMPTY as EMPTY_PATH };
