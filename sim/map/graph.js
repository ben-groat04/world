// Street / footway graph: build (nodes, undirected weighted edges in metres, CSR adjacency) + A* router with bounded LRU cache.
// Nodes are tile coordinates (x,y). Edge kinds: footway, crossing, path, gate, link. Costs: length in metres (+ wait penalty on crossings).
export class GraphBuilder {
  constructor() { this.nodes = []; this.key = new Map(); this.edges = new Map(); }
  node(x, y, kind = 'street', ref = null) {
    const k = y * 65536 + x; let id = this.key.get(k);
    if (id === undefined) { id = this.nodes.length; this.nodes.push({ id, x, y, kind, ref }); this.key.set(k, id); }
    else if (kind !== 'street' && this.nodes[id].kind === 'street') { this.nodes[id].kind = kind; if (ref != null) this.nodes[id].ref = ref; }
    return id;
  }
  at(x, y) { const id = this.key.get(y * 65536 + x); return id === undefined ? -1 : id; }
  edge(a, b, kind = 'footway', cost = null) {
    if (a === b || a < 0 || b < 0) return;
    const na = this.nodes[a], nb = this.nodes[b];
    const len = (Math.abs(na.x - nb.x) + Math.abs(na.y - nb.y)) * 2; // metres (Manhattan on a grid; diagonals use hypot)
    const dx = Math.abs(na.x - nb.x) * 2, dy = Math.abs(na.y - nb.y) * 2;
    const L = Math.hypot(dx, dy) || len;
    const k = a < b ? a * 1e6 + b : b * 1e6 + a;
    if (this.edges.has(k)) return;
    this.edges.set(k, { a: Math.min(a, b), b: Math.max(a, b), len: L, cost: cost == null ? L : cost, kind });
  }
  finish() {
    const n = this.nodes.length, edges = [...this.edges.values()].sort((p, q) => p.a - q.a || p.b - q.b);
    const deg = new Int32Array(n + 1);
    for (const e of edges) { deg[e.a]++; deg[e.b]++; }
    const off = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
    const fill = off.slice(0, n), to = new Int32Array(off[n]), cost = new Float32Array(off[n]), len = new Float32Array(off[n]);
    for (const e of edges) {
      to[fill[e.a]] = e.b; cost[fill[e.a]] = e.cost; len[fill[e.a]++] = e.len;
      to[fill[e.b]] = e.a; cost[fill[e.b]] = e.cost; len[fill[e.b]++] = e.len;
    }
    return new StreetGraph(this.nodes, edges, off, to, cost, len);
  }
}

export class StreetGraph {
  constructor(nodes, edges, off, to, cost, len) {
    this.nodes = nodes; this.edges = edges; this.off = off; this.to = to; this.cost = cost; this.len = len;
    this.n = nodes.length; this._cache = new Map(); this.cacheMax = 4096;
    this.xs = new Int16Array(this.n); this.ys = new Int16Array(this.n);
    for (const nd of nodes) { this.xs[nd.id] = nd.x; this.ys[nd.id] = nd.y; }
    this._g = new Float32Array(this.n); this._prev = new Int32Array(this.n); this._seen = new Uint32Array(this.n); this._stamp = 0;
    this._heapN = new Int32Array(this.n * 4 + 16); this._heapF = new Float32Array(this.n * 4 + 16);
  }
  neighbours(a) { const r = []; for (let i = this.off[a]; i < this.off[a + 1]; i++) r.push({ to: this.to[i], len: this.len[i], cost: this.cost[i] }); return r; }
  /** Shortest path a->b: {nodes:[ids], metres, cost} or null. Canonical for (min,max) so the cache never changes results. */
  route(a, b) {
    if (a === b) return { nodes: [a], metres: 0, cost: 0 };
    const flip = a > b, s = flip ? b : a, t = flip ? a : b, key = s * 65536 + t;
    let r = this._cache.get(key);
    if (r === undefined) {
      r = this._astar(s, t);
      if (this._cache.size >= this.cacheMax) this._cache.delete(this._cache.keys().next().value); // FIFO-ish bound
      this._cache.set(key, r);
    }
    if (!r) return null;
    return flip ? { nodes: r.nodes.slice().reverse(), metres: r.metres, cost: r.cost } : r;
  }
  _astar(s, t) {
    const { off, to, cost, len, xs, ys, _g: g, _prev: prev, _seen: seen } = this; const stamp = ++this._stamp;
    const hn = this._heapN, hf = this._heapF; let hs = 0;
    const tx = xs[t], ty = ys[t];
    const h = (i) => (Math.abs(xs[i] - tx) + Math.abs(ys[i] - ty)) * 1.4; // admissible: >= euclid metres/2 * ... (tile=2m, hypot<=manhattan*2) ; 1.4 <= 2 ok
    const push = (n, f) => { let i = hs++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hn[i] = hn[p]; hf[i] = hf[p]; i = p; } hn[i] = n; hf[i] = f; };
    const pop = () => { const top = hn[0]; const n = hn[--hs], f = hf[hs]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hs) break; if (c + 1 < hs && hf[c + 1] < hf[c]) c++; if (hf[c] >= f) break; hn[i] = hn[c]; hf[i] = hf[c]; i = c; } hn[i] = n; hf[i] = f; return top; };
    seen[s] = stamp; g[s] = 0; prev[s] = -1; push(s, h(s));
    const closed = new Set();
    while (hs > 0) {
      const u = pop(); if (u === t) break; if (closed.has(u)) continue; closed.add(u);
      for (let i = off[u]; i < off[u + 1]; i++) {
        const v = to[i], ng = g[u] + cost[i];
        if (seen[v] !== stamp || ng < g[v]) { seen[v] = stamp; g[v] = ng; prev[v] = u; if (hs + 2 >= hn.length) continue; push(v, ng + h(v)); }
      }
    }
    if (seen[t] !== stamp) return null;
    const path = []; let m = 0;
    for (let c = t; c !== -1; c = prev[c]) path.push(c);
    path.reverse();
    for (let i = 1; i < path.length; i++) { const a = path[i - 1]; for (let k = off[a]; k < off[a + 1]; k++) if (to[k] === path[i]) { m += len[k]; break; } }
    return { nodes: path, metres: m, cost: g[t] };
  }
  components() {
    const comp = new Int32Array(this.n).fill(-1); let c = 0;
    for (let s = 0; s < this.n; s++) { if (comp[s] >= 0) continue; const st = [s]; comp[s] = c; while (st.length) { const u = st.pop(); for (let i = this.off[u]; i < this.off[u + 1]; i++) { const v = this.to[i]; if (comp[v] < 0) { comp[v] = c; st.push(v); } } } c++; }
    return { comp, count: c };
  }
  toJSON() { return { nodes: this.nodes, edges: this.edges }; }
}
