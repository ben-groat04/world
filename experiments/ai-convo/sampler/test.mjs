// node test.mjs : samples >=500 people per setting, re-checks rules from the OUTPUT only (not via validate's code paths) and prints
// marginals next to the Census/ASHE targets stored in data.json. Exits non-zero on any rule failure.
import { sample, validate, D } from './index.mjs';
const N = { flatshare: 4, family: 0, cafe: 5, street: 5, friends: 5 }, T = D.targets, occ = Object.fromEntries(D.O.map(r => [r.title, r]));
const AB = a => a < 25 ? '18-24' : a < 35 ? '25-34' : a < 50 ? '35-49' : a < 65 ? '50-64' : '65+', ABA = a => a < 22 ? 0 : a < 30 ? 1 : a < 40 ? 2 : a < 50 ? 3 : a < 60 ? 4 : 5;
const ACTK = { 'employed full-time': 'ft', 'employed part-time': 'pt', 'self-employed': 'se', student: 'st', unemployed: 'un', retired: 're', 'long-term sick or disabled': 'si', 'looking after home or family': 'ho' };
const TENK = Object.fromEntries(Object.entries(D.tenLabel).map(([k, v]) => [v, k])), ETHK = Object.fromEntries(Object.entries(D.ethLabel).map(([k, v]) => [v, k]));
const pct = (cnt, keys) => { const t = keys.reduce((a, k) => a + (cnt[k] || 0), 0) || 1; return keys.map(k => ((cnt[k] || 0) / t * 100).toFixed(1).padStart(5)).join(' '); };
const tp = (o, keys) => pct(o, keys); let bad = 0; const fail = m => { if (bad++ < 15) console.log('  FAIL', m); };
const stuMax = Math.max(...Object.values(D.studentHours).map(q => q[4]));
for (const [s, n] of Object.entries(N)) {
  const people = [], errs = []; let seed = 1;
  while (people.length < 500) { const g = sample(s, n, seed++); people.push(...g.people); errs.push(...validate(g.people)); }
  errs.forEach(fail);
  for (const p of people) {
    const w = p.shifts.reduce((a, x) => a + x.paid_hours, 0); if (Math.abs(w - p.hours_per_week) > .01) fail('shifts!=hours ' + p.name);
    if (p.occupation) { const r = occ[p.occupation], q = r.pay[ABA(p.age)], floor = p.age >= 21 ? 11.44 : 8.6; if (p.hourly_pay < Math.min(q[0], floor) - .01 || p.hourly_pay > Math.max(q[4], 11.44) + .01 || Math.abs(p.annual_income - p.hourly_pay * p.hours_per_week * 52) > 1) fail('pay ' + p.name); }
    if (p.activity === 'student' && p.hours_per_week > stuMax) fail('student hours ' + p.name);
    if (p.name && !(p.ethnicity === D.ethLabel.wb || Object.keys(D.ukNation).includes(p.birthplace))) fail('name without a sourced list ' + p.name); // else null: the simulation names them
    if (!p.id || [...p.household.members, ...p.children].some(m => !m.id)) fail('missing id ' + p.name);
    const h = p.household, ad = h.members.filter(m => m.age >= 18).length + (p.age >= 18); if (ad >= 4 && h.bedrooms === 1) fail('4 adults 1-bed');
    if (/waitress|hostess|midwife|fireman|policeman|chairman|salesman|handyman/i.test(p.occupation ?? '')) fail('gendered title');
    if (s === 'cafe' && p.shifts.some(x => x.start < '06:30' || x.end > '18:00' || x.end < x.start)) fail('cafe hours ' + p.name);
  }
  const ad = people.filter(p => p.age >= 18), cnt = (arr, f) => arr.reduce((c, x) => (c[f(x)] = (c[f(x)] || 0) + 1, c), {});
  console.log(`\n=== ${s}: ${people.length} people; rule failures so far: ${bad}`);
  const row = (lab, c, keys, t) => { console.log(lab + '\n          ' + keys.map(k => k.slice(0, 5).padStart(5)).join(' ') + '\n  sample  ' + pct(c, keys) + (t ? '\n  target  ' + tp(t, keys) : '')); };
  const pf = s === 'street' || s === 'friends' ? 'inner' : 'ew';
  row('age (adults, %)', cnt(ad, p => AB(p.age)), ['18-24', '25-34', '35-49', '50-64', '65+'], T.age[pf]);
  row('ethnicity (people 25+; target = Census residents 25+, RM032)', cnt(people.filter(p => p.age >= 25), p => ETHK[p.ethnicity]), Object.keys(D.ethLabel), T.eth25[pf]);
  row('activity (adults 18+; target 16+ TS066)', cnt(ad, p => ACTK[p.activity]), Object.keys(T.act), T.act);
  row('tenure (per person; target = households)', cnt(people, p => TENK[p.household.tenure]), Object.keys(D.tenLabel), T.ten[pf === 'inner' ? 'IL' : 'EW']);
  const E = people.filter(p => p.occupation && (p.activity === 'employed full-time' || p.activity === 'employed part-time')), jt = D.O.reduce((a, r) => a + r.M.concat(r.F).reduce((x, y) => x + y, 0), 0);
  const dev = Math.max(...D.O.map(r => Math.abs(100 * E.filter(p => p.occupation === r.title).length / E.length - 100 * r.M.concat(r.F).reduce((x, y) => x + y, 0) / jt)));
  console.log(`occupation share: max deviation from ASHE jobs mix ${dev.toFixed(1)} pts (cafe exempt: roles fixed by scenario)`); if (dev > 12 && s !== 'cafe') fail('occupation mix far from ASHE');
  const over = people.filter(p => p.household.occupancy_rating < 0).length / people.length * 100;
  console.log(`overcrowded (rating<0): ${over.toFixed(1)}%  target ${T.overcrowded[pf === 'inner' ? 'inner' : 'ew'].toFixed(1)}%   mean size ${(people.reduce((a, p) => a + p.household.size, 0) / people.length).toFixed(2)}`);
}
console.log(bad ? `\n${bad} FAILURES` : '\nALL RULES HOLD'); process.exit(bad ? 1 : 0);
