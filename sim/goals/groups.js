// Collective agents: groups (band, club, team, business, association, campaign, friend gang, faith group, online community, crew...) and their projects.
// Founded by a person's goal through recruitment; meet at venues on a cadence; have cohesion, roles, funds, politics (leader challenge, split, quitting), rivals; can dissolve or become institutions.
// Projects have progress and emit VISIBLE world-effect events (project.effect). Processed on the day clock (only groups whose meeting is due) - never per tick.
import { hash32 } from '../kernel/rng.js';
import { TICKS_PER_DAY } from '../time.js';
import { clamp, fmt } from './util.js';
import { personalityZ, tieStrength } from './facts.js';

const VENUE_ALIAS = { pub: ['pub'], community_centre: ['community_centre', 'church', 'mosque', 'library'], cafe: ['cafe', 'bakery'], library: ['library', 'community_centre'], park: ['park'], gym: ['gym'], sports_hall: ['gym', 'community_centre'], church: ['church', 'mosque'], temple: ['church', 'mosque'], shop: ['vacant_unit', 'corner_shop'], hall: ['community_centre', 'pub', 'church'] };
export class Groups {
  constructor(engine) { this.e = engine; this.vcache = null; this.vday = -1e9; }
  get w() { return this.e.world; } get S() { return this.e.S; } get kinds() { return this.e.lib.GROUP_KINDS; }
  // ---- venues
  venueFor(kind) {
    const w = this.w; if (!this.vcache || this.e.day - this.vday > 28) { this.vcache = new Map(); this.vday = this.e.day; const by = new Map(); for (const b of w.buildings.values()) { let l = by.get(b.type); if (!l) by.set(b.type, (l = [])); l.push(b.id); } this.byType = by; }
    const K = this.kinds[kind]; if (!K) return null;
    for (const alias of K.venues) { const types = VENUE_ALIAS[alias] || [alias]; for (const ty of types) { const l = this.byType.get(ty); if (l && l.length) return { id: l[hash32(w.seed, 'venue', kind, ty) % l.length], alias }; } }
    return null;
  }
  vacantUnits() { this.venueFor('business'); return this.byType.get('vacant_unit') || []; }
  // ---- lifecycle
  create(o) {
    const w = this.w, S = this.S, K = this.kinds[o.kind]; if (!K) throw new Error('unknown group kind ' + o.kind);
    const id = S.groupSeq++, W = this.e.lib.NAME_WORDS, h = hash32(w.seed, 'gname', id);
    const name = o.name || fmt(K.names[h % K.names.length], { a: W.a[(h >> 4) % W.a.length], n: W.n[(h >> 9) % W.n.length], p: W.p[(h >> 14) % W.p.length] });
    const v = this.venueFor(o.kind);
    const g = { id, name, kind: o.kind, founder: o.founder, leader: o.founder, members: {}, purpose: o.purpose || '', goal: o.goal || 0, venue: v ? v.id : null, venueKind: v ? v.alias : 'home', cadence: Math.max(1, Math.round(K.cadence * this.e.cfg.dayScale)), nextMeet: 0, funds: 0, cohesion: 0.6, rep: 0, status: 'forming', born: w.tick, ended: 0, history: [], project: 0, rivals: [], meetings: 0, weak: 0, lastActive: w.tick, norms: [] };
    S.groups.set(id, g); this.addMember(g, o.founder, K.roles[0] || 'founder', 0.9, true);
    if (o.members) for (const m of o.members) this.addMember(g, m, K.roles[1] || 'member', 0.6, true);
    return g;
  }
  announce(g) {
    if (g.announced) return; g.announced = true; const w = this.w, K = this.kinds[g.kind];
    g.eid = w.emit('group.founded', { actors: Object.keys(g.members).map(Number).slice(0, 8), place: g.venue, salience: 0.3, cause: this.S.goals.get(g.goal)?.eid || 0, tags: ['civic', 'success', 'first'], payload: { group: g.id, kind: g.kind, name: g.name } });
    this.rivalries(g);
    if (K.min >= 1 && !g.project) { const tpl = this.e.tpl.get(g.purpose); if (tpl && tpl.project) this.startProject(g, tpl.project); }
    this.schedule(g, 0.5);
  }
  addMember(g, id, role, commit, silent) {
    if (g.members[id]) return false; g.members[id] = { role, since: this.w.tick, commit, att: 0 }; const s = this.e.S.ps.get(id) || this.e.ps(this.w.people.get(id)); if (!s.groups.includes(g.id)) s.groups.push(g.id);
    this.w.index?.orgJoin?.(g.id + 1e6, this.w.people.get(id));
    if (!silent) this.w.emit('group.joined', { actors: [id], cause: g.eid || 0, salience: 0.08, tags: ['civic'], payload: { group: g.id, role } });
    return true;
  }
  removeMember(g, id, why) {
    if (!g.members[id]) return; delete g.members[id]; const s = this.S.ps.get(id); if (s) { const i = s.groups.indexOf(g.id); if (i >= 0) s.groups.splice(i, 1); }
    this.w.index?.orgLeave?.(g.id + 1e6, this.w.people.get(id));
    this.w.emit('group.left', { actors: [id], cause: g.eid || 0, salience: 0.12, tags: why === 'pushed out' ? ['conflict'] : ['civic'], payload: { group: g.id, why } });
    if (g.leader === id) this.newLeader(g, 'left');
  }
  newLeader(g, how) {
    const ids = Object.keys(g.members).map(Number); if (!ids.length) return; let best = null, bs = -1;
    for (const id of ids) { const m = g.members[id], q = this.w.people.get(id); if (!q || !q.alive || id === g.leader) continue; const z = personalityZ(q); const sc = m.commit + 0.1 * z.E + 0.05 * z.C + (this.w.ageOf(q) - this.w.ageOf(this.w.people.get(g.founder) || q)) * 0.0; if (sc > bs) { bs = sc; best = id; } }
    if (best == null) return; const from = g.leader; g.leader = best; g.members[best].role = (this.kinds[g.kind].roles[0] || 'leader');
    this.w.emit('group.leader_changed', { actors: [best, from].filter((x) => x != null), place: g.venue, cause: g.eid || 0, salience: 0.2, tags: ['civic'], payload: { group: g.id, how } });
    this.hist(g, `${this.e.fn(best)} took over as leader (${how})`);
  }
  hist(g, t) { g.history.push([this.w.tick, t]); if (g.history.length > 14) g.history.shift(); }
  schedule(g, delayDays) { const hr = g.venueKind === 'pub' ? 19.5 : g.venueKind === 'park' ? 10 : 19; g.nextMeet = this.e.tickAt(delayDays !== undefined ? delayDays : g.cadence, hr); }
  size(g) { return Object.keys(g.members).length; }
  dissolve(g, why) {
    if (g.status === 'dissolved') return; const w = this.w, n = this.size(g);
    g.status = 'dissolved'; g.ended = w.tick;
    const closing = g.kind === 'business' ? ['closure', 'setback'] : ['setback'];
    const ids = Object.keys(g.members).map(Number);
    g.eid = w.emit('group.dissolved', { actors: ids.slice(0, 8), place: g.venue, cause: g.eid || 0, salience: 0.25, tags: closing, payload: { group: g.id, why, members: n, days: Math.round((w.tick - g.born) / TICKS_PER_DAY) } });
    for (const id of ids) { const s = this.S.ps.get(id); if (s) { const i = s.groups.indexOf(g.id); if (i >= 0) s.groups.splice(i, 1); } w.index?.orgLeave?.(g.id + 1e6, w.people.get(id)); }
    g.members = {}; if (g.project) { const pr = this.S.projects.get(g.project); if (pr && pr.status === 'active') { pr.status = 'failed'; w.emit('project.done', { cause: g.eid, salience: 0.1, payload: { project: pr.id, kind: pr.kind, ok: false } }); } }
    for (const gr of this.S.groups.values()) if (gr.rivals.includes(g.id)) gr.rivals = gr.rivals.filter((x) => x !== g.id);
    // the founder's goal fails; former members feel it
    const fg = this.S.goals.get(g.goal); if (fg && fg.status === 'active' && fg.group === g.id) this.e.fail(fg, why);
  }
  // ---- projects
  startProject(g, kind, extra = {}) {
    const PK = this.e.lib.PROJECT_KINDS[kind]; if (!PK) return null; const S = this.S, id = S.projSeq++;
    const pr = { id, kind, group: g.id, label: PK.label, work: PK.work * (extra.scale || 1), done: 0, status: 'active', born: this.w.tick, effect: PK.effect, place: g.venue, name: extra.name || '' };
    S.projects.set(id, pr); g.project = id; this.w.emit('project.started', { actors: [g.leader], place: g.venue, cause: g.eid || 0, salience: 0.15, tags: ['civic'], payload: { project: id, kind, group: g.id } });
    return pr;
  }
  progress(g, units) {
    const pr = this.S.projects.get(g.project); if (!pr || pr.status !== 'active') return;
    const before = pr.done / pr.work; pr.done += units; const pct = clamp(pr.done / pr.work, 0, 1);
    if (Math.floor(pct * 4) > Math.floor(before * 4) && pct < 1) this.w.emit('project.progress', { actors: [g.leader], place: g.venue, cause: g.eid || 0, salience: 0.06, payload: { project: pr.id, pct: +pct.toFixed(2) } });
  }
  readiness(g) { const pr = this.S.projects.get(g.project); return pr ? clamp(pr.done / pr.work, 0, 1) : 1; }
  finishProject(g, forceOk) {
    const w = this.w, pr = this.S.projects.get(g.project); if (!pr || pr.status !== 'active') return false;
    const PK = this.e.lib.PROJECT_KINDS[pr.kind], r = this.e.rng('proj', pr.id, w.tick), fail = clamp(PK.fail * (1.4 - g.cohesion) * (1.2 - 0.5 * this.avgC(g)), 0.02, 0.9);
    const ok = forceOk || r.next() >= fail; pr.status = ok ? 'done' : 'failed'; g.project = 0;
    const eid = w.emit('project.done', { actors: [g.leader], place: pr.place, cause: g.eid || 0, salience: 0.3, tags: ok ? ['civic', 'success'] : ['civic', 'setback'], payload: { project: pr.id, kind: pr.kind, ok } });
    g.eid = eid; this.hist(g, `${pr.label} ${ok ? 'done' : 'fell flat'}`);
    if (ok) { w.emit('project.effect', { actors: [g.leader], place: pr.place, cause: eid, salience: 0.25, tags: ['civic', 'visible'], payload: { project: pr.id, kind: pr.kind, effect: pr.effect } }); g.rep = clamp(g.rep + 0.15, 0, 1); g.cohesion = clamp(g.cohesion + 0.12, 0, 1); if (PK.effect === 'money_raised') g.funds += 200 * this.e.cfg.moneyScale; if (pr.kind === 'business') this.claimUnit(g, pr, eid); }
    else { g.cohesion = clamp(g.cohesion - 0.18, 0, 1); }
    return ok;
  }
  claimUnit(g, pr, eid) { const u = this.vacantUnits(); if (u.length) { const bid = u[hash32(this.w.seed, 'unit', g.id) % u.length]; g.venue = bid; pr.place = bid; const b = this.w.buildings.get(bid); if (b) { b.claimedBy = g.id; } this.w.emit('project.effect', { actors: [g.leader], place: bid, cause: eid, salience: 0.3, tags: ['civic', 'visible', 'success'], payload: { project: pr.id, kind: 'business', effect: 'unit_claimed' } }); this.w.cmd && this.w.commands.has('venues.claim_unit') && this.w.cmd('venues.claim_unit', { building: bid, name: g.name, group: g.id }); } }
  avgC(g) { let s = 0, n = 0; for (const id of Object.keys(g.members)) { const q = this.w.people.get(id); if (q) { s += (q.personality?.conscientiousness ?? 0.5); n++; } } return n ? s / n : 0.5; }
  rivalries(g) {
    const r = this.e.rng('rival', g.id); for (const o of this.S.groups.values()) { if (o === g || o.kind !== g.kind || o.status === 'dissolved' || o.status === 'forming' || g.rivals.includes(o.id) || g.rivals.length >= 2) continue; if (r.next() < (g.kind === 'business' ? 0.45 : g.kind === 'band' || g.kind === 'team' ? 0.35 : 0.12)) { g.rivals.push(o.id); o.rivals.push(g.id); this.w.emit('group.rivalry', { actors: [g.leader, o.leader], salience: 0.15, tags: ['conflict', 'civic'], payload: { a: g.id, b: o.id } }); } }
  }
  // ---- goal-step integration (returns {res, why, note} to finish the step, {pr} to adjust the roll, or null)
  step(p, s, f, g, st, mv, tp, r) {
    const tpl = this.e.tpl.get(g.tpl), S = this.S, w = this.w; if (!this.e.cfg.flags.groups) return null;
    let G = g.group ? S.groups.get(g.group) : null; if (G && G.status === 'dissolved') { G = null; }
    const gk = tpl.group && tpl.group !== 'existing' ? tpl.group : null;
    const recruiting = (st.move === 'recruit' || (st.move === 'invite' && gk));
    if (recruiting && gk) {
      if (!G) { G = this.create({ kind: gk, founder: p.id, purpose: tpl.id, goal: g.id }); g.group = G.id; }
      const K = this.kinds[gk]; if (!tp) return { res: 'fail', why: 'busy', note: 'no one to ask' };
      if (G.members[tp.id]) return { res: 'ok', note: `${tp.firstName} is already in` };
      const q = this.e.ps(tp), tf = this.e.S.ps.get(tp.id), rl = p.relationships?.get(tp.id), z = personalityZ(tp);
      const dw = q.dw || [], belong = dw[this.e.driveIdx.belonging] ?? 0.5, nov = dw[this.e.driveIdx.novelty] ?? 0.5;
      let pr = 0.28 + 0.25 * (rl ? (rl.affinity || 0) : 0) + 0.2 * (belong - 0.5) + 0.15 * (nov - 0.5) + 0.05 * z.E - 0.08 * Math.max(0, q.groups.length - 1) - q.stress * 0.15 + (tpl.id === 'start_a_band' ? (this.e.cfg && 0) : 0);
      if (gk === 'band') { const musical = hash32(w.seed, 'lat', tp.id, 'musical') % 10000 / 10000 < 0.22 + 0.1 * z.O; pr += musical ? 0.2 : -0.18; }
      const age = w.ageOf(tp); if (age < 16 && gk !== 'team') pr -= 0.3;
      for (const rv of G.rivals) { const R = S.groups.get(rv); if (R && R.members[tp.id]) pr -= 0.2; }
      const u = r.next();
      if (u < clamp(pr, 0.03, 0.9)) { this.addMember(G, tp.id, K.roles[this.size(G) % Math.max(K.roles.length, 1)] || 'member', 0.5 + 0.3 * r.next(), false); return { res: 'ok', note: `${tp.firstName} is in` }; }
      if (u < pr + 0.14 && st.tries === 0) return { res: 'maybe', note: `asked ${tp.firstName}, they said maybe` };
      if (rl) { rl.affinity = clamp((rl.affinity || 0) - 0.02, -1, 1); }
      g.ex.push(tp.id); return { res: 'fail', why: 'refused', note: `asked ${tp.firstName}, they said no` };
    }
    if (st.move === 'found') {
      if (!gk) return null; if (!G) { G = this.create({ kind: gk, founder: p.id, purpose: tpl.id, goal: g.id }); g.group = G.id; }
      const K = this.kinds[gk], n = this.size(G);
      if (n < Math.max(2, Math.ceil(K.min * 0.7))) return { res: 'fail', why: 'busy', note: `only ${n} of us so far, not enough to start` };
      G.status = 'active'; this.announce(G); return { res: 'ok', note: `${G.name} is a thing now` };
    }
    if (G && (st.move === 'organise' || st.move === 'book')) {
      const K = this.kinds[G.kind], n = this.size(G);
      if (G.status === 'forming') { if (n < Math.max(2, Math.ceil(K.min * 0.7))) return { res: 'fail', why: 'busy', note: `only ${n} people so far` }; G.status = 'active'; this.announce(G); }
      this.progress(G, 0.7); G.cohesion = clamp(G.cohesion + 0.02, 0, 1); return null;
    }
    if (G && (st.move === 'train' || st.move === 'attend')) { this.progress(G, 0.5); return null; }
    if (G && st.move === 'perform') {
      if (G.status !== 'active') return { res: 'fail', why: 'busy', note: 'the group is not up and running yet' };
      if (this.readiness(G) < 0.45 && st.tries < 3) return { res: 'fail', why: 'busy', note: 'not ready yet, needs more rehearsal' };
      const ok = this.finishProject(G, false); return ok ? { res: 'ok', note: 'it went down well' } : { res: 'fail', why: 'bad_luck', note: 'it was a bit of a flop' };
    }
    if (st.move === 'join' && ['club', 'garden', 'party', 'union', 'band', 'bands'].includes(st.v) || (st.move === 'ask' && st.v === 'join' && !gk)) {
      const hint = this.e.lib.GOAL_GROUP_HINT?.[tpl.id] || null; const J = this.findJoinable(p, f, hint, s);
      if (!J) return { res: 'fail', why: 'busy', note: 'nothing like that going on nearby' };
      if (r.next() > 0.45 + 0.25 * f.z.E + 0.2 * (this.e.selfm.get(s, 'community_works') - 0.5)) return { res: 'fail', why: 'refused', note: `did not feel welcome at ${J.name}` };
      this.addMember(J, p.id, 'member', 0.55, false); g.group = J.id; return { res: 'ok', note: `joined ${J.name}` };
    }
    if (st.move === 'attend' && G === null && (st.v === 'group' || st.v === 'rehearsal')) { const J = this.findJoinable(p, f, null, s); if (J && !J.members[p.id] && r.next() < 0.5) { this.addMember(J, p.id, 'member', 0.5, false); g.group = J.id; return { res: 'ok', note: `went along to ${J.name}` }; } }
    return null;
  }
  findJoinable(p, f, hint, s) {
    let best = null, bs = 0.1; const rel = p.relationships;
    for (const G of this.S.groups.values()) {
      if (G.status !== 'active' && G.status !== 'institution') continue; if (G.members[p.id]) continue; const K = this.kinds[G.kind]; if (this.size(G) >= K.cap) continue; if (hint && !hint.includes(G.kind)) continue;
      if (G.kind === 'business' || G.kind === 'friend_gang') continue;
      let sc = 0.3 + G.rep * 0.3 + G.cohesion * 0.3 + (this.size(G) < K.min + 2 ? 0.1 : 0); if (rel) for (const id of Object.keys(G.members)) { const rl = rel.get(+id); if (rl) sc += tieStrength(rl) * 0.8; }
      sc += this.e.rng('fj', p.id, G.id, this.w.tick >> 9).next() * 0.25; if (sc > bs) { bs = sc; best = G; }
    }
    return best;
  }
  onGoalEnd(g, ok) {
    if (!g.group) return; const G = this.S.groups.get(g.group); if (!G) return;
    if (!ok && G.status === 'forming' && G.goal === g.id) this.dissolve(G, 'never got going');
    if (ok && G.goal === g.id && G.status === 'forming') { G.status = 'active'; this.announce(G); }
  }
  // ---- clocks
  hourly() {}
  daily() {
    const w = this.w, now = w.tick, S = this.S; if (!S.groups.size) return;
    for (const g of S.groups.values()) {
      if (g.status === 'dissolved') continue;
      if (g.status === 'forming') { if (now - g.born > 120 * TICKS_PER_DAY * this.e.cfg.dayScale && g.goal === 0) this.dissolve(g, 'never got going'); continue; }
      if (g.nextMeet <= now) this.meet(g);
    }
  }
  meet(g) {
    const w = this.w, S = this.S, K = this.kinds[g.kind], r = this.e.rng('meet', g.id, w.tick), ids = Object.keys(g.members).map(Number);
    const att = []; for (const id of ids) { const q = w.people.get(id), m = g.members[id]; if (!q || !q.alive) { this.removeMember(g, id, 'died or left'); continue; } const s = S.ps.get(id); const pa = clamp(0.25 + 0.7 * m.commit - (s ? s.stress * 0.25 : 0) + (id === g.leader ? 0.15 : 0), 0.05, 0.97); if (r.next() < pa) { att.push(id); m.att++; m.commit = clamp(m.commit + 0.015, 0, 1); } else m.commit = clamp(m.commit - 0.02, 0, 1); }
    g.meetings++; g.lastActive = w.tick; const n = ids.length;
    if (att.length < Math.max(2, Math.ceil(K.min * 0.5)) && K.min > 1) { g.weak++; g.cohesion = clamp(g.cohesion - 0.06, 0, 1); } else g.weak = 0;
    if (att.length >= 2) {
      g.cohesion = clamp(g.cohesion + 0.015 + 0.02 * (att.length / n), 0, 1);
      const lim = Math.min(att.length, 6); for (let i = 0; i < lim; i++) for (let j = i + 1; j < lim; j++) { const a = w.people.get(att[i]), b = w.people.get(att[j]); if (a && b && w.getRel) { const ra = w.getRel(a, b), rb = w.getRel(b, a); ra.familiarity = clamp((ra.familiarity || 0) + 0.025, 0, 1); rb.familiarity = clamp((rb.familiarity || 0) + 0.025, 0, 1); ra.affinity = clamp((ra.affinity || 0) + 0.012, -1, 1); rb.affinity = clamp((rb.affinity || 0) + 0.012, -1, 1); ra.lastTick = rb.lastTick = w.tick; } }
      // costs: venue hire / dues flow to the venue's account (the pub gets paid)
      const cost = K.cost * this.e.cfg.moneyScale; if (cost > 0) for (const id of att) { const q = w.people.get(id); if (q.money > cost * 3) w.ledger.transfer(id, g.venue != null && w.buildings.get(g.venue) ? 'b:' + g.venue : 'metropolis', cost, 'group.dues', g.eid || 0); }
      this.progress(g, att.length * (g.cadence / (7 * this.e.cfg.dayScale)) * 0.25 * (0.6 + this.avgC(g)));
      const pr = S.projects.get(g.project); if (pr && pr.status === 'active' && pr.done >= pr.work) this.finishProject(g, false);
      else if (!g.project && g.status === 'active' && n >= K.min && r.next() < 0.04 && this.e.tpl.get(g.purpose)?.project) this.startProject(g, this.e.tpl.get(g.purpose).project);
    }
    if (w.tick - (g.lastMeetEv || -1e9) > 28 * TICKS_PER_DAY * this.e.cfg.dayScale) { g.lastMeetEv = w.tick; w.emit('group.meeting', { actors: att.slice(0, 6), place: g.venue, cause: g.eid || 0, salience: 0.04, tags: ['civic'], payload: { group: g.id, attended: att.length, members: n } }); }
    this.politics(g, r, att);
    g.nextMeet = 0; if (g.status !== 'dissolved') this.schedule(g);
  }
  politics(g, r, att) {
    const w = this.w, S = this.S, K = this.kinds[g.kind], ids = Object.keys(g.members).map(Number), n = ids.length;
    // rival pressure / common enemy
    if (g.rivals.length && r.next() < 0.05) g.cohesion = clamp(g.cohesion + 0.03, 0, 1);
    // internal conflict
    if (n >= 3 && r.next() < 0.035 * (1.6 - g.cohesion)) { g.cohesion = clamp(g.cohesion - 0.12, 0, 1); const a = ids[Math.floor(r.next() * n)], b = ids[Math.floor(r.next() * n)]; if (a !== b) { const pa = w.people.get(a), pb = w.people.get(b); if (pa && pb && w.getRel) { w.getRel(pa, pb).affinity -= 0.15; w.getRel(pb, pa).affinity -= 0.15; } g.eid = w.emit('group.conflict', { actors: [a, b], place: g.venue, cause: g.eid || 0, salience: 0.18, tags: ['conflict', 'civic'], payload: { group: g.id, severity: 0.5 } }); this.hist(g, `${this.e.fn(a)} and ${this.e.fn(b)} fell out`); } }
    // leadership challenge: low cohesion + an ambitious member plants the goal
    if (g.cohesion < 0.45 && n >= 4 && r.next() < 0.08) { let best = null, bs = 0.2; for (const id of ids) { if (id === g.leader) continue; const q = w.people.get(id), s = S.ps.get(id); if (!q || !s || s.goals.some((x) => S.goals.get(x).tpl === 'challenge_group_leader')) continue; const z = personalityZ(q), sc = z.E * 0.3 + g.members[id].commit * 0.5 + (1 - g.cohesion) * 0.3 - z.A * 0.1; if (sc > bs) { bs = sc; best = q; } } if (best) { const s = this.e.ps(best), f = null; const t = this.e.tpl.get('challenge_group_leader'); const ng = this.e.spawn(best, s, require_facts(this.e, best), t, { dsum: 0.6, maxP: 0.5, cause: g.eid || 0, force: true }); if (ng) ng.group = g.id; } }
    // member drift out
    for (const id of ids) { const m = g.members[id]; if (m.commit < 0.12 && id !== g.leader && r.next() < 0.5) { this.removeMember(g, id, 'drifted away'); this.hist(g, `${this.e.fn(id)} drifted away`); } }
    // split
    if (g.cohesion < 0.28 && n >= 6 && r.next() < 0.25) this.split(g, r);
    // dissolve
    const n2 = this.size(g), haz = K.hazard * (g.status === 'institution' ? 0.15 : 1) * (1.5 - g.cohesion) * (this.e.cfg.dayScale) * (g.cadence / this.e.cfg.yearDays);
    if (g.status === 'active' || g.status === 'institution') {
      if (n2 < Math.max(1, K.min - 1) && n2 < K.min) { if (++g.small > 2) return this.dissolve(g, n2 === 0 ? 'everyone left' : 'too few members'); } else g.small = 0;
      if (g.cohesion < 0.1 && r.next() < 0.5) return this.dissolve(g, 'fell apart');
      if (g.weak > 5 && r.next() < 0.5) return this.dissolve(g, 'stopped meeting');
      if (r.next() < haz * (K.min === 1 ? 1 : 1)) return this.dissolve(g, g.kind === 'business' ? 'closed down' : 'drifted into nothing');
      // institutionalise
      const yrs = (w.tick - g.born) / TICKS_PER_DAY / this.e.cfg.yearDays;
      if (g.status === 'active' && yrs >= K.inst && g.cohesion > 0.6 && n2 >= K.min + 2 && g.rep > 0.25) { g.status = 'institution'; this.hist(g, 'became an established fixture'); w.emit('group.institution', { actors: [g.leader], place: g.venue, cause: g.eid || 0, salience: 0.3, tags: ['civic', 'success'], payload: { group: g.id } }); }
      // open slots draw new people in (word of mouth), at a low rate
      if (n2 < K.cap && r.next() < 0.06 * (0.5 + g.rep + g.cohesion * 0.5)) { const m = ids[Math.floor(r.next() * ids.length)], q = w.people.get(m); if (q && q.relationships) { let best = null, b = 0; for (const [oid, rl] of q.relationships) { if (g.members[oid] || (rl.familiarity || 0) < 0.3) continue; const o = w.people.get(oid); if (!o || !o.alive || w.ageOf(o) < 16) continue; const sc = tieStrength(rl) + r.next() * 0.2; if (sc > b) { b = sc; best = oid; } } if (best != null && this.S.ps.get(best)?.groups.length < 3) this.addMember(g, best, 'member', 0.45, false); } }
    }
  }
  split(g, r) {
    const w = this.w, ids = Object.keys(g.members).map(Number).filter((x) => x !== g.leader); if (ids.length < 4) return;
    const breakaway = ids.filter((id) => r.next() < 0.5 && g.members[id].commit > 0.2); if (breakaway.length < 2) return;
    const leader = breakaway[0]; const N = this.create({ kind: g.kind, founder: leader, purpose: g.purpose, members: breakaway.slice(1) }); N.status = 'active'; for (const id of breakaway) { if (id !== leader) delete g.members[id], this.e.S.ps.get(id).groups.splice(this.e.S.ps.get(id).groups.indexOf(g.id), 1); else { delete g.members[id]; const s = this.e.S.ps.get(id); s.groups.splice(s.groups.indexOf(g.id), 1); } }
    N.rivals.push(g.id); g.rivals.push(N.id); g.cohesion = 0.5; N.cohesion = 0.55; this.announce(N);
    w.emit('group.split', { actors: [leader, g.leader], place: g.venue, cause: g.eid || 0, salience: 0.3, tags: ['conflict', 'civic'], payload: { group: g.id, newGroup: N.id } }); this.hist(g, `split: ${this.e.fn(leader)} left to form ${N.name}`);
  }
  leadershipVote(g, challenger, r) {
    const ids = Object.keys(g.members).map(Number); let pro = 0, con = 0; for (const id of ids) { if (id === challenger) { pro++; continue; } const rl = this.w.people.get(id)?.relationships; const a = rl?.get(challenger)?.affinity || 0, b = rl?.get(g.leader)?.affinity || 0; (a + (r.next() - 0.5) * 0.4 > b ? pro++ : con++); }
    return pro > con;
  }
  yearly() {
    const w = this.w; for (const g of this.S.groups.values()) if (g.status === 'institution' && !g.project) { const k = this.e.tpl.get(g.purpose)?.project; if (k) this.startProject(g, k); }
    for (const g of [...this.S.groups.values()]) if (g.status === 'dissolved' && w.tick - g.ended > 3 * this.e.cfg.yearDays * TICKS_PER_DAY) this.S.groups.delete(g.id);
  }
}
import { computeFacts } from './facts.js';
function require_facts(e, p) { return computeFacts(e.world, p, e.cfg); }
