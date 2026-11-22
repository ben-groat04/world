// LABOUR (W1-C): on-map firms (venue staff slots) + abstract off-map employers; hiring (applications + referral ties), job search spells, separations
// (redundancy, fixed-term end, firm closure, quits, sickness, retirement), pay reviews / promotions, second jobs, inactivity transitions, sector shocks.
//   QUERY  world.sys.labour.query: openings({occ,bid,onmap}) job(pid) unemployment() firm(bid) firmClosed(bid) searchers() sectorOf(occId) stats()
//   CMD    labour.applyForJob{pid,bid?,occ?} labour.hire{pid,bid?,occ?,pay?,hours?} labour.quit{pid} labour.layoffs{sector,share} labour.recession{severity} labour.closeFirm{bid}
//          labour.raise{pid,pct} labour.retire{pid} labour.secondJob{pid,hours} labour.openFirm{bid,name} labour.initPerson{pid}
//   EVENTS labour.hired labour.job_lost labour.quit labour.promoted labour.pay_rise labour.retired labour.firm_closed labour.firm_opened labour.second_job labour.sector_shock labour.went_inactive labour.graduated labour.applied
//   Consumes goals' goal.effect (get_job/change_job/pay_rise/promoted/left_job/back_at_work/self_employed/side_income...) when the goals plugin is loaded.
import { clamp, registerEvents, livePeople } from '../money/util.js';
import { annualPay, hourlyRate } from '../../pay.js';
import { drawOccupation, REGULATED, TRAINING, credOf, credOcc, hasCred, grantCred, bankExperience, xpYears, gateWeight, occMap, offmapWorkplace, hoursFor, contractFor, payFor, sectorOfOcc, sectorOfBuilding, LADDER, SECTORS, QRANK } from './jobs.js';

const EVENTS = [
  ['labour.hired', 'A resident started a job', { occ: 'string' }], ['labour.job_lost', 'A resident lost their job (redundancy, fixed-term end, firm closure, dismissal)', { kind: 'string' }],
  ['labour.quit', 'A resident resigned', { kind: 'string' }], ['labour.promoted', 'Promotion with a pay jump', { occ: 'string' }], ['labour.pay_rise', 'Notable pay rise', { pct: 'number' }],
  ['labour.retired', 'A resident retired', { age: 'number' }], ['labour.firm_closed', 'An on-map business closed', { reason: 'string' }], ['labour.firm_opened', 'An on-map business (re)opened', { name: 'string' }],
  ['labour.training', 'Started a course or apprenticeship toward a regulated job', { cred: 'string', years: 'number' }], ['labour.qualified', 'Completed a qualification needed for a regulated job', { cred: 'string' }],
  ['labour.second_job', 'Took a second job / gig shifts', { hours: 'number' }], ['labour.sector_shock', 'Shock to a sector of the labour market', { sector: 'string' }],
  ['labour.went_inactive', 'Left the labour force (sickness, caring, discouraged)', { why: 'string' }], ['labour.graduated', 'Finished study and entered the job market', { age: 'number' }], ['labour.applied', 'A job application and its result', { ok: 'boolean' }],
];
const MIN_TIME_TO_HIRE = 0.5; // months (about 2 weeks: agency, hospitality and retail starts can be that quick; nothing starts within days of a quit)
const GRAD_SHARE = [['nurse', 0.05], ['allied_health', 0.03], ['teacher', 0.04], ['solicitor', 0.025], ['doctor', 0.02], ['social_worker', 0.01], ['pharmacist', 0.006], ['dentist', 0.003]];
const MONTH = 4380;
const L = (w) => w.lf.labour;
const ageF = (a) => (a < 25 ? 1.8 : a < 35 ? 1.3 : a < 50 ? 0.9 : a < 60 ? 0.6 : 0.4);
const hash = (n, k) => ((Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(k, 0xc2b2ae35)) >>> 0) / 4294967296;

export function createLabour() {
  let W = null;
  const macro = () => W.lf.money ? W.lf.money.macro : { recession: 0, wage: 1, wageGrowth: 3, nmw: 1 };
  const slotsOf = (bid) => W.lf.slots.filter((s) => s.bid === bid);
  const findSlot = (q, p) => W.lf.slots.find((s) => s.bid === q.workplace.bid && s.vid === q.workplace.vid && s.occ === q.occ && s.filled.includes(p.id));
  const staffEntry = (s) => { const b = W.buildings.get(s.bid); return b ? b.lf.staff.find((x) => x.vid === s.vid && x.occ === s.occ) : null; };
  const syncStaff = (s) => { const e = staffEntry(s); if (e) { e.filled = s.filled.slice(); e.n = s.n; } };
  const firmOf = (bid) => L(W).firms[bid];
  const closed = (bid) => { const f = firmOf(bid); return !!(f && f.closedUntil > W.tick); };
  const sectorOfPerson = (p) => sectorOfOcc(occMap(W)[p.ext.pop.occ || p.ext.pop.lastOcc]);

  function hasVacancy(occ) { return W.lf.slots.some((s) => s.occ === occ && s.vac.length > 0 && !closed(s.bid)); }
  // --- separation: take p out of their job and into the given state
  function separate(p, kind, why, opts = {}) {
    const q = p.ext.pop, w = W, wasOcc = q.occ; if (wasOcc) bankExperience(w, q, wasOcc, q.soc);
    if (q.workplace && q.workplace.kind === 'onmap') {
      const s = findSlot(q, p);
      if (s) { s.filled.splice(s.filled.indexOf(p.id), 1); if (!opts.noVacancy) s.vac.push({ since: w.tick, occ: s.occ }); else s.n--; syncStaff(s); }
      const b = w.buildings.get(q.workplace.bid); if (b) { const i = b.employees.indexOf(p.id); if (i >= 0) b.employees.splice(i, 1); }
    }
    p.workId = null; q.lastOcc = wasOcc || q.lastOcc; q.lastPay = q.pay || q.lastPay; q.lastEnd = w.tick; q.tenureStart = 0; q.contractEnd = 0; q.job2 = null;
    q.occ = null; q.hours = 0; q.workplace = { kind: 'none' }; q.pattern = null;
    return wasOcc;
  }
  function replan(p) { if (p.ext.rt && W.commands.has('routine.replan')) W.cmd('routine.replan', { pid: p.id }); }
  function loseJob(p, kind, cause, opts = {}) {
    const q = p.ext.pop, hh = W.lf.households[q.hh], wasOcc = separate(p, kind, '', opts);
    q.activity = kind === 'sick' ? 'sick_disabled' : 'unemployed'; p.job = q.activity;
    if (q.activity === 'unemployed') q.search = { since: W.tick, kind: 'unemp', tries: 0 };
    const eid = W.emit(kind === 'quit' ? 'labour.quit' : 'labour.job_lost', { actors: [p.id], salience: 0.45, cause: cause || 0, tags: ['labour', 'money'], payload: { kind, occ: wasOcc || '' } });
    if (hh && hh.fin) hh.fin.cause = eid; q.lastShock = eid; L(W).stats.lost++;
    replan(p); return eid;
  }
  function referralStrength(p) {
    if (L(W).noReferral) return 0; let s = 0; const ties = p.ext.pop.ties || [];
    for (let i = 0; i < ties.length; i++) { const t = ties[i]; if (t.t <= 2) s += (t.s || 0.4) * 0.12; else if (t.t === 3) s += 0.02; }
    return Math.min(1.2, s);
  }
  // --- start p in occupation o (offmap/home) or in an on-map slot
  function startJob(p, o, o2 = {}) {
    const q = p.ext.pop, hh = W.lf.households[q.hh], rng = W.rngFor('labour.hire'), prior = q.lastOcc, same = prior === o.id;
    { const cr = credOf(o); if (cr) { grantCred(q, cr); if (q.train && q.train.cred === cr) q.train = null; } } // (whoever holds a regulated job holds its qualification: the gate is upstream in drawOccupation / applyForJob / promotion)
    q.occ = o.id; q.soc = o.soc; q.pattern = o.pattern; q.contract = o2.contract || contractFor(rng, o, hh); q.hours = o2.hours ?? hoursFor(rng, o, p, hh, W);
    q.pay = o2.pay ?? payFor(W, rng, p, o, macro(), q.lastPay, same);
    if (o2.slot) { const s = o2.slot; if (s.vac.length) s.vac.shift(); s.filled.push(p.id); syncStaff(s); q.workplace = { kind: 'onmap', bid: s.bid, vid: s.vid, mode: 'walk', mins: 3 }; p.workId = s.bid; const b = W.buildings.get(s.bid); if (b && !b.employees.includes(p.id)) b.employees.push(p.id); }
    else { q.workplace = offmapWorkplace(W, rng, p, o); p.workId = null; }
    q.activity = 'employed'; p.job = o.label; q.tenureStart = W.tick; q.contractEnd = q.contract === 'fixed_term' ? W.tick + rng.int(6, 18) * MONTH : 0;
    q.retireAge = q.retireAge || clamp(rng.gauss(65.3, 2.6), 58, 72) + (q.contract === 'self_employed' ? 2 : 0);
    if (q.search) { const dur = (W.tick - q.search.since) / MONTH; L(W).durations.push(dur); if (L(W).durations.length > 400) L(W).durations.shift(); }
    q.search = null; q.lastOcc = o.id;
    replan(p);
  }
  function hire(p, o, how, cause, o2 = {}) {
    const q = p.ext.pop, hh = W.lf.households[q.hh]; const was = q.activity;
    startJob(p, o, o2);
    const eid = W.emit('labour.hired', { actors: [p.id], place: q.workplace.kind === 'onmap' ? q.workplace.bid : null, salience: 0.35, cause: cause || q.lastShock || 0, tags: ['labour'], payload: { occ: o.id, via: how, from: was } });
    if (hh && hh.fin) hh.fin.cause = eid; L(W).stats.hired++; if (how === 'referral') L(W).stats.referral++; return eid;
  }
  function openSlotFor(p, occId) { return W.lf.slots.find((s) => s.occ === occId && s.vac.length > 0 && !closed(s.bid)); }

  // --- initial bookkeeping
  function initState(w) {
    const lf = w.lf; if (lf.labour) return;
    lf.labour = { firms: {}, durations: [], stats: { hired: 0, lost: 0, referral: 0, retired: 0, promoted: 0, closures: 0, quits: 0 }, shocks: {}, noReferral: false };
    const rng = w.rngFor('labour.init'), OCC = occMap(w);
    // repair: population left person objects/undefined in slot.filled (ids were not assigned yet), so firm closures could not find their staff. Rebuild from workplaces.
    for (const s of lf.slots) s.filled = [];
    for (const p of w.people.values()) { const q = p.ext && p.ext.pop; if (q && q.occ && q.workplace && q.workplace.kind === 'onmap') { const s = lf.slots.find((x) => x.bid === q.workplace.bid && x.vid === q.workplace.vid && x.occ === q.occ); if (s) s.filled.push(p.id); } }
    for (const s of lf.slots) { const b = w.buildings.get(s.bid), e = b && b.lf.staff.find((x) => x.vid === s.vid && x.occ === s.occ); if (e) e.filled = s.filled.slice(); }
    for (const s of lf.slots) { s.ext = Math.max(0, s.n - s.filled.length); s.vac = []; }
    for (const b of w.buildings.values()) if (b.lf && b.lf.staff && b.lf.staff.length) lf.labour.firms[b.id] = { bid: b.id, sector: sectorOfBuilding(w, b), closedUntil: 0, closedAt: 0, name: b.name };
    for (const p of w.living()) {
      if (!p.ext.pop) continue; const q = p.ext.pop, age = w.ageOf(p); if (age < 16) continue;
      q.retireAge = clamp(rng.gauss(65.3, 2.6), 58, 72) + (q.contract === 'self_employed' ? 2 : 0);
      { const o0 = OCC[q.occ || q.lastOcc]; if (o0 && (q.activity === 'employed' || q.activity === 'unemployed')) { grantCred(q, credOf(o0)); } }
      if (q.activity === 'employed') { q.tenureStart = q.jobSince != null ? q.jobSince : w.tick - Math.round(Math.min(rng.float(0.3, 9) * 52560, (age - 17) * 52560 * 0.9)); /* jobSince: the biography's own start date, so the life story and job tenure agree */ if (q.contract === 'fixed_term') q.contractEnd = w.tick + rng.int(2, 14) * MONTH; q.lastOcc = q.occ;
        { const prior = Math.max(0, (age - 21) * 0.7 - (w.tick - q.tenureStart) / 52560); q.xpTotal = prior; q.xpSoc = { [q.soc]: prior * 0.6 }; q.xp = {}; } /* day-1 work history before the current job: ~70% of years since 21 in work, ~60% of that in the same SOC group (input, like the rest of the day-1 composition) */ }
      else if (q.activity === 'unemployed') { q.search = { since: w.tick - rng.int(1, 12) * MONTH, kind: 'unemp', tries: 0 }; q.lastOcc = drawOccupation(w, rng, p, { onlyOffmap: true }).id; }
      else if (q.activity === 'other_inactive' || q.activity === 'home_family') q.lastOcc = drawOccupation(w, rng, p, { onlyOffmap: true }).id;
    }
    void OCC;
  }


  // ---------------------------------------------------------------- monthly
  // Spread over the month: each person's monthly review falls on their own day (id mod 30) instead of every hire/lay-off landing on the 1st
  // (start dates and redundancy letters are spread through the month in reality). `slice` = day index 0..29; firms and vacancy ageing run on slice 0.
  function monthly(w, slice = 0) {
    const S = L(w), mc = macro(), rng = w.rngFor('labour.month'), tick = w.tick, OCC = occMap(w), mo = w.time.month;
    const rec = 1 + 3.0 * mc.recession;
    // --- firms: closure / reopening
    if (slice === 0) for (const bid of Object.keys(S.firms)) {
      const f = S.firms[bid];
      if (f.closedUntil && tick >= f.closedUntil && f.closedUntil > 0) { f.closedUntil = 0; for (const s of slotsOf(+bid)) { s.vac = Array.from({ length: s.n - s.filled.length - s.ext }, () => ({ since: tick, occ: s.occ })); } w.emit('labour.firm_opened', { place: +bid, salience: 0.3, tags: ['labour', 'visible'], payload: { name: f.name, reopened: true } }); }
      else if (!f.closedUntil && !(w.sys.business && w.sys.business.query.manages(+bid))) { // (business plugin owns closures of the units it manages)
        const hv = w.lf.money ? (w.lf.money.venueHealth[bid] ?? 1) : 1;
        const hz = 0.0004 + (hv < 0.55 ? 0.05 * (0.55 - hv) / 0.25 : 0) + 0.003 * mc.recession;
        if (rng.chance(hz)) closeFirm(+bid, hv < 0.55 ? 'trading_losses' : 'owner_retired', 0);
      }
    }
    // --- on-map vacancies: ageing, external hires
    if (slice === 0) for (const s of w.lf.slots) {
      if (closed(s.bid)) continue;
      for (let i = s.vac.length - 1; i >= 0; i--) if (tick - s.vac[i].since > 2 * MONTH && rng.chance(0.4)) { s.vac.splice(i, 1); s.ext++; }
    }
    // --- people
    const people = w.living().slice(); // living only: archived stubs never matter here
    let emp = 0;
    for (const p of people) {
      if (!p.alive || p.id % 30 !== slice) continue; const q = p.ext.pop; if (!q) continue; const age = w.ageOf(p), hh = w.lf.households[q.hh];
      if (age >= 16 && q.activity === 'child') { // 16th birthday: college / first job
        const r = rng.next(); if (r < 0.62) { q.activity = 'student'; q.school = { kind: 'college', dest: 'secondary_school' }; q.edu = 'level2'; } else { q.activity = 'unemployed'; q.search = { since: tick, kind: 'entry', tries: 0 }; q.edu = 'level1'; q.lastOcc = null; }
        replan(p); continue;
      }
      if (age < 16) continue;
      if (!q.retireAge) q.retireAge = clamp(rng.gauss(65.3, 2.6), 58, 72);
      if (q.train || (age >= 19 && age < 56)) trainingStep(p, q, age, rng);
      switch (q.activity) {
        case 'employed': { emp++; employedStep(p, q, age, hh, rng, mc, rec, OCC, mo); break; }
        case 'student': studentStep(p, q, age, rng); break;
        case 'unemployed': searchStep(p, q, age, hh, rng, mc); break;
        case 'sick_disabled': if (age < 66 && rng.chance(0.004)) { q.activity = 'unemployed'; q.search = { since: tick, kind: 'return', tries: 0 }; replan(p); } break;
        case 'home_family': {
          const kids = hh ? hh.members.map((id) => w.people.get(id)).filter((k) => k && k.alive && w.ageOf(k) < 4.5).length : 0;
          // return to work: slow, and slower with school-age children at home and in groups where caring is the norm (ONS/ethnicity-facts-figures 2021: 51% of Pakistani/Bangladeshi
          // women are economically inactive vs ~20% of men; maternal employment rises only gradually as the youngest child ages, ONS Families and the labour market 2021). Was a flat 2%/month.
          const young = hh ? hh.members.some((id) => { const k = w.people.get(id); return k && k.alive && w.ageOf(k) < 11; }) : false;
          const rtw = 0.012 * (young ? 0.6 : 1) * (q.eth === 'pakistani' || q.eth === 'bangladeshi' ? 0.35 : 1);
          if (!kids && age < 62 && rng.chance(rtw)) { q.activity = 'unemployed'; q.search = { since: tick, kind: 'return', tries: 0 }; replan(p); }
          break;
        }
        case 'other_inactive': if (age < 60 && rng.chance(0.003)) { q.activity = 'unemployed'; q.search = { since: tick, kind: 'return', tries: 0 }; replan(p); } break;
        case 'retired': break;
      }
    }
    if (slice % 10 === 0) placeOnMapApplicants(); // three rounds a month (chance below is per round)
    S.emp = slice === 0 ? emp : (S.emp || 0) + emp;
  }

  // Retraining for a regulated job: enrolment is a small monthly hazard for people the path really suits (feeder job, or the entry education and no job), a course takes its real duration
  // (TRAINING in jobs.js), and the qualification is granted only when it ends. A newly qualified person in another job moves into the regulated one over the following months.
  function trainingStep(p, q, age, rng) {
    const tick = W.tick;
    if (q.train) {
      if (tick >= q.train.until) {
        const cred = q.train.cred; grantCred(q, cred); q.train = null; q.pendingSwitch = credOcc(cred);
        W.emit('labour.qualified', { actors: [p.id], salience: 0.4, tags: ['labour', 'life'], payload: { cred } });
        W.addMemory(p, { type: 'work', text: `Qualified (${TRAINING[cred].label}).`, otherIds: [], weight: 0.7, importance: 3 });
      }
      return;
    }
    if (age < 19 || age > 55 || !(q.activity === 'employed' || q.activity === 'unemployed' || q.activity === 'home_family')) return;
    const feeder = q.activity === 'employed' ? q.occ : q.lastOcc, qr = QRANK[q.edu] ?? 2;
    for (const cred of Object.keys(TRAINING)) {
      const t = TRAINING[cred], fed = t.feeders.includes(feeder); if (hasCred(q, cred) || qr < (fed ? (t.feederMinQ ?? t.minQ) : t.minQ) || (t.maxAge && age > t.maxAge)) continue;
      const h = fed ? 0.0035 : q.activity === 'unemployed' && qr >= t.minQ + 1 ? 0.0004 : qr >= 4 ? 0.00012 : 0; // feeder-job staff ~4%/yr (employer-funded degree apprenticeships, Nursing Associate -> RN), the rest rare career changers
      if (h && rng.chance(h * (age < 30 ? 1.5 : age > 45 ? 0.5 : 1))) {
        q.train = { cred, since: tick, until: tick + Math.round(t.years * 12 * MONTH * rng.float(0.95, 1.15)) };
        W.emit('labour.training', { actors: [p.id], salience: 0.3, tags: ['labour', 'life'], payload: { cred, years: t.years } });
        W.addMemory(p, { type: 'work', text: `Started ${t.label}.`, otherIds: [], weight: 0.4, importance: 2 });
        return;
      }
    }
  }
  function employedStep(p, q, age, hh, rng, mc, rec, OCC, mo) {
    const w = W, S = L(w), tick = w.tick, sec = sectorOfPerson(p);
    const sh = S.shocks[sec] && S.shocks[sec].until > tick ? S.shocks[sec].mult : 1;
    const ten = (tick - (q.tenureStart || tick)) / 52560, c = q.contract;
    // retirement
    if (age >= q.retireAge) { retire(p); return; }
    // fixed term
    if (q.contractEnd && tick >= q.contractEnd) { if (rng.chance(0.55)) q.contractEnd = tick + rng.int(6, 18) * MONTH; else { loseJob(p, 'fixed_term_end', 0); return; } }
    // sickness exit
    if (rng.chance(0.0006 + 0.00003 * Math.pow(Math.max(0, age - 35), 1.5))) { const eid = w.emit('labour.went_inactive', { actors: [p.id], salience: 0.4, tags: ['labour', 'health'], payload: { why: 'long_term_sickness' } }); loseJob(p, 'sick', eid); return; }
    // parenthood: mothers of babies sometimes leave work
    if (hh && p.sex === 'F' && hh.members.some((id) => { const k = w.people.get(id); return k && k.alive && w.ageOf(k) < 1 && k.family.motherId === p.id; }) && rng.chance(0.12)) { const eid = w.emit('labour.went_inactive', { actors: [p.id], salience: 0.3, tags: ['labour', 'family'], payload: { why: 'caring' } }); separate(p, 'care', ''); q.activity = 'home_family'; p.job = 'home_family'; replan(p); void eid; return; }
    // layoffs
    const lay = 0.0022 * rec * sh * (c === 'zero_hours' ? 2.2 : c === 'self_employed' || c === 'gig' ? 0.2 : 1) * (ten < 2 ? 1.5 : ten > 10 ? 0.6 : 1);
    if (rng.chance(lay)) { loseJob(p, 'redundancy', S.shocks[sec] && S.shocks[sec].eid || 0); return; }
    if (c === 'self_employed' && rng.chance(0.002 * rec)) { loseJob(p, 'business_failed', 0); return; }
    if (rng.chance(0.0012 * (age < 25 ? 1.6 : 1))) { loseJob(p, 'dismissal', 0); return; }
    if (rng.chance(0.0022 * ageF(age))) { loseJob(p, 'quit', 0); L(w).stats.quits++; return; }
    // newly qualified: move into the regulated job they trained for
    if (q.pendingSwitch) { const o = OCC[q.pendingSwitch]; if (!o || q.occ === o.id) q.pendingSwitch = null; else if (rng.chance(0.3)) { const slot = o.where === 'onmap' ? openSlotFor(p, o.id) : null; if (o.where !== 'onmap' || slot) { q.pendingSwitch = null; separate(p, 'swap', ''); hire(p, o, 'application', 0, slot ? { slot } : {}); return; } } }
    // job-to-job move
    if (rng.chance(0.0075 * ageF(age) * (1 - 0.6 * mc.recession))) { jobToJob(p, q, rng, OCC); return; }
    // pay review + promotion at anniversary month
    if ((hash(p.id, 7) * 12 | 0) === mo && ten >= 0.9) reviewPay(p, q, age, ten, rng, mc, OCC);
    // second job when squeezed
    const f = hh && hh.fin;
    if (!q.job2 && f && f.stress > 0.55 && q.hours < 45 && rng.chance(0.02)) secondJob(p, rng.int(6, 14));
    else if (q.job2 && f && f.stress < 0.25 && rng.chance(0.06)) { q.job2 = null; }
  }
  function jobToJob(p, q, rng, OCC) {
    const prior = q.occ, from = OCC[prior];
    const o = drawOccupation(W, rng, p, { prior, hasVacancy: (id) => !!openSlotFor(p, id) });
    if (!o || !rng.chance(0.75)) { loseJob(p, 'quit', 0); L(W).stats.quits++; return; }
    const was = separate(p, 'swap', ''); q.lastOcc = was; q.lastPay = q.pay || q.lastPay; void from;
    const slot = o.where === 'onmap' ? openSlotFor(p, o.id) : null;
    if (o.where === 'onmap' && !slot) { loseJob(p, 'quit', 0); return; }
    hire(p, o, rng.chance(referralStrength(p) / (1 + referralStrength(p))) ? 'referral' : 'application', 0, slot ? { slot } : {});
  }
  function reviewPay(p, q, age, ten, rng, mc, OCC) {
    const C = p.personality ? p.personality.conscientiousness : 0.5, perf = clamp(0.5 + (C - 0.5) * 0.7 + rng.gauss(0, 0.2), 0, 1);
    if (q.contract === 'zero_hours' || q.contract === 'gig') return;
    const lad = LADDER[q.occ];
    if (lad && ten >= 1.5 && rng.chance(0.06 * (0.5 + perf) * (age < 35 ? 1.6 : age > 55 ? 0.3 : 1)) ) {
      const nxt = OCC[lad[rng.int(0, lad.length - 1)]];
      if (nxt && (!credOf(nxt) || hasCred(q, credOf(nxt))) && (nxt.where !== 'onmap' || (q.workplace.kind === 'onmap' && W.lf.slots.some((s) => s.bid === q.workplace.bid && s.occ === nxt.id && s.vac.length)))) {
        const prevPay = q.pay, slot = nxt.where === 'onmap' ? W.lf.slots.find((s) => s.bid === q.workplace.bid && s.occ === nxt.id && s.vac.length) : null;
        const oldOcc = q.occ; separate(p, 'promo', '', { noVacancy: false }); q.lastOcc = oldOcc;
        startJob(p, nxt, { slot, pay: Math.round(Math.max(prevPay * rng.float(1.08, 1.18), nxt.pay.p10)), contract: 'permanent', hours: Math.max(q.lastPay ? 30 : 30, 37) });
        W.emit('labour.promoted', { actors: [p.id], salience: 0.4, tags: ['labour', 'money'], payload: { occ: nxt.id, from: oldOcc } }); L(W).stats.promoted++; return;
      }
    }
    const pct = Math.max(0, mc.wageGrowth * (0.55 + 0.9 * perf) + rng.gauss(0, 0.8));
    q.pay = Math.round(q.pay * (1 + pct / 100));
    if (pct >= 6) W.emit('labour.pay_rise', { actors: [p.id], salience: 0.25, tags: ['labour', 'money'], payload: { pct: +pct.toFixed(1) } });
  }
  function secondJob(p, hours) {
    const q = p.ext.pop; if (q.job2) return false; const age = W.ageOf(p);
    q.job2 = { occ: age < 45 && q.car ? 'rideshare_driver' : 'delivery_courier_app', hours, monthly: Math.round(hours * 4.3 * 11.2) };
    W.emit('labour.second_job', { actors: [p.id], salience: 0.25, tags: ['labour', 'money'], payload: { hours } }); return true;
  }
  function retire(p) {
    const q = p.ext.pop, age = W.ageOf(p), fin = q.fin, B = W.pack.meta.benefits;
    separate(p, 'retire', '', { noVacancy: false }); q.activity = 'retired'; p.job = 'retired'; q.search = null;
    fin.sp = age >= 66 ? 1 : 0.9; fin.priv = Math.round((fin.pension || 0) * 0.045 + 0);
    void B; L(W).stats.retired++;
    W.emit('labour.retired', { actors: [p.id], salience: 0.35, tags: ['labour', 'life'], payload: { age: Math.round(age) } }); replan(p);
  }
  function studentStep(p, q, age, rng) {
    const sk = q.school && q.school.kind;
    // college -> university/work at 18 is decided by life (September transitions); this only catches stragglers (arrivals aged 19+ still 'college')
    if (sk === 'college' && age >= 19) { if (rng.chance(0.45)) { q.school = { kind: 'university', dest: 'university' }; q.edu = 'level3'; q.uniStart = W.tick; q.courseYears = 3; } else graduate(p, q, age, 'level3'); }
    else if (sk === 'university') { if (q.uniStart == null) { q.uniStart = W.tick - Math.round(rng.float(0, 2.8) * W.calendar.ticksPerYear); q.courseYears = 3; } } // course end handled by life (September)
    else if (!sk && age >= 25 && rng.chance(0.1)) graduate(p, q, age, q.edu);
  }
  function graduate(p, q, age, edu) {
    q.gradStay = W.rngFor('labour.grad', p.id).chance(0.465); // HESA graduate mobility: ~46.5% of graduates stay in the region they studied in and work there
    { const r = W.rngFor('labour.gradcred', p.id).next(); if (edu === 'level4plus') { let t = 0; for (const [c, sh] of GRAD_SHARE) { t += sh; if (r < t) { grantCred(q, c); break; } } } } // HESA first-degree subject shares: ~5% nursing, ~3% allied health, ~4% education (QTS), ~2.5% law (solicitor route), ~2% medicine, ~1% social work
    separate(p, 'grad', '', {}); q.activity = 'unemployed'; q.edu = edu; q.school = null; q.search = { since: W.tick, kind: 'entry', tries: 0 }; q.lastOcc = null; p.job = 'unemployed';
    W.emit('labour.graduated', { actors: [p.id], salience: 0.3, tags: ['labour', 'life'], payload: { age: Math.round(age) } }); replan(p);
  }
  function searchStep(p, q, age, hh, rng, mc) {
    const S = L(W), tick = W.tick; if (!q.search) q.search = { since: tick, kind: 'unemp', tries: 0 };
    const dur = (tick - q.search.since) / MONTH, ref = referralStrength(p);
    if (dur > 12 && rng.chance(0.03)) { W.emit('labour.went_inactive', { actors: [p.id], salience: 0.3, tags: ['labour'], payload: { why: 'discouraged' } }); q.activity = 'other_inactive'; q.search = null; replan(p); return; }
    const C = p.personality ? p.personality.conscientiousness : 0.5;
    const hf = (q.health && q.health.limiting ? 0.7 : 1);
    let f = 0.165 * (1 - 0.55 * mc.recession) * Math.exp(-dur / 14) * (0.85 + 0.3 * C) * (1 + ref) * hf * (age > 55 ? 0.65 : age < 25 ? 1.1 : 1) * (q.search.kind === 'entry' ? 1.25 : 1);
    f = clamp(f, 0, 0.7); q.search.tries++;
    if (dur < MIN_TIME_TO_HIRE) return; // application, interview, references/vetting and the new employer's start date: 2-8 weeks from deciding to look to a first day (CIPD/REC hiring surveys), never 10 days
    if (!rng.chance(f)) return;
    const o = drawOccupation(W, rng, p, { prior: q.lastOcc, onlyOffmap: true });
    if (!o) return;
    const viaRef = rng.chance(ref / (1 + ref));
    hire(p, o, viaRef ? 'referral' : 'application', q.lastShock || 0);
  }
  // on-map vacancies: residents searching for matching occupations apply
  function placeOnMapApplicants() {
    const w = W, rng = w.rngFor('labour.slots'), OCC = occMap(w);
    for (const s of w.lf.slots) {
      if (!s.vac.length || closed(s.bid)) continue;
      const o = OCC[s.occ]; if (!o) continue;
      let best = null, bs = 0;
      for (const p of w.living()) {
        const q = p.ext.pop; if (!q || q.activity !== 'unemployed' || w.ageOf(p) < (o.age ? o.age[0] - 2 : 16)) continue;
        if (QRANK[q.edu] < (QRANK[o.qual] ?? 0) - 0.5) continue;
        if (q.search && (w.tick - q.search.since) < MIN_TIME_TO_HIRE * MONTH) continue;
        if (gateWeight(w, q, o, w.ageOf(p), {}) < 0.5) continue; // regulated job without the qualification / skilled trade without experience
        let sc = (q.lastOcc === s.occ ? 2 : OCC[q.lastOcc] && OCC[q.lastOcc].soc === o.soc ? 1 : 0.35) * (1 + referralStrength(p)) * (0.6 + 0.8 * rng.next());
        if (o.age && (w.ageOf(p) > o.age[1] + 4)) sc *= 0.2;
        if (sc > bs) { bs = sc; best = p; }
      }
      if (best && rng.chance(0.15)) hire(best, o, bs > 1.5 ? 'referral' : 'application', best.ext.pop.lastShock || 0, { slot: s });
    }
  }
  // ---------------------------------------------------------------- firms / shocks
  function closeFirm(bid, reason, cause, permanent = false) {
    const f = firmOf(bid); if (!f || f.closedUntil > W.tick) return false;
    const eid = W.emit('labour.firm_closed', { place: bid, salience: 0.55, cause, tags: ['labour', 'visible'], payload: { reason, name: f.name } });
    f.closedUntil = permanent ? Infinity : W.tick + W.rngFor('labour.close').int(4, 10) * MONTH; f.closedAt = W.tick; L(W).stats.closures++;
    for (const s of slotsOf(bid)) {
      for (const id of s.filled.slice()) { const p = W.people.get(id); if (p) loseJob(p, 'firm_closed', eid); }
      s.filled = []; s.vac = []; s.ext = 0; syncStaff(s);
    }
    for (const s of slotsOf(bid)) s.n = Math.max(0, s.n);
    if (permanent) { for (let i = W.lf.slots.length - 1; i >= 0; i--) if (W.lf.slots[i].bid === bid) W.lf.slots.splice(i, 1); const b = W.buildings.get(bid); if (b && b.lf) b.lf.staff = []; delete L(W).firms[bid]; }
    return true;
  }
  // Scale a firm's staffing (business plugin: short-time working, redundancies, expansion). Slots keep s.base (their size when first scaled); owner slots are never cut below 1.
  function resizeFirm(bid, scale, cause, protect) {
    let cut = 0;
    for (const s of slotsOf(bid)) {
      if (s.base === undefined) s.base = s.n; const want = Math.max(s.n > 0 && /owner|manager|publican|supervisor/.test(s.occ) ? 1 : 0, Math.round(s.base * scale)); let d = s.n - want;
      if (d > 0) { while (d > 0 && s.vac.length) { s.vac.pop(); s.n--; d--; } while (d > 0 && s.ext > 0) { s.ext--; s.n--; d--; } while (d > 0 && s.filled.length) { let id = s.filled[s.filled.length - 1]; if (protect != null && id === protect) { if (s.filled.length < 2) break; s.filled.unshift(s.filled.pop()); id = s.filled[s.filled.length - 1]; if (id === protect) break; } const p = typeof id === 'number' ? W.people.get(id) : null; if (p && p.alive && p.ext.pop) { loseJob(p, 'redundancy', cause || 0, { noVacancy: true }); cut++; } else { s.filled.pop(); s.n--; } d--; } }
      else if (d < 0) { for (let i = 0; i < -d; i++) s.vac.push({ since: W.tick, occ: s.occ }); s.n += -d; }
      syncStaff(s);
    }
    return cut;
  }
  function layoffs(sector, share, cause) {
    const rng = W.rngFor('labour.layoffs'), S = L(W);
    const eid = W.emit('labour.sector_shock', { salience: 0.55, cause: cause || 0, tags: ['labour', 'macro'], payload: { sector, share } });
    S.shocks[sector] = { mult: 3, until: W.tick + 4 * MONTH, eid }; let n = 0;
    for (const p of W.living().slice()) { if (!p.ext.pop || p.ext.pop.activity !== 'employed') continue; if (sectorOfPerson(p) === sector && rng.chance(share)) { loseJob(p, 'redundancy', eid); n++; } }
    return n;
  }

  // ILO unemployment (ONS Labour Force Survey definition): unemployed / economically active (employed + unemployed), ages 16-64
  // (ONS headline rates are 16+; the 16-64 form is the one the working-age tables quote). Students, carers, the sick/disabled and the
  // retired are inactive, not unemployed. `rate` is this ILO rate; `shareOf16plus` is kept only for the old "of all adults" reading.
  const unemployment = () => {
    let e = 0, u = 0, ad = 0, u16 = 0; for (const p of W.living()) { if (!p.ext.pop) continue; const a = W.ageOf(p); if (a < 16) continue; ad++; const x = p.ext.pop.activity; if (x === 'unemployed') u16++; if (a >= 65) continue; if (x === 'employed') e++; else if (x === 'unemployed') u++; }
    return { employed: e, unemployed: u, rate: e + u ? u / (e + u) : 0, shareOf16plus: ad ? u16 / ad : 0, adults16: ad, definition: 'ILO: unemployed / (employed + unemployed), ages 16-64' };
  };

  const plugin = {
    name: 'labour', version: '1.0.0', eventTypes: EVENTS.map((e) => e[0]),
    clocks: { day: (w) => monthly(w, Math.floor(w.tick / 144) % 30) },
    init(world) {
      W = world; registerEvents(world, EVENTS); initState(world);
      if (world.events.registry.has('goal.effect')) world.events.on('goal.effect', (ev) => onGoalEffect(ev));
    },
    query: {
      unemployment, firmClosed: (bid) => closed(bid), firm: (bid) => { const f = firmOf(bid); return f ? { ...f, slots: slotsOf(bid).map((s) => ({ occ: s.occ, n: s.n, filled: s.filled.length, vacancies: s.vac.length, ext: s.ext })) } : null; },
      openings: (f = {}) => { const out = []; for (const s of W.lf.slots) { if (!s.vac.length || closed(s.bid)) continue; if ((f.occ && s.occ !== f.occ) || (f.bid != null && s.bid !== f.bid)) continue; out.push({ kind: 'slot', bid: s.bid, occ: s.occ, count: s.vac.length, since: s.vac[0].since }); } if (!f.onmap) for (const o of W.pack.jobs) if (o.where !== 'onmap' && (!f.occ || f.occ === o.id)) out.push({ kind: 'offmap', occ: o.id, dest: o.dest || 'home', count: 1 }); return out; },
      job: (pid) => { const p = W.people.get(pid); if (!p || !p.ext.pop) return null; const q = p.ext.pop; return { activity: q.activity, occ: q.occ, pay: Math.round(annualPay(q)), rate: +hourlyRate(q).toFixed(2), payFte: q.pay, hours: q.hours, contract: q.contract, workplace: q.workplace, tenureYears: q.tenureStart ? (W.tick - q.tenureStart) / 52560 : 0, search: q.search ? { months: (W.tick - q.search.since) / MONTH } : null, job2: q.job2 || null }; },
      searchers: () => W.living().filter((p) => p.ext.pop && p.ext.pop.activity === 'unemployed').map((p) => p.id),
      sectorOf: (occ) => sectorOfOcc(occMap(W)[occ]), sectors: () => SECTORS.slice(),
      durations: () => L(W).durations.slice(), stats: () => ({ ...L(W).stats, ...unemployment() }),
    },
    commands: {
      'labour.applyForJob': (w, a) => {
        const p = w.people.get(a.pid); if (!p || !p.ext.pop) return { ok: false, why: 'no person' }; const q = p.ext.pop, rng = w.rngFor('labour.apply'), OCC = occMap(w);
        if (q.activity === 'retired' || w.ageOf(p) < 16) return { ok: false, why: 'not eligible' };
        let slot = null, o = null;
        if (a.bid != null || (a.occ && OCC[a.occ] && OCC[a.occ].where === 'onmap')) { slot = w.lf.slots.find((s) => (a.bid == null || s.bid === a.bid) && (!a.occ || s.occ === a.occ) && s.vac.length && !closed(s.bid)); if (!slot) { w.emit('labour.applied', { actors: [p.id], salience: 0.2, tags: ['labour'], payload: { ok: false, why: 'no vacancy' } }); return { ok: false, why: 'no vacancy' }; } o = OCC[slot.occ]; }
        else o = a.occ ? OCC[a.occ] : drawOccupation(w, rng, p, { prior: q.lastOcc, onlyOffmap: true });
        if (!o) return { ok: false, why: 'unknown occupation' };
        if (!a.force && credOf(o) && !hasCred(q, credOf(o))) { const t = TRAINING[credOf(o)]; w.emit('labour.applied', { actors: [p.id], place: slot ? slot.bid : null, salience: 0.2, tags: ['labour'], payload: { ok: false, occ: o.id, why: 'not qualified' } }); return { ok: false, why: t ? 'needs a qualification first: ' + t.label + ' (about ' + t.years + ' years)' : 'needs a professional qualification' }; }
        const fit = (QRANK[q.edu] ?? 2) >= (QRANK[o.qual] ?? 0) - 0.5 ? 1 : 0.1, pr = clamp(0.4 * fit * (1 + referralStrength(p)) * (q.activity === 'employed' ? 0.8 : 1) * (a.odds ?? 1), 0, 0.9), ok = a.force || rng.chance(pr);
        w.emit('labour.applied', { actors: [p.id], place: slot ? slot.bid : null, salience: 0.2, tags: ['labour'], payload: { ok, occ: o.id } });
        if (!ok) return { ok: false, why: 'rejected' };
        if (q.activity === 'employed') separate(p, 'swap', '');
        hire(p, o, 'application', 0, slot ? { slot } : {}); return { ok: true, occ: o.id };
      },
      'labour.depart': (w, a) => { const p = w.people.get(a.pid); if (p && p.ext.pop && p.ext.pop.activity === 'employed') separate(p, 'depart', '', {}); return true; },
      'labour.hire': (w, a) => w.cmd('labour.applyForJob', { ...a, force: true }),
      'labour.quit': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.pop || p.ext.pop.activity !== 'employed') return false; loseJob(p, 'quit', a.cause || 0); return true; },
      'labour.layoffs': (w, a) => layoffs(a.sector, a.share ?? 0.25, a.cause),
      'labour.closeFirm': (w, a) => closeFirm(a.bid, a.reason || 'closed', a.cause || 0, !!a.permanent),
      'labour.resizeFirm': (w, a) => resizeFirm(a.bid, a.scale, a.cause, a.protect),
      'labour.raise': (w, a) => { const p = w.people.get(a.pid); if (!p || p.ext.pop.activity !== 'employed') return false; p.ext.pop.pay = Math.round(p.ext.pop.pay * (1 + (a.pct ?? 5) / 100)); w.emit('labour.pay_rise', { actors: [p.id], salience: 0.3, cause: a.cause || 0, tags: ['labour', 'money'], payload: { pct: a.pct ?? 5 } }); return true; },
      'labour.retire': (w, a) => { const p = w.people.get(a.pid); if (!p || p.ext.pop.activity === 'retired') return false; if (p.ext.pop.activity === 'employed') retire(p); else { p.ext.pop.activity = 'retired'; p.job = 'retired'; } return true; },
      'labour.secondJob': (w, a) => { const p = w.people.get(a.pid); return !!p && secondJob(p, a.hours || 8); },
      'labour.recession': (w, a) => w.cmd('money.recession', a),
      'labour.setActivity': (w, a) => { const p = w.people.get(a.pid); if (!p) return false; if (p.ext.pop.activity === 'employed' && a.activity !== 'employed') separate(p, 'set', ''); p.ext.pop.activity = a.activity; p.job = a.activity; replan(p); return true; },
      'labour.initPerson': (w, a) => { const p = w.people.get(a.pid); if (!p) return false; const q = p.ext.pop, rng = w.rngFor('labour.new'); q.retireAge = clamp(rng.gauss(65.3, 2.6), 58, 72); if (q.activity === 'employed' || (q.activity === 'student' && a.job)) { const wasStudent = q.activity === 'student'; const o = drawOccupation(w, rng, p, { hasVacancy: (id) => !!openSlotFor(p, id), grant: true }); const slot = o.where === 'onmap' ? openSlotFor(p, o.id) : null; startJob(p, o, slot ? { slot } : {}); { const prior = Math.max(0, (w.ageOf(p) - 21) * 0.7); q.xpTotal = prior; q.xpSoc = { [q.soc]: prior * 0.6 }; q.xp = {}; } if (wasStudent) { q.activity = 'student'; p.job = 'student'; // (bug fix: startJob had already set 'employed', so every arriving working student silently stopped being a student)
  q.hours = rng.int(8, 16); q.contract = 'zero_hours'; } } else if (q.activity === 'unemployed') q.search = { since: w.tick, kind: 'entry', tries: 0 }; return true; },
      'labour.openFirm': (w, a) => {
        const b = w.buildings.get(a.bid); if (!b) return false; const S = L(w); S.firms[b.id] = { bid: b.id, sector: 'retail_hospitality', closedUntil: 0, closedAt: 0, name: a.name || 'New business', opened: w.tick };
        if (a.staff) { for (let i = w.lf.slots.length - 1; i >= 0; i--) if (w.lf.slots[i].bid === b.id) w.lf.slots.splice(i, 1); b.lf.staff = []; } // explicit staffing [{occ,n}] replaces the default owner + 2 assistants
        if (!b.lf.staff) b.lf.staff = []; const mk = (occ, n) => { const vid = b.lf.venueId ?? 900 + b.id; const s = { vid, bid: b.id, occ, n, filled: [], ext: 0, vac: Array.from({ length: n }, () => ({ since: w.tick, occ })) }; w.lf.slots.push(s); b.lf.staff.push({ vid, occ, n, filled: [] }); };
        if (a.staff) for (const x of a.staff) mk(x.occ, x.n); else if (!w.lf.slots.some((s) => s.bid === b.id)) { mk('shop_owner_manager', 1); mk('retail_assistant', 2); }
        w.emit('labour.firm_opened', { place: b.id, salience: 0.4, tags: ['labour', 'visible'], payload: { name: S.firms[b.id].name } }); return true;
      },
    },
  };
  function onGoalEffect(ev) {
    const pid = ev.actors[0], p = W.people.get(pid); if (!p || !p.alive || !p.ext.pop) return; const q = p.ext.pop, want = ev.payload.want, rng = W.rngFor('labour.goal');
    if (want === 'employed' || want === 'back_at_work') { if (q.activity !== 'employed' && q.activity !== 'retired') W.cmd('labour.applyForJob', { pid, force: true, cause: ev.id }); }
    else if (want === 'better_job' && q.activity === 'employed') { const was = q.occ; const o = drawOccupation(W, rng, p, { prior: was, onlyOffmap: true }); if (o) { separate(p, 'swap', ''); q.lastOcc = was; hire(p, o, 'application', ev.id); } }
    else if (want === 'pay_rise') { if (q.activity === 'employed') W.cmd('labour.raise', { pid, pct: rng.float(3, 9), cause: ev.id }); }
    else if (want === 'more_income' || want === 'side_income' || want === 'cash_in_hand') secondJob(p, rng.int(6, 14));
    else if (want === 'left_job' && q.activity === 'employed') loseJob(p, 'quit', ev.id);
    else if (want === 'self_employed' && q.activity === 'employed') { q.contract = 'self_employed'; }
    else if (want === 'promoted' && q.activity === 'employed') { const lad = LADDER[q.occ]; if (lad) q.pay = Math.round(q.pay * 1.12); }
  }
  return plugin;
}
export default createLabour;
