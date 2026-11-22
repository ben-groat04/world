// MONEY (W1-C): double-entry ledger owner + macro price vector + monthly household budget cycle.
//   Monthly (world clock 'month'): pay (employer -> person, tax/NI/pension/student-loan -> hmrc), benefits (UC-style taper, child benefit, state pension, PIP, pension credit),
//   household bills (rent/mortgage, council tax, energy (seasonal), water, food, transport, phone, childcare, other), debt service (overdraft -> credit card -> payday ladder),
//   arrears, discretionary spending (to on-map venues and the Metropolis), interest, venue/landlord/council settlement, cost-of-living pressure per household.
//   QUERY  world.sys.money.query: balance(id) pressure(pidOrHh) budget(hh) macro() arrears(hh) debt(pid) netWorth(hh) flows() invariant() stats() creditRoom(pid)
//   CMD    money.windfall{pid,amount,reason} money.transfer{from,to,amount,reason} money.lend{from,to,amount} money.borrow{pid,amount,kind} money.repay{pid,amount}
//          money.energyShock{pct} money.setRate{rate}
//   EVENTS money.windfall money.arrears money.arrears_cleared money.cost_pressure money.debt_spiral money.benefit_claim money.loan money.loan_default money.estate money.macro_shift
import { liveHh } from '../../kernel/archive.js';
import { MoneyLedger } from './ledger.js';
import { taxNI, employerNI, minHourly, universalCredit, childBenefit, statePensionMonth, pensionCreditFloor, lhaFor } from './tax.js';
import { dayOfMonth, slotDay } from '../../util.js';
const ACC = new WeakMap();
import { clamp, sat, livePeople, isSharers, bedNeed, registerEvents, SEASON_ENERGY, gini, median } from './util.js';

const EVENTS = [
  ['money.windfall', 'A person received an unexpected sum (bonus, prize, gift, inheritance, god command)', { amount: 'number' }],
  ['money.arrears', 'A household missed a payment and fell into arrears', { kind: 'string', owed: 'number' }],
  ['money.arrears_cleared', 'A household cleared its arrears', { kind: 'string' }],
  ['money.cost_pressure', 'Cost-of-living pressure on a household crossed into the high band (query money.pressure)', { stress: 'number' }],
  ['money.debt_spiral', 'A household is borrowing at ruinous rates to cover essentials (payday-style debt)', { debt: 'number' }],
  ['money.benefit_claim', 'A household started claiming means-tested benefits', { monthly: 'number' }],
  ['money.loan', 'Informal or institutional loan made', { amount: 'number', kind: 'string' }],
  ['money.loan_default', 'A borrower failed to repay a loan', { amount: 'number' }],
  ['money.estate', 'A dead person\'s money was passed on', { amount: 'number' }],
  ['money.macro_shift', 'The macro vector changed regime (recession, energy shock, rate change)', { what: 'string' }],
];
const M = (w) => w.lf.money;
const FOOD_VENUES = new Set(['corner_shop', 'small_supermarket', 'ethnic_grocer', 'bakery', 'off_licence', 'discount_store']);
const LEISURE_VENUES = new Set(['cafe', 'pub', 'takeaway', 'restaurant', 'barber', 'salon', 'launderette', 'bookmaker', 'gym', 'charity_shop', 'money_phone', 'vape_shop']);
const CC_RATE = 0.0185, OD_FEE = 0.025, PD_ROLL = 0.35, PD_CAP = 1500;

function newMacro() { return { rate: 4.0, mortRate: 4.8, cpi: 3.0, price: 1, wage: 1, rent: 1, hpi: 1, energy: 1, benefit: 1, taxIdx: 1, nmw: 1, recession: 0, recMonths: 0, energyShock: 0, wageGrowth: 3.6, rentGrowth: 4.5, hpiGrowth: 2.5, month: 0 }; }

function initState(w) {
  const lf = w.lf; if (lf.money) return;
  lf.money = { macro: newMacro(), loans: [], nextLoan: 1, last: {}, stats: { taxIn: 0, benefitsOut: 0, months: 0 }, venueHealth: {}, venueBase: {} };
  const rng = w.rngFor('money.init');
  for (const hh of lf.households) initHousehold(w, hh, rng);
  // the one number every conservation check hangs off
  w.ledger.invariant();
}


export function initHousehold(w, hh, rng) {
  const B = w.pack.meta.benefits;
  const f = hh.fin = { rentArrears: 0, billArrears: 0, stress: 0, ratio: 0, buffer: 6, cause: 0, hunger: 0, mort: null, income: 0, essentials: 0, claim: false, pressured: false, spiralEv: 0 };
  const adults = hh.members.map((id) => w.people.get(id)).filter((p) => p && w.ageOf(p) >= 16);
  if (hh.rentPcm > 0 && hh.sav && hh.sav.arrears) f.rentArrears = Math.min(hh.sav.arrears, hh.rentPcm * 2.5);
  else if (hh.sav && hh.sav.arrears) f.billArrears = hh.sav.arrears;
  if (hh.mortgagePcm > 0) f.mort = { bal: Math.round(hh.mortgagePcm / 0.0059), rate: 4.8, term: rng.int(120, 300), fixEnd: w.tick + rng.int(6, 60) * 4380 };
  for (const p of adults) {
    const q = p.ext.pop, fin = q.fin;
    fin.cc = Math.round((fin.debt || 0) * 0.8); fin.payday = Math.round((fin.debt || 0) * 0.2 * (hh.sav && hh.sav.debt > 4000 ? 1 : 0.3)); fin.debt = fin.cc + fin.payday;
    fin.pension = Math.round(Math.max(0, w.ageOf(p) - 22) * Math.max(fin.gross || 0, 6000) * 0.045 * (q.activity === 'retired' ? 0.6 : 1) * Math.exp(rng.gauss(-0.5, 1.0)));
    fin.sp = 1; fin.priv = 0; fin.stress = 0;
    if (q.activity === 'retired') { const spA = B.statePensionWeeklyNewFull * 52; fin.sp = fin.gross < spA ? 0.8 : 1; fin.priv = Math.max(0, Math.round(fin.gross - spA * fin.sp)); }
    if (!fin.studentLoan) fin.studentLoan = 0;
  }
}

// ------------------------------------------------------------------ macro (annual-scale AR processes stepped monthly)
function stepMacro(w) {
  const m = M(w).macro, rng = w.rngFor('macro'), mo = w.time.month;
  m.month++;
  // inflation: mean-reverting around 2.8% with energy pass-through
  m.cpi += 0.15 * (2.8 - m.cpi) + rng.gauss(0, 0.22) + m.energyShock * 0.35;
  m.cpi = clamp(m.cpi, -0.5, 12);
  if (m.energyShock > 0) m.energyShock = Math.max(0, m.energyShock - 0.08);
  if (rng.chance(0.006)) { m.energyShock = rng.float(0.4, 1.0); m.energy *= 1 + 0.18 * m.energyShock; w.emit('money.macro_shift', { payload: { what: 'energy', size: m.energyShock }, salience: 0.45, tags: ['macro'] }); }
  m.energy *= 1 + (m.cpi - 2.8) / 1200 + 0.0003 * (1 - m.energy) * 6;
  m.energy = clamp(m.energy, 0.7, 2.5);
  // policy rate follows inflation with lag
  m.rate = clamp(m.rate + 0.12 * ((1.6 + 0.9 * m.cpi + 1.0 * m.recession * -1.5) - m.rate) / 3 + rng.gauss(0, 0.03), 0.1, 8);
  m.mortRate = clamp(m.rate + 0.9 + 0.15 * Math.max(0, m.energyShock), 2.5, 9);
  // recession regime
  if (m.recession > 0) { m.recMonths++; m.recession = Math.max(0, m.recession - (m.recMonths > 10 ? 0.07 : 0.015)); if (m.recession <= 0) { m.recMonths = 0; w.emit('money.macro_shift', { payload: { what: 'recovery' }, salience: 0.3, tags: ['macro'] }); } }
  else if (rng.chance(0.0075)) { m.recession = rng.float(0.35, 1); m.recMonths = 0; w.emit('money.macro_shift', { payload: { what: 'recession', size: m.recession }, salience: 0.6, tags: ['macro'] }); }
  m.price *= 1 + m.cpi / 1200;
  m.wageGrowth = clamp(1.4 + 0.55 * m.cpi + 1.3 - 3.0 * m.recession, -1, 8);
  m.wage *= 1 + m.wageGrowth / 1200;
  // long-run anchoring (ONS PIPR/AWE: private rents have tracked or slightly lagged earnings, ~3.9% vs wages ~4.2% nominal at cpi 2.8); was 3.0+0.7cpi = 5.0%/yr which outran wages 0.8 pt/yr and compounds to +50% real rent burden over 50y
  m.rentGrowth = clamp(1.4 + 0.9 * m.cpi - 3.5 * m.recession + rng.gauss(0, 0.4), -3, 12);
  m.rent *= 1 + m.rentGrowth / 1200;
  // house prices track earnings over the long run (ONS HPI/AWE ratio fluctuates round a slowly rising mean): base 3.9% not 2.8% so affordability does not improve without limit
  m.hpiGrowth = clamp(3.9 + 0.5 * (m.cpi - 2.8) - 1.0 * (m.mortRate - 4.8) - 6 * m.recession + rng.gauss(0, 0.5), -12, 12);
  m.hpi *= 1 + m.hpiGrowth / 1200;
  if (mo === 3) { m.benefit = m.price; m.nmw *= 1 + 0.04; } // April uprating
  if (mo === 3 && w.time.year >= 2028) m.taxIdx = m.price / 1.0;
}

// ------------------------------------------------------------------ credit
const odLimit = (p) => { const f = p.ext.pop.fin; return f.noCredit ? 0 : Math.round(clamp((f.monthNet || 0) * 0.6, 0, 1800) / 50) * 50; };
const ccLimit = (p) => { const f = p.ext.pop.fin; return f.noCredit ? 0 : Math.round(clamp((f.monthNet || 0) * 2.2, 0, 7000) / 100) * 100; };
/** Pay what cash + overdraft allow (never borrows on the card). Returns pounds paid. */
function payCash(w, p, to, amount, reason) { const room = Math.max(0, p.money + odLimit(p)), x = Math.min(Math.round(amount), room); if (x > 0) w.ledger.transfer(p.id, to, x, reason); return x; }
/** Pay `amount` from p to `to`. Waterfall: cash -> overdraft -> credit card -> payday (essentials only) -> unpaid. Returns {paid, unpaid, spiral}. */
function payWith(w, p, to, amount, reason, essential, cause) {
  amount = Math.round(amount); if (amount <= 0) return { paid: 0, unpaid: 0, spiral: false };
  const L = w.ledger, fin = p.ext.pop.fin;
  const room = p.money + odLimit(p); let spiral = false;
  if (room >= amount) { L.transfer(p.id, to, amount, reason, cause); return { paid: amount, unpaid: 0, spiral }; }
  let unpaid = amount - Math.max(0, room);
  if (room > 0) L.transfer(p.id, to, room, reason, cause);
  const ccRoom = ccLimit(p) - fin.cc;
  if (unpaid > 0 && ccRoom > 0) { const d = Math.min(unpaid, ccRoom); L.transfer('metropolis', p.id, d, 'credit', cause); fin.cc += d; L.transfer(p.id, to, d, reason, cause); unpaid -= d; }
  if (unpaid > 0 && essential && !fin.noCredit) { const cap = 600 - fin.payday; if (cap > 0) { const d = Math.min(unpaid, cap); L.transfer('metropolis', p.id, d, 'credit', cause); fin.payday += d; L.transfer(p.id, to, d, reason, cause); unpaid -= d; spiral = true; } }
  return { paid: amount - unpaid, unpaid, spiral };
}

// ------------------------------------------------------------------ income
function grossMonth(w, p, rng, macro, firmHealth) {
  const q = p.ext.pop, age = w.ageOf(p), B = w.pack.meta.benefits;
  if (q.activity === 'retired') return ((B.statePensionWeeklyNewFull * 52 * (q.fin.sp ?? 1) * macro.benefit) + (q.fin.priv || 0) * macro.price) / 12;
  const working = q.activity === 'employed' || (q.activity === 'student' && q.occ);
  let g = 0;
  if (working && q.pay > 0 && q.hours > 0) {
    g = q.pay * clamp(q.hours / 37.5, 0.12, 1.3) / 12;
    const c = q.contract;
    if (c === 'zero_hours') g *= rng.chance(0.2) ? rng.float(0.5, 0.8) : rng.float(0.9, 1.12);
    else if (c === 'self_employed' || c === 'gig') g *= Math.exp(rng.gauss(-0.04, 0.28)) * (firmHealth || 1);
    else g = Math.max(g, minHourly(age, c === 'apprenticeship') * macro.nmw * q.hours * 52 / 12);
  }
  if (q.job2) g += q.job2.monthly * macro.wage;
  return g;
}

// ------------------------------------------------------------------ monthly cycle
function monthly(w) {
  const S = M(w), macro = S.macro, rng = w.rngFor('money.month', w.tick), mo = w.time.month, pack = w.pack, T = pack.meta.tax, B = pack.meta.benefits, L = w.ledger, lf = w.lf;
  const dom = dayOfMonth(w), boundary = dom === 1; // households are processed on their own day of the month (no 1st-of-month event clump); macro, venues, loans and settlement stay monthly
  if (boundary) stepMacro(w);
  const OCC = w._occ || (w._occ = Object.fromEntries(pack.jobs.map((o) => [o.id, o])));
  const tick = w.tick, stats = S.stats, SEG = w._segById || (w._segById = Object.fromEntries(pack.meta.segments.map((s) => [s.id, s])));
  const acc0 = ACC.get(S) || ACC.set(S, { vin: new Map(), wag: new Map() }).get(S), venueIn = acc0.vin, wages = acc0.wag; // spend/wages accumulated over the month's staggered household runs (not serialised)
  const foodVenues = [], leisureVenues = [];
  for (const v of w.map.lf.venues) {
    const t = v.template, st = pack.venues[t] && pack.venues[t].staff; let wt = (st ? st.reduce((s, x) => s + (Array.isArray(x.n) ? (x.n[0] + x.n[1]) / 2 : x.n), 0) : 1) + 0.5;
    if (w.sys.business) { const bw = w.sys.business.query.weight(v.buildingId); if (bw != null) wt = bw; } // where residents actually spend follows footfall, reputation and price (business plugin)
    if (FOOD_VENUES.has(t)) foodVenues.push([v.buildingId, wt]); else if (LEISURE_VENUES.has(t)) leisureVenues.push([v.buildingId, wt]);
  }
  const pickVenue = (list) => { if (!list.length) return null; let tot = 0; for (const x of list) tot += x[1]; let r = rng.next() * tot; for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[list.length - 1][0]; };
  const taxBefore = L.flows.tax || 0, benBefore = L.flows.benefit || 0;
  let nPressured = 0, nHH = 0;
  const hv = (bid) => S.venueHealth[bid] ?? 1;
  for (const hh of liveHh(w)) {
    if (hh.gone || !slotDay(hh.id, dom)) continue;
    const ps = livePeople(w, hh); if (!ps.length) continue;
    const f = hh.fin, adults = ps.filter((p) => w.ageOf(p) >= 16), kids = ps.filter((p) => w.ageOf(p) < 16), nKids = kids.length;
    if (!adults.length) continue;
    nHH++;
    const sharers = isSharers(hh) && adults.length > 1;
    // ---------- 1. pay (employer -> person), tax, pension, student loan, state/private pension, student support
    let netEarnTot = 0, topGross = 0, workingAdults = 0, lcw = 0, studentsAll = true, retiredAll = true, claimable = 0;
    const inc = new Map();
    for (const p of adults) {
      const q = p.ext.pop, fin = q.fin, age = w.ageOf(p);
      const work = q.activity === 'employed' || (q.activity === 'student' && q.occ);
      const onmap = q.workplace && q.workplace.kind === 'onmap';
      const g = grossMonth(w, p, rng, macro, onmap ? hv(q.workplace.bid) : 1);
      let net = 0;
      if (g > 0) {
        if (q.activity === 'retired') {
          const spPart = Math.min(g, (B.statePensionWeeklyNewFull * 52 * (fin.sp ?? 1) * macro.benefit) / 12), priv = g - spPart;
          if (spPart > 0) L.transfer('hmrc', p.id, spPart, 'benefit:pension');
          if (priv > 0) L.transfer('metropolis', p.id, priv, 'pension_income');
        } else {
          const emp = onmap ? 'b:' + q.workplace.bid : 'e:' + ((OCC[q.occ] && OCC[q.occ].dest) || (q.workplace && q.workplace.dest) || 'home');
          const eni = employerNI(g * 12) / 12;
          if (emp.startsWith('e:')) L.transfer('metropolis', emp, g + eni, 'wage_fund');
          L.transfer(emp, p.id, g, 'wage'); if (eni > 0) L.transfer(emp, 'hmrc', eni, 'tax:employerNI');
          if (onmap) wages.set(q.workplace.bid, (wages.get(q.workplace.bid) || 0) + g + eni);
        }
        const emp2 = q.contract === 'permanent' || q.contract === 'fixed_term';
        const pen = q.activity !== 'retired' && emp2 && g * 12 > 10000 && age >= 22 && age < 67 ? g * 0.05 : 0;
        const tx = taxNI(g * 12 - pen * 12, T, { idx: macro.taxIdx, selfEmployed: q.contract === 'self_employed' || q.contract === 'gig', studentLoan: fin.studentLoan > 0 });
        const tax = (tx.tax + tx.ni) / 12, sl = Math.min(tx.sl / 12, fin.studentLoan);
        if (tax > 0) L.transfer(p.id, 'hmrc', tax, 'tax');
        if (pen > 0) { L.transfer(p.id, 'metropolis', pen, 'pension'); fin.pension += pen * 1.6; }
        if (sl > 0) { L.transfer(p.id, 'metropolis', sl, 'studentloan'); fin.studentLoan = Math.max(0, Math.round(fin.studentLoan - sl)); }
        net = g - tax - pen - sl;
        if (work) { netEarnTot += net; workingAdults++; }
        topGross = Math.max(topGross, g * 12);
      }
      if (q.activity === 'student' && q.school && (q.school.kind === 'university' || q.school.kind === 'college') && age >= 18 && (mo >= 8 || mo <= 4)) {
        if (q.school.kind === 'university') { L.transfer('metropolis', p.id, 620, 'student_support'); net += 620; fin.studentLoan += 620 * 9 / 12 * 0.5; }
        if (p.id % 3 !== 0) { L.transfer('metropolis', p.id, 220, 'family_support'); net += 220; }
      }
      fin.monthGross = g; fin.monthNet = net; inc.set(p.id, net);
      if (q.activity !== 'student') studentsAll = false; if (q.activity !== 'retired') retiredAll = false;
      if (q.activity === 'sick_disabled') lcw++;
      if (age < 66 && q.activity !== 'student' && q.activity !== 'retired') claimable++;
    }
    // ---------- 2. benefits (household level), paid to the best-placed adult
    const head = adults.slice().sort((a, b) => (inc.get(b.id) - inc.get(a.id)) || a.id - b.id)[0];
    const unit = lf.housing && lf.housing.units ? lf.housing.byId[hh.unit] : null;
    const beds = unit ? unit.bedrooms : hh.bedrooms || 2, social = hh.tenure === 'council' || hh.tenure === 'housing_assoc';
    const renter = hh.tenure === 'private_rent' || social || hh.tenure === 'shared_ownership';
    const wantBeds = bedNeed(w, ps);
    const cash0 = adults.reduce((s, p) => s + Math.max(0, p.money), 0);
    const childcareEst = kids.filter((k) => w.ageOf(k) < 11).length * 380;
    const couple = adults.length >= 2 && adults.some((p) => p.romance && p.romance.partnerId != null && adults.some((q2) => q2.id === p.romance.partnerId));
    let ben = 0;
    if (claimable > 0 && !studentsAll && cash0 < 16000) {
      const uc = universalCredit(B, { couple, age: Math.min(...adults.map((p) => w.ageOf(p))), kids: nKids, lcw, rent: renter ? hh.rentPcm : 0, lhaCap: lhaFor(B, Math.min(beds, wantBeds)) * 0.82, social, netEarn: netEarnTot, hasChildOrLcw: nKids > 0 || lcw > 0, childcare: workingAdults ? childcareEst : 0 }, macro.benefit);
      if (uc > 0 && (head.id * 2654435761 >>> 0) % 100 < 88) {
        L.transfer('hmrc', head.id, uc, 'benefit:uc'); ben += uc;
        if (!f.claim) { f.claim = true; w.emit('money.benefit_claim', { actors: [head.id], objects: [hh.id], salience: 0.2, cause: f.cause, tags: ['money'], payload: { monthly: Math.round(uc) } }); }
      } else if (f.claim && uc <= 0) f.claim = false;
    } else if (f.claim && !retiredAll) f.claim = false;
    if (nKids) { const cb = childBenefit(B, nKids, topGross, macro.benefit); if (cb > 0) { L.transfer('hmrc', head.id, cb, 'benefit:child'); ben += cb; } }
    for (const p of adults) { const q = p.ext.pop; if (q.health && q.health.limiting === 2 && w.ageOf(p) < 66 && (p.id * 40503 >>> 0) % 100 < 45) { const pip = B.disabilityPIPWeeklyStandardDaily * 52 / 12 * macro.benefit; L.transfer('hmrc', p.id, pip, 'benefit:pip'); ben += pip; } }
    if (retiredAll) {
      const incP = adults.reduce((s, p) => s + (inc.get(p.id) || 0), 0), fl = pensionCreditFloor(couple) * macro.benefit;
      if (incP < fl) { L.transfer('hmrc', head.id, fl - incP, 'benefit:pc'); ben += fl - incP; f.claim = true; } else f.claim = false;
    }
    // ---------- 3. household pot: couples pool income into the treasurer's account
    const treasurer = sharers ? null : head;
    if (!sharers && couple) for (const p of adults) { if (p === treasurer) continue; const net = inc.get(p.id) || 0; if (net > 0) L.transfer(p.id, treasurer.id, net * 0.9, 'household_pot'); }
    // ---------- 4. bills
    const nA = adults.length, nP = ps.length, seasonE = SEASON_ENERGY[mo] * macro.energy, pr = macro.price;
    const incomeHH = adults.reduce((s, p) => s + (inc.get(p.id) || 0), 0) + ben;
    const landlordAcc = hh.tenure === 'council' ? 'council' : hh.tenure === 'housing_assoc' || hh.tenure === 'shared_ownership' ? 'l:1' : hh.landlord != null && hh.landlord >= 0 ? 'l:' + hh.landlord : 'metropolis';
    let mortPay = 0;
    if (!f.mort && hh.mortgagePcm > 0) f.mort = { bal: Math.round(hh.mortgagePcm / 0.0059), rate: 4.8, term: 240, fixEnd: tick + 52560 * 3 };
    if (f.mort && f.mort.bal > 0) {
      const mm = f.mort;
      if (tick >= mm.fixEnd) { mm.rate = macro.mortRate; mm.fixEnd = tick + 52560 * 3; }
      const rr = mm.rate / 1200; mortPay = mm.bal * rr / (1 - Math.pow(1 + rr, -Math.max(12, mm.term)));
    }
    const ctBase = beds <= 1 ? 135 : beds === 2 ? 157 : beds === 3 ? 180 : 240;
    const nonStud = adults.filter((p) => p.ext.pop.activity !== 'student').length;
    let ct = ctBase * pr * 1.12 * (studentsAll ? 0 : nonStud === 1 ? 0.75 : 1);
    if (f.claim) ct *= retiredAll ? 0 : 0.3;
    const energy = (88 + 24 * beds + 8 * nP) * seasonE * pr * 0.92, water = (24 + 6 * nP) * pr;
    const incBracket = clamp(incomeHH / 2600, 0.55, 1.7);
    const food = (200 * nA + 120 * nKids) * (0.74 + 0.26 * incBracket) * pr;
    let transport = (hh.cars || 0) * 235;
    for (const p of adults) { const q = p.ext.pop, wp = q.workplace; if (q.activity === 'employed' && wp && wp.kind === 'offmap') { let c = wp.mode === 'rail' ? 150 : wp.mode === 'bus' ? 62 : wp.mode === 'cycle' ? 8 : 0; if (wp.hybrid) c *= 0.7; transport += c; } else if (!hh.cars) transport += 24; }
    transport *= pr;
    const phone = (34 + 15 * nA) * pr * 0.95;
    let childcare = 0;
    if (nKids) {
      const working = adults.filter((p) => p.ext.pop.activity === 'employed' || p.ext.pop.activity === 'student').length, allW = working >= (nA >= 2 ? 2 : 1);
      for (const k of kids) { const ka = w.ageOf(k); if (ka < 3 && allW) childcare += 640; else if (ka < 5 && working) childcare += 230; else if (ka < 12 && allW) childcare += 85; }
      childcare *= pr * 0.9; if (f.claim) childcare *= 0.3;
    }
    const own = hh.tenure === 'mortgage' || hh.tenure === 'owned_outright';
    const other = (45 * nA + 38 * nKids) * pr * (0.7 + 0.3 * incBracket) + (own ? 48 * pr + 40 * (beds - 1) * pr : 14 * pr);
    const bills = [['rent', renter ? hh.rentPcm : 0, landlordAcc, 'rent'], ['mortgage', mortPay, 'metropolis', 'mortgage'], ['counciltax', ct, 'council', 'counciltax'], ['energy', energy, 'metropolis', 'energy'], ['water', water, 'metropolis', 'water'],
      ['food', food, null, 'food'], ['childcare', childcare, 'metropolis', 'childcare'], ['transport', transport, 'metropolis', 'transport'], ['phone', phone, 'metropolis', 'telecom'], ['other', other, 'metropolis', 'goods']];
    if (own) bills.push(['upkeep', (unit && unit.cond < 0.5 ? 140 : 70) * pr, 'metropolis', 'repairs']);
    if (rng.chance(0.055)) bills.push(['shock', clamp(Math.exp(rng.gauss(Math.log(320), 0.9)) * (0.6 + 0.4 * incBracket), 40, 3500), 'metropolis', 'unexpected']);
    let essential = 0, unpaidTot = 0, spiral = false; const costs = {};
    const payers = sharers ? adults : [treasurer];
    for (const [name, amt, to, reason] of bills) {
      if (amt <= 0) continue;
      costs[name] = amt; if (name !== 'shock') essential += amt;
      const share = amt / payers.length, ess = name !== 'other' && name !== 'upkeep' && name !== 'shock';
      for (const p of payers) {
        let r;
        if (name === 'food') {
          const loc = share * 0.38, vb = pickVenue(foodVenues);
          r = payWith(w, p, 'metropolis', share - loc, 'food', true, f.cause);
          const r2 = payWith(w, p, vb != null ? 'b:' + vb : 'metropolis', loc, 'food_local', true, f.cause);
          if (vb != null) venueIn.set(vb, (venueIn.get(vb) || 0) + r2.paid);
          r = { paid: r.paid + r2.paid, unpaid: r.unpaid + r2.unpaid, spiral: r.spiral || r2.spiral };
          if (r.unpaid > 0) f.hunger++;
        } else r = payWith(w, p, to, share, reason, ess, f.cause);
        if (r.spiral) spiral = true;
        if (r.unpaid > 0) {
          unpaidTot += r.unpaid;
          if (name === 'rent') f.rentArrears += r.unpaid; else if (name === 'mortgage' || name === 'counciltax' || name === 'energy' || name === 'water') f.billArrears += r.unpaid;
          if ((name === 'rent' || name === 'mortgage') && !f.arrearsFlag) { f.arrearsFlag = true; w.emit('money.arrears', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.45, cause: f.cause, tags: ['money', 'housing'], payload: { kind: name, owed: Math.round(r.unpaid) } }); }
        }
      }
    }
    if (f.mort && mortPay > 0) { const interest = f.mort.bal * f.mort.rate / 1200; f.mort.bal = Math.max(0, f.mort.bal - (mortPay - interest)); f.mort.term = Math.max(1, f.mort.term - 1); hh.mortgagePcm = Math.round(mortPay); }
    // ---------- 5. debt service, arrears repayment, discretionary
    let debtMin = 0;
    for (const p of adults) {
      const fin = p.ext.pop.fin;
      if (p.money < 0) { const fee = -p.money * OD_FEE; L.transfer(p.id, 'metropolis', fee, 'overdraft_fee'); debtMin += fee; }
      if (fin.cc > 0) { fin.cc *= 1 + CC_RATE; const min = Math.min(fin.cc, Math.max(5, fin.cc * 0.035)), paid = payCash(w, p, 'metropolis', min, 'debt_service'); fin.cc = Math.max(0, fin.cc - paid); debtMin += min; fin.missed = paid < min * 0.999 ? (fin.missed || 0) + 1 : 0; }
      if (fin.payday > 0) { const paid = payCash(w, p, 'metropolis', fin.payday, 'debt_service'); fin.payday = Math.min(PD_CAP, Math.round((fin.payday - paid) * (1 + PD_ROLL))); debtMin += paid; }
      fin.noCredit = (fin.missed || 0) >= 3 || fin.payday >= 900;
    }
    if (spiral && !f.spiralEv) { f.spiralEv = tick; w.emit('money.debt_spiral', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.55, cause: f.cause, tags: ['money'], payload: { debt: Math.round(adults.reduce((s, p) => s + p.ext.pop.fin.payday + p.ext.pop.fin.cc, 0)) } }); }
    else if (f.spiralEv && !spiral && tick - f.spiralEv > 26280) f.spiralEv = 0;
    const liquid = adults.reduce((s, p) => s + Math.max(0, p.money), 0), monthlyEss = Math.max(400, essential);
    const owed = f.rentArrears + f.billArrears;
    if (owed > 0) {
      let left = Math.min(owed, Math.max(0, liquid - monthlyEss * 0.15) * 0.6 + (incomeHH > monthlyEss * 1.25 ? (incomeHH - monthlyEss) * 0.5 : 0));
      for (const p of adults) {
        if (left < 1) break; const avail = Math.min(left, Math.max(0, p.money)); if (avail < 1) continue;
        const rent = Math.min(f.rentArrears, avail); if (rent > 0) { L.transfer(p.id, landlordAcc, rent, 'rent_arrears'); f.rentArrears -= rent; left -= rent; }
        const bill = Math.min(f.billArrears, Math.max(0, avail - rent)); if (bill > 0) { L.transfer(p.id, 'council', bill, 'counciltax_arrears'); f.billArrears -= bill; left -= bill; }
      }
      f.rentArrears = Math.max(0, Math.round(f.rentArrears)); f.billArrears = Math.max(0, Math.round(f.billArrears));
      if (f.rentArrears + f.billArrears < 1 && f.arrearsFlag) { f.arrearsFlag = false; w.emit('money.arrears_cleared', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.25, tags: ['money'], payload: { kind: 'all' } }); }
    }
    const slack = incomeHH - essential - debtMin, seg = SEG[hh.seg];
    const season = mo === 11 ? 1.35 : mo === 0 ? 0.82 : mo === 7 ? 1.12 : 1;
    const prop = clamp(0.92 - 0.18 * (seg ? 1 - seg.money.pressure : 0.5), 0.5, 0.95);
    let disc = Math.max(0, slack) * prop * season * (f.rentArrears + f.billArrears > 0 ? 0.3 : 1) + Math.max(0, liquid - monthlyEss * 5) * 0.03;
    if (disc > 0) for (const p of (sharers ? adults : [treasurer])) {
      const pay = Math.min(disc / (sharers ? adults.length : 1), Math.max(0, p.money) * 0.97); if (pay < 1) continue;
      const vb = pickVenue(leisureVenues), loc = vb != null ? pay * 0.3 : 0;
      if (loc > 0) { L.transfer(p.id, 'b:' + vb, loc, 'leisure_local'); venueIn.set(vb, (venueIn.get(vb) || 0) + loc); }
      L.transfer(p.id, 'metropolis', pay - loc, 'discretionary');
    }
    for (const p of adults) { // revolvers pay down the card from comfortable cash; savers earn interest
      const fin = p.ext.pop.fin; if (fin.cc > 0 && p.money > monthlyEss * 1.5 / nA) payCash(w, p, 'metropolis', Math.min(fin.cc, p.money - monthlyEss * 1.2 / nA), 'debt_service'), fin.cc = Math.max(0, Math.round(fin.cc - Math.min(fin.cc, p.money)));
      if (p.money > 500) L.transfer('metropolis', p.id, p.money * 0.028 / 12, 'interest');
    }
    // ---------- 6. pressure
    const cashNow = adults.reduce((s, p) => s + p.money, 0), debtNow = adults.reduce((s, p) => s + p.ext.pop.fin.cc + p.ext.pop.fin.payday, 0);
    const ratio = incomeHH > 0 ? (essential + debtMin) / incomeHH : 2, buffer = cashNow / monthlyEss;
    const stress = sat(0.45 * sat((ratio - 0.55) / 0.55) + 0.28 * sat((1.6 - buffer) / 1.6) + 0.15 * (f.rentArrears + f.billArrears > 0 ? 1 : 0) + 0.12 * sat(debtNow / (Math.max(incomeHH, 400) * 6)) + (f.hunger > 0 ? 0.05 : 0));
    f.stress = +stress.toFixed(3); f.ratio = +ratio.toFixed(3); f.buffer = +buffer.toFixed(2); f.income = Math.round(incomeHH); f.essentials = Math.round(essential); f.benefits = Math.round(ben);
    f.last = { income: Math.round(incomeHH), benefits: Math.round(ben), ...Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, Math.round(v)])), debtService: Math.round(debtMin), disc: Math.round(disc) };
    if (!f.pressured && stress >= 0.62) { f.pressured = true; w.emit('money.cost_pressure', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.35, cause: f.cause, tags: ['money'], payload: { stress: f.stress, ratio: f.ratio, buffer: f.buffer } }); }
    else if (f.pressured && stress < 0.4) f.pressured = false;
    if (stress >= 0.62) nPressured++;
    if (unpaidTot <= 0) f.hunger = 0;
    for (const p of ps) { const fin = p.ext.pop.fin; fin.stress = f.stress; fin.savings = p.money; fin.debt = (fin.cc || 0) + (fin.payday || 0) + Math.max(0, -p.money); fin.arrears = p === head ? f.rentArrears + f.billArrears : 0; fin.gross = Math.round((fin.monthGross || 0) * 12); fin.net = Math.round((fin.monthNet || 0) * 12); p.debt = fin.debt; }
    // rare windfalls (bonus, prize, gift, inheritance from off-map kin)
    for (const p of adults) {
      const a = w.ageOf(p); if (!rng.chance(a >= 40 && a <= 72 ? 0.0011 : 0.0004)) continue;
      const big = a >= 40 && rng.chance(0.55), amt = big ? Math.exp(rng.gauss(Math.log(22000), 0.9)) : Math.exp(rng.gauss(Math.log(450), 0.9));
      L.transfer('metropolis', p.id, amt, big ? 'inheritance' : 'windfall');
      if (amt > 900) w.emit('money.windfall', { actors: [p.id], salience: amt > 8000 ? 0.45 : 0.25, tags: ['money'], payload: { amount: Math.round(amt), source: big ? 'inheritance' : 'windfall' } });
    }
  }
  { const cyc = S.cyc || (S.cyc = { pressured: 0, households: 0, tax: 0, benefits: 0 }), dt = (L.flows.tax || 0) - taxBefore, db = (L.flows.benefit || 0) - benBefore; cyc.pressured += nPressured; cyc.households += nHH; cyc.tax += dt; cyc.benefits += db; stats.taxIn += dt; stats.benefitsOut += db; }
  if (!boundary) return;
  // ---------- informal loans repaid / defaulted
  const loans = S.loans;
  for (let i = loans.length - 1; i >= 0; i--) {
    const ln = loans[i], b = w.people.get(ln.to);
    if (!b || !b.alive || ln.left <= 0) { loans.splice(i, 1); continue; }
    const pay = Math.min(ln.left, ln.monthly);
    if (b.money > pay * 2) { L.transfer(b.id, ln.from, pay, 'loan_repay'); ln.left -= pay; ln.missed = 0; }
    else if (++ln.missed >= 4) { w.emit('money.loan_default', { actors: [ln.to, typeof ln.from === 'number' ? ln.from : ln.to], salience: 0.4, cause: ln.eid, tags: ['money', 'social'], payload: { amount: Math.round(ln.left) } }); loans.splice(i, 1); continue; }
    if (ln.left < 1) loans.splice(i, 1);
  }
  // ---------- venues: health follows local demand + macro; suppliers/overheads out, visitors/non-resident customers top the till up
  const labour = w.sys.labour;
  for (const b of w.buildings.values()) {
    if (!b.lf || !b.lf.staff || !b.lf.staff.length) continue;
    const acc = 'b:' + b.id, closed = labour && labour.query.firmClosed ? labour.query.firmClosed(b.id) : false, wg = wages.get(b.id) || 0, local = venueIn.get(b.id) || 0;
    if (closed) { const bal = L.balance(acc); if (bal > 0) L.transfer(acc, 'metropolis', bal, 'business_wind_down'); else if (bal < 0) L.transfer('metropolis', acc, -bal, 'business_wind_down'); continue; }
    if (w.sys.business && w.sys.business.query.manages(b.id)) continue; // P&L, top-ups and closure of managed businesses belong to the business plugin
    const base = S.venueBase[b.id] = S.venueBase[b.id] === undefined ? local : S.venueBase[b.id] * 0.9 + local * 0.1;
    const demand = base > 20 ? clamp(local / base, 0.6, 1.4) : 1;
    const h0 = hv(b.id), h1 = clamp(0.55 * h0 + 0.45 * (0.65 + 0.35 * demand) - 0.22 * macro.recession + rng.gauss(0.03, 0.03), 0.15, 1.35); S.venueHealth[b.id] = h1;
    const out = wg * 0.75 + 120; L.transfer(acc, 'metropolis', out, 'suppliers_overheads');
    const target = wg * 0.1 * (h1 - 0.62) * 3, cur = L.balance(acc);
    if (cur < target) L.transfer('metropolis', acc, target - cur, 'visitor_sales'); else if (cur > target + 400) L.transfer(acc, 'metropolis', cur - target - 400, 'owner_draw');
  }
  // ---------- landlords remit, org balances settle, council/hmrc settle with the centre
  for (const k of Object.keys(L.balances)) { const v = L.balances[k]; if (k.startsWith('l:') && v > 0) L.transfer(k, 'metropolis', v * 0.93, 'landlord_remit'); else if (k.startsWith('e:') && v !== 0) { if (v > 0) L.transfer(k, 'metropolis', v, 'org_settle'); else L.transfer('metropolis', k, -v, 'org_settle'); } }
  { const tr = w.town.treasury; if (tr > 40000) L.transfer('council', 'metropolis', tr - 20000, 'council_services'); else if (tr < 5000) L.transfer('metropolis', 'council', 20000, 'central_grant'); }
  { const hb = L.balances.hmrc; if (hb > 0) L.transfer('hmrc', 'metropolis', hb, 'fiscal_settle'); else if (hb < 0) L.transfer('metropolis', 'hmrc', -hb, 'fiscal_settle'); }
  venueIn.clear(); wages.clear();
  stats.months++; S.last = { pressured: S.cyc.pressured, households: S.cyc.households, tax: Math.round(S.cyc.tax), benefits: Math.round(S.cyc.benefits) }; S.cyc = null;
}

function estate(w, p) {
  const bal = p.money; if (!bal || bal <= 0) return;
  const sp = p.family && p.family.spouseId != null ? w.people.get(p.family.spouseId) : null;
  if (sp && sp.alive) { w.ledger.transfer(p.id, sp.id, bal, 'inheritance'); w.emit('money.estate', { actors: [p.id, sp.id], salience: 0.35, tags: ['money', 'family'], payload: { amount: Math.round(bal) } }); return; }
  const ks = ((p.family && p.family.childrenIds) || []).map((id) => w.people.get(id)).filter((k) => k && k.alive && w.ageOf(k) >= 18);
  if (ks.length) { const each = Math.floor(bal / ks.length); for (const k of ks) w.ledger.transfer(p.id, k.id, each, 'inheritance'); w.ledger.transfer(p.id, ks[0].id, p.money, 'inheritance'); w.emit('money.estate', { actors: [p.id, ...ks.map((k) => k.id)], salience: 0.4, tags: ['money', 'family'], payload: { amount: Math.round(bal) } }); return; }
  w.ledger.transfer(p.id, 'council', bal, 'estate_unclaimed');
}

// ------------------------------------------------------------------ plugin
const hhOfAny = (w, x) => { const p = typeof x === 'number' ? w.people.get(x) : x && x.ext ? x : null; if (p) return p.ext.pop ? w.lf.households[p.ext.pop.hh] : null; return x && x.members ? x : null; };
export function createMoney() {
  let W = null;
  const plugin = {
    name: 'money', version: '1.0.0',
    eventTypes: EVENTS.map((e) => e[0]),
    clocks: { day: (w) => monthly(w) },
    init(world) {
      W = world; MoneyLedger.upgrade(world); registerEvents(world, EVENTS); initState(world);
      if (typeof world.on === 'function') world.on('death', (ev) => { if (ev && ev.person) estate(world, ev.person); });
    },
    query: {
      balance: (id) => W.ledger.balance(id),
      pressure: (x) => { const h = hhOfAny(W, x); if (!h || !h.fin) return null; const f = h.fin; return { stress: f.stress, ratio: f.ratio, buffer: f.buffer, arrears: f.rentArrears + f.billArrears, rentArrears: f.rentArrears, hunger: f.hunger, debt: livePeople(W, h).reduce((s, p) => s + (p.ext.pop.fin.cc || 0) + (p.ext.pop.fin.payday || 0), 0), claiming: f.claim, spiral: !!f.spiralEv }; },
      // Household monthly budget. `income` and all cost lines are for the WHOLE HOUSEHOLD (partners' pay + benefits); when x is a person id the result also carries
      // that person's own take-home (`personNetMonth`/`personNetYear`, the same figure as p.ext.pop.fin.net) so a UI can show 'you £X of the household's £Y'
      // (the inspector earlier printed household income next to the person's own annual net, which looked inconsistent).
      budget: (x) => { const h = hhOfAny(W, x); if (!h || !h.fin) return null; const p = typeof x === 'number' ? W.people.get(x) : x, q = p && p.ext && p.ext.pop && p.ext.pop.fin;
        return { ...h.fin.last, scope: 'household', adults: livePeople(W, h).filter((a) => W.ageOf(a) >= 16).length, ...(q ? { personNetMonth: Math.round(q.monthNet || 0), personNetYear: Math.round(q.net || 0), incomeYear: (h.fin.last.income || 0) * 12 } : {}) }; },
      macro: () => ({ ...M(W).macro }),
      arrears: (x) => { const h = hhOfAny(W, x); if (!h || !h.fin) return { rent: 0, bills: 0, months: 0 }; return { rent: h.fin.rentArrears, bills: h.fin.billArrears, months: h.rentPcm > 0 ? h.fin.rentArrears / h.rentPcm : 0 }; },
      debt: (pid) => { const p = W.people.get(pid); if (!p || !p.ext.pop) return 0; const f = p.ext.pop.fin; return (f.cc || 0) + (f.payday || 0); },
      creditRoom: (pid) => { const p = W.people.get(pid); return p ? Math.max(0, ccLimit(p) - p.ext.pop.fin.cc) + Math.max(0, odLimit(p) + Math.min(0, p.money)) : 0; },
      income: (pid) => { const p = W.people.get(pid); return p && p.ext.pop ? { gross: p.ext.pop.fin.monthGross || 0, net: p.ext.pop.fin.monthNet || 0 } : null; },
      netWorth: (x) => { const h = hhOfAny(W, x); if (!h) return 0; const ps = livePeople(W, h); let v = ps.reduce((s, p) => s + p.money + (p.ext.pop.fin.pension || 0) - (p.ext.pop.fin.cc || 0) - (p.ext.pop.fin.payday || 0) - (p.ext.pop.fin.studentLoan || 0) * 0.0, 0); const hs = W.sys.housing; if (hs) { const e = hs.query.equity(h.id); v += e || 0; } return v; },
      flows: () => ({ ...W.ledger.flows }),
      invariant: () => W.ledger.invariant(),
      stats: () => ({ ...M(W).stats, last: M(W).last, loans: M(W).loans.length }),
      loans: (pid) => M(W).loans.filter((l) => l.to === pid || l.from === pid).map((l) => ({ ...l })),
    },
    commands: {
      'money.windfall': (w, a) => { const p = w.people.get(a.pid ?? a.person); if (!p || !(a.amount > 0)) return false; w.ledger.transfer('metropolis', p.id, a.amount, 'windfall', a.cause || 0); w.emit('money.windfall', { actors: [p.id], salience: 0.5, cause: a.cause || 0, tags: ['money', 'god'], payload: { amount: Math.round(a.amount), source: a.reason || 'windfall' } }); return true; },
      'money.transfer': (w, a) => { const id = w.ledger.transfer(a.from, a.to, a.amount, a.reason || 'transfer', a.cause || 0, { noOverdraft: !!a.noOverdraft }); return id > 0; },
      'money.lend': (w, a) => {
        const from = w.people.get(a.from), to = w.people.get(a.to); if (!from || !to || !(a.amount > 0) || from.money < a.amount) return false;
        w.ledger.transfer(from.id, to.id, a.amount, 'loan_informal', a.cause || 0);
        const eid = w.emit('money.loan', { actors: [from.id, to.id], salience: 0.3, cause: a.cause || 0, tags: ['money', 'social'], payload: { amount: Math.round(a.amount), kind: 'informal' } });
        M(w).loans.push({ id: M(w).nextLoan++, from: from.id, to: to.id, left: Math.round(a.amount), monthly: Math.max(10, Math.round(a.amount / (a.months || 6))), missed: 0, eid }); return true;
      },
      'money.borrow': (w, a) => {
        const p = w.people.get(a.pid); if (!p || !(a.amount > 0) || !p.ext.pop) return { ok: false };
        const fin = p.ext.pop.fin, kind = a.kind || 'bank'; let amt = Math.round(a.amount);
        if (kind === 'family') { // richest living kin in the world, else off-map family
          const kin = [p.family.motherId, p.family.fatherId, p.family.spouseId, ...(p.family.childrenIds || [])].map((id) => (id != null ? w.people.get(id) : null)).filter((q) => q && q.alive && q.id !== p.id && q.money > amt * 2.5).sort((x, y) => y.money - x.money || x.id - y.id);
          if (kin.length) return { ok: w.cmd('money.lend', { from: kin[0].id, to: p.id, amount: amt, cause: a.cause }), amount: amt, from: kin[0].id };
          w.ledger.transfer('metropolis', p.id, amt, 'loan_informal', a.cause || 0); M(w).loans.push({ id: M(w).nextLoan++, from: 'metropolis', to: p.id, left: amt, monthly: Math.max(10, Math.round(amt / 8)), missed: 0, eid: 0 });
          w.emit('money.loan', { actors: [p.id], salience: 0.25, cause: a.cause || 0, tags: ['money', 'social'], payload: { amount: amt, kind: 'family_offmap' } }); return { ok: true, amount: amt, from: 'offmap' };
        }
        if (kind === 'payday') { amt = Math.min(amt, PD_CAP - fin.payday); if (amt <= 0) return { ok: false }; fin.payday += amt; }
        else { const room = Math.max(0, ccLimit(p) - fin.cc); amt = Math.min(amt, room); if (amt <= 0) return { ok: false }; fin.cc += amt; }
        w.ledger.transfer('metropolis', p.id, amt, 'credit', a.cause || 0); w.emit('money.loan', { actors: [p.id], salience: kind === 'payday' ? 0.35 : 0.15, cause: a.cause || 0, tags: ['money'], payload: { amount: amt, kind } }); return { ok: true, amount: amt };
      },
      'money.repay': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.pop) return 0; const fin = p.ext.pop.fin; let left = a.amount, tot = 0; for (const k of ['payday', 'cc']) { const x = Math.min(left, fin[k], Math.max(0, p.money)); if (x >= 1) { w.ledger.transfer(p.id, 'metropolis', x, 'debt_service'); fin[k] -= x; left -= x; tot += x; } } return tot; },
      'money.energyShock': (w, a) => { const m = M(w).macro; m.energy *= 1 + (a.pct ?? 30) / 100; m.energyShock = Math.max(m.energyShock, Math.min(1, (a.pct ?? 30) / 60)); w.emit('money.macro_shift', { salience: 0.6, tags: ['macro', 'god'], payload: { what: 'energy', size: a.pct ?? 30 } }); return true; },
      'money.recession': (w, a) => { const m = M(w).macro; m.recession = Math.max(m.recession, clamp(a.severity ?? 0.6, 0, 1)); m.recMonths = 0; w.emit('money.macro_shift', { salience: 0.65, tags: ['macro', 'god'], payload: { what: 'recession', size: m.recession } }); return true; },
      'money.initHousehold': (w, a) => { initHousehold(w, w.lf.households[a.hh], w.rngFor('money.init')); return true; },
      'money.setRate': (w, a) => { M(w).macro.rate = a.rate; w.emit('money.macro_shift', { salience: 0.4, tags: ['macro', 'god'], payload: { what: 'rate', size: a.rate } }); return true; },
    },
  };
  return plugin;
}
export default createMoney;
export { initState, estate, payWith, monthly, M as moneyState };
