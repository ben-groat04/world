// Larkfield UI host: owns the sim World, drives it at the chosen speed tier, and turns world state into compact messages.
// Worker-safe (no DOM). Used by ui/worker.js (off-thread) and by ui/store.js (main-thread fallback).
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { installSifter } from '../sim/sifter/index.js';
import { storylines, storyOf, clauseOf } from '../sim/sifter/storylines.js';
import { TextEngine } from '../sim/text/engine.js';
import textPack from '../content/larkfield/text/index.js';
import { SEGMENTS } from '../content/larkfield/segments.js';
import { openingsFor } from '../sim/population/venues.js';
import { describeEvent, newsFor, NEWS_TYPES, shortJob, thoughtFor, activityLabel } from './describe.js';
import { timelineOf, summaryOf } from './lifestory.js';
import { isPrivate, townData, bizBrief, noticesAt, pinList, crimeSample, adminData, fmtLabel } from './town.js';
import { GOD_COMMANDS, GOD_PRESETS, themeOf } from './godcatalogue.js';
import { PlayHost } from './play/host-play.js';

// Event types that belong in a followed person's running timeline, and the ones that are a big moment (a reason to slow down).
const FOLLOW_TYPES = ['life.couple', 'life.cohabit', 'life.engaged', 'life.marriage', 'life.pregnant', 'life.birth', 'life.breakup', 'life.divorce', 'life.move_out', 'life.move_in', 'life.leave_home', 'life.death', 'life.kin_death', 'life.graduate', 'life.school', 'life.caring_start', 'life.caring_end',
  'labour.hired', 'labour.job_lost', 'labour.quit', 'labour.promoted', 'labour.pay_rise', 'labour.graduated', 'labour.second_job', 'housing.moved_in', 'housing.moved_out', 'housing.eviction', 'housing.notice_served', 'housing.rent_rise', 'health.diagnosis', 'health.crisis', 'health.accident', 'health.recovered',
  'money.arrears', 'money.arrears_cleared', 'money.debt_spiral', 'social.friendship', 'social.fallout', 'social.reconcile', 'group.joined', 'group.founded', 'business.opened', 'business.closed'];
const BIG_MOMENTS = new Set(['life.couple', 'life.cohabit', 'life.engaged', 'life.marriage', 'life.pregnant', 'life.birth', 'life.breakup', 'life.divorce', 'life.move_out', 'life.leave_home', 'life.death', 'life.kin_death', 'life.graduate', 'labour.hired', 'labour.job_lost', 'labour.promoted', 'housing.moved_in', 'housing.moved_out', 'housing.eviction', 'health.diagnosis', 'health.crisis', 'business.opened', 'business.closed']);
export const TIER_LIST = [
  { id: 'pause', label: 'Pause', short: 'Pause', hint: 'Space' },
  { id: 'scene', label: 'Scene', short: 'Scene', hint: 'Watch the street live: about 1 game-hour per second' },
  { id: 'life', label: 'Lifetime', short: 'Life', hint: 'An 80-year life in about an hour' },
  { id: 'x3', label: '×3', hint: 'Three times Lifetime: a life in about 20 minutes' },
  { id: 'x8', label: '×8', hint: 'Eight times Lifetime (a fast device may reach it; otherwise as fast as it can)' },
  { id: 'max', label: 'Max', hint: 'As fast as this device can go' },
];
const SEG_SHORT = { older_longterm: 'Older locals', family_couples: 'Established families', lone_parents: 'Lone parents', students: 'Students', young_sharers: 'Young sharers', early_career: 'Early-career renters', settled_professionals: 'Settled professionals', shift_workers: 'Shift & service workers', recent_arrivals: 'Recent arrivals', local_business_families: 'Business families', benefit_dependent: 'Out of work / long-term ill' };
const SEG_IDS = SEGMENTS.map((s) => s.id), SEG_LABEL = Object.fromEntries(SEGMENTS.map((s) => [s.id, SEG_SHORT[s.id] || s.label]));
const r2 = (v) => Math.round(v * 100) / 100;
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASON = (m) => (m >= 2 && m <= 4 ? 'Spring' : m >= 5 && m <= 7 ? 'Summer' : m >= 8 && m <= 10 ? 'Autumn' : 'Winter');
const hoursText = (iv) => (iv && iv.length ? iv.map(([a, b]) => `${fh(a)}–${fh(b)}`).join(', ') : 'closed today');
const fh = (h) => { h = h % 24; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')}`; };

const BATCH = Object.fromEntries(['health.episode', 'money.arrears', 'money.cost_pressure', 'money.debt_spiral', 'labour.second_job', 'housing.moved_out', 'social.scandal', 'social.rumour', 'housing.moved_in'].map((t) => [t, t === 'social.scandal' ? [t, 1] : [t]])); // which event types fold into one line when many land on one day (the wording comes from the text pack: batch.*)
export class Host {
  constructor(seed, send) {
    this.send = send; this.seed = seed;
    const w = this.w = createLarkfieldWorld(seed);
    this.sifter = installSifter(w);
    this.text = new TextEngine(textPack, { seed });
    this.TPY = w.calendar.ticksPerYear; this.TPD = 144;
    const lifeTps = this.TPY / 45; // 45 s per game-year = 80 game-years per real hour (the user's target: one lifetime in about an hour)
    this.tiers = { pause: 0, scene: 6, life: lifeTps, x3: lifeTps * 3, x8: lifeTps * 8, max: Infinity };
    this.tier = 'pause'; this.tps = 0; this.acc = 0; this.rate = 0; this.selected = null; this.jump = null;
    this.news = []; this.newsOut = []; this.forumSeen = 0; this.feedSeen = 0; this.lastDetail = 0; this.lastSlow = 0; this.lastRoster = -1;
    this.series = []; this.pendingSeries = []; this.godWatch = null; this.lastStatTick = -1e9; this.nextNewsId = 1;
    this.byBid = new Map(); for (const b of w.buildings.values()) this.byBid.set(b.id, b);
    this.venueOf = new Map(); for (const v of w.map.lf.venues) this.venueOf.set(v.buildingId, v);
    while (w.time.hourFloat < 6.8 || w.time.hourFloat > 7.2) { w.step(); if (w.tick > 400) break; } // open the day at about 07:00
    this.sampleStats();
    for (const t of NEWS_TYPES) if (w.events.registry.has(t)) w.on(t, (ev) => this.onEvent(ev));
    // "Follow a life": while one person is followed, the events of their own life are phrased (same wording as the storylines) and sent as they happen.
    // Registered once per event type; each handler is a single id comparison when nobody is followed.
    this.lifeFollow = null;
    for (const t of FOLLOW_TYPES) if (w.events.registry.has(t)) w.on(t, (ev) => { if (this.lifeFollow) this.onFollowEvent(ev); });
    this.seenPop = -1; this.pins = new Map(); this.fresh = new Map(); this.townSig = '';
    if (w.events.registry.has('business.venueChanged')) w.on('business.venueChanged', (ev) => this.onVenue(ev));
    if (w.events.registry.has('business.opened')) w.on('business.opened', (ev) => { if (ev.place != null) { this.fresh.set(ev.place, ev.tick); this.send({ t: 'fresh', id: ev.place, tick: ev.tick }); } });
    if (w.events.registry.has('civic.planning_application')) w.on('civic.planning_application', (ev) => { if (ev.place != null) { this.pins.set(ev.id, { eid: ev.id, bid: ev.place, kind: ev.payload && ev.payload.kind, camp: false }); this.pinSig = ''; } });
    if (w.events.registry.has('civic.planning_decision')) w.on('civic.planning_decision', (ev) => { this.pins.delete(ev.cause); this.pinSig = ''; });
    if (w.events.registry.has('civic.campaign')) w.on('civic.campaign', (ev) => { const p = this.pins.get(ev.cause); if (p) { p.camp = true; this.pinSig = ''; } });
    this.play = new PlayHost(this);
  }

  // ------------------------------------------------------------------ boot
  hello() {
    const w = this.w, lf = w.map.lf;
    const buildings = [];
    for (const b of w.buildings.values()) buildings.push({ id: b.id, name: b.name, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, door: b.door, zone: b.zone, kind: b.lf?.kind, cat: b.lf?.category || null, tpl: b.lf?.template || null, arch: b.lf?.archetype || null, address: b.lf?.address || b.name, st: b.lf?.streetId ?? null, units: b.lf?.units?.length || 0, storeys: lf.buildings[b.id]?.storeys || 1 });
    const dwellings = buildings.filter((b) => b.kind === 'residential').map((b) => ({ id: b.id, name: b.name, unit: w.buildings.get(b.id).lf.units[0] }));
    const venues = buildings.filter((b) => b.tpl && b.tpl !== 'vacant_unit' && b.kind !== 'residential').map((b) => ({ id: b.id, name: b.name, tpl: b.tpl }));
    this.send({
      t: 'ready', town: 'Larkfield', seed: this.seed, tpy: this.TPY, tiers: TIER_LIST.map((t) => ({ ...t, tps: this.tiers[t.id] })),
      map: { w: lf.w, h: lf.h, tiles: new Uint8Array(lf.tiles), streets: lf.streets, buildings: lf.buildings.map((b) => ({ id: b.id, kind: b.kind, rect: b.rect, roof: b.roof, ridge: b.ridge, material: b.material, storeys: b.storeys, facing: b.facing, venueId: b.venueId, doors: b.doors, name: b.name })), venues: lf.venues, areas: lf.areas, props: lf.props, graph: null, station: lf.station, gateways: lf.gateways },
      bld: buildings, segs: SEGMENTS.map((s) => ({ id: s.id, label: SEG_SHORT[s.id] || s.label, full: s.label, blurb: s.blurb })),
      god: this.godCatalogue(), dwellings, venueList: venues, sectors: this.safe(() => w.sys.labour.query.sectors(), []),
      templates: this.safe(() => w.sys.goals.query.templates().filter((t) => !t.mundane).map((t) => ({ id: t.id, phrase: t.phrase })), []),
      time: this.timeInfo(), news: [], series: this.series.slice(), stats: this.statsDetail(), pins: pinList(this), fresh: [...this.fresh].map(([id, tick]) => ({ id, tick })),
    });
    this.sendRoster(true);
  }
  safe(f, d) { try { return f(); } catch (e) { return d; } }

  // ------------------------------------------------------------------ time / speed
  timeInfo() {
    const w = this.w, t = w.time, rec = t.rec || {};
    const hh = String(t.hour || 0).padStart(2, '0'), mm = String(t.minute || 0).padStart(2, '0');
    return { tick: w.tick, clock: `${hh}:${mm}`, hour: t.hourFloat || 0, date: w.calendar.formatDate(w.tick), year: rec.year, month: rec.month, dow: rec.dow, doy: rec.doy, season: SEASON(rec.month ?? 0), sunrise: rec.sunrise ?? 6.5, sunset: rec.sunset ?? 18, bst: !!rec.bst, bank: rec.bankHoliday || null, term: rec.term || null, weather: this.weatherInfo(rec), pop: w.living().length };
  }
  // The kernel's daily weather still uses the legacy 4x28-day seasons; remap to the real calendar month so it never snows in July.
  weatherInfo(rec) {
    const wx = this.w.weather; if (!wx) return null; const m = rec.month ?? 0, win = m === 11 || m <= 1; let type = wx.type;
    if (type === 'snow' && !win) type = 'rain'; if (type === 'fog' && (m >= 5 && m <= 7)) type = 'cloudy'; if (type === 'rain' && m >= 6 && m <= 7 && wx.temp > 20) type = 'clear';
    const legacy = [11, 22, 10, -1][this.w.time.season ?? 0], mean = [5, 5, 8, 10, 13, 16, 19, 19, 16, 12, 8, 5][m];
    return { type, temp: Math.round(mean + (wx.temp - legacy) * 0.6) };
  }
  setTier(id) {
    if (!(id in this.tiers)) id = 'life'; this.tier = id; this.tps = this.tiers[id]; this.acc = 0;
    this.send({ t: 'speed', tier: id, tps: this.tps });
  }
  advance(dtSec, budgetMs = 12) {
    if (this.tps === 0) { this.rate *= 0.9; return 0; }
    const w = this.w, t0 = performance.now(); let n = 0;
    if (this.tps === Infinity) { while (performance.now() - t0 < budgetMs && n < 30000) { w.step(); n++; if ((this.jump || this.play.skip) && this.checkJump()) break; } }
    else { this.acc = Math.min(this.acc + dtSec * this.tps, this.tps * 0.4 + 4); while (this.acc >= 1 && performance.now() - t0 < budgetMs) { w.step(); this.acc--; n++; if ((this.jump || this.play.skip) && this.checkJump()) break; } }
    if (dtSec > 0) this.rate = this.rate * 0.85 + (n / dtSec) * 0.15;
    if (w.tick - this.lastStatTick >= this.TPD * 14) this.sampleStats();
    return n;
  }
  checkJump() { if (this.play.skipDue()) return true; const j = this.jump; if (!j) return false; if (this.w.tick > j.limit) { this.jump = null; this.setTier('pause'); this.send({ t: 'jumped', item: null }); return true; } return false; }

  // ------------------------------------------------------------------ events -> feeds
  onVenue(ev) { const pl = ev.payload || {}; this.send({ t: 'venue', id: ev.place, name: pl.name, tpl: pl.to, cat: pl.category, vacant: pl.to === 'vacant_unit', variant: pl.variant || null, tick: ev.tick }); this.townSig = ''; }
  onFollowEvent(ev) {
    const lf = this.lifeFollow, id = lf.id; if (!ev.actors || !ev.actors.includes(id) || isPrivate(ev)) return;
    const w = this.w, p = w.people.get(id); if (!p) return; const c = clauseOf(ev, w, [id]); if (!c || !c.t) return;
    const big = BIG_MOMENTS.has(ev.type) && (ev.type !== 'life.death' || ev.actors[0] !== id), t = c.t + (c.x || '');
    lf.out.push({ tick: ev.tick, date: w.calendar.formatDate(ev.tick), text: `${p.firstName} ${t}.`, big, type: ev.type });
    if (lf.out.length > 40) lf.out.shift();
    if (big && lf.slow && (this.tier === 'x3' || this.tier === 'x8' || this.tier === 'max')) { this.setTier('life'); lf.out[lf.out.length - 1].slowed = true; }
  }
  onEvent(ev) {
    if (isPrivate(ev)) return;
    const w = this.w; const it = newsFor(w, this.text, ev, this); this.play.onEvent(ev, it); if (!it) return;
    if (it.kind === 'crime') { const k = this.crimeSeen || (this.crimeSeen = new Map()), last = k.get(ev.type); if (last != null && ev.tick - last < this.TPD * 14) return; k.set(ev.type, ev.tick); } // at most one item per kind of offence a fortnight: a calm local-paper rhythm, not a ticker
    if (ev.type === 'health.outbreak') { const k = this.outSeen || (this.outSeen = new Map()), key = (ev.payload && ev.payload.phase) + ':' + (ev.payload && ev.payload.name), last = k.get(key); if (last != null && ev.tick - last < this.TPD * 3) return; k.set(key, ev.tick); } // the god preset and the health system can both announce the same wave
    it.id = this.nextNewsId++; const tr = this.play.tracked, iv = ev.cause ? tr.get(ev.cause) : null; // cause-linked: caused (directly or down a chain) by something the god did
    if (iv) { tr.set(ev.id, iv); it.conseq = true; it.because = iv.label; }
    // a shock hits dozens of households at once: show the first few, then fold the rest into one line instead of flooding the feed
    if (iv && ev.type === 'housing.rent_rise') { const r = this.roll || (this.roll = {}); const k = iv.id + ':' + Math.floor(ev.tick / this.TPD); const x = r[k] || (r[k] = { n: 0 }); x.n++;
      if (x.n === 4) { const bt = this.batchText('batch.head:god.rent_letters', 'batch.body:god.rent_letters', ev, x.n); if (bt) { it.head = bt.head; it.body = bt.body; } it.sal = Math.max(it.sal, 0.6); } else if (x.n > 4) return; }
    // month-end/start batches (budgets, mood reviews) land on one day: the first two items per type show, the third becomes one summary line, the rest are dropped
    const cap = BATCH[ev.type]; if (cap && !iv) { const k = ev.type + ':' + Math.floor(ev.tick / this.TPD), c = this.dayCap || (this.dayCap = new Map()); const n = (c.get(k) || 0) + 1; c.set(k, n); if (c.size > 400) c.delete(c.keys().next().value);
      const show = cap[1] ?? 2; if (n === show + 1) { const bt = this.batchText('batch.head:' + ev.type, 'batch.body:' + ev.type, ev, n); if (bt) { it.head = bt.head; it.body = bt.body; } it.ppl = []; it.sal = Math.min(it.sal, 0.35); } else if (n > show + 1) return; }
    // leaving and re-arriving within days is one change of address inside the area, not a farewell plus a welcome
    if (ev.type === 'life.move_out' && ev.actors && ev.actors[0] != null) { const h = this.heldOut || (this.heldOut = new Map()); h.set(ev.actors[0], { it, ev }); return; }
    if (ev.type === 'life.move_in' && ev.actors && this.heldOut && this.heldOut.has(ev.actors[0])) { const h = this.heldOut.get(ev.actors[0]); this.heldOut.delete(ev.actors[0]);
      if (ev.tick - h.ev.tick < this.TPD * 5) { const p = this.w.people.get(ev.actors[0]); const n = p ? nm(p) : 'A resident'; const f = p ? p.firstName : 'A resident';
        const bt = this.batchText('batch.moved', 'batch.moved.body', ev, 1, p); it.head = bt ? bt.head : `${n} changes address`; it.body = bt ? bt.body : `${n} is staying in the area, just not at the old address.`; it.kind = 'housing'; it.sal = 0.3; it.type = 'life.move_local'; }
      else this.commit(h.it, h.ev); }
    this.commit(it, ev);
  }
  commit(it, ev) {
    this.news.push(it); this.newsOut.push(it); if (this.news.length > 600) this.news.splice(0, 100);
    if (this.jump && it.sal >= this.jump.min && ev.tick > this.jump.start) { this.jump = null; this.setTier('pause'); this.send({ t: 'jumped', item: it }); }
  }
  /** Head and body for a folded batch of events, from the text pack with real specifics (the street of the latest case, the month, who moved). */
  batchText(hk, bk, ev, n, who) {
    const w = this.w; if (!this.text.has(hk)) return null;
    const pid = who ? who.id : ev.actors && ev.actors[0], P = pid != null ? w.people.get(pid) : null, street = this.safe(() => w.map.lf.streets[w.buildings.get(P.homeId).lf.streetId].name, '') || this.safe(() => w.map.lf.streets[w.buildings.get(ev.place).lf.streetId].name, '') || 'the neighbourhood';
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], d = w.calendar.dateOf(ev.tick) || {};
    const ctx = { genre: 'news', a: P ? { id: P.id, firstName: P.firstName, lastName: P.lastName, sex: P.sex } : undefined, seed: ev.id, p: { street, month: MONTHS[d.m] || 'month', n, where: ['round the corner', 'a few streets along', 'down the road'][ev.id % 3] } };
    try { const head = this.text.render(hk, ctx, w), body = this.text.render(bk, { ...ctx, seed: ev.id + 7 }, w); return head && body && !/[{}#]/.test(head + body) ? { head, body } : null; } catch (e) { return null; }
  }
  releaseHeld() { if (!this.heldOut || !this.heldOut.size) return; for (const [k, h] of this.heldOut) if (this.w.tick - h.ev.tick >= this.TPD * 5) { this.heldOut.delete(k); this.commit(h.it, h.ev); } }
  ref(id) { const p = this.w.people.get(id); return p ? { id, name: nm(p) } : { id, name: typeof id === 'string' ? '(elsewhere)' : 'someone' }; }

  // ------------------------------------------------------------------ frames
  sendRoster(force) {
    const w = this.w; if (!force && w.people.size === this.lastRoster) return; this.lastRoster = w.people.size;
    const out = []; for (const p of w.people.values()) { if (!p.alive) continue; out.push([p.id, p.firstName, p.lastName, SEG_IDS.indexOf(p.ext.pop?.seg), p.sex === 'F' ? 1 : 0, +(p.genes?.skinTone ?? 0.5).toFixed(2), +(p.genes?.hairColor ?? 0.4).toFixed(2), p.ext.pop?.occ || '']); }
    this.send({ t: 'roster', list: out });
  }
  frame(now) {
    const w = this.w, L = w.living(); const n = L.length, pk = new Float32Array(n * 7); let off = 0, i = 0;
    for (const p of L) {
      const rt = p.ext.rt, o = rt && rt.off ? 1 : 0; off += o;
      pk[i++] = p.id; pk[i++] = p.x; pk[i++] = p.y; pk[i++] = o ? 2 : p.inside ? 1 : 0; pk[i++] = SEG_IDS.indexOf(p.ext.pop?.seg); pk[i++] = w.ageOf(p); pk[i++] = Math.round((p.mood || 0) * 100) + (p.illness ? 1000 : 0) + (p.sex === 'F' ? 2000 : 0);
    }
    const occ = []; for (const b of w.buildings.values()) if (b.occupants && b.occupants.size) occ.push(b.id, b.occupants.size);
    const time = this.timeInfo(); time.off = off; time.rate = this.rate; time.tier = this.tier;
    this.send({ t: 'frame', time, people: pk, occ: new Int16Array(occ) }, [pk.buffer]);
    if (this.lifeFollow && this.lifeFollow.out.length) this.send({ t: 'lifeFollow', id: this.lifeFollow.id, items: this.lifeFollow.out.splice(0) });
    if (w.people.size !== this.lastRoster) this.sendRoster();
    this.releaseHeld();
    if (this.newsOut.length) { this.send({ t: 'news', items: this.newsOut.splice(0, 200) }); }
    if (now - this.lastSlow > (this.tps > 3000 ? 2500 : 1200)) { this.lastSlow = now; this.slowFeeds(); }
    if (this.pendingSeries.length) { this.send({ t: 'stats', samples: this.pendingSeries.splice(0), stats: this.statsDetail() }); }
    this.play.tickFrame();
    const gap = this.tps > 3000 ? 900 : 300;
    if (this.selected != null && now - this.lastDetail > gap) { this.lastDetail = now; const d = this.personDetail(this.selected); if (d) this.send({ t: 'detail', p: d }); }
  }
  slowFeeds() {
    const w = this.w; const cm = w.sys.comms && w.sys.comms.query;
    let forum = [], feed = [];
    if (cm) { forum = this.safe(() => cm.forum(40), []); feed = this.safe(() => cm.feed(40), []); }
    const author = (id) => { const p = w.people.get(id); return { id, name: nm(p), seg: SEG_LABEL[p?.ext.pop?.seg] || '' }; };
    const posts = [];
    for (const f of forum) posts.push({ id: 'f' + f.id, ch: 'forum', t: f.t, date: w.calendar.formatDate(f.t), au: author(f.author), kind: f.kind, text: f.text, seen: f.seen, replies: (f.replies || []).map((r) => ({ au: author(r.author), text: r.text, tone: r.tone })) });
    for (const f of feed) posts.push({ id: 'p' + f.id, ch: 'feed', t: f.t, date: w.calendar.formatDate(f.t), au: author(f.author), kind: f.kind, text: f.text, reach: f.reach });
    posts.sort((a, b) => b.t - a.t);
    const sig = posts.length ? posts[0].id + ':' + posts.length : '';
    if (sig !== this.postSig) { this.postSig = sig; this.send({ t: 'posts', posts: posts.slice(0, 60), source: cm ? 'comms' : 'events' }); }
    const psig = [...this.pins.values()].map((p) => p.eid + (p.camp ? 'c' : '')).join(','); if (psig !== this.pinSig) { this.pinSig = psig; this.send({ t: 'pins', list: pinList(this) }); }
    // storylines
    const arcs = this.safe(() => storylines(this.sifter, w, { limit: 6 }), []); const asig = arcs.map((a) => a.id + ':' + a.beats.length + ':' + a.idle).join(',');
    if (asig !== this.arcSig) {
      this.arcSig = asig; const top = arcs.find((a) => a.status === 'open') || arcs[0];
      this.send({ t: 'arcs', arcs, follow: top ? { id: top.actors[0].id, name: top.actors[0].name, why: top.headline, kind: top.label } : null, quiet: arcs.length === 0, stats: this.sifter.stats() });
    }
  }
  arcView(a) {
    const w = this.w; const beats = [];
    for (let i = a.beats.length - 1; i >= 0 && beats.length < 5; i--) {
      const b = a.beats[i]; if (/^goal\.(step|effect|planned|replanned|deferred|formed)$|^social\.rumour$|^group\.meeting$|^kernel\./.test(b.type)) continue;
      const ev = w.events.get ? w.events.get(b.eid) : null; if (!ev || isPrivate(ev) || /^crime\./.test(ev.type)) continue; const d = describeEvent(w, ev, this.text); if (d.generic && !/^social|^health|^life/.test(b.type)) continue;
      beats.unshift({ tick: b.tick, date: w.calendar.formatDate(b.tick), stage: b.stage, text: d.line, eid: b.eid });
    }
    return { id: a.id, kind: a.kind, status: a.status, outcome: a.outcome, stage: a.stage, score: r2(a.score), n: a.beats.length, start: w.calendar.formatDate(a.start), last: w.calendar.formatDate(a.last), days: Math.round((a.last - a.start) / this.TPD), actors: a.actors.slice(0, 5).map((id) => this.ref(id)), beats, quiet: !!a.quiet };
  }

  // ------------------------------------------------------------------ stats
  sampleStats() {
    const w = this.w; this.lastStatTick = w.tick; const L = w.living(); let mood = 0, lone = 0, ad = 0, ten = {}; const q = w.sys; let burdenSum = 0, burdenN = 0;
    for (const p of L) { mood += p.mood || 0; if (p.ext.hl && p.ext.hl.lonely) lone++; if (w.ageOf(p) >= 18) { ad++; const b = this.safe(() => q.housing.query.rentBurden(p.id), 0); if (b > 0) { burdenSum += b; burdenN++; } } }
    const hs = this.safe(() => q.housing.query.stats(), {}), ls = this.safe(() => q.labour.query.stats(), {}), ms = this.safe(() => q.money.query.stats(), {});
    const s = { tick: w.tick, date: w.calendar.formatDate(w.tick), year: w.time.rec?.year, pop: L.length, unemp: r2((ls.rate || 0) * 100), burden: burdenN ? r2(burdenSum / burdenN * 100) : 0, mood: r2(mood / (L.length || 1)), lone: r2(lone / (L.length || 1) * 100), births: w.stats.births || 0, deaths: w.stats.deaths || 0, moves: hs.moves || 0, vac: r2((hs.vacancyRate || 0) * 100), pressured: ms.last?.pressured || 0, ...(this.safe(() => crimeSample(this), null) || {}), biz: this.safe(() => w.sys.business.query.stats().vacant, 0), rentIdx: r2(this.safe(() => q.housing.query.market().rentIndex, 1)), arrears: 0 };
    this.series.push(s); this.pendingSeries.push(s); if (this.series.length > 700) this.series.shift();
  }
  statsDetail() {
    const w = this.w, pyr = Array.from({ length: 19 }, (_, i) => ({ lo: i * 5, m: 0, f: 0 })), segs = {}; let n = 0;
    for (const p of w.living()) { const a = Math.floor(w.ageOf(p)), b = pyr[Math.min(18, Math.floor(a / 5))]; if (p.sex === 'F') b.f++; else b.m++; const s = p.ext.pop?.seg; segs[s] = (segs[s] || 0) + 1; n++; }
    const hs = this.safe(() => w.sys.housing.query.stats(), {}), ls = this.safe(() => w.sys.labour.query.stats(), {});
    return { pyr, segs, tenure: hs.tenure || {}, units: hs.units, households: hs.households, overcrowded: hs.overcrowdedRate, labour: ls, housing: hs, macro: this.safe(() => w.sys.money.query.macro(), {}), n };
  }

  // ------------------------------------------------------------------ details
  place(id) { const b = id != null ? this.byBid.get(id) : null; return b ? { id: b.id, name: b.name } : null; }
  personDetail(id) {
    const w = this.w, p = w.people.get(id); if (!p) return null; const q = w.sys, pop = p.ext.pop || {}, age = w.ageOf(p), S = (f, d = null) => this.safe(f, d);
    const home = this.place(p.homeId), unit = S(() => q.housing.query.unit(id)), job = S(() => q.labour.query.job(id)), now = S(() => q.routine.query.now(p));
    const wp = job && job.workplace; let workplace = null;
    if (pop.workplace && pop.workplace.kind === 'onmap') workplace = { ...this.place(pop.workplace.bid), mode: pop.workplace.mode, mins: pop.workplace.mins };
    else if (wp) workplace = { name: (wp.dest || 'elsewhere').replace(/_/g, ' '), offmap: true, mode: wp.mode, mins: wp.mins, hybrid: wp.hybrid };
    const press = S(() => q.money.query.pressure(id)), bud = S(() => q.money.query.budget(id)), fin = pop.fin || {};
    const hst = S(() => q.health.query.status(id)), men = S(() => q.health.query.mental(id)), wb = S(() => q.health.query.wellbeing(id));
    const goalList = S(() => q.goals.query.goalsOf(id), []).map((g) => ({ id: g.id, phrase: g.phrase, status: g.status, intensity: r2(g.intensity), secret: g.secret, method: g.method, step: g.step, line: g.line, log: (g.log || []).slice(-2) }));
    const groups = S(() => q.goals.query.groupsOf(id), []).map((g) => ({ id: g.id, name: g.name, kind: g.kind, size: g.size, role: g.role || (g.leader === id ? 'leader' : 'member'), venue: this.place(g.venue) }));
    const part = S(() => q.life.query.partner(id)), lst = S(() => q.life.query.status(id));
    const ties = S(() => q.social.query.ties(id), []).map((t) => ({ id: t.o, name: t.name, k: t.k, r: t.r, strength: r2(t.c), warmth: r2(t.l), trust: r2(t.t), on: !!t.on, via: t.v, conf: !!t.cf }));
    const life = timelineOf(w, p, w.events.query({ actor: id, minSalience: 0.12, limit: 400 })).map((l) => ({ tick: l.tick, date: w.calendar.formatDate(l.tick), text: l.text, imp: l.imp, ev: !!l.ev, et: l.et || '' }));
    const hh = S(() => w.lf.households[pop.hh]), mem = hh && hh.members ? hh.members.filter((x) => x !== id).map((x) => this.ref(x)) : [];
    const loc = p.locationId != null ? this.place(p.locationId) : null;
    const street = S(() => w.map.lf.streets[w.buildings.get(p.homeId).lf.streetId].name, '');
    const kidsF = (p.family?.childrenIds || []).map((k) => w.people.get(k)).filter((k) => k && k.alive).map((k) => ({ name: k.firstName, age: Math.floor(w.ageOf(k)) }));
    const wpl2 = workplace ? (workplace.offmap ? 'in the city' : 'at ' + workplace.name) : '';
    const bio = S(() => summaryOf(w, p, { age: Math.floor(age), partner: part, kids: kidsF, jobLabel: job && job.occ ? shortJob((w.pack.jobs.find((j) => j.id === job.occ) || {}).label || job.occ) : '', workplace: wpl2, activity: pop.activity, school: pop.school && pop.school.kind, role: pop.role, yearsAtAddress: pop.yearsAtAddress, street, tenure: unit && unit.tenure, household: hh && hh.members ? hh.members.length : 1, timeline: life.map((l) => ({ ...l })) }), '');
    const co = { press, unit, goals: goalList, partner: part, lst, ties: S(() => q.social.query.ties(id), []), now, wb };
    const richNow = now ? activityLabel(w, p, now, {}) : '';
    return {
      id, name: nm(p), first: p.firstName, last: p.lastName, age: Math.floor(age), ageF: age, sex: p.sex, alive: !!p.alive, died: !p.alive && p.deathTick != null, movedAway: !p.alive && !!p.emigrated, movedTo: p.emigratedTo || null, cause: p.causeOfDeath || null,
      seg: pop.seg, segLabel: SEG_LABEL[pop.seg] || '', role: pop.role, eth: pop.eth, born: pop.birthplace, bornUK: pop.bornUK, religion: pop.religion, yearsAtAddress: p.alive ? pop.yearsAtAddress : null, edu: pop.edu, car: !!pop.car, pets: pop.pets,
      home: p.alive ? home : null, household: { size: hh ? (hh.members ? hh.members.length : null) : null, members: mem }, unit: unit && p.alive ? { tenure: unit.tenure, rent: unit.rent, bedrooms: unit.bedrooms, cond: r2(unit.cond), damp: !!unit.damp, notice: !!unit.notice, landlord: unit.landlord != null && w.people.has(unit.landlord) ? this.ref(unit.landlord) : null, address: unit.address, value: unit.value } : null,
      job: p.job, occLabel: job && job.occ ? shortJob((w.pack.jobs.find((j) => j.id === job.occ) || {}).label || job.occ) : '', activity: pop.activity, jobInfo: job, workplace,
      money: { pressure: press, budget: bud, savings: Math.round(fin.savings || 0), debt: Math.round(fin.debt || 0), arrears: Math.round(fin.arrears || 0), net: Math.round(fin.net || 0), gross: Math.round(fin.gross || 0), burden: S(() => q.housing.query.rentBurden(id), 0) },
      health: { status: hst, mental: men, wellbeing: wb, mood: r2(p.mood || 0) }, needs: p.needs,
      now: now && p.alive ? { act: now.act, cat: now.cat, off: now.off, label: richNow || now.label, plain: now.label } : null, thought: p.alive ? thoughtFor(w, this.text, p, co) || '' : '', bio, loc, offmap: !!(now && now.off),
      story: this.safe(() => storyOf(this.sifter, w, id), null), goals: goalList, groups, partner: part, lifeStatus: lst, ties, life, drives: pop.drives, personality: p.personality, traits: p.traits, interests: p.interests,
      portrait: { id: String(p.id), genes: p.genes, sex: p.sex, age, mood: p.mood, health: p.health, alive: !!p.alive || !!p.emigrated }, tick: w.tick,
    };
  }
  buildingDetail(id) {
    const w = this.w, b = w.buildings.get(id); if (!b) return null; const v = this.venueOf.get(id), q = w.sys, rec = w.time.rec || {}, lf = b.lf || {};
    const P = (ids) => (ids || []).map((i) => w.people.get(i)).filter((p) => p && p.alive).map((p) => ({ id: p.id, name: nm(p), job: shortJob(p.job), age: Math.floor(w.ageOf(p)) }));
    const inside = P([...(b.occupants || [])].map((p) => (typeof p === 'object' ? p.id : p)));
    const iv = v ? openingsFor(w.pack, v, rec.dow, rec.bankHoliday) : null;
    const units = (lf.units || []).slice(0, 8).map((u) => this.safe(() => { const U = w.lf.housing.list.find((x) => x.id === u); return U ? { id: U.id, tenure: U.tenure, bedrooms: U.bedrooms, rent: U.rent, cond: r2(U.cond), vacant: U.hh < 0, landlord: U.landlord != null && w.people.has(U.landlord) ? this.ref(U.landlord) : null } : null; }, null)).filter(Boolean);
    const staff = this.safe(() => q.labour.query.firm(id), null);
    const owner = b.ownerId != null ? this.ref(b.ownerId) : (units.find((u) => u.landlord) || {}).landlord || null;
    return { id, name: b.name, address: lf.address || b.name, type: b.type, kind: lf.kind, cat: lf.category, tpl: lf.template, arch: lf.archetype, hours: iv ? hoursText(iv) : null, open: iv ? iv.some(([a, b2]) => (w.time.hourFloat >= a && w.time.hourFloat < b2)) : null, capacity: v ? v.capacity : null, inside, residents: P(b.residents).slice(0, 16), employees: P(b.employees).slice(0, 16), units, owner, firm: staff, year: w.map.lf.buildings[id]?.year, storeys: w.map.lf.buildings[id]?.storeys, biz: this.safe(() => bizBrief(this, id), null), notices: this.safe(() => noticesAt(this, id), []), fresh: this.fresh.has(id) ? this.fresh.get(id) : null, now: w.tick };
  }
  directory() {
    const w = this.w, out = []; for (const p of w.living()) { const pop = p.ext.pop || {}; out.push([p.id, nm(p), Math.floor(w.ageOf(p)), SEG_IDS.indexOf(pop.seg), shortJob(p.job), (this.byBid.get(p.homeId)?.name || ''), pop.fin?.stress ?? 0, p.sex === 'F' ? 1 : 0, p.ext.rt && p.ext.rt.off ? 1 : 0, pop.activity || '', Math.round(p.money || 0), (pop.role === 'adult_child' || pop.role === 'child' ? 'family' : (this.w.lf.households[pop.hh] || {}).tenure || ''), Math.round((pop.fin || {}).arrears || 0) + Math.round((pop.fin || {}).debt || 0)]); }
    return out;
  }

  // ------------------------------------------------------------------ god mode
  godCatalogue() { const have = (n) => this.w.commands.has(n); const list = GOD_COMMANDS.filter((c) => have(c.name)).map(({ name, group, label, icon, desc, params }) => ({ name, group, theme: themeOf(name, group), label, icon, desc, params })); const known = new Set(GOD_COMMANDS.map((c) => c.name)); const other = [...this.w.commands.handlers.keys()].filter((n) => !known.has(n) && !/^(routine\.|kernel\.)|initPerson|initHousehold|\.init$/.test(n)); return { list, other: other.filter((n) => !/^player\./.test(n)), presets: GOD_PRESETS.map(({ id, label, icon, desc, picks, lasts, undo }) => ({ id, label, icon, desc, picks: picks || [], lasts: lasts || null, undo: undo ? undo.label : null })) }; }
  runCommand(m) {
    const w = this.w; let res = null, err = null; const c = GOD_COMMANDS.find((x) => x.name === m.name);
    try { const args = c && c.build ? c.build(m.args || {}, this) : (m.args || {}); const before = w.tick; const ev0 = w.events.nextId; res = w.queueCommand({ actor: 'god', name: m.name, args }); if (!m.quiet) this.play.track(c ? c.label : m.name, c && c.describe ? c.describe(m.args || {}, this) : '', ev0, c && c.icon); this.godWatch = { tick: before, until: before + this.TPD * 20 }; if (!m.quiet && this.tier === 'pause') this.setTier('scene');
      const it = { id: this.nextNewsId++, tick: w.tick, date: w.calendar.formatDate(w.tick), kind: 'god', type: 'god.' + m.name, head: `God mode: ${c ? c.label : m.name}`, body: c ? c.describe?.(m.args || {}, this) || c.desc : m.name, ppl: [], sal: 1, ok: res !== false }; this.news.push(it); this.newsOut.push(it);
    } catch (e) { err = String(e && e.message || e); }
    let out; try { out = res === undefined ? null : JSON.parse(JSON.stringify(res)); } catch (e) { out = String(res); }
    this.send({ t: 'result', name: m.name, args: m.args, ok: !err && res !== false, error: err, result: out, date: w.calendar.formatDate(w.tick) });
    this.lastDetail = 0;
  }

  command(m) {
    switch (m.cmd) {
      case 'setSpeed': this.setTier(m.tier); break;
      case 'select': this.selected = m.id; this.lastDetail = 0; if (this.lifeFollow && this.lifeFollow.id !== m.id) this.lifeFollow = null; break;
      case 'followLife': this.lifeFollow = m.on && m.id != null ? { id: m.id, slow: m.slow !== false, out: [] } : null; break;
      case 'building': this.send({ t: 'building', b: this.buildingDetail(m.id) }); break;
      case 'directory': this.send({ t: 'directory', list: this.directory() }); break;
      case 'jump': this.jump = { min: m.min ?? 0.5, start: this.w.tick, limit: this.w.tick + this.TPY * 2 }; this.setTier('max'); break;
      case 'god': this.runCommand(m); break;
      case 'godPreset': this.play.preset(m); break;
      case 'play': this.play.op(m); break;
      case 'town': this.send({ t: 'town', d: townData(this), tick: this.w.tick }); break;
      case 'history': this.send({ t: 'news', items: this.news.slice(-300), replace: true }); break;
    }
  }
}
