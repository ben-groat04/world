// Routine plugin (W1-H): the placeholder "habit layer". Agenda-scheduled daily life from the real calendar + segment time-use; nobody is polled per tick:
// each person wakes only at plan transitions (kernel scheduler wheel), applies one plan entry (move/occupancy/thought) and schedules the next.
//
// HOOKS for other packages
//   goals (W1-B):   world.sys.goals.query.override(person, slot) -> null | {label, ptype, pid, aux?, cat?}  is asked before each plan entry is applied
//                   (slot = {tick, until, act, ptype, pid}); an object replaces that entry (act 'goal'). Or push a block with command 'routine.insert'
//                   {pid, from, to, label, ptype, bid} (ptype 1 = building id bid, 2 = street, 3 = off-map dest key in `dest`).
//   housing/labour: person.ext.pop.workplace / hh data drive the schedule; changing p.ext.pop.workplace|pattern|activity takes effect from the next plan (call `routine.replan` command).
//   life/social:    world.sys.routine.query.now(p) -> {act, cat, off, loc, label}; venue occupants via world.index.byVenue(buildingId); off-map: p.ext.rt.off = 'offmap:<dest>' (locationId null).
//   commands: routine.replan {pid}, routine.insert {...}.
import { A, ACT_LABEL, ACT_CAT, MODES, MODE_VERB, STRIDE, ACTS } from './acts.js';
import { buildPlan, hourToTick, workToday } from './plan.js';
import { openingsFor, isOpenAt } from '../../population/venues.js';
import { makeLife, makeCtx } from './life.js';

const CATS = ['sleep', 'work', 'commute', 'errand', 'out', 'social', 'home', 'chores', 'care', 'eat'];
export const TU_CATS = CATS;

const HOME_TH = ACT_LABEL.map((l) => l + ' at home'); // the common case, built once instead of a string concat per transition
function enter(world, ctx, p, rt, act, pt, pid, aux, tick) {
  // time-use accounting of the activity just finished
  if (ctx.tu !== null && rt.since >= 0 && rt.adult) { const k = (rt.dow >= 5 ? 1 : 0) * ctx.nseg + rt.seg; ctx.tu[k * CATS.length + rt.cat] += tick - rt.since; if (rt.pt === 0) ctx.tuh[k] += tick - rt.since; }
  const same = (pt === 0 && p.locationId === p.homeId) || (pt === 1 && p.locationId === pid);
  if (same) { // same place, new activity: no movement/occupancy work
    const b = world.buildings.get(p.locationId);
    p.thought = p.locationId === p.homeId ? HOME_TH[act] : ACT_LABEL[act] + ' at ' + b.name;
    rt.act = act; rt.cat = CATS.indexOf(ACT_CAT[act]); rt.since = tick; rt.dow = world.time.dow; rt.pt = pt; rt.pid = pid; p.lastAction = ACTS[act][0]; return;
  }
  const pb = p.locationId;
  if (pb !== null) { const b = world.buildings.get(pb); if (b) b.occupants.delete(p); }
  if (p.cell >= 0) world._gridRemove(p);
  p.inside = false; p.locationId = null;
  let bid = pt === 0 ? p.homeId : pt === 1 ? pid : null, th, off = null;
  if (bid !== null) {
    const b = world.buildings.get(bid);
    if (b === undefined) { bid = p.homeId; }
    const bb = world.buildings.get(bid);
    p.locationId = bid; bb.occupants.add(p); p.x = bb.door.x; p.y = bb.door.y;
    if (bb.open) { p.x += (tick * 7 + p.id * 3) % 9 - 4; world._gridAdd(p); } else p.inside = true;
    th = bid === p.homeId ? HOME_TH[act] : ACT_LABEL[act] + ' at ' + bb.name;
    if (act === A.visit && aux) { const f = world.people.get(aux); if (f) th = 'Visiting ' + f.firstName + ' at ' + bb.name; }
  } else if (pt === 2) {
    const hb = world.buildings.get(p.homeId); p.x = hb.door.x; p.y = hb.door.y; world._gridAdd(p); th = ACT_LABEL[act] + ' nearby';
  } else {
    const di = pt === 3 ? pid : pid >> 3, dk = ctx.destKeys[di]; off = 'offmap:' + dk; p.x = ctx.gwx; p.y = ctx.gwy;
    th = pt === 4 ? MODE_VERB[pid & 7] + ' to ' + ctx.destName[di] : ACT_LABEL[act] + ' (' + ctx.destName[di] + ')';
    if (pt === 4 && aux === 1) th = MODE_VERB[pid & 7] + ' home from ' + ctx.destName[di];
  }
  if (act === A.goal && rt.goalLabel) th = rt.goalLabel;
  rt.act = act; rt.cat = CATS.indexOf(ACT_CAT[act]); rt.off = off; rt.since = tick; rt.dow = world.time.dow; rt.pt = pt; rt.pid = pid;
  p.thought = th; p.lastAction = ACTS[act][0];
  if (bid !== null && world._handlers.get('arrive') !== undefined && world._handlers.get('arrive').length) world.emit('arrive', { person: p, buildingId: bid });
}

/** true when building bid is not a venue with hours, or is open now (hours from the pack venue template, incl. business trims). */
function venueOpenNow(world, bid, ticksAhead = 0) {
  const b = world.buildings.get(bid), v = b && b.lf; if (!v || !v.template) return true;
  const t = world.time; if (!world.pack.venues[v.template] || !world.pack.venues[v.template].hours) return true;
  return (iv => isOpenAt(iv, t.hour + t.minute / 60) && isOpenAt(iv, Math.min(23.9, t.hour + t.minute / 60 + ticksAhead / 6) - 0.01))(openingsFor(world.pack, v, t.dow, t.bankHoliday));
}

const SLOT = { tick: 0, until: 0, act: '', ptype: 0, pid: 0 };
export function wake(world, ctx, p) {
  const rt = p.ext.rt, tick = world.tick;
  let pl = rt.plan, i = rt.pi;
  if (pl[i * STRIDE + 1] === A.build) {
    const D = world.calendar.dayIdxOf(tick);
    pl = rt.plan = buildPlan(ctx, p, D, tick); i = rt.pi = 0;
  }
  let o = i * STRIDE, act = pl[o + 1], pt = pl[o + 2], pid = pl[o + 3], aux = pl[o + 4];
  const nt = pl[o + STRIDE];
  const gs = world.sys.goals;
  if (gs !== undefined && gs.query && gs.query.override) {
    const sl = SLOT; sl.tick = tick; sl.until = nt; sl.act = ACTS[act][0]; sl.ptype = pt; sl.pid = pid; // one reused slot object (override only reads it): wake runs ~10x per person-day
    let ov = gs.query.override(p, sl);
    // goal-driven visits to a venue (coffee with a friend, club meeting) must respect its opening hours (no 03:30 cafe customers): a closed venue means the goal step waits, the plan slot stands
    if (ov && ov.ptype === 1 && ov.pid != null && !venueOpenNow(world, ov.pid, nt - tick)) ov = null;
    if (ov) { act = A.goal; pt = ov.ptype ?? pt; pid = ov.pid ?? pid; aux = ov.aux || 0; rt.goalLabel = ov.label || 'Pursuing a goal'; }
  }
  enter(world, ctx, p, rt, act, pt, pid, aux, tick);
  rt.pi = i + 1;
  world.sched.schedule(p, nt);
}

function initPerson(world, ctx, p) {
  const rt = p.ext.rt = { life: makeLife(world, ctx, p), plan: [], pi: 0, wk: null, wc0: null, wc1: null, act: A.sleep, cat: 0, off: null, since: -1, dow: 0, seg: ctx.segIdx[p.ext.pop.seg], adult: world.ageOf(p) >= 16, pt: 0, pid: 0, goalLabel: '', sickDay: -1 };
  const D = world.calendar.dayIdxOf(world.tick), hb = world.buildings.get(p.homeId);
  p.locationId = hb.id; hb.occupants.add(p); p.x = hb.door.x; p.y = hb.door.y; p.inside = true;
  const w0 = hourToTick(world.calendar, D, 0) ; // everyone is in bed at the very start
  const first = Math.max(world.tick + 1, hourToTick(world.calendar, D, 0));
  rt.plan = [first, A.sleep, 0, 0, 0, Math.max(first + 6, hourToTick(world.calendar, D, ctx.wakeHour(p, D))), A.build, 0, 0, 0];
  rt.pi = 0; p.wake = first; p.thought = 'Asleep at home'; p.lastAction = 'sleep';
}

export default {
  name: 'routine', version: '1.0.0',
  commands: {
    // life/housing hooks: 'routine.init' gives a person created mid-run (newborn, arrival) a routine record; 'routine.rehome' rebuilds habits after a move or life-stage change.
    'routine.init': (world, a) => { const p = world.people.get(a.pid); if (p && p.alive && p.ext.pop && !p.ext.rt) initPerson(world, world.rtx, p); },
    'routine.rehome': (world, a) => {
      const p = world.people.get(a.pid); if (!p || !p.alive || !p.ext.pop) return; if (!p.ext.rt) { initPerson(world, world.rtx, p); return; }
      const rt = p.ext.rt; rt.life = makeLife(world, world.rtx, p); rt.adult = world.ageOf(p) >= 16; rt.seg = world.rtx.segIdx[p.ext.pop.seg]; world.cmd('routine.replan', { pid: p.id });
    },
    'routine.replan': (world, a) => { const p = world.people.get(a.pid); if (!p) return; const rt = p.ext.rt; rt.wk = null; rt.wc0 = rt.wc1 = null; const t = world.tick; rt.plan = [t + 1, rt.plan[(rt.pi - 1 >= 0 ? rt.pi - 1 : 0) * STRIDE + 1], rt.pt, rt.pid, 0, t + 2, A.build, 0, 0, 0]; rt.pi = 0; world.sched.schedule(p, t + 1); },
    // W1-C housing hook: a person arrived (new Person) or moved house (p.homeId changed): (re)build habit-layer state around the new home.
    'routine.adopt': (world, a) => {
      const p = world.people.get(a.pid); if (!p || !p.alive || !p.ext.pop) return false;
      if (!p.ext.rt) { initPerson(world, world.rtx, p); p.wake = -2; world.sched.schedule(p, p.wake < 0 ? world.tick + 1 : p.wake); return true; }
      const rt = p.ext.rt; rt.life = makeLife(world, world.rtx, p);
      if (a.from != null && p.locationId === a.from) { const ob = world.buildings.get(a.from), nb = world.buildings.get(p.homeId); if (ob) ob.occupants.delete(p); if (p.cell >= 0) world._gridRemove(p); p.locationId = nb.id; nb.occupants.add(p); p.x = nb.door.x; p.y = nb.door.y; p.inside = true; }
      world.cmd('routine.replan', { pid: p.id }); return true;
    },
    'routine.insert': (world, a) => {
      const p = world.people.get(a.pid); if (!p) return; const rt = p.ext.rt, now = world.tick; if (!rt) return; if (a.dest !== 'custody' && p.ext.cr && p.ext.cr.cust > now) return; /* in prison: nothing else takes them out of it */ const from = Math.max(a.from ?? now + 1, now + 1), to = Math.max(a.to, from + 1);
      const ent = []; for (let i = 0; i < rt.plan.length; i += STRIDE) ent.push(rt.plan.slice(i, i + STRIDE));
      const cur = rt.pi - 1, keep = ent.filter((e, i) => i >= Math.max(0, cur) && e[0] < from), after = ent.filter((e) => e[0] >= to);
      let st = null; for (const e of ent) if (e[0] <= to) st = e; // state active at `to` resumes
      const pt = a.ptype ?? 1, pid = pt === 1 ? a.bid : pt === 3 ? world.rtx.destKeys.indexOf(a.dest) : 0;
      rt.goalLabel = a.label || 'Pursuing a goal';
      const out = [...keep, [from, A.goal, pt, pid, 0]];
      if (st && st[1] !== A.build && !(after.length && after[0][0] === to)) out.push([to, st[1], st[2], st[3], st[4]]);
      out.push(...after);
      if (!out.some((e) => e[1] === A.build && e[0] >= to)) out.push([to, A.build, 0, 0, 0]); // a plan must end in a rebuild marker (life/health insert appointments and funerals)
      rt.plan = out.flat(); rt.pi = keep.length ? 0 : 0; rt.pi = Math.max(0, out.findIndex((e) => e[0] > now)); world.sched.schedule(p, out[rt.pi][0]);
    },
  },
  query: {
    now: (p) => { const rt = p.ext.rt; return rt ? { act: ACTS[rt.act][0], cat: CATS[rt.cat], off: rt.off, loc: p.locationId, label: p.thought } : null; },
    isOffmap: (p) => !!(p.ext.rt && p.ext.rt.off),
    plan: (p) => { const out = [], pl = p.ext.rt.plan; for (let i = 0; i < pl.length; i += STRIDE) out.push({ tick: pl[i], act: ACTS[pl[i + 1]][0], ptype: pl[i + 2], pid: pl[i + 3] }); return out; },
  },
  init(world, pack) {
    const ctx = world.rtx = makeCtx(world, pack);
    world._agendaPerson = (p) => wake(world, ctx, p);
    for (const p of world.living()) if (p.ext.pop) initPerson(world, ctx, p);
  },
};
