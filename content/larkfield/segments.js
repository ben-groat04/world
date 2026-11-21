// Lifestyle segments + household archetypes for Larkfield (ROADMAP addendum). DATA + one pure helper (IPF) so the founding generator can draw
// household composition (calibration) x segment (this file) jointly. Averages describe a neighbourhood, not a life: every segment has its own routine,
// mobility, money pressure and SOCIAL GEOGRAPHY (share of ties that live on-map vs in the off-map city / elsewhere).
// Shares are of HOUSEHOLDS (sum 1). Targets that must hold in aggregate come from calibration (composition, tenure, mobility, activity); see validatePack in index.js.
import CAL from '../../sim/data/calibration.js';

/** Calibration household-composition label -> archetype (member templates for the founding generator). Shares are read from calibration at load. */
const HC = CAL.householdComposition.composite;
const A = (id, key, o) => ({ id, calibrationKey: key, share: HC[key], ...o });
export const HOUSEHOLD_ARCHETYPES = [
  A('one_person_66plus', 'One person aged 66+', { adults: [{ age: [66, 95] }], kids: 0, notes: 'mostly widowed women; owner-outright or social rent' }),
  A('one_person_u66', 'One person under 66', { adults: [{ age: [18, 65] }], kids: 0 }),
  A('married_no_kids', 'Married/civil partner couple, no children', { adults: [{ age: [24, 80] }, { age: [24, 80], partnerOf: 0, ageGap: [-6, 6] }], kids: 0, includesNeverHadKids: 0.45 }),
  A('married_dep_kids', 'Married couple, dependent children', { adults: [{ age: [25, 55] }, { age: [24, 55], partnerOf: 0, ageGap: [-6, 6] }], kids: [1, 4], kidAges: [0, 17] }),
  A('married_nondep', 'Married couple, all children non-dependent', { adults: [{ age: [45, 75] }, { age: [44, 75], partnerOf: 0 }], kids: [1, 3], kidAges: [18, 34] }),
  A('cohab_no_kids', 'Cohabiting couple, no children', { adults: [{ age: [20, 60] }, { age: [20, 60], partnerOf: 0, ageGap: [-6, 6] }], kids: 0 }),
  A('cohab_dep_kids', 'Cohabiting couple, dependent children', { adults: [{ age: [22, 50] }, { age: [22, 50], partnerOf: 0 }], kids: [1, 3], kidAges: [0, 14] }),
  A('cohab_nondep', 'Cohabiting couple, non-dependent children', { adults: [{ age: [42, 65] }, { age: [42, 65], partnerOf: 0 }], kids: [1, 2], kidAges: [18, 30] }),
  A('lone_parent_dep', 'Lone parent, dependent children', { adults: [{ age: [20, 50], sexBias: { F: 0.86 } }], kids: [1, 3], kidAges: [0, 17] }),
  A('lone_parent_nondep', 'Lone parent, non-dependent children', { adults: [{ age: [42, 75], sexBias: { F: 0.8 } }], kids: [1, 2], kidAges: [18, 38] }),
  A('couple_66plus', 'Couple/other single-family aged 66+ (all 66+)', { adults: [{ age: [66, 90] }, { age: [64, 90], partnerOf: 0 }], kids: 0 }),
  A('other_single_family', 'Other single family', { adults: [{ age: [30, 80] }], kids: [0, 2], notes: 'adult children + parent, sibling pairs, grandparent + grandchild, adult carer' }),
  A('multi_family_dep_kids', 'Other households with dependent children (multi-family/sharers)', { adults: [{ age: [22, 60] }, { age: [22, 60] }], kids: [1, 4], notes: 'multi-generation or two families; overcrowding risk' }),
  A('sharers_students_multigen', 'Other: sharers, all full-time students, multigen etc', { adults: [{ age: [18, 40] }, { age: [18, 40] }, { age: [18, 40] }], kids: 0, sizeDist: { 2: 0.3, 3: 0.3, 4: 0.22, 5: 0.12, 6: 0.06 }, notes: 'HMOs, student houses, friend groups' }),
];

const T = (blocks) => blocks.map(([from, to, act, where, p = 1]) => ({ from, to, act, where, p }));
/** Weekly venue-visit propensities: expected visits per week to each venue template category/id (for the segment's typical member; individual draws vary). */
const V = (o) => o;

/** Segment definitions. `routine` = time-use template (hours, local clock) the routine layer personalises; `where`: home|work|venue:<id>|offmap:<dest>|street|park. */
export const SEGMENTS = [
  {
    id: 'older_longterm', label: 'Long-term older residents', householdShare: 0.15,
    blurb: 'Retired or near-retired; 20-50 years in the area; social-rented or owned-outright; know the shopkeepers; the street is their world.',
    head: { age: [58, 95], activity: { retired: 0.72, employed: 0.1, longTermSickDisabled: 0.12, lookingAfterHomeFamily: 0.03, otherInactive: 0.03 } },
    tenure: { owned_outright: 0.5, council: 0.24, housing_assoc: 0.14, private_rent: 0.04, mortgage: 0.07, shared_ownership: 0.01 },
    originBornUK: 0.74, yearsInArea: { median: 28, p10: 8, p90: 55 },
    mobility: { annualMoveProb: 0.035, moveReasons: { downsize_or_care: 0.4, bereavement: 0.25, health: 0.25, family_nearby: 0.1 }, car: 0.4, bus: 0.55, bike: 0.02, walkMinutesPerDay: 60, offMapTripsPerWeek: 1.5 },
    money: { pressure: 0.45, savingsMonthsMedian: 8, debtProb: 0.1, arrearsProb: 0.03, incomeBand: [11000, 21000, 42000], statePension: true, energyAnxiety: 0.5, cashUse: 0.5 },
    social: { onMapShare: { closeFriends: 0.7, family: 0.2, workFriends: 0.05, acquaintances: 0.9 }, offMapMeetupsPerMonth: 1.5, messagesPerDay: 4, neighbourChat: 0.95, trustNeighbours: 0.5, clubs: ['church_or_mosque', 'community_centre', 'bingo_lunch_club', 'allotment', 'library'] },
    venues: V({ corner_shop: 4, cafe: 1.5, pub: 0.7, library: 0.5, gp_surgery: 0.35, pharmacy: 0.8, church_or_mosque: 1.2, community_centre: 1.2, park: 3, small_supermarket: 2 }),
    health: { limitingLongTerm: 0.35, lonelinessOften: 0.12 },
    routine: { weekday: T([[7, 8, 'wake_breakfast', 'home'], [8.5, 10, 'errands', 'street', 0.6], [10, 12, 'cafe_or_club', 'venue:cafe', 0.4], [12, 13.5, 'lunch', 'home'], [14, 16, 'tv_nap_garden', 'home'], [16, 17.5, 'shop_and_walk', 'street', 0.6], [18, 19, 'cook_eat', 'home'], [19, 22, 'tv_radio_phone', 'home'], [22, 23, 'bed', 'home']]), saturday: T([[8, 9, 'wake_breakfast', 'home'], [10, 12, 'shop_high_street', 'street'], [14, 16, 'family_call_or_visit', 'home', 0.7]]), sunday: T([[9, 11, 'worship_or_paper', 'venue:church', 0.45], [12, 15, 'family_lunch', 'home', 0.6], [15, 17, 'rest', 'home']]) },
  },
  {
    id: 'family_couples', label: 'Established families (couples with children)', householdShare: 0.16,
    blurb: 'Two parents, dependent children, school-run logistics; the primary school gate is the main local social space; often two incomes, one part-time.',
    head: { age: [28, 52], activity: { employed: 0.82, lookingAfterHomeFamily: 0.1, longTermSickDisabled: 0.03, unemployed: 0.03, student: 0.02 } },
    tenure: { owned_outright: 0.07, mortgage: 0.36, shared_ownership: 0.02, council: 0.15, housing_assoc: 0.12, private_rent: 0.28 },
    originBornUK: 0.62, yearsInArea: { median: 8, p10: 2, p90: 22 },
    mobility: { annualMoveProb: 0.09, moveReasons: { bigger_home: 0.35, better_schools: 0.2, job: 0.15, buy: 0.2, eviction_or_sale: 0.1 }, car: 0.72, bus: 0.25, bike: 0.06, walkMinutesPerDay: 55, offMapTripsPerWeek: 4 },
    money: { pressure: 0.55, savingsMonthsMedian: 1.5, debtProb: 0.4, arrearsProb: 0.07, incomeBand: [24000, 46000, 82000], childcareCosts: true, energyAnxiety: 0.55, cashUse: 0.2 },
    social: { onMapShare: { closeFriends: 0.4, family: 0.15, workFriends: 0.05, acquaintances: 0.85, schoolGateParents: 0.9 }, offMapMeetupsPerMonth: 3, messagesPerDay: 22, neighbourChat: 0.75, trustNeighbours: 0.4, clubs: ['parent_chat_group', 'school_pta', 'church_or_mosque', 'football_club_kids', 'brownies_scouts'] },
    venues: V({ corner_shop: 2, cafe: 0.7, pub: 0.5, takeaway: 1, small_supermarket: 2.5, park: 3, primary_school: 10, library: 0.4, gp_surgery: 0.5, church_or_mosque: 0.8, pharmacy: 0.4 }),
    health: { limitingLongTerm: 0.1, lonelinessOften: 0.04 },
    routine: { weekday: T([[6.5, 7.5, 'wake_prep', 'home'], [8, 8.9, 'school_run', 'primary_school'], [9, 17, 'work_or_homecare', 'work', 0.75], [15.2, 16, 'school_pickup', 'primary_school'], [16, 18, 'kids_park_or_clubs', 'park', 0.5], [18, 19.5, 'cook_eat', 'home'], [19.5, 21, 'bath_bed_homework', 'home'], [21, 23, 'tv_chores_phone', 'home']]), saturday: T([[8, 10, 'family_breakfast', 'home'], [10, 12, 'kids_activity', 'park', 0.7], [12, 17, 'shop_visit_offmap_or_home', 'offmap:retail_park', 0.55], [18, 21, 'takeaway_tv', 'home']]), sunday: T([[10, 12, 'worship', 'venue:church', 0.3], [12, 15, 'roast_or_family', 'home'], [15, 18, 'chores_park', 'park', 0.6]]) },
  },
  {
    id: 'lone_parents', label: 'Lone parents', householdShare: 0.09,
    blurb: 'Mostly mothers; a mix of part-time work, benefits and carer support; tight on time and money; grandparents and neighbours do the childcare.',
    head: { age: [21, 55], activity: { employed: 0.58, lookingAfterHomeFamily: 0.18, unemployed: 0.08, longTermSickDisabled: 0.1, student: 0.06 } },
    tenure: { council: 0.34, housing_assoc: 0.26, private_rent: 0.32, mortgage: 0.04, owned_outright: 0.02, shared_ownership: 0.02 },
    originBornUK: 0.78, yearsInArea: { median: 9, p10: 2, p90: 30 },
    mobility: { annualMoveProb: 0.14, moveReasons: { housing_offer: 0.3, relationship: 0.2, eviction_or_sale: 0.2, nearer_family: 0.15, job: 0.1, space: 0.05 }, car: 0.3, bus: 0.6, bike: 0.03, walkMinutesPerDay: 70, offMapTripsPerWeek: 2.5 },
    money: { pressure: 0.8, savingsMonthsMedian: 0.2, debtProb: 0.6, arrearsProb: 0.2, incomeBand: [11000, 21000, 36000], universalCredit: 0.6, childcareCosts: true, energyAnxiety: 0.8, cashUse: 0.35 },
    social: { onMapShare: { closeFriends: 0.5, family: 0.4, workFriends: 0.02, acquaintances: 0.85, schoolGateParents: 0.95 }, offMapMeetupsPerMonth: 1.5, messagesPerDay: 25, neighbourChat: 0.85, trustNeighbours: 0.35, clubs: ['parent_chat_group', 'church_or_mosque', 'children_centre', 'foodbank_volunteer'] },
    venues: V({ corner_shop: 3, takeaway: 1, small_supermarket: 3, park: 3.5, primary_school: 10, gp_surgery: 0.8, pharmacy: 0.7, community_centre: 0.8, library: 0.4, cafe: 0.4 }),
    health: { limitingLongTerm: 0.18, lonelinessOften: 0.12 },
    routine: { weekday: T([[6.5, 8, 'wake_prep', 'home'], [8, 9, 'school_run', 'primary_school'], [9, 15, 'work_parttime_or_admin', 'work', 0.5], [15.2, 16, 'school_pickup', 'primary_school'], [16, 18, 'park_or_grandparent', 'park', 0.5], [18, 19.5, 'cook_eat', 'home'], [19.5, 21, 'bedtime', 'home'], [21, 24, 'phone_tv', 'home']]), saturday: T([[8, 10, 'breakfast', 'home'], [10, 13, 'kids_activity_or_shop', 'street'], [14, 18, 'family_or_friend_visit', 'home', 0.6]]), sunday: T([[11, 14, 'family_meal', 'home', 0.6], [14, 17, 'park_laundry', 'park']]) },
  },
  {
    id: 'students', label: 'Students (renting shared houses and flats)', householdShare: 0.06,
    blurb: 'Full-time university students, 1-3 year stay in term-time lets; life centres on campus and the city; Larkfield is where they sleep and shop; many leave for home in the holidays.',
    head: { age: [18, 28], activity: { student: 0.97, employed: 0.03 } },
    tenure: { private_rent: 0.93, housing_assoc: 0.04, council: 0.0, owned_outright: 0.0, mortgage: 0.0, shared_ownership: 0.0 },
    originBornUK: 0.55, yearsInArea: { median: 1.6, p10: 0.7, p90: 3.5 },
    mobility: { annualMoveProb: 0.55, moveReasons: { tenancy_ends: 0.45, graduate: 0.3, housemates: 0.15, rent: 0.1 }, car: 0.06, bus: 0.55, bike: 0.2, walkMinutesPerDay: 60, offMapTripsPerWeek: 9, goesHomeInHolidays: 0.8 },
    money: { pressure: 0.65, savingsMonthsMedian: 0.4, debtProb: 0.85, arrearsProb: 0.06, incomeBand: [4000, 9000, 16000], studentLoan: true, parentalSupport: 0.55, energyAnxiety: 0.5, cashUse: 0.05 },
    social: { onMapShare: { closeFriends: 0.08, family: 0.0, workFriends: 0.02, acquaintances: 0.35, housemates: 1.0, courseFriends: 0.0 }, offMapMeetupsPerMonth: 12, messagesPerDay: 90, neighbourChat: 0.1, trustNeighbours: 0.1, clubs: ['university_society', 'sports_team', 'faith_society'] },
    venues: V({ corner_shop: 2.5, takeaway: 2, pub: 1, cafe: 1, gym: 1.5, small_supermarket: 2, launderette: 0.3, 'offmap:university': 5, 'offmap:city_centre_retail_leisure': 2 }),
    health: { limitingLongTerm: 0.06, lonelinessOften: 0.12, mentalHealthStrain: 0.25 },
    routine: { weekday: T([[9, 10, 'wake_late', 'home'], [10, 16, 'lectures_library', 'offmap:university', 0.8], [16, 18, 'gym_or_society', 'offmap:university', 0.5], [18, 20, 'cook_eat_housemates', 'home'], [20, 24, 'phone_gaming_pub', 'venue:pub', 0.25], [24, 27, 'late_phone_sleep', 'home']]), saturday: T([[11, 13, 'brunch_or_lie_in', 'home'], [13, 18, 'sport_shopping_city', 'offmap:city_centre_retail_leisure', 0.6], [21, 27, 'night_out_city', 'offmap:city_centre_retail_leisure', 0.5]]), sunday: T([[12, 14, 'recover', 'home'], [14, 18, 'library_essay', 'offmap:university', 0.6], [18, 22, 'cook_film_housemates', 'home']]) },
  },
  {
    id: 'young_sharers', label: 'Young sharers (house-shares, early 20s to early 30s)', householdShare: 0.10,
    blurb: 'Early-career renters in HMOs and flat-shares; first proper jobs in the city; the local pub and takeaway are conveniences, friends mostly live elsewhere in the city; a 1-3 year chapter.',
    head: { age: [21, 34], activity: { employed: 0.7, unemployed: 0.05, student: 0.22, longTermSickDisabled: 0.03 } },
    tenure: { private_rent: 0.93, housing_assoc: 0.03, council: 0.0, shared_ownership: 0.02, mortgage: 0.02 },
    originBornUK: 0.62, yearsInArea: { median: 1.9, p10: 0.4, p90: 5 },
    mobility: { annualMoveProb: 0.40, moveReasons: { flatmates_leave: 0.25, partner: 0.2, job: 0.15, rent: 0.15, buy: 0.1, space: 0.15 }, car: 0.1, bus: 0.35, bike: 0.2, walkMinutesPerDay: 55, offMapTripsPerWeek: 10 },
    money: { pressure: 0.62, savingsMonthsMedian: 1.0, debtProb: 0.55, arrearsProb: 0.06, incomeBand: [20000, 29000, 46000], studentLoanRepay: true, energyAnxiety: 0.45, cashUse: 0.05 },
    social: { onMapShare: { closeFriends: 0.15, family: 0.02, workFriends: 0.05, acquaintances: 0.45, housemates: 1.0 }, offMapMeetupsPerMonth: 9, messagesPerDay: 70, neighbourChat: 0.25, trustNeighbours: 0.2, clubs: ['gym', 'run_club', 'five_a_side', 'pub_quiz_team', 'climbing_wall_offmap'] },
    venues: V({ corner_shop: 2, takeaway: 2, pub: 1.2, cafe: 1.2, gym: 2, small_supermarket: 2, 'offmap:city_centre_offices': 4, 'offmap:city_centre_retail_leisure': 2 }),
    health: { limitingLongTerm: 0.07, lonelinessOften: 0.1 },
    routine: { weekday: T([[7, 8, 'wake_commute', 'home'], [8, 9, 'commute', 'offmap:city_centre_offices'], [9, 17.5, 'work', 'work', 0.9], [18, 19, 'commute_home_or_gym', 'venue:gym', 0.35], [19, 21, 'cook_or_takeaway', 'home'], [21, 23.5, 'phone_tv_pub', 'venue:pub', 0.2], [23.5, 25, 'bed', 'home']]), saturday: T([[10, 12, 'brunch_cafe', 'venue:cafe', 0.4], [12, 18, 'friends_city_or_sport', 'offmap:city_centre_retail_leisure', 0.65], [20, 26, 'night_out', 'offmap:city_centre_retail_leisure', 0.55]]), sunday: T([[11, 14, 'recover_laundry', 'home'], [14, 17, 'park_run_or_call_family', 'park', 0.4], [17, 22, 'meal_prep_netflix', 'home']]) },
  },
  {
    id: 'early_career', label: 'Early-career singles and couples (renting or first-time buyers)', householdShare: 0.12,
    blurb: 'Late 20s to late 30s, living alone or as a couple in a flat/terrace; career-oriented; partners and friends scattered across the city; the neighbourhood is convenient, not a community.',
    head: { age: [25, 42], activity: { employed: 0.9, unemployed: 0.03, student: 0.03, longTermSickDisabled: 0.02, lookingAfterHomeFamily: 0.02 } },
    tenure: { private_rent: 0.5, mortgage: 0.24, shared_ownership: 0.1, owned_outright: 0.04, housing_assoc: 0.07, council: 0.05 },
    originBornUK: 0.6, yearsInArea: { median: 3.2, p10: 0.6, p90: 9 },
    mobility: { annualMoveProb: 0.28, moveReasons: { partner: 0.25, buy: 0.2, job: 0.2, space: 0.2, rent: 0.15 }, car: 0.4, bus: 0.2, bike: 0.2, walkMinutesPerDay: 50, offMapTripsPerWeek: 9 },
    money: { pressure: 0.4, savingsMonthsMedian: 2.5, debtProb: 0.45, arrearsProb: 0.03, incomeBand: [24000, 38000, 66000], studentLoanRepay: true, energyAnxiety: 0.25, cashUse: 0.03 },
    social: { onMapShare: { closeFriends: 0.2, family: 0.03, workFriends: 0.05, acquaintances: 0.5 }, offMapMeetupsPerMonth: 8, messagesPerDay: 55, neighbourChat: 0.4, trustNeighbours: 0.25, clubs: ['gym', 'run_club', 'book_club', 'allotment', 'volleyball'] },
    venues: V({ corner_shop: 1.5, cafe: 2, pub: 1, gym: 2, takeaway: 1.3, small_supermarket: 2, 'offmap:city_centre_offices': 3, 'offmap:city_centre_retail_leisure': 2.5 }),
    health: { limitingLongTerm: 0.06, lonelinessOften: 0.09 },
    routine: { weekday: T([[6.5, 8, 'wake_gym_commute', 'venue:gym', 0.3], [8, 9, 'commute', 'offmap:city_centre_offices'], [9, 17.5, 'work_hybrid', 'work', 0.9], [18, 19.5, 'gym_cafe_shop', 'street', 0.5], [19.5, 21, 'cook_or_takeaway', 'home'], [21, 23, 'screens_call_partner', 'home']]), saturday: T([[9, 11, 'parkrun_cafe', 'park', 0.5], [11, 17, 'brunch_friends_city', 'offmap:city_centre_retail_leisure', 0.6], [19, 24, 'dinner_or_pub', 'venue:pub', 0.5]]), sunday: T([[10, 13, 'market_or_cafe', 'street', 0.6], [14, 17, 'visit_family_offmap', 'offmap:family_elsewhere', 0.3], [17, 22, 'meal_prep_work_prep', 'home']]) },
  },
  {
    id: 'settled_professionals', label: 'Settled professionals and owner households', householdShare: 0.09,
    blurb: 'Late 30s to 60s, owners with mortgages, secure professional or managerial jobs; may have children; invested in the street (residents groups, school governors) or detached from it, by temperament.',
    head: { age: [35, 66], activity: { employed: 0.88, longTermSickDisabled: 0.03, retired: 0.05, lookingAfterHomeFamily: 0.02, unemployed: 0.02 } },
    tenure: { mortgage: 0.46, owned_outright: 0.42, shared_ownership: 0.01, private_rent: 0.08, housing_assoc: 0.02, council: 0.01 },
    originBornUK: 0.7, yearsInArea: { median: 11, p10: 2, p90: 30 },
    mobility: { annualMoveProb: 0.06, moveReasons: { upsize: 0.3, job: 0.2, schools_suburbs: 0.3, downsize: 0.1, divorce: 0.1 }, car: 0.85, bus: 0.1, bike: 0.12, walkMinutesPerDay: 40, offMapTripsPerWeek: 6 },
    money: { pressure: 0.22, savingsMonthsMedian: 6, debtProb: 0.3, arrearsProb: 0.01, incomeBand: [38000, 62000, 115000], energyAnxiety: 0.1, cashUse: 0.03, pensionSaver: true },
    social: { onMapShare: { closeFriends: 0.3, family: 0.08, workFriends: 0.03, acquaintances: 0.7, schoolGateParents: 0.5 }, offMapMeetupsPerMonth: 5, messagesPerDay: 30, neighbourChat: 0.8, trustNeighbours: 0.55, clubs: ['residents_association', 'school_governors', 'running_club', 'choir', 'book_club', 'neighbourhood_forum'] },
    venues: V({ cafe: 1.5, pub: 0.8, small_supermarket: 2.5, gym: 1, restaurant: 0.7, park: 2.5, library: 0.3, 'offmap:city_centre_offices': 3, 'offmap:supermarket_big': 0.8 }),
    health: { limitingLongTerm: 0.07, lonelinessOften: 0.03 },
    routine: { weekday: T([[6.5, 8, 'wake_school_run', 'home'], [8, 9, 'commute', 'offmap:city_centre_offices'], [9, 17.5, 'work_hybrid', 'work', 0.9], [18, 19, 'commute_home', 'home'], [19, 21, 'family_dinner', 'home'], [21, 23, 'emails_tv', 'home']]), saturday: T([[9, 11, 'kids_sport_run', 'park', 0.6], [11, 14, 'market_cafe_diy', 'street'], [14, 18, 'garden_or_family_trip', 'offmap:retail_park', 0.4], [19, 23, 'dinner_friends', 'home', 0.5]]), sunday: T([[10, 12, 'worship_or_paper', 'venue:church', 0.2], [12, 15, 'roast_pub_or_home', 'venue:pub', 0.4], [15, 19, 'family_prep_week', 'home']]) },
  },
  {
    id: 'shift_workers', label: 'Shift and service workers', householdShare: 0.08,
    blurb: 'NHS and care staff, warehouse and logistics operatives, hospitality, security, drivers; irregular hours; sleep matters; community is the people they share a stair or a work-van with.',
    head: { age: [21, 62], activity: { employed: 0.93, unemployed: 0.04, longTermSickDisabled: 0.03 } },
    tenure: { private_rent: 0.33, council: 0.2, housing_assoc: 0.15, mortgage: 0.17, owned_outright: 0.12, shared_ownership: 0.03 },
    originBornUK: 0.55, yearsInArea: { median: 6, p10: 1, p90: 20 },
    mobility: { annualMoveProb: 0.14, moveReasons: { rent: 0.25, space: 0.2, job: 0.2, relationship: 0.15, eviction_or_sale: 0.2 }, car: 0.52, bus: 0.4, bike: 0.1, walkMinutesPerDay: 50, offMapTripsPerWeek: 7 },
    money: { pressure: 0.68, savingsMonthsMedian: 0.7, debtProb: 0.55, arrearsProb: 0.1, incomeBand: [20000, 26500, 40000], overtimeDependent: true, universalCredit: 0.2, energyAnxiety: 0.6, cashUse: 0.2 },
    social: { onMapShare: { closeFriends: 0.3, family: 0.15, workFriends: 0.02, acquaintances: 0.6 }, offMapMeetupsPerMonth: 3, messagesPerDay: 35, neighbourChat: 0.6, trustNeighbours: 0.35, clubs: ['church_or_mosque', 'five_a_side', 'whatsapp_family'] },
    venues: V({ corner_shop: 3, takeaway: 2, pub: 0.7, small_supermarket: 2.5, cafe: 0.8, gym: 0.7, 'offmap:teaching_hospital': 3, 'offmap:logistics_park': 3 }),
    health: { limitingLongTerm: 0.1, lonelinessOften: 0.08, sleepDisruption: 0.5 },
    routine: { weekday: T([[5, 6, 'early_wake_commute', 'home', 0.3], [6, 14, 'shift_early', 'work', 0.35], [14, 22, 'shift_late', 'work', 0.35], [20, 31, 'shift_night', 'work', 0.15], [10, 14, 'sleep_after_night', 'home', 0.15], [16, 19, 'shop_cook_family', 'home', 0.5], [19, 23, 'tv_phone_takeaway', 'home', 0.5]]), saturday: T([[9, 12, 'sleep_in_or_shift', 'home'], [12, 18, 'family_or_shopping', 'street', 0.6], [19, 24, 'pub_or_home', 'venue:pub', 0.3]]), sunday: T([[10, 14, 'family_lunch_or_church', 'home'], [14, 19, 'rest_laundry', 'home']]) },
  },
  {
    id: 'recent_arrivals', label: 'Recent arrivals (moved to the UK within ~5 years)', householdShare: 0.06,
    blurb: 'Workers, students-turned-workers, family-reunion and humanitarian arrivals; first rented room or flat via a contact; high work hours, community networks (language, faith, chain migration) that are partly local and partly across the city; some stay, some move on within 2-3 years.',
    head: { age: [20, 50], activity: { employed: 0.68, student: 0.08, unemployed: 0.12, lookingAfterHomeFamily: 0.07, longTermSickDisabled: 0.02, otherInactive: 0.03 } },
    tenure: { private_rent: 0.7, housing_assoc: 0.14, council: 0.06, mortgage: 0.03, owned_outright: 0.02, shared_ownership: 0.01 }, rentFreeOrSublet: 0.12,
    originBornUK: 0.05, yearsInArea: { median: 2.4, p10: 0.4, p90: 7 },
    mobility: { annualMoveProb: 0.35, moveReasons: { overcrowding: 0.25, job: 0.2, rent: 0.2, status_change: 0.15, chain_migration_cluster: 0.2 }, car: 0.2, bus: 0.6, bike: 0.1, walkMinutesPerDay: 60, offMapTripsPerWeek: 6 },
    money: { pressure: 0.78, savingsMonthsMedian: 0.3, debtProb: 0.4, arrearsProb: 0.1, incomeBand: [15000, 24500, 40000], remittances: 0.55, universalCredit: 0.18, energyAnxiety: 0.6, cashUse: 0.35 },
    social: { onMapShare: { closeFriends: 0.35, family: 0.2, workFriends: 0.05, acquaintances: 0.55, communityOrFaith: 0.7 }, offMapMeetupsPerMonth: 4, messagesPerDay: 60, abroadCallsPerWeek: 4, neighbourChat: 0.4, trustNeighbours: 0.3, clubs: ['church_or_mosque', 'language_community_group', 'esol_class', 'football_club', 'whatsapp_origin_group'] },
    venues: V({ corner_shop: 2.5, ethnic_grocer: 2, takeaway: 1, community_centre: 1, small_supermarket: 2, church_or_mosque: 1.5, 'offmap:other_neighbourhood': 2, 'offmap:hindu_temple_gurdwara': 0.3 }),
    health: { limitingLongTerm: 0.05, lonelinessOften: 0.12 },
    routine: { weekday: T([[5.5, 7, 'wake_commute', 'home'], [7, 16, 'work_or_esol', 'work', 0.85], [16, 18, 'shop_cook', 'street', 0.6], [18, 21, 'cook_call_abroad', 'home'], [21, 24, 'phone_tv', 'home']]), saturday: T([[9, 12, 'work_or_chores', 'work', 0.4], [12, 18, 'community_meeting_or_shopping', 'venue:community_centre', 0.5], [19, 23, 'friends_home', 'home']]), sunday: T([[10, 13, 'worship', 'venue:church', 0.45], [13, 18, 'community_lunch_visits', 'offmap:other_neighbourhood', 0.5], [18, 22, 'rest_call_home', 'home']]) },
  },
  {
    id: 'local_business_families', label: 'Local business families (shop, takeaway, cafe, workshop owners)', householdShare: 0.03,
    blurb: 'Self-employed owner households living above or near the business; very long weeks, children and relatives help; deeply embedded in the street economy and the faith/community networks; sell, hand down or close the business as a life event.',
    head: { age: [30, 68], activity: { employed: 0.9, retired: 0.05, lookingAfterHomeFamily: 0.03, otherInactive: 0.02 }, selfEmployed: 0.85 },
    tenure: { private_rent: 0.55, owned_outright: 0.2, mortgage: 0.2, housing_assoc: 0.0, council: 0.0, shared_ownership: 0.0, tied_above_shop: 0.05 },
    originBornUK: 0.4, yearsInArea: { median: 12, p10: 2, p90: 35 },
    mobility: { annualMoveProb: 0.04, moveReasons: { business_sale: 0.3, kids_schools: 0.25, retirement: 0.25, lease_end: 0.2 }, car: 0.85, bus: 0.05, bike: 0.02, walkMinutesPerDay: 40, offMapTripsPerWeek: 2 },
    money: { pressure: 0.5, savingsMonthsMedian: 3, debtProb: 0.45, arrearsProb: 0.04, incomeBand: [14000, 28000, 70000], variableIncome: true, energyAnxiety: 0.5, cashUse: 0.7 },
    social: { onMapShare: { closeFriends: 0.5, family: 0.35, workFriends: 0.2, acquaintances: 0.98, customers: 1.0 }, offMapMeetupsPerMonth: 2, messagesPerDay: 40, neighbourChat: 0.98, trustNeighbours: 0.6, clubs: ['church_or_mosque', 'traders_association', 'rotary_or_community_org', 'family_whatsapp'] },
    venues: V({ corner_shop: 0, church_or_mosque: 1.5, small_supermarket: 0.5, 'offmap:supermarket_big': 1, 'offmap:family_elsewhere': 0.4 }),
    health: { limitingLongTerm: 0.12, lonelinessOften: 0.03 },
    routine: { weekday: T([[5.5, 6.5, 'wake_open_up', 'work'], [6.5, 21, 'run_business', 'work'], [21, 22.5, 'close_cash_up', 'work'], [22.5, 24, 'family_tv', 'home']]), saturday: T([[6.5, 22, 'run_business', 'work']]), sunday: T([[8, 12, 'run_business_or_worship', 'work', 0.7], [14, 18, 'family_time', 'home']]) },
  },
  {
    id: 'benefit_dependent', label: 'Out-of-work and long-term-ill mid-life households', householdShare: 0.06,
    blurb: 'Working-age people out of work through sickness, disability, caring, redundancy or long-term unemployment, often in social housing; low income, long days at home, strongest ties are family and a few neighbours; health and money services matter.',
    head: { age: [30, 64], activity: { longTermSickDisabled: 0.38, unemployed: 0.28, lookingAfterHomeFamily: 0.17, otherInactive: 0.1, employed: 0.07 } },
    tenure: { council: 0.4, housing_assoc: 0.22, private_rent: 0.26, owned_outright: 0.07, mortgage: 0.04, shared_ownership: 0.01 },
    originBornUK: 0.84, yearsInArea: { median: 12, p10: 2, p90: 35 },
    mobility: { annualMoveProb: 0.12, moveReasons: { eviction_or_sale: 0.3, housing_offer: 0.25, relationship: 0.15, health: 0.15, rent: 0.15 }, car: 0.15, bus: 0.65, bike: 0.03, walkMinutesPerDay: 55, offMapTripsPerWeek: 2 },
    money: { pressure: 0.9, savingsMonthsMedian: 0.0, debtProb: 0.7, arrearsProb: 0.25, incomeBand: [8500, 14000, 22000], universalCredit: 0.8, pip: 0.4, energyAnxiety: 0.9, cashUse: 0.5 },
    social: { onMapShare: { closeFriends: 0.6, family: 0.35, workFriends: 0.0, acquaintances: 0.85 }, offMapMeetupsPerMonth: 1.5, messagesPerDay: 20, neighbourChat: 0.65, trustNeighbours: 0.28, clubs: ['community_centre', 'food_bank', 'recovery_or_support_group', 'church_or_mosque'] },
    venues: V({ corner_shop: 4, cafe: 0.8, pub: 1.2, takeaway: 1.2, gp_surgery: 1.2, pharmacy: 1.2, library: 0.6, community_centre: 1, small_supermarket: 2, park: 3 }),
    health: { limitingLongTerm: 0.55, lonelinessOften: 0.22, depressionProb: 0.28 },
    routine: { weekday: T([[8.5, 10, 'wake_slow', 'home'], [10, 12, 'appointments_jobcentre_or_errands', 'street', 0.5], [12, 14, 'lunch_tv', 'home'], [14, 16, 'walk_corner_shop_cafe', 'street', 0.55], [16, 22, 'tv_phone_gaming', 'home'], [22, 26, 'late_night_tv', 'home']]), saturday: T([[10, 13, 'shop_visit', 'street', 0.6], [13, 20, 'home_or_family', 'home'], [20, 23, 'pub_or_home', 'venue:pub', 0.25]]), sunday: T([[11, 16, 'family_meal_or_home', 'home'], [16, 22, 'tv', 'home']]) },
  },
];

// ---------------- composition x segment joint (IPF) ----------------
// Affinities: relative propensity of a segment's households to be of a composition (0 / absent = not plausible). IPF fits them to BOTH margins
// (calibration composition shares, segment householdShare) so the founding generator can draw (composition, segment) jointly.
const C = { A: 'one_person_66plus', B: 'one_person_u66', C: 'married_no_kids', D: 'married_dep_kids', E: 'married_nondep', F: 'cohab_no_kids', G: 'cohab_dep_kids', H: 'cohab_nondep', I: 'lone_parent_dep', J: 'lone_parent_nondep', K: 'couple_66plus', L: 'other_single_family', M: 'multi_family_dep_kids', N: 'sharers_students_multigen' };
const AFF = {
  older_longterm: { A: 6, C: 1, E: 2, K: 5, J: 1, B: 0.3, L: 0.5, N: 0.3 },
  family_couples: { D: 5, G: 3, E: 1, M: 1.5, H: 0.3, C: 0.1 },
  lone_parents: { I: 6, J: 2 },
  students: { N: 4, B: 1, F: 0.3 },
  young_sharers: { N: 5, B: 0.3, F: 0.5, M: 0.1 },
  early_career: { B: 3, F: 3, C: 1, G: 0.3 },
  settled_professionals: { C: 2, D: 2, B: 1, F: 1.5, G: 1, E: 0.5 },
  shift_workers: { B: 1.5, D: 1, G: 1, I: 0.5, F: 0.7, M: 0.5, C: 0.5 },
  recent_arrivals: { N: 2, M: 3, D: 1, B: 1, L: 1 },
  local_business_families: { D: 2, E: 2, L: 2, M: 1, N: 0.5 },
  benefit_dependent: { B: 3, I: 1, J: 1, L: 1, H: 1.5, F: 0.3 },
};
export function fitSegmentComposition(iters = 200) {
  const segs = SEGMENTS.map((s) => s.id), comps = HOUSEHOLD_ARCHETYPES.map((h) => h.id), rowT = SEGMENTS.map((s) => s.householdShare), colT = HOUSEHOLD_ARCHETYPES.map((h) => h.share);
  const rs = rowT.reduce((a, b) => a + b, 0), cs = colT.reduce((a, b) => a + b, 0);
  const col = colT.map((x) => x / cs), row = rowT.map((x) => x / rs);
  const M = segs.map((s) => comps.map((c) => { const k = Object.keys(C).find((q) => C[q] === c); return AFF[s][k] || 0; }));
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < M.length; i++) { const t = M[i].reduce((a, b) => a + b, 0); if (t > 0) for (let j = 0; j < M[i].length; j++) M[i][j] *= row[i] / t; }
    for (let j = 0; j < comps.length; j++) { let t = 0; for (let i = 0; i < M.length; i++) t += M[i][j]; if (t > 0) for (let i = 0; i < M.length; i++) M[i][j] *= col[j] / t; }
  }
  const joint = {}; segs.forEach((s, i) => { joint[s] = {}; comps.forEach((c, j) => { if (M[i][j] > 1e-6) joint[s][c] = M[i][j]; }); });
  const colErr = Math.max(...comps.map((c, j) => Math.abs(segs.reduce((a, s, i) => a + M[i][j], 0) - col[j])));
  return { joint, maxMarginalError: colErr };
}
export const SEGMENT_COMPOSITION = fitSegmentComposition();
/** Expected annual move probability per household, weighted by segment share (check vs calibration.mobility ~0.16/person/yr; households skew higher than persons). */
export const expectedAnnualMoveRate = () => SEGMENTS.reduce((a, s) => a + s.householdShare * s.mobility.annualMoveProb, 0);
export const SEGMENT_BY_ID = Object.fromEntries(SEGMENTS.map((s) => [s.id, s]));
export default { SEGMENTS, HOUSEHOLD_ARCHETYPES, SEGMENT_COMPOSITION, fitSegmentComposition, expectedAnnualMoveRate };
