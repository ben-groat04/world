// Fertility, pregnancy and births. Monthly: each woman's chance of a birth-leading conception is the age-specific fertility rate (calibration) scaled by her circumstances
// (partnership status, parity, spacing, desire, money stress, space at home) relative to a FIXED reference woman (FERT_REF). Nothing is renormalised to hit a target: the number of
// births emerges from how many women are partnered / ready / housed. FERT_REF is the one tunable (see docs/CALIBRATION-METHOD.md). Pregnancies run ~40 weeks with miscarriage risk; births create residents (name, ethnicity, religion, kin ties, routine record).
import NAMES from '../../../content/larkfield/names.js';
import { clamp, clamp01, wpick, ageOf, fullName, later, months, days, years, setTie, setOffTie, tieOf, metro, hhOf, rec, bump, newMetro } from './util.js';
import { bedsNeeded, bedsOf, buildPop } from './moves.js';

const BANDS = [[15, 19, '15-19'], [20, 24, '20-24'], [25, 29, '25-29'], [30, 34, '30-34'], [35, 39, '35-39'], [40, 44, '40+']];
const PARITY_W = [1.0, 0.95, 0.38, 0.14, 0.06];
export const FERT_REF = 0.22; // circumstance weight of the 'reference' woman whose conception hazard equals the national age-specific rate (partnered, parity 0-1, average desire)

function stateWeight(w, p, L) {
  const pt = L.part;
  if (!pt) return 0.08;
  if (pt.on) { const o = w.people.get(pt.id); if (!o || !o.alive) return 0.1; if (o.sex === p.sex) return p.sex === 'F' ? 0.17 : 0; return pt.st === 'married' || pt.st === 'engaged' ? 1.0 : pt.lat ? 0.2 : 0.6; }
  const m = metro(w, pt.id); if (m && m.sex === p.sex) return p.sex === 'F' ? 0.15 : 0;
  return pt.st === 'married' ? 1.0 : pt.st === 'cohab' ? 0.6 : 0.22;
}
function moneyStress(w, p) { const m = w.sys && w.sys.money; if (!m) return 0.3; try { const x = m.query.pressure(p.id); return x ? x.stress || 0 : 0.3; } catch (e) { return 0.3; } }

export function monthlyFertility(w, rng, people) {
  const asfr = w.pack.calibration.fertility.asfrComposite_derived || w.pack.calibration.fertility.asfrPer1000Women_EnglandWales2022;
  const st = w.lf.life, scale = st.fertScale * (st.boom > w.tick ? 1 + (st.boomPct || 0.5) : 1);
  const bands = BANDS.map(() => ({ n: 0, el: [], sum: 0 }));
  for (const p of people) {
    if (p.sex !== 'F') continue; const age = ageOf(w, p); if (age < 15 || age >= 45) continue;
    const bi = age < 20 ? 0 : age < 25 ? 1 : age < 30 ? 2 : age < 35 ? 3 : age < 40 ? 4 : 5; if (age < 16) continue;
    const L = p.ext.life, B = bands[bi]; B.n++;
    if (L.preg || L.away) continue;
    if (p.ext.hl && (p.ext.hl.dying || (p.ext.hl.c && p.ext.hl.c.cancer))) continue;
    let wt = stateWeight(w, p, L); if (wt <= 0) continue;
    wt *= PARITY_W[Math.min(4, L.parity)];
    const since = L.lastBirth == null ? 9 : (w.tick - L.lastBirth) / w.calendar.ticksPerYear; wt *= since < 1 ? 0.04 : since < 2 ? 0.5 : 1;
    wt *= 0.35 + 1.3 * L.desire;
    const hh = hhOf(w, p); if (hh && bedsNeeded(w, hh, 1) > bedsOf(w, hh) + 1) wt *= 0.6;
    wt *= clamp(1.25 - 0.7 * moneyStress(w, p), 0.5, 1.3);
    if (p.ext.pop.health && p.ext.pop.health.limiting === 2) wt *= 0.6;
    B.el.push([p, wt]); B.sum += wt;
  }
  bands.forEach((B, i) => {
    if (!B.el.length) return; const rate = (asfr[BANDS[i][2]] || 0) / 12000, k = 1 / (((w.settings.tune || {}).fertRef) ?? FERT_REF);
    for (const [p, wt] of B.el) if (rng.chance(Math.min(0.12, rate * wt * k * scale))) later(w, rng.int(1, 27) * 144, 'conceive', { m: p.id });
  });
}

export const fertHandlers = {
  conceive(w, d) {
    const m = w.people.get(d.m); if (!m || !m.alive) return; const L = m.ext.life; if (L.preg || L.away) return;
    const rng = w.rngFor('life.preg'), pt = L.part, fa = pt && pt.on ? w.people.get(pt.id) : null;
    const due = w.tick + days(rng.float(268, 290)) - (rng.chance(0.08) ? days(rng.float(10, 40)) : 0), mis = rng.chance(0.11);
    L.preg = { t0: w.tick, due, father: fa ? fa.id : pt && !pt.on ? pt.id : null, fOn: !!fa, mis };
    if (mis) later(w, days(rng.float(40, 85)), 'miscarry', { m: m.id, t0: w.tick });
    else { later(w, days(84), 'announce', { m: m.id, t0: w.tick }); later(w, due - w.tick, 'birth', { m: m.id, t0: w.tick }); }
    bump(w, 'conceptions');
  },
  announce(w, d) {
    const m = w.people.get(d.m); if (!m || !m.alive || !m.ext.life.preg || m.ext.life.preg.t0 !== d.t0) return; const pr = m.ext.life.preg, fa = pr.fOn ? w.people.get(pr.father) : null;
    pr.ev = w.emit('life.pregnant', { actors: fa && fa.alive ? [m.id, fa.id] : [m.id], salience: 0.4, tags: ['family'], payload: { weeks: 12, due: pr.due } });
    w.moodlet(m, 'expecting', 'Expecting', 0.2, months(6));
  },
  miscarry(w, d) {
    const m = w.people.get(d.m); if (!m || !m.alive || !m.ext.life.preg || m.ext.life.preg.t0 !== d.t0) return; const pr = m.ext.life.preg, fa = pr.fOn ? w.people.get(pr.father) : null;
    m.ext.life.preg = null; bump(w, 'miscarriages');
    const ev = w.emit('life.miscarriage', { actors: fa && fa.alive ? [m.id, fa.id] : [m.id], salience: 0.3, tags: ['family', 'health'], payload: { weeks: Math.round((w.tick - pr.t0) / (7 * 144)) } });
    w.addMemory(m, { type: 'family', text: 'Lost a pregnancy early on.', otherIds: [], weight: -0.8, importance: 4 });
    if (w.commands.has('health.stress')) w.cmd('health.stress', { pid: m.id, amount: 0.45, why: 'miscarriage', cause: ev });
  },
  birth(w, d) {
    const m = w.people.get(d.m); if (!m || !m.alive || !m.ext.life.preg || m.ext.life.preg.t0 !== d.t0) return;
    birth(w, m);
  },
};

export function birth(w, mother) {
  const rng = w.rngFor('life.birth'), L = mother.ext.life, pr = L.preg; L.preg = null;
  if (L.away) return;
  const hh = hhOf(w, mother); if (!hh) return;
  const mAge = ageOf(w, mother), parity = L.parity, n = rng.chance(0.016) ? 2 : 1;
  const fa = pr && pr.fOn ? w.people.get(pr.father) : null, father = fa && fa.alive ? fa : null;
  const pt = L.part;
  const marital = pt && pt.st === 'married' ? 'married' : pt && pt.st === 'cohab' ? 'cohab' : pt ? 'lat' : 'single';
  const babies = [];
  for (let i = 0; i < n; i++) babies.push(makeBaby(w, rng, mother, father, hh, marital, i));
  L.parity += n; L.lastBirth = w.tick; if (L.firstBirth == null) L.firstBirth = w.tick;
  if (father) { father.ext.life.parity += n; father.ext.life.lastBirth = w.tick; if (father.ext.life.firstBirth == null) father.ext.life.firstBirth = w.tick; }
  L.desire = clamp01(L.desire - 0.12 * n);
  const sexes = babies.map((b) => b.sex);
  const ev = w.emit('life.birth', { actors: father ? [mother.id, father.id] : [mother.id], objects: babies.map((b) => b.id), salience: 0.55, cause: (pr && pr.ev) || 0, tags: ['family'], payload: { baby: babies[0].firstName, sex: sexes[0], weight: +clamp(rng.gauss(7.4, 1.0), 4, 10.5).toFixed(1), parity: parity + 1, marital, twins: n > 1 } });
  for (const b of babies) b.ext.life.birthEv = ev;
  rec(w, 'births', [w.tick, +mAge.toFixed(1), parity, marital, father ? 'on' : pt && !pt.on ? 'off' : 'none', sexes[0], n]); bump(w, 'births', n);
  w.addMemory(mother, { type: 'family', text: `${babies[0].firstName} was born.`, otherIds: babies.map((b) => b.id), weight: 0.95, importance: 5 });
  if (father) w.addMemory(father, { type: 'family', text: `${babies[0].firstName} was born.`, otherIds: babies.map((b) => b.id), weight: 0.95, importance: 5 });
  w.moodlet(mother, 'newborn', 'New baby', 0.25, months(3)); if (w.commands.has('health.stress')) w.cmd('health.stress', { pid: mother.id, amount: 0.12, why: 'newborn' });
  // grandparents in the household / off-map kin hear about it through ties; routine layer picks up kids at home
  return babies;
}

function makeBaby(w, rng, mother, father, hh, marital, k) {
  const sex = rng.chance(0.512) ? 'M' : 'F', yr = w.calendar.dateOf(w.tick).y;
  const mq = mother.ext.pop, fq = father ? father.ext.pop : null;
  const group = fq && fq.eth !== mq.eth ? 'mixed' : mq.eth;
  const origin = NAMES.pickOrigin(rng, group, yr); origin.bornUK = true; origin.birthplace = 'United Kingdom';
  const first = NAMES.pickFirst(rng, origin, sex, yr);
  const last = father && (marital === 'married' || rng.chance(0.5)) ? father.lastName : mother.lastName;
  const baby = w.createPerson({ sex, firstName: first, lastName: last, homeId: hh.bid, birthTick: w.tick - k, mother, father: father || null, money: 0 });
  const rel = father && rng.chance(0.2) ? fq.religion : mq.religion;
  buildPop(w, baby, { hh, rng, group, origin, role: 'child', religion: rel, bornUK: true, religiosity: 0, grewUp: 'Larkfield (this neighbourhood)' });
  baby.ext.pop.activity = 'child'; baby.ext.pop.school = { kind: 'home' }; baby.ext.pop.pets = { dogs: hh.dogs || 0, cats: hh.cats || 0 };
  baby.ext.life = { or: 'S', mar: 'never', part: null, nPart: 0, parity: 0, firstCohab: null, firstMar: null, firstBirth: null, preg: null, lastBirth: null, desire: 0.5, away: null, left: null, caring: null, boost: 0, ex: 0, sepAt: null, widowedAt: null, planKid: 0 };
  if (!father) { const pt = mother.ext.life.part; if (pt && pt.on) { const o = w.people.get(pt.id); if (o && o.alive && o.sex === 'F') baby.ext.life.coParent = o.id; } }
  hh.members.push(baby.id);
  w.addPerson(baby);
  w.cmd('routine.init', { pid: baby.id });
  const lab = (x) => (x.sex === 'F' ? 'mother' : 'father'), kid = (s) => (s === 'F' ? 'daughter' : 'son');
  setTie(w, mother, baby, 'kin', kid(sex), lab(mother), 1, 0.92, 'family');
  if (father && father.alive) setTie(w, father, baby, 'kin', kid(sex), lab(father), 1, 0.88, 'family');
  const co = baby.ext.life.coParent != null ? w.people.get(baby.ext.life.coParent) : null; if (co) setTie(w, co, baby, 'kin', kid(sex), 'mother', 1, 0.88, 'family');
  for (const id of hh.members) { if (id === baby.id) continue; const o = w.people.get(id); if (!o || !o.alive || o.id === mother.id || (father && o.id === father.id) || (co && o.id === co.id)) continue; const a = ageOf(w, o); if (a < 18 && o.ext.pop.role === 'child') setTie(w, baby, o, 'kin', 'sibling', 'sibling', 1, 0.55, 'same household'); else if (a >= 45 || o.ext.pop.role === 'parent' || o.ext.pop.role === 'grandparent') setTie(w, baby, o, 'kin', 'grandparent/grandchild', 'grandparent/grandchild', 2, 0.6, 'same household'); }
  return baby;
}
