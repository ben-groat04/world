// FAMILY system: pregnancy, birth & genetics, child mortality, childhood stages, households, orphans,
// elderly care, kinship helpers. Realistic pre-industrial rates; works with player-controlled people.
// Exports: default system, plus family-tree helpers (getParents, getChildren, getSiblings, getAncestors,
// getDescendants, kinship, bloodDistance, relocate, findVacantHouse, conceive).
import { firstName } from '../names.js';

const TPD = 144, DPY = 112, YEAR = TPD * DPY;
const GESTATION = Math.round(0.75 * YEAR);
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const full = (p) => `${p.firstName} ${p.lastName}`;
let W = null; // module-level world reference (set in init) so helpers can take plain people/ids

const P = (id) => (id == null || !W ? null : W.people.get(id) || null);
const asP = (x) => (x && typeof x === 'object' ? x : P(x));
const ageOf = (p) => (W ? W.ageOf(p) : 0);
const isPlayer = (p) => W && W.player != null && W.player === p.id;
const pro = (p) => (p.sex === 'F' ? { s: 'she', o: 'her', p: 'her' } : { s: 'he', o: 'him', p: 'his' });
const fam = (p) => (p.ext.fam || (p.ext.fam = { lastBirthTick: null, births: 0, stillbirths: 0 }));
const setting = (k, d) => (W && W.settings && W.settings[k] !== undefined ? W.settings[k] : d);
const moodlet = (p, id, label, value, ticks) => W.addMoodlet(p, { id, label, value, untilTick: W.tick + ticks });

// ------------------------------------------------------------------ family-tree helpers
export function getParents(p) { p = asP(p); return p ? [P(p.family.motherId), P(p.family.fatherId)].filter(Boolean) : []; }
export function getChildren(p) { p = asP(p); return p ? p.family.childrenIds.map(P).filter(Boolean) : []; }
export function getSiblings(p, includeHalf = true) {
  p = asP(p); if (!p) return [];
  const out = new Map();
  for (const id of p.family.siblingIds || []) { const s = P(id); if (s && s.id !== p.id) out.set(s.id, s); }
  for (const par of getParents(p)) for (const c of getChildren(par)) if (c.id !== p.id) out.set(c.id, c);
  const arr = [...out.values()];
  return includeHalf ? arr : arr.filter((s) => s.family.motherId === p.family.motherId && s.family.fatherId === p.family.fatherId);
}
// Ancestors by generation: returns [{person, generation}] (generation 1 = parents), unique, nearest first.
export function getAncestors(p, depth = 4) {
  p = asP(p); const out = [], seen = new Set([p && p.id]);
  let level = p ? [p] : [];
  for (let g = 1; g <= depth; g++) {
    const next = [];
    for (const x of level) for (const par of getParents(x)) if (!seen.has(par.id)) { seen.add(par.id); next.push(par); out.push({ person: par, generation: g }); }
    level = next; if (!level.length) break;
  }
  return out;
}
export function getDescendants(p, depth = 4) {
  p = asP(p); const out = [], seen = new Set([p && p.id]);
  let level = p ? [p] : [];
  for (let g = 1; g <= depth; g++) {
    const next = [];
    for (const x of level) for (const c of getChildren(x)) if (!seen.has(c.id)) { seen.add(c.id); next.push(c); out.push({ person: c, generation: g }); }
    level = next; if (!level.length) break;
  }
  return out;
}
function ancMap(p, depth = 6) {
  const m = new Map([[p.id, 0]]);
  let level = [p];
  for (let g = 1; g <= depth; g++) {
    const next = [];
    for (const x of level) for (const par of getParents(x)) if (!m.has(par.id)) { m.set(par.id, g); next.push(par); }
    level = next; if (!level.length) break;
  }
  return m;
}
// min (generations up from a) + (generations up from b) to a shared ancestor; Infinity if unrelated by blood.
export function bloodDistance(a, b) {
  a = asP(a); b = asP(b); if (!a || !b) return Infinity;
  if (a.id === b.id) return 0;
  return bloodPath(a, b) ? (bloodPath(a, b).da + bloodPath(a, b).db) : Infinity;
}
function bloodPath(a, b) {
  const ma = ancMap(a), mb = ancMap(b);
  let best = null;
  for (const [id, da] of ma) { const db = mb.get(id); if (db === undefined) continue; if (!best || da + db < best.da + best.db) best = { id, da, db }; }
  return best;
}
const ORD = ['', '', '', 'great-', 'great-great-', 'great-great-great-'];
const ordinal = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
function blood(a, b) {
  const bp = bloodPath(a, b); if (!bp) return null;
  const { da, db } = bp, f = b.sex === 'F';
  if (da === 0) return db === 1 ? (f ? 'daughter' : 'son') : (ORD[db] ?? 'distant ') + (f ? 'granddaughter' : 'grandson');
  if (db === 0) return da === 1 ? (f ? 'mother' : 'father') : (ORD[da] ?? 'distant ') + (f ? 'grandmother' : 'grandfather');
  if (da === 1 && db === 1) {
    const full2 = a.family.motherId === b.family.motherId && a.family.fatherId === b.family.fatherId && a.family.motherId != null;
    return (full2 ? '' : 'half-') + (f ? 'sister' : 'brother');
  }
  if (da === 1) return (ORD[db] ?? 'distant ') + (f ? 'niece' : 'nephew');
  if (db === 1) return (ORD[da] ?? 'distant ') + (f ? 'aunt' : 'uncle');
  const deg = Math.min(da, db) - 1, rem = Math.abs(da - db);
  let s = deg === 1 ? 'cousin' : `${ordinal[deg] || deg + 'th'} cousin`;
  if (rem) s += rem === 1 ? ' once removed' : rem === 2 ? ' twice removed' : ` ${rem} times removed`;
  return s;
}
// kinship(a, b): what `b` is to `a` ("b is a's ___"): 'cousin', 'grandfather', 'half-brother', 'mother-in-law', 'spouse' ... or null.
export function kinship(a, b) {
  a = asP(a); b = asP(b); if (!a || !b) return null;
  if (a.id === b.id) return 'self';
  if (a.family.spouseId === b.id) return b.sex === 'F' ? 'wife' : 'husband';
  if ((a.family.exSpouseIds || []).includes(b.id)) return 'ex-spouse';
  const bl = blood(a, b); if (bl) return bl;
  const sp = P(a.family.spouseId), bsp = P(b.family.spouseId);
  const f = b.sex === 'F';
  if (sp) { // b is spouse's blood relative
    const k = blood(sp, b);
    if (k === 'mother' || k === 'father') return f ? 'mother-in-law' : 'father-in-law';
    if (k === 'sister' || k === 'brother' || k === 'half-sister' || k === 'half-brother') return f ? 'sister-in-law' : 'brother-in-law';
    if (k === 'son' || k === 'daughter') return f ? 'stepdaughter' : 'stepson';
    if (k) return 'in-law';
  }
  if (bsp) { // b is married to a's blood relative
    const k = blood(a, bsp);
    if (k === 'sister' || k === 'brother' || k === 'half-sister' || k === 'half-brother') return f ? 'sister-in-law' : 'brother-in-law';
    if (k === 'son' || k === 'daughter') return f ? 'daughter-in-law' : 'son-in-law';
    if (k === 'mother' || k === 'father') return f ? 'stepmother' : 'stepfather';
    if (k) return 'in-law';
  }
  return null;
}

// ------------------------------------------------------------------ households
export function findVacantHouse(world, near) {
  let best = null, bd = Infinity;
  for (const h of world.buildingsOfType('house')) {
    if (h.residents.length || h.closed) continue;
    const d = near ? Math.abs(h.door.x - near.x) + Math.abs(h.door.y - near.y) + world.rng.float(0, 6) : world.rng.float(0, 100);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
export function relocate(world, p, house) {
  if (!p || !house || p.homeId === house.id) return false;
  const old = p.homeId != null ? world.buildings.get(p.homeId) : null;
  if (old) old.residents = old.residents.filter((i) => i !== p.id);
  p.homeId = house.id;
  if (!house.residents.includes(p.id)) house.residents.push(p.id);
  world.emit('moveHome', { person: p, homeId: house.id });
  return true;
}
const homeOf = (p) => (p.homeId != null ? W.buildings.get(p.homeId) : null);

// ------------------------------------------------------------------ pregnancy
function fertilityAgeFactor(p, a) {
  const end = p.ext.menopause || (p.ext.menopause = clamp(W.rng.gauss(45, 1.6), 41, 49));
  if (a < 15 || a >= end) return 0;
  if (a < 18) return 0.55;
  if (a < 25) return 1.0;
  if (a < 30) return 0.95;
  if (a < 35) return 0.8;
  if (a < 40) return 0.5 - (a - 35) * 0.02;
  return Math.max(0.04, 0.28 - (a - 40) * 0.045);
}
export function conceive(world, mother, father, opts = {}) {
  if (!mother || mother.pregnant) return false;
  const tw = opts.twins ?? world.rng.chance(0.011);
  mother.pregnant = { fatherId: father ? father.id : null, dueTick: world.tick + GESTATION + Math.round(world.rng.gauss(0, 7 * TPD)), conceivedTick: world.tick, twins: !!tw };
  const married = father && mother.family.spouseId === father.id;
  world.addMemory(mother, { type: 'pregnancy', text: married ? 'Learned that a child is on the way.' : `Learned ${pro(mother).s} was with child${father ? ' by ' + full(father) : ''}.`, otherIds: father ? [father.id] : [], weight: married ? 0.5 : -0.2, importance: 3 });
  if (father) world.addMemory(father, { type: 'pregnancy', text: `${full(mother)} is expecting ${pro(father).p === 'his' ? 'his' : 'a'} child.`, otherIds: [mother.id], weight: 0.3, importance: 3 });
  moodlet(mother, 'expecting', married ? 'Expecting a child' : 'Worried about being with child', married ? 0.12 : -0.15, 40 * TPD);
  if (father) moodlet(father, 'expectingF', 'Soon to be a father', married ? 0.12 : -0.05, 40 * TPD);
  world.emit('pregnancy', { mother, father, premarital: !married });
  return true;
}
function liveKids(p) { let n = 0; for (const id of p.family.childrenIds) { const c = P(id); if (c && c.alive) n++; } return n; }
function conceptionDaily(world) {
  const boost = world.settings && world.settings.fertilityBoostUntil > world.tick ? 3 : 1;
  const scale = setting('fertilityScale', 1) * boost;
  for (const m of world.living()) {
    if (m.sex !== 'F' || m.pregnant) continue;
    const a = ageOf(m); if (a < 15 || a > 46) continue;
    const af = fertilityAgeFactor(m, a); if (!af) continue;
    // partner(s): [man, exposure]
    const cands = [];
    const sp = m.romance.partnerId != null ? P(m.romance.partnerId) : null;
    if (sp && sp.alive && sp.sex === 'M') cands.push([sp, m.romance.status === 'married' ? 1 : m.romance.status === 'engaged' ? 0.3 : 0.12]);
    const aff = m.ext.rom && m.ext.rom.affair ? P(m.ext.rom.affair.withId) : null;
    if (aff && aff.alive && aff.sex === 'M' && (!sp || aff.id !== sp.id)) cands.push([aff, 0.12]);
    if (!cands.length) continue;
    const f = fam(m);
    const since = f.lastBirthTick == null ? 99 : (world.tick - f.lastBirthTick) / YEAR;
    const lact = since < 0.45 ? 0.04 : since < 0.9 ? 0.3 : since < 1.4 ? 0.7 : 1;
    const kids = liveKids(m);
    const ideal = 2.6 + 3.8 * (m.values ? m.values.family : 0.6);
    const want = kids < ideal ? 1 : Math.max(0.12, Math.exp(-(kids - ideal + 1) * 0.75));
    for (const [man, expo] of cands) {
      const ma = ageOf(man); if (ma < 15 || ma > 75) continue;
      const hh = homeOf(m);
      const poor = (m.money + man.money) < 15 && kids >= 2 ? 0.6 : 1;
      const fert = 0.45 + m.genes.fertility * 0.9;
      const mfert = 0.75 + man.genes.fertility * 0.4 - (ma > 50 ? (ma - 50) * 0.02 : 0);
      const unwed = expo < 1 ? 0.8 : 1; // contraception-ish/avoidance outside marriage
      const per = (0.4 / 28) * scale * af * lact * want * poor * fert * Math.max(0.1, mfert) * expo * unwed * (m.health < 0.4 ? 0.5 : 1) * (hh ? 1 : 0.5);
      if (world.rng.next() < per) { conceive(world, m, man); break; }
    }
  }
}
function pregnancyDaily(world) {
  for (const m of world.living()) {
    const pr = m.pregnant; if (!pr) continue;
    const elapsed = world.tick - (pr.conceivedTick ?? pr.dueTick - GESTATION);
    if (elapsed < 36 * TPD && world.rng.next() < 0.13 / 36) { miscarry(world, m); continue; } // ~13% of recognised pregnancies
    if (world.tick >= pr.dueTick) { if (isPlayer(m) && !pr._playerNotified) pr._playerNotified = true; giveBirth(world, m); }
  }
}
function miscarry(world, m) {
  const pr = m.pregnant; m.pregnant = null; fam(m).stillbirths++;
  world.addMemory(m, { type: 'loss', text: 'Lost the child before it could be born.', otherIds: pr.fatherId ? [pr.fatherId] : [], weight: -0.8, importance: 3 });
  moodlet(m, 'miscarriage', 'Grieving a lost pregnancy', -0.45, 45 * TPD);
  const fa = P(pr.fatherId); if (fa && fa.alive) { moodlet(fa, 'miscarriageF', 'Sorrow over a lost child', -0.2, 25 * TPD); world.addMemory(fa, { type: 'loss', text: `${full(m)} lost our unborn child.`, otherIds: [m.id], weight: -0.5, importance: 3 }); }
  if (world.rng.chance(0.15)) world.chronicle.add({ type: 'family', importance: 2, text: world.rng.pick([`${full(m)} has lost the child ${pro(m).s} was carrying; the neighbours are bringing broth.`, `Sorrow at the ${m.lastName} house: the expected child did not come to term.`]), people: [m.id] });
}

// ------------------------------------------------------------------ naming
function chooseName(world, sex, mother, father, siblings) {
  const rng = world.rng;
  const used = new Set(siblings.filter((s) => s.alive).map((s) => s.firstName));
  const tradition = ((mother.values ? mother.values.tradition : 0.5) + (father && father.values ? father.values.tradition : 0.5)) / 2;
  const n = siblings.filter((s) => s.sex === sex).length; // same-sex order
  const pf = father ? P(father.family.fatherId) : null, pm = father ? P(father.family.motherId) : null;
  const mf = P(mother.family.fatherId), mm = P(mother.family.motherId);
  let order;
  if (sex === 'M') order = [[pf, 'grandfather'], [mf, 'grandfather'], [father, 'father'], [pf, 'grandfather']];
  else order = [[mm, 'grandmother'], [pm, 'grandmother'], [mother, 'mother'], [mm, 'grandmother']];
  if (rng.chance(0.25 + 0.5 * tradition)) {
    const tries = [order[Math.min(n, 3)], ...order];
    for (const [ns, rel] of tries) if (ns && ns.sex === sex && !used.has(ns.firstName)) return { name: ns.firstName, after: ns, rel };
    const extra = [P(father && father.family.siblingIds && father.family.siblingIds[0]), ...(mother.family.siblingIds || []).map(P)].filter((x) => x && x.sex === sex && !used.has(x.firstName));
    if (extra.length && rng.chance(0.4)) return { name: extra[0].firstName, after: extra[0], rel: sex === 'M' ? 'uncle' : 'aunt' };
  }
  for (let i = 0; i < 8; i++) { const nm = firstName(rng, sex); if (!used.has(nm)) return { name: nm, after: null }; }
  return { name: firstName(rng, sex), after: null };
}

// ------------------------------------------------------------------ birth
const clampG = (x) => clamp(x, 0, 1);
function birthCauseRisk(world, m, twins, first) {
  const a = ageOf(m);
  let r = 0.009;
  if (a >= 35) r *= 1.8; if (a >= 40) r *= 1.4; if (a < 18) r *= 1.5;
  r *= 1.6 - m.health * 0.8; if (twins) r *= 1.8; if (first) r *= 1.2;
  const hasDoc = world.living().some((x) => x.job === 'doctor' || x.job === 'nurse');
  if (hasDoc) r *= 0.7;
  return r * setting('maternalRiskScale', 1);
}
function giveBirth(world, m) {
  const pr = m.pregnant; m.pregnant = null;
  const father = P(pr.fatherId);
  const rng = world.rng, f = fam(m);
  const first = f.births === 0;
  const twins = !!pr.twins;
  const nBabies = twins ? 2 : 1;
  const married = father && m.family.spouseId === father.id;
  const kids = [];
  const sibs = m.family.childrenIds.map(P).concat(father ? father.family.childrenIds.map(P) : []).filter(Boolean);
  const uniqSibs = [...new Map(sibs.map((s) => [s.id, s])).values()];
  const mainHome = homeOf(m);
  let stillborn = 0;
  for (let i = 0; i < nBabies; i++) {
    if (rng.chance(0.022)) { stillborn++; continue; }
    const sex = rng.chance(0.512) ? 'M' : 'F';
    const nm = chooseName(world, sex, m, father, uniqSibs.concat(kids));
    const par = [m, father].filter(Boolean);
    const personality = {};
    for (const k of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) {
      const avg = par.reduce((s, x) => s + x.personality[k], 0) / par.length;
      personality[k] = clamp(0.45 * avg + 0.55 * (0.5 + rng.gauss(0, 0.19)), 0.02, 0.98); // ~45% heritable
    }
    const lastName = married || (father && !rng.chance(0.2) && m.family.spouseId == null && m.romance.status === 'engaged') ? (father ? father.lastName : m.lastName) : m.lastName;
    const c = world.createPerson({ sex, age: 0, birthTick: world.tick, firstName: nm.name, lastName, mother: m, father: father || undefined, homeId: mainHome ? mainHome.id : m.homeId, money: 0, personality });
    // genes: createPerson already blends parents + noise; add rare larger mutation
    if (rng.chance(0.06)) { const k = rng.pick(['intellect', 'vitality', 'fertility', 'looks']); c.genes[k] = clampG(c.genes[k] + rng.gauss(0, 0.18)); }
    // inherited traits & values & interests
    for (const x of par) for (const t of x.traits) if (c.traits.length < 3 && !c.traits.includes(t) && t !== 'thief' && t !== 'drunkard' && rng.chance(0.14)) c.traits.push(t);
    if (c.values && par.length) for (const k of Object.keys(c.values)) { const avg = par.reduce((s, x) => s + (x.values ? x.values[k] : 0.5), 0) / par.length; c.values[k] = clamp(0.4 * avg + 0.6 * c.values[k], 0, 1); }
    if (c.interests && par.length && rng.chance(0.4)) { const pi = rng.pick(rng.pick(par).interests || []); if (pi && !c.interests.includes(pi)) c.interests[0] = pi; }
    c.job = 'child'; c.family.siblingIds = [];
    c.ext.fam = { born: world.tick, namedAfter: nm.after ? nm.after.id : null };
    world.addPerson(c);
    kids.push(c);
    c._nm = nm;
  }
  // sibling & kin links
  for (const c of kids) {
    const sibSet = [...uniqSibs, ...kids.filter((k) => k !== c)];
    for (const s of sibSet) {
      if (!c.family.siblingIds.includes(s.id)) c.family.siblingIds.push(s.id);
      if (!(s.family.siblingIds || (s.family.siblingIds = [])).includes(c.id)) s.family.siblingIds.push(c.id);
      const ra = world.getRel(c, s), rb = world.getRel(s, c);
      for (const r of [ra, rb]) { r.familiarity = Math.max(r.familiarity, 0.7); r.affinity = clamp(r.affinity + 0.4 + rng.gauss(0, 0.1), -1, 1); r.trust = Math.max(r.trust, 0.6); if (!r.tags.includes('family')) r.tags.push('family'); }
    }
    for (const par of [m, father]) {
      if (!par) continue;
      for (const gp of getParents(par)) if (gp.alive) for (const [x, y] of [[gp, c], [c, gp]]) { const r = world.getRel(x, y); r.familiarity = Math.max(r.familiarity, 0.5); r.affinity = clamp(Math.max(r.affinity, 0.45), -1, 1); r.trust = Math.max(r.trust, 0.6); if (!r.tags.includes('family')) r.tags.push('family'); }
    }
  }
  f.births += kids.length; f.lastBirthTick = world.tick;
  world.stats.births = (world.stats.births || 0) + kids.length;
  // maternal death?
  let died = false;
  if (rng.next() < birthCauseRisk(world, m, twins, first)) died = true;
  // chronicle
  const T = [];
  const season = ['spring', 'summer', 'autumn', 'winter'][world.time.season] || '';
  const mn = full(m), fn = father ? full(father) : null;
  const parentsTxt = married ? `${m.firstName} and ${father.firstName} ${father.lastName}` : (fn ? `${mn}` : mn);
  if (kids.length) {
    const c0 = kids[0];
    const after = (c) => (c._nm && c._nm.after ? `, named for ${pro(c).p} ${c._nm.rel} ${c._nm.after.firstName}${c._nm.after.alive ? '' : ', God rest ' + pro(c._nm.after).o}` : '');
    const kidWord = c0.sex === 'M' ? 'son' : 'daughter';
    if (twins && kids.length === 2) {
      T.push(`Twins! ${parentsTxt} welcomed ${kids[0].firstName} and ${kids[1].firstName} into the world; the whole street turned out to see them.`);
      T.push(`${mn} was delivered of twin ${kids[0].sex === kids[1].sex ? (kids[0].sex === 'M' ? 'boys' : 'girls') : 'children'}, ${kids[0].firstName} and ${kids[1].firstName}, to the astonishment of ${father ? father.firstName : 'the midwife'}.`);
    } else {
      const order = m.family.childrenIds.length;
      const ord = first ? 'first child' : order <= 2 ? 'second child' : `${order}th child`;
      const gp = c0._nm && c0._nm.after && c0._nm.after.alive ? ` The proud ${c0._nm.rel} ${c0._nm.after.firstName} ${c0._nm.after.lastName} is said to have wept.` : '';
      T.push(`A ${kidWord}, ${c0.firstName}, was born to ${parentsTxt} this ${season}${after(c0)}.${gp}`);
      T.push(`${mn} gave birth to a healthy ${kidWord}${first ? ', ' + pro(m).p + ' first' : ''}. ${pro(c0).s === 'she' ? 'She' : 'He'} will be called ${c0.firstName}.`);
      T.push(`The ${m.lastName === (father ? father.lastName : m.lastName) ? m.lastName : father.lastName} household has a new member: ${c0.firstName}, ${ord} of ${parentsTxt}${after(c0)}.`);
      if (!married) T.push(`${mn} has given birth to a ${kidWord}, ${c0.firstName}, ${father ? 'and ' + fn + ' is said to be the father' : 'and tongues wag over who the father might be'}.`);
    }
    if (died) T.length = 0;
    if (died) T.push(`${mn} died bringing ${kids.length > 1 ? 'her twins' : 'her ' + kidWord + ' ' + c0.firstName} into the world; the town grieves a ${m.job && m.job !== 'unemployed' ? m.job + ' and ' : ''}mother cut down at ${Math.floor(ageOf(m))}.`);
    world.chronicle.add({ type: 'birth', importance: twins || died ? 3 : first ? 2 : 2, text: rng.pick(T), people: [m.id, ...(father ? [father.id] : []), ...kids.map((k) => k.id)] });
  } else {
    world.addMemory(m, { type: 'loss', text: 'The child was born still.', otherIds: father ? [father.id] : [], weight: -0.9, importance: 4 });
    moodlet(m, 'stillbirth', 'Heartbroken by a stillbirth', -0.6, 60 * TPD);
    if (father) { moodlet(father, 'stillbirthF', 'Grieving a stillborn child', -0.4, 40 * TPD); world.addMemory(father, { type: 'loss', text: `Our child was born still; ${m.firstName} nearly broke.`, otherIds: [m.id], weight: -0.8, importance: 4 }); }
    f.stillbirths++;
    world.chronicle.add({ type: 'family', importance: 3, text: rng.pick([`${mn}'s child was born still. The temple bell rang once for it.`, `Sorrow at the ${m.lastName} house: ${m.firstName}'s baby was stillborn.`]), people: [m.id] });
  }
  if (stillborn && kids.length) world.addMemory(m, { type: 'loss', text: 'One of the twins was born still.', otherIds: [], weight: -0.8, importance: 4 });
  // memories & moods for the parents
  for (const c of kids) {
    for (const par of [m, father]) if (par && par.alive) {
      world.addMemory(par, { type: 'birth', text: `${par === m ? 'Gave birth to' : 'Became a father to'} ${full(c)}${c._nm && c._nm.after ? ', named for ' + c._nm.after.firstName : ''}.`, otherIds: [c.id], weight: 0.9, importance: 5 });
    }
    for (const gp of getParents(m).concat(father ? getParents(father) : [])) if (gp.alive) { world.addMemory(gp, { type: 'birth', text: `Grandchild ${full(c)} was born.`, otherIds: [c.id], weight: 0.6, importance: 3 }); moodlet(gp, 'grandchild', 'A new grandchild', 0.2, 10 * TPD); }
    delete c._nm;
    world.emit('birth', { child: c, mother: m, father });
  }
  if (kids.length) { moodlet(m, 'newborn', 'Joy of a newborn', 0.35, 20 * TPD); if (father && father.alive) moodlet(father, 'newborn', 'Joy of a newborn', 0.3, 20 * TPD); }
  if (!married && father && world.rng.chance(0.3)) m.reputation = clamp(m.reputation - 0.05, -1, 1);
  if (!married && !father) m.reputation = clamp(m.reputation - 0.08, -1, 1);
  // homemaking
  if (m.sex === 'F' && m.family.spouseId != null && !(m.workId != null) && !m.homemaker && kids.length && rng.chance(0.6)) m.homemaker = true;
  if (died) {
    for (const c of kids) if (rng.chance(0.25)) { c._dyingOfMother = true; }
    world.killPerson(m, 'childbirth');
    if (father && father.alive) { moodlet(father, 'widowed', 'Lost a wife in childbirth', -0.6, 60 * TPD); }
  }
  // neonatal risk is handled by the child mortality loop (very high hazard in the first weeks).
}

// ------------------------------------------------------------------ child mortality (annual hazard by age)
function annualHazard(a) {
  if (a < 0.08) return 0.5; // first game-month: ~4% die
  if (a < 1) return 0.045;
  if (a < 5) return 0.012;
  if (a < 15) return 0.002;
  return 0;
}
const CAUSE = {
  infant: ['a fever in the cradle', 'a weakness of the lungs', 'a wasting sickness', 'the teething fever', 'a croup in the night'],
  small: ['a fever', 'the whooping cough', 'a fall into the millrace', 'the croup', 'a scalding accident', 'the flux'],
  child: ['a fever', 'drowning in the river', 'a fall from a hayloft', 'the measles', 'a kick from a horse', 'the flux', 'a cart accident'],
};
function childMortalityDaily(world) {
  const scale = setting('childMortalityScale', 1);
  const winter = world.time.season === 3 ? 1.25 : 1;
  const hasDoc = world.living().some((x) => x.job === 'doctor') ? 0.85 : 1;
  for (const c of world.living()) {
    const a = ageOf(c); if (a >= 15) continue;
    const h = annualHazard(a); if (!h) continue;
    let m = scale * winter * hasDoc * (1.3 - 0.6 * c.genes.vitality) * (c.health < 0.6 ? 1.4 : 1);
    const mo = P(c.family.motherId);
    if (a < 2 && (!mo || !mo.alive)) m *= 1.8;
    if (c.illness && c.illness.severity > 0.4) m *= 1 + 2 * c.illness.severity;
    const hh = homeOf(c);
    if (hh) { let money = 0; for (const id of hh.residents) { const r = P(id); if (r && ageOf(r) >= 16) money += r.money; } if (money < 12) m *= 1.3; }
    if (c._dyingOfMother) m *= 2.5;
    if (world.rng.next() < (h / DPY) * m) killChild(world, c, a);
  }
}
function killChild(world, c, a) {
  const cause = world.rng.pick(a < 1 ? CAUSE.infant : a < 6 ? CAUSE.small : CAUSE.child);
  const parents = getParents(c).filter((x) => x.alive);
  world.killPerson(c, cause);
  for (const par of parents) {
    moodlet(par, 'childLost', `Mourning ${c.firstName}`, -0.65, 70 * TPD);
    world.addMemory(par, { type: 'loss', text: `Lost ${pro(par).p === 'her' ? 'her' : 'his'} ${c.sex === 'M' ? 'son' : 'daughter'} ${c.firstName}, aged ${a < 1 ? Math.max(1, Math.round(a * 12)) + ' months' : Math.floor(a)}, to ${cause}.`, otherIds: [c.id], weight: -1, importance: 5 });
  }
  const aStr = a < 0.08 ? 'a few days old' : a < 1 ? `${Math.max(1, Math.round(a * 12))} months old` : `aged ${Math.floor(a)}`;
  const P2 = parents.length ? (parents.length === 2 && parents[0].lastName === parents[1].lastName ? `${parents[0].firstName} and ${parents[1].firstName} ${parents[0].lastName}` : full(parents[0])) : 'the orphanage of neighbours';
  const T = [
    `${c.firstName} ${c.lastName}, ${aStr}, died of ${cause}; ${parents.length ? P2 + ' are' : 'the neighbours are'} inconsolable.`,
    `The temple bell tolled for little ${c.firstName}, ${c.sex === 'M' ? 'son' : 'daughter'} of ${P2}, taken by ${cause} ${aStr}.`,
    `${P2} buried ${parents.length ? (parents[0].sex === 'F' ? 'her' : 'their') : 'a'} ${c.sex === 'M' ? 'boy' : 'girl'} ${c.firstName} this week; ${cause} took the child ${aStr}.`,
  ];
  world.chronicle.add({ type: 'death', importance: a < 0.08 ? 2 : 3, text: world.rng.pick(T), people: [c.id, ...parents.map((x) => x.id)] });
}

// ------------------------------------------------------------------ childhood stages, parenting
function childhoodDaily(world) {
  for (const c of world.living()) {
    const a = ageOf(c);
    if (a >= 18) continue;
    if (a >= 6 && c.job === 'child') c.job = 'student';
    if (a < 6 && c.job !== 'child') c.job = 'child';
  }
}
function parentingYearly(world) {
  for (const c of world.living()) {
    const a = ageOf(c); if (a >= 18 || a < 0.5) continue;
    const gs = [P(c.family.motherId), P(c.family.fatherId)].filter((x) => x && x.alive);
    const g = P(c.family.guardianId);
    if (g && g.alive && !gs.includes(g)) gs.push(g);
    const key = (k) => gs.length ? gs.reduce((s, x) => s + x.personality[k], 0) / gs.length : 0.5;
    if (!gs.length) { moodlet(c, 'orphan', 'Growing up without parents', -0.2, YEAR); continue; }
    const q = clamp(0.35 * key('agreeableness') + 0.25 * key('conscientiousness') + 0.25 * (1 - key('neuroticism')) + 0.15 * (gs.length > 1 ? 1 : 0.6), 0, 1);
    for (const k of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) c.personality[k] = clamp(c.personality[k] + 0.015 * (key(k) - c.personality[k]), 0.02, 0.98);
    c.personality.neuroticism = clamp(c.personality.neuroticism - 0.02 * (q - 0.5), 0.02, 0.98);
    c.personality.agreeableness = clamp(c.personality.agreeableness + 0.015 * (q - 0.5), 0.02, 0.98);
    if (q > 0.62) moodlet(c, 'lovinghome', 'A warm home', 0.08, YEAR);
    else if (q < 0.4 && gs.some((x) => x.traits.includes('hothead') || x.traits.includes('drunkard'))) moodlet(c, 'harshhome', 'A harsh home', -0.1, YEAR);
    // turning-of-age trait rolls
    if (a >= 15.5 && a < 16.5 && !c.ext.fam?.adultTraits) {
      c.ext.fam = c.ext.fam || {}; c.ext.fam.adultTraits = true;
      if (c.traits.length < 3 && !c.traits.includes('drunkard') && world.rng.chance(0.03 + 0.12 * (1 - c.personality.conscientiousness) * (gs.some((x) => x.traits.includes('drunkard')) ? 2 : 1))) c.traits.push('drunkard');
      if (c.traits.length < 3 && !c.traits.includes('thief') && world.rng.chance(0.015 + 0.06 * (1 - c.personality.conscientiousness) * (1 - c.personality.agreeableness))) c.traits.push('thief');
    }
  }
}

// ------------------------------------------------------------------ orphans & guardians
function onDeath(world, ev) {
  const d = ev.person;
  if (!d) return;
  for (const kid of d.family.childrenIds.map(P)) {
    if (!kid || !kid.alive || ageOf(kid) >= 16) continue;
    const other = P(kid.family.motherId === d.id ? kid.family.fatherId : kid.family.motherId);
    if (other && other.alive) {
      if (other.homeId !== kid.homeId) { const h = homeOf(other); if (h && h.residents.length < 9) relocate(world, kid, h); }
      moodlet(kid, 'bereaved', `Mourning ${d.firstName}`, -0.5, 60 * TPD);
      continue;
    }
    assignGuardian(world, kid, d);
  }
  // clean pregnancy records of widowed mothers? (a pregnant widow keeps the child)
}
function assignGuardian(world, kid, deadParent) {
  const cands = [];
  const add = (p, w) => { if (p && p.alive && ageOf(p) >= 18 && ageOf(p) < 80 && p.id !== kid.id && !cands.some((c) => c.p === p)) cands.push({ p, w: w + Math.max(0, world.relScore(p, kid)) + (p.money > 40 ? 0.2 : 0) - (homeOf(p) ? homeOf(p).residents.length * 0.08 : 0) }); };
  for (const g of getParents(P(kid.family.motherId) || {}).concat(getParents(P(kid.family.fatherId) || {}))) add(g, 1);
  for (const s of getSiblings(kid)) add(s, 0.8);
  for (const par of [P(kid.family.motherId), P(kid.family.fatherId)]) if (par) for (const s of getSiblings(par)) { add(s, 0.7); const sp = P(s.family.spouseId); if (sp) add(sp, 0.3); }
  // fallback: any childless-ish kind married adult
  if (!cands.length) for (const p of world.living()) if (ageOf(p) >= 28 && ageOf(p) < 60 && p.family.spouseId != null && p.traits.includes('kind') && liveKids(p) < 4) add(p, 0.2);
  if (!cands.length) { kid.ext.fam = kid.ext.fam || {}; kid.family.guardianId = null; return; }
  cands.sort((a, b) => b.w - a.w);
  const g = cands[0].p;
  kid.family.guardianId = g.id;
  const h = homeOf(g); if (h) relocate(world, kid, h);
  const r = world.getRel(kid, g), r2 = world.getRel(g, kid);
  for (const x of [r, r2]) { x.familiarity = Math.max(x.familiarity, 0.7); x.affinity = Math.max(x.affinity, 0.3); x.trust = Math.max(x.trust, 0.6); if (!x.tags.includes('family')) x.tags.push('family'); }
  moodlet(kid, 'orphaned', 'Lost both parents', -0.6, 100 * TPD);
  world.addMemory(kid, { type: 'loss', text: `Was left without parents; ${g.firstName} ${g.lastName} took ${pro(kid).o} in.`, otherIds: [g.id], weight: -0.9, importance: 5 });
  world.addMemory(g, { type: 'duty', text: `Took in orphaned ${kid.firstName} ${kid.lastName}.`, otherIds: [kid.id], weight: 0.2, importance: 3 });
  world.chronicle.add({ type: 'family', importance: 3, text: world.rng.pick([`${kid.firstName}, ${Math.floor(ageOf(kid))}, is left an orphan; ${full(g)} has taken the ${kid.sex === 'M' ? 'boy' : 'girl'} in.`, `With both parents gone, young ${kid.firstName} ${kid.lastName} goes to live with ${kinship(kid, g) || 'kin'} ${full(g)}.`]), people: [kid.id, g.id] });
}

// ------------------------------------------------------------------ households (weekly)
function householdWeekly(world) {
  const rng = world.rng;
  for (const p of world.living()) {
    const a = ageOf(p);
    const h = homeOf(p);
    if (isPlayer(p)) continue;
    if (!h || h.closed) { if (a >= 16) { const v = findVacantHouse(world, p); if (v) relocate(world, p, v); } continue; }
    // adult unmarried children leave home
    if (a >= 18 && a < 40 && p.family.spouseId == null && !p.pregnant) {
      const parents = getParents(p).filter((x) => x.alive && x.homeId === p.homeId);
      if (parents.length) {
        const crowd = h.residents.length;
        const indep = p.money > 35 && (p.workId != null || p.job !== 'unemployed');
        const pLeave = (a >= 28 ? 0.05 : a >= 23 ? 0.02 : 0.006) * (crowd > 5 ? 2 : 1) * (indep ? 2 : 0.4);
        if (rng.next() < pLeave) {
          const v = findVacantHouse(world, h.door);
          if (v) { relocate(world, p, v); world.addMemory(p, { type: 'move', text: `Left the family home for a place of ${pro(p).p} own.`, otherIds: [], weight: 0.3, importance: 3 }); }
        }
      }
    }
    // elderly move in with children
    if (a >= 62 && p.family.spouseId == null) {
      const frail = p.health < 0.5 || p.money < 20 || a >= 75;
      const alone = h.residents.filter((i) => { const r = P(i); return r && r.alive && ageOf(r) >= 16; }).length <= 1;
      if (alone && rng.next() < (frail ? 0.05 : 0.004) * (a >= 72 ? 2 : 1)) {
        const kids = getChildren(p).filter((c) => c.alive && ageOf(c) >= 22 && c.homeId !== p.homeId && homeOf(c) && homeOf(c).residents.length <= 6).sort((x, y) => world.relScore(y, p) - world.relScore(x, p));
        if (kids.length) {
          const k = kids[0]; relocate(world, p, homeOf(k));
          world.addMemory(p, { type: 'move', text: `Moved in with ${pro(p).p} ${k.sex === 'M' ? 'son' : 'daughter'} ${k.firstName}'s family.`, otherIds: [k.id], weight: 0.1, importance: 3 });
          if (rng.chance(0.5)) world.chronicle.add({ type: 'family', importance: 2, text: `Old ${full(p)}, ${Math.floor(a)}, has given up ${pro(p).p} cottage to live with ${pro(p).p} ${k.sex === 'M' ? 'son' : 'daughter'} ${full(k)}.`, people: [p.id, k.id] });
        }
      }
    }
  }
}

// ------------------------------------------------------------------ sibling dynamics (yearly)
function siblingsYearly(world) {
  const rng = world.rng;
  for (const p of world.living()) {
    const a = ageOf(p); if (a < 6) continue;
    for (const id of p.family.siblingIds || []) {
      if (id < p.id) continue;
      const s = P(id); if (!s || !s.alive) continue;
      const r1 = world.getRel(p, s), r2 = world.getRel(s, p);
      const drift = (x) => { x.familiarity = Math.min(1, x.familiarity + 0.03); x.affinity = clamp(x.affinity + 0.015 * ((p.personality.agreeableness + s.personality.agreeableness) / 2 - 0.5) + rng.gauss(0, 0.02), -1, 1); };
      drift(r1); drift(r2);
      if (a > 16 && r1.affinity < -0.45 && !r1.tags.includes('rival') && rng.chance(0.3)) { r1.tags.push('rival'); r2.tags.push('rival'); world.addMemory(p, { type: 'feud', text: `Fell out badly with ${pro(p).p === 'her' ? 'her' : 'his'} ${kinship(p, s)} ${s.firstName}.`, otherIds: [s.id], weight: -0.5, importance: 3 }); }
    }
  }
}

// ------------------------------------------------------------------ interventions
function registerInterventions(world) {
  if (!world.registerIntervention) return;
  const reg = (kind, desc, fn) => { fn.description = desc; world.registerIntervention(kind, fn, desc); };
  reg('babyBoom', 'Make several married couples expecting at once and triple fertility for a year. params: {count=8}', (w, params = {}) => {
    const n = params.count ?? 8;
    const mothers = w.rng.shuffle(w.living().filter((m) => m.sex === 'F' && !m.pregnant && ageOf(m) >= 17 && ageOf(m) < 41 && m.romance.status === 'married' && P(m.romance.partnerId) && P(m.romance.partnerId).sex === 'M'));
    let done = 0;
    for (const m of mothers) { if (done >= n) break; if (conceive(w, m, P(m.romance.partnerId))) done++; }
    w.settings.fertilityBoostUntil = w.tick + YEAR;
    w.chronicle.add({ type: 'family', importance: 3, text: w.rng.pick(['A baby boom is rumoured: half the cradles in Hollowmere are being dusted off.', 'It seems every second wife in town is expecting; the midwife has not slept in a week.']), people: [] });
    return { pregnant: done };
  });
  reg('twins', 'Cause a pregnancy to be twins (or start one). params: {motherId?}', (w, params = {}) => {
    let m = params.motherId != null ? w.people.get(params.motherId) : w.rng.pick(w.living().filter((x) => x.pregnant));
    if (!m) m = w.rng.pick(w.living().filter((x) => x.sex === 'F' && !x.pregnant && ageOf(x) >= 18 && ageOf(x) < 38 && P(x.romance.partnerId) && x.romance.status === 'married'));
    if (!m) return null;
    if (m.pregnant) m.pregnant.twins = true; else conceive(w, m, P(m.romance.partnerId), { twins: true });
    return { motherId: m.id };
  });
}

// ------------------------------------------------------------------ system
export default {
  name: 'family',
  init(world) {
    W = world;
    world.family = { getParents, getChildren, getSiblings, getAncestors, getDescendants, kinship, bloodDistance, relocate, findVacantHouse, conceive };
    world.kinship = kinship;
    for (const p of world.people.values()) { if (!p.ext) p.ext = {}; if (p.family && !p.family.siblingIds) p.family.siblingIds = []; }
    // seed lactation spacing for existing mothers from their youngest child
    for (const p of world.living()) {
      if (p.sex !== 'F') continue;
      const kids = p.family.childrenIds.map(P).filter(Boolean);
      const f = fam(p); f.births = kids.length;
      if (kids.length) f.lastBirthTick = Math.max(...kids.map((k) => k.birthTick));
      if (p.homemaker === undefined && p.family.spouseId != null && kids.some((k) => ageOf(k) < 5) && world.rng.chance(0.3)) p.homemaker = true;
    }
    world.on('death', (ev) => onDeath(world, ev));
    registerInterventions(world);
  },
  onDay(world) {
    W = world;
    conceptionDaily(world);
    pregnancyDaily(world);
    childMortalityDaily(world);
    childhoodDaily(world);
    if (world.time.totalDays % 7 === 3) householdWeekly(world);
  },
  onYear(world) {
    parentingYearly(world);
    siblingsYearly(world);
    for (const p of world.living()) {
      if (p.sex === 'F' && p.homemaker) { const ks = getChildren(p).filter((c) => c.alive && ageOf(c) < 9); if (!ks.length && world.rng.chance(0.6)) p.homemaker = false; }
    }
  },
  scoreModifiers: [
    (world, p, def, score) => {
      if (p.pregnant && def.id === 'work' && p.pregnant.dueTick - world.tick < 14 * TPD) return score * 0.35;
      if (p.sex === 'F' && p.ext.fam && p.ext.fam.lastBirthTick != null && world.tick - p.ext.fam.lastBirthTick < 20 * TPD && (def.id === 'work' || def.id === 'tavern')) return score * 0.3;
      return score;
    },
  ],
};
