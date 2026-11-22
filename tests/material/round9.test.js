// Round 9: sim-owned explanations (ask-out terms, move-in cash, borrowing limits), season-relative weather shocks, god end/undo commands, household naming, steady housing supply.
// node --test tests/material/round9.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLarkfieldWorld } from '../../sim/larkfield.js';
const D = 144, YEAR = D * 365;

test('life.askOut returns its own term breakdown and a query gives the same odds', () => {
  const w = createLarkfieldWorld(1); w.run(D * 30);
  const L = w.living().filter((p) => p.ext.life && !p.ext.life.part && w.ageOf(p) >= 20 && w.ageOf(p) < 40);
  const x = L.find((p) => L.some((q) => q !== p && q.sex !== p.sex)), t = L.find((q) => q !== x && q.sex !== x.sex);
  const od = w.sys.life.query.askOutOdds(x.id, t.id);
  assert.ok(od && od.p >= 0.01 && od.p <= 0.85 && od.terms.attraction && od.terms.ageGap && 'weakest' in od);
  const r = w.cmd('life.askOut', { pid: x.id, target: t.id });
  assert.ok(r.terms && Math.abs(r.p - od.p) < 1e-9 && r.weakest === od.weakest);
});

test('move-in cash and borrowing limits are sim queries', () => {
  const w = createLarkfieldWorld(1); w.run(D * 5);
  const u = w.sys.housing.query.vacancies({ all: true }).find((x) => x.rent > 0);
  assert.ok(u, 'a rentable vacancy exists');
  const need = w.sys.housing.query.moveInCash(u.id); assert.ok(need > 0 && need < u.rent * 2);
  const p = w.living().find((q) => q.ext.pop.fin && q.ext.pop.activity === 'employed');
  const lim = w.sys.money.query.limits(p.id); assert.ok(lim && lim.cardMonths > 0 && lim.card >= 0 && lim.card <= 7000);
});

test('heatwave is season-relative: a god heatwave in winter is a warm spell, in summer a heatwave; it can be ended early', () => {
  const toMonth = (w, m) => { for (let i = 0; i < 400 && w.time.month !== m; i++) w.run(D); w.run(D * 12); };
  const win = createLarkfieldWorld(3); toMonth(win, 11); const base = win.weather.temp; const r = win.cmd('health.heatwave', { days: 6, severity: 0.7 });
  assert.equal(r.heatwave, false, 'a winter shock stays below the heat threshold (temp ' + r.temp + ')'); assert.ok(r.temp < 23 && r.temp > base);
  win.run(D * 6); assert.ok(!win.lf.health.heat, 'no heat effects in winter'); assert.ok(win.weather.temp < 23);
  const sum = createLarkfieldWorld(3); toMonth(sum, 6);
  const r2 = sum.cmd('health.heatwave', { days: 6, severity: 0.7 }); sum.run(D * 4);
  assert.ok(r2.temp > 20, 'summer temp ' + r2.temp); assert.ok(sum.lf.health.heat && sum.lf.health.heat.mort > 0, 'heat effects follow the temperature');
  assert.equal(sum.cmd('health.heatwaveEnd', {}), true); sum.run(D); assert.equal(sum.weatherShock, null);
  const p = createLarkfieldWorld(3); p.cmd('health.pandemic', { weeks: 12, severity: 0.5 }); assert.ok(p.lf.health.epi.wave); assert.equal(p.cmd('health.pandemicEnd', {}), true); assert.equal(p.lf.health.epi.wave, null);
  const c = createLarkfieldWorld(3); c.cmd('crime.wave', { days: 60, mult: 4 }); assert.equal(c.cmd('crime.waveEnd', {}), true); assert.equal(c.cmd('crime.waveEnd', {}), false);
});

test('councilCuts: a negative pct reverses only that service and is the exact inverse', () => {
  const w = createLarkfieldWorld(2); w.run(D * 2); const q = w.sys.civic.query;
  const lib0 = q.service('library'), bins0 = q.service('bins');
  w.cmd('civic.councilCuts', { pct: 0.5, service: 'library' }); assert.ok(q.service('library') < lib0 - 0.05); assert.equal(q.service('bins'), bins0);
  w.cmd('civic.councilCuts', { pct: -0.5, service: 'library' }); assert.ok(Math.abs(q.service('library') - lib0) < 1e-9, 'library back to ' + lib0 + ' got ' + q.service('library')); assert.equal(q.service('bins'), bins0);
});

test('household members share one naming tradition (arrivals)', () => {
  const w = createLarkfieldWorld(5); w.run(YEAR * 3);
  const bySub = new Map(); let mixed = 0, multi = 0;
  for (const hh of w.lf.households) { if (hh.gone || hh.members.length < 2 || hh.seg === 'students') continue; const ps = hh.members.map((i) => w.people.get(i)).filter((p) => p && p.alive && p.ext.pop && p.ext.pop.role !== 'sharer'); const fam = ps.filter((p) => ['head', 'partner', 'child'].includes(p.ext.pop.role)); if (fam.length < 2) continue; multi++; const subs = new Set(fam.map((p) => p.ext.pop.sub).filter(Boolean)); if (subs.size > 1) mixed++; }
  assert.ok(multi > 50 && mixed / multi < 0.12, `mixed-tradition family households ${mixed}/${multi}`);
});

test('steady small-scale housing supply: stock keeps growing even when big schemes are refused', () => {
  const w = createLarkfieldWorld(1); const u0 = w.sys.housing.query.stats().units; w.run(YEAR * 10);
  const s = w.sys.housing.query.stats(); assert.ok(s.units >= u0 + 4, `dwellings ${u0} -> ${s.units}`);
});
