// Name generation: people, businesses, town.
import { MALE, FEMALE, SURNAMES, ADJ, ANIMAL, FIXED, OWNER_FMT, TOWN_NAME } from './data/names.js';
export { MALE, FEMALE, SURNAMES, TOWN_NAME };
export function firstName(rng, sex) { return rng.pick(sex === 'M' ? MALE : FEMALE); }
export function surname(rng) { return rng.pick(SURNAMES); }
// `used` is a Set of names already taken. ownerLast optional (uses owner-style names ~50% of the time).
export function businessName(rng, type, ownerLast, used = new Set()) {
  for (let i = 0; i < 12; i++) {
    let n;
    if (type === 'tavern') n = `The ${rng.pick(ADJ)} ${rng.pick(ANIMAL)}`;
    else if (ownerLast && OWNER_FMT[type] && (type === 'farm' || rng.chance(0.5))) n = OWNER_FMT[type](ownerLast);
    else if (FIXED[type]) n = rng.pick(FIXED[type]);
    else n = type[0].toUpperCase() + type.slice(1);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return type[0].toUpperCase() + type.slice(1) + ' ' + (used.size + 1);
}
