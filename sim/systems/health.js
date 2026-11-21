// HEALTH system: ageing & frailty, lifestyle effects, seasonal/contagious illness with incubation, workplace injuries,
// chronic conditions, clinic & doctor, natural mortality (Gompertz, adult life expectancy ~65-75), grief, funerals,
// graves/epitaphs, obituaries, widowhood, depression. Deaths go through world.killPerson(p, cause).
// Per-person state lives in p.ext.health; town state in world.healthState (+ world.town.graves). API: world.healthApi.
// sim/ code: no DOM, world.rng only. Works if a person's actions are chosen externally (player): modifiers only affect AI
// scoring and forced actions (funeral) are skipped for world.player; the 'funeral' world event carries details instead.
import { clamp } from '../util.js';

const TPD = 144, DPY = 112, YEAR = TPD * DPY;
let W = null;
const P = (id) => (id == null || !W ? null : W.people.get(id) || null);
const nm = (p) => `${p.firstName} ${p.lastName}`;
const age = (p) => (W ? W.ageOf(p) : 30);
const isPlayer = (p) => W && W.player != null && W.player === p.id;
const pro = (p) => (p.sex === 'F' ? { s: 'she', o: 'her', p: 'her', c: 'She' } : { s: 'he', o: 'him', p: 'his', c: 'He' });
const H = (p) => (p.ext.health || (p.ext.health = { immune: {}, chronic: [], dep: 0, depressed: false, grief: 0, incub: null, starveStreak: 0, lastRealJob: null, mourning: [] }));
const pick = (a) => W.rng.pick(a);
const chance = (x) => W.rng.next() < x;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numWord = (n) => (n <= 12 ? NUM[n] : String(n));
const moodlet = (p, id, label, value, ticks) => W.moodlet(p, id, label, value, ticks);
const mem = (p, type, text, otherIds, weight, importance) => W.addMemory(p, { type, text, otherIds: otherIds || [], weight, importance });
const chron = (type, importance, text, people, buildingId) => W.chronicle.add({ type, importance, text, people: (people || []).filter((x) => x != null), buildingId });
const rint = (a, b) => W.rng.int(a, b);
const rfl = (a, b) => W.rng.float(a, b);
const range = (r) => rfl(r[0], r[1]);

// ---------------------------------------------------------------------------------------------- disease table
// beta = per-hour transmission chance (co-located, scaled), cfr = typical-adult case fatality, dur in days.
import { DIS, INJ_JOB, JOBNOUN, DUSTY } from '../data/health.js';
// ---------------------------------------------------------------------------------------------- state
function S() { return W.healthState; }

// ---------------------------------------------------------------------------------------------- mortality model
function annualHazard(a) { // Gompertz-Makeham for people past childhood (family.js handles under 15)
  return 0.001 + 4.0e-5 * Math.exp(0.1 * a);
}
function ageMult(a) { return a < 2 ? 3 : a < 5 ? 2 : a < 15 ? 0.8 : a < 50 ? 1 : a < 65 ? 2 : a < 75 ? 4 : 8; }
function vitMult(p) { return Math.exp(-1.2 * (p.genes.vitality - 0.5)); }
function chronicMult(p) {
  let m = 1;
  for (const c of H(p).chronic) m *= 1 + c.sev * (CHRONIC[c.id] ? CHRONIC[c.id].mort : 0);
  return m;
}
function hasDoctor() { return S().doctors.length > 0; }

const CHRONIC = {
  joints: { name: 'aching joints', mort: 0.1, health: 0.05 },
  dropsy: { name: 'dropsy of the heart', mort: 2.0, health: 0.1, cause: 'dropsy of the heart' },
  lungs: { name: 'a wasting cough of the lungs', mort: 1.2, health: 0.09, cause: 'a wasting of the lungs' },
  gout: { name: 'the gout', mort: 0.2, health: 0.05 },
  sight: { name: 'failing eyes', mort: 0, health: 0.02 },
  palsy: { name: 'the palsy', mort: 0.8, health: 0.08, cause: 'the palsy' },
  consumption: { name: 'consumption', mort: 5, health: 0.14, cause: 'consumption' },
  lame: { name: 'a lame leg from an old injury', mort: 0, health: 0.04 },
  stiffhand: { name: 'a stiff, crippled hand', mort: 0, health: 0.03 },
};
function addChronic(p, id, sev = 0.3) {
  const h = H(p);
  if (h.chronic.some((c) => c.id === id)) return;
  h.chronic.push({ id, sev, since: W.tick });
  mem(p, 'health', `Began to suffer ${CHRONIC[id].name}.`, [], -0.3, 2);
}
function chronicOnset(p, a, h) {
  const job = p.job, w = DPY;
  const add = (id, annual) => { if (!h.chronic.some((c) => c.id === id) && chance(annual / w)) addChronic(p, id, rfl(0.15, 0.4)); };
  if (a >= 38) add('joints', (0.01 + (a - 38) * 0.004) * (job === 'farmer' || job === 'laborer' || job === 'smith' ? 1.5 : 1));
  if (a >= 48) add('dropsy', 0.002 * (a - 46) * (1 + (p.personality.neuroticism - 0.5)) * (p.traits.includes('drunkard') ? 1.4 : 1));
  if (a >= 32) add('lungs', (0.003 + (a - 32) * 0.0006) * (DUSTY.has(job) ? 3 : 1));
  if (a >= 40) add('gout', 0.008 * (p.traits.includes('drunkard') ? 3 : 1) * (p.money > 250 ? 1.6 : 1));
  if (a >= 55) add('sight', 0.05);
  if (a >= 65) add('palsy', 0.012 + (a - 65) * 0.002);
  if (a >= 13 && a < 55) add('consumption', 0.0035 * (p.money < 10 ? 2 : 1) * (p.needs.hygiene < 0.3 ? 1.4 : 1));
}

// ---------------------------------------------------------------------------------------------- infection / illness lifecycle
function susceptible(p, id) {
  if (!p.alive || p.emigrated || p.illness) return false;
  const h = H(p);
  if (h.incub) return false;
  if (h.immune[id] && h.immune[id] > W.tick) return false;
  return true;
}
function infect(p, id, src, opts = {}) {
  const def = DIS[id]; if (!def || !p || !susceptible(p, id)) return false;
  const h = H(p);
  const days = opts.immediate ? 0 : range(def.incub);
  h.incub = { id, until: W.tick + Math.round(days * TPD), src: src ? src.id : null };
  if (opts.immediate) onset(p, h);
  return true;
}
function exposure(src, tgt, def, beta, mult = 1) {
  if (!susceptible(tgt, def.id)) return;
  const a = age(tgt);
  let b = beta * mult * (1.35 - 0.6 * tgt.genes.vitality) * (tgt.health < 0.5 ? 1.4 : 1) * (a < 5 || a > 65 ? 1.2 : 1);
  if (tgt.needs.hygiene < 0.3) b *= 1.3;
  if (def.hyg) b *= 0.6 + 1.2 * (1 - tgt.needs.hygiene);
  if (def.resp && W.time.season === 3) b *= 1.35;
  if (tgt.money < 5) b *= 1.15;
  if (W.rng.next() < b) infect(tgt, def.id, src);
}
function onset(p, h) {
  const inc = h.incub; h.incub = null;
  const def = DIS[inc.id]; if (!def || p.illness || !p.alive) return;
  const a = age(p);
  let peak = range(def.sev) * (a > 65 ? 1.15 : 1) * (1.15 - 0.3 * p.genes.vitality);
  peak = clamp(peak, 0.08, 1);
  const dur = Math.max(2, Math.round(range(def.dur) * (1.1 - 0.2 * p.genes.vitality)));
  p.illness = { name: def.name, id: def.id, severity: peak * 0.5, peak, contagious: !!def.contagious, sinceTick: W.tick, dur, day: 0, treated: false, quality: 0, injury: !!def.injury, incap: !!def.incap, src: inc.src, how: inc.how || '' };
  W.stats.illnesses = (W.stats.illnesses || 0) + 1;
  if (!def.injury) mem(p, 'illness', `Fell ill with ${def.name}.`, inc.src ? [inc.src] : [], -0.4, 2);
  moodlet(p, 'sick', `Ill with ${def.name}`, -0.25 - 0.3 * peak, Math.max(2, dur) * TPD);
  const ob = trackCase(p, def);
  if (ob && def.epi && !ob.announced) announceOutbreak(ob, def, p);
}
function trackCase(p, def) {
  const st = S(); let o = st.outbreaks[def.id];
  if (!o || !o.active) { o = st.outbreaks[def.id] = { id: def.id, name: def.name, start: W.tick, cases: 0, deaths: 0, active: true, announced: false, first: p.id, peakActive: 0 }; }
  o.cases++; return o;
}
function announceOutbreak(o, def, first) {
  o.announced = true;
  const src = pick(['a carter come up from the river road', 'a pedlar who lodged at the inn', 'a traveller who passed through market day', 'a barge-man from downstream', 'a returning soldier', 'a stranger who stayed a night at the tavern']);
  const T = [
    () => `${def.name[0].toUpperCase() + def.name.slice(1)} has come to ${W.town?.name || 'the town'}. ${nm(first)} was the first to be taken ill; folk say ${src} carried it in.`,
    () => `Alarm in ${W.town?.name || 'the town'}: ${nm(first)} lies sick with ${def.name}, and neighbours are bolting their doors. Some blame ${src}.`,
    () => `${nm(first)} is the first known case of ${def.name} this season. The doctor warns of contagion; the priest calls for prayer.`,
  ];
  chron('outbreak', 4, pick(T)(), [first.id]);
  W.emit('outbreak', { disease: def.id, name: def.name, first });
}
function seedOutbreak(id, n = 2, opts = {}) {
  const def = DIS[id]; if (!def) return 0;
  const L = W.living().filter((p) => susceptible(p, id) && !p.emigrated);
  if (!L.length) return 0;
  let k = 0;
  for (let i = 0; i < n && L.length; i++) {
    const p = L.splice(rint(0, L.length - 1), 1)[0];
    if (infect(p, id, null, { immediate: opts.immediate !== false })) k++;
  }
  return k;
}

function treat(p, doc, kind) { // kind: 'doctor'|'nurse'|'home'
  const ill = p.illness; if (!ill || ill.treated) return false;
  let q = kind === 'home' ? 0.1 : 0.2 + 0.8 * clamp(((doc && doc.skills.medicine) || 0) * 1.15);
  if (kind === 'nurse') q *= 0.6;
  ill.treated = true; ill.quality = q;
  ill.dur = Math.max(ill.day + 1, Math.round(ill.dur - (ill.dur - ill.day) * 0.25 * q));
  if (doc && doc.alive) { doc.skills.medicine = clamp((doc.skills.medicine || 0) + 0.003); const r = W.getRel(doc, p); if (r) r.familiarity = Math.min(1, r.familiarity + 0.04); }
  return true;
}
function payFee(p, doc, sev) {
  const fee = Math.round(2 + 5 * sev);
  let payer = p.money >= fee ? p : null;
  if (!payer && p.homeId != null) { const b = W.buildings.get(p.homeId); if (b) for (const id of b.residents) { const r = P(id); if (r && r.alive && r.money >= fee && age(r) >= 18 && (!payer || r.money > payer.money)) payer = r; } }
  if (payer) { payer.money -= fee; if (doc) doc.money += fee; return true; }
  // charity: kind doctors treat the poor
  return !!(doc && (doc.traits.includes('kind') || chance(0.4)));
}
function illCause(p, def, a) {
  if (def.resp && a >= 60) return pick(['pneumonia following a cold', 'a lung fever in old age', 'a chill that settled on the chest']);
  return pick(def.causes);
}

function progressIllness(p, h, a) {
  const ill = p.illness; const def = DIS[ill.id];
  if (!def) { p.illness = null; return; }
  ill.day++;
  const frac = ill.day / Math.max(1, ill.dur);
  const prof = frac < 0.3 ? 0.5 + (frac / 0.3) * 0.5 : Math.max(0.05, 1 - ((frac - 0.3) / 0.7) * 0.95);
  ill.severity = clamp(ill.peak * prof, 0, 1);
  // doctor house calls for the gravely ill
  if (!ill.treated && ill.severity > 0.55 && hasDoctor() && !p.emigrated && chance(0.35)) {
    const doc = pick(S().doctors);
    if (payFee(p, doc, ill.severity)) treat(p, doc, 'doctor');
  } else if (!ill.treated && ill.severity > 0.35 && chance(0.1)) {
    treat(p, null, 'home'); // grandmother's remedies, poultices, a neighbour's care
  }
  // wounds can fester
  if (def.injury && def.infect && ill.day > 1 && ill.day < ill.dur * 0.7) {
    const pr = def.infect * (1 - 0.6 * (ill.treated ? ill.quality : 0)) * (p.needs.hygiene < 0.3 ? 1.6 : 1) / ill.dur;
    if (W.rng.next() < pr) {
      const keep = ill; p.illness = null; h.incub = { id: 'woundfever', until: W.tick, src: null }; onset(p, h);
      if (p.illness) { p.illness.how = keep.name; mem(p, 'illness', `My ${keep.name.replace(/^an? /, '')} festered, and a fever took hold.`, [], -0.5, 3); }
      return;
    }
  }
  // case fatality
  if (def.cfr > 0 && a >= 15) { // under-15 deaths (illness included) are modelled once, in family.js child mortality
    const mid = frac > 0.15 && frac < 0.9 ? 1.4 : 0.25;
    let m = ageMult(a) * vitMult(p) * (1 + 2 * Math.max(0, 0.6 - p.health)) * mid * chronicMult(p);
    if (ill.treated) m *= 1 - 0.45 * ill.quality;
    if (p.homeId != null) { const hb = W.buildings.get(p.homeId); if (hb && hb.residents.length > 1) m *= 0.9; }
    if (W.rng.next() < (def.cfr / ill.dur) * m) { dieOf(p, illCause(p, def, a), { illness: def.id }); return; }
  }
  if (ill.day >= ill.dur) recover(p, h, def);
}
function recover(p, h, def) {
  const ill = p.illness; p.illness = null;
  if (def.immune) h.immune[def.id] = W.tick + def.immune * TPD;
  if (def.scars) { p.genes.looks = clamp(p.genes.looks - 0.08); h.scarred = true; }
  if (def.maim && chance(def.maim)) addChronic(p, def.id === 'leg' ? 'lame' : def.id === 'back' ? 'joints' : 'stiffhand', 0.35);
  if (!def.injury && (def.epi || ill.peak > 0.5)) { mem(p, 'illness', `Recovered from ${def.name}${def.scars ? ', though it left its marks' : ''}.`, [], 0.3, 3); moodlet(p, 'recovered', 'Glad to be well again', 0.2, 10 * TPD); }
  const o = S().outbreaks[def.id]; if (o) o.recovered = (o.recovered || 0) + 1;
  W.emit('recovered', { person: p, disease: def.id });
}

function dieOf(p, cause, info = {}) {
  if (!p.alive) return;
  const h = H(p); h.killedBy = info.illness || info.kind || 'natural';
  const o = info.illness && S().outbreaks[info.illness]; if (o) o.deaths++;
  S().deathsByCause[cause] = (S().deathsByCause[cause] || 0) + 1;
  W.killPerson(p, cause);
}

function startInjury(p, a) {
  const spec = INJ_JOB[p.job];
  let kinds;
  if (spec) kinds = spec[1];
  else if (a < 15) kinds = [['fall', 3, 'from a tree'], ['cut', 2, 'at play'], ['arm', 1, 'in a tumble']];
  else if (a > 65) kinds = [['fall', 4, 'on an icy step'], ['arm', 1, 'in a stumble']];
  else kinds = [['cut', 2, 'at home'], ['back', 1, 'at the work'], ['fall', 1, 'on the road']];
  const pickK = W.rng.weighted(kinds, (k) => k[1]);
  const def = DIS[pickK[0]];
  if (!susceptible(p, def.id) && p.illness) return;
  if (p.illness || H(p).incub) return;
  H(p).incub = { id: def.id, until: W.tick, src: null, how: pickK[2] };
  onset(p, H(p));
  if (!p.illness) return;
  const where = pickK[2];
  mem(p, 'injury', `Suffered ${def.name} ${where}.`, [], -0.4, 2);
  if (def.sev[0] >= 0.45 && p.illness.peak > 0.5) {
    const job = JOBNOUN[p.job] || 'townsman';
    chron('injury', 2, pick([
      `${nm(p)} the ${job} suffered ${def.name} ${where} and will be laid up for weeks.`,
      `A bad accident for ${nm(p)}: ${def.name} ${where}. ${pro(p).c} is being nursed at home.`,
    ]), [p.id]);
  }
}

// ---------------------------------------------------------------------------------------------- death aftermath
function closeness(d, q) {
  const f = d.family; const qf = q.family; let c = 0;
  const dAge = age(d);
  if (f.spouseId === q.id || d.romance?.partnerId === q.id) c = d.romance?.status === 'dating' ? 0.65 : 1;
  else if (qf.fatherId === d.id || qf.motherId === d.id) c = 0.95; // d was q's parent
  else if (f.childrenIds && f.childrenIds.includes(q.id)) c = 0.95;
  else if (f.fatherId === q.id || f.motherId === q.id) c = 0.9;
  else if ((f.siblingIds || []).includes(q.id) || (f.fatherId != null && f.fatherId === qf.fatherId) || (f.motherId != null && f.motherId === qf.motherId)) c = 0.6;
  else {
    const gp = [P(f.fatherId), P(f.motherId)];
    for (const par of gp) if (par && (par.family.fatherId === q.id || par.family.motherId === q.id)) c = 0.5;
    for (const kid of f.childrenIds || []) { const k = P(kid); if (k && k.family.childrenIds.includes(q.id)) c = 0.5; }
  }
  const r = q.relationships.get(d.id);
  if (r) c = Math.max(c, clamp(Math.max(0, r.affinity) * (0.35 + 0.65 * r.familiarity) * 0.85));
  return dAge < 0 ? 0 : c;
}
function relWord(d, q) {
  const f = d.family;
  if (f.spouseId === q.id) return d.sex === 'F' ? 'wife' : 'husband';
  if (q.family.fatherId === d.id || q.family.motherId === d.id) return d.sex === 'F' ? 'mother' : 'father';
  if ((f.childrenIds || []).includes(q.id)) return d.sex === 'F' ? 'daughter' : 'son';
  if ((f.siblingIds || []).includes(q.id)) return d.sex === 'F' ? 'sister' : 'brother';
  return null;
}

function onDeath(ev) {
  const d = ev && ev.person; if (!d || d.emigrated) return;
  const h = H(d); const a = age(d);
  S().deaths++;
  // --- who mourns
  const cand = new Set();
  for (const id of [d.family.spouseId, d.family.fatherId, d.family.motherId, d.romance?.partnerId, ...(d.family.childrenIds || []), ...(d.family.siblingIds || [])]) if (id != null) cand.add(id);
  let n = 0; for (const id of d.relationships.keys()) { if (++n > 80) break; cand.add(id); }
  const mourners = [];
  for (const id of cand) {
    const q = P(id); if (!q || !q.alive || q.emigrated || q === d) continue;
    const c = closeness(d, q); if (c < 0.12) continue;
    mourners.push({ id: q.id, c });
    const qh = H(q);
    const spouse = d.family.spouseId === q.id;
    qh.grief = clamp(qh.grief + c * (0.7 + 0.6 * q.personality.neuroticism) * (spouse ? 0.55 : 0.9), 0, 1.2);
    qh.dep = clamp(qh.dep + c * c * 0.25 * (0.5 + q.personality.neuroticism));
    if (c >= 0.5) {
      qh.mourning.push({ id: d.id, c });
      if (qh.mourning.length > 6) qh.mourning.shift();
    }
    if (c >= 0.4 && !spouse && !(a < 15 && (d.family.fatherId === q.id || d.family.motherId === q.id) && false)) {
      const rw = relWord(d, q);
      mem(q, 'bereavement', `${nm(d)}${rw ? ', my ' + rw + ',' : ''} died of ${d.causeOfDeath || 'unknown causes'}.`, [d.id], -clamp(c * 0.8 + 0.2), c > 0.8 ? 5 : 4);
    }
    if (spouse) { q.widowed = true; qh.widowed = { tick: W.tick, spouseId: d.id }; }
  }
  // --- a funeral is arranged
  const temple = W.buildingsOfType('temple')[0] || W.buildingsOfType('townhall')[0] || null;
  const dayOff = chance(0.65) ? 1 : 2;
  S().funerals.push({ id: d.id, buildingId: temple ? temple.id : null, day: W.time.totalDays + dayOff, mourners, attendees: [], invited: false, done: false });
  // --- obituary
  if (shouldChronicle(d, h, a)) chron('death', obitImportance(d, a), obituary(d, a), [d.id, d.family.spouseId, ...(d.family.childrenIds || []).slice(0, 3)]);
}
function shouldChronicle(d, h, a) {
  const c = d.causeOfDeath || '';
  if (/murder|brawl|execut/.test(c)) return false; // crime.js chronicles these
  if (a < 15 && !h.killedBy) return false; // family.js chronicles child deaths
  return true;
}
function obitImportance(d, a) {
  let i = 2;
  if (['mayor', 'priest', 'doctor', 'teacher', 'captain'].includes(d.job)) i = 3;
  if (a >= 85 || d.reputation > 0.5 || (d.family.childrenIds || []).length >= 6) i = Math.max(i, 3);
  if (d.job === 'mayor') i = 4;
  return i;
}
function famLine(d) {
  const sp = P(d.family.spouseId); const kids = (d.family.childrenIds || []).map(P).filter((k) => k && k.alive);
  const gk = new Set(); for (const k of kids) for (const g of k.family.childrenIds || []) { const gp = P(g); if (gp && gp.alive) gk.add(g); }
  const bits = [];
  if (sp && sp.alive) bits.push(`${pro(d).p} ${sp.sex === 'F' ? 'wife' : 'husband'} ${sp.firstName}`);
  if (kids.length) bits.push(kids.length === 1 ? `a ${kids[0].sex === 'F' ? 'daughter' : 'son'}, ${kids[0].firstName}` : `${numWord(kids.length)} children`);
  if (gk.size >= 3) bits.push(`${numWord(gk.size)} grandchildren`);
  if (!bits.length) return pick(['leaving no kin in the town', 'having outlived nearly all ' + pro(d).p + ' family', 'with few to mourn ' + pro(d).o]);
  return `survived by ${bits.join(' and ')}`;
}
function lastJob(d) { const h = H(d); const j = JOBNOUN[d.job] ? d.job : h.lastRealJob; return j && JOBNOUN[j] ? { noun: JOBNOUN[j], retired: d.job === 'retired' || !JOBNOUN[d.job] } : null; }
function topSkill(d) {
  let best = null, v = 0.72; for (const k of Object.keys(d.skills)) if (d.skills[k] > v) { v = d.skills[k]; best = k; }
  return best;
}
function highlight(d, a) {
  const hs = []; const tr = d.traits; const h = H(d);
  if (d.job === 'mayor') hs.push(`${pro(d).c} had served the town as mayor`);
  if (d.ext.migration && d.ext.migration.arrivedTick != null) hs.push(`${pro(d).c} had come to the town as a stranger in ${W.formatDate(d.ext.migration.arrivedTick).split(', ')[1]}, and stayed`);
  const sk = topSkill(d);
  if (sk === 'smithing') hs.push(`${pro(d).p} ironwork was known across the valley`);
  if (sk === 'cooking') hs.push(`${pro(d).p} cooking was spoken of fondly`);
  if (sk === 'medicine') hs.push(`${pro(d).c} had tended many of the sick`);
  if (sk === 'farming') hs.push(`${pro(d).p} fields were always the first sown`);
  if (sk === 'teaching') hs.push(`generations of the town's children learned their letters from ${pro(d).o}`);
  if (tr.includes('kind')) hs.push(`${pro(d).c} was remembered for ${pro(d).p} kindness`);
  if (tr.includes('drunkard')) hs.push(`${pro(d).p} fondness for the tavern was no secret`);
  if (tr.includes('pious')) hs.push(`${pro(d).c} rarely missed a service`);
  if (tr.includes('gossip')) hs.push(`${pro(d).c} knew everyone's business and was the poorer for no one's secrets`);
  if (tr.includes('honest')) hs.push(`${pro(d).c} was known as an honest dealer`);
  if (tr.includes('charming')) hs.push(`${pro(d).c} will be missed for ${pro(d).p} good humour`);
  if (d.reputation > 0.55) hs.push(`${pro(d).c} was widely respected`);
  if (d.reputation < -0.45) hs.push(`few in town spoke warmly of ${pro(d).o}`);
  let fr = 0; for (const r of d.relationships.values()) if (r.affinity > 0.5 && r.familiarity > 0.5) fr++;
  if (fr >= 6) hs.push(`${pro(d).c} counted half the town as friends`);
  if (h.scarred) hs.push(`${pro(d).c} had survived the pox in ${pro(d).p} youth`);
  if (a >= 85) hs.push(`${pro(d).c} lived to see ${numWord(Math.max(1, Math.round((a - 60) / 8)))} winters beyond threescore years`);
  return hs.length ? pick(hs) : '';
}
function obituary(d, a) {
  const age_ = Math.floor(a); const cause = d.causeOfDeath || 'illness';
  const j = lastJob(d);
  const ofJob = j ? (j.retired ? `a retired ${j.noun}` : `the ${j.noun}`) : null;
  const fam = a >= 15 ? famLine(d) : '';
  const hl = a >= 15 ? highlight(d, a) : '';
  const hlS = hl ? ` ${hl[0].toUpperCase() + hl.slice(1)}.` : '';
  if (a < 1) return `${nm(d)}, an infant barely ${a < 0.1 ? 'days' : 'months'} old, died of ${cause}; the family is in mourning.`;
  if (a < 15) return `${nm(d)}, aged ${age_}, died of ${cause}. ${pro(d).c} was ${pick(['a lively child', 'well liked by the other children', 'a quiet, bright little ' + (d.sex === 'F' ? 'girl' : 'boy')])} and is mourned by family and schoolfellows.`;
  const who = ofJob && !j.retired ? `${nm(d)}, ${ofJob}, ` : `${nm(d)}${ofJob ? ', ' + ofJob : ''}, `;
  const T = [
    () => `${nm(d)}${ofJob ? ', ' + ofJob : ''}, died of ${cause} at the age of ${age_}${fam ? ', ' + fam : ''}.${hlS}`,
    () => `${who}passed away at ${age_} from ${cause}.${hlS}${fam ? ' ' + pro(d).c + ' is ' + fam + '.' : ''}`,
    () => `The town mourns ${nm(d)}, aged ${age_}, who died of ${cause}${fam ? '; ' + fam : ''}.${hlS}`,
    () => `${nm(d)} is dead. ${pro(d).c} was ${age_}${j ? (j.retired ? ' and retired from the ' + j.noun + "'s trade" : ', a ' + j.noun + ' by trade') : ''}, and ${cause} took ${pro(d).o}.${hlS}`,
  ];
  let s = pick(T)();
  if (cause === 'childbirth') s = `${nm(d)}, aged ${age_}, died in childbed; ${fam || 'the household is struck with grief'}.${hlS}`;
  return s;
}
function epitaph(d, a) {
  const f = d.family; const kids = (f.childrenIds || []).length;
  const he = pro(d);
  if (a < 1) return pick(['Too briefly ours', 'Asleep in the arms of the angels', 'A little candle, soon out']);
  if (a < 15) return pick([`Beloved ${d.sex === 'F' ? 'daughter' : 'son'}. Taken too soon`, 'Gone to the angels', `Our little ${d.sex === 'F' ? 'lass' : 'lad'}, never forgotten`]);
  const j = lastJob(d);
  const bits = [];
  if (j) bits.push(j.noun);
  const married = f.spouseId != null || H(d).widowed || (d.family.exSpouseIds || []).length === 0 && (d.romance?.status === 'married');
  if (kids > 0) bits.push(d.sex === 'F' ? `mother of ${numWord(kids)}` : `father of ${numWord(kids)}`);
  else if (married) bits.push(d.sex === 'F' ? 'wife' : 'husband');
  const lead = bits.length ? `Beloved ${bits.join(' and ')}` : pick(['Beloved neighbour', 'Beloved friend', 'Rest in peace']);
  const tail = [];
  if (d.traits.includes('pious')) tail.push('Now with the Lord');
  if (d.traits.includes('kind')) tail.push(`Kind to all who knew ${he.o}`);
  if (d.traits.includes('drunkard')) tail.push(`${he.c} liked ${he.p} ale; may it flow where ${he.s} has gone`);
  if (d.traits.includes('charming')) tail.push('Merry of heart');
  if (d.traits.includes('honest')) tail.push('An honest soul');
  if (a >= 80) tail.push('A long life, well lived');
  if (!tail.length) tail.push(pick(['At rest', 'Gone but not forgotten', 'Until we meet again', 'Rest in peace']));
  return `${lead}. ${pick(tail)}`;
}

function buryDead(f) {
  const d = P(f.id); if (!d) return;
  const a = (d.deathTick - d.birthTick) / YEAR;
  const T = W.town || (W.town = {});
  if (!T.graves) T.graves = [];
  const g = { id: T.graves.length + 1, personId: d.id, name: nm(d), bornTick: d.birthTick, diedTick: d.deathTick, born: W.formatDate(d.birthTick), died: W.formatDate(d.deathTick), age: Math.floor(a), cause: d.causeOfDeath, job: d.job, epitaph: epitaph(d, a), mourners: f.attendees.length };
  T.graves.push(g);
  d.graveId = g.id;
  const bld = f.buildingId != null ? W.buildings.get(f.buildingId) : null;
  const n = f.attendees.length;
  if (n >= 3 || a >= 15 && n >= 1) {
    const priest = W.living().find((x) => x.job === 'priest');
    const imp = n >= 18 || d.job === 'mayor' ? 3 : 2;
    const who = a < 1 ? `the infant ${d.firstName}` : nm(d);
    const T2 = [
      `${who} was laid to rest in the churchyard before ${n} mourners${priest ? `, ${priest.firstName} ${priest.lastName} officiating` : ''}.`,
      `${n} gathered at the temple to bury ${who}${a >= 60 ? ', and the old stories were told again' : ''}.`,
      `The funeral of ${who} drew ${n} mourners${n >= 20 ? ' — a sign of how well ' + pro(d).s + ' was loved' : ''}. The grave reads: "${g.epitaph}"`,
    ];
    chron('funeral', imp, pick(T2), [d.id], bld ? bld.id : undefined);
  }
}
function holdFunerals() {
  const st = S(); const hr = W.time.hour;
  for (const f of st.funerals) {
    if (f.done) continue;
    if (!f.invited && W.time.totalDays >= f.day && hr >= 9) {
      f.invited = true;
      const d = P(f.id); if (!d) { f.done = true; continue; }
      const people = new Map();
      for (const m of f.mourners) people.set(m.id, clamp(m.c * 1.1));
      const priest = W.living().find((x) => x.job === 'priest'); if (priest) people.set(priest.id, 1);
      const gd = W.living().find((x) => x.job === 'gravedigger'); if (gd) people.set(gd.id, 1);
      const doc = S().doctors.find((x) => W.relScore ? W.relScore(x, d) > -2 : true); if (doc && d.illness == null && chance(0.3) && ((d.ext.health && d.ext.health.treatedBy) || 0)) people.set(doc.id, 0.6);
      if (f.buildingId != null) {
        // townsfolk drift in for the well-liked
        if (d.reputation > 0.2 || (d.family.childrenIds || []).length >= 3) {
          const L = W.living(); const extra = Math.min(12, Math.round(L.length * 0.04 * (0.5 + d.reputation + 0.5)));
          for (let i = 0; i < extra; i++) { const q = L[rint(0, L.length - 1)]; if (!people.has(q.id) && q.personality.agreeableness > 0.45 && !people.has(q.id)) people.set(q.id, 0.15 + 0.4 * (q.values?.piety || 0.4)); }
        }
      }
      let k = 0;
      for (const [id, c] of people) {
        const q = P(id); if (!q || !q.alive || q.emigrated || age(q) < 4) continue;
        const prob = clamp(c + 0.25 * (q.values?.piety || 0.4) + (id === priest?.id ? 1 : 0));
        if (isPlayer(q)) continue;
        if (q.jailedUntil > W.tick || (q.illness && q.illness.severity > 0.4) || q.pregnant && q.pregnant.dueTick - W.tick < 6 * 28) continue;
        if (age(q) < 12 && c < 0.8) continue;
        if (W.rng.next() > prob) continue;
        if (f.buildingId == null) continue;
        const ok = W.startAction(q, 'funeral', f.buildingId, `attending ${d.firstName}'s funeral`, { duration: rint(8, 10), forced: true, data: f.id, thought: `Gone to bury ${nm(d)}. ${pro(d).c} will be missed.` });
        if (ok) k++;
      }
      f.invited = hr; f.count = k;
      W.emit('funeral', { person: d, buildingId: f.buildingId, day: f.day, invited: k });
    } else if (f.invited && hr >= f.invited + 2 && hr >= 11) { // burial after the service
      f.done = true; buryDead(f);
    }
  }
  st.funerals = st.funerals.filter((f) => !f.done || W.time.totalDays - f.day < 2);
}

// ---------------------------------------------------------------------------------------------- daily processing
const STARVE_CAUSE = ['starvation', 'hunger and cold'];
function dailyPerson(p, st, counts) {
  const a = age(p);
  const h = H(p);
  if (p.job && JOBNOUN[p.job]) h.lastRealJob = p.job;
  const winter = W.time.season === 3;
  // --- incubation -> onset
  if (h.incub && W.tick >= h.incub.until) onset(p, h);
  // --- hunger streak
  const sv = (p.starve || 0) - (h.starveSeen || 0); h.starveSeen = p.starve || 0; // ticks spent with hunger<0.04 since yesterday
  if (sv > 36) h.starveStreak++; else h.starveStreak = Math.max(0, h.starveStreak - (sv < 6 ? 3 : 1));
  // --- widowhood flag cleared on remarriage
  if (p.widowed && p.family.spouseId != null) p.widowed = false;
  // --- baseline health target
  const ageDecline = a < 45 ? 0 : Math.pow((a - 45) / 55, 1.4) * (1.5 - 0.9 * p.genes.vitality);
  let target = 1 - ageDecline - (0.5 - p.genes.vitality) * 0.14;
  if (p.traits.includes('drunkard')) target -= 0.05 + (a > 40 ? 0.04 : 0);
  target -= Math.min(0.5, h.starveStreak * 0.03);
  if (p.homeId == null && a > 14) target -= winter ? 0.15 : 0.06;
  else if (p.money < 3 && p.job === 'unemployed') target -= 0.03;
  if (p.needs.hygiene < 0.2) target -= 0.04;
  if (p.personality.neuroticism > 0.7 && p.mood < -0.2) target -= 0.04;
  if (h.depressed) target -= 0.05;
  for (const c of h.chronic) target -= c.sev * CHRONIC[c.id].health;
  if (p.illness) target -= p.illness.severity * 0.7;
  p.health = clamp(p.health + (clamp(target, 0.02, 1) - p.health) * (p.illness ? 0.3 : 0.12), 0.01, 1);
  // --- chronic onset
  if (a >= 13) chronicOnset(p, a, h);
  // --- injuries
  if (!p.illness && !h.incub && !p.emigrated) {
    const spec = INJ_JOB[p.job];
    let rate = spec ? spec[0] : a < 15 ? (a >= 3 ? 0.07 : 0.02) : a > 65 ? 0.1 : 0.03;
    const worked = p.workedTicks > 10;
    if (spec) rate *= worked ? 1.3 : 0.15;
    if (p.needs.energy < 0.3) rate *= 1.6;
    if (p.traits.includes('drunkard')) rate *= 1.4;
    rate *= 1.25 - 0.5 * p.personality.conscientiousness;
    if (W.rng.next() < rate / DPY) startInjury(p, a);
  }
  // --- illness progress
  if (p.illness) {
    progressIllness(p, h, a); if (!p.alive) return;
    if (p.illness) { counts[p.illness.id] = (counts[p.illness.id] || 0) + 1; }
  }
  if (h.incub) counts[h.incub.id] = (counts[h.incub.id] || 0) + 1;
  // --- parish alms keep most of the destitute from outright starvation (temple bread, neighbours' charity)
  if (h.starveStreak >= 7 && (p.inventory?.food || 0) < 1 && p.money < 2 && W.rng.next() < 0.55) { p.inventory.food = (p.inventory.food || 0) + 3; h.starveStreak = Math.max(0, h.starveStreak - 5); if (W.town && typeof W.town.treasury === 'number' && W.town.treasury > 50) W.town.treasury -= 2; mem(p, 'charity', 'The parish sent bread when we had none.', [], 0.2, 2); }
  // --- starvation, exposure
  if (h.starveStreak > 12 && (p.inventory?.food || 0) < 1 && p.money < 2 && W.rng.next() < (h.starveStreak - 12) * 0.02) { dieOf(p, pick(STARVE_CAUSE), { kind: 'starvation' }); return; }
  if (p.homeId == null && winter && a > 14 && W.rng.next() < 0.002 * (a > 55 ? 3 : 1)) { dieOf(p, 'exposure in the winter cold', { kind: 'exposure' }); return; }
  // --- background mortality (adults)
  if (a >= 15) {
    let m = vitMult(p) * chronicMult(p) * (1 + 2.5 * Math.max(0, 0.55 - p.health));
    if (p.traits.includes('drunkard')) m *= 1.35;
    if (p.money < 3 && p.job === 'unemployed') m *= 1.2;
    if (p.health < 0.1) m *= 3;
    if (W.rng.next() < (annualHazard(a) / DPY) * m) { dieOf(p, naturalCause(p, a, h), { kind: 'natural' }); return; }
  }
  // --- grief & depression
  grief(p, h, a);
}
function naturalCause(p, a, h) {
  let best = null; for (const c of h.chronic) if (CHRONIC[c.id].cause && (!best || c.sev * CHRONIC[c.id].mort > best.w)) best = { w: c.sev * CHRONIC[c.id].mort, cause: CHRONIC[c.id].cause };
  if (best && chance(0.7)) return best.cause;
  if (p.traits.includes('drunkard') && a > 35 && chance(0.4)) return pick(['a liver ruined by drink', 'the drink', 'a seizure after a long night of drinking']);
  if (a >= 68) return pick(['old age', 'old age', 'a failing heart', 'a stroke in the night', 'the weight of years', 'a quiet end in sleep', 'a pneumonia of old age', 'a seizure of the chest']);
  return pick(['a sudden seizure of the heart', 'an apoplexy', 'a wasting sickness', 'a fever of the brain', 'an abscess', 'a growth in the belly', 'a fever of the lungs', 'a stroke']);
}
function grief(p, h, a) {
  if (h.grief > 0.02) {
    h.grief *= 0.982;
    moodlet(p, 'grieving', 'Grieving', -Math.min(0.8, h.grief * 0.7), 3 * TPD);
    if (h.grief <= 0.02) h.mourning.length = 0;
  }
  if (a < 14) return;
  // depression: slow build-up under bad events, loneliness; friends and time heal
  const neu = p.personality.neuroticism;
  let rise = 0;
  if (p.mood < -0.35) rise += 0.012 * (0.5 + neu);
  if (p.needs.social < 0.2) rise += 0.008 * (0.6 + neu);
  if (h.grief > 0.3) rise += 0.01 * neu;
  if (p.job === 'unemployed' && p.money < 5 && a < 60) rise += 0.004;
  let friends = 0;
  if ((W.time.totalDays + p.id) % 3 === 0) { // sampled (friends count cached)
    let k = 0; for (const r of p.relationships.values()) { if (++k > 40) break; if (r.affinity > 0.45 && r.familiarity > 0.4) friends++; }
    h.friends = friends;
  }
  friends = h.friends || 0;
  const fall = 0.004 + 0.012 * Math.min(4, friends) / 4 + (p.mood > 0.1 ? 0.01 : 0) + 0.003 * (p.values?.piety || 0.4);
  h.dep = clamp(h.dep + rise - fall);
  if (!h.depressed && h.dep > 0.5) {
    h.depressed = true; h.depSince = W.tick;
    mem(p, 'health', 'A black mood settled over me and would not lift.', [], -0.8, 3);
    if (h.grief > 0.2 && W.rng.next() < 0.25) { /* known grief-melancholy */ chron('mood', 2, `${nm(p)} has withdrawn from company since ${pro(p).p} loss; neighbours say ${pro(p).s} hardly leaves the house.`, [p.id]); }
  } else if (h.depressed && h.dep < 0.25) {
    h.depressed = false;
    mem(p, 'health', 'The fog of sorrow has begun to lift at last.', [], 0.5, 3);
  }
  if (h.depressed) {
    moodlet(p, 'depressed', 'Weighed down by melancholy', -0.3, 3 * TPD);
    p.needs.purpose = clamp(p.needs.purpose - 0.01);
    if (a >= 17 && !p.traits.includes('drunkard') && W.rng.next() < 0.0008) { p.traits.push('drunkard'); mem(p, 'health', 'Found some relief in drink, perhaps too much.', [], -0.4, 3); }
  }
}

// ---------------------------------------------------------------------------------------------- actions
const actions = [
  {
    id: 'seek_treatment', label: 'seeking the doctor', minAge: 7, interruptible: false,
    score(w, p) {
      const ill = p.illness; if (!ill || ill.treated || ill.severity < 0.3) return 0;
      if (!hasDoctor() && !S().nurses.length) return 0;
      const b = clinic(); if (!b || !w.isOpen(b)) return 0;
      const c = w.brain.ctx; c.target = b.id; c.why = `ill with ${ill.name}`;
      const fee = 2 + 5 * ill.severity;
      const poor = p.money < fee * 0.8 ? 0.4 : 1;
      return (35 + 80 * ill.severity) * poor * (0.7 + 0.5 * p.personality.neuroticism) * (ill.contagious && ill.severity > 0.7 ? 0.8 : 1);
    },
    where: () => (clinic() ? clinic().id : null),
    duration: (w) => rint(6, 12),
    onEnd(w, p, b) {
      const ill = p.illness; if (!ill || ill.treated) return;
      const staff = b ? w.peopleAt(b.id).filter((x) => x.job === 'doctor' || x.job === 'nurse') : [];
      const doc = staff.find((x) => x.job === 'doctor') || staff[0];
      if (!doc) { mem(p, 'health', 'Went to the clinic but found no one to see me.', [], -0.15, 1); return; }
      if (payFee(p, doc, ill.severity)) {
        treat(p, doc, doc.job);
        const hh = H(p); hh.treatedBy = doc.id;
        w.addMemory(p, { type: 'treatment', text: `${nm(doc)} treated my ${ill.name}.`, otherIds: [doc.id], weight: 0.2, importance: 2 });
        const r = w.getRel(p, doc); if (r) { r.affinity = clamp(r.affinity + 0.03, -1, 1); r.trust = clamp(r.trust + 0.03); }
      } else {
        w.addMemory(p, { type: 'treatment', text: 'Could not pay the doctor and was turned away.', otherIds: [doc.id], weight: -0.4, importance: 2 });
        p.needs.comfort = clamp(p.needs.comfort - 0.05);
      }
    },
  },
  {
    id: 'funeral', label: 'at a funeral', interruptible: false, stickiness: 30,
    score: () => 0, // started via forced action (or chosen manually by a player)
    where: (w, p) => { const f = S().funerals.find((x) => !x.done); return f ? f.buildingId : null; },
    duration: () => rint(8, 10),
    onStart(w, p, b, ca) { const f = S().funerals.find((x) => x.id === ca.data); if (f && !f.attendees.includes(p.id)) f.attendees.push(p.id); },
    onEnd(w, p, b, ca) {
      const f = S().funerals.find((x) => x.id === ca.data);
      const d = P(ca.data); if (!d) return;
      const h = H(p);
      h.grief *= 0.88; // a shared farewell helps
      moodlet(p, 'funeral', 'Shared in a farewell', 0.08, 3 * TPD);
      p.needs.social = clamp(p.needs.social + 0.1);
      if (f) { let n = 0; for (const q of w.peopleAt(f.buildingId)) { if (q === p || ++n > 20) continue; if (q.currentAction && q.currentAction.id === 'funeral') { const r = w.getRel(p, q); if (r) { r.familiarity = Math.min(1, r.familiarity + 0.005); r.affinity = clamp(r.affinity + 0.006, -1, 1); } } } }
    },
  },
  {
    id: 'mourn_grave', label: 'tending a grave', minAge: 8, perTick: { purpose: 0.002 },
    score(w, p) {
      const h = p.ext.health; if (!h || h.grief < 0.2 || !h.mourning.length) return 0;
      const c = w.brain.ctx; if (c.shift || c.inWin || c.h < 7 || c.h > 19) return 0;
      const cem = w.map?.cemeteryId; if (cem == null) return 0;
      const d = P(h.mourning[h.mourning.length - 1].id); if (!d || d.graveId == null) return 0;
      c.target = cem; c.why = `visiting ${d.firstName}'s grave`; c.data = d.id;
      return (c.rest ? 22 : 10) * Math.min(1.5, h.grief * 1.4) * (0.7 + (p.values?.family || 0.5) * 0.6);
    },
    where: () => (W.map ? W.map.cemeteryId : null),
    duration: (w) => rint(6, 12),
    thought: (w, p, b, ca) => { const d = P(ca.data); return d ? `Standing at ${d.firstName}'s grave, remembering.` : 'Standing at a grave, remembering.'; },
    onEnd(w, p) { const h = H(p); h.grief *= 0.96; moodlet(p, 'graveside', 'A quiet hour with the departed', 0.05, 2 * TPD); },
  },
];
function clinic() { const l = W.buildingsOfType('clinic'); return l && l[0] ? l[0] : null; }

const BLOCK_ILL = new Set(['work', 'school']);
const SOCIAL = new Set(['socialize', 'visit_friend', 'tavern', 'relax_park', 'wander', 'pray', 'eat_tavern']);
const scoreModifiers = [
  (w, p, def, s) => {
    const ill = p.illness;
    if (ill) {
      const sev = ill.severity;
      if (BLOCK_ILL.has(def.id)) {
        if (ill.incap && sev > 0.15) return 0;
        if (sev > 0.45) return 0;
        if (sev > 0.25) return s * (0.35 + 0.5 * p.personality.conscientiousness);
      }
      if (def.id === 'relax_home') return s + 60 * sev;
      if (def.id === 'sleep' && sev > 0.5) return s + 15;
      if (SOCIAL.has(def.id) && (sev > 0.35 || (ill.contagious && sev > 0.2))) return s * (ill.contagious ? 0.2 : 0.5);
      if (def.id === 'shop' && sev > 0.5) return s * 0.5;
      if (def.id === 'chores' && sev > 0.4) return s * 0.3;
    }
    const h = p.ext.health;
    if (h && h.depressed) {
      if (def.id === 'work' || def.id === 'school') return s * 0.8;
      if (def.id === 'socialize' || def.id === 'visit_friend' || def.id === 'relax_park' || def.id === 'wander') return s * 0.4;
      if (def.id === 'relax_home') return s + 25;
      if (def.id === 'tavern') return s * (p.money > 8 ? 1.6 : 1) + 8;
    }
    if (h && h.grief > 0.5 && (def.id === 'socialize' || def.id === 'tavern')) return s * 0.7;
    return s;
  },
];

// ---------------------------------------------------------------------------------------------- interventions
function resolvePerson(w, prm) {
  const v = prm && (prm.person ?? prm.id ?? prm.target);
  if (v && typeof v === 'object') return v;
  return v != null ? w.people.get(v) : null;
}
function diseaseKey(s) {
  if (!s) return null;
  s = String(s).toLowerCase();
  if (DIS[s]) return s;
  for (const k of Object.keys(DIS)) if (DIS[k].name.includes(s) || s.includes(k)) return k;
  return null;
}
function registerInterventions(w) {
  if (typeof w.registerIntervention !== 'function') return;
  const plague = (world, prm = {}) => {
    const key = diseaseKey(prm.disease) || 'sweating';
    const n = prm.n || 3;
    const k = seedOutbreak(key, n);
    return `${DIS[key].name} seeded in ${k} townsfolk`;
  };
  plague.description = "Start an outbreak. params: {disease: 'sweating'|'pox'|'plague'|'flu'|'flux'|'cold', n: number of first cases (default 3)}.";
  w.registerIntervention('plague', plague);
  const heal = (world, prm = {}) => {
    const targets = prm.all ? world.living().filter((p) => p.illness || (p.ext.health && p.ext.health.incub)) : [resolvePerson(world, prm)];
    let k = 0;
    for (const p of targets) {
      if (!p || !p.alive) continue;
      const h = H(p); p.illness = null; h.incub = null; p.health = Math.max(p.health, 0.9);
      h.chronic = h.chronic.filter((c) => c.sev > 0.6);
      h.dep = 0; h.depressed = false; h.grief = prm.all ? h.grief : 0;
      world.removeMoodlet(p, 'sick');
      mem(p, 'health', 'Was healed, almost miraculously, of every ailment.', [], 0.7, 3); k++;
    }
    return `${k} healed`;
  };
  heal.description = 'Cure a person completely. params: {person: id} or {all: true} to heal every sick person.';
  w.registerIntervention('heal', heal);
  const curse = (world, prm = {}) => {
    const p = resolvePerson(world, prm); if (!p || !p.alive) return 'no such person';
    const key = diseaseKey(prm.disease) || 'curse';
    const h = H(p); p.illness = null; h.incub = null; h.immune[key] = 0;
    const ok = infect(p, key, null, { immediate: true });
    if (ok && p.illness && prm.severity) p.illness.peak = p.illness.severity = clamp(prm.severity);
    return ok ? `${nm(p)} struck down by ${DIS[key].name}` : 'failed';
  };
  curse.description = "Make a person ill. params: {person: id, disease?: key (default a wasting sickness), severity?: 0..1}.";
  w.registerIntervention('curse', curse);
}

// ---------------------------------------------------------------------------------------------- system
export default {
  name: 'health',
  init(world) {
    W = world;
    world.healthState = { outbreaks: {}, funerals: [], doctors: [], nurses: [], deaths: 0, deathsByCause: {}, cases: {} };
    world.town = world.town || {};
    if (!world.town.graves) world.town.graves = [];
    world.healthApi = { infect: (p, id, src) => infect(p, id, src), seedOutbreak, treat, addChronic, DISEASES: DIS, isIll: (p) => !!(p && p.illness), epitaph: (p) => epitaph(p, age(p)) };
    world.on('death', onDeath);
    world.on('encounter', (e) => {
      const a = P(e.a), b = P(e.b); if (!a || !b || e.buildingId != null) return; // indoors handled hourly
      for (const [x, y] of [[a, b], [b, a]]) {
        const ill = x.illness; if (!ill || !ill.contagious) continue;
        const def = DIS[ill.id]; if (def) exposure(x, y, def, def.beta * (0.4 + ill.severity), 0.8);
      }
    });
    registerInterventions(world);
    // ageing: seed chronic conditions & health for the initial population
    for (const p of world.living()) {
      const a = age(p), h = H(p);
      if (a >= 38) { const k = Math.min(3, Math.round(((a - 35) / 14) * W.rng.next() * 1.5)); const opts = a >= 60 ? ['joints', 'joints', 'sight', 'dropsy', 'gout', 'lungs', 'palsy'] : ['joints', 'gout', 'lungs', 'sight']; for (let i = 0; i < k; i++) addChronic(p, pick(opts), rfl(0.15, 0.5)); h.chronic.forEach((c) => { /* initial conditions are not news */ }); p.memories = p.memories.filter((m) => m.type !== 'health'); }
      for (const q of [DIS.pox, DIS.sweating]) if (a > 20 && chance(q.id === 'pox' ? 0.2 : 0.06)) { h.immune[q.id] = q.immune > 1e5 ? 1e15 : W.tick + rint(0, q.immune) * TPD; if (q.id === 'pox' && chance(0.4)) h.scarred = true; }
      p.health = clamp(1 - (a < 45 ? 0 : Math.pow((a - 45) / 55, 1.4) * (1.5 - 0.9 * p.genes.vitality)) - h.chronic.length * 0.05, 0.1, 1);
    }
    world.healthState.doctors = world.living().filter((p) => p.job === 'doctor'); world.healthState.nurses = world.living().filter((p) => p.job === 'nurse');
    world.on('jobChange', (e) => { const p = e && e.person; if (p && e.oldJob && JOBNOUN[e.oldJob]) H(p).lastRealJob = e.oldJob; });
  },
  onTick() {},
  onHour(world) {
    W = world;
    const st = S(), L = world.living();
    if (world.time.hour % 4 === 0) { st.doctors = L.filter((p) => p.job === 'doctor' && !p.emigrated); st.nurses = L.filter((p) => p.job === 'nurse' && !p.emigrated); }
    holdFunerals();
    // contagion among the co-located
    for (const s of L) {
      const ill = s.illness; if (!ill || !ill.contagious || s.locationId == null) continue;
      const def = DIS[ill.id]; if (!def) continue;
      const occ = world.peopleAt(s.locationId); if (!occ || occ.length < 2) continue;
      const beta = def.beta * (0.4 + ill.severity);
      let n = 0;
      for (const o of occ) { if (o === s) continue; if (++n > 60) break; exposure(s, o, def, beta, o.homeId != null && o.homeId === s.homeId ? 1.6 : 0.6); }
    }
  },
  onDay(world) {
    W = world;
    const st = S(), L = world.living().slice();
    const season = world.time.season;
    const counts = {};
    for (const p of L) { if (!p.alive || p.emigrated) continue; dailyPerson(p, st, counts); }
    // --- outbreak bookkeeping
    for (const id of Object.keys(st.outbreaks)) {
      const o = st.outbreaks[id]; if (!o.active) continue;
      const c = counts[id] || 0; o.peakActive = Math.max(o.peakActive, c); st.cases[id] = c;
      if (c === 0) {
        o.active = false;
        const def = DIS[id];
        if (def.epi || (def.notable && (o.cases >= 14 || o.deaths >= 2))) {
          const days = Math.round((world.tick - o.start) / TPD);
          const nm_ = def.name;
          if (o.deaths > 0) chron('outbreak', def.epi ? 4 : 3, pick([
            `${nm_[0].toUpperCase() + nm_.slice(1)} has run its course after ${days} days: ${o.cases} fell ill and ${o.deaths} did not recover. The bells tolled for each.`,
            `At last ${nm_} has burned itself out. ${o.cases} were taken ill; ${o.deaths} lie in the churchyard. The town gives thanks.`,
          ]), []);
          else chron('outbreak', 3, `${nm_[0].toUpperCase() + nm_.slice(1)} has passed with ${o.cases} cases and, mercifully, no deaths.`, []);
          world.emit('outbreakEnd', { disease: id, cases: o.cases, deaths: o.deaths });
        }
      }
    }
    // --- seeding: seasonal and sporadic infections
    const n = L.length || 1;
    const seed = (id, expected, count = 1) => { let k = Math.floor(expected) + (world.rng.next() < expected % 1 ? 1 : 0); if (k > 0) seedOutbreak(id, k * count, { immediate: false }); };
    seed('cold', n * [0.0015, 0.001, 0.0025, 0.005][season]);
    if (season === 3 && world.time.dayOfSeason === 4 && chance(0.55)) seed('flu', 1, 2);
    else if (season === 2 && world.time.dayOfSeason === 20 && chance(0.2)) seed('flu', 1, 1);
    if (season === 1 && chance(1 / 50)) { // flux: summer, poor water; pick the dirtiest of a few
      const c = []; for (let i = 0; i < 6; i++) c.push(L[rint(0, L.length - 1)]);
      c.sort((a, b) => a.needs.hygiene - b.needs.hygiene); if (c[0]) infect(c[0], 'flux', null);
    }
    const mult = world.settings?.epidemicScale ?? 1;
    if (chance((0.06 / DPY) * mult)) seedOutbreak('sweating', rint(1, 3), { immediate: false });
    if (chance((0.035 / DPY) * mult)) seedOutbreak('pox', rint(1, 2), { immediate: false });
    if (world.time.dayOfYear === 0) st.yearStart = world.tick;
  },
  onYear(world) {
    W = world;
    for (const p of world.living()) { const h = p.ext.health; if (!h) continue; for (const c of h.chronic) c.sev = clamp(c.sev + 0.05 + (age(p) > 65 ? 0.04 : 0)); }
  },
  actions,
  scoreModifiers,
};
