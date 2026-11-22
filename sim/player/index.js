// Player plugin: a person the human controls, using the same plugin commands every NPC uses. No outcome is scripted: each verb sets up a circumstance
// (a conversation, an application, a request) and the existing mechanisms (social acts, labour hiring odds, goals, money) decide what happens.
//   world.player = personId | null.  Commands (queue with actor 'player'): player.create / take / release / goTo / stay / goOut / talk / message / call / post / apply / quit /
//   rent / lend / borrow / join / found / adopt / drop / respond.   Queries: status(pid), vacancies(), openings(), here(pid), reputation(pid), requests(pid).
// Autopilot: the person keeps their normal routine (habit layer); explicit player blocks (routine.insert) replace slots. Goals only spawn for the player when the player adopts them (goals engine hook).
import { createSharer } from '../systems/housing/arrivals.js';
import { LADDER, occMap } from '../systems/labour/jobs.js';

const RENTED = new Set(['private_rent', 'council', 'housing_assoc']);
const TALK = { small: 'small', news: 'news', joke: 'joke', complain: 'complain', advise: 'advise', confide: 'confide', gossip: 'gossip', argue: 'argue', apologise: 'apologise', flirt: 'flirt', favour: 'favour', comfort: 'comfort' };
// How weighty an ask is on its own (a favour or money matters more than being flattered or chatted up).
const WEIGHT = { borrow: 0.5, lend: 0.4, ask: 0.45, recruit: 0.4, apologise: 0.5, confront: 0.5, threaten: 0.6, invite: 0.4, visit: 0.4, mediate: 0.4, confide: 0.35, persuade: 0.3, gift: 0.3, befriend: 0.2, gossip: 0.15, flatter: 0.1, message: 0.15 };
const r1 = (v) => Math.round(v * 100) / 100;
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');

export function createPlayer() {
  let W = null; const S = { talked: {}, log: [], created: false, pending: [], dating: {}, asked: {} };
  const me = (a) => { const id = a && a.pid != null ? a.pid : W.player; return typeof id === 'number' ? W.people.get(id) : null; };
  const fail = (why) => ({ ok: false, why });
  const call = (name, args) => (W.commands.has(name) ? W.cmd(name, args) : false);
  const note = (text) => { S.log.push({ tick: W.tick, text }); if (S.log.length > 60) S.log.shift(); };
  const tpd = () => W.calendar.ticksPerDay || 144;
  const vacancies = () => (W.sys.housing ? W.sys.housing.query.vacancies({ all: true }).filter((u) => RENTED.has(u.tenure) && u.hh < 0) : []);

  function block(p, bid, ticks, label, ptype = 1, dest) {
    const now = W.tick, from = now + 1 + Math.max(0, travel(p, bid, ptype)), to = from + Math.max(1, ticks);
    W.cmd('routine.insert', { pid: p.id, from, to, label, ptype, bid, dest });
    return { from, to };
  }
  function travel(p, bid, ptype) { // walking time in ticks (10 min each) from straight-line distance
    if (ptype !== 1) return 3; const b = W.buildings.get(bid); if (!b || p.locationId === bid) return 0;
    const d = Math.hypot((b.door ? b.door.x : b.x) - p.x, (b.door ? b.door.y : b.y) - p.y); return Math.min(6, Math.round(d / 40));
  }
  function hereOf(p) { // who is in the same place (visible, on-map)
    const out = []; if (p.locationId == null) return out; const b = W.buildings.get(p.locationId); if (!b) return out;
    for (const q of b.occupants) if (q !== p && q.alive) out.push(q.id); return out;
  }


  // ---- hiring through the NPC mechanisms: qualifications (labour.applyForJob), experience, competition from other jobseekers, and an interview lag.
  // Sources: ONS/UKCES Employer Skills Survey (most vacancies filled in 2-6 weeks); senior posts are filled from feeder roles, not from cold applications.
  const feeders = (occ) => Object.keys(LADDER).filter((k) => LADDER[k].includes(occ));
  function experienceFactor(p, o) {
    const OCC = occMap(W), q = p.ext.pop, seniorTarget = (o.soc === 1 || (o.age && o.age[0] >= 30)) && Object.values(LADDER).some((v) => v.includes(o.id)); if (!seniorTarget) // graduate-entry professions (nurse, engineer) are entered on qualification; management is reached from feeder roles
    return { f: 1 };
    const cur = q.activity === 'employed' ? q.occ : q.lastOcc, prior = cur && OCC[cur];
    if (cur === o.id || (cur && feeders(o.id).includes(cur))) return { f: 1 };
    if (prior && prior.soc === o.soc) return { f: 0.35, why: 'they wanted a bit more experience at this level' };
    return { f: 0.03, why: 'they wanted someone who had already worked up to it' + (feeders(o.id).length ? ' (usually from ' + feeders(o.id).map((x) => x.replace(/_/g, ' ')).join(' or ') + ')' : '') };
  }
  function competition(o) { let n = 0; for (const id of W.sys.labour.query.searchers()) { const x = W.people.get(id), lo = x && x.ext.pop.lastOcc; if (id !== W.player && lo && occMap(W)[lo] && occMap(W)[lo].soc === o.soc) n++; } return n; }
  function applyFor(p, occ, bid, quiet) {
    const OCC = occMap(W), o = OCC[occ]; if (!o) return fail('unknown job');
    if (p.ext.pop && p.ext.pop.activity === 'retired') return { ok: false, why: 'you are retired', retired: true }; // the labour model never takes retirees back (resolveApplications skips them), so say so up front instead of a silent no-reply
    if (S.pending.filter((x) => x.pid === p.id).length >= 3) return fail('you already have three applications in');
    if (S.pending.some((x) => x.pid === p.id && x.occ === occ)) return fail('you have already applied for that');
    const lag = W.rngFor('player.lag', p.id, W.tick).int(5, 21); S.pending.push({ pid: p.id, occ, bid, due: W.tick + lag * tpd(), sent: W.tick });
    note(`You applied for ${occ.replace(/_/g, ' ')}. Expect to hear back in a week or two.`); return { ok: true, pending: true, days: lag, occ };
  }
  function resolveApplications() {
    for (let i = S.pending.length - 1; i >= 0; i--) {
      const a = S.pending[i]; if (a.due > W.tick) continue; S.pending.splice(i, 1);
      const p = W.people.get(a.pid), o = occMap(W)[a.occ]; if (!p || !p.alive || !o) continue; const q = p.ext.pop;
      if (q.activity === 'retired') continue; const ex = experienceFactor(p, o), nC = competition(o), odds = ex.f / (1 + 0.12 * nC);
      const r = call('labour.applyForJob', { pid: p.id, occ: a.occ, bid: a.bid, odds });
      const lbl = a.occ.replace(/_/g, ' ');
      if (r && r.ok) note(`You got the ${lbl} job after interview.`);
      else { const why = r && r.why === 'no vacancy' ? 'the post had been filled' : ex.why || (nC > 3 ? `competition was stiff (${nC} other jobseekers in the field)` : 'they went with someone else'); note(`Turned down for ${lbl}: ${why}.`);
        W.emit('labour.applied', { actors: [p.id], salience: 0.5, tags: ['labour', 'setback'], payload: { ok: false, occ: a.occ, why } }); }
    }
  }

  // ---- dating: an app profile (matches arrive over days from the comms dating pool) and asking out people you already know.
  // Hand-tuned: MATCH_PER_DAY = expected matches a day for an active profile (~1.4 a week, the order of magnitude app users report); nothing else is forced:
  // who can match is the comms dating pool (age band, orientation, area), and what a match turns into is decided by life.askOut / messaging as for any NPC.
  const MATCH_PER_DAY = 0.2, ASK_COOLDOWN_DAYS = 21;
  const single = (p) => !!(p && p.alive && p.ext.life && !p.ext.life.part);
  const tieOf = (a, b) => (W.sys.social ? W.sys.social.query.tie(a, b) : null);
  function personLine(q) { return { id: q.id, name: nm(q), age: Math.floor(W.ageOf(q)), job: (q.job || '').replace(/_/g, ' ') }; }
  function datable(pid) { // people you know (met properly), single, and mutually plausible by age and orientation; not kin, not asked recently
    const p = W.people.get(pid), out = []; if (!single(p) || W.ageOf(p) < 17 || !W.sys.social) return out;
    for (const t of W.sys.social.query.ties(pid)) {
      if (typeof t.o !== 'number' || t.k === 'kin' || t.k === 'family') continue; const q = W.people.get(t.o);
      if (!single(q) || !W.sys.social.query.attractionPossible(pid, q.id)) continue; if (W.tick - (S.asked[pid + ':' + q.id] ?? -1e9) < ASK_COOLDOWN_DAYS * tpd()) continue;
      out.push({ ...personLine(q), l: t.l, c: t.c, rel: t.r || t.k });
    }
    return out.sort((a, b) => b.l - a.l);
  }
  function datingMatches(pid) { const d = S.dating[pid]; if (!d) return []; return d.matches.map((m) => { const q = W.people.get(m.id); if (!q || !q.alive) return null; const t = tieOf(pid, q.id); return { ...personLine(q), l: t ? t.l : null, lv: t ? t.lv : 0, daysAgo: Math.round((W.tick - m.t) / tpd()), taken: !single(q) }; }).filter(Boolean); }
  function dailyDating() {
    for (const [k, d] of Object.entries(S.dating)) {
      const pid = +k, p = W.people.get(pid); if (!d.on || !p || !p.alive) continue; if (!single(p)) { d.on = false; continue; }
      const rng = W.rngFor('player.match', pid, W.tick); if (!rng.chance(MATCH_PER_DAY)) continue;
      const pool = (W.sys.comms ? W.sys.comms.query.datingPool(pid, 14) : []).filter((x) => !d.matches.some((m) => m.id === x.id) && single(W.people.get(x.id)));
      if (!pool.length) continue; let tot = 0; for (const x of pool) tot += x.score; let r = rng.next() * tot, pick = pool[0]; for (const x of pool) { r -= x.score; if (r <= 0) { pick = x; break; } }
      if (!call('comms.matchOnApp', { a: pid, b: pick.id })) continue; d.matches.push({ id: pick.id, t: W.tick }); const q = W.people.get(pick.id);
      note(`New match on the app: ${nm(q)}, ${Math.floor(W.ageOf(q))}.`); W.emit('player.match', { actors: [pid, pick.id], salience: 0.5, tags: ['romance', 'online'], payload: { via: 'app' } });
    }
  }
  function settle(w, a) {
      const rng = w.rngFor('player.create'); const u = (w.lf.housing.byId.get ? w.lf.housing.byId.get(a.unit) : w.lf.housing.byId[a.unit]);
      if (!u || u.hh >= 0 || !RENTED.has(u.tenure)) return fail('that home is no longer available');
      const budget = Math.max(0, Math.round(a.budget ?? 3000)); if (budget < u.rent * 0.6) return fail('not enough for the deposit and first rent');
      const seg = a.seg || 'early_career';
      const hh = { id: w.lf.households.length, unit: u.id, bid: u.bid, seg, arch: 'one_person_u66', members: [], tenure: u.tenure, rentPcm: u.rent, mortgagePcm: 0, income: { gross: 0, net: 0, benefits: 0 }, cars: 0, dogs: 0, cats: 0, since: w.tick, group: 'white_british', landlord: u.landlord, address: u.address, bedrooms: u.bedrooms, sav: { savings: 0, debt: 0, arrears: 0, spend: 0 } };
      w.lf.households.push(hh); u.hh = hh.id; u.since = w.tick; u.voidUntil = 0; u.listed = false; u.lastRise = w.tick;
      const age = Math.max(16, Math.min(90, a.age ?? 28)), p = createSharer(w, rng, hh, age);
      p.firstName = String(a.first || 'Alex').slice(0, 20); p.lastName = String(a.last || 'Newcomer').slice(0, 24); p.sex = a.sex === 'M' ? 'M' : 'F';
      p.birthTick = w.tick - Math.round(age * w.calendar.ticksPerYear) - rng.int(0, 300); p.ext.pop.role = 'head'; p.ext.pop.birthplace = a.from || p.ext.pop.birthplace;
      const q = p.ext.pop; q.activity = 'unemployed'; p.job = 'unemployed'; q.occ = null; q.fin.savings = 0; q.fin.debt = 0;
      w.ledger.transfer('metropolis', p.id, budget, 'arrival_savings');
      const f = q.fin; Object.assign(f, { cc: 0, payday: 0, pension: 0, sp: 1, priv: 0, stress: 0, noCredit: false });
      const b = w.buildings.get(hh.bid); if (b && b.residents && !b.residents.includes(p.id)) b.residents.push(p.id);
      call('money.initHousehold', { hh: hh.id }); call('life.adopt', { pid: p.id }); call('labour.initPerson', { pid: p.id, job: false });
      q.search = { since: w.tick, kind: 'unemp', tries: 0 }; if (a.occ) applyFor(p, a.occ, undefined, true); // no instant job: the newcomer applies like anyone else and waits to hear back
      call('routine.adopt', { pid: p.id });
      w.emit('housing.moved_in', { actors: [p.id], place: hh.bid, objects: [hh.id], salience: 0.35, tags: ['housing', 'life', 'arrival'], payload: { from: 'outside', reason: 'arrival', unit: u.id, tenure: u.tenure } });
      return { ok: true, pid: p.id, address: u.address };

  }
  const commands = {
    'player.create': (w, a) => { const r = settle(w, a); if (r.ok) { w.player = r.pid; S.created = true; note(`You moved into ${r.address}.`); } return r; },
    // God-mode circumstance: someone with an unusually outgoing, agreeable personality moves in. What they do with the street is up to the mechanisms.
    'player.charismaticNewcomer': (w, a) => {
      const rng = w.rngFor('player.newcomer'), u = vacancies()[0]; if (!u) return fail('no vacant home');
      const first = rng.pick(['Jordan', 'Amara', 'Luca', 'Priya', 'Noor', 'Dani', 'Kofi', 'Mei']), last = rng.pick(['Rivers', 'Okoye', 'Santos', 'Hale', 'Moreau', 'Bianchi', 'Nakamura', 'Reyes']);
      const r = settle(w, { first, last, age: a.age ?? 31, sex: rng.chance(0.5) ? 'F' : 'M', seg: 'settled_professionals', budget: 8000, unit: u.id, employed: true }); if (!r.ok) return r;
      const p = w.people.get(r.pid); Object.assign(p.personality, { extraversion: 0.97, agreeableness: 0.85, openness: 0.8, neuroticism: 0.2 }); if (p.traits && !p.traits.includes('gossip')) p.traits.push('charming'); return r;
    },
    'player.take': (w, a) => { const p = w.people.get(a.pid); if (!p || !p.alive || !p.ext.pop) return fail('no such resident'); if (!p.ext.rt) call('routine.init', { pid: p.id }); w.player = p.id; note(`You are now ${nm(p)}.`); return { ok: true, pid: p.id }; },
    'player.release': (w) => { w.player = null; return { ok: true }; },
    'player.goTo': (w, a) => { const p = me(a); if (!p || !p.ext.rt) return fail('no player'); if (!w.buildings.get(a.bid)) return fail('no such place'); const r = block(p, a.bid, Math.round((a.hours ?? 2) * 6), a.label || `Heading to ${w.buildings.get(a.bid).name}`); return { ok: true, ...r }; },
    'player.stay': (w, a) => { const p = me(a); if (!p || !p.ext.rt) return fail('no player'); const bid = p.locationId ?? p.homeId; const r = block(p, bid, Math.round((a.hours ?? 1) * 6), a.label || 'Taking it easy'); return { ok: true, ...r }; },
    'player.goOut': (w, a) => { const p = me(a); if (!p || !p.ext.rt) return fail('no player'); const dest = a.dest || 'city_centre_retail_leisure'; const r = block(p, null, Math.round((a.hours ?? 4) * 6), `Out in the city (${dest.replace(/_/g, ' ')})`, 3, dest); return { ok: true, ...r }; },
    'player.talk': (w, a) => {
      const p = me(a), q = w.people.get(a.to); if (!p || !q || !q.alive) return fail('no one there');
      if (p.locationId == null || p.locationId !== q.locationId) return fail('they are not here');
      const last = S.talked[q.id] ?? -99; if (w.tick - last < 3) return fail('give it a little while first'); S.talked[q.id] = w.tick;
      const act = TALK[a.act] || 'small'; const before = w.sys.social ? w.sys.social.query.tie(q.id, p.id) : null;
      const r = call('social.converse', { a: p.id, b: q.id, act }); const after = w.sys.social ? w.sys.social.query.tie(q.id, p.id) : null;
      const dl = before && after ? r1((after.l ?? 0) - (before.l ?? 0)) : null, dt = before && after ? r1((after.t ?? 0) - (before.t ?? 0)) : null;
      const react = dl == null ? 'neutral' : dl > 0.02 ? 'warm' : dl < -0.02 ? 'cool' : 'neutral';
      note(`You ${act === 'small' ? 'chatted with' : act + ' with'} ${nm(q)}: ${react}.`); return { ok: !!r, act, react, dl, dt, mood: r1(q.mood), l: after ? after.l : null, lv: after ? after.lv : 0, met: !!(after && after.lv >= 2 && !(before && before.lv >= 2)) };
    },
    'player.message': (w, a) => {
      const p = me(a), q = w.people.get(a.to); if (!p || !q) return fail('no such contact');
      const before = tieOf(q.id, p.id), ok = call(a.voice ? 'comms.call' : 'comms.message', { from: p.id, to: a.to }), after = tieOf(q.id, p.id);
      const dl = before && after ? r1((after.l ?? 0) - (before.l ?? 0)) : null; note(`You ${a.voice ? 'rang' : 'messaged'} ${nm(q)}.`);
      return { ok: !!ok, voice: !!a.voice, react: dl == null ? 'neutral' : dl > 0.02 ? 'warm' : dl < -0.02 ? 'cool' : 'neutral', lv: after ? after.lv : 0 };
    },
    'player.datingProfile': (w, a) => {
      const p = me(a); if (!p) return fail('no player'); if (!single(p)) return fail('you are already seeing someone');
      const d = S.dating[p.id] || (S.dating[p.id] = { on: false, since: w.tick, matches: [] }); const on = a.on !== false; if (on && !d.on) d.since = w.tick; d.on = on;
      const pool = w.sys.comms ? w.sys.comms.query.datingPool(p.id, 30).length : 0; note(on ? 'You set up a dating profile.' : 'You paused your dating profile.');
      return { ok: true, on, pool, matches: d.matches.length };
    },
    // Ask out someone you know (in person or by message). Only people you have really met, who are single and could plausibly be interested (age, orientation).
    'player.askOut': (w, a) => {
      const p = me(a), q = w.people.get(a.to); if (!p || !q || !q.alive) return fail('no such person'); if (!single(p)) return fail('you are already seeing someone');
      if (!single(q)) return fail('they are already seeing someone'); const t = tieOf(q.id, p.id); if (!t || t.lv < 2) return fail('you have not really met them yet');
      if (!w.sys.social.query.attractionPossible(p.id, q.id)) return { ok: false, why: 'not a match', plausible: false };
      const key = p.id + ':' + q.id, last = S.asked[key] ?? -1e9; if (w.tick - last < ASK_COOLDOWN_DAYS * tpd()) return { ok: false, why: 'asked recently', days: Math.ceil(ASK_COOLDOWN_DAYS - (w.tick - last) / tpd()) };
      // the inputs life.askOut weighs (read before the call, which dents attraction on a no): lets the UI say WHY it was a yes or a no
      const rl0 = w.getRel(p, q), fx = { att: rl0.attraction || 0, aff: rl0.affinity || 0, fam: rl0.familiarity || 0, gap: Math.round(Math.abs(w.ageOf(p) - w.ageOf(q))) };
      S.asked[key] = w.tick; const r = call('life.askOut', { pid: p.id, target: q.id });
      if (r && r.ok) note(`${nm(q)} said yes: you are seeing each other.`); else note(`${nm(q)} turned you down.`);
      return { ok: !!(r && r.ok), couple: !!(r && r.ok), low: !!(r && r.p != null && r.p < 0.1), p: r && r.p != null ? Math.round(r.p * 100) / 100 : null, fx, l: t.l, inPerson: p.locationId != null && p.locationId === q.locationId };
    },
    'player.buy': (w, a) => {
      const p = me(a); if (!p || !p.ext.rt) return fail('no player'); const price = a.item === 'pint' ? 5 : 3.2; if (p.money < price) return fail('not enough money');
      w.ledger.transfer(p.id, 'metropolis', price, 'discretionary'); const bid = p.locationId ?? p.homeId, r = block(p, bid, 3, a.item === 'pint' ? 'Having a drink' : 'Having a coffee'); return { ok: true, price, item: a.item || 'coffee', ...r };
    },
    'player.post': (w, a) => { const p = me(a); if (!p) return fail('no player'); const ok = a.forum ? call('comms.forumPost', { author: p.id, kind: a.kind || 'question' }) : call('comms.post', { author: p.id, kind: a.kind || 'daily' }); note(a.forum ? 'You posted on the neighbourhood forum.' : 'You posted online.'); return { ok: !!ok }; },
    'player.apply': (w, a) => { const p = me(a); if (!p) return fail('no player'); return applyFor(p, a.occ, a.bid); },
    'player.quit': (w, a) => { const p = me(a); if (!p) return fail('no player'); const ok = call('labour.quit', { pid: p.id }); if (ok) note('You handed in your notice.'); return { ok: !!ok }; },
    'player.rent': (w, a) => { const p = me(a); if (!p) return fail('no player'); const r = call('housing.rentFlat', { pid: p.id, unit: a.unit, reason: 'player' }); if (r && r.ok) note('You signed a new lease.'); return r || fail('failed'); },
    'player.lend': (w, a) => { const p = me(a); if (!p) return fail('no player'); const ok = call('money.lend', { from: p.id, to: a.to, amount: +a.amount, months: a.months || 6 }); if (ok) note(`You lent ${nm(w.people.get(a.to))} £${Math.round(a.amount)}.`); return { ok: !!ok, why: ok ? '' : 'not enough money' }; },
    'player.borrow': (w, a) => {
      const p = me(a); if (!p) return fail('no player'); const r = call('money.borrow', { pid: p.id, amount: +a.amount, kind: a.kind || 'bank' }); if (r && r.ok) note(`You borrowed £${Math.round(r.amount || a.amount)} (${a.kind || 'bank'}).`);
      if (r && r.ok) return r; const f = (p.ext.pop && p.ext.pop.fin) || {}, room = w.sys.money && w.sys.money.query.creditRoom ? w.sys.money.query.creditRoom(p.id) : null; // why a lender said no: the same inputs the money plugin uses (credit record, income-based limit, what is already owed)
      return { ok: false, why: 'declined', kind: a.kind || 'bank', noCredit: !!f.noCredit, owed: Math.round((f.cc || 0) + (f.payday || 0)), cc: Math.round(f.cc || 0), payday: Math.round(f.payday || 0), monthNet: Math.round(f.monthNet || 0), room: room == null ? null : Math.round(room) };
    },
    'player.join': (w, a) => {
      const p = me(a); if (!p) return fail('no player'); const gq = w.sys.goals && w.sys.goals.query, g = gq && gq.group(a.group); if (!g) return fail('that group no longer exists');
      if (gq.groupsOf(p.id).some((x) => x.id === g.id)) return fail('you are already in that group'); const ok = call('groups.join', { person: p.id, group: a.group });
      if (ok) note(`You joined ${g.name}.`); return { ok: !!ok, name: g.name, kind: g.kind, size: g.size, venue: g.venue ?? null, why: ok ? '' : 'it is not taking members' };
    },
    'player.found': (w, a) => { const p = me(a); if (!p) return fail('no player'); const r = call('groups.create', { founder: p.id, kind: a.kind || 'club', name: a.name || 'New group' }); if (r) note(`You founded ${a.name || 'a group'}.`); return { ok: !!r }; },
    'player.adopt': (w, a) => {
      const p = me(a); if (!p) return fail('no player'); const gq = w.sys.goals.query; if (gq.goalsOf(p.id).some((g) => g.tpl === a.tpl && g.status === 'active')) return fail('you are already working on that');
      const r = call('goals.adopt', { person: p.id, tpl: a.tpl, intensity: a.intensity ?? 0.7 }); if (r) note('You set a goal.'); return { ok: !!r, goal: r, why: r ? '' : 'there is nothing to plan for that right now' };
    },
    'player.drop': (w, a) => ({ ok: !!call('goals.abandon', { goal: a.goal, why: 'changed my mind' }) }),
    'player.respond': (w, a) => ({ ok: !!call('goals.respond', { request: a.request, answer: a.answer }) }),
  };

  const query = {
    vacancies: () => vacancies(),
    openings: () => (W.sys.labour ? W.sys.labour.query.openings({}) : []),
    here: (pid) => { const p = W.people.get(pid); return p ? hereOf(p) : []; },
    requests: (pid) => (W.sys.goals ? W.sys.goals.query.requests(pid) : []),
    log: () => S.log.slice(-20),
    datable: (pid) => datable(pid),
    dating: (pid) => { const d = S.dating[pid]; return { on: !!(d && d.on), since: d ? d.since : null, matches: datingMatches(pid), pool: W.sys.comms ? W.sys.comms.query.datingPool(pid, 30).length : 0 }; },
    pending: (pid) => S.pending.filter((x) => x.pid === pid).map((x) => ({ occ: x.occ, daysLeft: Math.max(0, Math.round((x.due - W.tick) / tpd())) })),
    // Requests aimed at the player, ranked by how much they matter (the asker's real goal, how warm the tie is, how weighty the ask) so the UI can
    // surface a few meaningful ones and batch the rest. Pure presentation: nothing is answered or dropped here; unanswered requests still lapse as 'no reply'.
    inbox: (pid) => {
      const sq = W.sys.social && W.sys.social.query, gq = W.sys.goals && W.sys.goals.query; if (!gq) return [];
      return gq.requests(pid).map((r) => {
        const g = gq.goal(r.goal), t = sq ? sq.tie(pid, r.from) : null; let score = WEIGHT[r.move] ?? 0.3;
        if (g && !g.mundane) score += 0.35; if (t) score += Math.min(0.4, 0.15 * (t.lv || 0)) + Math.max(-0.1, Math.min(0.2, t.l || 0));
        return { ...r, tpl: g ? g.tpl : '', v: r.v || '', topic: g && !g.mundane && g.tpl !== 'ad_hoc_move' ? g.phrase : '', score: r1(score), notable: score >= 0.7 };
      }).sort((a, b) => b.score - a.score || a.until - b.until);
    },
    // How the neighbourhood sees the player: beliefs others hold about them (social beliefs), and the mean warmth of ties towards them.
    reputation: (pid) => {
      const out = { beliefs: {}, known: 0, warm: 0, cool: 0, rep: 0 }; const sq = W.sys.social && W.sys.social.query; if (!sq) return out; out.rep = r1(sq.reputation(pid) || 0);
      for (const q of W.people.values()) {
        if (!q.alive || q.id === pid) continue;
        const bs = sq.beliefs(q.id, { about: pid }); for (const b of bs) out.beliefs[b.k] = (out.beliefs[b.k] || 0) + 1;
        const t = sq.tie(q.id, pid); if (t && t.lv >= 2) { out.known++; if (t.l > 0.25) out.warm++; else if (t.l < -0.15) out.cool++; }
      }
      return out;
    },
  };
  return { name: 'player', version: '1.0.0', deps: ['routine'], commands, query, clocks: { day: () => { resolveApplications(); dailyDating(); } }, init(w) { W = w; for (const [t, d] of [['player.match', 'A dating-app match for the player']]) if (!w.events.registry.has(t)) w.registerEventType(t, { doc: d, payload: { kind: 'object' } }); } };
}
export default createPlayer();
