// Surface codes for the tile raster (1 tile = 2 m). Renderers map these to art; the sim only uses WALKABLE/CARRIAGEWAY.
export const T = {
  GRASS: 0, ROAD: 1, PAVEMENT: 2, BUILDING: 3, YARD: 4, GARDEN: 5, PARK: 6, PATH: 7, WATER: 8, RAIL: 9, WALL: 10,
  HARD: 11, PLAY: 12, ALLEY: 13, PLATFORM: 14, FARBANK: 15, CHURCHYARD: 16, ALLOTMENT: 17, BALLAST: 18, PITCH: 19, FOREC: 20,
};
export const TILE_METRES = 2;
export const T_NAMES = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k.toLowerCase()]));
export const WALKABLE = new Uint8Array(32);
for (const k of ['PAVEMENT', 'PATH', 'PARK', 'GRASS', 'HARD', 'PLAY', 'ALLEY', 'PLATFORM', 'CHURCHYARD', 'FOREC', 'PITCH', 'GARDEN']) WALKABLE[T[k]] = 1;
export const CARRIAGEWAY = new Uint8Array(32); CARRIAGEWAY[T.ROAD] = 1; CARRIAGEWAY[T.HARD] = 1; CARRIAGEWAY[T.ALLEY] = 1;
export const TILE_TAGS = { SOLID: [T.BUILDING, T.WATER, T.RAIL, T.WALL, T.BALLAST, T.FARBANK] };
