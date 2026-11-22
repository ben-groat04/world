// CRIME plugin (W2-C): routine-activity theory. An offence needs a motivated offender, a suitable target and absent guardianship at the same moment; nothing is rate-forced.
//   MOTIVATED OFFENDERS: resident offending rate = K x age-crime curve x exp(risk factors): sex (developmental risk-taking), low conscientiousness / agreeableness, hothead trait, drug and
//     alcohol use, money strain, school exclusion, prior offending (state dependence), offending peers (ties), minus social bonds (partner, job, child). No segment/ethnicity/tenure label enters.
//     Outsider (off-map) offenders arrive as an anonymous per-type stream (opportunistic burglars, shop thieves, scammers, visitors to the night-time economy).
//   OPPORTUNITY x GUARDIANSHIP (hourly, from live positions): empty homes (nobody at home now), people alone outdoors, parked bikes/cars, shops with few staff, pubs at closing time, known
//     conflicts (feuds, domestic relationships). Guardianship = occupied neighbouring homes, household security (rises after victimisation), neighbourhood watch (street), CCTV places, crowd, daylight.
//   AFTERMATH: reporting (CSEW rates x personal trust in police), recording (92%), detection (offender known, CCTV, police capacity), charge/caution, court, sentence (custody rare), stress and fear,
//     target hardening, avoidance, forum posts and belief spread (via social/comms), moving away after burglary, neighbourhood watch emerging from street crime.
//   QUERY world.sys.crime.query: stats() risk(pid) fear(pid) victim(pid) offenders() streetCrime(sid) shopLoss(bid) inCustody(pid) recent(n) describe(rec) watch() police()
//   CMD   god: crime.wave{days,mult,type} crime.waveEnd{} crime.policeCuts{pct} crime.policeBoost{pct}   player: crime.report{pid,type?} crime.joinWatch{pid} crime.lockUp{pid}
//   EVENTS crime.burglary crime.bike_theft crime.antisocial crime.assault crime.theft crime.vehicle crime.damage crime.fraud crime.harassment crime.domestic crime.drugs crime.disorder crime.sexual (private/sensitive: never in public feeds)
//          crime.reported crime.arrest crime.sentenced crime.watch_started crime.watch_lapsed crime.moved_away
import { liveHh } from '../../kernel/archive.js';
import { TYPES, TYPE_IDS, PROFILE, PROF_OF, CAL_GROUPS } from './data.js';
import { A } from '../routine/acts.js';

const D = 144, H = 8760;
const EV = [['crime.burglary'], ['crime.bike_theft'], ['crime.antisocial'], ['crime.assault'], ['crime.theft'], ['crime.vehicle'], ['crime.damage'], ['crime.fraud'], ['crime.harassment'], ['crime.domestic'], ['crime.drugs'], ['crime.disorder'], ['crime.sexual']];
const EV2 = [['crime.reported', 'A victim reported an offence to the police', { kind: 'string' }], ['crime.arrest', 'A local resident was dealt with for an offence', { kind: 'string', outcome: 'string' }],
  ['crime.sentenced', 'A court sentence', { kind: 'string', sentence: 'string' }], ['crime.watch_started', 'Residents of a street started a neighbourhood watch group', { street: 'number' }],
  ['crime.watch_lapsed', 'A street neighbourhood watch lapsed', { street: 'number' }], ['crime.moved_away', 'A household moved out after being a victim of crime', { kind: 'string' }]];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const SHOPS = new Set(['small_supermarket', 'corner_shop', 'ethnic_grocer', 'bakery', 'off_licence', 'pharmacy', 'charity_shop', 'bookmaker', 'money_phone']);
const PUBS = new Set(['pub', 'restaurant', 'takeaway', 'cafe']);
const PLACE_G = { station: 0.4, library: 0.3, small_supermarket: 0.4, pharmacy: 0.3, community_centre: 0.25, primary_school: 0.5, gym: 0.3, pub: 0.35 };
const STR = { burglary: 'a burglary', theft: 'a theft', vehicle: 'a vehicle break-in', bike: 'a bike theft', theftperson: 'a theft from the person', shoplift: 'shoplifting', damage: 'criminal damage', asb: 'antisocial behaviour', assault: 'an assault', harass: 'harassment', fraud: 'a fraud' };

// tunable mechanism parameters (meaning in comments); OUT = outsider attempts per year at full opportunity (a motivated stranger passing through)
export const PARAMS = {
  K: 0.22,                // baseline offending episodes/yr of a peak-age male with average risk factors (most episodes are petty and local or elsewhere in the city)
  impulse: 1.0,           // log-hazard weight of the impulse-control driver at its maximum (teens): the age gradient of offending comes from this plus the bonds, not from a curve
  away: 0.55,             // share of resident episodes that happen elsewhere in the city (still feed their record)
  OUT: { burglary: 20, theft: 45, vehicle: 55, bike: 40, theftperson: 50, shoplift: 85, damage: 72, asb: 60, assault: 300, harass: 100, publicorder: 14, sexual: 6 },
  // NIGHT-TIME-ECONOMY EXPOSURE (residents on a night out in the city centre, off the map): hazard per person-hour at the Friday/Saturday peak, before drink and sex pairing.
  // Anchored to ONS/CSEW: roughly a fifth of violence happens in or around pubs and clubs, ~40% of violent incidents involve an offender believed to be drunk.
  NTE: { assault: 0.0006, theftperson: 0.0006, sexual: 0.0006 },
  drinkRisk: 0.6,         // extra hazard per level of alcohol use (heavy drinkers are both targets and fight-starters)
  // VISITOR VICTIMS. ONS recorded crime per head is higher in inner-city wards because many victims are not residents (commuters, shoppers, visitors, night-out crowds), and police-recorded violence also
  // includes victims the CSEW does not sample (under 16s, people in institutions, non-household). A resident-only pool of ~500 therefore cannot absorb recorded totals without implausible prevalence
  // (previously 20% of young men a year, ~5x CSEW). visitorShare = share of anonymous-stranger confrontations on the map whose target is a non-resident. Set so that resident prevalence matches CSEW
  // (stranger violence 0.7% of adults, 2.2% of 16-24s; ONS Nature of violent crime YE Mar 2024); the attempt stream (OUT.assault) is unchanged, so recorded totals are kept.
  visitorShare: 0.9,
  nteElast: 0.4,          // elasticity of the visitor stream (assault / public order) to the number of open licensed premises
  lifeW: 3.0,             // log-hazard of being out in risky settings per unit of low conscientiousness (self-control); heterogeneity that makes the same people victims again
  repeatBoost: 3.0, repeatDays: 120, overlap: 1.6, // recent-victim hazard multiplier (1 + boost x e^(-t/days)); victim-offender overlap multiplier
  sexPair: 0.47,          // women's relative chance of being the counterpart of a stranger fight: male aggressors (~80%) pick same-sex peers (~80%) => victims ~68% male (CSEW: stranger violence victims ~2:1 male)
  sexualKnown: 0.04,      // relative weight of a sexual offence against someone he knows in a male offender's offence mix (~80% of CSEW perpetrators are known to the victim); tuned so experienced prevalence ~ CSEW
  domSexual: 0.045,        // share of incidents within an abusive relationship that are sexual (ONS domestic abuse: sexual assault by a partner is a minority of DA)
  served: 0.4,            // share of a determinate custodial sentence actually served in prison (Standard Determinate Sentence release at 40% from Oct 2024; 50% before)
  fraud: 0.08,            // per-adult annual probability scale of a successful fraud (CSEW: 7% of adults a victim of any fraud, most refunded)
  watchEff: 0.22,         // Bennett et al. 2008: 16-26% reduction => multiplicative cut on burglary/vehicle success on a watched street
  moveAfterBurglary: 0.05,// share of burglary victims who move because of it within a year (tuned; see report note)
  recording: 0.92,        // HMICFRS/NCRS: share of reported crimes recorded
  nearRepeatDays: 28, nearRepeatP: 0.30, // Johnson & Bowers: elevated risk at/near victimised homes for ~1 month
};

// Immediate-custody probability of a first-time convicted offender by offence class (see outcomes()).
const CUSTODY = { sexual: 0.56, theftperson: 0.40, burglary: 0.45, assault: 0.22, harass: 0.12, vehicle: 0.15, theft: 0.15, bike: 0.12, shoplift: 0.10, damage: 0.06, publicorder: 0.05, drugs: 0.15, asb: 0.02 };
export function createCrime() {
  let W = null, C = null;
  const R = (...k) => W.rngFor('crime', ...k);
  const pois = (r, l) => { let n = Math.floor(l); if (r.next() < l - n) n++; return n; };
  const ageOf = (p) => W.ageOf(p);
  const crOf = (p) => p.ext.cr || (p.ext.cr = { pri: 0, conv: 0, excl: -1, vn: 0, last: -1e9, fear: 0, trust: 0.55 + 0.2 * (p.personality.agreeableness - 0.5), lock: 0, avoid: 0, deal: 0, cust: 0, lam: 0, vt: {}, nrep: 0 });
  const hhOf = (p) => p.ext.pop ? W.lf.households[p.ext.pop.hh] : null;
  const streetOfHh = (hh) => { const b = hh && W.buildings.get(hh.bid); return b && b.lf ? b.lf.streetId : -1; };
  const streetOf = (p) => streetOfHh(hhOf(p));
  const name = (p) => p ? `${p.firstName} ${p.lastName}` : 'someone';
  const streetName = (sid) => (W.map.lf.streets[sid] || {}).name || 'the High Street';
  const svc = (k) => (W.sys.civic ? W.sys.civic.query.service(k) : 1);

  // ------------------------------------------------------------------ propensity
  const curve = (a) => (a < 10 || a > 75 ? 0 : Math.exp(-Math.pow(Math.log(a / 17.5), 2) / (2 * (a < 17.5 ? 0.2 : 0.42) ** 2)));
  // PEER AGE ASSORTMENT of violence. Violence is overwhelmingly between people of similar age: ONS CSEW (YE Mar 2024) stranger violence victimisation is 2.2% at 16-24, ~3x the all-age rate (0.7%), because the motivated
  // aggressors are drawn from the same age-crime curve as `curve` (peak late teens/early 20s). A counterpart's chance of being the target is therefore the share of potential aggressors of a similar age (Gaussian, sigma 7 y),
  // plus a small age-blind share (drunk/opportunistic confrontation, robbery). Used for the anonymous night-time-economy aggressor (age ~ curve) and for strangers squaring up on the street.
  const PEER_SIGMA = 7, PEER_BLIND = 0.15;
  const PEER = (() => { const t = [], curves = []; for (let x = 12; x <= 70; x++) curves.push([x, curve(x)]); const tot = curves.reduce((a, c) => a + c[1], 0); let mx = 0;
    for (let a = 0; a <= 100; a++) { let s = 0; for (const [x, c] of curves) s += c * Math.exp(-((a - x) ** 2) / (2 * PEER_SIGMA ** 2)); t[a] = PEER_BLIND * 0.5 + (1 - PEER_BLIND) * s / tot; mx = Math.max(mx, t[a]); } return t.map((v) => v / mx); })();
  const peerOfAnon = (a) => PEER[Math.max(0, Math.min(100, Math.round(a)))];
  const peerOf = (va, oa) => PEER_BLIND * 0.5 + (1 - PEER_BLIND) * Math.exp(-((va - oa) ** 2) / (2 * PEER_SIGMA ** 2));
  // VICTIMISATION IS CONCENTRATED. ONS CSEW: ~54-57% of violent incidents are experienced by repeat victims (2013/14, YE Mar 2018), and offenders and victims overlap (Jennings, Piquero & Reingle 2012):
  // a recent victim stays exposed (same circles, same venues, unresolved conflict; near-repeat decay over months) and people who offend themselves are in the risky settings more. Multiplies the
  // chance that a person out is the target of a confrontation.
  // Three parts: RECENCY (a recent victim stays exposed), OVERLAP (offenders are in the risky settings), and a stable LIFESTYLE exposure: low self-control (Pratt, Turanovic, Fox & Wright 2014 meta-analysis: self-control
  // predicts victimisation, r ~ 0.15-0.2), a hot temper, drug use and heavy drinking put the same people in the same risky places again and again. Lifestyle is divided by its mean over residents (`C.lsMean`),
  // so it redistributes the same total risk onto fewer people instead of adding risk.
  const lifestyle = (p) => { const hl = p.ext.hl; return Math.exp(Math.min(1.6, PARAMS.lifeW * (0.5 - p.personality.conscientiousness) + (p.traits.includes('hothead') ? 0.5 : 0) + (hl && hl.drug ? 0.4 : 0) + (hl && hl.alc === 2 ? 0.3 : 0))); };
  const vuln = (p) => { const c = crOf(p); return (1 + PARAMS.repeatBoost * (c.lastV != null ? Math.exp(-(W.tick - c.lastV) / (PARAMS.repeatDays * D)) : 0)) * (c.nOff ? PARAMS.overlap : 1) * lifestyle(p) / (C.lsMean || 1); };
  // AGE-GRADED DRIVERS of resident offending. There is no age-crime curve multiplier on residents any more: the age profile emerges from drivers that change with age and from the life-course bonds that
  // accumulate with it (Sampson & Laub 1993 / 2003: a good marriage, steady work and parenthood each cut offending; Moffitt 1993: adolescence-limited offending).
  //   IMPULSE   sensation seeking / weak impulse control: high through the teens, falls through the 20s as self-regulation matures (Steinberg 2008 Dev Review; Duell et al. 2018 in 11 countries). Logistic, midpoint 21 y.
  //   AUTONOMY  unsupervised time with peers away from adults: rises through adolescence, and is what makes offending possible at 11-14 (Osgood et al. 1996, routine activities and deviant behaviour). Logistic, midpoint 13.5 y.
  //   CAPACITY  physical capacity and routine exposure for street offending, falls from the 50s (strength, stamina, fewer nights out): logistic, midpoint 58 y.
  //   BONDS     partner (cohabiting/married more than dating), job, child, in `risk` below; offending peers (monthlyRisk) and an offending record (state dependence) accumulate with age and make desistance gradual.
  const IMPULSE = (a) => 1 / (1 + Math.exp((a - 21) / 3.5)), AUTONOMY = (a) => 1 / (1 + Math.exp(-(a - 13.5) / 1.1)), CAPACITY = (a) => 1 / (1 + Math.exp((a - 58) / 5)), X0 = 1.76;
  function risk(p) {
    const a = ageOf(p), c = crOf(p); if (a < 11 || a > 80 || !p.alive) return 0; const q = p.ext.pop, hl = p.ext.hl, pe = p.personality, hh = hhOf(p), M = p.sex === 'M';
    let x = (M ? 1.1 : 0) + 1.4 * (0.5 - pe.conscientiousness) + 1.0 * (0.5 - pe.agreeableness) + (p.traits.includes('hothead') ? 0.45 : 0) + PARAMS.impulse * IMPULSE(a);
    if (hl) x += (hl.drug === 2 ? 1.7 : hl.drug ? 1.0 : 0) + (hl.alc === 2 ? 0.8 : hl.alc ? 0.2 : 0);
    if (hh && hh.fin) x += 0.5 * (hh.fin.stress || 0) + (hh.fin.pressured ? 0.2 : 0);
    x += 0.8 * (c.excl > 0 ? 1 : 0) + 0.8 * Math.pow(Math.min(c.pri, 4), 0.7) + 0.3 * Math.min(3, c.peers || 0);
    if (q) { if (q.activity === 'employed') x -= 0.4; if (q.edu === 'none') x += 0.25; }
    if (p.romance && p.romance.partnerId != null) x -= p.romance.status === 'dating' ? 0.3 : 0.7; if (p.family.childrenIds.length) x -= 0.3;
    if (c.vt.assault) x += 0.3;
    return PARAMS.K * AUTONOMY(a) * CAPACITY(a) * Math.exp(Math.min(x - X0, 2.0));
  }
  function monthlyRisk() {
    const act = [], S = W.sys.social ? W.sys.social.query : null; let tot = 0;
    for (const p of W.living()) {
      const c = crOf(p), a = ageOf(p);
      if (c.excl < 0 && a >= 11.5) { const q = p.ext.pop, hh = hhOf(p); const pr = 0.015 + 0.09 * (0.5 - p.personality.conscientiousness + 0.5 - p.personality.agreeableness) + 0.05 * ((hh && hh.fin ? hh.fin.stress : 0)); c.excl = R(p.id, 'excl').next() < clamp(pr * (p.sex === 'M' ? 1.8 : 0.7), 0, 0.3) ? 1 : 0; } // permanent exclusions ~0.1%, fixed-period ~5% (DfE); proxy for school disengagement
      if (a >= 14 && a < 40 && S) { let n = 0; for (const t of S.ties(p.id, { layer: 2 })) { if (t.k !== 'friend' || !t.on) continue; const f = W.people.get(t.o); if (f && f.ext.cr && f.ext.cr.pri > 0) n++; } c.peers = n; }
      c.fear = c.fear * 0.88;
      if (c.avoid && W.tick - c.avoid > 365 * D) c.avoid = 0;
      c.lam = c.cust > W.tick ? 0 : risk(p); if (c.lam > 0.02) { act.push(p.id); tot += c.lam; }
    }
    C.act = act; C.lamTot = tot; { let ls = 0, n = 0; for (const p of W.living()) if (ageOf(p) >= 16) { ls += lifestyle(p); n++; } C.lsMean = n ? ls / n : 1; }
    const cum = []; let s = 0; for (const id of act) { s += W.people.get(id).ext.cr.lam; cum.push(s); } C.cum = cum;
  }

  // ------------------------------------------------------------------ hour snapshot of who is where (only built when an attempt happens)
  let SNAP = null, SNAPT = -1;
  function snap() {
    if (SNAPT === W.tick && SNAP) return SNAP; SNAPT = W.tick; const occ = new Set(), out = [], pub = [], nte = [], st = new Map(), hr = W.time.hour;
    for (const p of W.living()) {
      const q = p.ext.pop; if (!q) continue;
      if (p.locationId === p.homeId && p.locationId != null) occ.add(q.hh);
      else if (p.locationId == null) { if (!(p.ext.rt && p.ext.rt.off)) out.push(p); else if (p.ext.rt.act === A.nightout || (p.ext.rt.act === A.offsocial && (hr >= 20 || hr < 4))) nte.push(p); }
      else { const b = W.buildings.get(p.locationId); if (b && b.lf && PUBS.has(b.lf.template) && ageOf(p) >= 18) pub.push(p); }
    }
    for (const hh of liveHh(W)) { if (hh.gone) continue; const s = streetOfHh(hh), e = st.get(s) || [0, 0]; e[1]++; if (occ.has(hh.id)) e[0]++; st.set(s, e); }
    return (SNAP = { occ, out, pub, nte, st });
  }
  const dark = () => { const t = W.time, h = t.hourFloat; return t.sunset != null ? (h < t.sunrise || h > t.sunset) : (h < 7 || h > 18); };
  const presence = (s, sid) => { const e = s.st.get(sid); return e && e[1] ? e[0] / e[1] : 0.3; };
  const secOf = (hh) => C.sec[hh.id] ?? (0.12 + 0.18 * clamp(inc(hh) / 4000, 0, 1) + (hh.tenure === 'owned_outright' || hh.tenure === 'mortgage' ? 0.08 : 0));
  const inc = (hh) => (hh.fin && hh.fin.income) || 1800;
  const watchOf = (sid) => (C.watch[sid] ? 1 : 0);

  // ------------------------------------------------------------------ attempts. each returns true if an offence was committed
  const rndHh = (r) => { const L = W.lf.households; for (let i = 0; i < 8; i++) { const h = L[(r.next() * L.length) | 0]; if (h && !h.gone && h.members.length) return h; } return null; };
  const adultOf = (hh, r) => { const m = hh.members.map((i) => W.people.get(i)).filter((p) => p && p.alive && ageOf(p) >= 16); return m.length ? r.pick(m) : null; };
  function burglary(o, r) {
    const s = snap(), nc = 3, cands = []; const hot = C.hotL || (C.hotL = Object.keys(C.hot));
    for (let i = 0; i < nc; i++) { const h = rndHh(r); if (h) cands.push(h); }
    if (hot.length && r.next() < PARAMS.nearRepeatP) { const id = +hot[(r.next() * hot.length) | 0]; if (C.hot[id] > W.tick) cands.push(W.lf.households[id]); }
    if (o && o.ext.cr.lastT != null && r.next() < 0.3 && W.tick - o.ext.cr.last < 60 * D) cands.push(W.lf.households[o.ext.cr.lastT]);
    let best = null, bs = -1, bg = 0;
    for (const hh of cands) {
      if (!hh || hh.gone) continue; const occ = s.occ.has(hh.id); if (occ && r.next() > 0.04) continue; const sid = streetOfHh(hh), b = W.buildings.get(hh.bid), flat = b && b.lf.units && b.lf.units.length > 1;
      const g = clamp(0.1 + 0.4 * secOf(hh) + 0.3 * presence(s, sid) + (flat ? 0.1 : 0) - (dark() ? 0.08 : 0), 0, 0.92) * (watchOf(sid) ? 1 - PARAMS.watchEff * 2 : 1);
      const val = 0.6 + Math.min(1.2, inc(hh) / 3000); const sc = val * (1 - g) + 0.3 * r.next(); if (sc > bs) { bs = sc; best = hh; bg = g; }
    }
    if (!best || r.next() > 0.8 * (1 - bg)) return false;
    return commit('burglary', { off: o, vic: adultOf(best, r), hh: best, loss: Math.round(300 + r.next() * r.next() * 4200), place: best.bid, known: 0.05 });
  }
  function theftHome(o, r) { const hh = rndHh(r); if (!hh) return false; const s = snap(), sid = streetOfHh(hh); const g = 0.2 + 0.3 * presence(s, sid) + 0.2 * secOf(hh); if (r.next() > 0.7 * (1 - g) * (watchOf(sid) ? 1 - PARAMS.watchEff : 1)) return false; return commit('theft', { off: o, vic: adultOf(hh, r), hh, loss: Math.round(30 + r.next() * 250), place: hh.bid }); }
  function vehicle(o, r) {
    const hh = rndHh(r); if (!hh || !hh.cars) return false; const s = snap(), sid = streetOfHh(hh); const g = 0.15 + 0.3 * presence(s, sid) + 0.15 * (dark() ? 0 : 1);
    if (r.next() > 0.85 * (1 - g) * (watchOf(sid) ? 1 - PARAMS.watchEff : 1)) return false; return commit('vehicle', { off: o, vic: adultOf(hh, r), hh, loss: r.next() < 0.15 ? 4000 : 180, place: hh.bid });
  }
  function bike(o, r) {
    for (let i = 0; i < 6; i++) {
      const LV = W.living(), p = LV[(r.next() * LV.length) | 0]; if (!p || !p.ext.pop || !p.ext.pop.bike || ageOf(p) < 9) continue; const c = crOf(p);
      const home = p.locationId === p.homeId; const bb = p.locationId != null ? W.buildings.get(p.locationId) : null;
      const g = home ? 0.7 : 0.1 + (bb && bb.lf ? PLACE_G[bb.lf.template] || 0.15 : 0.1); if (p.locationId == null && !home) continue;
      if (r.next() > 0.55 * (1 - 0.65 * c.lock) * (1 - g)) return false;
      return commit('bike', { off: o, vic: p, hh: hhOf(p), loss: 280, place: p.locationId, cctv: bb && bb.lf && bb.lf.template === 'station' ? 1 : 0 });
    }
    return false;
  }
  function theftPerson(o, r) {
    const s = snap(), pool = s.out.concat(s.pub.filter(() => dark())); if (!pool.length) return false; const v = pool[(r.next() * pool.length) | 0], c = crOf(v), a = ageOf(v);
    if (a < 13 || (c.avoid && dark() && r.next() < 0.6)) return false; const hl = v.ext.hl; const g = 0.25 + 0.35 * Math.min(1, s.out.length / 25) - (dark() ? 0.12 : 0) - (hl && hl.alc && dark() ? 0.15 : 0);
    if (r.next() > 0.38 * (1 - g) * (a < 45 ? 1.2 : 0.7)) return false; return commit('theftperson', { off: o, vic: v, hh: hhOf(v), loss: 250, place: null, force: r.next() < 0.12 });
  }
  function shoplift(o, r) {
    const shops = C.shops || (C.shops = [...W.buildings.values()].filter((b) => b.lf && SHOPS.has(b.lf.template)).map((b) => b.id)); if (!shops.length) return false;
    const b = W.buildings.get(shops[(r.next() * shops.length) | 0]); if (b.lf.template === 'vacant_unit') return false; let staff = 0; for (const e of b.employees) { const q = W.people.get(e.id ?? e); if (q && q.locationId === b.id) staff++; }
    if (!staff && b.occupants.size === 0) return false; // closed
    const g = clamp((b.lf.template === 'small_supermarket' ? 0.4 : 0.1) + 0.12 * Math.min(3, staff) + (b.lf.template === 'small_supermarket' ? 0.15 : 0), 0, 0.85);
    if (r.next() > 0.8 * (1 - g)) return false; const loss = Math.round(6 + r.next() * r.next() * 60); C.shopLoss[b.id] = (C.shopLoss[b.id] || 0) + loss; return commit('shoplift', { off: o, venue: b.id, loss, place: b.id, cctv: g > 0.35 ? 1 : 0, rep0: g > 0.35 ? 0.7 : 0.3 });
  }
  function conflictTarget(o, r, minL = -0.15) { // someone the offender is in conflict with (feud, neighbour dispute, ex)
    if (!o || !W.sys.social) return null; const ties = W.sys.social.query.ties(o.id, { layer: 3 }).filter((t) => t.l < minL && t.on); if (!ties.length) return null; return W.people.get(r.pick(ties).o) || null;
  }
  function damage(o, r) {
    const tv = o ? conflictTarget(o, r, -0.3) : null; const hh = tv ? hhOf(tv) : rndHh(r); if (!hh) return false; const s = snap(), sid = streetOfHh(hh);
    const g = 0.2 + 0.3 * presence(s, sid) + (dark() ? -0.05 : 0.1); if (!tv && r.next() > 0.6 * (1 - g) * (watchOf(sid) ? 1 - PARAMS.watchEff : 1)) return false;
    return commit('damage', { off: o, vic: tv || adultOf(hh, r), hh, loss: Math.round(60 + r.next() * 400), place: hh.bid, known: tv ? 1 : 0.05 });
  }
  function asb(o, r) {
    const sids = Object.keys(W.map.lf.streets); const sid = +sids[(r.next() * sids.length) | 0]; const ppl = (W.soc && W.soc.street.get(sid)) || []; if (!ppl.length) return false;
    const ys = svc('youth'); if (o && ageOf(o) < 19 && r.next() > 0.45 + 0.55 * (1 - 0.5 * ys)) return false; // structured activity displaces unstructured time (youth-service evidence, Home Office/YJB)
    const near = []; for (let i = 0; i < 5; i++) near.push(ppl[(r.next() * ppl.length) | 0]);
    return commit('asb', { off: o, vic: W.people.get(near[0]), others: near.slice(1), street: sid, place: null });
  }
  function assault(o, r) {
    const s = snap(); let v = null, known = 0; const nte = (W.time.dow === 4 || W.time.dow === 5) && (W.time.hour >= 21 || W.time.hour < 3);
    if (o && r.next() < 0.62) { v = conflictTarget(o, r, -0.1); if (v) known = 1; }
    let visitor = false; // the stranger's target is a non-resident (commuter, shopper, tourist, night-out visitor) with the same sex/age/drink selection as any other person out
    if (!v && !o && r.next() < PARAMS.visitorShare) { const poolN = s.pub.length + s.out.length; if (poolN < 2) return false;
      for (let i = 0; i < 3 && !visitor; i++) { const vs = r.next() < 0.5 ? 'M' : 'F', va = 16 + r.next() * 48, al = r.next() < 0.35 ? 1 : 0; if (r.next() < (vs === 'M' ? 1 : PARAMS.sexPair) * (0.62 + 0.38 * al) * peerOfAnon(va)) visitor = true; }
      if (!visitor) return false; }
    if (!v && !visitor) { const pool = s.pub.concat(s.out); if (pool.length < 2) return false; // counterpart of a stranger confrontation: whoever is out, with male aggressors mostly squaring up to same-sex peers and drink lowering restraint on both sides; age enters through who is out at night and through peer-age assortment (peerOf)
      for (let i = 0; i < 3 && !v; i++) { const c = pool[(r.next() * pool.length) | 0]; if (ageOf(c) < 16 || c === o) continue; const al = c.ext.hl && c.ext.hl.alc ? 1 : 0; if (r.next() < (c.sex === 'M' ? 1 : PARAMS.sexPair) * (0.62 + 0.38 * al) * (o ? peerOf(ageOf(c), ageOf(o)) : peerOfAnon(ageOf(c))) * Math.min(6, vuln(c))) v = c; }
      if (!v) return false; if (v.ext.cr && v.ext.cr.avoid && r.next() < 0.5) return false; }
    if (!o && !nte && r.next() < 0.7) return false; const g = nte ? 0.25 : 0.1; if (r.next() > 0.7 * (1 - g)) return false;
    const u = r.next(); if (visitor) { cnt('vis', 'assault'); return commit('assault', { off: null, vic: null, visitor: 1, injury: u < 0.58 ? 'none' : u < 0.97 ? 'minor' : 'serious', place: null, rep0: TYPES.assault.rep }); }
    return commit('assault', { off: o, vic: v, hh: hhOf(v), known, injury: u < 0.58 ? 'none' : u < 0.97 ? 'minor' : 'serious', place: null });
  }
  function harass(o, r) { const v = conflictTarget(o, r, -0.25) || (!o ? (() => { const LV = W.living(), p = LV[(r.next() * LV.length) | 0]; return p && ageOf(p) > 16 && r.next() < 0.3 ? p : null; })() : null); if (!v) return false; return commit('harass', { off: o, vic: v, hh: hhOf(v), known: o ? 1 : 0.1, place: null }); }
  function publicorder(o, r) { const s = snap(); if (s.pub.length + s.out.length < 3) return false; if (r.next() > 0.5) return false; return commit('publicorder', { off: o, place: null, silent: true }); }
  function sexual(o, r) { // outsider/stranger or acquaintance offence among people out at night on the map; residents' offences against people they know are in sexualKnown
    const s = snap(); if (!dark() && r.next() < 0.7) return false; const pool = s.pub.concat(s.out); if (pool.length < 2) return false; let v = null;
    for (let i = 0; i < 3 && !v; i++) { const c = pool[(r.next() * pool.length) | 0]; if (ageOf(c) < 16 || c === o) continue; const al = c.ext.hl && c.ext.hl.alc ? 1 : 0; if (r.next() < (c.sex === 'F' ? 1 : 0.2) * (0.62 + 0.38 * al)) v = c; }
    if (!v) return false; return commit('sexual', { off: o, vic: v, hh: hhOf(v), known: o ? 0.5 : 0.05, place: null });
  }
  function sexualKnown(o, r) { // an offence by a resident against someone he knows (friend, acquaintance, former partner)
    if (!o || !W.sys.social) return false; const ties = W.sys.social.query.ties(o.id, { layer: 3 }).filter((t) => t.on && W.people.get(t.o) && ageOf(W.people.get(t.o)) >= 16 && W.people.get(t.o).sex !== o.sex); if (!ties.length) return false;
    const v = W.people.get(r.pick(ties).o); return commit('sexual', { off: o, vic: v, hh: hhOf(v), known: 0.9, place: null });
  }
  const ATTEMPT = { sexual, burglary, theft: theftHome, vehicle, bike, theftperson: theftPerson, shoplift, damage, asb, assault, harass, publicorder };

  // ------------------------------------------------------------------ commit: counters, victim effects, reporting, detection queue
  const band = (a) => (a < 16 ? '<16' : a < 25 ? '16-24' : a < 35 ? '25-34' : a < 50 ? '35-49' : a < 65 ? '50-64' : '65+');
  const cnt = (k, t, n = 1) => { (C[k] || (C[k] = {}))[t] = ((C[k] || {})[t] || 0) + n; };
  function commit(type, o) {
    const T = TYPES[type], r = R(W.tick, C.seq), v = o.vic, off = o.off, fromRes = !!off; C.seq++;
    cnt('exp', type); if (v) { const k = band(ageOf(v)) + v.sex; cnt('vicBand', k); cnt('vicT', type + '|' + k); if (type === 'assault') cnt('vicSrc', (o.city ? 'city' : o.dom ? 'dom' : o.known ? 'known' : 'stranger') + '|' + k); const c = crOf(v); c.vn++; c.vt[type] = (c.vt[type] || 0) + 1; if (type === 'assault') c.lastV = W.tick; } if (off) { cnt('offBand', band(ageOf(off)) + off.sex); cnt('offAll', band(ageOf(off)) + off.sex); crOf(off).nAll = (crOf(off).nAll || 0) + 1; const c = crOf(off); c.last = W.tick; c.lastT = o.hh ? o.hh.id : null; c.nOff = (c.nOff || 0) + 1; }
    if (type === 'burglary' || type === 'vehicle' || type === 'theft') if (o.hh) { C.hot[o.hh.id] = W.tick + PARAMS.nearRepeatDays * D; C.hotL = null; }
    // reporting decision (victim) -> recording
    let rep;
    if (T.policeInitiated) rep = true;
    else if (v) { const tr = crOf(v).trust; rep = r.next() < clamp(T.rep * (o.dom ? 0.5 : 1) * (0.5 + tr) * (o.injury === 'serious' ? 1.6 : 1) * (o.force ? 1.4 : 1), 0, 0.98); }
    else rep = r.next() < (o.rep0 ?? T.rep);
    const rec = rep && !T.noRecord && (T.policeInitiated || r.next() < PARAMS.recording);
    if (rep) cnt('rep', type); if (rec) cnt('rec', type);
    if (o.venue != null) cnt('shop', 'n');
    const dom = o.dom, sens = !!T.sensitive, priv = dom || sens, evType = sens ? 'crime.sexual' : dom ? 'crime.domestic' : T.ev, hl = v && v.ext.hl, actors = v ? [v.id] : off ? [off.id] : [];
    const sal = priv ? 0.03 : type === 'burglary' ? 0.4 : type === 'assault' && o.injury !== 'none' ? 0.4 : T.sev >= 2 ? 0.3 : 0.12;
    const eid = W.emit(evType, { actors: priv ? actors : v ? [v.id] : [], place: o.place ?? null, salience: sal, tags: priv ? ['crime', 'private', 'sensitive'] : ['crime', ...(T.sev >= 2 ? ['unsafe_area'] : []), 'neighbourhood'], payload: { kind: type, rec: !!rec } });
    const sid = v ? streetOf(v) : o.street ?? -1; const L = C.log; L.push({ t: W.tick, type, eid, v: v ? v.id : null, o: off ? off.id : null, rec: rec ? 1 : 0, sid, inj: o.injury || '', dom: priv ? 1 : 0, sens: sens ? 1 : 0, city: o.city ? 1 : 0, ven: o.venue ?? null, loss: o.loss || 0 }); if (L.length > 600) L.shift();
    if (sid >= 0 && !priv && !o.city) { (C.street[sid] || (C.street[sid] = [])).push(W.tick); if (C.street[sid].length > 12) C.street[sid].shift(); }
    // victim effects
    if (v) victimEffects(v, type, o, eid, r, rep);
    if (o.city) cnt('city', type);
    if (o.others) for (const id of o.others) { const q = W.people.get(id); if (q && q.alive && q !== v) { crOf(q).fear = clamp(crOf(q).fear + 0.02, 0, 1); } }
    if (o.loss && v && type === 'fraud') { try { W.ledger.transfer(v.id, 'metropolis', o.loss, 'fraud', eid); } catch (e) { /* no funds */ } }
    // serious injury, rare fatality
    if (type === 'assault' && v && o.injury !== 'none' && v.ext.hl) { if (r.next() < 0.5) W.cmd('health.injure', { pid: v.id }); if (o.injury === 'serious' && r.next() < 0.003) { W.killPerson(v, 'homicide'); cnt('hom', 'n'); } }
    // detection
    if (rec) {
      const cap = C.police.cap; let pd = T.det * cap * (o.known >= 0.5 ? 5 : 1) * (o.cctv ? 2 : 1) * (off && off.ext.cr.pri ? 1.3 : 1) * (T.policeInitiated ? 1 : 1);
      if (!off && !T.policeInitiated) pd *= 0.85; // anonymous visiting offenders are identified a little less
      if (o.dom) pd *= 1.2;
      if (r.next() < Math.min(0.9, pd)) C.q.push({ t: W.tick + Math.round((5 + r.next() * 40) * D), ty: type, off: off ? off.id : null, vic: v ? v.id : null, sev: T.sev + (o.injury === 'serious' ? 1 : 0), dom: o.dom ? 1 : 0, stage: 0, eid, withdraw: o.dom ? 0.5 : sens ? 0.45 : v ? 0.12 : 0.02 });
      else if (v && rep) { const c = crOf(v); c.trust = clamp(c.trust - 0.06 * (T.sev + 0.5) * 0.5, 0.05, 1); } // reported, no suspect: confidence erodes
      if (v && rep) { W.emit('crime.reported', { actors: [v.id], cause: eid, salience: 0.03, tags: ['crime'], payload: { kind: type } }); C.attend.push(Math.round((o.injury === 'serious' || o.dom ? 14 : 40 + 40 * r.next()) / Math.max(0.3, C.police.cap))); if (C.attend.length > 300) C.attend.shift(); }
    }
    return true;
  }
  function victimEffects(v, type, o, eid, r, rep) {
    const T = TYPES[type], c = crOf(v), sev = T.sev + (o.injury === 'serious' ? 1 : 0);
    const stress = [0.03, 0.1, 0.2, 0.32][sev]; if (type !== 'asb') W.cmd('health.stress', { pid: v.id, amount: stress, why: 'being a victim of crime', cause: eid });
    c.fear = clamp(c.fear + [0.05, 0.15, 0.3, 0.4][sev] * (type === 'fraud' ? 0.5 : 1), 0, 1);
    const hh = o.hh;
    if (type === 'burglary' && hh) { C.sec[hh.id] = clamp(secOf(hh) + 0.3, 0, 0.95); if (!o.dom) C.moveQ.push({ t: W.tick + 60 * D, hh: hh.id, v: v.id }); }
    if ((type === 'bike' || type === 'theftperson') && r.next() < 0.6) c.lock = clamp(c.lock + 0.5, 0, 1);
    if ((type === 'theftperson' || type === 'assault') && dark() && r.next() < 0.3) c.avoid = W.tick; // changes routine: no longer out alone after dark (cuts own street exposure)
    if (type === 'vehicle' && hh) C.sec[hh.id] = clamp(secOf(hh) + 0.1, 0, 0.95);
    // telling the street: forum alert (non-domestic only), more likely for burglary/violence
    const ps = W.soc && W.soc.ppl.get(v.id);
    if (!o.dom && !T.sensitive && ps && ps.fm && T.sev >= 1 && r.next() < 0.3 + 0.1 * T.sev) W.cmd('comms.forumPost', { author: v.id, kind: 'crime' });
    // household stress for a burglary at home
    if (hh && type === 'burglary') for (const id of hh.members) { const q = W.people.get(id); if (q && q !== v && q.alive) { crOf(q).fear = clamp(crOf(q).fear + 0.25, 0, 1); } }
  }

  // ------------------------------------------------------------------ outcomes (daily queue): charge/caution, court, sentence
  function outcomes() {
    const q = C.q, r = R(W.tick, 'out'); let keep = null;
    for (let i = 0; i < q.length; i++) {
      const e = q[i]; if (e.t > W.tick) { (keep || (keep = [])).push(e); continue; }
      const off = e.off != null ? W.people.get(e.off) : null, v = e.vic != null ? W.people.get(e.vic) : null, T = TYPES[e.ty], oc = off ? crOf(off) : null;
      if (e.stage === 0) {
        if (v && r.next() < e.withdraw) { cnt('det', 'withdrawn'); if (v) crOf(v).trust = clamp(crOf(v).trust - 0.04, 0.05, 1); continue; } // victim does not support prosecution (esp. domestic abuse)
        cnt(e.away ? 'detAway' : 'det', e.ty); // 'det' counts only offences recorded here (away = residents' offences elsewhere in the city, kept separate so charge rates are per recorded offence)
        const out = r.next() < T.chg ? 'charged' : 'out-of-court'; // det is already the share with a positive outcome; the charge share of those is the Home Office split by class
        if (v) crOf(v).trust = clamp(crOf(v).trust + 0.08, 0.05, 1);
        if (off) W.emit('crime.arrest', { actors: [off.id], cause: e.eid, salience: e.dom ? 0.05 : 0.2, tags: ['crime', ...(e.dom ? ['private'] : [])], payload: { kind: e.ty, outcome: out } });
        if (out === 'out-of-court') { cnt('sent', 'caution'); if (oc) { oc.pri++; } continue; }
        cnt('ch', e.ty); const wait = Math.round((30 + r.next() * 120) * D), pri0 = oc ? oc.pri : 0;
        // REMAND: a charged resident may be held in custody until trial (bail refused: seriousness, prior record, risk to the victim). MoJ OMSQ: ~1 in 6 of the prison population is on remand; of Crown Court
        // defendants ~1 in 3 are remanded in custody (hand-set here: 25% for seriousness >= 2 plus 6% per prior, 2% + 3% per prior for lesser offences, domestic abuse +15%). Time on remand is credited against any sentence.
        let remandDays = 0; if (off && oc && !(oc.cust > W.tick) && r.next() < clamp((e.sev >= 2 ? 0.25 : 0.02) + (e.sev >= 2 ? 0.06 : 0.03) * Math.min(pri0, 6) + (e.dom ? 0.15 : 0), 0, 0.8)) { remandDays = Math.round(wait / D); lockUp(off, oc, remandDays, e, 'On remand', 'remand'); }
        (keep || (keep = [])).push({ ...e, stage: 1, t: W.tick + wait, remandDays });
      } else {
        if (!off) { cnt('sentOutsider', 'n'); continue; } // anonymous visiting offenders: sentenced elsewhere, not a resident
        const guilty = r.next() < 0.85; if (!guilty) { cnt('sent', 'not guilty'); continue; } // ~85% of prosecutions end in conviction (MoJ CJS statistics)
        cnt('conv', e.ty); const pri = oc ? oc.pri : 0; let sent = 'fine';
        // Immediate-custody probability of a convicted (charged) offender: MoJ Criminal Justice Statistics quarterly YE Sep 2024: custody rate 7% for all offences, 33% for indictable offences, sexual offences 56%, robbery 55%;
        // violence/burglary/theft in between (rounded, hand-set per class below). Each prior conviction raises the odds (Sentencing Council: previous convictions aggravate), x1.3 per prior up to 6, domestic abuse x1.3.
        const base = CUSTODY[e.ty] ?? 0.1, odds = base / (1 - base) * Math.pow(1.3, Math.min(pri, 6)) * (e.dom ? 1.3 : 1) * (e.sev >= 3 ? 1 : 1), pc = clamp(odds / (1 + odds), 0, 0.9), u = r.next();
        sent = u < pc ? 'custody' : u < pc + 0.14 + 0.05 * e.sev ? 'suspended' : u < pc + 0.38 + 0.1 * e.sev ? 'community order' : 'fine';
        cnt('sent', sent); if (oc) { oc.pri++; oc.conv++; if (e.remandDays && sent !== 'custody') { oc.cust = Math.min(oc.cust, W.tick); } if (sent === 'custody') imprison(off, oc, u, r, e); if (off.ext.hl) W.cmd('health.stress', { pid: off.id, amount: 0.15, why: 'a court appearance', cause: e.eid }); }
        W.emit('crime.sentenced', { actors: off ? [off.id] : [], cause: e.eid, salience: sent === 'custody' ? 0.35 : 0.12, tags: ['crime', ...(e.dom ? ['private'] : [])], payload: { kind: e.ty, sentence: sent } });
      }
    }
    C.q = keep || [];
  }

  // PRISON: a custodial sentence removes the person from the routine layer (off the map, `routine.insert` to 'custody') for the part of the sentence actually served; job lost, household under strain,
  // ties lapse because nobody is seen. Sentence lengths: ~70% short (1-9 months), ~30% 1-5 years (MoJ sentencing statistics: average custodial sentence ~ 17-20 months, most individual sentences < 12 months but long ones dominate the prison stock).
  function imprison(off, oc, u, r, e) {
    const months = r.next() < 0.25 + 0.1 * e.sev ? 12 + ((r.next() * 48) | 0) : 1 + ((r.next() * 8) | 0), served = Math.max(1, Math.round(months * PARAMS.served * 30)); // days in prison
    const credit = e.remandDays || 0, left = Math.max(1, served - credit); // days already spent on remand count towards the sentence
    cnt('sent', 'custody-months', months);
    lockUp(off, oc, left, e, 'In custody', 'custody', credit > 0);
  }
  /** Take a resident off the map for `days` (remand or sentence): rate zero, job lost, routine slot 'in custody', household strain. `extend`: already locked up on remand, so the sentence continues from now. */
  function lockUp(off, oc, days, e, label, kind, extend) {
    oc.cust = W.tick + days * D; oc.lam = 0; cnt('prisonDays', 'n', days); if (kind === 'remand') cnt('sent', 'remand');
    if (!extend) {
      if (off.ext.pop && off.ext.pop.activity === 'employed') W.cmd('labour.quit', { pid: off.id });
      const hh = hhOf(off); if (hh) for (const id of hh.members) { const q = W.people.get(id); if (q && q.alive && q !== off) W.cmd('health.stress', { pid: id, amount: ageOf(q) >= 16 ? 0.18 : 0.1, why: kind === 'remand' ? 'a family member held on remand' : 'a family member sent to prison', cause: e.eid }); } // partner/children carry the strain; the household loses the income via the job loss
    }
    if (W.commands.has('routine.insert') && off.ext.rt) W.cmd('routine.insert', { pid: off.id, from: W.tick + 1, to: oc.cust, label, ptype: 3, dest: 'custody' });
  }

  // ------------------------------------------------------------------ clocks
  function hourly(w) {
    const h = w.time.hour, dow = w.time.dow, r = R(w.tick); const wave = C.wave && C.wave.until > w.tick ? C.wave : null; SNAP = null;
    for (const t of Object.keys(PARAMS.OUT)) {
      let lam = PARAMS.OUT[t] / H * (PROFILE[PROF_OF[t]](h, dow) / C.norm[t]); if (wave && (!wave.type || wave.type === t)) lam *= wave.mult;
      if (t === 'asb') lam *= 1 + 0.5 * (1 - svc('youth')) + 0.3 * (1 - svc('bins'));
      if (t === 'publicorder' || t === 'assault') { lam *= 1 + 0.1 * (1 - C.police.cap); lam *= C.nteF; } // visitors come for the night-time economy: the stream follows the number of licensed premises (see monthly)
      let n = pois(r, lam); while (n-- > 0) ATTEMPT[t](null, r);
    }
    // night-time-economy exposure of residents who are out in the city centre (off the map): stranger violence, theft from the person and sexual offences, with the same guardianship logic
    if (h >= 20 || h < 4) { const s = snap(); if (s.nte.length) { const base = PROFILE.nte(h, dow) / 4, wv = wave && (!wave.type || wave.type === 'assault') ? wave.mult : 1;
      for (const v of s.nte) { const a = ageOf(v); if (a < 16) continue; const al = v.ext.hl ? v.ext.hl.alc || 0 : 0, M = v.sex === 'M', c = crOf(v), dr = 1 + PARAMS.drinkRisk * al, vu = Math.min(6, vuln(v));
        const lamA = PARAMS.NTE.assault * base * dr * vu * peerOfAnon(a) * (M ? 1 : PARAMS.sexPair) * wv * (1 + 0.1 * (1 - C.police.cap)) * 2 / (1 + PARAMS.sexPair), lamT = PARAMS.NTE.theftperson * base * dr * (a < 45 ? 1.2 : 0.7), lamS = PARAMS.NTE.sexual * base * dr * (M ? 0.2 : 1) * 2 / 1.2;
        if (r.next() < lamA) { const u = r.next(); commit('assault', { off: null, vic: v, hh: hhOf(v), known: 0, city: 1, injury: u < 0.58 ? 'none' : u < 0.97 ? 'minor' : 'serious', place: null }); }
        if (r.next() < lamT) commit('theftperson', { off: null, vic: v, hh: hhOf(v), loss: 250, place: null, city: 1, force: r.next() < 0.12 });
        if (r.next() < lamS) commit('sexual', { off: null, vic: v, hh: hhOf(v), known: 0.1, place: null, city: 1 }); } } }
    // resident offenders
    if (C.lamTot > 0) {
      let n = pois(r, C.lamTot / H * 1.0); while (n-- > 0) {
        const x = r.next() * C.lamTot; let lo = 0, hi = C.cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (C.cum[m] < x) lo = m + 1; else hi = m; } const o = W.people.get(C.act[lo]); if (!o || !o.alive || o.ext.cr.cust > w.tick) continue;
        const wt = typeWeights(o, h, dow), t = r.weighted(wt[0], wt[1]);
        if (t === 'sexualKnown') { sexualKnown(o, r); continue; }
        if (r.next() < PARAMS.away) { awayEpisode(o, t, r); continue; }
        ATTEMPT[t](o, r);
      }
    }
  }
  function typeWeights(o, h, dow) {
    const a = ageOf(o), c = o.ext.cr, hl = o.ext.hl || {}, dr = hl.drug || 0, al = hl.alc || 0, hot = o.traits.includes('hothead') ? 1 : 0, young = a < 19 ? 1 : 0, pov = (hhOf(o) && hhOf(o).fin ? hhOf(o).fin.stress : 0);
    const P = (t) => PROFILE[PROF_OF[t]](h, dow);
    const m = { shoplift: (0.9 + 2 * dr + 0.8 * young + pov) * P('shoplift'), burglary: (0.15 + 1.2 * dr) * P('burglary') * (a > 16 ? 1 : 0.3), theft: 0.4 + dr, vehicle: (0.15 + 0.5 * dr) * P('vehicle'), bike: (young ? 0.9 : 0.15) * P('bike'), theftperson: (0.2 + 0.5 * dr) * P('theftperson'),
      damage: (0.7 + 0.8 * young + 0.8 * hot) * P('damage'), asb: (young ? 2.2 : 0.2) * P('asb') * (1 + (1 - svc('youth'))), assault: (0.5 + 1.4 * hot + 0.6 * al + 0.5 * c.vn) * P('assault'), harass: 0.25 + 0.5 * hot, publicorder: (0.1 + 0.7 * al) * P('publicorder'), sexualKnown: o.sex === 'M' && a >= 16 ? PARAMS.sexualKnown * (1 + 1.5 * al + 0.8 * dr + 1.0 * hot) : 0 };
    const ts = Object.keys(m); return [ts, ts.map((k) => m[k])];
  }
  function awayEpisode(o, t, r) { // offence elsewhere in the city: only the offender's own record is affected
    cnt('away', t); cnt('offAll', band(ageOf(o)) + o.sex); o.ext.cr.nAll = (o.ext.cr.nAll || 0) + 1; const T = TYPES[t]; if (T.noRecord) return; if (r.next() < T.rep * 0.9 * PARAMS.recording && r.next() < T.det * C.police.cap * (o.ext.cr.pri ? 1.3 : 1) * 1.5) { C.q.push({ t: W.tick + Math.round((10 + r.next() * 40) * D), ty: t, off: o.id, vic: null, sev: T.sev, dom: 0, stage: 0, eid: 0, away: 1, withdraw: 0.02 }); } // x1.5: an identified repeat local offender is easier to find than an anonymous one
  }
  function daily(w) {
    const r = R(w.tick, 'd'); outcomes();
    for (const k of Object.keys(C.hot)) if (C.hot[k] <= w.tick) { delete C.hot[k]; C.hotL = null; }
    // fraud: anonymous off-map offenders; victim susceptibility (online exposure, loneliness, age, savings)
    for (const p of w.living()) {
      const a = ageOf(p); if (a < 18) continue; const hl = p.ext.hl, q = p.ext.pop; const sus = 0.7 + (a >= 65 ? 0.9 : a >= 50 ? 0.3 : 0) + (hl && hl.lonely ? 0.7 : 0) + (q && q.fin && q.fin.savings > 5000 ? 0.4 : 0) - (q && q.edu === 'level4plus' ? 0.3 : 0);
      if (r.next() < PARAMS.fraud * sus / 365 * (C.wave && C.wave.until > w.tick && (!C.wave.type || C.wave.type === 'fraud') ? C.wave.mult : 1)) { const loss = Math.round(40 + Math.exp(r.gauss(5.2, 1.5)) * (a >= 65 ? 2 : 1)); commit('fraud', { off: null, vic: p, hh: hhOf(p), loss: Math.min(loss, 20000), place: null }); }
    }
    // domestic abuse: ongoing relationship state (sensitive; invisible in rumours/feed)
    for (const k of Object.keys(C.dom)) { const d = C.dom[k], a = W.people.get(d.o), b = W.people.get(d.v); if (!a || !b || !a.alive || !b.alive || !a.romance || a.romance.partnerId !== b.id) { delete C.dom[k]; continue; }
      if (r.next() < 0.006) commit(r.next() < PARAMS.domSexual ? 'sexual' : r.next() < 0.45 ? 'assault' : 'harass', { off: a, vic: b, hh: hhOf(b), known: 1, dom: true, injury: 'none', place: a.homeId }); // roughly one recorded-or-not incident every 3 weeks within a relationship
    }
  }
  function weekly(w) {
    // move-away decisions and watch lapse are handled here (weekly granularity)
    const r = R(w.tick, 'wk'), q = C.moveQ; C.moveQ = [];
    for (const e of q) { if (e.t > w.tick) { C.moveQ.push(e); continue; } const hh = w.lf.households[e.hh], v = w.people.get(e.v); if (!hh || hh.gone || !v) continue; const rent = hh.tenure === 'private_rent'; const fear = crOf(v).fear;
      if (r.next() < PARAMS.moveAfterBurglary * (0.5 + 1.5 * fear) * (rent ? 1.6 : 0.8)) { w.cmd('housing.move', { hh: hh.id, reason: 'crime', out: r.next() < 0.5 }); w.emit('crime.moved_away', { actors: [v.id], salience: 0.2, tags: ['crime', 'housing'], payload: { kind: 'burglary' } }); cnt('moved', 'n'); } }
  }
  function monthly(w) {
    const r = R(w.tick, 'mo'); monthlyRisk();
    // NIGHT-TIME-ECONOMY SIZE. Visitors (the anonymous stranger stream) are drawn by pubs, bars, restaurants and takeaways, so their volume follows how many of those are open relative to day 1, with an
    // elasticity below 1 (violence rises with licensed-outlet density, ~0.2-0.5: Livingston 2008 Addiction, Home Office 2012 alcohol-related-violence reviews). Without this the stream was a fixed per-ward
    // number, so per-resident recorded violence fell whenever the population grew.
    { let n = 0; for (const b of w.buildings.values()) if (b.lf && PUBS.has(b.lf.template)) n++; if (C.pub0 == null) C.pub0 = Math.max(1, n); C.nteF = Math.pow(Math.max(1, n) / C.pub0, PARAMS.nteElast); }
    // drug offences are found by police (stop and search, searches during other contact), not reported by victims; dealing is small and mostly invisible
    for (const p of w.living()) { const hl = p.ext.hl; if (!hl || !hl.drug || ageOf(p) < 14) continue; const c = crOf(p);
      c.deal = c.deal || (c.lam > 0.5 && hl.drug > 0 && r.next() < 0.02 ? 1 : 0); const vis = (ageOf(p) < 30 ? 1.4 : 0.7) * (hl.drug === 2 ? 1.3 : 1);
      if (r.next() < 0.035 * C.police.cap * vis * (c.deal ? 1.5 : 1)) commit('drugs', { off: p, place: null, silent: true }); }
    // domestic abuse onset: couples, hazard rises with the riskier partner's propensity, drinking and stress
    for (const hh of liveHh(w)) { if (hh.gone) continue; const ms = hh.members.map((i) => w.people.get(i)).filter((p) => p && p.alive && p.romance && p.romance.partnerId != null && ageOf(p) >= 16);
      for (const a of ms) { const b = w.people.get(a.romance.partnerId); if (!b || a.id > b.id || !b.alive) continue; const key = a.id + '_' + b.id; if (C.dom[key]) continue;
        const ra = domRisk(a), rb = domRisk(b), o = ra >= rb ? a : b, v = o === a ? b : a; if (r.next() < 0.017 / 12 * Math.max(ra, rb)) { C.dom[key] = { o: o.id, v: v.id, t0: w.tick }; cnt('domStart', 'n'); } }
    }
    for (const k of Object.keys(C.dom)) if (r.next() < 0.04) { delete C.dom[k]; cnt('domEnd', 'n'); } // ends: separation, leaving, intervention (abusive relationships typically last years)
    // fear and watch
    const S = w.sys.social ? w.sys.social.query : null;
    for (const p of w.living()) { const c = crOf(p), a = ageOf(p); let b = 0.08 + 0.22 * p.personality.neuroticism + (a >= 70 ? 0.12 : 0) + (p.sex === 'F' && a < 70 ? 0.08 : 0) + (a < 16 ? -0.1 : 0); if (S && a >= 16) b += 0.06 * Math.min(4, S.beliefs(p.id, { kind: 'crime_nearby' }).length);
      const target = clamp(b + (C.street[streetOf(p)] ? 0.04 * C.street[streetOf(p)].filter((t) => w.tick - t < 180 * D).length : 0), 0, 1); c.fear = clamp(Math.max(c.fear, 0) * 0.85 + 0.15 * target, 0, 1); c.fearBase = target; }
    for (const [sid, ppl] of w.soc.street) {
      const ts = (C.street[sid] || []).filter((t) => w.tick - t < 270 * D);
      if (C.watch[sid]) { if (r.next() < 0.015) { delete C.watch[sid]; w.emit('crime.watch_lapsed', { salience: 0.1, tags: ['civic'], payload: { street: +sid } }); } continue; }
      if (ts.length < 3 || r.next() > 0.1 * ts.length) continue; // street-level concern needs repeated incidents before anyone organises
      const lead = ppl.map((i) => w.people.get(i)).filter((p) => p && p.alive && ageOf(p) > 28 && p.values.community > 0.5 && p.personality.conscientiousness > 0.45 && p.ext.pop && ['employed', 'retired', 'home_family'].includes(p.ext.pop.activity)).sort((x, y) => y.values.community - x.values.community)[0];
      if (!lead) continue; startWatch(+sid, lead, ppl, r);
    }
  }
  function domRisk(p) { const hl = p.ext.hl || {}, a = ageOf(p); return Math.exp((p.sex === 'M' ? 0.6 : -0.2) + 1.2 * (0.5 - p.personality.agreeableness) + (p.traits.includes('hothead') ? 0.5 : 0) + (hl.alc === 2 ? 0.7 : hl.alc ? 0.2 : 0) + (hl.drug ? 0.5 : 0) + 0.8 * ((hl.S ?? 0.2) - 0.2) + (a < 30 ? 0.7 : a < 45 ? 0.2 : a < 60 ? -0.4 : -1.1)); } // CSEW: domestic abuse prevalence falls steeply with age (16-19 highest, 65-74 about a fifth)
  function startWatch(sid, lead, ppl, r) {
    if (C.watch[sid]) return; const mem = [lead.id]; for (const i of ppl) { const p = W.people.get(i); if (p && p.alive && p !== lead && ageOf(p) > 25 && r.next() < 0.1 + 0.25 * p.values.community && mem.length < 14) mem.push(i); } if (mem.length < 4) return;
    C.watch[sid] = { t: W.tick, n: mem.length, lead: lead.id }; if (W.commands.has('comms.createChat')) W.cmd('comms.createChat', { kind: 'residents', members: mem, name: streetName(sid) + ' Neighbourhood Watch' });
    W.emit('crime.watch_started', { actors: [lead.id], salience: 0.3, tags: ['civic', 'success'], payload: { street: sid } });
  }

  // ------------------------------------------------------------------ describe (sober one-line text of a log record)
  function describe(e) {
    const v = e.v != null ? W.people.get(e.v) : null, st = streetName(e.sid), T = TYPES[e.type]; if (e.dom || e.sens) return 'Police recorded an incident. No further detail is published.';
    const rep = e.rec ? 'reported to the police' : 'not reported to the police';
    switch (e.type) {
      case 'burglary': return `Burglary on ${st}: ${name(v)} came home to find the house had been entered while it was empty (${rep}).`;
      case 'bike': return `${name(v)}'s bike was stolen from outside ${v && v.locationId != null && W.buildings.get(v.locationId) ? W.buildings.get(v.locationId).name : 'home'} (${rep}).`;
      case 'vehicle': return `A car was broken into on ${st} overnight (${rep}).`;
      case 'theftperson': return `${name(v)} had a phone taken in the street (${rep}).`;
      case 'shoplift': { const b = e.ven != null ? W.buildings.get(e.ven) : null; return `Shoplifting at ${b ? b.name : 'a local shop'}, about £${e.loss} of stock (${rep}).`; }
      case 'damage': return `Criminal damage on ${st}: a car and a gate were damaged (${rep}).`;
      case 'asb': return `Groups of young people gathered on ${st} in the evening; neighbours reported noise and litter.`;
      case 'assault': return e.inj === 'none' ? `An argument turned into a physical assault; no serious injury (${rep}).` : `${name(v)} was injured in an assault and treated for it (${rep}).`;
      case 'harass': return `A long-running dispute escalated into harassment (${rep}).`;
      case 'fraud': return `${name(v)} lost £${e.loss} to a scam call (${rep}).`;
      case 'publicorder': return 'A public-order offence was recorded after closing time.';
      case 'drugs': return 'A drug offence was recorded after a police search.';
      case 'theft': return `Items were taken from a garden shed on ${st} (${rep}).`;
      default: return `${T.label} (${rep}).`;
    }
  }

  const plugin = {
    name: 'crime', version: '1.0.0', deps: ['social', 'health', 'housing'],
    init(world) {
      W = world; for (const [t] of EV) if (!world.events.registry.has(t)) world.registerEventType(t, { doc: 'A crime incident', payload: { kind: 'string', rec: 'boolean' }, template: t });
      for (const [t, d, pl] of EV2) if (!world.events.registry.has(t)) world.registerEventType(t, { doc: d, payload: pl, template: t });
      C = world.lf.crime = { seq: 1, nteF: 1, pub0: null, exp: {}, rec: {}, rep: {}, det: {}, ch: {}, conv: {}, sent: {}, away: {}, vicBand: {}, offBand: {}, log: [], q: [], moveQ: [], hot: {}, sec: {}, watch: {}, street: {}, dom: {}, shopLoss: {}, attend: [], police: { cap: 1 }, wave: null, act: [], cum: [], lamTot: 0, t0: world.tick, norm: {}, hom: {}, moved: {}, domStart: {}, domEnd: {} };
      for (const t of Object.keys(PARAMS.OUT)) { let s = 0; for (let dw = 0; dw < 7; dw++) for (let h = 0; h < 24; h++) s += PROFILE[PROF_OF[t]](h, dw); C.norm[t] = s / 168; }
      // day-1 inputs: prior records sampled from the same propensity that drives later offending (persistent offenders exist before the record starts)
      for (const p of world.living()) { const c = crOf(p); const lam = risk(p), a = ageOf(p); if (a > 18 && R(p.id, 'prior').next() < 1 - Math.exp(-lam * Math.min(8, a - 14) * 0.3)) c.pri = 1 + (R(p.id, 'p2').next() < 0.3 ? 1 : 0); }
      monthlyRisk();
      world.on('life.breakup', (ev) => { for (const k of Object.keys(C.dom)) { const d = C.dom[k]; if (ev.actors.includes(d.o) || ev.actors.includes(d.v)) delete C.dom[k]; } });
      if (world.events.registry.has('project.effect')) world.on('project.effect', (ev) => { if (ev.payload && ev.payload.effect === 'patrols_started') { const l = world.people.get(ev.actors[0]); const sid = l ? streetOf(l) : -1; if (sid >= 0 && !C.watch[sid]) { C.watch[sid] = { t: world.tick, n: 6, lead: l.id }; } } });
    },
    clocks: { hour: hourly, day: daily, week: weekly, month: monthly },
    commands: {
      'crime.wave': (w, a) => { C.wave = { until: w.tick + (a.days || 30) * D, mult: a.mult || 3, type: a.type || null }; w.emit('crime.antisocial', { salience: 0.5, tags: ['crime', 'god', 'unsafe_area'], payload: { kind: 'wave', rec: true } }); return true; },
      'crime.waveEnd': (w) => { const on = !!(C.wave && C.wave.until > w.tick); C.wave = null; return on; }, // god: end a spate of offending early
      'crime.policeCuts': (w, a) => { C.police.cap = clamp(C.police.cap * (1 - (a.pct ?? 0.2)), 0.2, 2); return C.police.cap; },
      'crime.policeBoost': (w, a) => { C.police.cap = clamp(C.police.cap * (1 + (a.pct ?? 0.2)), 0.2, 2); return C.police.cap; },
      'crime.report': (w, a) => { const v = w.people.get(a.pid); if (!v) return false; const e = [...C.log].reverse().find((x) => x.v === v.id && !x.rec && !x.dom); if (!e) return false; e.rec = 1; cnt('rep', e.type); cnt('rec', e.type); crOf(v).trust = clamp(crOf(v).trust + 0.03, 0, 1); w.emit('crime.reported', { actors: [v.id], cause: e.eid, salience: 0.05, tags: ['crime', 'player'], payload: { kind: e.type } }); return true; },
      'crime.joinWatch': (w, a) => { const p = w.people.get(a.pid); const sid = p ? streetOf(p) : -1; if (sid < 0) return false; if (!C.watch[sid]) startWatch(sid, p, (w.soc.street.get(sid) || []), R(w.tick, 'jw')); else C.watch[sid].n++; return !!C.watch[sid]; },
      'crime.lockUp': (w, a) => { const p = w.people.get(a.pid), hh = p && hhOf(p); if (!hh) return false; C.sec[hh.id] = clamp(secOf(hh) + 0.3, 0, 0.95); crOf(p).lock = 1; return true; },
    },
    query: {
      stats: () => ({ years: (W.tick - C.t0) / (365.25 * D), exp: { ...C.exp }, rec: { ...C.rec }, rep: { ...C.rep }, det: { ...C.det }, ch: { ...C.ch }, conv: { ...C.conv }, sent: { ...C.sent }, away: { ...C.away }, city: { ...C.city }, detAway: { ...C.detAway }, vicT: { ...C.vicT }, vicSrc: { ...C.vicSrc }, prisonDays: (C.prisonDays || {}).n || 0, vicBand: { ...C.vicBand }, offBand: { ...C.offBand }, offAll: { ...C.offAll }, hom: C.hom.n || 0, moved: C.moved.n || 0, domActive: Object.keys(C.dom).length, police: { ...C.police }, attendMedian: C.attend.length ? [...C.attend].sort((a, b) => a - b)[C.attend.length >> 1] : null, offenders: C.act.length, watch: Object.keys(C.watch).length, wave: C.wave && C.wave.until > W.tick ? { ...C.wave } : null }),
      risk: (pid) => { const p = W.people.get(pid); return p ? +risk(p).toFixed(3) : 0; }, fear: (pid) => { const p = W.people.get(pid); return p ? +crOf(p).fear.toFixed(2) : 0; },
      victim: (pid) => { const p = W.people.get(pid); return p ? { n: crOf(p).vn, by: { ...crOf(p).vt }, avoids: !!crOf(p).avoid, trust: +crOf(p).trust.toFixed(2) } : null; },
      offenders: () => C.act.map((id) => { const p = W.people.get(id); return p ? { id, lam: +crOf(p).lam.toFixed(2), prior: crOf(p).pri, conv: crOf(p).conv } : null; }).filter(Boolean),
      streetCrime: (sid) => (C.street[sid] || []).filter((t) => W.tick - t < 365 * D).length, shopLoss: (bid) => C.shopLoss[bid] || 0, inCustody: (pid) => { const p = W.people.get(pid); return !!(p && p.ext.cr && p.ext.cr.cust > W.tick); },
      recent: (n = 8) => C.log.filter((e) => !e.dom && !e.sens).slice(-n).reverse().map((e) => ({ t: e.t, type: e.type, text: describe(e) })), describe, watch: () => Object.keys(C.watch).map((s) => ({ street: +s, name: streetName(+s), since: C.watch[s].t, members: C.watch[s].n })),
      police: () => ({ ...C.police }), types: () => TYPE_IDS.slice(), groups: () => CAL_GROUPS,
    },
  };
  return plugin;
}
export default createCrime;
