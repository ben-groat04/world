// HOUSING (W1-C): units with tenure/landlord/rent/condition, rent setting + annual rises, repairs/damp, Section-21-style notices, arrears -> eviction, voids and re-letting,
// social waiting list, within-neighbourhood moves and moves out (family/sharer/student churn), arrivals from the Metropolis, right-to-buy, landlord sales, gentrification.
//   QUERY  world.sys.housing.query: unit(hhOrPid) vacancies({beds,maxRent,tenure}) rentBurden(hh) market() overcrowded(hh) equity(hh) value(hh) landlordOf(hh) gentrification() waitlist() stats() moves()
//   CMD    housing.move{pid|hh,unit?,reason} housing.rentFlat{pid,unit} housing.join{pid,hh} housing.rentShock{pct} housing.evict{unit|hh} housing.buildFlats{n} housing.sellUnit{unit}
//          venues.claim_unit{building,name,group} (goals: start_business) housing.repair{unit}
//   EVENTS housing.moved_in housing.moved_out housing.notice_served housing.eviction housing.homeless housing.rent_rise housing.rent_shock housing.repair_needed housing.disrepair housing.repaired
//          housing.void housing.let housing.built housing.overcrowded housing.right_to_buy housing.landlord_sale housing.bought housing.unit_claimed
//   Consumes goals' goal.effect (find_flat/new_tenancy -> move, move_out_of_parents, buy_home, get_repair_done, downsize...) and project.effect (unit_claimed).
import { clamp, registerEvents, livePeople, bedNeed, isSharers } from '../money/util.js';
import { createArrivalHousehold, createSharer, savingsFor } from './arrivals.js';

const EVENTS = [
  ['housing.moved_in', 'A household moved into a home (from elsewhere in Larkfield or from outside)', { from: 'string' }], ['housing.moved_out', 'A household left a home (to another Larkfield home or out of the area)', { to: 'string' }],
  ['housing.notice_served', 'Landlord served notice (no-fault / sale / arrears)', { reason: 'string' }], ['housing.eviction', 'Household evicted by bailiffs', { reason: 'string' }], ['housing.homeless', 'Household left without a settled home (flagged)', { dest: 'string' }],
  ['housing.rent_rise', 'Rent increased notably', { pct: 'number' }], ['housing.rent_shock', 'Market-wide rent shock', { pct: 'number' }], ['housing.repair_needed', 'Disrepair reported', { kind: 'string' }], ['housing.disrepair', 'Disrepair/damp left unfixed', { damp: 'boolean' }],
  ['housing.repaired', 'Repair completed', { months: 'number' }], ['housing.void', 'Unit became empty', { reason: 'string' }], ['housing.let', 'Empty unit let or sold', { tenure: 'string' }], ['housing.built', 'New flats added by a housing association', { n: 'number' }],
  ['housing.overcrowded', 'Household is overcrowded by the bedroom standard', { short: 'number' }], ['housing.right_to_buy', 'Council tenant bought their home', { price: 'number' }], ['housing.landlord_sale', 'Landlord sold up', { units: 'number' }],
  ['housing.bought', 'Household bought a home', { price: 'number' }], ['housing.unit_claimed', 'A vacant business unit was claimed', { name: 'string' }],
];
const MONTH = 4380, YEAR = 52560;
const H = (w) => w.lf.housing;
const BASE_RENT = (w) => w.pack.unitTypes.rooms.rentPerMonthByBedrooms, BASE_PRICE = (w) => w.pack.unitTypes.rooms.housePriceByBedrooms;
const rented = (t) => t === 'private_rent' || t === 'council' || t === 'housing_assoc' || t === 'shared_ownership';
const isSocial = (t) => t === 'council' || t === 'housing_assoc';
const MOVE_OUT_P = { older_longterm: 0.55, family_couples: 0.5, lone_parents: 0.3, students: 0.85, young_sharers: 0.55, early_career: 0.6, settled_professionals: 0.4, shift_workers: 0.3, recent_arrivals: 0.6, local_business_families: 0.3, benefit_dependent: 0.15 };
const TEN_MULT = { private_rent: 1.35, mortgage: 0.6, owned_outright: 0.35, council: 0.4, housing_assoc: 0.4, shared_ownership: 0.7 };
const SUBURB_SEGS = new Set(['family_couples', 'settled_professionals', 'lone_parents']);

export function createHousing() {
  let W = null;
  const U = (id) => H(W).byId[id];
  const macro = () => (W.lf.money ? W.lf.money.macro : { rent: 1, hpi: 1, rentGrowth: 4, recession: 0, price: 1, wage: 1 });
  const hhLive = (hh) => livePeople(W, hh);
  const venues = () => W.map.lf.venues;
  const ownerOf = (u) => H(W).owners[u.landlord];

  // ---------------------------------------------------------------- init
  function initState(w) {
    const lf = w.lf; if (lf.housing) return;
    const rng = w.rngFor('housing.init'), M = w.map.lf, list = [], byId = {};
    const hhOfUnit = new Map(); for (const hh of lf.households) if (!hh.gone) hhOfUnit.set(hh.unit, hh);
    for (const mu of M.units) {
      if (mu.kind === 'venue') continue;
      const hh = hhOfUnit.get(mu.id), b = w.buildings.get(mu.buildingId);
      const u = { id: mu.id, bid: mu.buildingId, kind: mu.kind, bedrooms: mu.bedrooms, area: mu.floorAreaM2, tenure: mu.tenure, landlord: mu.landlord ?? -1, rent: hh && rented(hh.tenure) ? hh.rentPcm : (mu.rentGBPMonth || 0), value: mu.valueGBP || 0, hh: hh ? hh.id : -1, address: mu.address, label: mu.label || '',
        premium: rng.float(0.88, 1.14), cond: +rng.float(0.5, 1).toFixed(2), damp: false, repair: null, notice: null, since: hh ? hh.since : 0, lastRise: w.tick - rng.int(0, 11) * MONTH, lastRisePct: 0, voidUntil: 0, listed: !hh, complained: 0, hpiBase: 1, cafeNear: 0, bx: b.door.x, by: b.door.y, floor: mu.floor };
      if (!hh) { u.listed = false; u.voidUntil = w.tick + rng.int(0, 2) * MONTH; if (!u.rent) u.rent = rented(u.tenure) ? marketRent(w, u, 1) : 0; }
      if (u.tenure === 'private_rent' || isSocial(u.tenure)) u.cond = Math.min(u.cond, rng.float(0.45, 1));
      // student lets (HMOs / agent-marketed flats near the university) are let only to students; ~80% of the units students occupy on day 1 are such lets
      u.studentLet = !!hh && hh.seg === 'students' && rng.chance(0.8); u.lastSeg = hh ? hh.seg : null;
      list.push(u); byId[u.id] = u;
    }
    const owners = M.owners.map((o) => ({ id: o.id, kind: o.kind, units: o.units.slice(), offMap: o.offMap || 0, sold: 0 }));
    lf.housing = { list, byId, owners, wait: [], pendingRooms: [], stats: { moves: 0, localMoves: 0, departures: 0, arrivals: 0, evictions: 0, notices: 0, bought: 0, built: 0, movedPersons: 0, sharerChurn: 0, homeless: 0 }, moveLog: [], cafes0: 0, cafes: 0, autoMoves: true, noShocks: false, moveScale: 0.36, ys: 0, evLog: [] };
    countCafes(w); H(w).cafes0 = H(w).cafes;
    for (const u of list) u.cafeNear = cafesNear(w, u);
  }
  function countCafes(w) { let n = 0; for (const v of venues()) if (v.template === 'cafe' || v.template === 'restaurant') n++; H(w).cafes = n + (H(w).extraCafes || 0); }
  function cafesNear(w, u) { let n = 0; for (const v of venues()) if (v.template === 'cafe') { const b = w.buildings.get(v.buildingId); if (b && Math.abs(b.door.x - u.bx) + Math.abs(b.door.y - u.by) < 28) n++; } return n; }
  function marketRent(w, u, premium = 1) {
    const m = w.lf.money ? w.lf.money.macro : { rent: 1, price: 1 };
    const base = BASE_RENT(w)[Math.min(6, u.bedrooms)] * (isSocial(u.tenure) ? 0.52 * (1 + (m.price - 1) * 0.9) : u.tenure === 'shared_ownership' ? 0.35 * m.rent : m.rent * 1.08 * u.premium * (0.88 + 0.12 * u.cond) * (1 + 0.012 * u.cafeNear) * gentrif(w));
    return Math.round(base / 5) * 5 * premium;
  }
  const gentrif = (w) => { const S = H(w); return 1 + 0.06 * clamp((S.cafes - S.cafes0) / Math.max(1, S.cafes0), -0.5, 2); };
  const valueOf = (w, u) => Math.round((u.value || BASE_PRICE(w)[Math.min(6, u.bedrooms)]) * (w.lf.money ? w.lf.money.macro.hpi / u.hpiBase : 1) / 1000) * 1000;

  // ---------------------------------------------------------------- physical moves
  function relocate(p, newBid, oldBid) {
    const w = W, ob = w.buildings.get(oldBid), nb = w.buildings.get(newBid);
    if (ob) { const i = ob.residents.indexOf(p.id); if (i >= 0) ob.residents.splice(i, 1); }
    if (nb && !nb.residents.includes(p.id)) nb.residents.push(p.id);
    p.homeId = newBid; if (p.ext.pop) p.ext.pop.yearsAtAddress = 0;
  }
  function setTenancy(hh, u, reason, from) {
    const w = W, old = U(hh.unit), oldBid = hh.bid, ps = hhLive(hh);
    if (old && old.id !== u.id) { old.hh = -1; vacate(old, reason); }
    u.hh = hh.id; u.since = w.tick; u.voidUntil = 0; u.listed = false; u.notice = null; u.lastRise = w.tick; u.lastRisePct = 0;
    hh.unit = u.id; hh.bid = u.bid; hh.tenure = u.tenure; hh.landlord = u.landlord; hh.bedrooms = u.bedrooms; hh.address = u.address; hh.since = w.tick; hh.search = null; hh.forced = null;
    hh.rentPcm = rented(u.tenure) ? u.rent : 0; if (!w.lf.households[hh.id].fin) return;
    if (u.tenure === 'owned_outright') hh.mortgagePcm = 0;
    for (const p of ps) { const q = p.ext.pop; const ob = p.homeId; relocate(p, u.bid, ob); q.unit = u.id; if (w.commands.has('routine.adopt')) w.cmd('routine.adopt', { pid: p.id, from: ob }); }
    void oldBid; void from;
  }
  function vacate(u, reason) {
    const w = W, rng = w.rngFor('housing.void'), social = isSocial(u.tenure);
    u.hh = -1; u.notice = null; u.listed = false; u.complained = 0;
    const months = social ? rng.int(1, 2) : u.tenure === 'private_rent' ? rng.int(1, 3) : rng.int(1, 3);
    u.voidUntil = w.tick + (months + (u.cond < 0.5 ? 1 : 0)) * MONTH; if (u.cond < 0.8) u.cond = Math.min(1, u.cond + 0.2); u.damp = false; u.repair = null;
    if (u.tenure === 'private_rent') u.rent = Math.max(u.rent, marketRent(w, u)); // re-let at market
    w.emit('housing.void', { place: u.bid, objects: [u.id], salience: 0.1, tags: ['housing'], payload: { reason, months } });
  }
  function emitMove(hh, kind, from, to, cause, reason) {
    const ids = hhLive(hh).map((p) => p.id);
    return W.emit(kind, { actors: ids, place: kind === 'housing.moved_out' ? from : to, objects: [hh.id], salience: 0.35, cause: cause || 0, tags: ['housing', 'life'], payload: kind === 'housing.moved_in' ? { from: reason.from, reason: reason.why, unit: hh.unit, tenure: hh.tenure } : { to: reason.to, reason: reason.why, unit: hh.unit } });
  }
  function leaveArea(hh, why, dest, cause, flag) {
    const w = W, S = H(w), u = U(hh.unit), ps = hhLive(hh); if (!ps.length) { hh.gone = true; return; }
    const eid = emitMove(hh, 'housing.moved_out', hh.bid, null, cause, { to: dest, why });
    if (flag) { S.stats.homeless++; w.emit('housing.homeless', { actors: ps.map((p) => p.id), objects: [hh.id], salience: 0.75, cause: eid, tags: ['housing', 'money'], payload: { dest } }); }
    // realise equity of owners
    if (hh.fin && hh.fin.mort !== undefined && (hh.tenure === 'mortgage' || hh.tenure === 'owned_outright') && u) { const eq = Math.max(0, valueOf(w, u) - (hh.fin.mort ? hh.fin.mort.bal : 0)); const t = ps.find((p) => w.ageOf(p) >= 16); if (t && eq > 0) w.ledger.transfer('metropolis', t.id, eq * 0.96, 'house_sale'); hh.fin.mort = null; }
    for (const p of ps) { if (w.commands.has('labour.depart')) w.cmd('labour.depart', { pid: p.id }); p.emigrated = true; p.emigratedTick = w.tick; p.emigratedTo = dest; if (p.ext.rt) p.ext.rt.off = null; w.removePerson(p); S.stats.movedPersons++; S.moveLog.push([w.tick, Math.round(w.ageOf(p)), 'out']); }
    hh.gone = true; hh.departed = w.tick; hh.members = hh.members.slice();
    if (u) { u.hh = -1; vacate(u, why); if (why === 'landlord_sale' || u.saleFlag) { u.saleFlag = false; } }
    S.stats.departures++; return eid;
  }
  // ---------------------------------------------------------------- arrivals
  function arrive(u, forceSeg) {
    const w = W, rng = w.rngFor('housing.arrive'), S = H(w);
    const { hh, people, seg } = createArrivalHousehold(w, rng, u, forceSeg);
    u.hh = hh.id; u.since = w.tick; u.voidUntil = 0; u.listed = false; u.lastRise = w.tick; u.lastSeg = hh.seg;
    hh.rentPcm = rented(u.tenure) ? u.rent : 0;
    if (u.tenure === 'mortgage' || u.tenure === 'owned_outright') { const price = valueOf(w, u); hh.mortgagePcm = u.tenure === 'mortgage' ? Math.round(price * 0.8 * 0.0059) : 0; }
    const adults = people.filter((p) => w.ageOf(p) >= 16), net = Math.max(900, (seg.money.incomeBand[1] / 12) * 0.82 * (u.tenure === 'private_rent' ? 1 : 0.9));
    hh.sav = savingsFor(rng, seg, net, u.tenure);
    const earners = adults.length || 1;
    for (const p of adults) { const sv = Math.round(hh.sav.savings / earners * rng.float(0.5, 1.5)); if (sv > 0) w.ledger.transfer('metropolis', p.id, sv, 'arrival_savings'); p.ext.pop.fin.debt = Math.round(hh.sav.debt / earners * rng.float(0.5, 1.5)); p.ext.pop.fin.arrears = 0; if (seg.money.studentLoan && p.ext.pop.edu === 'level4plus' && w.ageOf(p) < 40) p.ext.pop.fin.studentLoan = Math.round(18000 * rng.float(0.5, 2)); }
    hh.sav.arrears = 0;
    if (w.commands.has('money.initHousehold')) w.cmd('money.initHousehold', { hh: hh.id });
    for (const p of people) { if (w.ageOf(p) >= 16 && w.commands.has('labour.initPerson')) w.cmd('labour.initPerson', { pid: p.id, job: true }); if (w.commands.has('routine.adopt')) w.cmd('routine.adopt', { pid: p.id }); }
    if (u.tenure === 'mortgage' && hh.fin && hh.fin.mort) { hh.fin.mort.bal = Math.round(valueOf(w, u) * 0.8); const dep = Math.round(valueOf(w, u) * 0.2); void dep; }
    S.stats.arrivals++; S.stats.movedPersons += people.length; for (const p of people) S.moveLog.push([w.tick, Math.round(w.ageOf(p)), 'in']);
    w.emit('housing.moved_in', { actors: people.map((p) => p.id), place: u.bid, objects: [hh.id], salience: 0.35, tags: ['housing', 'life', 'arrival'], payload: { from: 'outside', reason: 'arrival', unit: u.id, tenure: u.tenure } });
    w.emit('housing.let', { place: u.bid, objects: [u.id, hh.id], salience: 0.1, tags: ['housing'], payload: { tenure: u.tenure } });
    return hh;
  }

  // ---------------------------------------------------------------- hazards
  function moveHazard(hh, u, seg) {
    const w = W, ten = TEN_MULT[hh.tenure] ?? 1, yrs = (w.tick - hh.since) / YEAR;
    let m = ten * (yrs < 1 ? 1.7 : yrs < 3 ? 1.1 : yrs < 8 ? 0.75 : 0.45);
    const ps = hhLive(hh), need = bedNeed(w, ps);
    hh.overcrowdShort = Math.max(0, need - hh.bedrooms);
    if (hh.overcrowdShort > 0) m *= 2.6;
    if (hh.bedrooms >= need + 2 && ps.every((p) => w.ageOf(p) >= 55)) m *= 1.3;
    if (hh.fin && hh.fin.stress > 0.6) m *= 1.5;
    if (u && u.lastRisePct >= 8 && w.tick - u.lastRise < 8 * MONTH) m *= 1.7;
    if (u && u.damp) m *= 1.5;
    const base = seg ? seg.mobility.annualMoveProb : 0.12;
    return 1 - Math.pow(1 - clamp(base * m * (H(w).moveScale ?? 1), 0, 0.9), 1 / 12);
  }
  function startSearch(hh, reason, forced, cause) {
    const w = W, ps = hhLive(hh), need = bedNeed(w, ps), net = (hh.fin && hh.fin.income) || (hh.income && hh.income.net / 12) || 1800;
    hh.search = { since: w.tick, beds: need, reason, forced: forced || 0, maxRent: Math.max(450, net * 0.42), cause: cause || 0, tries: 0, buy: reason === 'buy' };
  }
  function seekDestination(hh, seg, rng, why, cause, forced) {
    const out = MOVE_OUT_P[hh.seg] ?? 0.5, young = hhLive(hh).some((p) => W.ageOf(p) < 5);
    const goOut = rng.chance(out * (forced ? 1.0 : 1) * (SUBURB_SEGS.has(hh.seg) && young ? 1.15 : 1));
    if (goOut) { hh.departAt = W.tick + rng.int(0, 2) * MONTH; hh.departWhy = why; hh.departCause = cause || 0; hh.departDest = hh.seg === 'students' ? 'elsewhere' : SUBURB_SEGS.has(hh.seg) && rng.chance(0.55) ? 'suburbs' : hh.seg === 'older_longterm' ? 'family_or_care' : 'metropolis'; }
    else startSearch(hh, why, forced, cause);
  }
  // ---------------------------------------------------------------- monthly
  function monthly(w) {
    const S = H(w), rng = w.rngFor('housing.month'), tick = w.tick, mc = macro(), mo = w.time.month, SEG = w._segById || (w._segById = Object.fromEntries(w.pack.meta.segments.map((s) => [s.id, s])));
    countCafes(w);
    const money = w.sys.money;
    // --- units
    for (const u of S.list) {
      // value tracking
      if (u.hh >= 0) {
        const hh = w.lf.households[u.hh];
        // condition decay and repairs
        u.cond = clamp(u.cond - (isSocial(u.tenure) ? 0.003 : u.tenure === 'private_rent' ? 0.004 : 0.002) * rng.float(0.5, 1.5), 0.1, 1);
        if (!u.repair && rng.chance((0.75 - u.cond) * 0.1 * (0.75 - u.cond > 0 ? 1 : 0))) {
          const eid = w.emit('housing.repair_needed', { actors: hhLive(hh).slice(0, 2).map((p) => p.id), place: u.bid, objects: [u.id], salience: 0.25, tags: ['housing'], payload: { kind: u.cond < 0.5 ? 'damp' : 'repair' } });
          u.repair = { since: tick, eid }; if (rented(u.tenure) && rng.chance(0.4)) u.complained = tick;
        }
        if (u.repair) {
          const own = ownerOf(u), kind = u.tenure === 'council' ? 0.22 : u.tenure === 'housing_assoc' ? 0.35 : own && own.kind === 'portfolio_landlord' ? 0.45 : own && own.kind === 'build_to_rent' ? 0.55 : 0.33, ownerOcc = !rented(u.tenure);
          if (rng.chance(ownerOcc ? 0.5 : kind)) { const cost = 350 + u.bedrooms * 150, months = (tick - u.repair.since) / MONTH; if (!ownerOcc) w.ledger.transfer(u.tenure === 'council' ? 'council' : 'l:' + u.landlord, 'metropolis', cost, 'repairs'); u.cond = clamp(u.cond + 0.28, 0, 1); u.damp = false; w.emit('housing.repaired', { place: u.bid, objects: [u.id], salience: 0.15, cause: u.repair.eid, tags: ['housing'], payload: { months: +months.toFixed(1) } }); u.repair = null; }
          else if (!u.damp && u.cond < 0.5 && tick - u.repair.since > 2 * MONTH) { u.damp = true; w.emit('housing.disrepair', { actors: hhLive(hh).slice(0, 2).map((p) => p.id), place: u.bid, objects: [u.id], salience: 0.4, cause: u.repair.eid, tags: ['housing', 'health'], payload: { damp: true } }); }
        }
        // rent review
        if (u.tenure === 'private_rent' && tick - u.lastRise >= 11.5 * MONTH) {
          const mk = marketRent(w, u), gap = mk / u.rent - 1, own = ownerOf(u), mult = own && own.kind === 'small_landlord' ? 0.8 : 1.1;
          let pct = clamp((mc.rentGrowth * 0.85 + rng.gauss(0.5, 2)) * mult + (gap > 0.1 ? gap * 25 : 0), 0, 14);
          if (!rng.chance(own && own.kind === 'small_landlord' ? 0.62 : 0.85)) pct = 0;
          if (pct > 0.5) rentRise(u, hh, pct, 0);
          u.lastRise = tick;
        } else if (isSocial(u.tenure) && mo === 3 && tick - u.lastRise > 8 * MONTH) { rentRise(u, hh, clamp(mc.price > 1 ? 3.7 : 3.5, 2, 6), 0, true); u.lastRise = tick; }
        if (hh.rentPcm !== u.rent && rented(u.tenure)) hh.rentPcm = u.rent;
        if (u.tenure === 'private_rent' && !u.notice) noticeStep(u, hh, rng, money);
        if (u.notice) processNotice(u, hh, rng);
        // right to buy
        if (u.tenure === 'council' && (tick - u.since) > 3 * YEAR && rng.chance(0.0003 * (hh.fin && hh.fin.stress < 0.5 ? 2 : 0.4))) rightToBuy(u, hh);
      } else {
        if (!u.listed && tick >= u.voidUntil) { u.listed = true; }
        if (u.listed && u.tenure === 'private_rent') u.rent = Math.round(Math.max(marketRent(w, u) * (1 - 0.02 * (tick - u.voidUntil) / MONTH), marketRent(w, u) * 0.9) / 5) * 5;
      }
    }
    // --- households: arrears/eviction, overcrowding, moving decisions, leaving home
    const hhs = w.lf.households;
    for (let i = 0; i < hhs.length; i++) {
      const hh = hhs[i]; if (hh.gone) continue;
      const u = U(hh.unit), ps = hhLive(hh); if (!ps.length) { hh.gone = true; if (u) { u.hh = -1; vacate(u, 'empty'); } continue; }
      if (!u) continue;
      const seg = SEG[hh.seg], adults = ps.filter((p) => w.ageOf(p) >= 16);
      if (hh.departAt && tick >= hh.departAt) { leaveArea(hh, hh.departWhy || 'moved', hh.departDest || 'metropolis', hh.departCause, false); continue; }
      // arrears -> notice (S8) -> eviction
      const f = hh.fin; if (f && rented(hh.tenure) && f.rentArrears > hh.rentPcm * 2 && !u.notice) {
        const pr = u.tenure === 'private_rent' ? 0.18 : u.tenure === 'housing_assoc' ? 0.06 : 0.03;
        if (rng.chance(pr)) serveNotice(u, hh, 'arrears', f.cause);
      }
      // overcrowding record
      const need = bedNeed(w, ps), short = Math.max(0, need - u.bedrooms);
      if (short > 0 && !hh.crowded) { hh.crowded = true; w.emit('housing.overcrowded', { actors: adults.slice(0, 2).map((p) => p.id), place: u.bid, objects: [hh.id], salience: 0.3, tags: ['housing'], payload: { short } }); if (!S.wait.some((x) => x.hh === hh.id) && (isSocial(hh.tenure) || (f && f.stress > 0.5))) S.wait.push({ hh: hh.id, since: tick, points: 2 * short }); }
      else if (short === 0) hh.crowded = false;
      // student-let tenancies end with the course: once nobody in a student household is studying (graduated / dropped out / working) they give notice
      // at ~10%/month (12-month ASTs, graduate jobs elsewhere) and the unit goes back to the student market
      if (hh.seg === 'students' && !isSharers(hh) && !hh.search && !hh.departAt && S.autoMoves && !ps.some(studying) && rng.chance(0.10)) { hh.departAt = tick + rng.int(0, 2) * MONTH; hh.departWhy = 'graduated'; hh.departCause = 0; hh.departDest = 'elsewhere'; }
      if (!hh.search && !hh.departAt && S.autoMoves) {
        if (isSharers(hh)) { sharerRotation(hh, ps, adults, seg, rng); }
        else {
          if (rng.chance(moveHazard(hh, u, seg))) { const why = short > 0 ? 'space' : hh.fin && hh.fin.stress > 0.6 ? 'afford' : u.damp ? 'condition' : (hh.members.some((id) => { const p = w.people.get(id); return p && p.alive && w.ageOf(p) < 2; }) && !isSocial(hh.tenure)) ? 'family' : 'lifecycle'; seekDestination(hh, seg, rng, why, u.repair ? u.repair.eid : f ? f.cause : 0, 0); }
          else if (hh.tenure === 'private_rent' && f && adults.length && f.buffer > 4 && f.stress < 0.3 && ps.length && adults.reduce((s, p) => s + p.money, 0) > 12000 && rng.chance(0.004)) startSearch(hh, 'buy', 0, 0);
        }
        // young adults leaving the family home
        for (const p of adults) { const q = p.ext.pop; if (q.role === 'adult_child' && w.ageOf(p) >= 22 && !isSharers(hh) && rng.chance(0.003 * (hh.overcrowdShort > 0 ? 2 : 1))) leaveHome(hh, p, rng); }
      }
    }
    // --- market clearing
    clearMarket(rng);
    // --- pending flatmate rooms
    for (let i = S.pendingRooms.length - 1; i >= 0; i--) {
      const r = S.pendingRooms[i], hh = hhs[r.hh]; if (!hh || hh.gone) { S.pendingRooms.splice(i, 1); continue; }
      if (rng.chance(0.55)) { const p = createSharer(w, rng, hh, r.age); S.pendingRooms.splice(i, 1); finishSharer(hh, p, rng); }
    }
    // --- waiting list upkeep
    S.wait = S.wait.filter((x) => { const hh = hhs[x.hh]; return hh && !hh.gone && (hh.search || x.points > 0 || isSocial(hh.tenure) === false); });
    for (const x of S.wait) x.points += 0.25;
    // --- supply: voids -> demand vs vacancies stats
  }
  function rentRise(u, hh, pct, cause, social) {
    const w = W, old = u.rent; u.rent = Math.round(u.rent * (1 + pct / 100)); u.lastRisePct = pct; if (rented(u.tenure)) hh.rentPcm = u.rent;
    if (pct >= 5 && !social) { const eid = w.emit('housing.rent_rise', { actors: hhLive(hh).slice(0, 2).map((p) => p.id), place: u.bid, objects: [u.id], salience: pct >= 9 ? 0.4 : 0.2, cause, tags: ['housing', 'money'], payload: { pct: +pct.toFixed(1), from: old, to: u.rent } }); if (hh.fin) hh.fin.cause = eid; }
  }
  function serveNotice(u, hh, reason, cause) {
    const w = W, S = H(w); const eid = w.emit('housing.notice_served', { actors: hhLive(hh).slice(0, 3).map((p) => p.id), place: u.bid, objects: [u.id, hh.id], salience: 0.6, cause: cause || 0, tags: ['housing', 'money'], payload: { reason } });
    u.notice = { tick: w.tick, until: w.tick + 2 * MONTH, reason, eid }; S.stats.notices++;
    hh.forced = { reason, eid, until: u.notice.until }; if (!hh.search && !hh.departAt) { seekDestinationForced(hh, reason, eid); }
    if (hh.fin) hh.fin.cause = eid;
    if (!S.wait.some((x) => x.hh === hh.id)) S.wait.push({ hh: hh.id, since: w.tick, points: 4 });
  }
  function seekDestinationForced(hh, reason, eid) { const rng = W.rngFor('housing.forced'); seekDestination(hh, null, rng, reason === 'arrears' ? 'afford' : 'notice', eid, 1); }
  function noticeStep(u, hh, rng, money) {
    const own = ownerOf(u), type = own ? own.kind : 'small_landlord', mk = marketRent(W, u), gap = mk / u.rent - 1;
    let h = 0.0035 * (type === 'small_landlord' ? 1.25 : type === 'build_to_rent' ? 0.3 : 0.8) * (gap > 0.15 ? 2 : 1) * (1 + 3 * clamp(macro().rentGrowth / 10, 0, 1));
    const retaliation = u.complained && W.tick - u.complained < 4 * MONTH ? 4 : 1; h *= retaliation; void money;
    if (!rng.chance(h)) return;
    const r = rng.next(); const reason = retaliation > 1 && r < 0.5 ? 'retaliatory' : r < 0.4 ? 'sale' : r < 0.55 ? 'family_use' : 'relet_higher';
    serveNotice(u, hh, reason, u.repair ? u.repair.eid : 0);
  }
  function processNotice(u, hh, rng) {
    const n = u.notice; if (W.tick < n.until) return;
    if (hh.departAt || hh.search) { if (W.tick < n.until + 2 * MONTH) return; }
    // a household still in place once the notice (plus any extension while it is actively searching) has run out is evicted: whether it found somewhere in time emerges from vacancies, rent ceilings and savings
    const evict = true; void rng;
    if (!evict) { n.until += MONTH; if (n.until - n.tick > 6 * MONTH) { u.notice = null; hh.forced = null; if (hh.fin) hh.fin.arrearsFlag = hh.fin.arrearsFlag; } return; }
    doEvict(u, hh, n.reason, n.eid);
  }
  function doEvict(u, hh, reason, cause) {
    const w = W, S = H(w), ps = hhLive(hh);
    const eid = w.emit('housing.eviction', { actors: ps.map((p) => p.id), place: u.bid, objects: [u.id, hh.id], salience: 0.85, cause: cause || 0, tags: ['housing', 'money', 'hardship'], payload: { reason } }); S.stats.evictions++;
    if (hh.fin) hh.fin.cause = eid;
    const sale = u.notice && u.notice.reason === 'sale'; u.saleFlag = !!sale;
    // temporary accommodation if a social unit is free, else flagged homeless and out of the area
    const ta = S.list.find((x) => x.hh < 0 && x.listed && isSocial(x.tenure) && x.bedrooms >= bedNeed(w, ps) && x.bedrooms <= bedNeed(w, ps) + 1);
    if (ta && hh.fin && hh.fin.stress >= 0) { u.notice = null; moveLocal(hh, ta, 'eviction', eid); return; }
    leaveArea(hh, 'evicted', 'sofa_surfing_then_elsewhere', eid, true);
  }
  function rightToBuy(u, hh) {
    const w = W, price = Math.round(valueOf(w, u) * 0.8 / 1000) * 1000;
    const ow = H(w).owners[0]; if (ow) ow.units = ow.units.filter((x) => x !== u.id);
    u.tenure = 'mortgage'; u.landlord = -1; u.value = price / (w.lf.money ? w.lf.money.macro.hpi : 1); u.hpiBase = 1; hh.tenure = 'mortgage'; hh.landlord = -1; hh.rentPcm = 0; hh.mortgagePcm = Math.round(price * 0.6 * 0.0059);
    if (hh.fin) hh.fin.mort = { bal: Math.round(price * 0.6), rate: 4.8, term: 240, fixEnd: w.tick + 3 * YEAR };
    w.emit('housing.right_to_buy', { actors: hhLive(hh).slice(0, 2).map((p) => p.id), place: u.bid, objects: [u.id], salience: 0.35, tags: ['housing', 'money'], payload: { price } });
  }
  function landlordSell(u, rng) { // vacant unit changes hands to an owner-occupier market
    const w = W, ow = ownerOf(u); if (ow) { ow.units = ow.units.filter((x) => x !== u.id); ow.sold++; }
    u.tenure = rng.chance(0.75) ? 'mortgage' : 'owned_outright'; u.landlord = -1; u.value = BASE_PRICE(w)[Math.min(6, u.bedrooms)] * u.premium; u.hpiBase = w.lf.money ? 1 / (w.lf.money.macro.hpi) * 1 : 1; u.hpiBase = 1; u.rent = 0;
    w.emit('housing.landlord_sale', { place: u.bid, objects: [u.id], salience: 0.35, tags: ['housing'], payload: { units: 1 } });
  }
  function moveLocal(hh, u, why, cause) {
    const w = W, S = H(w), from = hh.bid, ps = hhLive(hh), old = U(hh.unit);
    emitMove(hh, 'housing.moved_out', from, u.bid, cause, { to: 'local', why });
    if (old && old.saleFlag) { old.saleFlag = false; setTenancy(hh, u, why); vacateSold(old); } else setTenancy(hh, u, why);
    const eid = emitMove(hh, 'housing.moved_in', from, u.bid, cause, { from: 'local', why });
    S.stats.moves++; S.stats.localMoves++; S.stats.movedPersons += ps.length; for (const p of ps) S.moveLog.push([w.tick, Math.round(w.ageOf(p)), 'local']);
    if (u.tenure === 'mortgage' && hh.fin) { const price = valueOf(w, u), adults = ps.filter((p) => w.ageOf(p) >= 16), dep = Math.min(price * 0.12, adults.reduce((s, p) => s + Math.max(0, p.money), 0) * 0.8); if (adults.length && dep > 0) { let left = dep; for (const p of adults) { const x = Math.min(left, Math.max(0, p.money)); w.ledger.transfer(p.id, 'metropolis', x, 'house_deposit'); left -= x; } } hh.fin.mort = { bal: Math.round(price - dep), rate: macro().mortRate || 4.8, term: 300, fixEnd: w.tick + 3 * YEAR }; hh.mortgagePcm = Math.round(hh.fin.mort.bal * 0.0059); w.emit('housing.bought', { actors: adults.map((p) => p.id), place: u.bid, objects: [u.id], salience: 0.5, cause: eid, tags: ['housing', 'money'], payload: { price } }); S.stats.bought++; }
    else if (rented(u.tenure) && hh.fin) { // first month + deposit-ish
      const t = ps.find((p) => w.ageOf(p) >= 16 && p.money > u.rent * 0.5); if (t) w.ledger.transfer(t.id, u.tenure === 'council' ? 'council' : 'l:' + u.landlord, Math.min(u.rent * 0.6, t.money), 'rent_deposit');
    }
    w.emit('housing.let', { place: u.bid, objects: [u.id, hh.id], salience: 0.1, cause: eid, tags: ['housing'], payload: { tenure: u.tenure } });
    return eid;
  }
  function vacateSold(old) { landlordSell(old, W.rngFor('housing.sale')); }
  /** A person (plus dependants) splits off from household hh: into their own rented place in Larkfield (if `dest` is null and a unit is free) or away
   *  (partner's place, university, another city). Returns {ok, where:'local'|'away', hh?}. Used by life through housing.leaveHome / housing.separate. */
  function splitOff(hh, group, why, dest, rng, localChance = 1) {
    const w = W, S = H(w), p = group[0], pop = p.ext.pop, adults = group.filter((x) => w.ageOf(x) >= 16).length, kids = group.length - adults;
    const beds = Math.max(1, Math.floor(adults / 2) + (adults % 2) + Math.ceil(kids / 2));
    const cand = dest ? [] : S.list.filter((x) => x.hh < 0 && x.listed && x.tenure === 'private_rent' && x.bedrooms >= beds && x.bedrooms <= beds + 1 && x.rent <= 1100 + 350 * beds).sort((a, b) => a.rent - b.rent || a.id - b.id);
    const ids = new Set(group.map((x) => x.id));
    if (cand.length && rng.chance(localChance)) {
      const u = cand[0], eid = w.emit('housing.moved_out', { actors: group.map((x) => x.id), place: hh.bid, salience: 0.35, tags: ['housing', 'life'], payload: { to: 'local', reason: why } });
      hh.members = hh.members.filter((id) => !ids.has(id));
      const nh = { id: w.lf.households.length, unit: u.id, bid: u.bid, seg: hh.seg === 'older_longterm' ? 'early_career' : hh.seg, arch: group.length > 1 ? 'lone_parent_dep' : 'one_person_u66', members: group.map((x) => x.id), tenure: u.tenure, rentPcm: u.rent, mortgagePcm: 0, income: { gross: 0, net: 0, benefits: 0 }, cars: 0, dogs: 0, cats: 0, since: w.tick, group: hh.group, landlord: u.landlord, address: u.address, bedrooms: u.bedrooms, sav: { savings: 0, debt: 0, arrears: 0 } };
      w.lf.households.push(nh); u.hh = nh.id; u.since = w.tick; u.listed = false; u.voidUntil = 0; u.lastSeg = nh.seg;
      for (const x of group) { const q = x.ext.pop, ob = x.homeId; q.hh = nh.id; q.unit = u.id; q.role = x === p ? 'head' : 'child'; relocate(x, u.bid, ob); if (w.commands.has('routine.adopt')) w.cmd('routine.adopt', { pid: x.id, from: ob }); }
      if (w.commands.has('money.initHousehold')) w.cmd('money.initHousehold', { hh: nh.id });
      w.emit('housing.moved_in', { actors: group.map((x) => x.id), place: u.bid, objects: [nh.id], salience: 0.35, cause: eid, tags: ['housing', 'life'], payload: { from: 'local', reason: why, unit: u.id, tenure: u.tenure } });
      S.stats.moves++; S.stats.localMoves++; S.stats.movedPersons += group.length; for (const x of group) S.moveLog.push([w.tick, Math.round(w.ageOf(x)), 'local']);
      return { ok: true, where: 'local', hh: nh.id };
    }
    const to = dest || rng.pick(['a flat share elsewhere in the city', 'a rented flat across town', 'a room in a shared house elsewhere']);
    w.emit('housing.moved_out', { actors: group.map((x) => x.id), place: hh.bid, salience: 0.35, tags: ['housing', 'life'], payload: { to: 'metropolis', reason: why } });
    for (const x of group) {
      if (w.commands.has('labour.depart')) w.cmd('labour.depart', { pid: x.id });
      if (x.ext.life) x.ext.life.away = { tick: w.tick, to, map: {}, hh: hh.id }; // so life can bring them back (boomerang)
      x.emigrated = true; x.emigratedTick = w.tick; x.emigratedTo = to; if (x.ext.rt) x.ext.rt.off = null; w.removePerson(x);
      S.stats.movedPersons++; S.moveLog.push([w.tick, Math.round(w.ageOf(x)), 'out']);
    }
    void pop; return { ok: true, where: 'away', to };
  }
  function leaveHome(hh, p, rng) {
    const cand = H(W).list.some((x) => x.hh < 0 && x.listed && x.tenure === 'private_rent' && x.bedrooms <= 2 && x.rent <= 1100);
    if (cand && rng.chance(0.4)) splitOff(hh, [p], 'own_place', null, rng); else if (rng.chance(0.5)) splitOff(hh, [p], 'own_place', 'metropolis', rng);
  }
  const studying = (p) => p.ext.pop.activity === 'student' || (p.ext.pop.school && (p.ext.pop.school.kind === 'university' || p.ext.pop.school.kind === 'college')); // working students still study
  function sharerRotation(hh, ps, adults, seg, rng) {
    const w = W, S = H(w), rate = hh.seg === 'students' ? 0.014 : hh.seg === 'young_sharers' ? 0.010 : 0.005;
    for (const p of adults) {
      // student-let tenancies end with the course: a former student (graduated, dropped out) in a student house gives notice at ~10%/month
      // (tenancy ends / graduate job elsewhere); the vacant room is re-let to the next cohort (pendingRooms)
      const r = hh.seg === 'students' && !studying(p) ? 0.10 : rate;
      if (adults.length < 2 || !rng.chance(r)) continue;
      const age = w.ageOf(p), eid = w.emit('housing.moved_out', { actors: [p.id], place: hh.bid, objects: [hh.id], salience: 0.3, tags: ['housing', 'life', 'churn'], payload: { to: 'metropolis', reason: 'flatmate_rotation' } });
      if (w.commands.has('labour.depart')) w.cmd('labour.depart', { pid: p.id });
      p.emigrated = true; p.emigratedTick = w.tick; p.emigratedTo = rng.pick(['metropolis', 'partner_elsewhere', 'new_job_elsewhere', 'back_home']); w.removePerson(p);
      S.pendingRooms.push({ hh: hh.id, age, cause: eid }); S.stats.sharerChurn++; S.stats.movedPersons++; S.moveLog.push([w.tick, Math.round(age), 'out']); break;
    }
  }
  function finishSharer(hh, p, rng) {
    const w = W, S = H(w), seg = w.pack.meta.segments.find((s) => s.id === hh.seg), net = Math.max(900, seg.money.incomeBand[1] / 12 * 0.8);
    const sv = savingsFor(rng, seg, net, hh.tenure); if (sv.savings > 0) w.ledger.transfer('metropolis', p.id, sv.savings, 'arrival_savings'); p.ext.pop.fin.debt = sv.debt;
    p.ext.pop.fin.cc = Math.round(sv.debt * 0.8); p.ext.pop.fin.payday = 0; p.ext.pop.fin.pension = 0; p.ext.pop.fin.sp = 1; p.ext.pop.fin.priv = 0; p.ext.pop.fin.stress = 0; p.ext.pop.fin.noCredit = false;
    p.ext.pop.hh = hh.id; p.ext.pop.unit = hh.unit; p.homeId = hh.bid; const b = w.buildings.get(hh.bid); if (!b.residents.includes(p.id)) b.residents.push(p.id);
    if (w.commands.has('labour.initPerson')) w.cmd('labour.initPerson', { pid: p.id, job: true });
    if (w.commands.has('routine.adopt')) w.cmd('routine.adopt', { pid: p.id });
    S.stats.movedPersons++; S.moveLog.push([w.tick, Math.round(w.ageOf(p)), 'in']);
    w.emit('housing.moved_in', { actors: [p.id], place: hh.bid, objects: [hh.id], salience: 0.3, tags: ['housing', 'life', 'churn'], payload: { from: 'outside', reason: 'flatmate_arrival', unit: hh.unit, tenure: hh.tenure } });
  }
  // ---------------------------------------------------------------- market clearing
  function candidates(hh) {
    const s = hh.search, S = H(W);
    return S.list.filter((u) => u.hh < 0 && u.listed && u.id !== hh.unit && (!u.studentLet || hh.seg === 'students') && (s.buy ? (u.tenure === 'mortgage' || u.tenure === 'owned_outright') : u.tenure === 'private_rent') && u.bedrooms >= s.beds && u.bedrooms <= s.beds + 1 && (s.buy ? valueOf(W, u) * 0.9 <= Math.max(1, (hh.income ? hh.income.gross : 30000)) * 4.5 : u.rent <= s.maxRent * 1.05));
  }
  function clearMarket(rng) {
    const w = W, S = H(w), tick = w.tick, hhs = w.lf.households;
    const taken = new Set();
    // 1. social waiting list gets social vacancies
    S.wait.sort((a, b) => b.points - a.points || a.hh - b.hh);
    for (const u of S.list) {
      if (u.hh >= 0 || !u.listed || !isSocial(u.tenure)) continue;
      const x = S.wait.find((e) => { const hh = hhs[e.hh]; return hh && !hh.gone && hh.unit !== u.id && U(hh.unit) && bedNeed(w, hhLive(hh)) <= u.bedrooms && bedNeed(w, hhLive(hh)) >= u.bedrooms - 1 && (hh.search || hh.forced || hh.crowded || !isSocial(hh.tenure)); });
      if (x) { const hh = hhs[x.hh]; S.wait.splice(S.wait.indexOf(x), 1); taken.add(u.id); moveLocal(hh, u, 'social_allocation', hh.forced ? hh.forced.eid : 0); continue; }
      if (rng.chance(0.75)) { taken.add(u.id); arrive(u, rng.chance(0.55) ? 'benefit_dependent' : null); }
    }
    // 2. local searchers
    for (const hh of hhs) {
      if (hh.gone || !hh.search) continue; const s = hh.search;
      const c = candidates(hh).filter((u) => !taken.has(u.id));
      c.sort((a, b) => (s.buy ? valueOf(w, a) - valueOf(w, b) : a.rent - b.rent) || a.id - b.id);
      let done = false;
      if (c.length) { const pick = c[Math.min(c.length - 1, rng.int(0, Math.min(2, c.length - 1)))]; if (rng.chance(hh.fin && hh.fin.claim ? 0.6 : 0.88)) { taken.add(pick.id); moveLocal(hh, pick, s.reason, s.cause); done = true; } }
      if (done) continue;
      s.tries++;
      if (isSocial(hh.tenure) === false && !S.wait.some((e) => e.hh === hh.id) && s.reason !== 'buy' && hh.fin && hh.fin.stress > 0.45 && rng.chance(0.3)) S.wait.push({ hh: hh.id, since: tick, points: 1 });
      const lim = s.forced ? 3 : 5;
      if (s.tries >= lim) {
        hh.search = null;
        if (s.forced) { const u = U(hh.unit); if (u && u.notice) { /* keep notice running; leaving area if nothing by deadline */ hh.departAt = Math.max(tick, u.notice.until - MONTH); hh.departWhy = s.reason; hh.departCause = s.cause; hh.departDest = 'metropolis'; } }
      }
    }
    // 3. arrivals fill remaining private/owner vacancies
    const demand = clamp(0.5 + 0.1 * (macro().rentGrowth - 3) - 0.3 * macro().recession, 0.2, 0.9);
    for (const u of S.list) {
      if (u.hh >= 0 || !u.listed || isSocial(u.tenure) || taken.has(u.id) || u.tenure === 'shared_ownership') { if (u.hh < 0 && u.listed && u.tenure === 'shared_ownership' && rng.chance(0.3)) arrive(u, null); continue; }
      const p = u.tenure === 'private_rent' ? Math.min(0.95, demand + 0.2) : demand * 0.85;
      if (rng.chance(p)) { // landlords may sell empty units instead
        if (u.tenure === 'private_rent') { const ow = ownerOf(u); if (ow && ow.kind === 'small_landlord' && rng.chance(0.045)) { landlordSell(u, rng); u.listed = true; continue; } }
        arrive(u, null);
      }
    }
  }
  // ---------------------------------------------------------------- queries
  const unitOfAny = (x) => { const p = typeof x === 'number' ? W.people.get(x) : x; if (p && p.ext && p.ext.pop) { const hh = W.lf.households[p.ext.pop.hh]; return hh ? U(hh.unit) : null; } return null; };
  const hhOfArg = (a) => (a.hh != null ? W.lf.households[a.hh] : a.pid != null ? (W.people.get(a.pid) ? W.lf.households[W.people.get(a.pid).ext.pop.hh] : null) : null);
  const unitView = (u) => (u ? { id: u.id, bid: u.bid, tenure: u.tenure, bedrooms: u.bedrooms, rent: u.rent, cond: u.cond, damp: u.damp, landlord: u.landlord, hh: u.hh, notice: u.notice ? { ...u.notice } : null, address: u.address, repair: !!u.repair, value: valueOf(W, u), since: u.since } : null);
  const stats = () => {
    const S = H(W), hhs = W.lf.households.filter((h) => !h.gone), ten = {}; for (const h of hhs) ten[h.tenure] = (ten[h.tenure] || 0) + 1;
    const vac = S.list.filter((u) => u.hh < 0).length; let oc = 0; for (const h of hhs) if (h.crowded) oc++;
    return { households: hhs.length, tenure: ten, vacancies: vac, vacancyRate: vac / S.list.length, units: S.list.length, overcrowded: oc, overcrowdedRate: oc / Math.max(1, hhs.length), ...S.stats, wait: S.wait.length };
  };
  const plugin = {
    name: 'housing', version: '1.0.0', eventTypes: EVENTS.map((e) => e[0]),
    clocks: { month: (w) => monthly(w) },
    init(world) {
      W = world; registerEvents(world, EVENTS); initState(world);
      if (world.events.registry.has('goal.effect')) world.events.on('goal.effect', onGoalEffect);
      if (world.events.registry.has('project.effect')) world.events.on('project.effect', (ev) => { if (ev.payload.effect === 'unit_claimed' && ev.place != null) claimUnit({ building: ev.place, name: 'New business', cause: ev.id }); });
    },
    query: {
      unit: (x) => unitView(unitOfAny(x)), landlordOf: (x) => { const u = unitOfAny(x); return u ? { id: u.landlord, kind: u.landlord >= 0 && H(W).owners[u.landlord] ? H(W).owners[u.landlord].kind : 'owner' } : null; },
      vacancies: (f = {}) => H(W).list.filter((u) => u.hh < 0 && (u.listed || f.all) && (!f.beds || u.bedrooms >= f.beds) && (!f.tenure || u.tenure === f.tenure) && (!f.maxRent || u.rent <= f.maxRent)).map(unitView),
      rentBurden: (x) => { const hh = x && x.members ? x : hhOfArg(typeof x === 'object' ? x : { pid: x }); if (!hh || !hh.fin || !hh.rentPcm) return 0; const inc = hh.fin.income; return inc > 0 ? hh.rentPcm / inc : 1; },
      market: () => { const m = macro(); return { rentIndex: m.rent, rentGrowth: m.rentGrowth, hpi: m.hpi, gentrification: gentrif(W), vacancyRate: stats().vacancyRate, mortRate: m.mortRate }; },
      gentrification: () => gentrif(W), overcrowded: (x) => { const hh = x && x.members ? x : hhOfArg({ pid: x }); return hh ? !!hh.crowded : false; },
      equity: (id) => { const hh = W.lf.households[id]; if (!hh) return 0; const u = U(hh.unit); if (!u || (hh.tenure !== 'mortgage' && hh.tenure !== 'owned_outright' && hh.tenure !== 'shared_ownership')) return 0; return Math.max(0, valueOf(W, u) * (hh.tenure === 'shared_ownership' ? 0.4 : 1) - (hh.fin && hh.fin.mort ? hh.fin.mort.bal : 0)); },
      value: (id) => { const hh = W.lf.households[id]; const u = hh && U(hh.unit); return u ? valueOf(W, u) : 0; },
      waitlist: () => H(W).wait.map((e) => ({ ...e })), stats, moves: () => H(W).moveLog.slice(), units: () => H(W).list.length,
    },
    commands: {
      'housing.move': (w, a) => {
        const hh = hhOfArg(a); if (!hh || hh.gone) return false;
        if (a.unit != null) { const u = U(a.unit); if (!u || u.hh >= 0) return false; moveLocal(hh, u, a.reason || 'chosen', a.cause || 0); return true; }
        if (hh.search) return true; if (a.out) { hh.departAt = w.tick + MONTH; hh.departWhy = a.reason || 'chosen'; hh.departDest = a.dest || 'metropolis'; return true; }
        startSearch(hh, a.reason || 'chosen', a.forced || 0, a.cause || 0); return true;
      },
      'housing.leaveHome': (w, a) => { // someone (plus dependants) moves out of the household they live in
        const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.pop) return { ok: false };
        const hh = w.lf.households[p.ext.pop.hh]; if (!hh || hh.gone) return { ok: false };
        const deps = (a.dependants || []).map((id) => w.people.get(id)).filter((x) => x && x.alive && x.ext.pop && x.ext.pop.hh === hh.id);
        const away = a.dest || a.reason === 'university';
        return splitOff(hh, [p, ...deps], a.reason || 'own_place', away ? (a.dest || 'university halls, another city') : null, w.rngFor('housing.leavehome'), a.reason === 'independence' || a.reason === 'job' ? 0.4 : 0.5);
      },
      'housing.moveTogether': (w, a) => { // two partners living apart move in together: the one with the better home hosts (more beds, owns, has the kids)
        const A = w.people.get(a.a), B = w.people.get(a.b); if (!A || !B || !A.alive || !B.alive || !A.ext.pop || !B.ext.pop) return { ok: false };
        const ha = w.lf.households[A.ext.pop.hh], hb = w.lf.households[B.ext.pop.hh]; if (!ha || !hb || ha.gone || hb.gone) return { ok: false };
        if (ha.id === hb.id) return { ok: true, how: 'same_home' };
        const own = (x) => (x.ext.pop.role === 'head' || x.ext.pop.role === 'partner' ? 2 : 0);
        const kidsOf = (x, h) => hhLive(h).filter((c) => c.id !== x.id && w.ageOf(c) < 18 && (c.family.motherId === x.id || c.family.fatherId === x.id));
        const score = (x, h) => own(x) + (U(h.unit) ? U(h.unit).bedrooms : 2) * 0.3 + (h.tenure === 'owned_outright' || h.tenure === 'mortgage' ? 1 : 0) + (kidsOf(x, h).length ? 0.8 : 0);
        const [host, hHost, mover, hMover] = score(A, ha) >= score(B, hb) ? [A, ha, B, hb] : [B, hb, A, ha];
        const group = [mover, ...kidsOf(mover, hMover)], need = bedNeed(w, [...hhLive(hHost), ...group]), cap = U(hHost.unit) ? U(hHost.unit).bedrooms : 2;
        if (need > cap + 1 && !a.force) return { ok: false, why: 'no room' }; // they wait and look; asked again with force after a few months (then the crowded home searches for a bigger place by itself)
        for (const x of group) w.cmd('housing.join', { pid: x.id, hh: hHost.id, role: x === mover ? (own(host) ? 'partner' : 'adult_child') : 'child', reason: 'couple', cause: a.cause || 0 });
        return { ok: true, how: 'joined', host: host.id };
      },
      'housing.separate': (w, a) => { // a couple living together splits: the leaver finds a place (or goes away); they may linger under one roof for a while
        const p = w.people.get(a.leaver); if (!p || !p.alive || !p.ext.pop) return { ok: false };
        const hh = w.lf.households[p.ext.pop.hh]; if (!hh || hh.gone) return { ok: false };
        const rng = w.rngFor('housing.separate'); if (rng.chance(0.18)) return { ok: false, retry: true };
        return splitOff(hh, [p], 'separation', null, rng, 0.45);
      },
      'housing.rentFlat': (w, a) => {
        const hh = hhOfArg(a), u = U(a.unit); if (!hh || !u || u.hh >= 0 || !rented(u.tenure)) return { ok: false };
        const ps = hhLive(hh), cash = ps.reduce((s, p) => s + Math.max(0, p.money), 0); if (cash < u.rent * 0.6) return { ok: false, why: 'cannot afford deposit' };
        moveLocal(hh, u, a.reason || 'player', a.cause || 0); return { ok: true, unit: u.id };
      },
      'housing.join': (w, a) => { // a person joins another household's home (partner moves in, boomerang, lodger)
        const p = w.people.get(a.pid), hh = w.lf.households[a.hh]; if (!p || !hh || hh.gone || !p.ext.pop) return false;
        const old = w.lf.households[p.ext.pop.hh], ob = p.homeId, i = old ? old.members.indexOf(p.id) : -1; if (i >= 0) old.members.splice(i, 1);
        if (old && !hhLive(old).length) { old.gone = true; const ou = U(old.unit); if (ou) { ou.hh = -1; vacate(ou, 'household_merge'); } }
        hh.members.push(p.id); p.ext.pop.hh = hh.id; p.ext.pop.unit = hh.unit; p.ext.pop.role = a.role || 'other'; relocate(p, hh.bid, ob);
        if (w.commands.has('routine.adopt')) w.cmd('routine.adopt', { pid: p.id, from: ob });
        w.emit('housing.moved_in', { actors: [p.id], place: hh.bid, objects: [hh.id], salience: 0.3, cause: a.cause || 0, tags: ['housing', 'life'], payload: { from: 'local', reason: a.reason || 'join', unit: hh.unit, tenure: hh.tenure } }); return true;
      },
      'housing.rentShock': (w, a) => {
        const eid = w.emit('housing.rent_shock', { salience: 0.6, tags: ['housing', 'god'], payload: { pct: a.pct } }); let n = 0;
        for (const u of H(w).list) if (u.tenure === 'private_rent' && u.rent > 0) { u.rent = Math.round(u.rent * (1 + a.pct / 100)); u.lastRisePct = a.pct; u.lastRise = w.tick; if (u.hh >= 0) { const hh = w.lf.households[u.hh]; const old = hh.rentPcm; hh.rentPcm = u.rent; let eid2 = eid; if (a.pct >= 5) eid2 = w.emit('housing.rent_rise', { actors: hhLive(hh).slice(0, 2).map((p) => p.id), place: u.bid, objects: [u.id], salience: a.pct >= 9 ? 0.4 : 0.2, cause: eid, tags: ['housing', 'money'], payload: { pct: +a.pct.toFixed(1), from: old, to: u.rent } }); /* each household gets its own letter, caused by the shock */ if (hh.fin) hh.fin.cause = eid2; } n++; }
        if (w.lf.money) w.lf.money.macro.rent *= 1 + a.pct / 100; return n;
      },
      'housing.evict': (w, a) => { const u = a.unit != null ? U(a.unit) : unitOfAny(a.pid); if (!u || u.hh < 0) return false; const hh = w.lf.households[u.hh]; doEvict(u, hh, 'god_command', a.cause || 0); return true; },
      'housing.repair': (w, a) => { const u = U(a.unit); if (!u) return false; u.cond = clamp(u.cond + 0.3, 0, 1); u.damp = false; u.repair = null; return true; },
      'housing.sellUnit': (w, a) => { const u = U(a.unit); if (!u || u.hh >= 0) return false; landlordSell(u, w.rngFor('housing.sale')); return true; },
      'housing.buildFlats': (w, a) => {
        const S = H(w), rng = w.rngFor('housing.build'), n = a.n || 6;
        const bs = [...w.buildings.values()].filter((b) => b.lf && b.lf.archetype && /apartment|flats/i.test(b.lf.archetype) && b.zone === 'res');
        const host = bs.length ? bs[rng.int(0, bs.length - 1)] : [...w.buildings.values()].find((b) => b.zone === 'res'); if (!host) return 0;
        let nid = Math.max(...S.list.map((u) => u.id), ...w.map.lf.units.map((u) => u.id)) + 1;
        for (let i = 0; i < n; i++) {
          const beds = rng.chance(0.4) ? 1 : rng.chance(0.7) ? 2 : 3, tenure = rng.chance(0.7) ? 'housing_assoc' : 'shared_ownership';
          const u = { id: nid++, bid: host.id, kind: 'flat', bedrooms: beds, area: 40 + beds * 15, tenure, landlord: 1, rent: 0, value: tenure === 'shared_ownership' ? BASE_PRICE(w)[beds] : 0, hh: -1, address: host.name, label: 'new build', premium: 1, cond: 1, damp: false, repair: null, notice: null, since: 0, lastRise: w.tick, lastRisePct: 0, voidUntil: w.tick + MONTH, listed: false, complained: 0, hpiBase: 1, cafeNear: 0, bx: host.door.x, by: host.door.y, floor: 1 };
          u.rent = marketRent(w, u); S.list.push(u); S.byId[u.id] = u; S.owners[1].units.push(u.id); if (host.lf.units) host.lf.units.push(u.id);
        }
        S.stats.built += n; w.emit('housing.built', { place: host.id, salience: 0.5, cause: a.cause || 0, tags: ['housing', 'civic'], payload: { n } }); return n;
      },
      'venues.claim_unit': (w, a) => claimUnit(a),
    },
  };
  function claimUnit(a) {
    const w = W, b = w.buildings.get(a.building); if (!b) return false; b.lf.claim = { name: a.name || 'New business', group: a.group ?? null, tick: w.tick };
    if (w.commands.has('labour.openFirm')) w.cmd('labour.openFirm', { bid: b.id, name: a.name });
    H(w).extraCafes = (H(w).extraCafes || 0) + 1;
    w.emit('housing.unit_claimed', { place: b.id, salience: 0.4, cause: a.cause || 0, tags: ['housing', 'civic', 'visible'], payload: { name: a.name || 'New business' } }); return true;
  }
  function onGoalEffect(ev) {
    const p = W.people.get(ev.actors[0]); if (!p || !p.alive || !p.ext.pop) return; const hh = W.lf.households[p.ext.pop.hh]; if (!hh || hh.gone) return; const want = ev.payload.want;
    if (want === 'new_tenancy' || want === 'own_place' || want === 'suitable_home') { const stable = !hh.crowded && !(hh.fin && hh.fin.stress > 0.5) && !(U(hh.unit) && U(hh.unit).damp); const anchored = isSocial(hh.tenure) || hhLive(hh).some((k) => { const a = W.ageOf(k); return a >= 4 && a < 17; }) || (p.ext.pop.yearsAtAddress || 0) > 6; // secure tenancy, school places, long roots: a wish to move is not acted on while nothing is wrong
      if (stable && want !== 'own_place' && anchored) return;
      if (want === 'own_place' && p.ext.pop.role === 'adult_child' && !isSharers(hh)) leaveHome(hh, p, W.rngFor('housing.goal')); else if (!hh.search) startSearch(hh, want === 'suitable_home' ? 'space' : 'chosen', 0, ev.id); }
    else if (want === 'owns_home') { if (!hh.search) startSearch(hh, 'buy', 0, ev.id); }
    else if (want === 'lives_elsewhere') { hh.departAt = W.tick + MONTH; hh.departWhy = 'chosen'; hh.departCause = ev.id; hh.departDest = 'metropolis'; }
    else if (want === 'repair_done') { const u = U(hh.unit); if (u && u.repair) { u.repair.since -= MONTH; if (W.rngFor('housing.goal').chance(0.6)) W.cmd('housing.repair', { unit: u.id }); } }
  }
  return plugin;
}
export default createHousing;
