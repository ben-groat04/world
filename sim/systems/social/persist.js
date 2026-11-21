// JSON (de)serialisation of world.soc: Maps become entry arrays; ties/beliefs are plain objects already.
import { newSoc } from './core.js';
export function encode(S) {
  const ppl = []; for (const [id, ps] of S.ppl) ppl.push([id, { ...ps, T: [...ps.T.values()], ST: [...ps.ST], B: [...ps.B] }]);
  const { ppl: _p, facts, venues, street, metro, seg, bk, ...rest } = S;
  return { ppl, facts: [...facts], rest };
}
export function decode(w, d) {
  const S = newSoc(); Object.assign(S, d.rest);
  for (const [id, o] of d.ppl) { const ps = { ...o, T: new Map(o.T.map((t) => [t.o, t])), ST: new Map(o.ST), B: new Map(o.B) }; S.ppl.set(id, ps); }
  S.facts = new Map(d.facts);
  return S;
}
