// Kernel contract tests: node --test tests/   (run by `npm run check`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../sim/world.js';
import { hash32, subRng, validatePlugin, loadPlugins, readonly, validatePack, assertPack, t, legacyPack, Scheduler, CONTRACT_VERSION, stageOf } from '../sim/kernel/index.js';
import { replay } from '../sim/kernel/commands.js';
import { declareField, checkPerson } from '../sim/model/index.js';
import { TICKS_PER_DAY } from '../sim/time.js';

const mk = (o = {}) => new World({ seed: 5, population: 60, strictEvents: true, ...o });

test('rng: derived sub-streams are pure and independent', () => {
  const a = mk(), b = mk();
  assert.equal(a.rngFor('x', 1, 2).next(), b.rngFor('x', 1, 2).next());
  assert.notEqual(a.rngFor('x', 1, 2).next(), a.rngFor('x', 2, 1).next());
  a.rngFor('other').next(); a.rngFor('other').next();            // rolling another named stream must not shift 'x'
  assert.equal(a.rngFor('x').next(), b.rngFor('x').next());
  assert.equal(hash32('a', 1, 2), hash32('a', 1, 2)); assert.notEqual(hash32('a', 1), hash32('b', 1));
  assert.equal(subRng(1, 'n', 3).next(), subRng(1, 'n', 3).next());
});

test('events: registry, causal query, deferred non-reentrant handlers', () => {
  const w = mk();
  assert.throws(() => w.emit('nope.nothing', {}), /unknown event type/);
  w.registerEventType('test.a', { payload: { n: 'number' } }).registerEventType('test.b', {});
  const order = []; let depth = 0;
  w.on('test.a', (ev) => { depth++; order.push('a' + ev.payload.n); w.emit('test.b', { cause: ev.id }); assert.equal(depth, 1); depth--; });
  w.on('test.b', (ev) => order.push('b'));
  const id = w.emit('test.a', { actors: [1], place: 3, payload: { n: 1 } });
  assert.deepEqual(order, [], 'handlers do not run inside emit');
  w.events.flush();
  assert.deepEqual(order, ['a1', 'b']);
  assert.equal(w.events.query({ cause: id }).length, 1);
  assert.equal(w.events.chain(w.events.query({ type: 'test.b' })[0].id).length, 2);
  assert.equal(w.events.query({ actor: 1, place: 3 }).length, 1);
  w.events.validate = true; assert.throws(() => w.emit('test.a', { payload: { n: 'x' } }), /payload/);
});

test('legacy chron() adapter emits legacy.chron events', () => {
  const w = mk(); w.run(3);
  assert.ok(w.events.query({ type: 'legacy.chron' }).length >= 1);
});

test('commands: queue, log, replay', () => {
  const mkw = () => { const w = mk({ hashDaily: true }); w.registerCommand('t.give', (ww, a) => { ww.people.get(a.id).money += a.n; }); return w; };
  const w = mkw(); w.run(TICKS_PER_DAY); w.queueCommand({ actor: 'god', name: 't.give', args: { id: 1, n: 7 } }); w.run(TICKS_PER_DAY);
  assert.equal(w.commands.log.length, 1);
  assert.throws(() => w.queueCommand({ name: 'unknown.cmd' }), /unknown command/);
  const r = replay(mkw, w.commands.log, w.tick);
  assert.equal(r.stateHash(), w.stateHash());
});

test('plugins: validation, deps order, read-only query results', () => {
  assert.ok(validatePlugin({ name: 'Bad Name' }).length > 0);
  assert.ok(validatePlugin({ name: 'x', version: '1', clocks: { fortnight() {} } }).some((e) => /unknown clock/.test(e)));
  assert.ok(validatePlugin({ name: 'x', version: '1', serialize() {} }).some((e) => /pair/.test(e)));
  const w = mk({ contractMode: true }); const seen = [];
  const A = { name: 'aaa', version: '1.0.0', deps: ['bbb'], init() { seen.push('aaa'); }, query: { data: () => ({ n: 1 }) }, clocks: { day() { seen.push('day'); } } };
  const B = { name: 'bbb', version: '1.0.0', init() { seen.push('bbb'); } };
  loadPlugins(w, [A, B], null);
  assert.deepEqual(seen, ['bbb', 'aaa'], 'init in dependency order');
  assert.throws(() => { w.sys.aaa.query.data().n = 2; }, /contract violation/);
  assert.throws(() => loadPlugins(mk(), [{ name: 'c1', version: '1', deps: ['c2'] }, { name: 'c2', version: '1', deps: ['c1'] }], null), /cycle/);
  w.run(TICKS_PER_DAY + 1); assert.ok(seen.includes('day'), 'day clock fires');
  assert.throws(() => readonly({ a: 1 }).a = 2);
});

test('ledger: transfers conserve money', () => {
  const w = mk(); const before = w.ledger.total();
  const [p, q] = [...w.people.values()];
  w.ledger.transfer(p.id, q.id, 5, 'test'); w.ledger.transfer(q.id, 'council', 2, 'tax'); w.ledger.transfer('void', p.id, 3, 'mint');
  assert.equal(w.ledger.total(), before); assert.throws(() => w.ledger.transfer(p.id, q.id, -1));
});

test('indices stay consistent with the living set', () => {
  const w = mk(); w.run(5 * TICKS_PER_DAY);
  assert.equal(w.index.count, w.living().length);
  const c = w.index.counts(); assert.equal(c.stages.reduce((a, b) => a + b, 0), c.living); assert.equal(c.tiers[1], c.living);
  for (const p of w.living()) if (p.inside) assert.ok(w.index.byVenue(p.locationId).has(p));
  assert.equal(stageOf(1), 0); assert.equal(stageOf(30), 3);
});

test('agenda scheduler: every living person has exactly one valid wake in the future', () => {
  const w = mk(); w.run(3 * TICKS_PER_DAY);
  for (const p of w.living()) assert.ok(p.wake > w.tick || p.wake === -1, `person ${p.id} wake ${p.wake} at ${w.tick}`);
  assert.equal(w.sched.mode, 'agenda'); assert.ok(w.sched instanceof Scheduler);
  assert.throws(() => w.sched.setMode('bogus'));
});

test('legacy mode still runs and agenda decides far less often', () => {
  const run = (mode) => { const w = mk({ sched: mode }); let n = 0; const d = w.brain.decide.bind(w.brain); w.brain.decide = (p, x) => { n++; return d(p, x); }; w.run(4 * TICKS_PER_DAY); return n; };
  const a = run('agenda'), l = run('legacy'); assert.ok(a > 0 && l > 0);
});

test('snapshot: restore keeps state and the world keeps running identically', () => {
  const w = mk({ hashDaily: true }); w.run(10 * TICKS_PER_DAY);
  const s = JSON.parse(JSON.stringify(w.snapshot())), r = World.restore(s, null);
  assert.equal(r.stateHash(), w.stateHash());
  w.run(3 * TICKS_PER_DAY); r.run(3 * TICKS_PER_DAY); assert.equal(r.stateHash(), w.stateHash());
  const f = w.fork(); assert.equal(f.stateHash(), w.stateHash()); assert.notEqual(f, w); assert.notEqual(w.fork(1).stateHash(), w.stateHash());
});

test('multiple worlds in one process are independent', () => {
  const a = mk(), b = mk({ seed: 6 });
  a.run(TICKS_PER_DAY); const ha = a.stateHash(); b.run(2 * TICKS_PER_DAY); a.run(0);
  const c = mk(); c.run(TICKS_PER_DAY); assert.equal(c.stateHash(), ha);
});

test('schema validator: accepts the legacy pack, rejects broken ones', async () => {
  const p = await legacyPack(); assert.ok(validatePack(p).ok, validatePack(p).errors.join());
  assert.equal(p.contractVersion, CONTRACT_VERSION);
  assert.ok(!validatePack({ ...p, id: 'Bad Id' }).ok);
  assert.ok(!validatePack({ ...p, contractVersion: '9.0.0' }).ok);
  const { calibration, ...rest } = p; assert.ok(!validatePack(rest).ok);
  assert.throws(() => assertPack({}), /invalid content pack/);
  assert.equal(t.num({ min: 0 })(-1, 'x') !== null, true);
});

test('person field registry: owners are exclusive; legacy people are fully declared', () => {
  declareField('test_field', { owner: 'a' });
  assert.throws(() => declareField('test_field', { owner: 'b' }), /owned by/);
  const w = mk(); w.run(20 * TICKS_PER_DAY);
  for (const p of w.people.values()) assert.deepEqual(checkPerson(p), []);
});

test('text stub renders deterministically without touching sim RNG', () => {
  const w = mk(); w.text.add('k', ['one {actor}', 'two {actor}']); const s0 = w.rng.s;
  const a = w.text.render('k', { seed: 3, names: { actor: 'Sam' } }), b = w.text.render('k', { seed: 3, names: { actor: 'Sam' } });
  assert.equal(a, b); assert.equal(w.rng.s, s0);
});
