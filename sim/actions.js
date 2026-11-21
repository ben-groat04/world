// Core utility-AI actions. Contract shape: {id,label,score(world,p),where?(world,p),duration(world,p,b),onStart,onTick,onEnd,thought?,interruptible}
// Core actions stash their chosen target in world.brain.ctx.target / .why / .data from score() instead of defining where().
// Extra fields: perTick {need:delta} applied each tick while acting; decay {need:multiplier} scales need decay while acting;
// minAge/maxAge gate; stickiness bonus when it is already the current action.
import { isOpen } from './map.js';
import { ticksUntilHour } from './time.js';

const dist = (p, b) => Math.abs(p.x - b.door.x) + Math.abs(p.y - b.door.y);
const urg = (n, k = 1.6) => 100 * Math.pow(1 - n, k);
const rain = (w) => w.weather.type === 'rain' || w.weather.type === 'snow';
const dayHour = (h, a, b) => h >= a && h < b;

const HF = { have: 0, need: 0, n: 0, home: null }; // shared result object, cached per decision (brain.ctx.hfP)
function householdFood(w, p) {
  const c = w.brain.ctx;
  if (c.hfP === p) return HF;
  c.hfP = p;
  const home = p.homeId != null ? w.buildings.get(p.homeId) : null;
  if (!home) { HF.have = p.inventory.food; HF.need = 3; HF.n = 1; HF.home = null; return HF; }
  let have = 0, n = 0;
  for (const id of home.residents) { const q = w.people.get(id); if (q && q.alive) { have += q.inventory.food; n++; } }
  HF.have = have; HF.need = n * 3; HF.n = n; HF.home = home;
  return HF;
}
export function takeFood(w, p) {
  if (p.inventory.food >= 1) { p.inventory.food -= 1; return true; }
  const home = p.homeId != null ? w.buildings.get(p.homeId) : null;
  if (!home) return false;
  for (const id of home.residents) {
    const q = w.people.get(id);
    if (q && q.alive && q.inventory.food >= 1 && (id === p.id || w.relScore(q, p) > -0.5 || q.family.childrenIds.includes(p.id))) { q.inventory.food -= 1; return true; }
  }
  return false;
}
function nearestOpen(w, p, type, c) {
  const L = w.brain.openOf(type); let best = null, bd = 1e9;
  for (let i = 0; i < L.length; i++) { const b = L[i]; const d = dist(p, b); if (d < bd) { bd = d; best = b; } }
  return best;
}
const mealWindow = (h) => dayHour(h, 6, 9.5) || dayHour(h, 11.5, 14) || dayHour(h, 17.5, 21);
const hungryGate = (c, p) => p.needs.hunger < 0.78;
function eatScore(c, p) {
  const n = p.needs, u = urg(n.hunger);
  let s = u;
  if (n.hunger < 0.75) s += (mealWindow(c.h) ? 12 : 0) + (c.mealAgo > 48 ? 40 : c.mealAgo > 30 ? 22 : 0);
  return s;
}

export const CORE_ACTIONS = [
  {
    id: 'sleep', label: 'sleeping', interruptible: false, decay: { hunger: 0.45, social: 0, fun: 0, purpose: 0, hygiene: 0.5 },
    perTick: { energy: 0.021, comfort: 0.002 },
    score(w, p) {
      const c = w.brain.ctx, d = 1 - p.needs.energy;
      let s = 0, win = c.inWin;
      if (win) s = 55 + 45 * d; else if (p.needs.energy < 0.3) s = d * d * 110;
      if (s <= 0) return 0;
      if (p.homeId != null) c.target = p.homeId; else { const inn = nearestOpen(w, p, 'inn', c); if (!inn) return 0; c.target = inn.id; }
      c.why = win ? (d > 0.5 ? 'exhausted, time for bed' : 'it is late, time for bed') : 'worn out, needs a nap';
      c.data = win;
      return s;
    },
    duration(w, p, b, ca) {
      const c = w.brain.ctx;
      const toWake = ticksUntilHour(w.tick, c.wake);
      if (ca.data) return Math.max(6, toWake);
      return Math.max(6, Math.min(toWake, Math.ceil((0.95 - p.needs.energy) / 0.02)));
    },
  },
  {
    id: 'eat_home', label: 'having a meal', perTick: { hunger: 0.14, comfort: 0.002 }, minAge: 0,
    score(w, p) {
      const c = w.brain.ctx;
      if (p.homeId == null || !hungryGate(c, p)) return 0;
      const hf = householdFood(w, p);
      if (hf.have < 1) return 0;
      const home = hf.home;
      c.target = home.id; c.why = p.needs.hunger < 0.35 ? 'starving' : 'hungry, mealtime';
      return eatScore(c, p) - dist(p, home) * 0.1;
    },
    duration: () => 4,
    onStart(w, p) { if (!takeFood(w, p)) return false; p.lastMeal = w.tick; },
  },
  {
    id: 'eat_tavern', label: 'eating out', perTick: { hunger: 0.12, fun: 0.004, social: 0.004 }, minAge: 12,
    score(w, p) {
      const c = w.brain.ctx;
      if (!hungryGate(c, p)) return 0;
      let t = null, free = false;
      const wb = p.workId != null ? w.buildings.get(p.workId) : null;
      if (wb && (wb.type === 'tavern' || wb.type === 'inn') && c.shift) { t = wb; free = true; }
      else { t = nearestOpen(w, p, 'tavern', c); }
      if (!t) return 0;
      const price = free ? 0 : w.settings.prices.tavernMeal;
      if (p.money < price + 2) return 0;
      c.target = t.id; c.why = free ? 'meal break at work' : 'hungry, fancies a hot meal out';
      c.data = price;
      const hf = householdFood(w, p);
      return eatScore(c, p) * 0.88 + p.personality.extraversion * 8 + (hf.have < 1 ? 18 : 0) + (free ? 10 : -dist(p, t) * 0.1 - 4);
    },
    duration: () => 5,
    onStart(w, p, b, ca) { const pr = ca.data || 0; if (p.money < pr) return false; p.money -= pr; b.funds += pr; p.lastMeal = w.tick; },
  },
  {
    id: 'work', label: 'working', interruptible: false, perTick: { purpose: 0.011, social: 0.002, fun: 0.001 },
    score(w, p) {
      const c = w.brain.ctx;
      if (!c.shift || p.health < 0.3 || p.jailedUntil > w.tick) return 0;
      let s = 88 + 10 * p.personality.conscientiousness;
      if (c.mealAgo >= 30 && p.needs.hunger < 0.7 && dayHour(c.h, 11.5, 14)) s -= 45;
      if (p.needs.energy < 0.12) s -= 30;
      if (p.traits.includes('lazy')) s -= 6;
      c.target = p.workId; c.why = `${p.job} shift until ${Math.floor(c.shiftEnd) % 24}:00`;
      return s;
    },
    duration(w, p) { const c = w.brain.ctx; return Math.max(1, Math.min(ticksUntilHour(w.tick, c.shiftEnd % 24), 24)); },
    onTick(w, p) { p.workedTicks++; },
  },
  {
    id: 'school', label: 'in lessons', interruptible: false, perTick: { purpose: 0.011, social: 0.005, fun: 0.002 }, minAge: 6, maxAge: 15.99,
    score(w, p) {
      const c = w.brain.ctx;
      if (p.job !== 'student' || c.rest || !dayHour(c.h, 8, 15)) return 0;
      const s = w.buildingsOfType('school')[0];
      if (!s) return 0;
      c.target = s.id; c.why = 'school day';
      return 92;
    },
    duration(w) { return Math.max(1, ticksUntilHour(w.tick, 15)); },
  },
  {
    id: 'shop', label: 'shopping', perTick: { fun: 0.004 }, minAge: 13,
    score(w, p) {
      const c = w.brain.ctx;
      if (c.shift || !dayHour(c.h, 7.5, 17.5)) return 0;
      const hf = householdFood(w, p);
      if (hf.have >= hf.n * 2 || p.money < w.settings.prices.food * 3) return 0;
      if (hf.home && hf.home.lastShop > w.tick - 24) return 0;
      const m = nearestOpen(w, p, 'market', c);
      if (!m || (m.inventory.food !== undefined && m.inventory.food < 1)) return 0;
      c.target = m.id; c.why = 'the pantry is running low';
      return 26 + Math.min(34, (hf.need - hf.have) * 3) + (c.rest ? 8 : 0) - dist(p, m) * 0.12;
    },
    duration: () => 3,
    onEnd(w, p, b) {
      const hf = householdFood(w, p), price = w.settings.prices.food;
      let n = Math.min(hf.need - hf.have, Math.floor(p.money / price));
      if (b.inventory.food !== undefined) n = Math.min(n, Math.floor(b.inventory.food));
      if (n < 1) return;
      p.money -= n * price; b.funds += n * price; p.inventory.food += n;
      if (b.inventory.food !== undefined) b.inventory.food -= n;
      if (hf.home) hf.home.lastShop = w.tick;
    },
  },
  {
    id: 'socialize', label: 'socializing', interruptible: true, minAge: 6,
    perTick: { social: 0.007, fun: 0.008 },
    score(w, p) {
      const c = w.brain.ctx;
      if (c.shift || !dayHour(c.h, 7, 22) || c.inWin) return 0;
      const ex = p.personality.extraversion;
      const s0 = 100 * Math.pow(1 - p.needs.social, 1.8) * (0.45 + 0.9 * ex);
      if (s0 < 5) return 0;
      let best = null, bv = -1e9;
      for (const type of ['park', 'square', 'market', 'temple']) {
        for (const b of w.buildingsOfType(type)) {
          if (!isOpen(b, c.h) || (type === 'park' && rain(w))) continue;
          const occ = b.occupants.size;
          let v = (ex > 0.5 ? Math.min(occ, 8) : (occ > 0 && occ < 4 ? occ * 1.5 : occ >= 6 ? -2 : 0)) - dist(p, b) * 0.08 + w.rng.float(0, 2);
          if (b.id === p.locationId) v += 2;
          if (v > bv) { bv = v; best = b; }
        }
      }
      if (!best) return 0;
      c.target = best.id; c.why = p.needs.social < 0.3 ? 'feeling lonely, wants company' : 'fancies some company';
      return s0;
    },
    duration: (w) => w.rng.int(8, 14),
    onTick(w, p, b) { if (b) p.needs.social = Math.min(1, p.needs.social + 0.004 * Math.min(4, b.occupants.size - 1)); },
  },
  {
    id: 'relax_park', label: 'relaxing in the park', interruptible: true, minAge: 6, perTick: { fun: 0.016, comfort: 0.003, social: 0.003 },
    score(w, p) {
      const c = w.brain.ctx;
      if (c.shift || !dayHour(c.h, 8, 19) || rain(w)) return 0;
      const b = nearestOpen(w, p, 'park', c);
      if (!b) return 0;
      c.target = b.id; c.why = 'could use a breath of fresh air';
      return 55 * (1 - p.needs.fun) + 10 * p.personality.openness + (c.age > 60 ? 8 : 0) - dist(p, b) * 0.12;
    },
    duration: (w) => w.rng.int(8, 18),
  },
  {
    id: 'tavern', label: 'having a drink', interruptible: false, minAge: 16, perTick: { fun: 0.018, social: 0.008, hunger: 0.003, energy: -0.001 },
    score(w, p) {
      const c = w.brain.ctx;
      if (c.shift || p.money < 10 || c.inWin) return 0;
      const b = nearestOpen(w, p, 'tavern', c);
      if (!b) return 0;
      const h = c.h;
      const tf = h >= 17 && h < 24 ? 1 : h < 1 ? 0.5 : h >= 12 && h < 17 ? (c.rest ? 0.7 : 0.2) : 0;
      if (tf === 0) return 0;
      const ex = p.personality.extraversion;
      let s = tf * (45 * (1 - p.needs.fun) + 25 * (1 - p.needs.social)) * (0.55 + 0.8 * ex) + (p.traits.includes('drunkard') ? 30 : 0) + (c.rest && h >= 14 ? 10 : 0) - (p.money < 30 ? 20 : 0) - dist(p, b) * 0.1;
      if (s <= 0) return 0;
      c.target = b.id; c.why = p.needs.social < 0.4 ? 'wants a drink and company' : 'time to unwind';
      return s;
    },
    duration: (w) => w.rng.int(8, 16),
    onStart(w, p, b) { const pr = w.settings.prices.drink; if (p.money < pr) return false; p.money -= pr; b.funds += pr; },
    onTick(w, p, b) { if (b) p.needs.social = Math.min(1, p.needs.social + 0.004 * Math.min(4, b.occupants.size - 1)); },
  },
  {
    id: 'pray', label: 'praying', minAge: 5, perTick: { purpose: 0.01, comfort: 0.004, fun: 0.002 },
    score(w, p) {
      const c = w.brain.ctx;
      if (c.shift || c.inWin) return 0;
      const b = nearestOpen(w, p, 'temple', c);
      if (!b) return 0;
      const pious = p.traits.includes('pious');
      let s = (c.rest && c.h < 12 ? (pious ? 70 : p.values.piety > 0.55 ? 35 : 12) : 0) + (pious ? 12 : 0) + (1 - p.needs.purpose) * 10 + p.values.piety * 6 - dist(p, b) * 0.1;
      if (s < 5) return 0;
      c.target = b.id; c.why = c.rest ? 'rest-day service' : 'seeking a quiet moment of prayer';
      return s;
    },
    duration: (w) => w.rng.int(5, 8),
  },
  {
    id: 'wander', label: 'wandering', interruptible: true, minAge: 8, perTick: { fun: 0.008, comfort: 0.001, hygiene: -0.001 },
    score(w, p) {
      const c = w.brain.ctx;
      if (c.shift || !dayHour(c.h, 6, 21)) return 0;
      const L = ['square', 'park', 'market', 'temple'];
      const types = c.h >= 16 ? L.concat('tavern') : L;
      const opts = [];
      for (const t of types) for (const b of w.buildingsOfType(t)) if (isOpen(b, c.h) && b.id !== p.locationId) opts.push(b);
      if (!opts.length) return 0;
      const b = opts[w.rng.int(0, opts.length - 1)];
      c.target = b.id; c.why = 'restless, fancies a stroll';
      return 9 + 12 * p.personality.openness + 10 * (1 - p.needs.fun) - (rain(w) ? 15 : 0);
    },
    duration: (w) => w.rng.int(4, 8),
  },
  {
    id: 'relax_home', label: 'relaxing at home', interruptible: true, perTick: { comfort: 0.006, fun: 0.006 },
    score(w, p) {
      const c = w.brain.ctx;
      if (p.homeId == null) return 0;
      c.target = p.homeId; c.why = c.age < 6 ? 'playing at home' : p.needs.comfort < 0.5 ? 'needs some rest at home' : 'nothing pressing, staying in';
      return 10 + 30 * (1 - p.needs.comfort) + 8 * (1 - p.needs.fun) * (1.2 - p.personality.extraversion) + (c.age < 6 ? 40 : 0) + (p.locationId === p.homeId ? 3 : 0);
    },
    duration: (w) => w.rng.int(6, 12),
    onTick(w, p, b) { if (b) p.needs.social = Math.min(1, p.needs.social + 0.003 * Math.min(2, b.occupants.size - 1)); },
  },
  {
    id: 'chores', label: 'doing chores', interruptible: true, minAge: 12, perTick: { purpose: 0.011, comfort: 0.002, fun: 0.002 },
    score(w, p) {
      const c = w.brain.ctx;
      if (p.homeId == null || c.shift || !dayHour(c.h, 7, 20)) return 0;
      c.target = p.homeId; c.why = p.job === 'unemployed' || p.job === 'retired' ? 'keeps busy around the house' : 'chores need doing';
      return 60 * Math.pow(1 - p.needs.purpose, 1.3) + (p.job === 'unemployed' || p.job === 'retired' ? 12 : 0) - (c.age < 15 ? 10 : 0);
    },
    duration: (w) => w.rng.int(6, 10),
  },
  {
    id: 'bathe', label: 'washing up', perTick: { hygiene: 0.3 },
    score(w, p) {
      const c = w.brain.ctx;
      if (p.homeId == null || p.needs.hygiene > 0.6) return 0;
      c.target = p.homeId; c.why = 'needs a wash';
      return urg(p.needs.hygiene, 1.8) + (c.h < 9 ? 10 : 0);
    },
    duration: () => 2,
  },
  {
    id: 'visit_friend', label: 'visiting a friend', interruptible: false, minAge: 10, perTick: { social: 0.016, fun: 0.006 },
    score(w, p) {
      const c = w.brain.ctx;
      if (c.shift || !dayHour(c.h, 10, 21) || c.inWin || p.needs.social > 0.7) return 0;
      let best = null, ba = 0.35, n = 0;
      for (const [id, r] of p.relationships) {
        if (++n > 40) break;
        if (r.affinity <= ba || r.familiarity < 0.5) continue;
        const f = w.people.get(id);
        if (!f || !f.alive || f.homeId == null || f.homeId === p.homeId || f.locationId !== f.homeId) continue;
        best = f; ba = r.affinity;
      }
      if (!best) return 0;
      c.target = best.homeId; c.data = best.id;
      c.why = `misses ${best.firstName}'s company`;
      return 100 * Math.pow(1 - p.needs.social, 1.5) * (0.4 + 0.8 * p.personality.extraversion) * 0.9 + ba * 10;
    },
    duration: (w) => w.rng.int(6, 12),
    onEnd(w, p, b, ca) {
      const f = w.people.get(ca.data);
      if (f && f.alive) { const r = w.getRel(p, f), r2 = w.getRel(f, p); r.familiarity = Math.min(1, r.familiarity + 0.01); r.affinity = Math.min(1, r.affinity + 0.01); r2.familiarity = Math.min(1, r2.familiarity + 0.01); r2.affinity = Math.min(1, r2.affinity + 0.01); }
    },
  },
  { id: 'idle', label: 'idling', score: () => 0, duration: () => 3 },
];
