// LABOUR (W1-C): on-map firms (venue staff slots) + abstract off-map employers; hiring (applications + referral ties), job search spells, separations
// (redundancy, fixed-term end, firm closure, quits, sickness, retirement), pay reviews / promotions, second jobs, inactivity transitions, sector shocks.
//   QUERY  world.sys.labour.query: openings({occ,bid,onmap}) job(pid) unemployment() firm(bid) firmClosed(bid) searchers() sectorOf(occId) stats()
//   CMD    labour.applyForJob{pid,bid?,occ?} labour.hire{pid,bid?,occ?,pay?,hours?} labour.quit{pid} labour.layoffs{sector,share} labour.recession{severity} labour.closeFirm{bid}
//          labour.raise{pid,pct} labour.retire{pid} labour.secondJob{pid,hours} labour.openFirm{bid,name} labour.initPerson{pid}
//   EVENTS labour.hired labour.job_lost labour.quit labour.promoted labour.pay_rise labour.retired labour.firm_closed labour.firm_opened labour.second_job labour.sector_shock labour.went_inactive labour.graduated labour.applied
//   Consumes goals' goal.effect (get_job/change_job/pay_rise/promoted/left_job/back_at_work/self_employed/side_income...) when the goals plugin is loaded.
import { clamp, registerEvents, livePeople } from '../money/util.js';
import { drawOccupation, occMap, offmapWorkplace, hoursFor, contractFor, payFor, sectorOfOcc, sectorOfBuilding, LADDER, SECTORS, QRANK } from './jobs.js';

const EVENTS = [
  ['labour.hired', 'A resident started a job', { occ: 'string' }], ['labour.job_lost', 'A resident lost their job (redundancy, fixed-term end, firm closure, dismissal)', { kind: 'string' }],
  ['labour.quit', 'A resident resigned', { kind: 'string' }], ['labour.promoted', 'Promotion with a pay jump', { occ: 'string' }], ['labour.pay_rise', 'Notable pay rise', { pct: 'number' }],
  ['labour.retired', 'A resident retired', { age: 'number' }], ['labour.firm_closed', 'An on-map business closed', { reason: 'string' }], ['labour.firm_opened', 'An on-map business (re)opened', { name: 'string' }],
  ['labour.second_job', 'Took a second job / gig shifts', { hours: 'number' }], ['labour.sector_shock', 'Shock to a sector of the labour market', { sector: 'string' }],
  ['labour.went_inactive', 'Left the labour force (sickness, caring, discouraged)', { why: 'string' }], ['labour.graduated', 'Finished study and entered the job market', { age: 'number' }], ['labour.applied', 'A job application and its result', { ok: 'boolean' }],
];
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
    const q = p.ext.pop, w = W, wasOcc = q.occ;
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
    for (const s of lf.slots) { s.ext = Math.max(0, s.n - s.filled.length); s.vac = []; }
    for (const b of w.buildings.values()) if (b.lf && b.lf.staff && b.lf.staff.length) lf.labour.firms[b.id] = { bid: b.id, sector: sectorOfBuilding(w, b), closedUntil: 0, closedAt: 0, name: b.name };
    for (const p of w.people.values()) {
      if (!p.alive || !p.ext.pop) continue; const q = p.ext.pop, age = w.ageOf(p); if (age < 16) continue;
      q.retireAge = clamp(rng.gauss(65.3, 2.6), 58, 72) + (q.contract === 'self_employed' ? 2 : 0);
      if (q.activity === 'employed') { q.tenureStart = w.tick - Math.round(Math.min(rng.float(0.3, 9) * 52560, (age - 17) * 52560 * 0.9)); if (q.contract === 'fixed_term') q.contractEnd = w.tick + rng.int(2, 14) * MONTH; q.lastOcc = q.occ; }
      else if (q.activity === 'unemployed') { q.search = { since: w.tick - rng.int(1, 12) * MONTH, kind: 'unemp', tries: 0 }; q.lastOcc = drawOccupation(w, rng, p, { onlyOffmap: true }).id; }
      else if (q.activity === 'other_inactive' || q.activity === 'home_family') q.lastOcc = drawOccupation(w, rng, p, { onlyOffmap: true }).id;
    }
    void OCC;
  }

  // ---------------------------------------------------------------- monthly
  function monthly(w) {
    const S = L(w), mc = macro(), rng = w.rngFor('labour.month'), tick = w.tick, OCC = occMap(w), mo = w.time.month;
    const rec = 1 + 3.0 * mc.recession;
    // --- firms: closure / reopening
    for (const bid of Object.keys(S.firms)) {
      const f = S.firms[bid];
      if (f.closedUntil && tick >= f.closedUntil && f.closedUntil > 0) { f.closedUntil = 0; for (const s of slotsOf(+bid)) { s.vac = Array.from({ length: s.n - s.filled.length - s.ext }, () => ({ since: tick, occ: s.occ })); } w.emit('labour.firm_opened', { place: +bid, salience: 0.3, tags: ['labour', 'visible'], payload: { name: f.name, reopened: true } }); }
      else if (!f.closedUntil) {
        const hv = w.lf.money ? (w.lf.money.venueHealth[bid] ?? 1) : 1;
        const hz = 0.0004 + (hv < 0.55 ? 0.05 * (0.55 - hv) / 0.25 : 0) + 0.003 * mc.recession;
        if (rng.chance(hz)) closeFirm(+bid, hv < 0.55 ? 'trading_losses' : 'owner_retired', 0);
      }
    }
    // --- on-map vacancies: ageing, external hires
    for (const s of w.lf.slots) {
      if (closed(s.bid)) continue;
      for (let i = s.vac.length - 1; i >= 0; i--) if (tick - s.vac[i].since > 2 * MONTH && rng.chance(0.4)) { s.vac.splice(i, 1); s.ext++; }
    }
    // --- people
    const people = [...w.people.values()];
    let emp = 0;
    for (const p of people) {
      if (!p.alive) continue; const q = p.ext.pop; if (!q) continue; const age = w.ageOf(p), hh = w.lf.households[q.hh];
      if (age >= 16 && q.activity === 'child') { // 16th birthday: college / first job
        const r = rng.next(); if (r < 0.62) { q.activity = 'student'; q.school = { kind: 'college', dest: 'secondary_school' }; q.edu = 'level2'; } else { q.activity = 'unemployed'; q.search = { since: tick, kind: 'entry', tries: 0 }; q.edu = 'level1'; q.lastOcc = null; }
        replan(p); continue;
      }
      if (age < 16) continue;
      if (!q.retireAge) q.retireAge = clamp(rng.gauss(65.3, 2.6), 58, 72);
      switch (q.activity) {
        case 'employed': { emp++; employedStep(p, q, age, hh, rng, mc, rec, OCC, mo); break; }
        case 'student': studentStep(p, q, age, rng); break;
        case 'unemployed': searchStep(p, q, age, hh, rng, mc); break;
        case 'sick_disabled': if (age < 66 && rng.chance(0.004)) { q.activity = 'unemployed'; q.search = { since: tick, kind: 'return', tries: 0 }; replan(p); } break;
        case 'home_family': {
          const kids = hh ? hh.members.map((id) => w.people.get(id)).filter((k) => k && k.alive && w.ageOf(k) < 4.5).length : 0;
          if (!kids && age < 62 && rng.chance(0.02)) { q.activity = 'unemployed'; q.search = { since: tick, kind: 'return', tries: 0 }; replan(p); }
          break;
        }
        case 'other_inactive': if (age < 60 && rng.chance(0.003)) { q.activity = 'unemployed'; q.search = { since: tick, kind: 'return', tries: 0 }; replan(p); } break;
        case 'retired': break;
      }
    }
    placeOnMapApplicants();
    S.emp = emp;
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
      if (nxt && (nxt.where !== 'onmap' || (q.workplace.kind === 'onmap' && W.lf.slots.some((s) => s.bid === q.workplace.bid && s.occ === nxt.id && s.vac.length)))) {
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
    if (sk === 'college' && age >= 18) { if (rng.chance(0.55)) { q.school = { kind: 'university', dest: 'university' }; q.edu = 'level3'; } else graduate(p, q, age, 'level3'); }
    else if (sk === 'university' && age >= 21.5 && rng.chance(0.18)) graduate(p, q, age, 'level4plus');
    else if (!sk && age >= 25 && rng.chance(0.1)) graduate(p, q, age, q.edu);
  }
  function graduate(p, q, age, edu) {
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
      for (const p of w.people.values()) {
        if (!p.alive) continue; const q = p.ext.pop; if (!q || q.activity !== 'unemployed' || w.ageOf(p) < (o.age ? o.age[0] - 2 : 16)) continue;
        if (QRANK[q.edu] < (QRANK[o.qual] ?? 0) - 0.5) continue;
        let sc = (q.lastOcc === s.occ ? 2 : OCC[q.lastOcc] && OCC[q.lastOcc].soc === o.soc ? 1 : 0.35) * (1 + referralStrength(p)) * (0.6 + 0.8 * rng.next());
        if (o.age && (w.ageOf(p) > o.age[1] + 4)) sc *= 0.2;
        if (sc > bs) { bs = sc; best = p; }
      }
      if (best && rng.chance(0.45)) hire(best, o, bs > 1.5 ? 'referral' : 'application', best.ext.pop.lastShock || 0, { slot: s });
    }
  }
  // ---------------------------------------------------------------- firms / shocks
  function closeFirm(bid, reason, cause) {
    const f = firmOf(bid); if (!f || f.closedUntil > W.tick) return false;
    const eid = W.emit('labour.firm_closed', { place: bid, salience: 0.55, cause, tags: ['labour', 'visible'], payload: { reason, name: f.name } });
    f.closedUntil = W.tick + W.rngFor('labour.close').int(4, 10) * MONTH; f.closedAt = W.tick; L(W).stats.closures++;
    for (const s of slotsOf(bid)) {
      for (const id of s.filled.slice()) { const p = W.people.get(id); if (p) loseJob(p, 'firm_closed', eid); }
      s.filled = []; s.vac = []; s.ext = 0; syncStaff(s);
    }
    for (const s of slotsOf(bid)) s.n = Math.max(0, s.n);
    return true;
  }
  function layoffs(sector, share, cause) {
    const rng = W.rngFor('labour.layoffs'), S = L(W);
    const eid = W.emit('labour.sector_shock', { salience: 0.55, cause: cause || 0, tags: ['labour', 'macro'], payload: { sector, share } });
    S.shocks[sector] = { mult: 3, until: W.tick + 4 * MONTH, eid }; let n = 0;
    for (const p of W.people.values()) { if (!p.alive || !p.ext.pop || p.ext.pop.activity !== 'employed') continue; if (sectorOfPerson(p) === sector && rng.chance(share)) { loseJob(p, 'redundancy', eid); n++; } }
    return n;
  }

  const unemployment = () => {
    let e = 0, u = 0, ad = 0; for (const p of W.people.values()) { if (!p.alive || !p.ext.pop) continue; const a = W.ageOf(p); if (a < 16) continue; ad++; const x = p.ext.pop.activity; if (x === 'employed') e++; else if (x === 'unemployed') u++; }
    return { employed: e, unemployed: u, rate: e + u ? u / (e + u) : 0, shareOf16plus: ad ? u / ad : 0, adults16: ad };
  };

  const plugin = {
    name: 'labour', version: '1.0.0', eventTypes: EVENTS.map((e) => e[0]),
    clocks: { month: (w) => monthly(w) },
    init(world) {
      W = world; registerEvents(world, EVENTS); initState(world);
      if (world.events.registry.has('goal.effect')) world.events.on('goal.effect', (ev) => onGoalEffect(ev));
    },
    query: {
      unemployment, firmClosed: (bid) => closed(bid), firm: (bid) => { const f = firmOf(bid); return f ? { ...f, slots: slotsOf(bid).map((s) => ({ occ: s.occ, n: s.n, filled: s.filled.length, vacancies: s.vac.length, ext: s.ext })) } : null; },
      openings: (f = {}) => { const out = []; for (const s of W.lf.slots) { if (!s.vac.length || closed(s.bid)) continue; if ((f.occ && s.occ !== f.occ) || (f.bid != null && s.bid !== f.bid)) continue; out.push({ kind: 'slot', bid: s.bid, occ: s.occ, count: s.vac.length, since: s.vac[0].since }); } if (!f.onmap) for (const o of W.pack.jobs) if (o.where !== 'onmap' && (!f.occ || f.occ === o.id)) out.push({ kind: 'offmap', occ: o.id, dest: o.dest || 'home', count: 1 }); return out; },
      job: (pid) => { const p = W.people.get(pid); if (!p || !p.ext.pop) return null; const q = p.ext.pop; return { activity: q.activity, occ: q.occ, pay: q.pay, hours: q.hours, contract: q.contract, workplace: q.workplace, tenureYears: q.tenureStart ? (W.tick - q.tenureStart) / 52560 : 0, search: q.search ? { months: (W.tick - q.search.since) / MONTH } : null, job2: q.job2 || null }; },
      searchers: () => [...W.people.values()].filter((p) => p.alive && p.ext.pop && p.ext.pop.activity === 'unemployed').map((p) => p.id),
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
        const fit = (QRANK[q.edu] ?? 2) >= (QRANK[o.qual] ?? 0) - 0.5 ? 1 : 0.1, pr = clamp(0.4 * fit * (1 + referralStrength(p)) * (q.activity === 'employed' ? 0.8 : 1), 0, 0.9), ok = a.force || rng.chance(pr);
        w.emit('labour.applied', { actors: [p.id], place: slot ? slot.bid : null, salience: 0.2, tags: ['labour'], payload: { ok, occ: o.id } });
        if (!ok) return { ok: false, why: 'rejected' };
        if (q.activity === 'employed') separate(p, 'swap', '');
        hire(p, o, 'application', 0, slot ? { slot } : {}); return { ok: true, occ: o.id };
      },
      'labour.depart': (w, a) => { const p = w.people.get(a.pid); if (p && p.ext.pop && p.ext.pop.activity === 'employed') separate(p, 'depart', '', {}); return true; },
      'labour.hire': (w, a) => w.cmd('labour.applyForJob', { ...a, force: true }),
      'labour.quit': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.pop || p.ext.pop.activity !== 'employed') return false; loseJob(p, 'quit', a.cause || 0); return true; },
      'labour.layoffs': (w, a) => layoffs(a.sector, a.share ?? 0.25, a.cause),
      'labour.closeFirm': (w, a) => closeFirm(a.bid, a.reason || 'closed', a.cause || 0),
      'labour.raise': (w, a) => { const p = w.people.get(a.pid); if (!p || p.ext.pop.activity !== 'employed') return false; p.ext.pop.pay = Math.round(p.ext.pop.pay * (1 + (a.pct ?? 5) / 100)); w.emit('labour.pay_rise', { actors: [p.id], salience: 0.3, cause: a.cause || 0, tags: ['labour', 'money'], payload: { pct: a.pct ?? 5 } }); return true; },
      'labour.retire': (w, a) => { const p = w.people.get(a.pid); if (!p || p.ext.pop.activity === 'retired') return false; if (p.ext.pop.activity === 'employed') retire(p); else { p.ext.pop.activity = 'retired'; p.job = 'retired'; } return true; },
      'labour.secondJob': (w, a) => { const p = w.people.get(a.pid); return !!p && secondJob(p, a.hours || 8); },
      'labour.recession': (w, a) => w.cmd('money.recession', a),
      'labour.setActivity': (w, a) => { const p = w.people.get(a.pid); if (!p) return false; if (p.ext.pop.activity === 'employed' && a.activity !== 'employed') separate(p, 'set', ''); p.ext.pop.activity = a.activity; p.job = a.activity; replan(p); return true; },
      'labour.initPerson': (w, a) => { const p = w.people.get(a.pid); if (!p) return false; const q = p.ext.pop, rng = w.rngFor('labour.new'); q.retireAge = clamp(rng.gauss(65.3, 2.6), 58, 72); if (q.activity === 'employed' || (q.activity === 'student' && a.job)) { const o = drawOccupation(w, rng, p, { hasVacancy: (id) => !!openSlotFor(p, id) }); const slot = o.where === 'onmap' ? openSlotFor(p, o.id) : null; startJob(p, o, slot ? { slot } : {}); if (q.activity === 'student') { q.activity = 'student'; q.hours = rng.int(8, 16); q.contract = 'zero_hours'; } } else if (q.activity === 'unemployed') q.search = { since: w.tick, kind: 'entry', tries: 0 }; return true; },
      'labour.openFirm': (w, a) => {
        const b = w.buildings.get(a.bid); if (!b) return false; const S = L(w); S.firms[b.id] = { bid: b.id, sector: 'retail_hospitality', closedUntil: 0, closedAt: 0, name: a.name || 'New business', opened: w.tick };
        if (!b.lf.staff) b.lf.staff = []; const mk = (occ, n) => { const vid = b.lf.venueId ?? 900 + b.id; const s = { vid, bid: b.id, occ, n, filled: [], ext: 0, vac: Array.from({ length: n }, () => ({ since: w.tick, occ })) }; w.lf.slots.push(s); b.lf.staff.push({ vid, occ, n, filled: [] }); };
        if (!w.lf.slots.some((s) => s.bid === b.id)) { mk('shop_owner_manager', 1); mk('retail_assistant', 2); }
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
