// Larkfield app shell: top bar + speed tiers, map input (pan / pinch / tap), bottom-sheet tabs on mobile, sidebar on desktop.
import { createSource } from './store.js';
import { MapView } from './map.js';
import { mountFeed, mountInspect, mountTown, mountPeople, esc } from './views.js';
import { mountGod } from './play/god.js';
import { mountPlay } from './play/play.js';

const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const store = createSource({ seed: +(qs.get('seed') || 1), forceLocal: qs.has('local') });
const canvas = $('map'), wrap = $('map-wrap'), view = new MapView(canvas, store);
window.larkfield = { store, view };
const mobile = () => matchMedia('(max-width:820px)').matches;
const TL = new Set(['life', 'x3', 'x8', 'max']);

// ------------------------------------------------------------------ tabs + panes
const TABS = [['feed', 'Watch', '✉'], ['people', 'People', '☺'], ['town', 'Town', '▤'], ['god', 'God', '★']];
$('tabs').innerHTML = TABS.map(([k, l, i]) => `<button role="tab" data-tab="${k}"><i>${i}</i><span>${l}</span></button>`).join('');
$('panes').innerHTML = TABS.map(([k]) => `<section class="pane" id="pane-${k}" data-pane="${k}" hidden></section>`).join('');
$('pane-people').innerHTML = '<div class="sub" id="people-dir"></div><div class="sub" id="pane-inspect" hidden></div>';
let inspOn = false; // People pane shows the inspector (true) or the directory (false)
function showInspector(on) { inspOn = on; $('pane-inspect').hidden = !on; $('people-dir').hidden = on; }
let tab = 'feed', sheet = 'half'; // sheet: peek | half | full (mobile)
const side = $('sidebar');
function setSheet(s) { sheet = s; side.dataset.sheet = s; sizeSync(); }
function setTab(k, open = true) {
  if (k === 'inspect') { showInspector(true); k = 'people'; }
  tab = k; document.querySelectorAll('#tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === k); b.setAttribute('aria-selected', b.dataset.tab === k); });
  document.querySelectorAll('.pane').forEach((p) => { const was = p.hidden; p.hidden = p.dataset.pane !== k; if (was && !p.hidden) p.dispatchEvent(new Event('shown')); });
  if (k === 'people' && !inspOn) people.refresh(); if (mobile() && open && sheet === 'peek') setSheet('half');
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; if (mobile() && b.dataset.tab === tab && sheet !== 'peek') setSheet('peek'); else { if (b.dataset.tab === 'people' && tab === 'people' && inspOn) showInspector(false); setTab(b.dataset.tab); } });
$('grab').addEventListener('click', () => setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'half'));
(() => { // drag the sheet handle
  const g = $('grab'); let y0 = null;
  g.addEventListener('pointerdown', (e) => { y0 = e.clientY; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (Math.abs(dy) > 24) { e.stopPropagation(); setSheet(dy < 0 ? (sheet === 'peek' ? 'half' : 'full') : (sheet === 'full' ? 'half' : 'peek')); g.dataset.dragged = '1'; } });
  g.addEventListener('click', (e) => { if (g.dataset.dragged) { e.stopImmediatePropagation(); g.dataset.dragged = ''; } }, true);
})();

let selB = null;
const hooks = { selB: () => selB, show: (id) => { const p = view.personPos(id); if (p) view.focus(p[0], p[1], Math.max(view.cam.z, 14)); }, onBuilding: (f) => { hooks._b = f; } };
mountFeed($('pane-feed'), store);
mountInspect($('pane-inspect'), store, hooks);
$('pane-inspect').addEventListener('click', (e) => { if (e.target.closest('[data-back]')) { showInspector(false); people.refresh(); } });
mountTown($('pane-town'), store);
const people = mountPeople($('people-dir'), store);
let pickReq = null;
hooks.pick = (type, cb) => { pickReq = { type, cb, sheet }; toast(`Tap a ${type === 'person' ? 'person' : 'building'} on the map…`, 6000); if (mobile()) setSheet('peek'); };
hooks.select = (id) => selectPerson(id); hooks.peek = () => { if (mobile()) setSheet('peek'); }; hooks.follow = () => { if (!store.s.following) store.follow(true); }; hooks.toast = (m, ms) => toast(m, ms);
mountGod($('pane-god'), store, hooks);
const play = mountPlay(store, hooks);
window.larkfield.play = play;
setTab('feed', false); setSheet(mobile() ? 'peek' : 'half');

// ------------------------------------------------------------------ top bar
const speedEl = $('speed'); let tierLabel = {}; const speedPop = $('speedpop');
const popOpen = (on) => { speedPop.classList.toggle('open', on); $('speedbtn').setAttribute('aria-expanded', on); };
$('speedbtn').addEventListener('click', (e) => { e.stopPropagation(); popOpen(!speedPop.classList.contains('open')); });
document.addEventListener('click', (e) => { if (!e.target.closest('#speedpop')) popOpen(false); });
$('pausebtn').addEventListener('click', () => setTier(store.s.tier === 'pause' ? prevTier : 'pause'));
store.on('ready', (m) => {
  tierLabel = Object.fromEntries(m.tiers.map((t) => [t.id, t.label]));
  speedEl.innerHTML = m.tiers.map((t) => `<button data-tier="${t.id}" title="${esc(t.hint || t.label)}">${t.id === 'pause' ? '<span class="pi">&#10074;&#10074;</span><span class="pt"> Pause</span>' : esc(t.label)}</button>`).join('');
  speedEl.appendChild($('jump'));
  view.setMap(m.map, m.bld); $('loading').classList.add('gone'); setTimeout(() => $('loading')?.remove(), 700); setTimeout(() => $('map-hint')?.classList.add('gone'), 9000);
  setTier(qs.get('speed') || 'life'); updateSpeedUI(store.s.tier); sizeSync(); view.fit();
});
speedEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tier]'); if (b) { setTier(b.dataset.tier); popOpen(false); } });
let prevTier = 'life';
function setTier(id) { if (store.s.tier !== 'pause') prevTier = store.s.tier; store.setSpeed(id); }
function updateSpeedUI(id) {
  speedEl.querySelectorAll('[data-tier]').forEach((b) => b.classList.toggle('on', b.dataset.tier === id));
  view.timelapse = TL.has(id); document.body.dataset.tier = id; $('speedlbl').textContent = id === 'pause' ? 'Paused' : tierLabel[id] || id; $('pausebtn').classList.toggle('on', id === 'pause'); $('pausebtn').querySelector('.pi').innerHTML = id === 'pause' ? '&#9654;' : '&#10074;&#10074;'; if (id !== 'max') $('jump').classList.remove('busy');
}
store.on('speed', updateSpeedUI);
$('jump').addEventListener('click', () => { popOpen(false); $('jump').classList.add('busy'); toast('Skipping ahead to the next notable event…', 60000); store.jump(); });
const WX = { clear: '☀', cloudy: '☁', rain: '☂', snow: '❄', fog: '☁' };
let lastDate = '';
store.on('frame', (m) => {
  const t = m.time; view.ingest(m, performance.now());
  if (t.date !== lastDate) { lastDate = t.date; $('date').textContent = t.date; }
  $('time').textContent = t.clock; $('wx').textContent = t.weather ? `${WX[t.weather.type] || ''} ${t.weather.temp}°C` : '';
  $('popcount').textContent = `${t.pop - t.off} here`; $('citycount').textContent = `${t.off} in the city`;
  $('speedmeta').textContent = `${t.pop - t.off} here · ${t.off} in the city`;
  const tp = store.s.tps; const yrs = (t.rate || 0) / (store.s.tpy || 52596) * 60;
  $('speedinfo').textContent = t.tier === 'pause' ? 'Paused' : t.tier === 'scene' ? '1 hour per second' : yrs >= 0.1 ? `${yrs < 10 ? yrs.toFixed(1) : Math.round(yrs)} game-years / min` : '';
});

// ------------------------------------------------------------------ digest ("while you were fast-forwarding") + first-visit welcome
const FAST = new Set(['x3', 'x8', 'max']); const TPD = 144;
const COUNTS = [['life.birth', 'baby', 'babies'], ['life.death', 'death', 'deaths'], ['life.marriage', 'wedding', 'weddings'], ['life.breakup', 'break-up', 'break-ups'], ['life.move_in', 'arrival', 'arrivals'], ['life.move_out', 'departure', 'departures'], ['labour.hired', 'new job', 'new jobs'], ['labour.job_lost', 'job lost', 'jobs lost'], ['business.opened', 'shop opened', 'shops opened'], ['business.closed', 'business closed', 'businesses closed']];
let fast = null, jumpedFlag = false;
const digestEl = document.createElement('div'); digestEl.id = 'digest'; digestEl.hidden = true; wrap.appendChild(digestEl);
digestEl.addEventListener('click', (e) => { if (e.target.closest('[data-dx]')) { digestEl.hidden = true; return; } });
store.on('news', (items) => { if (!fast) return; for (const it of items) { if (it.kind === 'god') continue; fast.n[it.type] = (fast.n[it.type] || 0) + 1; if (it.sal >= 0.35 && it.ppl && it.ppl.length) { fast.top.push(it); if (fast.top.length > 300) { fast.top.sort((a, b) => b.sal - a.sal); fast.top.length = 120; } } } });
function digestPick(top) { // one story per person, a spread of kinds first (not three evictions in a row), then fill up to two per kind
  const sorted = top.slice().sort((a, b) => b.sal - a.sal || b.tick - a.tick), seen = new Set(), kinds = {}, out = [];
  for (const cap of [1, 2]) for (const it of sorted) { const k = it.ppl[0].id; if (out.length >= 6 || seen.has(k) || (kinds[it.kind] || 0) >= cap) continue; seen.add(k); kinds[it.kind] = (kinds[it.kind] || 0) + 1; out.push(it); }
  return out.sort((a, b) => a.tick - b.tick);
}
function showDigest(f) {
  const t = store.s.time, days = Math.round(((t ? t.tick : 0) - f.tick) / TPD); if (days < 30 || jumpedFlag) return;
  const dur = days >= 700 ? `${(days / 365).toFixed(1)} years` : days >= 60 ? `${Math.round(days / 30.4)} months` : `${days} days`;
  const counts = COUNTS.map(([k, one, many]) => [f.n[k] || 0, one, many]).filter((c) => c[0] > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  const picks = digestPick(f.top);
  digestEl.innerHTML = `<button class="dgx" data-dx aria-label="Close">✕</button><div class="dgh">While you were fast-forwarding</div><div class="dgm">${esc(f.date)} to ${esc(t.date)} · ${dur}</div>${counts.length ? `<div class="dgc">${counts.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}${picks.length ? `<div class="dgl">${picks.map((it) => `<a data-pid="${it.ppl[0].id}"><time>${esc(it.date)}</time> ${esc(it.head)}</a>`).join('')}</div><div class="dgd">Tap a line to see who it is about. Storylines has the long-running ones.</div>` : ''}`;
  digestEl.hidden = false;
}
store.on('speed', (id) => { if (FAST.has(id)) { if (!fast && store.s.time) fast = { tick: store.s.time.tick, date: store.s.time.date, n: {}, top: [] }; jumpedFlag = false; } else if (fast) { const f = fast; fast = null; setTimeout(() => showDigest(f), 80); } });
store.on('jumped', () => { jumpedFlag = true; });
store.on('select', () => { digestEl.hidden = true; });
if (!(() => { try { return localStorage.getItem('lf_welcomed'); } catch (e) { return '1'; } })() && !qs.has('speed')) {
  const wel = document.createElement('div'); wel.id = 'welcome';
  wel.innerHTML = `<div class="wc"><b>Larkfield</b><p>A living, simulated neighbourhood in a UK city: a few hundred neighbours with jobs, rents, friendships and secrets. Nothing is scripted.</p><button data-w="watch">Watch it unfold</button><button data-w="play">Play a resident</button><button data-w="god">God mode: shake things up</button><small>You can change your mind any time. Tap a person or a building on the map to learn their story.</small></div>`;
  document.body.appendChild(wel);
  store.on('ready', () => { if (!wel.isConnected) return; prevTier = 'life'; store.setSpeed('pause'); });
  wel.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (!b) return; const k = b.dataset.w; wel.remove(); try { localStorage.setItem('lf_welcomed', '1'); } catch (x) { /* ignore */ }
    if (k === 'watch') { setTier('life'); setTab('feed'); } else if (k === 'play') { setTier('life'); $('z-play').click(); } else { setTab('god'); if (mobile()) setSheet('half'); setTier('life'); } });
}

// ------------------------------------------------------------------ toast + ticker
let toastT = 0;
function toast(msg, ms = 4200) { if (document.body.classList.contains('psheet-open') || (document.body.classList.contains('playing') && !$('pcard').hidden)) return; const el = $('toast'); el.innerHTML = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
const tick = $('ticker'); let tickT = 0;
store.on('news', (items) => {
  for (const x of items) if (x.sal >= 0.5 && x.kind !== 'god' && x.place && x.place.id != null && !store.s.replaying) view.setHot(x.place.id, performance.now() + 25000);
  if (TL.has(store.s.tier) && store.s.tier !== 'life') return; if (document.body.classList.contains('playing')) return;
  const e = [...items].reverse().find((x) => x.sal >= 0.6 && x.kind !== 'god'); if (!e) return;
  tick.hidden = false; tick.innerHTML = `<time>${esc(e.date)}</time> ${esc(e.head)}`; tick.dataset.pid = e.ppl && e.ppl[0] ? e.ppl[0].id : ''; tick.style.animation = 'none'; void tick.offsetWidth; tick.style.animation = '';
  clearTimeout(tickT); tickT = setTimeout(() => { tick.hidden = true; }, 7000);
});
tick.addEventListener('click', () => { if (tick.dataset.pid) selectPerson(+tick.dataset.pid); });
store.on('jumped', (it) => { $('jump').classList.remove('busy'); if (it) { toast(`<b>${esc(it.date)}</b> &mdash; ${esc(it.head)}`, 9000); if (it.ppl && it.ppl[0]) selectPerson(it.ppl[0].id); } else toast('Nothing notable happened for two years.'); });
store.on('result', (r) => { toast(`${r.ok ? '★ ' : '⚠ '}<b>${esc(r.name)}</b> ${r.ok ? 'sent.' : 'failed: ' + esc(r.error || 'rejected')}`, 5000); if (r.ok && store.s.tier === 'pause') setTier(prevTier || 'life'); });

// ------------------------------------------------------------------ selection
const followBtn = $('z-follow');
function selectPerson(id) {
  selB = null; view.selB = null; store.select(id); view.selected = id; followBtn.hidden = false; showInspector(true); setTab('people'); if (mobile() && sheet === 'peek') setSheet('half');
  const p = view.personPos(id); if (p) view.focus(p[0], p[1], Math.max(view.cam.z, mobile() ? 10 : 13)); else { const off = store.on('frame', () => { off(); const q = view.personPos(id); if (q) view.focus(q[0], q[1], 12); }); }
}
function selectBuilding(id) {
  if (id == null) { selB = null; view.selB = null; hooks._b && hooks._b(); return; }
  const b = store.s.bById.get(id); if (!b) return; view.selected = null; store.select(null); followBtn.hidden = true; view.follow = null; selB = id; view.selB = id; store.building(id); showInspector(true); setTab('people'); if (mobile() && sheet === 'peek') setSheet('half');
  view.focus(b.x + b.w / 2, b.y + b.h / 2, Math.max(8, Math.min(view.cam.z, 14)));
}
store.on('building', () => hooks._b && hooks._b());
store.on('select', (id) => { if (id == null) { view.selected = null; view.follow = null; followBtn.hidden = true; followBtn.classList.remove('on'); } });
store.on('follow', (on) => { view.follow = on ? store.s.selected : null; followBtn.classList.toggle('on', !!on); if (on) view.goal = null; });
followBtn.addEventListener('click', () => store.follow());
document.addEventListener('click', (e) => {
  if (e.target.closest('#pplay') && store.s.selected != null) { play.take(store.s.selected); return; }
  const fo = e.target.closest('[data-follow]'); if (fo) { selectPerson(+fo.dataset.follow); setTimeout(() => store.follow(true), 400); return; }
  const p = e.target.closest('[data-pid]'); if (p && p.dataset.pid && !p.closest('#ticker')) { selectPerson(+p.dataset.pid); return; }
  const b = e.target.closest('[data-bid]'); if (b) selectBuilding(+b.dataset.bid);
});
setInterval(() => { if (selB != null && store.s.tier !== 'max') store.building(selB); }, 2500);
setInterval(() => { if (tab === 'people') people.refresh(); }, 5000);
$('z-lens').addEventListener('click', () => { const order = ['none', 'crowd', 'stress']; view.overlay = order[(order.indexOf(view.overlay) + 1) % order.length]; $('z-lens').dataset.mode = view.overlay; toast(`Overlay: <b>${view.overlay === 'none' ? 'off' : view.overlay === 'crowd' ? 'crowding (who is inside)' : 'mood on people'}</b>`, 1800); });

// ------------------------------------------------------------------ map input
const ptrs = new Map(); let g = null; const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y); const rect = () => canvas.getBoundingClientRect();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) g = { moved: 0 }; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g = { moved: 99, dist: d2(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse' && view.map) { const r = rect(), h = view.pick(e.clientX - r.left, e.clientY - r.top); const nb = h && h.building != null ? h.building : null; view.hoverB = nb; canvas.style.cursor = h ? 'pointer' : 'grab'; } return; }
  if (!g) return;
  if (ptrs.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()], dist = d2(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = rect(); view.pan(mx - g.mx, my - g.my); if (g.dist > 0) view.zoomAt(mx - r.left, my - r.top, dist / g.dist); g.dist = dist; g.mx = mx; g.my = my; return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; g.moved += Math.abs(dx) + Math.abs(dy);
  if (g.moved > 7) { view.pan(dx, dy); if (store.s.following && g.moved > 16) store.follow(false); }
});
function endPtr(e, cancel) {
  const had = ptrs.size; ptrs.delete(e.pointerId); if (!ptrs.size) canvas.classList.remove('drag');
  if (had === 1 && g && g.moved < 9 && !cancel) { const r = rect(), hit = view.pick(e.clientX - r.left, e.clientY - r.top);
    if (pickReq) { const v = pickReq.type === 'person' ? hit && hit.person : hit && hit.building; if (v != null) { const q = pickReq; pickReq = null; q.cb(v); if (mobile()) setSheet(q.sheet); toast('Picked.', 1200); } else toast('Tap a ' + (pickReq.type === 'person' ? 'person' : 'building') + ' on the map…', 1500); } else if (hit && hit.person != null) selectPerson(hit.person); else if (hit && hit.building != null) selectBuilding(hit.building); else { selectBuilding(null); store.select(null); } }
  if (ptrs.size === 1) g = { moved: 99 };
}
canvas.addEventListener('pointerup', (e) => endPtr(e, false)); canvas.addEventListener('pointercancel', (e) => endPtr(e, true));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = rect(); view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
canvas.addEventListener('dblclick', (e) => { const r = rect(); view.zoomAt(e.clientX - r.left, e.clientY - r.top, 1.8); });
$('z-in').onclick = () => view.zoomBy(1.4); $('z-out').onclick = () => view.zoomBy(1 / 1.4); $('z-fit').onclick = () => view.fit(true);
addEventListener('keydown', (e) => {
  if (e.target && /input|textarea|select/i.test(e.target.tagName) || e.metaKey || e.ctrlKey) return; const k = e.key; const ids = store.s.tiers.map((t) => t.id);
  if (k === ' ') { setTier(store.s.tier === 'pause' ? prevTier : 'pause'); e.preventDefault(); }
  else if (k >= '1' && k <= '6' && ids[+k - 1]) setTier(ids[+k - 1]);
  else if (k === 'f' || k === 'F') { if (store.s.selected != null) store.follow(); }
  else if (k === 'Escape') { selectBuilding(null); store.select(null); }
  else if (k === 'n' || k === 'N') $('jump').click();
  else if (k === '+' || k === '=') view.zoomBy(1.25); else if (k === '-') view.zoomBy(0.8); else if (k === '0') view.fit();
  else if (k.startsWith('Arrow')) { view.pan(k === 'ArrowLeft' ? 60 : k === 'ArrowRight' ? -60 : 0, k === 'ArrowUp' ? 60 : k === 'ArrowDown' ? -60 : 0); e.preventDefault(); }
});

// ------------------------------------------------------------------ sizing + loop
function sizeSync() {
  view.resize();
  if (mobile()) { const r = wrap.getBoundingClientRect(); const ins = Math.max(0, r.bottom - side.getBoundingClientRect().top); view.setInset(ins); document.documentElement.style.setProperty('--sheet', ins + 'px'); } else { view.setInset(0); document.documentElement.style.setProperty('--sheet', '0px'); }
}
new ResizeObserver(sizeSync).observe(wrap); addEventListener('resize', sizeSync);
side.addEventListener('transitionend', sizeSync);
let ltick = 0;
// Time-lapse tiers only change the picture when a new frame arrives (about 10/s), so redraw on new data, camera/selection change or every 250 ms
// (weather, pulses) rather than at 60 fps: this halves main-thread draw cost at Lifetime and above and keeps taps and pans snappy.
let lastDraw = 0, lastSig = '', lastIngest = -1;
function frame(now) {
  try {
    if (mobile() && now - ltick > 250) { ltick = now; sizeSync(); }
    const c = view.cam, sig = `${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(3)},${view.w},${view.h},${view.selected},${view.selB},${view.hoverB},${view.follow},${view.goal ? 1 : 0},${view.overlay || ''},${view.inset}`;
    const stale = view.timelapse && store.s.tier !== 'pause' && sig === lastSig && view.ingests === lastIngest && now - lastDraw < 250;
    if (!stale) { view.draw(now); lastDraw = now; lastSig = sig; lastIngest = view.ingests; }
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
store.on('error', (m) => toast('Simulation error: ' + esc(String(m).split('\n')[0]), 8000));
