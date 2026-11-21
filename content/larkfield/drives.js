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
export default { DRIVES, SEGMENT_SHIFTS };
