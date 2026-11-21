// Play + god-consequence layer for the UI host (worker-safe, no DOM). Owns: player setup/creation, verbs -> kernel commands (actor 'player'),
// the compact HUD state, on-demand sheet sections, pause-on-event, skip-ahead, and the god-intervention consequence tracker (causal event chains).
import { describeEvent } from '../describe.js';
import { GOD_PRESETS } from '../godcatalogue.js';

const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
const r2 = (v) => Math.round(v * 100) / 100;
const lc = (s) => String(s || '').replace(/_/g, ' ');
const REQ_TEXT = { ask: 'would like to ask you a favour', persuade: 'is trying to talk you round', recruit: 'would like you to join something', befriend: 'wants to get to know you better', flatter: 'is being very nice to you', confide: 'wants to confide in you', gossip: 'has some gossip to share', confront: 'wants a word with you', apologise: 'wants to apologise to you', borrow: 'would like to borrow some money', lend: 'wants to lend you some money', gift: 'has a little gift for you', invite: 'is inviting you out', visit: 'would like to visit you', message: 'has sent you a message', threaten: 'is leaning on you', mediate: 'wants to smooth things over' };
const WEEK = 144 * 7;

export class PlayHost {
  constructor(host) {
    this.h = host; this.w = host.w; this.pauseOnEvent = true; this.skip = null; this.lastState = 0; this.lastRep = null; this.repAt = -1e9; this.reqSeen = new Set();
    this.ivs = []; this.tracked = new Map(); this.scanFrom = this.w.events.nextId; this.ivSeq = 1; this.convSig = '';
    if (this.w.events.registry.has('request.pending')) this.w.on('request.pending', (ev) => this.onRequest(ev));
  }
  get pid() { return typeof this.w.player === 'number' ? this.w.player : null; }
  S(f, d = null) { try { return f(); } catch (e) { return d; } }
  say(msg) { this.h.send(msg); }

  // ------------------------------------------------------------------ setup (newcomer creator / take over)
  setup() {
    const w = this.w, P = w.sys.player.query;
    const mk = () => P.vacancies().filter((u) => u.tenure === 'private_rent'); let vac = mk(), guard = 0;
    while (!vac.length && guard++ < 60) { w.run(144); vac = mk(); }
    const byB = this.h.byBid;
    const homes = vac.slice(0, 24).map((u) => ({ id: u.id, bid: u.bid, address: u.address, rent: u.rent, beds: u.bedrooms, tenure: u.tenure, cond: r2(u.cond), area: byB.get(u.bid)?.name || '' }));
    const seen = new Map(); for (const o of P.openings()) { const k = o.occ; const e = seen.get(k) || { occ: k, label: lc(k), n: 0, onmap: false }; e.n += o.count || 1; if (o.kind === 'slot') e.onmap = true; seen.set(k, e); }
    const pay = Object.fromEntries((w.pack.jobs || []).map((j) => [j.id, j.pay]));
    const jobs = [...seen.values()].map((e) => ({ ...e, pay: pay[e.occ] ?? null })).sort((a, b) => (b.onmap - a.onmap) || (b.pay - a.pay)).slice(0, 40);
    this.say({ t: 'play.setup', homes, jobs, date: w.calendar.formatDate(w.tick) });
  }
  create(args) { const r = this.verb('player.create', args, true); if (r && r.ok) { this.h.setTier('scene'); this.pauseOnEvent = true; this.h.selected = r.pid; this.say({ t: 'play.on', pid: r.pid }); this.state(true); } else this.say({ t: 'play.result', name: 'player.create', ok: false, text: (r && r.why) || 'Could not move in.' }); }
  take(pid) { const r = this.verb('player.take', { pid }, true); if (r && r.ok) { this.h.setTier('scene'); this.h.selected = pid; this.say({ t: 'play.on', pid }); this.state(true); } }
  release() { this.verb('player.release', {}, true); this.say({ t: 'play.off' }); }

  // ------------------------------------------------------------------ verbs
  verb(name, args, quiet) {
    const w = this.w; let r; try { r = w.queueCommand({ actor: 'player', name, args: args || {} }); } catch (e) { r = { ok: false, why: String(e.message || e) }; }
    if (r === true) r = { ok: true }; else if (r === false || r == null) r = { ok: false, why: 'that did not work' };
    if (!quiet) this.say({ t: 'play.result', name, ok: !!r.ok, res: r, text: this.resultText(name, args, r) });
    if (r && r.ok && /goTo|stay|goOut/.test(name)) this.h.lastDetail = 0;
    return r;
  }
  resultText(name, a, r) {
    const w = this.w, who = a && a.to != null ? w.people.get(a.to)?.firstName : '';
    if (!r.ok) return r.why ? r.why[0].toUpperCase() + r.why.slice(1) + '.' : 'That did not work out.';
    switch (name) {
      case 'player.talk': return `${who} ${r.react === 'warm' ? 'warmed to that' : r.react === 'cool' ? 'did not take it well' : 'took it in their stride'}.`;
      case 'player.goTo': return 'On your way.'; case 'player.stay': return 'Settling in.'; case 'player.goOut': return 'Off out into the city.';
      case 'player.apply': return `Application succeeded: ${lc(r.occ)}.`; case 'player.message': return 'Sent.'; case 'player.post': return 'Posted.';
      case 'player.respond': return 'Answered.'; default: return 'Done.';
    }
  }
  skipTo(ticks, label) { const w = this.w; this.skip = { limit: w.tick + Math.max(1, ticks), label, back: this.h.tier === 'pause' ? 'scene' : this.h.tier }; this.h.setTier('max'); }
  skipDue() { const s = this.skip; if (!s) return false; if (this.h.tier !== 'max') { this.skip = null; return false; } if (this.w.tick >= s.limit) { this.skip = null; this.h.setTier(s.back === 'max' ? 'scene' : s.back); this.say({ t: 'play.result', name: 'skip', ok: true, text: s.label || 'Time passes.' }); this.state(true); return true; } return false; }
  skipMorning() { const w = this.w, hr = w.time.hourFloat || 0, to = ((7 - hr + 24) % 24) || 24; this.skipTo(Math.round(to * 6) + 1, 'A new morning.'); }
  op(m) {
    switch (m.op) {
      case 'setup': return this.setup();
      case 'create': return this.create(m.args);
      case 'take': return this.take(m.pid);
      case 'release': return this.release();
      case 'do': return this.verb(m.name, m.args);
      case 'skip': return m.what === 'morning' ? this.skipMorning() : this.skipTo(Math.round((m.hours || 2) * 6), `${m.hours || 2} hours later.`);
      case 'pauseOnEvent': this.pauseOnEvent = !!m.on; return;
      case 'section': return this.section(m.name);
      case 'state': return this.state(true);
    }
  }

  // ------------------------------------------------------------------ events: pause on what matters to the player
  onEvent(ev, it) {
    const pid = this.pid; if (pid == null || !this.pauseOnEvent) return;
    if (!ev.actors || !ev.actors.includes(pid) || ev.salience < 0.45 || /^kernel\.|^goal\./.test(ev.type)) return;
    if (this.h.tier === 'pause') return; this.h.setTier('pause'); this.skip = null;
    this.say({ t: 'play.moment', why: it ? it.head : lc(ev.type), date: this.w.calendar.formatDate(this.w.tick) });
  }
  onRequest(ev) {
    const pid = this.pid; if (pid == null || ev.payload.to !== pid) return; if (this.h.tier !== 'pause' && this.pauseOnEvent) { this.h.setTier('pause'); this.skip = null; }
    this.say({ t: 'play.moment', why: 'Someone is asking you something.', request: true, date: this.w.calendar.formatDate(this.w.tick) }); this.lastState = 0;
  }

  // ------------------------------------------------------------------ HUD state (cheap, ~2 Hz)
  state(force) {
    const pid = this.pid; if (pid == null) return; const now = performance.now(); if (!force && now - this.lastState < 450) return; this.lastState = now;
    const w = this.w, p = w.people.get(pid); if (!p) return;
    const pop = p.ext.pop || {}, fin = pop.fin || {}, rt = p.ext.rt, off = !!(rt && rt.off), q = w.sys;
    const loc = p.locationId != null ? this.h.place(p.locationId) : null;
    const here = off ? [] : q.player.query.here(pid).slice(0, 12).map((id) => this.personChip(id));
    const reqs = this.S(() => q.goals.query.requests(pid), []).map((r) => { const g = this.S(() => q.goals.query.goal(r.goal)); return { id: r.id, from: this.ref(r.from), move: r.move, text: REQ_TEXT[r.move] || 'wants something from you', why: g ? g.phrase : '', left: Math.max(0, Math.round((r.until - w.tick) / 6)) }; });
    const job = this.S(() => q.labour.query.job(pid)); const unit = this.S(() => q.housing.query.unit(pid));
    const hr = w.time.hourFloat || 0;
    this.say({ t: 'play.state', s: {
      pid, homeId: p.homeId, name: nm(p), age: Math.floor(w.ageOf(p)), money: Math.round(p.money || 0), debt: Math.round(fin.debt || 0), mood: r2(p.mood || 0), needs: Object.fromEntries(Object.entries(p.needs || {}).map(([k, v]) => [k, r2(v)])),
      loc, off, here, reqs, thought: p.thought || '', canSleep: hr >= 20 || hr < 6, health: r2(p.health ?? 1), ill: !!p.illness,
      job: job && job.activity === 'employed' ? { occ: lc(job.occ), pay: job.pay, hours: job.hours } : { activity: lc(job ? job.activity : '') },
      home: unit ? { tenure: lc(unit.tenure), rent: unit.rent } : null, tick: w.tick,
    } });
  }
  ref(id) { const p = this.w.people.get(id); return { id, name: p ? nm(p) : 'someone' }; }
  personChip(id) { const p = this.w.people.get(id); if (!p) return { id, name: 'someone' }; const t = this.S(() => this.w.sys.social.query.tie(id, this.pid)); return { id, name: nm(p), age: Math.floor(this.w.ageOf(p)), job: (p.job || '').slice(0, 24), l: t ? r2(t.l) : null, known: !!(t && t.lv >= 2) }; }

  // ------------------------------------------------------------------ sheet sections (on demand)
  section(name) {
    const w = this.w, pid = this.pid; if (pid == null) return; const q = w.sys, out = { name };
    if (name === 'people') {
      out.ties = this.S(() => q.social.query.ties(pid), []).filter((t) => t.on).slice(0, 40).map((t) => ({ id: t.o, name: t.name, k: t.k, rel: t.r, warm: r2(t.l), trust: r2(t.t), seen: this.S(() => w.calendar.formatDate(t.last), '') }));
      out.here = q.player.query.here(pid).map((id) => this.personChip(id));
    } else if (name === 'phone') {
      const cm = q.comms && q.comms.query; const nameOf = (id) => nm(w.people.get(id));
      out.chats = cm ? this.S(() => cm.chats(pid), []).slice(0, 8).map((c) => ({ id: c.id, name: c.name || c.kind, kind: c.kind, n: c.n, last: this.S(() => cm.chat(c.id, 3), []).map((m) => ({ au: nameOf(m.author), text: m.text })) })) : [];
      out.forum = cm ? this.S(() => cm.forum(8), []).reverse().map((f) => ({ au: nameOf(f.author), kind: lc(f.kind), text: f.text, replies: (f.replies || []).length, date: w.calendar.formatDate(f.t) })) : [];
      out.contacts = this.S(() => q.social.query.ties(pid), []).filter((t) => t.on && t.c > 0.2).slice(0, 14).map((t) => ({ id: t.o, name: t.name, k: t.k }));
    } else if (name === 'goals') {
      out.goals = this.S(() => q.goals.query.goalsOf(pid), []).map((g) => ({ id: g.id, phrase: g.phrase, status: g.status, line: g.line || '' }));
      out.groups = this.S(() => q.goals.query.groupsOf(pid), []).map((g) => ({ id: g.id, name: g.name, kind: lc(g.kind), size: g.size }));
      out.open = this.S(() => q.goals.query.groups({}), []).filter((g) => !out.groups.some((x) => x.id === g.id)).slice(0, 12).map((g) => ({ id: g.id, name: g.name, kind: lc(g.kind), size: g.size }));
      out.templates = this.S(() => q.goals.query.templates().filter((t) => !t.mundane).map((t) => ({ id: t.id, phrase: t.phrase })), []).slice(0, 60);
      out.choices = this.S(() => q.goals.query.getChoices(pid), []).slice(0, 4).map((c) => ({ label: c.label, reason: c.reason }));
    } else if (name === 'me') {
      const rep = q.player.query.reputation(pid); const p = w.people.get(pid);
      const BEL = { moved_in: 'is new here', new_couple: 'is seeing someone', lost_job: 'lost a job', new_job: 'started a new job', ill: 'has been unwell', breakup: 'split up', in_debt: 'is short of money', evicted: 'lost a home', pregnant: 'is expecting', holiday: 'went away', crime_nearby: 'was near trouble', planning_move: 'may be leaving' };
      out.rep = { known: rep.known, warm: rep.warm, cool: rep.cool, score: rep.rep, beliefs: Object.entries(rep.beliefs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ text: BEL[k] || lc(k), n })) };
      out.log = q.player.query.log().reverse();
      const hst = this.S(() => q.health.query.status(pid)) || {}; out.health = { score: r2(p.health ?? 1), conditions: (hst.conditions || []).map(lc) };
      const fin = (p.ext.pop || {}).fin || {}; out.money = { cash: Math.round(p.money || 0), debt: Math.round(fin.debt || 0), arrears: Math.round(fin.arrears || 0), net: Math.round(fin.net || 0) };
    } else if (name === 'places') {
      out.places = [...w.buildings.values()].filter((b) => b.lf && b.lf.kind !== 'residential' && b.name).map((b) => ({ id: b.id, name: b.name, tpl: lc(b.lf.template || b.lf.category || b.type) })).sort((a, b) => a.name.localeCompare(b.name));
      out.dests = Object.keys(w.pack.meta.offmap).filter((k) => /centre|leisure|retail|airport|other_neigh/.test(k)).map((k) => ({ k, name: lc(k) }));
    } else if (name === 'work') {
      const P = q.player.query; out.openings = P.openings().slice(0, 60).map((o) => ({ occ: o.occ, label: lc(o.occ), bid: o.bid ?? null, where: o.bid != null ? this.h.place(o.bid)?.name : lc(o.dest), count: o.count }));
      out.job = this.S(() => q.labour.query.job(pid)); out.vac = P.vacancies().filter((u) => u.tenure === 'private_rent').slice(0, 10).map((u) => ({ id: u.id, address: u.address, rent: u.rent, beds: u.bedrooms }));
      out.unit = this.S(() => q.housing.query.unit(pid));
    }
    this.say({ t: 'play.section', ...out });
  }

  // ------------------------------------------------------------------ god: presets + consequence tracker
  preset(m) {
    const P = GOD_PRESETS.find((x) => x.id === m.id); if (!P) return;
    const w = this.w, before = w.events.nextId; const results = [];
    for (const s of P.steps(m.picks || {}, this.h)) { try { results.push(w.queueCommand({ actor: 'god', name: s.name, args: s.args })); } catch (e) { results.push(false); } }
    this.track(P.label, P.describe ? P.describe(m.picks || {}, this.h) : P.desc, before, P.icon);
    this.say({ t: 'result', name: P.label, ok: results.some((r) => r !== false), error: null, args: m.picks, date: w.calendar.formatDate(w.tick) });
  }
  track(label, body, before, icon) {
    const w = this.w, roots = []; for (let id = before; id < w.events.nextId; id++) { const r = w.events.get(id); if (r && r.type !== 'kernel.command') roots.push(r); }
    const iv = { id: this.ivSeq++, label, body: body || '', icon: icon || '★', tick: w.tick, date: w.calendar.formatDate(w.tick), n: 0, kinds: {}, actors: new Set(), buckets: [0], top: [], roots: roots.length, last: w.tick };
    this.ivs.push(iv); if (this.ivs.length > 12) { const old = this.ivs.shift(); for (const [k, v] of this.tracked) if (v === old) this.tracked.delete(k); }
    for (const r of roots) { this.tracked.set(r.id, iv); this.count(iv, r); }
    this.scanFrom = Math.max(this.scanFrom, w.events.nextId); this.convSig = ''; this.sendConseq();
  }
  count(iv, r) {
    iv.n++; const k = r.type.split('.')[0]; iv.kinds[k] = (iv.kinds[k] || 0) + 1; for (const a of r.actors) if (typeof a === 'number') iv.actors.add(a);
    const b = Math.max(0, Math.floor((r.tick - iv.tick) / WEEK)); while (iv.buckets.length <= b) iv.buckets.push(0); iv.buckets[b]++; iv.last = r.tick;
    if (r.salience >= 0.3 && !/^goal\.|^kernel\./.test(r.type)) { iv.top.push({ id: r.id, s: r.salience, tick: r.tick }); if (iv.top.length > 40) { iv.top.sort((a, c) => c.s - a.s || a.tick - c.tick); iv.top.length = 14; } }
  }
  scan() {
    if (!this.ivs.length) return; const ev = this.w.events, end = ev.nextId; let n = 0;
    for (let id = this.scanFrom; id < end && n < 40000; id++, n++) { const r = ev.get(id); if (!r || !r.cause) continue; const iv = this.tracked.get(r.cause); if (iv) { if (this.tracked.size < 150000) this.tracked.set(id, iv); this.count(iv, r); } }
    this.scanFrom = Math.min(end, this.scanFrom + n);
  }
  sendConseq() {
    const w = this.w, sig = this.ivs.map((i) => i.id + ':' + i.n).join(',') + ':' + Math.floor(w.tick / 144); if (sig === this.convSig) return; this.convSig = sig;
    const list = this.ivs.slice().reverse().map((iv) => {
      iv.top.sort((a, c) => c.s - a.s || a.tick - c.tick); const top = [];
      for (const t of iv.top.slice(0, 6)) { const r = w.events.get(t.id); if (!r) continue; const d = this.S(() => describeEvent(w, r, this.h.text)); if (d && d.line) top.push({ date: w.calendar.formatDate(r.tick), text: d.line, pid: typeof r.actors[0] === 'number' ? r.actors[0] : null }); }
      return { id: iv.id, label: iv.label, body: iv.body, icon: iv.icon, date: iv.date, n: iv.n, people: iv.actors.size, kinds: iv.kinds, buckets: iv.buckets.slice(0, 40), top, days: Math.round((w.tick - iv.tick) / 144), live: w.tick - iv.last < WEEK * 2 };
    });
    this.say({ t: 'conseq', list });
  }
  tickFrame() { this.scan(); this.sendConseq(); if (this.pid != null) this.state(); }
}
