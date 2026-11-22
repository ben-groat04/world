// Text and life-story regression tests: node --test tests/text/text.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TextEngine } from '../../sim/text/engine.js';
import { tidy, a_an, deslash } from '../../sim/text/mods.js';
import { jobNoun } from '../../sim/text/jobs.js';
import { lifeCheck, checkTimeline } from '../../tools/lifecheck.js';
import { textVariety, LINT_RULES } from '../../tools/variety.js';

const DAY = 144;
test('tidy: articles by sound, doubled words, number agreement, slashes', () => {
  assert.equal(tidy('Left an an admin temp.'), 'Left an admin temp.');
  assert.equal(tidy('a Eiffel Tower keyring'), 'an Eiffel Tower keyring');
  assert.equal(tidy('does the The Larkfield Arms'), 'does the Larkfield Arms');
  assert.equal(tidy('got 1 replies, 2 replies'), 'got 1 reply, 2 replies');
  assert.equal(tidy('unwell for 0 days'), 'unwell for less than a day');
  assert.equal(a_an('HR associate'), 'an HR associate'); assert.equal(a_an('university'), 'a university'); assert.equal(a_an('GP'), 'a GP'); assert.equal(a_an('HGV driver'), 'an HGV driver');
  assert.equal(deslash('hearing/sight loss and/or both'), 'hearing or sight loss and/or both');
});
test('job titles never leak taxonomy slashes into prose', () => {
  for (const l of ['IT / science technician', 'Freelance designer / writer / photographer', 'Food factory / agency packer', 'Police officer / community support / fire', 'Software / data professional']) {
    const n = jobNoun(l); assert.ok(!/[/(]/.test(n), n); assert.ok(n.split(' ').length >= 1);
  }
  assert.equal(jobNoun('IT / science technician'), 'IT technician'); assert.equal(jobNoun('Cook / chef'), 'cook');
});
test('engine: a `once` line is used at most once per N game-months across the whole town', () => {
  const e = new TextEngine({ rules: { x: [{ t: 'The cake was gone in eleven minutes.', once: 6 }, 'Nobody mentioned the cake.', 'The cake was lovely.', 'It rained.'] } }, { seed: 1 });
  const world = { tick: 0, calendar: { dateOf: () => ({ y: 2027, m: 3, d: 1 }) } }; let used = []; 
  for (let i = 0; i < 400; i++) { world.tick = i * DAY / 2; const s = e.render('x', { seed: i, a: { id: i, firstName: 'A' }, memory: true, cache: false, date: { y: 2027, month: 3, day: 1, weekday: 1, hour: 10 } }, world); if (/eleven minutes/.test(s)) used.push(world.tick / DAY); }
  assert.ok(used.length >= 1, 'used at least once'); for (let i = 1; i < used.length; i++) assert.ok(used[i] - used[i - 1] >= 6 * 30 - 1, `gap ${used[i] - used[i - 1]} days`);
});
test('engine: month-tagged lines only appear in their months', () => {
  const e = new TextEngine({ rules: { x: ['<<m=11,0>>A very sad Christmas tree.', 'A cloud.'] } }, { seed: 1 });
  for (let m = 0; m < 12; m++) for (let i = 0; i < 40; i++) { const s = e.render('x', { seed: i + 100 * m, a: { id: i }, memory: false, cache: false, date: { y: 2027, month: m, day: 3, weekday: 1, hour: 9 } }); if (/Christmas/.test(s)) assert.ok(m === 11 || m === 0, `Christmas tree in month ${m}`); }
});
test('lint rules catch the known glue bugs', () => {
  const hit = (s) => LINT_RULES.some(([, f]) => f(s));
  for (const bad of ['does the The Larkfield Arms', 'got 1 replies', 'had wordssomething said online', 'an an admin temp', 'a IT technician', 'a freelance designer/writer/photographer job', 'for 0 days before', 'Born in the south coast', '{p.over} left']) assert.ok(hit(bad), bad);
  for (const ok of ['the Larkfield Arms', 'got 1 reply', 'an admin temp', 'an IT technician', 'a university lecturer']) assert.ok(!hit(ok), ok);
});
test('checkTimeline flags impossible life stories', () => {
  const w = { calendar: { ticksPerYear: 52560, dateOf: (t) => ({ y: 2026 + Math.floor(t / 52560) }), formatDate: (t) => String(t) }, tick: 0 };
  const p = { id: 1, firstName: 'A', lastName: 'B', birthTick: -11 * 52560, family: { childrenIds: [] }, ext: { pop: {} } };
  const mk = (age, text) => ({ tick: Math.round((age - 11) * 52560), text });
  const v = checkTimeline(w, p, [mk(0, 'Born in Morocco.'), mk(9, 'Moved to 55 Cutting Road for work.'), mk(10, 'Moved to the UK from Morocco.'), mk(10.5, 'Finished GCSEs.')]);
  const rules = v.map((x) => x.rule); assert.ok(rules.includes('reason does not fit age/family')); assert.ok(rules.includes('UK event before UK arrival'));
});
test('life stories over a 3-year run are one consistent timeline (see tools/lifecheck.js for the 10-year run)', { timeout: 280000 }, () => {
  const r = lifeCheck(1, 3); assert.deepEqual(Object.fromEntries(Object.entries(r.byRule).map(([k, v]) => [k, v.length])), {}, JSON.stringify(r.violations.slice(0, 3)));
});
test('generated text: no glue bugs, season slips or quoted punchlines repeating (seed 2, 1 year)', { timeout: 280000 }, async () => {
  const r = await textVariety(2, 1, () => {}); assert.deepEqual(Object.fromEntries(Object.entries(r.hits).map(([k, v]) => [k, v.length])), {}); assert.ok(r.quotedRate < 0.003, `quoted repeats ${r.quotedRate}`);
});
