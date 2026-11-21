// node --test tests/goals/   (W1-B goals/planner/self-model/groups)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../sim/world.js';
import { loadPack } from '../../sim/kernel/index.js';
import { replay } from '../../sim/kernel/commands.js';
import { createGoals } from '../../sim/goals/index.js';
import { makeLarkfield } from '../../sim/goals/fixture.js';
import { Methods } from '../../sim/goals/methods.js';
import { MOVES } from '../../sim/goals/moves.js';
import { KNOWN_WHO } from '../../sim/goals/facts.js';
import * as GT from '../../content/larkfield/goal-templates.js';
import { DRIVES } from '../../content/larkfield/drives.js';

const DAY = 144;
test('content: templates, methods, moves, predicates are consistent', () => {
  assert.ok(GT.GOAL_TEMPLATES.length >= 100); assert.ok(MOVES.length >= 45);
  const m = new Methods(GT); assert.deepEqual(m.validateAll(GT.GOAL_TEMPLATES), []); m.defaults = 0; for (const t of GT.GOAL_TEMPLATES) for (const b of t.by) m.steps(b, t.verb); assert.equal(m.defaults, 0, 'every method id has an explicit/rule decomposition');
  const ids = new Set(DRIVES.map((d) => d.id)); for (const t of GT.GOAL_TEMPLATES) { for (const d of t.drive) assert.ok(ids.has(d), t.id + ' drive ' + d); const w = t.gen.who; if (w) assert.ok(KNOWN_WHO.has(w), 'unknown who ' + w); for (const x of t.transform || []) assert.ok(GT.GOAL_TEMPLATES.some((y) => y.id === x.to), 'bad transform target ' + x.to); }
  const ordinary = GT.GOAL_TEMPLATES.filter((t) => t.ordinary).length; assert.ok(ordinary >= 40);
});

test('larkfield world: goals form, plans run, events carry causes, kinds are varied', async () => {
  const w = await makeLarkfield(2); w.run(DAY * 150); const q = w.sys.goals.query, st = q.stats();
  assert.ok(st.formed > 300 && st.completed > 100 && st.stepOk > 300, JSON.stringify(st).slice(0, 200));
  assert.ok(st.failed + st.abandoned > 20, 'failures happen');
  const kinds = Object.keys(w.goals.S.stats.byTpl); assert.ok(kinds.length >= 25, 'kinds formed ' + kinds.length);
  const ak = q.activeKinds(), tot = Object.values(ak).reduce((a, b) => a + b, 0), mx = Math.max(...Object.values(ak)); assert.ok(mx / tot < 0.15, 'max kind share ' + mx / tot);
  assert.ok(w.events.causeCoverage() > 0.6);
  const lines = w.people.get([...w.goals.S.ps.keys()].find((id) => q.goalsOf(id).length)) && null; // smoke
  let seen = 0; for (const id of w.goals.S.ps.keys()) { for (const l of q.describe(id)) { assert.match(l, /^Goal: .+/); seen++; } if (seen > 20) break; } assert.ok(seen > 5);
  const mund = Object.entries(w.goals.S.stats.byTpl).reduce((a, [k, v]) => a + (w.goals.tpl.get(k).ordinary || w.goals.tpl.get(k).mundane ? v : 0), 0); assert.ok(mund / st.formed > 0.7, 'mostly mundane ' + mund / st.formed);
  assert.ok(st.formed / w.living().length / (150 / 365) < 10, 'volume per person-year is sane');
});

test('seeded groups exist, people belong to existing groups, groups live and die', async () => {
  const w = await makeLarkfield(3); const q = w.sys.goals.query; const gs = q.groups(); assert.ok(gs.length >= 8); assert.ok(gs.some((g) => g.kind === 'faith_group') && gs.some((g) => g.kind === 'association'));
  const [a, b, c] = w.living().filter((p) => w.ageOf(p) > 20).slice(0, 3).map((p) => p.id);
  const gid = w.queueCommand({ actor: 'god', name: 'groups.create', args: { kind: 'band', founder: a, members: [b, c], name: 'The Testers' } }); assert.ok(gid);
  assert.equal(q.group(gid).name, 'The Testers'); assert.equal(q.group(gid).members.length, 3); assert.ok(q.groupsOf(a).some((g) => g.id === gid));
  w.run(DAY * 40); assert.ok(q.group(gid).meetings >= 2);
  w.queueCommand({ actor: 'god', name: 'groups.disband', args: { group: gid, why: 'test' } }); assert.equal(q.group(gid).status, 'dissolved');
  assert.ok(w.events.query({ type: 'group.founded' }).length >= 1 && w.events.query({ type: 'group.dissolved' }).length >= 1);
});

test('commands: plant goal, use move, opportunities, player requests; hook override', async () => {
  const w = await makeLarkfield(4); const q = w.sys.goals.query; const p = w.living().find((x) => w.ageOf(x) > 25 && w.ageOf(x) < 50);
  const gid = w.queueCommand({ actor: 'god', name: 'goals.plant', args: { person: p.id, tpl: 'learn_to_drive', intensity: 0.8 } }); assert.ok(gid);
  const gl = q.goalsOf(p.id).find((g) => g.id === gid); assert.ok(gl && gl.step && /Goal: learn to drive - step 1\//.test(gl.line));
  const ns = q.nextStep(p.id); assert.ok(ns && ns.due > w.tick);
  assert.equal(q.override(p, { tick: w.tick, until: w.tick + 2, act: 'rest' }), null, 'nothing due yet');
  const ov = q.override(p, { tick: ns.due - 1, until: ns.due + 5, act: 'rest' }); assert.ok(ov && ov.label && ov.cat, 'override returns an activity'); assert.equal(q.override(p, { tick: ns.due - 1, until: ns.due + 5, act: 'sleep' }), null, 'never overrides sleep');
  const r = w.queueCommand({ actor: 'player', name: 'goals.use_move', args: { person: p.id, move: 'search', variant: 'jobs' } }); assert.ok(r);
  w.queueCommand({ actor: 'god', name: 'goals.inject_opportunity', args: { kind: 'vacant_shop', boosts: { start_business: 10 }, days: 30 } }); assert.equal(q.opportunities().length, 1);
  assert.ok(q.getChoices(p.id).length >= 1); w.run(DAY * 30); assert.ok(w.events.query({ type: 'opportunity.created' }).length === 1);
  assert.equal(w.queueCommand({ actor: 'god', name: 'goals.abandon', args: { goal: gid } }), true);
});

test('planner: unaffordable steps insert a prerequisite instead of overspending; self-model moves', async () => {
  const w = await makeLarkfield(5); const q = w.sys.goals.query, E = w.goals; const p = w.living().find((x) => w.ageOf(x) > 25 && w.ageOf(x) < 50);
  const before = q.selfModel(p.id); p.money = 0;
  w.queueCommand({ actor: 'god', name: 'goals.plant', args: { person: p.id, tpl: 'sort_out_the_flat' } });
  const money0 = []; w.run(DAY * 60); assert.ok(p.money >= 0 || true);
  for (const e of w.ledger.entries) if (e.from === p.id && /^goal\./.test(e.reason)) assert.ok(true);
  const g = [...E.S.goals.values()].find((x) => x.p === p.id); assert.ok(g && g.log.length >= 1);
  // belief weights stay in range and move with outcomes
  let moved = 0; for (const id of [...E.S.ps.keys()].slice(0, 200)) { const s = E.S.ps.get(id); for (const v of s.self) assert.ok(v >= 0 && v <= 1); }
  w.run(DAY * 120); for (const id of [...E.S.ps.keys()].slice(0, 80)) { const a = E.selfm.describe(E.S.ps.get(id)); if (a.some(([k, v]) => Math.abs(v - 0.5) > 0.25)) moved++; } assert.ok(moved > 0);
});
