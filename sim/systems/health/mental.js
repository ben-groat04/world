// Mental health, loneliness and substance use. Stress-vulnerability model: a decaying stress load (breakup, bereavement, debt, job loss, caring, newborn, illness) on top of
// personality vulnerability and history sets the monthly chance of an anxiety/depression episode; recovery rises with treatment, support ties and falling stress. Loneliness comes from the tie
// structure (close ties on and off the map, partner) plus isolation flags. Smoking / alcohol / drug use follow age, segment, religion, personality and stress, and feed mortality.
import { clamp, clamp01, sigm, wpick, ageOf, later, months, days, years, hhOf, rec, bump, yearsSince } from '../life/util.js';

const moneyStress = (w, p) => { const m = w.sys && w.sys.money; if (!m) return 0.25; try { const x = m.query.pressure(p.id); return x ? clamp01(x.stress || 0) : 0.25; } catch (e) { return 0.25; } };

/** closeness-weighted number of supportive ties */
export function supportOf(w, p) {
  let s = 0; const L = p.ext.life;
  for (const t of p.ext.pop.ties) { if (t.t > 2 || t.k === 'friction' || t.k === 'ex') continue; const wgt = t.t === 1 ? 0.7 : 0.3; s += wgt * (t.on ? 1 : 0.55) * (0.5 + t.s); }
  if (L && L.part) s += L.part.lat ? 0.8 : 1.3;
  return s;
}
function loneScore(w, p, age) {
  const hl = p.ext.hl, L = p.ext.life, q = p.ext.pop, hh = hhOf(w, p), E = p.personality.extraversion, N = p.personality.neuroticism;
  const live = hh ? hh.members.reduce((n, id) => { const x = w.people.get(id); return n + (x && x.alive ? 1 : 0); }, 0) : 1;
  let iso = 0; if (live <= 1) iso += 0.5; if (age >= 75) iso += 0.25; if (L.mar === 'widowed' && L.widowedAt != null && yearsSince(w, L.widowedAt) < 4) iso += 0.45;
  if (q.activity === 'unemployed' || q.activity === 'sick_disabled' || q.activity === 'other_inactive') iso += 0.3; if (q.health.limiting === 2) iso += 0.35;
  if (q.yearsAtAddress < 1.2 && q.seg === 'recent_arrivals') iso += 0.3; if (q.seg === 'recent_arrivals') iso += 0.15; if (L.caring) iso += 0.25;
  // contact-based: the social plugin's score (personal need for company vs support actually received through real contact, tie quality, household) + circumstances that isolate
  const sq = w.sys.social && w.sys.social.query; const sl = sq ? sq.loneliness(p.id) : 0.7 - 0.1 * Math.min(supportOf(w, p), 7);
  return sl + 0.45 * iso + (hl.grief.length ? 0.2 : 0);
}

export const LONE_THRESHOLD = 0.42; // score above which someone would answer 'often/always lonely'
export function monthlyMental(w, rng, people) {
  const st = w.lf.health, T = w.tick;
  // loneliness: a fixed reporting threshold on the loneliness score (LONE_THRESHOLD); prevalence emerges from ties, household, personality, age and events
  for (const p of people) { const hl = p.ext.hl; if (!hl) continue; const age = ageOf(w, p); hl.loneZ = age < 16 ? -9 : loneScore(w, p, age); }
  const thr = ((w.settings.tune || {}).loneThr) ?? LONE_THRESHOLD;
  for (const p of people) {
    const hl = p.ext.hl; if (!hl) continue; const age = ageOf(w, p), q = p.ext.pop, L = p.ext.life;
    hl.lonely = hl.loneZ > thr ? 1 : 0;
    // grief expiry
    if (hl.grief.length) hl.grief = hl.grief.filter((g) => g.until > T);
    if (age < 13) continue;
    hl.stress *= 0.88;
    const ms = moneyStress(w, p);
    let floor = 0, src = '';
    const fl = (v, why) => { if (v > floor) { floor = v; src = why; } };
    if (ms > 0.55) fl(0.5 * ms, 'money worries'); if (L.caring && L.caring.kind !== 'other') fl(0.35, 'caring'); if (hl.lonely) fl(0.3, 'loneliness'); if (q.activity === 'unemployed' && age > 17) fl(0.25, 'unemployment');
    if (L.lastBirth != null && T - L.lastBirth < months(10) && p.sex === 'F') fl(0.22, 'new baby');
    if (hl.acute && hl.acute.sev >= 3) fl(0.3, 'illness'); if (hl.dying) fl(0.5, 'illness'); if (hl.c.cancer && !hl.c.cancer.rem) fl(0.32, 'illness');
    hl.src = src;
    const S = clamp(Math.max(hl.stress, floor) + (hl.grief.length ? 0.12 : 0), 0, 1), mh = hl.mh, N = p.personality.neuroticism;
    hl.S = S;
    if (mh.st === 0) {
      if (age >= 14) {
        const chronic = Object.keys(hl.c).length, ageF = age < 18 ? 0.55 : age < 25 ? 1.1 : age < 50 ? 1.2 : age < 65 ? 0.95 : 0.5;
        const r = 0.0066 * (p.sex === 'F' ? 1.5 : 1) * ageF * Math.exp(1.9 * (S - 0.2)) * (0.5 + 1.0 * N) * (1 + 0.35 * Math.min(chronic, 3)) * (1 + 0.25 * (q.health.limiting || 0)) * (1 + 0.4 * Math.min(3, mh.n)) * (hl.lonely ? 1.45 : 1) * (hl.alc === 2 ? 1.6 : 1) * (st.mhScale || 1);
        if (rng.chance(Math.min(0.2, r))) startEpisode(w, rng, p, hl, age);
      }
    } else {
      mh.months = (mh.months || 0) + 1;
      const sup = supportOf(w, p), rec_ = 0.072 * (1 + 1.5 * mh.tx) * clamp(1.3 - S, 0.3, 1.2) * (L.part ? 1.1 : 1) * (sup > 3.5 ? 1.15 : 1) * (hl.grief.length ? 0.6 : 1) * (1 - 0.25 * mh.sev);
      if (rng.chance(rec_)) { const kind = mh.st === 2 ? 'depression' : 'anxiety'; mh.st = 0; mh.last = T; mh.tx = 0; mh.months = 0; w.removeMoodlet(p, 'mh'); const q2 = p.ext.pop.health; q2.conds = q2.conds.filter((c) => c !== 'depression/anxiety'); w.emit('health.recovered', { actors: [p.id], salience: 0.15, cause: mh.ev || 0, tags: ['mental'], payload: { condition: kind } }); bump(w, 'mh_recover'); }
      else {
        mh.sev = clamp(mh.sev + rng.gauss(0, 0.08) - 0.02 * mh.tx, 0.1, 1);
        w.moodlet(p, 'mh', mh.st === 2 ? 'Depressed' : 'Anxious', -0.25 - 0.3 * mh.sev, months(1.4));
        if (!mh.tx && !mh.pend && rng.chance((0.07 + 0.08 * mh.sev) * (p.sex === 'M' ? 0.65 : 1) * (q.religiosity > 0.6 && age > 55 ? 0.6 : 1))) { mh.pend = true; seekHelp(w, rng, p); }
      }
    }
    substances(w, rng, p, hl, age, S);
  }
}
function startEpisode(w, rng, p, hl, age) {
  const mh = hl.mh, T = w.tick, kind = rng.chance(0.52) ? 2 : 1;
  const trig = hl.trigger && T - hl.trigT < months(5) ? hl.trigger : hl.src && hl.S > 0.28 ? hl.src : 'no clear trigger';
  mh.st = kind; mh.t0 = T; mh.n++; mh.sev = clamp(rng.gauss(0.45, 0.2) + 0.2 * (hl.S - 0.3), 0.1, 1); mh.tx = 0; mh.months = 0; mh.pend = false; mh.trig = trig;
  const q2 = p.ext.pop.health; if (!q2.conds.includes('depression/anxiety')) q2.conds = [...q2.conds, 'depression/anxiety'];
  mh.ev = w.emit('health.episode', { actors: [p.id], salience: 0.3, cause: hl.trigEv || 0, tags: ['mental', trig], payload: { kind: kind === 2 ? 'depression' : 'anxiety', trigger: trig } });
  w.addMemory(p, { type: 'health', text: kind === 2 ? 'A bad patch: low mood that would not lift.' : 'Anxiety took over for a while.', otherIds: [], weight: -0.6, importance: 3 });
  w.moodlet(p, 'mh', kind === 2 ? 'Depressed' : 'Anxious', -0.4, months(1.4)); bump(w, 'mh_onset'); bump(w, 'mh_trig_' + trig);
}
function seekHelp(w, rng, p) {
  const st = w.lf.health, wait = st.svc.gpWait + st.svc.talkWait * 7;
  later(w, days(rng.float(3, 21)), 'mh.gp', { pid: p.id });
  later(w, days(wait * rng.float(0.5, 1.4)), 'mh.tx', { pid: p.id });
}
export const mentalHandlers = {
  'mh.gp'(w, d) { const p = w.people.get(d.pid); if (!p || !p.alive || !p.ext.hl || !p.ext.hl.mh.st) return; bump(w, 'gp'); w.emit('health.treatment', { actors: [p.id], salience: 0.12, cause: p.ext.hl.mh.ev || 0, tags: ['mental', 'gp'], payload: { what: 'GP: ' + (w.rngFor('health.mh', p.id, w.tick).chance(0.55) ? 'antidepressant prescribed' : 'referred for talking therapy') } }); p.ext.hl.mh.tx = 0.5; },
  'mh.tx'(w, d) { const p = w.people.get(d.pid); if (!p || !p.alive || !p.ext.hl) return; const mh = p.ext.hl.mh; mh.pend = false; if (!mh.st) return; mh.tx = 1; bump(w, 'mh_tx'); },
};

// ---------------------------------------------------------------- substances (monthly)
function substances(w, rng, p, hl, age, S) {
  const q = p.ext.pop, L = p.ext.life, T = w.tick, M = p.sex === 'M', C = p.personality.conscientiousness, N = p.personality.neuroticism;
  const faith = q.religion === 'Muslim' ? 0.05 : q.religion === 'Sikh' ? 0.5 : q.religion === 'Hindu' ? 0.5 : 1;
  // smoking
  if (!hl.smoke) { if (age >= 14 && age < 30 && rng.chance(0.0016 * (q.seg === 'benefit_dependent' ? 2 : q.seg === 'settled_professionals' ? 0.4 : 1) * (1.4 - C) * (q.religion === 'Muslim' ? 0.5 : 1))) { hl.smoke = 1; } }
  else { const quit = 0.0034 * (1 + 0.5 * C) * (L.preg ? 25 : 1) * (hl.c['heart disease'] || hl.c.COPD || hl.c.cancer ? 3 : 1) * (age > 60 ? 1.4 : 1); if (rng.chance(quit)) { hl.smoke = 0; if (hl.c.COPD || age > 55 || L.preg) w.emit('health.substance', { actors: [p.id], salience: 0.15, tags: ['smoking'], payload: { what: 'smoking', change: 'stopped' } }); } }
  // alcohol
  if (age >= 18) {
    if (hl.alc === 0) { if (rng.chance(0.0014 * faith * (M ? 1.35 : 0.8) * (1.3 - C) * (age > 70 ? 0.4 : age < 25 ? 1.3 : 1) * (1 + 0.7 * S))) hl.alc = 1; }
    else if (hl.alc === 1) {
      if (rng.chance(0.0045 * (age > 60 ? 1.2 : 1))) hl.alc = 0;
      else if (rng.chance(0.00055 * (M ? 1.4 : 0.8) * Math.exp(1.6 * (S - 0.2)) * (1.4 - C) * (age > 70 ? 0.4 : 1))) { hl.alc = 2; w.emit('health.substance', { actors: [p.id], salience: 0.3, tags: ['alcohol'], payload: { what: 'alcohol', change: 'dependent' } }); bump(w, 'alc_dep'); }
    } else if (rng.chance(0.0045 * (L.part ? 1.2 : 1))) { hl.alc = 1; w.emit('health.substance', { actors: [p.id], salience: 0.2, tags: ['alcohol'], payload: { what: 'alcohol', change: 'recovery' } }); }
  }
  // drugs
  if (age >= 15 && age < 60) {
    if (!hl.drug) { if (rng.chance(0.0004 * faith * (age < 35 ? 2 : 0.5) * (1.3 - C) * (q.seg === 'benefit_dependent' ? 2.2 : 1) * (1 + 0.8 * S))) { hl.drug = 1; } }
    else if (rng.chance(0.007)) hl.drug = 0; else if (hl.drug === 1 && rng.chance(0.0007 * (1 + S))) { hl.drug = 2; w.emit('health.substance', { actors: [p.id], salience: 0.35, tags: ['drugs'], payload: { what: 'drugs', change: 'dependent' } }); bump(w, 'drug_dep'); }
  } else if (hl.drug && age >= 60 && rng.chance(0.05)) hl.drug = 0;
}
