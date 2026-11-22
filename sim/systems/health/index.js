// HEALTH plugin (W1-D): chronic conditions by age (hypertension, diabetes, heart disease, stroke, COPD, cancer, dementia, arthritis, back pain, asthma, ...), acute respiratory illness with household
// contagion and epidemic waves, injuries, GP / A&E / referral waiting times (off-map city service), mental health (stress-vulnerability model: anxiety/depression episodes, treatment, recovery), loneliness,
// smoking / alcohol / drugs, disability, mortality calibrated to the life table with cause-of-death and terminal illness, bereavement and grief, funerals, wills.
//
// PERSON  p.ext.hl = { c:{cond:{t0,sev,dx,tx}}, mh:{st 0|1(anxiety)|2(depression), sev, tx, n, trig}, stress, S, lone/lonely, smoke, alc 0-2, drug 0-2, acute, injury, dying:{cause,tick}, grief[], adh, base }
//   mirrored for others: p.health (0..1 score), p.illness (acute, legacy shape), p.ext.pop.health {general, conds[], disabled, limiting}, p.ext.rt.sickDay (call in sick).
// QUERY  world.sys.health.query: status(pid) conditions(pid) mental(pid) services() prevalence() stats() lifeTable()
// COMMANDS  health.stress{pid,amount,why,cause} health.grief{pid,rel,strength,cause,name} | god: health.pandemic{weeks,severity,name} health.pandemicEnd{} health.heatwave{days,severity} health.heatwaveEnd{} health.illness{pid,name,severity} health.cure{pid,cond}
//           health.diagnose{pid,cond} health.injure{pid} | player: health.seekCare{pid} health.callInSick{pid} health.joinSupport{pid}
// EVENTS  health.diagnosis health.recovered health.ill health.crisis health.accident health.episode health.treatment health.substance health.outbreak  (+ life.death / life.funeral / life.will from mortality)
import { registerEvents, HANDLERS, ageOf, later, laterAt, months, days, clamp, bump } from '../life/util.js';
import { hlFor } from './init.js';
import { dayOfMonth, slotDay } from '../../util.js';
import { initService, weeklyAcute, dailySick, HEAT_MEAN_C, monthlyGP, acuteHandlers, startWave, injure, hs } from './acute.js';
import { monthlyChronic, chronicHandlers, updateScore } from './chronic.js';
import { monthlyMental, mentalHandlers, supportOf } from './mental.js';
import { monthlyMortality, healthDeathHandlers, applyGrief, diagnose, startDying, die, obituary } from './mortality.js';
import { qxAnnual, CAUSE_GROUP } from './tables.js';

Object.assign(HANDLERS, acuteHandlers, chronicHandlers, mentalHandlers, healthDeathHandlers);

const S = 'string', N = 'number', B = 'boolean';
export const HEALTH_EVENTS = [
  ['health.diagnosis', 'A chronic condition was diagnosed', { condition: S }],
  ['health.recovered', 'Recovered from an illness / episode / cancer', { condition: S }],
  ['health.ill', 'A notable acute illness (missed work or school)', { name: S, severity: N }],
  ['health.crisis', 'A health crisis: stroke, terminal illness, hospital admission', { what: S }],
  ['health.accident', 'An injury or accident needing A&E', { kind: S, severity: S }],
  ['health.episode', 'An anxiety / depression episode began', { kind: S, trigger: S }],
  ['health.treatment', 'Help sought or treatment started', { what: S }],
  ['health.substance', 'A substance-use change (dependent, stopped, recovery)', { what: S, change: S }],
  ['health.outbreak', 'An epidemic wave or heatwave started / ended', { name: S, phase: S, ill: N }],
];
const GRIEF_REL = { mother: 0.85, father: 0.85, 'son/daughter': 1, son: 1, daughter: 1, sister: 0.65, brother: 0.65, grandmother: 0.4, grandfather: 0.4 };

function ensureHl(w, people) { const rng = w.rngFor('health.init'); for (const p of people) if (!p.ext.hl && p.ext.pop) p.ext.hl = hlFor(w, p, rng, ageOf(w, p) < 2); }

function monthly(w) { // staggered: each person's monthly health step runs on their own day of the month (no 1st-of-month clump); mortality renormalises frailty over everyone
  const rng = w.rngFor('health.month', w.tick), all = w.living(), dom = dayOfMonth(w);
  ensureHl(w, all); const people = all.filter((p) => p.ext.life && slotDay(p.id, dom));
  monthlyChronic(w, rng, people); monthlyMental(w, rng, people); monthlyGP(w, rng, people); monthlyMortality(w, rng, people, all);
}
let SUBS = new WeakSet();
const STRESSORS = { 'money.arrears': 0.2, 'money.debt_spiral': 0.3, 'work.fired': 0.4, 'work.redundant': 0.4, 'home.eviction': 0.45, 'crime.burglary': 0.2, 'crime.assault': 0.35 };
function subscribe(w) {
  if (SUBS.has(w)) return;
  const reg = w.events.registry; let done = true;
  for (const [t, amt] of Object.entries(STRESSORS)) { if (!reg.has(t)) { done = false; continue; } if (w._hsub && w._hsub.has(t)) continue; (w._hsub || (w._hsub = new Set())).add(t); w.on(t, (ev) => { for (const id of ev.actors.slice(0, 3)) addStress(w, id, amt, t, ev.id); }); }
  if (reg.has('goal.effect') && !(w._hsub && w._hsub.has('goal.effect'))) {
    (w._hsub || (w._hsub = new Set())).add('goal.effect');
    w.on('goal.effect', (ev) => { const p = w.people.get(ev.actors[0]); if (!p || !p.alive || !p.ext.hl) return; const hl = p.ext.hl, want = ev.payload.want;
      if (want === 'healthier_body') { hl.adh = clamp(hl.adh + 0.05, 0, 1); p.health = Math.min(1, p.health + 0.01); } else if (want === 'sleeping_better') hl.stress = Math.max(0, hl.stress - 0.1);
      else if (want === 'support_in_place' && hl.mh.st) hl.mh.tx = 1; else if (want === 'moved_on') hl.stress = Math.max(0, hl.stress - 0.15); });
  } else if (!reg.has('goal.effect')) done = false;
  if (done) SUBS.add(w);
}
function addStress(w, pid, amount, why, cause) {
  const p = typeof pid === 'number' ? w.people.get(pid) : pid; if (!p || !p.alive || !p.ext.hl) return false; const hl = p.ext.hl;
  hl.stress = clamp(hl.stress + amount, 0, 1); if (amount >= 0.2) { hl.trigger = why; hl.trigT = w.tick; hl.trigEv = cause || 0; } return true;
}
const statusOf = (w, p) => { const hl = p.ext.hl; if (!hl) return null; const q = p.ext.pop.health; return { general: q.general, score: +p.health.toFixed(2), conditions: Object.keys(hl.c).filter((k) => hl.c[k].dx), undiagnosed: Object.keys(hl.c).filter((k) => !hl.c[k].dx), disabled: !!q.disabled, limiting: q.limiting, mental: hl.mh.st === 2 ? 'depression' : hl.mh.st === 1 ? 'anxiety' : 'well', lonely: !!hl.lonely, smoker: !!hl.smoke, alcohol: ['low-risk', 'hazardous', 'dependent'][hl.alc], drugs: hl.drug ? (hl.drug === 2 ? 'dependent' : 'regular') : 'none', stress: +(hl.S ?? hl.stress).toFixed(2), acute: hl.acute ? hl.acute.name : null, dying: hl.dying ? hl.dying.cause : null, injured: hl.injury ? hl.injury.kind : null }; };

export function createHealth() {
  let W = null;
  const plugin = {
    name: 'health', version: '1.0.0', deps: ['life'],
    init(world) {
      W = world; registerEvents(world, HEALTH_EVENTS);
      if (!world.stateKeys.includes('lf')) world.stateKeys.push('lf');
      initService(world);
      const rng = world.rngFor('health.init');
      for (const p of world.living()) if (p.ext.pop && !p.ext.hl) p.ext.hl = hlFor(world, p, rng, false);
      for (const p of world.living()) if (p.ext.hl) { const hl = p.ext.hl; hl.base = p.health; hl.burden0 = hl.burden0; }
    },
    clocks: {
      day: (w) => { subscribe(w); dailySick(w); monthly(w); },
      week: (w) => weeklyAcute(w, w.rngFor('health.week'), w.living()),
    },
    query: {
      status: (pid) => { const p = W.people.get(pid); return p ? statusOf(W, p) : null; },
      conditions: (pid) => { const p = W.people.get(pid); return p && p.ext.hl ? Object.keys(p.ext.hl.c).map((k) => ({ name: k, since: p.ext.hl.c[k].t0, diagnosed: !!p.ext.hl.c[k].dx, severity: +p.ext.hl.c[k].sev.toFixed(2) })) : []; },
      mental: (pid) => { const p = W.people.get(pid); if (!p || !p.ext.hl) return null; const m = p.ext.hl.mh; return { state: m.st === 2 ? 'depression' : m.st === 1 ? 'anxiety' : 'well', episodes: m.n, trigger: m.trig, treated: !!m.tx, support: +supportOf(W, p).toFixed(1), lonely: !!p.ext.hl.lonely }; },
      substance: (pid) => { const p = W.people.get(pid); return p && p.ext.hl ? { smoke: !!p.ext.hl.smoke, alcohol: p.ext.hl.alc, drugs: p.ext.hl.drug } : null; },
      services: () => ({ ...hs(W).svc, level: hs(W).level || 1, wave: hs(W).epi.wave ? { name: hs(W).epi.wave.name, weeks: hs(W).epi.wave.weeks } : null }),
      stats: () => ({ ...W.lf.life.stats }),
      lifeTable: () => ({ qx: (age, sex) => qxAnnual(W.pack.calibration, age, sex) }),
      obituary: (pid) => { const p = W.people.get(pid); return p && p.ext.life && p.ext.life.obit ? p.ext.life.obit : null; },
      wellbeing: (pid) => { const p = W.people.get(pid); if (!p || !p.ext.hl) return null; const hl = p.ext.hl; return { mood: p.mood, stress: +(hl.S ?? 0).toFixed(2), lonely: !!hl.lonely, grieving: hl.grief.length > 0 }; },
    },
    commands: {
      'health.stress': (w, a) => addStress(w, a.pid, a.amount ?? 0.2, a.why || 'stress', a.cause),
      'health.grief': (w, a) => { const p = w.people.get(a.pid); if (!p) return false; applyGrief(w, p, a.rel, clamp((a.strength ?? 0.5) * (GRIEF_REL[a.rel] ?? 0.5) * 1.3, 0, 1), a.cause, a.name); return true; },
      'health.pandemic': (w, a) => startWave(w, w.rngFor('health.cmd'), { name: a.name || 'a new respiratory virus', weeks: a.weeks ?? 14, beta: 1.6 + 2.4 * (a.severity ?? 0.5), sev: 1 + 1.2 * (a.severity ?? 0.5), mort: 0.2 + 0.8 * (a.severity ?? 0.5) }),
      // god: a weather SHOCK of `anomaly` degrees above the seasonal norm for `days` days (severity 0..1 -> +6..+12 C). Whether it is a heatwave is decided by the temperature that results (HEAT_MEAN_C for 3+ days, acute.js):
      // in July it is, in November it is a mild spell. Returns what the season makes of it.
      'health.heatwave': (w, a) => { const sev = a.severity ?? 0.5, anomaly = 6 + 6 * sev, before = w.weatherShock ? w.weatherShock.anomaly : 0; w.weatherShock = { kind: 'heat', until: w.tick + days(a.days ?? 6), anomaly }; w.weather.temp += anomaly - before; w.weather.shock = 'heat';
        const reaches = w.weather.temp >= HEAT_MEAN_C; w.emit('health.outbreak', { salience: 0.5, tags: ['heat', 'god'], payload: { name: reaches ? 'heat spell' : 'warm spell', phase: 'start', ill: 0 } }); return { ok: true, anomaly, temp: w.weather.temp, heatwave: reaches }; },
      'health.heatwaveEnd': (w) => { const s = w.weatherShock; if (!s) return false; w.weather.temp -= s.anomaly; w.weatherShock = null; w.weather.shock = null; return true; },
      'health.pandemicEnd': (w) => { const e = hs(w).epi.wave; if (!e) return false; w.emit('health.outbreak', { salience: 0.4, tags: ['epidemic', 'god'], cause: e.ev || 0, payload: { name: e.name, phase: 'over', ill: e.cases || 0 } }); hs(w).epi.wave = null; return true; },
      'health.illness': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.hl || p.ext.hl.acute) return false; const hl = p.ext.hl, T = w.tick, sev = a.severity ?? 2, dur = a.days ?? (sev === 1 ? 4 : sev === 2 ? 8 : 16); hl.acute = { name: a.name || 'flu', sev, t0: T, until: T + days(dur), hosp: false }; p.illness = { name: hl.acute.name, severity: sev, contagious: true, sinceTick: T }; hs(w).ill.push(p.id); later(w, days(dur), 'acute.end', { pid: p.id, t0: T }); w.emit('health.ill', { actors: [p.id], salience: sev >= 2 ? 0.4 : 0.2, cause: a.cause || 0, tags: ['illness', 'god'], payload: { name: hl.acute.name, severity: sev } }); return true; },
      'health.cure': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.hl) return false; const hl = p.ext.hl; const names = a.cond ? [a.cond] : Object.keys(hl.c); let n = 0; for (const k of names) if (hl.c[k]) { delete hl.c[k]; n++; const q = p.ext.pop.health; q.conds = q.conds.filter((x) => x !== k); w.emit('health.recovered', { actors: [p.id], salience: 0.35, tags: ['illness', 'god'], payload: { condition: k } }); } if (!a.cond) { hl.mh.st = 0; hl.acute = null; p.illness = null; hl.injury = null; } if (hl.dying && (!a.cond || hl.dying.cause === a.cond)) hl.dying = null; updateScore(w, p, hl); return n > 0; },
      'health.diagnose': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.hl) return false; const hl = p.ext.hl; if (!hl.c[a.cond]) hl.c[a.cond] = { t0: w.tick, sev: 0.3, dx: null, tx: 0 }; diagnose(w, p, a.cond, false); return true; },
      'health.injure': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.hl) return false; injure(w, w.rngFor('health.cmd', w.tick), p, p.ext.hl, ageOf(w, p)); return true; },
      'health.seekCare': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.hl) return false; bump(w, 'gp'); const hl = p.ext.hl; if (hl.mh.st) later(w, days(w.lf.health.svc.gpWait), 'mh.tx', { pid: p.id }); laterAt(w, days(Math.min(14, w.lf.health.svc.gpWait)), 'gp.visit', { pid: p.id }); return { waitDays: Math.round(w.lf.health.svc.gpWait) }; },
      'health.callInSick': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.rt) return false; p.ext.rt.sickDay = w.calendar.dayIdxOf(w.tick); return true; },
      'health.joinSupport': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.ext.hl) return false; const hl = p.ext.hl; hl.stress = Math.max(0, hl.stress - 0.1); if (hl.mh.st) hl.mh.tx = Math.max(hl.mh.tx, 0.6); if (hl.alc === 2 && w.rngFor('health.support', p.id, w.tick).chance(0.2)) hl.alc = 1; return true; },
    },
    affordances(p) {
      const w = W; if (!w || !p.ext || !p.ext.hl) return null; const hl = p.ext.hl, out = [];
      if (hl.acute || hl.mh.st || p.health < 0.7 || Object.keys(hl.c).length) out.push({ id: 'health.seek_care:' + p.id, verb: 'seek_care', actor: p.id, effects: [{ kind: 'cmd', name: 'health.seekCare', args: { pid: p.id } }], cost: { time: 3 }, tags: ['health'] });
      if (hl.acute && p.ext.pop.activity === 'employed') out.push({ id: 'health.call_in_sick:' + p.id, verb: 'call_in_sick', actor: p.id, effects: [{ kind: 'cmd', name: 'health.callInSick', args: { pid: p.id } }], cost: { time: 0.2 }, tags: ['health', 'work'] });
      if (hl.mh.st || hl.alc === 2 || hl.grief.length) out.push({ id: 'health.join_support:' + p.id, verb: 'join_support_group', actor: p.id, effects: [{ kind: 'cmd', name: 'health.joinSupport', args: { pid: p.id } }], cost: { time: 4, social: 1 }, tags: ['health', 'social'] });
      return out;
    },
  };
  return plugin;
}
export default createHealth();
export { obituary, die, startDying, CAUSE_GROUP };
