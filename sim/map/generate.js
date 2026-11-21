// Larkfield street/node-graph map generator (replaces sim/map.js). Deterministic by seed. DOM-free, no Math.random.
// Pre-transform work happens in a canonical frame (railway north, canal south, station east); a seeded flip/transpose then varies orientation.
// pack = { archetypes, venues:{VENUE_TEMPLATES, PUBLIC_SPACES, GATEWAYS}, calibration, TENURE_FROM_CALIBRATION, LANDLORDS, ROOM_MODEL, TERRACE_MIX }
import { RNG } from '../rng.js';
import { T } from './constants.js';
import * as SN from './streetnames.js';
import { GraphBuilder } from './graph.js';

const MAIN_W = 8, RES_W = 6;

export function generateMap(pack, seed = 1, opts = {}) {
  const rng = new RNG(seed).fork('larkfield-map');
  const A = pack.archetypes, VT = pack.venues.VENUE_TEMPLATES;
  const calib = pack.calibration;
  const tf = opts.orientation || { flipX: rng.chance(0.5), flipY: rng.chance(0.5), transpose: opts.noTranspose ? false : rng.chance(0.5) };
  const southEdge = opts.southEdge || (rng.chance(0.72) ? 'canal' : 'ring_road');
  // ---------------- vertical stack ----------------
  const stack = [['rail', 8], ['arch', 6], ['S0', 6], ['B1', 20], ['S1', 6], ['B2', 22], ['HS', MAIN_W], ['B3', 22], ['S2', 6], ['B4', 20], ['edge', 10]];
  const Y = {}; let yy = 0;
  for (const [k, d] of stack) { Y[k] = { y0: yy, y1: yy + d }; yy += d; }
  const W = 176, H = yy;
  const M = {
    seed, w: W, h: H, tileMetres: 2, tiles: new Uint8Array(W * H), bAt: new Int32Array(W * H).fill(-1),
    streets: [], buildings: [], units: [], venues: [], areas: [], props: { trees: [], cars: [], lamps: [], benches: [], bins: [], busStops: [] },
    gateways: [], cells: [], slots: [], owners: [], meta: { southEdge, orientation: tf, layout: 'canonical-v1' },
  };
  const g = new GraphBuilder();
  const I = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const fill = (x, y, w, h, t) => { for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) M.tiles[I(i, j)] = t; };
  const fillR = (r, t) => fill(r.x, r.y, r.w, r.h, t);
  const R = (x, y, w, h) => ({ x, y, w, h });
  const usedNames = new Set();
  const pickName = (arr, label) => { const free = arr.filter((n) => !usedNames.has(n)); const n = free.length ? rng.pick(free) : (label || 'Unit') + ' ' + (usedNames.size + 1); usedNames.add(n); return n; };
  const jit = (v, r) => v + rng.int(-r, r);
  // =========================================================== STREETS
  const streetNamePool = rng.shuffle([...SN.RESIDENTIAL]);
  const addStreet = (o) => {
    const s = { id: M.streets.length, name: o.name, kind: o.kind, axis: o.axis, w: o.w, pav: o.pav, a0: o.a0, t0: o.t0, t1: o.t1, ext: o.ext || [0, 0], bldgs: [] };
    if (o.axis === 'h') { s.rect = R(o.t0, o.a0, o.t1 - o.t0, o.w); s.lines = { N: o.a0, S: o.a0 + o.w - 1 }; }
    else { s.rect = R(o.a0, o.t0, o.w, o.t1 - o.t0); s.lines = { W: o.a0, E: o.a0 + o.w - 1 }; }
    M.streets.push(s); return s;
  };
  const hsName = rng.pick(SN.HIGH_STREET), s0Name = rng.pick(SN.COLLECTOR);
  const HS = addStreet({ name: hsName, kind: 'high', axis: 'h', a0: Y.HS.y0, w: MAIN_W, pav: 2, t0: 0, t1: W });
  const S0 = addStreet({ name: s0Name, kind: 'collector', axis: 'h', a0: Y.S0.y0, w: RES_W, pav: 1, t0: 0, t1: W });
  const S1 = addStreet({ name: streetNamePool.pop(), kind: 'residential', axis: 'h', a0: Y.S1.y0, w: RES_W, pav: 1, t0: 0, t1: W });
  const S2 = addStreet({ name: streetNamePool.pop(), kind: 'residential', axis: 'h', a0: Y.S2.y0, w: RES_W, pav: 1, t0: 0, t1: W });
  const xMain = 78 + rng.int(-6, 6);
  const vx = {
    B1: [jit(46, 4), jit(100, 4), jit(150, 4)],
    B2: [jit(30, 4), xMain, jit(128, 4)],
    B3: [jit(40, 4), xMain, jit(140, 4)],
    B4: [jit(58, 2), jit(118, 2)],
  };
  const topOf = { B1: S0, B2: S1, B3: HS, B4: S2 }, botOf = { B1: S1, B2: HS, B3: S2, B4: null };
  const vStreets = {};
  for (const b of ['B1', 'B2', 'B3', 'B4']) {
    vStreets[b] = vx[b].map((xc) => {
      const top = topOf[b], bot = botOf[b];
      const t0 = top.rect.y + top.rect.h, t1 = bot ? bot.rect.y : Y[b].y1;
      return addStreet({ name: streetNamePool.pop(), kind: 'residential', axis: 'v', a0: xc - 3, w: RES_W, pav: 1, t0, t1, ext: [1, bot ? 1 : 0] });
    });
  }
  // aligned crossroad on the high street shares one name
  vStreets.B3[1].name = vStreets.B2[1].name;
  const cellsOf = (b) => { const out = []; let x = 0; for (const s of vStreets[b]) { out.push([x, s.rect.x]); x = s.rect.x + s.rect.w; } out.push([x, W]); return out; };
  const cells = { B1: cellsOf('B1'), B2: cellsOf('B2'), B3: cellsOf('B3'), B4: cellsOf('B4') };
  // ---- raster: base, railway, edge band
  fill(0, 0, W, H, T.GRASS);
  fill(0, 0, W, 3, T.BALLAST); fill(0, 3, W, 5, T.RAIL); fill(0, 6, W, 2, T.BALLAST);
  fill(0, Y.arch.y0 - 1, W, 1, T.WALL); // viaduct wall
  fill(0, Y.arch.y0, W, 6, T.HARD);
  // platforms (station on east)
  const stationX0 = jit(122, 3), stationX1 = stationX0 + 20;
  fill(stationX0 - 14, 5, 52, 2, T.PLATFORM);
  // streets
  for (const s of M.streets) fillR(s.rect, T.PAVEMENT);
  for (const s of M.streets) {
    if (s.axis === 'h') fill(s.rect.x, s.rect.y + s.pav, s.rect.w, s.w - 2 * s.pav, T.ROAD);
  }
  for (const s of M.streets) {
    if (s.axis === 'v') {
      const top = s.rect.y - 1, bot = s.rect.y + s.rect.h;
      // road runs through the pavement rows of the adjoining horizontal streets to meet their carriageway
      const hTop = M.streets.find((q) => q.axis === 'h' && q.rect.y + q.rect.h === s.rect.y), hBot = M.streets.find((q) => q.axis === 'h' && q.rect.y === s.rect.y + s.rect.h);
      const y0 = hTop ? hTop.rect.y + hTop.rect.h - hTop.pav : s.rect.y, y1 = hBot ? hBot.rect.y + hBot.pav : s.rect.y + s.rect.h;
      fill(s.rect.x + s.pav, y0, s.w - 2 * s.pav, y1 - y0, T.ROAD);
    }
  }
  // edge band: canal or ring road
  const E = Y.edge;
  if (southEdge === 'canal') {
    fill(0, E.y0, W, 2, T.PATH); fill(0, E.y0 + 2, W, 5, T.WATER); fill(0, E.y0 + 7, W, 3, T.FARBANK);
  } else {
    fill(0, E.y0, W, 2, T.GRASS); fill(0, E.y0 + 2, W, 8, T.PAVEMENT); fill(0, E.y0 + 4, W, 4, T.ROAD);
  }
  M.features = { railway: { y0: 0, y1: 8, stationX0, stationX1 }, edge: { kind: southEdge, rect: R(0, E.y0, W, 10) } };

  // =========================================================== helpers: units, buildings
  const pickW = (obj) => { const ks = Object.keys(obj); return Number(rng.weighted(ks, ks.map((k) => obj[k]))); };
  const choose = (arr) => rng.pick(arr);
  const clampRect = (r) => r;
  const DOORS = {}; // building id -> [{x,y,node}]
  const nodeAtPav = (x, y, kind = 'door', ref = null) => g.node(x, y, kind, ref);
  /** walk from an entry tile in direction dir until the first pavement tile; paint a path; return node id on the pavement */
  const attachEntry = (ex, ey, dir, ref = null) => {
    const dv = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dir];
    let x = ex, y = ey, steps = 0; const trail = [];
    while (inb(x, y) && M.tiles[I(x, y)] !== T.PAVEMENT && steps < 30) { trail.push([x, y]); x += dv[0]; y += dv[1]; steps++; }
    if (!inb(x, y) || M.tiles[I(x, y)] !== T.PAVEMENT) return -1;
    const pav = g.node(x, y, 'street');
    if (trail.length === 0) { g.nodes[pav].kind = 'door'; return pav; }
    for (const [tx, ty] of trail) if (M.tiles[I(tx, ty)] !== T.BUILDING) M.tiles[I(tx, ty)] = T.PATH;
    const e = g.node(ex, ey, 'door', ref);
    g.edge(e, pav, 'path');
    return e;
  };
  const doorTileFor = (rect, facing, cx) => {
    switch (facing) { case 'N': return { x: cx, y: rect.y - 1 }; case 'S': return { x: cx, y: rect.y + rect.h }; case 'W': return { x: rect.x - 1, y: cx }; default: return { x: rect.x + rect.w, y: cx }; }
  };
  const streetOfNode = (x, y) => M.streets.find((s) => x >= s.rect.x && x < s.rect.x + s.rect.w && y >= s.rect.y && y < s.rect.y + s.rect.h);
  const mkUnit = (b, o) => {
    const u = { id: M.units.length, buildingId: b.id, kind: o.kind, floor: o.floor || 0, bedrooms: o.bedrooms ?? 2, floorAreaM2: o.floorAreaM2 ?? 70, core: o.core || 0, label: o.label || '', venueId: o.venueId ?? null, tenure: null, landlord: null, vacant: false, address: '', node: -1 };
    M.units.push(u); b.units.push(u.id); return u;
  };
  const roll = (spec) => pickW(spec);
  const between = (r) => r[0] + rng.int(0, r[1] - r[0]);
  const addBuilding = (o) => {
    const b = { id: M.buildings.length, archetype: o.archetype, kind: o.kind || 'residential', name: o.name || '', rect: o.rect, plot: o.plot || o.rect, facing: o.facing, storeys: o.storeys, roof: o.roof, ridge: o.ridge || ((o.facing === 'N' || o.facing === 'S') ? 'x' : 'y'), material: o.material, year: o.year || 1900, streetId: o.streetId ?? -1, door: o.door || null, node: -1, units: [], venueId: null, rowId: o.rowId ?? null, doors: [], decor: o.decor || [] };
    M.buildings.push(b);
    fillR(b.rect, T.BUILDING);
    for (let j = b.rect.y; j < b.rect.y + b.rect.h; j++) for (let i = b.rect.x; i < b.rect.x + b.rect.w; i++) if (inb(i, j)) M.bAt[I(i, j)] = b.id;
    return b;
  };
  const dwellingUnits = (b, a, extra = {}) => {
    const spec = a.units;
    if (a.perFloor) { // blocks
      const per = a.perFloor.count, cores = a.perFloor.cores;
      for (let f = 0; f < b.storeys; f++) for (let k = 0; k < per; k++) {
        const s = spec[0]; mkUnit(b, { kind: s.kind, floor: f, bedrooms: roll(s.bedrooms), floorAreaM2: between(s.floorAreaM2), core: Math.floor(k * cores / per) });
      }
      return;
    }
    for (const s of spec) mkUnit(b, { kind: s.kind, floor: s.floor || 0, bedrooms: roll(s.bedrooms), floorAreaM2: between(s.floorAreaM2), label: s.hmo ? 'HMO' : '' });
  };
  const houseBuilding = (archId, rect, plot, facing, street, rowId, extra = {}) => {
    const a = A[archId];
    const b = addBuilding({ archetype: archId, rect, plot, facing, storeys: a.storeys, roof: a.roof, material: choose(a.material), year: between(a.year), streetId: street?.id ?? -1, rowId, kind: 'residential' });
    dwellingUnits(b, a);
    return b;
  };
  // =========================================================== rows of houses
  /** Place a straight row of houses along x in [x0,x1). side = where the street is relative to the row: 'N' (row lies south of its street) or 'S'. */
  const placeRow = (o) => {
    const rowId = M.cells.length * 100 + (o.tag || 0);
    let x = o.x0, i = 0; const made = [];
    // plot ground first
    const py = o.side === 'N' ? o.edge : o.edge - o.depth;
    fill(o.x0, py, o.x1 - o.x0, o.depth, T.YARD);
    if (o.fy > 0) fill(o.x0, o.side === 'N' ? o.edge : o.edge - o.fy, o.x1 - o.x0, o.fy, T.GARDEN);
    while (x < o.x1) {
      const rem = o.x1 - x;
      const s = o.pick(rem, i);
      if (s && s.gap) { x += s.gap; i++; continue; }
      if (!s || s.w > rem) { break; }
      let w = s.w; if (rem - w > 0 && rem - w < 3) w = rem;
      const a = A[s.arch];
      const bd = s.d || a.footprint.d;
      const by = o.side === 'N' ? o.edge + o.fy : o.edge - o.fy - bd;
      const rect = R(x, by, w, bd), plot = R(x, py, w, o.depth);
      const b = houseBuilding(s.arch, rect, plot, o.side, o.street, rowId);
      const cx = x + Math.floor(w / 2);
      const dt = doorTileFor(rect, o.side, cx);
      b.door = dt; b.entryDir = o.side; b.doors.push({ ...dt, core: 0 });
      made.push(b); x += w; i++;
    }
    return made;
  };
  const terracePick = (mix, fixedW) => (rem, i) => {
    const arch = rng.weighted(Object.keys(mix), Object.values(mix));
    const a = A[arch];
    return { arch, w: a.footprint.w };
  };
  // =========================================================== B1: back-to-back terraces / semis / new-build
  const B1y0 = Y.B1.y0, B1y1 = Y.B1.y1;
  const b1Roles = rng.shuffle(['terrace', 'terrace', 'semi', 'newbuild']);
  // new-build sits next to the station (east cell); terraces fill the west/middle; semi cell in the middle-east
  const b1Assign = ['terrace', rng.chance(0.5) ? 'terrace' : 'semi', rng.chance(0.5) ? 'semi' : 'terrace', 'newbuild'];
  if (b1Assign[1] === 'semi' && b1Assign[2] === 'semi') b1Assign[1] = 'terrace';
  if (b1Assign[1] === 'terrace' && b1Assign[2] === 'terrace') b1Assign[2] = 'semi';
  const mixTerrace = pack.TERRACE_MIX;
  const semiPick = () => ({ arch: 'semi', w: 4 });
  const roleBackToBack = (cell, kind) => {
    const [x0, x1] = cell; const fyA = kind === 'semi' ? 1 : choose([0, 0, 1]); const fyB = kind === 'semi' ? 1 : choose([0, 0, 1]);
    const pick = kind === 'semi' ? semiPick : terracePick(mixTerrace);
    const depth = kind === 'semi' ? 10 : 9;
    M.cells.push({ band: 'B1', role: kind, rect: R(x0, B1y0, x1 - x0, B1y1 - B1y0) });
    placeRow({ x0, x1, edge: B1y0, side: 'N', depth, fy: fyA, street: S0, pick, tag: 1 });
    placeRow({ x0, x1, edge: B1y1, side: 'S', depth, fy: fyB, street: S1, pick, tag: 2 });
    const aly = B1y0 + depth, alh = (B1y1 - depth) - aly;
    if (alh > 0) fill(x0, aly, x1 - x0, alh, kind === 'semi' ? T.YARD : T.ALLEY);
  };
  const newbuildBlock = (cell, row) => {
    const [x0, x1] = cell, a = A.newbuild_apartments;
    const st = between(a.floors), w = Math.min(a.footprint.w, x1 - x0 - 2), d = a.footprint.d;
    const rect = R(x0 + Math.floor((x1 - x0 - w) / 2), B1y0 + 3, w, d);
    fill(x0, B1y0, x1 - x0, B1y1 - B1y0, T.HARD); fill(x0, B1y0, x1 - x0, 3, T.FOREC);
    const b = addBuilding({ archetype: 'newbuild_apartments', rect, plot: R(x0, B1y0, x1 - x0, B1y1 - B1y0), facing: 'N', storeys: st, roof: a.roof, material: choose(a.material), year: between(a.year), streetId: S0.id, kind: 'residential', name: pickName(SN.NEWBUILD_NAMES) });
    dwellingUnits(b, a);
    const cx = rect.x + Math.floor(rect.w / 2);
    b.door = doorTileFor(rect, 'N', cx); b.entryDir = 'N'; b.doors.push({ ...b.door, core: 0 });
    M.cells.push({ band: 'B1', role: 'newbuild', rect: R(x0, B1y0, x1 - x0, B1y1 - B1y0) });
    // rear car park / cycle store
    for (let i = 0; i < 6; i++) M.props.cars.push({ x: x0 + 3 + i * 3, y: B1y1 - 6, v: false, c: rng.int(0, 7) });
    return b;
  };
  cells.B1.forEach((c, i) => {
    const role = b1Assign[i];
    if (role === 'newbuild') newbuildBlock(c); else roleBackToBack(c, role);
  });
  // =========================================================== venues / shop buildings
  const venueMeta = (tplId) => VT[tplId];
  const addVenue = (tplId, b, o = {}) => {
    const t = VT[tplId];
    const v = { id: M.venues.length, template: tplId, category: t.category, name: o.name || pickName(t.names || [t.label], t.label), variant: o.variant || null, buildingId: b ? b.id : -1, unitId: -1, zone: o.zone || t.zone, capacity: t.capacity, node: -1, trade: o.trade || null, rect: o.rect || (b ? b.rect : null), religion: t.religion || null };
    M.venues.push(v);
    if (b) { b.venueId = v.id; b.name = b.name || v.name; const u = mkUnit(b, { kind: 'venue', floor: 0, label: tplId, venueId: v.id }); v.unitId = u.id; }
    return v;
  };
  const shopBuilding = (tplId, rect, facing, street, plot, o = {}) => {
    const t = VT[tplId], a = A.shop_with_flat;
    const storeys = 1 + (t.storeysAbove ? rng.int(1, 2) : 0);
    const b = addBuilding({ archetype: 'shop_with_flat', kind: o.kind || 'commercial', rect, plot, facing, storeys, roof: o.roof || a.roof, material: o.material || choose(a.material), year: between(a.year), streetId: street.id, name: '' });
    const cx = rect.x + Math.floor(rect.w / 2);
    const cy = rect.y + Math.floor(rect.h / 2);
    b.door = doorTileFor(rect, facing, facing === 'N' || facing === 'S' ? cx : cy); b.entryDir = facing; b.doors.push({ ...b.door, core: 0 });
    const v = addVenue(tplId, b, o);
    if (t.storeysAbove && storeys > 1 && rng.chance(a.upperFlatProb)) { const s = a.units[0]; mkUnit(b, { kind: 'flat', floor: 1, bedrooms: roll(s.bedrooms), floorAreaM2: between(s.floorAreaM2), label: 'above shop' }); b.archetype = 'shop_with_flat'; }
    return { b, v };
  };
  const frontagePlot = (side, edge, x, w, depth, bd) => {
    // paints rear yard + service lane for a frontage plot; edge = y of street-side edge, side = street side ('S' for north-of-street buildings)
    const dirN = side === 'N'; // street to north -> building at top of plot
    const py = dirN ? edge : edge - depth;
    fill(x, py, w, depth, T.YARD);
    const laneY = dirN ? edge + depth - 2 : edge - depth;
    fill(x, laneY, w, 2, T.ALLEY);
    return R(x, py, w, depth);
  };
  // =========================================================== B2 / B3 cell roles
  const B2 = Y.B2, B3 = Y.B3;
  const b2roles = ['church', ...rng.shuffle(['terrace', 'villa']), 'semi_gp'];
  const b3roles = ['mosque', ...rng.shuffle(['villa', 'terrace']), 'civic'];
  const villaPick = (opts = {}) => (rem, i) => {
    if (i % 2 === 1) return { gap: 2 };
    const arch = rng.chance(opts.detP ?? 0.45) ? 'detached_villa' : 'converted_villa';
    return { arch, w: 6, d: 6 };
  };
  const singleRow = (cell, band, role, side, edge, street, o = {}) => {
    const [x0, x1] = cell; const depth = 11;
    M.cells.push({ band, role, rect: R(x0, side === 'N' ? edge : edge - depth, x1 - x0, depth) });
    const fy = role === 'semi' ? 2 : choose([0, 1, 1]);
    const pick = role === 'villa' ? villaPick() : role === 'semi' ? semiPick : terracePick(mixTerrace);
    return placeRow({ x0: o.x0 ?? x0, x1: o.x1 ?? x1, edge, side, depth, fy: role === 'villa' ? 1 : fy, street, pick, tag: o.tag || 3 });
  };
  // ---- B2 north rows (street S1 to the north)
  b2roles.forEach((role, i) => {
    const c = cells.B2[i];
    if (role === 'church') return;
    if (role === 'semi_gp') { singleRow(c, 'B2', 'semi', 'N', B2.y0, S1, { tag: 4 }); return; }
    singleRow(c, 'B2', role, 'N', B2.y0, S1, { tag: 5 + i });
  });
  // ---- B3 south rows (street S2 to the south); mosque cell keeps x>=mosqueEnd
  const mosqueW = 14;
  b3roles.forEach((role, i) => {
    const c = cells.B3[i];
    if (role === 'civic') return;
    if (role === 'mosque') { singleRow(c, 'B3', 'terrace', 'S', B3.y1, S2, { tag: 8, x0: c[0] + mosqueW + 3 }); return; }
    singleRow(c, 'B3', role, 'S', B3.y1, S2, { tag: 9 + i });
  });
  // =========================================================== HS frontage (venues)
  const retailSegs = [];
  const segOf = (band, i, side) => ({ side, c: cells[band][i], x0: cells[band][i][0], x1: cells[band][i][1], items: [], band });
  const N = [0, 1, 2, 3].map((i) => segOf('B2', i, 'N')), Sg = [0, 1, 2, 3].map((i) => segOf('B3', i, 'S'));
  const want = [];
  for (const id of Object.keys(VT)) {
    const t = VT[id];
    if (t.zone !== 'hs' || t.filler || ['pub', 'small_supermarket', 'gp_surgery', 'pharmacy', 'dentist'].includes(id)) continue;
    const n = t.count[0] + rng.int(0, t.count[1] - t.count[0]); for (let k = 0; k < n; k++) want.push(id);
  }
  rng.shuffle(want);
  const widthOf = (id) => VT[id].footprint.w + (rng.chance(0.3) ? 1 : 0);
  // pins
  const pin = (seg, id, at) => seg.items.push({ id, w: VT[id].footprint.w + (id === 'pub' ? rng.int(0, 2) : 0), at });
  const retail = [N[1], N[2], Sg[1], Sg[2]];
  pin(N[1], 'pub', 'east'); pin(Sg[2], 'pub', 'west'); // diagonal corners on the main crossroad
  const superSeg = rng.pick([N[2], Sg[2]]); superSeg.items.push({ id: 'small_supermarket', w: VT.small_supermarket.footprint.w, at: 'mid' });
  const used = (seg) => seg.items.reduce((s, it) => s + it.w, 0);
  const cap = (seg) => seg.x1 - seg.x0 - 3;
  for (const id of want) {
    const w = widthOf(id);
    const open = retail.filter((s) => cap(s) - used(s) >= w);
    if (!open.length) continue;
    const seg = rng.weighted(open, open.map((s) => cap(s) - used(s)));
    seg.items.push({ id, w });
  }
  // filler: vacant / extra units until segments are ~full
  for (const seg of retail) {
    let guard = 0;
    while (cap(seg) - used(seg) >= 4 && guard++ < 6) {
      const id = rng.pick(['vacant_unit', 'vacant_unit', 'charity_shop', 'estate_agent', 'bakery', 'cafe', 'salon']);
      if (id !== 'vacant_unit' && M.venues.filter((v) => v.template === id).length + retail.reduce((n, s) => n + s.items.filter((it) => it.id === id).length, 0) >= (VT[id].count?.[1] ?? 1) + 1) continue;
      seg.items.push({ id, w: Math.min(VT[id].footprint.w, cap(seg) - used(seg)) });
    }
  }
  const layoutSeg = (seg, firstX) => {
    // order: 'west'-pinned first, 'east'-pinned last, rest shuffled; slack distributed as extra width then a gap lot
    const west = seg.items.filter((it) => it.at === 'west'), east = seg.items.filter((it) => it.at === 'east'), midp = seg.items.filter((it) => it.at === 'mid'), rest = seg.items.filter((it) => !it.at);
    rng.shuffle(rest);
    const midIdx = rng.int(0, rest.length); rest.splice(midIdx, 0, ...midp);
    const order = [...west, ...rest, ...east];
    let x = seg.x0 + 1, slack = (seg.x1 - seg.x0 - 2) - order.reduce((s, it) => s + it.w, 0);
    // spread slack: +1 width to random items
    let g2 = 0; while (slack > 0 && order.length && g2++ < 40) { const it = rng.pick(order); if (it.id.startsWith('vacant') || it.id === 'small_supermarket') continue; it.w++; slack--; }
    if (east.length && slack > 0) x += 0; // any remaining slack becomes a small lot before the east pin
    for (const it of order) { it.x = x; x += it.w; }
    if (slack > 0 && east.length) { for (const it of east) it.x += slack; }
    return order;
  };
  const built = [];
  const buildSeg = (seg) => {
    const order = layoutSeg(seg);
    for (const it of order) {
      const t = VT[it.id], bd = t.footprint.d;
      const north = seg.side === 'N';
      const edge = north ? B2.y1 : B3.y0;
      const rect = north ? R(it.x, B2.y1 - bd, it.w, bd) : R(it.x, B3.y0, it.w, bd);
      const plot = frontagePlot(north ? 'S' : 'N', edge, it.x, it.w, 11, bd);
      fill(it.x, rect.y, it.w, bd, T.YARD);
      const facing = north ? 'S' : 'N';
      const { b, v } = shopBuilding(it.id, rect, facing, HS, plot, { variant: null });
      if (t.variants) v.variant = rng.pick(t.variants);
      built.push(v);
    }
  };
  for (const seg of retail) buildSeg(seg);
  // non-retail frontage (GP cluster NE, civic SE, mosque SW, church NW handled below)
  const frontHouses = (x0, x1, side, label) => {
    // terraced houses facing the high street with 1-tile forecourts, 11-deep plots
    const north = side === 'N';
    const edge = north ? B2.y1 : B3.y0; const depth = 11;
    const pick = terracePick({ terrace_2up2down: 0.8, converted_terrace: 0.2 });
    placeRow({ x0, x1, edge, side: north ? 'S' : 'N', depth, fy: 1, street: HS, pick, tag: 20 });
    // rear lane + yard for them
    const laneY = north ? edge - 2 - 0 : edge + depth - 2;
    fill(x0, north ? edge - depth : edge + depth - 2, x1 - x0, 2, T.ALLEY);
  };
  // NE: GP surgery cluster at the start of N[3]
  {
    const seg = N[3]; let x = seg.x0 + 1;
    for (const id of ['gp_surgery', 'pharmacy', 'dentist']) {
      if (id === 'dentist' && rng.chance(0.4)) continue;
      const t = VT[id], w = t.footprint.w, bd = t.footprint.d;
      if (x + w > seg.x1 - 12) break;
      const rect = R(x, B2.y1 - bd, w, bd); const plot = frontagePlot('S', B2.y1, x, w, 11, bd);
      if (id === 'gp_surgery') { fill(x, B2.y1 - 11, w, 11, T.HARD); }
      shopBuilding(id, rect, 'S', HS, plot, { zone: 'hs' });
      x += w;
    }
    frontHouses(x, seg.x1, 'N');
  }
  // SW: mosque (converted building) + a few houses facing HS
  {
    const seg = Sg[0]; const t = VT.mosque; const w = t.footprint.w + 2, d = t.footprint.d + 2;
    const rect = R(seg.x0 + 1, B3.y0 + 2, w, d);
    fill(seg.x0, B3.y0, w + 4, 22, T.HARD); fill(seg.x0, B3.y0, w + 4, 2, T.FOREC);
    const b = addBuilding({ archetype: 'mosque', kind: 'worship', rect, plot: R(seg.x0, B3.y0, w + 3, 22), facing: 'N', storeys: 2, roof: 'dome', material: 'buff_brick', year: 1925, streetId: HS.id });
    b.door = { x: rect.x + Math.floor(w / 2), y: rect.y - 1 }; b.entryDir = 'N'; b.doors.push({ ...b.door, core: 0 });
    addVenue('mosque', b, {});
    frontHouses(seg.x0 + w + 4, seg.x1, 'S');
  }
  // SE: library + community centre (civic compound) + nursery in a villa facing S2
  {
    const seg = Sg[3]; let x = seg.x0 + 1;
    for (const id of ['library', 'community_centre']) {
      const t = VT[id], w = t.footprint.w, bd = t.footprint.d;
      const rect = R(x, B3.y0 + 1, w, bd); const plot = R(x, B3.y0, w, 11);
      fill(x, B3.y0, w, 12, T.FOREC);
      const b = addBuilding({ archetype: id, kind: 'civic', rect, plot, facing: 'N', storeys: 2, roof: id === 'library' ? 'hip' : 'flat', material: id === 'library' ? 'red_brick' : 'buff_brick', year: id === 'library' ? 1912 : 1974, streetId: HS.id });
      b.door = { x: rect.x + Math.floor(w / 2), y: rect.y - 1 }; b.entryDir = 'N'; b.doors.push({ ...b.door, core: 0 });
      addVenue(id, b, {});
      x += w + 1;
    }
    const cx0 = seg.x0, cx1 = seg.x1;
    // car park behind, nursery on S2
    fill(cx0, B3.y0 + 12, cx1 - cx0, 10, T.HARD);
    const nt = VT.nursery, nw = nt.footprint.w, nd = nt.footprint.d;
    const nrect = R(cx0 + 4, B3.y1 - nd - 1, nw, nd);
    const nb = addBuilding({ archetype: 'detached_villa', kind: 'education', rect: nrect, plot: R(cx0 + 2, B3.y1 - 12, 24, 12), facing: 'S', storeys: 2, roof: 'hip', material: 'yellow_stock', year: 1895, streetId: S2.id });
    fill(cx0 + 2, B3.y1 - 12, 24, 12, T.PLAY); fillR(nrect, T.BUILDING);
    nb.door = doorTileFor(nrect, 'S', nrect.x + 3); nb.entryDir = 'S'; nb.doors.push({ ...nb.door, core: 0 });
    addVenue('nursery', nb, {});
    for (let i = 0; i < 4; i++) M.props.cars.push({ x: cx0 + 4 + i * 3, y: B3.y0 + 14, v: false, c: rng.int(0, 7) });
  }
  // NW: church + hall in a churchyard
  {
    const c = cells.B2[0]; const cw = c[1] - c[0];
    fill(c[0], B2.y0, cw, B2.y1 - B2.y0, T.CHURCHYARD);
    const t = VT.church, w = t.footprint.w, d = t.footprint.d;
    const rect = R(c[0] + 3, B2.y1 - d - 3, w, d);
    const b = addBuilding({ archetype: 'church', kind: 'worship', rect, plot: R(c[0], B2.y0, cw, B2.y1 - B2.y0), facing: 'S', storeys: 2, roof: 'cross', material: 'grey_stone', year: 1868, streetId: HS.id });
    b.door = { x: rect.x + Math.floor(w / 2), y: rect.y + rect.h }; b.entryDir = 'S'; b.doors.push({ ...b.door, core: 0 });
    addVenue('church', b, {});
    const hall = addBuilding({ archetype: 'church_hall', kind: 'civic', rect: R(c[0] + 3 + w + 1, B2.y1 - 10, Math.min(8, cw - w - 5), 7), facing: 'S', storeys: 1, roof: 'gable', material: 'red_brick', year: 1932, streetId: HS.id });
    hall.door = doorTileFor(hall.rect, 'S', hall.rect.x + 2); hall.entryDir = 'S'; hall.doors.push({ ...hall.door, core: 0 }); hall.parentBuilding = b.id;
    for (let i = 0; i < 6; i++) M.props.trees.push({ x: c[0] + 1 + rng.int(0, cw - 3), y: B2.y0 + 1 + rng.int(0, 16), r: 1.3 + rng.float(0, 0.8) });
  }
  // =========================================================== polylines of walkable path (estate/park/school)
  const pathPoly = (pts, kind = 'path', t = T.PATH) => {
    let prev = -1;
    for (let k = 0; k < pts.length; k++) {
      const [x, y] = pts[k];
      if (k > 0) { const [px, py] = pts[k - 1]; const dx = Math.sign(x - px), dy = Math.sign(y - py); let cx = px, cy = py; while (cx !== x || cy !== y) { cx += dx; cy += dy; if (M.tiles[I(cx, cy)] !== T.BUILDING && M.tiles[I(cx, cy)] !== T.WATER) { if (M.tiles[I(cx, cy)] !== T.PAVEMENT) M.tiles[I(cx, cy)] = t; } } }
      const n = g.node(x, y, 'path');
      if (prev >= 0) g.edge(prev, n, 'path');
      prev = n;
    }
    return prev;
  };
  // =========================================================== B4: estate | school | park
  const B4 = Y.B4;
  const eY = southEdge === 'canal' ? Y.edge.y0 : Y.edge.y0 + 2; // edge chain row
  const areaDefs = [];
  // --- estate
  {
    const c = cells.B4[0], x0 = c[0], x1 = c[1], cw = x1 - x0, y0 = B4.y0;
    M.cells.push({ band: 'B4', role: 'estate', rect: R(x0, y0, cw, 20) });
    fill(x0, y0, cw, 20, T.GRASS);
    const sa = A.council_slab, st = between(sa.floors);
    const sw = Math.min(sa.footprint.w, cw - 26);
    const slab = addBuilding({ archetype: 'council_slab', rect: R(x0 + 3, y0 + 2, sw, sa.footprint.d), plot: R(x0, y0, cw, 20), facing: 'N', storeys: st, roof: 'flat', material: choose(sa.material), year: between(sa.year), streetId: S2.id, name: pickName(SN.SLAB_NAMES) });
    dwellingUnits(slab, sa);
    for (let k = 0; k < sa.perFloor.cores; k++) { const cx = slab.rect.x + Math.floor(slab.rect.w * (k + 0.5) / sa.perFloor.cores); slab.doors.push({ x: cx, y: slab.rect.y - 1, core: k }); }
    slab.door = slab.doors[0]; slab.entryDir = 'N';
    const ha = A.ha_lowrise, haw = Math.min(ha.footprint.w, x1 - (x0 + 3 + sw + 3) - 1);
    if (haw >= 12) {
      const hb = addBuilding({ archetype: 'ha_lowrise', rect: R(x1 - haw - 1, y0 + 2, haw, ha.footprint.d), plot: R(x1 - haw - 2, y0, haw + 2, 20), facing: 'N', storeys: between(ha.floors), roof: 'flat', material: choose(ha.material), year: between(ha.year), streetId: S2.id, name: pickName(SN.HA_NAMES) });
      dwellingUnits(hb, ha); hb.doors.push({ x: hb.rect.x + Math.floor(hb.rect.w / 2), y: hb.rect.y - 1, core: 0 }); hb.door = hb.doors[0]; hb.entryDir = 'N';
    }
    const ma = A.council_maisonettes;
    const mb = addBuilding({ archetype: 'council_maisonettes', rect: R(x0 + 3, y0 + 13, ma.footprint.w, ma.footprint.d), plot: R(x0, y0 + 11, cw, 9), facing: 'N', storeys: 3, roof: 'flat', material: choose(ma.material), year: between(ma.year), streetId: S2.id, name: pickName(SN.MAISONETTE_NAMES) });
    dwellingUnits(mb, ma);
    for (let k = 0; k < 2; k++) mb.doors.push({ x: mb.rect.x + Math.floor(mb.rect.w * (k + 0.5) / 2), y: mb.rect.y - 1, core: k });
    mb.door = mb.doors[0]; mb.entryDir = 'N'; mb.pathEntry = true;
    // courtyard walkway + west spine to S2
    fill(x0 + 1, y0 + 11, sw + 6, 2, T.PATH);
    const spineTop = pathPoly([[x0 + 1, y0 - 1], [x0 + 1, y0 + 12]]);
    for (const d of mb.doors) { const n = pathPoly([[x0 + 1, d.y], [d.x, d.y]]); }
    // ball court + garages + parking
    fill(x0 + 27, y0 + 14, 9, 6, T.PITCH);
    fill(x1 - 20, y0 + 13, 19, 7, T.HARD);
    for (let i = 0; i < 6; i++) M.props.cars.push({ x: x1 - 19 + i * 3, y: y0 + 16, v: false, c: rng.int(0, 7) });
    areaDefs.push({ kind: 'estate_green', rect: R(x0, y0, cw, 20), name: 'Estate green' });
    for (let i = 0; i < 9; i++) M.props.trees.push({ x: x0 + 1 + rng.int(0, cw - 3), y: y0 + 11 + rng.int(0, 8), r: 1.1 + rng.float(0, 0.7) });
    // estate corner shop on the S2 frontage (west of the slab)
  }
  // --- school
  {
    const c = cells.B4[1], x0 = c[0], x1 = c[1], cw = x1 - x0, y0 = B4.y0;
    M.cells.push({ band: 'B4', role: 'school', rect: R(x0, y0, cw, 20) });
    const t = VT.primary_school, bw = Math.min(t.footprint.w, cw - 8), bd = t.footprint.d;
    fill(x0, y0, cw, 20, T.PLAY); fill(x0, y0, cw, 2, T.FOREC);
    const rect = R(x0 + 3, y0 + 2, bw, bd);
    const b = addBuilding({ archetype: 'primary_school', kind: 'education', rect, plot: R(x0, y0, cw, 20), facing: 'N', storeys: 1, roof: 'flat', material: 'red_brick', year: 1904, streetId: S2.id });
    b.doors.push({ x: rect.x + Math.floor(bw / 2), y: rect.y - 1, core: 0 }); b.door = b.doors[0]; b.entryDir = 'N';
    addVenue('primary_school', b, {});
    // field (grass) east of the building, trees, MUGA
    const fx = x0 + bw + 5; if (fx < x1 - 6) fill(fx, y0 + 3, x1 - fx - 1, 16, T.PARK);
    fill(x0 + 4, y0 + 13, 12, 6, T.PITCH);
    areaDefs.push({ kind: 'school_grounds', rect: R(x0, y0, cw, 20), name: 'School grounds' });
    for (let i = 0; i < 7; i++) M.props.trees.push({ x: Math.max(fx, x0) + 1 + rng.int(0, Math.max(1, x1 - fx - 4)), y: y0 + 3 + rng.int(0, 15), r: 1.2 + rng.float(0, 0.8) });
    // side gate onto the N-S street at the west
    M.schoolGate = { x: x0 - 1, y: y0 + 8 };
    pathPoly([[x0, y0 + 14], [x0 - 1, y0 + 14]]);
  }
  // --- park (+ playground, pitch, kiosk)
  let parkArea = null;
  {
    const c = cells.B4[2], x0 = c[0], x1 = c[1], cw = x1 - x0, y0 = B4.y0;
    M.cells.push({ band: 'B4', role: 'park', rect: R(x0, y0, cw, 20) });
    fill(x0, y0, cw, 20, T.PARK);
    // ring path + cross path
    const px0 = x0 + 1, px1 = x1 - 2, py0 = y0 + 1, py1 = y0 + 18;
    const midx = Math.floor((px0 + px1) / 2), midy = Math.floor((py0 + py1) / 2);
    pathPoly([[px0, py0], [px1, py0], [px1, py1], [px0, py1], [px0, py0]]);
    pathPoly([[midx, y0 - 1], [midx, eY]]);
    pathPoly([[px0, midy], [px1, midy]]);
    pathPoly([[x0 - 1, midy], [px0, midy]]);
    // second north entrance
    const nx = px0 + Math.floor((px1 - px0) * 0.22); pathPoly([[nx, y0 - 1], [nx, py0]]);
    // features
    fill(px0 + 3, py0 + 2, 12, 7, T.PLAY);
    const mx = px1 - 15; fill(mx, midy + 2, 13, 10, T.PITCH);
    const kx = midx + 3, ky = midy - 6;
    const kb = addBuilding({ archetype: 'park_pavilion', kind: 'civic', rect: R(kx, ky, 7, 4), plot: R(kx - 1, ky - 1, 9, 6), facing: 'S', storeys: 1, roof: 'hip', material: 'timber_cladding', year: 2009, streetId: -1, name: 'Park Pavilion Café' });
    kb.door = { x: kx + 3, y: ky + 4 }; kb.entryDir = 'S'; kb.parkEntry = true; kb.doors.push({ ...kb.door, core: 0 });
    kb.nodeOverride = g.node(kx + 3, ky + 4, 'path');
    parkArea = { kind: 'park', rect: R(x0, y0, cw, 20), name: pickName(SN.PARK_NAMES), paths: [midx, midy] };
    areaDefs.push(parkArea);
    for (let i = 0; i < 34; i++) { const tx = x0 + 1 + rng.int(0, cw - 3), ty = y0 + 1 + rng.int(0, 17); if (M.tiles[I(tx, ty)] === T.PARK) M.props.trees.push({ x: tx, y: ty, r: 1.3 + rng.float(0, 1.1) }); }
    for (let i = 0; i < 8; i++) M.props.benches.push({ x: px0 + 4 + i * 6, y: i % 2 ? py1 - 1 : py0 + 1, v: false });
    M.parkMid = { x: midx, y: midy };
  }
  // allotments: if canal, a strip behind the new-build/terraces west edge? (W end of B4 band handled by estate). Place on railway-side leftover west of the arches
  {
    const ax0 = 0, ax1 = 3; // tiny strip kept as allotments beside the railway cutting on the west edge
    fill(ax0, Y.arch.y0, 4, 6, T.ALLOTMENT);
    areaDefs.push({ kind: 'allotments', rect: R(ax0, Y.arch.y0, 4, 6), name: 'Railway allotments' });
  }
  // =========================================================== railway arches + station
  const archList = [];
  {
    const y0 = Y.arch.y0;
    const slots = [];
    const ranges = [[5, stationX0 - 3], [stationX1 + 3, W - 3]];
    for (const [a, b] of ranges) { let x = a; while (x + 4 <= b) { const w = rng.chance(0.78) ? 4 : (rng.chance(0.6) ? 5 : 6); if (x + w > b) break; slots.push({ x, w }); x += w; } }
    // gym knocked through 2 adjacent arches (need adjacent slots in the western range)
    const gymIdx = rng.int(2, Math.max(2, Math.min(slots.length - 3, 12)));
    const tr = VT.business_unit.trades, trKeys = Object.keys(tr);
    const nBiz = between(VT.business_unit.count);
    const tradeCount = {};
    const sel = [];
    for (let k = 0; k < nBiz; k++) {
      const key = rng.weighted(trKeys, trKeys.map((q) => tr[q].w * (tradeCount[q] >= (q === 'car_repair' ? 3 : 2) ? 0.02 : 1)));
      tradeCount[key] = (tradeCount[key] || 0) + 1; sel.push(key);
    }
    const idxs = rng.shuffle(slots.map((_, i) => i).filter((i) => i !== gymIdx && i !== gymIdx + 1)).slice(0, nBiz);
    const trade = new Map(idxs.map((i, k) => [i, sel[k]]));
    const a = A.arch_unit;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (i === gymIdx + 1) continue; // consumed by gym
      const w = i === gymIdx ? s.w + slots[i + 1].w : s.w;
      const rect = R(s.x, y0, w, 6);
      const b = addBuilding({ archetype: 'arch_unit', kind: 'commercial', rect, plot: rect, facing: 'S', storeys: 1, roof: 'viaduct', material: 'soot_brick', year: between(a.year), streetId: S0.id });
      fill(rect.x, rect.y, w, 6, T.BUILDING);
      b.door = { x: rect.x + Math.floor(w / 2), y: rect.y + 6 }; b.entryDir = 'S'; b.doors.push({ ...b.door, core: 0 });
      if (i === gymIdx) addVenue('gym', b, {});
      else if (trade.has(i)) { const tk = trade.get(i), td = tr[tk]; const v = addVenue('business_unit', b, { name: pickName(td.names, td.label), trade: tk }); v.tradeLabel = td.label; }
      else { b.vacantArch = true; b.kind = 'commercial'; }
      archList.push(b);
    }
    // the station building (ticket hall) between the two arch ranges, with entrance on S0
    const sb = addBuilding({ archetype: 'station', kind: 'transport', rect: R(stationX0, y0, stationX1 - stationX0, 6), plot: R(stationX0, y0, stationX1 - stationX0, 6), facing: 'S', storeys: 2, roof: 'hip', material: 'brown_brick', year: 1887, streetId: S0.id, name: 'Larkfield station' });
    sb.door = { x: stationX0 + Math.floor((stationX1 - stationX0) / 2), y: y0 + 6 }; sb.entryDir = 'S'; sb.doors.push({ ...sb.door, core: 0 });
    M.station = sb.id; fill(stationX0 - 1, Y.S0.y0 - 0, stationX1 - stationX0 + 2, 0, T.PAVEMENT);
    for (let i = 0; i < 6; i++) M.props.bins.push({ x: stationX0 + 2 + i * 3, y: y0 + 7 });
  }
  for (const a of areaDefs) M.areas.push({ id: M.areas.length, ...a });
  // =========================================================== door nodes + units' nodes
  for (const b of M.buildings) {
    if (!b.doors.length) continue;
    for (const d of b.doors) {
      if (b.parkEntry) d.node = b.nodeOverride; else if (b.pathEntry) { d.node = g.node(d.x, d.y, 'door', b.id); const sp = g.at(M.cells.find((c) => c.role === 'estate').rect.x + 1, d.y); g.edge(d.node, sp, 'path'); }
      else d.node = attachEntry(d.x, d.y, b.entryDir, b.id);
    }
    b.node = b.doors[0].node;
    for (const uid of b.units) { const u = M.units[uid]; u.node = (b.doors[u.core || 0] || b.doors[0]).node; }
  }
  for (const v of M.venues) { if (v.buildingId >= 0) v.node = M.buildings[v.buildingId].node; }
  // =========================================================== numbering / addresses
  {
    const bySide = new Map();
    for (const b of M.buildings) {
      if (b.streetId < 0 || b.archetype === 'park_pavilion') continue;
      const key = b.streetId + ':' + (b.facing === 'N' || b.facing === 'W' ? 0 : 1);
      if (!bySide.has(key)) bySide.set(key, []);
      bySide.get(key).push(b);
    }
    for (const [key, arr] of [...bySide.entries()].sort()) {
      const [sid, sd] = key.split(':').map(Number); const st = M.streets[sid];
      arr.sort((p, q) => st.axis === 'h' ? p.rect.x - q.rect.x : p.rect.y - q.rect.y);
      arr.forEach((b, k) => { b.number = k * 2 + 1 + sd; });
    }
    for (const b of M.buildings) {
      const st = b.streetId >= 0 ? M.streets[b.streetId] : null;
      b.address = b.name && (b.kind !== 'residential' || b.units.length > 8) ? `${b.name}, ${st ? st.name : ''}`.replace(/, $/, '') : (st && b.number ? `${b.number} ${st.name}` : b.name || '');
      const dwl = b.units.map((id) => M.units[id]).filter((u) => u.kind !== 'venue');
      dwl.sort((p, q) => p.floor - q.floor);
      dwl.forEach((u, k) => {
        if (u.kind === 'house' || u.kind === 'shared_house') u.address = b.address;
        else if (u.label === 'above shop') u.address = `Flat above ${b.address}`;
        else if (dwl.length > 1) u.address = `Flat ${k + 1}, ${b.address}`; else u.address = b.address;
      });
      for (const uid of b.units) { const u = M.units[uid]; if (u.kind === 'venue') u.address = b.address; }
    }
  }
  // =========================================================== tenure / landlords / vacancy / rent
  const TEN = pack.TENURES;
  {
    const dw = M.units.filter((u) => u.kind !== 'venue');
    const n = dw.length;
    const tc = {}; for (const [k, v] of Object.entries(calib.tenure.composite)) { const key = pack.TENURE_FROM_CALIBRATION[k]; tc[key] = (tc[key] || 0) + v; }
    const raw = TEN.map((t) => (tc[t] || 0) * n); const target = {}; let acc = 0;
    TEN.forEach((t, i) => { target[t] = Math.floor(raw[i]); acc += target[t]; });
    TEN.map((t, i) => [t, raw[i] - Math.floor(raw[i])]).sort((a, b) => b[1] - a[1]).slice(0, n - acc).forEach(([t]) => { target[t]++; });
    const prior = (u) => A[M.buildings[u.buildingId].archetype].tenure || { private_rent: 1 };
    for (const u of dw) { const pr = prior(u); u.tenure = rng.weighted(TEN, TEN.map((t) => pr[t] || 0)); }
    const counts = () => { const c = {}; for (const t of TEN) c[t] = 0; for (const u of dw) c[u.tenure]++; return c; };
    let stuck = 0;
    for (let it = 0; it < 4000 && stuck < 40; it++) {
      const c = counts(); let sur = null, def = null;
      for (const t of TEN) { const d = c[t] - target[t]; if (!sur || d > c[sur] - target[sur]) sur = t; if (!def || d < c[def] - target[def]) def = t; }
      if (c[sur] - target[sur] <= 0 && target[def] - c[def] <= 0) break;
      if (c[sur] - target[sur] < 1 && target[def] - c[def] < 1) break;
      const cand = dw.filter((u) => u.tenure === sur && (prior(u)[def] || 0) > 0);
      if (!cand.length) { stuck++; // relax: any unit in an archetype where `def` has non-zero prior may switch, else give up this pair
        const cand2 = dw.filter((u) => u.tenure === sur && ['terraced', 'semi', 'convertedOrSharedHouse'].includes(A[M.buildings[u.buildingId].archetype].accommodationType) && def !== 'council' && def !== 'housing_assoc' && def !== 'shared_ownership');
        if (cand2.length) { rng.pick(cand2).tenure = def; } continue; }
      const u = rng.weighted(cand, cand.map((q) => prior(q)[def])); u.tenure = def;
    }
    // vacancy ~3.5% (turnover voids), landlords, rent / value
    const privateUnits = dw.filter((u) => u.tenure === 'private_rent');
    const landlordKinds = pack.LANDLORDS.private_rent;
    const owners = M.owners; owners.push({ id: 0, kind: 'council', units: [] }, { id: 1, kind: 'housing_association', units: [] });
    let cur = null;
    for (const u of rng.shuffle(privateUnits.slice())) {
      const bt = M.buildings[u.buildingId].archetype;
      const wantBtr = bt === 'newbuild_apartments' && rng.chance(0.5);
      if (wantBtr) { let btr = owners.find((o) => o.kind === 'build_to_rent'); if (!btr) { btr = { id: owners.length, kind: 'build_to_rent', units: [] }; owners.push(btr); } btr.units.push(u.id); u.landlord = btr.id; continue; }
      if (!cur || cur.units.length >= cur.cap) { const lk = rng.weighted(landlordKinds.filter((k) => k.kind !== 'build_to_rent'), (k) => k.w); cur = { id: owners.length, kind: lk.kind, cap: Math.max(1, between([1, Math.min(lk.units[1], 8)])), units: [], offMap: lk.kind === 'small_landlord' ? rng.int(0, 2) : lk.kind === 'portfolio_landlord' ? rng.int(6, 40) : rng.int(0, 5) }; owners.push(cur); }
      cur.units.push(u.id); u.landlord = cur.id;
    }
    for (const u of dw) {
      if (u.tenure === 'council') { owners[0].units.push(u.id); u.landlord = 0; }
      else if (u.tenure === 'housing_assoc' || u.tenure === 'shared_ownership') { owners[1].units.push(u.id); u.landlord = 1; }
      else if (u.tenure === 'owned_outright' || u.tenure === 'mortgage') u.landlord = -1; // owner-occupier
      u.vacant = rng.chance(0.035);
      const f = rng.float(0.88, 1.14);
      if (u.tenure === 'private_rent') u.rentGBPMonth = Math.round(pack.ROOM_MODEL.rentPerMonthByBedrooms[u.bedrooms] * f / 5) * 5;
      else if (u.tenure === 'council' || u.tenure === 'housing_assoc') u.rentGBPMonth = Math.round(pack.ROOM_MODEL.rentPerMonthByBedrooms[u.bedrooms] * pack.ROOM_MODEL.socialRentFactor * f / 5) * 5;
      else if (u.tenure === 'shared_ownership') { u.rentGBPMonth = Math.round(pack.ROOM_MODEL.rentPerMonthByBedrooms[u.bedrooms] * 0.35 / 5) * 5; u.valueGBP = Math.round(pack.ROOM_MODEL.housePriceByBedrooms[u.bedrooms] * f / 1000) * 1000; }
      else u.valueGBP = Math.round(pack.ROOM_MODEL.housePriceByBedrooms[u.bedrooms] * f * (A[M.buildings[u.buildingId].archetype].accommodationType === 'purposeBuiltFlats' ? 0.92 : 1) / 1000) * 1000;
    }
  }
  // =========================================================== street chains (graph)
  // edge-band chain row nodes (towpath / ring-road pavement) so park paths and V streets join it
  const edgeRowNodes = [];
  for (let x = 0; x < W; x += 10) edgeRowNodes.push(g.node(x, eY, 'street'));
  g.node(W - 1, eY, 'street');
  // V streets in band B4 run down to the edge row
  for (const s of vStreets.B4) {
    const yEnd = eY;
    for (const X of [s.rect.x, s.rect.x + s.w - 1]) for (let y = s.rect.y + s.rect.h; y <= yEnd; y++) if (M.tiles[I(X, y)] !== T.WATER && M.tiles[I(X, y)] !== T.PAVEMENT && M.tiles[I(X, y)] !== T.PATH) M.tiles[I(X, y)] = T.PATH;
  }
  const lineDefs = []; // {axis:'h'|'v', k (row or col), a0,a1 (inclusive along-range), streetId}
  for (const s of M.streets) {
    if (s.axis === 'h') { lineDefs.push({ axis: 'h', k: s.lines.N, a0: s.rect.x, a1: s.rect.x + s.rect.w - 1, s }); lineDefs.push({ axis: 'h', k: s.lines.S, a0: s.rect.x, a1: s.rect.x + s.rect.w - 1, s }); }
    else {
      const top = s.rect.y - 1, bot = s.rect.y + s.rect.h - 1 + (botOf.B4 === null && vStreets.B4.includes(s) ? (eY - (s.rect.y + s.rect.h - 1)) : 1);
      lineDefs.push({ axis: 'v', k: s.lines.W, a0: top, a1: bot, s }); lineDefs.push({ axis: 'v', k: s.lines.E, a0: top, a1: bot, s });
    }
  }
  // junction nodes
  for (const h of lineDefs.filter((l) => l.axis === 'h')) for (const v of lineDefs.filter((l) => l.axis === 'v')) {
    if (v.k >= h.a0 && v.k <= h.a1 && h.k >= v.a0 && h.k <= v.a1) g.node(v.k, h.k, 'street');
  }
  // line ends and mid-block crossing points
  for (const l of lineDefs) {
    if (l.axis === 'h') { g.node(l.a0, l.k, 'street'); g.node(l.a1, l.k, 'street'); }
    else { g.node(l.k, l.a0, 'street'); g.node(l.k, l.a1, 'street'); }
  }
  const crossAt = (s, along) => { // zebra between the two pavements of street s at coordinate `along`
    if (s.axis === 'h') { const a = g.node(along, s.lines.N, 'street'), b = g.node(along, s.lines.S, 'street'); return [a, b]; }
    const a = g.node(s.lines.W, along, 'street'), b = g.node(s.lines.E, along, 'street'); return [a, b];
  };
  const zebras = [];
  for (const s of M.streets) {
    const step = s.kind === 'high' ? 9 : 11;
    const a0 = s.axis === 'h' ? s.rect.x : s.rect.y, a1 = a0 + (s.axis === 'h' ? s.rect.w : s.rect.h);
    for (let a = a0 + 5; a < a1 - 3; a += step) {
      // avoid dropping a crossing inside a junction mouth
      const mouth = M.streets.some((q) => q.axis !== s.axis && a >= (q.axis === 'v' ? q.rect.x - 1 : q.rect.y - 1) && a <= (q.axis === 'v' ? q.rect.x + q.rect.w : q.rect.y + q.rect.h));
      if (mouth) continue;
      zebras.push({ s, a, ...(() => { const [p, q] = crossAt(s, a); return { p, q }; })() });
    }
  }
  // connect the lines
  const isRoadBetween = (x0, y0, x1, y1) => { const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0); let x = x0, y = y0; while (x !== x1 || y !== y1) { x += dx; y += dy; if (M.tiles[I(x, y)] === T.ROAD) return true; } return false; };
  const lineNodes = (l) => g.nodes.filter((n) => (l.axis === 'h' ? (n.y === l.k && n.x >= l.a0 && n.x <= l.a1) : (n.x === l.k && n.y >= l.a0 && n.y <= l.a1)));
  for (const l of lineDefs) {
    const ns = lineNodes(l).sort((p, q) => (l.axis === 'h' ? p.x - q.x : p.y - q.y));
    for (let i = 1; i < ns.length; i++) {
      const a = ns[i - 1], b = ns[i]; const road = isRoadBetween(a.x, a.y, b.x, b.y);
      const hsPen = l.s.kind === 'high' ? 10 : 6;
      g.edge(a.id, b.id, road ? 'crossing' : 'footway', road ? (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * 2 + hsPen : null);
    }
  }
  for (const z of zebras) g.edge(z.p, z.q, 'crossing', (z.s.w) * 2 + (z.s.kind === 'high' ? 8 : 4));
  // aligned crossroad on the high street: zebra at both V lines (pedestrians cross HS where B2/B3 streets align)
  for (const X of [vStreets.B2[1].lines.W, vStreets.B2[1].lines.E]) { const a = g.at(X, HS.lines.N), b = g.at(X, HS.lines.S); if (a >= 0 && b >= 0) g.edge(a, b, 'crossing', MAIN_W * 2 + 8); }
  // B4 V streets meet the edge row; edge chain
  {
    const ns = g.nodes.filter((n) => n.y === eY).sort((p, q) => p.x - q.x);
    for (let i = 1; i < ns.length; i++) g.edge(ns[i - 1].id, ns[i].id, 'footway');
  }
  // block corner links: V line end ↔ edge-chain joins already via lineDefs for B4. Park & estate paths link into chain nodes by coordinates (tiles on pavement).
  // links between path nodes on pavement tiles and the street lines (nodes created on pavement coincide with line nodes)
  // =========================================================== gateways
  const gws = M.gateways;
  const addGw = (o) => { const gw = { id: gws.length, ...o }; gws.push(gw); return gw; };
  {
    const sb = M.buildings[M.station];
    addGw({ kind: 'station', template: 'station', name: 'Larkfield station', node: sb.node, x: sb.door.x, y: sb.door.y, buildingId: sb.id });
    const hsW = g.node(0, HS.lines.N, 'gate'), hsW2 = g.node(0, HS.lines.S, 'gate'), hsE = g.node(W - 1, HS.lines.N, 'gate'), hsE2 = g.node(W - 1, HS.lines.S, 'gate');
    g.edge(hsW, hsW2, 'crossing', MAIN_W * 2 + 8); g.edge(hsE, hsE2, 'crossing', MAIN_W * 2 + 8);
    addGw({ kind: 'road', template: 'road_west', name: `${HS.name} (to city centre)`, node: hsW, x: 0, y: HS.lines.N });
    addGw({ kind: 'road', template: 'road_east', name: `${HS.name} (to ring road)`, node: hsE, x: W - 1, y: HS.lines.N });
    const tp0 = g.node(0, eY, 'gate'), tp1 = g.node(W - 1, eY, 'gate');
    addGw({ kind: 'towpath', template: 'towpath', name: southEdge === 'canal' ? 'Canal towpath (west)' : 'Ring road footway (west)', node: tp0, x: 0, y: eY });
    addGw({ kind: 'towpath', template: 'towpath', name: southEdge === 'canal' ? 'Canal towpath (east)' : 'Ring road footway (east)', node: tp1, x: W - 1, y: eY });
    const c0 = g.node(0, S0.lines.S, 'gate'); addGw({ kind: 'cycle', template: 'cycle_route', name: `${S0.name} cycle route`, node: c0, x: 0, y: S0.lines.S });
    // bus stops (shelters on the pavement)
    const stops = [
      { s: HS, line: 'N', x: vStreets.B2[1].rect.x - 20 - rng.int(0, 4), label: 'A' },
      { s: HS, line: 'S', x: vStreets.B2[1].rect.x + 24 + rng.int(0, 4), label: 'B' },
      { s: S0, line: 'S', x: stationX0 - 8, label: 'C' },
    ];
    for (const st of stops) {
      const y = st.s.lines[st.line]; const x = st.x; const n = g.node(x, y, 'gate');
      addGw({ kind: 'bus', template: 'bus_stop', name: `${st.s.name} (Stop ${st.label})`, node: n, x, y });
      M.props.busStops.push({ x, y, w: 3, h: 1, street: st.s.id });
    }
  }
  // =========================================================== props: street trees, cars, lamps
  const nearMouth = (s, a, pad) => M.streets.some((q) => q.axis !== s.axis && a >= (q.axis === 'v' ? q.rect.x : q.rect.y) - pad && a <= (q.axis === 'v' ? q.rect.x + q.rect.w : q.rect.y + q.rect.h) + pad);
  const nodeNear = (x, y, r) => g.nodes.some((n) => n.kind === 'door' && Math.abs(n.x - x) <= r && Math.abs(n.y - y) <= r);
  for (const s of M.streets) {
    const a0 = s.axis === 'h' ? s.rect.x : s.rect.y, len = s.axis === 'h' ? s.rect.w : s.rect.h;
    // parking rows are the outer carriageway rows
    const rows = s.axis === 'h' ? [s.rect.y + s.pav, s.rect.y + s.w - s.pav - 1] : [s.rect.x + s.pav, s.rect.x + s.w - s.pav - 1];
    const pCar = s.kind === 'high' ? 0.33 : s.kind === 'collector' ? 0.4 : 0.58;
    for (const r of rows) for (let a = a0 + 3; a < a0 + len - 5; a += 3) {
      if (nearMouth(s, a, 3)) continue;
      if (s.kind === 'high' && M.props.busStops.some((b) => b.street === s.id && Math.abs(b.x - a) < 6)) continue;
      if (rng.chance(pCar)) M.props.cars.push(s.axis === 'h' ? { x: a, y: r, w: 2, h: 1, c: rng.int(0, 7) } : { x: r, y: a, w: 1, h: 2, c: rng.int(0, 7) });
    }
    // lamps and trees
    const sides = s.axis === 'h' ? [s.lines.N, s.lines.S] : [s.lines.W, s.lines.E];
    for (const k of sides) for (let a = a0 + 7; a < a0 + len - 6; a += (s.kind === 'high' ? 14 : 17)) {
      if (nearMouth(s, a, 2)) continue;
      const x = s.axis === 'h' ? a : k, y = s.axis === 'h' ? k : a;
      if (s.kind === 'high' || rng.chance(0.55)) M.props.lamps.push({ x, y });
    }
    if (s.kind !== 'collector') for (const k of sides) for (let a = a0 + 10 + rng.int(0, 5); a < a0 + len - 8; a += rng.int(10, 16)) {
      if (nearMouth(s, a, 3)) continue;
      const x = s.axis === 'h' ? a : k, y = s.axis === 'h' ? k : a;
      if (s.kind === 'high' ? rng.chance(0.6) : rng.chance(0.35)) { const iy = s.axis === 'h' && s.pav > 1 ? (k === s.lines.N ? y + 1 : y - 1) : y; const ix = s.axis === 'v' && s.pav > 1 ? (k === s.lines.W ? x + 1 : x - 1) : x; M.props.trees.push({ x: ix, y: iy, r: 1.5 + rng.float(0, 0.7), street: true }); }
    }
  }
  // back-garden trees and bins
  for (const b of M.buildings) if (b.kind === 'residential' && b.plot && b.archetype !== 'newbuild_apartments' && !A[b.archetype]?.perFloor && rng.chance(0.18)) {
    const p = b.plot; const tx = p.x + rng.int(0, Math.max(0, p.w - 1)); const ty = p.y + rng.int(0, Math.max(0, p.h - 1));
    if (M.tiles[I(tx, ty)] === T.YARD) M.props.trees.push({ x: tx, y: ty, r: 0.9 + rng.float(0, 0.6) });
  }
  // dedupe trees on same tile, remove trees on buildings/roads
  {
    const seen = new Set(); M.props.trees = M.props.trees.filter((t) => { const k = t.y * W + t.x; if (seen.has(k) || !inb(t.x, t.y)) return false; seen.add(k); const tt = M.tiles[k]; return tt !== T.BUILDING && tt !== T.ROAD && tt !== T.WATER && tt !== T.RAIL; });
    M.props.cars = M.props.cars.filter((c) => { const w = c.w || (c.v ? 1 : 2), h = c.h || (c.v ? 2 : 1); c.w = w; c.h = h; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const t = M.tiles[I(c.x + i, c.y + j)]; if (t === T.BUILDING || t === T.WATER || t === T.PARK || t === T.GRASS) return false; } return true; });
    M.props.benches = M.props.benches.map((b) => ({ x: b.x, y: b.y, w: 2, h: 1 }));
  }
  // =========================================================== finish graph (pre-transform), checks
  const warnings = [];
  const graph0 = g.finish();
  const { comp, count } = graph0.components();
  if (count > 1) { const sizes = new Array(count).fill(0); comp.forEach((c) => sizes[c]++); const main = sizes.indexOf(Math.max(...sizes)); const lost = []; for (const bld of M.buildings) if (bld.node >= 0 && comp[bld.node] !== main) lost.push(bld.id); if (lost.length) warnings.push(`graph: ${count} components; ${lost.length} buildings unreachable (ids ${lost.slice(0, 8).join(',')})`); }
  for (const bld of M.buildings) if (bld.doors.length && (bld.node < 0 || bld.node === undefined)) warnings.push(`building ${bld.id} (${bld.archetype}) has no door node`);
  M.meta.warnings = warnings;
  return finalise(M, g, tf, W, H, pack, rng);
}

// ============================================================ orientation transform + packaging
function finalise(M, g, tf, W, H, pack, rng) {
  const NW = tf.transpose ? H : W, NH = tf.transpose ? W : H;
  const mt = (x, y) => { if (tf.flipX) x = W - 1 - x; if (tf.flipY) y = H - 1 - y; return tf.transpose ? [y, x] : [x, y]; };
  const mp = (p) => { if (!p) return p; const [x, y] = mt(p.x, p.y); p.x = x; p.y = y; return p; };
  const mr = (r) => { if (!r) return r; const [ax, ay] = mt(r.x, r.y), [bx, by] = mt(r.x + r.w - 1, r.y + r.h - 1); r.x = Math.min(ax, bx); r.y = Math.min(ay, by); r.w = Math.abs(ax - bx) + 1; r.h = Math.abs(ay - by) + 1; return r; };
  const mf = (f) => { if (!f) return f; let v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[f]; if (tf.flipX) v = [-v[0], v[1]]; if (tf.flipY) v = [v[0], -v[1]]; if (tf.transpose) v = [v[1], v[0]]; return v[0] === 0 ? (v[1] < 0 ? 'N' : 'S') : (v[0] < 0 ? 'W' : 'E'); };
  const tiles = new Uint8Array(NW * NH), bAt = new Int32Array(NW * NH).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [nx, ny] = mt(x, y); tiles[ny * NW + nx] = M.tiles[y * W + x]; bAt[ny * NW + nx] = M.bAt[y * W + x]; }
  M.tiles = tiles; M.bAt = bAt; M.w = NW; M.h = NH;
  for (const b of M.buildings) { mr(b.rect); mr(b.plot); b.facing = mf(b.facing); b.entryDir = mf(b.entryDir); b.ridge = (b.facing === 'N' || b.facing === 'S') ? 'x' : 'y'; mp(b.door); for (const d of b.doors) mp(d); delete b.nodeOverride; }
  for (const s of M.streets) { mr(s.rect); s.axis = s.rect.w >= s.rect.h ? 'h' : 'v'; s.lines = s.axis === 'h' ? { N: s.rect.y, S: s.rect.y + s.rect.h - 1 } : { W: s.rect.x, E: s.rect.x + s.rect.w - 1 }; delete s.a0; delete s.t0; delete s.t1; }
  for (const c of M.cells) mr(c.rect);
  for (const a of M.areas) mr(a.rect);
  for (const v of M.venues) v.rect = v.buildingId >= 0 ? M.buildings[v.buildingId].rect : v.rect;
  for (const k of ['trees', 'lamps', 'bins']) for (const p of M.props[k]) mp(p);
  for (const k of ['cars', 'benches', 'busStops']) for (const p of M.props[k]) { const r = { x: p.x, y: p.y, w: p.w, h: p.h }; mr(r); p.x = r.x; p.y = r.y; p.w = r.w; p.h = r.h; }
  for (const gw of M.gateways) mp(gw);
  if (M.parkMid) mp(M.parkMid); if (M.schoolGate) mp(M.schoolGate);
  M.features.railway = mr({ x: 0, y: 0, w: W, h: 8 }); M.features.edge.rect = mr(M.features.edge.rect); delete M.features.railway.stationX0;
  for (const n of g.nodes) { const [x, y] = mt(n.x, n.y); n.x = x; n.y = y; }
  const graph = g.finish();
  M.graph = graph;
  // house-keeping: node per venue / unit after transform is unchanged (ids stable)
  const T0 = pack.venues;
  M.nodeOfUnit = (uid) => M.units[uid].node;
  M.nodeOfVenue = (vid) => M.venues[vid].node;
  M.route = (a, b) => graph.route(a, b);
  M.gatewaysByKind = (k) => M.gateways.filter((q) => q.kind === k);
  M.stats = computeStats(M, pack);
  return M;
}

export function computeStats(M, pack) {
  const A = pack.archetypes;
  const dw = M.units.filter((u) => u.kind !== 'venue');
  const acc = {}; for (const u of dw) { const at = A[M.buildings[u.buildingId].archetype].accommodationType; acc[at] = (acc[at] || 0) + 1; }
  const ten = {}; for (const u of dw) ten[u.tenure] = (ten[u.tenure] || 0) + 1;
  const cat = {}; for (const v of M.venues) cat[v.category] = (cat[v.category] || 0) + 1;
  const n = dw.length;
  const shares = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / n).toFixed(3)]));
  return { dwellings: n, vacant: dw.filter((u) => u.vacant).length, bedroomsTotal: dw.reduce((s, u) => s + u.bedrooms, 0), buildings: M.buildings.length, venues: M.venues.length, venueByCategory: cat, accommodation: acc, accommodationShare: shares(acc), tenure: ten, tenureShare: shares(ten), graphNodes: M.graph.n, graphEdges: M.graph.edges.length, cars: M.props.cars.length, trees: M.props.trees.length, warnings: M.meta.warnings };
}
