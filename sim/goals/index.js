// W1-B goals plugin ("goals"): drives x pressures x opportunities x contagion -> goals -> HTN-lite plans over ~55 primitive moves -> real activities (via the routine hook) with realistic failure,
// replanning and transformation; self-model beliefs; bounded template invention; groups and projects as collective agents. All outcomes are kernel events with `cause`.
// Routine hook (matches sim/systems/routine): world.sys.goals.query.override(person, {tick, until, act, ptype, pid}) -> null | {label, thought, ptype (1 building,2 street,3 off-map), pid, cat, ...}.
//   Returns goal steps due in the slot, group meetings, and ordinary social outings (friend / family / night out, on- and off-map). Never overrides sleep/work/commute/school.
// Commands:  goals.plant / goals.adopt / goals.abandon / goals.use_move / goals.respond / goals.inject_opportunity / groups.create / groups.join / groups.leave / groups.disband
import * as DRV from '../../content/larkfield/drives.js';
import * as GT from '../../content/larkfield/goal-templates.js';
import { TICKS_PER_DAY } from '../time.js';
import { Engine, EVENTS } from './engine.js';
import { computeFacts } from './facts.js';
import { MOVE } from './moves.js';
import { stepLabel, render } from './describe.js';
import { fmt } from './util.js';

const LIB = { ...DRV, ...GT };
const AD_HOC = { id: 'ad_hoc_move', verb: 'act', drive: ['novelty'], want: 'done', object: 'something', by: ['x'], gen: { base: 0 }, horizon: [1, 30], patience: 0.9, stakes: 0.3, mundane: true, habit: true, phrase: 'do something' };

export function createGoals(opts = {}) {
  let E = null;
  const eng = () => E;
  const plugin = {
    name: 'goals', version: '1.0.0', deps: [],
    eventTypes: Object.keys(EVENTS),   // registered in init (the loader validates `events.emits` before init runs)
    init(world, pack) {
      for (const [t, payload] of Object.entries(EVENTS)) world.registerEventType(t, { payload, template: t });
      E = new Engine(world, pack || {}, LIB, opts); E.addTemplate({ ...AD_HOC });
      const bad = E.methods.validateAll(E.tplList.filter((t) => t.id !== 'ad_hoc_move')); if (bad.length) throw new Error('goals: bad methods: ' + bad.slice(0, 5).join('; '));
      world.goals = E;   // debug/tools handle (not a cross-system write path)
      E.seedPeople();
      world.archiveHooks.push((p) => { E.S.ps.delete(p.id); }); // departed people: drop per-person goal state (kernel/archive.js)
    },
    clocks: { hour: () => E.hourly(), day: () => E.daily(), year: () => E.yearly() },
    serialize() { return E.serialize(); },
    deserialize(state) { E.deserialize(state); },
    query: {
      goalsOf: (id) => { const s = E.S.ps.get(id); return s ? s.goals.map((g) => E.view(E.S.goals.get(g))) : []; },
      describe: (id) => { const s = E.S.ps.get(id); return s ? s.goals.map((g) => E.line(E.S.goals.get(g))) : []; },
      goal: (gid) => { const g = E.S.goals.get(gid); return g ? { ...E.view(g), history: g.log.slice(), steps: g.steps.map((x) => ({ move: x.move, v: x.v, state: x.state, note: x.note, target: typeof x.target === 'number' ? x.target : null })) } : null; },
      groupsOf: (id) => { const s = E.S.ps.get(id); return s ? s.groups.map((g) => E.groupView(E.S.groups.get(g))) : []; },
      group: (gid) => { const g = E.S.groups.get(gid); return g ? E.groupView(g, true) : null; },
      groups: (q = {}) => [...E.S.groups.values()].filter((g) => (!q.status || g.status === q.status) && (!q.kind || g.kind === q.kind) && (q.all || g.status !== 'dissolved')).map((g) => E.groupView(g)),
      recruiting: (kind) => [...E.S.groups.values()].filter((g) => (g.status === 'active' || g.status === 'forming') && (!kind || g.kind === kind) && E.groups.size(g) < E.groups.kinds[g.kind].cap).map((g) => E.groupView(g)),
      projects: () => [...E.S.projects.values()].map((p) => ({ ...p })),
      selfModel: (id) => { const s = E.S.ps.get(id); return s ? E.selfm.describe(s) : []; },
      drives: (id) => { const s = E.S.ps.get(id); return s && s.dw ? E.drives.map((d, i) => [d.id, +s.dw[i].toFixed(2)]) : []; },
      pressures: (id) => { const s = E.S.ps.get(id); return s ? Object.keys(s.press).map((k) => [k, +E.press(s, k, E.world.tick).toFixed(2)]).filter((x) => x[1] > 0.05) : []; },
      traces: (id) => { const s = E.S.ps.get(id); return s ? s.trace.slice() : []; },
      nextStep: (id) => { const s = E.S.ps.get(id); return s && s.next ? { ...s.next } : null; },
      activeKinds: () => E.activeKinds(),
      stats: () => E.statsView(),
      templates: () => E.tplList.filter((t) => !t.retired).map((t) => ({ id: t.id, phrase: E.phrase(t.id), invented: !!t.invented, mundane: !!t.mundane, fitness: +E.fitness(t.id).toFixed(2) })),
      opportunities: () => E.S.opps.filter((o) => o.until > E.world.tick).map((o) => ({ ...o })),
      getChoices: (id) => E.getChoices(id),
      override: (p, slot) => E.override(p, slot),
      requests: (id) => E.S.requests.filter((r) => r.to === id).map((r) => ({ ...r })),
    },
    commands: {
      'goals.plant': (w, a) => E.cmdPlant(a, 'plant'), 'goals.adopt': (w, a) => E.cmdPlant(a, 'adopt'),
      'goals.abandon': (w, a) => { const g = E.S.goals.get(a.goal); if (!g) return false; E.abandon(g, a.why || 'changed my mind'); return true; },
      'goals.use_move': (w, a) => E.cmdMove(a), 'goals.respond': (w, a) => E.cmdRespond(a),
      'goals.inject_opportunity': (w, a) => E.cmdOpportunity(a),
      'groups.create': (w, a) => E.cmdGroupCreate(a), 'groups.join': (w, a) => E.cmdGroupJoin(a), 'groups.leave': (w, a) => { const g = E.S.groups.get(a.group); if (!g) return false; E.groups.removeMember(g, a.person, a.why || 'left'); return true; },
      'groups.disband': (w, a) => { const g = E.S.groups.get(a.group); if (!g) return false; E.groups.dissolve(g, a.why || 'disbanded'); return true; },
    },
    serializeVersion: 1,
  };
  return plugin;
}
export default createGoals();
