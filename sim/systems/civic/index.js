// CIVIC plugin (W2-C): the council, ward politics, casework, planning, campaigns. The borough is off-map; Larkfield is one three-member ward.
//   ELECTIONS: all-out every 4 years on the first Thursday of May (2027, 2031 ...). Registration (owners > private renters; recent movers lag), turnout (age, tenure, education, community
//     attachment, recent contact with the council or a campaign), vote choice (spatial: voter values vs party position + local grievance + incumbency + known candidates). Turnout is an OUTPUT (~30% target).
//     Evidence: Electoral Commission/Ipsos on registration (private renters ~ 15 points below owners) and age/tenure turnout gaps; 2023 English locals 32% turnout; Rallings & Thrasher.
//   SERVICES: library hours, youth club, bins, roads, council housing repairs, noise/enforcement. A funding cut lands hardest on discretionary services (youth and library) as CIPFA/Unison/YMCA
//     show for 2010-19; service level drives case-resolution speed, fly-tipping, antisocial behaviour (via crime), and grievances.
//   CASEWORK: issues arise from service failure (missed bins, potholes, fly-tipping, damp in council homes, noise); residents decide to report by conscientiousness, attachment and trust;
//     council resolves at a service-dependent pace; chasing by a councillor speeds it; satisfaction updates personal trust in the council.
//   PLANNING: applications (extension, HMO, flats, takeaway licence, pub licence) -> neighbours notified -> objections/supports by proximity, tenure, values -> residents' association position
//     (from the goals plugin's association group) -> committee decision: policy fit + material objections + electoral pressure. National approval ~86% (MHCLG planning statistics).
//   CAMPAIGNS: grievance accumulators (library cut, missed bins, child road injury, contested development) found a campaign when a committed leader exists; outcome depends on signatures,
//     forum reach and proximity to the next election (councillors respond to electoral threat).
//   QUERY world.sys.civic.query: service(k) services() councillors() parties() election() cases(n) planning(n) campaigns() stats() trust(pid) feed(n)
//   CMD   god: civic.councilCuts{pct,service?} civic.newDevelopment{kind,n,street} civic.callElection{}   player: civic.complain{pid,kind} civic.object{pid,app} civic.standCouncillor{pid,party} civic.joinCampaign{pid,id}
//   EVENTS civic.planning_application civic.planning_decision civic.election civic.councillor_elected civic.service_cut civic.service_restored civic.campaign civic.campaign_outcome civic.bins civic.case_closed
import { PARTIES, SERVICES, APP_KINDS, CASE_KINDS } from './data.js';

const D = 144, clamp = (x, a, b) => (x < a ? a : x > b ? b : x), sig = (z) => 1 / (1 + Math.exp(-z));
const EV = [['civic.planning_application', 'A planning application was lodged nearby', { kind: 'string', n: 'number' }], ['civic.planning_decision', 'The council decided a planning application', { kind: 'string', outcome: 'string', objections: 'number' }],
  ['civic.election', 'A ward election was held', { turnout: 'number', winner: 'string' }], ['civic.councillor_elected', 'A resident was elected as a councillor', { party: 'string' }], ['civic.service_cut', 'A council service was cut', { service: 'string', pct: 'number' }], ['civic.service_lost', 'A regular user lost a council service they relied on', { service: 'string', why: 'string' }],
  ['civic.service_restored', 'A council service was partly restored', { service: 'string' }], ['civic.campaign', 'A local campaign began', { cause: 'string', kind: 'string' }], ['civic.campaign_outcome', 'A local campaign ended', { kind: 'string', won: 'boolean' }],
  ['civic.bins', 'Bin collections failed on a street', { street: 'number' }], ['civic.case_closed', 'A council case was closed', { kind: 'string', days: 'number' }]];
export const PARAMS = { turnoutIntercept: -0.75, regOwner: 0.95, regRenter: 0.82, objBase: 1, nationalSwingSd: 0.12, grvThreshold: 6, grvHalfLifeDays: 70 };

export function createCivic() {
  let W = null, C = null;
  const R = (...k) => W.rngFor('civic', ...k);
  const ageOf = (p) => W.ageOf(p);
  const civ = (p) => p.ext.civ || (p.ext.civ = { trust: 0.5, reg: -1, voted: 0, contact: -1e9, cllr: 0, member: 0, signed: 0 });
  const hhOf = (p) => (p.ext.pop ? W.lf.households[p.ext.pop.hh] : null);
  const streetOf = (p) => { const hh = hhOf(p), b = hh && W.buildings.get(hh.bid); return b && b.lf ? b.lf.streetId : -1; };
  const streetName = (sid) => (W.map.lf.streets[sid] || {}).name || 'the High Street';
  const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
  const owner = (hh) => hh && (hh.tenure === 'owned_outright' || hh.tenure === 'mortgage');
  const chron = (type, imp, text, people = []) => W.chronicle.add({ type, importance: imp, text, people });
  const feedAdd = (text, imp = 2) => { C.feed.push({ t: W.tick, text }); if (C.feed.length > 60) C.feed.shift(); if (imp >= 2) chron('civic', imp, text); };
  const monthsToElection = () => Math.max(0, (C.nextElection - W.tick) / (30.4 * D));
  const ruling = () => C.borough.control;

  // ------------------------------------------------------------------ services & budget
  function applyCut(pct, only) { // pct of net budget removed; discretionary services take the larger share (CIPFA / Unison / YMCA 2010-19)
    for (const [k, S] of Object.entries(SERVICES)) { if (only && only !== k) continue; const before = C.svc[k]; C.svc[k] = clamp(before * (1 - pct * S.exposure), 0.15, 1); const d = before - C.svc[k];
      if (d > 0.04) { const e = W.emit('civic.service_cut', { salience: 0.4, tags: ['civic', 'closure', 'community_problem'], payload: { service: k, pct: +(d / before).toFixed(2) } }); C.cutEv[k] = e; feedAdd(S.cutText(C.svc[k]), 3); if (k === 'library') libraryLost(e, d / before); C.grv[k] = (C.grv[k] || 0) + 14 * (d / before) * 4; } }
  }
  // Cutting library hours lands on its regulars (visits ~ every 10 days or more, set in routine): older people lose a warm, free place to meet people, students and
  // children a quiet study space and internet access (Libraries Taskforce / CILIP / Carnegie UK: older, jobless and young users are the heaviest library users).
  // Each regular gets a caused event + a small stress (the routine layer separately cuts their visits in proportion to the hours lost).
  function libraryLost(cause, frac) {
    for (const p of W.living()) {
      const lv = p.ext.rt && p.ext.rt.life && p.ext.rt.life.lv, use = lv ? lv.library : 0; if (!(use >= 0.6)) continue;
      const a = ageOf(p), why = a >= 65 ? 'lost a warm place to meet people' : a < 25 ? 'lost a quiet place to study' : 'lost a free place to use the computers';
      W.emit('civic.service_lost', { actors: [p.id], place: null, cause, salience: 0.15, tags: ['civic', 'community_problem'], payload: { service: 'library', why } });
      if (W.commands.has('health.stress')) W.cmd('health.stress', { pid: p.id, amount: +(0.1 * frac * Math.min(1.5, use)).toFixed(3), why: 'the library cut', cause });
    }
  }
  function annual() { // borough budget: central grant pressure (exogenous, random walk) is passed down via the ruling party's priorities
    const r = R(W.tick, 'budget'); C.borough.grant = clamp(C.borough.grant + r.gauss(-0.01, 0.03), -0.2, 0.15);
    if (C.borough.grant < -0.03) applyCut(-C.borough.grant * (ruling() === 'Conservative' || ruling() === 'Reform UK' ? 0.9 : 0.6), null);
    else if (C.borough.grant > 0.02) for (const k of Object.keys(C.svc)) if (C.svc[k] < 1) { C.svc[k] = clamp(C.svc[k] + C.borough.grant * 1.5, 0.15, 1); W.emit('civic.service_restored', { salience: 0.2, tags: ['civic'], payload: { service: k } }); }
  }

  // ------------------------------------------------------------------ casework
  function openCase(kind, p, sid, cause, o = {}) {
    const K = CASE_KINDS[kind], c = civ(p); if (!K) return null; if (C.cases.some((x) => x.pid === p.id && x.kind === kind && !x.done)) return null;
    const cs = { id: C.seq++, kind, pid: p.id, sid, t0: W.tick, done: 0, chased: 0, target: K.days, cause: cause || 0, ...o }; C.cases.push(cs); C.n.opened[kind] = (C.n.opened[kind] || 0) + 1; c.contact = W.tick; return cs;
  }
  const reporterOdds = (p) => { const c = civ(p), pe = p.personality; return clamp(0.5 * (0.4 + pe.conscientiousness) * (0.4 + p.values.community) * (0.5 + c.trust), 0, 0.9); };
  function issuesDaily(r) {
    const sids = Object.keys(W.map.lf.streets).map(Number);
    for (const sid of sids) {
      const ppl = (W.soc.street.get(sid) || []); if (!ppl.length) continue;
      const pb = 0.012 + 0.07 * (1 - C.svc.bins) ** 1.5; // bins: a missed collection on a street
      if (r.next() < pb / 3.5) { const e = W.emit('civic.bins', { salience: 0.15, tags: ['civic', 'community_problem'], payload: { street: sid } }); C.grv.bins = (C.grv.bins || 0) + 0.25; for (let i = 0; i < 3; i++) { const p = W.people.get(ppl[(r.next() * ppl.length) | 0]); if (p && ageOf(p) >= 18 && r.next() < reporterOdds(p)) openCase('bins', p, sid, e); } }
      if (r.next() < (0.002 + 0.01 * (1 - C.svc.roads)) / 3) { const p = W.people.get(ppl[(r.next() * ppl.length) | 0]); if (p && ageOf(p) >= 18 && r.next() < reporterOdds(p) * 1.2) openCase('pothole', p, sid); }
      if (r.next() < (0.001 + 0.012 * (1 - C.svc.bins) + 0.004 * (1 - C.svc.noise)) / 3) { const p = W.people.get(ppl[(r.next() * ppl.length) | 0]); C.grv.flytip = (C.grv.flytip || 0) + 0.15; if (p && ageOf(p) >= 18 && r.next() < reporterOdds(p)) openCase('flytip', p, sid); }
    }
  }
  function casesDaily(r) {
    for (const c of C.cases) {
      if (c.done) continue; const p = W.people.get(c.pid), K = CASE_KINDS[c.kind], age = (W.tick - c.t0) / D, svc = C.svc[K.service] ?? 1;
      if (!p) { c.done = 1; continue; }
      if (!c.chased && age > c.target * 1.2 && C.cllrs.length) { const pc = civ(p); if (r.next() < 0.25 * (0.5 + p.values.community)) { c.chased = 1; pc.contact = W.tick; C.n.chased++; } } // asks the ward councillor to chase
      if (r.next() < (1 / K.days) * (0.25 + 0.95 * svc) * (c.chased ? 1.6 : 1)) {
        c.done = 1; const days = Math.round(age), ok = days <= c.target * 1.5; C.n.closed[c.kind] = (C.n.closed[c.kind] || 0) + 1; C.days.push(days); if (C.days.length > 500) C.days.shift(); if (ok) C.n.inTarget++;
        const pc = civ(p); pc.trust = clamp(pc.trust + (ok ? 0.05 : -0.04), 0.05, 1); if (c.kind === 'damp' || c.kind === 'repair') W.cmd('housing.repair', { unit: c.unit });
        if (days > 7) W.emit('civic.case_closed', { actors: [p.id], salience: 0.04, cause: c.cause, tags: ['civic'], payload: { kind: c.kind, days } });
      } else if (age > c.target * 2 && !c.fp && r.next() < 0.05) { c.fp = 1; const pc = civ(p); pc.trust = clamp(pc.trust - 0.05, 0.05, 1); const ps = W.soc.ppl.get(p.id); if (ps && ps.fm) W.cmd('comms.forumPost', { author: p.id, kind: 'council' }); }
    }
    if (W.time.dow === 0) C.cases = C.cases.filter((c) => !c.done || W.tick - c.t0 < 60 * D);
  }

  // ------------------------------------------------------------------ planning
  function newApp(kind, sid, o = {}) {
    const K = APP_KINDS[kind], r = R(W.tick, 'app', C.seq); sid = sid ?? +r.pick(Object.keys(W.map.lf.streets)); const ppl = (W.soc.street.get(sid) || []); const target = ppl.length ? W.people.get(r.pick(ppl)) : null; const site = target ? W.buildings.get(target.homeId) : null;
    const app = { id: C.seq++, kind, sid, t0: W.tick, decide: W.tick + Math.round((K.weeks + r.int(-1, 2)) * 7 * D), n: o.n || K.n, fit: clamp(K.fit + r.gauss(0, 0.1), 0.2, 1), obj: [], sup: [], mat: 0, status: 'open', bid: site ? site.id : null, ra: 0, name: o.name || K.name(r) };
    if (o.fit != null) app.fit = o.fit; C.apps.push(app); C.n.apps++;
    const eid = W.emit('civic.planning_application', { place: app.bid, salience: K.major ? 0.35 : 0.12, tags: ['civic', 'visible'], payload: { kind, n: app.n } }); app.eid = eid;
    notify(app, r); feedAdd(`Planning application lodged on ${streetName(sid)}: ${app.name}.`, K.major ? 2 : 1); return app;
  }
  function notify(app, r) { // neighbours on the street (and the residents' association) hear of it; each decides whether to write in
    const K = APP_KINDS[app.kind], ppl = (W.soc.street.get(app.sid) || []).concat((W.soc.street.get(app.sid === 1 ? 2 : 1) || []).filter(() => r.next() < 0.15)); const site = app.bid != null ? W.buildings.get(app.bid) : null;
    for (const id of ppl) { const p = W.people.get(id); if (!p || !p.alive || ageOf(p) < 18) continue; const hh = hhOf(p), c = civ(p), a = ageOf(p);
      const near = site && p.homeId != null && W.buildings.get(p.homeId) ? Math.hypot(W.buildings.get(p.homeId).x - site.x, W.buildings.get(p.homeId).y - site.y) : 40; const prox = near < 15 ? 2.2 : near < 40 ? 1 : 0.5;
      const po = K.objBase * PARAMS.objBase * (0.3 + p.values.community) * (0.3 + p.values.tradition) * (owner(hh) ? 1.4 : 0.55) * (a > 45 ? 1.25 : a < 30 ? 0.6 : 1) * prox * (0.5 + c.trust * 0.5 + 0.3) * 0.12;
      if (r.next() < po) { app.obj.push(p.id); c.contact = W.tick; }
      else if (K.supportBase && r.next() < K.supportBase * (hh && hh.rentPcm && hh.fin && hh.fin.income && hh.rentPcm / hh.fin.income > 0.4 ? 3 : 1) * (a < 40 ? 1.6 : 0.5) * prox) app.sup.push(p.id);
    }
    app.mat = Math.round(app.obj.length * 0.6);
    // residents' association (the goals plugin's association group) takes a position when most active members object
    const g = W.sys.goals ? W.sys.goals.query.groups({ kind: 'association' }) : []; if (g.length) { const ga = W.sys.goals.query.group(g[0].id), mem = ga ? ga.members.map((m) => m.id) : []; const objM = mem.filter((i) => app.obj.includes(i)).length;
      if (mem.length >= 4 && objM / mem.length > 0.4 && K.major) { app.ra = 1; app.mat += 5; feedAdd(`${ga.name} has objected to the ${K.label} on ${streetName(app.sid)}.`, 2); } }
    if (K.major && app.obj.length >= 10) C.grv['dev' + app.id] = app.obj.length * 0.7;
  }
  function decide(app, r) {
    const K = APP_KINDS[app.kind], camp = C.camps.find((c) => c.kind === 'development' && c.app === app.id && c.status === 'active');
    const elec = monthsToElection() < 12 ? 1.8 : 1; // councillors weigh objections more in the run-up to an election
    const z = -2.0 + 3.0 * (1 - app.fit) + 0.1 * Math.min(25, app.mat + (camp ? 5 + camp.sign / 15 : 0)) * elec - 0.08 * Math.min(10, app.sup.length);
    let out = r.next() < sig(z) ? 'refused' : 'approved'; if (out === 'refused' && K.major && r.next() < 0.3) out = r.next() < 0.3 ? 'approved on appeal' : out;
    app.status = out; C.n.decided[out] = (C.n.decided[out] || 0) + 1; const lost = out.startsWith('approved') && app.obj.length >= 6;
    W.emit('civic.planning_decision', { place: app.bid, cause: app.eid, salience: K.major ? 0.35 : 0.1, tags: ['civic', 'visible', ...(K.major ? ['community_problem'] : [])], payload: { kind: app.kind, outcome: out, objections: app.obj.length } });
    feedAdd(`The council ${out} ${app.name} on ${streetName(app.sid)}${app.obj.length ? ` after ${app.obj.length} objection${app.obj.length > 1 ? 's' : ''}` : ''}.`, K.major ? 2 : 1);
    for (const id of app.obj) { const p = W.people.get(id); if (p) { const c = civ(p); c.trust = clamp(c.trust + (lost ? -0.05 : 0.03), 0.05, 1); } }
    if (out.startsWith('approved') && app.kind === 'flats') C.build.push({ t: W.tick + 330 * D, n: app.n });
    if (camp) { camp.status = 'closed'; endCampaign(camp, out === 'refused'); }
  }
  function monthlyApps(r) {
    for (const [k, K] of Object.entries(APP_KINDS)) if (r.next() < K.perMonth * (K.fixed ? 1 : W.living().length / 550)) newApp(k, null); // `fixed`: the supply of development sites does not grow with the number of residents
  }

  // ------------------------------------------------------------------ campaigns
  function leaderFor(r, sid) { const pool = []; for (const p of W.living()) { const a = ageOf(p); if (a < 24 || a > 80 || !p.ext.pop) continue; const act = p.ext.pop.activity; const w = p.values.community * (p.personality.conscientiousness + 0.2) * (['retired', 'home_family', 'employed'].includes(act) ? 1 : 0.4) * (0.5 + p.personality.extraversion) * (sid >= 0 && streetOf(p) === sid ? 3 : 1) * (civ(p).member ? 1.5 : 1); if (w > 0.28) pool.push([p, w]); }
    return pool.length ? r.weighted(pool.map((x) => x[0]), pool.map((x) => x[1] ** 2)) : null; }
  const CAMP = { library: { name: 'Save the library', svc: 'library' }, youth: { name: 'Save the youth club', svc: 'youth' }, bins: { name: 'Bins campaign', svc: 'bins' }, flytip: { name: 'Fly-tipping action group', svc: 'noise' }, speed: { name: 'Slow Down Campaign', svc: 'roads' }, roads: { name: 'Fix our roads', svc: 'roads' }, noise: { name: 'Enforcement campaign', svc: 'noise' }, repairs: { name: 'Council repairs campaign', svc: 'repairs' }, damp: { name: 'Damp homes campaign', svc: 'repairs' } };
  function campaignsMonthly(r) {
    for (const k of Object.keys(C.grv)) { C.grv[k] *= Math.pow(0.5, 30 / PARAMS.grvHalfLifeDays); if (C.grv[k] < 0.1) delete C.grv[k]; }
    for (const [k, v] of Object.entries(C.grv)) {
      if (v < PARAMS.grvThreshold) continue; if (C.camps.some((c) => c.key === k && c.status === 'active')) continue; if (r.next() > 0.45) continue;
      const isDev = k.startsWith('dev'), app = isDev ? C.apps.find((a) => 'dev' + a.id === k && a.status === 'open') : null; if (isDev && !app) { delete C.grv[k]; continue; }
      const lead = leaderFor(r, app ? app.sid : -1); if (!lead) continue; const kind = isDev ? 'development' : k, def = CAMP[kind] || { name: 'Residents against the plans' }, name = isDev ? `Stop ${app.name} (${streetName(app.sid)})` : def.name;
      const camp = { id: C.seq++, key: k, kind, name, leader: lead.id, t0: W.tick, sign: 3, members: [lead.id], status: 'active', app: app ? app.id : null, end: W.tick + (isDev ? Math.max(30 * D, app.decide - W.tick) : 150 * D) };
      C.camps.push(camp); civ(lead).member = 1; const gid = W.commands.has('groups.create') ? W.cmd('groups.create', { kind: 'campaign', founder: lead.id, name, purpose: name, members: [] }) : null; camp.gid = gid ?? null;
      W.emit('civic.campaign', { actors: [lead.id], salience: 0.4, cause: C.cutEv[k] || (app ? app.eid : 0), tags: ['civic', 'community_problem'], payload: { cause: name, kind } }); feedAdd(`${nm(lead)} has started a campaign: ${name}.`, 2);
    }
  }
  function campaignsWeekly(r) {
    for (const c of C.camps) { if (c.status !== 'active') continue; const ls = W.sys.social ? null : null;
      const pool = W.living(); let n = 0; for (let i = 0; i < 30; i++) { const p = pool[(r.next() * pool.length) | 0]; if (!p || ageOf(p) < 16) continue; const cc = civ(p); if (cc.signed & (1 << (c.id % 30))) continue;
        const stake = c.kind === 'library' ? (ageOf(p) > 65 || ageOf(p) < 25 || p.family.childrenIds.length ? 1.6 : 0.6) : c.kind === 'development' ? (c.app && C.apps.find((a) => a.id === c.app) && C.apps.find((a) => a.id === c.app).obj.includes(p.id) ? 4 : 0.4) : 1;
        if (r.next() < 0.05 * stake * (0.4 + p.values.community) * (0.5 + p.personality.agreeableness)) { cc.signed |= 1 << (c.id % 30); n++; if (c.members.length < 12 && r.next() < 0.12) { c.members.push(p.id); if (c.gid != null && W.commands.has('groups.join')) W.cmd('groups.join', { group: c.gid, person: p.id }); } } }
      c.sign += n; if (W.tick >= c.end && c.kind !== 'development') endCampaign(c, null);
    }
  }
  function endCampaign(c, forced) {
    c.status = 'closed'; const r = R(W.tick, 'camp', c.id); let won = forced;
    if (won === null) { const share = c.sign / Math.max(100, W.living().length), elec = monthsToElection() < 12 ? 1.6 : 0.8, left = ruling() === 'Labour' || ruling() === 'Green' || ruling() === 'Liberal Democrats' ? 1.1 : 0.9;
      won = r.next() < clamp(0.1 + 1.1 * share * elec * left, 0, 0.8); if (won && CAMP[c.kind]) { C.svc[CAMP[c.kind].svc] = clamp(C.svc[CAMP[c.kind].svc] + 0.3, 0, 1); W.emit('civic.service_restored', { salience: 0.3, tags: ['civic', 'success'], payload: { service: CAMP[c.kind].svc } }); } delete C.grv[c.key]; }
    W.emit('civic.campaign_outcome', { actors: [c.leader], salience: 0.35, tags: ['civic', won ? 'success' : 'setback'], payload: { kind: c.kind, won: !!won } }); C.n.camp[won ? 'won' : 'lost']++;
    feedAdd(`${c.name} ended with ${c.sign} signatures: ${won ? 'the council gave way' : 'the council did not change course'}.`, 2);
    for (const id of c.members) { const p = W.people.get(id); if (p) civ(p).trust = clamp(civ(p).trust + (won ? 0.1 : -0.06), 0.05, 1); }
  }

  // ------------------------------------------------------------------ elections
  function electionDay(w) { const t = w.time; return t.month === 4 && t.dow === 3 && t.dom <= 7 && t.year % 4 === 3; }
  function nextElectionTick(from) { for (let d = 1; d < 4 * 370; d++) { const t = from + d * D, tt = W.calendar.timeOf(t, {}); if (tt.month === 4 && tt.dow === 3 && tt.dom <= 7 && tt.year % 4 === 3) return t; } return from + 4 * 365 * D; }
  const posOf = (p) => { const hh = hhOf(p), a = ageOf(p); return clamp((p.values.tradition - 0.5) * 1.3 + (p.values.wealth - 0.5) * 0.6 - (owner(hh) ? 0 : 0.3) - (a < 35 ? 0.25 : 0) + (a > 65 ? 0.3 : 0) + (p.values.piety - 0.45) * 0.3, -1, 1); };
  function registered(p, r) { const c = civ(p); if (c.reg >= 0 && c.regT === C.elections) return c.reg; const hh = hhOf(p); const yrs = p.ext.pop ? p.ext.pop.yearsAtAddress : 3; const pr = (owner(hh) ? PARAMS.regOwner : PARAMS.regRenter) * (yrs < 1 ? 0.72 : yrs < 2 ? 0.9 : 1) * (p.ext.pop && p.ext.pop.activity === 'student' ? 0.85 : 1); c.reg = r.next() < pr ? 1 : 0; c.regT = C.elections; return c.reg; }
  function runElection(by) {
    const r = R(W.tick, 'elec'), ppl = W.living().filter((p) => ageOf(p) >= 18); const cands = [];
    const mk = (party, p, i) => ({ party, id: p ? p.id : null, name: p ? nm(p) : `${['A.', 'S.', 'M.', 'J.', 'R.', 'K.'][(i + party.length) % 6]} ${['Okafor', 'Whitmore', 'Hussain', 'Brennan', 'Patel', 'Lindqvist', 'Osei', 'Marsh'][(i * 3 + party.length) % 8]}`, votes: 0, resident: !!p, inc: C.cllrs.some((c) => c.id === (p && p.id)) ? 1 : 0 });
    const standers = C.stand.splice(0); for (const pr of Object.keys(PARTIES)) { const n = PARTIES[pr].slate; for (let i = 0; i < n; i++) { const st = standers.find((s) => s.party === pr && !cands.some((c) => c.id === s.pid)); const inc = i < C.cllrs.length && C.cllrs[i].party === pr ? W.people.get(C.cllrs[i].id) : null; cands.push(mk(pr, st ? W.people.get(st.pid) : inc && inc.alive ? inc : null, i + cands.length)); } }
    const dev = C.camps.filter((c) => c.status === 'active' || (W.tick - c.t0 < 2 * 365 * D)).map((c) => W.people.get(c.leader)).filter(Boolean); // campaign leaders sometimes stand as independents
    for (const l of dev) { if (cands.filter((c) => c.party === 'Independent').length < 4 && r.next() < 0.5 && !cands.some((c) => c.id === l.id)) cands.push(mk('Independent', l, 9)); }
    const mood = C.borough.mood, svcAvg = (C.svc.bins + C.svc.roads + C.svc.library) / 3; let turn = 0, elig = 0; const byParty = {};
    for (const p of ppl) {
      if (!registered(p, r)) continue; elig++; const c = civ(p), a = ageOf(p), hh = hhOf(p), q = p.ext.pop;
      const z = PARAMS.turnoutIntercept + (a < 25 ? -0.9 : a < 35 ? -0.5 : a < 45 ? -0.2 : a < 55 ? 0.1 : a < 65 ? 0.5 : 0.9) + (owner(hh) ? 0.3 : 0) + (q && q.edu === 'level4plus' ? 0.25 : q && q.edu === 'none' ? -0.25 : 0) + 0.9 * (p.values.community - 0.5) + (W.tick - c.contact < 400 * D ? 0.35 : 0) + (c.member ? 0.6 : 0) + (c.trust < 0.3 ? -0.15 : 0);
      if (r.next() > sig(z)) { c.voted = 0; continue; } turn++; c.voted = 1;
      let best = null, bu = -9; const x = posOf(p), grv = (1 - svcAvg) * 1.2 + Math.max(0, 0.5 - c.trust);
      for (const [pn, P] of Object.entries(PARTIES)) { const inc = ruling() === pn ? 1 : 0; const u = -2.2 * Math.abs(x - P.x) + P.base + 0.6 * mood[pn] - (inc ? grv * 1.4 : 0) + (pn === 'Independent' ? 0.9 * grv + 0.4 * p.values.community : 0) + (P.env ? 0.5 * (a < 40 ? 1 : 0) : 0) + (pn === 'Conservative' || pn === 'Reform UK' ? 0.5 * (W.sys.crime ? W.sys.crime.query.fear(p.id) : 0) : 0) + (inc ? 0.3 : 0) - Math.log(-Math.log(r.next() + 1e-9) + 1e-9) * 0.9; if (u > bu) { bu = u; best = pn; } }
      byParty[best] = (byParty[best] || 0) + 1; const slate = cands.filter((cd) => cd.party === best); for (const cd of slate) cd.votes += 1 - (r.next() < 0.15 ? 1 : 0) + (cd.resident && r.next() < 0.12 ? 0.3 : 0) * 0; // slate voting with ~15% split
    }
    cands.sort((a, b) => b.votes - a.votes + (r.next() - 0.5) * 0.01); const win = cands.slice(0, 3); const old = C.cllrs; C.cllrs = win.map((c) => ({ party: c.party, id: c.id, name: c.name, since: W.tick }));
    for (const o of old) { const p = o.id != null && W.people.get(o.id); if (p) civ(p).cllr = 0; }
    for (const c of C.cllrs) if (c.id != null) { const p = W.people.get(c.id); if (p) { civ(p).cllr = 1; civ(p).member = 1; W.emit('civic.councillor_elected', { actors: [p.id], salience: 0.45, tags: ['civic', 'success', 'first'], payload: { party: c.party } }); } }
    const t = elig ? turn / ppl.length : 0, top = Object.entries(byParty).sort((a, b) => b[1] - a[1])[0]; C.elections++; C.hist.push({ t: W.tick, turnout: +t.toFixed(3), registered: +(elig / ppl.length).toFixed(3), win: C.cllrs.map((c) => c.party + ':' + c.name), top: top ? top[0] : '', byParty });
    W.emit('civic.election', { salience: 0.5, tags: ['civic', 'visible'], payload: { turnout: +t.toFixed(3), winner: top ? top[0] : '' } });
    feedAdd(`Ward election: turnout ${(t * 100).toFixed(0)}%. Elected: ${C.cllrs.map((c) => `${c.name} (${c.party})`).join(', ')}.`, 3);
    // borough control follows national mood plus the ward signal; the new administration sets budget priorities
    const m = Object.entries(C.borough.mood).sort((a, b) => b[1] - a[1])[0][0]; if (m !== C.borough.control && r.next() < 0.6) C.borough.control = m;
    for (const k of Object.keys(PARTIES)) C.borough.mood[k] = clamp(C.borough.mood[k] * 0.4 + r.gauss(0, PARAMS.nationalSwingSd), -0.6, 0.6);
    C.nextElection = nextElectionTick(W.tick);
  }

  // ------------------------------------------------------------------ clocks
  function daily(w) { const r = R(w.tick, 'd'); issuesDaily(r); casesDaily(r); for (const k of Object.keys(C.cutEv)) if (w.tick - 365 * D > 0 && false) delete C.cutEv[k];
    for (const a of C.apps) if (a.status === 'open' && a.decide <= w.tick) decide(a, r);
    for (const b of C.build.splice(0)) { if (b.t <= w.tick) w.cmd('housing.buildFlats', { n: b.n }); else C.build.push(b); } }
  const hourly = (w) => { if (w.time.hour === 21 && w.tick >= C.nextElection && electionDay(w)) runElection(); };
  function weekly(w) { const r = R(w.tick, 'w'); campaignsWeekly(r); if (C.apps.length > 40) C.apps = C.apps.filter((a) => a.status === 'open' || w.tick - a.t0 < 400 * D); }
  function monthly(w) { const r = R(w.tick, 'm'); monthlyApps(r); campaignsMonthly(r); for (const k of Object.keys(C.svc)) if (k !== 'library' && C.svc[k] < 1) C.svc[k] = Math.min(1, C.svc[k] + 0.0015); }
  function stats() { const d = [...C.days].sort((a, b) => a - b); return { opened: { ...C.n.opened }, closed: { ...C.n.closed }, inTarget: C.n.inTarget, medianDays: d.length ? d[d.length >> 1] : null, chased: C.n.chased, apps: C.n.apps, decided: { ...C.n.decided }, camp: { ...C.n.camp }, elections: C.hist.slice(), svc: { ...C.svc }, openCases: C.cases.filter((c) => !c.done).length, trustMean: +(W.living().reduce((s, p) => s + civ(p).trust, 0) / Math.max(1, W.living().length)).toFixed(2), control: C.borough.control, cllrs: C.cllrs.map((c) => ({ ...c })) }; }

  const plugin = {
    name: 'civic', version: '1.0.0', deps: ['social', 'housing'],
    init(world) {
      W = world; for (const [t, d, pl] of EV) if (!world.events.registry.has(t)) world.registerEventType(t, { doc: d, payload: pl, template: t });
      const m = {}; for (const k of Object.keys(PARTIES)) m[k] = 0;
      C = world.lf.civic = { seq: 1, svc: Object.fromEntries(Object.keys(SERVICES).map((k) => [k, 1])), grv: {}, cutEv: {}, cases: [], days: [], n: { opened: {}, closed: {}, inTarget: 0, chased: 0, apps: 0, decided: {}, camp: { won: 0, lost: 0 } }, apps: [], camps: [], build: [], feed: [], stand: [], cllrs: [], elections: 0, hist: [], borough: { control: 'Labour', grant: 0, mood: m }, nextElection: 0 };
      C.nextElection = nextElectionTick(world.tick - D);
      const r = R('init'); C.cllrs = ['Labour', 'Labour', 'Green'].map((party, i) => ({ party, id: null, name: ['A. Okafor', 'S. Whitmore', 'M. Lindqvist'][i], since: -1e6 }));
      for (const p of world.living()) { civ(p).trust = clamp(0.5 + 0.25 * (p.personality.agreeableness - 0.5) + r.gauss(0, 0.12), 0.1, 0.95); }
      for (const t of ['housing.repair_needed', 'housing.disrepair']) world.on(t, (ev) => { const p = world.people.get(ev.actors[0]); const hh = p && hhOf(p); if (!p || !hh) return; const council = hh.tenure === 'council' || hh.tenure === 'housing_assoc'; const c = civ(p); if (world.rngFor('civic', 'rep', ev.id).next() < reporterOdds(p) * (council ? 1.3 : 0.7) + 0.2) openCase('damp', p, streetOf(p), ev.id, { unit: hh.unit, target: council ? 56 : 42 }); C.grv.damp = (C.grv.damp || 0) + 0.1; });
      world.on('civic.complaint', (ev) => { const p = world.people.get(ev.actors[0]); if (p && ev.payload.to === 'council' && world.rngFor('civic', 'nz', ev.id).next() < 0.03) openCase('noise', p, streetOf(p), ev.id); });
      world.on('health.accident', (ev) => { if (ev.payload.kind !== 'road') return; const p = world.people.get(ev.actors[0]); if (!p) return; const sid = streetOf(p); C.grv.speed = (C.grv.speed || 0) + (ageOf(p) < 16 ? 4.5 : 2.5); });
    },
    clocks: { hour: hourly, day: daily, week: weekly, month: monthly, year: annual },
    commands: {
      'civic.councilCuts': (w, a) => { if ((a.pct ?? 0.1) < 0) { for (const k of Object.keys(C.svc)) C.svc[k] = clamp(C.svc[k] - a.pct, 0.15, 1); return true; } applyCut(a.pct ?? 0.1, a.service || null); return true; },
      'civic.newDevelopment': (w, a) => !!newApp(a.kind || 'flats', a.street ?? null, { n: a.n, name: a.name }),
      'civic.callElection': (w) => { runElection(); return true; },
      'civic.complain': (w, a) => { const p = w.people.get(a.pid); if (!p) return false; return !!openCase(a.kind || 'bins', p, streetOf(p), 0); },
      'civic.object': (w, a) => { const p = w.people.get(a.pid), ap = C.apps.find((x) => x.id === a.app && x.status === 'open'); if (!p || !ap || ap.obj.includes(p.id)) return false; ap.obj.push(p.id); ap.mat += 1; civ(p).contact = w.tick; return true; },
      'civic.standCouncillor': (w, a) => { const p = w.people.get(a.pid); if (!p || ageOf(p) < 18) return false; C.stand.push({ pid: p.id, party: a.party && PARTIES[a.party] ? a.party : 'Independent' }); civ(p).member = 1; return true; },
      'civic.joinCampaign': (w, a) => { const c = C.camps.find((x) => x.id === a.id && x.status === 'active'), p = w.people.get(a.pid); if (!c || !p) return false; if (!c.members.includes(p.id)) c.members.push(p.id); c.sign += 1; civ(p).member = 1; if (c.gid != null && w.commands.has('groups.join')) w.cmd('groups.join', { group: c.gid, person: p.id }); return true; },
    },
    query: {
      service: (k) => (C ? C.svc[k] ?? 1 : 1), services: () => ({ ...C.svc, libraryHoursPerWeek: Math.round(40 * C.svc.library), youthSessionsPerWeek: Math.round(5 * C.svc.youth) }), councillors: () => C.cllrs.map((c) => ({ ...c })), parties: () => Object.keys(PARTIES),
      election: () => ({ next: C.nextElection, last: C.hist[C.hist.length - 1] || null, history: C.hist.slice(), control: C.borough.control }),
      cases: (n = 10) => C.cases.slice(-n).map((c) => ({ id: c.id, kind: c.kind, pid: c.pid, street: streetName(c.sid), days: Math.round((W.tick - c.t0) / D), done: !!c.done, chased: !!c.chased })),
      planning: (n = 10) => C.apps.slice(-n).map((a) => ({ id: a.id, kind: a.kind, name: a.name, street: streetName(a.sid), sid: a.sid, bid: a.bid, place: a.bid, status: a.status, objections: a.obj.length, supports: a.sup.length, ra: !!a.ra, decide: a.decide })),
      approvals: (kind) => C.apps.filter((a) => a.status.startsWith('approved') && (!kind || a.kind === kind)).map((a) => ({ id: a.id, kind: a.kind, name: a.name, bid: a.bid, street: a.sid })),
      campaigns: () => C.camps.map((c) => { const ap = c.app != null ? C.apps.find((x) => x.id === c.app) : null; return { place: ap ? ap.bid : null, bid: ap ? ap.bid : null, sid: ap ? ap.sid : null, id: c.id, name: c.name, kind: c.kind, leader: c.leader, signatures: c.sign, status: c.status, members: c.members.length }; }),
      stats, trust: (pid) => { const p = W.people.get(pid); return p ? +civ(p).trust.toFixed(2) : null; }, feed: (n = 8) => C.feed.slice(-n).reverse().map((f) => ({ t: f.t, text: f.text })),
    },
  };
  return plugin;
}
export default createCivic;
