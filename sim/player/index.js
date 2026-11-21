// Player plugin: a person the human controls, using the same plugin commands every NPC uses. No outcome is scripted: each verb sets up a circumstance
// (a conversation, an application, a request) and the existing mechanisms (social acts, labour hiring odds, goals, money) decide what happens.
//   world.player = personId | null.  Commands (queue with actor 'player'): player.create / take / release / goTo / stay / goOut / talk / message / call / post / apply / quit /
//   rent / lend / borrow / join / found / adopt / drop / respond.   Queries: status(pid), vacancies(), openings(), here(pid), reputation(pid), requests(pid).
// Autopilot: the person keeps their normal routine (habit layer); explicit player blocks (routine.insert) replace slots. Goals only spawn for the player when the player adopts them (goals engine hook).
import { createSharer } from '../systems/housing/arrivals.js';

const RENTED = new Set(['private_rent', 'council', 'housing_assoc']);
const TALK = { small: 'small', news: 'news', joke: 'joke', complain: 'complain', advise: 'advise', confide: 'confide', gossip: 'gossip', argue: 'argue', apologise: 'apologise', flirt: 'flirt', favour: 'favour', comfort: 'comfort' };
const r1 = (v) => Math.round(v * 100) / 100;
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');

export function createPlayer() {
  let W = null; const S = { talked: {}, log: [], created: false };
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
      const q = p.ext.pop; q.activity = a.employed ? 'employed' : 'unemployed'; q.fin.savings = 0; q.fin.debt = 0;
      w.ledger.transfer('metropolis', p.id, budget, 'arrival_savings');
      const f = q.fin; Object.assign(f, { cc: 0, payday: 0, pension: 0, sp: 1, priv: 0, stress: 0, noCredit: false });
      const b = w.buildings.get(hh.bid); if (b && b.residents && !b.residents.includes(p.id)) b.residents.push(p.id);
      call('money.initHousehold', { hh: hh.id }); call('life.adopt', { pid: p.id }); call('labour.initPerson', { pid: p.id, job: false });
      if (a.occ) { const r = call('labour.applyForJob', { pid: p.id, occ: a.occ, force: true }); if (!r || !r.ok) q.activity = 'unemployed'; }
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
      note(`You ${act === 'small' ? 'chatted with' : act + ' with'} ${nm(q)}: ${react}.`); return { ok: !!r, act, react, dl, dt, mood: r1(q.mood) };
    },
    'player.message': (w, a) => { const p = me(a); if (!p || !w.people.get(a.to)) return fail('no such contact'); const ok = call(a.voice ? 'comms.call' : 'comms.message', { from: p.id, to: a.to }); note(`You ${a.voice ? 'rang' : 'messaged'} ${nm(w.people.get(a.to))}.`); return { ok: !!ok }; },
    'player.post': (w, a) => { const p = me(a); if (!p) return fail('no player'); const ok = a.forum ? call('comms.forumPost', { author: p.id, kind: a.kind || 'question' }) : call('comms.post', { author: p.id, kind: a.kind || 'daily' }); note(a.forum ? 'You posted on the neighbourhood forum.' : 'You posted online.'); return { ok: !!ok }; },
    'player.apply': (w, a) => { const p = me(a); if (!p) return fail('no player'); const r = call('labour.applyForJob', { pid: p.id, occ: a.occ, bid: a.bid }); note(r && r.ok ? `You got a job as ${String(r.occ).replace(/_/g, ' ')}.` : `Application ${r && r.why === 'rejected' ? 'turned down' : 'failed'}.`); return r || fail('failed'); },
    'player.quit': (w, a) => { const p = me(a); if (!p) return fail('no player'); const ok = call('labour.quit', { pid: p.id }); if (ok) note('You handed in your notice.'); return { ok: !!ok }; },
    'player.rent': (w, a) => { const p = me(a); if (!p) return fail('no player'); const r = call('housing.rentFlat', { pid: p.id, unit: a.unit, reason: 'player' }); if (r && r.ok) note('You signed a new lease.'); return r || fail('failed'); },
    'player.lend': (w, a) => { const p = me(a); if (!p) return fail('no player'); const ok = call('money.lend', { from: p.id, to: a.to, amount: +a.amount, months: a.months || 6 }); if (ok) note(`You lent ${nm(w.people.get(a.to))} £${Math.round(a.amount)}.`); return { ok: !!ok, why: ok ? '' : 'not enough money' }; },
    'player.borrow': (w, a) => { const p = me(a); if (!p) return fail('no player'); const r = call('money.borrow', { pid: p.id, amount: +a.amount, kind: a.kind || 'bank' }); if (r && r.ok) note(`You borrowed £${Math.round(r.amount || a.amount)} (${a.kind || 'bank'}).`); return r || fail('failed'); },
    'player.join': (w, a) => { const p = me(a); if (!p) return fail('no player'); const ok = call('groups.join', { person: p.id, group: a.group }); if (ok) note('You joined a group.'); return { ok: !!ok }; },
    'player.found': (w, a) => { const p = me(a); if (!p) return fail('no player'); const r = call('groups.create', { founder: p.id, kind: a.kind || 'club', name: a.name || 'New group' }); if (r) note(`You founded ${a.name || 'a group'}.`); return { ok: !!r }; },
    'player.adopt': (w, a) => { const p = me(a); if (!p) return fail('no player'); const r = call('goals.adopt', { person: p.id, tpl: a.tpl, intensity: a.intensity ?? 0.7 }); return { ok: !!r, goal: r }; },
    'player.drop': (w, a) => ({ ok: !!call('goals.abandon', { goal: a.goal, why: 'changed my mind' }) }),
    'player.respond': (w, a) => ({ ok: !!call('goals.respond', { request: a.request, answer: a.answer }) }),
  };

  const query = {
    vacancies: () => vacancies(),
    openings: () => (W.sys.labour ? W.sys.labour.query.openings({}) : []),
    here: (pid) => { const p = W.people.get(pid); return p ? hereOf(p) : []; },
    requests: (pid) => (W.sys.goals ? W.sys.goals.query.requests(pid) : []),
    log: () => S.log.slice(-20),
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
  return { name: 'player', version: '1.0.0', deps: ['routine'], commands, query, init(w) { W = w; } };
}
export default createPlayer();
