// Test fixture: kernel World (legacy engine people + Larkfield pack) with the goals plugin. Use createLarkfieldWorld(seed) from sim/larkfield.js when it exists.
import { World } from '../world.js';
import { loadPack } from '../kernel/index.js';
import { createGoals } from './index.js';
export async function makeFixture(o = {}) {
  let pack = null; try { pack = await loadPack('larkfield'); } catch (e) { /* ok */ }
  const w = new World({ seed: o.seed ?? 1, population: o.population ?? 240, strictEvents: o.strict ?? true, plugins: [createGoals(o.goals || {})], pack, hashDaily: !!o.hashDaily });
  return w;
}
