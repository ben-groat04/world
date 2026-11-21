// Acute illness and the service layer: seasonal respiratory illness with household contagion, rare epidemic waves ("covid-like"), heatwaves, injuries and accidents, A&E and GP use,
// and the off-map city health service state (GP wait, A&E wait, specialist referral wait, talking-therapy wait) which lengthens diagnosis delay and depresses recovery in bad winters.
import { clamp, wpick, ageOf, later, laterAt, months, days, hhOf, bump, rec } from '../life/util.js';

export const SEAS = [1.75, 1.65, 1.2, 0.8, 0.6, 0.5, 0.45, 0.5, 0.9, 1.25, 1.5, 1.7];
const ILL = [['a cold', 5], ['flu', 3], ['a chest infection', 2], ['a stomach bug', 2.5], ['a streaming cold', 3], ['tonsillitis', 1]];

export function initService(w) {
  w.lf.health = { ver: 1, epi: { flu: 1, wave: null, fluYear: -1 }, svc: { gpWait: 8, aeWait: 3.4, refWait: 14, talkWait: 10 }, ill: [], stats: {}, rec: {}, mortMult: 1, heat: null, incScale: 1, mhScale: 1, loneThr: null };
}
export const hs = (w) => w.lf.health;

/** weekly: epidemiology + service state + illness + injuries */
export function weeklyAcute(w, rng, people) {
  const st = hs(w), epi = st.epi, t = w.time, T = w.tick;
  // flu-season severity re-drawn each autumn; rare pandemic waves
  if (t.month === 9 && epi.fluYear !== t.year) { epi.fluYear = t.year; epi.flu = Math.exp(rng.gauss(0, 0.28)) * (rng.chance(0.15) ? 1.9 : 1); }
  if (!epi.wave && rng.chance(0.028 / 52)) startWave(w, rng, { name: 'a new respiratory virus', weeks: rng.int(12, 20), beta: rng.float(2, 3.6), sev: rng.float(1.3, 2.0), mort: rng.float(0.25, 0.7) });
  let wave = 0;
  if (epi.wave) { const e = epi.wave, k = (T - e.start) / (e.weeks * 7 * 144); if (k >= 1) { w.emit('health.outbreak', { salience: 0.4, tags: ['epidemic'], cause: e.ev || 0, payload: { name: e.name, phase: 'over', ill: e.cases || 0 } }); epi.wave = null; } else wave = e.beta * Math.sin(Math.PI * k) ** 2; }
  const heat = st.heat && st.heat.until > T ? st.heat.mort : 0; if (st.heat && st.heat.until <= T) st.heat = null;
  const lvl = SEAS[t.month] * epi.flu + wave, sevF = epi.wave ? epi.wave.sev : 1;
  st.level = lvl; st.mortMult = 1 + 0.05 * Math.max(0, lvl - 1) + (epi.wave ? wave / epi.wave.beta * epi.wave.mort : 0) + heat;
  st.svc.gpWait = clamp(7 + 4 * (lvl - 1) + 6 * wave + rng.gauss(0, 0.8), 3, 40); st.svc.aeWait = clamp(3.1 + 1.0 * (lvl - 1) + 1.5 * wave + rng.gauss(0, 0.2), 2, 12);
  st.svc.refWait = clamp(14 + 2 * (lvl - 1) + 4 * wave + rng.gauss(0, 0.4), 8, 40); st.svc.talkWait = clamp(10 + 1.2 * (lvl - 1) + 2 * wave + rng.gauss(0, 0.3), 5, 30);
  // household contagion map from currently ill
  const hhIll = new Map(); for (const id of st.ill) { const q = w.people.get(id); if (q && q.alive && q.ext.hl && q.ext.hl.acute) { const h = q.ext.pop.hh; hhIll.set(h, (hhIll.get(h) || 0) + 1); } }
  const school = t.schoolDay !== false;
  for (const p of people) {
    const hl = p.ext.hl; if (!hl || hl.acute || hl.dying) continue; const age = ageOf(w, p), q = p.ext.pop;
    // injuries
    const ai = (age < 5 ? 0.075 : age < 15 ? 0.09 : age < 30 ? (p.sex === 'M' ? 0.075 : 0.05) : age < 60 ? (p.sex === 'M' ? 0.045 : 0.035) : age < 75 ? 0.04 : 0.11) * (hl.alc ? 1.4 : 1) * (hl.drug ? 1.5 : 1) * (q.health.limiting ? 1.4 : 1) / 52;
    if (!hl.injury && rng.chance(ai)) { injure(w, rng, p, hl, age); continue; }
    // illness
    const ageM = age < 5 ? 2.4 : age < 15 ? 1.8 : age < 65 ? 1 : 0.75;
    const r = 0.0105 * lvl * ageM * (age >= 3 && age < 17 && school ? 1.2 : 1) * (hl.imm > T ? 0.12 : 1) * (1 + 3.2 * (hhIll.get(q.hh) || 0)) * (hl.smoke ? 1.25 : 1) * (hl.c.COPD ? 1.7 : 1) * (hl.c.asthma ? 1.3 : 1) * (1 + 0.25 * Math.min(2, hl.S || 0));
    if (rng.chance(Math.min(0.6, r))) fall(w, rng, p, hl, age, sevF);
  }
}
function fall(w, rng, p, hl, age, sevF) {
  const wave = w.lf.health.epi.wave, old = age >= 70 || hl.c.COPD || hl.c.diabetes || hl.c.dementia || hl.c['heart disease'];
  const s3 = (0.075 * sevF) * (old ? 2.4 : age < 5 ? 0.8 : 1), s2 = 0.3 * Math.sqrt(sevF);
  const u = rng.next(), sev = u < s3 ? 3 : u < s3 + s2 ? 2 : 1;
  const name = wave && rng.chance(0.75) ? wave.name : wpick(rng, ILL);
  const dur = sev === 1 ? rng.int(3, 6) : sev === 2 ? rng.int(5, 10) : rng.int(9, 20);
  const hosp = sev === 3 && rng.chance(old ? 0.5 : 0.18);
  const T = w.tick; hl.acute = { name, sev, t0: T, until: T + days(dur + (hosp ? 7 : 0)), hosp };
  p.illness = { name, severity: sev, contagious: true, sinceTick: T }; hl.imm = hl.acute.until + months(2.5);
  w.lf.health.ill.push(p.id); if (wave) wave.cases = (wave.cases || 0) + 1;
  later(w, days(dur + (hosp ? 7 : 0)), 'acute.end', { pid: p.id, t0: T });
  bump(w, 'ill'); bump(w, 'ill_sev' + sev);
  let ev = 0;
  if (sev >= 2) { ev = w.emit('health.ill', { actors: [p.id], salience: hosp ? 0.45 : 0.1, tags: ['illness'], payload: { name, severity: sev } }); hl.acute.ev = ev; }
  if (hosp) { w.emit('health.crisis', { actors: [p.id], salience: 0.5, cause: ev, tags: ['illness', 'hospital'], payload: { what: 'admitted to hospital with ' + name } }); bump(w, 'admissions'); }
  if (sev >= 3 || (sev === 2 && rng.chance(0.3))) { bump(w, 'gp'); if (sev === 3) { bump(w, 'ae'); } }
}
export function injure(w, rng, p, hl, age) {
  const T = w.tick, M = p.sex === 'M';
  const kind = age >= 75 ? wpick(rng, [['fall', 8], ['domestic', 1.5], ['road', 0.5]]) : age < 15 ? wpick(rng, [['playground fall', 4], ['sport', 2], ['road', 1], ['domestic', 2]]) : age < 35 ? wpick(rng, [['sport', 3 * (M ? 1.5 : 0.8)], ['road', 1.6], ['fall', 1.5], ['work', 1.2], ['assault', 0.6 * (M ? 2 : 0.5)], ['domestic', 1]]) : wpick(rng, [['fall', 3], ['work', 1.4], ['road', 1.2], ['domestic', 2], ['sport', 1.2]]);
  const u = rng.next(), old = age >= 75, sev = u < 0.62 - (old ? 0.2 : 0) ? 'minor' : u < 0.92 - (old ? 0.1 : 0) ? 'fracture' : 'serious', sn = sev === 'minor' ? 0.15 : sev === 'fracture' ? 0.55 : 0.85;
  const wk = sev === 'minor' ? rng.int(1, 3) : sev === 'fracture' ? rng.int(6, 12) : rng.int(10, 26);
  hl.injury = { kind, sev: sn, until: T + days(wk * 7), what: sev };
  bump(w, 'injuries'); bump(w, 'ae');
  const ev = w.emit('health.accident', { actors: [p.id], salience: sev === 'minor' ? 0.15 : sev === 'fracture' ? 0.35 : 0.55, tags: ['accident', kind], payload: { kind, severity: sev } });
  if (old && sev !== 'minor' && rng.chance(0.4) && !hl.c['mobility impairment']) { hl.c['mobility impairment'] = { t0: T, sev: 0.35, dx: T, tx: 0 }; const q = p.ext.pop.health; q.conds = [...q.conds, 'mobility impairment']; }
  laterAt(w, days(rng.float(0, 1.5)), 'ae.visit', { pid: p.id, ev });
}
export const acuteHandlers = {
  'acute.end'(w, d) {
    const p = w.people.get(d.pid); if (!p || !p.alive || !p.ext.hl) return; const hl = p.ext.hl; if (!hl.acute || hl.acute.t0 !== d.t0) return;
    const a = hl.acute; hl.acute = null; p.illness = null; const i = w.lf.health.ill.indexOf(p.id); if (i >= 0) w.lf.health.ill.splice(i, 1);
    if (a.sev >= 3 || a.hosp) w.emit('health.recovered', { actors: [p.id], salience: 0.2, cause: a.ev || 0, tags: ['illness'], payload: { condition: a.name } });
  },
  'ae.visit'(w, d) {
    const p = w.people.get(d.pid); if (!p || !p.alive || !w.commands.has('routine.insert')) return;
    try { w.cmd('routine.insert', { pid: p.id, from: w.tick + 1, to: w.tick + Math.round(6 * w.lf.health.svc.aeWait) + 6, label: 'In A&E', ptype: 3, dest: 'hospital_ae' }); } catch (e) { /* plan not built */ }
  },
  'gp.visit'(w, d) {
    const p = w.people.get(d.pid); if (!p || !p.alive || !w.commands.has('routine.insert')) return; const gp = w.rtx && w.rtx.gpB; if (gp == null) return;
    try { w.cmd('routine.insert', { pid: p.id, from: w.tick + 1, to: w.tick + 8, label: 'At the GP surgery', ptype: 1, bid: gp }); } catch (e) { /* plan not built */ }
  },
};
export function startWave(w, rng, o) {
  const epi = hs(w).epi; if (epi.wave) return false;
  epi.wave = { name: o.name, start: w.tick, weeks: o.weeks, beta: o.beta, sev: o.sev, mort: o.mort, cases: 0 };
  epi.wave.ev = w.emit('health.outbreak', { salience: 0.6, tags: ['epidemic'], payload: { name: o.name, phase: 'start', ill: 0 } }); return true;
}
/** daily: sick days for ill workers (routine layer reads rt.sickDay) */
export function dailySick(w) {
  const st = hs(w), D = w.calendar.dayIdxOf(w.tick);
  for (let i = 0; i < st.ill.length; i++) { const p = w.people.get(st.ill[i]); if (!p || !p.alive) continue; const a = p.ext.hl.acute; if (a && a.sev >= 2 && p.ext.rt) p.ext.rt.sickDay = D; else if (a && p.ext.rt && w.rngFor('health.sickday', p.id, D).chance(0.4)) p.ext.rt.sickDay = D; }
  for (const p of w.living()) { const hl = p.ext.hl; if (hl && hl.injury && hl.injury.sev >= 0.5 && p.ext.rt && p.ext.pop.activity === 'employed') p.ext.rt.sickDay = D; }
}
/** monthly: GP consultation counts by age/sex/conditions (statistics + a few on-map surgery visits) */
export function monthlyGP(w, rng, people) {
  for (const p of people) {
    const hl = p.ext.hl; if (!hl) continue; const age = ageOf(w, p);
    let l = (age < 5 ? 6 : age < 16 ? 2.4 : age < 45 ? (p.sex === 'F' ? 4.6 : 2.3) : age < 65 ? 5 : age < 75 ? 7 : 10) + 2.2 * Math.min(4, Object.keys(hl.c).length) + (hl.mh.st ? 3 : 0);
    l /= 12; let n = 0; while (l > 0) { if (rng.chance(Math.min(l, 1))) n++; l -= 1; }
    // non-injury A&E attendances (fevers, chest pain, exacerbations): statistics only
    if (rng.chance((age < 5 ? 0.32 : age < 16 ? 0.12 : age < 65 ? 0.13 : 0.26) * (1 + 0.5 * Math.min(3, Object.keys(hl.c).length)) / 12)) bump(w, 'ae');
    if (n) { bump(w, 'gp', n); hl.gp.n12 = hl.gp.n12 * 0.92 + n; if (age >= 17 && rng.chance(0.2)) laterAt(w, days(rng.int(1, 28)), 'gp.visit', { pid: p.id }); }
  }
}
