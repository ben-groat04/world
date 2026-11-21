// Mortality, death, bereavement, funerals and wills. Each month everyone's death probability is the calibration life table (single-year qx by sex) scaled by individual frailty
// (conditions, smoking, drink, drugs, injury, severe acute illness) renormalised within age/sex bands so the population-level hazard tracks the table while WHO dies depends on health.
// Cause is drawn per person from age-band cause weights boosted by their conditions; chronic causes give a terminal phase (weeks-months) that families notice, sudden causes do not.
import { clamp, wpick, ageOf, fullName, later, months, days, years, tieOf, hhOf, rec, bump, newMetro, closeOnMap } from '../life/util.js';
import { afterDeath } from '../life/after.js';
import { qxAnnual, FRAIL, CAUSES, CAUSE_BASE, causeBand, TERMINAL, DEATH_TEXT, CAUSE_GROUP } from './tables.js';

export function frailOf(p) {
  const hl = p.ext.hl; let x = 0;
  for (const k in hl.c) { const c = hl.c[k]; x += (FRAIL[k] ?? 0.2) * (0.6 + 0.8 * c.sev) * (1 - 0.3 * c.tx * hl.adh); }
  if (hl.mh.st > 0) x += FRAIL['depression/anxiety'] * (0.5 + hl.mh.sev);
  x += hl.smoke * 0.35 + (hl.alc === 2 ? 0.9 : hl.alc === 1 ? 0.1 : 0) + hl.drug * 0.7;
  if (p.ext.pop.health.limiting === 2) x += 0.25;
  if (hl.injury) x += 0.7 * hl.injury.sev;
  if (hl.acute && hl.acute.sev >= 3) x += 0.8;
  return Math.exp(x);
}
const bucket = (a, sex) => `${sex}${a < 15 ? 0 : a < 30 ? 1 : Math.min(8, Math.floor(a / 10))}`;

export function monthlyMortality(w, rng, people) {
  const cal = w.pack.calibration, st = w.lf.health, mult = st.mortMult || 1;
  const sums = new Map(), list = [];
  for (const p of people) {
    const hl = p.ext.hl; if (!hl || hl.dying) continue; const a = ageOf(w, p); const f = hl.frail = frailOf(p), k = bucket(a, p.sex);
    const s = sums.get(k) || (sums.set(k, [0, 0]).get(k)); s[0] += f; s[1]++; list.push([p, a, f, k]);
  }
  for (const [p, a, f, k] of list) {
    const s = sums.get(k), pm = qxAnnual(cal, a, p.sex) / 12 * (f / (s[0] / s[1])) * (a >= 65 ? mult : 1) * (a < 1 ? 1 : 1);
    if (rng.chance(Math.min(0.3, pm))) startDying(w, p, pickCause(w, rng, p, a));
  }
}

export function pickCause(w, rng, p, a) {
  const hl = p.ext.hl, b = causeBand(a), has = (k) => !!hl.c[k], M = p.sex === 'M';
  const ws = CAUSES.map((c) => {
    let x = CAUSE_BASE[c][b];
    switch (c) {
      case 'perinatal': x = a < 1 ? 6 : 0; break;
      case 'cancer': x *= has('cancer') ? 30 : 0.3; x *= hl.smoke ? 1.5 : 1; break;
      case 'heart disease': x *= has('heart disease') ? 14 : 0.3; x *= (has('hypertension') ? 1.5 : 1) * (has('diabetes') ? 1.8 : 1) * (hl.smoke ? 1.4 : 1); break;
      case 'stroke': x *= has('stroke') ? 12 : 0.35; x *= has('hypertension') ? 2 : 1; break;
      case 'COPD': x *= has('COPD') ? 30 : 0.04; x *= hl.smoke ? 2 : 1; break;
      case 'dementia': x *= has('dementia') ? 28 : 0; break;
      case 'pneumonia': x *= (1 + (hl.acute ? 6 : 0)) * (has('dementia') ? 1.8 : 1) * (has('COPD') ? 2 : 1); break;
      case 'liver disease': x *= hl.alc === 2 ? 25 : hl.alc === 1 ? 3 : 0.4; break;
      case 'suicide': x *= (hl.mh.st === 2 ? 9 : hl.mh.st === 1 ? 3 : 0.4) * (M ? 2.8 : 1) * (1 + hl.stress); break;
      case 'overdose': x *= hl.drug ? 30 : 0.1; break;
      case 'accident': x *= a >= 75 ? (1 + (has('mobility impairment') ? 1 : 0)) : 1; x *= hl.alc ? 1.4 : 1; break;
      case 'road': x *= M ? 1.5 : 0.7; break;
      case 'assault': x *= M ? 2.5 : 0.5; break;
      case 'infection': x *= hl.acute ? 3 : 1; break;
      default: break;
    }
    if (a < 1 && c !== 'perinatal' && c !== 'other' && c !== 'infection' && c !== 'accident') x *= 0.1;
    return [c, x];
  });
  return wpick(rng, ws);
}

/** a death has been rolled: chronic causes get a terminal illness the family can see; sudden ones die within days */
export function startDying(w, p, cause) {
  const hl = p.ext.hl, rng = w.rngFor('health.dying'); if (hl.dying) return;
  const T = w.tick, [lo, hi] = TERMINAL[cause] || [1, 30];
  const give = (k, sev, dx) => { if (!hl.c[k]) hl.c[k] = { t0: T - months(rng.float(1, 6)), sev, dx, tx: 0 }; };
  let ev = 0;
  if (cause === 'cancer' && !hl.c.cancer) { give('cancer', 0.8, T + days(rng.int(1, 10))); ev = diagnose(w, p, 'cancer', true); }
  else if (cause === 'cancer' && !hl.c.cancer.dx) { hl.c.cancer.dx = T; ev = diagnose(w, p, 'cancer', true); }
  else if (cause === 'heart disease') give('heart disease', 0.7, null);
  else if (cause === 'stroke') { give('stroke', 0.8, T); if (hl.c.stroke.dx === T) ev = w.emit('health.crisis', { actors: [p.id], salience: 0.55, tags: ['illness'], payload: { what: 'stroke' } }); }
  else if (cause === 'COPD') give('COPD', 0.7, T);
  else if (cause === 'liver disease') { hl.alc = Math.max(hl.alc, 1); }
  const term = lo + (hi - lo) * Math.pow(rng.next(), 1.4);
  const when = days(term + rng.float(0, 27)); // jitter spreads deaths across the month
  hl.dying = { cause, tick: T + when, from: T }; p.health = Math.min(p.health, 0.3);
  if (term >= 14) { ev = ev || w.emit('health.crisis', { actors: [p.id], salience: 0.5, tags: ['illness', 'terminal'], payload: { what: cause } }); hl.dying.ev = ev; }
  later(w, when, 'die', { pid: p.id, cause });
}

export function diagnose(w, p, cond, terminal) {
  const hl = p.ext.hl, c = hl.c[cond]; if (!c) return 0; c.dx = w.tick;
  const q = p.ext.pop.health; if (!q.conds.includes(cond)) q.conds = [...q.conds, cond].slice(-6);
  const ev = w.emit('health.diagnosis', { actors: [p.id], salience: cond === 'cancer' || cond === 'dementia' || cond === 'stroke' ? 0.55 : 0.25, tags: ['illness'], payload: { condition: cond } });
  w.addMemory(p, { type: 'health', text: `Diagnosed with ${cond}.`, otherIds: [], weight: -0.55, importance: cond === 'cancer' || cond === 'stroke' ? 5 : 3 });
  w.moodlet(p, 'dx', 'Health scare', -0.25, months(2));
  hl.stress = clamp(hl.stress + (cond === 'cancer' ? 0.45 : cond === 'hypertension' ? 0.05 : 0.15), 0, 1);
  bump(w, 'dx_' + cond);
  return ev;
}

// ---------------------------------------------------------------- death
export function obituary(w, p) {
  const age = Math.floor(ageOf(w, p)), q = p.ext.pop;
  try {
    if (w.text && w.text.engine) { const s = w.text.render('obit', { a: p, world: w, p: { years: Math.round(q.yearsAtAddress || 0), job: q.occ || '', kids: p.ext.life.parity || 0 }, genre: 'obit' }); if (typeof s === 'string' && s.length > 20 && !/^\[/.test(s)) return s; }
  } catch (e) { /* fall through */ }
  const kids = p.ext.life.parity; return `${fullName(p)}, ${age}, died on ${w.formatDate(w.tick)}${kids ? `, survived by ${kids} child${kids > 1 ? 'ren' : ''}` : ''}.`;
}

const WORSHIP = { Muslim: 'mosque', Christian: 'church' };
export function die(w, p, cause) {
  if (!p.alive) return;
  const hl = p.ext.hl, L = p.ext.life, age = ageOf(w, p), q = p.ext.pop, rng = w.rngFor('health.die');
  const group = CAUSE_GROUP[cause] || cause, where = age >= 80 ? wpick(rng, [['hospital', 0.42], ['home', 0.2], ['care home', 0.3], ['hospice', 0.08]]) : age >= 50 ? wpick(rng, [['hospital', 0.5], ['home', 0.3], ['hospice', 0.2]]) : 'hospital';
  const dyingEv = hl.dying ? hl.dying.ev || 0 : 0, hh = hhOf(w, p), solo = hh ? hh.members.filter((id) => { const x = w.people.get(id); return x && x.alive && x.id !== p.id && ageOf(w, x) >= 18; }).length === 0 : false;
  const money = p.money;
  w.killPerson(p, cause);
  const mourn = afterDeath(w, p);
  L.death = { tick: w.tick, cause, age: +age.toFixed(1), where };
  // grief for the people left behind
  const ranked = mourn.map((m) => ({ ...m, g: griefStrength(m) })).sort((a, b) => b.g - a.g);
  const ev = w.emit('life.death', { actors: [p.id, ...ranked.slice(0, 14).map((m) => m.id)], salience: age < 40 ? 0.85 : age < 65 ? 0.65 : 0.5, cause: dyingEv, tags: ['death', cause], payload: { cause: DEATH_TEXT[cause] || cause, age: Math.floor(age), group, where } });
  for (const m of ranked) applyGrief(w, w.people.get(m.id), m.rel || m.k, m.g, ev, fullName(p));
  L.death.ev = ev; L.obit = obituary(w, p);
  rec(w, 'deaths', [w.tick, +age.toFixed(1), p.sex, cause, where, !!(hl.dying), q.activity]); bump(w, 'deaths'); bump(w, 'death_' + cause);
  // will / estate: money pays out through its own death listener; housing is asked to pass the tenancy to the household
  const kids = (p.family.childrenIds || []).filter((id) => { const k = w.people.get(id); return k && k.alive; });
  const spouse = ranked.find((m) => /partner|husband|wife|spouse/.test(m.rel || '') || m.k === 'partner');
  const heirs = spouse ? [spouse.id] : kids;
  if (money > 0 || heirs.length) w.emit('life.will', { actors: [p.id, ...heirs.slice(0, 5)], salience: 0.2, cause: ev, tags: ['money', 'death'], payload: { heirs, estate: Math.round(Math.max(0, money)) } });
  if (hh && (solo || heirs.length) && w.commands.has('housing.inherit')) { try { w.cmd('housing.inherit', { from: p.id, heirs, hh: hh.id, cause: ev }); } catch (e) { /* housing decides */ } }
  // funeral
  const dayStart = w.tick - Math.round(w.time.hourFloat * 6), delay = q.religion === 'Muslim' ? rng.int(1, 3) : rng.int(8, 15);
  const ft = dayStart + delay * 144 + 60 + rng.int(0, 24);
  later(w, ft - w.tick, 'funeral', { pid: p.id, who: ranked.filter((m) => m.g >= 0.3).slice(0, 12).map((m) => m.id), rel: q.religion, relig: q.religiosity, ev });
  return ev;
}
const griefStrength = (m) => {
  const r = m.rel || '', k = m.k;
  const base = /partner|husband|wife|spouse/.test(r) || k === 'partner' ? 1.0 : /^(son|daughter)$/.test(r) ? 1.0 : /^(mother|father)$/.test(r) ? 0.85 : /^(sister|brother)$/.test(r) ? 0.65 : /grand/.test(r) ? 0.4 : k === 'kin' ? 0.35 : k === 'friend' ? 0.4 : k === 'ex' ? 0.1 : 0.12;
  return clamp(base * (0.35 + m.s) * (m.t === 1 ? 1.1 : 0.85), 0, 1);
};
export function applyGrief(w, o, rel, g, cause, name) {
  if (!o || !o.alive || !o.ext.hl || g < 0.12) return;
  const hl = o.ext.hl, long = /partner|husband|wife|spouse|son|daughter|ex-partner/.test(rel || ''), dur = long ? months(10 + 6 * g) : /mother|father/.test(rel || '') ? months(6 + 4 * g) : months(1.5 + 4 * g);
  hl.grief.push({ until: w.tick + dur, sev: +g.toFixed(2), who: name || '' });
  hl.stress = clamp(hl.stress + 0.65 * g, 0, 1); hl.trigger = 'bereavement'; hl.trigT = w.tick;
  w.moodlet(o, 'grief', 'Grieving', -0.7 * g, dur);
  if (g >= 0.6) w.addMemory(o, { type: 'death', text: `${name || 'Someone close'} died.`, otherIds: [], weight: -0.9, importance: 5 });
  bump(w, 'griefs');
}

export const healthDeathHandlers = {
  die(w, d) { const p = w.people.get(d.pid); if (p && p.alive && p.ext.hl && p.ext.hl.dying) die(w, p, d.cause); },
  funeral(w, d) {
    const dead = w.people.get(d.pid); if (!dead) return;
    const rtype = WORSHIP[d.rel], venue = rtype && d.relig > 0.35 ? w.map.lf.venues.find((v) => v.template === rtype) : null;
    const t = w.tick, to = t + 36;
    const attendees = d.who.filter((id) => { const x = w.people.get(id); return x && x.alive; });
    for (const id of attendees.slice(0, 10)) {
      if (!w.commands.has('routine.insert')) break;
      try { w.cmd('routine.insert', venue ? { pid: id, from: t + 1, to, label: `Attending ${dead.firstName}'s funeral`, ptype: 1, bid: venue.buildingId } : { pid: id, from: t + 1, to: to + 12, label: `At ${dead.firstName}'s funeral`, ptype: 3, dest: 'other_neighbourhood' }); } catch (e) { /* plan not built */ }
    }
    w.emit('life.funeral', { actors: [dead.id, ...attendees.slice(0, 10)], place: venue ? venue.buildingId : null, salience: 0.35, cause: d.ev || 0, tags: ['death', 'funeral'], payload: { offmap: !venue } });
    bump(w, 'funerals');
  },
};
