// Public entry point for headless tools, the Worker and tests.
//   import { createWorld, loadPack, World } from './sim/index.js'
//   const world = createWorld({ seed: 1, population: 222, sched: 'agenda' });            // legacy medieval content (adapters on the kernel)
//   const world = await createWorldFromPack('larkfield', { seed: 1 });                  // content pack (validated); falls back per packs' readiness
export { World } from './world.js';
export * from './kernel/index.js';
export { declareField, listFields, checkPerson, fieldOwner } from './model/index.js';
export { stateHash, saveSnapshot, loadSnapshot } from './snapshot.js';
import { World } from './world.js';
import { loadPack, legacyPack } from './kernel/index.js';

/** Cheap: several worlds may coexist in one process (no module-level mutable state in the kernel; legacy systems keep their world in a per-module slot, so run legacy worlds one stepping loop at a time). */
export function createWorld(opts = {}) { return new World(opts); }
export async function createWorldFromPack(id, opts = {}) {
  const pack = id === 'hollowmere' ? await legacyPack() : await loadPack(id);
  return new World({ ...opts, pack });
}
