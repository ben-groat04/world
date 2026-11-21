// Person factory + initial population generation (families, clans, jobs, relationships).
import { TICKS_PER_YEAR } from './time.js';

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
    id: world.nextPersonId++, firstName: o.firstName || (sex === 'M' ? 'Sam' : 'Sam'), lastName: o.lastName || 'Doe', sex,
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
    currentAction: null, thought: '', lastAction: null, cooldown: {}, nextThink: 0, wake: 0, lastMeal: -rng.int(6, 40), starve: 0, workedTicks: 0, cell: -1, needsTick: world.tick - (world.nextPersonId % 6), seg: [], segTick: -1, speed: 6,
    schedule: { wake, bed, offDay: rng.int(0, 5) }, ext: {}, bubble: null,
    // fields that systems add lazily; declared here (undefined) so every Person has ONE stable hidden class (big V8 speedup)
    _talkCount: undefined, _lastTalk: undefined, _thoughtTick: undefined, _nextTalk: undefined, cliqueId: undefined, _hang: undefined, _pregRumor: undefined,
    debt: undefined, creditorId: undefined, maidenName: undefined, lastWorkId: undefined, graveId: undefined, widowed: undefined, homemaker: undefined,
    emigrated: undefined, emigratedTick: undefined, emigratedTo: undefined, _speechPending: undefined, _visitFriendId: undefined, drunk: undefined, _dyingOfMother: undefined, _playerNotified: undefined, _nm: undefined,
  };
  return p;
}
