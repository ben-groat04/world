// UI-side data store. Talks to ui/worker.js (or runs the Host on the main thread if Workers are unavailable).
export class Store {
  constructor() {
    this.s = { ready: false, time: null, tier: 'pause', tps: 0, tiers: [], map: null, bld: [], bById: new Map(), roster: new Map(), segs: [], people: new Float32Array(0), occ: new Map(), news: [], posts: [], postSource: '', arcs: [], arcsQuiet: true, series: [], stats: null, selected: null, detail: null, following: false, god: null, results: [], directory: null, bdetail: null, dwellings: [], venueList: [], sectors: [], templates: [] };
    this.subs = {}; this.backend = null;
  }
  on(t, f) { (this.subs[t] ||= new Set()).add(f); return () => this.subs[t].delete(f); }
  emit(t, d) { const q = this.subs[t]; if (q) for (const f of [...q]) { try { f(d, this.s); } catch (e) { console.error('[ui]', t, e); } } }
  post(m) { if (this.backend) this.backend.post(m); }
  setSpeed(id) { this.s.tier = id; this.post({ cmd: 'setSpeed', tier: id }); this.emit('speed', id); }
  select(id) { id = id == null ? null : +id; this.s.selected = id; this.s.detail = null; if (id == null) this.s.following = false; this.post({ cmd: 'select', id }); this.emit('select', id); }
  follow(on) { this.s.following = on == null ? !this.s.following : !!on; this.emit('follow', this.s.following); }
  jump() { this.post({ cmd: 'jump', min: 0.5 }); }
  god(name, args) { this.post({ cmd: 'god', name, args }); }
  building(id) { this.post({ cmd: 'building', id }); }
  directoryReq() { this.post({ cmd: 'directory' }); }
  apply(m) {
    const s = this.s;
    switch (m.t) {
      case 'ready': Object.assign(s, { ready: true, tiers: m.tiers, map: m.map, bld: m.bld, segs: m.segs, god: m.god, time: m.time, series: m.series, stats: m.stats, dwellings: m.dwellings, venueList: m.venueList, sectors: m.sectors, templates: m.templates, tpy: m.tpy }); s.bById = new Map(m.bld.map((b) => [b.id, b])); this.emit('ready', m); break;
      case 'roster': for (const r of m.list) s.roster.set(r[0], { id: r[0], first: r[1], last: r[2], seg: r[3], female: !!r[4], skin: r[5], hair: r[6], occ: r[7] }); this.emit('roster', m.list); break;
      case 'frame': s.time = m.time; s.people = m.people; { const o = new Map(); const a = m.occ; for (let i = 0; i < a.length; i += 2) o.set(a[i], a[i + 1]); s.occ = o; } this.emit('frame', m); break;
      case 'speed': s.tier = m.tier; s.tps = m.tps; this.emit('speed', m.tier); break;
      case 'news': if (m.replace) s.news = []; for (const it of m.items) s.news.push(it); if (s.news.length > 800) s.news.splice(0, s.news.length - 800); this.emit('news', m.items); break;
      case 'posts': s.posts = m.posts; s.postSource = m.source; this.emit('posts', m.posts); break;
      case 'arcs': s.arcs = m.arcs; s.arcsQuiet = m.quiet; s.arcStats = m.stats; this.emit('arcs', m.arcs); break;
      case 'stats': for (const x of m.samples) s.series.push(x); s.stats = m.stats; this.emit('stats', s.series); break;
      case 'detail': if (m.p && m.p.id === s.selected) { s.detail = m.p; this.emit('detail', m.p); } break;
      case 'building': s.bdetail = m.b; this.emit('building', m.b); break;
      case 'directory': s.directory = m.list; this.emit('directory', m.list); break;
      case 'result': s.results.unshift(m); this.emit('result', m); break;
      case 'jumped': this.emit('jumped', m.item); break;
      case 'error': console.error('[sim]', m.error); this.emit('error', m.error); break;
    }
  }
}

export function createSource({ seed = 1, forceLocal = false } = {}) {
  const store = new Store();
  const toLocal = async (why) => {
    if (store.mode === 'local') return; store.mode = 'local'; console.warn('[larkfield] running on main thread:', why);
    try { store.backend?.terminate?.(); } catch (e) { /* ignore */ }
    const { Host } = await import('./host.js');
    const host = new Host(seed, (m) => store.apply(m)); let last = performance.now();
    setInterval(() => { const n = performance.now(); host.advance(Math.min(0.25, (n - last) / 1000), host.tps === Infinity ? 16 : 7); last = n; }, 16);
    setInterval(() => host.frame(performance.now()), 50);
    store.backend = { post: (m) => host.command(m) }; host.hello(); host.setTier(store.s.tier);
  };
  store.mode = 'worker';
  if (forceLocal || typeof Worker === 'undefined') { toLocal('forced'); return store; }
  try {
    const wk = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    store.backend = { post: (m) => wk.postMessage(m), terminate: () => wk.terminate() };
    wk.onmessage = (e) => store.apply(e.data);
    wk.onerror = (e) => { if (!store.s.ready) toLocal(e.message || 'worker error'); else console.error('[worker]', e.message); };
    wk.postMessage({ cmd: 'init', seed });
    setTimeout(() => { if (!store.s.ready) toLocal('timeout'); }, 20000);
  } catch (e) { toLocal(String(e)); }
  return store;
}
