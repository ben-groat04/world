// Person facts adapter: reads whatever the population/economy/health systems expose (legacy fields or W1 fields) defensively, and answers the `who` predicates of goal templates.
// Anything the world does not know is a stable LATENT (hash of person id + key) with a plausible prevalence, so the engine works on any world and stays deterministic.
import { hash32 } from '../kernel/rng.js';
import { clamp } from './util.js';
const NOT_EMPLOYED = new Set(['child', 'student', 'retired', 'unemployed', 'none', null, undefined, '']);
export const latent = (world, id, key, prev) => (hash32(world.seed, 'lat', id, key) % 10000) / 10000 < prev;
const z = (x) => clamp((x - 0.5) * 4, -2, 2);
export const personalityZ = (p) => { const q = p.personality || p.traits5 || {}; return { O: z(q.openness ?? 0.5), C: z(q.conscientiousness ?? 0.5), E: z(q.extraversion ?? 0.5), A: z(q.agreeableness ?? 0.5), N: z(q.neuroticism ?? 0.5) }; };
export const segmentOf = (p) => p.segment || p.ext?.pop?.seg || p.ext?.pop?.segment || p.ext?.segment || p.lifestyle || null;
export const tieStrength = (r) => (r ? (r.familiarity || 0) * (0.35 + Math.max(r.affinity || 0, 0) * 0.65 + (r.trust || 0) * 0.2) : 0);
const has = (arr, x) => Array.isArray(arr) && arr.includes(x);

/** Compute facts for one person (cheap: a single pass over their ties). */
export function computeFacts(world, p, cfg) {
  const id = p.id, age = world.ageOf(p), ms = cfg.moneyScale;
  const f = { id, age, sex: p.sex, z: personalityZ(p), seg: segmentOf(p) };
  f.adult = age >= 18; f.working_age = age >= 18 && age < 66;
  const pop = p.ext?.pop; const act = pop?.activity; const job = act ? (act === 'employed' ? 'employed' : act === 'home_family' || act === 'sick_disabled' || act === 'other_inactive' ? 'none' : act) : (p.job ?? p.employment?.status ?? null);
  f.student = job === 'student' || p.stage === 'student' || (age >= 16 && age < 23 && has(p.tags, 'student'));
  f.retired = job === 'retired' || age >= 67; f.employed = !NOT_EMPLOYED.has(job) && !f.retired;
  f.money = world.ledger.balance(id); f.debt = Math.max(p.debt || 0, pop?.fin?.debt || 0, f.money < 0 ? -f.money : 0);
  f.richness = clamp(Math.log10(Math.max(f.money / ms, 10)) / 4, 0, 1);       // 0 broke .. 1 loaded (log scale)
  f.low_income = f.richness < 0.5;
  const fam = p.family || {};
  f.partnerId = p.romance?.partnerId ?? p.partnerId ?? fam.spouseId ?? null; f.partnered = f.partnerId != null;
  f.partnerSince = p.romance?.sinceTick ?? null;
  f.engaged = p.romance?.status === 'engaged';
  const kids = fam.childrenIds || [];
  let youngest = 99, schoolAge = false, kidsAlive = 0;
  for (let i = 0; i < kids.length; i++) { const c = world.people.get(kids[i]); if (c && c.alive) { kidsAlive++; const ca = world.ageOf(c); if (ca < youngest) youngest = ca; if (ca >= 4 && ca < 16) schoolAge = true; } }
  f.kids = kidsAlive; f.youngestKid = youngest; f.parent_under_5 = youngest < 5; f.parent_school_age = schoolAge;
  f.new_parent = youngest < 1.5;
  let elderlyParent = false; const pa = [fam.motherId, fam.fatherId];
  for (let i = 0; i < 2; i++) if (pa[i] != null) { const q = world.people.get(pa[i]); if (q && q.alive && world.ageOf(q) > 68) elderlyParent = true; }
  f.has_elderly_parent = elderlyParent || (f.age >= 40 && f.age < 70 && latent(world, id, 'oldparent', 0.18));
  f.lives_with_parents_adult = f.adult && age < 32 && pa.some((x) => { const q = x != null ? world.people.get(x) : null; return q && q.alive && q.homeId === p.homeId && p.homeId != null; });
  f.health = p.health ?? 1; f.illness = !!p.illness;
  f.has_condition = f.illness || f.health < 0.75 || (age > 40 && latent(world, id, 'condition', 0.2 + (age - 40) * 0.006));
  f.religious = has(p.traits, 'pious') || !!p.religion || (pop?.religiosity ?? 0) > 0.5 || latent(world, id, 'faith', 0.22);
  f.has_pet = (p.pets && p.pets.length > 0) || (pop?.pets && (pop.pets.length > 0 || pop.pets > 0)) || latent(world, id, 'pet', 0.24);
  // ties (single pass)
  let n3 = 0, close = 0, estranged = null, bestE = 0.35, recentEx = false, neighbours = 0;
  const rel = p.relationships;
  if (rel) for (const [oid, r] of rel) {
    if ((r.familiarity || 0) > 0.3) n3++;
    if ((r.familiarity || 0) > 0.5 && (r.affinity || 0) > 0.35) close++;
    if (r.tags && r.tags.length) { if (r.tags.includes('neighbour')) neighbours++; if (r.tags.includes('ex')) { const q = world.people.get(oid); if (q && q.alive) recentEx = r.lastTick > world.tick - 112 * 144 * 1.5 || recentEx; } }
    if ((r.familiarity || 0) > 0.45 && (r.affinity || 0) < -0.3 && -(r.affinity) > bestE) { const q = world.people.get(oid); if (q && q.alive) { estranged = oid; bestE = -(r.affinity); } }
  }
  f.ties = n3; f.closeTies = close; f.estrangedId = estranged; f.neighbours = neighbours;
  f.few_local_ties = n3 < 5; f.has_friends = close >= 1 || n3 >= 3;
  f.knows_neighbours = neighbours >= 1 || n3 >= 4;
  f.recent_breakup = recentEx || latent(world, id, 'breakup', f.partnered ? 0 : 0.03);
  f.single = !f.partnered && f.adult; f.tenure = p.tenure || p.housing?.tenure || (pop && world.lf ? world.lf.households[pop.hh]?.tenure : null) || null;
  f.renter = f.tenure ? f.tenure !== 'owner' && f.tenure !== 'owned' : !latent(world, id, 'owner', 0.3 + clamp((age - 30) * 0.012, 0, 0.4));
  f.sharer = f.renter && (f.age < 40) && !f.partnered && f.kids === 0 && !f.lives_with_parents_adult && latent(world, id, 'sharer', 0.4);
  f.musical = latent(world, id, 'musical', 0.12 + (f.z.O > 0.3 ? 0.1 : 0) + (f.age < 35 ? 0.06 : 0));
  f.creative = f.z.O > 0.4 || latent(world, id, 'creative', 0.06);
  f.licence = latent(world, id, 'licence', age < 20 ? 0.15 : age < 30 ? 0.65 : age < 65 ? 0.78 : 0.6);
  f.engaged_citizen = f.adult && (f.z.A > -0.2) && (f.z.E > -0.5) && latent(world, id, 'engaged', 0.28 + (f.age > 35 ? 0.1 : 0) + (f.z.O > 0.5 ? 0.06 : 0));
  f.skilled = latent(world, id, 'skill', 0.3) || f.z.O > 0.7;
  f.garden = latent(world, id, 'garden', 0.35 + (f.renter ? -0.1 : 0.2));
  f.status_pending = f.seg === 'recent_arrivals' && latent(world, id, 'status', 0.2);
  f.limited_english = f.seg === 'recent_arrivals' && latent(world, id, 'english', 0.3);
  f.eligible_unclaimed = f.low_income && latent(world, id, 'unclaimed', 0.25);
  f.mobile = f.seg === 'students' || f.seg === 'young_sharers' || f.seg === 'early_career' || f.seg === 'recent_arrivals' || (f.age < 35 && f.renter);
  f.noise = latent(world, id, 'noise', f.renter ? 0.07 : 0.03);
  f.has_habit = latent(world, id, 'habit', 0.22);
  f.bereaved = false; f.has_family_elsewhere = latent(world, id, 'famaway', 0.55);
  return f;
}
// who: predicate key -> (f, ps) => bool. Unknown keys fall through to `adult` (and are listed by tests so content stays honest).
export const WHO = {
  adult: (f) => f.adult, student: (f) => f.student, working_age: (f) => f.working_age, employed: (f) => f.employed, adult_under_55: (f) => f.adult && f.age < 55, adult_under_60: (f) => f.adult && f.age < 60, under_45: (f) => f.age >= 16 && f.age < 45,
  working_age_not_employed: (f) => f.working_age && !f.employed && !f.student, working_age_skilled: (f) => f.working_age && f.employed && f.skilled, employed_low_income: (f) => f.employed && f.low_income, employed_office: (f) => f.employed && f.richness > 0.45 && f.age > 22,
  in_debt: (f) => f.debt > 0, positive_surplus: (f) => f.employed && f.richness > 0.4, eligible_unclaimed: (f) => f.eligible_unclaimed, severe_money_pressure: (f) => f.debt > 0 || f.richness < 0.15,
  has_condition: (f) => f.has_condition, has_family_elsewhere: (f) => f.has_family_elsewhere, has_friends: (f) => f.has_friends, religious: (f) => f.religious, parent_primary: (f) => f.kids > 0 && f.youngestKid < 12, has_pet: (f) => f.has_pet, adult_no_pet: (f) => f.adult && !f.has_pet,
  renter: (f) => f.adult && f.renter, tenant: (f) => f.adult && f.renter, renter_stable_income: (f) => f.renter && f.employed && f.richness > 0.4, lives_with_parents_adult: (f) => f.lives_with_parents_adult, sharer: (f) => f.sharer,
  older_or_disabled: (f) => f.age > 70 || f.health < 0.6, neighbour_noise: (f) => f.noise, few_local_ties: (f) => f.adult && f.few_local_ties, single_adult_under_55: (f) => f.single && f.age < 55, interested_in_known_person: (f) => f.single && f.ties > 3,
  couple_2yr_separate: (f) => f.partnered && !f.engaged, partnered_25_42: (f) => f.partnered && f.age >= 25 && f.age < 43, partnered_new: (f) => f.partnered, partnered_unhappy: (f) => f.partnered && f.z.N > 0.3, engaged_couple: (f) => f.engaged,
  parent_under_5: (f) => f.parent_under_5, new_parent: (f) => f.new_parent, parent_school_age: (f) => f.parent_school_age, has_elderly_parent: (f) => f.has_elderly_parent,
  has_habit: (f) => f.has_habit, struggling: (f) => f.adult && (f.z.N > 0.2 || f.richness < 0.3), engaged_adult: (f) => f.engaged_citizen, knows_neighbours: (f) => f.knows_neighbours, mobile_segment: (f) => f.mobile, adult_with_leave: (f) => f.adult && !f.retired || f.retired,
  age_55_plus: (f) => f.age >= 55, age_40_plus: (f) => f.age >= 40, age_60_plus_employed: (f) => f.age >= 60 && f.employed, age_35_plus_settled: (f) => f.age >= 35 && f.richness > 0.4, bereaved: (f) => f.bereaved, status_pending: (f) => f.status_pending, recent_arrival_limited_english: (f) => f.limited_english,
  no_licence_adult: (f) => f.adult && f.age < 60 && !f.licence, musical_young: (f) => f.age >= 15 && f.age < 40 && f.musical, creative: (f) => f.adult && f.creative, skilled_adult: (f) => f.adult && f.skilled, has_garden_space: (f) => f.adult && f.garden,
  estranged_tie: (f) => f.estrangedId != null, recent_breakup: (f) => f.recent_breakup, has_grievance: (f, ps, c) => c.pressure('grievance') > 0.25, has_strong_grievance: (f, ps, c) => c.pressure('grievance') > 0.6 && f.z.A < 0.5,
  knows_secret_grievance: (f, ps, c) => c.pressure('grievance') > 0.55 && f.ties > 5, employed_grievance: (f, ps, c) => f.employed && c.pressure('grievance') > 0.45,
  group_member_ambitious: (f, ps) => ps.groups.length > 0 && f.z.E > 0 && f.age > 18,
};
export const KNOWN_WHO = new Set(Object.keys(WHO));
