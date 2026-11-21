import { Sifter } from './sifter.js';
import { PATTERNS, KINDS } from './patterns.js';
export { Sifter, PATTERNS, KINDS };
/** Attach to a kernel world: sifts every stored event as emitted. Falls back gracefully if world.on is absent. */
export function installSifter(world, opts = {}) {
  const s = new Sifter({ patterns: PATTERNS, ...opts });
  world.arcs = s; world.sifter = s;
  if (world.onAny) world.onAny((ev) => s.consume(ev)); else if (world.on) for (const t of world.events?.registry?.list?.() || []) if (!world.events.registry.get(t).legacy) world.on(t, (ev) => s.consume(ev));
  return s;
}
