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
const TL = new Set(['life', 'x5', 'x20', 'max']);

// ------------------------------------------------------------------ tabs + panes
const TABS = [['feed', 'Feed', '✉'], ['inspect', 'Inspect', '☺'], ['town', 'Town', '▤'], ['people', 'People', '☰'], ['god', 'God', '★']];
$('tabs').innerHTML = TABS.map(([k, l, i]) => `<button role="tab" data-tab="${k}"><i>${i}</i><span>${l}</span></button>`).join('');
$('panes').innerHTML = TABS.map(([k]) => `<section class="pane" id="pane-${k}" data-pane="${k}" hidden></section>`).join('');
let tab = 'feed', sheet = 'half'; // sheet: peek | half | full (mobile)
const side = $('sidebar');
function setSheet(s) { sheet = s; side.dataset.sheet = s; sizeSync(); }
function setTab(k, open = true) {
  tab = k; document.querySelectorAll('#tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === k); b.setAttribute('aria-selected', b.dataset.tab === k); });
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== k; });
  if (k === 'people') people.refresh(); if (mobile() && open && sheet === 'peek') setSheet('half');
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; if (mobile() && b.dataset.tab === tab && sheet !== 'peek') setSheet('peek'); else setTab(b.dataset.tab); });
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
mountTown($('pane-town'), store);
const people = mountPeople($('pane-people'), store);
let pickReq = null;
hooks.pick = (type, cb) => { pickReq = { type, cb, sheet }; toast(`Tap a ${type === 'person' ? 'person' : 'building'} on the map…`, 6000); if (mobile()) setSheet('peek'); };
hooks.select = (id) => selectPerson(id); hooks.follow = () => { if (!store.s.following) store.follow(true); }; hooks.toast = (m, ms) => toast(m, ms);
mountGod($('pane-god'), store, hooks);
const play = mountPlay(store, hooks);
window.larkfield.play = play;
setTab('feed', false); setSheet(mobile() ? 'half' : 'half');

// ------------------------------------------------------------------ top bar
const speedEl = $('speed');
store.on('ready', (m) => {
  speedEl.innerHTML = m.tiers.map((t) => `<button data-tier="${t.id}" title="${esc(t.hint || t.label)}">${t.id === 'pause' ? '<span class="pi">&#10074;&#10074;</span><span class="pt"> Pause</span>' : esc(t.label)}</button>`).join('');
  speedEl.appendChild($('jump'));
  view.setMap(m.map, m.bld); $('loading').classList.add('gone'); setTimeout(() => $('loading')?.remove(), 700); setTimeout(() => $('map-hint')?.classList.add('gone'), 9000);
  setTier(qs.get('speed') || 'life'); updateSpeedUI(store.s.tier); sizeSync(); view.fit();
});
speedEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tier]'); if (b) setTier(b.dataset.tier); });
let prevTier = 'life';
function setTier(id) { if (store.s.tier !== 'pause') prevTier = store.s.tier; store.setSpeed(id); }
function updateSpeedUI(id) {
  speedEl.querySelectorAll('[data-tier]').forEach((b) => b.classList.toggle('on', b.dataset.tier === id));
  view.timelapse = TL.has(id); document.body.dataset.tier = id; if (id !== 'max') $('jump').classList.remove('busy');
}
store.on('speed', updateSpeedUI);
$('jump').addEventListener('click', () => { $('jump').classList.add('busy'); toast('Skipping ahead to the next notable event…', 60000); store.jump(); });
const WX = { clear: '☀', cloudy: '☁', rain: '☂', snow: '❄', fog: '☁' };
let lastDate = '';
store.on('frame', (m) => {
  const t = m.time; view.ingest(m, performance.now());
  if (t.date !== lastDate) { lastDate = t.date; $('date').textContent = t.date; }
  $('time').textContent = t.clock; $('wx').textContent = t.weather ? `${WX[t.weather.type] || ''} ${t.weather.temp}°C` : '';
  $('popcount').textContent = `${t.pop - t.off} here`; $('citycount').textContent = `${t.off} in the city`;
  const tp = store.s.tps; const yrs = (t.rate || 0) / (store.s.tpy || 52596) * 60;
  $('speedinfo').textContent = t.tier === 'pause' ? 'Paused' : t.tier === 'scene' ? '1 hour per second' : yrs >= 0.1 ? `${yrs < 10 ? yrs.toFixed(1) : Math.round(yrs)} game-years / min` : '';
});

// ------------------------------------------------------------------ toast + ticker
let toastT = 0;
function toast(msg, ms = 4200) { const el = $('toast'); el.innerHTML = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
const tick = $('ticker'); let tickT = 0;
store.on('news', (items) => {
  if (TL.has(store.s.tier) && store.s.tier !== 'life') return;
  const e = [...items].reverse().find((x) => x.sal >= 0.5 && x.kind !== 'god'); if (!e) return;
  tick.hidden = false; tick.innerHTML = `<time>${esc(e.date)}</time> ${esc(e.head)}`; tick.dataset.pid = e.ppl && e.ppl[0] ? e.ppl[0].id : ''; tick.style.animation = 'none'; void tick.offsetWidth; tick.style.animation = '';
  clearTimeout(tickT); tickT = setTimeout(() => { tick.hidden = true; }, 12000);
});
tick.addEventListener('click', () => { if (tick.dataset.pid) selectPerson(+tick.dataset.pid); });
store.on('jumped', (it) => { $('jump').classList.remove('busy'); if (it) { toast(`<b>${esc(it.date)}</b> &mdash; ${esc(it.head)}`, 9000); if (it.ppl && it.ppl[0]) selectPerson(it.ppl[0].id); } else toast('Nothing notable happened for two years.'); });
store.on('result', (r) => { toast(`${r.ok ? '★ ' : '⚠ '}<b>${esc(r.name)}</b> ${r.ok ? 'sent. Watch the Local feed for consequences.' : 'failed: ' + esc(r.error || 'rejected')}`, 5000); if (r.ok && store.s.tier === 'pause') setTier(prevTier || 'life'); });

// ------------------------------------------------------------------ selection
const followBtn = $('z-follow');
function selectPerson(id) {
  selB = null; view.selB = null; store.select(id); view.selected = id; followBtn.hidden = false; setTab('inspect');
  const p = view.personPos(id); if (p) view.focus(p[0], p[1], Math.max(view.cam.z, mobile() ? 10 : 13)); else { const off = store.on('frame', () => { off(); const q = view.personPos(id); if (q) view.focus(q[0], q[1], 12); }); }
}
function selectBuilding(id) {
  if (id == null) { selB = null; view.selB = null; hooks._b && hooks._b(); return; }
  const b = store.s.bById.get(id); if (!b) return; view.selected = null; store.select(null); followBtn.hidden = true; view.follow = null; selB = id; view.selB = id; store.building(id); setTab('inspect');
  view.focus(b.x + b.w / 2, b.y + b.h / 2, Math.max(8, Math.min(view.cam.z, 14)));
}
store.on('building', () => hooks._b && hooks._b());
store.on('select', (id) => { if (id == null) { view.selected = null; view.follow = null; followBtn.hidden = true; followBtn.classList.remove('on'); } });
store.on('follow', (on) => { view.follow = on ? store.s.selected : null; followBtn.classList.toggle('on', !!on); if (on) view.goal = null; });
followBtn.addEventListener('click', () => store.follow());
document.addEventListener('click', (e) => {
  if (e.target.closest('#pplay') && store.s.selected != null) { play.take(store.s.selected); return; }
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
function frame(now) { try { if (mobile() && now - ltick > 120) { ltick = now; sizeSync(); } view.draw(now); } catch (e) { console.error(e); } requestAnimationFrame(frame); }
requestAnimationFrame(frame);
store.on('error', (m) => toast('Simulation error: ' + esc(String(m).split('\n')[0]), 8000));
