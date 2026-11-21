// Wraps the Larkfield street-graph map (sim/map/generate.js) in the building/tile shape the World core expects, WITHOUT the medieval tile pathfinder being used:
// the routine layer routes on the street graph (map.lf.route). World buildings are 1:1 with map buildings (ids equal), plus pseudo 'places' for open spaces (id 1000+areaId).
//   building.type   venue template id ('pub','primary_school',...) | 'dwelling' (residential) | 'station' | 'park'...      building.lf = {kind, venueId, units, template}
//   building.open   true only for open spaces (people visible);  building.door = walkable tile outside;  building.jobs/employees mirror staffing slots (filled by population)
import { generateMap } from '../map/index.js';
import { WALKABLE, T } from '../map/constants.js';

export const PLACE_BASE = 1000; // open-space pseudo-building id = PLACE_BASE + area.id

export function buildLarkfieldMap(pack, seed, opts = {}) {
  const M = generateMap(pack.meta.mapPack, seed, opts);
  const W = M.w, H = M.h, N = W * H;
  const cost = new Uint8Array(N), comp = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const t = M.tiles[i]; cost[i] = WALKABLE[t] ? 1 : t === T.ROAD ? 2 : 0; }
  const venueOfBuilding = new Map();
  for (const v of M.venues) venueOfBuilding.set(v.buildingId, v);
  const nodeXY = (n) => { const q = M.graph.nodes[n]; return { x: q.x, y: q.y }; };
  const buildings = [];
  for (const b of M.buildings) {
    const v = venueOfBuilding.get(b.id) || null;
    const door = b.door || { x: b.rect.x, y: b.rect.y };
    buildings.push({
      id: b.id, type: v ? v.template : b.kind === 'residential' ? 'dwelling' : b.archetype, name: v ? v.name : b.address || b.name || `Building ${b.id}`,
      x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, door: { x: door.x, y: door.y }, doorSide: b.entryDir || 'S', open: false, ownerId: null,
      residents: [], employees: [], jobs: [], inventory: {}, funds: 0, condition: 1, capacity: v ? v.capacity : 0, hours: null, zone: v ? v.zone : 'res',
      lf: { kind: b.kind, archetype: b.archetype, venueId: v ? v.id : null, template: v ? v.template : null, category: v ? v.category : null, units: b.units.slice(), node: v ? v.node : b.node, streetId: b.streetId, number: b.number || 0, address: b.address || '', religion: v ? v.religion : null, staff: [] },
    });
  }
  const nearestNode = (x, y) => { let best = -1, bd = 1e9; for (const q of M.graph.nodes) { const d = Math.abs(q.x - x) + Math.abs(q.y - y); if (d < bd) { bd = d; best = q.id; } } return best; };
  const areaPlaces = {};
  for (const a of M.areas) {
    const cx = a.rect.x + (a.rect.w >> 1), cy = a.rect.y + (a.rect.h >> 1), node = a.paths && a.paths.length ? a.paths[0] : nearestNode(cx, cy), q = M.graph.nodes[node];
    const id = PLACE_BASE + a.id;
    buildings.push({ id, type: a.kind, name: a.name, x: a.rect.x, y: a.rect.y, w: a.rect.w, h: a.rect.h, door: { x: q.x, y: q.y }, open: true, spots: [q.y * W + q.x], ownerId: null, residents: [], employees: [], jobs: [], inventory: {}, funds: 0, condition: 1, capacity: 400, hours: null, zone: 'open', lf: { kind: 'open', venueId: null, template: a.kind, node, units: [], staff: [] } });
    areaPlaces[a.kind] = id;
  }
  const station = M.gateways.find((g) => g.kind === 'station'), gw = {};
  for (const g of M.gateways) (gw[g.kind] || (gw[g.kind] = [])).push(g);
  const center = M.parkMid || { x: W >> 1, y: H >> 1 };
  const map = { W, H, tiles: M.tiles, bAt: M.bAt, cost, comp, buildings, center: { x: center.x, y: center.y }, squareId: -1, lf: M, seed, areaPlaces, gw, station: station || null, venueOfBuilding };
  map.nodeXY = nodeXY;
  return map;
}
export default buildLarkfieldMap;
