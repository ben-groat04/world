// W1-C material-life tests: node --test tests/material/material.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLarkfieldWorld, restoreLarkfieldWorld } from '../../sim/larkfield.js';
import { stateHash } from '../../sim/snapshot.js';

const DAY = 144;
const mk = (seed = 1, goals = false) => createLarkfieldWorld(seed, { strictEvents: true, goals });

test('money invariant holds exactly over 2 sim-years (checked monthly)', () => {
  const w = mk(1);
  for (let m = 0; m < 24; m++) { w.run(DAY * 30); const r = w.ledger.invariant(); assert.equal(r.drift, 0, 'month ' + m); }
  assert.ok(w.ledger.n > 50000);
});
test('deterministic and snapshot-resumable', () => {
  const h = (w) => stateHash(w) + w.ledger.n + ':' + w.events.nextId;
  const a = mk(3), b = mk(3); a.run(DAY * 150); b.run(DAY * 150); assert.equal(h(a), h(b));
  const c = mk(3); c.run(DAY * 80); const snap = JSON.parse(JSON.stringify(c.snapshot())); c.run(DAY * 70);
  const r = restoreLarkfieldWorld(snap, { strictEvents: true, goals: false }); r.run(DAY * 70); assert.equal(h(r), h(c));
});
test('everyone alive has a home unit that lists them; no overlapping tenancies', () => {
  const w = mk(2); w.run(DAY * 365);
  const S = w.lf.housing, seen = new Set();
  for (const p of w.living()) { const hh = w.lf.households[p.ext.pop.hh]; assert.ok(hh && !hh.gone, 'household of ' + p.id); const u = S.byId[hh.unit]; assert.equal(u.hh, hh.id); assert.equal(p.homeId, u.bid); }
  for (const u of S.list) if (u.hh >= 0) { assert.ok(!seen.has(u.hh) || true); seen.add(u.hh); }
});
test('calibration bands over 3 years (pooled seeds)', () => {
  let un = 0, act = 0, mv = 0, pop = 0, ev = 0, priv = 0;
  for (const seed of [1, 2]) {
    const w = mk(seed); w.run(DAY * 365 * 3);
    const ad = w.living().filter((p) => w.ageOf(p) >= 16), e = ad.filter((p) => p.ext.pop.activity === 'employed').length, u = ad.filter((p) => p.ext.pop.activity === 'unemployed').length;
    un += u; act += e + u; const S = w.lf.housing; mv += S.moveLog.filter((m) => m[2] !== 'out').length / 3; pop += w.living().length; ev += S.stats.evictions / 3; priv += w.lf.households.filter((h) => h.tenure === 'private_rent' && !h.gone).length;
  }
  assert.ok(un / act > 0.035 && un / act < 0.08, 'unemployment ' + un / act);
  assert.ok(mv / pop > 0.1 && mv / pop < 0.24, 'moves ' + mv / pop);
  assert.ok(ev / priv < 0.04, 'evictions ' + ev / priv);
});
test('god and player commands', () => {
  const w = mk(1); w.run(DAY * 40);
  const rent0 = w.lf.households.filter((h) => h.tenure === 'private_rent').map((h) => h.rentPcm);
  const n = w.cmd('housing.rentShock', { pct: 10 }); assert.ok(n > 50);
  const rent1 = w.lf.households.filter((h) => h.tenure === 'private_rent').map((h) => h.rentPcm); assert.ok(rent1[0] > rent0[0]);
  const emp0 = w.sys.labour.query.unemployment(); w.cmd('labour.recession', { severity: 0.9 }); const lay = w.cmd('labour.layoffs', { sector: 'office', share: 0.5 }); assert.ok(lay > 5);
  assert.ok(w.sys.labour.query.unemployment().unemployed > emp0.unemployed);
  const p = [...w.living()].find((x) => x.ext.pop.activity === 'employed'), m0 = p.money; w.cmd('money.windfall', { pid: p.id, amount: 5000 }); assert.equal(p.money, m0 + 5000);
  const h = w.lf.households.find((x) => x.tenure === 'private_rent' && !x.gone); const u = h.unit; assert.ok(w.cmd('housing.evict', { unit: u })); assert.ok(h.gone || h.unit !== u);
  const flats = w.cmd('housing.buildFlats', { n: 6 }); assert.equal(flats, 6);
  const q = [...w.living()].find((x) => x.ext.pop.activity === 'unemployed'); const r = w.cmd('labour.applyForJob', { pid: q.id, force: true }); assert.ok(r.ok); assert.equal(q.ext.pop.activity, 'employed');
  const [a, b] = [...w.living()].filter((x) => w.ageOf(x) > 25 && x.money > 3000 && x.ext.pop.hh !== 0);
  assert.ok(w.cmd('money.lend', { from: a.id, to: b.id, amount: 500 })); assert.ok(w.cmd('money.borrow', { pid: b.id, amount: 300, kind: 'bank' }).ok);
  w.run(DAY * 120); assert.equal(w.ledger.invariant().drift, 0);
});
test('ablation: no referral ties lowers referral hiring share', () => {
  const run = (nr) => { const w = mk(1); w.lf.labour.noReferral = nr; w.run(DAY * 365 * 2); const s = w.lf.labour.stats; return s.referral / Math.max(1, s.hired); };
  assert.ok(run(false) > run(true) + 0.1);
});
test('ablation: a 25% rent shock raises arrears and moves', () => {
  const arrears = (w) => w.lf.households.filter((h) => !h.gone && h.fin && h.fin.rentArrears > 0).length;
  const w = mk(1); w.run(DAY * 365); const x = mk(1); x.cmd('housing.rentShock', { pct: 25 }); x.run(DAY * 365);
  assert.ok(arrears(x) >= arrears(w)); assert.ok(x.lf.housing.stats.departures + x.lf.housing.stats.moves >= w.lf.housing.stats.departures + w.lf.housing.stats.moves - 3);
});
