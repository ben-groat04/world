// Economy: jobs, production chains (farm->mill->bakery), market prices, wages, businesses, housing, debt, inheritance.
// Pure sim code: world.rng only, no DOM. Heavy work is in onHour/onDay; onTick is unused.
import { JOBS, BUILDING_TYPES, isOpen } from '../map.js';
import { businessName } from '../names.js';
import { TICKS_PER_YEAR } from '../time.js';

// ---------------------------------------------------------------- constants
const PUBLIC = new Set(['school', 'clinic', 'temple', 'townhall', 'jail', 'park', 'cemetery']);
const COMMERCIAL = new Set(['farm', 'bakery', 'smithy', 'tavern', 'market', 'mill', 'inn', 'tailor', 'carpenter']);
const WORK_IDS = new Set(['workShift', 'work']);
const SEASON_YIELD = [0.6, 1.0, 1.8, 0.6]; // farm output multiplier by season (spring, summer, autumn, winter); mean 1.0
const MEALS_PER_DAY = 3;
const RENT_PER_DAY = 1.1;
const GOODS = {
  grain:     { base: 0.28, cover: 90,  producer: 'farm',      daily: null },
  flour:     { base: 0.36, cover: 4,   producer: 'mill',      daily: null },
  bread:     { base: 0.50, cover: 0.8, producer: 'bakery',    daily: null },
  tools:     { base: 16,   cover: 30,  producer: 'smithy',    perPerson: 0.08 / 112 },
  clothes:   { base: 12,   cover: 20,  producer: 'tailor',    perPerson: 0.9 / 112 },
  furniture: { base: 35,   cover: 45,  producer: 'carpenter', perPerson: 0.12 / 112 },
};
const INPUT_COST = { smithy: 0.28, tailor: 0.3, carpenter: 0.25 }; // fraction of sale price spent on imported raw materials
const JUNIOR = { captain: 'guard', tavernkeeper: 'server', farmer: 'laborer', doctor: 'nurse', innkeeper: 'laborer', baker: null };
const TRADE_JOBS = ['baker', 'smith', 'tailor', 'carpenter', 'miller', 'server', 'merchant', 'laborer'];
const MIN_AGE = { doctor: 24, teacher: 22, priest: 26, captain: 28, mayor: 30, clerk: 18, guard: 18, innkeeper: 22, tavernkeeper: 20 };

const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const round = (x) => Math.round(x);
const age = (w, p) => w.ageOf(p);

function treasury(w) { w.town = w.town || {}; if (typeof w.town.treasury !== 'number') w.town.treasury = 600; return w.town; }
function taxRate(w) { return w.settings?.taxRate ?? 0.1; }
function idn(p) { return typeof p.id === 'number' ? p.id : [...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 0); }
function eco(w) { return w.econ; }
function E(w, p) {
  if (!p.econ) {
    p.econ = { perf: 0.7, retireAge: round(w.rng.gauss(63, 2.5)), apprentice: false, unempDays: 0, lastShiftDay: -9, hireDay: w.time?.totalDays ?? 0, presentTicks: 0, shiftTicks: 0, wageToday: 0 };
  }
  return p.econ;
}
function bName(b) { return b.name || BUILDING_TYPES[b.type]?.label || b.type; }
function jailed(w, p) { return (p.jailedUntil || 0) > w.tick; }
function isPlayer(w, p) { return w.player != null && w.player === p.id; }
function slotsOf(b) { return b.jobs || BUILDING_TYPES[b.type]?.jobs || []; }

function wealthOf(w, p) {
  let v = (p.money || 0) - (p.debt || 0);
  for (const b of w.buildings.values()) if (b.ownerId === p.id) v += b.type === 'house' ? 250 * (b.condition ?? 0.7) : 300 + (b.funds || 0) * 0.5;
  return v;
}

// ---------------------------------------------------------------- market
function stockOf(w, g) { let s = 0; for (const b of w.buildings.values()) s += b.inventory?.[g] || 0; return s; }
function mealsPerDay(w) {
  let d = 0;
  for (const p of w.living()) { const a = age(w, p); d += a < 5 ? 0.45 : a < 14 ? 0.75 : 1; }
  return d * MEALS_PER_DAY;
}
function price(w, g) {
  const m = eco(w).market, ov = m.override[g];
  if (ov && ov.untilTick > w.tick) return ov.price;
  return GOODS[g].base * (m.mult[g] ?? 1) * m.inflation;
}
function targetStock(w, g) {
  const e = eco(w);
  return (GOODS[g].daily ? e.dailyDemand[g] : e.dailyDemand[g]) * GOODS[g].cover;
}
// Sell `qty` of good g to a buyer. Returns units actually delivered. Revenue flows to producers/market; buyer pays outside.
function takeGood(w, g, qty) {
  const e = eco(w);
  let got = 0;
  const src = [];
  for (const b of w.buildings.values()) { const s = b.inventory?.[g] || 0; if (s > 0.01 && !b.closed) src.push(b); }
  src.sort((a, b) => b.inventory[g] - a.inventory[g]);
  const p = price(w, g);
  for (const b of src) {
    if (got >= qty) break;
    const t = Math.min(b.inventory[g], qty - got);
    b.inventory[g] -= t; got += t;
    const rev = t * p;
    const fee = b.type === 'market' ? 0 : rev * 0.06;
    b.funds = (b.funds || 0) + rev - fee;
    b.revToday = (b.revToday || 0) + rev - fee;
    const mk = e.marketBuilding(w); if (mk && mk !== b) { mk.funds = (mk.funds || 0) + fee * 0.65; mk.revToday = (mk.revToday || 0) + fee * 0.65; }
    treasury(w).treasury += fee * 0.35;
  }
  e.sold[g] = (e.sold[g] || 0) + got;
  e.demandToday[g] = (e.demandToday[g] || 0) + qty;
  return got;
}
function importGood(w, g, qty, premium = 1.6) {
  // merchants bring goods from outside at a premium (only when allowed)
  const e = eco(w);
  if (w.tick < e.noImportUntil) return 0;
  const mk = e.marketBuilding(w); if (!mk) return 0;
  mk.inventory = mk.inventory || {};
  mk.inventory[g] = (mk.inventory[g] || 0) + qty;
  e.imported[g] = (e.imported[g] || 0) + qty;
  return qty;
}

// ---------------------------------------------------------------- jobs
function setJob(w, p, b, job, opts = {}) {
  const old = p.job;
  if (p.workId != null && p.workId !== (b && b.id)) { const ob = w.buildings.get(p.workId); if (ob) ob.employees = ob.employees.filter((i) => i !== p.id); }
  p.job = job; p.workId = b ? b.id : null;
  if (b && !b.employees.includes(p.id)) b.employees.push(p.id);
  const ec = E(w, p); ec.apprentice = !!opts.apprentice; ec.hireDay = w.time.totalDays; ec.unempDays = 0; ec.perf = Math.max(ec.perf, 0.6);
  w.emit('jobChange', { person: p, oldJob: old, newJob: job, buildingId: b ? b.id : null });
}
function leaveJob(w, p, newJob = 'unemployed') {
  const old = p.job; const b = p.workId != null ? w.buildings.get(p.workId) : null;
  if (b) b.employees = b.employees.filter((i) => i !== p.id);
  p.job = newJob; p.workId = null; E(w, p).apprentice = false;
  if (old !== newJob) w.emit('jobChange', { person: p, oldJob: old, newJob, buildingId: b ? b.id : null });
}
function slotCounts(w, b) {
  const have = {};
  for (const id of b.employees) { const p = w.people.get(id); if (p && p.alive && !E(w, p).apprentice) have[p.job] = (have[p.job] || 0) + 1; }
  return have;
}
function eligible(w, p, job, b) {
  const a = age(w, p), ec = E(w, p);
  if (a < (MIN_AGE[job] ?? 16) || a > ec.retireAge) return false;
  if (job === 'mayor') return false; // politics owns this seat
  if (job === 'doctor' && (p.skills.medicine || 0) < 0.35) return false;
  if (job === 'teacher' && (p.skills.teaching || 0) < 0.25 && p.genes.intellect < 0.55) return false;
  if (job === 'priest' && !(p.traits.includes('pious') || (p.skills.charisma || 0) > 0.5)) return false;
  if (job === 'captain' && (p.skills.athletics || 0) < 0.4) return false;
  if (job === 'guard' && ((p.skills.athletics || 0) < 0.2 && p.genes.vitality < 0.5)) return false;
  return true;
}
function fit(w, p, job, b) {
  const J = JOBS[job]; const sk = J ? p.skills[J.skill] || 0 : 0.2;
  let s = sk * 0.5 + p.genes.intellect * 0.15 + p.personality.conscientiousness * 0.3 + w.rng.float(0, 0.15);
  if (b.ownerId != null && (p.family.fatherId === b.ownerId || p.family.motherId === b.ownerId || p.family.spouseId === b.ownerId)) s += 0.25;
  if ((p.money || 0) < 20) s += 0.1;
  if (p.reputation < -0.2) s -= 0.3;
  if (p.traits.includes('lazy')) s -= 0.2;
  if (p.crime?.convictions) s -= 0.15 * Math.min(3, p.crime.convictions);
  return s;
}

function runHiring(w) {
  const e = eco(w);
  const pool = [];
  for (const p of w.living()) {
    if (p.job !== 'unemployed' || isPlayer(w, p) || jailed(w, p)) continue;
    const a = age(w, p);
    if (a < 16 || a > E(w, p).retireAge) continue;
    if (p.homemaker && (p.money || 0) > 15) continue;
    if (p.pregnant && p.pregnant.dueTick - w.tick < 3 * 112 * 144 / 12) continue;
    pool.push(p);
  }
  e.unemployed = pool.length;
  const used = new Set();
  for (const b of w.buildings.values()) {
    if (b.closed || !slotsOf(b).length || b.type === 'house') continue;
    const pub = PUBLIC.has(b.type);
    if (!pub && (b.funds || 0) < 60) continue;
    if (pub && treasury(w).treasury < 20) continue;
    const have = slotCounts(w, b);
    const need = {};
    for (const j of slotsOf(b)) need[j] = (need[j] || 0) + 1;
    for (const j in need) {
      let vac = need[j] - (have[j] || 0);
      while (vac-- > 0) {
        if (j === 'mayor') break;
        // promotion from within
        const jr = JUNIOR[j];
        if (jr) {
          const cand = b.employees.map((i) => w.people.get(i)).filter((p) => p && p.alive && p.job === jr && !E(w, p).apprentice && !isPlayer(w, p) && (p.skills[JOBS[j]?.skill] || 0) > 0.45 && age(w, p) >= (MIN_AGE[j] ?? 16));
          if (cand.length) { cand.sort((x, y) => fit(w, y, j, b) - fit(w, x, j, b)); const p = cand[0]; setJob(w, p, b, j); w.addMemory(p, { type: 'promotion', text: `Was promoted to ${j} at ${bName(b)}.`, otherIds: [], weight: 0.5, importance: 3 }); continue; }
        }
        if (!w.rng.chance(0.4)) continue;
        let best = null, bs = -9;
        for (let t = 0; t < 14 && pool.length; t++) {
          const p = pool[w.rng.int(0, pool.length - 1)];
          if (used.has(p.id) || !eligible(w, p, j, b)) continue;
          const s = fit(w, p, j, b); if (s > bs) { bs = s; best = p; }
        }
        if (best) { used.add(best.id); setJob(w, best, b, j); best.econ.unempDays = 0; }
      }
    }
  }
  for (let i = pool.length - 1; i >= 0; i--) if (used.has(pool[i].id)) pool.splice(i, 1);
  e.unemployed = pool.length;
}

function runApprenticeships(w) {
  const trades = [...w.buildings.values()].filter((b) => !b.closed && COMMERCIAL.has(b.type) && b.type !== 'market' && (b.funds || 0) > 80);
  for (const p of w.living()) {
    const a = age(w, p), ec = E(w, p);
    if (p.job === 'student' && a >= 14 && !isPlayer(w, p)) {
      const keepSchool = p.genes.intellect > 0.72 && (p.money || 0) > -1 && w.rng.chance(0.6);
      if (a < 16 && keepSchool) continue;
      if (a >= 16) { leaveJob(w, p, 'unemployed'); continue; }
      if (!w.rng.chance(0.08) || !trades.length) continue;
      // prefer a parent's/owner's workplace
      const parentB = [p.family.fatherId, p.family.motherId].map((i) => w.people.get(i)).filter((q) => q && q.alive && q.workId != null).map((q) => w.buildings.get(q.workId)).filter((b) => b && !b.closed && COMMERCIAL.has(b.type));
      const b = parentB.length && w.rng.chance(0.6) ? w.rng.pick(parentB) : w.rng.pick(trades);
      const lead = slotsOf(b)[0];
      if (!lead || lead === 'mayor') continue;
      const app = b.employees.filter((i) => w.people.get(i)?.econ?.apprentice).length;
      if (app >= 2) continue;
      const jobName = b.type === 'farm' ? 'laborer' : b.type === 'tavern' || b.type === 'inn' ? (b.type === 'tavern' ? 'server' : 'laborer') : lead;
      setJob(w, p, b, jobName, { apprentice: true });
      w.addMemory(p, { type: 'apprenticeship', text: `Began an apprenticeship as a ${jobName} at ${bName(b)}.`, otherIds: b.ownerId != null ? [b.ownerId] : [], weight: 0.2, importance: 3 });
    } else if (ec.apprentice && a >= 18) { // journeyman
      const J = JOBS[p.job];
      if (!J || (p.skills[J.skill] || 0) > 0.4 || a >= 19) {
        ec.apprentice = false;
        w.addMemory(p, { type: 'journeyman', text: `Finished the apprenticeship as a ${p.job} and now earns a full wage.`, otherIds: [], weight: 0.5, importance: 3 });
      }
    }
  }
}

// ---------------------------------------------------------------- wages & work
function wageFor(w, p, b) {
  const J = JOBS[p.job]; if (!J) return 0;
  const ec = E(w, p);
  let wage = J.wage * (0.85 + 0.3 * (p.skills[J.skill] || 0));
  if (ec.apprentice) wage *= 0.4;
  return wage;
}
function payWage(w, p, b, frac = 1) {
  const gross = wageFor(w, p, b) * frac; if (gross <= 0) return 0;
  const T = treasury(w);
  let paid;
  if (PUBLIC.has(b.type)) { paid = Math.min(gross, Math.max(0, T.treasury) + gross * 0.4); T.treasury -= paid; }
  else { paid = Math.min(gross, Math.max(0, b.funds || 0)); b.funds = (b.funds || 0) - paid; b.wagesToday = (b.wagesToday || 0) + paid; if (paid < gross - 0.01) b.unpaid = (b.unpaid || 0) + (gross - paid); }
  const tax = paid * taxRate(w);
  p.money = (p.money || 0) + paid - tax; T.treasury += tax;
  E(w, p).wageToday += paid; eco(w).wagesPaid += paid;
  return paid;
}
function shiftOf(job) { return JOBS[job]?.shift; }
function restDayFor(w, p) {
  const J = JOBS[p.job]; if (!J) return false;
  const wd = w.time.weekday;
  return J.service ? wd === idn(p) % 6 : wd === 6;
}
function nowHour(w) { return w.time.hour + w.time.minute / 60; }

const workAction = {
  id: 'workShift', label: 'Working', interruptible: true,
  where(w, p) { const b = p.workId != null ? w.buildings.get(p.workId) : null; return b && !b.closed ? b.id : null; },
  score(w, p) {
    if (!p.workId || !JOBS[p.job] || jailed(w, p)) return 0;
    const b = w.buildings.get(p.workId); if (!b || b.closed) return 0;
    const sh = shiftOf(p.job); const h = nowHour(w);
    if (h < sh[0] || h >= sh[1]) return 0;
    if (restDayFor(w, p)) return 0;
    if (p.illness && (p.illness.severity || 0) > 0.55) return 0;
    if (p.health < 0.3) return 0;
    const ec = E(w, p);
    if (ec.lastShiftDay === w.time.totalDays && ec.shiftDone) return 0;
    let s = 55 + 30 * p.personality.conscientiousness;
    if (p.traits.includes('lazy')) s -= 20;
    if (p.traits.includes('ambitious')) s += 8;
    if ((p.money || 0) < 15) s += 12; // need the wage
    if (p.needs.hunger < 0.2) s -= 30;
    if (p.needs.energy < 0.15) s -= 20;
    return Math.max(0, s);
  },
  duration(w, p) {
    const sh = shiftOf(p.job); if (!sh) return 6;
    return clamp(Math.ceil((sh[1] - nowHour(w)) * 6), 3, 66);
  },
  onStart(w, p) {
    const ec = E(w, p); ec.lastShiftDay = w.time.totalDays; ec.shiftDone = false; ec.presentTicks = 0;
    ec.shiftTicks = workAction.duration(w, p);
    p.thought = `Off to ${p.workId != null ? bName(w.buildings.get(p.workId) || {}) : 'work'} for the ${p.job}'s shift.`;
  },
  onTick(w, p) {
    if (p.locationId === p.workId && p.workId != null) { const ec = p.econ; if (ec) ec.presentTicks++; p.needs.purpose = Math.min(1, p.needs.purpose + 0.0025); }
  },
  onEnd(w, p) {
    const ec = E(w, p), b = p.workId != null ? w.buildings.get(p.workId) : null; if (!b) return;
    const ratio = clamp(ec.presentTicks / Math.max(1, ec.shiftTicks * 0.85), 0, 1);
    ec.shiftDone = ratio > 0.5;
    ec.perf = ec.perf * 0.96 + ratio * 0.04;
    if (ratio < 0.3) return;
    payWage(w, p, b, ratio);
    const J = JOBS[p.job];
    if (J) {
      const gain = 0.0016 * (0.5 + p.genes.intellect) * (ec.apprentice ? 2 : 1) * (1 - (p.skills[J.skill] || 0)) * ratio;
      p.skills[J.skill] = Math.min(1, (p.skills[J.skill] || 0) + gain);
    }
  },
  thought: (w, p) => `Working as a ${p.job}.`,
};

// ---------------------------------------------------------------- shopping & meals
function dependentsOf(w, p) {
  const out = [];
  const h = p.homeId != null ? w.buildings.get(p.homeId) : null; if (!h) return out;
  for (const id of h.residents) {
    if (id === p.id) continue; const q = w.people.get(id); if (!q || !q.alive) continue;
    const a = age(w, q);
    const isKid = a < 14 && (q.family.fatherId === p.id || q.family.motherId === p.id || !q.family.fatherId || true);
    const isSpouse = q.id === p.family.spouseId && (q.job === 'unemployed' || q.job === 'retired' || q.homemaker) && (q.money || 0) < 25;
    const isParent = (p.family.fatherId === q.id || p.family.motherId === q.id) && a > 60 && (q.money || 0) < 10;
    if (isKid || isSpouse || isParent) out.push(q);
  }
  return out;
}
function marketBuilding(w) { return w.buildingsOfType('market').find((b) => !b.closed) || null; }
function creditLimit(p) { return 25 + 60 * ((p.reputation + 1) / 2) + (p.job !== 'unemployed' && p.job !== 'retired' ? 30 : 0); }

const shopAction = {
  id: 'shopGroceries', label: 'Shopping for food', interruptible: true,
  where(w) { const m = marketBuilding(w); return m ? m.id : null; },
  score(w, p) {
    if (age(w, p) < 13 || jailed(w, p)) return 0;
    const m = marketBuilding(w); if (!m || !isOpen(m, nowHour(w))) return 0;
    const dep = dependentsOf(w, p).filter((q) => age(w, q) < 14 || q.money < 3);
    const target = (1 + dep.length) * MEALS_PER_DAY * 2;
    const have = p.inventory.food || 0;
    if (have >= target * 0.6) return 0;
    let s = 28 + 50 * (1 - have / target);
    if (p.needs.hunger < 0.3 && have < 1) s += 15;
    // avoid leaving during the middle of a working day unless short
    if (p.job && JOBS[p.job] && have > 1) { const sh = shiftOf(p.job); const h = nowHour(w); if (h >= sh[0] && h < sh[1] && !restDayFor(w, p)) s -= 35; }
    return Math.max(0, s);
  },
  duration: () => 6,
  onStart(w, p) { p._shopDone = false; p.thought = 'Out to the market to buy food for the household.'; },
  onTick(w, p) {
    if (p._shopDone) return; const m = marketBuilding(w); if (!m || p.locationId !== m.id) return;
    p._shopDone = true; shopNow(w, p);
  },
  onEnd(w, p) {
    if (p._shopDone) return; const m = marketBuilding(w); if (m && p.locationId === m.id) { p._shopDone = true; shopNow(w, p); }
  },
};
function shopNow(w, p) {
  const e = eco(w);
  const dep = dependentsOf(w, p);
  const heads = [p, ...dep];
  let want = 0;
  for (const q of heads) want += Math.max(0, MEALS_PER_DAY * (age(w, q) < 5 ? 0.5 : age(w, q) < 14 ? 0.75 : 1) * 2.5 - (q.inventory.food || 0));
  if (want < 0.5) return;
  const pr = price(w, 'bread') * 1.0;
  let afford = (p.money || 0) / pr;
  const credit = Math.max(0, creditLimit(p) - (p.debt || 0)) / pr;
  const canBuy = Math.min(want, afford + credit);
  let got = canBuy > 0 ? takeGood(w, 'bread', canBuy) : 0;
  if (got < canBuy - 0.5 && w.tick >= e.noImportUntil) got += importGood(w, 'bread', 0) || 0;
  const cost = got * pr;
  const fromCash = Math.min(p.money || 0, cost);
  p.money = (p.money || 0) - fromCash;
  if (cost > fromCash + 0.001) { addDebt(w, p, cost - fromCash); }
  e.foodSpend += cost;
  // distribute equally among the household members that need it
  let left = got;
  const order = heads.slice().sort((a, b) => (a.inventory.food || 0) - (b.inventory.food || 0));
  for (const q of order) { const give = Math.min(left, Math.max(0.5, want / heads.length)); q.inventory.food = (q.inventory.food || 0) + give; left -= give; }
  if (left > 0) p.inventory.food = (p.inventory.food || 0) + left;
  if (got < 1 && (p.inventory.food || 0) < 1) { // nothing available or affordable: parish alms
    const T = treasury(w);
    if (T.treasury > 5 && w.rng.chance(0.7)) { const a = 3; T.treasury -= a; p.inventory.food = (p.inventory.food || 0) + a; p.thought = 'Could not afford bread; took alms from the temple.'; e.alms++; if (w.rng.chance(0.2)) w.addMemory(p, { type: 'alms', text: 'Went to the temple for charity because there was no bread at home.', otherIds: [], weight: -0.4, importance: 2 }); }
    else e.unmet++;
  }
}
function addDebt(w, p, amt) {
  p.debt = (p.debt || 0) + amt;
  if (!p.creditorId || !w.people.get(p.creditorId)?.alive) {
    // the richest person in town with spare cash tends to be the lender
    p.creditorId = eco(w).lender?.id ?? null;
  }
}

const mealAction = {
  id: 'buyMeal', label: 'Eating out', interruptible: true,
  _pick(w, p) {
    const h = nowHour(w); let best = null, bd = 1e9;
    for (const t of ['tavern', 'inn']) for (const b of w.buildingsOfType(t)) {
      if (b.closed || !isOpen(b, h)) continue;
      const d = Math.abs(b.x - p.x) + Math.abs(b.y - p.y); if (d < bd) { bd = d; best = b; }
    }
    return best;
  },
  where(w, p) { const b = mealAction._pick(w, p); return b ? b.id : null; },
  score(w, p) {
    if (age(w, p) < 14 || jailed(w, p) || (p.money || 0) < 4) return 0;
    const b = mealAction._pick(w, p); if (!b) return 0;
    const hungry = p.needs.hunger < 0.4, noFood = (p.inventory.food || 0) < 1;
    let s = 0;
    if (hungry && noFood) s = 50 + (0.4 - p.needs.hunger) * 80;
    else if (hungry && (p.money || 0) > 40 && p.personality.extraversion > 0.5) s = 30;
    else if (p.needs.social < 0.35 && (p.money || 0) > 60) s = 18 + 12 * p.personality.extraversion;
    return s;
  },
  duration: () => 6,
  onStart(w, p) { p._mealDone = false; },
  onTick(w, p) {
    if (p._mealDone) return; const b = w.buildings.get(p.locationId); if (!b || (b.type !== 'tavern' && b.type !== 'inn')) return;
    p._mealDone = true;
    const pr = b.type === 'inn' ? 1.6 : 1.2;
    if ((p.money || 0) < pr) return;
    p.money -= pr; b.funds = (b.funds || 0) + pr; b.revToday = (b.revToday || 0) + pr;
    treasury(w).treasury += pr * 0.03; b.funds -= pr * 0.03;
    takeGood(w, 'bread', 0.5); // ingredients bought from the bakery
    p.needs.hunger = Math.min(1, p.needs.hunger + 0.6); p.needs.fun = Math.min(1, p.needs.fun + 0.06); p.needs.social = Math.min(1, p.needs.social + 0.06);
    eco(w).mealSpend += pr;
    p.thought = `Having a hot meal at ${bName(b)}.`;
  },
  thought: () => 'Having a hot meal at the tavern.',
};

// ---------------------------------------------------------------- production (hourly)
function recalcRates(w) {
  const e = eco(w);
  const D = mealsPerDay(w), pop = w.living().length;
  e.dailyDemand = { grain: D, flour: D, bread: D };
  for (const g of ['tools', 'clothes', 'furniture']) e.dailyDemand[g] = pop * GOODS[g].perPerson;
  const eff = {};
  for (const b of w.buildings.values()) {
    if (b.closed) continue;
    const g = Object.keys(GOODS).find((k) => GOODS[k].producer === b.type); if (!g) continue;
    let u = 0;
    for (const id of b.employees) { const p = w.people.get(id); if (!p || !p.alive) continue; const J = JOBS[p.job]; if (!J) continue; const hrs = J.shift[1] - J.shift[0]; u += hrs * (0.7 + 0.6 * (p.skills[J.skill] || 0)) * (E(w, p).apprentice ? 0.5 : 1) * (p.job === 'laborer' && b.type === 'farm' ? 0.7 : 1); }
    eff[g] = (eff[g] || 0) + u;
  }
  e.rate = {};
  for (const g of Object.keys(GOODS)) {
    const hoursPerDay = (eff[g] || 0) * 6 / 7; // rest day
    const need = e.dailyDemand[g] * (g === 'grain' ? 1.12 : 1.15);
    e.rate[g] = hoursPerDay > 0 ? need / hoursPerDay : 0;
  }
  e.workHours = eff;
}
function throttle(w, g) {
  const cap = targetStock(w, g) * (g === 'grain' ? 2.2 : 3);
  const s = e_stock(w, g);
  return clamp((cap - s) / (0.4 * cap), 0, 1);
}
function e_stock(w, g) { return eco(w).stock[g] || 0; }
function workersPresent(w, b) {
  let u = 0, n = 0;
  for (const id of b.employees) {
    const p = w.people.get(id); if (!p || !p.alive || p.locationId !== b.id || !p.currentAction || !WORK_IDS.has(p.currentAction.id)) continue;
    const J = JOBS[p.job]; u += (0.7 + 0.6 * (p.skills[J?.skill] || 0)) * (E(w, p).apprentice ? 0.5 : 1) * (p.job === 'laborer' && b.type === 'farm' ? 0.7 : 1); n++;
  }
  return { u, n };
}
function buyInput(w, buyer, g, qty) {
  // buy from producing buildings' inventory with buyer funds
  let got = 0; const pr = price(w, g) * 0.9;
  for (const b of w.buildings.values()) {
    if (got >= qty) break; if (b === buyer || b.closed) continue;
    const s = b.inventory?.[g] || 0; if (s < 0.1) continue;
    const afford = Math.max(0, (buyer.funds || 0)) / pr;
    const t = Math.min(s, qty - got, afford); if (t <= 0) break;
    b.inventory[g] -= t; got += t; const c = t * pr;
    buyer.funds -= c; b.funds = (b.funds || 0) + c; b.revToday = (b.revToday || 0) + c;
  }
  return got;
}
function produceHour(w) {
  const e = eco(w); const S = w.time.season; const sy = SEASON_YIELD[S] * e.harvest;
  for (const b of w.buildings.values()) {
    if (b.closed || !COMMERCIAL.has(b.type)) continue;
    b.inventory = b.inventory || {};
    const { u, n } = workersPresent(w, b); if (!n) continue;
    switch (b.type) {
      case 'farm': {
        const tf = (b.inventory.toolsWear ?? 1) > 0.3 ? 1 : 0.8;
        const out = u * (e.rate.grain || 0) * sy * tf * throttle(w, 'grain');
        b.inventory.grain = (b.inventory.grain || 0) + out; e.made.grain += out; break;
      }
      case 'mill': {
        const want = u * (e.rate.flour || 0) * throttle(w, 'flour');
        const got = buyInput(w, b, 'grain', want); b.inventory.flour = (b.inventory.flour || 0) + got * 0.97; e.made.flour += got; break;
      }
      case 'bakery': {
        const want = u * (e.rate.bread || 0) * throttle(w, 'bread');
        const got = buyInput(w, b, 'flour', want); b.inventory.bread = (b.inventory.bread || 0) + got * 1.02; e.made.bread += got; break;
      }
      case 'smithy': case 'tailor': case 'carpenter': {
        const g = b.type === 'smithy' ? 'tools' : b.type === 'tailor' ? 'clothes' : 'furniture';
        const out = u * (e.rate[g] || 0) * throttle(w, g);
        const cost = out * price(w, g) * INPUT_COST[b.type];
        if ((b.funds || 0) > cost) { b.funds -= cost; b.inventory[g] = (b.inventory[g] || 0) + out; e.made[g] += out; }
        if (b.type === 'carpenter') repairs(w, b, u);
        break;
      }
      default: break;
    }
  }
}
function repairs(w, b, u) {
  // carpenters keep houses and workplaces in repair; the owner pays
  e_repairTarget(w, b, u);
}
function e_repairTarget(w, b, u) {
  const e = eco(w);
  if (!e.worst || e.worst.condition > 0.75 || w.rng.chance(0.05)) {
    let worst = null;
    for (const x of w.buildings.values()) if (!x.closed && x.type !== 'park' && x.type !== 'cemetery' && x.type !== 'square' && x !== b && (x.condition ?? 1) < (worst?.condition ?? 0.7)) worst = x;
    e.worst = worst;
  }
  const t = e.worst; if (!t) return;
  const gain = u * 0.0012, cost = gain * 150;
  const owner = t.ownerId != null ? w.people.get(t.ownerId) : null;
  if (owner && owner.alive && t.type === 'house') { if ((owner.money || 0) < cost + 5) return; owner.money -= cost; b.funds = (b.funds || 0) + cost; }
  else if (!owner || PUBLIC.has(t.type)) { const T = treasury(w); if (T.treasury < cost) return; T.treasury -= cost; b.funds = (b.funds || 0) + cost; }
  else { if ((t.funds || 0) < cost) return; t.funds -= cost; b.funds = (b.funds || 0) + cost; }
  t.condition = Math.min(1, (t.condition ?? 0.7) + gain);
}

// ---------------------------------------------------------------- daily economy
function updatePrices(w) {
  const e = eco(w);
  for (const g of Object.keys(GOODS)) {
    e.stock[g] = stockOf(w, g);
    const tgt = Math.max(1, targetStock(w, g));
    let r = (e.stock[g] + 0.05 * tgt) / tgt; // +small constant avoids infinity
    let m = clamp(Math.pow(r, -0.55), 0.55, 4.0);
    if (e.boomUntil > w.tick) m *= 1.0 + (e.boomFactor - 1) * 0.15;
    e.market_prev[g] = e.market.mult[g] ?? 1;
    e.market.mult[g] = (e.market.mult[g] ?? 1) + (m - (e.market.mult[g] ?? 1)) * 0.4;
  }
  e.market.inflation += (1 - e.market.inflation) * 0.02;
}
function spoilAndExport(w) {
  const e = eco(w);
  for (const b of w.buildings.values()) {
    const inv = b.inventory; if (!inv) continue;
    if (inv.grain) inv.grain *= 0.9992;
    if (inv.flour) inv.flour *= 0.995;
    if (inv.bread) { const keep = e.dailyDemand.bread * 0.4; if (inv.bread > keep) inv.bread -= (inv.bread - keep) * 0.35; }
    if (b.type === 'market' && inv.food) { inv.bread = (inv.bread || 0) + inv.food; inv.food = 0; }
    // exports of surplus to nearby towns (brings money in)
    if (b.closed) continue;
    for (const g of ['grain', 'tools', 'clothes', 'furniture']) {
      if (GOODS[g].producer !== b.type) continue;
      const ex = (inv[g] || 0) - targetStock(w, g) * 0.6 / Math.max(1, w.buildingsOfType(b.type).length);
      const boost = e.boomUntil > w.tick ? e.boomFactor : 1;
      if (ex > 1) { const t = ex * (g === 'grain' ? 0.08 : 0.15) * boost; inv[g] -= t; const rev = t * GOODS[g].base * 0.8 * boost; b.funds = (b.funds || 0) + rev; b.revToday = (b.revToday || 0) + rev; e.exportRev += rev; }
    }
  }
  // import to stop outright starvation when bread/flour/grain are scarce
  const needB = e.dailyDemand.bread;
  const short = needB * 0.6 - (e.stock.bread || 0) - (e.stock.flour || 0) * 0.5;
  if (short > 0 && e.market.mult.bread > 1.6 && w.tick >= e.noImportUntil) importGood(w, 'bread', short * 0.5);
}
function durableDemand(w) {
  const e = eco(w);
  for (const g of ['tools', 'clothes', 'furniture']) {
    let n = e.dailyDemand[g] * (e.boomUntil > w.tick ? e.boomFactor : 1);
    const k = Math.floor(n) + (w.rng.chance(n - Math.floor(n)) ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const pr = price(w, g);
      if (g === 'tools') { const farms = w.buildingsOfType('farm').filter((b) => !b.closed && (b.funds || 0) > pr); if (!farms.length) continue; const f = w.rng.pick(farms); if (takeGood(w, g, 1) >= 1) { f.funds -= pr; f.inventory.toolsWear = 1; } }
      else if (g === 'furniture') { const h = w.rng.pick([...w.buildings.values()].filter((b) => b.type === 'house' && b.residents.length)); if (!h) continue; const o = w.people.get(h.ownerId) || w.people.get(h.residents[0]); if (!o || o.money < pr * 2) continue; if (takeGood(w, g, 1) >= 1) { o.money -= pr; h.condition = Math.min(1, (h.condition ?? 0.7) + 0.08); for (const id of h.residents) { const r = w.people.get(id); if (r) r.needs.comfort = Math.min(1, r.needs.comfort + 0.1); } } }
    }
  }
}
function personDaily(w) {
  const e = eco(w), T = treasury(w), tr = taxRate(w);
  const day = w.time.totalDays;
  const living = w.living();
  // lender = richest
  let rich = null, rv = -1e9; const wealthByPerson = [];
  for (const p of living) { const v = wealthOf(w, p); wealthByPerson.push(v); if (v > rv) { rv = v; rich = p; } }
  e.lender = rich; e.gini = gini(wealthByPerson.map((x) => Math.max(0, x)));
  if (rich && rich.id !== e.richestId && rv > 1200 && (e.richestId == null || rv > (e.richestWealth || 0) * 1.1 || !w.people.get(e.richestId)?.alive)) {
    const prev = w.people.get(e.richestId);
    if (e.richestId != null && prev && prev.alive) w.chronicle.add({ type: 'wealth', importance: 3, text: `${nm(rich)} is now reckoned the wealthiest person in ${w.town?.name || 'town'}, overtaking ${nm(prev)}; their holdings are put at some ${round(rv)} crowns.`, people: [rich.id, prev.id] });
    else if (e.richestId == null) w.chronicle.add({ type: 'wealth', importance: 2, text: `${nm(rich)} is counted the richest soul in ${w.town?.name || 'town'}, with about ${round(rv)} crowns to ${rich.sex === 'F' ? 'her' : 'his'} name.`, people: [rich.id] });
    else w.chronicle.add({ type: 'wealth', importance: 3, text: `With the passing of the old fortune, ${nm(rich)} has become the richest person in town (${round(rv)} crowns).`, people: [rich.id] });
    e.richestId = rich.id;
  }
  if (rich) e.richestWealth = rv; if (rich && e.richestId == null) e.richestId = rich.id;
  let employed = 0, workingAge = 0;
  for (const p of living) {
    const a = age(w, p), ec = E(w, p);
    p.money = p.money || 0;
    const ply = isPlayer(w, p);
    // retirement
    if (!ply && JOBS[p.job] && (a >= ec.retireAge || (a > 52 && p.health < 0.22))) {
      const b = p.workId != null ? w.buildings.get(p.workId) : null; const oldJob = p.job;
      if (b && b.ownerId === p.id) {
        const heir = p.family.childrenIds.map((i) => w.people.get(i)).filter((c) => c && c.alive && age(w, c) >= 20).sort((x, y) => (x.birthTick) - (y.birthTick))[0];
        if (heir) { b.ownerId = heir.id; w.addMemory(heir, { type: 'inherit', text: `Took over ${bName(b)} from ${nm(p)} on their retirement.`, otherIds: [p.id], weight: 0.4, importance: 3 }); }
      }
      leaveJob(w, p, 'retired');
      if (ec.apprentice) ec.apprentice = false;
      w.addMemory(p, { type: 'retirement', text: `Retired from work as a ${oldJob} at age ${Math.floor(a)}.`, otherIds: [], weight: 0.1, importance: 3 });
      if (b && ((p.skills[JOBS[oldJob]?.skill] || 0) > 0.75 || b.ownerId === p.id) && a > 55) w.chronicle.add({ type: 'retirement', importance: 2, text: `${nm(p)}, a ${oldJob} of long standing${b ? ` at ${bName(b)}` : ''}, hangs up ${p.sex === 'F' ? 'her' : 'his'} tools at the age of ${Math.floor(a)}.`, people: [p.id], buildingId: b?.id });
    }
    if (a >= 16 && a < ec.retireAge && p.job !== 'student') { workingAge++; if (JOBS[p.job]) employed++; }
    // absence tracking
    if (JOBS[p.job] && p.workId != null && day - ec.hireDay > 2) {
      const yday = day - 1; const wd = (w.time.weekday + 6) % 7;
      const wasRest = JOBS[p.job].service ? wd === idn(p) % 6 : wd === 6;
      if (!wasRest && ec.lastShiftDay < yday && !jailed(w, p)) ec.perf *= 0.97;
      else if (jailed(w, p)) ec.perf *= 0.985;
    }
    // unemployment
    if (p.job === 'unemployed' && a >= 16 && a < ec.retireAge && !p.homemaker) ec.unempDays++;
    else ec.unempDays = 0;
    // clothes wear
    const inv = p.inventory; if (inv.clothes === undefined) inv.clothes = w.rng.float(0.3, 1);
    inv.clothes = Math.max(0, inv.clothes - (a < 14 ? 0.007 : 0.004));
    if (inv.clothes < 0.2 && p.money > price(w, 'clothes') + (a < 14 ? 15 : 25) && !ply && a >= 14 && w.rng.chance(0.2)) { if (takeGood(w, 'clothes', 1) >= 1) { p.money -= price(w, 'clothes'); inv.clothes = 1; } }
    if (inv.clothes < 0.1) { p.needs.comfort = Math.max(0, p.needs.comfort - 0.004); p.needs.hygiene = Math.max(0, p.needs.hygiene - 0.001); }
    // children wear/eat via parents: dependants on empty stomach but with wealthy parent in the house
    // debt service
    if (p.debt > 0) {
      p.debt *= 1.001; // ~11% a year interest
      const spare = p.money - 35;
      if (spare > 0) { const pay = Math.min(p.debt, spare * 0.25 + 1); p.money -= pay; p.debt -= pay; const c = w.people.get(p.creditorId); if (c && c.alive) c.money += pay * 0.9; else T.treasury += pay * 0.9; }
      if (p.debt < 0.5) { p.debt = 0; p.creditorId = null; }
      else if (p.debt > 120 && !ec.debtNoted) { ec.debtNoted = true; w.addMemory(p, { type: 'debt', text: `Is deep in debt (${round(p.debt)} crowns) and lies awake over it.`, otherIds: [p.creditorId].filter((x) => x != null), weight: -0.6, importance: 3 }); p.needs.comfort = Math.max(0, p.needs.comfort - 0.1); }
      if (p.debt < 40) ec.debtNoted = false;
    }
    // poor relief and family support
    if (a >= 60 || p.job === 'unemployed') {
      if (p.money < 6 && (p.job === 'retired' || ec.unempDays > 7 || p.health < 0.5 || (a > 58))) {
        const kids = p.family.childrenIds.map((i) => w.people.get(i)).filter((c) => c && c.alive && c.money > 150 && c.id !== p.id);
        if (kids.length && !ply) { const k = w.rng.pick(kids); const gift = Math.min(k.money * 0.04, 8) + 1; k.money -= gift; p.money += gift; const rel = w.getRel(p, k); rel.affinity = Math.min(1, rel.affinity + 0.002); }
        else if (T.treasury > 30 && (p.job === 'retired' || p.health < 0.5)) { p.money += 1.5; T.treasury -= 1.5; e.relief += 1.5; }
        else if (T.treasury > 80 && ec.unempDays > 14) { p.money += 1; T.treasury -= 1; e.relief += 1; }
      }
    }
    // spouse sharing: nonearning spouse draws from the earner's purse
    if (p.family.spouseId && !JOBS[p.job] && p.money < 12) { const s = w.people.get(p.family.spouseId); if (s && s.alive && s.money > 40 && s.homeId === p.homeId) { const t = Math.min(4, s.money * 0.1); s.money -= t; p.money += t; } }
    // upkeep: soap, candles, heating in winter (small drain that goes outside town)
    if (a >= 16) { const up = 0.5 + (w.time.season === 3 ? 0.5 : 0); p.money = Math.max(0, p.money - Math.min(up, p.money * 0.15 + 0.05)); }
    // firing
    if (!ply && JOBS[p.job] && p.workId != null && day - ec.hireDay > 25 && !PUBLIC.has(w.buildings.get(p.workId)?.type)) {
      const bad = ec.perf < 0.38 || (jailed(w, p) && (p.jailedUntil - w.tick) > 14 * 144);
      if (bad && w.rng.chance(0.25)) {
        const b = w.buildings.get(p.workId); const old = p.job;
        leaveJob(w, p, 'unemployed');
        w.addMemory(p, { type: 'fired', text: `Was dismissed from ${bName(b || {})} for ${ec.perf < 0.38 ? 'poor attendance and slack work' : 'long absence'}.`, otherIds: b?.ownerId != null ? [b.ownerId] : [], weight: -0.6, importance: 3 });
        if (b && b.ownerId != null) { const o = w.people.get(b.ownerId); if (o) { const r = w.getRel(p, o); r.affinity = Math.max(-1, r.affinity - 0.2); } }
        if (w.rng.chance(0.25)) w.chronicle.add({ type: 'dismissal', importance: 1, text: `${nm(p)} was let go from ${bName(b || {})} after months of missed shifts.`, people: [p.id], buildingId: b?.id });
        ec.perf = 0.6;
      }
    }
    if (p.job === 'unemployed' && a >= 16 && a < ec.retireAge && ec.unempDays > 5 && p.money < 3 && !p.homemaker) p.needs.purpose = Math.max(0, p.needs.purpose - 0.01);
    ec.wageToday = 0;
  }
  e.employmentRate = workingAge ? employed / workingAge : 0;
  e.workingAge = workingAge; e.employed = employed;
  // taxes of tr already taken at source; property tax on landlords
  for (const b of w.buildings.values()) {
    if (b.type !== 'house' || b.ownerId == null) continue;
    const o = w.people.get(b.ownerId); if (!o || !o.alive || b.residents.includes(o.id)) continue; // landlord (absentee)
    const t = 0.12 * tr; if (o.money > t) { o.money -= t; T.treasury += t; }
  }
}
function gini(arr) {
  const n = arr.length; if (!n) return 0; const s = arr.slice().sort((a, b) => a - b); let cum = 0, tot = 0;
  for (let i = 0; i < n; i++) { cum += (i + 1) * s[i]; tot += s[i]; } if (!tot) return 0; return (2 * cum) / (n * tot) - (n + 1) / n;
}

function businessDaily(w) {
  const e = eco(w), T = treasury(w), day = w.time.totalDays;
  for (const b of [...w.buildings.values()]) {
    if (b.closed || !COMMERCIAL.has(b.type)) { if (b.closed) { b.revToday = 0; b.wagesToday = 0; } continue; }
    b.econ = b.econ || { daysNeg: 0, openedDay: day };
    const owner = b.ownerId != null ? w.people.get(b.ownerId) : null;
    let payroll = 0; for (const id of b.employees) { const p = w.people.get(id); if (p && p.alive) payroll += wageFor(w, p, b); }
    // owner injects capital when running short
    if (owner && owner.alive && (b.funds || 0) < payroll * 2 && owner.money > 250 && !isPlayer(w, owner) && w.rng.chance(0.5)) { const inj = Math.min(120, owner.money * 0.25); owner.money -= inj; b.funds = (b.funds || 0) + inj; b.econ.injected = (b.econ.injected || 0) + inj; }
    // tavern/inn/market overhead & upkeep going outside town
    const upkeep = 1.2 + payroll * 0.04; b.funds = (b.funds || 0) - Math.min(upkeep, Math.max(upkeep, 0)); b.costToday = upkeep + (b.wagesToday || 0);
    b.condition = Math.max(0.05, (b.condition ?? 0.8) - 0.0007);
    // dividends
    if (owner && owner.alive && day % 7 === 0 && (b.funds || 0) > payroll * 14 + 350) {
      const x = ((b.funds || 0) - payroll * 14 - 350) * 0.4; b.funds -= x; const tax = x * taxRate(w); owner.money = (owner.money || 0) + x - tax; T.treasury += tax; e.dividends += x;
    }
    if (b.funds < 0) b.econ.daysNeg++; else b.econ.daysNeg = Math.max(0, b.econ.daysNeg - 2);
    b.profit30 = (b.profit30 || 0) * 0.965 + ((b.revToday || 0) - (b.costToday || 0));
    if (b.econ.daysNeg >= 24 && b.funds < -60) closeBusiness(w, b, owner);
    b.revToday = 0; b.wagesToday = 0;
  }
}
function closeBusiness(w, b, owner) {
  const years = Math.max(0, (w.time.totalDays - (b.econ?.openedDay ?? 0)) / 112);
  for (const id of [...b.employees]) { const p = w.people.get(id); if (p && p.alive) { leaveJob(w, p, 'unemployed'); w.addMemory(p, { type: 'laidOff', text: `${bName(b)} went under and ${p.sex === 'F' ? 'she' : 'he'} lost ${p.sex === 'F' ? 'her' : 'his'} place as a ${p.job}.`, otherIds: owner ? [owner.id] : [], weight: -0.6, importance: 3 }); } }
  b.employees = []; b.closed = true; b.ownerId = null; b.funds = 0; b.name = b.name; b.econ.closedDay = w.time.totalDays; b.econ.daysNeg = 0;
  const lead = owner ? ` ${nm(owner)} lost ${owner.sex === 'F' ? 'her' : 'his'} savings in the venture.` : '';
  const T = [`${bName(b)} has closed its doors for good after ${years < 1 ? 'less than a year' : Math.round(years) + ' years'} of trade.${lead}`, `Bankruptcy at ${bName(b)}: the creditors were paid pennies on the crown and the shutters are down.${lead}`, `${bName(b)} could not make its wages and has been wound up.${lead}`];
  w.chronicle.add({ type: 'bankruptcy', importance: 4, text: w.rng.pick(T), people: owner ? [owner.id] : [], buildingId: b.id });
  if (owner) { owner.money = Math.max(0, owner.money - 60); owner.reputation = clamp(owner.reputation - 0.06, -1, 1); w.addMemory(owner, { type: 'bankruptcy', text: `Went bankrupt with ${bName(b)}.`, otherIds: [], weight: -0.9, importance: 5 }); addDebt(w, owner, 40); }
  w.emit('bankruptcy', { buildingId: b.id, ownerId: owner?.id ?? null });
}

function openBusinesses(w, force) {
  const e = eco(w);
  const closed = [...w.buildings.values()].filter((b) => b.closed && COMMERCIAL.has(b.type) && b.type !== 'market');
  if (!closed.length && !force) return;
  const cands = w.living().filter((p) => {
    const a = age(w, p); if (a < 24 || a > 60 || isPlayer(w, p) || jailed(w, p)) return false;
    if ((p.money || 0) < 480) return false;
    return p.traits.includes('ambitious') || p.personality.conscientiousness > 0.62 || p.personality.openness > 0.7;
  });
  if (!cands.length) return;
  const p = w.rng.pick(cands);
  const b = closed.length ? w.rng.pick(closed) : null; if (!b) return;
  const used = new Set([...w.buildings.values()].map((x) => x.name));
  const old = b.name; const name = businessName(w.rng, b.type, p.lastName, used);
  p.money -= 280; b.funds = 280; b.name = name; b.ownerId = p.id; b.closed = false; b.condition = Math.max(b.condition ?? 0.5, 0.6); b.econ = { daysNeg: 0, openedDay: w.time.totalDays }; b.profit30 = 0;
  b.inventory = b.inventory || {};
  const lead = slotsOf(b)[0];
  if (lead && lead !== 'mayor' && (!JOBS[p.job] || p.job === 'laborer') && eligible(w, p, lead, b)) setJob(w, p, b, lead);
  w.addMemory(p, { type: 'business', text: `Opened ${name} (formerly ${old}) with ${280} crowns of savings.`, otherIds: [], weight: 0.7, importance: 4 });
  const T = [`${nm(p)} has bought the empty premises of the old ${old} and opens ${name}.`, `New in ${w.town?.name || 'town'}: ${nm(p)} opens ${name} as a ${BUILDING_TYPES[b.type]?.label.toLowerCase() || b.type}, staking ${p.sex === 'F' ? 'her' : 'his'} savings on it.`, `${name} opens under ${nm(p)}, reviving the shuttered ${old}.`];
  w.chronicle.add({ type: 'business', importance: 3, text: w.rng.pick(T), people: [p.id], buildingId: b.id });
  w.emit('businessOpened', { buildingId: b.id, ownerId: p.id });
}

// ---------------------------------------------------------------- housing
function movePeople(w, members, house) {
  for (const p of members) {
    const old = p.homeId != null ? w.buildings.get(p.homeId) : null;
    if (old) old.residents = old.residents.filter((i) => i !== p.id);
    p.homeId = house.id; if (!house.residents.includes(p.id)) house.residents.push(p.id);
    w.emit('moveHome', { person: p, homeId: house.id });
  }
}
function rentDaily(w) {
  const e = eco(w), T = treasury(w);
  const vacant = [...w.buildings.values()].filter((b) => b.type === 'house' && !b.residents.length && !b.closed);
  for (const h of w.buildings.values()) {
    if (h.type !== 'house' || !h.residents.length) continue;
    const owner = h.ownerId != null ? w.people.get(h.ownerId) : null;
    const resident = owner && h.residents.includes(owner.id);
    if (resident) { h.arrears = 0; continue; }
    if (owner && !owner.alive) continue;
    const rent = RENT_PER_DAY * (0.7 + 0.5 * (h.condition ?? 0.7)) * (owner ? 1 : 0.6);
    const adults = h.residents.map((i) => w.people.get(i)).filter((p) => p && p.alive && age(w, p) >= 16);
    if (!adults.length) continue;
    adults.sort((a, b) => b.money - a.money); const payer = adults[0];
    const due = rent + (h.arrears || 0) * 0.2;
    const pay = Math.min(due, Math.max(0, payer.money - 3));
    payer.money -= pay;
    if (owner) owner.money += pay * 0.93; else T.treasury += pay; T.treasury += owner ? pay * 0.07 : 0;
    h.arrears = Math.max(0, (h.arrears || 0) + rent - pay);
    if (h.arrears > rent * 12 && vacant.length && w.rng.chance(0.2)) {
      const cheap = vacant.filter((v) => v.id !== h.id).sort((a, b) => (a.condition ?? 0.5) - (b.condition ?? 0.5))[0];
      if (cheap) {
        const family = h.residents.map((i) => w.people.get(i)).filter((p) => p && p.alive);
        movePeople(w, family, cheap); vacant.splice(vacant.indexOf(cheap), 1); h.arrears = 0;
        const head = payer; w.addMemory(head, { type: 'eviction', text: `Was turned out of ${bName(h)} for unpaid rent and had to move the family to ${bName(cheap)}.`, otherIds: owner ? [owner.id] : [], weight: -0.8, importance: 4 });
        if (owner) { const r = w.getRel(head, owner); r.affinity = Math.max(-1, r.affinity - 0.4); const r2 = w.getRel(owner, head); r2.affinity = Math.max(-1, r2.affinity - 0.15); }
        w.chronicle.add({ type: 'eviction', importance: 2, text: `The ${head.lastName} family were put out of ${bName(h)} over arrears of ${round(rent * 12)} crowns and have taken a cheaper house.`, people: family.map((p) => p.id).slice(0, 4) });
        e.evictions++;
      } else if (w.rng.chance(0.05)) h.arrears *= 0.5;
    }
  }
  // homeless people (e.g. after widowhood/migration) get a vacant house
  for (const p of w.living()) {
    if (p.homeId != null || age(w, p) < 16 || !vacant.length || isPlayer(w, p)) continue;
    const h = vacant.shift(); movePeople(w, [p], h); if (h.ownerId == null && p.money > 100 && w.rng.chance(0.3)) h.ownerId = p.id;
  }
}
function housingMarket(w) {
  // debt-ridden owners sell the roof over their head to a landlord and stay on as tenants; the wealthy buy vacant houses
  const e = eco(w);
  const rich = w.living().filter((p) => p.money > 700 && age(w, p) >= 30 && !isPlayer(w, p));
  if (!rich.length) return;
  for (const h of w.buildings.values()) {
    if (h.type !== 'house' || h.ownerId == null) continue;
    const o = w.people.get(h.ownerId); if (!o || !o.alive || !h.residents.includes(o.id)) continue;
    if ((o.debt || 0) > 90 && (o.money || 0) < 15 && !isPlayer(w, o)) {
      const buyer = w.rng.pick(rich); if (buyer === o) continue;
      const pr = Math.round(240 * (h.condition ?? 0.6)); if (buyer.money < pr + 300) continue;
      buyer.money -= pr; o.money += pr; const pay = Math.min(o.debt, o.money); o.money -= pay; o.debt -= pay; h.ownerId = buyer.id;
      w.addMemory(o, { type: 'houseSold', text: `Sold ${bName(h)} to ${nm(buyer)} to clear debts and now rents it.`, otherIds: [buyer.id], weight: -0.7, importance: 4 });
      if (pr > 150) w.chronicle.add({ type: 'property', importance: 2, text: `${nm(o)}, pressed by creditors, sold ${bName(h)} to ${nm(buyer)} and stays on as tenant.`, people: [o.id, buyer.id] });
    }
  }
  const vacant = [...w.buildings.values()].filter((b) => b.type === 'house' && !b.residents.length && !b.closed && (b.ownerId == null || !w.people.get(b.ownerId)?.alive));
  for (const h of vacant) { if (!w.rng.chance(0.3)) continue; const buyer = w.rng.pick(rich); const pr = Math.round(200 * (h.condition ?? 0.5)); if (buyer.money > pr + 400) { buyer.money -= pr; treasury(w).treasury += pr; h.ownerId = buyer.id; } }
}

// ---------------------------------------------------------------- inheritance
function onDeath(w, d) {
  if (!d) return;
  const T = treasury(w);
  const b0 = d.workId != null ? w.buildings.get(d.workId) : null; if (b0) b0.employees = b0.employees.filter((i) => i !== d.id);
  const P = (id) => { const q = w.people.get(id); return q && q.alive ? q : null; };
  const f = d.family;
  const spouse = f.spouseId != null ? P(f.spouseId) : null;
  const kids = f.childrenIds.map(P).filter(Boolean);
  const sibs = (f.siblingIds || []).map(P).filter(Boolean);
  let estate = Math.max(0, (d.money || 0)); const debt = d.debt || 0; d.money = 0; d.debt = 0;
  const funeral = Math.min(estate, 12); estate -= funeral; T.treasury += funeral * 0.3;
  const settle = Math.min(estate, debt); estate -= settle; { const c = w.people.get(d.creditorId); if (c && c.alive) c.money += settle; }
  const tax = estate > 200 ? (estate - 200) * 0.05 : 0; estate -= tax; T.treasury += tax;
  const heirs = [];
  if (estate > 0) {
    if (spouse && kids.length) { const s = estate * 0.5; spouse.money += s; heirs.push([spouse, s]); const each = (estate - s) / kids.length; for (const k of kids) { k.money += each; heirs.push([k, each]); } }
    else if (spouse) { spouse.money += estate; heirs.push([spouse, estate]); }
    else if (kids.length) { const each = estate / kids.length; for (const k of kids) { k.money += each; heirs.push([k, each]); } }
    else if (sibs.length) { const each = estate / sibs.length; for (const s of sibs) { s.money += each; heirs.push([s, each]); } }
    else T.treasury += estate; // escheat / parish
  }
  // property
  const adultKids = kids.filter((k) => age(w, k) >= 18).sort((a, b) => a.birthTick - b.birthTick);
  const propHeir = (spouse && age(w, spouse) >= 18 ? spouse : adultKids[0] || (kids.length ? null : sibs[0] || null)) || null;
  const props = [];
  for (const b of w.buildings.values()) {
    if (b.ownerId !== d.id) continue;
    if (b.type === 'house' && spouse && b.residents.includes(spouse.id)) { b.ownerId = spouse.id; props.push(b); continue; }
    if (b.type === 'house') { const live = b.residents.map(P).filter(Boolean); const h = adultKids.find((k) => b.residents.includes(k.id)) || (live.length ? live.find((x) => x.family.fatherId === d.id || x.family.motherId === d.id || x.id === d.family.spouseId) : null) || propHeir; b.ownerId = h ? h.id : null; if (h) props.push(b); continue; }
    b.ownerId = propHeir ? propHeir.id : null; if (propHeir) { props.push(b); if (b.ownerId != null && COMMERCIAL.has(b.type)) w.addMemory(propHeir, { type: 'inherit', text: `Inherited ${bName(b)} from ${nm(d)}.`, otherIds: [d.id], weight: 0.2, importance: 4 }); }
  }
  for (const [h, amt] of heirs) if (amt > 20) w.addMemory(h, { type: 'inheritance', text: `Inherited ${round(amt)} crowns from ${nm(d)}.`, otherIds: [d.id], weight: 0.3, importance: 3 });
  const bizz = props.filter((b) => COMMERCIAL.has(b.type));
  const total = (d.money || 0) + heirs.reduce((a, x) => a + x[1], 0);
  if (heirs.length && (total > 400 || bizz.length)) {
    const main = heirs[0][0]; const rel = spouse === main ? 'widow' + (main.sex === 'M' ? 'er' : '') : 'heir';
    w.chronicle.add({ type: 'inheritance', importance: bizz.length ? 3 : 2, text: `${nm(d)}'s estate of about ${round(total)} crowns passes to ${nm(main)}${heirs.length > 1 ? ` and ${heirs.length - 1} other${heirs.length > 2 ? 's' : ''}` : ''}${bizz.length ? `, along with ${bizz.map(bName).join(' and ')}` : ''}.`, people: [d.id, ...heirs.map((x) => x[0].id)].slice(0, 5) });
  }
  if (bizz.length === 0 && b0 && b0.ownerId == null && COMMERCIAL.has(b0.type)) b0.econ && (b0.econ.ownerless = true);
}

// ---------------------------------------------------------------- seasonal / yearly
function harvestRoll(w) {
  const e = eco(w);
  let h = clamp(w.rng.gauss(1.0, 0.17), 0.45, 1.4);
  if (e.harvestForced != null) { h = e.harvestForced; e.harvestForced = null; }
  e.harvest = h;
  const town = w.town?.name || 'Hollowmere';
  if (h < 0.7) w.chronicle.add({ type: 'harvest', importance: 4, text: w.rng.pick([`A wet, cold spring promises a miserable harvest; farmers around ${town} expect only ${Math.round(h * 100)} parts in a hundred of a normal crop.`, `Blight in the rye and a poor season ahead: the barns of ${town} will be thin this year.`, `Farmers warn of a bad harvest to come; grain is already being hoarded.`]), people: [] });
  else if (h > 1.25) w.chronicle.add({ type: 'harvest', importance: 3, text: w.rng.pick([`A kindly spring and good rains: the farms of ${town} look set for a bumper harvest.`, `Fat ears of barley and full orchards this year; the granaries will be crowded.`]), people: [] });
}
function checkSpikes(w) {
  const e = eco(w);
  for (const g of ['bread', 'grain', 'flour']) {
    const pr = price(w, g), rel = pr / GOODS[g].base;
    if (rel > 1.8 && !e.spiked[g]) {
      e.spiked[g] = true;
      w.chronicle.add({ type: 'prices', importance: 4, text: g === 'bread' ? `Bread has risen to ${pr.toFixed(2)} crowns a loaf, almost ${(rel).toFixed(1)} times the usual price; the poor are going hungry in ${w.town?.name || 'town'}.` : `The price of ${g} has leapt to ${pr.toFixed(2)} crowns a measure as stocks run low.`, people: [] });
    } else if (rel < 1.3 && e.spiked[g]) { e.spiked[g] = false; if (g === 'bread') w.chronicle.add({ type: 'prices', importance: 2, text: `Bread prices have eased to ${pr.toFixed(2)} crowns a loaf; the worst of the shortage is over.`, people: [] }); }
  }
}

// ---------------------------------------------------------------- interventions
function regIntervention(w, kind, fn, desc) {
  fn.description = desc; w.registerIntervention?.(kind, fn, desc);
}
function argsOf(a, b) { return a && a.people instanceof Map ? [a, b || {}] : [b, a || {}]; }
function registerInterventions(w) {
  regIntervention(w, 'goldRush', (a, b) => {
    const [world, p] = argsOf(a, b); const amt = p.amount ?? 2500;
    const living = world.living().filter((x) => age(world, x) >= 16);
    const lucky = p.personId != null ? [world.people.get(p.personId)].filter(Boolean) : world.rng.shuffle(living.slice()).slice(0, Math.max(3, Math.round(living.length * 0.06)));
    for (const x of lucky) { const g = p.personId != null ? amt : Math.round(amt * world.rng.float(0.15, 0.6)); x.money += g; world.addMemory(x, { type: 'windfall', text: `Struck it rich in the gold rush, bringing home ${g} crowns.`, otherIds: [], weight: 0.9, importance: 5 }); x.moodlets?.push({ id: 'goldRush', label: 'Struck it rich', value: 0.6, untilTick: world.tick + 20 * 144 }); }
    for (const x of living) if (!lucky.includes(x)) x.money += Math.round(amt * 0.01);
    for (const bb of world.buildings.values()) if (COMMERCIAL.has(bb.type) && !bb.closed) bb.funds = (bb.funds || 0) + 40;
    eco(world).market.inflation = 1.18;
    world.chronicle.add({ type: 'goldRush', importance: 5, text: `Gold! A seam has been found in the hills above ${world.town?.name || 'town'} and ${lucky.length} townsfolk come home with their pockets heavy. Prices climb as the coin spreads.`, people: lucky.map((x) => x.id).slice(0, 6) });
    return `gold rush: ${lucky.length} lucky, inflation up`;
  }, 'Money influx: a few townsfolk strike gold and prices inflate. params {amount, personId?}');
  regIntervention(w, 'famine', (a, b) => {
    const [world, p] = argsOf(a, b); const sev = clamp(p.severity ?? 0.7, 0.1, 0.95); const e = eco(world);
    e.harvest *= (1 - sev); e.noImportUntil = world.tick + (p.days ?? 180) * 144;
    for (const bb of world.buildings.values()) { if (!bb.inventory) continue; for (const g of ['grain', 'flour', 'bread']) if (bb.inventory[g]) bb.inventory[g] *= (1 - sev); }
    for (const x of world.living()) if (x.inventory.food) x.inventory.food *= (1 - sev);
    world.chronicle.add({ type: 'famine', importance: 5, text: `Famine grips ${world.town?.name || 'the town'}: granaries are empty, the roads are closed to traders, and the poor eat what they can find.`, people: [] });
    return `famine severity ${sev}`;
  }, 'Granaries destroyed, harvest fails, no imports for a while. params {severity 0..1, days}');
  regIntervention(w, 'tradeBoom', (a, b) => {
    const [world, p] = argsOf(a, b); const e = eco(world);
    e.boomUntil = world.tick + (p.days ?? 56) * 144; e.boomFactor = p.factor ?? 1.5;
    for (const bb of world.buildings.values()) if (COMMERCIAL.has(bb.type) && !bb.closed) bb.funds = (bb.funds || 0) + 60 * e.boomFactor;
    world.chronicle.add({ type: 'tradeBoom', importance: 4, text: `Merchants from three counties descend on ${world.town?.name || 'town'}; every workshop has orders and the market is thronged.`, people: [] });
    return 'trade boom';
  }, 'Export demand surges and businesses get cash. params {days, factor}');
  regIntervention(w, 'setPrice', (a, b) => {
    const [world, p] = argsOf(a, b); const g = p.good || 'bread'; if (!GOODS[g]) return 'unknown good';
    const e = eco(world);
    const val = p.price ?? GOODS[g].base * (p.mult ?? 1);
    e.market.override[g] = { price: val, untilTick: world.tick + (p.days ?? 28) * 144 };
    world.chronicle.add({ type: 'prices', importance: 3, text: `The council fixes the price of ${g} at ${val.toFixed(2)} crowns for ${p.days ?? 28} days.`, people: [] });
    return `price of ${g} set to ${val}`;
  }, 'Fix the price of a good for some days. params {good: grain|flour|bread|tools|clothes|furniture, price|mult, days}');
}

// ---------------------------------------------------------------- init & API
function initEcon(w) {
  const e = {
    market: { mult: {}, override: {}, inflation: 1 }, market_prev: {}, stock: {}, rate: {}, dailyDemand: {}, sold: {}, demandToday: {}, imported: {},
    made: { grain: 0, flour: 0, bread: 0, tools: 0, clothes: 0, furniture: 0 }, harvest: 1, harvestForced: null, noImportUntil: 0, boomUntil: 0, boomFactor: 1, spiked: {},
    wagesPaid: 0, foodSpend: 0, mealSpend: 0, exportRev: 0, dividends: 0, alms: 0, unmet: 0, relief: 0, evictions: 0, employmentRate: 0, unemployed: 0, gini: 0,
    richestId: null, richestWealth: 0, lender: null, worst: null,
    marketBuilding: marketBuilding,
  };
  w.econ = e;
  // public API for a player character / other systems
  e.price = (g) => price(w, g); e.GOODS = GOODS; e.hire = (b, p, job) => setJob(w, p, b, job); e.fire = (p) => leaveJob(w, p); e.payWage = (p, b, f) => payWage(w, p, b, f);
  e.wealthOf = (p) => wealthOf(w, p); e.openBusiness = () => openBusinesses(w, true); e.takeGood = (g, q) => takeGood(w, g, q); e.addDebt = (p, a) => addDebt(w, p, a);
  e.applyForJob = (p, b, job) => { const have = slotCounts(w, b); const need = slotsOf(b).filter((j) => j === job).length; if ((have[job] || 0) >= need || !eligible(w, p, job, b)) return false; setJob(w, p, b, job); return true; };
  e.summary = () => ({ employment: +e.employmentRate.toFixed(2), unemployed: e.unemployed, gini: +e.gini.toFixed(2), breadPrice: +price(w, 'bread').toFixed(2), harvest: +e.harvest.toFixed(2), treasury: round(treasury(w).treasury), meanMoney: round(w.living().reduce((a, p) => a + (p.money || 0), 0) / Math.max(1, w.living().length)), closedBiz: [...w.buildings.values()].filter((b) => b.closed).length });
  for (const g of Object.keys(GOODS)) e.market.mult[g] = 1;
}
function seedStocks(w) {
  const e = eco(w); const D = mealsPerDay(w); const pop = w.living().length;
  recalcRates(w);
  const spread = (type, g, total) => { const bs = w.buildingsOfType(type); for (const b of bs) { b.inventory = b.inventory || {}; b.inventory[g] = (b.inventory[g] || 0) + total / bs.length; } };
  spread('farm', 'grain', D * 70); spread('mill', 'flour', D * 3.5); spread('bakery', 'bread', D * 0.6);
  spread('smithy', 'tools', pop * 0.03); spread('tailor', 'clothes', pop * 0.08); spread('carpenter', 'furniture', pop * 0.02);
  for (const b of w.buildingsOfType('farm')) b.inventory.toolsWear = w.rng.float(0.4, 1);
  const mk = marketBuilding(w); if (mk && mk.inventory?.food) { mk.inventory.bread = (mk.inventory.bread || 0) + mk.inventory.food; mk.inventory.food = 0; }
  for (const b of w.buildings.values()) { if (COMMERCIAL.has(b.type)) { b.funds = Math.max(b.funds || 0, 220); b.econ = { daysNeg: 0, openedDay: -w.rng.int(100, 3000) }; } }
  treasury(w); if (w.settings && w.settings.taxRate === undefined) w.settings.taxRate = 0.1;
}

export default {
  name: 'economy',
  init(world) {
    initEcon(world); seedStocks(world); registerInterventions(world);
    for (const p of world.living()) E(world, p);
    world.on('death', (ev) => onDeath(world, ev.person));
    world.on('actionEnd', (ev) => { // drinking at the tavern costs money, which lands in the till
      const a = ev?.action, p = ev?.person; if (!a || !p) return;
      const id = a.id ?? a; if (id !== 'drink' && id !== 'drinkAtTavern' && id !== 'tavern') return;
      const b = p.locationId != null ? world.buildings.get(p.locationId) : null; if (!b || (b.type !== 'tavern' && b.type !== 'inn') || (p.money || 0) < 1.2) return;
      const pr = 1.0 + (p.traits.includes('drunkard') ? 0.6 : 0); p.money -= pr; b.funds = (b.funds || 0) + pr; b.revToday = (b.revToday || 0) + pr; eco(world).mealSpend += pr;
    });
  },
  onHour(world) { produceHour(world); },
  onDay(world) {
    const e = eco(world);
    recalcRates(world); updatePrices(world); spoilAndExport(world); durableDemand(world);
    personDaily(world); businessDaily(world); rentDaily(world); runHiring(world); runApprenticeships(world);
    checkSpikes(world);
    for (const g in e.sold) e.sold[g] *= 0.98;
    if (world.time.dayOfSeason === 14 && world.rng.chance(0.6)) openBusinesses(world);
    if (world.time.dayOfSeason === 20) housingMarket(world);
  },
  onSeason(world) { if (world.time.season === 0) harvestRoll(world); },
  onYear(world) { const e = eco(world); e.wagesPaid = 0; e.foodSpend = 0; e.mealSpend = 0; e.exportRev = 0; e.dividends = 0; e.alms = 0; e.unmet = 0; e.relief = 0; e.evictions = 0; for (const k in e.made) e.made[k] = 0; for (const b of world.buildingsOfType('farm')) if (b.inventory) b.inventory.toolsWear = Math.max(0, (b.inventory.toolsWear ?? 1) - 0.5); },
  actions: [workAction, shopAction, mealAction],
  scoreModifiers: [],
};
