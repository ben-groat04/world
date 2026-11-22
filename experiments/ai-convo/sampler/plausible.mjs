// Independent plausibility audit: reads generated people (JSON files, or fresh samples if none given) and flags anything
// a real person/household would not be. Uses its own constants (statutory minimum wage, working-time rules, biology) rather
// than the generator's validators. HARD flags must be zero; SOFT flags are rate-capped. Usage: node plausible.mjs [sample-*.json]
import fs from 'node:fs';
import { sample, D } from './index.mjs';
const files = process.argv.slice(2);
const groups = files.length ? files.flatMap(f => { const j = JSON.parse(fs.readFileSync(f)); return [j.people]; })
  : ['flatshare:4', 'family:0', 'cafe:5', 'street:6', 'friends:5'].flatMap(s => { const [k, n] = s.split(':'); return Array.from({ length: 120 }, (_, i) => sample(k, +n, 1000 + i).people); });
const hard = {}, soft = {}, seen = {};
const flag = (tbl, rule, p, why = '') => { tbl[rule] = (tbl[rule] || 0) + 1; (seen[rule] ??= []).length < 3 && seen[rule].push(`${p.name} (${p.age}${p.sex}) ${why}`); };
const DAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }, tm = s => +s.slice(0, 2) + (s.slice(3) === '30' ? .5 : 0);
const MUSLIM = /^(Khan|Hussain|Iqbal|Butt|Chaudhry|Rahman|Uddin|Miah|Begum|Khatun|Akhtar|Mahmood|Rehman|Sheikh|Qureshi|Aslam|Raza|Hosseini|Karimi|Rahimi|Al-Hassan)$/, SIKH = /^(Singh|Kaur|Gill|Sandhu|Dhillon|Sidhu|Bains|Johal|Grewal|Sahota|Atwal)$/, FOREIGN = /^(Kowalski|Nowak|Wisniewski|Popescu|Ionescu|Singh|Kaur|Patel|Khan|Chen|Wang|Zhang|Okafor|Mensah|Rahman|Hosseini)$/;
const nPeople = groups.flat().length;
for (const g of groups) {
  const names = g.map(p => p.name); if (new Set(names).size !== names.length) flag(hard, 'duplicate name in group', g[0]);
  for (const p of g) {
    const h = p.household, sn = p.name.split(' ').slice(-1)[0], work = p.hours_per_week > 0, wk = p.shifts.reduce((a, s) => a + s.paid_hours, 0);
    if (p.age < 16 && (work || p.annual_income)) flag(hard, 'child with job/income', p);
    if (p.age < 18 && p.relationship_status !== 'single') flag(hard, 'minor partnered', p);
    if (p.age < 21 && /Degree/.test(p.education)) flag(hard, 'degree before 21', p);
    if (p.age < 22 && /^(Health professionals|Teaching)/.test(p.occupation ?? '')) flag(hard, 'qualified professional under 22', p, p.occupation);
    if (p.age < 20 && /^(Corporate managers|Other managers)/.test(p.occupation ?? '')) flag(hard, 'teen manager', p);
    if (p.activity === 'retired' && p.age < 50) flag(hard, 'retired under 50', p);
    if (p.activity === 'retired' && work) flag(hard, 'retired with job', p);
    if (p.age >= 75 && work && p.hours_per_week > 30) flag(soft, '75+ working >30h (Census 65+ band only)', p);
    if (p.activity === 'student' && p.hours_per_week > 16) flag(hard, 'student job >16h', p);
    if (p.activity === 'student' && p.age > 60) flag(hard, 'student over 60', p);
    if (p.activity === 'student' && p.age > 30) flag(soft, 'student over 30', p);
    if (work && p.hourly_pay < (p.age >= 21 ? 11.44 : 8.6)) flag(hard, 'below minimum wage', p, p.hourly_pay);
    if (work && Math.abs(p.annual_income - p.hourly_pay * p.hours_per_week * 52) > 2) flag(hard, 'pay != hourly x hours', p);
    if (p.annual_income > 250000) flag(hard, 'implausible income', p);
    if (!work && p.annual_income != null) flag(hard, 'income without source', p);
    if (p.activity === 'employed full-time' && p.annual_income < (p.age >= 21 ? 11.44 : 8.6) * 25 * 52) flag(hard, 'FT job below minimum-wage income', p, p.annual_income);
    if (work && Math.abs(wk - p.hours_per_week) > .01) flag(hard, 'shifts do not sum to hours', p);
    if (work) { // working-time rules from the shift list alone
      const s = [...p.shifts].sort((a, b) => DAY[a.day] - DAY[b.day]).map(x => { const st = DAY[x.day] * 24 + tm(x.start); let en = DAY[x.day] * 24 + tm(x.end); if (en <= st) en += 24; return [st, en]; });
      if (s.some(([a, b]) => b - a > 13.01)) flag(hard, 'shift over 13h elapsed', p);
      if (new Set(p.shifts.map(x => x.day)).size < p.shifts.length) flag(hard, 'two shifts same day', p);
      let mx = 0; for (let i = 0; i < s.length; i++) { const j = (i + 1) % s.length, gap = s[j][0] + (j <= i ? 168 : 0) - s[i][1]; if (s.length > 1 && gap < 11) flag(hard, 'less than 11h rest', p, JSON.stringify(p.shifts.map(x => x.day + x.start))); mx = Math.max(mx, gap); }
      if (s.length > 1 && mx < 35) flag(hard, 'no weekly rest', p);
      if (wk > 60) flag(hard, 'over 60 paid hours', p);
      if (p.activity === 'student' && p.shifts.length > 3) flag(hard, 'student 4+ shifts', p);
    } else if (p.shifts.length) flag(hard, 'shifts without job', p);
    if (p.education.includes('Degree') === false && /^(Health professionals|Teaching)/.test(p.occupation ?? '')) flag(hard, 'professional without degree', p);
    if (p.activity === 'long-term sick or disabled' && p.health === 'very good') flag(hard, 'sick but very good health', p);
    if (p.age >= 21 && !['wb'].includes('x') && p.birthplace !== 'England' && p.years_in_uk > p.age) flag(hard, 'years in UK > age', p);
    if (/^White British/.test(p.ethnicity) && FOREIGN.test(sn) && p.relationship_status !== 'married' && p.relationship_status !== 'cohabiting') flag(hard, 'White British with foreign surname', p);
    if (MUSLIM.test(sn) && /^(Hindu|Sikh|Jewish|Buddhist)$/.test(p.religion) && !/married|cohabiting/.test(p.relationship_status)) flag(hard, 'Muslim surname, other faith', p, p.religion);
    if (SIKH.test(sn) && p.religion === 'Muslim') flag(hard, 'Sikh surname, Muslim', p);
    if (p.children.length > Math.max(0, (p.age - 16) / 2.2 + 1)) flag(hard, 'too many children for age', p, p.children.length);
    for (const k of p.children) { if (p.age - k.age < 16) flag(hard, 'parent <16 at birth', p); if (k.age < 18 && k.lives === 'own household') flag(hard, 'minor child in own household', p); }
    const adults = h.members.filter(m => m.age >= 18).length + (p.age >= 18);
    if (adults > 2 * h.bedrooms || h.size > 3 * h.bedrooms) flag(hard, 'too many people for bedrooms', p, `${h.size} in ${h.bedrooms}`);
    if (h.type.startsWith('other household') && h.occupancy_rating < 0) flag(hard, 'unrelated adults forced to share a bedroom', p);
    if (p.age < 16 && !h.members.some(m => m.age >= 18)) flag(hard, 'child with no adult in household', p);
    if (new Set(h.members.map(m => m.name).concat(p.name)).size !== h.members.length + 1) flag(hard, 'duplicate name in household', p);
    for (const m of h.members) { if (/husband|wife|partner/.test(m.relation) && Math.abs(m.age - p.age) > 30) flag(hard, 'couple age gap >30', p); if (m.relation === 'mother' && m.age - p.age < 16) flag(hard, 'mother <16 years older', p); if (m.relation === 'father' && m.age - p.age < 16) flag(hard, 'father <16 years older', p); if (/husband|wife|partner/.test(m.relation) && (m.age < 18 || p.age < 18)) flag(hard, 'minor in couple', p); }
    if (h.members.some(m => /husband|wife|partner/.test(m.relation)) && Math.abs(h.members.find(m => /husband|wife|partner/.test(m.relation)).age - p.age) > 18) flag(soft, 'couple age gap >18', p);
    if (h.tenure === 'owned outright' && p.age >= 18 && p.age < 30 && !h.members.some(m => /^(mother|father)$/.test(m.relation))) flag(soft, 'young outright owner', p);
    if (p.activity === 'employed full-time' && /^(bad|very bad)$/.test(p.health)) flag(soft, 'FT worker in bad health', p);
    if (!['England', 'Wales', 'Scotland', 'Northern Ireland'].includes(p.birthplace) && /^White British/.test(p.ethnicity)) flag(soft, 'White British born abroad', p);
  }
}
// aggregates against real data: sex mix by occupation (ASHE jobs counts) and childlessness (ONS fertility)
const occ = {}; for (const p of groups.flat()) if (p.occupation && p.activity !== 'student') (occ[p.occupation] ??= { M: 0, F: 0 })[p.sex]++;
if (nPeople >= 200) for (const r of D.O) { const o = occ[r.title]; if (!o || o.M + o.F < 25) continue; const jm = r.M.reduce((a, b) => a + b), jf = r.F.reduce((a, b) => a + b), real = jf / (jm + jf), got = o.F / (o.M + o.F); if (Math.abs(real - got) > .22) flag(soft, 'sex mix off ASHE', { name: r.title, age: '', sex: '' }, `sample F ${got.toFixed(2)} vs ASHE ${real.toFixed(2)}`); }
const bands = [[40, 49, 2], [50, 64, 3]], women = groups.flat().filter(p => p.sex === 'F');
if (nPeople >= 200) for (const [lo, hi, i] of bands) { const w = women.filter(p => p.age >= lo && p.age <= hi); if (w.length < 60) continue; const cl = w.filter(p => !p.children.length).length / w.length, real = w.reduce((s, p) => s + (D.fert[p.age]?.[0] ?? 0), 0) / w.length / 100; if (Math.abs(cl - real) > .12) flag(soft, 'childlessness off ONS', { name: `women ${lo}-${hi}`, age: '', sex: '' }, `sample ${cl.toFixed(2)} vs ONS ${real.toFixed(2)}`); }
const H = Object.entries(hard), S = Object.entries(soft);
console.log(`audited ${nPeople} people in ${groups.length} groups`);
console.log(H.length ? 'HARD FLAGS:' : 'no hard flags'); H.forEach(([r, n]) => console.log(`  ${n}  ${r}  e.g. ${seen[r].join(' | ')}`));
console.log('soft flags (rate-capped at 3% of people each):'); S.forEach(([r, n]) => console.log(`  ${n} (${(100 * n / nPeople).toFixed(1)}%)  ${r}  e.g. ${seen[r].join(' | ')}`));
const big = nPeople >= 200; // rate caps and aggregate comparisons are meaningless on a handful of people
const bad = H.length || (big && (S.some(([r, n]) => n / nPeople > .03 && !/off (ASHE|ONS)/.test(r)) || S.some(([r]) => /off (ASHE|ONS)/.test(r))));
console.log(bad ? 'PLAUSIBILITY FAILED' : 'PLAUSIBILITY OK'); process.exit(bad ? 1 : 0);
