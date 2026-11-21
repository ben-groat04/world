// Procedural town map: river with bridges, road grid, square, blocks with building slots, farms/fields, forest.
import { hash2, vnoise } from './rng.js';

export const T = { GRASS: 0, ROAD: 1, WATER: 2, BRIDGE: 3, TREE: 4, FIELD: 5, PLAZA: 6, BUILDING: 7, PARK: 8, GRAVE: 9, FOUNTAIN: 10 };
// movement cost per tile type (0 = impassable)
export const TILE_COST = new Uint8Array([13, 10, 0, 10, 0, 15, 10, 0, 12, 14, 0]);

import { JOBS } from './data/jobs.js';
import { BUILDING_TYPES } from './data/buildings.js';
export { JOBS, BUILDING_TYPES };
export function isOpen(b, h) {
  if (!b.hours) return true;
  const o = b.hours[0], c = b.hours[1];
  return c > 24 ? (h >= o || h < c - 24) : (h >= o && h < c);
}

export function generateMap(rng, opts = {}) {
  const W = 120, H = 90, N = W * H;
  const houseCount = opts.houses ?? 86;
  const tiles = new Uint8Array(N);
  const seed = rng.int(1, 1 << 30);
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // ---- river (north->south, meandering), 4 wide
  const ph1 = rng.float(0, 6.28), ph2 = rng.float(0, 6.28);
  const riverX = new Int16Array(H);
  for (let y = 0; y < H; y++) {
    const cx = Math.round(88 + 3.5 * Math.sin(y / 10 + ph1) + 2 * Math.sin(y / 4.3 + ph2));
    riverX[y] = cx;
    for (let x = cx - 2; x <= cx + 1; x++) tiles[idx(x, y)] = T.WATER;
  }
  // ---- roads
  const road = (x, y, bridge) => {
    if (!inb(x, y)) return;
    const i = idx(x, y);
    if (tiles[i] === T.WATER) { if (bridge) tiles[i] = T.BRIDGE; } else tiles[i] = T.ROAD;
  };
  const roadH = (y, x0, x1, bridge) => { for (let x = x0; x <= x1; x++) road(x, y, bridge); };
  const roadV = (x, y0, y1) => { for (let y = y0; y <= y1; y++) road(x, y, false); };
  for (const y of [21, 45, 69]) roadH(y, 0, W - 1, true);
  for (const y of [9, 33, 57, 81]) roadH(y, 12, 72, false);
  const VXW = [12, 24, 36, 48, 60, 72], HYX = [-3, 9, 21, 33, 45, 57, 69, 81, 93];
  roadV(48, 2, H - 3);
  for (const x of [12, 24, 36, 60, 72]) roadV(x, 9, 81);
  const VXE = [100, 112], HYE = [-3, 21, 45, 69, 93];
  for (const x of VXE) roadV(x, 21, 69);

  // ---- square with fountain
  const PX0 = 44, PY0 = 41, PW = 9, PH = 9;
  for (let y = PY0; y < PY0 + PH; y++) for (let x = PX0; x < PX0 + PW; x++) tiles[idx(x, y)] = T.PLAZA;
  for (let y = 44; y <= 46; y++) for (let x = 47; x <= 49; x++) tiles[idx(x, y)] = T.FOUNTAIN;
  const PCX = 48, PCY = 45;

  const buildings = [];
  const bAt = new Int16Array(N).fill(-1);
  const mk = (type, x, y, w, h, door, side, zone) => {
    const bt = BUILDING_TYPES[type];
    const b = {
      id: buildings.length, type, name: bt.label, x, y, w, h, door: { x: door.x, y: door.y }, doorSide: side,
      open: !!bt.open, ownerId: null, residents: [], employees: [], jobs: bt.jobs.slice(),
      inventory: {}, condition: 1, capacity: type === 'house' ? 8 : bt.jobs.length, funds: 0, hours: bt.hours ? bt.hours.slice() : null, zone,
    };
    buildings.push(b);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) bAt[idx(xx, yy)] = b.id;
    return b;
  };
  const solid = (b) => { for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) tiles[idx(xx, yy)] = T.BUILDING; };

  // square building (open)
  const square = mk('square', PX0, PY0, PW, PH, { x: 48, y: 40 }, 'N', 'core');
  square.spots = [];
  for (let y = PY0; y < PY0 + PH; y++) for (let x = PX0; x < PX0 + PW; x++) if (tiles[idx(x, y)] === T.PLAZA) square.spots.push(idx(x, y));

  // ---- blocks & slots
  const blocks = [];
  for (let i = 0; i < VXW.length - 1; i++) for (let j = 0; j < HYX.length - 1; j++) {
    blocks.push({ i, j, x0: VXW[i] + 1, x1: VXW[i + 1] - 1, y0: HYX[j] + 1, y1: HYX[j + 1] - 1, zone: j === 0 ? 'north' : j === HYX.length - 2 ? 'south' : 'core' });
  }
  for (let j = 0; j < HYE.length - 1; j++) blocks.push({ i: 9, j, x0: 101, x1: 111, y0: HYE[j] + 1, y1: HYE[j + 1] - 1, zone: 'east' });
  const reserve = (blk, type, doorTop) => {
    const w = blk.x1 - blk.x0 + 1, h = blk.y1 - blk.y0 + 1;
    const b = mk(type, blk.x0, blk.y0, w, h, { x: blk.x0 + 5, y: doorTop ? blk.y0 - 1 : blk.y1 + 1 }, doorTop ? 'N' : 'S', 'core');
    b.spots = [];
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { tiles[idx(x, y)] = type === 'park' ? T.PARK : T.GRAVE; b.spots.push(idx(x, y)); }
    blk.reserved = true;
    return b;
  };
  const park = reserve(blocks.find((b) => b.i === 3 && b.j === 2), 'park', true);
  const cemetery = reserve(blocks.find((b) => b.i === 0 && b.j === 1), 'cemetery', false);

  const slots = [];
  for (const blk of blocks) {
    if (blk.reserved) continue;
    for (const row of ['N', 'S']) {
      const y = row === 'N' ? blk.y0 : blk.y1 - 3;
      const doorY = row === 'N' ? blk.y0 - 1 : blk.y1 + 1;
      if (y < 0 || y + 3 >= H || doorY < 0 || doorY >= H) continue;
      for (const [kind, ox, w] of [['half', 0, 5], ['half', 6, 5], ['wide', 0, 11]]) {
        const x = blk.x0 + ox;
        const s = { x, y, w, h: 4, kind, row, block: blk, door: { x: x + (w === 5 ? 2 : 5), y: doorY }, zone: blk.zone };
        s.cx = x + w / 2; s.cy = y + 2;
        s.dist = Math.hypot(s.cx - PCX, s.cy - PCY);
        s.rd = Math.abs(riverX[Math.min(H - 1, Math.max(0, Math.round(s.cy)))] - s.cx);
        slots.push(s);
      }
    }
  }
  const free = (s) => {
    for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) if (!inb(xx, yy) || tiles[idx(xx, yy)] !== T.GRASS) return false;
    const dt = tiles[idx(s.door.x, s.door.y)];
    return dt === T.ROAD || dt === T.BRIDGE;
  };
  const place = (type, s) => { const b = mk(type, s.x, s.y, s.w, s.h, s.door, s.row, s.zone); solid(b); return b; };
  const choose = (kind, zones, score) => {
    let best = null, bs = Infinity;
    for (const s of slots) {
      if (s.kind !== kind || !zones.includes(s.zone) || !free(s)) continue;
      const v = score(s);
      if (v < bs) { bs = v; best = s; }
    }
    return best;
  };
  const core = ['core'];
  // civic / commercial wide buildings (target distance from square)
  for (const [type, r] of [['townhall', 10], ['market', 12], ['tavern', 14], ['temple', 18], ['inn', 20], ['school', 24]]) {
    const s = choose('wide', core, (s) => Math.abs(s.dist - r) + rng.float(0, 3));
    if (s) place(type, s);
  }
  // half-slot commercial buildings
  for (const [type, r] of [['bakery', 10], ['clinic', 12], ['tailor', 14], ['jail', 16], ['market', 17], ['bakery', 18], ['tailor', 20], ['smithy', 22], ['tavern', 22], ['smithy', 26], ['carpenter', 24], ['carpenter', 28]]) {
    const s = choose('half', core, (s) => Math.abs(s.dist - r) + rng.float(0, 3) + (type === 'jail' ? 0 : 0));
    if (s) place(type, s);
  }
  { const s = choose('half', core, (s) => s.rd + rng.float(0, 2) + (s.cx > 80 ? 100 : 0)); if (s) place('mill', s); }
  // farms on the outskirts, spread out
  const farms = [];
  for (const z of ['north', 'east', 'south', 'east', 'north', 'south', 'east', 'north']) {
    const s = choose('half', [z], (s) => {
      let md = 99; for (const f of farms) md = Math.min(md, Math.hypot(f.x - s.x, f.y - s.y));
      return -md + rng.float(0, 6);
    });
    if (s) farms.push(place('farm', s));
  }
  // houses: nearest-to-centre first
  const cand = slots.filter((s) => s.kind === 'half').map((s) => ({ s, v: s.dist + rng.float(0, 6) })).sort((a, b) => a.v - b.v);
  let nh = 0;
  for (const c of cand) { if (nh >= houseCount) break; if (free(c.s)) { place('house', c.s); nh++; } }

  // ---- fields near farms
  const zoneOK = { north: (x, y) => y < 9, south: (x, y) => y > 81, east: (x, y) => x > 95 };
  for (const f of farms) {
    const ok = zoneOK[f.zone];
    for (let y = f.y - 8; y < f.y + f.h + 8; y++) for (let x = f.x - 9; x < f.x + f.w + 9; x++) {
      if (!inb(x, y) || tiles[idx(x, y)] !== T.GRASS || !ok(x, y)) continue;
      tiles[idx(x, y)] = T.FIELD;
    }
  }
  // ---- trees: forest outside the core, sparse trees in gardens
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (tiles[i] !== T.GRASS) continue;
    const inCore = x >= 10 && x <= 75 && y >= 8 && y <= 82;
    const n = vnoise(x / 5.5, y / 5.5, seed) * 0.7 + vnoise(x / 2.3, y / 2.3, seed + 7) * 0.3;
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (!inCore) { if (n + (edge < 4 ? 0.2 : 0) > 0.58 || hash2(x, y, seed) < 0.03) tiles[i] = T.TREE; }
    else if (hash2(x, y, seed + 3) < 0.045) tiles[i] = T.TREE;
  }
  // clear a ring of trees right around doors so doors never get boxed in
  for (const b of buildings) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = b.door.x + dx, y = b.door.y + dy;
    if (inb(x, y) && tiles[idx(x, y)] === T.TREE) tiles[idx(x, y)] = T.GRASS;
  }

  // ---- cost grid + connectivity components
  const cost = new Uint8Array(N);
  for (let i = 0; i < N; i++) cost[i] = TILE_COST[tiles[i]];
  const comp = new Int16Array(N);
  let nc = 0;
  const stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (!cost[s] || comp[s]) continue;
    nc++; let sp = 0; stack[sp++] = s; comp[s] = nc;
    while (sp) {
      const c = stack[--sp], cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (!cost[ni] || comp[ni]) continue;
        if (dx && dy && (!cost[idx(cx + dx, cy)] || !cost[idx(cx, cy + dy)])) continue;
        comp[ni] = nc; stack[sp++] = ni;
      }
    }
  }
  // drop buildings whose door is not connected to the square
  const mainComp = comp[idx(square.door.x, square.door.y)];
  const keep = buildings.filter((b) => comp[idx(b.door.x, b.door.y)] === mainComp);
  if (keep.length !== buildings.length) {
    for (const b of buildings) if (!keep.includes(b) && !b.open) for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { tiles[idx(xx, yy)] = T.GRASS; cost[idx(xx, yy)] = TILE_COST[T.GRASS]; bAt[idx(xx, yy)] = -1; }
    buildings.length = 0; buildings.push(...keep);
    bAt.fill(-1);
    buildings.forEach((b, i) => { b.id = i; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) bAt[idx(xx, yy)] = i; });
  }
  return { W, H, tiles, cost, comp, bAt, buildings, riverX, squareId: square.id, parkId: park.id, cemeteryId: cemetery.id, seed, center: { x: PCX, y: PCY } };
}
