// Larkfield pack report:  node tools/report.js --pack larkfield --seed 1 --years 1   (imported by tools/report.js behind --pack larkfield)
// Compact checks: population vs calibration, ties per segment (incl. off-map), time use per segment, 3am-at-home / 11am-at-work, 3 persona day traces, perf.
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { TU_CATS } from '../sim/systems/routine/index.js';

const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n));
const pc = (x) => (x * 100).toFixed(0) + '%';
const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const hhmm = (w, t) => { const x = w.calendar.dateOf(t); return String(x.hour).padStart(2, '0') + ':' + String(x.minute).padStart(2, '0'); };

export async function runLarkfieldReport(o) {
  const out = [];
  const t0 = performance.now();
  const w = createLarkfieldWorld(o.seed || 1);
  const buildMs = performance.now() - t0, pack = w.pack, cal = pack.calibration, lf = w.lf;
  const people = [...w.people.values()], SEG = pack.meta.segments, segName = (id) => id;
  const ageOf = (p) => w.ageOf(p), ageBands = ['0-14', '15-29', '30-44', '45-64', '65+'];
  out.push(`LARKFIELD seed ${w.seed}  pop ${people.length}  households ${lf.households.length} (avg ${f(people.length / lf.households.length, 2)}, calib ${cal.reference.avgHouseholdSize})  dwellings ${w.map.lf.stats ? w.map.lf.stats.dwellings : '?'}  venues ${w.map.lf.venues.length}  off-map placeholders ${lf.metro.length}  build ${f(buildMs, 0)}ms`);
  // ---- demography vs calibration
  const ac = cal.ageStructure.composite, band = (lo, hi) => Object.entries(ac).filter(([k]) => { const a = parseInt(k); return a >= lo && a <= hi; }).reduce((s, [, v]) => s + v, 0);
  const tgt = [band(0, 10), band(15, 25) - 0.0635 * 0 + 0, 0, 0, 0];
  const bandTarget = [band(0, 10) + ac['10-14'], ac['15-19'] + ac['20-24'] + ac['25-29'], ac['30-34'] + ac['35-39'] + ac['40-44'], ac['45-49'] + ac['50-54'] + ac['55-59'] + ac['60-64'], ac['65-69'] + ac['70-74'] + ac['75-79'] + ac['80-84'] + ac['85+']];
  const bandOf = (a) => (a < 15 ? 0 : a < 30 ? 1 : a < 45 ? 2 : a < 65 ? 3 : 4);
  const bc = [0, 0, 0, 0, 0]; for (const p of people) bc[bandOf(ageOf(p))]++;
  const ages = people.map(ageOf).sort((a, b) => a - b);
  out.push(`AGE   ${ageBands.map((b, i) => `${b} ${pc(bc[i] / people.length)}/${pc(bandTarget[i])}`).join('  ')}  median ${f(ages[ages.length >> 1], 0)}/${cal.ageStructure.medianAge}  female ${pc(people.filter((p) => p.sex === 'F').length / people.length)}  (actual/target)`);
  const ten = {}; for (const h of lf.households) ten[h.tenure] = (ten[h.tenure] || 0) + 1;
  const tt = {}; for (const [k, v] of Object.entries(cal.tenure.composite)) { const m = pack.meta.tenureFromCalibration[k]; if (m) tt[m] = (tt[m] || 0) + v; }
  out.push(`TENURE ${Object.keys(tt).map((k) => `${k.replace('_', ' ')} ${pc((ten[k] || 0) / lf.households.length)}/${pc(tt[k])}`).join('  ')}`);
  const arch = {}; for (const h of lf.households) arch[h.arch] = (arch[h.arch] || 0) + 1;
  const hhAvg = (a) => a.id;
  out.push(`HHTYPE ${pack.meta.households.map((a) => `${a.id.replace(/_/g, ' ').slice(0, 18)} ${pc((arch[a.id] || 0) / lf.households.length)}/${pc(a.share)}`).join(' | ')}`);
  const sg = {}; for (const h of lf.households) sg[h.seg] = (sg[h.seg] || 0) + 1;
  out.push(`SEGMENTS(hh) ${SEG.map((s) => `${s.id} ${pc((sg[s.id] || 0) / lf.households.length)}/${pc(s.householdShare)}`).join('  ')}`);
  const eth = {}, rel = {}; let bornUK = 0; for (const p of people) { eth[p.ext.pop.ethGroup] = (eth[p.ext.pop.ethGroup] || 0) + 1; rel[p.ext.pop.religion] = (rel[p.ext.pop.religion] || 0) + 1; if (p.ext.pop.bornUK) bornUK++; }
  const E = cal.ethnicity.detail, ES = { white_british: E['White British'], other_white: E['Other White'], indian: E.Indian, pakistani: E.Pakistani, bangladeshi: E.Bangladeshi, chinese: E.Chinese, other_asian: E['Other Asian'], black: E.African + E.Caribbean, mixed: cal.ethnicity.shares.Mixed, other: cal.ethnicity.shares['Other (incl Arab)'] };
  const ethA = { ...eth, black: (eth.african || 0) + (eth.caribbean || 0) }; delete ethA.african; delete ethA.caribbean;
  out.push(`ETHNICITY ${Object.keys(ES).map((k) => `${k.replace('white_', 'w.')} ${pc((ethA[k] || 0) / people.length)}/${pc(ES[k])}`).join('  ')}`);
  const R = cal.religion.shares, rn = 1 - R['Not answered'];
  out.push(`RELIGION ${['No religion', 'Christian', 'Muslim', 'Hindu', 'Sikh', 'Buddhist'].map((k) => `${k} ${pc((rel[k] || 0) / people.length)}/${pc(R[k] / rn)}`).join('  ')}  bornUK ${pc(bornUK / people.length)}/${pc(cal.birthplace.bornInUK)}`);
  const ad = people.filter((p) => ageOf(p) >= 16), act = {}; for (const p of ad) act[p.ext.pop.activity] = (act[p.ext.pop.activity] || 0) + 1;
  const EA = cal.economicActivity16plus;
  out.push(`ACTIVITY(16+) employed ${pc((act.employed || 0) / ad.length)}/${pc(EA.employed)} student ${pc((act.student || 0) / ad.length)}/${pc(EA.student)} retired ${pc((act.retired || 0) / ad.length)}/${pc(EA.retired)} unemployed ${pc((act.unemployed || 0) / ad.length)}/${pc(EA.unemployed)} home/family ${pc((act.home_family || 0) / ad.length)}/${pc(EA.lookingAfterHomeFamily)} sick/disabled ${pc((act.sick_disabled || 0) / ad.length)}/${pc(EA.longTermSickDisabled)} other ${pc((act.other_inactive || 0) / ad.length)}/${pc(EA.otherInactive)}`);
  const cars = [0, 0, 0, 0]; for (const h of lf.households) cars[Math.min(3, h.cars)]++;
  const emp = ad.filter((p) => p.ext.pop.activity === 'employed'), net = emp.map((p) => p.ext.pop.fin.net).sort((a, b) => a - b), disab = people.filter((p) => p.ext.pop.health.disabled).length / people.length;
  const off = emp.filter((p) => p.ext.pop.workplace.kind === 'offmap').length, onm = emp.filter((p) => p.ext.pop.workplace.kind === 'onmap').length, home = emp.filter((p) => p.ext.pop.workplace.kind === 'home').length;
  out.push(`CARS 0/1/2/3+ ${cars.map((c) => pc(c / lf.households.length)).join('/')} (calib ${['none', 'one', 'two', 'threePlus'].map((k) => pc(cal.carOwnership.composite[k])).join('/')})  disabled ${pc(disab)}/${pc(cal.health.disabledAnyEqualityAct)}  workplace: off-map ${pc(off / emp.length)} on-map ${pc(onm / emp.length)} home ${pc(home / emp.length)}  median net income (employed) £${Math.round(net[net.length >> 1] || 0)}  dogs ${pc(lf.households.filter((h) => h.dogs).length / lf.households.length)} cats ${pc(lf.households.filter((h) => h.cats).length / lf.households.length)}`);
  // ---- ties per segment
  const rows = [];
  for (const s of SEG) {
    const ps = people.filter((p) => p.ext.pop.seg === s.id && ageOf(p) >= 16); if (!ps.length) continue;
    const t1 = ps.map((p) => p.ext.pop.ties.filter((t) => t.t === 1).length), t2 = ps.map((p) => p.ext.pop.ties.filter((t) => t.t <= 2).length), t3 = ps.map((p) => p.ext.pop.ties.filter((t) => t.t === 3).length);
    const all = ps.flatMap((p) => p.ext.pop.ties), offAll = all.filter((t) => !t.on).length / Math.max(1, all.length), top = ps.flatMap((p) => p.ext.pop.ties.filter((t) => t.t <= 2 && t.k === 'friend')), offF = top.filter((t) => !t.on).length / Math.max(1, top.length);
    const fr = ps.filter((p) => p.ext.pop.ties.some((t) => t.fr)).length / ps.length;
    rows.push(`${pad(s.id, 24)} n=${lp(ps.length, 3)} clique ${f(mean(t1), 1)} sympathy ${f(mean(t2), 1)} local-weak ${lp(f(mean(t3), 1), 4)} off-map(all) ${lp(pc(offAll), 4)} off-map(close friends) ${lp(pc(offF), 4)}/${pc(1 - s.social.onMapShare.closeFriends)} friction ${pc(fr)}`);
  }
  const allT = ad.flatMap((p) => p.ext.pop.ties);
  out.push(`TIES (16+; tier1=support clique target 3-5, tier<=2=sympathy target 12-15) overall off-map ${pc(allT.filter((t) => !t.on).length / allT.length)} of ${allT.length} ties; close-friend off-map target = 1 - segment onMapShare.closeFriends`);
  out.push(...rows);
  // ---- run & sample
  const nseg = SEG.length, nc = TU_CATS.length, ctx = w.rtx;
  w.run(144 * 3);
  ctx.tu = new Float64Array(2 * nseg * nc); ctx.tuh = new Float64Array(2 * nseg);
  const samp = { h3: [0, 0], h11: [0, 0, 0], h11k: [0, 0] }, dayCnt = [0, 0];
  w.on('hour', (x) => {
    const t = w.time; if (t.hour === 3) { let n = 0, at = 0, nm = 0, tr = 0; for (const p of w.living()) { n++; if (p.locationId === p.homeId) at++; else if (p.ext.rt.off) nm++; } samp.h3[0] += at; samp.h3[1] += n; samp.h3nm = (samp.h3nm || 0) + nm; }
    if (t.hour === 11 && t.dow < 4 && !t.bankHoliday && t.schoolDay) { for (const p of w.living()) { const q = p.ext.pop, a = ageOf(p); const should = (q.activity === 'employed' && a >= 18) || (q.activity === 'student' && a >= 5) || a >= 5 && a < 16; if (!should) continue; const c = TU_CATS[p.ext.rt.cat]; samp.h11[1]++; if (c === 'work' || c === 'commute') samp.h11[0]++; else if (c === 'sleep') samp.h11[2]++; } }
  });
  const meas = 28; w.run(144 * meas);
  const nPerson = SEG.map((s) => ad.filter((p) => p.ext.pop.seg === s.id).length);
  const mins = (k, c) => ctx.tu[k * nc + c] * 10;
  const days = [meas / 7 * 5, meas / 7 * 2];
  const cat = (n) => TU_CATS.indexOf(n);
  out.push(`3AM at home: ${pc(samp.h3[0] / samp.h3[1])} (off-map ${pc((samp.h3nm || 0) / samp.h3[1])} = night shifts/nights out)   11AM Mon-Thu in-term: ${pc(samp.h11[0] / samp.h11[1])} at work/school/study (of employed adults + school-age; ${pc(samp.h11[2] / samp.h11[1])} sleeping)`);
  out.push(`TIME USE min/day (adults 16+; weekday | weekend)  sleep  work/study  commute  out+social  home-leisure  chores/care/eat/errand  at-home%   [ONS adults avg: sleep+rest 536, travel 61, paid work 176, leisure(ent+social+sport) ~245, unpaid 158+]`);
  const fmtRow = (label, ks, n) => {
    const cells = [0, 1].map((wk) => { const dd = days[wk] * n; const g = (cs) => cs.reduce((s, c) => s + ks.reduce((a, k) => a + mins(wk * nseg + k, cat(c)), 0), 0) / dd; const hh = ks.reduce((a, k) => a + ctx.tuh[wk * nseg + k] * 10, 0) / dd; const tot = TU_CATS.reduce((s, c) => s + g([c]), 0); return `${lp(f(g(['sleep']), 0), 4)} ${lp(f(g(['work']), 0), 4)} ${lp(f(g(['commute']), 0), 4)} ${lp(f(g(['out', 'social']), 0), 4)} ${lp(f(g(['home']), 0), 4)} ${lp(f(g(['chores', 'care', 'eat', 'errand']), 0), 4)} ${lp(pc(hh / Math.max(1, tot)), 4)}`; });
    out.push(`  ${pad(label, 24)} ${cells.join(' | ')}`);
  };
  SEG.forEach((s, i) => { if (nPerson[i]) fmtRow(s.id, [i], nPerson[i]); });
  fmtRow('ALL adults', SEG.map((s, i) => i), ad.length);
  // ---- trace 3 personas
  const pick = (segId, pred) => { const c = people.filter((p) => p.ext.pop.seg === segId && ageOf(p) >= 17 && pred(p)); return c[Math.floor(c.length * 0.37)] || people.find((p) => p.ext.pop.seg === segId); };
  const want = [['settled_professionals', (p) => p.ext.pop.activity === 'employed' && p.ext.pop.workplace.kind === 'offmap'], ['shift_workers', (p) => p.ext.pop.activity === 'employed'], ['older_longterm', (p) => p.ext.pop.activity === 'retired'], ['young_sharers', (p) => p.ext.pop.activity === 'employed'], ['family_couples', (p) => p.ext.pop.hhKids !== 0 && p.family.childrenIds.length > 0]];
  const sel = [];
  const order = o.personas ? o.personas.split(',') : ['settled_professionals', 'shift_workers', 'older_longterm'];
  for (const sid of order) { const wnt = want.find((x) => x[0] === sid); sel.push(pick(sid, wnt ? wnt[1] : () => true)); }
  const pj = (p) => { const q = p.ext.pop, h = lf.households[q.hh], wp = q.workplace; return `${p.firstName} ${p.lastName}, ${f(ageOf(p), 0)}${p.sex}, ${q.seg}, ${q.ethGroup.replace('_', ' ')}/${q.religion}${q.bornUK ? '' : ', born ' + q.birthplace}; ${q.activity}${q.occ ? ' ' + q.occ + ' ' + q.hours + 'h ' + q.contract : ''}${wp.kind === 'offmap' ? ' commute ' + wp.mode + ' ' + wp.mins + 'min to ' + wp.dest : wp.kind === 'onmap' ? ' (works on the street)' : ''}; ${h.arch} ${h.tenure} ${h.address}, ${h.members.length} in hh, ${f(q.yearsAtAddress, 1)}y here; net £${q.fin.net}/yr savings £${q.fin.savings}${q.fin.debt ? ' debt £' + q.fin.debt : ''}; ${q.car ? 'drives' : 'no car'}; Big5 O${f(p.personality.openness, 1)} C${f(p.personality.conscientiousness, 1)} E${f(p.personality.extraversion, 1)} A${f(p.personality.agreeableness, 1)} N${f(p.personality.neuroticism, 1)}`; };
  const tr = (p, title) => { // step a tick at a time from the start of the day, record thought changes
    const line = []; let last = ''; const start = w.tick; const d0 = w.calendar.dayIdxOf(w.tick);
    while (w.calendar.dayIdxOf(w.tick) === d0) { w.step(); if (p.thought !== last) { last = p.thought; line.push(`${hhmm(w, w.tick)} ${last}`); } }
    return line;
  };
  const tracers = sel.map((p) => ({ p, wd: null, we: null }));
  // advance to next Wednesday (term time) and Saturday, tracing all persons simultaneously
  const advanceTo = (pred) => { let g = 0; while (!pred() && g++ < 144 * 400) { w.run(1); } };
  const startOfDay = (dow) => { let g = 0; while (g++ < 144 * 14) { if (w.time.dow === dow && w.time.hour === 0 && w.time.minute === 0 && !w.time.bankHoliday) return; w.step(); } };
  const traceDay = (dow, key) => {
    let g = 0; while (g++ < 144 * 400) { startOfDay(dow); const r = w.time; if (key === 'wd' ? r.schoolDay : !r.bankHoliday) break; w.run(144); }
    const lines = tracers.map(() => []), last = tracers.map(() => ''); const d0 = w.calendar.dayIdxOf(w.tick);
    while (w.calendar.dayIdxOf(w.tick) === d0) { w.step(); tracers.forEach((t, i) => { if (t.p.thought !== last[i]) { last[i] = t.p.thought; lines[i].push(`${hhmm(w, w.tick)} ${last[i]}`); } }); }
    tracers.forEach((t, i) => { t[key] = lines[i]; });
  };
  traceDay(2, 'wd'); traceDay(5, 'we');
  const wk0 = performance.now(), tk0 = w.tick;
  out.push('PERSONAS (typical Wednesday in term / Saturday):');
  for (const t of tracers) {
    out.push(' * ' + pj(t.p));
    const ties = t.p.ext.pop.ties, on = ties.filter((x) => x.on).length, tier = ties.filter((x) => x.t <= 2);
    out.push(`   network: ${tier.filter((x) => x.t === 1).length} clique, ${tier.length} sympathy (${tier.filter((x) => !x.on).length} off-map), ${ties.filter((x) => x.t === 3).length} weak local; e.g. ${tier.slice(0, 5).map((x) => x.rel + (x.on ? '' : '*')).join(', ')}${ties.find((x) => x.fr) ? '; friction: ' + ties.find((x) => x.fr).fr : ''}`);
    const bio = t.p.memories.filter((m) => m.importance >= 3).slice(0, 4).map((m) => `${w.calendar.formatMonth(m.tick)} ${m.text}`);
    out.push('   past: ' + bio.join(' | '));
    out.push('   WED  ' + t.wd.map((x) => x.replace(/ at home$/, ' (home)')).join(' | '));
    out.push('   SAT  ' + t.we.map((x) => x.replace(/ at home$/, ' (home)')).join(' | '));
  }
  // ---- perf: remaining time of the requested years (fresh world to exclude trace stepping)
  const years = o.years || 1, w2 = createLarkfieldWorld(o.seed || 1);
  const ticks = Math.round(years * 365 * 144); const p0 = performance.now(); w2.run(ticks); const secs = (performance.now() - p0) / 1000;
  out.push(`PERF ${years}y = ${ticks} ticks in ${f(secs, 2)}s = ${Math.round(ticks / secs)} ticks/s at pop ${w2.living().length} (target >= 15000; routine+kernel only)  wakes/day/person ${f(w2.sched.stats.wakes / (ticks / 144) / w2.living().length, 1)}  hash ${w2.stateHash()}`);
  out.push(`total ${f((performance.now() - t0) / 1000, 1)}s`);
  return out;
}
