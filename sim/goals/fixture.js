// Test fixture: the Larkfield world with an extra goals plugin instance.
import { World } from '../world.js';
import { createGoals } from './index.js';
/** The real Larkfield world (population + routine) with the goals plugin appended. */
export async function makeLarkfield(seed = 1, o = {}) {
  const { larkfieldOpts } = await import('../larkfield.js');
  const opts = larkfieldOpts(seed, { strictEvents: o.strict ?? true, hashDaily: !!o.hashDaily });
  opts.plugins = [...opts.plugins, createGoals(o.goals || {})];
  const w = new World(opts); w.town.name = 'Larkfield'; return w;
}
