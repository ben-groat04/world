// Public entry point for headless tools, the Worker and tests.
//   import { createWorld, loadPack, World } from './sim/index.js'
//   const world = await createWorldFromPack('larkfield', { seed: 1 });                  // content pack (validated)
export { World } from './world.js';
export * from './kernel/index.js';
export { declareField, listFields, checkPerson, fieldOwner } from './model/index.js';
export { stateHash, saveSnapshot, loadSnapshot } from './snapshot.js';
import { World } from './world.js';
import { loadPack } from './kernel/index.js';

/** Cheap: several worlds may coexist in one process . */
export function createWorld(opts = {}) { return new World(opts); }
export async function createWorldFromPack(id, opts = {}) {
  const pack = await loadPack(id);
  return new World({ ...opts, pack });
}
