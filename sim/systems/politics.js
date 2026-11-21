// POLITICS: mayor & town council, four-year elections with campaigns, platforms, voting, policy enactment into
// world.settings, the municipal purse (watch, poor relief, public works), scandals, recalls, coups.
// Pure sim code: world.rng only, no DOM. Works if any person (incl. world.player) is externally controlled.
import { clamp } from '../util.js';
import { BUILDING_TYPES } from '../map.js';
import { createRumor, spreadRumor } from './social.js';

const DAY = 144;
const NOMINATION_DOY = 48; // late summer: campaign runs ~4 weeks into the autumn vote
const COUNCIL_SIZE = 4;
const AXES = ['taxRate', 'watchFunding', 'festivalBudget', 'poorRelief', 'publicWorks'];
const AXIS_RANGE = { taxRate: [0.05, 0.3], watchFunding: [0, 1], festivalBudget: [0, 1], poorRelief: [0, 1], publicWorks: [0, 1] };
const AXIS_LABEL = { taxRate: 'the tax rate', watchFunding: 'funding for the watch', festivalBudget: 'the festival purse', poorRelief: 'relief for the poor', publicWorks: 'public works' };

const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'nobody');
const has = (p, t) => !!p && p.traits.includes(t);
const he = (p) => (p.sex === 'F' ? 'she' : 'he');
const his = (p) => (p.sex === 'F' ? 'her' : 'his');
const pct = (x) => `${Math.round(x * 100)}%`;
const isPlayer = (w, p) => w.player != null && w.player === p.id;
const jailed = (w, p) => (p.jailedUntil || 0) > w.tick;
const S = (w) => w.politics;
const town = (w) => { w.town = w.town || {}; if (typeof w.town.treasury !== 'number') w.town.treasury = 0; return w.town; };
function chron(w, type, importance, text, people, buildingId) { return w.chronicle.add({ type, importance, text, people: (people || []).filter((x) => x != null), buildingId }); }
function mood(w, p, id, label, v, days) { w.moodlet(p, id, label, v, days * DAY); }
function mem(w, p, type, text, others, weight, imp) { if (p && p.alive) w.addMemory(p, { type, text, otherIds: others || [], weight, importance: imp }); }
function adults(w, min = 18) { return w.living().filter((p) => w.ageOf(p) >= min); }
function townhall(w) { return w.buildingsOfType('townhall')[0] || null; }
function squareId(w) { return w.map?.squareId ?? w.buildingsOfType('square')[0]?.id ?? null; }
function skill(p, k) { return (p.skills && p.skills[k]) || 0; }
function kin(a, b) {
  const f = a.family || {};
  return f.spouseId === b.id || (f.childrenIds || []).includes(b.id) || f.fatherId === b.id || f.motherId === b.id || (f.siblingIds || []).includes(b.id);
}

// ------------------------------------------------------------------ platforms & ideals
function platformOf(w, p) {
  const v = p.values || {}, P = p.personality;
  const g = (x) => (x == null ? 0.5 : x);
  const rng = w.rng;
  const plat = {
    taxRate: 0.15 - 0.14 * (g(v.wealth) - 0.5) + 0.12 * (g(v.community) - 0.5) - (has(p, 'greedy') ? 0.03 : 0) + rng.gauss(0, 0.025),
    watchFunding: 0.5 + 0.6 * (g(v.tradition) - 0.5) - 0.5 * (g(v.freedom) - 0.5) + (has(p, 'honest') ? 0.05 : 0) + rng.gauss(0, 0.1),
    festivalBudget: 0.4 + 0.7 * (g(v.community) - 0.5) + 0.4 * (P.extraversion - 0.5) + rng.gauss(0, 0.1),
    poorRelief: 0.3 + 0.8 * (P.agreeableness - 0.5) + 0.4 * (g(v.community) - 0.5) - 0.4 * (g(v.wealth) - 0.5) + (has(p, 'kind') ? 0.12 : 0) + rng.gauss(0, 0.1),
    publicWorks: 0.35 + 0.8 * (P.conscientiousness - 0.5) + 0.2 * (P.openness - 0.5) + rng.gauss(0, 0.1),
  };
  for (const k of AXES) plat[k] = clamp(plat[k], AXIS_RANGE[k][0], AXIS_RANGE[k][1]);
  return plat;
}
function poorish(p) { return (p.money || 0) < 10 || (p.needs && p.needs.hunger < 0.3); }
function idealOf(w, p) {
  const v = p.values || {}, P = p.personality, g = (x) => (x == null ? 0.5 : x);
  const poor = poorish(p), rich = (p.money || 0) > 250;
  return {
    taxRate: 0.15 - 0.12 * (g(v.wealth) - 0.5) - (rich ? 0.04 : 0) + (poor ? 0.02 : 0),
    watchFunding: 0.5 + 0.5 * (g(v.tradition) - 0.5) - 0.4 * (g(v.freedom) - 0.5) + (p.crime && p.crime.convictions ? -0.15 : 0),
    festivalBudget: 0.4 + 0.6 * (g(v.community) - 0.5) + 0.3 * (P.extraversion - 0.5),
    poorRelief: 0.3 + (poor ? 0.35 : 0) + 0.5 * (P.agreeableness - 0.5) - (rich ? 0.1 : 0),
    publicWorks: 0.35 + 0.4 * (P.conscientiousness - 0.5),
  };
}
function alignment(plat, ideal) {
  let d = 0;
  for (const k of AXES) { const span = AXIS_RANGE[k][1] - AXIS_RANGE[k][0]; d += Math.min(1, Math.abs(plat[k] - ideal[k]) / (span * 0.6)); }
  return 1 - 2 * (d / AXES.length); // -1..1
}
function platformSentence(plat) {
  const bits = [];
  const t = plat.taxRate;
  bits.push(t < 0.12 ? `lower taxes (${pct(t)})` : t > 0.19 ? `a fuller town purse through ${pct(t)} taxes` : null);
  bits.push(plat.watchFunding > 0.68 ? 'a stronger watch' : plat.watchFunding < 0.3 ? 'a leaner watch' : null);
  bits.push(plat.festivalBudget > 0.65 ? 'grander festivals' : plat.festivalBudget < 0.25 ? 'fewer festival frills' : null);
  bits.push(plat.poorRelief > 0.55 ? 'better relief for the poor' : plat.poorRelief < 0.2 ? 'an end to idle handouts' : null);
  bits.push(plat.publicWorks > 0.6 ? 'mending roads, roofs and the bridge' : plat.publicWorks < 0.2 ? 'thrift in public works' : null);
  const b = bits.filter(Boolean);
  if (!b.length) return 'steady stewardship and no great changes';
  return b.length === 1 ? b[0] : b.slice(0, -1).join(', ') + ' and ' + b[b.length - 1];
}
function headlineIssue(w, plat) {
  const cur = w.settings || {};
  let best = null, bd = 0;
  for (const k of AXES) { const span = AXIS_RANGE[k][1] - AXIS_RANGE[k][0]; const d = Math.abs(plat[k] - (cur[k] ?? plat[k])) / span; if (d > bd) { bd = d; best = k; } }
  return best;
}

// ------------------------------------------------------------------ office-holding
function mayorOf(w) { const id = w.town && w.town.mayorId; const p = id != null ? w.people.get(id) : null; return p && p.alive ? p : null; }
function addEmployee(b, p) { if (b && !b.employees.includes(p.id)) b.employees.push(p.id); }
function leaveJob(w, p, why) {
  const old = p.job;
  const b = p.workId != null ? w.buildings.get(p.workId) : null;
  if (b) b.employees = b.employees.filter((i) => i !== p.id);
  p.workId = null;
  p.job = w.ageOf(p) >= 62 ? 'retired' : 'unemployed';
  if (p.econ) p.econ.apprentice = false;
  if (old !== p.job) w.emit('jobChange', { person: p, oldJob: old, newJob: p.job, buildingId: b ? b.id : null, reason: why });
}
function setMayor(w, p, how, extra = {}) {
  const T = town(w), st = S(w), now = w.tick;
  const old = mayorOf(w);
  if (old && old !== p) { leaveJob(w, old, 'leftOffice'); }
  const open = st.history.find((h) => h.endTick == null);
  if (open && open.mayorId !== (p && p.id)) { open.endTick = now; open.endReason = extra.endReason || how; }
  T.mayorId = p ? p.id : null;
  if (!p) return;
  const th = townhall(w);
  const oldB = p.workId != null ? w.buildings.get(p.workId) : null;
  if (oldB && th && oldB.id !== th.id) oldB.employees = oldB.employees.filter((i) => i !== p.id);
  const oldJob = p.job;
  p.job = 'mayor'; p.workId = th ? th.id : null;
  if (th) addEmployee(th, p);
  if (oldJob !== 'mayor') w.emit('jobChange', { person: p, oldJob, newJob: 'mayor', buildingId: th ? th.id : null });
  if (!open || open.mayorId !== p.id) st.history.push({ mayorId: p.id, name: nm(p), startTick: now, endTick: null, how, votes: extra.votes ?? null, cast: extra.cast ?? null, policies: null });
  st.termStartYear = w.time.year;
  st.hidden = (st.hidden || []).filter(() => false);
}
function pickSuccessor(w) {
  const st = S(w);
  const c = st.council.map((id) => w.people.get(id)).filter((p) => p && p.alive && w.ageOf(p) >= 21 && !jailed(w, p));
  if (c.length) return c[0];
  return notables(w, 1)[0] || null;
}
function notableScore(w, p) {
  const P = p.personality;
  return (has(p, 'ambitious') ? 1.5 : 0) + skill(p, 'charisma') * 2 + Math.max(0, p.reputation || 0) * 2.5 + P.extraversion * 0.8 + p.genes.intellect * 1.0 + ((p.money || 0) > 200 ? 0.7 : 0) + (p.interests && p.interests.includes('politics') ? 1.5 : 0) + (['merchant', 'priest', 'teacher', 'doctor', 'clerk', 'captain', 'innkeeper', 'tavernkeeper'].includes(p.job) ? 0.8 : 0) + Math.min(w.ageOf(p), 50) / 60;
}
function notables(w, n, exclude = []) {
  const pool = w.living().filter((p) => { const a = w.ageOf(p); return a >= 25 && a <= 72 && !jailed(w, p) && !exclude.includes(p.id) && (p.reputation || 0) > -0.4 && !(p.crime && p.crime.convictions > 1); });
  pool.sort((a, b) => notableScore(w, b) - notableScore(w, a));
  return pool.slice(0, n);
}
function seatCouncil(w, ids) {
  const st = S(w);
  const mid = w.town.mayorId;
  const seen = new Set();
  const out = [];
  for (const id of ids) { const p = w.people.get(id); if (p && p.alive && id !== mid && !seen.has(id)) { seen.add(id); out.push(id); } }
  if (out.length < COUNCIL_SIZE) for (const p of notables(w, COUNCIL_SIZE * 2, [mid, ...out])) { if (out.length >= COUNCIL_SIZE) break; out.push(p.id); }
  st.council = out.slice(0, COUNCIL_SIZE);
  w.town.council = st.council.slice();
}
function currentPolicy(w) { const o = {}; for (const k of AXES) o[k] = w.settings[k]; return o; }
function applyPolicies(w, announce) {
  const st = S(w), m = mayorOf(w);
  if (!m) return;
  const mp = (st.platforms && st.platforms[m.id]) || platformOf(w, m);
  const cps = st.council.map((id) => w.people.get(id)).filter((p) => p && p.alive);
  const before = currentPolicy(w);
  const wm = st.regime === 'usurper' ? 1 : 0.6;
  for (const k of AXES) {
    let c = mp[k];
    if (cps.length) { const avg = cps.reduce((s, p) => s + ((st.platforms && st.platforms[p.id] ? st.platforms[p.id][k] : platformOf(w, p)[k])), 0) / cps.length; c = wm * mp[k] + (1 - wm) * avg; }
    w.settings[k] = clamp(+c.toFixed(3), AXIS_RANGE[k][0], AXIS_RANGE[k][1]);
  }
  if (st.regime === 'usurper') { w.settings.taxRate = clamp(w.settings.taxRate + 0.05, 0.05, 0.3); w.settings.watchFunding = 0.9; w.settings.festivalBudget = Math.min(w.settings.festivalBudget, 0.15); w.settings.poorRelief = Math.min(w.settings.poorRelief, 0.12); }
  const open = st.history.find((h) => h.endTick == null);
  if (open) open.policies = currentPolicy(w);
  if (announce) {
    const ch = [];
    const dt = w.settings.taxRate - before.taxRate;
    if (Math.abs(dt) >= 0.01) ch.push(`${dt < 0 ? 'cutting' : 'raising'} the tax rate from ${pct(before.taxRate)} to ${pct(w.settings.taxRate)}`);
    for (const k of ['watchFunding', 'festivalBudget', 'poorRelief', 'publicWorks']) { const d = w.settings[k] - before[k]; if (Math.abs(d) >= 0.2) ch.push(`${d > 0 ? 'raising' : 'trimming'} ${AXIS_LABEL[k]}`); }
    if (ch.length) chron(w, 'policy', 3, `Mayor ${nm(m)}'s first acts at the town hall: ${ch.slice(0, 3).join(', ')}.`, [m.id], townhall(w)?.id);
  }
}

// ------------------------------------------------------------------ elections
function eligibleVoter(w, p) { return w.ageOf(p) >= 18 && !(p.jailedUntil > w.tick + 30 * DAY); }
function pickCandidates(w, forced) {
  const st = S(w), inc = mayorOf(w);
  const pool = w.living().filter((p) => { const a = w.ageOf(p); return a >= 25 && a <= 72 && !jailed(w, p) && (p.reputation || 0) > -0.4 && !(p.crime && p.crime.convictions > 1) && p.job !== 'child'; });
  const wt = new Map();
  for (const p of pool) {
    let x = notableScore(w, p) - 1.2;
    if (inc && p.id === inc.id) x = (st.approval > 0.3 && w.rng.chance(0.78) ? 4 : -9);
    if (isPlayer(w, p)) x = -9; // the player enters by choice (declareCandidacy)
    if (x > 0) wt.set(p.id, x);
  }
  const cand = [];
  for (const id of forced || []) { const p = w.people.get(id); if (p && p.alive && !cand.includes(p)) cand.push(p); }
  const n = w.rng.int(2, 4);
  const list = [...wt.entries()];
  while (cand.length < n && list.length) {
    const tot = list.reduce((s, e) => s + e[1], 0);
    let r = w.rng.next() * tot, i = 0;
    for (; i < list.length; i++) { r -= list[i][1]; if (r <= 0) break; }
    const [id] = list.splice(Math.min(i, list.length - 1), 1)[0];
    const p = w.people.get(id);
    if (p && !cand.includes(p)) cand.push(p);
  }
  return cand;
}
function startCampaign(w, opts = {}) {
  const st = S(w);
  if (st.election) return null;
  const days = opts.days ?? 28;
  const cands = pickCandidates(w, opts.candidates);
  if (!cands.length) return null;
  const platforms = st.platforms;
  const E = { startTick: w.tick, voteDay: w.time.totalDays + days, days, candidates: cands.map((p) => p.id), ballots: new Map(), speeches: {}, special: !!opts.special, reason: opts.reason || 'term' };
  for (const p of cands) { platforms[p.id] = platformOf(w, p); E.speeches[p.id] = 0; mood(w, p, 'campaigning', 'Running for mayor', 0.15, days); }
  st.election = E;
  w.town.election = { candidates: E.candidates.slice(), voteDay: E.voteDay };
  const inc = mayorOf(w);
  const names = cands.map((p) => `${nm(p)}${inc && p.id === inc.id ? ' (the sitting mayor)' : ''}`);
  const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  const verb = E.special ? w.rng.pick(['A special election has been called', 'The council has called a fresh election']) : w.rng.pick(['Nominations are closed', 'The candidates are set', 'The race for the mayor\'s chain begins']);
  chron(w, 'election', 4, `${verb}: ${list} stand${cands.length === 1 ? 's' : ''} for mayor of ${w.town.name || 'the town'}, with the vote set for ${w.formatDate(w.tick + days * DAY)}.${cands.length > 1 ? ` ${nm(cands[0])} promises ${platformSentence(platforms[cands[0].id])}; ${nm(cands[1])} speaks for ${platformSentence(platforms[cands[1].id])}.` : ''}`, cands.map((p) => p.id), townhall(w)?.id);
  w.emit('election', { phase: 'campaign', candidates: E.candidates.slice(), voteDay: E.voteDay });
  return E;
}
function rumorPenalty(voter, cand) {
  if (!voter.rumors) return 0;
  let n = 0;
  for (const r of voter.rumors) if (r.aboutId === cand.id && (r.valence ?? -0.3) < -0.1) n += (r.severity ?? 0.5) * (r.truth === false ? 0.6 : 1);
  return Math.min(2.2, n * 1.1);
}
function voterUtility(w, v, c, inc, st) {
  const rel = w.getRel(v, c);
  let u = 2.2 * w.relScore(v, c) + 0.8 * (rel.respect || 0) + 0.4 * (rel.trust || 0);
  u += 1.6 * alignment(st.platforms[c.id], idealOf(w, v));
  u += 0.5 * skill(c, 'charisma') + 0.8 * (c.reputation || 0);
  if (kin(v, c)) u += 1.2;
  if (v.id === c.id) u += 3;
  u -= rumorPenalty(v, c);
  if (inc && c.id === inc.id) {
    const sat = 1.2 * (v.mood || 0) + ((v.money || 0) > 30 ? 0.3 : -0.35) + (poorish(v) ? -0.4 : 0) + st.econ;
    u += 0.7 * sat + 0.2; // incumbent premium, punished in bad times
  }
  u += w.rng.gauss(0, 0.45);
  return u;
}
function econIndex(w) {
  const A = adults(w);
  if (!A.length) return 0;
  let poor = 0, mo = 0;
  for (const p of A) { if (poorish(p)) poor++; mo += p.mood || 0; }
  return clamp(0.5 - 2.2 * (poor / A.length) + mo / A.length, -1, 1);
}
function tally(w) {
  const st = S(w), E = st.election;
  if (!E) return;
  const cands = E.candidates.map((id) => w.people.get(id)).filter((p) => p && p.alive && !jailed(w, p));
  st.election = null; w.town.election = null;
  if (!cands.length) { chron(w, 'election', 3, 'The election was abandoned: not a candidate was left standing.', []); return; }
  const inc = mayorOf(w);
  st.econ = econIndex(w);
  const votes = new Map(cands.map((c) => [c.id, 0]));
  let cast = 0, eligible = 0;
  const byFam = new Map();
  for (const v of adults(w)) {
    if (!eligibleVoter(w, v)) continue;
    eligible++;
    let choice = E.ballots.get(v.id);
    if (choice == null) {
      if (isPlayer(w, v)) continue; // the player's ballot comes only from the player
      const vv = v.values || {};
      const turn = 0.38 + 0.3 * (vv.community ?? 0.5) + (v.interests && v.interests.includes('politics') ? 0.2 : 0) + (w.ageOf(v) > 28 ? 0.08 : 0) - (v.mood < -0.3 ? 0.1 : 0) - (v.illness ? 0.15 : 0);
      if (!w.rng.chance(clamp(turn, 0.1, 0.92))) continue;
      let best = null, bu = -1e9;
      for (const c of cands) { const u = voterUtility(w, v, c, inc, st); if (u > bu) { bu = u; best = c; } }
      if (bu < -0.9 && cands.length > 1) continue; // spoils nothing, stays home
      choice = best.id;
    }
    if (!votes.has(choice)) continue;
    votes.set(choice, votes.get(choice) + 1); cast++;
    E.ballots.set(v.id, choice);
  }
  const ranked = cands.slice().sort((a, b) => votes.get(b.id) - votes.get(a.id) || w.rng.next() - 0.5);
  const win = ranked[0];
  const wv = votes.get(win.id);
  const turnout = eligible ? cast / eligible : 0;
  const parts = ranked.map((c) => `${nm(c)} ${votes.get(c.id)}`);
  const margin = ranked.length > 1 ? wv - votes.get(ranked[1].id) : wv;
  const closeCall = ranked.length > 1 && margin <= Math.max(3, cast * 0.04);
  const wasInc = inc && inc.id === win.id;
  const ctx = `${cast} of ${eligible} eligible townsfolk voted (${pct(turnout)})`;
  let text;
  if (ranked.length === 1) text = `${nm(win)} is returned unopposed as mayor, with ${wv} votes cast in a quiet election.`;
  else if (wasInc) text = w.rng.pick([
    `${nm(win)} keeps the mayor's chain, ${wv} votes to ${ranked.slice(1).map((c) => votes.get(c.id)).join(' and ')}. ${ctx}.`,
    `Re-elected: Mayor ${nm(win)} defeats ${ranked.slice(1).map(nm).join(' and ')} (${parts.join(', ')}). ${ctx}.`,
  ]);
  else if (inc && cands.includes(inc)) text = `${nm(win)} unseats Mayor ${nm(inc)}: ${parts.join(', ')}. ${ctx}.`;
  else if (inc) text = w.rng.pick([
    `${nm(win)} wins the mayoralty with ${wv} votes (${parts.slice(1).join(', ')}). ${ctx}. Mayor ${nm(inc)} had chosen to step aside.`,
    `A new mayor: ${nm(win)} takes the town hall by ${margin} votes over ${nm(ranked[1])}. ${ctx}.`,
  ]);
  else text = `${nm(win)} is elected mayor: ${parts.join(', ')}. ${ctx}.`;
  if (closeCall) text += ` It was the narrowest of margins, and the losing side muttered about the count.`;
  if (inc && !wasInc && cands.includes(inc) && st.econ < -0.2 && ranked.length > 1) text += ` Hard times told against the old administration.`;
  chron(w, 'election', 5, text, ranked.map((c) => c.id), townhall(w)?.id);
  w.emit('election', { phase: 'result', winner: win.id, votes: Object.fromEntries(votes), cast, eligible, turnout });
  st.lastResult = { tick: w.tick, winner: win.id, votes: Object.fromEntries(votes), cast, eligible };
  // seat council from the runners-up and appoint the winner
  setMayor(w, win, wasInc ? 'reelected' : 'elected', { votes: wv, cast, endReason: wasInc ? 'reelected' : 'defeated' });
  seatCouncil(w, ranked.slice(1).map((c) => c.id));
  st.regime = 'council'; st.usurper = null;
  const closeRival = ranked.length > 1 ? ranked[1] : null;
  mood(w, win, 'elected', 'Won the election', 0.6, 4); mem(w, win, 'election', `Won the election for mayor with ${wv} votes.`, closeRival ? [closeRival.id] : [], 0.8, 5);
  for (const c of ranked.slice(1)) { mood(w, c, 'lostElection', 'Lost the election', -0.3, 5); mem(w, c, 'election', `Lost the mayoral election to ${nm(win)}.`, [win.id], -0.5, 4); }
  if (closeCall && closeRival) { const r = w.getRel(closeRival, win); if (!r.tags.includes('rival')) r.tags.push('rival'); r.affinity = clamp((r.affinity || 0) - 0.1, -1, 1); }
  for (const [vid, cid] of E.ballots) { const v = w.people.get(vid); if (v && v.alive && cid === win.id && w.rng.chance(0.15)) mood(w, v, 'myMayor', 'My candidate won', 0.12, 4); }
  applyPolicies(w, true);
  st.nextElectionYear = (st.lastElectionYear = w.time.year) + 4;
  if (E.special) st.nextElectionYear = Math.max(st.nextElectionYear, w.time.year + 3);
  void byFam;
}

// ------------------------------------------------------------------ campaigning
function giveSpeech(w, c) {
  const st = S(w), plat = st.platforms[c.id];
  const sq = squareId(w);
  if (sq == null || isPlayer(w, c) || jailed(w, c)) return;
  if (!w.forceAction(c, 'campaign_speech', sq, { duration: 6, why: 'campaigning for the mayoralty', thought: 'Addressing the crowd at the square.' })) return;
  const issue = headlineIssue(w, plat) || 'poorRelief';
  const E = st.election; if (E) E.speeches[c.id] = (E.speeches[c.id] || 0) + 1;
  c._speechPending = w.tick + 3;
  st.pendingSpeech.push({ id: c.id, at: w.tick + 3, issue });
}
function resolveSpeeches(w) {
  const st = S(w);
  const keep = [];
  for (const s of st.pendingSpeech) {
    if (w.tick < s.at) { keep.push(s); continue; }
    const c = w.people.get(s.id); if (!c || !c.alive) continue;
    const sq = squareId(w);
    const crowd = new Set();
    if (sq != null) { for (const p of w.peopleAt(sq) || []) crowd.add(p); }
    for (const p of w.peopleNear(c.x, c.y, 9) || []) crowd.add(p);
    crowd.delete(c);
    const plat = st.platforms[c.id];
    const charm = 0.35 + skill(c, 'charisma') * 0.8 + c.personality.extraversion * 0.3 + (has(c, 'charming') ? 0.2 : 0);
    let pro = 0, con = 0, n = 0;
    for (const v of crowd) {
      if (w.ageOf(v) < 16) continue;
      n++;
      const a = alignment(plat, idealOf(w, v));
      const rel = w.getRel(v, c);
      rel.familiarity = clamp((rel.familiarity || 0) + 0.015, 0, 1);
      const d = 0.03 * a * charm;
      rel.respect = clamp((rel.respect || 0) + d, -1, 1);
      rel.affinity = clamp((rel.affinity || 0) + d * 0.6, -1, 1);
      if (a > 0.1) pro++; else if (a < -0.2) con++;
      if (w.rng.chance(0.08)) mem(w, v, 'speech', `Heard ${nm(c)} speak in the square about ${AXIS_LABEL[s.issue]}.`, [c.id], a * 0.3, 1);
    }
    c.bubble = { text: `Friends, ${AXIS_LABEL[s.issue]} is what this town needs!`.slice(0, 60), until: w.tick + 6 };
    const E = st.election;
    if (E && E.speeches[c.id] === 1 || (E && w.rng.chance(0.12))) {
      const heckle = con > pro && n > 6;
      chron(w, 'politics', 2, heckle
        ? `${nm(c)} speaks in the square on ${AXIS_LABEL[s.issue]} and is heckled by the tavern crowd; ${he(c)} presses on regardless.`
        : w.rng.pick([`${nm(c)} climbs onto the fountain's rim to speak on ${AXIS_LABEL[s.issue]}; about ${n} townsfolk stop to listen.`, `Before a crowd of ${n} in the square, ${nm(c)} lays out ${his(c)} plans for ${AXIS_LABEL[s.issue]}.`, `${nm(c)} works the market square, shaking hands and promising ${platformSentence(plat)}.`]), [c.id], sq);
    }
    w.emit('speech', { person: c, issue: s.issue, listeners: n });
  }
  st.pendingSpeech = keep;
}

// ------------------------------------------------------------------ treasury spending
function weekly(w) {
  const st = S(w), T = town(w), st2 = w.settings;
  const pop = w.living().length, scale = pop / 220;
  const watch = 14 * (st2.watchFunding ?? 0.5) * scale;
  const jail = w.buildingsOfType('jail')[0];
  if (watch > 0 && T.treasury > 60) { const c = Math.min(watch, T.treasury * 0.2); T.treasury -= c; if (jail) jail.funds = (jail.funds || 0) + c; st.spent.watch += c; }
  // poor relief: alms box first, then the treasury
  const poor = w.living().filter((p) => w.ageOf(p) >= 14 && poorish(p) && (p.econ ? true : true) && (p.money || 0) < 8 && p.job !== 'mayor');
  let relief = 0;
  if (poor.length && (st2.poorRelief || 0) > 0.05) {
    const each = Math.max(1, Math.round((st2.poorRelief ?? 0.3) * 8));
    for (const p of poor) {
      let pay = each;
      if (T.almsBox > pay) T.almsBox -= pay; else if (T.treasury > pay + 40) T.treasury -= pay; else continue;
      p.money = (p.money || 0) + pay; relief += pay;
      if (w.rng.chance(0.1)) { mood(w, p, 'relief', 'Parish relief eased things', 0.12, 3); mem(w, p, 'relief', 'Received relief from the town purse in a lean week.', [], 0.2, 1); }
    }
    st.spent.relief += relief;
    if (relief > 0 && w.stats) w.stats.reliefPaid = (w.stats.reliefPaid || 0) + relief;
    if (poor.length >= 8 && w.time.season === 3 && w.rng.chance(0.25)) chron(w, 'welfare', 2, `The town purse pays out ${Math.round(relief)} coins in winter relief to ${poor.length} hard-pressed households.`, [], townhall(w)?.id);
  }
  // public works
  let budget = (st2.publicWorks ?? 0.35) * 45 * scale;
  if (T.treasury < 150) budget *= 0.2;
  budget = Math.min(budget, Math.max(0, T.treasury - 80));
  if (budget > 5) {
    const bridgeNeed = (T.bridgeCondition ?? 1) < 0.45;
    if (bridgeNeed && w.rng.chance(0.6)) {
      const cost = Math.min(budget, 90);
      T.treasury -= cost; st.spent.works += cost;
      T.bridgeCondition = clamp(T.bridgeCondition + cost / 260, 0, 1);
      if (T.bridgeCondition >= 0.8 && !st.bridgeDone) { st.bridgeDone = true; chron(w, 'works', 3, `The old bridge over the river is shored up at last: new timbers, new rails, and ${nm(mayorOf(w))}'s name on the council minute.`, [mayorOf(w)?.id]); }
    } else {
      const targets = [...w.buildings.values()].filter((b) => b.type !== 'park' && b.type !== 'cemetery' && b.type !== 'square' && (b.condition ?? 1) < 0.85);
      targets.sort((a, b) => (a.condition - b.condition) - (['townhall', 'temple', 'school', 'clinic', 'jail'].includes(b.type) ? 0.1 : 0) + (['townhall', 'temple', 'school', 'clinic', 'jail'].includes(a.type) ? 0.1 : 0));
      let left = budget;
      for (const b of targets.slice(0, 3)) {
        if (left < 4) break;
        const c = Math.min(left, 60 * (1 - b.condition) + 6);
        const before = b.condition;
        b.condition = clamp(b.condition + c / 140, 0, 1);
        left -= c; T.treasury -= c; st.spent.works += c;
        if (before < 0.5 && b.condition >= 0.7 && b.type !== 'house') chron(w, 'works', 2, `${b.name || BUILDING_TYPES[b.type]?.label || b.type} is repaired at the town's expense, ${w.rng.pick(['new roof beams going up', 'the masons working a fortnight', 'fresh whitewash and sound shutters', 'the carpenters hammering through the week'])}.`, [], b.id);
      }
    }
  }
}
function dailyUpkeep(w) {
  const T = town(w), st = S(w);
  T.bridgeCondition = clamp((T.bridgeCondition ?? 0.85) - (w.weather.type === 'storm' ? 0.004 : 0.0007), 0, 1);
  if (T.bridgeCondition < 0.3 && !st.bridgeWarned && w.rng.chance(0.2)) { st.bridgeWarned = true; chron(w, 'works', 2, 'Carters complain that the bridge planks are rotten and sway underfoot; someone will lose a mule before the council acts.', []); }
  if (T.bridgeCondition > 0.6) st.bridgeWarned = false;
  if (T.bridgeCondition < 0.75) st.bridgeDone = false;
}
function budgetPolicy(w) {
  const st = S(w), T = town(w), m = mayorOf(w);
  if (!m || st.regime === 'usurper') return;
  if (T.treasury < 120) st.thinWeeks++; else st.thinWeeks = 0;
  if (st.thinWeeks >= 3 && w.settings.taxRate < 0.27) {
    w.settings.taxRate = +(w.settings.taxRate + 0.015).toFixed(3); st.thinWeeks = 0;
    chron(w, 'policy', 3, `With the town purse running dry, Mayor ${nm(m)} and the council reluctantly raise the tax to ${pct(w.settings.taxRate)}; the tavern grumbles.`, [m.id]);
    st.approval = clamp(st.approval - 0.05, 0, 1);
  } else if (T.treasury > 3500 && w.settings.taxRate > 0.07 && w.rng.chance(T.treasury > 5500 ? 0.3 : 0.1)) {
    w.settings.taxRate = +(w.settings.taxRate - 0.01).toFixed(3);
    chron(w, 'policy', 2, `A healthy treasury lets Mayor ${nm(m)} trim the tax rate to ${pct(w.settings.taxRate)}.`, [m.id]);
  }
}
function councilMeeting(w) {
  const st = S(w), m = mayorOf(w), th = townhall(w);
  if (!m || !th) return;
  const members = [m, ...st.council.map((id) => w.people.get(id)).filter((p) => p && p.alive)];
  let at = 0;
  for (const p of members) { if (isPlayer(w, p) || jailed(w, p)) continue; if (w.forceAction(p, 'council_meeting', th.id, { duration: 9, why: 'monthly council meeting', thought: 'Sitting in council at the town hall.' })) at++; }
  if (at >= 2 && w.rng.chance(0.22)) {
    const issue = w.rng.pick(['the state of the bridge', 'the price of bread', 'the watch\'s overtime', 'the market stall fees', 'a stray-dog nuisance', 'the cost of the next festival', 'the poor-box', 'a boundary dispute']);
    const dis = members.find((p) => p !== m && p.personality.agreeableness < 0.4);
    chron(w, 'politics', 1, `The council spends a long evening on ${issue}${dis ? `; ${nm(dis)} dissents, as usual` : ''}.`, members.slice(0, 3).map((p) => p.id), th.id);
  }
  // council members who have fallen ill, died or left are replaced
  seatCouncil(w, st.council);
}

// ------------------------------------------------------------------ scandals, recalls, vacancies
function resign(w, m, reason, text) {
  const st = S(w);
  chron(w, 'politics', 5, text, [m.id], townhall(w)?.id);
  mem(w, m, 'resign', `Left the mayor's chair: ${reason}.`, [], -0.8, 5);
  m.reputation = clamp((m.reputation || 0) - 0.2, -1, 1);
  const succ = pickSuccessor(w);
  const nowYear = w.time.year;
  if (succ && succ.id !== m.id) {
    chron(w, 'election', 4, `The council names ${nm(succ)} acting mayor until the people can be asked${st.nextElectionYear <= nowYear + 1 ? '' : ' in a special election'}.`, [succ.id], townhall(w)?.id);
    st.council = st.council.filter((id) => id !== succ.id);
    setMayor(w, succ, 'appointed', { endReason: reason });
    if (!st.platforms[succ.id]) st.platforms[succ.id] = platformOf(w, succ);
    seatCouncil(w, st.council);
    applyPolicies(w, false);
  } else setMayor(w, null, 'vacant', { endReason: reason });
  st.pendingByElection = w.tick + 30 * DAY;
}
function dailyScandals(w) {
  const st = S(w), m = mayorOf(w), T = town(w);
  if (!m) return;
  if (jailed(w, m)) { resign(w, m, 'imprisoned', `Mayor ${nm(m)} is locked in the town jail and can hardly govern from a cell; ${he(m)} resigns the chain.`); return; }
  // greed in office
  const greed = (has(m, 'greedy') ? 2.2 : 1) * (has(m, 'honest') ? 0.25 : 1) * (1.3 - m.personality.conscientiousness) * (0.5 + ((m.values && m.values.wealth) || 0.5)) * (isPlayer(w, m) ? 0 : 1);
  if (T.treasury > 250 && w.rng.chance(0.00045 * greed)) {
    const amt = Math.round(Math.min(160, T.treasury * w.rng.float(0.03, 0.08)));
    T.treasury -= amt; m.money = (m.money || 0) + amt; st.hidden.push({ amt, tick: w.tick });
  }
}
function weeklyScandals(w) {
  const st = S(w), m = mayorOf(w);
  if (!m) return;
  // exposure of embezzlement
  if (st.hidden.length && w.rng.chance(0.06 * st.hidden.length)) {
    const tot = st.hidden.reduce((s, h) => s + h.amt, 0);
    st.hidden = [];
    const clerks = townhall(w)?.employees.map((i) => w.people.get(i)).find((p) => p && p.alive && p.job === 'clerk');
    const who = clerks ? `${nm(clerks)}, a town hall clerk, ` : 'An auditor ';
    if (createRumor) {
      const r = createRumor(w, { aboutId: m.id, kind: 'scandal', text: `${nm(m)} has had ${his(m)} fingers in the town purse`, truth: true, severity: 0.9, valence: -0.8 });
      if (r) { const ppl = w.living().filter((p) => w.ageOf(p) >= 16); for (let i = 0; i < 6 && ppl.length; i++) { const p = w.rng.pick(ppl); try { spreadRumor(w, (clerks || p).id, r, p.id); } catch (e) { /* social may be absent */ } } }
    }
    chron(w, 'scandal', 5, `${who}finds about ${tot} coins missing from the town books, and the trail leads to Mayor ${nm(m)}'s door. Half the market is talking of nothing else.`, [m.id, clerks?.id], townhall(w)?.id);
    for (const p of adults(w)) { if ((p.values?.community ?? 0.5) > 0.5) { const r = w.getRel(p, m); r.respect = clamp((r.respect || 0) - 0.25, -1, 1); r.trust = clamp((r.trust || 0) - 0.25, 0, 1); } }
    m.reputation = clamp((m.reputation || 0) - 0.35, -1, 1);
    st.approval = clamp(st.approval - 0.25, 0, 1);
    if (w.rng.chance(0.7) || m.reputation < -0.5) { const back = Math.min(m.money || 0, tot); m.money -= back; town(w).treasury += back; resign(w, m, 'embezzlement', `Mayor ${nm(m)} resigns in disgrace and repays ${Math.round(back)} coins to the town. "A moment of weakness," ${he(m)} tells the council; nobody is quite persuaded.`); }
    else chron(w, 'scandal', 4, `Mayor ${nm(m)} survives a vote of censure, ${his(m)} friends on the council closing ranks, but few will meet ${his(m)} eye on market day.`, [m.id]);
    return;
  }
  // gossip with teeth: widely known true scandal
  const soc = w.social;
  if (soc && soc.rumors) {
    let worst = 0;
    for (const r of soc.rumors.values()) if (r.aboutId === m.id && r.truth && ['affair', 'scandal', 'crime', 'drunk'].includes(r.kind) && !r.pol) worst = Math.max(worst, r.heard || 0);
    if (worst >= 18 && w.rng.chance(0.25)) {
      for (const r of soc.rumors.values()) if (r.aboutId === m.id) r.pol = true;
      st.approval = clamp(st.approval - 0.15, 0, 1);
      if (w.rng.chance(0.35)) resign(w, m, 'public disgrace', `Pressed by the priest and the town's good opinion, Mayor ${nm(m)} steps down; the stories going round the square have grown too loud to ignore.`);
      else chron(w, 'scandal', 3, `Whispers about Mayor ${nm(m)} grow louder; ${he(m)} insists they are lies, and calls for the petty gossips to be fined.`, [m.id]);
    }
  }
}
function monthly(w) {
  const st = S(w), m = mayorOf(w);
  st.econ = econIndex(w);
  if (!m) return;
  const A = adults(w);
  let pos = 0;
  for (const p of A) if (p.id !== m.id) { const s = w.relScore(p, m) + 0.25 * (p.mood || 0) + 0.2 * st.econ; if (s > 0.02) pos++; }
  st.approval = A.length ? clamp(0.1 + 0.9 * pos / A.length, 0, 1) : 0.5;
  const yrs = (w.time.totalDays - (st.history.find((h) => h.endTick == null)?.startTick ?? 0) / DAY) / 112;
  if (!st.election && st.approval < 0.22 && yrs > 1 && w.rng.chance(0.2) && st.regime !== 'usurper') {
    chron(w, 'politics', 4, `A petition with ${Math.max(20, Math.round(A.length * 0.2))} names demands a fresh election; Mayor ${nm(m)} has lost the town's confidence.`, [m.id], townhall(w)?.id);
    startCampaign(w, { days: 21, special: true, reason: 'recall' });
  }
}

// ------------------------------------------------------------------ coup
function coup(w, params = {}) {
  const st = S(w);
  let usurper = params.personId != null ? w.people.get(params.personId) : null;
  if (!usurper || !usurper.alive) {
    const cand = w.living().filter((p) => w.ageOf(p) >= 22 && w.ageOf(p) <= 65 && !jailed(w, p) && !isPlayer(w, p) && p.id !== w.town.mayorId);
    cand.sort((a, b) => ((has(b, 'ambitious') ? 2 : 0) + (has(b, 'hothead') ? 1 : 0) + (b.job === 'captain' ? 2 : b.job === 'guard' ? 1 : 0) + skill(b, 'athletics') + (1 - b.personality.agreeableness)) - ((has(a, 'ambitious') ? 2 : 0) + (has(a, 'hothead') ? 1 : 0) + (a.job === 'captain' ? 2 : a.job === 'guard' ? 1 : 0) + skill(a, 'athletics') + (1 - a.personality.agreeableness)));
    usurper = cand[0];
  }
  if (!usurper) return 'no one to seize power';
  const old = mayorOf(w);
  const guards = w.living().filter((p) => p.job === 'guard' || p.job === 'captain').slice(0, 4);
  chron(w, 'coup', 5, `${nm(usurper)}${usurper.job === 'captain' ? ', captain of the watch,' : ''} seizes the town hall at dawn with ${guards.length ? guards.length + ' loyal men of the watch' : 'a band of armed friends'}${old ? `; Mayor ${nm(old)} is turned out of doors` : ''}. The council is dissolved "until order is restored".`, [usurper.id, old?.id, ...guards.map((g) => g.id)], townhall(w)?.id);
  if (old) { mood(w, old, 'deposed', 'Deposed from office', -0.7, 20); mem(w, old, 'coup', `${nm(usurper)} drove me from the town hall.`, [usurper.id], -0.9, 5); const r = w.getRel(old, usurper); r.affinity = -0.9; if (!r.tags.includes('enemy')) r.tags.push('enemy'); }
  st.regime = 'usurper'; st.usurper = usurper.id;
  st.platforms[usurper.id] = { taxRate: 0.2, watchFunding: 0.9, festivalBudget: 0.1, poorRelief: 0.1, publicWorks: 0.25 };
  st.council = [];
  w.town.council = [];
  setMayor(w, usurper, 'coup', { endReason: 'coup' });
  const loyal = guards.map((g) => g.id);
  seatCouncil(w, loyal);
  applyPolicies(w, false);
  w.town.regime = 'usurper';
  for (const p of adults(w)) {
    const f = (p.values && p.values.freedom) ?? 0.5, t = (p.values && p.values.tradition) ?? 0.5;
    const r = w.getRel(p, usurper);
    const d = (0.5 - f) * 0.3 + (t - 0.5) * 0.1 - 0.12;
    r.respect = clamp((r.respect || 0) + d, -1, 1); r.affinity = clamp((r.affinity || 0) + d * 0.6, -1, 1); r.trust = clamp((r.trust || 0) - 0.1, 0, 1);
    if (f > 0.6) mood(w, p, 'coup', 'Unease under the strongman', -0.15, 20);
    if (w.rng.chance(0.15)) mem(w, p, 'coup', `${nm(usurper)} took the town hall by force.`, [usurper.id], -0.3 + (t - 0.5), 4);
  }
  usurper.reputation = clamp((usurper.reputation || 0) - 0.25, -1, 1);
  st.nextElectionYear = w.time.year + 2; st.coupDay = w.time.totalDays;
  st.election = null; w.town.election = null;
  w.emit('election', { phase: 'coup', usurper: usurper.id });
  return `${nm(usurper)} seized power`;
}
function checkVacancy(w) {
  const st = S(w), T = town(w);
  let m = mayorOf(w);
  if (T.mayorId != null && !m) {
    const dead = w.people.get(T.mayorId);
    if (dead && !st.diedHandled) {
      st.diedHandled = true;
      const succ = pickSuccessor(w);
      if (succ) {
        chron(w, 'politics', 4, `With Mayor ${nm(dead)} dead, the council meets in the town hall and names ${nm(succ)} to finish the term.`, [dead.id, succ.id], townhall(w)?.id);
        st.council = st.council.filter((id) => id !== succ.id);
        setMayor(w, succ, 'appointed', { endReason: 'died in office' });
        if (!st.platforms[succ.id]) st.platforms[succ.id] = platformOf(w, succ);
        seatCouncil(w, st.council); applyPolicies(w, false);
        st.diedHandled = false;
        st.pendingByElection = w.tick + 40 * DAY;
        return;
      }
      setMayor(w, null, 'vacant', { endReason: 'died in office' });
    }
  }
  m = mayorOf(w);
  if (m) {
    // someone else (economy retirement) took the job away: honour it only for age
    if (m.job !== 'mayor') {
      if (w.ageOf(m) >= 70 || jailed(w, m)) { resign(w, m, 'age', `Mayor ${nm(m)}, ${Math.floor(w.ageOf(m))}, lays down the chain: "I've given this town my years." The council names a successor.`); }
      else { const th = townhall(w); m.job = 'mayor'; m.workId = th ? th.id : null; if (th) addEmployee(th, m); }
    }
  }
  if (!w.town.mayorId && !st.election && w.time.totalDays >= 7) startCampaign(w, { days: 14, special: true, reason: 'vacancy' });
  if (st.pendingByElection && w.tick >= st.pendingByElection && !st.election) {
    st.pendingByElection = 0;
    if (w.time.year < st.nextElectionYear || w.time.doyDist === undefined) { /* the by-election replaces the regular one only if the term is half over */ }
    if (st.nextElectionYear - w.time.year >= 2) startCampaign(w, { days: 21, special: true, reason: 'by-election' });
  }
  // dead council members drop out
  const before = st.council.length;
  st.council = st.council.filter((id) => { const p = w.people.get(id); return p && p.alive; });
  if (st.council.length < before || st.council.length < COUNCIL_SIZE) { if (m) seatCouncil(w, st.council); }
}

// ------------------------------------------------------------------ actions & modifiers
const actions = [
  { id: 'campaign_speech', label: 'giving a campaign speech', score: () => 0, duration: (w, p, b, ca) => (ca && ca.duration) || 6, interruptible: false, perTick: { social: 0.01, purpose: 0.006 }, thought: (w, p) => 'Addressing the crowd in the square.' },
  { id: 'council_meeting', label: 'in council', score: () => 0, duration: (w, p, b, ca) => (ca && ca.duration) || 9, interruptible: false, perTick: { purpose: 0.004 }, thought: () => 'Sitting in council at the town hall.' },
];
const CAMPAIGN_BOOST = /^(socialize|visit_friend|wander|relax_park|tavern)$/;
const scoreModifiers = [
  function campaignTrail(world, p, action, score) {
    const E = world.politics && world.politics.election;
    if (!E || !(score > 0) || !CAMPAIGN_BOOST.test(action.id)) return score;
    if (!E.candidates.includes(p.id)) return score;
    return score * (action.id === 'socialize' || action.id === 'tavern' ? 1.7 : 1.4);
  },
];

// ------------------------------------------------------------------ interventions
function reg(w, kind, fn, desc) { fn.description = desc; if (w.registerIntervention) w.registerIntervention(kind, fn, desc); }
function interventions(w) {
  reg(w, 'callElection', (world, params = {}) => {
    const st = S(world);
    if (st.election) return 'an election is already under way';
    const E = startCampaign(world, { days: params.days ?? 14, candidates: params.candidates, special: true, reason: 'called' });
    return E ? `election called for ${world.formatDate(world.tick + E.days * DAY)}` : 'no candidates could be found';
  }, 'Call a mayoral election now. params {days=14, candidates:[personIds]}');
  reg(w, 'setPolicy', (world, params = {}) => {
    const done = [];
    for (const k of AXES) if (params[k] !== undefined) { world.settings[k] = clamp(+params[k], AXIS_RANGE[k][0], AXIS_RANGE[k][1]); done.push(`${k}=${world.settings[k]}`); }
    if (params.key && AXES.includes(params.key) && params.value !== undefined) { world.settings[params.key] = clamp(+params.value, AXIS_RANGE[params.key][0], AXIS_RANGE[params.key][1]); done.push(`${params.key}=${world.settings[params.key]}`); }
    if (done.length) { const m = mayorOf(world); chron(world, 'policy', 3, `${m ? 'Mayor ' + nm(m) : 'The council'} proclaims a change of policy: ${done.join(', ')}.`, m ? [m.id] : [], townhall(world)?.id); }
    return done.join(', ') || 'no policy keys given (taxRate, watchFunding, festivalBudget, poorRelief, publicWorks)';
  }, 'Set town policy directly. params {taxRate 0.05-0.3, watchFunding 0-1, festivalBudget 0-1, poorRelief 0-1, publicWorks 0-1} or {key, value}');
  reg(w, 'coup', (world, params = {}) => coup(world, params), 'Someone seizes power by force. params {personId?} (default: the likeliest strongman)');
  reg(w, 'declareCandidacy', (world, params = {}) => {
    const st = S(world), E = st.election, p = world.people.get(params.personId);
    if (!E) return 'no election is running'; if (!p || !p.alive) return 'no such person';
    if (!E.candidates.includes(p.id)) { E.candidates.push(p.id); st.platforms[p.id] = { ...platformOf(world, p), ...(params.platform || {}) }; E.speeches[p.id] = 0; chron(world, 'election', 3, `${nm(p)} throws ${his(p)} hat in the ring for mayor at the last moment.`, [p.id]); }
    return 'candidacy registered';
  }, 'Enter a person into the running election. params {personId, platform?:{taxRate,...}}');
  reg(w, 'castVote', (world, params = {}) => {
    const E = S(world).election; if (!E) return 'no election is running';
    if (!E.candidates.includes(params.candidateId)) return 'not a candidate';
    E.ballots.set(params.voterId, params.candidateId); return 'vote recorded';
  }, 'Cast a specific ballot (e.g. the player\'s). params {voterId, candidateId}');
}

// ------------------------------------------------------------------ system
export default {
  name: 'politics',
  actions,
  scoreModifiers,
  init(world) {
    world.settings.taxRate = world.settings.taxRate ?? 0.15;
    world.settings.watchFunding = world.settings.watchFunding ?? 0.5;
    world.settings.festivalBudget = world.settings.festivalBudget ?? 0.5;
    world.settings.poorRelief = world.settings.poorRelief ?? 0.3;
    world.settings.publicWorks = world.settings.publicWorks ?? 0.35;
    const T = town(world);
    T.bridgeCondition = T.bridgeCondition ?? 0.85; T.almsBox = T.almsBox ?? 0;
    const st = world.politics = { election: null, platforms: {}, history: [], council: [], pendingSpeech: [], hidden: [], approval: 0.5, econ: 0, regime: 'council', nextElectionYear: 2, spent: { watch: 0, relief: 0, works: 0 }, thinWeeks: 0, pendingByElection: 0 };
    const m = world.living().find((p) => p.job === 'mayor') || null;
    T.mayorId = m ? m.id : null;
    T.history = st.history;
    T.council = st.council;
    if (m) { st.history.push({ mayorId: m.id, name: nm(m), startTick: world.tick, endTick: null, how: 'founding', votes: null, cast: null }); st.platforms[m.id] = platformOf(world, m); }
    seatCouncil(world, []);
    if (m) applyPolicies(world, false);
    interventions(world);
    world.on('death', (ev) => { const p = ev && ev.person; if (!p) return; if (p.id === world.town.mayorId) st.mayorDied = true; });
    world.on('marriage', () => {});
  },
  onHour(world) {
    const st = S(world), t = world.time;
    if (!st) return;
    if (st.pendingSpeech.length) resolveSpeeches(world);
    const E = st.election;
    if (E) {
      if (t.totalDays >= E.voteDay && t.hour >= 19) { tally(world); return; }
      if (t.hour === 17 && t.totalDays < E.voteDay) {
        const cs = E.candidates.map((id) => world.people.get(id)).filter((p) => p && p.alive);
        cs.forEach((c, i) => { if ((t.totalDays + i) % 3 === 0 && world.rng.chance(0.85)) giveSpeech(world, c); });
      }
      if (t.hour === 8) for (const id of E.candidates) { const c = world.people.get(id); if (c && c.alive && !isPlayer(world, c)) mood(world, c, 'campaigning', 'Running for mayor', 0.12, 2); }
    }
    if (st.mayorDied && t.hour === 10) { st.mayorDied = false; }
  },
  onDay(world) {
    const st = S(world), t = world.time;
    checkVacancy(world);
    dailyUpkeep(world);
    dailyScandals(world);
    if (!st.election && st.regime !== 'usurper' && t.year >= st.nextElectionYear && t.day >= NOMINATION_DOY && t.day < NOMINATION_DOY + 20) startCampaign(world, { days: Math.max(14, 76 - t.day) });
    if (st.regime === 'usurper' && !st.election && t.year >= st.nextElectionYear && t.day >= NOMINATION_DOY) { chron(world, 'politics', 4, 'Pressure on the strongman grows; he concedes elections and nominations are opened.', [st.usurper]); st.regime = 'council'; world.town.regime = 'council'; startCampaign(world, { days: 28 }); }
    if (st.regime === 'usurper' && w_every(world, 9) && world.rng.chance(0.5) && t.totalDays - st.coupDay < 60) {
      const sq = squareId(world); const who = world.living().filter((p) => (p.values?.freedom ?? 0.5) > 0.7 && world.ageOf(p) > 18);
      if (who.length) chron(world, 'unrest', 3, `${nm(world.rng.pick(who))} and a knot of neighbours mutter against the strongman in the square; the watch moves them on.`, [], sq);
    }
    if (t.totalDays % 7 === 3) { weekly(world); weeklyScandals(world); budgetPolicy(world); }
    if (t.totalDays % 28 === 10) { monthly(world); councilMeeting(world); }
  },
  onYear(world) {
    const st = S(world);
    st.spent = { watch: 0, relief: 0, works: 0 };
  },
};
function w_every(w, n) { return w.time.totalDays % n === 0; }
