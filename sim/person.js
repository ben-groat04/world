// Person factory + initial population generation (families, clans, jobs, relationships).
import { TICKS_PER_YEAR } from './time.js';
import { firstName, surname, businessName } from './names.js';
import { JOBS } from './map.js';
import { makeNeedRates } from './needs.js';

export const SKILLS = ['farming', 'cooking', 'smithing', 'medicine', 'teaching', 'trade', 'charisma', 'crafting', 'athletics', 'scholarship'];
export const INTERESTS = ['farming', 'music', 'books', 'gardening', 'cooking', 'gambling', 'hunting', 'crafts', 'politics', 'religion', 'sports', 'storytelling'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const fullName = (p) => `${p.firstName} ${p.lastName}`;

function randomGenes(rng, sex) {
  return {
    height: clamp01(rng.gauss(sex === 'M' ? 0.6 : 0.45, 0.15)), build: clamp01(rng.gauss(0.5, 0.18)), skinTone: clamp01(rng.gauss(0.45, 0.25)),
    hairColor: rng.next(), eyeColor: rng.next(), looks: clamp01(rng.gauss(0.5, 0.2)), intellect: clamp01(rng.gauss(0.5, 0.17)),
    vitality: clamp01(rng.gauss(0.6, 0.15)), fertility: clamp01(rng.gauss(0.6, 0.2)),
  };
}
function inheritGenes(rng, m, f) {
  const g = {};
  for (const k of Object.keys(m)) {
    if (k === 'hairColor' || k === 'eyeColor') g[k] = rng.chance(0.9) ? (rng.chance(0.5) ? m[k] : f[k]) : rng.next();
    else g[k] = clamp01((m[k] + f[k]) / 2 + rng.gauss(0, 0.08));
  }
  return g;
}
function genTraits(rng, pe, age) {
  const c = [
    ['gossip', 0.12 + 0.3 * pe.extraversion + 0.1 * (1 - pe.agreeableness)], ['drunkard', age < 17 ? 0 : 0.03 + 0.12 * (1 - pe.conscientiousness)],
    ['pious', 0.1 + 0.2 * pe.conscientiousness + 0.1 * (1 - pe.openness)], ['ambitious', 0.08 + 0.3 * pe.conscientiousness],
    ['kind', 0.1 + 0.4 * pe.agreeableness], ['greedy', 0.04 + 0.25 * (1 - pe.agreeableness)], ['shy', 0.45 * (1 - pe.extraversion) ** 2],
    ['hothead', 0.04 + 0.35 * pe.neuroticism * (1 - pe.agreeableness)], ['lazy', 0.5 * (1 - pe.conscientiousness) ** 2],
    ['honest', 0.1 + 0.3 * pe.agreeableness * pe.conscientiousness], ['charming', 0.1 + 0.2 * pe.extraversion], ['jealous', 0.05 + 0.25 * pe.neuroticism],
    ['romantic', 0.1 + 0.2 * pe.openness], ['thief', age < 14 ? 0 : 0.015 + 0.06 * (1 - pe.conscientiousness) * (1 - pe.agreeableness)],
  ];
  const got = c.filter(([, pr]) => rng.next() < pr).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
  return got;
}
export function newRel() { return { familiarity: 0, affinity: 0, attraction: 0, trust: 0.5, respect: 0, lastTick: 0, tags: [] }; }

// world.createPerson(opts): opts {sex, age(years), firstName, lastName, mother, father (Person objects), parents:[mother,father],
// homeId, job, money, genes, personality}. Returns a Person (not yet added: call world.addPerson).
export function createPerson(world, o = {}) {
  const rng = world.rngFor('people');
  const sex = o.sex || (rng.chance(0.5) ? 'M' : 'F');
  const mother = o.mother || (o.parents && o.parents[0]) || null, father = o.father || (o.parents && o.parents[1]) || null;
  const age = o.age ?? rng.int(0, 70);
  const genes = o.genes || (mother && father ? inheritGenes(rng, mother.genes, father.genes) : randomGenes(rng, sex));
  const pe = o.personality || {};
  const personality = {};
  for (const k of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) {
    const rnd = rng.gauss(0.5, 0.18);
    personality[k] = pe[k] ?? clamp01(mother && father ? 0.35 * (mother.personality[k] + father.personality[k]) / 2 + 0.65 * rnd : rnd);
    if (personality[k] < 0.02) personality[k] = 0.02; if (personality[k] > 0.98) personality[k] = 0.98;
  }
  const skills = {};
  const sc = Math.min(1, age / 18);
  for (const s of SKILLS) skills[s] = clamp01((0.04 + rng.next() * 0.2) * sc);
  const iv = [];
  while (iv.length < 3) { const x = rng.pick(INTERESTS); if (!iv.includes(x)) iv.push(x); }
  const wake = 5.6 + rng.float(0, 1.6) + (age < 15 ? 0.3 : 0), bed = (age < 15 ? 20.2 : 21.3) + rng.float(0, 1.8);
  const p = {
    id: world.nextPersonId++, firstName: o.firstName || firstName(rng, sex), lastName: o.lastName || surname(rng), sex,
    birthTick: o.birthTick ?? (world.tick - Math.round(age * TICKS_PER_YEAR) - rng.int(0, TICKS_PER_YEAR - 1)),
    alive: true, deathTick: null, causeOfDeath: null, x: 0, y: 0, path: null, pathIdx: 0, locationId: null, inside: false,
    homeId: o.homeId ?? null, workId: null, job: 'unemployed',
    genes, personality, traits: genTraits(rng, personality, age), interests: iv,
    values: { tradition: clamp01(rng.gauss(0.5, 0.2)), wealth: clamp01(rng.gauss(0.5, 0.2)), family: clamp01(rng.gauss(0.6, 0.2)), freedom: clamp01(rng.gauss(0.5, 0.2)), community: clamp01(rng.gauss(0.5, 0.2)), piety: clamp01(rng.gauss(0.45, 0.25)) },
    skills,
    needs: { hunger: rng.float(0.5, 0.95), energy: rng.float(0.5, 0.9), social: rng.float(0.4, 0.9), fun: rng.float(0.4, 0.9), hygiene: rng.float(0.5, 0.95), comfort: rng.float(0.6, 0.95), purpose: rng.float(0.4, 0.9) },
    mood: 0.1, moodlets: [], moodletSum: 0, health: 1, illness: null, money: o.money ?? 0, inventory: { food: rng.int(1, 4), goods: 0 }, reputation: 0,
    relationships: new Map(), family: { fatherId: father ? father.id : null, motherId: mother ? mother.id : null, spouseId: null, childrenIds: [], exSpouseIds: [] },
    romance: { partnerId: null, status: null, sinceTick: 0 }, memories: [], rumors: [], pregnant: null, jailedUntil: 0,
    currentAction: null, thought: '', lastAction: null, cooldown: {}, nextThink: 0, lastMeal: -rng.int(6, 40), starve: 0, workedTicks: 0, cell: -1, needsTick: world.tick - (world.nextPersonId % 6), seg: [], segTick: -1, speed: 6,
    schedule: { wake, bed, offDay: rng.int(0, 5) }, ext: {}, bubble: null,
  };
  p.needRate = makeNeedRates(personality);
  return p;
}

// ---------- initial population ----------
const JOB_FIT = { doctor: 'intellect', mayor: 'intellect', teacher: 'intellect', priest: 'intellect', clerk: 'intellect', nurse: 'intellect', captain: 'vitality', guard: 'vitality', merchant: 'looks', server: 'looks', tavernkeeper: 'looks' };
const PRIORITY = ['doctor', 'mayor', 'teacher', 'priest', 'captain', 'nurse', 'clerk', 'smith', 'baker', 'miller', 'tailor', 'carpenter', 'merchant', 'tavernkeeper', 'innkeeper', 'guard', 'server', 'farmer', 'gardener', 'gravedigger', 'laborer'];

export function generatePopulation(world, rng, target) {
  const T = TICKS_PER_YEAR;
  const houses = world.buildingsOfType('house');
  const freeHouses = new Set(houses);
  const all = [];
  const mkp = (o) => { const p = world.createPerson(o); all.push(p); return p; };
  const door = (b) => b.door;
  const takeHouse = (near) => {
    if (!freeHouses.size) return null;
    let best = null, bd = Infinity;
    for (const h of freeHouses) {
      const d = near ? Math.abs(h.door.x - near.door.x) + Math.abs(h.door.y - near.door.y) + rng.float(0, 8) : rng.float(0, 100);
      if (d < bd) { bd = d; best = h; }
    }
    freeHouses.delete(best);
    return best;
  };
  const ageInt = (p) => Math.floor(-p.birthTick / T);
  const link = (child, mom, dad) => { for (const par of [mom, dad]) if (par) par.family.childrenIds.push(child.id); };
  const marry = (a, b) => {
    a.family.spouseId = b.id; b.family.spouseId = a.id;
    for (const [x, y] of [[a, b], [b, a]]) x.romance = { partnerId: y.id, status: 'married', sinceTick: -Math.round(rng.float(1, Math.max(2, Math.min(ageInt(a), ageInt(b)) - 18)) * T) };
  };
  const couple = (hAge, wAge, last, wMaiden) => {
    const m = mkp({ sex: 'M', age: hAge, lastName: last });
    const f = mkp({ sex: 'F', age: wAge, lastName: last });
    f.maidenName = wMaiden || surname(rng);
    marry(m, f);
    return [m, f];
  };
  const kidsOf = (mom, dad, n) => {
    const out = [];
    const first = Math.min(ageInt(mom), ageInt(dad)) - 19;
    let a = Math.min(17, first); a = rng.int(Math.max(0, a - 8), Math.max(0, a));
    for (let i = 0; i < n && a >= 0; i++) {
      const k = mkp({ age: a, lastName: dad.lastName, mother: mom, father: dad });
      link(k, mom, dad); out.push(k); a -= rng.int(1, 4);
    }
    for (let i = 0; i < out.length; i++) for (let j = 0; j < out.length; j++) if (i !== j) out[i].siblingsTmp = (out[i].siblingsTmp || []).concat(out[j].id);
    return out;
  };
  const settle = (members, near) => {
    const h = takeHouse(near);
    if (!h) { for (const p of members) { const i = all.indexOf(p); if (i >= 0) all.splice(i, 1); } return null; }
    for (const p of members) {
      p.homeId = h.id; p.x = h.door.x; p.y = h.door.y; p.locationId = h.id; p.inside = true; h.residents.push(p.id);
    }
    return h;
  };
  const wealth = (p, base = 1) => { const a = ageInt(p); p.money = a < 14 ? 0 : Math.round(Math.exp(rng.gauss(Math.log(90 * base), 0.8)) * (a > 50 ? 1.5 : 1)); };

  const genClan = () => {
    const last = surname(rng);
    const eAge = rng.int(58, 82);
    let elders, mother;
    if (rng.chance(0.62)) { elders = couple(eAge, Math.max(40, eAge - rng.int(0, 6)), last); mother = elders[1]; }
    else { const s = mkp({ sex: rng.chance(0.65) ? 'F' : 'M', age: eAge, lastName: last }); if (s.sex === 'F') s.maidenName = surname(rng); elders = [s]; mother = s.sex === 'F' ? s : null; }
    const eldHome = [...elders];
    const hhs = [];
    const n = rng.int(1, 3);
    const refAge = Math.min(...elders.map(ageInt));
    const kids = [];
    for (let i = 0; i < n; i++) {
      const age = Math.max(19, Math.min(58, refAge - rng.int(21, 34)));
      const sex = rng.chance(0.5) ? 'M' : 'F';
      const mom = elders.find((e) => e.sex === 'F') || null, dad = elders.find((e) => e.sex === 'M') || null;
      const c = mkp({ sex, age, lastName: last, mother: mom, father: dad });
      if (sex === 'F') c.maidenName = last;
      link(c, mom, dad); kids.push(c);
    }
    kids.forEach((a) => kids.forEach((b) => { if (a !== b) { (a.sibTmp = a.sibTmp || []).push(b.id); } }));
    let multigen = rng.chance(0.3);
    for (const c of kids) {
      if (ageInt(c) >= 22 && rng.chance(0.78)) {
        const spAge = Math.max(18, ageInt(c) + rng.int(-5, 5));
        const sp = mkp({ sex: c.sex === 'M' ? 'F' : 'M', age: spAge, lastName: surname(rng) });
        let husband = c.sex === 'M' ? c : sp, wife = c.sex === 'M' ? sp : c;
        wife.maidenName = wife === c ? last : sp.lastName; wife.lastName = husband.lastName;
        marry(husband, wife);
        const ks = ageInt(wife) >= 22 ? kidsOf(wife, husband, rng.int(0, ageInt(wife) < 30 ? 2 : 4)) : [];
        const members = [husband, wife, ...ks];
        if (multigen) { eldHome.push(...members); multigen = false; } else hhs.push(members);
      } else if (rng.chance(0.5)) eldHome.push(c); else hhs.push([c]);
    }
    const h0 = settle(eldHome, null);
    if (!h0) return;
    for (const m of hhs) settle(m, h0);
  };
  const genFamily = () => {
    const hAge = rng.int(22, 52), wAge = Math.max(20, hAge - rng.int(-3, 6));
    const [m, f] = couple(hAge, wAge, surname(rng));
    const ks = kidsOf(f, m, rng.int(0, 4));
    settle([m, f, ...ks], null);
  };
  const genCouple = () => { const a = rng.int(26, 70); const [m, f] = couple(a, Math.max(22, a - rng.int(-2, 6)), surname(rng)); settle([m, f], null); };
  const genSingle = () => { const p = mkp({ age: rng.int(19, 62) }); settle([p], null); };
  const genWidow = () => { const p = mkp({ age: rng.int(66, 88) }); settle([p], null); };
  const genSingleParent = () => {
    const mom = mkp({ sex: 'F', age: rng.int(25, 45) }); const dadAge = mom.birthTick;
    const dummy = { id: null, genes: null };
    const kids = []; let a = rng.int(2, 12);
    for (let i = 0; i < rng.int(1, 3) && a >= 0; i++) { const k = mkp({ age: a, lastName: mom.lastName, mother: mom }); link(k, mom, null); kids.push(k); a -= rng.int(1, 4); }
    settle([mom, ...kids], null);
  };
  const genRoommates = () => { const a = mkp({ age: rng.int(18, 28) }), b = mkp({ age: rng.int(18, 28) }); settle([a, b], null); };

  let guard = 0, clanPop = 0;
  while (all.length < target && freeHouses.size > 0 && guard++ < 500) {
    const r = rng.next();
    if (clanPop < target * 0.45 && r < 0.4) { const before = all.length; genClan(); clanPop += all.length - before; }
    else if (r < 0.62) genFamily(); else if (r < 0.72) genCouple(); else if (r < 0.8) genSingle();
    else if (r < 0.88) genWidow(); else if (r < 0.94) genSingleParent(); else genRoommates();
  }
  // settle() drops persons from `all` if no house; also drop people created but never settled
  const people = all.filter((p) => p.homeId !== null);
  // siblings
  for (const p of people) { const s = (p.siblingsTmp || []).concat(p.sibTmp || []); p.siblings = s; delete p.siblingsTmp; delete p.sibTmp; }
  for (const p of people) { p.family.siblingIds = p.siblings; delete p.siblings; }

  // money, job status by age
  for (const p of people) {
    const a = ageInt(p);
    wealth(p);
    p.job = a < 6 ? 'child' : a < 16 ? 'student' : a >= 65 && !(a < 72 && rng.chance(0.25)) ? 'retired' : 'unemployed';
    p.speed = a < 12 ? 5 : a > 65 ? 4 : 6;
    p.skills.charisma = Math.min(1, p.skills.charisma + p.genes.looks * 0.2);
  }
  // jobs
  const pool = people.filter((p) => p.job === 'unemployed');
  for (const p of pool) {
    const a = ageInt(p), mom = p.sex === 'F' && p.family.spouseId;
    if (mom && p.family.childrenIds.some((c) => { const k = people.find((x) => x.id === c); return k && ageInt(k) < 5; }) && rng.chance(0.6)) p.homemaker = true;
  }
  let cands = rng.shuffle(pool.filter((p) => !p.homemaker));
  const slots = [];
  for (const b of world.buildings.values()) b.jobs.forEach((j) => slots.push({ b, job: j }));
  slots.sort((x, y) => PRIORITY.indexOf(x.job) - PRIORITY.indexOf(y.job));
  for (const s of slots) {
    if (!cands.length) break;
    const fitk = JOB_FIT[s.job];
    let best = -1, bs = -1;
    for (let t = 0; t < 10 && t < cands.length; t++) {
      const c = cands[rng.int(0, cands.length - 1)];
      const sc = (fitk ? c.genes[fitk] : c.genes.vitality * 0.3 + 0.3) + rng.float(0, 0.3) + ((s.job === 'doctor' || s.job === 'mayor') ? Math.min(ageInt(c), 50) / 100 : 0);
      if (sc > bs) { bs = sc; best = c; }
    }
    if (best === -1 || ((s.job === 'doctor' || s.job === 'mayor' || s.job === 'teacher') && ageInt(best) < 24)) continue;
    cands = cands.filter((c) => c !== best);
    best.job = s.job; best.workId = s.b.id; s.b.employees.push(best.id);
    const J = JOBS[s.job]; if (J) best.skills[J.skill] = Math.min(1, 0.3 + rng.float(0, 0.4) + Math.min(0.25, Math.max(0, ageInt(best) - 18) * 0.01));
    if (!s.b.ownerId && !['school', 'clinic', 'townhall', 'jail', 'park', 'cemetery', 'temple'].includes(s.b.type)) s.b.ownerId = best.id;
  }
  // names
  const used = new Set();
  for (const b of world.buildings.values()) {
    if (b.type === 'house') {
      const res = b.residents.map((id) => world.people.get(id) || people.find((p) => p.id === id)).filter(Boolean);
      const head = res.sort((a, z) => a.birthTick - z.birthTick)[0];
      if (head) { b.name = `${head.lastName} House`; b.ownerId = head.id; }
      continue;
    }
    const owner = b.ownerId != null ? people.find((p) => p.id === b.ownerId) : null;
    b.name = businessName(rng, b.type, owner ? owner.lastName : null, used);
    if (b.type === 'market') b.inventory.food = 200;
    b.funds = 200;
  }
  // add to world
  for (const p of people) world.addPerson(p);
  // pre-existing relationships
  const rel = (a, b, o, tag) => {
    const r = world.getRel(a, b);
    r.familiarity = Math.max(r.familiarity, o.fam ?? 0.3); r.affinity = Math.max(-1, Math.min(1, o.aff ?? 0)); r.trust = o.trust ?? r.trust;
    if (o.respect !== undefined) r.respect = o.respect;
    if (tag && !r.tags.includes(tag)) r.tags.push(tag);
    return r;
  };
  const both = (a, b, o, tag) => { rel(a, b, { ...o, aff: (o.aff ?? 0) + rng.gauss(0, 0.07) }, tag); rel(b, a, { ...o, aff: (o.aff ?? 0) + rng.gauss(0, 0.07) }, tag); };
  const P = (id) => world.people.get(id);
  for (const p of people) {
    const f = p.family;
    if (f.spouseId) { const s = P(f.spouseId); both(p, s, { fam: 1, aff: 0.7, trust: 0.8 }, 'family'); rel(p, s, { fam: 1, aff: 0.7 }); p.romance.partnerId = s.id; world.getRel(p, s).attraction = 0.7; }
    for (const c of f.childrenIds) both(p, P(c), { fam: 1, aff: 0.65, trust: 0.75 }, 'family');
    for (const s of f.siblingIds || []) if (s > p.id) both(p, P(s), { fam: 0.95, aff: 0.45, trust: 0.6 }, 'family');
    // grandparents
    for (const c of f.childrenIds) for (const gc of P(c).family.childrenIds) both(p, P(gc), { fam: 0.8, aff: 0.5, trust: 0.6 }, 'family');
    // in-laws
    if (f.spouseId) { const s = P(f.spouseId); for (const par of [s.family.fatherId, s.family.motherId]) if (par && P(par)) both(p, P(par), { fam: 0.7, aff: 0.15 }, 'family'); }
  }
  // neighbours
  const hs = houses.filter((h) => h.residents.length);
  for (const h of hs) {
    const near = hs.filter((o) => o !== h && Math.abs(o.x - h.x) + Math.abs(o.y - h.y) < 20 && o.id > h.id);
    for (const o of near) for (const a of h.residents) for (const bId of o.residents) {
      if (rng.chance(0.5)) both(P(a), P(bId), { fam: 0.3 + rng.float(0, 0.3), aff: rng.gauss(0.1, 0.2) }, 'neighbor');
    }
  }
  // coworkers & schoolmates
  for (const b of world.buildings.values()) {
    const e = b.employees.map(P);
    for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) both(e[i], e[j], { fam: 0.5, aff: rng.gauss(0.1, 0.25) }, 'coworker');
  }
  const students = people.filter((p) => p.job === 'student');
  for (const s of students) for (let k = 0; k < 4; k++) { const o = rng.pick(students); if (o !== s && Math.abs(o.birthTick - s.birthTick) < 3 * T) both(s, o, { fam: 0.5, aff: rng.gauss(0.2, 0.25) }, 'schoolmate'); }
  // old friends and grudges
  const adults = people.filter((p) => ageInt(p) >= 17);
  for (let i = 0; i < Math.round(adults.length * 0.35); i++) {
    const a = rng.pick(adults), b = rng.pick(adults);
    if (a === b || a.family.spouseId === b.id) continue;
    both(a, b, { fam: 0.8, aff: rng.float(0.45, 0.9), trust: 0.65 }, 'friend');
    world.addMemory(a, { type: 'friendship', text: `Has been close friends with ${fullName(b)} for years.`, otherIds: [b.id], weight: 0.4, importance: 2, tick: -rng.int(2, 15) * T });
  }
  for (let i = 0; i < Math.round(adults.length * 0.05); i++) {
    const a = rng.pick(adults), b = rng.pick(adults);
    if (a === b || a.family.spouseId === b.id) continue;
    const why = rng.pick(['a boundary dispute', 'an unpaid debt', 'a slight at a festival', 'a broken promise', 'a scandalous rumour']);
    rel(a, b, { fam: 0.7, aff: -rng.float(0.4, 0.8), trust: 0.2, respect: -0.3 }, 'rival'); rel(b, a, { fam: 0.7, aff: -rng.float(0.3, 0.7), trust: 0.2 }, 'rival');
    world.addMemory(a, { type: 'grudge', text: `Fell out with ${fullName(b)} over ${why}.`, otherIds: [b.id], weight: -0.5, importance: 2, tick: -rng.int(1, 8) * T });
    world.addMemory(b, { type: 'grudge', text: `Fell out with ${fullName(a)} over ${why}.`, otherIds: [a.id], weight: -0.5, importance: 2, tick: -rng.int(1, 8) * T });
  }
  for (const p of people) {
    if (p.family.spouseId) world.addMemory(p, { type: 'marriage', text: `Married ${fullName(P(p.family.spouseId))}.`, otherIds: [p.family.spouseId], weight: 0.8, importance: 4, tick: p.romance.sinceTick });
  }
  return people;
}
