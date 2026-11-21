// Bookkeeping when a resident dies: household membership, partner widowed, pregnancy and care ended, ties severed. Returns the mourners (living on-map ties with their relationship).
import { dropTie, hhOf, bump, metro } from './util.js';
import { leaveHh } from './moves.js';
import { endCaring } from './kin.js';

export function afterDeath(w, p) {
  const L = p.ext.life, mourn = [];
  for (const t of p.ext.pop.ties) if (t.on && typeof t.o === 'number') { const o = w.people.get(t.o); if (o && o.alive) mourn.push({ id: o.id, rel: t.rel, k: t.k, t: t.t, s: t.s }); }
  if (L.part) {
    const pt = L.part, o = pt.on ? w.people.get(pt.id) : null;
    if (o && o.alive) {
      const lo = o.ext.life; if (lo.part && lo.part.id === p.id) { const wasMar = lo.part.st === 'married' || lo.part.st === 'cohab' || lo.part.st === 'engaged'; lo.part = null; if (wasMar) { lo.mar = lo.mar === 'married' || pt.st === 'married' ? 'widowed' : lo.mar; lo.widowedAt = w.tick; } }
      o.family.spouseId = null; o.romance = { partnerId: null, status: null, sinceTick: w.tick };
    } else if (!pt.on) { const m = metro(w, pt.id); if (m) { m.rel = 'late partner'; } }
    L.part = null;
  }
  L.preg = null; if (L.caring) endCaring(w, p, 'died');
  leaveHh(w, p);
  for (const m of mourn) { const o = w.people.get(m.id); dropTie(o, p.id); }
  bump(w, 'resident_deaths');
  return mourn;
}
