// Household planning: (segment x composition archetype) joint draw by largest remainder, dwelling assignment by tenure/size fit, member composition (ages, sexes, roles).
import { clamp, wpick } from './util.js';

// dependent children per family (Census 2021: inner-city families with dependent children average ~1.9-2.1; South Asian and lone-parent families larger)
const KID_COUNT = [[1, 0.27], [2, 0.37], [3, 0.23], [4, 0.13]];
const YOUNG_SEGS = new Set(['students', 'young_sharers', 'early_career']);

/** Draw N (segment, archetype) specs matching the IPF joint exactly (largest remainder), then match them to dwellings. */
export function planHouseholds(rng, pack, units) {
  const joint = pack.meta.segmentComposition, N = units.length, cells = [];
  let tot = 0;
  for (const [seg, row] of Object.entries(joint)) for (const [arch, w] of Object.entries(row)) { cells.push({ seg, arch, w }); tot += w; }
  for (const c of cells) { c.x = (c.w / tot) * N; c.n = Math.floor(c.x); c.f = c.x - c.n; }
  let left = N - cells.reduce((a, c) => a + c.n, 0);
  for (const c of [...cells].sort((a, b) => b.f - a.f + (rng.next() - 0.5) * 0.02)) { if (left <= 0) break; c.n++; left--; }
  const specs = [];
  for (const c of cells) for (let i = 0; i < c.n; i++) specs.push({ seg: c.seg, arch: c.arch });
  rng.shuffle(specs);
  const SEG = Object.fromEntries(pack.meta.segments.map((s) => [s.id, s]));
  const need = (s) => ({ one_person_66plus: 1, one_person_u66: 1, married_no_kids: 2, cohab_no_kids: 2, couple_66plus: 2, sharers_students_multigen: 3, married_dep_kids: 3, cohab_dep_kids: 3, lone_parent_dep: 2, lone_parent_nondep: 2, married_nondep: 3, cohab_nondep: 3, other_single_family: 2, multi_family_dep_kids: 4 }[s.arch] || 2);
  const free = units.slice();
  for (const s of specs) {
    const seg = SEG[s.seg], tn = seg.tenure, tmax = Math.max(...Object.values(tn));
    const nb = need(s);
    const w = free.map((u) => {
      let x = ((tn[u.tenure] || 0.003) / tmax) ** 1.2;
      const d = u.bedrooms - nb; x *= d < 0 ? Math.exp(0.9 * d) : Math.exp(-0.35 * d);
      if (s.seg === 'local_business_families') x *= u.label === 'above shop' ? 12 : 0.6; else if (u.label === 'above shop') x *= 0.5;
      if (s.arch === 'sharers_students_multigen') x *= u.kind === 'shared_house' ? 8 : u.kind === 'house' ? 1.5 : 0.6; else if (u.kind === 'shared_house') x *= 0.05;
      if (s.seg === 'older_longterm' && u.kind === 'flat' && u.floor > 1) x *= 0.3;
      return x + 1e-4;
    });
    const i = free.indexOf(rng.weighted(free, w)); s.unit = free[i]; free.splice(i, 1);
  }
  return specs;
}

const pickAge = (rng, [lo, hi], mode) => {
  if (hi <= lo) return lo;
  let a;
  if (mode === 'young') a = lo + Math.abs(rng.gauss(0, (hi - lo) / 2.6));
  else if (mode === 'old') a = lo + Math.abs(rng.gauss(0, (hi - lo) / 2.8));
  else a = rng.gauss((lo + hi) / 2, (hi - lo) / 4.2);
  return Math.round(clamp(a, lo, hi));
};
const isect = (a, b) => { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); return lo <= hi ? [lo, hi] : a; };

/** Member stubs for one household. roles: head, partner, child, adult_child, sharer, parent, grandparent, sibling, other. parents = indices into members. */
export function composeHousehold(rng, pack, spec) {
  const arch = pack.meta.households.find((h) => h.id === spec.arch), seg = pack.meta.segments.find((s) => s.id === spec.seg), unit = spec.unit;
  const A = arch.adults;
  const mode = YOUNG_SEGS.has(seg.id) ? 'young' : (A[0].age[0] >= 60 ? 'old' : 'mid');
  const M = [];
  const sexOf = (bias) => (bias && bias.F !== undefined ? (rng.chance(bias.F) ? 'F' : 'M') : rng.chance(0.5) ? 'F' : 'M');
  let headAge = pickAge(rng, isect(A[0].age, seg.head.age), mode);
  let kids = 0, kidAges = [];
  const kc = typeof arch.kids === 'number' ? arch.kids : arch.kids ? wpick(rng, KID_COUNT.filter(([n]) => n >= arch.kids[0] && n <= arch.kids[1])) : 0;
  // children per home capped by space, but crowding exists (14% of households are overcrowded): 2 per bedroom plus a sofa-bed, not the strict bedroom standard
  const maxKids = unit ? Math.max(1, Math.floor((unit.bedrooms * 2 + 2 - A.length) * 0.9)) : 4;
  kids = Math.min(kc, Math.max(1, maxKids));
  // people living alone under 66 skew older than the arithmetic centre of 18-65 (widowed/divorced/never-partnered 45-65s; ONS Families & Households: ~40% of under-66 solo households are 45-64)
  if (arch.id === 'one_person_u66' && mode === 'mid') headAge = Math.round(clamp(rng.gauss(50, 12), Math.max(18, seg.head.age[0]), Math.min(65, seg.head.age[1])));
  if (arch.id === 'one_person_66plus' || arch.id === 'couple_66plus') headAge = Math.max(66, headAge);
  if (kids) {
    const [klo, khi] = arch.kidAges || [0, 17];
    // eldest child's age first, bounded by the parent's age (a parent is at least ~19 at the birth): the old code instead pushed the PARENT's age up, over-producing 30-44s
    let a0 = rng.int(klo, Math.max(klo, Math.min(khi, headAge - 19)));
    kidAges = [a0];
    for (let i = 1; i < kids; i++) kidAges.push(clamp(a0 - rng.int(1, 4) * i, klo, khi));
    kidAges.sort((a, b) => b - a);
    if (arch.id.includes('nondep') || arch.id === 'lone_parent_nondep') headAge = Math.max(headAge, kidAges[0] + rng.int(20, 32));
    else headAge = Math.max(headAge, kidAges[0] + rng.int(19, 26));
  }
  const sex0 = sexOf(A[0].sexBias || (arch.id === 'one_person_66plus' ? { F: 0.66 } : null));
  M.push({ role: 'head', age: headAge, sex: sex0 });
  const sameSexCouple = rng.chance(0.04);
  const addPartner = (spec0) => { const gap = clamp(Math.round(rng.gauss(0, 3.2) + (sex0 === 'F' ? 1.5 : -1.5)), -8, 8); M.push({ role: 'partner', age: clamp(headAge + gap, Math.max(18, spec0 ? spec0.age[0] : 18), 99), sex: sameSexCouple ? sex0 : sex0 === 'F' ? 'M' : 'F', partnerOf: 0 }); };
  switch (arch.id) {
    case 'one_person_66plus': case 'one_person_u66': case 'lone_parent_dep': case 'lone_parent_nondep': break;
    case 'other_single_family': {
      const v = rng.next();
      if (v < 0.5) { M[0].role = 'adult_child'; M[0].age = pickAge(rng, [32, 62], 'mid'); M.push({ role: 'parent', age: clamp(M[0].age + rng.int(22, 34), 60, 96), sex: rng.chance(0.7) ? 'F' : 'M', childIdx: [0] }); kids = 0; }
      else if (v < 0.78) { M[0].role = 'adult_child'; M[0].age = pickAge(rng, [26, 45], 'mid'); M.push({ role: 'parent', age: clamp(M[0].age + rng.int(22, 32), 55, 90), sex: rng.chance(0.7) ? 'F' : 'M', childIdx: [0] }); kids = Math.min(2, Math.max(1, kids || 1)); kidAges = kidAges.length ? kidAges.map((a) => Math.min(a, 12)) : [rng.int(0, 10)]; }
      else { M.push({ role: 'sibling', age: clamp(headAge + rng.int(-8, 8), 22, 80), sex: rng.chance(0.5) ? 'F' : 'M' }); kids = 0; }
      break;
    }
    case 'multi_family_dep_kids': {
      addPartner(A[1]);
      const v = rng.next();
      if (v < 0.6) M.push({ role: 'grandparent', age: clamp(headAge + rng.int(22, 30), 55, 90), sex: rng.chance(0.6) ? 'F' : 'M', childIdx: [0] });
      else if (v < 0.85) M.push({ role: 'other', age: rng.int(20, 45), sex: rng.chance(0.5) ? 'F' : 'M' });
      else { M.push({ role: 'other', age: clamp(headAge + rng.int(-6, 6), 22, 60), sex: 'F' }); }
      break;
    }
    case 'sharers_students_multigen': {
      const sd = arch.sizeDist; const maxN = unit ? clamp(unit.bedrooms + (unit.kind === 'shared_house' ? 1 : 0), 2, 6) : 4;
      let n = wpick(rng, Object.entries(sd).map(([k, v]) => [+k, v * (+k <= maxN ? 1 : 0.02)]));
      n = Math.max(2, n);
      const [lo, hi] = seg.head.age;
      for (let i = 1; i < n; i++) M.push({ role: 'sharer', age: clamp(headAge + rng.int(-3, 4), lo, hi + 4), sex: rng.chance(0.5) ? 'F' : 'M' });
      M[0].role = 'sharer';
      kids = 0; break;
    }
    case 'married_nondep': case 'cohab_nondep': addPartner(A[1]); break;
    default: if (A.length > 1) addPartner(A[1]); // couples
  }
  const parentIdx = M.findIndex((m) => m.role === 'head' || m.role === 'adult_child');
  const partnerIdx = M.findIndex((m) => m.role === 'partner');
  const nondep = arch.id.includes('nondep') || arch.id === 'lone_parent_nondep';
  for (let i = 0; i < kids; i++) {
    const a = kidAges[i] ?? rng.int(0, 10);
    M.push({ role: nondep || a >= 18 ? 'adult_child' : 'child', age: a, sex: rng.chance(0.5) ? 'F' : 'M', parents: partnerIdx >= 0 ? [parentIdx, partnerIdx] : [parentIdx] });
  }
  // a married-no-kids older couple may have grown-up children elsewhere (set later by the network builder via stub.kidsElsewhere)
  M.arch = arch; M.seg = seg;
  return M;
}

/**
 * Siblings' birthdays are drawn independently inside each age year, which can put two children of one mother only weeks apart. A mother cannot bear two singletons closer than
 * ~9 months (pregnancy ~40 weeks), so a closer pair is either twins (one shared birth tick: only for same-age pairs, ~1.6% of births) or the older child's birthday moves earlier to a feasible gap.
 * kids: items with {birthTick, age?}; keyOf(item) -> sibling-group key (same parents). Youngest first so any shift ripples toward the eldest. Mutates birthTick.
 */
export function separateSiblings(rng, kids, keyOf, ticksPerYear, twinChance = 0.2) {
  const MIN_GAP = Math.round(39 * 7 * ticksPerYear / 365), groups = new Map();
  for (const m of kids) { const k = keyOf(m); (groups.get(k) || groups.set(k, []).get(k)).push(m); }
  for (const g of groups.values()) {
    g.sort((a, b) => b.birthTick - a.birthTick);
    for (let i = 0; i + 1 < g.length; i++) { const y = g[i], o = g[i + 1]; if (y.birthTick - o.birthTick < MIN_GAP) { if (y.age === o.age && rng.chance(twinChance)) o.birthTick = y.birthTick; else o.birthTick = y.birthTick - MIN_GAP - rng.int(0, 90 * 144); } }
  }
}
