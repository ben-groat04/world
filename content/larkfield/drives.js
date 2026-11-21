// Drive definitions for Larkfield (seed data for sim/goals). DATA ONLY.
// weights: per-person drive weight = clamp(base + sum(trait loadings * z-scored trait) + lifeStage shift + segment shift + noise(sd)). Traits are Big Five z-scores (-2..2): O C E A N.
// pressure: which world queries raise the drive's pressure (computed lazily on events, not polled). decay: half-life (days) of an unsatisfied pressure spike.
export const DRIVES = [
  { id: 'money_security', label: 'Money / security', base: 0.6, sd: 0.15, traits: { N: 0.12, C: 0.06 }, pressure: ['debt', 'arrears', 'low_buffer', 'job_insecurity', 'rent_rise', 'energy_bill'], satisfiedBy: ['buffer_months', 'steady_income'], halfLifeDays: 45 },
  { id: 'housing_stability', label: 'Housing stability / space', base: 0.5, sd: 0.15, traits: { N: 0.08 }, pressure: ['overcrowding', 'lease_end', 'landlord_sale', 'damp_repairs', 'noise_neighbours', 'unsafe_area'], satisfiedBy: ['secure_tenure', 'enough_bedrooms'], halfLifeDays: 90 },
  { id: 'belonging', label: 'Belonging / friendship', base: 0.5, sd: 0.15, traits: { E: 0.12, A: 0.08 }, pressure: ['loneliness', 'new_arrival', 'friend_left', 'bereavement'], satisfiedBy: ['regular_contact', 'groups'], halfLifeDays: 30 },
  { id: 'intimacy', label: 'Partner / family intimacy', base: 0.45, sd: 0.2, traits: { E: 0.06, A: 0.06, N: 0.05 }, lifeStage: { '18-24': 0.1, '25-34': 0.15, '35-49': 0.0, '50-64': -0.1, '65+': -0.15 }, pressure: ['single', 'breakup', 'wants_children', 'distance_from_partner'], satisfiedBy: ['partnered', 'family_close'], halfLifeDays: 120 },
  { id: 'status_achievement', label: 'Achievement / career / status', base: 0.45, sd: 0.2, traits: { C: 0.12, O: 0.05, E: 0.05 }, lifeStage: { '18-24': 0.1, '25-34': 0.15, '50-64': -0.1, '65+': -0.25 }, pressure: ['passed_over', 'stagnation', 'peer_promotion'], satisfiedBy: ['promotion', 'qualification', 'recognition'], halfLifeDays: 90 },
  { id: 'autonomy', label: 'Autonomy / control', base: 0.4, sd: 0.15, traits: { O: 0.08, A: -0.05 }, pressure: ['micromanaged', 'zero_hours', 'dependent_on_landlord', 'caring_burden'], satisfiedBy: ['own_business', 'flexible_hours', 'owned_home'], halfLifeDays: 90 },
  { id: 'health', label: 'Health / fitness / body', base: 0.45, sd: 0.15, traits: { C: 0.08, N: 0.06 }, lifeStage: { '50-64': 0.15, '65+': 0.25 }, pressure: ['illness', 'weight', 'pain', 'scare', 'poor_sleep', 'smoking'], satisfiedBy: ['fit', 'managed_condition'], halfLifeDays: 60 },
  { id: 'care_meaning', label: 'Care for others / meaning', base: 0.5, sd: 0.2, traits: { A: 0.15, O: 0.04 }, pressure: ['parent_needs_help', 'child_struggling', 'neighbour_need', 'community_problem', 'faith_duty'], satisfiedBy: ['helping', 'volunteering', 'worship'], halfLifeDays: 60 },
  { id: 'novelty', label: 'Novelty / fun / adventure', base: 0.4, sd: 0.2, traits: { O: 0.15, E: 0.07 }, lifeStage: { '18-24': 0.25, '25-34': 0.12, '50-64': -0.1, '65+': -0.15 }, pressure: ['boredom', 'routine_fatigue', 'friends_going_out'], satisfiedBy: ['night_out', 'trip', 'new_experience'], halfLifeDays: 14 },
  { id: 'rest', label: 'Rest / recovery / comfort', base: 0.5, sd: 0.15, traits: { N: 0.08, C: -0.04 }, lifeStage: { '35-49': 0.1, '65+': 0.1 }, pressure: ['fatigue', 'overwork', 'night_shifts', 'young_children', 'burnout'], satisfiedBy: ['sleep', 'downtime'], halfLifeDays: 7 },
];
// Segment shifts: additive adjustments to base weights (segments.js ids), reflecting circumstance rather than identity.
export const SEGMENT_SHIFTS = {
  older_longterm: { belonging: 0.1, health: 0.15, money_security: 0.0, novelty: -0.15 },
  family_couples: { money_security: 0.1, housing_stability: 0.15, care_meaning: 0.15, rest: 0.15 },
  lone_parents: { money_security: 0.25, housing_stability: 0.2, care_meaning: 0.15, rest: 0.2, autonomy: -0.05 },
  students: { novelty: 0.15, belonging: 0.1, money_security: 0.05, status_achievement: 0.1 },
  young_sharers: { novelty: 0.1, intimacy: 0.1, housing_stability: 0.1, autonomy: 0.1 },
  early_career: { status_achievement: 0.15, intimacy: 0.1, housing_stability: 0.1 },
  settled_professionals: { status_achievement: 0.05, money_security: -0.15, care_meaning: 0.05 },
  shift_workers: { rest: 0.25, money_security: 0.15, health: 0.05 },
  recent_arrivals: { money_security: 0.15, belonging: 0.2, housing_stability: 0.15, status_achievement: 0.1 },
  local_business_families: { money_security: 0.1, status_achievement: 0.1, autonomy: 0.15, rest: 0.1 },
  benefit_dependent: { money_security: 0.25, health: 0.2, belonging: 0.1, status_achievement: -0.15, autonomy: 0.05 },
};


// ---- Pressures: situational states that boost goal generation. Computed LAZILY at goal scans from (a) the person's recent events (type/tag -> pressure, below), (b) cheap state queries (facts.js).
// halfLife in days (real days; the engine rescales to sim days). `drives`: which drives the pressure feeds. Values 0..1 per person.
export const PRESSURES = {
  debt: { drives: ['money_security'], halfLife: 90 }, arrears: { drives: ['money_security', 'housing_stability'], halfLife: 60 }, low_buffer: { drives: ['money_security'], halfLife: 60 },
  job_insecurity: { drives: ['money_security', 'status_achievement'], halfLife: 120 }, rent_rise: { drives: ['money_security', 'housing_stability'], halfLife: 90 }, energy_bill: { drives: ['money_security'], halfLife: 45 },
  overcrowding: { drives: ['housing_stability'], halfLife: 180 }, lease_end: { drives: ['housing_stability'], halfLife: 45 }, landlord_sale: { drives: ['housing_stability'], halfLife: 60 }, damp_repairs: { drives: ['housing_stability', 'health'], halfLife: 90 },
  noise_neighbours: { drives: ['housing_stability', 'rest'], halfLife: 60 }, unsafe_area: { drives: ['housing_stability', 'money_security'], halfLife: 120 },
  loneliness: { drives: ['belonging'], halfLife: 45 }, new_arrival: { drives: ['belonging'], halfLife: 120 }, friend_left: { drives: ['belonging'], halfLife: 60 }, bereavement: { drives: ['belonging', 'care_meaning'], halfLife: 150 },
  single: { drives: ['intimacy'], halfLife: 365 }, breakup: { drives: ['intimacy', 'belonging'], halfLife: 120 }, wants_children: { drives: ['intimacy'], halfLife: 365 }, distance_from_partner: { drives: ['intimacy'], halfLife: 90 },
  passed_over: { drives: ['status_achievement'], halfLife: 150 }, stagnation: { drives: ['status_achievement', 'novelty'], halfLife: 200 }, peer_promotion: { drives: ['status_achievement'], halfLife: 100 },
  micromanaged: { drives: ['autonomy'], halfLife: 120 }, zero_hours: { drives: ['autonomy', 'money_security'], halfLife: 120 }, caring_burden: { drives: ['autonomy', 'rest', 'care_meaning'], halfLife: 150 },
  illness: { drives: ['health'], halfLife: 60 }, weight: { drives: ['health'], halfLife: 200 }, pain: { drives: ['health'], halfLife: 60 }, scare: { drives: ['health'], halfLife: 120 }, poor_sleep: { drives: ['health', 'rest'], halfLife: 30 }, smoking: { drives: ['health'], halfLife: 300 },
  parent_needs_help: { drives: ['care_meaning'], halfLife: 120 }, child_struggling: { drives: ['care_meaning'], halfLife: 60 }, neighbour_need: { drives: ['care_meaning'], halfLife: 21 }, community_problem: { drives: ['care_meaning', 'housing_stability'], halfLife: 90 }, faith_duty: { drives: ['care_meaning'], halfLife: 120 },
  boredom: { drives: ['novelty'], halfLife: 30 }, routine_fatigue: { drives: ['novelty'], halfLife: 60 }, friends_going_out: { drives: ['novelty', 'belonging'], halfLife: 14 },
  fatigue: { drives: ['rest'], halfLife: 7 }, overwork: { drives: ['rest', 'health'], halfLife: 45 }, night_shifts: { drives: ['rest'], halfLife: 60 }, burnout: { drives: ['rest', 'health'], halfLife: 120 }, new_baby: { drives: ['rest', 'care_meaning', 'money_security'], halfLife: 200 },
  grievance: { drives: ['autonomy', 'care_meaning'], halfLife: 240 },   // a wrong done to the person: THE driver of the dramatic goals (revenge, expose, confront)
  envy: { drives: ['status_achievement'], halfLife: 120 }, ageing: { drives: ['health', 'care_meaning'], halfLife: 365 }, windfall: { drives: ['novelty', 'autonomy'], halfLife: 60 }, inspiration: { drives: ['novelty', 'status_achievement'], halfLife: 45 },
};
// Event -> pressure. Matched against event type OR tag (events are read lazily from world.events by actor at scan time). amount 0..1. who: 'self' = actors[0]; 'others' = every other actor; 'all'.
export const PRESSURE_EVENTS = [
  { m: ['work.fired', 'work.redundant', 'jobChange.lost', 'tag:redundancy'], to: { job_insecurity: 0.9, low_buffer: 0.5 }, who: 'self' },
  { m: ['money.debt', 'tag:debt', 'bankruptcy'], to: { debt: 0.8, low_buffer: 0.6 }, who: 'self' },
  { m: ['home.rent_rise'], to: { rent_rise: 0.8 }, who: 'self' }, { m: ['home.eviction', 'tag:notice'], to: { lease_end: 1, landlord_sale: 0.5, arrears: 0.3 }, who: 'self' },
  { m: ['home.flatmate_leave'], to: { lease_end: 0.4, loneliness: 0.3 }, who: 'self' }, { m: ['life.move_in', 'immigrate'], to: { new_arrival: 0.9 }, who: 'self' },
  { m: ['life.breakup', 'life.divorce', 'breakup', 'divorce'], to: { breakup: 0.9, loneliness: 0.4, single: 0.4 }, who: 'all' },
  { m: ['life.birth', 'birth'], to: { new_baby: 0.9, fatigue: 0.5, wants_children: -0.5 }, who: 'self' },
  { m: ['life.death', 'death'], to: { bereavement: 0.9, loneliness: 0.3 }, who: 'others' },
  { m: ['health.diagnosis', 'health.crisis', 'tag:illness', 'outbreak'], to: { scare: 0.7, illness: 0.8 }, who: 'self' },
  { m: ['crime.burglary', 'crime.bike_theft', 'crime.assault', 'crime.antisocial', 'crime'], to: { unsafe_area: 0.6, community_problem: 0.5 }, who: 'others' },
  { m: ['social.fallout', 'social.betray', 'social.insult', 'scandal', 'tag:harm', 'tag:conflict'], to: { grievance: 0.55 }, who: 'others' },
  { m: ['work.passed_over', 'tag:passed_over'], to: { passed_over: 0.8, grievance: 0.3 }, who: 'self' }, { m: ['work.promoted', 'work.hired'], to: { peer_promotion: 0.5, envy: 0.4 }, who: 'others' },
  { m: ['biz.close', 'tag:closure'], to: { community_problem: 0.6, job_insecurity: 0.3 }, who: 'all' }, { m: ['money.windfall', 'tag:windfall'], to: { windfall: 0.8 }, who: 'self' },
  { m: ['civic.complaint', 'tag:community_problem'], to: { community_problem: 0.4 }, who: 'all' }, { m: ['social.rumour', 'tag:gossip'], to: { grievance: 0.25 }, who: 'others' },
];
// Self-model: ~12 belief-weights per person in 0..1 (0.5 = neutral). Updated by biased credit assignment on salient outcomes (own and observed). They bias METHOD choice (moves carry a `belief` key)
// and goal choice (templates carry `bias`: {belief: +-w}). prior: personality/segment loadings (z-scored Big Five O C E A N) so people start different; drift is cohort-wide via transmission from parents/ties.
export const SELF_BELIEFS = {
  effort_pays: { label: 'effort pays off', prior: { C: 0.08, N: -0.05 }, start: 0.55 },
  people_trustworthy: { label: 'people can be trusted', prior: { A: 0.08, N: -0.06 }, start: 0.5 },
  asking_works: { label: 'asking for help works', prior: { E: 0.07, A: 0.03, N: -0.05 }, start: 0.5 },
  institutions_help: { label: 'the council and services help', prior: { A: 0.03 }, start: 0.45, seg: { benefit_dependent: -0.08, older_longterm: 0.05, recent_arrivals: -0.05 } },
  landlords_exploit: { label: 'landlords exploit tenants', prior: { N: 0.03 }, start: 0.5, seg: { students: 0.08, young_sharers: 0.08, settled_professionals: -0.1, local_business_families: -0.1 } },
  luck_decides: { label: 'luck decides things', prior: { C: -0.06, N: 0.05 }, start: 0.45 },
  city_dangerous: { label: 'the city is dangerous', prior: { N: 0.06, O: -0.05 }, start: 0.4, seg: { older_longterm: 0.08 } },
  community_works: { label: 'neighbours can organise things', prior: { E: 0.04, A: 0.05, O: 0.03 }, start: 0.45, seg: { older_longterm: 0.08, students: -0.08 } },
  planning_works: { label: 'planning beats winging it', prior: { C: 0.1 }, start: 0.5 },
  risk_pays: { label: 'taking a risk pays', prior: { O: 0.08, N: -0.06, C: -0.02 }, start: 0.4 },
  money_matters: { label: 'money is what counts', prior: { N: 0.04, A: -0.04 }, start: 0.5, seg: { benefit_dependent: 0.08, lone_parents: 0.06 } },
  family_first: { label: 'family comes first', prior: { A: 0.04 }, start: 0.55, seg: { family_couples: 0.08, lone_parents: 0.08, students: -0.08, early_career: -0.05 } },
};
// Scarcity: stressed people plan shorter, discount more. horizon multiplier on plan length and weight on immediate (cheap) methods.
export const SCARCITY = { stressPressures: ['debt', 'arrears', 'low_buffer', 'burnout', 'fatigue', 'new_baby'], horizonMult: 0.55, cheapBias: 0.5, maxActiveGoals: [3, 7] };
export default { DRIVES, SEGMENT_SHIFTS, PRESSURES, PRESSURE_EVENTS, SELF_BELIEFS, SCARCITY };
