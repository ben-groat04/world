// MIGRATION system: newcomers arrive (job-seeking singles, young families, widowed elders, a mysterious stranger) and
// people emigrate (long unemployment, heartbreak, disgrace, debt, ambition & boredom, a family wiped out by grief).
// Keeps the population inside a soft band around initialPop * [1, 2.5].
//
// EMIGRANT CONVENTION: an emigrant gets p.emigrated = true AND p.alive = false (so world.living() and every
// alive-check in other systems already treat them as gone); NO 'death' event and stats.deaths is NOT incremented.
// They are removed from buildings/map exactly like killPerson does; p.emigratedTick / p.emigratedTo /
// p.ext.migration.{reason,departTick} record the departure; the 'emigrate' world event {person, reason, group} fires.
// Arrivals: p.ext.migration = {arrivedTick, origin, reason, kind, secret?}, event 'immigrate' {person, kind}.
// world.migrationState = {initialPop, arrived, departed, emigrants:[ids]}; world.migrationApi = {arrive, emigrate, pressure}.

import { firstName, surname } from '../names.js';

const TPD = 144, DPY = 112, YEAR = TPD * DPY;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
let W = null;
const P = (id) => (id == null || !W ? null : W.people.get(id) || null);
const nm = (p) => `${p.firstName} ${p.lastName}`;
const age = (p) => W.ageOf(p);
const pro = (p) => (p.sex === 'F' ? { s: 'she', o: 'her', p: 'her', c: 'She' } : { s: 'he', o: 'him', p: 'his', c: 'He' });
const pick = (a) => W.rng.pick(a);
const chance = (x) => W.rng.next() < x;
const rint = (a, b) => W.rng.int(a, b);
const rfl = (a, b) => W.rng.float(a, b);
const isPlayer = (p) => W.player != null && W.player === p.id;
const town = () => (W.town && W.town.name) || 'Hollowmere';
const M = (p) => (p.ext.migration || (p.ext.migration = {}));
const S = () => W.migrationState;
const chron = (type, importance, text, people, buildingId) => W.chronicle.add({ type, importance, text, people: (people || []).filter((x) => x != null), buildingId });
const mem = (p, o) => W.addMemory(p, o);

const ORIGINS = ['Marsh End', 'Oldbridge', 'Kingsford', 'Thornby', 'Greywater', 'Saltmere', 'Highcombe', 'Ashwick', 'Little Dunmow', 'the hill farms', 'the coast', 'a river barge town', 'the old mining valley', 'Stonecross', 'Weyford'];
const REASONS = {
  work: ['could find no steady work at home', 'heard that the town was short of hands', 'finished an apprenticeship with no master to take them on', 'lost a place when the old master died', 'followed word of better wages'],
  land: ['a brother inherited the family land', 'a bad harvest and a worse landlord', 'rent on the old holding rose beyond reach', 'the family plot was too small to feed another mouth'],
  fresh: ['wanted a fresh start', 'wished to leave an unhappy past behind', 'a quarrel at home made staying impossible', 'hoped for a quieter life'],
  family: ['joined a cousin already settled here', 'a relative wrote of good prospects', 'their parents had passed and nothing held them there'],
};
const SECRETS = [
  { text: 'a runaway debtor, hiding from creditors three counties away', rep: -0.12 },
  { text: 'a former soldier who deserted rather than burn a village', rep: 0.1 },
  { text: 'the disinherited younger child of a minor gentry family', rep: 0.08 },
  { text: 'fleeing a blood feud that has long outlived its cause', rep: -0.05 },
  { text: 'a defrocked clerk who once embezzled from a lord', rep: -0.2 },
  { text: 'a widower who could not bear the house where his family died', rep: 0.15 },
  { text: 'a travelling healer, driven from two towns as a witch', rep: -0.02 },
];
const WANT_SKILL = { farmer: 'farming', laborer: 'athletics', baker: 'cooking', smith: 'smithing', carpenter: 'crafting', tailor: 'crafting', miller: 'farming', merchant: 'trade', tavernkeeper: 'cooking', server: 'charisma', teacher: 'teaching', doctor: 'medicine', nurse: 'medicine', guard: 'athletics', clerk: 'scholarship', gardener: 'farming', innkeeper: 'trade', gravedigger: 'athletics' };

// ---------------------------------------------------------------------------------------------- town indicators
function openings() { // jobs vacancies by title
  const out = {}; let total = 0;
  for (const b of W.buildings.values()) {
    if (b.closed || !b.jobs || !b.jobs.length) continue;
    const have = {}; for (const id of b.employees || []) { const q = P(id); if (q && q.alive) have[q.job] = (have[q.job] || 0) + 1; }
    const need = {}; for (const j of b.jobs) need[j] = (need[j] || 0) + 1;
    for (const j of Object.keys(need)) { const o = need[j] - (have[j] || 0); if (o > 0 && j !== 'mayor' && j !== 'priest' && j !== 'doctor') { out[j] = (out[j] || 0) + o; total += o; } }
  }
  return { byJob: out, total };
}
function vacantHouses() { const r = []; for (const b of W.buildings.values()) if (b.type === 'house' && !b.closed && !(b.residents && b.residents.length)) r.push(b); return r; }
function popFactorIn(n) { const r = n / S().initialPop; return r < 0.8 ? 2.5 : r < 1 ? 1.6 : r < 1.5 ? 1 : r < 2 ? 0.6 : r < 2.5 ? 0.25 : 0; }
function popFactorOut(n) { const r = n / S().initialPop; return r < 0.9 ? 0.3 : r < 1.5 ? 1 : r < 2 ? 1.4 : r < 2.5 ? 2.2 : 4; }

// ---------------------------------------------------------------------------------------------- arrivals
function setHome(p, house) {
  p.homeId = house.id; if (!house.residents.includes(p.id)) house.residents.push(p.id);
}
function boostSkill(p, job) {
  const sk = WANT_SKILL[job]; if (!sk) return;
  p.skills[sk] = clamp(Math.max(p.skills[sk] || 0, rfl(0.3, 0.7)));
}
function backstory(p, origin, kind, reasonKey, wanted) {
  const reason = pick(REASONS[reasonKey]);
  const m = M(p); m.arrivedTick = W.tick; m.origin = origin; m.reason = reason; m.kind = kind;
  mem(p, { type: 'arrival', text: `Left ${origin} because ${reason}; came to ${town()}${wanted ? ' hoping to find work as a ' + wanted : ' to start anew'}.`, otherIds: [], weight: 0.2, importance: 4, tick: W.tick - rint(4, 30) * TPD });
  mem(p, { type: 'memory', text: `Grew up in ${origin}.`, otherIds: [], weight: 0.1, importance: 2, tick: W.tick - rint(1, 20) * YEAR });
  W.addMoodlet(p, { id: 'newcomer', label: 'New in town', value: -0.05, untilTick: W.tick + 20 * TPD });
  p.needs.social = Math.min(p.needs.social, 0.45);
}
function newPerson(o, house) {
  const p = W.createPerson({ ...o, homeId: house.id });
  W.addPerson(p);
  setHome(p, house);
  return p;
}
function pickWanted(op) {
  const jobs = Object.keys(op.byJob).filter((j) => WANT_SKILL[j]);
  if (!jobs.length) return null;
  return W.rng.weighted(jobs, (j) => op.byJob[j]);
}
function pickHouse(force) {
  const v = vacantHouses();
  if (v.length) return pick(v);
  if (!force) return null;
  let best = null; for (const b of W.buildingsOfType('house')) if (!best || b.residents.length < best.residents.length) best = b;
  return best;
}
function arrive(kind, opts = {}) {
  const house = opts.house || pickHouse(opts.force);
  if (!house) return null;
  const op = openings();
  const wanted = pickWanted(op);
  const origin = pick(ORIGINS);
  const created = [];
  const finish = () => {
    for (const p of created) { W.emit('immigrate', { person: p, kind }); }
    S().arrived += created.length; W.stats.immigrants = (W.stats.immigrants || 0) + created.length;
    return created;
  };
  const hName = house.name && house.name !== 'House' ? ` (${house.name})` : '';
  if (kind === 'family') {
    const ln = surname(W.rng);
    const fAge = rint(24, 42), mAge = Math.max(19, fAge - rint(0, 6));
    const father = newPerson({ sex: 'M', age: fAge, lastName: ln, money: rint(30, 160) }, house);
    const mother = newPerson({ sex: 'F', age: mAge, lastName: ln, money: rint(5, 40) }, house);
    mother.maidenName = surname(W.rng);
    father.family.spouseId = mother.id; mother.family.spouseId = father.id;
    father.romance = { partnerId: mother.id, status: 'married', sinceTick: W.tick - rint(1, 12) * YEAR };
    mother.romance = { partnerId: father.id, status: 'married', sinceTick: father.romance.sinceTick };
    const ra = W.getRel(father, mother), rb = W.getRel(mother, father);
    for (const r of [ra, rb]) { r.familiarity = 1; r.affinity = 0.65; r.trust = 0.8; r.attraction = 0.5; if (!r.tags.includes('spouse')) r.tags.push('spouse'); }
    created.push(father, mother);
    const kids = Math.min(4, Math.max(0, Math.round(rfl(0, 1.2) * (mAge - 19) / 5)));
    for (let i = 0; i < kids; i++) { const maxA = Math.min(14, mAge - 19); const k = newPerson({ age: Math.max(0, rint(0, maxA)), mother, father, lastName: ln }, house); created.push(k); }
    boostSkill(father, wanted || 'farmer');
    backstory(father, origin, 'family', 'land', wanted); backstory(mother, origin, 'family', 'land', null);
    for (const k of created.slice(2)) { M(k).arrivedTick = W.tick; M(k).origin = origin; M(k).kind = 'family'; }
    const ks = created.length - 2;
    chron('arrival', 3, pick([
      `The ${ln} family has arrived from ${origin}: ${father.firstName} and ${mother.firstName}${ks ? ` with their ${ks === 1 ? 'child' : numWord(ks) + ' children'}` : ''}, taking the empty house${hName}. ${father.firstName} says he is a hand at ${wanted || 'any honest work'}.`,
      `A cart piled with bedding and a crate of hens brought the ${ln}s to ${town()} from ${origin}. ${father.firstName} hopes for work${wanted ? ' as a ' + wanted : ''}; ${mother.firstName} has already been seen at the well, asking after the school.`,
    ]), created.map((x) => x.id).slice(0, 5), house.id);
    return finish();
  }
  if (kind === 'stranger') {
    const sex = chance(0.7) ? 'M' : 'F';
    const sec = pick(SECRETS);
    const p = newPerson({ sex, age: rint(30, 55), money: rint(120, 450), personality: { extraversion: rfl(0.1, 0.4), openness: rfl(0.5, 0.9) } }, house);
    for (const k of Object.keys(p.skills)) p.skills[k] = clamp(p.skills[k] + rfl(0.1, 0.35));
    if (chance(0.3) && !p.traits.includes('thief')) p.traits.push('thief');
    if (!p.traits.includes('shy')) p.traits.push('shy');
    const m = M(p); m.mystery = true; m.secret = sec.text; m.secretRep = sec.rep; m.revealAfter = W.tick + rint(20, 140) * TPD;
    backstory(p, origin, 'stranger', 'fresh', null);
    mem(p, { type: 'secret', text: `I left ${origin} under another name. ${pro(p).c === 'He' ? 'I am' : 'I am'} ${sec.text}. No one here must know.`, otherIds: [], weight: -0.6, importance: 5 });
    created.push(p);
    chron('arrival', 3, pick([
      `A stranger who gives only the name ${nm(p)} has taken the empty house${hName}. ${pro(p).c} pays in good coin, says little of ${origin}, and watches the road.`,
      `${nm(p)} rode into ${town()} at dusk, no kin, no letters, and rents the house${hName} for a full season in advance. The tavern wonders who ${pro(p).s} really is.`,
    ]), [p.id], house.id);
    if (chance(0.15) && W.healthApi) W.healthApi.infect(p, pick(['flux', 'cold', 'sweating']), null);
    return finish();
  }
  if (kind === 'elder') {
    const sex = chance(0.6) ? 'F' : 'M';
    const p = newPerson({ sex, age: rint(58, 74), money: rint(10, 80) }, house);
    backstory(p, origin, 'elder', 'family', null);
    created.push(p);
    chron('arrival', 2, pick([
      `${nm(p)}, ${Math.floor(age(p))}, newly widowed in ${origin}, has come to live out ${pro(p).p} years near a married child's old friends in ${town()}.`,
      `An elderly ${p.sex === 'F' ? 'woman' : 'man'}, ${nm(p)}, has moved into the house${hName}, saying ${pro(p).s} wants to be buried in good earth among kind people.`,
    ]), [p.id], house.id);
    return finish();
  }
  // single worker
  const sex = chance(0.55) ? 'M' : 'F';
  const a = rint(17, 34);
  const p = newPerson({ sex, age: a, money: rint(2, 70) }, house);
  boostSkill(p, wanted || 'laborer');
  const rk = chance(0.55) ? 'work' : chance(0.5) ? 'land' : 'fresh';
  backstory(p, origin, 'single', rk, wanted);
  created.push(p);
  chron('arrival', 2, pick([
    `${nm(p)}, ${a}, has arrived from ${origin} looking for work${wanted ? ' as a ' + wanted : ''}. ${pro(p).c} has taken the empty house${hName}.`,
    `A young ${p.sex === 'F' ? 'woman' : 'man'} from ${origin}, ${nm(p)}, walked into ${town()} with a bundle and a letter of character, and is already asking at the ${wanted === 'baker' ? 'bakery' : wanted === 'smith' ? 'smithy' : 'market'} about work.`,
    `${town()} gains a new resident: ${nm(p)} of ${origin}, who left home because ${pick(REASONS[rk])}.`,
  ]), [p.id], house.id);
  return finish();
}
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const numWord = (n) => (n <= 8 ? NUMW[n] : String(n));
function pickKind() {
  return W.rng.weighted([['single', 56], ['family', 26], ['elder', 8], ['stranger', 7]], (x) => x[1])[0];
}

// ---------------------------------------------------------------------------------------------- emigration
function pressure(p) {
  // returns {p: annual probability, reason, key}
  const a = age(p); const ec = p.econ || {}; const h = p.ext.health || {};
  let best = { w: 0, key: 'base' }; let sum = 0;
  const add = (w, key) => { sum += w; if (w > best.w) best = { w, key }; };
  if (p.job === 'unemployed' && !p.homemaker && (ec.unempDays || 0) > 60) add(0.45, 'work');
  else if (p.job === 'unemployed' && !p.homemaker && (ec.unempDays || 0) > 30) add(0.15, 'work');
  if (p.reputation < -0.5) add(0.5, 'disgrace');
  else if (p.reputation < -0.35) add(0.15, 'disgrace');
  if ((p.debt || 0) > 100 && p.money < 5) add(0.2, 'debt');
  if (p.traits.includes('ambitious') && p.needs.purpose < 0.35 && p.personality.openness > 0.55) add(0.25, 'ambition');
  if (p.mood < -0.25) {
    for (let i = p.memories.length - 1, k = 0; i >= 0 && k < 12; i--, k++) {
      const m = p.memories[i]; if (W.tick - m.tick > 60 * TPD) break;
      if (m.type === 'romance' && m.weight < -0.5 || (m.type === 'breakup')) { add(0.3, 'heartbreak'); break; }
    }
  }
  if ((h.grief || 0) > 0.5) {
    const kin = (p.family.childrenIds || []).concat([p.family.spouseId, p.family.fatherId, p.family.motherId]).filter((id) => P(id) && P(id).alive);
    if (!kin.length) add(0.25, 'grief');
  }
  if (!sum && a >= 16 && a <= 32 && p.family.spouseId == null && (p.family.childrenIds || []).length === 0 && p.personality.openness > 0.45) add(0.02, 'wanderlust');
  let pr = sum + 0.004;
  // attachments
  if (p.family.spouseId != null) pr *= 0.55;
  if (p.workId != null) { const wb = W.buildings.get(p.workId); if (wb && wb.ownerId === p.id) pr *= 0.35; }
  if (p.homeId != null) { const hb = W.buildings.get(p.homeId); if (hb && hb.ownerId === p.id) pr *= 0.5; }
  if ((h.friends || 0) >= 3) pr *= 0.7;
  if (p.personality.openness < 0.35) pr *= 0.7;
  if (['mayor', 'priest', 'doctor'].includes(p.job)) pr *= 0.5;
  return { p: pr, key: best.key };
}
const WHY = {
  work: ['after a long fruitless search for work', 'having found no steady employment in the town', 'unable to find honest work'],
  disgrace: ['their name in tatters after the recent scandals', 'unable to bear the whispers', 'in disgrace', 'after the town turned its back'],
  debt: ['to escape debts they could not pay', 'deep in debt'],
  ambition: ['restless and convinced that the town was too small for their ambitions', 'seeking a larger life than a market town can offer'],
  heartbreak: ['heartsick and unable to stay where every lane held a memory', 'after a broken heart'],
  grief: ['their family gone and the town grown too sorrowful to bear', 'with nothing left to hold them'],
  wanderlust: ['to see something of the world', 'in search of better fortune'],
  base: ['for reasons of their own', 'to seek better fortune', 'to join relatives elsewhere'],
  forced: ['driven out of town', 'having been banished'],
};
const DEST = ['the coast', 'the capital', 'Kingsford', 'a market town upriver', 'the new mills in the north', 'the lowland farms', 'a cousin in Oldbridge', 'across the border'];

function removeFromMap(p) { // mirrors world.killPerson without the death
  p.alive = false;
  if (p.currentAction) p.currentAction = null;
  p.path = null;
  if (p.locationId != null) { const b = W.buildings.get(p.locationId); if (b) b.occupants.delete(p); }
  if (typeof W._gridRemove === 'function') W._gridRemove(p);
  p.locationId = null; p.inside = false;
  const wb = p.workId != null ? W.buildings.get(p.workId) : null;
  if (wb) { const i = wb.employees.indexOf(p.id); if (i >= 0) wb.employees.splice(i, 1); if (wb.ownerId === p.id) wb.ownerId = null; }
  p.lastWorkId = p.workId; p.workId = null;
  const hb = p.homeId != null ? W.buildings.get(p.homeId) : null;
  if (hb) { const i = hb.residents.indexOf(p.id); if (i >= 0) hb.residents.splice(i, 1); if (hb.ownerId === p.id) hb.ownerId = null; }
  W._livingDirty = true;
}
function missedBy(p, group) {
  const ids = new Set(group.map((x) => x.id));
  let n = 0;
  for (const [id, r] of p.relationships) {
    if (++n > 80) break;
    if (ids.has(id)) continue;
    const q = P(id); if (!q || !q.alive || q.emigrated) continue;
    const c = (r.affinity > 0.45 && r.familiarity > 0.4) ? Math.min(1, r.affinity) : 0;
    const isFam = r.tags && r.tags.includes('family');
    if (c < 0.5 && !(isFam && r.affinity > 0.3)) continue;
    W.addMoodlet(q, { id: 'missing_' + p.id, label: `Missing ${p.firstName}`, value: -0.1 - 0.15 * c, untilTick: W.tick + 25 * TPD });
    mem(q, { type: 'farewell', text: `${nm(p)} left ${town()} for good. I shall miss ${pro(p).o}.`, otherIds: [p.id], weight: -0.3 - 0.3 * c, importance: 3 });
    if (q.romance && q.romance.partnerId === p.id) {
      q.romance = { partnerId: null, status: null, sinceTick: W.tick };
      W.addMoodlet(q, { id: 'heartbroken', label: `${p.firstName} has gone`, value: -0.5, untilTick: W.tick + 50 * TPD });
    }
  }
}
function emigrate(p, reasonKey = 'base', opts = {}) {
  if (!p || !p.alive || p.emigrated) return null;
  const group = [p];
  const sp = P(p.family.spouseId);
  if (sp && sp.alive && !sp.emigrated) { if (opts.force || chance(0.85)) group.push(sp); else if (!opts.force) return null; }
  const home = p.homeId;
  for (const m of group.slice()) for (const id of m.family.childrenIds || []) { const k = P(id); if (k && k.alive && !k.emigrated && age(k) < 16 && !group.includes(k)) group.push(k); }
  // players do not leave on their own
  if (!opts.force && group.some(isPlayer)) return null;
  const dest = pick(DEST);
  const why = pick(WHY[reasonKey] || WHY.base);
  const lead = group[0];
  const adults = group.filter((x) => age(x) >= 16), kids = group.filter((x) => age(x) < 16);
  for (const m of group) {
    const mm = M(m); mm.departTick = W.tick; mm.reason = reasonKey; mm.dest = dest;
    m.emigrated = true; m.emigratedTick = W.tick; m.emigratedTo = dest;
    removeFromMap(m);
    S().emigrants.push(m.id);
  }
  for (const m of adults) missedBy(m, group);
  S().departed += group.length; W.stats.emigrants = (W.stats.emigrants || 0) + group.length;
  const job = lead.job && !['unemployed', 'retired', 'student', 'child'].includes(lead.job) ? ` the ${lead.job}` : '';
  let text;
  if (group.length === 1) text = pick([
    `${nm(lead)}${job} has left ${town()} for ${dest}, ${why}.`,
    `${nm(lead)} packed up and took the road to ${dest}, ${why}. ${pro(lead).c} will not be back soon.`,
    `${town()} is one fewer: ${nm(lead)} departed for ${dest} ${why}.`,
  ]);
  else text = pick([
    `The ${lead.lastName} household has left ${town()} for ${dest}${kids.length ? `, taking ${kids.length === 1 ? 'their child' : 'their ' + numWord(kids.length) + ' children'}` : ''}, ${why}.`,
    `${nm(lead)}${adults[1] ? ' and ' + adults[1].firstName : ''}${kids.length ? ' and the children' : ''} loaded a cart and left for ${dest}, ${why}.`,
  ]);
  const importance = ['mayor', 'doctor', 'priest', 'teacher'].includes(lead.job) || group.length >= 4 ? 3 : 2;
  chron('departure', importance, text, group.map((x) => x.id).slice(0, 5));
  W.emit('emigrate', { person: lead, reason: reasonKey, group });
  return group;
}

// ---------------------------------------------------------------------------------------------- system
export default {
  name: 'migration',
  init(world) {
    W = world;
    world.migrationState = { initialPop: Math.max(20, world.living().length), arrived: 0, departed: 0, emigrants: [], lastArrivalDay: -999 };
    world.migrationApi = { arrive, emigrate, pressure, openings, vacantHouses };
    if (typeof world.registerIntervention === 'function') {
      const imm = (w, prm = {}) => {
        const n = Math.max(1, Math.min(30, prm.n || 3)); let got = 0, k = 0;
        while (got < n && k++ < 40) {
          const kind = prm.kind || (n >= 4 && chance(0.5) ? 'family' : pickKind());
          const r = arrive(kind, { force: true }); if (!r) break; got += r.length;
        }
        return `${got} newcomers arrived`;
      };
      imm.description = "Newcomers arrive. params: {n: ~people (default 3), kind?: 'single'|'family'|'elder'|'stranger'}. Houses are shared if none are vacant.";
      world.registerIntervention('immigrants', imm);
      const exo = (w, prm = {}) => {
        let targets;
        if (prm.person != null) targets = [typeof prm.person === 'object' ? prm.person : w.people.get(prm.person)];
        else {
          const L = w.living().filter((p) => age(p) >= 16 && !p.emigrated && !isPlayer(p));
          const n = Math.max(1, Math.min(60, prm.n || 5)); targets = [];
          const wts = L.map((p) => 0.2 + pressure(p).p * 5);
          while (targets.length < n && L.length) { const i = L.length === 1 ? 0 : W.rng.weighted(L.map((_, j) => j), (j) => wts[j]); targets.push(L.splice(i, 1)[0]); wts.splice(i, 1); }
        }
        let g = 0;
        for (const p of targets) { if (p && p.alive && !p.emigrated) { const r = emigrate(p, prm.reason || 'base', { force: true }); if (r) g += r.length; } }
        return `${g} people left town`;
      };
      exo.description = 'People leave town. params: {n: how many households (default 5), person?: id, reason?: work|disgrace|debt|ambition|heartbreak|grief}.';
      world.registerIntervention('exodus', exo);
    }
  },
  onTick() {},
  onHour() {},
  onDay(world) {
    W = world;
    const st = S(); const L = world.living(); const n = L.length;
    // ---------- arrivals
    const op = openings(); const vac = vacantHouses();
    if (vac.length) {
      let rate = 3 + 0.5 * Math.min(op.total, 12) + 0.25 * Math.min(vac.length, 20);
      rate *= popFactorIn(n) * (n / st.initialPop < 1.2 ? 1 : 1);
      const unemp = L.filter((p) => p.job === 'unemployed' && age(p) >= 16 && age(p) < 62 && !p.homemaker).length;
      if (unemp > 0.12 * n) rate *= 0.3;
      if ((world.town.treasury ?? 0) > 1200) rate *= 1.15;
      if (world.time.season === 3) rate *= 0.6; // few travel in deep winter
      else if (world.time.season === 0 || world.time.season === 2) rate *= 1.2;
      rate *= world.settings?.immigrationScale ?? 1;
      if (world.time.totalDays - st.lastArrivalDay >= 3 && chance(rate / DPY)) { if (arrive(pickKind())) st.lastArrivalDay = world.time.totalDays; }
    }
    // ---------- emigration
    const fo = popFactorOut(n) * (world.settings?.emigrationScale ?? 1);
    const leaving = [];
    for (const p of L) {
      if (p.emigrated || age(p) < 16 || age(p) > 65 || p.jailedUntil > world.tick || isPlayer(p)) continue;
      if (p.family.guardianId != null) continue;
      const pr = pressure(p);
      if (world.rng.next() < (pr.p * fo) / DPY) leaving.push([p, pr.key]);
    }
    for (const [p, key] of leaving) { if (p.alive && !p.emigrated) emigrate(p, key); }
    // ---------- strangers' secrets come out
    for (const p of L) {
      const m = p.ext.migration; if (!m || !m.mystery || m.revealed || world.tick < m.revealAfter) continue;
      if (!chance(1 / (DPY * 1.2))) continue;
      m.revealed = true;
      p.reputation = clamp(p.reputation + (m.secretRep || 0), -1, 1);
      chron('revelation', 3, pick([
        `The truth about ${nm(p)} is out: ${pro(p).s} is ${m.secret}. Tongues wag at the tavern.`,
        `It has come to light that ${nm(p)}, who arrived a stranger, is ${m.secret}. ${town()} is divided on what to make of it.`,
      ]), [p.id]);
      mem(p, { type: 'exposure', text: 'My secret is out. The whole town knows who I was.', otherIds: [], weight: (m.secretRep || 0) > 0 ? 0 : -0.5, importance: 4 });
    }
  },
};
