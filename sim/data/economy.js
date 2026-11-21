// SETTING DATA: economy tables (goods & prices, producers, which buildings are public/commercial, seasonal yield,
// junior->senior job ladders, minimum ages, wage-share constants). Edit for a new setting.
export const PUBLIC = new Set(['school', 'clinic', 'temple', 'townhall', 'jail', 'park', 'cemetery']);
export const COMMERCIAL = new Set(['farm', 'bakery', 'smithy', 'tavern', 'market', 'mill', 'inn', 'tailor', 'carpenter']);
export const SEASON_YIELD = [0.6, 1.0, 1.8, 0.6]; // farm output multiplier by season (spring, summer, autumn, winter); mean 1.0
export const MEALS_PER_DAY = 3;
export const SHARE = { bakery: 0.40, mill: 0.17, grain: 0.25 }; // of the retail price of a loaf; the market keeps the rest
export const RENT_PER_DAY = 1.1;
export const GOODS = {
  grain:     { base: 0.36, cover: 45,  producer: 'farm',      daily: null },
  flour:     { base: 0.38, cover: 4,   producer: 'mill',      daily: null },
  bread:     { base: 0.90, cover: 0.8, producer: 'bakery',    daily: null },
  tools:     { base: 4.5,  cover: 30,  producer: 'smithy',    perPerson: 0.04 },   // ironware: nails, hinges, blades, pots (units/person/day)
  clothes:   { base: 12,   cover: 20,  producer: 'tailor',    perPerson: 0.012 },  // ~1.3 outfits per person-year
  furniture: { base: 40,   cover: 45,  producer: 'carpenter', perPerson: 0.005 },  // woodwork & furnishings
};
export const INPUT_COST = { smithy: 0.28, tailor: 0.3, carpenter: 0.25 }; // fraction of sale price spent on imported raw materials
export const JUNIOR = { captain: 'guard', tavernkeeper: 'server', farmer: 'laborer', doctor: 'nurse', innkeeper: 'laborer', baker: null };
export const TRADE_JOBS = ['baker', 'smith', 'tailor', 'carpenter', 'miller', 'server', 'merchant', 'laborer'];
export const MIN_AGE = { doctor: 24, teacher: 22, priest: 26, captain: 28, mayor: 30, clerk: 18, guard: 18, innkeeper: 22, tavernkeeper: 20 };
