// Hollowmere UI data layer + Web Worker.
//  * As a Worker (new Worker('ui/worker.js', {type:'module'})): runs the sim off-thread, posts compact snapshots.
//  * As a module (import { createWorkerSource, createLocalSource } from './worker.js'): returns a `Store`
//    the UI panels subscribe to. createLocalSource(world) runs the same snapshot builders on the main thread
//    (no worker) so the panels also work with the integrator's existing main-thread loop.
// The module part has NO static sim imports and is DOM-free, so it is safe inside a worker.

// ---------------------------------------------------------------- speed tiers
export const TIERS = [
  { id: 'pause', label: 'Pause', tps: 0 },
  { id: 'scene', label: 'Scene', tps: 4, hint: 'slow: watch conversations unfold' },
  { id: 'life', label: 'Lifetime', tps: 322, hint: 'a 70-year life in an hour (~50 s per game-year)' },
  { id: 'x5', label: 'x5', tps: 1610 },
  { id: 'x20', label: 'x20', tps: 6440 },
  { id: 'max', label: 'Max', tps: Infinity },
];
export const TICKS_PER_DAY = 144, DAYS_PER_YEAR = 112, TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const r2 = (v) => Math.round(v * 100) / 100;
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : '?');
const ageOf = (w, p) => (w.tick - p.birthTick) / TICKS_PER_YEAR;
const dateOf = (w, tick) => (w.formatDate ? w.formatDate(tick) : `Day ${Math.floor(tick / TICKS_PER_DAY)}`).replace(/, Year -(\d+)/, (m, n) => `, ${n} yr${n === '1' ? '' : 's'} before the founding`);
const ref = (w, id) => { const p = id != null ? w.people.get(id) : null; return p ? { id: p.id, name: nm(p), alive: !!p.alive, age: Math.floor(ageOf(w, p)), sex: p.sex } : null; };

// ---------------------------------------------------------------- builders (pure functions of world)
export function clockInfo(w) {
  const t = w.time || {};
  const hh = String(t.hour ?? 0).padStart(2, '0'), mm = String(t.minute ?? 0).padStart(2, '0');
  return {
    tick: w.tick, date: dateOf(w, w.tick), clock: `${hh}:${mm}`, hour: t.hourFloat ?? t.hour ?? 0, year: t.year ?? 1,
    season: t.season ?? 0, seasonName: t.seasonName || SEASONS[t.season ?? 0], day: t.dayOfSeason ?? 1,
    weather: w.weather ? { type: w.weather.type, temp: w.weather.temp } : null, pop: w.living().length,
    town: w.town ? { name: w.town.name, treasury: Math.round(w.town.treasury || 0) } : null,
    player: w.player ?? null,
    festival: (() => { const F = w.town && w.town.festivalToday; return F ? { name: F.name, kind: F.kind, venueId: F.venueId ?? null, start: F.startHour, end: F.endHour } : null; })(),
  };
}

// compact render snapshot: 6 floats per living person [id, x, y, flags, mood*100, age]
// flags: 1 = inside a closed building, 2 = female, 4 = child(<16), 8 = sick, 16 = walking
export function packPeople(w) {
  const L = w.living(), out = new Float32Array(L.length * 6);
  let i = 0;
  for (const p of L) {
    const ca = p.currentAction, age = ageOf(w, p);
    out[i++] = p.id; out[i++] = p.x; out[i++] = p.y;
    out[i++] = (p.inside ? 1 : 0) | (p.sex === 'F' ? 2 : 0) | (age < 16 ? 4 : 0) | (p.illness ? 8 : 0) | (ca && ca.status === 0 ? 16 : 0);
    out[i++] = Math.round((p.mood || 0) * 100); out[i++] = age;
  }
  return out;
}

const REL_TAGS_FAMILY = new Set(['family', 'parent', 'child', 'sibling', 'spouse', 'kin']);
export function snapshotPerson(w, id) {
  const p = w.people.get(id);
  if (!p) return null;
  const age = ageOf(w, p), f = p.family || {};
  const home = p.homeId != null ? w.buildings.get(p.homeId) : null, work = p.workId != null ? w.buildings.get(p.workId) : null;
  const loc = p.locationId != null ? w.buildings.get(p.locationId) : null;
  const ca = p.currentAction;
  const famIds = new Set([f.fatherId, f.motherId, ...(f.childrenIds || []), ...(f.siblingIds || [])].filter((x) => x != null));
  const partnerId = p.romance?.partnerId ?? f.spouseId ?? null;
  const exIds = new Set(f.exSpouseIds || []);
  // relationships
  const rels = [];
  if (p.relationships) for (const [oid, r] of p.relationships) {
    const o = w.people.get(oid); if (!o) continue;
    const tags = r.tags || [];
    let kind = 'acquaintance';
    if (oid === partnerId) kind = 'partner';
    else if (famIds.has(oid) || tags.some((t) => REL_TAGS_FAMILY.has(t))) kind = 'family';
    else if (exIds.has(oid) || tags.includes('ex')) kind = 'ex';
    else if (tags.includes('enemy') || r.affinity < -0.45) kind = 'enemy';
    else if (tags.includes('rival') || r.affinity < -0.2) kind = 'rival';
    else if (tags.includes('crush') || (r.attraction > 0.55 && r.affinity > 0.1 && Math.abs(ageOf(w, o) - age) < 25 && age > 15)) kind = 'crush';
    else if (tags.includes('friend') || tags.includes('best friend') || r.affinity > 0.4) kind = 'friend';
    else if (tags.includes('coworker')) kind = 'coworker';
    if (kind === 'acquaintance' && r.familiarity < 0.12) continue;
    rels.push({ id: oid, name: nm(o), age: Math.floor(ageOf(w, o)), alive: !!o.alive, sex: o.sex, kind, tags: tags.slice(0, 5), aff: r2(r.affinity), att: r2(r.attraction), trust: r2(r.trust), resp: r2(r.respect), fam: r2(r.familiarity) });
  }
  rels.sort((a, b) => (b.fam + Math.abs(b.aff)) - (a.fam + Math.abs(a.aff)));
  const relsOut = [], counts = {};
  for (const r of rels) { const c = (counts[r.kind] = (counts[r.kind] || 0) + 1); if (c <= 12) relsOut.push(r); }
  // family tree (two generations up where known)
  const par = (q) => (q ? { father: ref(w, q.family?.fatherId), mother: ref(w, q.family?.motherId) } : {});
  const father = f.fatherId != null ? w.people.get(f.fatherId) : null, mother = f.motherId != null ? w.people.get(f.motherId) : null;
  const kids = (f.childrenIds || []).map((c) => ref(w, c)).filter(Boolean);
  const grandkids = [];
  for (const c of f.childrenIds || []) { const cp = w.people.get(c); if (cp) for (const g of cp.family?.childrenIds || []) { const r = ref(w, g); if (r) grandkids.push(r); } }
  const family = {
    father: ref(w, f.fatherId), mother: ref(w, f.motherId),
    paternal: par(father), maternal: par(mother),
    spouse: ref(w, f.spouseId ?? (p.romance?.status === 'married' ? p.romance.partnerId : null)),
    partner: p.romance?.partnerId != null ? { ...ref(w, p.romance.partnerId), status: p.romance.status } : null,
    exSpouses: (f.exSpouseIds || []).map((x) => ref(w, x)).filter(Boolean),
    siblings: (f.siblingIds || []).map((x) => ref(w, x)).filter(Boolean),
    children: kids, grandchildren: grandkids.slice(0, 24),
  };
  // life story
  let life = [];
  try {
    life = (w.chronicle.biography ? w.chronicle.biography(id, 0.3) : []).map((l) => ({ tick: l.tick, date: l.date || dateOf(w, l.tick), text: l.text, imp: l.importance || 2, src: l.source || '' }));
    { const seen = new Map(), out = []; // collapse repeated lines ("X sat with me when I was low" x5) into one entry
      for (let i = life.length - 1; i >= 0; i--) { const l = life[i], k = l.text; if (seen.has(k) && l.imp < 4) { seen.get(k).n++; continue; } l.n = 1; seen.set(k, l); out.push(l); }
      life = out.reverse(); }
    if (life.length > 90) life = life.filter((l, i) => i < 4 || l.imp >= 3 || i > life.length - 40);
  } catch (e) { /* engine incomplete */ }
  const rumors = (p.rumors || []).slice(-8).reverse().map((r) => ({ about: ref(w, r.aboutId), kind: r.kind, text: r.text, truth: r.truth, from: ref(w, r.heardFrom), date: r.tick != null ? dateOf(w, r.tick) : '' }));
  let explain = [];
  try { if (w.brain?.explain && p.alive) explain = w.brain.explain(p).slice(0, 4).map((e) => ({ id: e.id, score: r2(e.score), why: e.why || '' })); } catch (e) { /* ignore */ }
  const crime = p.crime || p.ext?.crime || null;
  return {
    id, name: nm(p), first: p.firstName, last: p.lastName, maiden: p.maidenName || null, sex: p.sex, age, alive: !!p.alive,
    birthDate: dateOf(w, p.birthTick), deathDate: p.alive ? null : dateOf(w, p.deathTick), cause: p.causeOfDeath || null,
    job: p.job, home: home ? { id: home.id, name: home.name } : null, work: work ? { id: work.id, name: work.name } : null,
    loc: loc ? { id: loc.id, name: loc.name, type: loc.type } : null,
    mood: r2(p.mood || 0), moodlets: (p.moodlets || []).map((m) => ({ label: m.label || m.id, value: r2(m.value), until: m.untilTick })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    needs: Object.fromEntries(Object.entries(p.needs || {}).map(([k, v]) => [k, r2(v)])),
    health: r2(p.health ?? 1), illness: p.illness ? { name: p.illness.name, severity: r2(p.illness.severity || 0), contagious: !!p.illness.contagious, since: dateOf(w, p.illness.sinceTick ?? w.tick) } : null,
    pregnant: p.pregnant ? { due: dateOf(w, p.pregnant.dueTick), father: ref(w, p.pregnant.fatherId) } : null,
    jailed: p.jailedUntil && p.jailedUntil > w.tick ? dateOf(w, p.jailedUntil) : null,
    money: Math.round(p.money || 0), food: Math.round(p.inventory?.food || 0), rep: r2(p.reputation || 0),
    personality: p.personality || {}, traits: p.traits || [], values: p.values || {},
    skills: Object.entries(p.skills || {}).map(([k, v]) => [k, r2(v)]).sort((a, b) => b[1] - a[1]),
    action: ca ? { id: ca.id, label: ca.label || ca.id, status: ca.status, why: ca.why || '', until: ca.untilTick } : null,
    thought: p.thought || '', bubble: p.bubble && p.bubble.until > w.tick ? p.bubble.text : '', explain,
    crime: crime && typeof crime === 'object' ? { record: crime.record?.length ?? crime.offences ?? 0 } : null,
    rels: relsOut, relCounts: counts, family, rumors, life,
    portrait: { id: String(p.id), genes: p.genes, sex: p.sex, age, mood: p.mood, job: p.job, health: p.health, alive: !!p.alive },
    isPlayer: w.player === id, tick: w.tick,
  };
}

function gini(arr) {
  const a = arr.filter((v) => v >= 0).sort((x, y) => x - y), n = a.length; let s = 0, cum = 0;
  if (!n) return 0;
  for (let i = 0; i < n; i++) { s += a[i]; cum += (i + 1) * a[i]; }
  return s > 0 ? (2 * cum) / (n * s) - (n + 1) / n : 0;
}
export function statsSample(w) {
  const L = w.living(); let mood = 0, adults = 0, emp = 0, kids = 0, elders = 0, sick = 0, married = 0, money = 0, hungry = 0;
  const wealth = [];
  for (const p of L) {
    const a = ageOf(w, p); mood += p.mood || 0; money += p.money || 0;
    if (a < 16) kids++; else if (a >= 60) elders++;
    if (a >= 16 && a < 65) { adults++; if (p.workId != null || p.homemaker) emp++; }
    if (a >= 16) wealth.push(p.money || 0);
    if (p.illness) sick++;
    if (p.romance?.status === 'married') married++;
    if ((p.needs?.hunger ?? 1) < 0.15) hungry++;
  }
  const n = L.length || 1, s = w.stats || {};
  const crimeCount = s.crimes ?? s.crime ?? s.thefts ?? w._crimeCount ?? 0;
  return {
    tick: w.tick, year: w.time?.year ?? 1, pop: L.length, births: s.births || 0, deaths: s.deaths || 0, mood: r2(mood / n),
    gini: r2(gini(wealth)), employed: adults ? r2(emp / adults) : 0, crime: crimeCount, kids, elders, sick, married: married / 2 | 0,
    money: Math.round(money / n), hungry, treasury: Math.round(w.town?.treasury || 0),
  };
}

export function directorySnapshot(w) {
  const living = [], dead = [];
  const pyr = Array.from({ length: 19 }, (_, i) => ({ lo: i * 5, m: 0, f: 0 }));
  for (const p of w.people.values()) {
    if (p.alive) {
      const a = ageOf(w, p);
      living.push([p.id, nm(p), Math.floor(a), p.sex, p.job, r2(p.mood || 0), p.homeId != null ? (w.buildings.get(p.homeId)?.name || '') : '', Math.round(p.money || 0), p.illness ? 1 : 0]);
      const b = pyr[Math.min(18, Math.floor(a / 5))]; if (p.sex === 'F') b.f++; else b.m++;
    } else dead.push([p.id, nm(p), Math.floor((p.deathTick - p.birthTick) / TICKS_PER_YEAR), p.sex, p.job, p.deathTick, dateOf(w, p.deathTick), p.causeOfDeath || 'unknown', p.maidenName || '']);
  }
  dead.sort((a, b) => b[5] - a[5]);
  return { living, dead, pyramid: pyr, tick: w.tick };
}

export function mapPayload(w) {
  const m = w.map, tiles = new Uint8Array(m.tiles);
  return { W: m.W, H: m.H, tiles, center: m.center, squareId: m.squareId, buildings: Array.from(w.buildings.values(), staticBuilding) };
}
export function staticBuilding(b) { return { id: b.id, type: b.type, name: b.name, x: b.x, y: b.y, w: b.w, h: b.h, door: b.door, doorSide: b.doorSide, open: !!b.open }; }
export function buildingDetail(w, id) {
  const b = w.buildings.get(id); if (!b) return null;
  const P = (ids) => (ids || []).map((i) => w.people.get(i)).filter((p) => p && p.alive).map((p) => ({ id: p.id, name: nm(p), job: p.job }));
  return { id: b.id, name: b.name, type: b.type, owner: P([b.ownerId])[0] || null, employees: P(b.employees).slice(0, 14), residents: P(b.residents).slice(0, 14), inside: b.occupants ? b.occupants.size : 0, funds: Math.round(b.funds || 0), condition: r2(b.condition ?? 1), hours: b.hours || null, open: w.isOpen ? !!w.isOpen(b) : true };
}
export function buildingList(w) {
  const out = [];
  for (const b of w.buildings.values()) out.push({ id: b.id, name: b.name, type: b.type, x: b.x, y: b.y });
  return out;
}
export function interventionList(w) {
  const out = [];
  if (w._interventions) for (const [kind, fn] of w._interventions) out.push({ kind, description: (fn && fn.description) || '' });
  return out;
}
export function chronEntry(w, e) {
  const seen = new Set(), ppl = [];
  for (const id of e.people || []) { if (id == null || seen.has(id)) continue; seen.add(id); const p = w.people.get(id); if (p) ppl.push({ id, name: nm(p) }); }
  return { id: e.id, tick: e.tick, date: dateOf(w, e.tick), type: e.type, imp: e.importance, text: e.text, ppl, b: e.buildingId ?? null };
}

// ---------------------------------------------------------------- Store (shared by worker client + local source)
export class Store {
  constructor() {
    this.state = {
      ready: false, time: null, speed: 'life', interventions: [], buildings: [], chron: [], series: [], directory: null,
      detail: null, selectedId: null, following: false, townName: 'Hollowmere', people: new Float32Array(0), lastJump: null, log: [],
    };
    this._subs = {}; this.backend = null;
  }
  on(topic, fn) { (this._subs[topic] ||= new Set()).add(fn); return () => this._subs[topic].delete(fn); }
  emit(topic, data) { const s = this._subs[topic]; if (s) for (const f of [...s]) { try { f(data, this.state); } catch (e) { console.error('[hm-ui]', topic, e); } } }
  post(msg) { if (this.backend) this.backend.post(msg); }
  // ---- commands
  select(id) { id = id == null ? null : +id; this.state.selectedId = id; if (id == null) { this.state.detail = null; this.state.following = false; } this.post({ cmd: 'select', id }); this.emit('select', id); if (id == null) this.emit('detail', null); }
  follow(on) { this.state.following = on == null ? !this.state.following : !!on; this.emit('follow', this.state.following); }
  setSpeed(tier) { this.state.speed = tier; this.post({ cmd: 'setSpeed', tier }); this.emit('speed', tier); }
  intervene(kind, params = {}) { this.post({ cmd: 'intervene', kind, params }); }
  jumpToNextEvent(minImportance = 3) { this.post({ cmd: 'jump', minImportance }); }
  playerCommand(cmd) { this.post({ cmd: 'player', ...cmd }); }
  requestDirectory() { this.post({ cmd: 'directory' }); }
  // ---- inbound
  apply(m) {
    const s = this.state;
    switch (m.t) {
      case 'ready': Object.assign(s, { ready: true, interventions: m.interventions || [], buildings: m.buildings || [], townName: m.town || s.townName, series: m.series || [], chron: m.chron || [], time: m.time }); this.emit('ready', s); this.emit('chron', s.chron); this.emit('stats', s.series); this.emit('time', s.time); this.emit('interventions', s.interventions); break;
      case 'frame': s.time = m.time; if (m.people) s.people = m.people; this.emit('time', s.time); this.emit('frame', m); break;
      case 'detail': if (m.p && m.p.id === s.selectedId) { s.detail = m.p; this.emit('detail', m.p); } break;
      case 'chron': for (const e of m.entries) s.chron.push(e); if (s.chron.length > 3000) s.chron.splice(0, s.chron.length - 3000); this.emit('chron', m.entries); break;
      case 'stats': for (const x of m.samples) s.series.push(x); this.emit('stats', s.series); break;
      case 'directory': s.directory = m.d; this.emit('directory', m.d); break;
      case 'speed': s.speed = m.tier; this.emit('speed', m.tier); break;
      case 'jumped': s.lastJump = m.entry; this.emit('jumped', m.entry); break;
      case 'result': s.log.unshift(m); if (s.log.length > 30) s.log.pop(); this.emit('result', m); break;
      case 'interventions': s.interventions = m.list; this.emit('interventions', m.list); break;
    }
  }
}

// ---------------------------------------------------------------- Engine host: shared by worker + local source
// Owns a world; handles commands; produces messages via `send`.
export class Host {
  constructor(world, send, { drive = false } = {}) {
    this.w = world; this.send = send; this.drive = drive;
    this.tier = 'life'; this.tps = 322; this.acc = 0; this.selected = null; this.jump = null;
    this.outbox = []; this.series = []; this.lastDetail = 0; this.lastFrame = 0; this.lastSample = -1e9;
    world.on('chronicle', (e) => { this.outbox.push(chronEntry(world, e)); if (this.jump && e.importance >= this.jump.min && e.tick > this.jump.start) this._finishJump(e); });
    world.on('day', () => { if (world.time.totalDays % 14 === 0) this._sample(); });
    this._sample();
  }
  _sample() { const s = statsSample(this.w); this.series.push(s); this.pendingSamples = (this.pendingSamples || []); this.pendingSamples.push(s); }
  hello() {
    const w = this.w;
    this.send({ t: 'ready', interventions: interventionList(w), buildings: buildingList(w), town: w.town?.name, series: this.series.slice(), chron: w.chronicle.entries.slice(-400).map((e) => chronEntry(w, e)), time: clockInfo(w) });
    this.outbox.length = 0; this.pendingSamples = [];
  }
  setTier(id) { const t = TIERS.find((x) => x.id === id) || TIERS[2]; this.tier = t.id; this.tps = t.tps; this.send({ t: 'speed', tier: t.id }); }
  _finishJump(e) { this.jump = null; this.setTier('pause'); this.send({ t: 'jumped', entry: chronEntry(this.w, e) }); }
  command(m) {
    const w = this.w;
    switch (m.cmd) {
      case 'setSpeed': this.setTier(m.tier); break;
      case 'select': this.selected = m.id; this.lastDetail = 0; break;
      case 'directory': this.send({ t: 'directory', d: directorySnapshot(w) }); break;
      case 'jump': this.jump = { min: m.minImportance || 3, start: w.tick, limit: w.tick + TICKS_PER_YEAR * 2 }; this.tier = 'max'; this.tps = Infinity; this.send({ t: 'speed', tier: 'max' }); break;
      case 'intervene': {
        let res, err = null;
        try { res = w.intervene ? w.intervene(m.kind, m.params || {}) : undefined; } catch (e) { err = String(e && e.message || e); }
        let out; try { out = res === undefined ? null : JSON.parse(JSON.stringify(res)); } catch (e) { out = String(res); }
        this.send({ t: 'result', kind: m.kind, params: m.params, ok: !err, error: err, result: out, date: dateOf(w, w.tick) });
        this.lastDetail = 0; break;
      }
      case 'player': {
        try {
          if (m.type === 'setPlayer') w.player = m.id ?? null;
          else if (m.type === 'action' && w.player != null) { const p = w.people.get(w.player); if (p) w.forceAction ? w.forceAction(p, m.id, m.target ?? null, { thought: m.thought, why: 'player choice' }) : w.startAction(p, m.id, m.target ?? null, 'player choice', { forced: true }); }
          else if (m.type === 'cancel' && w.player != null) { const p = w.people.get(w.player); if (p) w.cancelAction(p); }
        } catch (e) { this.send({ t: 'result', kind: 'player:' + m.type, ok: false, error: String(e && e.message || e) }); }
        break;
      }
    }
  }
  // advance sim for up to `budgetMs`, honoring tier speed. returns ticks stepped
  advance(dtSec, budgetMs = 18) {
    const w = this.w; let n = 0;
    if (this.tps === 0) return 0;
    const t0 = performance.now();
    if (this.tps === Infinity) { while (performance.now() - t0 < budgetMs && n < 20000) { w.step(); n++; if (this.jump && w.tick > this.jump.limit) { this._finishJump({ id: 0, tick: w.tick, importance: 0, text: 'Nothing of note happened for two years.', people: [] }); break; } if (!this.jump && this.tps !== Infinity) break; } }
    else {
      this.acc = Math.min(this.acc + dtSec * this.tps, this.tps * 0.5 + 5);
      while (this.acc >= 1 && performance.now() - t0 < budgetMs) { w.step(); this.acc--; n++; }
    }
    return n;
  }
  // flush snapshots. call ~25 Hz
  flush(now, { frames = true } = {}) {
    const w = this.w;
    if (frames) { const pk = packPeople(w); this.send({ t: 'frame', time: clockInfo(w), people: pk }, pk.buffer); }
    else this.send({ t: 'frame', time: clockInfo(w) });
    if (this.outbox.length) { this.send({ t: 'chron', entries: this.outbox.splice(0, 400) }); this.outbox.length = 0; }
    if (this.pendingSamples && this.pendingSamples.length) { this.send({ t: 'stats', samples: this.pendingSamples }); this.pendingSamples = []; }
    const gap = this.tps === Infinity || this.tps > 3000 ? 600 : 220;
    if (this.selected != null && now - this.lastDetail > gap) { this.lastDetail = now; const p = snapshotPerson(w, this.selected); if (p) this.send({ t: 'detail', p }); }
  }
}

// ---------------------------------------------------------------- client factories
export function createWorkerSource(url = new URL('./worker.js', import.meta.url), { seed = 1, population = 220, worker } = {}) {
  const store = new Store();
  const wk = worker || new Worker(url, { type: 'module' });
  store.backend = { post: (m) => wk.postMessage(m), worker: wk, terminate: () => wk.terminate() };
  wk.onmessage = (e) => store.apply(e.data);
  wk.onerror = (e) => console.error('[hollowmere worker]', e.message || e);
  wk.postMessage({ cmd: 'init', seed, population });
  return store;
}

// Main-thread adapter around an existing World. Call store.backend.pump(dtSec) each frame ONLY if you want this
// adapter to drive the sim (opts.drive); otherwise the integrator's loop steps the world and we only observe (4 Hz).
export function createLocalSource(world, { drive = false, hz = 5 } = {}) {
  const store = new Store();
  const host = new Host(world, (m) => store.apply(m), { drive });
  let last = performance.now();
  const drv = drive ? setInterval(() => { const now = performance.now(); host.advance(Math.min(0.25, (now - last) / 1000), 10); last = now; }, 16) : 0;
  const timer = setInterval(() => host.flush(performance.now(), { frames: false }), Math.round(1000 / hz));
  store.backend = { post: (m) => host.command(m), host, stop: () => { clearInterval(timer); if (drv) clearInterval(drv); }, pump: (dt) => host.advance(dt) };
  host.hello();
  return store;
}

// ---------------------------------------------------------------- Worker entry
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  let host = null, running = false, last = 0, lastFlush = 0;
  const send = (m, tr) => (tr ? self.postMessage(m, [tr]) : self.postMessage(m));
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
    try {
      host.advance(dt, host.tps === Infinity ? 22 : 14);
      if (now - lastFlush >= 40) { lastFlush = now; host.flush(now); }
    } catch (e) { send({ t: 'result', kind: 'sim-error', ok: false, error: String(e && e.stack || e) }); host.setTier('pause'); }
    setTimeout(loop, host.tps === 0 ? 40 : 3);
  };
  const pending = [];
  self.onmessage = async (e) => {
    const m = e.data;
    if (m.cmd === 'init' && !host) {
      const { World } = await import('../sim/world.js');
      const world = new World({ seed: m.seed || 1, population: m.population || 220 });
      host = new Host(world, send); host.hello();
      if (m.speed) host.setTier(m.speed);
      for (const q of pending.splice(0)) host.command(q);
      last = performance.now(); loop();
    } else if (host) host.command(m); else pending.push(m); // commands sent before the world finished loading
  };
}
