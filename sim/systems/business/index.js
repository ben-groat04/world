// BUSINESS (W2-A): the life of the high street. Every commercial unit is a business (or a vacant unit) with an owner, a lease, a monthly P&L through the ledger,
// a reputation, regulars, and a lifecycle: open -> trade -> trim hours -> cut staff -> close -> void -> new tenant of a type that responds to local demand and rents.
//   QUERY  world.sys.business.query: manages(bid) weight(bid) venue(bid) list() vacant() vacancyRate() mix() stats() survival() voids() news(n) rentIndex() formats()
//   CMD    business.claimUnit{building,name,cause,pid?} (goals/housing)  business.start{pid,unit,type,loan?} (player)  business.openBusiness{type,unit,pid?,chain?,force?} (god)
//          business.closeBusiness{bid,reason?}  business.rentReview{unit,pct}  business.chainArrives{type?}  business.businessRatesCut{pct}  business.workAt{pid,bid}  business.becomeRegular{pid,bid}
//   EVENTS business.opened business.closed business.struggling business.recovered business.rent_review business.owner_change business.venueChanged business.start_failed business.rates
// Evidence is cited in docs/CALIBRATION-METHOD.md ("Business"); constants carry a one-line meaning. Money flows only through world.ledger; owners are real residents when they are
// (goals' start_business projects), otherwise off-map independents, chains (names already in the pack) or charities.
import { FORMATS, STATIC, MANAGED, TMPL_FORMATS, FAV_SLOT, makeName } from './types.js';
import { SOC } from '../social/encounters.js';
import { registerEvents, clamp, SEASON_ENERGY } from '../money/util.js';

const FOODSET = new Set(['corner_shop', 'small_supermarket', 'ethnic_grocer', 'bakery', 'off_licence', 'discount_store', 'cafe', 'pub', 'takeaway', 'restaurant', 'barber', 'salon', 'launderette', 'bookmaker', 'gym', 'charity_shop', 'money_phone', 'vape_shop']); // templates money routes resident spending to
const FOODG = new Set(['corner_shop', 'small_supermarket', 'ethnic_grocer', 'bakery', 'off_licence', 'discount_store']);
const TPD = 144, MONTH = Math.round(TPD * 30.4), YEAR = TPD * 365;
const EVENTS = [
  ['business.opened', 'A business opened in a unit', { name: 'string', fid: 'string', owner: 'string' }], ['business.closed', 'A business closed', { name: 'string', reason: 'string' }],
  ['business.struggling', 'A business cut hours or staff to survive', { name: 'string', stage: 'number' }], ['business.recovered', 'A struggling business restored hours', { name: 'string' }],
  ['business.rent_review', 'A commercial rent review changed a rent', { name: 'string', pct: 'number' }], ['business.owner_change', 'A business changed hands', { name: 'string' }],
  ['business.venueChanged', 'A venue changed type/name (the map reads venue names and types)', { from: 'string', to: 'string', name: 'string' }],
  ['business.start_failed', 'A would-be business owner could not open', { why: 'string' }], ['business.rates', 'Business rates changed', { pct: 'number' }],
];
// ---- constants with real-world meaning ------------------------------------------------------------------------------------------------------------------------------------
const RENT_M2 = { hs: 460, side: 330, arch: 115, special: 250 };  // GBP/m2/yr: inner-city high street (~GBP 43/sq ft zone A-ish); raised from 240 because rent was only 3-6% of turnover against 10-15% (Sage/ATO/Toast cafe benchmarks, BRC occupancy-cost surveys). Held-out check: rent/revenue
const ENERGY_M2 = 75, OVERHEAD_FIX = 330, CARD_FEE = 0.016;      // GBP/m2/yr; insurance+licences+accounts per month; card/platform fees share of sales
const RATES_MULT = 0.499, SBRR_FULL = 12000, SBRR_TAPER = 15000; // small business multiplier 2024/25; small business rate relief: 100% under RV 12k tapering to 0 at 15k
const OVERDRAFT = 10000, LOAN_MAX = 25000, LOAN_RATE = 0.06, LOAN_MONTHS = 60; // UK Start Up Loans: up to 25k, fixed 6%, 1-5 years
const REVIEW_MONTHS = 60, LEASE_MONTHS = 120;                    // 5-yearly upward-only rent reviews, 10-year leases (standard UK commercial lease)
const SIGMA_Q = 0.3, RHO_Q = 0.95;                                // persistent idiosyncratic quality (Jovanovic learning model); sd of monthly innovation scaled below
const RENT_TURNOVER = 0.11;                                       // open-market rent settles near ~11% of a unit's turnover (valuers/occupancy-cost surveys: rent 8-15% of sales for food/retail; Sage/ATO/BRC): landlords reprice to what the trade can bear
const MATCH_RATE = 0.075;                                          // monthly per-unit chance an entrant is found for a typical vacant unit (implies ~12-20 month voids; fits ~11-14% vacancy)
const ASK_DECAY = 0.015;                                          // vacant units' asking rent falls 1.5%/month toward the clearing rent
const RAMP_MONTHS = 8, RAMP_START = 0.6;                          // soft-launch: off-map catchment (passers-by, word of mouth, delivery apps) builds from 60% to 100% over ~8 months (new hospitality/retail openings take 6-12 months to reach run-rate)
const RUNWAY_MEDIAN = 5, RUNWAY_SD = 0.5;                          // founders raise working capital for ~5 months of fixed costs (UK Start Up Loans / British Business Bank guidance: 3-6 months), lognormal across founders
const COND_DECAY = 0.012, COND_FLOOR = 0.3, VOID_GRACE = 6;        // a unit empty > 6 months deteriorates (damp, services, shopfront) by ~1.2%/month; condition scales entry cost and entrant interest
const HOLDOUT_SHARE = 0.3, HOLDOUT_DECAY = 0.003, REDEV_SHARE = 0.08; // 30% of landlords (institutions/absentees valuing the asset on headline rent) concede only 0.3%/month; 8% of units are withheld for redevelopment/conversion for years (LDC/Savills/CBRE long-term vacancy drivers)
// Low-capital routes for a would-be owner (player or resident): no premises needed. Start-up sums and running costs from UK Start Up Loans / NCASBA (market traders) / British Business Bank guidance:
// average Start Up Loan ~GBP 10-12k, market pitch GBP 15-40/day, mobile food/trade van GBP 5-15k, home-based services a few hundred pounds. gm = gross margin, fixed = monthly fixed costs (pitch, van, insurance), rev0 = mature monthly sales.
const SOLO = { market_stall: { label: 'a market stall', cost: 1500, fixed: 320, gm: 0.42, rev0: 3600 }, pop_up: { label: 'a pop-up food stall', cost: 2500, fixed: 450, gm: 0.55, rev0: 4300 },
  mobile_trade: { label: 'a mobile trade (van)', cost: 9000, fixed: 380, gm: 0.62, rev0: 5200 }, home_based: { label: 'a home-based business', cost: 600, fixed: 90, gm: 0.8, rev0: 2200 } };
const LOAN_APPROVAL = 0.6; // Start Up Loans / bank lending to a start-up is a credit check + business-plan assessment, not automatic (hand-set; no credit => refused)
const CHAIN_CLOSE_STREAK = 9;                                     // chains rationalise stores after ~9 months of negative store contribution

export function createBusiness() {
  let W = null;
  const S = () => W.lf.business;
  const venueOf = (bid) => W.map.venueOfBuilding.get(bid);
  const macro = () => (W.lf.money ? W.lf.money.macro : { recession: 0, wage: 1, energy: 1, rentGrowth: 4.5 });
  const rngm = (k) => W.rngFor('business.' + k, W.tick);
  const monthIdx = () => Math.floor(W.tick / MONTH);
  const isTrading = (B) => B && B.status === 'trading';
  const money = (a, b, x, r, c) => { x = Math.round(x); if (x > 0) W.ledger.transfer(a, b, x, r, c || 0); };

  // ============================================================================================================== state
  function init(w) {
    if (w.lf.business) return;
    const rng = w.rngFor('business.init'), S0 = w.lf.business = { v: 1, biz: {}, nextId: 1, rentIdx: 1, ratesMult: RATES_MULT, A: 1, inc0: 0, prof0: 0, pop0: 0, acc: {}, past: [], voids: [], log: [], yr: {}, mix0: {}, cutLog: 0 };
    for (const v of w.map.lf.venues) {
      if (!MANAGED.has(v.template)) continue; const b = w.buildings.get(v.buildingId), mu = w.map.lf.units.find((u) => u.id === v.unitId); if (!b || !mu) continue;
      const m2 = mu.floorAreaM2 || 60, zone = v.zone || 'hs', base = (RENT_M2[zone] || 100) * m2 / 12;
      const B = { bid: b.id, vid: v.id, m2, zone, rent: Math.round(base * rng.float(0.85, 1.2)), qual: Math.exp(rng.gauss(0, 0.7)), reviewAt: w.tick + rng.int(1, REVIEW_MONTHS) * MONTH, leaseEnd: w.tick + rng.int(6, LEASE_MONTHS) * MONTH, prev: null };
      if (v.template === 'vacant_unit') { B.status = 'vacant'; B.since = w.tick - rng.int(0, 14) * MONTH; B.ask = B.rent; B.initVoid = true; S0.biz[b.id] = B; continue; }
      const f = formatFor(v, rng); Object.assign(B, { id: S0.nextId++, status: 'trading', fid: f.fid, tmpl: v.template, variant: v.variant || f.variant || null, name: v.name, born: w.tick - rng.int(2, 80) * MONTH, init: true,
        price: 1, q: rng.gauss(0, SIGMA_Q), rating: 3.6, ft: { vh: 0, ema: null }, loan: null, trim: null, scale: 1, loss: 0, ok: 0, last: null, regs: 0, stage: 0, fillR: 1, chainBack: f.own === 'chain' });
      B.own = ownerOf(b.id, f, rng); B.reserve = B.own.kind === 'chain' ? 0 : Math.round(Math.exp(rng.gauss(Math.log(15000), 0.8))); B.rev6 = [];
      S0.biz[b.id] = B;
    }
    S0.pop0 = w.living().length; const st = affluence(); S0.inc0 = st.inc || 1; S0.prof0 = st.prof || 0.1; S0.A = 1;
    S0.mix0 = mixCount();
  }
  function formatFor(v, rng) {
    const st = STATIC[v.template]; if (st) return { fid: null, ...st, own: 'indie' };
    const ids = TMPL_FORMATS[v.template] || []; let best = ids.find((i) => FORMATS[i].variant && FORMATS[i].variant === v.variant);
    const chainId = ids.find((i) => (FORMATS[i].chains || []).includes(v.name)); if (chainId) best = chainId;
    if (!best) { const nonChain = ids.filter((i) => FORMATS[i].own !== 'chain' && FORMATS[i].w0 > 0); best = v.template === 'bakery' ? 'bakery_trad' : v.template === 'salon' ? rng.weighted(['salon', 'nail_bar'], [0.6, 0.4]) : v.template === 'barber' ? 'barber' : nonChain[0] || ids[0]; }
    return { fid: best, ...FORMATS[best], variant: FORMATS[best].variant };
  }
  function ownerOf(bid, f, rng) {
    if (f.own === 'chain' || (f.chains && f.chains.includes(venueOf(bid).name))) return { kind: 'chain', pid: null, brand: venueOf(bid).name };
    if (f.own === 'charity') return { kind: 'charity', pid: null, brand: venueOf(bid).name };
    const occ = f.ownerOcc; for (const s of W.lf.slots) if (s.bid === bid && s.occ === occ) for (const id of s.filled) if (typeof id === 'number') return { kind: 'resident', pid: id };
    return { kind: 'indie', pid: null };
  }
  const fmt = (B) => (B.fid ? FORMATS[B.fid] : STATIC[B.tmpl] || { pl: 1, gm: 0.8, off: 1, fit: 300, afflu: 0, rev0: 15000 });

  // ============================================================================================================== indices
  function affluence() {
    let inc = 0, n = 0, prof = 0, hs = 0;
    for (const h of W.lf.households) { if (h.gone) continue; hs++; const x = h.income && h.income.net; if (x > 0) { inc += x; n++; } if (h.seg === 'settled_professionals' || h.seg === 'early_career') prof++; }
    return { inc: n ? inc / n : 0, prof: hs ? prof / hs : 0 };
  }
  const trading = () => Object.values(S().biz).filter(isTrading);
  const vacants = () => Object.values(S().biz).filter((B) => B.status === 'vacant');
  function mixCount() { const o = {}; for (const B of Object.values(S().biz)) if (isTrading(B)) { const k = B.fid || B.tmpl; o[k] = (o[k] || 0) + 1; } return o; }
  const unitsHs = () => Object.values(S().biz).filter((B) => B.zone === 'hs' || B.zone === 'side');
  function vacancyRate() { const u = unitsHs(); return u.length ? u.filter((B) => B.status === 'vacant').length / u.length : 0; }
  function demandIdx() { const m = macro(); return clamp(0.4 + 0.6 * S().A, 0.3, 2.2) * (1 - 0.3 * (m.recession || 0)) * clamp(W.living().length / (S().pop0 || 1), 0.6, 1.4); }
  const marketRentM2 = (zone) => (RENT_M2[zone] || 100) * S().rentIdx;
  const marketRent = (B) => Math.round(marketRentM2(B.zone) * B.m2 / 12);

  // ============================================================================================================== venue changes (the single place that mutates map/venue state)
  function applyVenue(bid, tmpl, variant, name) {
    const v = venueOf(bid), b = W.buildings.get(bid), T = W.pack.venues[tmpl]; if (!v || !b || !T) return false;
    const old = v.template, oldName = v.name, tail = (b.lf.address || '').includes(',') ? b.lf.address.slice(b.lf.address.indexOf(',')) : '';
    v.template = tmpl; v.category = T.category; v.name = name; v.variant = variant || null; v.capacity = T.capacity || 0; v.trim = null;
    b.type = tmpl; b.name = name; b.capacity = v.capacity; b.lf.template = tmpl; b.lf.category = T.category; b.lf.address = name + tail;
    const mu = W.map.lf.units.find((u) => u.id === v.unitId); if (mu) { mu.label = tmpl; mu.vacant = tmpl === 'vacant_unit'; mu.address = b.lf.address; }
    if (W._byType) { const l = W._byType[old]; if (l) { const i = l.indexOf(b); if (i >= 0) l.splice(i, 1); } (W._byType[tmpl] || (W._byType[tmpl] = [])).push(b); }
    const vb = W.rtx && W.rtx.venuesBy; if (vb) { const l = vb[old]; if (l) { const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); } (vb[tmpl] || (vb[tmpl] = [])).push(v); }
    if (W.soc && W.soc.venues) { const l = W.soc.venues, i = l.findIndex((x) => x.id === bid); if (i >= 0) l.splice(i, 1); if (SOC[tmpl] !== undefined) l.push({ id: bid, soc: SOC[tmpl], t: tmpl }); }
    W._shopNames = null;
    W.emit('business.venueChanged', { place: bid, salience: 0.3, tags: ['business', 'visible', 'map'], payload: { from: old, to: tmpl, name, fromName: oldName, variant: variant || null, category: T.category } });
    return true;
  }
  const bump = (kind, key) => { const y = (S().yr[W.time.year] || (S().yr[W.time.year] = { open: {}, close: {} }))[kind]; y[key] = (y[key] || 0) + 1; };
  function news(line, type, bid, importance = 2, people = []) { const L = S().log; L.push({ t: W.tick, line, type }); if (L.length > 80) L.shift(); W.log(line, { type: 'business', importance, buildingId: bid, people }); }

  // ============================================================================================================== footfall (hourly) and spending weights
  function hourly(w) {
    const bz = S().biz;
    for (const k in bz) { const B = bz[k]; if (B.status !== 'trading') continue; const occ = w.buildings.get(B.bid).occupants; if (!occ.size) continue; let n = 0; for (const p of occ) if (p.ext.pop.workplace.bid !== B.bid) n++; B.ft.vh += n; }
  }
  // Category shares of a household's local shop / leisure spending (ONS Family Spending proportions, rounded; inputs). Within a category venues compete on footfall, reputation, price and open days;
  // a category grows slowly with variety (n^0.3) rather than fixed, so a new cafe takes share from the old ones but also widens the market.
  const CAT = { corner_shop: 0.22, small_supermarket: 0.42, ethnic_grocer: 0.16, bakery: 0.08, off_licence: 0.06, discount_store: 0.1, cafe: 0.17, pub: 0.2, takeaway: 0.2, restaurant: 0.2, barber: 0.05, salon: 0.06, launderette: 0.03, bookmaker: 0.03, gym: 0.05, charity_shop: 0.025, money_phone: 0.025, vape_shop: 0.02 };
  let tsCache = { tick: -1, o: {} };
  const attract = (B) => { const ft = B.ft.ema == null ? 1 : Math.max(0.25, B.ft.ema / (S().ftMean[B.tmpl] || B.ft.ema || 1)); return (0.7 + 0.3 * Math.min(2, ft)) * Math.pow(B.rating / 3.6, 2) * Math.pow(B.price, -1.3) * (1 - (B.trim ? B.trim.days.length / 7 : 0)); };
  function typeSums() { if (tsCache.tick === W.tick) return tsCache.o; const o = {}; for (const B of trading()) { const t = (o[B.tmpl] || (o[B.tmpl] = { sum: 0, n: 0 })); t.sum += attract(B); t.n++; } tsCache = { tick: W.tick, o }; return o; }
  function weightOf(bid) {
    const B = S().biz[bid]; if (!B) return null; if (B.status !== 'trading') return 0; const c = CAT[B.tmpl]; if (c === undefined) return null; const t = typeSums()[B.tmpl];
    return c * Math.pow(t.n, 0.3) * attract(B) / Math.max(1e-6, t.sum) * 10;
  }

  // ============================================================================================================== monthly P&L, stress, closure
  const OWN_RESERVE = { resident: 0, indie: 1, charity: 1, chain: 0 };
  function monthlyBusiness(w) {
    const s = S(), m = macro(), rng = rngm('m'), mo = w.time.month, acc = s.acc; s.m = (s.m || 0) + 1; // months run (first two are warm-up: partial payroll/spending months)
    // --- indices
    const st = affluence(); s.A = 0.6 * (st.inc / s.inc0) / (m.wage || 1) + 0.4 * (st.prof / s.prof0 > 0 ? Math.min(2, st.prof / s.prof0) : 1);
    const vr = vacancyRate(); s.vac = vr; { const vl = vacants(); s.vacM = (s.vacM || 0) + vl.length; s.vacL = (s.vacL || 0) + vl.filter((B) => (w.tick - B.since) / MONTH > 36).length; }
    s.rentIdx = clamp(s.rentIdx * (1 + (m.rentGrowth / 100 * 0.5 + 0.35 * (0.11 - vr) + 0.25 * (s.A - 1) * 0.2) / 12), 0.55, 2.2); // asking rents follow demand: tight market raises, voids lower them
    const ftBy = {}, ftN = {}; for (const B of trading()) { if (B.ft.ema != null) { ftBy[B.tmpl] = (ftBy[B.tmpl] || 0) + B.ft.ema; ftN[B.tmpl] = (ftN[B.tmpl] || 0) + 1; } } s.ftMean = {}; for (const k in ftBy) s.ftMean[k] = ftBy[k] / ftN[k];
    const slotsBy = {}; for (const sl of w.lf.slots) (slotsBy[sl.bid] || (slotsBy[sl.bid] = [])).push(sl);
    const OCC = w._occ || (w._occ = Object.fromEntries(w.pack.jobs.map((o) => [o.id, o])));
    const station = w.map.station; let doorOf = (bid) => w.buildings.get(bid).door;
    // expected resident revenue = group's resident spend x this venue's share of the weights money used (smooths the multinomial noise of ~250 households choosing once a month)
    const G = { f: 0, l: 0 }, Wt = { f: 0, l: 0 }; for (const B of trading()) { if (!FOODSET.has(B.tmpl)) continue; const g = FOODG.has(B.tmpl) ? 'f' : 'l'; B.wt = weightOf(B.bid) || 0; G[g] += (acc[B.bid] ? acc[B.bid].res : 0); Wt[g] += B.wt; }
    for (const B of trading()) { if (!FOODSET.has(B.tmpl)) continue; const g = FOODG.has(B.tmpl) ? 'f' : 'l'; B.E = Wt[g] > 0 ? G[g] * B.wt / Wt[g] : 0; }
    const live = s.m >= 6, pay = (a, b2, x, r, c) => (live ? money(a, b2, x, r, c) : 0); // the first months only observe (partial payroll/spending months): no P&L is posted
    for (const B of trading()) {
      const f = fmt(B), A = acc[B.bid] || { res: 0, wage: 0 }, b = w.buildings.get(B.bid), acct = 'b:' + B.bid;
      B.ft.ema = B.ft.ema == null ? B.ft.vh : 0.7 * B.ft.ema + 0.3 * B.ft.vh; B.ft.vh = 0;
      // quality drifts (learning about the unit's true appeal) and sets reputation
      B.q = RHO_Q * B.q + rng.gauss(0, SIGMA_Q * Math.sqrt(1 - RHO_Q * RHO_Q));
      const sl = slotsBy[B.bid] || []; let n = 0, ok = 0, extWage = 0; for (const x of sl) { n += x.n; ok += x.filled.length + x.ext; extWage += x.ext * ((OCC[x.occ] ? OCC[x.occ].pay.median : 25000) / 12) * 1.1; } B.fillR = n ? ok / n : 1;
      const cap = Math.max(1, v_cap(B)), crowd = Math.max(0, B.ft.ema / Math.max(1, cap * 60) - 1);
      B.rating = clamp(3.55 + 0.9 * Math.tanh(B.q * 1.4) + 0.5 * (B.fillR - 0.9) - 0.25 * Math.max(0, B.price - 1.05) * 4 * (f.pl === 1 ? 1 : 0.4) - 0.3 * Math.min(1, crowd) + rng.gauss(0, 0.12), 1, 5);
      // --- fixed costs first (they also size the catchment of day-1 incumbents, below)
      const rent = B.rentFree && w.tick < B.rentFree ? 0 : B.rent, rv = B.rent * 12 * 0.95, relief = B.own.kind === 'charity' ? 0.8 : rv <= SBRR_FULL ? 1 : rv < SBRR_TAPER ? 1 - (rv - SBRR_FULL) / (SBRR_TAPER - SBRR_FULL) : 0;
      const rates = rv * s.ratesMult * (1 - Math.min(1, relief * (s.ratesRelief || 1) + (s.ratesCut || 0))) / 12;
      const energy = B.m2 * ENERGY_M2 / 12 * (m.energy || 1) * SEASON_ENERGY[mo] * (B.tmpl === 'launderette' ? 3 : 1) * (B.trim ? 0.93 : 1), fixed = rent + rates + energy + OVERHEAD_FIX + extWage + A.wage;
      // --- revenue: residents (via money's routing, share set by footfall/reputation/price) + off-map catchment customers (passers-by, workers, the wider area the 550-person sample stands in for)
      const fixedRev = !FOODSET.has(B.tmpl); // lettings fees, NHS contracts: not household shop/leisure spending
      B.resEma = B.E || 0; if (B.q0 === undefined) B.q0 = B.q;
      if (!fixedRev && B.k == null && s.m >= 3) { // day-1 input: an incumbent exists because its catchment sustains it; over three observation months size each one's off-map catchment so it starts near a typical margin (sector benchmark 2-8%), with spread
        B.cE = (B.cE || 0) + B.resEma; B.cF = (B.cF || 0) + fixed;
        if (s.m === 5) { const E = B.cE / 3, F = B.cF / 3, m0 = clamp(rng.gauss(0.07, 0.05), -0.03, 0.2), den = f.gm - CARD_FEE - (B.own.kind === 'chain' ? 0.03 : 0) - m0, need = den > 0.1 ? F / den : 0;
          B.k = clamp(need > 0 && E > 200 ? (need - E) / E : f.off, 0.1, 8); B.q0 = B.q; delete B.cE; delete B.cF; }
      }
      const recess = 1 - 0.15 * (m.recession || 0); // retail/hospitality sales fall a few % to ~10% in a deep recession (ONS retail sales GFC/2020); estate-agency volumes more (demandIdx)
      const ageM = B.opened != null ? (w.tick - B.opened) / MONTH : 99, ramp = RAMP_START + (1 - RAMP_START) * Math.min(1, ageM / RAMP_MONTHS), off = fixedRev ? (f.rev0 || 20000) * (f.nhs ? 1 : demandIdx()) * Math.exp(B.q * 0.5) * (1 + rng.gauss(0, 0.05)) : (B.k ?? f.off) * B.resEma * Math.exp(0.5 * (B.q - B.q0)) * recess * ramp * (1 + rng.gauss(0, 0.05)) * (B.trim ? 1 - 0.1 * B.trim.days.length : 1);
      pay('metropolis', acct, off, 'offmap_sales'); const rev = A.res + off;
      const gmEff = 1 - (1 - f.gm) / B.price; pay(acct, 'metropolis', rev * (1 - gmEff), 'stock');
      const over = OVERHEAD_FIX + rev * CARD_FEE + (B.own.kind === 'chain' ? rev * 0.03 : 0);
      const loanPay = B.loan ? Math.min(B.loan.left, B.loan.pm) : 0, interest = B.loan ? B.loan.left * LOAN_RATE / 12 : 0;
      pay(acct, 'metropolis', rent, 'rent'); pay(acct, 'council', rates, 'business_rates'); pay(acct, 'metropolis', energy + over, 'overheads'); pay(acct, 'metropolis', extWage, 'wages_offmap');
      if (B.loan) { pay(acct, 'metropolis', loanPay + interest, 'loan_service'); B.loan.left -= loanPay; if (B.loan.left < 1) B.loan = null; }
      const profit = rev - rev * (1 - gmEff) - A.wage - extWage - rent - rates - energy - over - interest;
      B.last = { rev: Math.round(rev), resid: Math.round(A.res), profit: Math.round(profit), rent: Math.round(rent), wages: Math.round(A.wage + extWage), rates: Math.round(rates), margin: rev > 0 ? profit / rev : 0 };
      B.rev6.push(rev); if (B.rev6.length > 6) B.rev6.shift();
      if (s.m < 6) { B.pm = null; B.loss = 0; B.ok = 0; } else B.pm = B.pm == null ? profit : 0.5 * B.pm + 0.5 * profit; if (s.m >= 6) B.loss = B.pm < -0.03 * rev ? B.loss + 1 : 0; B.ok = B.pm > 0 ? B.ok + 1 : 0; // two-month smoothing: one bad month is not distress
      // --- who covers a loss: chain HQ, resident owner's own money, off-map owner's reserve, then the overdraft
      let cash = w.ledger.balance(acct); const keep = Math.max(4000, 2 * fixed);
      if (cash < 0) {
        const need = -cash;
        if (B.own.kind === 'chain') { if (B.loss < CHAIN_CLOSE_STREAK) pay('metropolis', acct, need, 'chain_funding'); }
        else if (B.own.kind === 'charity') pay('metropolis', acct, need, 'charity_funding');
        else {
          let got = 0; const p = B.own.kind === 'resident' ? w.people.get(B.own.pid) : null;
          if (p && p.alive && p.money > 100) { got = Math.min(need, p.money * 0.6); pay(p.id, acct, got, 'owner_injection'); }
          const r2 = Math.min(B.reserve, need - got); if (r2 > 0) { B.reserve -= r2; pay('metropolis', acct, r2, 'owner_reserve'); }
        }
      } else if (B.own.kind !== 'chain' && B.own.kind !== 'charity' && cash > keep + 2000 && (w.tick - B.born) > 12 * MONTH) { const dr = cash - keep; pay(acct, 'metropolis', dr, 'owner_draw'); B.reserve += Math.min(3000, dr * 0.25); } // new owners keep their working capital for a year; later, surplus above ~2 months' costs is drawn and a quarter is saved
      cash = w.ledger.balance(acct); B.cash = cash;
      // --- owner stress follows the business
      const op = B.own.pid != null ? w.people.get(B.own.pid) : null;
      if (op && op.alive && op.ext.hl && B.loss >= 2) { op.ext.hl.stress = Math.min(1, (op.ext.hl.stress || 0) + 0.04 * Math.min(4, B.loss)); }
      if (op && op.alive && op.ext.pop && op.ext.pop.fin && B.loss >= 3) op.ext.pop.fin.stress = Math.min(1, (op.ext.pop.fin.stress || 0) + 0.03);
      // --- price discipline: cost-push passed on when margins are thin (limited by demand weight price^-1.3), eased when fat
      if (B.last.margin < 0.02 && B.price < 1.25) B.price = Math.min(1.25, B.price * 1.015); else if (B.last.margin > 0.14 && B.price > 0.9) B.price *= 0.99;
      // --- rent review / lease end
      if (w.tick >= B.reviewAt) rentReview(B, rng); if (w.tick >= B.leaseEnd) B.leaseEnd = w.tick + LEASE_MONTHS * MONTH;
      // --- distress stages and closure
      if (s.m >= 6) distress(B, rng);
    }
    for (const k in acc) delete acc[k];
  }
  const v_cap = (B) => { const v = venueOf(B.bid); return v ? v.capacity : 10; };
  function rentReview(B, rng, pct) {
    const mkt = marketRent(B), old = B.rent; const rv6 = B.rev6 && B.rev6.length >= 3 ? B.rev6.reduce((a, x) => a + x, 0) / B.rev6.length : 0; let nw = pct != null ? old * (1 + pct / 100) : Math.max(old, mkt * rng.float(0.92, 1.08), B.own && B.own.kind === 'chain' ? 0 : 0.9 * RENT_TURNOVER * rv6); // review also sees the tenant's turnover (comparables/turnover evidence) // upward-only (standard clause; ban only for new leases from 2026)
    B.reviewAt = W.tick + REVIEW_MONTHS * MONTH; nw = Math.round(nw); if (nw === old) return;
    B.rent = nw; const p = Math.round((nw / old - 1) * 100);
    if (Math.abs(p) >= 3) W.emit('business.rent_review', { place: B.bid, actors: B.own.pid != null ? [B.own.pid] : [], salience: p >= 15 ? 0.4 : 0.15, tags: ['business', 'rent'], payload: { name: B.name, pct: p, from: old, to: nw } });
  }
  function distress(B, rng) {
    const b = W.buildings.get(B.bid), cash = B.cash, indie = B.own.kind !== 'chain' && B.own.kind !== 'charity', fixed = B.rent + (B.last ? B.last.wages : 0) * 0.3 + 400;
    // closure triggers: insolvency (cash + reserve + overdraft gone), chain rationalisation, owner gives up after a long losing run, owner exit (retire/die/leave)
    let why = null;
    if (indie && cash < -OVERDRAFT && B.reserve <= 0 && B.loss >= 5) why = 'insolvent'; // lenders tolerate a short dip, not a run of losses
    else if (B.own.kind === 'chain' && B.loss >= CHAIN_CLOSE_STREAK) why = 'chain_rationalisation';
    else if (B.own.kind === 'chain' && macro().recession > 0.5 && B.loss >= 4 && rng.chance(0.08)) why = 'chain_restructuring';
    else if (indie && B.loss >= 8 && (B.reserve <= 0 || W.tick - B.born > 12 * MONTH) && rng.chance(Math.min(0.5, 0.08 * (B.loss - 6)))) why = 'owner_gave_up'; // in year one a founder still has runway/personal subsidy left: sunk fit-out and family money keep them going // after most of a year of losses
    else if (B.own.kind === 'charity' && B.loss >= 12) why = 'charity_withdrew';
    const op = B.own.pid != null ? W.people.get(B.own.pid) : null;
    if (!why && B.own.kind === 'resident' && (!op || !op.alive || !op.ext.pop || op.ext.pop.workplace.bid !== B.bid)) { succession(B, rng); if (B.status !== 'trading') return; }
    else if (!why && indie && rng.chance(0.0022 + (B.loss >= 3 ? 0.006 : 0))) why = B.own.kind === 'resident' ? 'owner_retired' : 'owner_moved_on'; // ~3%/yr lifestyle exits (retirement, family) + more when it is not paying
    else if (!why && B.own.kind === 'chain' && macro().recession > 0.3 && rng.chance(0.004)) why = 'chain_closing_branches';
    if (why) return close(B, why);
    // short-time working: drop a day / close earlier, then cut staff; restored after three profitable months
    const want = B.loss >= 6 ? 3 : B.loss >= 4 ? 2 : B.loss >= 2 && indie ? 1 : B.ok >= 3 ? 0 : B.stage;
    if (want !== B.stage) {
      const was = B.stage; B.stage = want; const v = venueOf(B.bid);
      const dow = (v && W.pack.venues[B.tmpl].hours && W.pack.venues[B.tmpl].hours.sun) ? 6 : 0;
      if (want >= 1) { v.trim = { days: [dow], eve: want >= 2 ? 1.5 : 1 }; B.trim = v.trim; } else { v.trim = null; B.trim = null; }
      const sc = want === 3 ? 0.6 : want === 2 ? 0.8 : 1;
      if (sc !== B.scale) { B.scale = sc; W.cmd('labour.resizeFirm', { bid: B.bid, scale: sc, protect: B.own.pid }); }
      if (want > was) { W.emit('business.struggling', { place: B.bid, actors: B.own.pid != null ? [B.own.pid] : [], salience: 0.3, tags: ['business', 'loss'], payload: { name: B.name, stage: want, rent: B.rent } }); if (want >= 2) news(`${B.name} has cut staff and opening hours.`, 'struggling', B.bid, 2); }
      else if (want === 0 && was > 0) W.emit('business.recovered', { place: B.bid, salience: 0.15, tags: ['business'], payload: { name: B.name } });
    }
  }
  function succession(B, rng) { // resident owner died / left / retired: family hands on (rare), sale to an off-map operator, or it closes
    const x = rng.next();
    if (x < 0.5) return close(B, 'owner_retired');
    B.own = { kind: 'indie', pid: null }; B.reserve = Math.round(Math.exp(rng.gauss(Math.log(6000), 0.7)));
    if (x > 0.85 && B.fid) { const f = FORMATS[B.fid]; const nm = makeName(rng, B.fid, ctxNames(rng)); renameBusiness(B, nm); }
    W.emit('business.owner_change', { place: B.bid, salience: 0.2, tags: ['business'], payload: { name: B.name } });
    W.cmd('labour.resizeFirm', { bid: B.bid, scale: B.scale, protect: B.own.pid });
  }
  function renameBusiness(B, nm) { const was = B.name; B.name = nm; applyVenue(B.bid, B.tmpl, B.variant, nm); news(`${was} is now ${nm}.`, 'rename', B.bid, 1); }

  // ---------------------------------------------------------------------------------------------- closing a business
  function close(B, why, cause = 0) {
    const bid = B.bid, b = W.buildings.get(bid), v = venueOf(bid), ageM = Math.round((W.tick - B.born) / MONTH);
    const regulars = regularsOf(bid), staff = W.lf.slots.filter((s) => s.bid === bid).reduce((n, s) => n + s.filled.filter((x) => typeof x === 'number').length, 0);
    const eid = W.emit('business.closed', { place: bid, cause, actors: B.own.pid != null ? [B.own.pid] : [], salience: 0.6, tags: ['business', 'loss', 'visible'], payload: { name: B.name, reason: why, fid: B.fid, tmpl: B.tmpl, ageMonths: ageM, jobs: staff, regulars: regulars.length, own: B.own.kind } });
    W.cmd('labour.closeFirm', { bid, reason: why === 'insolvent' || why === 'owner_gave_up' ? 'trading_losses' : why, cause: eid, permanent: true });
    const bal = W.ledger.balance('b:' + bid); if (bal > 0) money('b:' + bid, 'metropolis', bal, 'business_wind_down'); else if (bal < 0) money('metropolis', 'b:' + bid, -bal, 'business_wind_down'); // creditors absorb the loss
    if (B.loan) { B.loan = null; }
    const rec = { id: B.id, bid, fid: B.fid, tmpl: B.tmpl, name: B.name, born: B.born, died: W.tick, why, own: B.own.kind, init: !!B.init, jobs: staff }; S().past.push(rec); if (S().past.length > 400) S().past.shift(); bump('close', B.fid || B.tmpl);
    const old = { fid: B.fid, tmpl: B.tmpl, rent: B.rent, name: B.name }, prevRev = B.rev6 && B.rev6.length ? B.rev6.reduce((a, x) => a + x, 0) / B.rev6.length : 0;
    S().biz[bid] = { bid, vid: B.vid, m2: B.m2, zone: B.zone, status: 'vacant', since: W.tick, ask: Math.round(Math.max(B.rent * 1.02, B.own && B.own.kind === 'chain' ? 0 : 0.1 * prevRev)), rent: B.rent, qual: B.qual ?? Math.exp(rng2().gauss(0, 0.7)), prev: old, reviewAt: 0, leaseEnd: 0, cond: 1, hold: rng2().chance(HOLDOUT_SHARE), redev: rng2().chance(REDEV_SHARE) ? W.tick + Math.round((24 + 48 * rng2().next()) * MONTH) : 0 };
    applyVenue(bid, 'vacant_unit', null, 'TO LET');
    reassignFavs(bid, regulars);
    const lines = { insolvent: 'ran out of money', owner_gave_up: 'closed after a hard year', owner_retired: 'closed as the owner retired', chain_rationalisation: 'shut in a chain cost-cutting round', chain_restructuring: 'shut in a chain restructuring', chain_closing_branches: 'is one of the branches the company is closing', owner_moved_on: 'closed; the owners have moved on', charity_withdrew: 'closed, the charity pulling out', god: 'closed down' };
    news(`${old.name} ${lines[why] || 'closed'}${staff ? ` (${staff} local ${staff === 1 ? 'job' : 'jobs'} lost)` : ''}.`, 'closure', bid, 3, B.own.pid != null ? [B.own.pid] : []);
    for (const pid of regulars.slice(0, 20)) { const p = W.people.get(pid); if (!p) continue; W.moodlet(p, 'lost_local', `Lost their regular ${old.tmpl === 'pub' ? 'pub' : 'spot'}`, -0.1, 45 * TPD); }
    if (W.sys.comms && S().commsCool !== monthIdx()) { S().commsCool = monthIdx(); forumChatter('shop', regulars); }
    const op = B.own.pid != null ? W.people.get(B.own.pid) : null; if (op && op.alive && op.ext.hl) op.ext.hl.stress = Math.min(1, (op.ext.hl.stress || 0) + 0.25);
    return eid;
  }
  const rng2 = () => W.rngFor('business.x', W.tick, S().nextId);
  function forumChatter(kind, among) { const ids = (among && among.length ? among : W.living().map((p) => p.id)); const pid = ids[(W.tick + ids.length) % ids.length], p = W.people.get(pid); if (p && p.alive && p.ext.pop && W.commands.has('comms.forumPost')) { try { W.cmd('comms.forumPost', { author: pid, kind }); } catch (e) { /* forum not ready */ } } }

  // ============================================================================================================== regulars / third places
  const favKeys = (slot) => (slot === 'shops' ? ['shops'] : [slot]);
  function regularsOf(bid) { const out = [], tm = venueOf(bid).template, slot = FAV_SLOT[tm]; if (!slot) return out; for (const p of W.people.values()) { const f = p.alive && p.ext.rt && p.ext.rt.life && p.ext.rt.life.fav; if (f && (slot === 'shops' ? f.shops && f.shops.includes(bid) : f[slot] === bid)) out.push(p.id); } return out; }
  function candidates(slot) { const out = []; for (const B of trading()) if (FAV_SLOT[B.tmpl] === slot) out.push(B); return out; }
  const wantPl = (p) => { const n = p.ext.pop.fin ? p.ext.pop.fin.net : 20000; return n < 16000 ? 1 : n < 30000 ? 2 : 3; };
  function pickFav(p, cands, curBid, rng) {
    if (!cands.length) return null; const home = W.buildings.get(p.homeId); if (!home) return curBid; const wl = wantPl(p), dk = p.ext.rt.life.sociability > 0.5 ? 60 : 40; let tot = 0; const ws = [];
    for (const B of cands) { const d = W.buildings.get(B.bid).door, dist = Math.abs(d.x - home.door.x) + Math.abs(d.y - home.door.y), pl = fmt(B).pl * B.price; const age = (W.tick - B.born) / MONTH;
      let x = Math.exp(-dist / dk) * Math.pow(B.rating / 3.6, 2) * Math.exp(-0.55 * Math.abs(pl - wl)) * (age < 4 && !B.init ? 1.8 : 1) * (B.bid === curBid ? 3 : 1); ws.push(x); tot += x; }
    let r = rng.next() * tot; for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i].bid; } return cands[cands.length - 1].bid;
  }
  function reassignFavs(bid, who) {
    const rng = rngm('fav'); const tm = (venueOf(bid) || {}).template; // venue already vacant: find slots that referenced it
    for (const pid of who || []) { const p = W.people.get(pid); if (p) fixFavs(p, rng); }
  }
  function fixFavs(p, rng, cache) {
    const f = p.ext.rt && p.ext.rt.life && p.ext.rt.life.fav; if (!f) return; const cs = cache || {};
    for (const slot of ['cafe', 'pub', 'takeaway', 'barber', 'launderette', 'gym', 'pharmacy']) { const cur = f[slot]; if (cur == null) continue; const B = S().biz[cur]; if (B && B.status === 'trading') continue; f[slot] = pickFav(p, cs[slot] || (cs[slot] = candidates(slot)), null, rng); }
    if (f.shops) { const keep = f.shops.filter((b) => { const B = S().biz[b]; return !B || B.status === 'trading'; }); if (keep.length !== f.shops.length) { const c = cs.shops || (cs.shops = candidates('shops')); f.shops = keep; while (f.shops.length < 1 || (f.shops.length < 2 && keep.length < f.shops.length + 1)) { const n = pickFav(p, c.filter((B) => !f.shops.includes(B.bid)), null, rng); if (n == null) break; f.shops.push(n); if (f.shops.length >= 2) break; } } }
  }
  function churnFavs() { // monthly: a few people try somewhere else (new openings get a trial boost; poorer residents drift from premium places; habit keeps most put)
    const rng = rngm('churn'), cache = {}; const slots = ['cafe', 'pub', 'takeaway', 'barber', 'launderette']; let moved = 0;
    for (const p of W.people.values()) {
      if (!p.alive || !p.ext.rt || !p.ext.rt.life || !p.ext.rt.life.fav) continue; const f = p.ext.rt.life.fav; fixFavs(p, rng, cache);
      for (const slot of slots) { if (f[slot] === undefined || !rng.chance(0.035)) continue; const n = pickFav(p, cache[slot] || (cache[slot] = candidates(slot)), f[slot], rng); if (n != null && n !== f[slot]) { f[slot] = n; moved++; } }
      if (f.shops && rng.chance(0.03)) { const c = cache.shops || (cache.shops = candidates('shops')), n = pickFav(p, c, f.shops[0], rng); if (n != null && n !== f.shops[0]) { f.shops[0] = n; if (f.shops[1] === n) f.shops.splice(1, 1); moved++; } }
    }
    S().favMoves = (S().favMoves || 0) + moved;
  }

  // ============================================================================================================== openings
  function ctxNames(rng, owner) {
    const eth = {}; for (const p of W.people.values()) if (p.alive) { const e = p.ext.pop.eth; eth[e] = (eth[e] || 0) + 1; }
    const tot = Object.values(eth).reduce((a, b) => a + b, 0) || 1, sh = (...k) => k.reduce((s, x) => s + (eth[x] || 0), 0) / tot;
    const cuisineW = { south_asian: 0.3 + 3 * sh('pakistani', 'bangladeshi', 'indian'), caribbean: 0.1 + 3 * sh('caribbean'), african: 0.1 + 3 * sh('african'), turkish: 0.3 + 2 * sh('other_white', 'other'), italian: 0.3 + sh('white_british'), chinese: 0.1 + 3 * sh('chinese'), polish: 0.1 + 2 * sh('other_white') };
    const taken = new Set(Object.values(S().biz).filter(isTrading).map((B) => B.name)); const street = (() => { const st = W.map.lf.streets; return st && st.length ? rng.pick(st).name.replace(/ (Road|Street|Lane|Avenue)$/, '') : 'Larkfield'; })();
    let surname = null, given = null;
    if (owner && owner.pid != null) { const p = W.people.get(owner.pid); if (p) { surname = p.lastName; given = p.firstName; } }
    else { const grp = rng.weighted(Object.keys(eth), Object.values(eth)), o = W.pack.names.pickOrigin(rng, grp, 1975), nm = W.pack.names.pickName(rng, o, rng.chance(0.5) ? 'M' : 'F', 1975); surname = nm.last; given = nm.first; }
    return { surname, given, place: street, cuisineW, taken };
  }
  // a run-down unit loses the previous tenant's reusable fit-out and needs remedial works (tk, derelict)
  function entryCost(B, fid, f) { const takeover = B.prev && B.prev.tmpl === f.tmpl ? 0.3 : B.prev && FAV_SLOT[B.prev.tmpl] && FAV_SLOT[B.prev.tmpl] === FAV_SLOT[f.tmpl] ? 0.55 : 1, cond = B.cond ?? 1, tk = takeover + (1 - takeover) * (1 - cond), derelict = 1 + 1.2 * (1 - cond); return f.fit * B.m2 * tk * derelict + 3 * B.ask + 1.5 * (B.ask + 2200); }
  function expectedRev(fid) { const f = FORMATS[fid], same = trading().filter((B) => B.tmpl === f.tmpl && B.rev6.length >= 3), pool = same.filter((B) => B.fid === fid).concat(same.length && !same.some((B) => B.fid === fid) ? same : []);
    if (!pool.length) return f.rev0 * demandIdx(); const mean = pool.reduce((s2, B) => s2 + B.rev6.reduce((a2, x) => a2 + x, 0) / B.rev6.length, 0) / pool.length; return mean * Math.pow(same.length / (same.length + 1), 0.7); } // an entrant splits the incumbents' pie
  function viable(B, fid, tol = 0.1, owner = { kind: 'indie' }) { const f = FORMATS[fid], rev = expectedRev(fid), OCC = W._occ || (W._occ = Object.fromEntries(W.pack.jobs.map((o) => [o.id, o])));
    const wages = staffFor(fid, f, B.m2, owner).reduce((s2, x) => s2 + x.n * ((OCC[x.occ] ? OCC[x.occ].pay.median : 25000) / 12) * 1.1, 0);
    const rv = B.ask * 12 * 0.95, rates = rv <= SBRR_FULL ? 0 : rv * S().ratesMult * (rv < SBRR_TAPER ? (rv - SBRR_FULL) / 3000 : 1) / 12, profit = rev * f.gm - wages - B.ask - rates - B.m2 * ENERGY_M2 / 12 - OVERHEAD_FIX - rev * CARD_FEE;
    return profit > -tol * rev; }
  function formatWeights(B, kind, pid, capital, rng) {
    const s = S(), A = s.A, out = [], ids = Object.keys(FORMATS), op = pid != null ? W.people.get(pid) : null, occ = op && op.ext.pop.occ || op && op.ext.pop.lastOcc;
    const inUse = trading(); const cnt = {}; for (const x of inUse) cnt[x.tmpl] = (cnt[x.tmpl] || 0) + 1;
    for (const fid of ids) {
      const f = FORMATS[fid]; if (f.w0 <= 0) continue; if (kind === 'chain' && f.own !== 'chain' && !(f.chains && f.chainShare)) continue; if (kind === 'charity' && f.own !== 'charity') continue; if ((kind === 'resident' || kind === 'indie') && f.own !== 'indie' && !(f.chainShare)) continue;
      if (B.m2 < f.area[0] * 0.75 || B.m2 > f.area[1] * 1.5) continue; if (f.own === 'chain' && kind !== 'chain') continue;
      const cost = entryCost(B, fid, f); if (capital != null && cost > capital) continue; if (!viable(B, fid, kind === 'chain' ? 0.05 : -0.01, { kind })) continue; // entrants need an expected profit (chains tolerate thinner store margins)
      let w = f.w0 * Math.exp(f.afflu * (A - 1) * 1.6);
      const base = S().mix0[fid] || S().mix0[f.tmpl] || 0; const here = inUse.filter((x) => x.tmpl === f.tmpl).length; w *= Math.exp(-0.45 * Math.max(0, here - Math.max(1, (S().mix0[f.tmpl] || 1))));  // crowding: more of a kind than the neighbourhood sustained at the start
      const inc = inUse.filter((x) => x.tmpl === f.tmpl && x.last); if (inc.length) { const mg = inc.reduce((s2, x) => s2 + x.last.margin, 0) / inc.length; w *= clamp(1 + 7 * (mg - 0.03), 0.3, 2.4); } // entrants chase observed profits
      if (kind === 'chain') w *= clamp(1 - 1.5 * (macro().recession || 0), 0.1, 1) * (f.own === 'chain' ? 1 : f.chainShare);
      if (occ && ownerMatch(occ, f)) w *= 3;
      if (B.prev && B.prev.tmpl === f.tmpl && kind !== 'chain') w *= 1.4;
      out.push([fid, w]);
    }
    return out;
  }
  const OCCMATCH = { barber_hairdresser: ['barber', 'salon'], cook_chef: ['cafe', 'takeaway', 'restaurant'], baker: ['bakery'], barista_waiter: ['cafe'], retail_assistant: ['corner_shop', 'ethnic_grocer', 'off_licence', 'vape_shop', 'money_phone'], bar_staff: ['pub'], kitchen_porter_cook: ['takeaway'], shop_owner_manager: ['corner_shop', 'ethnic_grocer'], tailor_seamstress: ['money_phone'] };
  const ownerMatch = (occ, f) => (OCCMATCH[occ] || []).includes(f.tmpl);

  function openBusiness(B, fid, owner, opts = {}) {
    const f = FORMATS[fid], bid = B.bid, rng = rng2(), cause = opts.cause || 0, ctx = ctxNames(rng, owner); const chain = owner.kind === 'chain', charity = owner.kind === 'charity';
    const nm = opts.name || makeName(rng, fid, { ...ctx, chain: chain || charity });
    const wasVac = B.since != null ? Math.round((W.tick - B.since) / MONTH) : null; if (wasVac != null) { S().voids.push({ bid, months: wasVac, t: W.tick, init: !!B.initVoid }); if (S().voids.length > 300) S().voids.shift(); }
    owner.brand = chain || charity ? nm : undefined;
    const nb = { bid, vid: B.vid, m2: B.m2, zone: B.zone, qual: B.qual, id: S().nextId++, status: 'trading', fid, tmpl: f.tmpl, variant: f.variant || null, name: nm, own: owner, born: W.tick, price: 1, q: rng.gauss(-0.03, 0.22), rating: 3.5, ft: { vh: 0, ema: null }, loan: null, trim: null, scale: 1, loss: 0, ok: 0, last: null, regs: 0, stage: 0, fillR: 1, rev6: [], reserve: 0, q0: 0,
      k: catchmentFor(f), rent: Math.round(opts.rent || Math.max(B.ask || 0, 0) * (chain ? 1.05 : 1)), reviewAt: W.tick + REVIEW_MONTHS * MONTH, leaseEnd: W.tick + LEASE_MONTHS * MONTH, prev: B.prev || null, opened: W.tick, rentFree: W.tick + (chain ? 6 : 4) * MONTH }; // new 10-year leases typically carry a 3-6 month rent-free fit-out period
    if (!nb.rent) nb.rent = marketRent(B);
    // capital: resident owner's own money + start-up loan; off-map owners bring a lognormal pot; chains are funded centrally
    const cost = entryCost(B, fid, f) * (opts.cost == null ? 1 : opts.cost); const p = owner.pid != null ? W.people.get(owner.pid) : null; let loan = 0, own = 0;
    if (chain || charity) { own = cost; }
    else if (p) { own = Math.min(Math.max(0, p.money) * 0.8, cost); const want = cost - own; if (want > 0 && opts.loan !== false) loan = Math.min(LOAN_MAX, want); }
    else { own = Math.min(cost, Math.exp(rng.gauss(Math.log(35000), 0.6))); const want = cost - own; if (want > 0) loan = Math.min(LOAN_MAX, want); }
    const spent = own + loan; if (p && own > 0) money(p.id, 'b:' + bid, own, 'business_capital');
    if (loan > 0) { money('metropolis', 'b:' + bid, loan, 'business_loan'); nb.loan = { left: loan, pm: Math.round(loan / LOAN_MONTHS + 1) }; }
    if (!p) money('metropolis', 'b:' + bid, own, 'business_capital');
    const fitout = Math.round(spent * 0.62); money('b:' + bid, 'metropolis', fitout, 'fitout'); // fit-out and stock paid to off-map contractors/suppliers; the rest stays as the cash buffer
    if (chain || charity) nb.reserve = 0;
    else { // founders' working capital / personal subsidy: ~5 months (lognormal) of fixed costs beyond the fit-out; resident founders have it from a partner's income, family and overdraft (half as deep)
      const OCC = W._occ || (W._occ = Object.fromEntries(W.pack.jobs.map((o) => [o.id, o]))), wagesM = staffFor(fid, f, B.m2, owner).reduce((s2, x) => s2 + x.n * ((OCC[x.occ] ? OCC[x.occ].pay.median : 25000) / 12) * 1.1, 0);
      const fixedM = nb.rent + wagesM + OVERHEAD_FIX + B.m2 * ENERGY_M2 / 12, months = Math.exp(Math.log(RUNWAY_MEDIAN) + RUNWAY_SD * rng.gauss(0, 1));
      nb.reserve = Math.round(fixedM * months * (p ? 0.5 : 1)); nb.runwayM = +months.toFixed(1);
    }
    S().biz[bid] = nb;
    const staff = staffFor(fid, f, B.m2, owner); applyVenue(bid, f.tmpl, f.variant, nm);
    W.cmd('labour.openFirm', { bid, name: nm, staff });
    if (p) { let ok = false; try { const r = W.cmd('labour.hire', { pid: p.id, bid, occ: f.ownerOcc || staff[0].occ }); ok = r && r.ok && p.ext.pop.workplace.bid === bid; } catch (e) { ok = false; } if (!ok) nb.own = { kind: 'indie', pid: null }; }
    S().ftMean = S().ftMean || {};
    bump('open', fid);
    const jobs = staff.reduce((n, x) => n + x.n, 0), who = owner.kind === 'resident' ? `${p.firstName} ${p.lastName}` : owner.kind === 'chain' ? 'the chain' : owner.kind === 'charity' ? 'the charity' : 'a new operator';
    const eid = W.emit('business.opened', { place: bid, cause, actors: p ? [p.id] : [], salience: 0.55, tags: ['business', 'visible', 'success'], payload: { name: nm, fid, tmpl: f.tmpl, owner: owner.kind, rent: nb.rent, jobs, loan: Math.round(loan), voidMonths: wasVac } });
    news(`${nm} opens${p ? ` (${p.firstName} ${p.lastName}'s business)` : owner.kind === 'chain' ? ' (a chain branch)' : ''} in the old ${B.prev ? B.prev.name : 'unit'}: ${f.tmpl.replace(/_/g, ' ')}${f.variant ? ' / ' + f.variant.replace(/_/g, ' ') : ''}, ${jobs} jobs.`, 'opening', bid, 3, p ? [p.id] : []);
    if (W.sys.comms) forumChatter(W.rngFor('business.f', W.tick).chance(0.5) ? 'shop' : 'recommend', null);
    return eid;
  }
  function catchmentFor(f) { const same = trading().filter((B) => B.tmpl === f.tmpl && B.k != null); const k = same.length ? same.reduce((a, B) => a + B.k, 0) / same.length : f.off; return clamp(k * Math.exp(rngm('k').gauss(0, 0.25)), 0.1, 8); }
  function staffFor(fid, f, m2, owner) {
    const T = W.pack.venues[f.tmpl], st = (T.staff || []).map((x) => ({ occ: x.occ, n: Math.max(1, Math.round((Array.isArray(x.n) ? (x.n[0] + x.n[1]) / 2 : x.n) * (f.own === 'chain' || owner.kind === 'charity' ? 1 : 0.7))) }));
    if (owner.kind === 'charity') return [{ occ: 'shop_supervisor', n: 1 }, { occ: 'retail_assistant', n: 1 }];
    if (f.ownerOcc && !st.some((x) => x.occ === f.ownerOcc)) st.unshift({ occ: f.ownerOcc, n: 1 }); else if (f.ownerOcc) { const x = st.find((y) => y.occ === f.ownerOcc); x.n = Math.max(1, x.n); }
    if (!st.length) st.push({ occ: 'retail_assistant', n: 2 });
    return st;
  }

  // entrants for vacant units (monthly): off-map independents, chains, charities. Resident entrepreneurs arrive through goals (claimUnit).
  function matching() {
    const rng = rngm('match'), s = S(), dm = demandIdx();
    for (const B of vacants()) {
      const months = (W.tick - B.since) / MONTH; B.ask = Math.max(Math.round(marketRent(B) * (B.hold ? 0.95 : 0.82)), Math.round(B.ask * (1 - (B.hold ? HOLDOUT_DECAY : ASK_DECAY)))); // landlords concede slowly; hold-out landlords barely at all
      B.cond = Math.max(COND_FLOOR, 1 - COND_DECAY * Math.max(0, months - VOID_GRACE));
      if (months < 1 || (B.redev && W.tick < B.redev)) continue; // withheld for redevelopment/conversion: not on the market
      const attract = clamp(Math.pow(marketRent(B) / Math.max(1, B.ask), 1.2), 0.6, 2.2), h = MATCH_RATE * B.qual * dm * attract * (0.35 + 0.65 * B.cond);
      if (!rng.chance(clamp(h, 0, 0.5))) continue;
      const kinds = [['indie', 0.62], ['chain', B.m2 >= 90 ? 0.22 : 0.08], ['charity', 0.16 + 0.3 * clamp(months / 30, 0, 1)]]; // charities and 'meanwhile' uses take on units that stay empty
      const kind = rng.weighted(kinds.map((k) => k[0]), kinds.map((k) => k[1])); const ws = formatWeights(B, kind, null, kind === 'indie' ? 80000 : null, rng); if (!ws.length) continue;
      const fid = rng.weighted(ws.map((x) => x[0]), ws.map((x) => x[1])), f = FORMATS[fid];
      const owner = { kind: f.own === 'chain' || (kind === 'chain') ? 'chain' : f.own === 'charity' ? 'charity' : 'indie', pid: null };
      openBusiness(B, fid, owner);
    }
  }

  // ============================================================================================================== commands
  function resolveFounder(a) { if (a.pid != null) return a.pid; const ev = a.cause ? W.events.get(a.cause) : null; if (ev && ev.actors && ev.actors.length) return ev.actors[0]; return null; }
  function claimUnit(a) {
    const s = S(); let B = s.biz[a.building], pid = resolveFounder(a);
    if (B && s.lastClaim && s.lastClaim.bid === a.building && s.lastClaim.tick === W.tick) return true; // goals and housing both call: idempotent in one tick
    if (!B || B.status !== 'vacant') { const vs = vacants(); B = vs.length ? vs[Math.floor(W.rngFor('business.claim', W.tick, a.building).next() * vs.length)] : null; }
    if (!B) { W.emit('business.start_failed', { place: a.building, actors: pid != null ? [pid] : [], salience: 0.3, cause: a.cause || 0, tags: ['business'], payload: { why: 'no_vacant_unit' } }); return false; }
    const p = pid != null ? W.people.get(pid) : null; const owner = p ? { kind: 'resident', pid } : { kind: 'indie', pid: null }; const rng = rng2();
    const capital = p ? Math.max(0, p.money) * 0.8 + LOAN_MAX : 60000; const ws = formatWeights(B, owner.kind, pid, capital, rng);
    if (!ws.length) { W.emit('business.start_failed', { place: B.bid, actors: pid != null ? [pid] : [], salience: 0.3, cause: a.cause || 0, tags: ['business'], payload: { why: 'nothing_affordable_or_viable' } }); return false; }
    const fid = rng.weighted(ws.map((x) => x[0]), ws.map((x) => x[1])); s.lastClaim = { bid: B.bid, tick: W.tick };
    openBusiness(B, fid, owner, { cause: a.cause || 0 }); return true;
  }
  function startSolo(p, type, loanOk, loanAsked) {
    const T = SOLO[type]; if ((S().solo || []).some((x) => x.pid === p.id && x.on)) return { ok: false, why: 'already running one' };
    const own = Math.min(Math.max(0, p.money) * 0.8, T.cost), want = T.cost - own, loan = want > 0 && loanOk ? Math.min(LOAN_MAX, want) : 0;
    if (own + loan < T.cost) return { ok: false, why: `needs about £${T.cost}` + (loanAsked && !loanOk ? ' and the start-up loan was refused (credit check/assessment)' : ''), cost: T.cost, loanRefused: loanAsked && !loanOk };
    if (own > 0) money(p.id, 'metropolis', own, 'business_capital');
    (S().solo || (S().solo = [])).push({ pid: p.id, type, on: true, t0: W.tick, q: W.rngFor('business.solo', p.id, W.tick).gauss(0, 0.25), loan: loan ? { left: loan, pm: Math.round(loan / LOAN_MONTHS + 1) } : null, loss: 0 });
    W.emit('business.opened', { actors: [p.id], place: type === 'home_based' ? p.homeId : null, salience: 0.4, tags: ['business', 'success'], payload: { name: T.label, fid: type, owner: 'resident', rent: 0, jobs: 1, loan: Math.round(loan), voidMonths: null } });
    return { ok: true, cost: T.cost, loan: Math.round(loan), kind: type };
  }
  function soloMonthly() { // sole-trader P&L: sales ramp over 8 months, persistent quality, fixed costs and loan service paid by the owner; closes after 6 loss months or when the owner dies/leaves
    const rng = rngm('solo'), dm = demandIdx();
    for (const x of S().solo || []) {
      if (!x.on) continue; const p = W.people.get(x.pid), T = SOLO[x.type]; if (!p || !p.alive) { x.on = false; continue; }
      x.q = RHO_Q * x.q + rng.gauss(0, SIGMA_Q * Math.sqrt(1 - RHO_Q * RHO_Q)); const ageM = (W.tick - x.t0) / MONTH, ramp = 0.5 + 0.5 * Math.min(1, ageM / RAMP_MONTHS);
      const rev = T.rev0 * dm * Math.exp(x.q * 1.2) * ramp * (1 + rng.gauss(0, 0.08)), svc = x.loan ? Math.min(x.loan.left, x.loan.pm) + x.loan.left * LOAN_RATE / 12 : 0, profit = rev * T.gm - T.fixed;
      if (x.loan) { x.loan.left -= Math.min(x.loan.left, x.loan.pm); if (x.loan.left < 1) x.loan = null; }
      const net = profit - svc; if (net > 0) money('metropolis', p.id, net, 'self_employed_income'); else money(p.id, 'metropolis', Math.min(-net, Math.max(0, p.money)), 'business_loss');
      x.last = { rev: Math.round(rev), profit: Math.round(net) }; x.loss = net < 0 ? x.loss + 1 : 0;
      if (x.loss >= 6 || (ageM > 12 && W.rngFor('business.solo.x', p.id, W.tick).chance(0.004))) { x.on = false; W.emit('business.closed', { actors: [p.id], place: null, salience: 0.35, tags: ['business', 'loss'], payload: { name: T.label, reason: x.loss >= 6 ? 'insolvent' : 'owner_moved_on', fid: x.type, tmpl: x.type, ageMonths: Math.round(ageM), jobs: 1, regulars: 0, own: 'resident' } }); if (p.ext.hl) p.ext.hl.stress = Math.min(1, (p.ext.hl.stress || 0) + 0.15); }
    }
  }
  function typeToFid(type, B) { if (FORMATS[type]) return type; const ids = TMPL_FORMATS[type] || []; if (!ids.length) return null; return ids.slice().sort((x, y) => FORMATS[y].w0 - FORMATS[x].w0)[0]; }
  const commands = {
    'business.claimUnit': (w, a) => claimUnit(a),
    'business.openBusiness': (w, a) => {
      const bid = a.unit ?? a.bid, B0 = S().biz[bid]; const fid = typeToFid(a.type); if (!B0 || !fid) return false;
      if (B0.status === 'trading') { if (!a.force) return false; close(B0, 'god', a.cause); }
      const B = S().biz[bid]; const f = FORMATS[fid], p = a.pid != null ? w.people.get(a.pid) : null; const owner = p ? { kind: 'resident', pid: p.id } : { kind: a.chain || f.own === 'chain' ? 'chain' : f.own === 'charity' ? 'charity' : 'indie', pid: null };
      openBusiness(B, fid, owner, { cause: a.cause || 0, name: a.name }); return true;
    },
    'business.start': (w, a) => { // player/resident: start a business with savings + optional credit-checked start-up loan; cheap routes: stall/pop-up/van/home-based (no unit), `share:true` = share a unit (half fit-out, 60% rent)
      const p = w.people.get(a.pid); if (!p) return { ok: false, why: 'no such person' }; const type = a.type || a.fid;
      const fin = p.ext.pop && p.ext.pop.fin; let loanOk = a.loan !== false; if (loanOk && fin && fin.noCredit) loanOk = false; else if (loanOk && !W.rngFor('business.loan', W.tick, p.id).chance(LOAN_APPROVAL + (p.ext.pop && p.ext.pop.edu === 'level4plus' ? 0.1 : 0))) loanOk = false;
      const lowCost = Object.entries(SOLO).map(([k, v]) => ({ type: k, cost: v.cost }));
      if (SOLO[type]) return startSolo(p, type, loanOk, a.loan !== false);
      const B = S().biz[a.unit ?? a.bid]; if (!B || B.status !== 'vacant') return { ok: false, why: 'unit not vacant', cheaper: lowCost };
      const fid = typeToFid(type); if (!fid) return { ok: false, why: 'unknown type' }; const f = FORMATS[fid], sh = a.share ? 0.55 : 1, cost = entryCost(B, fid, f) * sh, cap = Math.max(0, p.money) * 0.8 + (loanOk ? LOAN_MAX : 0);
      if (f.own === 'chain') return { ok: false, why: 'chain format' };
      if (cost > cap) return { ok: false, why: 'needs about £' + Math.round(cost) + (loanOk ? ' (savings + loan up to £25k)' : a.loan === false ? '' : ' and the start-up loan was refused (credit check/assessment)'), cost: Math.round(cost), loanRefused: !loanOk && a.loan !== false, cheaper: lowCost.concat([{ type: 'share a unit', cost: Math.round(entryCost(B, fid, f) * 0.55) }]) };
      openBusiness(B, fid, { kind: 'resident', pid: p.id }, { loan: loanOk, cost: sh, rent: a.share ? B.ask * 0.6 : undefined }); return { ok: true, cost: Math.round(cost) };
    },
    'business.closeBusiness': (w, a) => { const B = S().biz[a.bid ?? a.unit]; if (!B || B.status !== 'trading') return false; close(B, a.reason || 'god', a.cause); return true; },
    'business.rentReview': (w, a) => { const B = S().biz[a.unit ?? a.bid]; if (!B || B.status !== 'trading') return false; rentReview(B, rng2(), a.pct ?? 20); return true; },
    'business.chainArrives': (w, a) => {
      const vs = vacants().sort((x, y) => y.m2 - x.m2); const fids = Object.keys(FORMATS).filter((id) => { const f = FORMATS[id]; return (f.own === 'chain' || f.chains) && (!a.type || id === a.type || f.tmpl === a.type); }); if (!vs.length || !fids.length) return false;
      for (const B of vs) { const ok = fids.filter((id) => B.m2 >= FORMATS[id].area[0] * 0.75 && B.m2 <= FORMATS[id].area[1] * 1.5); if (!ok.length) continue; const rng = rng2(); openBusiness(B, rng.pick(ok), { kind: 'chain', pid: null }, { cause: a.cause || 0 }); return true; }
      return false;
    },
    'business.businessRatesCut': (w, a) => { const s = S(); s.ratesCut = Math.min(1, (s.ratesCut || 0) + (a.pct ?? 30) / 100); w.emit('business.rates', { salience: 0.5, tags: ['business', 'god', 'macro'], payload: { pct: -(a.pct ?? 30) } }); news(`Business rates cut by ${a.pct ?? 30}% for local firms.`, 'rates', null, 2); return true; },
    'business.workAt': (w, a) => { const B = S().biz[a.bid]; if (!B || B.status !== 'trading') return { ok: false }; return w.cmd('labour.applyForJob', { pid: a.pid, bid: a.bid, force: !!a.force }); },
    'business.becomeRegular': (w, a) => { const p = w.people.get(a.pid), B = S().biz[a.bid]; const slot = B && FAV_SLOT[B.tmpl]; if (!p || !slot || !p.ext.rt || !p.ext.rt.life) return false; const f = p.ext.rt.life.fav; if (slot === 'shops') f.shops = [a.bid, ...(f.shops || []).filter((x) => x !== a.bid)].slice(0, 2); else f[slot] = a.bid; return true; },
  };
  const view = (B) => ({ bid: B.bid, status: B.status, name: B.name || null, fid: B.fid || null, tmpl: B.tmpl || null, variant: B.variant || null, owner: B.own ? { ...B.own } : null, rent: B.rent, m2: B.m2, ask: B.ask || null, rating: B.rating ? +B.rating.toFixed(2) : null, price: B.price || null, stage: B.stage || 0, last: B.last || null, cash: B.cash ?? null, loan: B.loan ? { ...B.loan } : null, ageMonths: B.born ? Math.round((W.tick - B.born) / MONTH) : null, vacantMonths: B.since != null && B.status === 'vacant' ? Math.round((W.tick - B.since) / MONTH) : null, regulars: B.regs || 0 });
  function survival() { // Kaplan-Meier over businesses opened during the run (init incumbents excluded: their age is unknown); right-censored at current age
    const co = []; for (const B of trading()) if (!B.init && B.born > 0) co.push({ age: (W.tick - B.born) / YEAR, dead: false }); for (const r of S().past) if (!r.init && r.born > 0) co.push({ age: (r.died - r.born) / YEAR, dead: true });
    const ev = co.filter((c) => c.dead).sort((x, y) => x.age - y.age), at = (y) => { let sv = 1; for (const e of ev) { if (e.age > y) break; const risk = co.filter((c) => c.age >= e.age).length; sv *= 1 - 1 / Math.max(1, risk); } return { year: y, surv: +sv.toFixed(3), atRisk: co.filter((c) => c.age >= y).length }; };
    return { n: co.length, closed: ev.length, curve: [1, 2, 3, 5, 8].map(at) };
  }
  const plugin = {
    name: 'business', version: '1.0.0', deps: ['labour', 'money', 'housing'],
    init(world) {
      W = world; registerEvents(world, EVENTS); init(world); S().ftMean = S().ftMean || {};
      for (const t of EVENTS) world.text.add(t[0], (c) => { const p = c.ev && c.ev.payload; return p ? (p.name || '') + ' ' + t[0].split('.')[1].replace(/_/g, ' ') : t[0]; });
      const L = world.ledger, T0 = L.transfer.bind(L); // tally money in and out of business accounts by purpose
      L.transfer = (from, to, amount, reason = '', cause = 0, opts) => {
        if (typeof to === 'string' && to.charCodeAt(0) === 98 && to.charCodeAt(1) === 58 && (reason === 'food_local' || reason === 'leisure_local')) { const k = +to.slice(2), a = S().acc[k] || (S().acc[k] = { res: 0, wage: 0 }); a.res += Math.round(amount); }
        else if (typeof from === 'string' && from.charCodeAt(0) === 98 && from.charCodeAt(1) === 58 && (reason === 'wage' || reason === 'tax:employerNI')) { const k = +from.slice(2), a = S().acc[k] || (S().acc[k] = { res: 0, wage: 0 }); a.wage += Math.round(amount); }
        return T0(from, to, amount, reason, cause, opts);
      };
    },
    clocks: { hour: (w) => hourly(w), month: (w) => { monthlyBusiness(w); matching(); soloMonthly(); churnFavs(); } },
    serialize: () => ({}),
    deserialize() { for (const B of Object.values(S().biz)) { const v = venueOf(B.bid); if (!v) continue; if (B.status === 'vacant') { v.template = 'vacant_unit'; v.name = 'TO LET'; v.category = 'vacant'; v.capacity = 0; } else { const T = W.pack.venues[B.tmpl]; v.template = B.tmpl; v.name = B.name; v.variant = B.variant; v.category = T.category; v.capacity = T.capacity || 0; v.trim = B.trim; } } W._shopNames = null; },
    on: {},
    query: {
      manages: (bid) => !!(W && W.lf.business && W.lf.business.biz[bid]), weight: (bid) => weightOf(bid), venue: (bid) => { const B = S().biz[bid]; return B ? view(B) : null; },
      list: () => Object.values(S().biz).map(view), vacant: () => vacants().map(view), vacancyRate: () => vacancyRate(), mix: () => mixCount(), mix0: () => ({ ...S().mix0 }), rentIndex: () => S().rentIdx, affluence: () => S().A,
      news: (n = 10) => S().log.slice(-n).reverse(), survival: () => survival(), voids: () => S().voids.map((x) => ({ ...x })), vacTail: () => ({ unitMonths: S().vacM || 0, longMonths: S().vacL || 0 }), past: () => S().past.map((x) => ({ ...x })), yearly: () => JSON.parse(JSON.stringify(S().yr)),
      jobs: () => W.lf.slots.filter((s) => S().biz[s.bid] && S().biz[s.bid].status === 'trading').reduce((n, s) => n + s.filled.filter((x) => typeof x === 'number').length, 0), formats: () => Object.keys(FORMATS),
      startOptions: (pid, unit) => { const B = unit != null ? S().biz[unit] : null; return { solo: Object.entries(SOLO).map(([k, v]) => ({ type: k, label: v.label, cost: v.cost })), unit: B && B.status === 'vacant' ? Object.keys(FORMATS).filter((id) => FORMATS[id].own !== 'chain').map((id) => ({ type: id, cost: Math.round(entryCost(B, id, FORMATS[id])), sharedCost: Math.round(entryCost(B, id, FORMATS[id]) * 0.55) })) : null, loan: { max: LOAN_MAX, rate: LOAN_RATE, approval: LOAN_APPROVAL } }; }, solo: () => (S().solo || []).map((x) => ({ pid: x.pid, type: x.type, on: x.on, last: x.last || null })),
      stats: () => ({ trading: trading().length, vacant: vacants().length, vacancyRate: vacancyRate(), rentIdx: S().rentIdx, affluence: S().A, favMoves: S().favMoves || 0 }),
    },
    commands,
  };
  return plugin;
}
export default createBusiness;
