// Venue templates for Larkfield. DATA ONLY (the map generator in sim/map/ places them; systems read capacity/hours/sessions).
// Hours: hour-of-day floats [open, close) in LOCAL clock time; close > 24 means after midnight. wk = Mon-Fri, sat, sun; bank = which pattern on bank holidays.
// Sessions drive venue-session encounters: {kind, days:[Mon=0..Sun=6] , from, to, fill (share of capacity typically present), regulars (share of attendees who are habitual)}.
// Zones: hs = high-street frontage, side = residential corner/side street, estate, arch = railway-arch units, civic = civic compound, special = bespoke placement.
const D = { wk: [0, 1, 2, 3, 4], we: [5, 6], all: [0, 1, 2, 3, 4, 5, 6], fri: [4], sat: [5], sun: [6], tue: [1], thu: [3], mon: [0], wed: [2] };
const H = (wk, sat = wk, sun = wk, bank = 'sun') => ({ wk, sat, sun, bank });
const CLOSED = null;

export const VENUE_TEMPLATES = {
  // ---------------- convenience / food retail ----------------
  corner_shop: {
    id: 'corner_shop', label: 'Convenience store / newsagent', category: 'retail', zone: 'side', count: [1, 1], footprint: { w: 5, d: 7 }, storeysAbove: 1,
    hours: H([[6.5, 23]], [[7, 23]], [[7.5, 22.5]], 'sun'), capacity: 14, priceLevel: 1, spendGBP: [2, 14],
    sessions: [{ kind: 'shopping', days: D.all, from: 7, to: 9, fill: 0.5 }, { kind: 'shopping', days: D.all, from: 16.5, to: 20, fill: 0.6 }, { kind: 'chat_at_counter', days: D.all, from: 9, to: 21, fill: 0.15, regulars: 0.7 }],
    staff: [{ occ: 'shop_owner_manager', n: [1, 1] }, { occ: 'retail_assistant', n: [1, 2], pattern: 'split_shifts' }],
    names: ['Kumar Convenience', 'Larkfield Stores', 'Bilal Mini Market', 'Nisa Local', 'Spar (Anwar family)', 'Dar Food & Wine', 'Patel Newsagents', 'Costcutter'],
    tags: ['shop', 'food', 'news', 'parcels', 'lottery'],
  },
  small_supermarket: {
    id: 'small_supermarket', label: 'Small supermarket (Express/Local format)', category: 'retail', zone: 'hs', count: [1, 1], footprint: { w: 12, d: 9 }, storeysAbove: 0,
    hours: H([[6, 23]], [[6, 23]], [[10, 16]], 'sun'), capacity: 45, priceLevel: 2, spendGBP: [6, 55],
    sessions: [{ kind: 'shopping', days: D.wk, from: 7, to: 9, fill: 0.35 }, { kind: 'shopping', days: D.wk, from: 16.5, to: 19.5, fill: 0.8 }, { kind: 'shopping', days: D.we, from: 10, to: 17, fill: 0.7 }, { kind: 'queue', days: D.all, from: 17, to: 19, fill: 0.4 }],
    staff: [{ occ: 'retail_assistant', n: [6, 9], pattern: 'retail_rota' }, { occ: 'shop_supervisor', n: [1, 2], pattern: 'retail_rota' }, { occ: 'store_manager', n: [1, 1], pattern: 'day' }],
    names: ['Co-op Food', 'Tesco Express', 'Sainsbury\'s Local', 'Premier Food Hall', 'Iceland'],
    tags: ['shop', 'food', 'chain', 'cash_machine'],
  },
  ethnic_grocer: {
    id: 'ethnic_grocer', label: 'International grocer / halal butcher', category: 'retail', zone: 'hs', count: [1, 2], footprint: { w: 6, d: 7 }, storeysAbove: 1,
    hours: H([[8, 21]], [[8, 21.5]], [[9, 20]], 'sat'), capacity: 20, priceLevel: 1, spendGBP: [5, 40],
    sessions: [{ kind: 'shopping', days: D.all, from: 10, to: 19, fill: 0.5 }, { kind: 'chat_at_counter', days: D.all, from: 10, to: 20, fill: 0.15, regulars: 0.7 }],
    staff: [{ occ: 'shop_owner_manager', n: [1, 1] }, { occ: 'retail_assistant', n: [2, 3], pattern: 'retail_rota' }],
    names: ['Al-Madina Halal Meats', 'Fresh Fruit & Veg Centre', 'Zam Zam Supermarket', 'Oriental Mart', 'Pak-Afro Foods', 'Sylhet Fish & Grocery', 'Mama Ngozi\'s African Foods'],
    tags: ['shop', 'food', 'halal'],
  },
  bakery: {
    id: 'bakery', label: 'Bakery / sandwich shop', category: 'retail', zone: 'hs', count: [0, 1], footprint: { w: 5, d: 7 }, storeysAbove: 1,
    hours: H([[6.5, 16]], [[7, 15]], [[8, 14]], 'sun'), capacity: 10, priceLevel: 2, spendGBP: [2, 9],
    sessions: [{ kind: 'shopping', days: D.all, from: 7, to: 14, fill: 0.5 }],
    staff: [{ occ: 'baker', n: [1, 2], pattern: 'early' }, { occ: 'retail_assistant', n: [1, 2], pattern: 'early' }],
    names: ['Greggs', 'Hearth Bakery', 'Kamran\'s Bakehouse', 'Sunrise Bakery', 'The Bread Counter'], tags: ['shop', 'food'],
  },
  off_licence: {
    id: 'off_licence', label: 'Off-licence / vape & convenience', category: 'retail', zone: 'hs', count: [1, 1], footprint: { w: 4, d: 7 }, storeysAbove: 1,
    hours: H([[9, 23]], [[9, 23]], [[10, 22.5]]), capacity: 8, priceLevel: 1, spendGBP: [3, 22],
    sessions: [{ kind: 'shopping', days: D.all, from: 17, to: 22.5, fill: 0.5 }], staff: [{ occ: 'retail_assistant', n: [1, 2], pattern: 'late' }],
    names: ['Londis', 'Bargain Booze', 'Lucky Wine & Spirits', 'Express Vapes & Off Licence'], tags: ['shop', 'alcohol'],
  },
  // ---------------- cafes, pubs, takeaways, restaurants ----------------
  cafe: {
    id: 'cafe', label: 'Café', category: 'food_drink', zone: 'hs', count: [2, 3], footprint: { w: 5, d: 7 }, storeysAbove: 1,
    variants: ['caff', 'coffee_shop', 'family_cafe'],
    hours: H([[7, 17]], [[8, 17]], [[9, 16]], 'sun'), capacity: 24, priceLevel: 2, spendGBP: [3, 14],
    sessions: [{ kind: 'coffee_regulars', days: D.wk, from: 8, to: 11, fill: 0.5, regulars: 0.6 }, { kind: 'lunch', days: D.all, from: 12, to: 14.5, fill: 0.75 }, { kind: 'brunch', days: D.we, from: 9.5, to: 13, fill: 0.9 }, { kind: 'remote_working', days: D.wk, from: 9, to: 16, fill: 0.2, regulars: 0.4 }],
    staff: [{ occ: 'cook_chef', n: [1, 1], pattern: 'day' }, { occ: 'barista_waiter', n: [2, 3], pattern: 'split_shifts' }, { occ: 'cafe_owner', n: [1, 1] }],
    names: ['Marmaris Café', 'Kenny\'s Caff', 'The Corner Pot', 'Ground & Co', 'Bean Counter', 'Lena\'s Kitchen', 'Rosa\'s', 'Mrs Dhillon\'s Tea Rooms', 'Sunday Social', 'Pit Stop Café'],
    tags: ['cafe', 'food', 'drink', 'regulars'],
  },
  pub: {
    id: 'pub', label: 'Pub', category: 'food_drink', zone: 'hs', count: [2, 2], footprint: { w: 9, d: 10 }, storeysAbove: 1, corner: true,
    variants: ['local_boozer', 'gastropub'],
    hours: H([[12, 23.5]], [[12, 24.5]], [[12, 23]]), capacity: 70, priceLevel: 2, spendGBP: [4, 40],
    sessions: [{ kind: 'lunchtime_regulars', days: D.all, from: 12, to: 15, fill: 0.2, regulars: 0.8 }, { kind: 'after_work', days: D.wk, from: 17, to: 20, fill: 0.4, regulars: 0.5 }, { kind: 'pub_quiz', days: D.tue, from: 20, to: 22.5, fill: 0.6, regulars: 0.5 }, { kind: 'live_match', days: D.sat, from: 14.5, to: 17.5, fill: 0.7 }, { kind: 'friday_night', days: D.fri, from: 19, to: 24, fill: 0.8 }, { kind: 'saturday_night', days: D.sat, from: 19, to: 24.5, fill: 0.85 }, { kind: 'sunday_roast', days: D.sun, from: 12.5, to: 17, fill: 0.7 }],
    staff: [{ occ: 'publican', n: [1, 1] }, { occ: 'bar_staff', n: [3, 5], pattern: 'evening_shift' }, { occ: 'cook_chef', n: [1, 2], pattern: 'evening_shift' }],
    names: ['The Railway Tavern', 'The Prince Albert', 'The Crown & Anchor', 'The Lord Nelson', 'The Wheatsheaf', 'The Black Horse', 'The Larkfield Arms', 'The Drovers', 'The Greyhound', 'The Navigation'],
    tags: ['pub', 'alcohol', 'social', 'sport_tv'],
  },
  takeaway: {
    id: 'takeaway', label: 'Takeaway (chicken shop, kebab, pizza, curry, Chinese)', category: 'food_drink', zone: 'hs', count: [3, 4], footprint: { w: 4, d: 7 }, storeysAbove: 1,
    variants: ['chicken_shop', 'kebab_pizza', 'indian_curry', 'chinese_takeaway', 'fish_and_chips'],
    hours: H([[11.5, 23.5]], [[11.5, 24.5]], [[12, 23.5]]), capacity: 10, priceLevel: 1, spendGBP: [4, 25],
    sessions: [{ kind: 'takeaway_collection', days: D.all, from: 17, to: 23, fill: 0.6 }, { kind: 'after_school', days: D.wk, from: 15.3, to: 17, fill: 0.5 }, { kind: 'late_night', days: [4, 5], from: 23, to: 24.5, fill: 0.7 }],
    staff: [{ occ: 'kitchen_porter_cook', n: [2, 3], pattern: 'evening_shift' }, { occ: 'delivery_rider', n: [1, 3], pattern: 'evening_shift', gig: true }],
    names: ['Southern Fried Kitchen', 'Crispy Cottage', 'Istanbul Grill', 'Golden Dragon', 'Tandoori Nights', 'Mama Mia Pizza', 'The Plaice to Be', 'Charcoal Bay', 'Wing Zone', 'Jade Garden'],
    tags: ['takeaway', 'food', 'late'],
  },
  restaurant: {
    id: 'restaurant', label: 'Restaurant (Pakistani/Bangladeshi, Turkish, Caribbean, Italian...)', category: 'food_drink', zone: 'hs', count: [2, 2], footprint: { w: 6, d: 8 }, storeysAbove: 1,
    hours: H([[17, 23]], [[12, 23.5]], [[12, 22.5]]), capacity: 50, priceLevel: 3, spendGBP: [12, 45],
    sessions: [{ kind: 'dinner', days: D.all, from: 18, to: 22, fill: 0.55 }, { kind: 'family_meal', days: D.we, from: 12, to: 15, fill: 0.5 }, { kind: 'date_night', days: [4, 5], from: 19, to: 22, fill: 0.7 }],
    staff: [{ occ: 'cook_chef', n: [2, 3], pattern: 'evening_shift' }, { occ: 'barista_waiter', n: [3, 5], pattern: 'evening_shift' }, { occ: 'restaurant_manager', n: [1, 1], pattern: 'evening_shift' }],
    names: ['Shalimar Restaurant', 'Anatolia Mangal', 'Spice Garden', 'Rasta Pot Caribbean Kitchen', 'Trattoria Rossi', 'Lahore Karahi', 'Sylhet Palace', 'Mezze House'],
    tags: ['restaurant', 'food', 'social'],
  },
  // ---------------- personal services ----------------
  barber: {
    id: 'barber', label: 'Barber shop', category: 'service', zone: 'hs', count: [2, 2], footprint: { w: 4, d: 7 }, storeysAbove: 1,
    hours: H([[9, 19]], [[9, 18.5]], [[10, 16]]), capacity: 9, priceLevel: 1, spendGBP: [12, 30],
    sessions: [{ kind: 'haircut_chat', days: D.all, from: 9, to: 18.5, fill: 0.5, regulars: 0.75 }], staff: [{ occ: 'barber_hairdresser', n: [2, 4], pattern: 'day', selfEmployedProb: 0.8 }],
    names: ['Fade Factory', 'Ali Baba Barbers', 'Gentlemen\'s Cuts', 'Turkish Barbers', 'Kutz', 'Razor Sharp'], tags: ['service', 'regulars', 'chat'],
  },
  salon: {
    id: 'salon', label: 'Hair & beauty salon / nail bar', category: 'service', zone: 'hs', count: [1, 2], footprint: { w: 4, d: 7 }, storeysAbove: 1,
    hours: H([[9.5, 18]], [[9, 17.5]], [[10, 16]]), capacity: 8, priceLevel: 2, spendGBP: [15, 80],
    sessions: [{ kind: 'appointment', days: D.all, from: 9.5, to: 17.5, fill: 0.5, regulars: 0.7 }], staff: [{ occ: 'barber_hairdresser', n: [2, 4], pattern: 'day', selfEmployedProb: 0.7 }],
    names: ['Shear Delight', 'Glam Nails & Beauty', 'Afro-Caribbean Hair Studio', 'Reshma Threading & Beauty', 'The Hair Lounge'], tags: ['service', 'regulars'],
  },
  launderette: {
    id: 'launderette', label: 'Launderette', category: 'service', zone: 'hs', count: [1, 1], footprint: { w: 5, d: 7 }, storeysAbove: 0,
    hours: H([[7, 21]], [[7, 21]], [[8, 20]]), capacity: 14, priceLevel: 1, spendGBP: [6, 14],
    sessions: [{ kind: 'wash_wait', days: D.all, from: 9, to: 20, fill: 0.3, regulars: 0.5 }], staff: [{ occ: 'launderette_attendant', n: [1, 1], pattern: 'day' }],
    names: ['Spin City Launderette', 'Bubbles Self-Service', 'Wash & Go'], tags: ['service', 'chat'],
  },
  bookmaker: {
    id: 'bookmaker', label: 'Bookmaker', category: 'service', zone: 'hs', count: [1, 1], footprint: { w: 5, d: 7 }, storeysAbove: 1,
    hours: H([[8.5, 22]], [[8.5, 22]], [[9, 22]], 'sat'), capacity: 15, priceLevel: 1, spendGBP: [3, 60],
    sessions: [{ kind: 'betting', days: D.all, from: 11, to: 21, fill: 0.2, regulars: 0.8 }], staff: [{ occ: 'betting_shop_cashier', n: [2, 2], pattern: 'retail_rota' }],
    names: ['Ladbrokes', 'William Hill', 'Betfred', 'Coral'], tags: ['gambling', 'regulars'],
  },
  money_phone: {
    id: 'money_phone', label: 'Phone repair / money transfer / parcels', category: 'service', zone: 'hs', count: [1, 1], footprint: { w: 4, d: 7 }, storeysAbove: 1,
    hours: H([[9.5, 19]], [[9.5, 19]], [[11, 17]]), capacity: 8, priceLevel: 1, spendGBP: [5, 120],
    sessions: [{ kind: 'errand', days: D.all, from: 10, to: 18.5, fill: 0.3 }], staff: [{ occ: 'retail_assistant', n: [1, 2], pattern: 'day' }],
    names: ['iFix Phone Repair & Money Transfer', 'Global Remit & Mobile', 'Unlock Hub'], tags: ['service', 'remittance'],
  },
  charity_shop: {
    id: 'charity_shop', label: 'Charity shop', category: 'retail', zone: 'hs', count: [1, 1], footprint: { w: 6, d: 7 }, storeysAbove: 1,
    hours: H([[9.5, 17]], [[9.5, 17]], CLOSED, 'sun'), capacity: 14, priceLevel: 1, spendGBP: [2, 20],
    sessions: [{ kind: 'browse_shop', days: D.all, from: 10, to: 16.5, fill: 0.3 }, { kind: 'volunteering_shift', days: D.wk, from: 9.5, to: 17, fill: 0.15, regulars: 0.9 }],
    staff: [{ occ: 'shop_supervisor', n: [1, 1], pattern: 'day' }], volunteers: [4, 8], names: ['Sue Ryder', 'British Heart Foundation', 'Oxfam', 'St Luke\'s Hospice Shop', 'Cancer Research UK'], tags: ['shop', 'volunteering'],
  },
  estate_agent: {
    id: 'estate_agent', label: 'Estate & lettings agent', category: 'service', zone: 'hs', count: [1, 1], footprint: { w: 5, d: 7 }, storeysAbove: 1,
    hours: H([[9, 18]], [[9, 17]], CLOSED, 'sun'), capacity: 8, priceLevel: 3, spendGBP: [0, 0],
    sessions: [{ kind: 'appointment', days: D.wk, from: 9, to: 18, fill: 0.2 }], staff: [{ occ: 'lettings_agent', n: [2, 4], pattern: 'day' }, { occ: 'office_administrator', n: [1, 1], pattern: 'day' }],
    names: ['Haywards Lettings & Sales', 'Moor & Co', 'Key Move Estates', 'Urban Nest Lettings'], tags: ['housing', 'office'],
  },
  vacant_unit: {
    id: 'vacant_unit', label: 'Vacant / "to let" shop unit', category: 'vacant', zone: 'hs', count: [1, 3], footprint: { w: 5, d: 7 }, storeysAbove: 1,
    hours: H(CLOSED), capacity: 0, sessions: [], staff: [], names: ['TO LET'], tags: ['vacant'], filler: true,
  },
  // ---------------- health & wellbeing ----------------
  gp_surgery: {
    id: 'gp_surgery', label: 'GP surgery / health centre', category: 'health', zone: 'hs', count: [1, 1], footprint: { w: 14, d: 9 }, storeysAbove: 1,
    hours: H([[8, 18.5]], CLOSED, CLOSED, 'sun'), capacity: 40, priceLevel: 0, spendGBP: [0, 0], registeredPatients: 7500, // list size is wider than the 500-person sim sample
    sessions: [{ kind: 'appointment', days: D.wk, from: 8.5, to: 18, fill: 0.6 }, { kind: 'waiting_room', days: D.wk, from: 8.5, to: 18, fill: 0.35 }, { kind: 'baby_clinic', days: [2], from: 13.5, to: 15.5, fill: 0.2 }, { kind: 'flu_clinic', days: [5], from: 9, to: 13, fill: 0.6, seasonal: [9, 11] }],
    staff: [{ occ: 'gp', n: [3, 4], pattern: 'clinic' }, { occ: 'practice_nurse', n: [2, 2], pattern: 'clinic' }, { occ: 'receptionist', n: [2, 3], pattern: 'day' }, { occ: 'practice_manager', n: [1, 1], pattern: 'day' }],
    names: ['Larkfield Medical Practice', 'The Mill Lane Surgery', 'Albert Road Health Centre'], tags: ['nhs', 'health'],
  },
  pharmacy: {
    id: 'pharmacy', label: 'Community pharmacy', category: 'health', zone: 'hs', count: [1, 1], footprint: { w: 5, d: 7 }, storeysAbove: 1, nextTo: 'gp_surgery',
    hours: H([[9, 18.5]], [[9, 17.5]], [[11, 16]], 'sun'), capacity: 12, priceLevel: 1, spendGBP: [0, 25],
    sessions: [{ kind: 'prescription_collection', days: D.all, from: 9, to: 18, fill: 0.35 }], staff: [{ occ: 'pharmacist', n: [1, 2], pattern: 'day' }, { occ: 'pharmacy_assistant', n: [2, 3], pattern: 'day' }],
    names: ['Day Lewis Pharmacy', 'Boots', 'Larkfield Pharmacy', 'Well Pharmacy'], tags: ['nhs', 'health'],
  },
  dentist: {
    id: 'dentist', label: 'Dental practice', category: 'health', zone: 'hs', count: [0, 1], footprint: { w: 5, d: 7 }, storeysAbove: 1,
    hours: H([[8.5, 17.5]], [[9, 13]], CLOSED), capacity: 8, priceLevel: 2, spendGBP: [27, 300], sessions: [{ kind: 'appointment', days: D.wk, from: 8.5, to: 17.5, fill: 0.4 }],
    staff: [{ occ: 'dentist', n: [1, 2], pattern: 'clinic' }, { occ: 'dental_nurse', n: [2, 3], pattern: 'clinic' }], names: ['Smile Dental', 'Larkfield Dental Care'], tags: ['health'],
  },
  gym: {
    id: 'gym', label: 'Gym (budget gym in a former warehouse/arches)', category: 'leisure', zone: 'arch', count: [1, 1], footprint: { w: 8, d: 6 }, archesSpan: 2,
    hours: H([[6, 22.5]], [[8, 20]], [[8, 18]]), capacity: 60, priceLevel: 1, spendGBP: [0, 6], membershipGBPMonth: [15, 45],
    sessions: [{ kind: 'workout_peak', days: D.wk, from: 6.5, to: 8, fill: 0.5, regulars: 0.7 }, { kind: 'workout_peak', days: D.wk, from: 17.5, to: 20.5, fill: 0.8, regulars: 0.7 }, { kind: 'class', days: [1, 3], from: 18.5, to: 19.5, fill: 0.9, regulars: 0.7 }, { kind: 'workout_off_peak', days: D.all, from: 10, to: 15, fill: 0.25 }],
    staff: [{ occ: 'fitness_instructor', n: [3, 5], pattern: 'split_shifts', selfEmployedProb: 0.5 }, { occ: 'leisure_receptionist', n: [2, 3], pattern: 'retail_rota' }],
    names: ['The Arches Gym', 'PureFit', 'Iron Yard Fitness', 'Boxing & Strength Club'], tags: ['gym', 'health', 'regulars'],
  },
  // ---------------- education / children ----------------
  primary_school: {
    id: 'primary_school', label: 'Community primary school (1.5-form entry)', category: 'education', zone: 'special', count: [1, 1], footprint: { w: 26, d: 9 }, grounds: { w: 30, d: 14 },
    hours: H([[7.5, 18]], CLOSED, CLOSED, 'sun'), capacity: 300, roll: 330, term: true, // roll is wider catchment; the on-map pupil sample is smaller
    sessions: [{ kind: 'school_gate', days: D.wk, from: 8.25, to: 8.75, fill: 0.7, term: true }, { kind: 'lessons', days: D.wk, from: 8.75, to: 15.25, fill: 1, term: true }, { kind: 'school_gate', days: D.wk, from: 15.1, to: 15.6, fill: 0.7, term: true, regulars: 0.9 }, { kind: 'breakfast_club', days: D.wk, from: 7.5, to: 8.75, fill: 0.2, term: true }, { kind: 'after_school_club', days: D.wk, from: 15.25, to: 17.75, fill: 0.2, term: true }, { kind: 'parents_evening', days: [2, 3], from: 15.5, to: 18.5, fill: 0.3, seasonal: [10, 11, 2, 6] }],
    staff: [{ occ: 'primary_teacher', n: [10, 12], pattern: 'school_day' }, { occ: 'teaching_assistant', n: [8, 10], pattern: 'school_day' }, { occ: 'headteacher', n: [1, 1], pattern: 'school_day' }, { occ: 'school_support_staff', n: [4, 6], pattern: 'school_day' }, { occ: 'school_cook_midday', n: [3, 3], pattern: 'school_day' }],
    names: ['St Aidan\'s C of E Primary', 'Larkfield Primary School', 'Holly Road Community Primary', 'Gladstone Street Primary Academy'], tags: ['school', 'children', 'regulars'],
  },
  nursery: {
    id: 'nursery', label: 'Day nursery (0-4)', category: 'education', zone: 'side', count: [1, 1], footprint: { w: 7, d: 9 }, storeysAbove: 0, archetypeHint: 'detached_villa',
    hours: H([[7.5, 18]], CLOSED, CLOSED, 'sun'), capacity: 48, spendGBPDay: [55, 85], term: false,
    sessions: [{ kind: 'nursery_dropoff', days: D.wk, from: 7.75, to: 9, fill: 0.6 }, { kind: 'nursery_pickup', days: D.wk, from: 16.5, to: 18, fill: 0.6, regulars: 0.9 }, { kind: 'nursery_day', days: D.wk, from: 9, to: 16.5, fill: 1 }],
    staff: [{ occ: 'nursery_practitioner', n: [8, 10], pattern: 'nursery' }, { occ: 'nursery_manager', n: [1, 1], pattern: 'nursery' }],
    names: ['Little Acorns Day Nursery', 'Busy Bees', 'The Nest Nursery'], tags: ['childcare', 'children'],
  },
  // ---------------- civic ----------------
  library: {
    id: 'library', label: 'Branch library', category: 'civic', zone: 'civic', count: [1, 1], footprint: { w: 11, d: 9 },
    hours: { wk: [[9, 17]], sat: [[9, 16]], sun: CLOSED, bank: 'sun', closedDays: [2] }, capacity: 40, priceLevel: 0, spendGBP: [0, 0],
    sessions: [{ kind: 'storytime', days: [1, 3], from: 10.5, to: 11.5, fill: 0.4, regulars: 0.8 }, { kind: 'study_computers', days: D.wk, from: 9, to: 17, fill: 0.3, regulars: 0.4 }, { kind: 'homework_club', days: [0, 2], from: 15.5, to: 17, fill: 0.4 }, { kind: 'browse', days: D.all, from: 10, to: 16, fill: 0.3 }],
    staff: [{ occ: 'librarian', n: [1, 2], pattern: 'day' }, { occ: 'library_assistant', n: [2, 3], pattern: 'day' }], volunteers: [4, 8],
    names: ['Larkfield Library', 'Holly Road Library & Community Hub'], tags: ['civic', 'free', 'study', 'internet'],
  },
  community_centre: {
    id: 'community_centre', label: 'Community centre / church-hall-style hub', category: 'civic', zone: 'civic', count: [1, 1], footprint: { w: 13, d: 9 },
    hours: H([[8.5, 22]], [[9, 22]], [[10, 17]]), capacity: 120, priceLevel: 0, spendGBP: [0, 6],
    sessions: [{ kind: 'toddler_group', days: [0, 2, 4], from: 9.5, to: 11.5, fill: 0.3, regulars: 0.8 }, { kind: 'luncheon_club', days: [1, 3], from: 12, to: 14, fill: 0.4, regulars: 0.85 }, { kind: 'yoga_class', days: [0, 3], from: 18.5, to: 19.75, fill: 0.3, regulars: 0.7 }, { kind: 'tenants_residents_assoc', days: [2], from: 19, to: 20.5, fill: 0.15, seasonal: [1, 3, 5, 7, 9, 11], regulars: 0.8 }, { kind: 'youth_club', days: [1, 4], from: 18, to: 21, fill: 0.3 }, { kind: 'bingo_or_dance', days: [3, 5], from: 19, to: 22, fill: 0.4 }, { kind: 'food_bank', days: [3], from: 10, to: 13, fill: 0.2 }, { kind: 'polling_station', days: [3], from: 7, to: 22, fill: 0.2, event: 'election' }, { kind: 'private_hire_party', days: D.we, from: 13, to: 22, fill: 0.5 }],
    staff: [{ occ: 'community_centre_manager', n: [1, 1], pattern: 'day' }, { occ: 'youth_worker', n: [1, 2], pattern: 'evening_shift' }], volunteers: [10, 20],
    names: ['Larkfield Community Centre', 'The Mill Lane Centre', 'Holly Road Neighbourhood Hub'], tags: ['civic', 'regulars', 'volunteering', 'clubs'],
  },
  church: {
    id: 'church', label: 'Parish church (C of E / Catholic) with hall', category: 'worship', religion: 'Christian', zone: 'special', count: [1, 1], footprint: { w: 10, d: 16 },
    hours: { wk: [[9, 12], [14, 16]], sat: [[10, 12]], sun: [[8, 18]], bank: 'sun' }, capacity: 180,
    sessions: [{ kind: 'sunday_service', days: D.sun, from: 10, to: 11.25, fill: 0.2, regulars: 0.9 }, { kind: 'baby_and_toddler', days: [1], from: 10, to: 11.5, fill: 0.2 }, { kind: 'foodbank_and_warm_space', days: [3], from: 10, to: 14, fill: 0.15, seasonal: [10, 11, 12, 1, 2, 3] }, { kind: 'choir_practice', days: [2], from: 19.5, to: 21, fill: 0.1, regulars: 0.9 }, { kind: 'wedding_or_funeral', days: D.all, from: 11, to: 15, fill: 0.3, event: 'life_event' }],
    staff: [{ occ: 'clergy', n: [1, 1], pattern: 'flexible' }, { occ: 'church_caretaker', n: [1, 1], pattern: 'day' }], volunteers: [8, 15],
    names: ['St Aidan\'s Church', 'St Mary Magdalene', 'Sacred Heart RC Church', 'Holy Trinity'], tags: ['worship', 'christian', 'regulars', 'weddings_funerals'],
  },
  mosque: {
    id: 'mosque', label: 'Mosque (converted building) with madrasa', category: 'worship', religion: 'Muslim', zone: 'special', count: [1, 1], footprint: { w: 12, d: 12 },
    hours: { wk: [[4.5, 22.5]], sat: [[4.5, 22.5]], sun: [[4.5, 22.5]], bank: 'sun', prayerLinked: true }, capacity: 400,
    sessions: [{ kind: 'jumuah', days: D.fri, from: 12.5, to: 14, fill: 0.7, regulars: 0.8 }, { kind: 'daily_prayer', days: D.all, from: 5, to: 22, fill: 0.08, regulars: 0.95, prayerTimes: true }, { kind: 'madrasa', days: D.wk, from: 16.5, to: 18.5, fill: 0.3, term: true, regulars: 0.95 }, { kind: 'taraweeh', days: D.all, from: 21, to: 23, fill: 0.5, event: 'ramadan', regulars: 0.8 }, { kind: 'eid_prayers', days: D.all, from: 7.5, to: 10.5, fill: 1, event: 'eid' }, { kind: 'community_iftar', days: D.all, from: 19.5, to: 21, fill: 0.5, event: 'ramadan' }],
    staff: [{ occ: 'imam', n: [1, 2], pattern: 'flexible' }], volunteers: [10, 20],
    names: ['Masjid Al-Noor', 'Larkfield Islamic Centre', 'Jamia Masjid Bilal', 'Masjid Umar'], tags: ['worship', 'muslim', 'regulars', 'weddings_funerals'],
  },
  // ---------------- business / trade ----------------
  business_unit: {
    id: 'business_unit', label: 'Railway-arch / workshop business unit', category: 'business', zone: 'arch', count: [10, 14], footprint: { w: 4, d: 6 },
    hours: H([[7.5, 17.5]], [[8, 13]], CLOSED), capacity: 10, priceLevel: 1,
    // each unit is assigned one `trade` (weights) -- staffing from `trades`
    trades: {
      car_repair: { w: 0.20, label: 'MOT & car repairs', staff: [{ occ: 'vehicle_technician', n: [2, 4] }], names: ['Larkfield Autos', 'Arch 7 MOT Centre', 'Baz\'s Garage'] },
      tyre_exhaust: { w: 0.08, label: 'Tyres & exhausts', staff: [{ occ: 'vehicle_technician', n: [2, 3] }], names: ['Kwik Tyres', '24/7 Tyres'] },
      joinery: { w: 0.10, label: 'Joinery & kitchen fitting', staff: [{ occ: 'carpenter_joiner', n: [1, 3] }], names: ['Boyle & Sons Joinery', 'Arch Carpentry'] },
      wholesale_food: { w: 0.10, label: 'Wholesale bakery / food prep', staff: [{ occ: 'baker', n: [3, 6] }, { occ: 'delivery_driver', n: [1, 2] }], hoursOverride: [[3, 13]], names: ['Mehmet Bakery Wholesale', 'Granary Catering Supplies'] },
      brewery_taproom: { w: 0.06, label: 'Micro-brewery & taproom', staff: [{ occ: 'bar_staff', n: [2, 4] }, { occ: 'brewer', n: [1, 2] }], hoursOverride: [[16, 22]], taproom: true, names: ['Viaduct Brewing Co.', 'Arch 12 Brewery'] },
      print_signs: { w: 0.05, label: 'Print & signs', staff: [{ occ: 'printer_designer', n: [1, 3] }], names: ['Quick Print & Signs'] },
      courier_hub: { w: 0.08, label: 'Courier / last-mile depot', staff: [{ occ: 'delivery_driver', n: [4, 9], gig: true }, { occ: 'warehouse_operative', n: [2, 4] }], hoursOverride: [[6, 20]], names: ['Parcel Hub', 'Metro Courier Depot'] },
      studios: { w: 0.08, label: 'Artist/maker studios & rehearsal rooms', staff: [{ occ: 'artist_maker', n: [2, 6], selfEmployed: true }], hoursOverride: [[9, 23]], names: ['Arch Studios', 'Soundworks Rehearsal'] },
      self_storage: { w: 0.07, label: 'Lock-up / self storage', staff: [{ occ: 'security_guard', n: [1, 1] }], names: ['SafeStore Arches', 'Lock & Leave'] },
      metal_fab: { w: 0.06, label: 'Metal fabrication / welding', staff: [{ occ: 'welder_fabricator', n: [1, 3] }], names: ['Rail Arch Fabrication'] },
      mini_cab: { w: 0.06, label: 'Minicab office', staff: [{ occ: 'taxi_driver', n: [6, 14], selfEmployed: true }, { occ: 'dispatcher', n: [1, 2] }], hoursOverride: [[0, 24]], names: ['Larkfield Cars', 'A1 Minicabs'] },
      upholstery_clothes: { w: 0.06, label: 'Upholstery / garment alterations', staff: [{ occ: 'tailor_seamstress', n: [1, 3] }], names: ['Mary\'s Alterations', 'Handy Upholstery'] },
    },
    tags: ['work', 'trade', 'noise'],
  },
};

// Transport / off-map links (gateway nodes on the street graph). Travel times in minutes from the on-map gateway to the destination.
export const GATEWAYS = {
  station: { id: 'station', label: 'Larkfield railway station', mode: 'rail', trainsPerHourOffPeak: 4, trainsPerHourPeak: 6, firstTrain: 5.2, lastTrain: 23.8, lastTrainSat: 24.4, fareGBP: { cityCentre: 3.4, airportInterchange: 8.9 } },
  bus_stop: { id: 'bus_stop', label: 'Bus stop', mode: 'bus', routes: [{ id: '12', label: 'City centre - Larkfield - University', freqPeak: 8, freqOff: 12, last: 23.3, nightBus: false }, { id: '38', label: 'Hospital - Larkfield - Retail Park', freqPeak: 12, freqOff: 20, last: 22.5 }, { id: 'N5', label: 'Night bus (Fri/Sat)', freqOff: 30, last: 4.5, days: [4, 5] }], fareGBP: 2.0 },
  road_west: { id: 'road_west', label: 'Road to city centre', mode: 'road', driveMinCityCentre: 12 },
  road_east: { id: 'road_east', label: 'Road to ring road / suburbs', mode: 'road', driveMinRingRoad: 8 },
  towpath: { id: 'towpath', label: 'Canal towpath (walk/cycle)', mode: 'walk_cycle', cycleMinCityCentre: 22 },
  cycle_route: { id: 'cycle_route', label: 'Cycle route', mode: 'cycle' },
};

// Off-map destinations people reach via the gateways (work, health, study, religion, shopping, social)
export const OFFMAP_DESTINATIONS = {
  city_centre_offices: { id: 'city_centre_offices', kind: 'work', via: ['station', 'bus_stop', 'road_west'], minutes: { rail: 14, bus: 28, drive: 18, cycle: 26 } },
  city_centre_retail_leisure: { id: 'city_centre_retail_leisure', kind: 'work_leisure', via: ['station', 'bus_stop'], minutes: { rail: 14, bus: 28, drive: 18, cycle: 26 } },
  teaching_hospital: { id: 'teaching_hospital', kind: 'work_health', via: ['bus_stop', 'station', 'road_west'], minutes: { bus: 25, rail: 18, drive: 14 }, shifts: true },
  university: { id: 'university', kind: 'study_work', via: ['bus_stop', 'station'], minutes: { bus: 20, rail: 12, cycle: 18 } },
  secondary_school: { id: 'secondary_school', kind: 'school', via: ['bus_stop', 'towpath'], minutes: { bus: 15, walk: 30, cycle: 12 }, note: 'catchment secondary schools (2-3 within 25 min)' },
  retail_park: { id: 'retail_park', kind: 'work_shopping', via: ['road_east', 'bus_stop'], minutes: { bus: 22, drive: 11 } },
  logistics_park: { id: 'logistics_park', kind: 'work', via: ['road_east'], minutes: { drive: 16, bus: 45 }, shifts: true },
  industrial_estate: { id: 'industrial_estate', kind: 'work', via: ['road_east', 'bus_stop'], minutes: { drive: 12, bus: 35 } },
  airport: { id: 'airport', kind: 'work_travel', via: ['station', 'road_east'], minutes: { rail: 55, drive: 35 }, shifts: true },
  business_park: { id: 'business_park', kind: 'work', via: ['road_east', 'station'], minutes: { drive: 20, rail: 32 } },
  other_neighbourhood: { id: 'other_neighbourhood', kind: 'social', via: ['bus_stop', 'towpath', 'station'], minutes: { bus: 20, cycle: 15 } },
  hindu_temple_gurdwara: { id: 'hindu_temple_gurdwara', kind: 'worship', religions: ['Hindu', 'Sikh'], via: ['bus_stop', 'road_east'], minutes: { bus: 25, drive: 12 } },
  synagogue_buddhist_centre: { id: 'synagogue_buddhist_centre', kind: 'worship', religions: ['Jewish', 'Buddhist', 'Other'], via: ['station', 'bus_stop'], minutes: { rail: 20, bus: 35 } },
  supermarket_big: { id: 'supermarket_big', kind: 'shopping', via: ['road_east', 'bus_stop'], minutes: { drive: 8, bus: 18 }, note: 'large weekly shop, car owners mostly' },
  hospital_ae: { id: 'hospital_ae', kind: 'health', via: ['bus_stop', 'road_west'], minutes: { drive: 14, bus: 28 }, note: 'A&E / outpatients / maternity' },
  family_elsewhere: { id: 'family_elsewhere', kind: 'social', via: ['station', 'road_east', 'road_west'], minutes: { rail: 90, drive: 120 }, note: 'visiting parents/siblings in other cities, weekends/holidays' },
};

// Counts expected on a generated map (validate() compares)
export const EXPECTED_VENUE_COUNTS = { total: [32, 48], withCategory: { food_drink: [9, 16], retail: [7, 14], service: [6, 12], civic: [2, 3], worship: [2, 2], education: [2, 2], health: [2, 3], business: [10, 14], leisure: [1, 3] } };

// Open spaces (people stay visible; sessions are outdoor). Placed by the map generator as areas, not buildings.
export const PUBLIC_SPACES = {
  park: {
    id: 'park', label: 'Neighbourhood park (canalside)', category: 'open_space', capacity: 400, hours: { open: 'dawn_to_dusk' },
    features: ['playground', 'muga_pitch', 'pavilion_kiosk', 'benches', 'trees', 'dog_area'],
    sessions: [{ kind: 'dog_walking', days: D.all, from: 6.5, to: 9, fill: 0.15, regulars: 0.85 }, { kind: 'dog_walking', days: D.all, from: 17, to: 19.5, fill: 0.15, regulars: 0.85 }, { kind: 'playground', days: D.all, from: 9.5, to: 11.5, fill: 0.2 }, { kind: 'playground', days: D.wk, from: 15.3, to: 17.3, fill: 0.3, term: true }, { kind: 'five_a_side', days: [2], from: 19, to: 21, fill: 0.1, regulars: 0.9 }, { kind: 'running_club', days: [1], from: 18.5, to: 20, fill: 0.05, regulars: 0.9 }, { kind: 'park_lunch', days: D.all, from: 12, to: 14, fill: 0.1, seasonal: [5, 6, 7, 8, 9] }, { kind: 'teens_hanging_out', days: D.all, from: 16, to: 21, fill: 0.08 }, { kind: 'summer_fair', days: [5], from: 11, to: 17, fill: 0.7, event: 'annual_fair' }],
    names: ['Larkfield Rec', 'Canal Meadow', 'Holly Road Recreation Ground', 'Victoria Gardens'],
  },
  school_grounds: { id: 'school_grounds', label: 'School playground & field', category: 'education', capacity: 330, names: [] },
  estate_green: { id: 'estate_green', label: 'Estate green & ball court', category: 'open_space', capacity: 60, sessions: [{ kind: 'kids_playing_out', days: D.all, from: 15.5, to: 20, fill: 0.2 }, { kind: 'teens_hanging_out', days: D.all, from: 17, to: 23, fill: 0.1 }] },
  allotments: { id: 'allotments', label: 'Allotments', category: 'open_space', capacity: 40, sessions: [{ kind: 'plot_tending', days: D.all, from: 7, to: 19, fill: 0.1, regulars: 0.95, seasonal: [3, 4, 5, 6, 7, 8, 9, 10] }] },
  towpath: { id: 'towpath', label: 'Canal towpath', category: 'open_space', capacity: 100, sessions: [{ kind: 'commuting_cyclists', days: D.wk, from: 7, to: 9.5, fill: 0.1 }, { kind: 'strolling_running', days: D.all, from: 6.5, to: 20, fill: 0.05 }] },
  high_street: { id: 'high_street', label: 'High street pavement', category: 'open_space', capacity: 300, sessions: [{ kind: 'street_market_stalls', days: [5], from: 8, to: 15, fill: 0.2, event: 'saturday_market' }] },
};
