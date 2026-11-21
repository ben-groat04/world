// Store-driven canvas renderer. It never touches the sim: it draws from the map payload + people snapshots that
// ui/worker.js posts (store.state.map / .people / .occ / .emotes / .bubbles / .trails / .time).
// Everything per-building-type and per-tile-type is data-driven: add a row to BUILDING_STYLE / TILE_STYLE / JOB_COLORS.
import { T } from '../sim/map.js';

// ------------------------------------------------------------------ style tables
// roof: rooftop colour; wall: edge colour; glyph: symbol drawn on the roof (see GLYPHS); pri: label priority (higher = shown at lower zoom)
export const BUILDING_STYLE = {
  house: { roof: null, glyph: null, pri: 0 },
  apartment: { roof: '#8d97a6', wall: '#c9ced6', glyph: null, pri: 1, units: true },
  farm: { roof: '#a8402f', glyph: null, pri: 1 },
  bakery: { roof: '#d9a35a', glyph: 'cup', pri: 2 }, cafe: { roof: '#b9753f', glyph: 'cup', pri: 3 },
  smithy: { roof: '#555a63', glyph: 'gear', pri: 2 }, workshop: { roof: '#5c6670', glyph: 'gear', pri: 2 },
  tavern: { roof: '#8a3d2e', glyph: 'mug', pri: 3 }, bar: { roof: '#6a3a7a', glyph: 'mug', pri: 3 },
  market: { roof: '#3f9a84', glyph: 'cart', pri: 3 }, supermarket: { roof: '#2f9a6e', glyph: 'cart', pri: 3 }, shop: { roof: '#3f8fb0', glyph: 'cart', pri: 2 },
  clinic: { roof: '#e6ebf1', glyph: 'cross', pri: 4 }, hospital: { roof: '#e6ebf1', glyph: 'cross', pri: 4 },
  school: { roof: '#c98a35', glyph: 'book', pri: 4 }, library: { roof: '#9a7a4a', glyph: 'book', pri: 3 },
  temple: { roof: '#7d72b8', glyph: 'star', pri: 4 }, church: { roof: '#7d72b8', glyph: 'star', pri: 4 },
  townhall: { roof: '#3e639a', glyph: 'flag', pri: 5 }, office: { roof: '#4a6a8a', glyph: 'bars', pri: 3 },
  jail: { roof: '#5d6268', glyph: 'bars', pri: 3 }, police: { roof: '#3a4a7a', glyph: 'star', pri: 3 },
  mill: { roof: '#8f7f66', glyph: 'gear', pri: 2 }, inn: { roof: '#bd6a22', glyph: 'bed', pri: 3 }, hotel: { roof: '#a05a2a', glyph: 'bed', pri: 3 },
  tailor: { roof: '#a8517f', glyph: 'needle', pri: 2 }, carpenter: { roof: '#8f5d2d', glyph: 'gear', pri: 2 },
  gym: { roof: '#d0483f', glyph: 'dumbbell', pri: 3 }, transit: { roof: '#2a7fb5', glyph: 'bus', pri: 4 },
  bank: { roof: '#4d6e5b', glyph: 'coin', pri: 3 }, park: { open: true, pri: 3 }, cemetery: { open: true, pri: 2 }, square: { open: true, pri: 4 }, well: { open: true, pri: 1 },
};
const HOUSE_ROOFS = ['#a8553a', '#93503a', '#7a5f4d', '#84703f', '#5d7282', '#9b6a4a'];
const styleOf = (type) => BUILDING_STYLE[type] || (BUILDING_STYLE[type] = { roof: hashColor(type), glyph: null, pri: 2 });
function hashColor(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return `hsl(${h % 360} 38% 46%)`; }
export const JOB_COLORS = { farmer: '#7a9a3e', laborer: '#9c8a5a', baker: '#eadfb0', smith: '#8a6a58', tavernkeeper: '#b5452f', server: '#d98a4a', merchant: '#3f9a84', doctor: '#f0f0f5', nurse: '#cfe3f0', teacher: '#5a78b0', priest: '#7d72b8', mayor: '#3e639a', clerk: '#6f86a8', captain: '#444a55', guard: '#555d6a', miller: '#c8b89a', innkeeper: '#bd6a22', tailor: '#a8517f', carpenter: '#8f5d2d', gardener: '#4f9a4a', gravedigger: '#555', student: '#e0a84a', child: '#e8c060', retired: '#9a9a9a', unemployed: '#b0a090' };
const jobColor = (j) => JOB_COLORS[j] || (JOB_COLORS[j] = hashColor(String(j)));
// tile palettes [spring, summer, autumn, winter] arrays of variants; keyed by T id (unknown ids fall back to grey)
const GRASS = [['#6a9a47', '#6fa04b', '#639340', '#74a44f'], ['#5f9440', '#66a046', '#598a3b', '#6aa84c'], ['#8a9a45', '#92a14a', '#818f40', '#9aa650'], ['#dfe6ea', '#e6ecef', '#d6dee3', '#eef2f4']];
const FIELD = [['#86ad4f', '#7fa548'], ['#c9b44c', '#bfa840'], ['#a98446', '#9d783d'], ['#d5dde0', '#cad3d7']];
export const TILE_STYLE = {
  [T.GRASS]: (s, v) => GRASS[s][v & 3], [T.BUILDING]: (s, v) => GRASS[s][v & 3],
  [T.TREE]: (s) => ['#3c7a3a', '#2f6b2f', '#7a6a30', '#aebcb3'][s],
  [T.ROAD]: (s, v) => ((v & 7) < 2 ? '#8e9096' : '#9a9ca2'), [T.WATER]: (s, v) => ((v & 3) === 0 ? '#3a74a3' : '#3f7fb0'), [T.BRIDGE]: () => '#8a6a45',
  [T.FIELD]: (s, v) => FIELD[s][v & 1], [T.PLAZA]: (s, v) => (v & 1 ? '#cdc4b2' : '#c4bba8'),
  [T.PARK]: (s) => (s === 3 ? '#d6e2dc' : '#58994a'), [T.GRAVE]: (s) => (s === 3 ? '#d3dad6' : '#6f8e5c'), [T.FOUNTAIN]: () => '#4c8fc0',
};
const TINT = [[0, [58, 68, 128]], [5, [68, 80, 140]], [6.5, [255, 190, 150]], [8, [255, 255, 255]], [17, [255, 255, 255]], [19, [255, 200, 150]], [20.7, [90, 95, 160]], [24, [58, 68, 128]]];
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (a, b, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function tintAt(h) { for (let i = 1; i < TINT.length; i++) if (h <= TINT[i][0]) { const [h0, c0] = TINT[i - 1], [h1, c1] = TINT[i], t = (h - h0) / (h1 - h0); return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)]; } return TINT[0][1]; }
const rgb = (c) => { if (c[0] === '#') return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; const m = c.match(/\d+/g); return [0, 0, 0].map((_, i) => +m[i] || 0); };
const shade = (c, k) => { const [r, g, b] = rgb(c); return `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`; };

// ------------------------------------------------------------------ glyphs (vector, no emoji fonts needed)
const TAU = Math.PI * 2;
const GLYPHS = {
  cup(g, x, y, s) { g.fillRect(x - s * .5, y - s * .3, s * .8, s * .7); g.beginPath(); g.arc(x + s * .4, y, s * .28, -1.4, 1.4); g.lineWidth = s * .16; g.stroke(); },
  mug(g, x, y, s) { g.fillRect(x - s * .45, y - s * .45, s * .75, s * .9); g.beginPath(); g.arc(x + s * .32, y, s * .3, -1.5, 1.5); g.lineWidth = s * .16; g.stroke(); },
  cart(g, x, y, s) { g.beginPath(); g.moveTo(x - s * .6, y - s * .4); g.lineTo(x - s * .35, y - s * .4); g.lineTo(x - s * .2, y + s * .2); g.lineTo(x + s * .5, y + s * .2); g.lineTo(x + s * .6, y - s * .2); g.lineTo(x - s * .28, y - s * .2); g.lineWidth = s * .16; g.stroke(); g.beginPath(); g.arc(x - s * .1, y + s * .5, s * .12, 0, TAU); g.arc(x + s * .4, y + s * .5, s * .12, 0, TAU); g.fill(); },
  cross(g, x, y, s) { g.fillStyle = '#d33'; g.fillRect(x - s * .15, y - s * .5, s * .3, s); g.fillRect(x - s * .5, y - s * .15, s, s * .3); },
  book(g, x, y, s) { g.fillRect(x - s * .5, y - s * .4, s * .46, s * .8); g.fillRect(x + s * .04, y - s * .4, s * .46, s * .8); },
  star(g, x, y, s) { g.beginPath(); for (let i = 0; i < 10; i++) { const r = i & 1 ? s * .22 : s * .55, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); },
  flag(g, x, y, s) { g.fillRect(x - s * .4, y - s * .55, s * .12, s * 1.1); g.fillRect(x - s * .28, y - s * .55, s * .7, s * .45); },
  bars(g, x, y, s) { for (let i = -1; i <= 1; i++) g.fillRect(x + i * s * .3 - s * .06, y - s * .45, s * .12, s * .9); },
  gear(g, x, y, s) { g.beginPath(); g.arc(x, y, s * .38, 0, TAU); g.fill(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.fillRect(x + Math.cos(a) * s * .48 - s * .08, y + Math.sin(a) * s * .48 - s * .08, s * .16, s * .16); } },
  bed(g, x, y, s) { g.fillRect(x - s * .55, y - s * .05, s * 1.1, s * .3); g.fillRect(x - s * .55, y - s * .4, s * .14, s * .65); g.fillRect(x - s * .35, y - s * .25, s * .3, s * .2); },
  needle(g, x, y, s) { g.fillRect(x - s * .05, y - s * .55, s * .1, s * 1.1); g.beginPath(); g.arc(x, y - s * .45, s * .13, 0, TAU); g.fill(); },
  dumbbell(g, x, y, s) { g.fillRect(x - s * .5, y - s * .06, s, s * .12); g.fillRect(x - s * .55, y - s * .3, s * .18, s * .6); g.fillRect(x + s * .37, y - s * .3, s * .18, s * .6); },
  bus(g, x, y, s) { g.fillRect(x - s * .55, y - s * .35, s * 1.1, s * .6); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - s * .45, y - s * .25, s * .9, s * .22); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - s * .3, y + s * .3, s * .12, 0, TAU); g.arc(x + s * .3, y + s * .3, s * .12, 0, TAU); g.fill(); },
  coin(g, x, y, s) { g.beginPath(); g.arc(x, y, s * .45, 0, TAU); g.lineWidth = s * .14; g.stroke(); g.fillRect(x - s * .05, y - s * .25, s * .1, s * .5); },
};
// emote icons drawn inside a bubble of radius r at (x,y)
const EMOTES = {
  flirt(g, x, y, r) { g.fillStyle = '#e8486f'; g.beginPath(); g.moveTo(x, y + r * .55); g.bezierCurveTo(x - r * 1.0, y - r * .1, x - r * .5, y - r * .85, x, y - r * .3); g.bezierCurveTo(x + r * .5, y - r * .85, x + r * 1.0, y - r * .1, x, y + r * .55); g.fill(); },
  argue(g, x, y, r) { g.strokeStyle = '#d6322a'; g.lineWidth = Math.max(1.4, r * .22); g.lineCap = 'round'; g.beginPath(); for (const [a, b] of [[-.45, -.1], [.1, .45]]) { g.moveTo(x - r * .55, y + r * a); g.lineTo(x + r * .55, y + r * a + (b - a) * 0 ); } g.moveTo(x - r * .25, y - r * .6); g.lineTo(x - r * .25, y + r * .6); g.moveTo(x + r * .25, y - r * .6); g.lineTo(x + r * .25, y + r * .6); g.stroke(); },
  joke(g, x, y, r) { g.fillStyle = '#f5c518'; g.beginPath(); g.arc(x, y, r * .72, 0, TAU); g.fill(); g.fillStyle = '#5a3d00'; g.beginPath(); g.arc(x - r * .26, y - r * .15, r * .09, 0, TAU); g.arc(x + r * .26, y - r * .15, r * .09, 0, TAU); g.fill(); g.beginPath(); g.arc(x, y + r * .02, r * .4, 0.1, Math.PI - 0.1); g.fill(); },
  comfort(g, x, y, r) { g.fillStyle = '#2f9e8f'; g.fillRect(x - r * .12, y - r * .55, r * .24, r * 1.1); g.fillRect(x - r * .55, y - r * .12, r * 1.1, r * .24); },
  gossip(g, x, y, r) { g.fillStyle = '#9b59b6'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(x + i * r * .42, y, r * .16, 0, TAU); g.fill(); } g.fillRect(x + r * .5, y - r * .5, r * .12, r * .3); },
  dots(g, x, y, r) { g.fillStyle = '#6b7380'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(x + i * r * .42, y, r * .15, 0, TAU); g.fill(); } },
  sad(g, x, y, r) { g.fillStyle = '#4a90d9'; g.beginPath(); g.moveTo(x, y - r * .6); g.quadraticCurveTo(x + r * .55, y + r * .1, x, y + r * .55); g.quadraticCurveTo(x - r * .55, y + r * .1, x, y - r * .6); g.fill(); },
  deep(g, x, y, r) { g.fillStyle = '#b86bc4'; EMOTES.flirt(g, x, y, r * .8); g.fillStyle = '#c0679a'; },
};
const EMOTE_OF = { flirt: ['flirt', 'flirt'], argue: ['argue', 'argue'], joke: ['joke', 'joke'], comfort: ['comfort', 'flirt'], gossip: ['gossip', 'gossip'], complain: ['sad', 'dots'], apologize: ['sad', 'dots'], deep: ['deep', 'deep'], greeting: ['dots', 'dots'], smalltalk: ['dots', 'dots'] };
const EMOTE_BG = { argue: '#ffe3e0', flirt: '#ffe3ec', joke: '#fff3c4', comfort: '#d8f3ee', gossip: '#efe0f5' };

// ------------------------------------------------------------------ renderer
export class Renderer {
  constructor(canvas, store) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.store = store;
    this.cam = { x: 60, y: 45, zoom: 8 }; this.goal = null; this.minZoom = 3; this.maxZoom = 56;
    this.P = new Map(); this.emotes = []; this.doorAt = new Map(); this.bById = new Map();
    this.selectedId = null; this.selectedBuilding = null; this.followId = null;
    this.timelapse = false; this.tps = 322; this.frame = 0; this.dpr = 1; this.inset = 0; this.lastNow = 0;
    this.houseColor = new Map(); this.map = null; this.baseSeason = -1; this.lastTick = -1; this.stats = { ms: 0 };
    this.resize();
  }
  // -- map data
  setMap(m) {
    this.map = m; this.W = m.W; this.H = m.H; this.tiles = m.tiles; this.bById.clear(); this.doorAt.clear();
    this.var = new Uint8Array(m.W * m.H); for (let i = 0; i < this.var.length; i++) this.var[i] = Math.floor(hash(i % m.W, (i / m.W) | 0, 11) * 256);
    this.trees = []; let fx0 = 1e9, fy0 = 1e9, fx1 = -1, fy1 = -1;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i], x = i % m.W, y = (i / m.W) | 0;
      if (t === T.TREE || (t === T.PARK && this.var[i] < 34)) this.trees.push(x, y, this.var[i]);
      if (t === T.FOUNTAIN) { fx0 = Math.min(fx0, x); fy0 = Math.min(fy0, y); fx1 = Math.max(fx1, x); fy1 = Math.max(fy1, y); }
    }
    this.fountain = fx1 >= 0 ? { x: (fx0 + fx1 + 1) / 2, y: (fy0 + fy1 + 1) / 2, r: (fx1 - fx0 + 1) / 2 } : null;
    this.byOrder = m.buildings; for (const b of m.buildings) this.addBuilding(b);
    this.baseSeason = -1; this.fit();
  }
  addBuilding(b) { this.bById.set(b.id, b); if (b.door) this.doorAt.set(b.door.y * this.W + b.door.x, b); if (!this.byOrder.includes(b)) this.byOrder.push(b); }
  bakeBase(season) {
    const m = this, c = this.baseCv || (this.baseCv = document.createElement('canvas'));
    c.width = m.W; c.height = m.H; const g = c.getContext('2d'), img = g.createImageData(m.W, m.H), d = img.data, cache = {};
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i], fn = TILE_STYLE[t], col = fn ? fn(season, m.var[i]) : '#777', k = col + season; const v = cache[k] || (cache[k] = rgb(col));
      d[i * 4] = v[0]; d[i * 4 + 1] = v[1]; d[i * 4 + 2] = v[2]; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0); this.baseSeason = season;
  }
  // -- viewport
  resize() {
    const c = this.canvas, r = c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(r.width * this.dpr)), H = Math.max(1, Math.round(r.height * this.dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    this.w = r.width; this.h = r.height;
  }
  setInset(px) { this.inset = Math.max(0, px | 0); }
  get cy0() { return (this.h - this.inset) / 2; }
  fit() {
    if (!this.W) return;
    const small = this.w < 600, z = small ? Math.max(5, this.w / 62) : Math.min(this.w / this.W, (this.h - this.inset) / this.H) * 1.02;
    this.minZoom = Math.max(2.2, Math.min(this.w / this.W, (this.h - this.inset) / this.H) * 0.9);
    const c = this.map.center || { x: this.W / 2, y: this.H / 2 };
    this.cam.zoom = Math.max(this.minZoom, z); this.cam.x = small ? c.x : this.W / 2; this.cam.y = small ? c.y : this.H / 2; this.goal = null;
  }
  toScreen(x, y) { const z = this.cam.zoom; return [(x - this.cam.x) * z + this.w / 2, (y - this.cam.y) * z + this.cy0]; }
  toWorld(sx, sy) { const z = this.cam.zoom; return [(sx - this.w / 2) / z + this.cam.x, (sy - this.cy0) / z + this.cam.y]; }
  pan(dx, dy) { this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; this.goal = null; this.clamp(); }
  zoomAt(sx, sy, f) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.cam.zoom * f));
    const [nx, ny] = this.toWorld(sx, sy); this.cam.x += wx - nx; this.cam.y += wy - ny; this.goal = null; this.clamp();
  }
  zoomBy(f) { this.zoomAt(this.w / 2, this.cy0, f); }
  clamp() { this.cam.x = Math.max(0, Math.min(this.W, this.cam.x)); this.cam.y = Math.max(0, Math.min(this.H, this.cam.y)); }
  focus(x, y, zoom) { this.goal = { x, y, zoom: zoom ? Math.max(this.cam.zoom, zoom) : this.cam.zoom }; }
  personPos(id) { const p = this.P.get(id); return p ? [p.x, p.y] : null; }
  // -- data in
  ingest(m, now) {
    const A = m.people; if (!A) return;
    const seen = this.seenStamp = (this.seenStamp || 0) + 1, st = this.store.state;
    for (let i = 0; i < A.length; i += 6) {
      const id = A[i]; let p = this.P.get(id);
      if (!p) { p = { id, x: A[i + 1], y: A[i + 2], tx: A[i + 1], ty: A[i + 2], anim: null }; this.P.set(id, p); }
      p.tx = A[i + 1]; p.ty = A[i + 2]; p.fl = A[i + 3]; p.mood = A[i + 4]; p.age = A[i + 5]; p.seen = seen;
    }
    for (const [id, p] of this.P) if (p.seen !== seen) this.P.delete(id);
    if (m.time && m.time.tick !== this.lastTick) {
      this.lastTick = m.time.tick;
      const tr = m.trails; if (tr && tr.length) {
        const dur = Math.max(90, Math.min(600, 1000 / Math.max(1, this.tps) * 0.9));
        for (let i = 0; i < tr.length;) { const id = tr[i], n = tr[i + 1], p = this.P.get(id); if (p) p.anim = { pts: tr.subarray(i + 2, i + 2 + n * 2), t0: now, dur }; i += 2 + n * 2; }
      }
    }
    if (st.emotes.length) { for (const e of st.emotes.splice(0)) this.emotes.push({ a: e[0], b: e[1], type: e[2], out: e[3], born: now }); }
    if (m.time) { const f = m.time.festival; this.festival = f; this.weather = m.time.weather; this.hour = m.time.hour; this.season = m.time.season; }
  }
  update(now) {
    const dt = Math.min(0.1, (now - (this.lastNow || now)) / 1000); this.lastNow = now;
    const k = 1 - Math.exp(-dt * (this.tps > 1000 ? 30 : 14));
    for (const p of this.P.values()) {
      const a = p.anim;
      if (a && now - a.t0 < a.dur + 30) {
        const f = Math.min(1, (now - a.t0) / a.dur), n = a.pts.length / 2, seg = f * (n - 1), i = Math.min(n - 2, Math.floor(seg)), t = seg - i;
        p.x = lerp(a.pts[2 * i], a.pts[2 * i + 2], t); p.y = lerp(a.pts[2 * i + 1], a.pts[2 * i + 3], t);
      } else {
        p.anim = null; const dx = p.tx - p.x, dy = p.ty - p.y;
        if (dx * dx + dy * dy > 400 || this.tps === 0) { p.x = p.tx; p.y = p.ty; } else { p.x += dx * k; p.y += dy * k; }
      }
    }
    const g = this.goal;
    if (this.followId != null) { const q = this.P.get(this.followId); if (q) { const f = 1 - Math.exp(-dt * 6); this.cam.x += (q.x + 0.5 - this.cam.x) * f; this.cam.y += (q.y + 0.5 - this.cam.y) * f; this.clamp(); } }
    else if (g) {
      const f = 1 - Math.exp(-dt * 7); this.cam.x += (g.x - this.cam.x) * f; this.cam.y += (g.y - this.cam.y) * f; this.cam.zoom *= Math.pow(g.zoom / this.cam.zoom, f);
      if (Math.abs(g.x - this.cam.x) + Math.abs(g.y - this.cam.y) < 0.03 && Math.abs(g.zoom / this.cam.zoom - 1) < 0.01) this.goal = null;
    }
  }
  // -- picking
  pick(sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    let best = null, bd = Math.max(1.0, (this.canvas.dataset.touch ? 22 : 13) / this.cam.zoom) ** 2;
    for (const p of this.P.values()) {
      if (p.fl & 1) continue;
      const d = (p.x + 0.5 - wx) ** 2 + (p.y + 0.4 - wy) ** 2;
      if (d < bd) { bd = d; best = p.id; }
    }
    if (best != null) return { person: best };
    const ix = Math.floor(wx), iy = Math.floor(wy);
    if (ix >= 0 && iy >= 0 && ix < this.W && iy < this.H) for (const b of this.byOrder) if (ix >= b.x && ix < b.x + b.w && iy >= b.y && iy < b.y + b.h) return { building: b.id };
    return null;
  }
  // -- drawing
  draw(now) {
    const t0 = performance.now(); this.frame++;
    const ctx = this.ctx, z = this.cam.zoom, st = this.store.state;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#2b3f28'; ctx.fillRect(0, 0, this.w, this.h);
    if (!this.map) { ctx.fillStyle = '#8d98a5'; ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Building the town…', this.w / 2, this.h / 2); return; }
    this.update(now);
    const season = this.season ?? 0, hour = this.hour ?? 12, TL = this.timelapse, wt = (this.weather && this.weather.type) || 'clear';
    if (this.baseSeason !== season) this.bakeBase(season);
    const ox = this.w / 2 - this.cam.x * z, oy = this.cy0 - this.cam.y * z;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.baseCv, ox, oy, this.W * z, this.H * z); ctx.imageSmoothingEnabled = true;
    const x0 = Math.max(0, Math.floor(-ox / z)), y0 = Math.max(0, Math.floor(-oy / z)), x1 = Math.min(this.W - 1, Math.ceil((this.w - ox) / z)), y1 = Math.min(this.H - 1, Math.ceil((this.h - oy) / z));
    const night = hour >= 19 || hour < 6;
    if (z >= 6) this.drawTileDetail(ctx, x0, y0, x1, y1, ox, oy, z, season);
    if (z >= 4) this.drawTrees(ctx, x0, y0, x1, y1, ox, oy, z, season);
    if (this.fountain && z >= 3) { const f = this.fountain, fx = ox + f.x * z, fy = oy + f.y * z; ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.arc(fx, fy, f.r * z, 0, TAU); ctx.fill(); ctx.fillStyle = '#4c8fc0'; ctx.beginPath(); ctx.arc(fx, fy, f.r * 0.8 * z, 0, TAU); ctx.fill(); ctx.fillStyle = '#cfe8f6'; ctx.beginPath(); ctx.arc(fx, fy, f.r * 0.25 * z * (1 + 0.12 * Math.sin(this.frame / 7)), 0, TAU); ctx.fill(); }
    // buildings
    const occ = new Map(); if (st.occ) for (let i = 0; i < st.occ.length; i += 2) occ.set(st.occ[i], st.occ[i + 1]);
    const vis = [];
    for (const b of this.byOrder) {
      if (b.x > x1 + 1 || b.y > y1 + 1 || b.x + b.w < x0 - 1 || b.y + b.h < y0 - 1) continue;
      vis.push(b); const sty = styleOf(b.type); if (!b.open && !sty.open) this.drawBuilding(ctx, b, sty, ox, oy, z, night && !TL, occ.get(b.id) || 0);
    }
    // festival decorations (under people)
    const F = this.festival; this.fest = F && hour >= 6 && hour < (F.end + 1.5) ? F : null;
    if (this.fest && !TL) this.drawFestival(ctx, ox, oy, z, now, night, false);
    // people
    this.drawPeople(ctx, ox, oy, z, now, TL);
    // tint + lights
    if (hour < 8 || hour >= 17) { const tn = tintAt(hour); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${tn[0] | 0},${tn[1] | 0},${tn[2] | 0})`; ctx.fillRect(0, 0, this.w, this.h); ctx.globalCompositeOperation = 'source-over'; }
    if (night && !TL) this.drawLights(ctx, vis, occ, ox, oy, z);
    if (this.fest && !TL && night) this.drawFestival(ctx, ox, oy, z, now, night, true);
    this.drawWeather(ctx, wt, now, z, season);
    if (!TL) this.drawOverlays(ctx, vis, ox, oy, z, now);
    this.stats.ms += (performance.now() - t0 - this.stats.ms) * 0.1;
  }
  drawTileDetail(ctx, x0, y0, x1, y1, ox, oy, z, season) {
    const tiles = this.tiles, W = this.W, tn = this.frame >> 3, sz = Math.ceil(z) + 0.6, V = this.var;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x, t = tiles[i], v = V[i];
      if (t === T.WATER) {
        const px = ox + x * z, py = oy + y * z;
        if (((tn + v + x * 3 + y) & 15) === 0) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(px + z * 0.2, py + z * 0.45, z * 0.5, Math.max(1, z * 0.06)); }
        const l = x > 0 && tiles[i - 1] !== T.WATER && tiles[i - 1] !== T.BRIDGE, r = x < W - 1 && tiles[i + 1] !== T.WATER && tiles[i + 1] !== T.BRIDGE, e = Math.max(1, z * 0.12);
        ctx.fillStyle = '#d8c58f'; if (l) ctx.fillRect(px, py, e, sz); if (r) ctx.fillRect(px + z - e, py, e, sz);
      } else if (t === T.BRIDGE) {
        const px = ox + x * z, py = oy + y * z; ctx.fillStyle = '#6e5233'; ctx.fillRect(px, py + z * 0.3, sz, Math.max(1, z * 0.06)); ctx.fillRect(px, py + z * 0.7, sz, Math.max(1, z * 0.06)); ctx.fillStyle = '#5a4329'; ctx.fillRect(px, py, sz, Math.max(1, z * 0.1)); ctx.fillRect(px, py + z * 0.9, sz, Math.max(1, z * 0.1));
      } else if (t === T.FIELD && z >= 7) { const px = ox + x * z, py = oy + y * z; ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let k = 1; k < 4; k++) ctx.fillRect(px, py + k * z / 4, sz, 1); }
      else if (t === T.PLAZA && z >= 8) { const px = ox + x * z, py = oy + y * z; ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(px, py, sz, 1); ctx.fillRect(px, py, 1, sz); }
      else if (t === T.ROAD && z >= 9 && (v & 15) === 0) { const px = ox + x * z, py = oy + y * z; ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(px + z * 0.4, py + z * 0.4, z * 0.2, z * 0.2); }
      else if (t === T.GRASS && z >= 8 && v > 238) { const px = ox + x * z, py = oy + y * z; ctx.fillStyle = season === 3 ? '#fff' : ['#f4e27a', '#f2f2f2', '#e88aa8', '#b79af0'][v & 3]; ctx.fillRect(px + (v % 7) * z / 8 + 2, py + ((v >> 3) % 7) * z / 8 + 2, Math.max(1.5, z * 0.1), Math.max(1.5, z * 0.1)); }
      else if (t === T.GRAVE && z >= 9 && (v & 3) === 0 && (x & 1) === 0) { const px = ox + x * z, py = oy + y * z; ctx.fillStyle = '#9a9ea3'; ctx.fillRect(px + z * 0.3, py + z * 0.25, z * 0.4, z * 0.5); }
    }
  }
  drawTrees(ctx, x0, y0, x1, y1, ox, oy, z, season) {
    const leaf = season === 3 ? ['#9fb5a8', '#b3c6ba'] : season === 2 ? ['#b5762f', '#c98d3a', '#a85c2a'] : ['#2f6b2f', '#3a7d36', '#2c6430'], tr = this.trees, sway = Math.sin(this.frame / 50) * 0.03;
    for (let i = 0; i < tr.length; i += 3) {
      const x = tr[i], y = tr[i + 1]; if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
      const v = tr[i + 2], px = ox + (x + 0.5) * z, py = oy + (y + 0.5) * z, r = z * (0.62 + (v % 5) * 0.04);
      if (z < 6) { ctx.fillStyle = leaf[v % leaf.length]; ctx.beginPath(); ctx.arc(px, py, r * 0.9, 0, TAU); ctx.fill(); continue; }
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(px + z * 0.1, py + z * 0.2, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a3d25'; ctx.fillRect(px - z * 0.06, py, z * 0.12, z * 0.4);
      ctx.fillStyle = leaf[v % leaf.length]; ctx.beginPath(); ctx.arc(px + sway * z * (v % 3 - 1), py - z * 0.12, r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(px - r * 0.25, py - r * 0.45, r * 0.5, 0, TAU); ctx.fill();
    }
  }
  drawBuilding(ctx, b, sty, ox, oy, z, night, n) {
    const px = ox + b.x * z, py = oy + b.y * z, bw = b.w * z, bh = b.h * z;
    let roof = sty.roof;
    if (!roof) { roof = this.houseColor.get(b.id); if (!roof) { roof = HOUSE_ROOFS[Math.floor(hash(b.id, 5, 9) * HOUSE_ROOFS.length)]; this.houseColor.set(b.id, roof); } }
    ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fillRect(px + z * 0.2, py + z * 0.25, bw, bh);
    ctx.fillStyle = sty.wall || '#d9cdb4'; ctx.fillRect(px, py, bw, bh);
    const m0 = Math.max(1, z * 0.1);
    ctx.fillStyle = roof; ctx.fillRect(px + m0, py + m0, bw - 2 * m0, bh - 2 * m0);
    ctx.fillStyle = shade(roof, 0.82); ctx.fillRect(px + m0, py + bh / 2 - z * 0.05, bw - 2 * m0, Math.max(1, z * 0.1));
    if (z >= 8) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(px + m0, py + m0, bw - 2 * m0, Math.max(1, z * 0.12)); }
    if (sty.units && z >= 7) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < b.w; k += 2) for (let j = 0; j < b.h; j += 2) ctx.fillRect(px + (k + 0.35) * z, py + (j + 0.35) * z, z * 0.7, z * 0.7); }
    if (b.type === 'house' && z >= 8) { ctx.fillStyle = '#6b5a4e'; ctx.fillRect(px + bw * 0.72, py + bh * (hash(b.id, 3, 1) > 0.5 ? 0.15 : 0.6), z * 0.5, z * 0.5); }
    // door
    const dx = ox + b.door.x * z, dy = oy + b.door.y * z, dc = this.openNow(b) ? '#f0c040' : '#4a3322';
    ctx.fillStyle = dc; if (b.doorSide === 'N') ctx.fillRect(dx + z * 0.15, py - z * 0.02, z * 0.7, z * 0.28); else ctx.fillRect(dx + z * 0.15, py + bh - z * 0.26, z * 0.7, z * 0.28);
    if (sty.glyph && z >= 5) { ctx.fillStyle = ctx.strokeStyle = 'rgba(255,255,255,0.9)'; const s = Math.min(z * 1.3, Math.min(bw, bh) * 0.6); GLYPHS[sty.glyph](ctx, px + bw / 2, py + bh * 0.52, s); }
    if (night && n && z >= 5) {
      ctx.fillStyle = 'rgba(255,214,120,0.95)'; const cnt = Math.max(2, Math.floor(b.w / 2));
      for (let k = 0; k < cnt; k++) ctx.fillRect(px + bw * (k + 0.5) / cnt - z * 0.15, b.doorSide === 'N' ? py + bh - z * 0.75 : py + z * 0.35, z * 0.3, z * 0.3);
    }
  }
  openNow() { return false; }
  drawLights(ctx, vis, occ, ox, oy, z) {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of vis) {
      const n = occ.get(b.id); if (!n) continue;
      const cx = ox + (b.x + b.w / 2) * z, cy = oy + (b.door.y + (b.doorSide === 'N' ? -0.5 : 0.5)) * z, r = z * (1.6 + Math.min(2, b.w * 0.15));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,190,90,0.38)'); g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  drawFestival(ctx, ox, oy, z, now, night, glow) {
    const F = this.fest, b = F.venueId != null ? this.bById.get(F.venueId) : null; if (!b) return;
    const vigil = F.kind === 'vigil', cols = ['#e8486f', '#f5c518', '#3ea0e0', '#5ac06a', '#b86bc4', '#ff8a3d'];
    const x0 = ox + (b.x - 1) * z, y0 = oy + (b.y - 1) * z, x1 = ox + (b.x + b.w + 1) * z, y1 = oy + (b.y + b.h + 1) * z;
    if (glow) { // lantern glow
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i <= 10; i++) { const t = i / 10, px = x0 + (x1 - x0) * t, py = y0 + Math.sin(t * Math.PI * 6) * z * 0.1; const g = ctx.createRadialGradient(px, py, 0, px, py, z * 1.8); g.addColorStop(0, vigil ? 'rgba(255,170,70,0.4)' : 'rgba(255,230,140,0.34)'); g.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = g; ctx.fillRect(px - z * 1.8, py - z * 1.8, z * 3.6, z * 3.6); }
      ctx.globalCompositeOperation = 'source-over';
      if (!vigil && this.hour >= 19.5) this.fireworks(ctx, (x0 + x1) / 2, (y0 + y1) / 2 - z * 3, z, now);
      return;
    }
    if (z < 5) { ctx.strokeStyle = vigil ? '#ffb347' : '#ffd84a'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); return; }
    // bunting along the top and bottom edges
    const edge = (xa, ya, xb, yb, n) => {
      ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n, x = xa + (xb - xa) * t, y = ya + (yb - ya) * t + Math.sin(t * Math.PI * n) * 0 + (i % 2 ? z * 0.12 : 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = xa + (xb - xa) * t, y = ya + (yb - ya) * t + (i % 2 ? z * 0.12 : 0), s = z * 0.28 + Math.sin(this.frame / 12 + i) * z * 0.02; ctx.fillStyle = vigil ? (i & 1 ? '#ffcc66' : '#ffe9b3') : cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * 1.6); ctx.fill(); }
    };
    const n = Math.max(6, Math.round(((x1 - x0) / z)));
    edge(x0, y0, x1, y0, n); edge(x0, y1, x1, y1, n);
    // banner + balloons
    ctx.fillStyle = vigil ? '#3a3350' : '#d6322a'; const bw = Math.min(z * 7, (x1 - x0) * 0.8), bx = (x0 + x1) / 2 - bw / 2; ctx.fillRect(bx, y0 - z * 1.3, bw, z * 0.85);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(9, z * 0.55)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((F.name || 'Festival').slice(0, 26), bx + bw / 2, y0 - z * 0.87);
    if (!vigil) for (let i = 0; i < 5; i++) { const bxp = x0 + ((i + 0.5) / 5) * (x1 - x0), by = y0 - z * (1.9 + Math.sin(this.frame / 30 + i * 1.7) * 0.15 + (i % 2) * 0.5); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bxp, by + z * 0.4); ctx.lineTo(bxp, y0 - z * 1.3); ctx.stroke(); ctx.fillStyle = cols[(i * 2) % cols.length]; ctx.beginPath(); ctx.ellipse(bxp, by, z * 0.3, z * 0.38, 0, 0, TAU); ctx.fill(); }
    if (vigil) for (let i = 0; i < 6; i++) { const cx = x0 + ((i + 0.5) / 6) * (x1 - x0), cy = y1 + z * 0.3; ctx.fillStyle = '#f3ead0'; ctx.fillRect(cx - z * 0.06, cy, z * 0.12, z * 0.35); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(cx, cy - z * 0.08, z * 0.07, z * 0.13 * (1 + Math.sin(this.frame / 4 + i) * 0.2), 0, 0, TAU); ctx.fill(); }
    else for (let i = 0; i < 24; i++) { const t = (this.frame * 0.4 + i * 37) % 120 / 120, cx = x0 + hash(i, 1, 8) * (x1 - x0), cy = y0 - z + t * (y1 - y0 + z * 2); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(cx + Math.sin(t * 9 + i) * z * 0.3, cy, Math.max(1.5, z * 0.1), Math.max(1.5, z * 0.1)); }
  }
  fireworks(ctx, cx, cy, z, now) {
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const ph = ((now / 1000) * 0.5 + k / 3) % 1, id = Math.floor((now / 1000) * 0.5 + k / 3), ex = cx + (hash(id, k, 3) - 0.5) * z * 14, ey = cy - hash(id, k, 4) * z * 4, r = ph * z * 3.2, col = ['255,120,120', '120,200,255', '255,230,120', '190,140,255'][(id + k) & 3];
      if (ph < 0.15) { ctx.fillStyle = `rgba(${col},0.9)`; ctx.fillRect(ex - 1, ey + (0.15 - ph) * z * 20, 2, 5); continue; }
      ctx.fillStyle = `rgba(${col},${1 - ph})`; for (let i = 0; i < 18; i++) { const a = i * TAU / 18; ctx.fillRect(ex + Math.cos(a) * r - 1, ey + Math.sin(a) * r + ph * ph * z * 1.2 - 1, 2.4, 2.4); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  drawPeople(ctx, ox, oy, z, now, TL) {
    const sel = this.selectedId, dots = TL || z < 5.5, s = z * 0.34, names = this.store.state.names, walk = now / 120;
    const list = [...this.P.values()]; list.sort((a, b) => a.y - b.y);
    this.visPeople = []; this.nameQ = [];
    for (const p of list) {
      const inside = p.fl & 1, px = ox + (p.x + 0.5) * z, py = oy + (p.y + 0.55) * z;
      if (inside) { if (p.id === sel) this.ringAt(ctx, px, py, z, now); continue; }
      if (px < -20 || py < -20 || px > this.w + 20 || py > this.h + 20) continue;
      const nm = names.get(p.id), col = jobColor(nm ? nm.job : '');
      if (dots) { const r = Math.max(1.4, Math.min(3.6, z * 0.34)); ctx.fillStyle = (p.fl & 4) ? '#ffe08a' : col; ctx.fillRect(px - r, py - r, r * 2, r * 2); if (p.fl & 8) { ctx.fillStyle = '#7ad94f'; ctx.fillRect(px - 1, py - r - 3, 2, 2); } if (p.id === sel) this.ringAt(ctx, px, py, z, now); this.visPeople.push(p, px, py); continue; }
      const kid = p.fl & 4, k = kid ? 0.74 : 1, bob = (p.fl & 16) ? Math.sin(walk + p.id) * s * 0.08 : 0, y = py + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px, py + s * 0.5, s * 0.6 * k, s * 0.25 * k, 0, 0, TAU); ctx.fill();
      if (p.fl & 16 && z >= 10) { const lg = Math.sin(walk * 1.3 + p.id) * s * 0.18; ctx.fillStyle = '#3b3f48'; ctx.fillRect(px - s * 0.28 * k + lg, y + s * 0.25 * k, s * 0.2 * k, s * 0.3 * k); ctx.fillRect(px + s * 0.08 * k - lg, y + s * 0.25 * k, s * 0.2 * k, s * 0.3 * k); }
      ctx.fillStyle = col; ctx.fillRect(px - s * 0.4 * k, y - s * 0.6 * k, s * 0.8 * k, s * 1.1 * k);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px - s * 0.4 * k, y + s * 0.2 * k, s * 0.8 * k, s * 0.3 * k);
      const sk = nm ? Math.floor(lerp(240, 130, nm.skin)) : 200; ctx.fillStyle = `rgb(${sk},${sk * 0.8 | 0},${sk * 0.62 | 0})`;
      ctx.beginPath(); ctx.arc(px, y - s * 0.85 * k, s * 0.42 * k, 0, TAU); ctx.fill();
      const hc = nm ? nm.hair : 0.3; ctx.fillStyle = (p.age > 62) ? '#cfcfcf' : hc < 0.35 ? '#2a1d14' : hc < 0.6 ? '#5a3a22' : hc < 0.8 ? '#c9a24a' : hc < 0.92 ? '#a0452a' : '#c8c8c8';
      ctx.beginPath(); ctx.arc(px, y - s * 1.0 * k, s * 0.4 * k, Math.PI, 0); ctx.fill();
      if (p.fl & 8) { ctx.fillStyle = '#7ad94f'; ctx.beginPath(); ctx.arc(px + s * 0.5, y - s * 1.5 * k, s * 0.16, 0, TAU); ctx.fill(); }
      if ((z >= 15 || p.id === sel) && nm) this.nameQ.push(nm.first, px, py + s * 0.75);
      if (p.id === sel) this.ringAt(ctx, px, py - s * 0.2, z, now);
      this.visPeople.push(p, px, py - s * 1.6);
    }
    // selected route
    const sp = sel != null ? this.P.get(sel) : null;
    if (sp && !TL) { const dt = this.store.state.detail; if (dt && dt.id === sel && dt.action && dt.action.status === 0 && dt.dest) { /* reserved */ } }
  }
  ringAt(ctx, x, y, z, now) { const r = Math.max(7, z * 0.55) * (1 + Math.sin(now / 220) * 0.06); ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, TAU); ctx.stroke(); }
  drawWeather(ctx, wt, now, z, season) {
    const w = this.w, h = this.h, f = this.frame;
    if (wt === 'rain' || wt === 'storm') {
      const storm = wt === 'storm', n = storm ? 260 : 150;
      ctx.fillStyle = storm ? 'rgba(20,30,50,0.28)' : 'rgba(40,60,90,0.12)'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(180,205,240,0.5)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < n; i++) { const sx = (hash(i, 1, 5) * w + f * (storm ? 9 : 3)) % w, sy = (hash(i, 2, 5) * h + f * (storm ? 22 : 14)) % h; ctx.moveTo(sx, sy); ctx.lineTo(sx + (storm ? -7 : -3), sy + (storm ? 15 : 9)); }
      ctx.stroke();
      if (storm) { const fl = Math.sin(now / 1700) * Math.sin(now / 530); if (fl > 0.93) { ctx.fillStyle = `rgba(255,255,255,${(fl - 0.93) * 9})`; ctx.fillRect(0, 0, w, h); } }
    } else if (wt === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 130; i++) { const sx = (hash(i, 1, 5) * w + Math.sin(f / 40 + i) * 22) % w, sy = (hash(i, 2, 5) * h + f * (0.8 + hash(i, 3, 5) * 1.6)) % h, r = 1 + hash(i, 4, 5) * 1.8; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); }
    } else if (wt === 'fog') { ctx.fillStyle = 'rgba(220,225,230,0.26)'; ctx.fillRect(0, 0, w, h); const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(((f / 400) % 1), 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    else if (wt === 'heatwave') { ctx.fillStyle = 'rgba(255,170,60,0.10)'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 6; i++) ctx.fillRect(0, ((f * 0.6 + i * h / 6) % h), w, 2 + Math.sin(f / 9 + i) * 1.5); }
    else if (this.tps < 2000 && !this.timelapse) { // clear: drifting cloud shadows, falling leaves / petals
      ctx.fillStyle = 'rgba(20,30,50,0.07)'; for (let i = 0; i < 4; i++) { const cx = ((now / 90 + i * w * 0.45) % (w + 400)) - 200, cy = hash(i, 7, 7) * h; ctx.beginPath(); ctx.ellipse(cx, cy, 150, 70, 0.3, 0, TAU); ctx.fill(); }
      if ((season === 2 || season === 0) && z >= 6) { ctx.fillStyle = season === 2 ? 'rgba(200,120,40,0.85)' : 'rgba(255,190,210,0.85)'; for (let i = 0; i < 22; i++) { const sx = (hash(i, 1, 6) * w + Math.sin(f / 30 + i) * 30 + f * 0.6) % w, sy = (hash(i, 2, 6) * h + f * (0.7 + hash(i, 3, 6))) % h; ctx.fillRect(sx, sy, 3, 2); } }
    }
  }
  drawOverlays(ctx, vis, ox, oy, z, now) {
    ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.fillStyle = '#fff';
    for (let i = 0; i < this.nameQ.length; i += 3) { ctx.strokeText(this.nameQ[i], this.nameQ[i + 1], this.nameQ[i + 2]); ctx.fillText(this.nameQ[i], this.nameQ[i + 1], this.nameQ[i + 2]); }
    // building labels with greedy collision avoidance
    const cand = []; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of vis) {
      const sty = styleOf(b.type), pri = sty.pri ?? 2; if (pri === 0 && z < 24) continue;
      const minZ = pri >= 4 ? 5.2 : pri === 3 ? 6.5 : pri === 2 ? 9 : 13; if (z < minZ && b.id !== this.selectedBuilding) continue;
      cand.push([pri + (b.id === this.selectedBuilding ? 9 : 0), b]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const fs = Math.max(9.5, Math.min(13.5, z * 0.8)); ctx.font = `600 ${fs}px system-ui,sans-serif`; const placed = [];
    for (const [, b] of cand) {
      const cx = ox + (b.x + b.w / 2) * z, cy = oy + (b.y + b.h + 0.02) * z + (b.open ? -b.h * z / 2 : fs * 0.65), tw = ctx.measureText(b.name).width + 10, r = [cx - tw / 2, cy - fs * 0.7, tw, fs * 1.4];
      if (r[0] > this.w || r[0] + r[2] < 0 || r[1] > this.h || r[1] + r[3] < 0) continue;
      if (placed.some((q) => r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1])) continue;
      placed.push(r);
      ctx.fillStyle = 'rgba(14,18,24,0.72)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(r[0], r[1], r[2], r[3], 5); else ctx.rect(r[0], r[1], r[2], r[3]); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(b.name, cx, cy + 0.5);
    }
    if (this.selectedBuilding != null) { const b = this.bById.get(this.selectedBuilding); if (b) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2.5; ctx.strokeRect(ox + b.x * z - 2, oy + b.y * z - 2, b.w * z + 4, b.h * z + 4); } }
    // emotes
    const E = this.emotes; for (let i = E.length - 1; i >= 0; i--) if (now - E[i].born > 2600) E.splice(i, 1);
    if (z >= 6.5) {
      let drawn = 0;
      for (const e of E) {
        if (drawn > 28) break; const age = (now - e.born) / 2600, [ta, tb] = EMOTE_OF[e.type] || ['dots', 'dots'];
        for (const [id, ty] of [[e.a, ta], [e.b, tb]]) { const p = this.P.get(id); if (!p) continue; let x, y; if (p.fl & 1) { const b = this.doorAt.get(Math.round(p.y) * this.W + Math.round(p.x)); if (!b || ty === 'dots') continue; x = ox + (b.x + b.w / 2) * z; y = oy + b.y * z - z * 0.3; } else { x = ox + (p.x + 0.5) * z; y = oy + p.y * z - z * 0.55; } if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue; if (ty === 'dots' && !(this.selectedId != null && (id === this.selectedId || (id === e.a ? e.b : e.a) === this.selectedId))) continue; this.emoteBubble(ctx, x, y - age * z * 0.9, Math.max(8, Math.min(15, z * 0.72)), ty, e.type, age); drawn++; }
      }
      // speech bubbles (explicit) + selected thought
      for (const [id, text] of this.store.state.bubbles || []) { const p = this.P.get(id); if (p && !(p.fl & 1) && z >= 9) this.textBubble(ctx, ox + (p.x + 0.5) * z, oy + p.y * z - z * 0.7, text, false); }
      const d = this.store.state.detail, sp = this.selectedId != null ? this.P.get(this.selectedId) : null;
      if (d && sp && d.id === this.selectedId && z >= 9 && d.thought && !(sp.fl & 1)) this.textBubble(ctx, ox + (sp.x + 0.5) * z, oy + sp.y * z - z * 1.2, d.thought, true);
    }
  }
  emoteBubble(ctx, x, y, r, ty, type, age) {
    const a = age < 0.1 ? age * 10 : age > 0.75 ? (1 - age) * 4 : 1, pop = age < 0.1 ? 0.6 + age * 4 : 1; ctx.globalAlpha = Math.max(0, a); r *= pop;
    ctx.fillStyle = EMOTE_BG[type] || '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r * 0.25, y + r * 0.85); ctx.lineTo(x, y + r * 1.4); ctx.lineTo(x + r * 0.25, y + r * 0.85); ctx.fill();
    (EMOTES[ty] || EMOTES.dots)(ctx, x, y, r); ctx.globalAlpha = 1;
  }
  textBubble(ctx, x, y, text, thought) {
    text = text.length > 52 ? text.slice(0, 50) + '…' : text; ctx.font = `${thought ? 'italic ' : ''}12px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width + 14, hh = 22, bx = Math.max(4, Math.min(this.w - tw - 4, x - tw / 2)), by = y - hh;
    ctx.fillStyle = thought ? 'rgba(255,248,225,0.95)' : 'rgba(255,255,255,0.95)'; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, tw, hh, 8); else ctx.rect(bx, by, tw, hh); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, by + hh); ctx.lineTo(x, by + hh + 6); ctx.lineTo(x + 4, by + hh); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillText(text, bx + tw / 2, by + hh / 2 + 0.5);
  }
}
