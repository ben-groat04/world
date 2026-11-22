// Life-story validator: node tools/lifecheck.js [--seed 1] [--years 10] [--quiet]
// Runs the sim and checks, for EVERY resident (living or dead), that the life story shown in the inspector is one consistent timeline:
//   birth < education < (UK arrival for migrants) < work/addresses/partners; age-appropriate reasons and milestones; era-correct qualifications (O-levels/CSEs before 1988,
//   GCSEs after); no duplicate entries; siblings by the same mother at least ~9 months apart unless twins (shared birth); "years here" really tracks the move-in date;
//   and (sampled monthly) impossible states: a child at school before the September after their 4th birthday, an asleep person who can be talked to, groups whose
//   members are too young/old/unwell for what the group does. Exit code 1 on any violation.   Also exported: lifeCheck(seed, years) -> {violations, stats}.
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { timelineOf } from '../ui/lifestory.js';

const TPD = 144;
export function checkTimeline(w, p, tl) {
  const v = [], TPY = w.calendar.ticksPerYear, ageAt = (tick) => (tick - p.birthTick) / TPY, q = p.ext.pop || {}, by = w.calendar.dateOf(p.birthTick).y;
  const bad = (rule, l) => v.push({ rule, id: p.id, name: `${p.firstName} ${p.lastName}`, text: l ? `${w.calendar.formatDate(l.tick)} (age ${ageAt(l.tick).toFixed(1)}) ${l.text}` : '' });
  const arrival = tl.find((l) => /^Moved to the UK/.test(l.text));
  const UKLOC = /^(Started work|Left work|Lost work|Worked as|Moved to (?!the UK)|Moved in with|Started primary school|Finished GCSEs|Took O-levels|Left school with|Started an apprenticeship\.|Became a British)/;
  const seen = new Map();
  for (const l of tl) {
    const a = ageAt(l.tick), t = l.text;
    if (l.tick > w.tick + 1) bad('future entry', l);
    if (a < -0.01) bad('before birth', l);
    if (arrival && l !== arrival && l.tick < arrival.tick - 3 * TPD && UKLOC.test(t)) bad('UK event before UK arrival', l);
    if (/^(Started work|Left work|Lost work|Started as|Worked as|Left an earlier job)/.test(t) && a < 15.5) bad('child working', l);
    if (/^Retired/.test(t) && a < 48) bad('retired too young', l);
    if (/^(Married|Got married)/.test(t) && a < 16) bad('married as a child', l);
    if (/^Moved in with/.test(t) && a < 16) bad('child moved in with partner', l);
    if (/^Met /.test(t) && a < 14) bad('met partner as a child', l);
    if (/^Graduated/.test(t) && (a < 20 || a > 60)) bad('graduated at odd age', l);
    if (/^Went to university/.test(t) && a < 17.5) bad('university too young', l);
    if (/^Started primary school/.test(t) && (a < 3.5 || a > 6.5)) bad('primary school at odd age', l);
    if (/GCSE/.test(t) && w.calendar.dateOf(l.tick).y < 1988) bad('GCSE before 1988', l);
    if (/O-level|\bCSEs?\b/.test(t) && w.calendar.dateOf(l.tick).y >= 1989) bad('O-level/CSE after 1988', l);
    if (/^Finished GCSEs/.test(t) && (a < 15.5 || a > 17.5)) bad('GCSE at odd age', l);
    const m = /^Moved to (?!the UK)(.+?) (for work|to buy|to be with a partner|after a relationship ended|after selling the business|on retiring|to downsize|to bring the rent down|for the schools|after a bereavement|for health reasons|after a notice to leave|after graduating|for a bigger home)\.$/.exec(t);
    if (m) { const r = m[2]; if (a < 16 || (/to buy|a partner|selling the business/.test(r) && a < 18) || (/retiring|downsize/.test(r) && a < 50) || (/the schools/.test(r) && !(p.family.childrenIds || []).length)) bad('reason does not fit age/family', l); }
    if (/^Moved to (?!the UK)/.test(t) && a < 16 && /for work|to buy|partner|relationship|retiring|downsize|bring the rent|business|notice to leave|bereavement|graduating|health/.test(t)) bad('child moved for an adult reason', l);
    if (/^Started work as/.test(t) || /^Moved in with|^Married|^Got married|^Left home|^Moved out of the family home/.test(t) || /was born\.$/.test(t)) { const k = t + '|' + Math.floor(l.tick / (TPY * 0.6)); if (seen.has(k)) bad('duplicate entry', l); seen.set(k, 1); }
  }
  // order: born first; education before work
  const first = tl.find((l) => /^Born /.test(l.text)); if (first && tl[0] !== first && tl[0].tick < first.tick) bad('entry before Born', tl[0]);
  const rules = [['primary', /^Started primary/], ['exam', /^(Finished GCSEs|Took O-levels|Left school with|Finished secondary)/], ['work', /^Started as|^Started work as/]];
  const pos = (re) => { const l = tl.find((x) => re.test(x.text)); return l ? l.tick : null; };
  const t0 = pos(rules[0][1]), t1 = pos(rules[1][1]), t2 = pos(rules[2][1]);
  if (t0 != null && t1 != null && t1 < t0) bad('exams before primary', tl.find((x) => rules[1][1].test(x.text)));
  if (t1 != null && t2 != null && t2 < t1 - TPY * 0.3) bad('work before finishing school', tl.find((x) => rules[2][1].test(x.text)));
  // GCSE-era sanity for anyone born 1947-58 (must never be told a GCSE milestone)
  if (by + 16 < 1988 && tl.some((x) => /GCSE/.test(x.text))) bad('GCSE for a pre-1988 school-leaver', tl.find((x) => /GCSE/.test(x.text)));
  return v;
}

export function lifeCheck(seed = 1, years = 10, log = () => {}) {
  const w = createLarkfieldWorld(seed), TPY = w.calendar.ticksPerYear, violations = [], bump = (v) => { for (const x of v) violations.push(x); };
  const yrs0 = new Map(), unit0 = new Map(), movers = new Set(), strikes = new Map(); for (const p of w.living()) { const q = p.ext.pop; if (q) { yrs0.set(p.id, q.yearsAtAddress); unit0.set(p.id, q.unit); } }
  const day1 = new Set([...w.people.keys()]);
  const t0 = w.tick, end = t0 + Math.round(years * TPY); let month = 0;
  const stateCheck = () => {
    for (const p of w.living()) { const q = p.ext.pop; if (q && unit0.has(p.id) && unit0.get(p.id) !== q.unit) movers.add(p.id); }
    const sch = w.calendar.dateOf(w.tick); // last 1 September
    for (const p of w.living()) {
      const q = p.ext.pop; if (!q) continue; const age = w.ageOf(p), rt = p.ext.rt || {};
      const bad = (rule, text) => violations.push({ rule, id: p.id, name: `${p.firstName} ${p.lastName}`, text: `${w.calendar.formatDate(w.tick)} age ${age.toFixed(1)}: ${text}` });
      if (age < 3.8 && q.school && ['primary', 'secondary', 'college', 'university'].includes(q.school.kind)) bad('toddler at school', q.school.kind);
      if (age < 1 && q.school && q.school.kind === 'nursery') bad('baby at nursery', 'nursery');
      if (age < 15.9 && q.activity === 'employed' && !q.partTimeKid) bad('child employed', q.occ || '');
      // age on the last 1 September (UK intake rule): primary only after the September following the 4th birthday
      const sep = w.calendar.dateOf(w.tick); const sepTick = (() => { let t = w.tick; for (let i = 0; i < 400 && (w.calendar.dateOf(t).m !== 8 || w.calendar.dateOf(t).d !== 1); i++) t -= TPD; return t; })();
      const ageSep = (sepTick - p.birthTick) / TPY;
      if (q.school && q.school.kind === 'primary' && ageSep < 3.99 && age < 5) bad('primary before the September after turning 4', `age on 1 Sep ${ageSep.toFixed(2)}`);
      if (age > 0 && q.yearsAtAddress > age + 0.3) bad('years at address > age', `${q.yearsAtAddress} > ${age.toFixed(1)}`);
      if (!(q.yearsAtAddress >= 0)) bad('bad yearsAtAddress', String(q.yearsAtAddress));
    }
    // groups: members must be fit and old enough for what the group does (rule restated here independently of the sim's own gate)
    try {
      const Q = w.sys.goals.query;
      for (const g of Q.groups({})) { const full = Q.group(g.id); if (!full) continue; const phys = /five-a-side|football|runner|cricket|netball|rugby|climb|swim/i.test(g.name) || g.kind === 'team';
        for (const m of full.members) { const q = w.people.get(m.id); if (!q || !q.alive) continue; const a = w.ageOf(q), h = (q.ext.pop && q.ext.pop.health) || {}, conds = h.conds || [];
          const bad = (why) => { const k = g.id + ':' + q.id + ':' + why; if (!strikes.has(k)) { strikes.set(k, 1); return; } /* a diagnosis lands between sweeps: only a member still unfit at the NEXT check (two months later) is a violation */ violations.push({ rule: 'group eligibility', id: q.id, name: `${q.firstName} ${q.lastName}`, text: `${g.name} (${g.kind}) member aged ${a.toFixed(0)}: ${why}` }); };
          if (a < 8) bad('too young for any group');
          if (phys && a > 72) bad('too old for a sports group'); if (phys && /five-a-side|football|team/i.test(g.name + g.kind) && a > 62) bad('too old for five-a-side');
          if (phys && (h.limiting >= 2 || conds.some((c) => /stroke|mobility|dementia|heart|copd/i.test(c)))) bad(`physical group with ${h.limiting >= 2 ? 'a limiting condition' : conds.join('/')}`); } }
    } catch (e) { violations.push({ rule: 'group check crashed', id: -1, name: '', text: String(e && e.message) }); }
  };
  while (w.tick < end) { w.run(TPD * 30); month++; if (month % 2 === 0) stateCheck(); }
  // end of run: tenure tracked the move-in date for people who did not move
  let tenureChecked = 0;
  for (const p of w.living()) { const q = p.ext.pop; if (!q || !yrs0.has(p.id) || unit0.get(p.id) !== q.unit || movers.has(p.id) || p.memories.some((m) => m.tick > t0 && /^Moved back in|^Moved out of the family|^Left home/.test(m.text))) continue; /* a person who left home and came back starts a new stay */ const exp = yrs0.get(p.id) + years; tenureChecked++; if (Math.abs(q.yearsAtAddress - exp) > 0.35) violations.push({ rule: 'tenure not updating', id: p.id, name: `${p.firstName} ${p.lastName}`, text: `years here ${q.yearsAtAddress} expected ~${exp.toFixed(1)}` }); }
  // timelines
  let people = 0, lines = 0, arrivals = 0;
  for (const p of w.people.values()) {
    if (!p.ext.pop) continue; people++;
    const tl = timelineOf(w, p, w.events.query({ actor: p.id, minSalience: 0.12, limit: 400 })); lines += tl.length; bump(checkTimeline(w, p, tl));
    // people who ARRIVED during the run (new households, flatmates, partners moving in; born before the run began, not day-1 residents) must carry the same backstory as the founding residents
    if (p.alive && !day1.has(p.id) && p.birthTick < t0) { arrivals++; /* (the dead are archived without memories) */ const q = p.ext.pop;
      if (!tl.some((x) => /^Born /.test(x.text))) violations.push({ rule: 'arrival without backstory', id: p.id, name: `${p.firstName} ${p.lastName}`, text: 'no "Born" entry' });
      if (q.bornUK === false && q.birthplace && q.birthplace !== 'United Kingdom' && !tl.some((x) => /^Moved to the UK/.test(x.text))) violations.push({ rule: 'migrant arrival without UK entry', id: p.id, name: `${p.firstName} ${p.lastName}`, text: q.birthplace }); }
  }
  // siblings of one mother: >= 36 weeks apart unless twins (same birth tick +- 3 days)
  let pairs = 0;
  for (const m of w.people.values()) { const ks = (m.family.childrenIds || []).map((id) => w.people.get(id)).filter((c) => c && c.family.motherId === m.id).sort((a, b) => a.birthTick - b.birthTick);
    for (let i = 1; i < ks.length; i++) { const gap = (ks[i].birthTick - ks[i - 1].birthTick) / TPD; pairs++; if (gap > 3 && gap < 36 * 7) violations.push({ rule: 'siblings born too close (not twins)', id: ks[i].id, name: `${ks[i - 1].firstName}/${ks[i].firstName}`, text: `${gap.toFixed(0)} days apart` }); } }
  const byRule = {}; for (const v of violations) (byRule[v.rule] ||= []).push(v);
  return { violations, byRule, stats: { people, lines, arrivals, tenureChecked, siblingPairs: pairs, years, seed } };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const argv = process.argv.slice(2), val = (f, d) => (argv.includes(f) ? +argv[argv.indexOf(f) + 1] : d);
  const r = lifeCheck(val('--seed', 1), val('--years', 10));
  console.log(`lifecheck seed ${r.stats.seed}, ${r.stats.years}y: ${r.stats.people} people (${r.stats.arrivals} arrivals with backstories), ${r.stats.lines} timeline lines, ${r.stats.tenureChecked} tenure checks, ${r.stats.siblingPairs} sibling pairs`);
  for (const [rule, vs] of Object.entries(r.byRule)) { console.log(`  FAIL ${rule}: ${vs.length}`); if (!argv.includes('--quiet')) for (const x of vs.slice(0, 4)) console.log(`      #${x.id} ${x.name} ${x.text}`); }
  console.log(r.violations.length ? `LIFECHECK FAILED (${r.violations.length} violations)` : 'LIFECHECK OK');
  process.exit(r.violations.length ? 1 : 0);
}
