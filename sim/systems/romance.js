// ROMANCE system: attraction, crushes, courtship, engagement, weddings, marriage quality, infidelity,
// breakups, divorce, widowhood and remarriage. Player-safe: nothing here assumes a person is AI-driven;
// all transitions are exported (startDating, propose, finalizeWedding, breakUp, divorce, respondToOffer).
import { clamp } from '../util.js';
import { kinship, bloodDistance, relocate, findVacantHouse, getParents, getSiblings } from './family.js';

const TPD = 144, DPY = 112, YEAR = TPD * DPY;
const full = (p) => `${p.firstName} ${p.lastName}`;
let W = null;
const P = (id) => (id == null || !W ? null : W.people.get(id) || null);
const ageOf = (p) => W.ageOf(p);
const isPlayer = (p) => W.player != null && W.player === p.id;
const has = (p, t) => p.traits.includes(t);
const pr = (p) => (p.sex === 'F' ? { s: 'she', o: 'her', p: 'her' } : { s: 'he', o: 'him', p: 'his' });
const NONJOB = new Set(['unemployed', 'retired', 'student', 'child', undefined, null]);
const desc = (p) => (NONJOB.has(p.job) ? full(p) : `${full(p)} (${p.job})`);
const moodlet = (p, id, label, value, ticks) => W.moodlet(p, id, label, value, ticks);
const mem = (p, type, text, others, weight, importance) => W.addMemory(p, { type, text, otherIds: others, weight, importance });
const rom = (p) => (p.ext.rom || (p.ext.rom = { sat: 0.7, crush: null, desire: null, cool: {}, affair: null, widowedTick: null, lastBreak: -1e9, offers: [], lowDays: 0, grief: 0 }));
const rel = (a, b) => W.getRel(a, b);
const bump = (r, k, d, lo = 0, hi = 1) => { r[k] = clamp(r[k] + d, lo, hi); };
const tag = (r, t) => { if (!r.tags.includes(t)) r.tags.push(t); };
const untag = (r, t) => { const i = r.tags.indexOf(t); if (i >= 0) r.tags.splice(i, 1); };
const state = () => W.romanceState;

// ------------------------------------------------------------------ orientation & basic eligibility
export function orient(p) {
  if (!p.orientation) {
    const x = W.rng.next();
    p.orientation = x < 0.905 ? 'straight' : x < 0.945 ? 'gay' : 'bi';
  }
  return p.orientation;
}
function attractedTo(a, b) {
  const o = orient(a);
  return o === 'bi' || (o === 'straight' ? a.sex !== b.sex : a.sex === b.sex);
}
function desireOf(p) {
  const r = rom(p);
  if (r.desire == null) { r.desire = W.rng.chance(0.07) ? 0.05 : clamp(W.rng.gauss(1, 0.3), 0.15, 1.8); }
  return r.desire;
}
function ageDesire(a) { return a < 16 ? 0 : a < 18 ? 0.25 : a < 21 ? 0.8 : a < 29 ? 1 : a < 36 ? 0.7 : a < 46 ? 0.4 : a < 60 ? 0.2 : 0.1; }
export function single(p) { return p.alive && !p.romance.status && p.family.spouseId == null; }
function adultOk(p, minAge = 16) { return p.alive && ageOf(p) >= minAge; }
function kinBlock(a, b) { return bloodDistance(a, b) <= 4 || ['mother-in-law', 'father-in-law', 'stepmother', 'stepfather', 'stepson', 'stepdaughter', 'son-in-law', 'daughter-in-law'].includes(kinship(a, b)); }
function readyForLove(p) { // grief / heartbreak
  const r = rom(p), t = W.tick;
  if (r.widowedTick != null && t < r.widowedTick + r.grief) return false;
  if (t < r.lastBreak + 0.25 * YEAR) return false;
  return true;
}

// ------------------------------------------------------------------ attraction model
const hash = (a, b) => { let h = (Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; return (h % 1000) / 1000; };
function ageFactor(a, b) { // how acceptable is b's age to a (a's perspective)
  const aa = ageOf(a), ab = ageOf(b);
  const gap = ab - aa;
  const pref = a.sex === b.sex ? 0 : a.sex === 'M' ? -2.5 : 2.5;
  const sd = 3.2 + 0.12 * Math.max(0, aa - 28);
  if (ab < 18 && aa > 23) return 0; if (aa < 18 && ab > 24) return 0;
  return Math.exp(-0.5 * ((gap - pref) / sd) ** 2);
}
// how appealing b is to a, 0..1 (asymmetric)
export function appeal(a, b) {
  const pa = a.personality, pb = b.personality;
  const compat = clamp(1 - (0.7 * Math.abs(pa.openness - pb.openness) + 0.6 * Math.abs(pa.agreeableness - pb.agreeableness) + 0.4 * Math.abs(pa.conscientiousness - pb.conscientiousness) + 0.4 * Math.max(0, pb.neuroticism - 0.55) + 0.25 * Math.abs(pa.extraversion - pb.extraversion)), 0, 1);
  const chem = hash(a.id, b.id);
  let t = 0.3 * b.genes.looks + 0.26 * compat + 0.22 * chem + 0.08 * (b.skills.charisma || 0) + 0.08 * Math.min(1, Math.max(0, b.money) / 300) + 0.06 * (b.genes.vitality || 0.5);
  if (has(b, 'charming')) t += 0.07; if (has(b, 'kind')) t += 0.05; if (has(b, 'lazy')) t -= 0.05; if (has(b, 'drunkard')) t -= 0.07; if (has(b, 'honest')) t += 0.03;
  if (b.reputation) t += 0.08 * b.reputation;
  return clamp(t * (0.15 + 0.85 * ageFactor(a, b)), 0, 1);
}
function growAttraction(a, b, amount) { // a toward b
  const r = rel(a, b);
  const t = appeal(a, b);
  const d = t > 0.3 ? amount * t : amount * (t - 0.3) * 0.5;
  bump(r, 'attraction', d);
}

// ------------------------------------------------------------------ rumors
function rumor(kind, aboutP, other, seedPeople = 2) {
  const api = W.social_api;
  if (!api || !api.createRumor) return null;
  const r = api.createRumor(W, { aboutId: aboutP.id, kind, ctx: { other } });
  if (!r) return null;
  const pool = [];
  for (const [id, x] of aboutP.relationships) if (x.familiarity > 0.35) { const q = P(id); if (q && q.alive && q.id !== (other && other.id)) pool.push(q); }
  for (let i = 0; i < seedPeople && pool.length; i++) api.hear(W, W.rng.pick(pool), r, null);
  return r;
}

// ------------------------------------------------------------------ dating / engagement / breakup
function offerTo(target, from, kind) {
  const r = rom(target);
  if (r.offers.some((o) => o.from === from.id && o.kind === kind)) return 'pending';
  r.offers.push({ from: from.id, kind, tick: W.tick });
  if (r.offers.length > 5) r.offers.shift();
  W.emit('romanceOffer', { from, to: target, kind });
  return 'pending';
}
export function startDating(a, b, opts = {}) {
  if (!a || !b || !a.alive || !b.alive || a === b) return false;
  for (const [x, y] of [[a, b], [b, a]]) {
    x.romance = { partnerId: y.id, status: 'dating', sinceTick: W.tick };
    const r = rel(x, y); tag(r, 'partner'); untag(r, 'crush'); untag(r, 'ex');
    bump(r, 'familiarity', 0.2); bump(r, 'affinity', 0.15, -1, 1); bump(r, 'attraction', 0.15); bump(r, 'trust', 0.05);
    r.attraction = Math.max(r.attraction, 0.55);
    const rm = rom(x); rm.crush = rm.crush === y.id ? null : rm.crush;
    moodlet(x, 'newlove', 'Falling in love', 0.35, 28 * TPD);
    mem(x, 'romance', `Began courting ${full(y)}.`, [y.id], 0.8, 3);
  }
  const rm = (b2) => b2.ext.rom;
  if (W.rng.chance(0.55) || opts.chronicle) W.chronicle.add({ type: 'romance', importance: 1, text: W.rng.pick([
    `${full(a)} and ${full(b)} have been seen walking out together after temple.`,
    `${desc(a)} is courting ${desc(b)}, to the delight of the gossips.`,
    `It is now an open secret: ${a.firstName} ${a.lastName} and ${b.firstName} ${b.lastName} are sweethearts.`,
    `${a.firstName} has taken to calling at the ${b.lastName} door; ${b.firstName} does not seem to mind.`]), people: [a.id, b.id] });
  rumor('courtship', a, b, 1);
  W.emit('dating', { a, b });
  return true;
}
function askOut(x, y) { // x asks y; returns 'accepted'|'refused'|'pending'
  if (isPlayer(y)) return offerTo(y, x, 'date');
  const ry = rel(y, x);
  let interest = ry.attraction * 0.6 + appeal(y, x) * 0.25 + Math.max(0, ry.affinity) * 0.2 + (ry.familiarity > 0.4 ? 0.05 : 0);
  if (!attractedTo(y, x)) interest = 0;
  if (!single(y) || !readyForLove(y)) interest *= 0.1;
  if (ry.attraction < 0.28) interest *= 0.35;
  if (has(x, 'charming')) interest += 0.08;
  interest -= 0.1;
  if (W.rng.next() < clamp(interest * 1.15, 0.01, 0.92)) { startDating(x, y); return 'accepted'; }
  // rejected
  bump(rel(x, y), 'attraction', -0.25); rom(x).crush = null; rom(x).cool[y.id] = W.tick + 0.6 * YEAR;
  moodlet(x, 'rejected', `Turned down by ${y.firstName}`, -0.3, 20 * TPD);
  mem(x, 'rejection', `Worked up the courage to ask ${full(y)} out, and was turned down.`, [y.id], -0.6, 3);
  mem(y, 'rejection', `${full(x)} asked ${pr(y).s === 'she' ? 'me' : 'me'} to walk out, but I was not interested.`, [x.id], -0.1, 1);
  if (W.rng.chance(0.15)) rumor('courtship', x, y, 1);
  return 'refused';
}
export function propose(a, b) { // a proposes to b
  if (!a || !b || a.romance.partnerId !== b.id || a.romance.status !== 'dating') return false;
  if (isPlayer(b)) return offerTo(b, a, 'proposal');
  const rb = rel(b, a);
  const p = clamp(0.5 + 0.35 * rb.attraction + 0.25 * Math.max(0, rb.affinity) - (ageOf(b) < 18 ? 0.2 : 0), 0.1, 0.97);
  if (W.rng.next() < p) { engage(a, b); return true; }
  mem(a, 'rejection', `Proposed to ${full(b)} and was refused.`, [b.id], -0.9, 4);
  mem(b, 'rejection', `Refused ${full(a)}'s proposal; I was not ready.`, [a.id], -0.2, 3);
  moodlet(a, 'refusedprop', 'Refused a proposal', -0.5, 30 * TPD);
  if (W.rng.chance(0.45)) breakUp(a, b, { reason: 'refused a proposal', dumper: b });
  return false;
}
function nextRestDay(minDays, maxDays) {
  const t = W.time; let d = W.rng.int(minDays, maxDays);
  for (let i = 0; i < 7; i++) if ((t.weekday + d + i) % 7 === 6) return t.totalDays + d + i;
  return t.totalDays + d;
}
export function engage(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    x.romance = { partnerId: y.id, status: 'engaged', sinceTick: x.romance.sinceTick || W.tick };
    const r = rel(x, y); bump(r, 'affinity', 0.1, -1, 1); bump(r, 'trust', 0.1); tag(r, 'betrothed');
    moodlet(x, 'engaged', 'Engaged to be married', 0.45, 40 * TPD);
    mem(x, 'engagement', x === a ? `Proposed to ${full(y)} and was accepted.` : `Accepted ${full(a)}'s proposal of marriage.`, [y.id], 0.9, 4);
  }
  const hurry = a.pregnant || b.pregnant;
  const dueDay = hurry ? nextRestDay(7, 18) : nextRestDay(18, 70);
  state().weddings.push({ a: a.id, b: b.id, dueDay, invited: null });
  W.chronicle.add({ type: 'romance', importance: 2, text: W.rng.pick([
    `${desc(a)} and ${desc(b)} are betrothed; the banns will be read on the next rest days.`,
    `${full(a)} has asked for ${full(b)}'s hand, and been accepted. The wedding is set for ${W.formatDate(dueDay * TPD)}.`,
    `Engagement: ${full(a)} and ${full(b)} announced their intention to marry${hurry ? ', and not a moment too soon, the neighbours remark' : ''}.`]), people: [a.id, b.id] });
  W.emit('engagement', { a, b });
}
export function breakUp(a, b, o = {}) {
  const wasEngaged = a.romance.status === 'engaged';
  const dumper = o.dumper || (W.rng.chance(0.5) ? a : b), dumped = dumper === a ? b : a;
  for (const [x, y] of [[a, b], [b, a]]) {
    x.romance = { partnerId: null, status: null, sinceTick: W.tick };
    const r = rel(x, y); untag(r, 'partner'); untag(r, 'betrothed'); tag(r, 'ex'); bump(r, 'affinity', -0.3, -1, 1); bump(r, 'attraction', x === dumped ? -0.1 : -0.35);
    rom(x).lastBreak = W.tick;
    moodlet(x, 'heartbreak', x === dumped ? 'Heartbroken' : 'Guilt and relief after a breakup', x === dumped ? -0.55 : -0.2, 35 * TPD);
    mem(x, 'breakup', `${x === dumped ? `${full(y)} ended things with me${o.reason ? ' (' + o.reason + ')' : ''}.` : `Ended things with ${full(y)}${o.reason ? ': ' + o.reason : ''}.`}`, [y.id], -0.6, wasEngaged ? 4 : 3);
  }
  state().weddings = state().weddings.filter((w) => !((w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id)));
  if (wasEngaged || W.rng.chance(0.25)) W.chronicle.add({ type: 'romance', importance: wasEngaged ? 2 : 1, text: wasEngaged ? W.rng.pick([`The engagement of ${full(a)} and ${full(b)} is broken; ${full(dumper)} called it off${o.reason ? ' over ' + o.reason : ''}.`, `No wedding after all: ${full(a)} and ${full(b)} have parted ways, ${dumped.firstName} taking it hard.`]) : W.rng.pick([`${full(a)} and ${full(b)} are no longer walking out together.`, `${full(dumper)} has broken with ${full(dumped)}${o.reason ? ' on account of ' + o.reason : ''}; the gossips have their talk.`]), people: [a.id, b.id] });
  W.emit('breakup', { a, b, engaged: wasEngaged });
}

// ------------------------------------------------------------------ weddings
function templeOf() { const t = W.buildingsOfType('temple'); return t && t[0] ? t[0] : null; }
function guestList(a, b) {
  const g = new Map();
  const add = (p) => { if (p && p.alive && p.id !== a.id && p.id !== b.id && !g.has(p.id) && (p.illness ? p.illness.severity < 0.6 : true) && !(p.jailedUntil > W.tick)) g.set(p.id, p); };
  for (const x of [a, b]) {
    for (const par of getParents(x)) { add(par); for (const gp of getParents(par)) add(gp); }
    for (const s of getSiblings(x)) add(s);
    for (const id of x.family.childrenIds) add(P(id));
    const fr = [];
    for (const [id, r] of x.relationships) if (r.affinity > 0.42 && r.familiarity > 0.5) fr.push([r.affinity, id]);
    fr.sort((u, v) => v[0] - u[0]);
    for (const [, id] of fr.slice(0, 9)) add(P(id));
  }
  return [...g.values()];
}
function processWeddings() {
  const S = state(), t = W.time;
  for (let i = S.weddings.length - 1; i >= 0; i--) {
    const w = S.weddings[i];
    const a = P(w.a), b = P(w.b);
    if (!a || !b || !a.alive || !b.alive || a.romance.partnerId !== b.id || a.romance.status !== 'engaged') { S.weddings.splice(i, 1); continue; }
    if (t.totalDays < w.dueDay) continue;
    if (t.totalDays === w.dueDay && t.hour >= 9 && t.hour < 13 && !w.invited) {
      const temple = templeOf();
      w.invited = guestList(a, b);
      if (temple) for (const g of [a, b, ...w.invited]) {
        if (isPlayer(g) || (g.currentAction && g.currentAction.forced)) continue;
        if (g.currentAction && g.currentAction.id === 'sleep') continue;
        W.forceAction(g, 'wedding', temple.id, { duration: 22, thought: g === a || g === b ? 'Today is my wedding day!' : `Off to ${a.firstName} and ${b.firstName}'s wedding.`, why: 'wedding' });
      }
      continue;
    }
    if (t.totalDays > w.dueDay || t.hour >= 14) { S.weddings.splice(i, 1); finalizeWedding(a, b, w.invited || guestList(a, b)); }
  }
}
function chooseHome(a, b) {
  // returns {house, kids: [people who move too]}
  const groom = a.sex === 'M' || b.sex === 'F' ? a : b, other = groom === a ? b : a;
  const hg = groom.homeId != null ? W.buildings.get(groom.homeId) : null, ho = other.homeId != null ? W.buildings.get(other.homeId) : null;
  if (hg && ho && hg.id === ho.id) return hg;
  const owns = (p, h) => h && h.ownerId === p.id;
  const crowd = (h) => (h ? h.residents.filter((i) => { const q = P(i); return q && q.alive; }).length : 99);
  const money = a.money + b.money;
  const alone = (h, p) => h && h.residents.every((i) => i === p.id || !P(i) || !P(i).alive);
  if (owns(groom, hg) && crowd(hg) <= 5) return hg;
  if (owns(other, ho) && crowd(ho) <= 5) return ho;
  if (alone(hg, groom) && crowd(hg) <= 1) return hg;
  if (alone(ho, other) && crowd(ho) <= 1) return ho;
  const vac = findVacantHouse(W, hg ? hg.door : null);
  const neoloc = vac && (money > 25 || ageOf(groom) > 26 || W.rng.chance(0.4)) && W.rng.chance(0.7);
  if (neoloc) return vac;
  const opts = [hg, ho].filter((h) => h && crowd(h) <= 7).sort((x, y) => crowd(x) - crowd(y) + (x === hg ? -1.5 : 0));
  if (opts.length) return opts[0];
  return vac || hg || ho;
}
export function marry(a, b, o = {}) { // instant marriage (no ceremony details); used by finalizeWedding and interventions
  for (const [x, y] of [[a, b], [b, a]]) {
    x.family.spouseId = y.id; x.romance = { partnerId: y.id, status: 'married', sinceTick: W.tick };
    const r = rel(x, y); tag(r, 'spouse'); untag(r, 'betrothed'); untag(r, 'partner'); untag(r, 'ex'); untag(r, 'crush');
    r.familiarity = 1; r.affinity = Math.max(r.affinity, 0.55); r.trust = Math.max(r.trust, 0.7); r.attraction = Math.max(r.attraction, 0.6);
    const rm = rom(x); rm.sat = clamp(0.62 + 0.25 * r.affinity + W.rng.gauss(0, 0.05), 0.4, 0.95); rm.crush = null; rm.lowDays = 0;
    if (x.sex === 'F' && y.sex === 'M') { if (!x.maidenName) x.maidenName = x.lastName; x.lastName = y.lastName; }
    mem(x, 'marriage', `Married ${full(y)}.`, [y.id], 0.95, 5);
  }
  // wife leaves the workforce sometimes (era)
  for (const x of [a, b]) if (x.sex === 'F' && x.workId == null && W.rng.chance(0.4)) x.homemaker = true;
  // household
  const house = chooseHome(a, b);
  if (house) {
    const kidsOf = (p) => p.family.childrenIds.map(P).filter((k) => k && k.alive && ageOf(k) < 16 && k.homeId === p.homeId && p.homeId !== house.id);
    const moving = [a, b, ...kidsOf(a), ...kidsOf(b)];
    for (const m of moving) relocate(W, m, house);
    const hs = house.residents.map(P).filter((q) => q && q.alive && ageOf(q) >= 18 && q.family.spouseId == null && q.id !== a.id && q.id !== b.id);
    if (house.ownerId == null || !P(house.ownerId) || !P(house.ownerId).alive) house.ownerId = a.sex === 'M' || b.sex !== 'M' ? a.id : b.id;
  }
  W.stats.marriages = (W.stats.marriages || 0) + 1;
  W.emit('marriage', { a, b, aId: a.id, bId: b.id });
}
export function finalizeWedding(a, b, invited = []) {
  if (!a.alive || !b.alive) return false;
  const temple = templeOf();
  const priest = temple ? temple.employees.map(P).find((p) => p && p.alive && p.job === 'priest') : null;
  const attended = invited.filter((g) => g.alive && g.currentAction && g.currentAction.id === 'wedding');
  const guests = (attended.length >= Math.min(3, invited.length) ? attended : invited).filter((g) => g.alive);
  const dA = desc(a), dB = desc(b), nA = full(a), nB = full(b), aLast = a.lastName, bLast = b.lastName;
  marry(a, b);
  const gift = (p) => { let g = 0; for (const par of getParents(p)) if (par.alive && par.money > 70) { const x = Math.round(par.money * W.rng.float(0.05, 0.15)); par.money -= x; g += x; } return Math.min(g, 90); };
  const dowry = gift(a) + gift(b);
  a.money += dowry / 2; b.money += dowry / 2;
  for (const x of [a, b]) { moodlet(x, 'wedding', 'Wedding day', 0.6, 3 * TPD); moodlet(x, 'newlywed', 'Newlywed glow', 0.2, 30 * TPD); }
  for (const g of guests) {
    moodlet(g, 'wedding', `Enjoyed ${a.firstName} and ${b.firstName}'s wedding`, 0.22, 2 * TPD);
    if (W.rng.chance(0.4)) mem(g, 'wedding', `Attended the wedding of ${full(a)} and ${full(b)}.`, [a.id, b.id], 0.5, 2);
    for (const x of [a, b]) { const r = rel(g, x); bump(r, 'familiarity', 0.04); bump(r, 'affinity', 0.03, -1, 1); if (g.money > 30 && W.rng.chance(0.5)) { g.money -= 2; x.money += 2; } }
    g.needs.social = clamp(g.needs.social + 0.2); g.needs.fun = clamp(g.needs.fun + 0.25);
  }
  for (const x of [a, b]) { x.needs.social = clamp(x.needs.social + 0.3); x.needs.fun = clamp(x.needs.fun + 0.4); }
  const fam = guests.filter((g) => getParents(a).includes(g) || getParents(b).includes(g) || getSiblings(a).includes(g) || getSiblings(b).includes(g));
  const names = guests.slice(0, 3).map((g) => g.firstName);
  const gtxt = guests.length ? `${guests.length} guests` + (names.length ? `, among them ${names.join(', ')}${guests.length > 3 ? ' and others' : ''}` : '') : 'only the witnesses';
  const where = temple ? temple.name : 'the temple';
  const season = ['spring', 'summer', 'autumn', 'winter'][W.time.season];
  const same = a.sex === b.sex;
  const sA = Math.floor(ageOf(a)), sB = Math.floor(ageOf(b));
  const T = [
    `${dA}, ${sA}, and ${dB}, ${sB}, were married at ${where}${priest ? ', ' + full(priest) + ' officiating' : ''}, before ${gtxt}.`,
    `Wedding bells in Hollowmere: ${nA} and ${nB} said their vows at ${where} on ${season === 'autumn' ? 'an' : 'a'} ${season} afternoon; ${gtxt} came to celebrate.`,
    `${nA} wed ${nB} this rest day. ${gtxt.charAt(0).toUpperCase() + gtxt.slice(1)} crowded ${where}${dowry > 20 ? `, and the families gave ${Math.round(dowry)} crowns to set up the new household` : ''}.`,
    `${season === 'autumn' ? 'An' : 'A'} ${season} wedding: ${nA} and ${nB} are man and wife${same ? ' in all but the town\'s eyebrows' : ''}, with ${fam.length ? 'both families' : 'friends'} looking on at ${where}.`,
  ];
  if (same) T.length = 2;
  W.chronicle.add({ type: 'marriage', importance: 3, text: W.rng.pick(T), people: [a.id, b.id, ...guests.slice(0, 6).map((g) => g.id)], buildingId: temple ? temple.id : undefined });
  for (const g of [a, b, ...invited]) if (g.currentAction && g.currentAction.id === 'wedding' && !isPlayer(g)) { /* let it end naturally */ }
  return true;
}

// ------------------------------------------------------------------ marriage dynamics
const ARGUE = ['over money', 'over the in-laws', 'over the children', 'over a forgotten promise', 'over drink', 'over who does the chores', 'over a careless word', 'over where to spend the festival'];
function spouseOf(p) { return P(p.family.spouseId); }
function marriageDaily(p, S) {
  const sp = spouseOf(p); if (!sp || !sp.alive) return;
  const r = rom(p), rs = rel(p, sp);
  const kids = p.family.childrenIds.map(P).filter((k) => k && k.alive);
  const young = kids.filter((k) => ageOf(k) < 4).length;
  const poor = (p.money + sp.money) < 12 ? 0.12 : 0;
  const a01 = (rs.affinity + 1) / 2;
  const target = clamp(0.18 + 0.52 * a01 + 0.04 * Math.min(4, kids.length) - 0.04 * Math.min(3, young) - poor - 0.12 * (p.personality.neuroticism - 0.5) + 0.1 * (sp.personality.agreeableness - 0.5) + 0.05 * (p.personality.agreeableness - 0.5) + (r.affair ? -0.05 : 0), 0.03, 0.98);
  r.sat += (target - r.sat) * 0.02;
  bump(rs, 'affinity', (r.sat - 0.5) * 0.003, -1, 1); bump(rs, 'attraction', (r.sat - 0.55) * 0.002);
  // quarrels (each spouse rolls separately but only one quarrel per couple per day)
  if (p.id < sp.id) {
    const pq = 0.006 + 0.03 * (1 - r.sat) + 0.012 * (has(p, 'hothead') + has(sp, 'hothead')) + (poor ? 0.01 : 0) + 0.006 * (has(p, 'drunkard') + has(sp, 'drunkard'));
    if (W.rng.next() < pq) {
      const cause = W.rng.pick(ARGUE);
      for (const [x, y] of [[p, sp], [sp, p]]) { rom(x).sat = clamp(rom(x).sat - 0.03); bump(rel(x, y), 'affinity', -0.025, -1, 1); moodlet(x, 'spousequarrel', 'Quarrel with spouse', -0.15, TPD); }
      if (W.rng.chance(0.2)) { mem(p, 'quarrel', `Had a bitter row with ${sp.firstName} ${cause}.`, [sp.id], -0.4, 2); mem(sp, 'quarrel', `Had a bitter row with ${p.firstName} ${cause}.`, [p.id], -0.4, 2); }
      if (W.rng.chance(0.03)) rumor('trouble', p, sp, 2);
    } else if (W.rng.chance(0.01 * r.sat)) { // tender moment
      for (const [x, y] of [[p, sp], [sp, p]]) { rom(x).sat = clamp(rom(x).sat + 0.025); bump(rel(x, y), 'affinity', 0.02, -1, 1); moodlet(x, 'tender', 'A tender evening together', 0.12, TPD); }
    }
  }
  if (r.sat < 0.24) r.lowDays++; else r.lowDays = Math.max(0, r.lowDays - 2);
  if (r.affair) { // affair upkeep
    const lov = P(r.affair.withId);
    if (!lov || !lov.alive || !readyAffair(lov)) { r.affair = null; }
    else {
      growAttraction(p, lov, 0.01);
      if (!r.affair.known && p.id < (lov.id)) {
        let dis = 0.003 + 0.0012 * (has(sp, 'jealous') ? 4 : 1) + 0.0015 * (has(p, 'gossip') ? 2 : 0);
        if (W.rng.next() < dis) { if (W.rng.chance(0.7)) discover(sp, p, lov, 'by chance'); else { const rr = rumor('affair', p, lov, 3); if (!rr) discover(sp, p, lov, 'by gossip'); } }
        else if (W.rng.chance(0.008)) rumor('affair', p, lov, 2);
      }
      if (W.rng.chance(0.004)) endAffair(p, lov, 'drifted apart');
    }
  } else if (!isPlayer(p)) maybeAffair(p, sp, r);
  // divorce
  if (r.lowDays > 90 && !isPlayer(p)) {
    const religious = 1 - 0.55 * ((p.values && p.values.piety) || 0.4) - 0.2 * ((p.values && p.values.tradition) || 0.5);
    const dc = 0.0035 * (W.settings.divorceScale ?? 1) * religious * (1 + (r.lowDays - 90) / 200);
    if (W.rng.next() < dc) divorce(p, sp, { initiator: p, reason: r.sat < 0.15 ? 'an unbearable coldness' : 'irreconcilable differences' });
  }
}
function readyAffair(q) { return q.alive; }
function maybeAffair(p, sp, r) {
  const a = ageOf(p); if (a < 19 || a > 60 || !desireOf(p) || (p.pregnant && W.rng.chance(0.7))) return;
  const base = 0.04 / DPY; // ~2.8% a year baseline among the willing, scaled below
  const c = p.personality.conscientiousness;
  const f = (1.9 - 2 * c) * (1 + 2.2 * (1 - r.sat)) * (has(p, 'romantic') ? 1.3 : 1) * (has(p, 'charming') ? 1.3 : 1) * (has(p, 'drunkard') ? 1.3 : 1) * (1.2 - ((p.values && p.values.piety) || 0.4)) * (0.8 + p.personality.extraversion * 0.5) * (W.settings.affairScale ?? 1) * (p.sex === 'M' ? 1.2 : 0.9);
  if (W.rng.next() > base * Math.max(0.1, f)) return;
  // find opportunity
  let best = null, bs = 0.4;
  for (const [id, x] of p.relationships) {
    if (id === sp.id || x.familiarity < 0.3 || x.attraction < 0.35) continue;
    const q = P(id); if (!q || !q.alive || ageOf(q) < 17 || !attractedTo(p, q) || !attractedTo(q, p) || kinBlock(p, q)) continue;
    const back = rel(q, p);
    const s = x.attraction + 0.3 * back.attraction + 0.1 * Math.max(0, x.affinity) + (q.romance.status === 'married' ? -0.05 : 0.0);
    if (back.attraction < 0.25 && W.rng.chance(0.7)) continue;
    if (s > bs) { bs = s; best = q; }
  }
  if (!best) return; // no opportunity
  if (isPlayer(best)) { offerTo(best, p, 'affair'); return; }
  const lr = rom(best);
  if (lr.affair) return;
  r.affair = { withId: best.id, since: W.tick, known: false };
  lr.affair = { withId: p.id, since: W.tick, known: false };
  for (const [x, y] of [[p, best], [best, p]]) { const rr = rel(x, y); tag(rr, 'lover'); bump(rr, 'attraction', 0.15); bump(rr, 'affinity', 0.1, -1, 1); mem(x, 'affair', `Began a secret affair with ${full(y)}.`, [y.id], 0.2, 3); }
  moodlet(p, 'illicit', 'Thrilled and guilty', 0.1, 20 * TPD);
  W.stats.affairs = (W.stats.affairs || 0) + 1;
  W.emit('affair', { a: p, b: best });
}
function endAffair(a, b, why) {
  for (const [x, y] of [[a, b], [b, a]]) { const r = rom(x); if (r.affair && r.affair.withId === y.id) r.affair = null; const rr = rel(x, y); untag(rr, 'lover'); }
}
function discover(spouse, cheater, lover, how) {
  const rs = rel(spouse, cheater), rm = rom(spouse), rc = rom(cheater);
  if (rc.affair) rc.affair.known = true;
  const lr = rom(lover); if (lr.affair) lr.affair.known = true;
  rm.sat = clamp(rm.sat - 0.35); bump(rs, 'affinity', -0.4, -1, 1); bump(rs, 'trust', -0.55); bump(rel(spouse, lover), 'affinity', -0.6, -1, 1); tag(rel(spouse, lover), 'enemy');
  moodlet(spouse, 'betrayed', 'Betrayed by spouse', -0.65, 25 * TPD);
  mem(spouse, 'betrayal', `Discovered ${how}, that ${cheater.firstName} had been with ${full(lover)}.`, [cheater.id, lover.id], -1, 5);
  mem(cheater, 'exposed', `${spouse.firstName} found out about ${full(lover)}.`, [spouse.id, lover.id], -0.7, 4);
  cheater.reputation = clamp(cheater.reputation - 0.12, -1, 1); lover.reputation = clamp(lover.reputation - 0.08, -1, 1);
  const cheaterAdult = ageOf(cheater);
  W.chronicle.add({ type: 'scandal', importance: 3, text: W.rng.pick([
    `Scandal! ${full(spouse)} has learned ${how} that ${pr(spouse).p === 'her' ? 'her husband' : 'his wife'} ${full(cheater)} has been meeting ${desc(lover)}.`,
    `The ${cheater.lastName} marriage is the talk of the town: ${full(cheater)}'s affair with ${full(lover)} is out, and ${spouse.firstName} knows.`,
    `${full(cheater)} and ${full(lover)} were found out; ${spouse.firstName} ${spouse.lastName} is said to have thrown ${pr(cheater).p} things into the lane.`]), people: [spouse.id, cheater.id, lover.id] });
  endAffair(cheater, lover);
  W.emit('scandal', { kind: 'affair', spouse, cheater, lover });
  // jealous confrontation
  if (has(spouse, 'hothead') || has(spouse, 'jealous')) { bump(rel(lover, spouse), 'affinity', -0.4, -1, 1); tag(rel(lover, spouse), 'enemy'); }
  // forgive?
  const kids = cheater.family.childrenIds.map(P).filter((k) => k && k.alive && ageOf(k) < 14).length;
  const forgive = clamp(0.42 + 0.3 * spouse.personality.agreeableness - 0.25 * (has(spouse, 'jealous') ? 1 : 0) - 0.15 * (has(spouse, 'hothead') ? 1 : 0) + 0.08 * Math.min(3, kids) + 0.2 * ((spouse.values && spouse.values.tradition) || 0.5) - 0.3 * (spouse.personality.neuroticism - 0.5), 0.05, 0.85);
  if (W.rng.next() < forgive) {
    mem(spouse, 'forgiveness', `Chose to forgive ${cheater.firstName} for the affair.`, [cheater.id], -0.2, 3);
    rm.sat = clamp(rm.sat + 0.12); bump(rs, 'trust', 0.2);
  } else if (!isPlayer(spouse) && W.rng.chance(0.55) && !isPlayer(cheater)) {
    divorce(spouse, cheater, { initiator: spouse, reason: `${cheater.firstName}'s infidelity`, adultery: true });
  } else rm.lowDays += 60;
}
export function divorce(a, b, o = {}) {
  if (a.family.spouseId !== b.id) return false;
  const yrs = ((W.tick - a.romance.sinceTick) / YEAR);
  for (const [x, y] of [[a, b], [b, a]]) {
    x.family.spouseId = null; (x.family.exSpouseIds || (x.family.exSpouseIds = [])).push(y.id);
    x.romance = { partnerId: null, status: null, sinceTick: W.tick };
    const r = rel(x, y); untag(r, 'spouse'); tag(r, 'ex'); bump(r, 'affinity', -0.45, -1, 1); bump(r, 'attraction', -0.3);
    const rm = rom(x); rm.lastBreak = W.tick; rm.lowDays = 0; rm.sat = 0.5;
    if (x.sex === 'F' && x.maidenName && y.sex === 'M' && W.rng.chance(0.7)) x.lastName = x.maidenName;
    x.reputation = clamp(x.reputation - 0.05, -1, 1);
    moodlet(x, 'divorced', 'Marriage ended', x === o.initiator ? -0.25 : -0.5, 45 * TPD);
    mem(x, 'divorce', `My marriage to ${full(y)} ended${o.reason ? ' because of ' + o.reason : ''}.`, [y.id], -0.8, 5);
  }
  // who leaves: the adulterer / initiator-husband; wife keeps young children
  const wife = a.sex === 'F' ? a : b.sex === 'F' ? b : a, hus = wife === a ? b : a;
  let leaver = hus;
  if (o.adultery) leaver = o.initiator === a ? b : a;
  else if (hus.homeId != null && wife.homeId === hus.homeId && wife.family.motherId != null) { const mo = P(wife.family.motherId); if (mo && mo.alive && mo.homeId !== wife.homeId && W.rng.chance(0.6)) leaver = wife; }
  const stay = leaver === a ? b : a;
  let dest = null;
  const par = getParents(leaver).find((x) => x.alive && x.homeId !== leaver.homeId && W.buildings.get(x.homeId) && W.buildings.get(x.homeId).residents.length < 8);
  const vac = findVacantHouse(W, W.buildings.get(leaver.homeId) ? W.buildings.get(leaver.homeId).door : null);
  dest = vac && W.rng.chance(0.55) ? vac : par ? W.buildings.get(par.homeId) : vac;
  if (dest) {
    const moving = [leaver];
    if (leaver === wife) for (const kId of leaver.family.childrenIds) { const k = P(kId); if (k && k.alive && ageOf(k) < 10 && k.homeId === leaver.homeId) moving.push(k); }
    for (const m of moving) relocate(W, m, dest);
  }
  W.stats.divorces = (W.stats.divorces || 0) + 1;
  W.chronicle.add({ type: 'divorce', importance: 3, text: W.rng.pick([
    `After ${Math.max(1, Math.round(yrs))} years, ${full(a)} and ${full(b)} have separated, a rare thing in Hollowmere${o.reason ? ': ' + o.reason : ''}. ${full(leaver)} has left the house.`,
    `The temple elders have granted a divorce to ${full(a)} and ${full(b)}${o.adultery ? ' after the scandal of the affair' : ''}; ${leaver.firstName} has taken ${pr(leaver).p} things and gone.`,
    `The ${hus.lastName} marriage is over: ${wife.firstName} and ${hus.firstName} part after ${Math.max(1, Math.round(yrs))} years${o.reason ? ' on account of ' + o.reason : ''}.`]), people: [a.id, b.id] });
  rumor('divorce', o.initiator || a, null, 3);
  W.emit('divorce', { a, b, aId: a.id, bId: b.id });
  return true;
}

// ------------------------------------------------------------------ death / widowhood
function onDeath(ev) {
  const d = ev.person; if (!d) return;
  const r = rom(d);
  const partner = P(d.romance.partnerId != null ? d.romance.partnerId : d.family.spouseId);
  if (r.affair) { const l = P(r.affair.withId); if (l) { const lr = rom(l); if (lr.affair && lr.affair.withId === d.id) lr.affair = null; } }
  if (!partner || !partner.alive) return;
  const rs = rel(partner, d);
  const status = partner.romance.status;
  const rp = rom(partner);
  if (status === 'married') {
    partner.family.spouseId = null; (partner.family.lateSpouseIds || (partner.family.lateSpouseIds = [])).push(d.id);
    const attach = clamp(0.5 + 0.5 * rs.affinity, 0.2, 1);
    rp.widowedTick = W.tick; rp.grief = Math.round((0.35 + 0.9 * attach) * YEAR * (partner.sex === 'M' && partner.family.childrenIds.some((c) => P(c) && P(c).alive && ageOf(P(c)) < 8) ? 0.6 : 1));
    moodlet(partner, 'widowed', `Mourning ${d.firstName}`, -0.8 * attach - 0.1, 60 * TPD);
    mem(partner, 'bereavement', `${full(d)}, my ${d.sex === 'F' ? 'wife' : 'husband'}, died${d.causeOfDeath ? ' of ' + d.causeOfDeath : ''}.`, [d.id], -1, 5);
    partner.needs.purpose = clamp(partner.needs.purpose - 0.2);
    tag(rs, 'late-spouse');
  } else if (status === 'dating' || status === 'engaged') {
    rp.widowedTick = W.tick; rp.grief = Math.round(0.3 * YEAR);
    moodlet(partner, 'widowed', `Mourning ${d.firstName}`, -0.5, 30 * TPD);
    mem(partner, 'bereavement', `${full(d)}, ${status === 'engaged' ? 'my betrothed' : 'my sweetheart'}, died.`, [d.id], -0.9, 4);
  }
  partner.romance = { partnerId: null, status: null, sinceTick: W.tick };
  const rr = rs; untag(rr, 'partner'); untag(rr, 'betrothed');
  state().weddings = state().weddings.filter((w) => w.a !== d.id && w.b !== d.id);
}

// ------------------------------------------------------------------ daily courtship loop
function singlesPool() {
  const pool = [];
  for (const p of W.living()) if (single(p) && ageOf(p) >= 16 && ageOf(p) < 70) pool.push(p);
  return pool;
}
function courtshipDaily(S) {
  const pool = singlesPool();
  const pool2 = pool.length;
  for (const p of pool) {
    if (isPlayer(p) ) continue; // player seeks love by their own actions; NPCs may still court them via offers
    const a = ageOf(p);
    const rm = rom(p);
    const des = desireOf(p) * ageDesire(a) * (readyForLove(p) ? 1 : 0);
    if (des <= 0.01) continue;
    // 1. meet/notice someone
    const pExp = (0.22 + 0.3 * p.personality.extraversion) * Math.min(1.3, des + 0.2);
    if (pool2 > 1 && W.rng.next() < pExp) {
      let best = null, bt = 0;
      for (let i = 0; i < 4; i++) {
        const c = pool[W.rng.int(0, pool2 - 1)];
        if (c === p || !attractedTo(p, c) || kinBlock(p, c) || !readyForLove(c)) continue;
        const r0 = p.relationships.get(c.id);
        const t = appeal(p, c) * (1 + 0.8 * (r0 ? r0.familiarity : 0));
        if (t > bt) { bt = t; best = c; }
      }
      if (best && bt > 0.12) {
        const r = rel(p, best), r2 = rel(best, p);
        bump(r, 'familiarity', 0.06); bump(r2, 'familiarity', 0.06);
        growAttraction(p, best, 0.09);
        if (attractedTo(best, p)) growAttraction(best, p, 0.05 * (1 + 0.5 * (best.personality.extraversion)));
      }
    }
    // 2. crush formation: strongest attraction among those known
    if (!rm.crush && W.rng.chance(0.12)) {
      let bc = null, bv = 0.52;
      for (const [id, r] of p.relationships) if (r.attraction > bv && r.familiarity > 0.2) { const q = P(id); if (q && q.alive && ageOf(q) >= 16 && attractedTo(p, q) && !kinBlock(p, q) && !(rm.cool[id] > W.tick)) { bv = r.attraction; bc = q; } }
      if (bc) { rm.crush = bc.id; tag(rel(p, bc), 'crush'); if (W.rng.chance(0.3)) mem(p, 'crush', `Cannot stop thinking about ${full(bc)}.`, [bc.id], 0.3, 2); }
    }
    // 3. act on crush
    if (rm.crush) {
      const c = P(rm.crush);
      if (!c || !c.alive || (c.romance.status && c.id !== p.romance.partnerId && !has(p, 'charming'))) { rm.crush = null; continue; }
      const r = rel(p, c);
      if (r.attraction < 0.35) { rm.crush = null; untag(r, 'crush'); continue; }
      r.attraction = Math.max(0, r.attraction - 0.0006); // crushes fade slowly if never acted on
      if (single(c)) {
        const shy = has(p, 'shy') ? 0.35 : 1;
        const bold = (0.25 + 0.5 * p.personality.extraversion + (has(p, 'charming') ? 0.15 : 0)) * shy;
        const eraBias = p.sex === 'F' && c.sex === 'M' ? 0.55 : 1;
        const mutual = rel(c, p).attraction > 0.5 ? 1.8 : 1;
        if (r.attraction > 0.55 && r.familiarity > 0.3 && W.rng.next() < 0.055 * bold * eraBias * mutual * (des + 0.3)) askOut(p, c);
      }
    }
  }
}
function datingDaily() {
  for (const a of W.living()) {
    const st = a.romance.status;
    if (st !== 'dating' && st !== 'engaged') continue;
    const b = P(a.romance.partnerId);
    if (!b || !b.alive) { a.romance = { partnerId: null, status: null, sinceTick: W.tick }; continue; }
    if (a.id > b.id) continue; // process each couple once
    const ra = rel(a, b), rb = rel(b, a);
    for (const [x, y, r] of [[a, b, ra], [b, a, rb]]) { bump(r, 'familiarity', 0.002); bump(r, 'affinity', 0.008 + 0.006 * (appeal(x, y) - 0.4), -1, 1); bump(r, 'attraction', 0.001 * (appeal(x, y) - 0.35)); }
    const dur = (W.tick - a.romance.sinceTick) / TPD;
    const lowA = Math.min(ra.affinity, rb.affinity), lowT = Math.min(ra.attraction, rb.attraction);
    // breakup
    const jealousy = (has(a, 'jealous') || has(b, 'jealous') ? 0.0015 : 0);
    const pb = (st === 'engaged' ? 0.0004 : 0.0014) + (lowA < 0.08 ? 0.006 : 0) + (lowT < 0.4 ? 0.005 : 0) + jealousy;
    if (!isPlayer(a) && !isPlayer(b) && W.rng.next() < pb) { breakUp(a, b, { reason: W.rng.pick(['a growing coolness', 'a quarrel that would not mend', 'differing ambitions', 'a jealous scene', 'his family\'s disapproval', 'a wandering eye']).replace('his', W.rng.chance(0.5) ? 'his' : 'her') }); continue; }
    if (st === 'dating' && dur >= 28 && !isPlayer(a) && !isPlayer(b)) {
      const minAge = Math.min(ageOf(a), ageOf(b));
      if (minAge < 17.5 || (a.sex === 'M' ? a.money : b.money) < 0) continue;
      if (ra.attraction < 0.5 || rb.attraction < 0.5 || lowA < 0.2) continue;
      let pp = 0.022 * (0.5 + Math.min(ra.affinity, rb.affinity) + (a.pregnant || b.pregnant ? 5 : 0));
      const ag = Math.max(ageOf(a), ageOf(b)); if (ag > 35) pp *= 0.7; if (ag < 20) pp *= 0.6;
      pp *= (a.values ? 0.6 + a.values.family * 0.8 : 1);
      if (W.rng.next() < pp) {
        const proposer = a.sex === b.sex ? (ra.attraction >= rb.attraction ? a : b) : (W.rng.chance(0.92) ? (a.sex === 'M' ? a : b) : (a.sex === 'F' ? a : b));
        propose(proposer, proposer === a ? b : a);
      }
    }
    // wandering eye / jealousy covered in conversation events
  }
}
function widowsLog() {}

// ------------------------------------------------------------------ conversation hook (flirting etc.)
const CONV_GAIN = { greeting: 0.002, smalltalk: 0.005, deep: 0.014, joke: 0.011, comfort: 0.012, gossip: 0.004, flirt: 0.045, argue: -0.012, complain: -0.002, apologize: 0.004 };
function onConversation(ev) {
  const a = P(ev.a), b = P(ev.b); if (!a || !b || !a.alive || !b.alive) return;
  if (ageOf(a) < 16 || ageOf(b) < 16) return;
  const g = CONV_GAIN[ev.type] ?? 0.003, q = ev.quality == null ? 0.3 : ev.quality;
  if (a.romance.partnerId === b.id) return;
  const drunkBoost = ev.drunk ? 1.4 : 1;
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!attractedTo(x, y) || kinBlock(x, y)) continue;
    const taken = !!x.romance.status && x.romance.partnerId !== y.id;
    if (taken && !(rom(x).affair || has(x, 'charming') || x.personality.conscientiousness < 0.4)) continue;
    growAttraction(x, y, g * (0.6 + q) * drunkBoost * (taken ? 0.5 : 1));
    // jealous partner notices flirting
    if (ev.type === 'flirt' && taken && ev.type === 'flirt') {
      const sp = P(x.romance.partnerId);
      if (sp && sp.alive && W.rng.chance(has(sp, 'jealous') ? 0.4 : 0.1)) {
        bump(rel(sp, x), 'affinity', -0.04, -1, 1); bump(rel(sp, y), 'affinity', -0.1, -1, 1); moodlet(sp, 'jealous', `Jealous of ${y.firstName}`, -0.22, 2 * TPD);
        rom(sp).sat = clamp(rom(sp).sat - 0.02);
        mem(sp, 'jealousy', `Saw ${x.firstName} flirting with ${full(y)}.`, [x.id, y.id], -0.5, 2);
      }
    }
    // on flirt, a smitten single may seize the moment
    if (ev.type === 'flirt' && single(x) && single(y) && !isPlayer(x) && readyForLove(x) && readyForLove(y)) {
      const r = rel(x, y);
      if (r.attraction > 0.5 && rel(y, x).attraction > 0.4 && W.rng.chance(0.1 * (has(x, 'shy') ? 0.4 : 1))) { askOut(x, y); return; }
    }
  }
}

// ------------------------------------------------------------------ interventions
function resolve(x) { return x == null ? null : typeof x === 'object' ? x : P(x); }
function registerInterventions(world) {
  if (!world.registerIntervention) return;
  const reg = (kind, desc, fn) => { fn.description = desc; world.registerIntervention(kind, fn, desc); };
  reg('matchmake', 'Force mutual attraction between two people. params: {a, b, date=false, marry=false}; random compatible singles if omitted.', (w, params = {}) => {
    let a = resolve(params.a), b = resolve(params.b);
    if (!a || !b) {
      const s = w.rng.shuffle(w.living().filter((p) => single(p) && ageOf(p) >= 18 && ageOf(p) < 40));
      outer: for (const x of s) for (const y of s) if (x !== y && attractedTo(x, y) && attractedTo(y, x) && !kinBlock(x, y)) { a = x; b = y; break outer; }
    }
    if (!a || !b) return null;
    for (const [x, y] of [[a, b], [b, a]]) { const r = rel(x, y); r.attraction = Math.max(r.attraction, 0.85); bump(r, 'familiarity', 0.4); bump(r, 'affinity', 0.3, -1, 1); tag(r, 'crush'); }
    if (params.marry && single(a) && single(b)) { startDating(a, b); engage(a, b); } else if (params.date && single(a) && single(b)) startDating(a, b, { chronicle: true });
    else if (single(a)) rom(a).crush = b.id;
    W.chronicle.add({ type: 'romance', importance: 2, text: `A mutual, sudden attraction has seized ${full(a)} and ${full(b)}; the town is watching with interest.`, people: [a.id, b.id] });
    return { a: a.id, b: b.id };
  });
  reg('loveTriangle', 'Create a love triangle. params: {a (the desired), b (their partner), c (the rival)}; c falls hard for a.', (w, params = {}) => {
    let a = resolve(params.a), b = resolve(params.b), c = resolve(params.c);
    const adults = w.living().filter((p) => ageOf(p) >= 18 && ageOf(p) < 50);
    if (!a) a = w.rng.pick(adults.filter((p) => p.romance.status || single(p)));
    if (!a) return null;
    if (!b) b = P(a.romance.partnerId) || w.rng.pick(adults.filter((p) => p !== a && single(p) && attractedTo(a, p) && attractedTo(p, a) && !kinBlock(a, p)));
    if (!b) return null;
    if (single(a) && single(b)) { for (const [x, y] of [[a, b], [b, a]]) { const r = rel(x, y); r.attraction = Math.max(r.attraction, 0.8); bump(r, 'familiarity', 0.4); } startDating(a, b); }
    if (!c) c = w.rng.pick(adults.filter((p) => p !== a && p !== b && single(p) && attractedTo(p, a) && !kinBlock(p, a)));
    if (!c) return null;
    const rc = rel(c, a); rc.attraction = 0.95; bump(rc, 'familiarity', 0.5); tag(rc, 'crush');
    const ra = rel(a, c); ra.attraction = Math.max(ra.attraction, 0.6); bump(ra, 'familiarity', 0.3);
    rom(c).crush = a.id;
    bump(rel(c, b), 'affinity', -0.4, -1, 1); tag(rel(c, b), 'rival'); bump(rel(b, c), 'affinity', -0.2, -1, 1);
    mem(c, 'crush', `Hopelessly in love with ${full(a)}, who belongs to ${full(b)}.`, [a.id, b.id], 0.3, 4);
    W.chronicle.add({ type: 'romance', importance: 3, text: `Whispers say ${full(c)} has set ${pr(c).p} heart on ${full(a)}, who is promised to ${full(b)}; trouble is brewing.`, people: [a.id, b.id, c.id] });
    return { a: a.id, b: b.id, c: c.id };
  });
}

// ------------------------------------------------------------------ player-facing API
export function respondToOffer(world, player, fromId, accept) {
  const p = resolve(player), r = rom(p), from = P(fromId);
  const i = r.offers.findIndex((o) => o.from === fromId);
  if (i < 0 || !from) return false;
  const o = r.offers.splice(i, 1)[0];
  if (!accept) { mem(from, 'rejection', `${full(p)} turned down my ${o.kind}.`, [p.id], -0.6, 3); bump(rel(from, p), 'attraction', -0.2); return true; }
  if (o.kind === 'date') startDating(from, p);
  else if (o.kind === 'proposal' && from.romance.partnerId === p.id) engage(from, p);
  else if (o.kind === 'affair') { rom(p).affair = { withId: from.id, since: W.tick, known: false }; rom(from).affair = { withId: p.id, since: W.tick, known: false }; }
  return true;
}

// ------------------------------------------------------------------ system
export default {
  name: 'romance',
  actions: [
    { id: 'wedding', label: 'Attending a wedding', score: () => 0, duration: (w, p, b, ca) => (ca && ca.data && ca.data.duration) || 22, interruptible: false, perTick: { social: 0.004, fun: 0.004 }, thought: (w, p) => 'At the wedding.' },
  ],
  scoreModifiers: [
    (world, p, def, score) => {
      if (!p.romance || p.romance.status || (def.id !== 'socialize' && def.id !== 'tavern' && def.id !== 'relax_park')) return score;
      const a = world.ageOf(p);
      return a >= 16 && a < 34 ? score * 1.12 : score;
    },
  ],
  init(world) {
    W = world;
    world.romanceState = { weddings: [] };
    world.romance = { startDating, propose, engage, marry, finalizeWedding, breakUp, divorce, respondToOffer, appeal, orient, single };
    for (const p of world.people.values()) {
      if (!p.ext) p.ext = {};
      orient(p); desireOf(p);
      if (p.romance && p.romance.status === 'married' && p.family.spouseId != null) { const r = rom(p); const rs = p.relationships.get(p.family.spouseId); r.sat = clamp(0.55 + 0.3 * (rs ? rs.affinity : 0.5) + world.rng.gauss(0, 0.1), 0.2, 0.95); }
    }
    world.on('birth', (ev) => { if (ev.child) { if (!ev.child.ext) ev.child.ext = {}; orient(ev.child); } });
    world.on('death', onDeath);
    world.on('conversation', onConversation);
    registerInterventions(world);
  },
  onHour(world) { W = world; processWeddings(); },
  onDay(world) {
    W = world;
    for (const p of world.living()) { if (!p.orientation) orient(p); }
    courtshipDaily();
    datingDaily();
    for (const p of world.living()) if (p.romance.status === 'married') marriageDaily(p);
    // keep romance fields coherent after outside changes (e.g. migration, edits)
    for (const p of world.living()) {
      if (p.romance.status === 'married' && (p.family.spouseId == null || !P(p.family.spouseId) || !P(p.family.spouseId).alive)) { p.romance = { partnerId: null, status: null, sinceTick: world.tick }; }
      // age out of limbo: expire stale offers
      if (p.ext.rom && p.ext.rom.offers.length) p.ext.rom.offers = p.ext.rom.offers.filter((o) => world.tick - o.tick < 14 * TPD);
    }
  },
};
