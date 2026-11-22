// node test.mjs : samples >=500 people per setting, re-checks rules independently of validate(), prints marginals vs targets.
import { sample, validate, D } from './index.mjs';
const N = { flatshare: 4, family: 0, cafe: 5, street: 5, friends: 5 }, T = D.targets, occ = Object.fromEntries(D.O.map(r => [r[0], r]));
const AB = a => a < 25 ? '18-24' : a < 35 ? '25-34' : a < 50 ? '35-49' : a < 65 ? '50-64' : '65+';
const ACTK = { 'employed full-time': 'ft', 'employed part-time': 'pt', 'self-employed': 'se', student: 'st', unemployed: 'un', retired: 're', 'long-term sick or disabled': 'si', 'looking after home or family': 'ho' };
const TENK = Object.fromEntries(Object.entries(D.tenLabel).map(([k, v]) => [v, k])), ETHK = Object.fromEntries(Object.entries(D.ethLabel).map(([k, v]) => [v, k]));
const pct = (cnt, keys) => { const t = keys.reduce((a, k) => a + (cnt[k] || 0), 0) || 1; return keys.map(k => ((cnt[k] || 0) / t * 100).toFixed(1).padStart(5)).join(' '); };
const tgt = s => Object.fromEntries(s.split(',').map(x => { const [k, v] = x.split(':'); return [k, +v]; }));
let bad = 0; const fail = (m) => { if (bad++ < 15) console.log('  FAIL', m); };
for (const [s, n] of Object.entries(N)) {
  const people = [], hh = [], errs = []; let seed = 1;
  while (people.length < 500) { const g = sample(s, n, seed++); people.push(...g.people); hh.push(g.people[0]); errs.push(...validate(g.people)); }
  errs.forEach(fail);
  for (const p of people) { // independent re-checks from output fields only
    const w = p.shifts.reduce((a, x) => a + x.paid_hours, 0); if (Math.abs(w - p.hours_per_week) > .01) fail('shifts!=hours ' + p.name);
    if (p.occupation) { const r = occ[p.occupation], q = p.hourly_pay; if (q < r[8] * .75 || q > r[12] || Math.abs(p.annual_income - q * p.hours_per_week * 52) > 1) fail('pay ' + p.name); }
    if (p.activity === 'student' && p.hours_per_week > 16) fail('student hours ' + p.name);
    const h = p.household, ad = h.members.filter(m => m.age >= 18).length + (p.age >= 18); if (ad >= 4 && h.bedrooms === 1) fail('4 adults 1-bed');
    if (/waitress|hostess|midwife|fireman|policeman|chairman|salesman|handyman/i.test(p.occupation ?? '')) fail('gendered title');
    if (s === 'cafe' && p.shifts.some(x => x.start < '06:30' || x.end > '18:00' || x.end < x.start)) fail('cafe hours ' + p.name);
  }
  const ad = people.filter(p => p.age >= 18), cnt = (arr, f) => arr.reduce((c, x) => (c[f(x)] = (c[f(x)] || 0) + 1, c), {});
  console.log(`\n=== ${s}: ${people.length} people, ${hh.length} groups; rule failures so far: ${bad}`);
  const row = (lab, c, keys, t) => { console.log(lab + '\n          ' + keys.map(k => k.slice(0, 5).padStart(5)).join(' ') + '\n  sample  ' + pct(c, keys)); if (t) console.log(`  target  ${pct(t, keys)}`); };
  const pf = s === 'street' || s === 'friends' ? 'inner' : 'ew';
  row('age (adults, % )', cnt(ad, p => AB(p.age)), ['18-24', '25-34', '35-49', '50-64', '65+'], tgt(T.age[pf]));
  row('ethnicity (%, target=all-age residents)', cnt(people, p => ETHK[p.ethnicity]), Object.keys(D.ethLabel), tgt(T.eth[pf]));
  row('activity (adults 18+; target 16+ from table)', cnt(ad, p => ACTK[p.activity]), Object.keys(tgt(T.act.ew)), tgt(T.act.ew));
  row('tenure (per person; target=households)', cnt(people, p => TENK[p.household.tenure]), Object.keys(D.tenLabel), tgt(T.ten[pf]));
  const over = people.filter(p => p.household.occupancy_rating < 0).length / people.length * 100;
  console.log(`overcrowded (rating<0): ${over.toFixed(1)}%  target ${T.overcrowded[pf]}%   mean size ${(people.reduce((a, p) => a + p.household.size, 0) / people.length).toFixed(2)}`);
}
console.log(bad ? `\n${bad} FAILURES` : '\nALL RULES HOLD'); process.exit(bad ? 1 : 0);
