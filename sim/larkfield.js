// createLarkfieldWorld(seed, opts): kernel World + Larkfield pack + street-graph map + generated population + routine plugin. No medieval systems.
//   const world = createLarkfieldWorld(1);  world.run(144*7);   world.snapshot() / restoreLarkfieldWorld(snap)
import { World } from './world.js';
import pack from '../content/larkfield/index.js';
import { makeCalendar } from './systems/routine/calendar.js';
import { buildLarkfieldMap } from './population/map-adapter.js';
import { populate } from './population/index.js';
import routine from './systems/routine/index.js';
import { createGoals } from './goals/index.js';
import { createLabour } from './systems/labour/index.js';
import { createHousing } from './systems/housing/index.js';
import { createMoney } from './systems/money/index.js';
import { createLife } from './systems/life/index.js';
import { createHealth } from './systems/health/index.js';
import { createSocial } from './systems/social/index.js';
import { loadSnapshot } from './snapshot.js';

export function larkfieldOpts(seed = 1, opts = {}) {
  const calendar = makeCalendar({ start: opts.start });
  return {
    seed, pack, calendar, sched: 'agenda', systems: [], plugins: [routine, ...(opts.goals === false ? [] : [createGoals(opts.goalsOpts || {})]), createLabour(), createHousing(), createMoney(), ...(opts.life === false ? [] : [createLife(), createHealth()]), ...(opts.social === false ? [] : [createSocial()])], strictEvents: !!opts.strictEvents, hashDaily: !!opts.hashDaily,
    settings: { population: 500, houses: 0, ...(opts.settings || {}) },
    generateMap: () => buildLarkfieldMap(pack, seed, opts.map || {}),
    populate: (world, rng) => populate(world, rng),
  };
}
export function createLarkfieldWorld(seed = 1, opts = {}) {
  const w = new World(larkfieldOpts(seed, opts));
  w.town.name = 'Larkfield';
  return w;
}
export function restoreLarkfieldWorld(snap, opts = {}) {
  const wo = larkfieldOpts(snap.seed, opts);
  const w = loadSnapshot(snap, { pack, plugins: wo.plugins, systems: [], worldOpts: wo });
  w.town.name = 'Larkfield';
  return w;
}
export { pack };
export default createLarkfieldWorld;
