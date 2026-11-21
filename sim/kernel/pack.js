// Content-pack loader. loadPack('larkfield') imports content/larkfield/index.js (default export = pack object), validates it against schema.js,
// and returns it. legacyPack() wraps the old medieval data files (sim/data/*) as a pack so the old world flows through the same API.
//   const pack = await loadPack('larkfield');  const world = createWorld({pack, seed: 1})   (see sim/index.js)
import { assertPack, validatePack } from './schema.js';
import { CONTRACT_VERSION } from './types.js';
export async function loadPack(id, opts = {}) {
  const mod = await import(new URL(`../../content/${id}/index.js`, import.meta.url).href);
  const pack = mod.default;
  if (opts.validate !== false) assertPack(pack);
  return pack;
}
export async function legacyPack() {
  const [jobs, buildings, names, cal, econ, health, calib] = await Promise.all(['jobs', 'buildings', 'names', 'calendar', 'economy', 'health', 'calibration'].map((f) => import(`../data/${f}.js`)));
  return { id: 'hollowmere', version: '1.0.0', contractVersion: CONTRACT_VERSION, calibration: calib.default || calib, names: names.default || names, jobs: jobs.JOBS, buildings: buildings.BUILDING_TYPES, calendar: cal.default || cal, meta: { economy: econ, health } };
}
export { validatePack, assertPack };
