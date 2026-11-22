// Business FORMATS: what a unit can become. Each is a pack venue template (+ variant) with economics.
// Evidence (see docs/CALIBRATION-METHOD.md "Business"): gross margin / cost shares from Sage + Toast UK + ATO cafe benchmarks (COGS ~30%, staff 30-38%, rent 10-15% of sales,
// net 2-8% for cafes); fastest-growing categories on UK high streets 2023-24 = barbers/beauty/nail, coffee shops, vape shops, convenience, discounters, gyms; net decliners =
// banks, betting shops, pubs, clothing (PwC/Local Data Company Store Openings & Closures; Centre for Social Justice 'seven pubs lost per new vape shop').
//   tmpl pack venue template   variant   own: indie|chain|charity   pl priceLevel 1-3   gm gross margin   off ratio of off-map-catchment sales to resident sales (passers-by, workers, wider catchment)
//   fit fit-out GBP/m2   area [min,max] m2   afflu elasticity of entry weight to local affluence (log)   w0 base entry weight   rev0 prior monthly revenue GBP (before any incumbent is observed)
//   own: owner occupation taken by the owner/manager
export const FORMATS = {
  corner_shop:   { tmpl: 'corner_shop', own: 'indie', pl: 1, gm: 0.24, off: 0.7, fit: 250, area: [30, 80], afflu: -0.1, w0: 1.0, rev0: 22000, ownerOcc: 'shop_owner_manager', chains: ['Londis', 'Nisa Local', 'Spar', 'Costcutter'], chainShare: 0.3 },
  supermarket:   { tmpl: 'small_supermarket', own: 'chain', pl: 2, gm: 0.27, off: 0.8, fit: 450, area: [150, 450], afflu: 0.1, w0: 0.25, rev0: 90000, ownerOcc: 'store_manager', chains: ['Co-op Food', 'Tesco Express', 'Sainsbury\'s Local', 'Iceland'] },
  ethnic_grocer: { tmpl: 'ethnic_grocer', own: 'indie', pl: 1, gm: 0.28, off: 0.8, fit: 200, area: [40, 110], afflu: -0.3, w0: 0.6, rev0: 17000, ownerOcc: 'shop_owner_manager' },
  bakery_chain:  { tmpl: 'bakery', variant: 'bakery', own: 'chain', pl: 1, gm: 0.62, off: 1.1, fit: 350, area: [50, 110], afflu: -0.5, w0: 0.25, rev0: 26000, ownerOcc: 'store_manager', chains: ['Greggs'] },
  bakery_trad:   { tmpl: 'bakery', variant: 'bakehouse', own: 'indie', pl: 1, gm: 0.6, off: 0.9, fit: 300, area: [40, 90], afflu: -0.3, w0: 0.35, rev0: 14000, ownerOcc: 'baker' },
  bakery_indie:  { tmpl: 'bakery', variant: 'sourdough', own: 'indie', pl: 3, gm: 0.62, off: 0.9, fit: 400, area: [40, 90], afflu: 1.6, w0: 0.55, rev0: 17000, ownerOcc: 'baker' },
  off_licence:   { tmpl: 'off_licence', own: 'indie', pl: 1, gm: 0.22, off: 0.7, fit: 150, area: [30, 70], afflu: -0.2, w0: 0.5, rev0: 16000, ownerOcc: 'shop_owner_manager', chains: ['Londis', 'Bargain Booze'], chainShare: 0.4 },
  vape_shop:     { tmpl: 'vape_shop', own: 'indie', pl: 1, gm: 0.5, off: 1.1, fit: 180, area: [25, 55], afflu: -0.5, w0: 0.6, rev0: 12000, ownerOcc: 'shop_owner_manager' },
  discount:      { tmpl: 'discount_store', own: 'chain', pl: 1, gm: 0.34, off: 1.0, fit: 220, area: [120, 400], afflu: -0.8, w0: 0.25, rev0: 36000, ownerOcc: 'store_manager', chains: ['Pound Bazaar', 'Bargain Hub'] },
  caff:          { tmpl: 'cafe', variant: 'caff', own: 'indie', pl: 1, gm: 0.66, off: 1.0, fit: 600, area: [40, 90], afflu: -0.7, w0: 0.7, rev0: 14000, ownerOcc: 'cafe_owner' },
  coffee_shop:   { tmpl: 'cafe', variant: 'coffee_shop', own: 'indie', pl: 3, gm: 0.72, off: 1.3, fit: 1100, area: [40, 90], afflu: 1.8, w0: 0.9, rev0: 15000, ownerOcc: 'cafe_owner' },
  family_cafe:   { tmpl: 'cafe', variant: 'family_cafe', own: 'indie', pl: 2, gm: 0.68, off: 0.9, fit: 800, area: [50, 100], afflu: 0.3, w0: 0.5, rev0: 14000, ownerOcc: 'cafe_owner' },
  pub_local:     { tmpl: 'pub', variant: 'local_boozer', own: 'indie', pl: 2, gm: 0.62, off: 0.6, fit: 700, area: [150, 300], afflu: -0.4, w0: 0.15, rev0: 36000, ownerOcc: 'publican' },
  pub_gastro:    { tmpl: 'pub', variant: 'gastropub', own: 'indie', pl: 3, gm: 0.66, off: 0.9, fit: 1300, area: [150, 300], afflu: 1.5, w0: 0.2, rev0: 42000, ownerOcc: 'publican' },
  takeaway_chicken: { tmpl: 'takeaway', variant: 'chicken_shop', own: 'indie', pl: 1, gm: 0.6, off: 1.0, fit: 700, area: [30, 70], afflu: -0.7, w0: 0.55, rev0: 15000, ownerOcc: 'shop_owner_manager' },
  takeaway_kebab: { tmpl: 'takeaway', variant: 'kebab_pizza', own: 'indie', pl: 1, gm: 0.62, off: 1.0, fit: 700, area: [30, 70], afflu: -0.3, w0: 0.5, rev0: 16000, ownerOcc: 'shop_owner_manager' },
  takeaway_curry: { tmpl: 'takeaway', variant: 'indian_curry', own: 'indie', pl: 2, gm: 0.64, off: 1.0, fit: 700, area: [35, 80], afflu: 0.2, w0: 0.4, rev0: 16000, ownerOcc: 'shop_owner_manager' },
  takeaway_chinese: { tmpl: 'takeaway', variant: 'chinese_takeaway', own: 'indie', pl: 1, gm: 0.64, off: 0.9, fit: 600, area: [30, 70], afflu: -0.2, w0: 0.3, rev0: 13000, ownerOcc: 'shop_owner_manager' },
  fish_chips:    { tmpl: 'takeaway', variant: 'fish_and_chips', own: 'indie', pl: 1, gm: 0.58, off: 0.9, fit: 700, area: [30, 70], afflu: -0.2, w0: 0.2, rev0: 14000, ownerOcc: 'shop_owner_manager' },
  restaurant:    { tmpl: 'restaurant', own: 'indie', pl: 2, gm: 0.68, off: 1.0, fit: 1000, area: [70, 160], afflu: 0.5, w0: 0.5, rev0: 32000, ownerOcc: 'restaurant_manager' },
  bistro:        { tmpl: 'restaurant', variant: 'bistro', own: 'indie', pl: 3, gm: 0.7, off: 1.3, fit: 1500, area: [70, 160], afflu: 2.0, w0: 0.35, rev0: 36000, ownerOcc: 'restaurant_manager' },
  barber:        { tmpl: 'barber', variant: 'classic', own: 'indie', pl: 1, gm: 0.88, off: 0.8, fit: 400, area: [25, 55], afflu: -0.2, w0: 0.9, rev0: 9000, ownerOcc: 'barber_hairdresser' },
  barber_premium: { tmpl: 'barber', variant: 'premium', own: 'indie', pl: 3, gm: 0.88, off: 1.0, fit: 800, area: [25, 55], afflu: 1.3, w0: 0.4, rev0: 11000, ownerOcc: 'barber_hairdresser' },
  salon:         { tmpl: 'salon', variant: 'hair_salon', own: 'indie', pl: 2, gm: 0.85, off: 0.8, fit: 600, area: [30, 70], afflu: 0.4, w0: 0.5, rev0: 11000, ownerOcc: 'barber_hairdresser' },
  nail_bar:      { tmpl: 'salon', variant: 'nail_bar', own: 'indie', pl: 1, gm: 0.82, off: 0.9, fit: 500, area: [25, 55], afflu: -0.1, w0: 0.7, rev0: 9000, ownerOcc: 'barber_hairdresser' },
  launderette:   { tmpl: 'launderette', own: 'indie', pl: 1, gm: 0.8, off: 0.5, fit: 900, area: [40, 90], afflu: -0.6, w0: 0.08, rev0: 6000, ownerOcc: 'shop_owner_manager' },
  bookmaker:     { tmpl: 'bookmaker', own: 'chain', pl: 1, gm: 0.82, off: 0.7, fit: 250, area: [40, 80], afflu: -1.2, w0: 0.12, rev0: 9000, ownerOcc: 'store_manager', chains: ['Ladbrokes', 'William Hill', 'Betfred', 'Coral'] },
  money_phone:   { tmpl: 'money_phone', own: 'indie', pl: 1, gm: 0.5, off: 1.2, fit: 250, area: [25, 55], afflu: -0.4, w0: 0.4, rev0: 8000, ownerOcc: 'shop_owner_manager' },
  charity_shop:  { tmpl: 'charity_shop', own: 'charity', pl: 1, gm: 0.9, off: 0.9, fit: 120, area: [50, 120], afflu: 0.2, w0: 0.45, rev0: 6500, ownerOcc: 'shop_supervisor', chains: ['Sue Ryder', 'British Heart Foundation', 'Oxfam', 'Cancer Research UK'] },
  estate_agent:  { tmpl: 'estate_agent', own: 'indie', pl: 3, gm: 0.9, off: 0.1, fit: 450, area: [40, 90], afflu: 1.2, w0: 0.12, rev0: 14000, ownerOcc: 'lettings_agent' },
};
// Units currently trading in pack templates outside FORMATS stay as they are (gym, pharmacy): they get the same P&L with these static parameters.
export const STATIC = {
  gym: { pl: 1, gm: 0.9, off: 1.2, fit: 300, afflu: 0.3, rev0: 25000, ownerOcc: null }, pharmacy: { pl: 1, gm: 0.3, off: 1.6, fit: 400, afflu: 0, rev0: 55000, ownerOcc: null, nhs: true },
  dentist: { pl: 2, gm: 0.9, off: 2, fit: 400, afflu: 0, rev0: 30000, ownerOcc: null, nhs: true },
};
export const TMPL_FORMATS = {}; for (const [id, f] of Object.entries(FORMATS)) (TMPL_FORMATS[f.tmpl] || (TMPL_FORMATS[f.tmpl] = [])).push(id);
export const MANAGED = new Set([...Object.values(FORMATS).map((f) => f.tmpl), ...Object.keys(STATIC), 'vacant_unit']);
// which resident-favourite slot a template feeds (routine/life.js fav.*)
export const FAV_SLOT = { cafe: 'cafe', pub: 'pub', takeaway: 'takeaway', barber: 'barber', salon: 'barber', launderette: 'launderette', pharmacy: 'pharmacy', gym: 'gym', corner_shop: 'shops', small_supermarket: 'shops', ethnic_grocer: 'shops', bakery: 'shops', discount_store: 'shops' };

// ---- name generator: patterns + word lists (no brand names; chains come from FORMATS.chains, which are already in the content pack)
const NOUNS = {
  caff: ['Caff', 'Cafe', 'Kitchen', 'Tea Rooms', 'Pit Stop', 'Corner Cafe'], coffee_shop: ['Bean', 'Grind', 'Press', 'Roast', 'Pour', 'Cup', 'Filter', 'Crema'], family_cafe: ['Kitchen', 'Cafe', 'Tea Room', 'Table'],
  bakery_trad: ['Bakehouse', 'Bakery', 'Bread & Cakes', 'Pie & Bake'], bakery_indie: ['Bakehouse', 'Bakery', 'Loaf', 'Crumb', 'Proof', 'Bread Counter'], corner_shop: ['Stores', 'Mini Market', 'Convenience', 'News & Food', 'Local'], ethnic_grocer: ['Supermarket', 'Foods', 'Mart', 'Halal Meats', 'Fruit & Veg'],
  off_licence: ['Wine & Spirits', 'Off Licence', 'Booze Stop', 'Drinks Store'], vape_shop: ['Vapes', 'Vape Lounge', 'Vapour', 'Cloud', 'Juice Bar'], takeaway_chicken: ['Chicken', 'Fried Chicken', 'Wings', 'Crispy', 'Chicken & Ribs'],
  takeaway_kebab: ['Grill', 'Kebab House', 'Pizza & Grill', 'Mangal', 'Doner'], takeaway_curry: ['Tandoori', 'Spice', 'Balti House', 'Curry House', 'Karahi'], takeaway_chinese: ['Garden', 'Dragon', 'Palace', 'Wok', 'House'], fish_chips: ['Fish Bar', 'Plaice', 'Chippy', 'Fryer'],
  restaurant: ['Restaurant', 'Kitchen', 'Grill', 'Table', 'House', 'Palace'], bistro: ['Bistro', 'Table', 'Dining', 'Kitchen & Bar', 'Social'], pub_local: ['Arms', 'Tavern', 'Inn', 'Hotel'], pub_gastro: ['Taproom', 'Kitchen', 'Arms', 'Larder'],
  barber: ['Barbers', 'Cuts', 'Kutz', 'Barber Shop', 'Fades'], barber_premium: ['Barber Co.', 'Grooming', 'Barber Club', 'Tonsorial'], salon: ['Hair', 'Hair Studio', 'Salon', 'Hair & Beauty'], nail_bar: ['Nails', 'Nail Bar', 'Nails & Beauty', 'Lash & Nails'],
  launderette: ['Launderette', 'Wash & Dry', 'Laundry'], money_phone: ['Phone Repair', 'Mobile & Money', 'Unlock Hub', 'Remit & Repair'], estate_agent: ['Lettings', 'Estates', 'Property', 'Homes'], bookmaker: ['Bets'], charity_shop: ['Shop'], discount: ['Bazaar', 'Hub'], supermarket: ['Local'], bakery_chain: ['Bakers'],
};
const ADJ = {
  default: ['Little', 'Corner', 'Golden', 'Royal', 'Lucky', 'Sunrise', 'Victoria', 'Albert', 'Station', 'Canal', 'Mill', 'Larkfield', 'Fresh', 'City', 'Elm'],
  hip: ['Dandelion', 'Foundry', 'Marlow', 'Sunday', 'Common', 'Social', 'Tandem', 'Folk', 'Nook', 'Alma', 'Good', 'Provisions', 'Hearth', 'Wren', 'Forage'],
  cuisine: { turkish: ['Anatolia', 'Istanbul', 'Bosphorus', 'Ephesus', 'Izmir', 'Antalya'], south_asian: ['Lahore', 'Dhaka', 'Shalimar', 'Sylhet', 'Punjab', 'Delhi', 'Karachi', 'Mumbai'], caribbean: ['Kingston', 'Jerk', 'Island', 'Rasta Pot', 'Caribbean'], italian: ['Rossi', 'Napoli', 'Roma', 'Sorrento'], chinese: ['Jade', 'Golden', 'Lucky', 'Happy', 'Peking'], polish: ['Polonia', 'Krakow', 'Babcia'], african: ['Lagos', 'Accra', 'Mama Ngozi', 'Addis'] },
};
const PAT = {
  hip: ['{A} & {N}', '{A} {N}', '{S} {N}', '{N} & Co', 'The {A} {N}', '{P} {N}'], plain: ['{S}\'s {N}', '{A} {N}', '{P} {N}', '{A} {N}', '{G}\'s {N}', '{S} & Sons {N}'] /* no "The {A} {N}": "The Larkfield Kutz" is a barber, not a pub */, pub: ['The {A} {N}', 'The {A2}', 'The {A} {N}'], cuisine: ['{C} {N}', '{C} {N}', 'The {C} {N}'],
};
const PUB = ['Railway Tavern', 'Prince Albert', 'Crown & Anchor', 'Lord Nelson', 'Wheatsheaf', 'Black Horse', 'Drovers', 'Greyhound', 'Navigation', 'Royal Oak', 'Red Lion', 'Fox & Hounds', 'Bell', 'Plough', 'Rose & Crown', 'Duke of York', 'Cross Keys'];
const PUB_GASTRO = ['Wren & Wheat', 'The Tap Room', 'Hops & Hearth', 'The Foundry Arms', 'The Larder & Lamb', 'Social Anchor'];
const HIP_FORMATS = new Set(['coffee_shop', 'bakery_indie', 'bistro', 'pub_gastro', 'barber_premium']);
const CUISINE_OF = { restaurant: null, bistro: ['italian'], takeaway_kebab: ['turkish'], takeaway_curry: ['south_asian'], takeaway_chinese: ['chinese'], takeaway_chicken: null, caff: null };
/** name(rng, fid, ctx{surname, given, place, cuisineW:{key:w}, taken:Set}) -> string. Chains pick from their list (unique if possible). */
export function makeName(rng, fid, ctx = {}) {
  const f = FORMATS[fid], taken = ctx.taken || new Set();
  if (ctx.chain && f.chains) { const free = f.chains.filter((c) => ![...taken].some((t) => t === c)); return rng.pick(free.length ? free : f.chains); }
  for (let tries = 0; tries < 12; tries++) {
    let s;
    if (fid === 'pub_local' && rng.chance(0.8)) s = 'The ' + rng.pick(PUB);
    else if (fid === 'pub_gastro') s = rng.pick(PUB_GASTRO);
    else {
      const nouns = NOUNS[fid] || ['Shop'], hip = HIP_FORMATS.has(fid);
      let cu = null; const cl = CUISINE_OF[fid] !== undefined ? CUISINE_OF[fid] : (fid === 'restaurant' || fid === 'ethnic_grocer' ? Object.keys(ctx.cuisineW || {}) : null);
      if (cl && cl.length && (fid !== 'ethnic_grocer' || rng.chance(0.6))) cu = fid === 'restaurant' || fid === 'ethnic_grocer' ? rng.weighted(cl, cl.map((k) => (ctx.cuisineW || {})[k] || 0.1)) : rng.pick(cl);
      const pats = cu && fid !== 'bistro' ? PAT.cuisine : hip ? PAT.hip : PAT.plain;
      s = rng.pick(pats).replace('{N}', rng.pick(nouns)).replace('{A}', rng.pick(hip ? ADJ.hip : ADJ.default)).replace('{S}', ctx.surname || rng.pick(ADJ.default)).replace('{G}', ctx.given || rng.pick(ADJ.default)).replace('{P}', ctx.place || 'Larkfield').replace('{C}', cu ? rng.pick(ADJ.cuisine[cu]) : rng.pick(ADJ.default));
      if (fid === 'bistro' && cu) s = rng.pick(ADJ.cuisine[cu]) + ' ' + rng.pick(nouns);
    }
    s = s.replace(/\s+/g, ' ').trim();
    if (!taken.has(s)) return s;
  }
  return (ctx.surname || 'New') + ' ' + (NOUNS[fid] ? NOUNS[fid][0] : 'Shop');
}
