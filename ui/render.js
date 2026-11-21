// Canvas renderer: tiles, decorations, buildings, people (interpolated), day/night, weather. Browser only.
import { T } from '../sim/map.js';
import { hash2 } from '../sim/rng.js';

const GRASS = [['#6a9a47', '#6fa04b', '#639340', '#74a44f'], ['#5f9440', '#66a046', '#598a3b', '#6aa84c'], ['#8a9a45', '#92a14a', '#818f40', '#9aa650'], ['#dfe6ea', '#e6ecef', '#d6dee3', '#eef2f4']];
const FIELD = [['#86ad4f', '#7fa548'], ['#c9b44c', '#bfa840'], ['#a98446', '#9d783d'], ['#d5dde0', '#cad3d7']];
const ROOF = { house: null, farm: '#a8402f', bakery: '#d9a35a', smithy: '#555a63', tavern: '#8a3d2e', market: '#3f9a84', clinic: '#dfe5ec', school: '#c98a35', temple: '#7d72b8', townhall: '#3e639a', jail: '#5d6268', mill: '#8f7f66', inn: '#bd6a22', tailor: '#a8517f', carpenter: '#8f5d2d' };
const HOUSE_ROOFS = ['#a8553a', '#93503a', '#7a5f4d', '#84703f', '#5d7282', '#9b6a4a'];
const SHIRTS = { farmer: '#7a9a3e', laborer: '#9c8a5a', baker: '#eadfb0', smith: '#8a6a58', tavernkeeper: '#b5452f', server: '#d98a4a', merchant: '#3f9a84', doctor: '#f0f0f5', nurse: '#cfe3f0', teacher: '#5a78b0', priest: '#7d72b8', mayor: '#3e639a', clerk: '#6f86a8', captain: '#444a55', guard: '#555d6a', miller: '#c8b89a', innkeeper: '#bd6a22', tailor: '#a8517f', carpenter: '#8f5d2d', gardener: '#4f9a4a', gravedigger: '#555', student: '#e0a84a', child: '#e8c060', retired: '#9a9a9a', unemployed: '#b0a090' };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const TINT = [[0, [60, 70, 130]], [5, [70, 80, 140]], [6.5, [255, 190, 150]], [8, [255, 255, 255]], [17, [255, 255, 255]], [19, [255, 200, 150]], [20.7, [90, 95, 160]], [24, [60, 70, 130]]];
function tintAt(h) {
  for (let i = 1; i < TINT.length; i++) if (h <= TINT[i][0]) { const [h0, c0] = TINT[i - 1], [h1, c1] = TINT[i], t = (h - h0) / (h1 - h0); return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)]; }
  return TINT[0][1];
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.world = world;
    const m = world.map;
    this.cam = { x: m.center.x, y: m.center.y, zoom: 10 };
    this.var = new Uint8Array(m.W * m.H);
    for (let i = 0; i < this.var.length; i++) this.var[i] = Math.floor(hash2(i % m.W, (i / m.W) | 0, 11) * 256);
    this.selectedId = null; this.selectedBuilding = null;
    this.frame = 0; this.dpr = 1;
    this.houseColor = new Map();
    this.resize();
  }
  resize() {
    const c = this.canvas, r = c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(1, Math.round(r.width * this.dpr)); c.height = Math.max(1, Math.round(r.height * this.dpr));
    this.w = r.width; this.h = r.height;
  }
  fit() { const m = this.world.map; this.cam.zoom = Math.min(this.w / m.W, this.h / m.H); this.cam.x = m.W / 2; this.cam.y = m.H / 2; }
  toScreen(x, y) { const z = this.cam.zoom; return [(x - this.cam.x) * z + this.w / 2, (y - this.cam.y) * z + this.h / 2]; }
  toWorld(sx, sy) { const z = this.cam.zoom; return [(sx - this.w / 2) / z + this.cam.x, (sy - this.h / 2) / z + this.cam.y]; }
  pan(dx, dy) { this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; this.clamp(); }
  zoomAt(sx, sy, f) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(3, Math.min(60, this.cam.zoom * f));
    const [nx, ny] = this.toWorld(sx, sy);
    this.cam.x += wx - nx; this.cam.y += wy - ny; this.clamp();
  }
  clamp() { const m = this.world.map; this.cam.x = Math.max(0, Math.min(m.W, this.cam.x)); this.cam.y = Math.max(0, Math.min(m.H, this.cam.y)); }
  // interpolated tile-space position of a person
  posOf(p, alpha, out) {
    const w = this.world;
    if (p.segTick === w.tick && p.seg.length >= 4 && alpha < 1) {
      const s = p.seg, n = s.length / 2;
      let L = 0; for (let i = 1; i < n; i++) L += Math.hypot(s[2 * i] - s[2 * i - 2], s[2 * i + 1] - s[2 * i - 1]);
      let d = L * alpha;
      for (let i = 1; i < n; i++) {
        const sl = Math.hypot(s[2 * i] - s[2 * i - 2], s[2 * i + 1] - s[2 * i - 1]);
        if (d <= sl || i === n - 1) { const t = sl ? Math.min(1, d / sl) : 1; out.x = lerp(s[2 * i - 2], s[2 * i], t); out.y = lerp(s[2 * i - 1], s[2 * i + 1], t); return out; }
        d -= sl;
      }
    }
    out.x = p.x; out.y = p.y; return out;
  }
  draw(alpha = 1) {
    const ctx = this.ctx, w = this.world, m = w.map, z = this.cam.zoom;
    this.frame++;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1b2a1a'; ctx.fillRect(0, 0, this.w, this.h);
    const [wx0, wy0] = this.toWorld(0, 0), [wx1, wy1] = this.toWorld(this.w, this.h);
    const x0 = Math.max(0, Math.floor(wx0)), y0 = Math.max(0, Math.floor(wy0)), x1 = Math.min(m.W - 1, Math.ceil(wx1)), y1 = Math.min(m.H - 1, Math.ceil(wy1));
    const season = w.time.season, tiles = m.tiles;
    const ox = this.w / 2 - this.cam.x * z, oy = this.h / 2 - this.cam.y * z;
    const gset = GRASS[season], fset = FIELD[season];
    const sz = Math.ceil(z) + 0.6;
    // ---- tiles
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * m.W + x, t = tiles[i], v = this.var[i];
      const px = ox + x * z, py = oy + y * z;
      let col;
      switch (t) {
        case T.GRASS: case T.TREE: case T.BUILDING: col = gset[v & 3]; break;
        case T.ROAD: col = (v & 7) < 2 ? '#a89472' : '#b5a07a'; break;
        case T.WATER: col = (v & 3) === 0 ? '#3a74a3' : '#3f7fb0'; break;
        case T.BRIDGE: col = '#8a6a45'; break;
        case T.FIELD: col = fset[y & 1]; break;
        case T.PLAZA: col = ((x + y) & 1) ? '#cdc4b2' : '#c4bba8'; break;
        case T.PARK: col = season === 3 ? '#d6e2dc' : '#58994a'; break;
        case T.GRAVE: col = season === 3 ? '#d3dad6' : '#6f8e5c'; break;
        default: col = '#3a74a3';
      }
      ctx.fillStyle = col; ctx.fillRect(px, py, sz, sz);
      if (t === T.WATER) {
        if (z >= 6) {
          const tn = (this.frame >> 3) + v;
          if (((tn + x * 3 + y) & 15) === 0) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(px + z * 0.2, py + z * 0.45, z * 0.5, Math.max(1, z * 0.06)); }
          const l = x > 0 && tiles[i - 1] !== T.WATER && tiles[i - 1] !== T.BRIDGE, r = x < m.W - 1 && tiles[i + 1] !== T.WATER && tiles[i + 1] !== T.BRIDGE;
          ctx.fillStyle = '#d8c58f';
          if (l) ctx.fillRect(px, py, Math.max(1, z * 0.12), sz); if (r) ctx.fillRect(px + z - Math.max(1, z * 0.12), py, Math.max(1, z * 0.12), sz);
        }
      } else if (t === T.BRIDGE && z >= 6) {
        ctx.fillStyle = '#6e5233'; ctx.fillRect(px, py + z * 0.3, sz, Math.max(1, z * 0.06)); ctx.fillRect(px, py + z * 0.7, sz, Math.max(1, z * 0.06));
        ctx.fillStyle = '#5a4329'; ctx.fillRect(px, py, sz, Math.max(1, z * 0.1)); ctx.fillRect(px, py + z * 0.9, sz, Math.max(1, z * 0.1));
      } else if (t === T.FIELD && z >= 7) {
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        for (let k = 1; k < 4; k++) ctx.fillRect(px, py + k * z / 4, sz, 1);
      } else if (t === T.PLAZA && z >= 8) {
        ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(px, py, sz, 1); ctx.fillRect(px, py, 1, sz);
      } else if (t === T.GRASS && z >= 8 && v > 238) {
        ctx.fillStyle = season === 3 ? '#fff' : ['#f4e27a', '#f2f2f2', '#e88aa8', '#b79af0'][v & 3];
        ctx.fillRect(px + (v % 7) * z / 8 + 2, py + ((v >> 3) % 7) * z / 8 + 2, Math.max(1.5, z * 0.1), Math.max(1.5, z * 0.1));
      } else if (t === T.GRAVE && z >= 9 && (v & 3) === 0 && (x & 1) === 0) {
        ctx.fillStyle = '#9a9ea3'; ctx.fillRect(px + z * 0.3, py + z * 0.25, z * 0.4, z * 0.5);
      } else if (t === T.FOUNTAIN) {
        // drawn below as one piece
      }
    }
    // fountain
    { const [fx, fy] = this.toScreen(47, 44); ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.arc(fx + 1.5 * z, fy + 1.5 * z, 1.5 * z, 0, 6.3); ctx.fill(); ctx.fillStyle = '#4c8fc0'; ctx.beginPath(); ctx.arc(fx + 1.5 * z, fy + 1.5 * z, 1.2 * z, 0, 6.3); ctx.fill(); ctx.fillStyle = '#cfe8f6'; ctx.beginPath(); ctx.arc(fx + 1.5 * z, fy + 1.5 * z, 0.35 * z, 0, 6.3); ctx.fill(); }
    // ---- trees (park decor + forest)
    const leaf = season === 3 ? ['#9fb5a8', '#b3c6ba'] : season === 2 ? ['#b5762f', '#c98d3a', '#a85c2a'] : ['#2f6b2f', '#3a7d36', '#2c6430'];
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (x < 0 || y < 0 || x >= m.W || y >= m.H) continue;
      const i = y * m.W + x, t = tiles[i];
      let tree = t === T.TREE;
      if (!tree && t === T.PARK) tree = this.var[i] < 34;
      if (!tree) continue;
      const v = this.var[i], px = ox + (x + 0.5) * z, py = oy + (y + 0.5) * z, r = z * (0.62 + (v % 5) * 0.04);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(px + z * 0.1, py + z * 0.2, r, 0, 6.3); ctx.fill();
      if (z >= 6) { ctx.fillStyle = '#5a3d25'; ctx.fillRect(px - z * 0.06, py, z * 0.12, z * 0.4); }
      ctx.fillStyle = leaf[v % leaf.length]; ctx.beginPath(); ctx.arc(px, py - z * 0.12, r, 0, 6.3); ctx.fill();
      if (z >= 6) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(px - r * 0.25, py - r * 0.45, r * 0.5, 0, 6.3); ctx.fill(); }
    }
    // ---- buildings
    const night = w.time.hourFloat >= 18 || w.time.hourFloat < 6.5;
    const labels = [];
    for (const b of w.buildings.values()) {
      if (b.x > x1 + 1 || b.y > y1 + 1 || b.x + b.w < x0 - 1 || b.y + b.h < y0 - 1) continue;
      const px = ox + b.x * z, py = oy + b.y * z, bw = b.w * z, bh = b.h * z;
      if (!b.open) {
        let roof = ROOF[b.type];
        if (!roof) { roof = this.houseColor.get(b.id); if (!roof) { roof = HOUSE_ROOFS[Math.floor(hash2(b.id, 5, 9) * HOUSE_ROOFS.length)]; this.houseColor.set(b.id, roof); } }
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + z * 0.18, py + z * 0.22, bw, bh);
        ctx.fillStyle = '#d9cdb4'; ctx.fillRect(px, py, bw, bh);
        const m0 = z * 0.1;
        ctx.fillStyle = roof; ctx.fillRect(px + m0, py + m0, bw - 2 * m0, bh - 2 * m0);
        const [rr, rg, rb] = hex(roof);
        ctx.fillStyle = `rgb(${rr * 0.8 | 0},${rg * 0.8 | 0},${rb * 0.8 | 0})`;
        ctx.fillRect(px + m0, py + bh / 2 - z * 0.05, bw - 2 * m0, Math.max(1, z * 0.1)); // ridge
        if (z >= 8) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; for (let k = 1; k < b.w * 2; k++) ctx.fillRect(px + m0 + k * z / 2, py + m0, 1, bh - 2 * m0); }
        if (b.type === 'house' && z >= 8) { ctx.fillStyle = '#6b5a4e'; ctx.fillRect(px + bw * 0.75, py + bh * (hash2(b.id, 3, 1) > 0.5 ? 0.15 : 0.6), z * 0.5, z * 0.5); }
        // door
        const dx = ox + b.door.x * z, dy = oy + b.door.y * z;
        ctx.fillStyle = '#4a3322';
        if (b.doorSide === 'N') ctx.fillRect(dx + z * 0.15, py - z * 0.02, z * 0.7, z * 0.28); else ctx.fillRect(dx + z * 0.15, py + bh - z * 0.26, z * 0.7, z * 0.28);
        if (b.type === 'clinic' && z >= 8) { ctx.fillStyle = '#d33'; ctx.fillRect(px + bw / 2 - z * 0.12, py + bh / 2 - z * 0.45, z * 0.24, z * 0.9); ctx.fillRect(px + bw / 2 - z * 0.45, py + bh / 2 - z * 0.12, z * 0.9, z * 0.24); }
        if (night && b.occupants.size && z >= 5) {
          ctx.fillStyle = 'rgba(255,214,120,0.9)';
          const n = Math.max(2, Math.floor(b.w / 2));
          for (let k = 0; k < n; k++) ctx.fillRect(px + bw * (k + 0.5) / n - z * 0.15, b.doorSide === 'N' ? py + bh - z * 0.75 : py + z * 0.35, z * 0.3, z * 0.3);
        }
      }
      if (b.type !== 'house' || z >= 22) labels.push(b);
    }
    // ---- people
    const cur = { x: 0, y: 0 };
    const dot = z < 6, s = z * 0.34;
    const list = w.living();
    for (let li = 0; li < list.length; li++) {
      const p = list[li];
      if (p.inside) continue;
      this.posOf(p, alpha, cur);
      const px = ox + (cur.x + 0.5) * z, py = oy + (cur.y + 0.55) * z;
      if (px < -20 || py < -20 || px > this.w + 20 || py > this.h + 20) continue;
      const age = (w.tick - p.birthTick) / 16128, k = age < 12 ? 0.75 : 1;
      if (dot) { ctx.fillStyle = SHIRTS[p.job] || '#ccc'; ctx.fillRect(px - 1, py - 1, 2.4, 2.4); continue; }
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px, py + s * 0.5, s * 0.6 * k, s * 0.25 * k, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = SHIRTS[p.job] || '#bbb'; ctx.fillRect(px - s * 0.4 * k, py - s * 0.6 * k, s * 0.8 * k, s * 1.1 * k);
      const sk = Math.floor(lerp(240, 130, p.genes.skinTone)); ctx.fillStyle = `rgb(${sk},${sk * 0.8 | 0},${sk * 0.62 | 0})`;
      ctx.beginPath(); ctx.arc(px, py - s * 0.85 * k, s * 0.42 * k, 0, 6.3); ctx.fill();
      const hc = p.genes.hairColor; ctx.fillStyle = hc < 0.35 ? '#2a1d14' : hc < 0.6 ? '#5a3a22' : hc < 0.8 ? '#c9a24a' : hc < 0.92 ? '#a0452a' : '#c8c8c8';
      ctx.beginPath(); ctx.arc(px, py - s * 1.0 * k, s * 0.4 * k, Math.PI, 0); ctx.fill();
      if (p.id === this.selectedId) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py - s * 0.2, s * 1.2, 0, 6.3); ctx.stroke(); }
      if (p.bubble && p.bubble.until > w.tick && z >= 8) {
        ctx.font = `${Math.max(10, z * 0.7)}px system-ui`; const tw = ctx.measureText(p.bubble.text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(px - tw / 2 - 4, py - s * 2.9, tw + 8, z * 0.9);
        ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.bubble.text, px, py - s * 2.9 + z * 0.45);
      }
    }
    // selected highlights (in-building or dot mode)
    const sp = this.selectedId != null ? w.people.get(this.selectedId) : null;
    if (sp && sp.alive) {
      if (sp.path && sp.currentAction && sp.currentAction.status === 0) {
        ctx.strokeStyle = 'rgba(255,224,102,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath();
        ctx.moveTo(ox + (sp.x + 0.5) * z, oy + (sp.y + 0.5) * z);
        for (let i = sp.pathIdx; i < sp.path.length; i++) ctx.lineTo(ox + (sp.path[i] % m.W + 0.5) * z, oy + (((sp.path[i] / m.W) | 0) + 0.5) * z);
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (sp.inside || dot) { this.posOf(sp, alpha, cur); ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox + (cur.x + 0.5) * z, oy + (cur.y + 0.5) * z, Math.max(6, z * 0.6), 0, 6.3); ctx.stroke(); }
    }
    if (this.selectedBuilding != null) { const b = w.buildings.get(this.selectedBuilding); if (b) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.strokeRect(ox + b.x * z, oy + b.y * z, b.w * z, b.h * z); } }
    // ---- day/night tint
    const tn = tintAt(w.time.hourFloat);
    if (tn[0] < 254 || tn[2] < 254) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${tn[0] | 0},${tn[1] | 0},${tn[2] | 0})`; ctx.fillRect(0, 0, this.w, this.h); ctx.globalCompositeOperation = 'source-over'; }
    // ---- weather
    const wt = w.weather.type;
    if (wt === 'rain' || wt === 'snow') {
      ctx.strokeStyle = wt === 'rain' ? 'rgba(170,200,235,0.45)' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = wt === 'rain' ? 1 : 2; ctx.beginPath();
      for (let i = 0; i < 140; i++) {
        const sx = (hash2(i, 1, 5) * this.w + (wt === 'rain' ? this.frame * 3 : Math.sin(this.frame / 40 + i) * 20)) % this.w, sy = (hash2(i, 2, 5) * this.h + this.frame * (wt === 'rain' ? 14 : 2.5)) % this.h;
        ctx.moveTo(sx, sy); ctx.lineTo(sx + (wt === 'rain' ? -3 : 0.5), sy + (wt === 'rain' ? 9 : 0.5));
      }
      ctx.stroke();
    } else if (wt === 'fog') { ctx.fillStyle = 'rgba(220,225,230,0.22)'; ctx.fillRect(0, 0, this.w, this.h); }
    // ---- labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of labels) {
      const big = b.type === 'square' || b.type === 'park' || b.type === 'cemetery';
      if (z < (big ? 7 : b.type === 'house' ? 22 : 9)) continue;
      const fs = Math.max(9, Math.min(14, z * 0.9));
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const cx = ox + (b.x + b.w / 2) * z, cy = oy + (b.y + b.h / 2) * z;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.fillStyle = '#fff';
      ctx.strokeText(b.name, cx, cy); ctx.fillText(b.name, cx, cy);
    }
  }
}
