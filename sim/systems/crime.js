// Crime & justice: motives (poverty, greed, grudges, drink), opportunity, witnesses, the watch, trials, jail, revenge.
// Pure sim code: world.rng only. Rates target a few offences a year per few hundred people; murder is very rare.
import { BUILDING_TYPES } from '../map.js';

const DAY = 144;
const KINDS = ['theft', 'burglary', 'fraud', 'assault', 'manslaughter', 'murder'];
const SEVERITY = { theft: 1, fraud: 2, burglary: 3, assault: 2, manslaughter: 4, murder: 5 };
const K_RATE = 0.015; // per-person daily attempt probability scale (times motive^2); tuned for ~1 offence / 40-80 people / year

const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'a stranger');
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const he = (p) => (p.sex === 'F' ? 'she' : 'he');
const his = (p) => (p.sex === 'F' ? 'her' : 'his');
const him = (p) => (p.sex === 'F' ? 'her' : 'him');
const age = (w, p) => w.ageOf(p);
const has = (p, t) => p.traits.includes(t);
const bn = (b) => (b ? b.name || BUILDING_TYPES[b.type]?.label || b.type : 'the street');

function C(w) { return w.crime; }
function pc(p) { if (!p.crime) p.crime = { motive: 0, convictions: 0, grudges: {}, lastCrimeDay: -999, arrests: 0 }; return p.crime; }
function jailed(w, p) { return (p.jailedUntil || 0) > w.tick; }
function jailBuilding(w) { return w.buildingsOfType('jail')[0] || null; }
function isPlayer(w, p) { return w.player != null && w.player === p.id; }
function townName(w) { return w.town?.name || 'the town'; }
function chron(w, type, importance, text, people, buildingId) { return w.chronicle.add({ type, importance, text, people: people.filter((x) => x != null), buildingId }); }
function mood(w, p, id, label, v, days) { if (w.addMoodlet) w.addMoodlet(p, { id, label, value: v, untilTick: w.tick + days * DAY }); }
function night(w) { const h = w.time.hour; return h >= 22 || h < 5; }

// ------------------------------------------------------------------ motive
function motiveOf(w, p) {
  const a = age(w, p); if (a < 15) return 0;
  const P = p.personality, c = pc(p), ec = p.econ || {};
  let poverty = 0;
  const hungry = p.needs.hunger < 0.35;
  if ((p.money || 0) < 6) poverty += 0.25;
  if ((p.debt || 0) > 60) poverty += 0.15 + Math.min(0.25, (p.debt - 60) / 400);
  if ((p.inventory.food || 0) < 1 && hungry) poverty += 0.3;
  if ((ec.unempDays || 0) > 20 && p.job === 'unemployed') poverty += 0.15;
  poverty = clamp(poverty, 0, 0.9);
  let m = poverty * 0.9;
  m += (1 - P.conscientiousness) * 0.1 + (1 - P.agreeableness) * 0.1 + P.neuroticism * 0.03;
  if (has(p, 'greedy')) m += 0.2; if (has(p, 'thief')) m += 0.35; if (has(p, 'jealous')) m += 0.06; if (has(p, 'hothead')) m += 0.06; if (has(p, 'drunkard')) m += 0.07;
  if (has(p, 'honest')) m -= 0.28; if (has(p, 'kind')) m -= 0.1; if (has(p, 'pious')) m -= 0.12;
  if (p.sex === 'M' && a < 35) m += 0.06; if (a > 55) m -= 0.12;
  if (p.mood < -0.4) m += 0.05;
  m += Math.min(0.15, c.convictions * 0.05); // recidivism
  m -= 0.15 + 0.2 * P.conscientiousness; // restraint
  if (p.family.spouseId != null && !hungry) m -= 0.05;
  m *= C(w).waveUntil > w.tick ? C(w).waveMult : 1;
  return clamp(m, 0, 1);
}

// ------------------------------------------------------------------ witnesses / consequences
function peopleAround(w, p, r = 7) {
  const out = [];
  if (p.locationId != null) { const b = w.buildings.get(p.locationId); if (b) for (const q of b.occupants) if (q !== p && q.alive) out.push(q); }
  else for (const q of w.peopleNear(p.x, p.y, r)) if (q !== p && q.alive) out.push(q);
  return out;
}
function witnessesAt(w, perp, victim, x, y, indoorB) {
  const out = []; const dark = night(w);
  const pool = indoorB ? [...indoorB.occupants].filter((q) => q.alive) : w.peopleNear(x, y, 8);
  for (const q of pool) {
    if (q === perp || q === victim || !q.alive || age(w, q) < 8) continue;
    const ch = (dark ? 0.3 : 0.62) + (indoorB ? 0.1 : 0) + 0.2 * (q.genes?.intellect ?? 0.5) - 0.2;
    if (w.rng.chance(clamp(ch, 0.1, 0.9))) out.push(q);
  }
  return out.slice(0, 8);
}
function sourFor(w, victim, perp, k) {
  // victim's feelings toward the perpetrator crash; the injured party's kin are angered too
  const r = w.getRel(victim, perp);
  r.affinity = clamp(r.affinity - 0.35 * k, -1, 1); r.trust = clamp(r.trust - 0.4 * k, 0, 1); r.respect = clamp(r.respect - 0.25 * k, -1, 1);
  if (k >= 1 && !r.tags.includes('enemy')) r.tags.push('enemy');
  const c = pc(victim); c.grudges[perp.id] = clamp((c.grudges[perp.id] || 0) + 0.35 * k + 0.15, 0, 1);
}
function kinGrudge(w, victim, perp, k) {
  const kin = [victim.family.spouseId, victim.family.fatherId, victim.family.motherId, ...victim.family.childrenIds, ...(victim.family.siblingIds || [])];
  for (const id of kin) { const q = id != null ? w.people.get(id) : null; if (!q || !q.alive || q === perp) continue; const r = w.getRel(q, perp); r.affinity = clamp(r.affinity - 0.2 * k, -1, 1); const c = pc(q); c.grudges[perp.id] = clamp((c.grudges[perp.id] || 0) + 0.25 * k, 0, 1); }
}

// ------------------------------------------------------------------ commit a crime (also usable by a player-controlled character)
function commitCrime(w, perp, kind, victim, opts = {}) {
  const S = C(w), c = pc(perp);
  const bId = opts.buildingId ?? perp.locationId ?? null;
  const bld = bId != null ? w.buildings.get(bId) : null;
  const where = bld ? bn(bld) : 'the street';
  const wit = opts.witnesses || witnessesAt(w, perp, victim, perp.x, perp.y, bld && !bld.open ? bld : null);
  let loss = opts.loss || 0, injury = 0, dead = false;
  const rng = w.rng;
  if (kind === 'theft' || kind === 'burglary' || kind === 'fraud') {
    if (!loss) loss = Math.min(victim.money * rng.float(0.1, kind === 'fraud' ? 0.5 : 0.4), kind === 'burglary' ? 140 : kind === 'fraud' ? 160 : 45);
    loss = Math.max(2, Math.round(loss));
    loss = Math.min(loss, Math.max(0, Math.round(victim.money)));
    victim.money -= loss; perp.money = (perp.money || 0) + loss;
    if (kind === 'burglary') { const f = Math.min(victim.inventory.food || 0, rng.int(0, 3)); victim.inventory.food -= f; perp.inventory.food = (perp.inventory.food || 0) + f; }
  } else {
    injury = opts.severity ?? rng.float(0.2, 0.9);
    victim.health = clamp(victim.health - (0.08 + 0.3 * injury), 0.02, 1);
    if (kind === 'murder' || (opts.lethalChance && rng.chance(opts.lethalChance * injury))) dead = true;
    if (dead && kind !== 'murder') kind = 'manslaughter';
  }
  // recognised by someone?
  let recog = wit.filter((q) => w.getRel(q, perp).familiarity > 0.12 || rng.chance(0.5));
  const victimSaw = kind === 'assault' || kind === 'murder' || kind === 'manslaughter' || kind === 'fraud' || (kind === 'theft' && rng.chance(0.3)) || (kind === 'burglary' && rng.chance(0.1));
  const known = victimSaw || recog.length > 0;
  const cs = {
    id: S.nextCase++, kind, perpId: perp.id, victimId: victim.id, tick: w.tick, day: w.time.totalDays, buildingId: bId, where, loss, injury,
    witnessIds: recog.map((q) => q.id), knownPerp: known, evidence: 0, suspectId: known ? perp.id : null, status: 'open', reported: false, motive: opts.motive || null, revenge: !!opts.revenge,
  };
  cs.evidence = known ? clamp(0.12 + 0.13 * recog.length + (victimSaw ? 0.2 : 0), 0, 0.8) : 0;
  c.lastCrimeDay = w.time.totalDays;
  S.cases.set(cs.id, cs); S.openIds.add(cs.id); S.counts[kind] = (S.counts[kind] || 0) + 1; S.yearCounts[kind] = (S.yearCounts[kind] || 0) + 1;
  // the perpetrator's own mind
  const gThief = kind === 'assault' ? 'lashed out at' : kind === 'burglary' ? 'broke into the house of' : kind === 'fraud' ? 'swindled' : kind === 'theft' ? 'stole from' : 'killed';
  w.addMemory(perp, { type: 'crime', text: `${gThief[0].toUpperCase() + gThief.slice(1)} ${nm(victim)}${loss ? ` (${loss} crowns)` : ''} at ${where}.`, otherIds: [victim.id], weight: dead ? -0.9 : -0.3, importance: dead ? 5 : 3 });
  mood(w, perp, 'guilt', 'Guilty conscience', -0.06 - 0.12 * perp.personality.neuroticism - (has(perp, 'honest') ? 0.1 : 0), 6);
  if (perp.personality.agreeableness > 0.55 || has(perp, 'kind') || has(perp, 'pious')) perp.needs.comfort = Math.max(0, perp.needs.comfort - 0.08);
  // victim and witnesses
  const vtxt = { theft: `Had ${loss} crowns stolen at ${where}.`, burglary: `Came home to find the house broken into at ${where}; ${loss} crowns and goods gone.`, fraud: `Was cheated out of ${loss} crowns by ${known ? nm(perp) : 'a smooth talker'}.`, assault: `Was beaten at ${where}${known ? ' by ' + nm(perp) : ''}.`, manslaughter: `Died in a brawl.`, murder: `Was murdered.` }[kind];
  if (!dead) {
    w.addMemory(victim, { type: 'victim', text: vtxt, otherIds: known ? [perp.id] : [], weight: -0.4 - 0.15 * SEVERITY[kind], importance: Math.min(5, 2 + (SEVERITY[kind] >> 1)) });
    mood(w, victim, 'victim', kind === 'assault' ? 'Shaken after being attacked' : 'Violated by a crime', -0.1 - 0.05 * SEVERITY[kind], 8 + 4 * SEVERITY[kind]);
    if (known) { sourFor(w, victim, perp, 0.5 + 0.2 * SEVERITY[kind]); if (kind === 'assault') kinGrudge(w, victim, perp, 0.6); }
    else {
      // suspicion: a victim with an enemy tends to blame them
      const foes = [...victim.relationships].filter(([id, r]) => r.affinity < -0.35 && w.people.get(id)?.alive).map(([id]) => id);
      if (foes.length && rng.chance(0.5)) { cs.suspectId = rng.pick(foes); cs.falseSuspicion = true; cs.evidence = 0.12; }
    }
    victim.reputation = clamp(victim.reputation, -1, 1);
  }
  for (const q of wit) {
    const sawIt = recog.includes(q);
    w.addMemory(q, { type: 'witness', text: sawIt ? `Saw ${nm(perp)} ${kind === 'assault' ? 'attack ' + nm(victim) : kind === 'theft' ? 'lift ' + nm(victim) + "'s purse" : kind === 'burglary' ? 'slipping out of ' + nm(victim) + "'s house" : 'in the middle of a crime'} at ${where}.` : `Saw a scuffle at ${where} but could not say who it was.`, otherIds: sawIt ? [perp.id, victim.id] : [victim.id], weight: -0.3, importance: sawIt ? 3 : 2 });
    if (sawIt) { const r = w.getRel(q, perp); r.affinity = clamp(r.affinity - 0.12 * SEVERITY[kind], -1, 1); r.trust = clamp(r.trust - 0.15, 0, 1); }
  }
  // the wider world: social turns known crimes into rumours
  w.emit('crime', { kind, perpetrator: perp.id, perpId: perp.id, victim: victim.id, victimId: victim.id, buildingId: bId, known, caseId: cs.id, loss, dead, tick: w.tick });
  if (cs.falseSuspicion) { const sus = w.people.get(cs.suspectId); if (sus && rng.chance(0.6)) w.emit('scandal', { person: sus.id, kind: 'crime', truth: false, text: `is said to be behind the ${kind} against ${nm(victim)}` }); }
  // consequences of a death
  if (dead) {
    if (kind === 'murder' || kind === 'manslaughter') { kinGrudge(w, victim, perp, 1.6); for (const id of [victim.family.spouseId, ...victim.family.childrenIds]) { const q = id != null ? w.people.get(id) : null; if (q && q.alive && known) { const r = w.getRel(q, perp); r.affinity = -1; r.trust = 0; if (!r.tags.includes('enemy')) r.tags.push('enemy'); } } }
    w.killPerson(victim, kind === 'murder' ? 'murdered' : 'killed in a brawl');
  }
  // chronicle: how the town hears of it
  const plc = bld ? `at ${where}` : 'in the streets';
  let text, imp = 2;
  const vn = nm(victim);
  if (kind === 'murder') { imp = 5; text = rng.pick([`${vn} was found dead ${plc} with marks of violence. The watch is treating it as murder.`, `Murder in ${townName(w)}: ${vn} was struck down ${plc}. The whole town is shaken.`]); }
  else if (kind === 'manslaughter') { imp = 5; text = rng.pick([`${vn} died of wounds taken in a brawl ${plc}${known ? ', and ' + nm(perp) + ' is named as the man who struck the blow' : ''}.`, `A fight ${plc} ended in death: ${vn} did not survive the night.`]); }
  else if (kind === 'assault') { imp = loss === 0 && injury > 0.7 ? 3 : 2; text = known ? rng.pick([`${nm(perp)} knocked ${vn} down ${plc}${opts.revenge ? ' in revenge for an old wrong' : opts.motive ? ' ' + opts.motive : ''}; ${vn} was left bruised and bleeding.`, `Blows were exchanged ${plc} between ${nm(perp)} and ${vn}; ${vn} came off worse.`, `${nm(perp)} attacked ${vn} ${plc}${opts.motive ? ' ' + opts.motive : ''}.`]) : `${vn} was set upon in the dark ${plc} by someone unseen.`; }
  else if (kind === 'burglary') { imp = loss > 80 ? 3 : 2; text = rng.pick([`Thieves broke into the house of ${vn} (${where}) while the family was out and made off with ${loss} crowns and goods.`, `${vn}'s home was ransacked while the house stood empty; about ${loss} crowns are gone.`, `A burglary was reported by ${vn}: the door forced, ${loss} crowns missing.`]); }
  else if (kind === 'fraud') { imp = loss > 80 ? 3 : 2; text = rng.pick([`${vn} says ${he(victim)} was swindled out of ${loss} crowns in a dubious deal${known ? ' with ' + nm(perp) : ''}.`, `A sharp bargain ${plc}: ${vn} was cheated of ${loss} crowns and wants the watch to look into it.`]); }
  else { imp = loss > 30 ? 3 : 1; text = rng.pick([`A cutpurse relieved ${vn} of ${loss} crowns ${plc}.`, `${vn} had ${loss} crowns lifted from ${his(victim)} pocket ${plc}.`, `Petty theft ${plc}: ${vn} is ${loss} crowns the poorer.`]); }
  chron(w, kind === 'theft' || kind === 'burglary' || kind === 'fraud' ? 'theft' : 'crime', imp, text, dead ? [victim.id] : [victim.id], bId ?? undefined);
  // reporting
  const reportP = { theft: 0.7, burglary: 0.9, fraud: 0.6, assault: 0.55, manslaughter: 1, murder: 1 }[kind] * (loss && loss < 8 ? 0.5 : 1);
  if (dead || rng.chance(reportP)) { cs.reported = true; cs.reportDay = w.time.totalDays + (kind === 'fraud' ? rng.int(2, 8) : 0); }
  else cs.status = 'unreported';
  if (cs.status === 'unreported') S.openIds.delete(cs.id);
  return cs;
}

// ------------------------------------------------------------------ attempts
function pickVictimNear(w, p, wantMoney) {
  const pool = peopleAround(w, p).filter((q) => q.alive && !jailed(w, q) && age(w, q) >= 12 && (!wantMoney || q.money > 8));
  if (!pool.length) return null;
  const wts = pool.map((q) => 1 + Math.max(0, q.money) / 30 - Math.max(0, w.relScore(p, q)) * 0.7);
  return w.rng.weighted(pool, wts.map((x) => Math.max(0.05, x)));
}
function tryTheft(w, p) {
  const v = pickVictimNear(w, p, true); if (!v) return false;
  const cn = peopleAround(w, p, 6).length;
  if (cn < 2 && w.rng.chance(0.5)) return false;
  if (w.relScore(p, v) > 0.4 && w.rng.chance(0.7)) return false; // won't rob a friend
  commitCrime(w, p, 'theft', v, { motive: 'poverty' }); return true;
}
function tryBurglary(w, p) {
  const houses = []; const all = w.buildingsOfType('house');
  for (let i = 0; i < 14; i++) { const h = w.rng.pick(all); if (!h || h.id === p.homeId || h.occupants.size > 0 || !h.residents.length) continue; houses.push(h); }
  if (!houses.length) return false;
  let best = null, bm = -1;
  for (const h of houses) { const o = w.people.get(h.ownerId) || w.people.get(h.residents[0]); if (!o || !o.alive) continue; const m = o.money + w.rng.float(0, 30); if (m > bm) { bm = m; best = { h, o }; } }
  if (!best || bm < 15) return false;
  const x = best.h.door.x, y = best.h.door.y;
  const wit = witnessesAt(w, p, best.o, x, y, null);
  commitCrime(w, p, 'burglary', best.o, { buildingId: best.h.id, witnesses: wit, motive: 'greed' }); return true;
}
function tryFraud(w, p) {
  const cands = [];
  let i = 0; for (const [id, r] of p.relationships) { if (i++ > 24) break; const q = w.people.get(id); if (q && q.alive && q.money > 50 && r.familiarity > 0.2 && r.trust > 0.3 && !jailed(w, q) && age(w, q) >= 18) cands.push(q); }
  if (!cands.length) return false;
  const v = w.rng.pick(cands);
  commitCrime(w, p, 'fraud', v, { witnesses: [], motive: 'greed' }); return true;
}
function tryAssault(w, p, v, motive, revenge, lethal = 0.012) {
  if (!v || !v.alive || jailed(w, v)) return false;
  const sev = clamp(w.rng.float(0.2, 0.8) + (has(p, 'hothead') ? 0.15 : 0) + (revenge ? 0.1 : 0), 0.1, 1);
  const dangerous = pc(p).grudges[v.id] > 0.85 && has(p, 'hothead') && p.personality.agreeableness < 0.35 && p.mood < 0.1;
  const kind = dangerous && w.rng.chance(0.12) ? 'murder' : 'assault';
  commitCrime(w, p, kind, v, { motive, revenge, severity: sev, lethalChance: lethal });
  return true;
}
function attemptCrime(w, p) {
  const c = pc(p); const poor = (p.money || 0) < 8 || (p.debt || 0) > 60;
  const greed = (has(p, 'greedy') ? 0.6 : 0) + (has(p, 'thief') ? 1.2 : 0);
  const dark = night(w);
  const fraudOk = p.job === 'merchant' || p.job === 'tavernkeeper' || p.job === 'innkeeper' || has(p, 'charming') || p.genes.intellect > 0.7;
  const W = [['theft', 1 + (poor ? 2.5 : 0) + greed + (dark ? -0.5 : 0.4)], ['burglary', (dark ? 0.8 : 0.35) + (poor ? 2 : 0) + greed * 1.3 + (p.sex === 'M' ? 0.3 : 0)], ['fraud', fraudOk ? 0.5 + greed + p.genes.intellect : 0]];
  const pick = w.rng.weighted(W, (x) => Math.max(0.01, x[1]));
  if (pick[0] === 'theft') return tryTheft(w, p);
  if (pick[0] === 'burglary') return tryBurglary(w, p);
  return tryFraud(w, p);
}

// ------------------------------------------------------------------ justice
function guardsFor(w) {
  const jl = jailBuilding(w); let n = 0, sk = 0;
  for (const id of jl ? jl.employees : []) { const g = w.people.get(id); if (g && g.alive && (g.job === 'guard' || g.job === 'captain')) { n++; sk += g.skills.athletics || 0.3; } }
  return { n, skill: n ? sk / n : 0.3 };
}
function arrest(w, p, cs, how) {
  const c = pc(p); c.arrests++; cs.status = 'arrested'; cs.arrestDay = w.time.totalDays; cs.trialDay = w.time.totalDays + w.rng.int(2, 5); cs.accusedId = p.id;
  p.jailedUntil = w.tick + (cs.trialDay - w.time.totalDays + 1) * DAY; C(w).jailed.add(p.id);
  const v = w.people.get(cs.victimId); const cap = jailBuilding(w)?.employees.map((i) => w.people.get(i)).find((g) => g && g.alive && g.job === 'captain');
  w.addMemory(p, { type: 'arrest', text: `Was arrested by the watch ${how}, accused of ${cs.kind} against ${nm(v)}.`, otherIds: v ? [v.id] : [], weight: -0.8, importance: 4 });
  mood(w, p, 'arrested', 'Under arrest', -0.3, 10);
  const jb = jailBuilding(w); if (jb && w.forceAction) w.forceAction(p, 'serveSentence', jb.id, { why: 'held by the watch awaiting trial' });
  const imp = SEVERITY[cs.kind] >= 4 ? 4 : 3;
  chron(w, 'arrest', imp, `${nm(p)} was taken into custody ${how}, accused of ${cs.kind === 'theft' ? 'theft' : cs.kind === 'burglary' ? 'burglary' : cs.kind === 'fraud' ? 'fraud' : cs.kind === 'assault' ? 'assault' : cs.kind} against ${nm(v)}${cap ? `. Captain ${cap.lastName} says the town's watch will see justice done` : ''}.`, [p.id, v?.id], jb?.id);
  w.emit('arrest', { person: p, caseId: cs.id });
}
function investigate(w) {
  const S = C(w), g = guardsFor(w);
  const sk = 0.6 + g.skill;
  for (const id of [...S.openIds]) {
    const cs = S.cases.get(id); if (!cs || cs.status !== 'open') { S.openIds.delete(id); continue; }
    if (!cs.reported || (cs.reportDay ?? 0) > w.time.totalDays) continue;
    const day = w.time.totalDays; if (day - cs.day > 45) { cs.status = 'unsolved'; S.openIds.delete(id); S.unsolved++; if (SEVERITY[cs.kind] >= 3 && w.rng.chance(0.4)) chron(w, 'crime', 2, `The watch has given up looking for whoever ${cs.kind === 'burglary' ? 'broke into the house of' : 'attacked'} ${nm(w.people.get(cs.victimId))}; the case is closed with no arrest.`, [cs.victimId]); continue; }
    const perp = w.people.get(cs.perpId); const sus = w.people.get(cs.suspectId);
    if (!g.n && w.rng.chance(0.6)) continue;
    if (cs.knownPerp) {
      cs.evidence = clamp(cs.evidence + 0.05 * sk * w.rng.float(0.5, 1.5) + 0.04 * cs.witnessIds.length, 0, 1);
      if (perp && perp.alive && !jailed(w, perp) && cs.evidence > 0.3 && w.rng.chance(0.3 + 0.4 * sk * 0.6)) arrest(w, perp, cs, cs.witnessIds.length ? `on the word of ${cs.witnessIds.length > 1 ? cs.witnessIds.length + ' witnesses' : 'a witness'}` : 'on the victim\'s complaint');
    } else {
      // no one saw the culprit: the watch looks at the usual suspects
      if (!w.rng.chance(0.07 * sk)) continue;
      let s = sus;
      if (!s || !s.alive || w.rng.chance(0.2)) {
        const pool = w.living().filter((q) => age(w, q) >= 15 && !jailed(w, q) && q.id !== cs.victimId);
        const sc = (q) => (q === perp ? 0.6 : 0) + (pc(q).convictions * 0.8) + (has(q, 'thief') ? 1 : 0) + ((q.money || 0) < 6 ? 0.4 : 0) + Math.max(0, -q.reputation) * 1.5 + (pc(q).lastCrimeDay > w.time.totalDays - 20 ? 0.5 : 0);
        let best = null, bs = -1; for (let i = 0; i < 12; i++) { const q = w.rng.pick(pool); if (!q) break; const v = sc(q) + w.rng.float(0, 0.3); if (v > bs) { bs = v; best = q; } }
        s = best;
      }
      if (s && !jailed(w, s)) { cs.suspectId = s.id; cs.evidence = clamp(0.28 + (s === perp ? 0.28 : 0) + w.rng.float(0, 0.12), 0, 0.8); if (cs.evidence > 0.38 && w.rng.chance(0.55)) arrest(w, s, cs, 'as the likeliest suspect'); }
    }
  }
}
function trial(w, cs) {
  const S = C(w), rng = w.rng;
  const acc = w.people.get(cs.accusedId), v = w.people.get(cs.victimId);
  S.openIds.delete(cs.id);
  if (!acc || !acc.alive) { cs.status = 'closed'; return; }
  const guilty = acc.id === cs.perpId;
  const mayor = w.buildingsOfType('townhall')[0]?.employees.map((i) => w.people.get(i)).find((x) => x && x.alive && x.job === 'mayor');
  let score = cs.evidence * 0.9 + (guilty ? 0.18 : 0) + cs.witnessIds.length * 0.06 - acc.reputation * 0.25 - (has(acc, 'honest') ? 0.08 : 0) + (has(acc, 'thief') ? 0.1 : 0) + pc(acc).convictions * 0.05 + rng.float(-0.18, 0.18) + (w.getRel(v, acc).affinity < -0.5 ? 0.05 : 0);
  if (acc.family.spouseId != null || acc.family.childrenIds.length) score -= 0.04;
  if (cs.kind === 'murder' || cs.kind === 'manslaughter') score += 0.05;
  const th = 0.55;
  const judge = mayor ? `Mayor ${mayor.lastName}` : 'the magistrate';
  const th_name = w.buildingsOfType('townhall')[0];
  const c = pc(acc);
  if (score < th) {
    cs.status = 'acquitted'; acc.jailedUntil = 0; S.jailed.delete(acc.id); S.acquitted++;
    if (w.cancelAction && acc.currentAction?.id === 'serveSentence') w.cancelAction(acc);
    const lines = guilty ? [`${nm(acc)} walked free from the Town Hall: with too little proof, ${judge} dismissed the charge of ${cs.kind} brought by ${nm(v)}. Many in town think the verdict wrong.`, `The case against ${nm(acc)} collapsed for want of evidence, to the fury of ${nm(v)}.`] : [`${nm(acc)} was cleared of ${cs.kind} before ${judge}; the case against ${him(acc)} rested on little but suspicion.`, `Innocent, ruled ${judge}: ${nm(acc)} goes home after days in the cells, with ${his(acc)} good name to repair.`];
    chron(w, 'trial', 3, rng.pick(lines), [acc.id, v?.id], th_name?.id);
    w.addMemory(acc, { type: 'trial', text: guilty ? `Was tried for ${cs.kind} and let off for want of proof.` : `Was wrongly accused of ${cs.kind} and cleared at trial.`, otherIds: v ? [v.id] : [], weight: guilty ? 0.2 : -0.5, importance: 4 });
    if (!guilty) { acc.reputation = clamp(acc.reputation + 0.03, -1, 1); const r = w.getRel(acc, v); r.affinity = clamp(r.affinity - 0.3, -1, 1); const cc = pc(acc); cc.grudges[v.id] = clamp((cc.grudges[v.id] || 0) + 0.3, 0, 1); }
    else if (v) { const r = w.getRel(v, acc); r.affinity = clamp(r.affinity - 0.2, -1, 1); const vc = pc(v); vc.grudges[acc.id] = clamp((vc.grudges[acc.id] || 0) + 0.3, 0, 1); }
    return;
  }
  cs.status = 'convicted'; S.convicted++; c.convictions++;
  // sentence
  let days = 0, fine = 0, hang = false, text;
  switch (cs.kind) {
    case 'theft': fine = Math.max(8, Math.round(cs.loss * 2)); days = rng.int(3, 14); break;
    case 'burglary': fine = Math.max(20, Math.round(cs.loss * 1.5)); days = rng.int(14, 50); break;
    case 'fraud': fine = Math.max(30, Math.round(cs.loss * 2.5)); days = rng.int(7, 24); break;
    case 'assault': fine = rng.int(8, 40); days = rng.int(5, 30) + Math.round(cs.injury * 15); break;
    case 'manslaughter': days = rng.int(112, 336); fine = rng.int(20, 80); break;
    case 'murder': if (rng.chance(0.6)) hang = true; else days = rng.int(448, 1120); break;
  }
  days = Math.max(1, Math.round(days * (c.convictions > 1 ? 1.3 : 1) * (rng.float(0.8, 1.2))));
  const paid = Math.min(fine, Math.max(0, acc.money));
  acc.money -= paid; S.treasuryRef(w).treasury += paid * 0.6; if (v && v.alive) v.money += Math.min(cs.loss, paid * 0.4 + cs.loss * 0);
  if (fine > paid) days += Math.ceil((fine - paid) / 3); // work off the rest in the cells
  acc.reputation = clamp(acc.reputation - (0.08 + 0.05 * SEVERITY[cs.kind]), -1, 1);
  if (hang) {
    acc.jailedUntil = 0; S.jailed.delete(acc.id);
    chron(w, 'execution', 5, rng.pick([`${nm(acc)} was hanged on the green for the murder of ${nm(v)}, ${judge} having pronounced sentence at the Town Hall. A silent crowd watched.`, `${nm(acc)} went to the gallows today. ${nm(v)}'s kin stood at the front of the crowd.`]), [acc.id, v?.id]);
    w.addMemory(acc, { type: 'execution', text: `Was condemned for the murder of ${nm(v)}.`, otherIds: v ? [v.id] : [], weight: -1, importance: 5 });
    S.executions++; w.killPerson(acc, 'executed'); return;
  }
  acc.jailedUntil = w.tick + days * DAY; S.jailed.add(acc.id); cs.sentenceDays = days;
  const jb = jailBuilding(w); if (jb && w.forceAction) w.forceAction(acc, 'serveSentence', jb.id, { why: 'serving a sentence' });
  const finePart = paid > 0 ? ` and fined ${Math.round(paid)} crowns` : '';
  const dd = days >= 112 ? `${(days / 112).toFixed(days % 112 < 8 ? 0 : 1)} years` : `${days} days`;
  const T = {
    theft: [`${nm(acc)} was convicted of theft before ${judge}, sentenced to ${dd} in the jail${finePart}.`, `Guilty: ${nm(acc)} must repay ${nm(v)} and spend ${dd} locked up for the theft.`],
    burglary: [`${nm(acc)} was found guilty of breaking into ${nm(v)}'s house and sentenced to ${dd} in jail${finePart}.`, `The burglar is ${nm(acc)}, ruled ${judge}; ${dd} behind bars${finePart}.`],
    fraud: [`${nm(acc)} was convicted of cheating ${nm(v)} and sentenced to ${dd}${finePart}.`, `${judge} found ${nm(acc)} a fraudster; ${dd} in the cells${finePart}.`],
    assault: [`${nm(acc)} was convicted of assaulting ${nm(v)} and sentenced to ${dd}${finePart}.`, `For the beating of ${nm(v)}, ${nm(acc)} gets ${dd} in jail${finePart}.`],
    manslaughter: [`${nm(acc)} was found guilty of manslaughter in the death of ${nm(v)} and sentenced to ${dd} in the jail${finePart}.`],
    murder: [`${nm(acc)} was sentenced to ${dd} in the jail for the murder of ${nm(v)}, the court granting mercy.`],
  }[cs.kind];
  chron(w, 'trial', SEVERITY[cs.kind] >= 4 ? 5 : SEVERITY[cs.kind] >= 3 ? 4 : 3, rng.pick(T), [acc.id, v?.id], th_name?.id);
  w.addMemory(acc, { type: 'conviction', text: `Was convicted of ${cs.kind} and sentenced to ${dd}.`, otherIds: v ? [v.id] : [], weight: -0.8, importance: 5 });
  if (v && v.alive) { w.addMemory(v, { type: 'justice', text: `${nm(acc)} was convicted of the ${cs.kind} committed against ${nm(v)}.`, otherIds: [acc.id], weight: 0.3, importance: 3 }); mood(w, v, 'justice', 'Justice was done', 0.1, 8); }
  // the town's opinion; family shame
  for (const id of [acc.family.spouseId, ...acc.family.childrenIds, acc.family.fatherId, acc.family.motherId]) { const q = id != null ? w.people.get(id) : null; if (q && q.alive) { mood(w, q, 'shame', 'Ashamed by a relative\'s crime', -0.1, 14); q.reputation = clamp(q.reputation - 0.015, -1, 1); } }
  w.emit('conviction', { person: acc, caseId: cs.id, kind: cs.kind, days });
}
function release(w, p, early = false) {
  const S = C(w); S.jailed.delete(p.id);
  if ((p.jailedUntil || 0) > w.tick && !early) return;
  p.jailedUntil = 0;
  if (p.currentAction?.id === 'serveSentence' && w.cancelAction) w.cancelAction(p);
  if (early) return;
  w.addMemory(p, { type: 'release', text: 'Walked out of the jail a free man or woman, but with a name stained by it.'.replace('a free man or woman', p.sex === 'F' ? 'a free woman' : 'a free man'), otherIds: [], weight: -0.2, importance: 3 });
  mood(w, p, 'released', 'Out of jail at last', 0.08, 5);
  if (w.rng.chance(0.4)) chron(w, 'release', 1, `${nm(p)} was released from jail after serving ${his(p)} sentence.`, [p.id]);
}

// ------------------------------------------------------------------ the serve-sentence action
const serveSentence = {
  id: 'serveSentence', label: 'locked in the jail', interruptible: false, perTick: { comfort: -0.0015, fun: -0.002, social: -0.001, purpose: -0.001 },
  where(w) { return jailBuilding(w)?.id ?? null; },
  score(w, p) { return (p.jailedUntil || 0) > w.tick ? 5000 : 0; },
  duration(w, p) { return clamp((p.jailedUntil || 0) - w.tick, 1, DAY); },
  thought: (w, p) => `Behind bars until ${w.formatDate(p.jailedUntil)}.`,
};

// ------------------------------------------------------------------ daily / hourly
function dailyMotives(w) {
  const S = C(w); S.cands = []; S.grudgers = [];
  const wave = S.waveUntil > w.tick;
  for (const p of w.living()) {
    const c = pc(p);
    if (age(w, p) < 15 || isPlayer(w, p)) continue;
    c.motive = motiveOf(w, p);
    // grudges fade (slowly, more so for calm people)
    let any = false;
    for (const k in c.grudges) { c.grudges[k] *= 0.997 - 0.002 * (1 - p.personality.neuroticism); if (c.grudges[k] < 0.05 || !w.people.get(+k)?.alive) delete c.grudges[k]; else any = true; }
    if (any && (has(p, 'hothead') || p.personality.agreeableness < 0.4)) S.grudgers.push(p);
    if (c.motive > 0.06) S.cands.push(p);
    else if (wave && c.motive > 0.02) S.cands.push(p);
  }
}
function hourlyAttempts(w) {
  const S = C(w); const h = w.time.hour;
  for (const p of S.cands) {
    if (!p.alive || jailed(w, p) || p.currentAction?.id === 'serveSentence' || isPlayer(w, p)) continue;
    const c = pc(p); if (w.time.totalDays - c.lastCrimeDay < 7) continue;
    const pDay = K_RATE * c.motive * c.motive * (S.waveUntil > w.tick ? S.waveMult : 1) * (p.job === 'guard' || p.job === 'captain' || p.job === 'priest' ? 0.3 : 1);
    const hw = (h >= 7 && h < 23 ? 1 : h < 4 ? 1.2 : 0.3);
    if (w.rng.chance(pDay * hw / 12)) attemptCrime(w, p);
  }
  // grudges flare when the two meet
  for (const p of S.grudgers) {
    if (!p.alive || jailed(w, p) || isPlayer(w, p)) continue;
    const c = pc(p); if (w.time.totalDays - c.lastCrimeDay < 10) continue;
    let target = null, tg = 0;
    const near = peopleAround(w, p, 5);
    for (const q of near) { const g = c.grudges[q.id] || 0; if (g > tg && !jailed(w, q)) { tg = g; target = q; } }
    if (!target || tg < 0.4) continue;
    const drink = (p.locationId != null && /tavern|inn/.test(w.buildings.get(p.locationId)?.type || '') ? 2 : 1);
    if (w.rng.chance(0.006 * tg * tg * drink * (has(p, 'hothead') ? 2 : 1) * (S.waveUntil > w.tick ? 1.5 : 1))) {
      tryAssault(w, p, target, 'over an old grudge', true, 0.015);
    }
  }
  // drunken tavern fights
  if (h >= 19 || h < 2) for (const t of ['tavern', 'inn']) for (const b of w.buildingsOfType(t)) {
    if (b.closed || b.occupants.size < 3) continue;
    const occ = [...b.occupants].filter((q) => q.alive && age(w, q) >= 16 && !(q.workId === b.id));
    if (occ.length < 2) continue;
    let heat = 0; for (const q of occ) heat += (has(q, 'drunkard') ? 0.6 : 0.1) + (has(q, 'hothead') ? 0.8 : 0) + (1 - q.personality.agreeableness) * 0.2 + (q.mood < -0.3 ? 0.2 : 0);
    if (!w.rng.chance(0.00022 * heat * (S.waveUntil > w.tick ? 2 : 1))) continue;
    const a = w.rng.weighted(occ, occ.map((q) => 0.1 + (has(q, 'hothead') ? 1 : 0) + (has(q, 'drunkard') ? 0.6 : 0) + (1 - q.personality.agreeableness)));
    const others = occ.filter((q) => q !== a);
    const v = w.rng.weighted(others, others.map((q) => 0.2 + Math.max(0, -w.relScore(a, q)) * 3 + (pc(a).grudges[q.id] || 0) * 2));
    if (a && v) tryAssault(w, a, v, w.rng.pick(['after a drunken quarrel', 'over a spilled drink', 'after words about a debt', 'over a remark about ' + his(a) + ' family']), false, 0.008);
  }
  // releases
  for (const id of [...S.jailed]) { const p = w.people.get(id); if (!p || !p.alive) { S.jailed.delete(id); continue; } if ((p.jailedUntil || 0) <= w.tick) release(w, p); else if (p.currentAction?.id !== 'serveSentence' && !p.path && w.forceAction && w.tick % 12 === 0) { const jb = jailBuilding(w); if (jb) w.forceAction(p, 'serveSentence', jb.id, { why: 'held in the cells' }); } }
}
function dailyJustice(w) {
  const S = C(w);
  investigate(w);
  for (const cs of S.cases.values()) if (cs.status === 'arrested' && cs.trialDay <= w.time.totalDays && w.time.hour < 24) trial(w, cs);
  // old cases get pruned
  if (w.time.dayOfSeason === 1) for (const [id, cs] of S.cases) if (w.time.totalDays - cs.day > 336 && cs.status !== 'arrested') S.cases.delete(id);
  // premeditated murder: only for the truly aggrieved
  for (const p of S.grudgers) {
    const c = pc(p);
    if (!p.alive || jailed(w, p) || !has(p, 'hothead') || p.personality.agreeableness > 0.4) continue;
    for (const k in c.grudges) if (c.grudges[k] > 0.92) { const v = w.people.get(+k); if (v && v.alive && w.rng.chance(0.0004 * (S.waveUntil > w.tick ? 4 : 1))) { commitCrime(w, p, 'murder', v, { motive: 'in a long-nursed hatred', severity: 1 }); break; } }
  }
  if (S.waveUntil && S.waveUntil <= w.tick) { S.waveUntil = 0; S.waveMult = 1; chron(w, 'crime', 2, `The wave of lawlessness in ${townName(w)} has subsided; the watch reports quieter streets.`, []); }
}

// ------------------------------------------------------------------ interventions
function regIntervention(w, kind, fn, desc) { fn.description = desc; w.registerIntervention?.(kind, fn, desc); }
const argsOf = (a, b) => (a && a.people instanceof Map ? [a, b || {}] : [b, a || {}]);
function registerInterventions(w) {
  regIntervention(w, 'crimeWave', (a, b) => {
    const [world, p] = argsOf(a, b); const S = C(world);
    const days = p.days ?? 28; S.waveUntil = world.tick + days * DAY; S.waveMult = p.intensity ?? 3.5;
    // a burst of immediate trouble from the usual suspects
    const pool = world.living().filter((x) => age(world, x) >= 15 && !isPlayer(world, x) && !jailed(world, x));
    pool.sort((x, y) => motiveOf(world, y) - motiveOf(world, x));
    let n = 0; for (const x of pool.slice(0, Math.max(4, Math.round(pool.length * 0.03)))) { pc(x).lastCrimeDay = -999; S.cands.includes(x) || S.cands.push(x); n++; }
    chron(world, 'crime', 4, `A wave of lawlessness sweeps ${townName(world)}: doors are being barred at night and the watch is stretched thin.`, []);
    return `crime wave for ${days} days (${n} extra suspects)`;
  }, 'Raise crime rates for a while. params {days, intensity}');
  regIntervention(w, 'pardon', (a, b) => {
    const [world, p] = argsOf(a, b); const S = C(world);
    const list = p.personId != null ? [world.people.get(p.personId)].filter(Boolean) : [...S.jailed].map((id) => world.people.get(id)).filter(Boolean);
    for (const x of list) {
      for (const cs of S.cases.values()) if (cs.accusedId === x.id && (cs.status === 'arrested' || cs.status === 'convicted')) cs.status = 'pardoned';
      release(world, x, true); x.reputation = clamp(x.reputation + 0.05, -1, 1);
      world.addMemory(x, { type: 'pardon', text: 'Was pardoned and freed by the council.', otherIds: [], weight: 0.8, importance: 4 });
    }
    if (list.length) chron(world, 'pardon', 3, list.length === 1 ? `${nm(list[0])} has been granted a pardon and walks free.` : `A general pardon: ${list.length} prisoners are released from the jail, to mixed feelings in town.`, list.map((x) => x.id).slice(0, 5));
    return `pardoned ${list.length}`;
  }, 'Free prisoners (one person or all). params {personId?}');
}

export default {
  name: 'crime',
  init(world) {
    world.crime = {
      cases: new Map(), openIds: new Set(), jailed: new Set(), nextCase: 1, counts: {}, yearCounts: {}, convicted: 0, acquitted: 0, unsolved: 0, executions: 0, waveUntil: 0, waveMult: 1, cands: [], grudgers: [],
      treasuryRef: (w) => { w.town = w.town || {}; if (typeof w.town.treasury !== 'number') w.town.treasury = 0; return w.town; },
      commit: (perp, kind, victim, opts) => commitCrime(world, perp, kind, victim, opts), arrest: (p, cs, how) => arrest(world, p, cs, how || 'by order'), release: (p) => release(world, p, true),
    };
    for (const p of world.living()) pc(p);
    // seed a few long-standing grudges and the odd known rogue so the early town is not spotless
    for (const p of world.living()) {
      if (age(world, p) < 17) continue;
      for (const [id, r] of p.relationships) if (r.affinity < -0.5 && world.people.get(id)?.alive) pc(p).grudges[id] = clamp(-r.affinity * 0.6, 0, 0.8);
    }
    registerInterventions(world);
    world.on('death', (ev) => { const p = ev?.person; if (p) world.crime.jailed.delete(p.id); });
  },
  onHour(world) { hourlyAttempts(world); },
  onDay(world) { dailyMotives(world); dailyJustice(world); },
  onYear(world) { const S = C(world); S.lastYear = S.yearCounts; S.yearCounts = {}; },
  actions: [serveSentence],
  scoreModifiers: [(w, p, action, score) => ((p.jailedUntil || 0) > w.tick && action.id !== 'serveSentence' ? 0 : score)],
};
