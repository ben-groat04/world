// Sub-stream RNG. rngFor(name) = persistent named stream (state is snapshotted); rngFor(name, ...keys) = STATELESS stream derived
// from hash(worldSeed, name, keys): same inputs => same sequence, independent of what any other system has rolled.
// Use keys for per-entity/per-day rolls: world.rngFor('encounter', day, venueId). Adding a roll in one stream never shifts another.
import { RNG, hashStr } from '../rng.js';
export { RNG, hashStr };

const mix = (h, x) => { h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
/** 32-bit hash of any mix of numbers/strings. */
export function hash32(...parts) {
  let h = 0x9e3779b9;
  for (const x of parts) {
    if (typeof x === 'string') h = mix(h, hashStr(x));
    else { const f = Math.floor(x); h = mix(h, f | 0); if (f > 2147483647 || f < -2147483648) h = mix(h, Math.floor(f / 4294967296) | 0); }
  }
  return h >>> 0;
}
/** Stateless derived stream. */
export function subRng(rootSeed, name, ...keys) { return new RNG(hash32(rootSeed, name, ...keys) || 1); }
