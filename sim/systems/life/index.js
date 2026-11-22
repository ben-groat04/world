// LIFE plugin (W1-D): the life course. Partnership formation (apps, friends, work, chance, nights out, uni, community, family introductions; many partners are off-map and may move in),
// cohabitation / engagement / marriage, breakups and divorce (with household and friendship ripples), fertility, pregnancy and births, parenting, school stages, leaving home and boomeranging,
// retirement, off-map kin ageing/death and informal caring.   Health, deaths and bereavement live in sim/systems/health (plugin 'health', which depends on this one).
//
// PERSON  p.ext.life = { or (S|G|B|O orientation), mar (never|married|divorced|widowed|separated), part:{id (person id | 'm<n>' off-map), on, st (dating|cohab|engaged|married), lat (living apart), since, how, ev},
//                        nPart, ex, parity, firstCohab, firstMar, firstBirth, lastBirth, preg:{t0,due,father,fOn}|null, desire, away (left the sim), left, caring:{for,hrs,since,kind}|null, ... }
//   p.romance {partnerId, status} and p.family.spouseId mirror the live-in partner for the other packages (money, goals).  GLOBAL  world.lf.life = {q (scheduled work), rec (report records), stats}.
// QUERY  world.sys.life.query: partner(pid) status(pid) careLoad(pid) summary(pid) stats() records()
// COMMANDS  life.matchmake{a,b} life.askOut{pid,target} life.propose{pid} life.breakUp{pid} life.moveIn{pid} life.marry{pid} life.tryForBaby{pid} life.babyBoom{pct,months} life.adopt{pid}
// INTENTS to housing (optional; life falls back to its own move code when absent): housing.moveTogether{a,b} -> {ok} ; housing.leaveHome{pid,reason,dependants?,dest?} -> {ok} ; housing.separate{leaver,stayer} -> {ok}
//   housing.returnHome{pid} ; housing.inherit{from,heirs} ; labour.assign{pid} -> bool.   EVENTS: life.* (couple cohabit engaged marriage breakup divorce pregnant miscarriage birth move_in move_out leave_home boomerang
//   school graduate retire kin_death funeral caring_start caring_end death will) — all carry `cause` where one exists.
import { dayOfMonth, slotDay } from '../../util.js';
import { registerEvents, runQueue, HANDLERS, later, months, ageOf, fullName, clamp, rec, bump, metro, hhOf, tieOf } from './util.js';
import { initLife, lifeFor } from './init.js';
import { matchmaking, coupleStep, relHandlers, formCouple, endRel, engage, wedding, cohabit, wantsSex, accepts, makeOffPartner, seekRate } from './rels.js';
import { monthlyFertility, fertHandlers } from './fert.js';
import { septemberTransitions, stageHandlers, leaveHandlers, leavingHome, boomerangScan, retirement, preschool } from './stages.js';
import { kinMonthly, kinHandlers, careScan } from './kin.js';

Object.assign(HANDLERS, relHandlers, fertHandlers, stageHandlers, leaveHandlers, kinHandlers);

const S = 'string', N = 'number', B = 'boolean';
export const LIFE_EVENTS = [
  ['life.couple', 'Two people started seeing each other (on-map or an off-map partner)', { how: S, on: B, name: S }],
  ['life.cohabit', 'A couple began living together', { how: S, on: B }],
  ['life.engaged', 'A couple got engaged', { after: N }],
  ['life.marriage', 'A wedding (civil or religious)', { kind: S, how: S, first: B }],
  ['life.breakup', 'A relationship ended', { years: N, kind: S }],
  ['life.divorce', 'A marriage ended', { years: N, kind: S }],
  ['life.pregnant', 'A pregnancy became known (about 12 weeks)', { weeks: N, due: N }],
  ['life.miscarriage', 'An early pregnancy loss', { weeks: N }],
  ['life.birth', 'A baby was born to a resident', { baby: S, sex: S, weight: N, parity: N, marital: S, twins: B }],
  ['life.move_in', 'Someone joined a household or the neighbourhood (partner, boomerang)', { from: S, reason: S }],
  ['life.move_out', 'Someone left a household or the neighbourhood', { to: S, reason: S }],
  ['life.leave_home', 'A young adult left the parental home', { reason: S, age: N }],
  ['life.boomerang', 'A young adult moved back in with parents', { age: N, from: S }],
  ['life.school', 'A school stage changed (secondary, college, apprenticeship, university...)', { stage: S }],
  ['life.graduate', 'Graduated from university', { course: S }],
  ['life.retire', 'Retired from work', { age: N, was: S }],
  ['life.kin_death', 'An off-map relative died', { rel: S, age: N, name: S, cause: S }],
  ['life.death', 'A resident died (actors[0] = the dead person, others = mourners)', { cause: S, age: N }],
  ['life.funeral', 'A funeral was held / attended', { offmap: B }],
  ['life.caring_start', 'Someone became an informal carer', { rel: S, hrs: N, offmap: B }],
  ['life.caring_end', 'Informal caring ended', { why: S, months: N }],
  ['life.will', 'A will / estate: heirs named for money and housing', { heirs: 'object', estate: N }],
  ['life.ask_out', 'A player/NPC asked someone out', { ok: B }],
];

function ensure(w, people) { const rng = w.rngFor('life.init'); for (const p of people) if (!p.ext.life && p.ext.pop) lifeFor(w, p, rng); }

/** person-years by sex and 5-year age band (and married / unmarried adults): denominators for the life report's rates */
function accumulate(w, people) {
  const py = w.lf.life.py || (w.lf.life.py = {}), f = 1 / 12;
  for (const p of people) {
    const a = ageOf(w, p), k = p.sex + Math.min(19, Math.floor(a / 5)); py[k] = (py[k] || 0) + f;
    if (a >= 16) { const L = p.ext.life, m = L && L.part && L.part.st === 'married'; const kk = m ? 'married' : 'unmarried'; py[kk] = (py[kk] || 0) + f; if (L && L.part && L.part.on && !L.part.lat) py.livingCouple = (py.livingCouple || 0) + f; py.adult = (py.adult || 0) + f; }
  }
}
function monthly(w) {
  const rng = w.rngFor('life.month'), people = w.living();
  ensure(w, people);
  accumulate(w, people);
  matchmaking(w, rng, people); monthlyFertility(w, rng, people); // (conceptions are already delayed 1-27 days)
  boomerangScan(w, rng); if (!w.commands.has('labour.retire')) retirement(w, rng, people); preschool(w, rng, people);
  kinMonthly(w, rng); careScan(w, rng, people);
}
let SUBS = new WeakSet();
function subscribe(w) {
  if (SUBS.has(w) || !w.events.registry.has('goal.effect')) return; SUBS.add(w);
  w.on('goal.effect', (ev) => {
    const p = w.people.get(ev.actors[0]); if (!p || !p.alive || !p.ext.life) return; const want = ev.payload.want, L = p.ext.life;
    if ((want === 'in_relationship' || want === 'date') && !L.part && ageOf(w, p) >= 17) L.boost = w.tick + months(2); // goal effort raises the odds; the relationship itself comes from the dating model
    else if (want === 'committed' && L.part && L.part.st !== 'married' && L.part.st !== 'engaged') later(w, 144 * 5, 'rel.engage', { a: p.id });
    else if (want === 'moved_on') L.boost = w.tick + months(2);
  });
}

function partnerView(w, p) {
  const L = p.ext.life; if (!L || !L.part) return null; const pt = L.part;
  if (pt.on) { const o = w.people.get(pt.id); return { kind: 'on', id: pt.id, name: o ? fullName(o) : '?', st: pt.st, lat: pt.lat, since: pt.since, how: pt.how }; }
  const m = metro(w, pt.id); return { kind: 'off', id: pt.id, name: m ? m.name : '?', st: pt.st, lat: pt.lat, since: pt.since, how: pt.how };
}

export function createLife() {
  let W = null;
  const plugin = {
  name: 'life', version: '1.0.0', deps: [],
  init(world) {
    W = world; registerEvents(world, LIFE_EVENTS);
    if (!world.stateKeys.includes('lf')) world.stateKeys.push('lf');
    initLife(world);
    world.lf.life.away = [];
  },
  clocks: {
    hour: (w) => runQueue(w),
    day: (w) => { subscribe(w); const t = w.time; ensure(w, w.living()); /* arrivals/new flatmates get life state the day they appear, not at the next month tick */ if (t.month === 8 && t.dom === 1) septemberTransitions(w, w.living());
      const dom = dayOfMonth(w), sl = w.living().filter((p) => p.ext.life && slotDay(p.id, dom)); if (sl.length) { const r = w.rngFor('life.stagger', w.tick); coupleStep(w, r, sl); leavingHome(w, r, sl); } }, // couple dynamics and leaving home: each person on their own day of the month
    month: (w) => monthly(w),
  },
  query: {
    partner: (pid) => { const p = W.people.get(pid); return p ? partnerView(W, p) : null; },
    status: (pid) => { const p = W.people.get(pid); if (!p || !p.ext.life) return null; const L = p.ext.life; return { orientation: L.or, legal: L.mar, partnered: !!L.part, living_together: !!L.part && !L.part.lat, parity: L.parity, pregnant: !!L.preg, careing: !!L.caring, away: !!L.away }; },
    careLoad: (pid) => { const p = W.people.get(pid); return p && p.ext.life && p.ext.life.caring ? { hrs: p.ext.life.caring.hrs, kind: p.ext.life.caring.kind, since: p.ext.life.caring.since } : null; },
    stats: () => ({ ...W.lf.life.stats }),
    records: () => W.lf.life.rec,
    summary: (pid) => { const p = W.people.get(pid); if (!p || !p.ext.life) return []; const L = p.ext.life, out = []; const pv = partnerView(W, p); if (pv) out.push(`${pv.st}${pv.lat ? ' (living apart)' : ''} with ${pv.name}`); else out.push(L.mar === 'widowed' ? 'widowed' : L.mar === 'divorced' ? 'divorced' : 'single'); if (L.parity) out.push(`${L.parity} child${L.parity > 1 ? 'ren' : ''}`); if (L.preg) out.push('expecting'); if (L.caring) out.push('carer'); return out; },
  },
  commands: {
    'life.adopt': (w, a) => { const p = w.people.get(a.pid); if (p && p.ext.pop && !p.ext.life) { lifeFor(w, p, w.rngFor('life.init')); return true; } return false; },
    'life.matchmake': (w, a) => {
      const x = w.people.get(a.a), y = a.b != null ? w.people.get(a.b) : null; if (!x || !x.alive || x.ext.life.part) return false;
      if (y && y.alive && !y.ext.life.part) { if (x.ext.life.or === 'S' && x.sex === y.sex) x.ext.life.or = 'B'; if (y.ext.life.or === 'S' && x.sex === y.sex) y.ext.life.or = 'B'; formCouple(w, x, y, 'introduced (god)'); return true; }
      if (y) return false;
      later(w, 1, 'rel.start', { a: x.id, b: null, how: 'matchmake' }); return true;
    },
    'life.askOut': (w, a, cmd) => {
      const x = w.people.get(a.pid), t = typeof a.target === 'number' ? w.people.get(a.target) : null; if (!x || !x.alive || x.ext.life.part) return { ok: false, why: 'taken' };
      if (!t || !t.alive || t.ext.life.part) { w.emit('life.ask_out', { actors: [x.id].concat(t ? [t.id] : []), salience: 0.2, payload: { ok: false } }); return { ok: false, why: 'unavailable' }; }
      const rng = w.rngFor('life.askout', w.tick, x.id), rl = w.getRel(x, t);
      const fit = accepts(t.ext.life, t.sex, x.sex) && accepts(x.ext.life, x.sex, t.sex);
      const gap = Math.abs(ageOf(w, x) - ageOf(w, t));
      const p = fit ? clamp(0.22 + 0.4 * (rl.attraction || 0) + 0.3 * (rl.affinity || 0) + 0.25 * (rl.familiarity || 0) - gap / 40, 0.02, 0.85) : 0.01;
      const ok = rng.chance(p); w.emit('life.ask_out', { actors: [x.id, t.id], salience: 0.3, payload: { ok } });
      if (ok) formCouple(w, x, t, 'asked out'); else { rl.attraction = clamp((rl.attraction || 0) - 0.1, 0, 1); }
      return { ok, p };
    },
    'life.propose': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.life.part) return { ok: false }; const pt = p.ext.life.part; if (pt.st === 'engaged' || pt.st === 'married') return { ok: false }; const rng = w.rngFor('life.propose', w.tick, p.id); const prob = clamp(0.4 + 0.1 * Math.min(4, (w.tick - pt.since) / w.calendar.ticksPerYear) + (pt.lat ? -0.1 : 0.15), 0.1, 0.9); const ok = rng.chance(prob); if (ok) engage(w, p.id); return { ok, p: prob }; },
    'life.marry': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.life.part || p.ext.life.part.st !== 'engaged') return false; wedding(w, p.id); return true; },
    'life.breakUp': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.life.part) return false; endRel(w, p.id, 'player'); return true; },
    'life.moveIn': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.life.part || !p.ext.life.part.lat) return false; cohabit(w, p.id, true); return true; },
    'life.tryForBaby': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || p.sex !== 'F' || p.ext.life.preg) return false; p.ext.life.desire = Math.min(1, p.ext.life.desire + 0.5); later(w, 144 * 2, 'conceive', { m: p.id }); return true; },
    'life.babyBoom': (w, a) => { const L = w.lf.life; L.boom = w.tick + months(a.months ?? 12); L.boomPct = a.pct ?? 0.6; return true; },
    'life.setRate': (w, a) => { const L = w.lf.life; if (a.fert != null) L.fertScale = a.fert; if (a.seek != null) L.seekScale = a.seek; return true; },
  },
  affordances(p) {
    const w = W; if (!w || !p.ext || !p.ext.life) return null; const L = p.ext.life, age = ageOf(w, p), out = [];
    if (age >= 17 && !L.part) out.push({ id: 'life.ask_out:' + p.id, verb: 'ask_out', actor: p.id, effects: [], cost: { time: 2, social: 1 }, tags: ['romance'], cmd: 'life.askOut' });
    if (L.part && L.part.lat) out.push({ id: 'life.move_in:' + p.id, verb: 'move_in_together', actor: p.id, effects: [{ kind: 'cmd', name: 'life.moveIn', args: { pid: p.id } }], cost: { time: 6 }, tags: ['romance', 'home'] });
    if (L.part && (L.part.st === 'cohab' || L.part.st === 'dating')) out.push({ id: 'life.propose:' + p.id, verb: 'propose', actor: p.id, effects: [{ kind: 'cmd', name: 'life.propose', args: { pid: p.id } }], cost: { time: 2, social: 1 }, tags: ['romance'] });
    if (L.part) out.push({ id: 'life.break_up:' + p.id, verb: 'break_up', actor: p.id, effects: [{ kind: 'cmd', name: 'life.breakUp', args: { pid: p.id } }], cost: { time: 2, social: 2 }, tags: ['romance'] });
    if (L.part && p.sex === 'F' && age >= 18 && age < 45 && !L.preg) out.push({ id: 'life.try_for_baby:' + p.id, verb: 'try_for_baby', actor: p.id, effects: [{ kind: 'cmd', name: 'life.tryForBaby', args: { pid: p.id } }], cost: { time: 1 }, tags: ['family'] });
    return out;
  },
};
  return plugin;
}
export default createLife();
