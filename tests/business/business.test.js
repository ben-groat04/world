// Business plugin tests: node --test tests/business/business.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLarkfieldWorld, restoreLarkfieldWorld } from '../../sim/larkfield.js';

const D = 144;
test('boots, runs 1 year under strictEvents, money invariant holds, no NaN in business accounts', () => {
  const w = createLarkfieldWorld(1, { strictEvents: true }); w.run(D * 365);
  const q = w.sys.business.query; assert.ok(q.list().length >= 25);
  assert.ok(w.ledger.invariant().ok, 'ledger conserved');
  for (const b of q.list()) if (b.status === 'trading') assert.ok(Number.isFinite(w.ledger.balance('b:' + b.bid)));
});
test('closing a business vacates the unit, renames the venue, fires venueChanged, and removes staff', () => {
  const w = createLarkfieldWorld(2, { strictEvents: true }); w.run(D * 40);
  const q = w.sys.business.query, tgt = q.list().find((b) => b.status === 'trading' && b.tmpl === 'cafe'); assert.ok(tgt);
  const v = w.map.venueOfBuilding.get(tgt.bid);
  assert.ok(w.cmd('business.closeBusiness', { bid: tgt.bid, reason: 'god' }));
  assert.equal(v.template, 'vacant_unit'); assert.equal(v.name, 'TO LET'); assert.equal(w.buildings.get(tgt.bid).type, 'vacant_unit'); w.run(2); assert.ok(w.events.query({ type: 'business.venueChanged' }).some((e) => e.place === tgt.bid && e.payload.to === 'vacant_unit'));
  assert.equal(w.lf.slots.filter((s) => s.bid === tgt.bid).length, 0);
  for (const p of w.people.values()) if (p.alive && p.ext.pop.workplace && p.ext.pop.workplace.bid === tgt.bid) assert.fail('employee kept a dead workplace');
  const fav = [...w.people.values()].filter((p) => p.alive && p.ext.rt && p.ext.rt.life.fav.cafe === tgt.bid); assert.equal(fav.length, 0, 'regulars re-pointed');
});
test('openBusiness, rentReview, chainArrives, businessRatesCut commands work and the new venue is visible to the map', () => {
  const w = createLarkfieldWorld(3, { strictEvents: true }); w.run(D * 40);
  const q = w.sys.business.query, vac = q.vacant()[0]; assert.ok(vac);
  assert.ok(w.cmd('business.openBusiness', { type: 'coffee_shop', unit: vac.bid }));
  const v = w.map.venueOfBuilding.get(vac.bid); assert.equal(v.template, 'cafe'); assert.equal(v.variant, 'coffee_shop'); assert.notEqual(v.name, 'TO LET');
  assert.ok(w.lf.slots.some((s) => s.bid === vac.bid)); assert.equal(w.buildings.get(vac.bid).name, v.name);
  const r0 = q.venue(vac.bid).rent; assert.ok(w.cmd('business.rentReview', { unit: vac.bid, pct: 25 })); assert.ok(q.venue(vac.bid).rent > r0 * 1.2);
  assert.ok(w.cmd('business.businessRatesCut', { pct: 50 }));
  w.cmd('business.closeBusiness', { bid: vac.bid }); w.cmd('business.chainArrives', {}); assert.ok(w.ledger.invariant().ok);
});
test('player can start a business in a vacant unit (affordability checked) and works as its owner', () => {
  const w = createLarkfieldWorld(4, { strictEvents: true }); w.run(D * 40);
  const q = w.sys.business.query, vac = q.vacant()[0], p = [...w.people.values()].find((x) => x.alive && w.ageOf(x) > 25 && w.ageOf(x) < 55);
  const r = w.cmd('business.start', { pid: p.id, unit: vac.bid, type: 'barber' }); assert.ok(r.ok, JSON.stringify(r));
  assert.equal(q.venue(vac.bid).owner.pid, p.id); assert.equal(p.ext.pop.workplace.bid, vac.bid);
  const r2 = w.cmd('business.start', { pid: p.id, unit: vac.bid, type: 'barber' }); assert.equal(r2.ok, false);
});
test('lifecycle over 4 years: openings and closures happen, vacancy stays in a plausible band, snapshot round-trips venue names', () => {
  const w = createLarkfieldWorld(1); w.run(D * 365 * 4);
  const q = w.sys.business.query, y = q.yearly(); const tot = (k) => Object.values(y).reduce((n, o) => n + Object.values(o[k]).reduce((a, b) => a + b, 0), 0);
  assert.ok(tot('close') > 0 && tot('open') > 0); const vr = q.vacancyRate(); assert.ok(vr > 0.02 && vr < 0.4, 'vacancy ' + vr);
  const snap = JSON.parse(JSON.stringify(w.snapshot())), w2 = restoreLarkfieldWorld(snap);
  for (const b of w2.sys.business.query.list()) assert.equal(w2.map.venueOfBuilding.get(b.bid).name, b.status === 'vacant' ? 'TO LET' : b.name);
  w2.run(D * 30);
});
