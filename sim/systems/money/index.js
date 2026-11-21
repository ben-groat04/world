// MONEY (W1-C): double-entry ledger owner + macro price vector + monthly household budget cycle.
//   Monthly (world clock 'month'): pay (employer -> person, tax/NI/pension/student-loan -> hmrc), benefits (UC-style taper, child benefit, state pension, PIP, pension credit),
//   household bills (rent/mortgage, council tax, energy (seasonal), water, food, transport, phone, childcare, other), debt service (overdraft -> credit card -> payday ladder),
//   arrears, discretionary spending (to on-map venues and the Metropolis), interest, venue/landlord/council settlement, cost-of-living pressure per household.
//   QUERY  world.sys.money.query: balance(id) pressure(pidOrHh) budget(hh) macro() arrears(hh) debt(pid) netWorth(hh) flows() invariant() stats() creditRoom(pid)
//   CMD    money.windfall{pid,amount,reason} money.transfer{from,to,amount,reason} money.lend{from,to,amount} money.borrow{pid,amount,kind} money.repay{pid,amount}
//          money.energyShock{pct} money.setRate{rate}
//   EVENTS money.windfall money.arrears money.arrears_cleared money.cost_pressure money.debt_spiral money.benefit_claim money.loan money.loan_default money.estate money.macro_shift
import { MoneyLedger } from './ledger.js';
import { taxNI, employerNI, minHourly, universalCredit, childBenefit, statePensionMonth, pensionCreditFloor, lhaFor } from './tax.js';
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
const FOOD_VENUES = new Set(['corner_shop', 'small_supermarket', 'ethnic_grocer', 'bakery', 'off_licence']);
const LEISURE_VENUES = new Set(['cafe', 'pub', 'takeaway', 'restaurant', 'barber', 'salon', 'launderette', 'bookmaker', 'gym', 'charity_shop', 'money_phone']);
const SPLIT_CC = 0.0185, OD_FEE = 0.025, PD_ROLL = 0.35;

function newMacro() { return { rate: 4.0, mortRate: 4.8, cpi: 3.0, price: 1, wage: 1, rent: 1, hpi: 1, energy: 1, benefit: 1, taxIdx: 1, nmw: 1, recession: 0, recMonths: 0, energyShock: 0, wageGrowth: 3.6, rentGrowth: 4.5, hpiGrowth: 2.5, month: 0 }; }

function initState(w) {
  const lf = w.lf; if (lf.money) return;
  lf.money = { macro: newMacro(), loans: [], nextLoan: 1, last: {}, stats: { taxIn: 0, benefitsOut: 0, months: 0 }, venueHealth: {} };
  const T = w.pack.meta.tax, B = w.pack.meta.benefits, rng = w.rngFor('money.init');
  for (const hh of lf.households) {
    const f = hh.fin = { rentArrears: 0, billArrears: 0, stress: 0, ratio: 0, buffer: 6, cause: 0, hunger: 0, mort: null, income: 0, essentials: 0, claim: false, quiet: 0, pressured: false, spiral: 0 };
    const adults = hh.members.map((id) => w.people.get(id)).filter((p) => p && w.ageOf(p) >= 16);
    const head = adults[0];
    if (hh.rentPcm > 0 && hh.sav && hh.sav.arrears) f.rentArrears = Math.min(hh.sav.arrears, hh.rentPcm * 2.5);
    else if (hh.sav && hh.sav.arrears) f.billArrears = hh.sav.arrears;
    if (hh.mortgagePcm > 0) { const bal = Math.round(hh.mortgagePcm / 0.0059), rate = 4.8; f.mort = { bal, rate, term: rng.int(120, 300), fixEnd: w.tick + rng.int(6, 60) * 4380 }; }
    for (const p of adults) {
      const q = p.ext.pop, fin = q.fin;
      fin.cc = Math.round((fin.debt || 0) * 0.8); fin.payday = Math.round((fin.debt || 0) * 0.2 * (hh.sav && hh.sav.debt > 4000 ? 1 : 0.3)); fin.debt = fin.cc + fin.payday; fin.od = 0;
      fin.pension = Math.round(Math.max(0, w.ageOf(p) - 22) * Math.max(q.fin.gross || 0, 6000) * 0.045 * (q.activity === 'retired' ? 0.6 : 1) * rng.float(0.3, 1.4));
      fin.sp = 1; fin.priv = 0; fin.stress = 0;
      if (q.activity === 'retired') { const spA = B.statePensionWeeklyNewFull * 52; fin.sp = fin.gross < spA ? 0.8 : 1; fin.priv = Math.max(0, Math.round(fin.gross - spA * fin.sp)); }
      if (!fin.studentLoan) fin.studentLoan = 0;
    }
  }
  // the one number every conservation check hangs off
  w.ledger.invariant();
  void T;
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
  m.rentGrowth = clamp(3.0 + 0.7 * m.cpi - 3.5 * m.recession + rng.gauss(0, 0.4), -3, 12);
  m.rent *= 1 + m.rentGrowth / 1200;
  m.hpiGrowth = clamp(1.8 + 0.5 * (m.cpi - 2.8) - 1.0 * (m.mortRate - 4.8) - 6 * m.recession + rng.gauss(0, 0.5), -12, 12);
  m.hpi *= 1 + m.hpiGrowth / 1200;
  if (mo === 3) { m.benefit = m.price; m.nmw *= 1 + 0.04; } // April uprating
  if (mo === 3 && w.time.year >= 2028) m.taxIdx = m.price / 1.0;
}

// ------------------------------------------------------------------ credit
const monthNetOf = (p) => (p.ext.pop.fin.monthNet || 0);
const odLimit = (p) => { const f = p.ext.pop.fin; return f.noCredit ? 0 : Math.round(clamp((f.monthNet || 0) * 0.6, 0, 1800) / 50) * 50; };
const ccLimit = (p) => { const f = p.ext.pop.fin; return f.noCredit ? 0 : Math.round(clamp((f.monthNet || 0) * 2.2, 0, 7000) / 100) * 100; };
/** Pay `amount` from p to `to`. Waterfall: cash -> overdraft -> credit card -> payday (essentials only) -> unpaid. Returns {paid, unpaid, spiral}. */
function payWith(w, p, to, amount, reason, essential, cause) {
  amount = Math.round(amount); if (amount <= 0) return { paid: 0, unpaid: 0, spiral: false };
  const L = w.ledger, fin = p.ext.pop.fin;
  let room = p.money + odLimit(p), spiral = false;
  if (room >= amount) { L.transfer(p.id, to, amount, reason, cause); return { paid: amount, unpaid: 0, spiral }; }
  let unpaid = amount - Math.max(0, room);
  if (room > 0) L.transfer(p.id, to, room, reason, cause);
  const ccRoom = ccLimit(p) - fin.cc;
  if (unpaid > 0 && ccRoom > 0) { const d = Math.min(unpaid, ccRoom); L.transfer('metropolis', p.id, d, 'credit', cause); fin.cc += d; L.transfer(p.id, to, d, reason, cause); unpaid -= d; }
  if (unpaid > 0 && essential && !fin.noCredit) { const cap = 600 - fin.payday; if (cap > 0) { const d = Math.min(unpaid, cap); L.transfer('metropolis', p.id, d, 'credit', cause); fin.payday += d; L.transfer(p.id, to, d, reason, cause); unpaid -= d; spiral = true; } }
  return { paid: amount - unpaid, unpaid, spiral };
}

// ------------------------------------------------------------------ income
function nmwFloorMonth(q, age, macro) { return minHourly(age, q.contract === 'apprenticeship') * macro.nmw * q.hours * 52 / 12; }
function grossMonth(w, p, rng, macro, firmHealth) {
  const q = p.ext.pop, age = w.ageOf(p), pack = w.pack;
  if (q.activity === 'retired') return ((pack.meta.benefits.statePensionWeeklyNewFull * 52 * (q.fin.sp ?? 1) * macro.benefit) + (q.fin.priv || 0) * macro.price) / 12;
  const working = q.activity === 'employed' || (q.activity === 'student' && q.occ);
  let g = 0;
  if (working && q.pay > 0 && q.hours > 0) {
    g = q.pay * clamp(q.hours / 37.5, 0.12, 1.3) / 12;
    const c = q.contract;
    if (c === 'zero_hours') g *= rng.chance(0.2) ? rng.float(0.5, 0.8) : rng.float(0.9, 1.12);
    else if (c === 'self_employed' || c === 'gig') g *= Math.exp(rng.gauss(-0.04, 0.28)) * (firmHealth || 1);
    else if (c !== 'self_employed') g = Math.max(g, nmwFloorMonth(q, age, macro));
  }
  if (q.job2) g += q.job2.monthly * macro.wage;
  return g;
}

// ------------------------------------------------------------------ monthly cycle
function monthly(w) {
  const S = M(w), macro = S.macro, rng = w.rngFor('money.month'), mo = w.time.month, pack = w.pack, T = pack.meta.tax, B = pack.meta.benefits, L = w.ledger, lf = w.lf;
  stepMacro(w);
  const OCC = w._occ || (w._occ = Object.fromEntries(pack.jobs.map((o) => [o.id, o])));
  const tick = w.tick, stats = S.stats;
  const venueIn = new Map(); // bid -> local revenue this month
  const foodVenues = [], leisureVenues = [];
  for (const v of w.map.lf.venues) { const t = v.template; const wt = (pack.venues[t] && pack.venues[t].staff ? pack.venues[t].staff.reduce((s, x) => s + (Array.isArray(x.n) ? (x.n[0] + x.n[1]) / 2 : x.n), 0) : 1) + 0.5; if (FOOD_VENUES.has(t)) foodVenues.push([v.buildingId, wt]); else if (LEISURE_VENUES.has(t)) leisureVenues.push([v.buildingId, wt]); }
  const spreadTo = (list, amount, payer, reason) => { // split a household's local spend across venues by size, deterministic rotation
    if (!list.length || amount < 1) return 0; const tot = list.reduce((s, x) => s + x[1], 0); let r = rng.next() * tot, pick = list[list.length - 1][0];
    for (const x of list) { r -= x[1]; if (r <= 0) { pick = x[0]; break; } }
    L.transfer(payer, 'b:' + pick, amount, reason); venueIn.set(pick, (venueIn.get(pick) || 0) + amount); return amount;
  };
  const taxBefore = L.flows.tax || 0, benBefore = L.flows.benefit || 0;
  const council = [];
  let nPressured = 0, nHH = 0;
  const firmHealth = (bid) => (S.venueHealth[bid] ?? 1);
  for (const hh of lf.households) {
    if (hh.gone) continue;
    const ps = livePeople(w, hh); if (!ps.length) continue;
    nHH++;
    const f = hh.fin, adults = ps.filter((p) => w.ageOf(p) >= 16), kids = ps.filter((p) => w.ageOf(p) < 16), nKids = kids.length;
    if (!adults.length) continue;
    const sharers = isSharers(hh) && adults.length > 1;
    // ---------- 1. pay (employer -> person), tax, pension, student loan, state/private pension, student support
    let netEarnTot = 0, topGross = 0, workingAdults = 0, lcw = 0, studentsAll = true, retiredAll = true, claimable = 0;
    const inc = new Map();
    for (const p of adults) {
      const q = p.ext.pop, fin = q.fin, age = w.ageOf(p);
      const work = q.activity === 'employed' || (q.activity === 'student' && q.occ);
      const fh = q.workplace && q.workplace.kind === 'onmap' ? firmHealth(q.workplace.bid) : 1;
      const g = grossMonth(w, p, rng, macro, fh);
      let net = 0;
      if (g > 0) {
        const emp = q.activity === 'retired' ? null : q.workplace && q.workplace.kind === 'onmap' ? 'b:' + q.workplace.bid : 'e:' + ((OCC[q.occ] && OCC[q.occ].dest) || (q.workplace && q.workplace.dest) || 'home');
        const pen = q.activity === 'retired' ? 0 : (q.contract === 'permanent' || q.contract === 'fixed_term') && g * 12 > 10000 && age >= 22 && age < 67 ? g * 0.05 : 0;
        const tx = taxNI(g * 12 - pen * 12, T, { idx: macro.taxIdx, selfEmployed: q.contract === 'self_employed' || q.contract === 'gig', studentLoan: fin.studentLoan > 0 });
        const tax = (tx.tax + tx.ni) / 12, sl = Math.min(tx.sl / 12, fin.studentLoan);
        if (q.activity === 'retired') {
          const spPart = ((B.statePensionWeeklyNewFull * 52 * (fin.sp ?? 1) * macro.benefit) / 12), priv = g - spPart;
          if (spPart > 0) L.transfer('hmrc', p.id, spPart, 'benefit:pension');
          if (priv > 0) L.transfer('metropolis', p.id, priv, 'pension_income');
        } else {
          if (emp.startsWith('e:')) L.transfer('metropolis', emp, g + employerNI(g * 12) / 12, 'wage_fund');
          L.transfer(emp, p.id, g, 'wage');
          if (emp.startsWith('e:') || true) { const eni = employerNI(g * 12) / 12; if (eni > 0) L.transfer(emp, 'hmrc', eni, 'tax:employerNI'); }
        }
        if (tax > 0) L.transfer(p.id, 'hmrc', tax, 'tax');
        if (pen > 0) { L.transfer(p.id, 'metropolis', pen, 'pension'); fin.pension += pen * 1.6 * 12 / 12; }
        if (sl > 0) { L.transfer(p.id, 'metropolis', sl, 'studentloan'); fin.studentLoan = Math.max(0, Math.round(fin.studentLoan - sl)); }
        net = g - tax - pen - sl;
        if (work) { netEarnTot += net; workingAdults++; }
        topGross = Math.max(topGross, g * 12);
      }
      if (q.activity === 'student' && q.school && (q.school.kind === 'university' || q.school.kind === 'college') && age >= 18 && (mo >= 8 || mo <= 4)) {
        const loan = q.school.kind === 'university' ? 620 : 0, fam = (p.id % 3 === 0 ? 0 : 220);
        if (loan) { L.transfer('metropolis', p.id, loan, 'student_support'); net += loan; }
        if (fam) { L.transfer('metropolis', p.id, fam, 'family_support'); net += fam; }
        if (age < 22 && loan) fin.studentLoan += loan * 9 / 12 * 0.4;
      }
      fin.monthGross = g; fin.monthNet = net; inc.set(p.id, net);
      if (q.activity !== 'student') studentsAll = false; if (q.activity !== 'retired') retiredAll = false;
      if (q.activity === 'sick_disabled') lcw++;
      if (age < 66 && q.activity !== 'student' && q.activity !== 'retired') claimable++;
    }
    // ---------- 2. benefits (household level), paid to the best-placed adult
    const head = adults.slice().sort((a, b) => (inc.get(b.id) - inc.get(a.id)) || a.id - b.id)[0];
    const unit = lf.housing && lf.housing.units ? lf.housing.units[hh.unit] : null;
    const beds = unit ? unit.bedrooms : hh.bedrooms || 2, social = hh.tenure === 'council' || hh.tenure === 'housing_assoc', renter = hh.tenure === 'private_rent' || social || hh.tenure === 'shared_ownership';
    const rent = renter ? hh.rentPcm : 0;
    const wantBeds = bedNeed(w, ps);
    const cash = adults.reduce((s, p) => s + Math.max(0, p.money), 0);
    const childcareEst = nKids ? kids.filter((k) => w.ageOf(k) < 11).length * 380 : 0;
    let ben = 0;
    const couple = adults.length >= 2 && adults.some((p) => p.romance && p.romance.partnerId != null && adults.some((q2) => q2.id === p.romance.partnerId));
    if (claimable > 0 && !studentsAll && cash < 16000) {
      const uc = universalCredit(B, { couple, age: Math.min(...adults.map((p) => w.ageOf(p))), kids: nKids, lcw, rent, lhaCap: lhaFor(B, Math.min(beds, wantBeds)) * 0.82, social, netEarn: netEarnTot, hasChildOrLcw: nKids > 0 || lcw > 0, childcare: workingAdults ? childcareEst : 0 }, macro.benefit);
      const take = (head.id * 2654435761 >>> 0) % 100 < 88;
      if (uc > 0 && take) { L.transfer('hmrc', head.id, uc, 'benefit:uc'); ben += uc; if (!f.claim) { f.claim = true; w.emit('money.benefit_claim', { actors: [head.id], salience: 0.2, cause: f.cause, tags: ['money'], payload: { monthly: Math.round(uc) } }); } }
      else if (f.claim && uc <= 0) f.claim = false;
    } else if (f.claim) f.claim = false;
    if (nKids) { const cb = childBenefit(B, nKids, topGross, macro.benefit); if (cb > 0) { L.transfer('hmrc', head.id, cb, 'benefit:child'); ben += cb; } }
    for (const p of adults) { const q = p.ext.pop; if (q.health && q.health.limiting === 2 && w.ageOf(p) < 66 && (p.id * 40503 >>> 0) % 100 < 45) { const pip = B.disabilityPIPWeeklyStandardDaily * 52 / 12 * macro.benefit; L.transfer('hmrc', p.id, pip, 'benefit:pip'); ben += pip; } }
    if (retiredAll) { // pension credit top-up
      const incP = adults.reduce((s, p) => s + (inc.get(p.id) || 0), 0), fl = pensionCreditFloor(couple) * macro.benefit;
      if (incP < fl) { const pc = fl - incP; L.transfer('hmrc', head.id, pc, 'benefit:pc'); ben += pc; f.claim = true; }
    }
    // ---------- 3. household pot: partners/family pool income into the treasurer's account
    const treasurer = sharers ? null : head;
    if (!sharers && adults.length > 1) for (const p of adults) { if (p === treasurer) continue; const net = inc.get(p.id) || 0; if (net > 0 && couple) L.transfer(p.id, treasurer.id, net * 0.9, 'household_pot'); }
    // ---------- 4. bills
    const cpi = macro.price, seasonE = SEASON_ENERGY[mo] * macro.energy;
    const nA = adults.length, nP = ps.length;
    const bills = [];
    const incomeHH = adults.reduce((s, p) => s + (inc.get(p.id) || 0), 0) + ben;
    const landlordAcc = hh.tenure === 'council' ? 'council' : hh.tenure === 'housing_assoc' ? 'l:1' : hh.landlord != null && hh.landlord >= 0 ? 'l:' + hh.landlord : 'metropolis';
    let mortPay = 0;
    if (f.mort && f.mort.bal > 0) {
      const mm = f.mort, r = mm.rate / 1200;
      if (tick >= mm.fixEnd) { mm.rate = macro.mortRate; mm.fixEnd = tick + 4380 * 24 * 0 + 52560 * 4 + 0; mm.term = Math.max(24, mm.term); }
      const rr = mm.rate / 1200; mortPay = mm.bal * rr / (1 - Math.pow(1 + rr, -Math.max(12, mm.term)));
      void r;
    } else if (hh.mortgagePcm > 0 && !f.mort) f.mort = { bal: Math.round(hh.mortgagePcm / 0.0059), rate: 4.8, term: 240, fixEnd: tick + 52560 * 3 };
    const ctBand = beds <= 1 ? 135 : beds === 2 ? 157 : beds === 3 ? 180 : 240;
    const allStudents = studentsAll, discount = allStudents ? 1 : (adults.filter((p) => p.ext.pop.activity !== 'student').length === 1 ? 0.25 : 0);
    let ct = ctBand * macro.price * 1.12 * (1 - discount); if (f.claim && !retiredAll && ben > 0) ct *= 0.3; else if (retiredAll && f.claim) ct = 0;
    const energy = (88 + 24 * beds + 8 * nP) * seasonE * macro.price * 0.92;
    const water = (24 + 6 * nP) * macro.price;
    const incBracket = clamp(incomeHH / 2600, 0.55, 1.7);
    const food = (200 * nA + 120 * nKids) * (0.74 + 0.26 * incBracket) * macro.price;
    let transport = 0;
    transport += (hh.cars || 0) * 235 * macro.price;
    for (const p of adults) { const q = p.ext.pop, wp = q.workplace; if (q.activity === 'employed' && wp && wp.kind === 'offmap') { transport += wp.mode === 'rail' ? 150 : wp.mode === 'bus' ? 62 : wp.mode === 'cycle' ? 8 : 0; if (wp.hybrid) transport *= 0.7; } else transport += (hh.cars ? 0 : 24); }
    transport *= macro.price;
    const phone = (34 + 15 * nA) * macro.price * 0.95;
    let childcare = 0;
    if (nKids) { const working = adults.filter((p) => p.ext.pop.activity === 'employed' || p.ext.pop.activity === 'student').length, allW = working >= (nA >= 2 ? 2 : 1);
      for (const k of kids) { const ka = w.ageOf(k); if (ka < 3 && allW) childcare += 640; else if (ka < 5 && working) childcare += 230; else if (ka < 12 && allW) childcare += 85; } childcare *= macro.price * 0.9; if (f.claim && childcare > 0) childcare *= 0.3; }
    const other = (45 * nA + 38 * nKids) * macro.price * (0.7 + 0.3 * incBracket);
    const insur = hh.tenure === 'mortgage' || hh.tenure === 'owned_outright' ? 48 * macro.price + 40 * (beds - 1) * macro.price : 14 * macro.price;
    const rentDue = renter ? hh.rentPcm : 0;
    bills.push(['rent', rentDue, landlordAcc, 'rent'], ['mortgage', mortPay, 'metropolis', 'mortgage'], ['counciltax', ct, 'council', 'tax:council'], ['energy', energy, 'metropolis', 'energy'], ['water', water, 'metropolis', 'water'],
      ['food', food, null, 'food'], ['childcare', childcare, 'metropolis', 'childcare'], ['transport', transport, 'metropolis', 'transport'], ['phone', phone, 'metropolis', 'telecom'], ['other', other + insur, 'metropolis', 'goods']);
    if (hh.tenure === 'owned_outright' || hh.tenure === 'mortgage') { const rep = (unit && unit.cond < 0.5 ? 140 : 70) * macro.price; bills.push(['upkeep', rep, 'metropolis', 'repairs']); }
    // unexpected expense lump
    if (rng.chance(0.055)) bills.push(['shock', clamp(Math.exp(rng.gauss(Math.log(320), 0.9)) * (0.6 + 0.4 * incBracket), 40, 3500), 'metropolis', 'unexpected']);
    let essential = 0, unpaidTot = 0, spiral = false; const costs = {};
    const payers = sharers ? adults : [treasurer];
    for (const [name, amt0, to, reason] of bills) {
      let amt = amt0; if (name === 'rent' && sharers) amt = amt0; if (amt <= 0) continue;
      costs[name] = (costs[name] || 0) + amt; if (name !== 'shock') essential += amt;
      const share = amt / payers.length;
      for (const p of payers) {
        const ess = name !== 'other' && name !== 'upkeep' && name !== 'shock', cause = f.cause;
        let dest = to;
        if (name === 'food') { // ~38% of food spend goes to on-map grocers, the rest to supermarkets/online
          const loc = share * 0.38; const r = payWith(w, p, 'metropolis', share - loc, 'food', true, cause); let ok = r;
          if (loc > 0 && foodVenues.length) { const pr = payWith(w, p, 'metropolis', 0, 'food', true, cause); void pr; ok = { paid: r.paid, unpaid: r.unpaid, spiral: r.spiral }; if (p.money >= loc) spreadTo(foodVenues, loc, p.id, 'food_local'); else { const rr = payWith(w, p, 'metropolis', loc, 'food', true, cause); ok.unpaid += rr.unpaid; ok.spiral = ok.spiral || rr.spiral; } }
          else if (loc > 0) { const rr = payWith(w, p, 'metropolis', loc, 'food', true, cause); ok.unpaid += rr.unpaid; }
          if (ok.unpaid > 0) { f.hunger++; unpaidTot += ok.unpaid; } if (ok.spiral) spiral = true; continue;
        }
        const r = payWith(w, p, dest, share, reason, ess, cause);
        if (r.spiral) spiral = true;
        if (r.unpaid > 0) {
          unpaidTot += r.unpaid;
          if (name === 'rent') f.rentArrears += r.unpaid; else if (name === 'mortgage') f.billArrears += r.unpaid; else if (name === 'counciltax' || name === 'energy' || name === 'water') f.billArrears += r.unpaid;
          if ((name === 'rent' || name === 'mortgage') && !f.arrearsFlag) { f.arrearsFlag = true; w.emit('money.arrears', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.45, cause: f.cause, tags: ['money', 'housing'], payload: { kind: name, owed: Math.round(r.unpaid) } }); }
        }
      }
    }
    if (f.mort && mortPay > 0) { const interest = f.mort.bal * f.mort.rate / 1200; f.mort.bal = Math.max(0, f.mort.bal - (mortPay - interest)); f.mort.term = Math.max(1, f.mort.term - 1); hh.mortgagePcm = Math.round(mortPay); }
    if (rentDue > 0 && landlordAcc === 'council') council.push(rentDue);
    // ---------- 5. debt service, arrears repayment, discretionary
    let debtMin = 0;
    for (const p of adults) {
      const fin = p.ext.pop.fin;
      if (p.money < 0) { const fee = -p.money * OD_FEE; L.transfer(p.id, 'metropolis', fee, 'overdraft_fee'); debtMin += fee; }
      if (fin.cc > 0) { fin.cc *= 1 + SPLIT_CC; const min = Math.min(fin.cc, Math.max(5, fin.cc * 0.035)); const cashFree = p.money - (p.money < 0 ? 0 : 0); const r = payWith(w, p, 'metropolis', Math.min(min, Math.max(0, cashFree + odLimit(p) * 0 + 0)), 'debt_service', false, 0); fin.cc = Math.max(0, fin.cc - r.paid); debtMin += min; if (r.paid < min * 0.999) fin.missed = (fin.missed || 0) + 1; else fin.missed = 0; }
      if (fin.payday > 0) { const pay = Math.min(fin.payday, Math.max(0, p.money)); if (pay > 0) { L.transfer(p.id, 'metropolis', pay, 'debt_service'); fin.payday -= pay; } fin.payday *= 1 + PD_ROLL * (fin.payday > 0 ? 1 : 0); fin.payday = Math.round(fin.payday); if (fin.payday > 1500) fin.payday = 1500; }
      fin.noCredit = (fin.missed || 0) >= 3 || fin.payday >= 900;
    }
    if (spiral && !hh.fin.spiralEv) { hh.fin.spiralEv = tick; const d = adults.reduce((s, p) => s + p.ext.pop.fin.payday + p.ext.pop.fin.cc, 0); w.emit('money.debt_spiral', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.55, cause: f.cause, tags: ['money'], payload: { debt: Math.round(d) } }); }
    else if (hh.fin.spiralEv && tick - hh.fin.spiralEv > 52560 / 2 && !spiral) hh.fin.spiralEv = 0;
    // slack-based arrears repayment, then discretionary
    const liquid = adults.reduce((s, p) => s + Math.max(0, p.money), 0);
    const monthlyEss = Math.max(400, essential);
    const arrearsOwed = f.rentArrears + f.billArrears;
    if (arrearsOwed > 0) {
      const room = Math.max(0, liquid - monthlyEss * 0.15), pay = Math.min(arrearsOwed, room * 0.6 + (incomeHH > monthlyEss * 1.25 ? (incomeHH - monthlyEss) * 0.5 : 0));
      if (pay > 0) { let left = pay; for (const p of adults) { const x = Math.min(left, Math.max(0, p.money)); if (x > 0) { const rent = Math.min(f.rentArrears, x); if (rent > 0) { L.transfer(p.id, landlordAcc, rent, 'rent_arrears'); f.rentArrears -= rent; left -= rent; } const bill = Math.min(f.billArrears, Math.max(0, x - rent)); if (bill > 0) { L.transfer(p.id, 'council', bill, 'tax:arrears'); f.billArrears -= bill; left -= bill; } } } }
      f.rentArrears = Math.max(0, Math.round(f.rentArrears)); f.billArrears = Math.max(0, Math.round(f.billArrears));
      if (f.rentArrears + f.billArrears < 1 && f.arrearsFlag) { f.arrearsFlag = false; w.emit('money.arrears_cleared', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.25, tags: ['money'], payload: { kind: 'all' } }); }
    }
    const slack = incomeHH - essential - debtMin;
    const seg = pack.meta.segments.find((s) => s.id === hh.seg);
    const mood = [1.0, 0.82, 0.78, 0.82, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.0, 1.35][mo === 11 ? 12 : mo] || 1;
    const prop = clamp(0.92 - 0.18 * (seg ? 1 - seg.money.pressure : 0.5), 0.5, 0.95);
    let disc = Math.max(0, slack) * prop * mood * (f.rentArrears + f.billArrears > 0 ? 0.3 : 1);
    // sustained saving habit: wealthy cash piles get spent on big-ticket items too
    const pile = Math.max(0, liquid - monthlyEss * 5); disc += pile * 0.03;
    if (disc > 0) {
      const sp = sharers ? adults : [treasurer];
      for (const p of sp) {
        const part = disc / sp.length, avail = Math.max(0, p.money);
        const pay = Math.min(part, avail * 0.97); if (pay < 1) continue;
        const local = pay * 0.30; const lv = spreadTo(leisureVenues, local, p.id, 'leisure_local'); L.transfer(p.id, 'metropolis', pay - lv, 'discretionary');
      }
    }
    // interest on positive balances
    for (const p of adults) if (p.money > 500) L.transfer('metropolis', p.id, p.money * 0.028 / 12, 'interest');
    // ---------- 6. pressure
    const cashNow = adults.reduce((s, p) => s + p.money, 0), debtNow = adults.reduce((s, p) => s + p.ext.pop.fin.cc + p.ext.pop.fin.payday, 0);
    const ratio = incomeHH > 0 ? (essential + debtMin) / incomeHH : 2, buffer = cashNow / monthlyEss;
    const stress = sat(0.45 * sat((ratio - 0.55) / 0.55) + 0.28 * sat((1.6 - buffer) / 1.6) + 0.15 * ((f.rentArrears + f.billArrears) > 0 ? 1 : 0) + 0.12 * sat(debtNow / (Math.max(incomeHH, 400) * 6)) + (f.hunger > 0 ? 0.05 : 0));
    const was = f.stress; f.stress = +stress.toFixed(3); f.ratio = +ratio.toFixed(3); f.buffer = +buffer.toFixed(2); f.income = Math.round(incomeHH); f.essentials = Math.round(essential); f.benefits = Math.round(ben); f.net = Math.round(incomeHH - ben);
    f.last = { income: Math.round(incomeHH), benefits: Math.round(ben), ...Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, Math.round(v)])), debtService: Math.round(debtMin), disc: Math.round(disc) };
    if (!f.pressured && stress >= 0.62) { f.pressured = true; w.emit('money.cost_pressure', { actors: adults.map((a) => a.id), objects: [hh.id], salience: 0.35, cause: f.cause, tags: ['money'], payload: { stress: f.stress, ratio: f.ratio, buffer: f.buffer } }); }
    else if (f.pressured && stress < 0.4) f.pressured = false;
    if (stress >= 0.62) nPressured++;
    f.hunger = f.hunger > 0 && unpaidTot <= 0 ? 0 : f.hunger;
    for (const p of ps) { const fin = p.ext.pop.fin; fin.stress = f.stress; fin.savings = p.money; fin.debt = (fin.cc || 0) + (fin.payday || 0) + Math.max(0, -p.money); fin.arrears = p === head ? f.rentArrears + f.billArrears : 0; fin.gross = Math.round((fin.monthGross || 0) * 12); fin.net = Math.round((fin.monthNet || 0) * 12); p.debt = fin.debt; }
    void was;
  }
  // ---------- informal loans repaid / defaulted
  const loans = S.loans;
  for (let i = loans.length - 1; i >= 0; i--) {
    const ln = loans[i], b = w.people.get(ln.to), l = w.people.get(ln.from);
    if (!b || !b.alive || ln.left <= 0) { if (b && !b.alive && ln.left > 0) w.emit('money.loan_default', { actors: [ln.to, ln.from], salience: 0.25, payload: { amount: Math.round(ln.left) } }); loans.splice(i, 1); continue; }
    const pay = Math.min(ln.left, ln.monthly);
    if (b.money > pay * 2) { w.ledger.transfer(b.id, ln.from, pay, 'loan_repay'); ln.left -= pay; ln.missed = 0; } else { ln.missed++; if (ln.missed >= 4) { w.emit('money.loan_default', { actors: [ln.to, ln.from], salience: 0.4, cause: ln.eid, tags: ['money', 'social'], payload: { amount: Math.round(ln.left) } }); loans.splice(i, 1); continue; } }
    if (ln.left < 1) loans.splice(i, 1); void l;
  }
  // ---------- venue settlement: pay overheads/suppliers, visitors fill the till so a healthy venue ends near break-even + margin
  const h = S.venueHealth, sw = w.sys.labour;
  for (const [bid, rev] of venueIn) void rev;
  for (const b of w.buildings.values()) {
    if (!b.lf || !b.lf.staff || !b.lf.staff.length) continue;
    const key = b.id, acc = 'b:' + key, bal = L.balance(acc);
    const closed = sw && sw.query.firmClosed ? sw.query.firmClosed(b.id) : false;
    const hv = h[key] ?? 1;
    const payroll = b.lf.staff.reduce((s, st) => s + st.n, 0) * 2200; // nominal scale for cogs/overhead sizing
    const local = venueIn.get(key) || 0;
    if (closed) { if (bal > 0) L.transfer(acc, 'metropolis', bal, 'business_wind_down'); continue; }
    const cogs = (local * 0.52 + payroll * 0.55) * 0.7, over = payroll * 0.12 * macro.price;
    const outflow = cogs + over; if (outflow > 0) L.transfer(acc, 'metropolis', Math.min(outflow, Math.max(0, bal + local + payroll * 0.9)), 'suppliers_overheads');
    const target = payroll * 0.9 * (0.9 + 0.1 * hv); const cur = L.balance(acc);
    if (cur < target) L.transfer('metropolis', acc, (target - cur) * (0.55 + 0.4 * hv) , 'visitor_sales'); else if (cur > target * 1.5 + 500) L.transfer(acc, 'metropolis', cur - target * 1.5, 'owner_draw');
  }
  // ---------- landlords sweep (repairs paid by housing via transfer; remit surplus), council + hmrc settle with the centre
  for (const k of Object.keys(L.balances)) if (k.startsWith('l:') && L.balances[k] > 0) L.transfer(k, 'metropolis', L.balances[k] * 0.93, 'landlord_remit');
  for (const k of Object.keys(L.balances)) if (k.startsWith('e:') && L.balances[k] !== 0) L.transfer(L.balances[k] > 0 ? k : 'metropolis', L.balances[k] > 0 ? 'metropolis' : k, Math.abs(L.balances[k]), 'org_settle');
  { const tr = w.town.treasury; if (tr > 40000) L.transfer('council', 'metropolis', tr - 20000, 'council_services'); else if (tr < 5000) L.transfer('metropolis', 'council', 20000, 'central_grant'); }
  { const hb = L.balances.hmrc; if (hb > 0) L.transfer('hmrc', 'metropolis', hb, 'fiscal_settle'); else if (hb < 0) L.transfer('metropolis', 'hmrc', -hb, 'fiscal_settle'); }
  stats.months++; stats.taxIn += (L.flows.tax || 0) - taxBefore; stats.benefitsOut += (L.flows.benefit || 0) - benBefore;
  S.last = { pressured: nPressured, households: nHH, tax: (L.flows.tax || 0) - taxBefore, benefits: (L.flows.benefit || 0) - benBefore };
}

// ------------------------------------------------------------------ queries / commands
function hhOfAny(w, x) { if (typeof x === 'number') { const p = w.people.get(x); return p && p.ext.pop ? w.lf.households[p.ext.pop.hh] : null; } return x && x.members ? x : x && x.ext ? w.lf.households[x.ext.pop.hh] : null; }
export default {
  name: 'money', version: '1.0.0',
  events: { emits: EVENTS.map((e) => e[0]), listens: [] },
  clocks: { month: monthly },
  init(world) {
    MoneyLedger.upgrade(world);
    registerEvents(world, EVENTS);
    if (world.lf) initState(world);
    if (typeof world.on === 'function') world.on('death', (ev) => { if (ev && ev.person) estate(world, ev.person); });
  },
  query: {
    balance: (id) => globalThis.__w ? 0 : 0,
  },
  commands: {},
};
function estate(w, p) {
  const bal = p.money; if (!bal || bal <= 0 || !w.lf) return;
  const hh = w.lf.households[p.ext.pop ? p.ext.pop.hh : -1]; let to = null;
  if (hh) { const sp = p.family && p.family.spouseId != null ? w.people.get(p.family.spouseId) : null; if (sp && sp.alive) to = sp; }
  if (!to && p.family && p.family.childrenIds) { const ks = p.family.childrenIds.map((id) => w.people.get(id)).filter((k) => k && k.alive && w.ageOf(k) >= 18); if (ks.length) { const each = Math.floor(bal / ks.length); for (const k of ks) w.ledger.transfer(p.id, k.id, each, 'inheritance'); const eid = w.emit('money.estate', { actors: [p.id, ...ks.map((k) => k.id)], salience: 0.4, tags: ['money', 'family'], payload: { amount: Math.round(bal) } }); void eid; return; } }
  if (to) { w.ledger.transfer(p.id, to.id, bal, 'inheritance'); w.emit('money.estate', { actors: [p.id, to.id], salience: 0.35, tags: ['money', 'family'], payload: { amount: Math.round(bal) } }); }
  else w.ledger.transfer(p.id, 'council', bal, 'estate_unclaimed');
}
export { initState, estate, payWith, hhOfAny, monthly, M as moneyState };
