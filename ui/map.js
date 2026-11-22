// Larkfield map view: cached static street map (render-modern.js drawMap) + live layer (people, occupancy badges,
// day/night lighting with lit windows, weather, labels, off-map arrivals/departures via the station).
import { drawMap } from './render-modern.js';
import { T } from '../sim/map/constants.js';

const S = 12; // static layer pixels per tile
const SEG_HUE = [32, 205, 330, 265, 175, 120, 15, 48, 290, 90, 0]; // per segment index (order of content/larkfield/segments.js)
const WALK = new Set([T.ROAD, T.PAVEMENT, T.PATH, T.ALLEY, T.PLATFORM, T.FOREC, T.YARD, T.PARK, T.GRASS, T.GARDEN, T.HARD, T.PLAY, T.CHURCHYARD, T.ALLOTMENT, T.PITCH]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const skinCol = (k) => `rgb(${Math.round(lerp(250, 110, k))},${Math.round(lerp(214, 70, k))},${Math.round(lerp(180, 48, k))})`;
const hairCol = (k) => hsl(lerp(22, 38, k) | 0, k < 0.15 ? 5 : 45, k < 0.15 ? 12 : lerp(14, 52, k), 1);
const CAT_COL = { retail: '#d9a441', food_drink: '#e0674c', service: '#5b9ac0', health: '#52b690', civic: '#9a78c0', worship: '#e6dfcf', education: '#ec8a4c', business: '#7f8a95', leisure: '#47adab', vacant: '#8a8478' };

export class MapView {
  constructor(canvas, store) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.store = store; this.dpr = 1; this.w = 300; this.h = 300; this.inset = 0;
    this.cam = { x: 67, y: 88, z: 4 }; this.minZ = 2; this.maxZ = 44; this.map = null; this.layer = null;
    this.P = new Map(); this.selected = null; this.follow = null; this.selB = null; this.hoverB = null; this.lastTick = 0; this.tps = 0; this.timelapse = false; this.now = 0;
    this.time = { hour: 12, sunrise: 7, sunset: 18, month: 5, weather: null }; this.dark = 0; this.rain = []; this.flash = 0; this.occ = new Map(); this.leave = 0; this.nightSmooth = 0; this.pulse = 0;
    this.dest = null; this.labelsOn = true; this.hot = new Map(); this.disp = new Map(); this.overlay = 'none'; this.bursts = [];
  }
  // Venue labels follow the live building list: a shop that changes hands is renamed on the map, a vacant unit is labelled by drawVacant instead.
  get venueLabels() { return this.bld.filter((b) => b.tpl && b.kind !== 'residential' && !b.vacant && !['business_unit', 'vacant_unit', 'arch_unit', 'estate_agent'].includes(b.tpl)); }
  // ------------------------------------------------------------------ setup
  setMap(map, bld) {
    this.map = map; this.bld = bld; this.byId = new Map(bld.map((b) => [b.id, b])); this.tiles = map.tiles;
    const cv = document.createElement('canvas'); drawMap(cv.getContext('2d'), map, { scale: S, labels: false }); this.layer = cv;
    this.lamps = map.props.lamps || []; this.st = map.station; this.gw = (map.gateways || []).filter((g) => g.kind !== 'station');
    this.windows = new Map(); for (const b of bld) { if (b.kind === 'residential' || b.kind === 'commercial') { const r = b.id * 9301 + 49297; const n = Math.max(2, Math.min(9, Math.floor(b.w * b.h / 9))); const ws = []; for (let i = 0; i < n; i++) { const a = ((r * (i + 3) * 233280) % 1000) / 1000, c = ((r * (i + 7) * 9301) % 1000) / 1000; ws.push([a, c]); } this.windows.set(b.id, ws); } }
    this.resize(); this.fit();
  }
  resize() {
    const r = this.c.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (this.c.width !== Math.round(w * this.dpr) || this.c.height !== Math.round(h * this.dpr)) { this.c.width = Math.round(w * this.dpr); this.c.height = Math.round(h * this.dpr); }
    this.w = w; this.h = h;
    if (this.map) { this.minZ = Math.max(1.6, Math.min(this.w / this.map.w, (this.h - this.inset) / this.map.h) * 0.85); }
  }
  setInset(px) { this.inset = px; this.minZ = this.map ? Math.max(1.6, Math.min(this.w / this.map.w, (this.h - this.inset) / this.map.h) * 0.85) : 2; }
  fit(all = false) { if (!this.map) return; const full = Math.min(this.w / (this.map.w * 0.62), (this.h - this.inset) / this.map.h); const narrow = this.w < 700; const z = narrow && !all ? Math.max(full, this.w / 58) : full; this.cam = { x: this.map.w / 2, y: narrow && !all ? this.map.h * 0.55 : this.map.h / 2, z: clamp(z, this.minZ, this.maxZ) }; this.clampCam(); }
  viewCy() { return (this.h - this.inset) / 2; }
  toScreen(x, y) { return [(x - this.cam.x) * this.cam.z + this.w / 2, (y - this.cam.y) * this.cam.z + this.viewCy()]; }
  toTile(sx, sy) { return [(sx - this.w / 2) / this.cam.z + this.cam.x, (sy - this.viewCy()) / this.cam.z + this.cam.y]; }
  // Keep the map edge at (or just inside) the screen edge: no dark void above/beside the neighbourhood. If the map is smaller than the view on an axis, centre it.
  clampCam() { const m = this.map; if (!m) return; const hw = this.w / 2 / this.cam.z, hh = this.viewCy() / this.cam.z, mg = 2;
    this.cam.x = hw * 2 >= m.w + 2 * mg ? m.w / 2 : clamp(this.cam.x, hw - mg, m.w - hw + mg); this.cam.y = hh * 2 >= m.h + 2 * mg ? m.h / 2 : clamp(this.cam.y, hh - mg, m.h - hh + mg); }
  pan(dx, dy) { this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this.goal = null; this.clampCam(); }
  zoomAt(sx, sy, f) { const [tx, ty] = this.toTile(sx, sy); this.cam.z = clamp(this.cam.z * f, this.minZ, this.maxZ); this.cam.x = tx - (sx - this.w / 2) / this.cam.z; this.cam.y = ty - (sy - this.viewCy()) / this.cam.z; this.clampCam(); }
  zoomBy(f) { this.zoomAt(this.w / 2, this.viewCy(), f); }
  focus(x, y, z) { this.goal = { x, y, z: z ? clamp(z, this.minZ, this.maxZ) : this.cam.z }; }
  personPos(id) { const p = this.P.get(id); return p ? [p.x, p.y] : null; }

  // ------------------------------------------------------------------ data in
  ingest(m, now) {
    const t = m.time, a = m.people, first = this.P.size === 0; this.time = t; this.tps = this.store.s.tps; this.occ = this.store.s.occ; this.off = t.off || 0;
    const slow = this.tps > 0 && this.tps < 20 && !this.timelapse; const dTicks = Math.max(1, t.tick - this.lastTick); this.lastTick = t.tick;
    const dur = slow ? clamp(dTicks / Math.max(1, this.tps), 0.15, 1.0) : 0;
    const seen = new Set();
    for (let i = 0; i < a.length; i += 7) {
      const id = a[i], x = a[i + 1], y = a[i + 2], st = a[i + 3], seg = a[i + 4], age = a[i + 5], mv = a[i + 6]; seen.add(id);
      let p = this.P.get(id);
      if (!p) { p = { id, x, y, tx: x, ty: y, st, pst: st, seg, age, route: null, t0: 0, dur: 0, fade: 0, mood: 0 }; this.P.set(id, p); }
      p.seg = seg; p.age = age; p.sick = mv >= 1000 && (mv % 2000) >= 1000 ? 1 : 0; p.fem = mv >= 2000 ? 1 : 0; p.mood = (mv % 1000);
      if (x !== p.tx || y !== p.ty || st !== p.st) {
        const wasOff = p.st === 2, nowOff = st === 2;
        if (dur > 0 && !first && Math.abs(x - p.tx) + Math.abs(y - p.ty) < 200) {
          p.route = this.route(p.x, p.y, x, y); p.t0 = now; p.dur = dur; p.mvStart = now;
          p.show = now + dur * 1000 + 120;
          if (wasOff !== nowOff) { p.show = now + dur * 1000 + 700; if (nowOff) this.bursts.push({ x: this.st ? this.st.x : x, y: this.st ? this.st.y : y, t: now, dir: 1 }); else this.bursts.push({ x: p.x, y: p.y, t: now, dir: 0 }); }
        } else { p.x = x; p.y = y; p.route = null; }
        p.tx = x; p.ty = y; p.pst = p.st; p.st = st;
      }
    }
    for (const id of this.P.keys()) if (!seen.has(id)) this.P.delete(id);
  }
  route(ax, ay, bx, by) {
    if (ax === bx && ay === by) return null;
    const score = (px, py) => { let n = 0, tot = 0; const walk = (x0, y0, x1, y1) => { const L = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= L; i += 2) { const x = Math.round(lerp(x0, x1, L ? i / L : 0)), y = Math.round(lerp(y0, y1, L ? i / L : 0)); tot++; if (WALK.has(this.tiles[y * this.map.w + x])) n++; } }; walk(ax, ay, px, py); walk(px, py, bx, by); return n / Math.max(1, tot); };
    const c1 = [bx, ay], c2 = [ax, by]; const best = score(c1[0], c1[1]) >= score(c2[0], c2[1]) ? c1 : c2;
    const pts = [[ax, ay], best, [bx, by]]; let len = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const l = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]); seg.push(l); len += l; }
    return { pts, seg, len };
  }
  stepPeople(now) {
    for (const p of this.P.values()) {
      if (p.route && p.dur > 0) {
        const k = (now - p.t0) / (p.dur * 1000); if (k >= 1) { p.x = p.tx; p.y = p.ty; p.route = null; p.moving = false; continue; }
        const r = p.route, d = ease(clamp(k, 0, 1)) * r.len; let acc = 0; p.moving = true;
        for (let i = 0; i < r.seg.length; i++) { if (d <= acc + r.seg[i] || i === r.seg.length - 1) { const f = r.seg[i] ? (d - acc) / r.seg[i] : 1; p.x = lerp(r.pts[i][0], r.pts[i + 1][0], clamp(f, 0, 1)); p.y = lerp(r.pts[i][1], r.pts[i + 1][1], clamp(f, 0, 1)); p.dx = r.pts[i + 1][0] - r.pts[i][0]; break; } acc += r.seg[i]; }
      } else { p.moving = false; }
    }
  }

  // ------------------------------------------------------------------ picking
  pick(sx, sy) {
    const z = this.cam.z; let best = null, bd = Math.max(11, z * 0.8) ** 2;
    for (const p of this.P.values()) { if (!this.visible(p, this.now)) continue; const [px, py] = this.toScreen(p.x, p.y); const d = (px - sx) ** 2 + (py - sy - this.figH(p) * 0.4) ** 2; if (d < bd) { bd = d; best = p.id; } }
    if (best != null) return { person: best };
    const [tx, ty] = this.toTile(sx, sy);
    for (const b of this.bld) if (b.kind !== undefined && tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h && !['estate_green', 'park', 'allotments', 'school_grounds'].includes(b.type)) return { building: b.id };
    for (const b of this.bld) if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) return { building: b.id };
    return null;
  }
  visible(p, now) { return p.st === 0 || (p.show && now < p.show && p.moving); }
  figH(p) { const z = this.cam.z; const base = clamp(z * 1.3, 10, 36); return base * (p.age < 4 ? 0.5 : p.age < 12 ? 0.68 : p.age < 17 ? 0.88 : 1); }

  // ------------------------------------------------------------------ drawing
  lighting() {
    const t = this.time, h = t.hour, sr = t.sunrise ?? 7, ss = t.sunset ?? 18;
    const tw = 0.9; let d = 0;
    if (h < sr - tw) d = 1; else if (h < sr + tw) d = 1 - (h - (sr - tw)) / (2 * tw); else if (h < ss - tw) d = 0; else if (h < ss + tw) d = (h - (ss - tw)) / (2 * tw); else d = 1;
    this.dark = clamp(d, 0, 1);
    this.dawn = h > sr - 1 && h < sr + 1.2 ? 1 - Math.abs(h - sr) / 1.2 : 0; this.dusk = h > ss - 1.2 && h < ss + 1 ? 1 - Math.abs(h - ss) / 1.2 : 0;
  }
  draw(now) {
    this.now = now; const ctx = this.ctx, dpr = this.dpr; if (!this.layer) return;
    if (this.goal) { const g = this.goal; this.cam.x += (g.x - this.cam.x) * 0.14; this.cam.y += (g.y - this.cam.y) * 0.14; this.cam.z += (g.z - this.cam.z) * 0.14; if (Math.abs(g.x - this.cam.x) + Math.abs(g.y - this.cam.y) < 0.05 && Math.abs(g.z - this.cam.z) < 0.05) this.goal = null; this.clampCam(); }
    this.stepPeople(now);
    if (this.follow != null) { const p = this.P.get(this.follow); if (p) { this.cam.x += (p.x - this.cam.x) * 0.2; this.cam.y += (p.y - this.cam.y) * 0.2; this.clampCam(); } }
    this.lighting(); const z = this.cam.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#10161d'; ctx.fillRect(0, 0, this.w, this.h);
    // static layer (cropped source rect for speed)
    const [x0, y0] = this.toTile(0, 0), [x1, y1] = this.toTile(this.w, this.h - this.inset); const m = this.map;
    const sx0 = clamp(Math.floor(x0), 0, m.w), sy0 = clamp(Math.floor(y0), 0, m.h), sx1 = clamp(Math.ceil(x1), 0, m.w), sy1 = clamp(Math.ceil(y1), 0, m.h);
    ctx.imageSmoothingEnabled = z < S * 0.8; ctx.imageSmoothingQuality = 'high';
    if (sx1 > sx0 && sy1 > sy0) { const [dx, dy] = this.toScreen(sx0, sy0); ctx.drawImage(this.layer, sx0 * S, sy0 * S, (sx1 - sx0) * S, (sy1 - sy0) * S, dx, dy, (sx1 - sx0) * z, (sy1 - sy0) * z); }
    // seasonal grade
    const mo = this.time.month ?? 5; const grade = mo >= 8 && mo <= 10 ? 'rgba(210,130,50,0.09)' : mo === 11 || mo <= 1 ? 'rgba(160,190,230,0.10)' : mo >= 5 && mo <= 7 ? 'rgba(255,230,140,0.05)' : 'rgba(150,220,150,0.03)';
    ctx.fillStyle = grade; ctx.fillRect(0, 0, this.w, this.h);
    // time-lapse: smooth the day/night strobe away
    const tl = this.timelapse; const dk = tl ? 0.12 : this.dark; this.nightSmooth += (dk - this.nightSmooth) * (tl ? 0.2 : 1);
    this.drawWeather(ctx, now);
    const dkv = this.nightSmooth;
    if (dkv > 0.01) { ctx.fillStyle = `rgba(7,13,44,${(0.7 * dkv).toFixed(3)})`; ctx.fillRect(0, 0, this.w, this.h); }
    if (!tl && (this.dawn > 0 || this.dusk > 0)) { ctx.fillStyle = `rgba(255,140,60,${(0.12 * Math.max(this.dawn, this.dusk)).toFixed(3)})`; ctx.fillRect(0, 0, this.w, this.h); }
    this.updateDisp(performance.now());
    this.drawLights(ctx, dkv);
    this.drawOverlay(ctx);
    this.drawHighlights(ctx);
    this.drawShops(ctx);
    this.drawStation(ctx, now);
    this.drawPeople(ctx, now);
    this.drawBadges(ctx);
    if (this.labelsOn) this.drawLabels(ctx);
    if (tl) this.drawTimelapse(ctx, now);
  }
  drawWeather(ctx, now) {
    const wx = this.time.weather; if (!wx || this.timelapse) return; const ty = wx.type;
    if (ty === 'cloudy') { ctx.fillStyle = 'rgba(120,130,145,0.12)'; ctx.fillRect(0, 0, this.w, this.h); }
    if (ty === 'fog') { ctx.fillStyle = 'rgba(210,215,220,0.32)'; ctx.fillRect(0, 0, this.w, this.h); }
    if (ty === 'rain' || ty === 'snow') {
      ctx.fillStyle = 'rgba(70,85,105,0.16)'; ctx.fillRect(0, 0, this.w, this.h);
      const n = ty === 'rain' ? 140 : 90; while (this.rain.length < n) this.rain.push([Math.random() * this.w, Math.random() * this.h, 0.6 + Math.random() * 0.8]);
      ctx.strokeStyle = 'rgba(190,210,235,0.5)'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath();
      for (const d of this.rain) { if (ty === 'rain') { ctx.moveTo(d[0], d[1]); ctx.lineTo(d[0] - 2, d[1] + 9 * d[2]); d[1] += 11 * d[2]; d[0] -= 1.5; } else { ctx.fillRect(d[0], d[1], 2, 2); d[1] += 1.4 * d[2]; d[0] += Math.sin(now / 700 + d[2] * 9) * 0.5; } if (d[1] > this.h) { d[1] = -10; d[0] = Math.random() * this.w; } if (d[0] < 0) d[0] = this.w; }
      if (ty === 'rain') ctx.stroke();
    }
  }
  drawLights(ctx, dkv) {
    const z = this.cam.z; if (dkv < 0.12) return; const a = Math.min(1, dkv * 1.2);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (z >= 2.4) for (const l of this.lamps) { const [x, y] = this.toScreen(l.x + 0.5, l.y + 0.5); if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue; const r = Math.max(8, z * 2.6); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,214,130,${0.4 * a})`); g.addColorStop(1, 'rgba(255,214,130,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    ctx.restore();
    for (const b of this.bld) {
      if (b.vacant) continue; const n = this.dOcc(b.id); const ws = this.windows.get(b.id); if (!ws) continue; const [sx, sy] = this.toScreen(b.x, b.y); const bw = b.w * z, bh = b.h * z; if (sx > this.w || sy > this.h || sx + bw < 0 || sy + bh < 0) continue;
      const lit = b.kind === 'commercial' ? (n > 0 ? ws.length : Math.min(1, ws.length)) : Math.min(ws.length, n > 0 ? 1 + n : 0);
      if (!lit) continue;
      ctx.fillStyle = `rgba(255,205,110,${(0.85 * a).toFixed(2)})`; const ww = Math.max(1.5, z * 0.36), wh = Math.max(1.5, z * 0.4);
      for (let i = 0; i < lit; i++) { const wx = sx + 2 + ws[i][0] * Math.max(0, bw - ww - 4), wy = sy + 2 + ws[i][1] * Math.max(0, bh - wh - 4); ctx.fillRect(wx, wy, ww, wh); }
      if (z > 6 && n > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,190,90,${0.1 * a})`; ctx.fillRect(sx, sy, bw, bh); ctx.restore(); }
    }
  }
  drawOverlay(ctx) {
    if (this.overlay === 'none') return; const st = this.store.s;
    // heat overlay by segment/ stress is drawn per person in drawPeople; building overlay here: occupancy heat
    if (this.overlay === 'crowd') for (const b of this.bld) { const n = this.dOcc(b.id); if (!n) continue; const [sx, sy] = this.toScreen(b.x, b.y); ctx.fillStyle = `rgba(255,80,60,${Math.min(0.7, n / 25)})`; ctx.fillRect(sx, sy, b.w * this.cam.z, b.h * this.cam.z); }
  }
  drawHighlights(ctx) {
    const z = this.cam.z; const hl = (id, col, lw) => { const b = this.byId.get(id); if (!b) return; const [sx, sy] = this.toScreen(b.x, b.y); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(sx - 1, sy - 1, b.w * z + 2, b.h * z + 2); };
    if (this.selB != null) { hl(this.selB, '#ffd36b', 2.5); const b = this.byId.get(this.selB); if (b) { const [sx, sy] = this.toScreen(b.x, b.y); ctx.fillStyle = 'rgba(255,211,107,0.12)'; ctx.fillRect(sx, sy, b.w * z, b.h * z); } }
    if (this.hoverB != null && this.hoverB !== this.selB) hl(this.hoverB, 'rgba(255,255,255,0.55)', 1.5);
  }
  // Calm town markers: shuttered "To let" units, a quiet "new" tag on recent openings, and notice markers for planning applications / campaigns.
  // Crime is deliberately never drawn on the map.
  drawShops(ctx) {
    const z = this.cam.z; if (z < 3) return; const tick = this.time.tick || 0, fresh = this.store.s.fresh, pins = this.store.s.pins || [], vis = (sx, sy, w, h) => !(sx > this.w || sy > this.h || sx + w < 0 || sy + h < 0);
    for (const b of this.bld) {
      if (!b.vacant) continue; const [sx, sy] = this.toScreen(b.x, b.y), bw = b.w * z, bh = b.h * z; if (!vis(sx, sy, bw, bh)) continue;
      ctx.fillStyle = 'rgba(40,44,52,0.55)'; ctx.fillRect(sx, sy, bw, bh);
      if (z >= 5) { ctx.strokeStyle = 'rgba(20,24,30,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); for (let y = sy + 3; y < sy + bh - 1; y += Math.max(3, z * 0.45)) { ctx.moveTo(sx + 1, y); ctx.lineTo(sx + bw - 1, y); } ctx.stroke(); }
      if (z >= 6.5) { const fs = clamp(z * 0.8, 9, 12); ctx.font = `italic 600 ${fs}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const cx = sx + bw / 2, cy = sy + bh / 2; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,20,.8)'; ctx.strokeText('To let', cx, cy); ctx.fillStyle = '#d8cfb8'; ctx.fillText('To let', cx, cy); }
    }
    for (const [id, t] of fresh) { const age = (tick - t) / 144; if (age > 45) continue; const b = this.byId.get(id); if (!b) continue; const [sx, sy] = this.toScreen(b.x, b.y), bw = b.w * z; if (!vis(sx, sy, bw, b.h * z)) continue;
      const a = age < 30 ? 1 : 1 - (age - 30) / 15; ctx.globalAlpha = a; if (z < 6) { ctx.fillStyle = '#4fd1b5'; ctx.strokeStyle = 'rgba(10,14,20,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx + bw - 2, sy + 2, 3.5, 0, 7); ctx.fill(); ctx.stroke(); }
      else { const fs = 10; ctx.font = `700 ${fs}px system-ui`; const tw = ctx.measureText('New').width + 8; ctx.fillStyle = '#2fae94'; ctx.beginPath(); ctx.roundRect(sx + bw - tw, sy - fs - 2, tw, fs + 4, 4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('New', sx + bw - tw / 2, sy - fs / 2); } ctx.globalAlpha = 1; }
    for (const p of pins) { const b = this.byId.get(p.bid); if (!b) continue; const [sx, sy] = this.toScreen(b.x, b.y), bw = b.w * z; if (!vis(sx, sy, bw, b.h * z) || z < 4) continue;
      const s = clamp(z * 0.9, 9, 15), x = sx + bw / 2 - s / 2, y = sy - s - 2; ctx.fillStyle = p.kind === 'campaign' ? '#8fb4e8' : '#e9e4d2'; ctx.strokeStyle = 'rgba(20,28,40,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(x, y, s, s * 1.15, 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,50,70,.7)'; ctx.beginPath(); for (let i = 1; i <= 3; i++) { ctx.moveTo(x + 2, y + i * s * 0.28); ctx.lineTo(x + s - 2, y + i * s * 0.28); } ctx.stroke();
      if (z >= 10) { ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,20,.8)'; ctx.strokeText(p.label, sx + bw / 2, y - 1); ctx.fillStyle = '#e9e4d2'; ctx.fillText(p.label, sx + bw / 2, y - 1); } }
  }
  drawStation(ctx, now) {
    if (!this.st) return; const z = this.cam.z; const [x, y] = this.toScreen(this.st.x, this.st.y);
    for (const b of this.bursts) { const k = (now - b.t) / 1400; if (k > 1) continue; const [bx, by] = this.toScreen(b.x, b.y); ctx.strokeStyle = `rgba(120,200,255,${0.8 * (1 - k)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, (b.dir ? 4 + k * 16 : 20 - k * 16) * Math.max(0.6, z / 6), 0, 7); ctx.stroke(); }
    this.bursts = this.bursts.filter((b) => now - b.t < 1400);
    if (z >= 3.2) { const r = Math.max(7, z * 0.9); ctx.fillStyle = '#1d6fb8'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 1.1)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('→', x, y + 0.5); }
  }
  drawPeople(ctx, now) {
    const z = this.cam.z, sel = this.selected, dots = z < 5.2;
    const list = []; for (const p of this.P.values()) if (this.visible(p, now) || p.id === sel) list.push(p);
    list.sort((a, b) => a.y - b.y);
    for (const p of list) {
      const [x, y] = this.toScreen(p.x, p.y); if (x < -30 || y < -40 || x > this.w + 30 || y > this.h + 40) continue;
      const hue = SEG_HUE[p.seg] ?? 200; const isSel = p.id === sel, inside = p.st !== 0 && !(p.show && now < p.show);
      const alpha = inside ? 0.45 : 1;
      if (this.overlay === 'stress') { ctx.fillStyle = `hsla(${120 - Math.min(1, Math.max(0, (50 - p.mood) / 80)) * 120},90%,50%,0.9)`; }
      if (dots) {
        const r = isSel ? 5 : Math.max(2, z * 0.5); ctx.globalAlpha = alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 7); ctx.fill(); ctx.fillStyle = this.overlay === 'stress' ? ctx.fillStyle : hsl(hue, 70, 52); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else this.figure(ctx, p, x, y, hue, alpha, now);
      if (isSel) this.ring(ctx, x, y - this.figH(p) * 0.4, now);
    }
  }
  ring(ctx, x, y, now) { const r = 14 + Math.sin(now / 260) * 2; ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 7); ctx.stroke(); }
  figure(ctx, p, x, y, hue, alpha, now) {
    const h = this.figH(p), r = this.store.s.roster.get(p.id); const w = h * 0.42; ctx.globalAlpha = alpha;
    const swing = p.moving ? Math.sin(now / 90 + p.id) * h * 0.12 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 1, w * 0.8, h * 0.12, 0, 0, 7); ctx.fill();
    // legs
    ctx.strokeStyle = '#2c3340'; ctx.lineWidth = Math.max(1.6, h * 0.13); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - w * 0.22, y - h * 0.3); ctx.lineTo(x - w * 0.22 + swing, y); ctx.moveTo(x + w * 0.22, y - h * 0.3); ctx.lineTo(x + w * 0.22 - swing, y); ctx.stroke();
    // torso
    ctx.fillStyle = p.sick ? '#a6b87a' : hsl(hue, 62, p.age < 17 ? 58 : 46); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4;
    const tw = w * 0.62, th = h * 0.42, ty = y - h * 0.72; ctx.beginPath(); ctx.roundRect(x - tw, ty, tw * 2, th, tw * 0.6); ctx.fill(); ctx.stroke();
    // head
    const hr = h * 0.17; ctx.fillStyle = skinCol(r ? r.skin : 0.5); ctx.beginPath(); ctx.arc(x, y - h * 0.84, hr, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    ctx.fillStyle = p.age > 62 ? '#d8d8d8' : hairCol(r ? r.hair : 0.4); ctx.beginPath(); ctx.arc(x, y - h * 0.87, hr * 0.98, Math.PI, 0); ctx.fill();
    if (p.fem && p.age > 12) { ctx.fillRect(x - hr, y - h * 0.87, hr * 0.35, hr * 1.1); }
    if (this.cam.z > 16) { ctx.font = `600 ${Math.round(clamp(this.cam.z * 0.42, 9, 13))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; const nm = r ? r.first : ''; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,20,.75)'; ctx.strokeText(nm, x, y - h * 1.02); ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y - h * 1.02); }
    ctx.globalAlpha = 1;
  }
  // Occupancy is quiet by default: far out only a few pulsing 'something is happening here' markers (recent notable news at a place) are drawn;
  // closer in, number badges appear only where two or more people are together (or something is happening) until street level.
  setHot(id, until) { this.hot.set(id, until); }
  drawBadges(ctx) {
    const z = this.cam.z, now = performance.now(); for (const [k, t] of this.hot) if (t < now) this.hot.delete(k);
    for (const [id, t] of this.hot) {
      const b = this.byId.get(id); if (!b) continue; const [sx, sy] = this.toScreen(b.x + b.w / 2, b.y + b.h / 2); if (sx < -20 || sy < -20 || sx > this.w + 20 || sy > this.h + 20) continue;
      const ph = (now / 900) % 1, r = 7 + ph * 9; ctx.strokeStyle = `rgba(255,211,107,${(1 - ph) * 0.9})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ffd36b'; ctx.strokeStyle = 'rgba(20,14,0,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill(); ctx.stroke();
    }
    // count badges: smoothed per building over real time, hysteresis (show >=3, hide <2), faded; never at x5 and faster
    const tier = this.store.s.tier, fast = tier === 'x5' || tier === 'x20' || tier === 'max';
    for (const [id, d] of this.disp) {
      const b = this.byId.get(id); let want = false;
      if (b && !fast && z >= 5 && d.v > 0) {
        const quiet = ['estate_green', 'park', 'allotments', 'school_grounds'].includes(b.type) && z < 6;
        if (id === this.selB) want = true;
        else if (!quiet) { if (d.on) want = d.v >= 2; else want = d.v >= 3; }
      }
      d.on = want; if (d.v > 0) d.txt = d.v;
      const dt = Math.min(250, now - (d.t || now)); d.t = now; d.a += ((want ? 1 : 0) - d.a) * (1 - Math.exp(-dt / 220));
      if (!want && d.a < 0.02) { d.a = 0; if (d.v === 0 && d.cand === 0) this.disp.delete(id); continue; }
      if (!b || !d.txt) continue;
      const [sx, sy] = this.toScreen(b.x + b.w / 2, b.y + b.h / 2); if (sx < -20 || sy < -20 || sx > this.w + 20 || sy > this.h + 20) continue;
      const col = b.kind === 'residential' ? '#3a7fb0' : b.cat ? CAT_COL[b.cat] || '#d9a441' : '#6b7a8a';
      const t = String(d.txt), fs = clamp(z * 0.9, 10, 15); ctx.font = `700 ${fs}px system-ui`; const w = Math.max(fs * 1.5, ctx.measureText(t).width + 12), hgt = fs * 1.4;
      ctx.globalAlpha = d.a; ctx.fillStyle = col; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - hgt / 2, w, hgt, hgt / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, sx, sy + 0.5); ctx.globalAlpha = 1;
    }
  }
  // Smoothed occupancy: a displayed count only changes once the new raw value has persisted ~1.5 real seconds (also used by lit windows / crowd overlay).
  updateDisp(now) {
    for (const [id] of this.occ) if (!this.disp.has(id)) this.disp.set(id, { v: 0, cand: 0, since: now, a: 0, on: false, txt: 0, t: now });
    for (const [id, d] of this.disp) {
      const raw = this.occ.has(id) ? this.occ.get(id) : 0;
      if (raw === d.v) { d.cand = raw; d.since = now; } else if (raw !== d.cand) { d.cand = raw; d.since = now; } else if (now - d.since >= 1500) d.v = raw;
    }
  }
  dOcc(id) { const d = this.disp.get(id); return d ? d.v : 0; }
  drawLabels(ctx) {
    const z = this.cam.z; const boxes = []; const hit = (b) => boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]));
    const label = (txt, x, y, fs, col = '#fff', pri = false) => { ctx.font = `600 ${fs}px system-ui, sans-serif`; const w = ctx.measureText(txt).width; const box = [x - w / 2, y - fs / 2, x + w / 2, y + fs / 2]; if (!pri && hit(box)) return; boxes.push(box); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,14,20,0.8)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); };
    if (z >= 2.2 && z < 9) for (const s of this.map.streets) { if (s.kind === 'alley') continue; const r = s.rect; const cx = r.x + r.w / 2, cy = r.y + r.h / 2; const [sx, sy] = this.toScreen(cx, cy); const vert = r.h > r.w; ctx.save(); ctx.translate(sx, sy); if (vert) ctx.rotate(-Math.PI / 2); ctx.font = `600 ${clamp(z * 1.2, 9, 12)}px system-ui`; ctx.fillStyle = 'rgba(235,240,245,0.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.name.toUpperCase().split('').join(' '), 0, 0); ctx.restore(); }
    if (z >= 6.5) for (const b of this.venueLabels) { const [sx, sy] = this.toScreen(b.x + b.w / 2, b.y + b.h / 2); if (sx < -60 || sy < -20 || sx > this.w + 60 || sy > this.h + 20) continue; label(b.name.length > 22 ? b.name.slice(0, 21) + '…' : b.name, sx, sy - 0, clamp(z * 0.95, 10, 13), '#fff'); }
    if (z >= 2.2) for (const a of this.map.areas) { if (!a.name) continue; const [sx, sy] = this.toScreen(a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2); if (z < 9) label(a.name, sx, sy, 11, '#e6f6cf'); }
    if (this.st && z >= 2.2) { const [x, y] = this.toScreen(this.st.x, this.st.y); label('Station', x, y - Math.max(12, z * 1.4), 11, '#9cd3ff', true); }
    if (this.selB != null && z >= 3) { const b = this.byId.get(this.selB); if (b) { const [sx, sy] = this.toScreen(b.x + b.w / 2, b.y - 1); label(b.name, sx, sy - 4, 12, '#ffd36b', true); } }
    if (this.selected != null) { const p = this.P.get(this.selected), r = this.store.s.roster.get(this.selected); if (p && r && this.visible(p, this.now)) { const [x, y] = this.toScreen(p.x, p.y); label(`${r.first} ${r.last}`, x, y - this.figH(p) - 22, 12, '#ffd36b', true); } }
  }
  drawTimelapse(ctx, now) {
    const t = this.time, txt = `${t.season} ${t.year}`, fs = this.w < 700 ? 22 : 32, y = this.h - this.inset - 54;
    ctx.font = `700 ${fs}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; const w = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(8,12,18,0.55)'; ctx.beginPath(); ctx.roundRect(10, y - fs - 12, w + 24, fs + 28, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(txt, 22, y); ctx.font = '700 10px system-ui'; ctx.fillStyle = 'rgba(255,211,107,0.9)'; ctx.fillText('TIME-LAPSE', 22, y - fs - 1);
  }
}
