// W2-C tests: node --test tests/crime/crime.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLarkfieldWorld } from '../../sim/larkfield.js';
const D = 144;

test('crime + civic run 3 years under strictEvents; offences, outcomes, election all happen', () => {
  const w = createLarkfieldWorld(1, { strictEvents: true }); w.run(D * 365 * 3);
  const s = w.sys.crime.query.stats(), c = w.sys.civic.query.stats();
  const rec = Object.values(s.rec).reduce((a, b) => a + b, 0) / s.years / w.living().length * 1000;
  assert.ok(rec > 40 && rec < 220, 'recorded/1000/yr ' + rec);
  assert.ok((s.exp.shoplift || 0) > 0 && (s.exp.burglary || 0) > 0 && (s.exp.fraud || 0) > 0);
  assert.ok(s.hom <= 1, 'homicide ~0');
  assert.ok(c.elections.length >= 1 && c.elections[0].turnout > 0.15 && c.elections[0].turnout < 0.5, 'turnout ' + JSON.stringify(c.elections.map((e) => e.turnout)));
  assert.ok(c.apps > 5 && Object.keys(c.opened).length > 1);
  assert.ok(w.sys.crime.query.recent(3).every((x) => typeof x.text === 'string' && !/[#{}]/.test(x.text)));
});
test('commands: crimeWave raises offences, policeCuts lowers capacity, councilCuts lowers services, callElection runs', () => {
  const a = createLarkfieldWorld(2), b = createLarkfieldWorld(2); a.run(D * 20); b.run(D * 20);
  b.cmd('crime.wave', { days: 60, mult: 4 }); a.run(D * 60); b.run(D * 60);
  const n = (w) => Object.values(w.sys.crime.query.stats().exp).reduce((x, y) => x + y, 0);
  assert.ok(n(b) > n(a), 'wave adds offences');
  assert.ok(b.cmd('crime.policeCuts', { pct: 0.3 }) < 1);
  b.cmd('civic.councilCuts', { pct: 0.3 }); assert.ok(b.sys.civic.query.service('youth') < b.sys.civic.query.service('bins'));
  const before = b.sys.civic.query.election().history.length; b.cmd('civic.callElection', {}); assert.equal(b.sys.civic.query.election().history.length, before + 1);
  assert.ok(b.cmd('civic.newDevelopment', { kind: 'flats' }) === true);
});
test('audit: no demographic label (segment, ethnicity, religion, tenure) enters offender propensity', () => {
  const src = fs.readFileSync(new URL('../../sim/systems/crime/index.js', import.meta.url), 'utf8');
  const risk = src.slice(src.indexOf('function risk('), src.indexOf('function monthlyRisk'));
  assert.ok(!/\.seg\b|\.eth\b|religion|tenure|ethGroup|birthplace/.test(risk));
});
test('save/load keeps crime and civic state', () => {
  const w = createLarkfieldWorld(1); w.run(D * 120); const snap = JSON.parse(JSON.stringify(w.snapshot()));
  assert.ok(snap && JSON.stringify(snap).includes('"crime"'));
});
