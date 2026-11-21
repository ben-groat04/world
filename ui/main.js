// Hollowmere app shell: runs the sim in ui/worker.js (falls back to the main thread), draws snapshots with ui/render.js,
// mounts the dock (inspector / news / stats / people / graves / god mode) and the time-lapse dashboard.
import { createAutoSource, TIERS } from './worker.js';
import { Renderer } from './render.js';
import { mountDock, mountTimelapse, linkify } from './panels.js';
import { esc } from './inspector.js';

const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const store = createAutoSource({ seed: +(qs.get('seed') || 1), population: +(qs.get('pop') || 220), forceLocal: qs.has('local') });
const canvas = $('map'), wrap = $('map-wrap');
const renderer = new Renderer(canvas, store);
export const ui = { store, renderer };
window.hollowmere = ui;
const mobile = () => matchMedia('(max-width:760px)').matches;
const TL_TIERS = new Set(['x5', 'x20', 'max']);

// ------------------------------------------------------------------ top bar
const speedEl = $('speed');
speedEl.innerHTML = TIERS.map((t) => `<button data-tier="${t.id}" title="${esc(t.hint || t.label)}">${t.id === 'pause' ? '&#10074;&#10074; Pause' : esc(t.label)}</button>`).join('');
speedEl.appendChild($('jump'));
const ICON = { clear: '☀', rain: '☂', storm: '⛈', snow: '❄', fog: '☁', heatwave: '☀', cloudy: '☁' };
let prevTier = 'life';
speedEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tier]'); if (b) setTier(b.dataset.tier); });
function setTier(id) { if (store.state.speed !== 'pause') prevTier = store.state.speed; store.setSpeed(id); }
store.on('speed', (id) => {
  speedEl.querySelectorAll('[data-tier]').forEach((b) => b.classList.toggle('on', b.dataset.tier === id));
  renderer.timelapse = TL_TIERS.has(id); const t = TIERS.find((x) => x.id === id); renderer.tps = t ? Math.min(t.tps, 20000) : 322;
  if (id !== 'max') $('jump').classList.remove('busy');
});
$('jump').addEventListener('click', () => { $('jump').classList.add('busy'); toast('Skipping ahead to the next notable event…', 60000); store.jumpToNextEvent(3); });
store.on('time', (t) => {
  $('date').textContent = t.date; $('time').textContent = t.clock;
  $('wx').textContent = t.weather ? `${ICON[t.weather.type] || ''} ${t.weather.type}, ${t.weather.temp}°` : '';
  $('popcount').textContent = `${t.pop} residents`;
});
store.on('ready', () => {
  $('town-name').textContent = store.state.townName; document.title = store.state.townName;
  if (store.state.map) renderer.setMap(store.state.map);
  $('loading').classList.add('gone'); setTimeout(() => $('loading').remove(), 700);
  setTimeout(() => $('map-hint').classList.add('gone'), 9000);
  store.setSpeed('life');
});
store.on('newbuilding', (b) => renderer.addBuilding(b));
store.on('frame', (m) => renderer.ingest(m, performance.now()));
store.on('speed', () => {});

// ------------------------------------------------------------------ toast + ticker
let toastT = 0;
function toast(msg, ms = 4200) {
  let el = $('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.innerHTML = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms);
}
const tick = $('ticker');
let tickT = 0;
store.on('chron', (en) => {
  if (!Array.isArray(en) || !store.state.ready) return;
  const e = [...en].reverse().find((x) => x.imp >= 3); if (!e || TL_TIERS.has(store.state.speed) && store.state.speed === 'max') return;
  tick.hidden = false; tick.innerHTML = `<time>${esc(e.date)}</time>${linkify(e.text, e.ppl)}`;
  tick.style.animation = 'none'; void tick.offsetWidth; tick.style.animation = '';
  clearTimeout(tickT); tickT = setTimeout(() => { tick.hidden = true; }, 14000);
});
document.addEventListener('click', (e) => { const n = e.target.closest('#ticker [data-pid], #bcard [data-pid], #toast [data-pid]'); if (n) store.select(+n.dataset.pid); });

// ------------------------------------------------------------------ selection / follow / building card
const followBtn = $('z-follow'), bcard = $('bcard');
function personPos(id) { const p = renderer.personPos(id); return p ? p : null; }
function selectBuilding(id) {
  if (id == null) { renderer.selectedBuilding = null; bcard.hidden = true; return; }
  const b = renderer.bById.get(id); if (!b) return;
  renderer.selectedBuilding = id; if (store.state.selectedId != null) store.select(null);
  renderer.selectedId = null; renderer.followId = null; followBtn.hidden = true;
  renderer.focus(b.x + b.w / 2, b.y + b.h / 2, Math.max(11, renderer.cam.zoom)); store.requestBuilding(id);
  bcard.hidden = false; bcard.innerHTML = `<button class="x" data-x>&times;</button><h3>${esc(b.name)}</h3><div class="sub">${esc(b.type)}</div><div class="muted">Loading…</div>`;
}
store.on('building', (d) => {
  if (d.id !== renderer.selectedBuilding) return;
  const L = (a) => a.map((p) => `<a data-pid="${p.id}">${esc(p.name)} <small>${esc(p.job)}</small></a>`).join('') || '<span class="muted">none</span>';
  bcard.innerHTML = `<button class="x" data-x>&times;</button><h3>${esc(d.name)}</h3><div class="sub">${esc(d.type)}${d.open ? '' : ' · closed'}</div>
    <div class="kv"><span>Inside now</span><span>${d.inside}</span></div>${d.funds ? `<div class="kv"><span>Funds</span><span>${d.funds}</span></div>` : ''}<div class="kv"><span>Condition</span><span>${Math.round(d.condition * 100)}%</span></div>
    ${d.owner ? `<h4>Owner</h4>${L([d.owner])}` : ''}${d.employees.length ? `<h4>Staff</h4>${L(d.employees)}` : ''}${d.residents.length ? `<h4>Residents</h4>${L(d.residents)}` : ''}`;
});
bcard.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) selectBuilding(null); });
store.on('select', (id) => {
  renderer.selectedId = id;
  if (id == null) { renderer.followId = null; followBtn.hidden = true; followBtn.classList.remove('on'); return; }
  renderer.selectedBuilding = null; bcard.hidden = true; followBtn.hidden = false;
  if (store.state.following) renderer.followId = id;
  const p = personPos(id); if (p) renderer.focus(p[0] + 0.5, p[1] + 0.5, mobile() ? 12 : 14);
  else { const off = store.on('frame', () => { off(); const q = personPos(id); if (q) renderer.focus(q[0] + 0.5, q[1] + 0.5, 14); }); }
});
store.on('follow', (on) => { renderer.followId = on ? store.state.selectedId : null; followBtn.classList.toggle('on', !!on); if (on) renderer.goal = null; });
followBtn.addEventListener('click', () => store.follow());
store.on('jumped', (e) => {
  $('jump').classList.remove('busy');
  if (e && e.text) { toast(`<b>${esc(e.date)}</b> &mdash; ${linkify(e.text, e.ppl)}`, 9000); if (e.ppl && e.ppl[0]) store.select(e.ppl[0].id); }
});

// ------------------------------------------------------------------ panels
const dock = mountDock($('sidebar'), store, { onBuilding: selectBuilding, initial: 'gazette' });
const tl = mountTimelapse(wrap, store);
ui.dock = dock; ui.tl = tl;

// ------------------------------------------------------------------ map input (mouse, touch pan, pinch zoom, tap)
const ptrs = new Map(); let g = null;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rect = () => canvas.getBoundingClientRect();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); canvas.dataset.touch = e.pointerType === 'touch' ? '1' : '';
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) g = { moved: 0 }; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g = { moved: 99, dist: d2(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p || !g) return;
  if (ptrs.size === 2) {
    p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()], dist = d2(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = rect();
    renderer.pan(mx - g.mx, my - g.my); if (g.dist > 0) renderer.zoomAt(mx - r.left, my - r.top, dist / g.dist);
    g.dist = dist; g.mx = mx; g.my = my; return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; g.moved += Math.abs(dx) + Math.abs(dy);
  if (g.moved > 6) { renderer.pan(dx, dy); if (store.state.following && g.moved > 14) store.follow(false); }
});
function endPtr(e, cancel) {
  const had = ptrs.size; ptrs.delete(e.pointerId); if (!ptrs.size) canvas.classList.remove('drag');
  if (had === 1 && g && g.moved < 8 && !cancel) { const r = rect(), hit = renderer.pick(e.clientX - r.left, e.clientY - r.top); if (hit && hit.person != null) { selectBuilding(null); store.select(hit.person); } else if (hit && hit.building != null) selectBuilding(hit.building); else { selectBuilding(null); store.select(null); } }
  if (ptrs.size === 1) { g = { moved: 99 }; }
}
canvas.addEventListener('pointerup', (e) => endPtr(e, false));
canvas.addEventListener('pointercancel', (e) => endPtr(e, true));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = rect(); renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
canvas.addEventListener('dblclick', (e) => { const r = rect(); renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, 1.8); });
$('z-in').onclick = () => renderer.zoomBy(1.4); $('z-out').onclick = () => renderer.zoomBy(1 / 1.4); $('z-fit').onclick = () => renderer.fit();
addEventListener('keydown', (e) => {
  if (e.target && /input|textarea|select/i.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
  const k = e.key;
  if (k === ' ') { setTier(store.state.speed === 'pause' ? prevTier : 'pause'); e.preventDefault(); }
  else if (k >= '1' && k <= '6') setTier(TIERS[+k - 1].id);
  else if (k === 'f' || k === 'F') { if (store.state.selectedId != null) store.follow(); }
  else if (k === 'Escape') { selectBuilding(null); store.select(null); }
  else if (k === 'n' || k === 'N') $('jump').click();
  else if (k === '+' || k === '=') renderer.zoomBy(1.25); else if (k === '-') renderer.zoomBy(0.8); else if (k === '0') renderer.fit();
  else if (k.startsWith('Arrow')) { const s = 60; renderer.pan(k === 'ArrowLeft' ? s : k === 'ArrowRight' ? -s : 0, k === 'ArrowUp' ? s : k === 'ArrowDown' ? -s : 0); e.preventDefault(); }
});

// ------------------------------------------------------------------ sizing + loop
let lastW = 0;
function sizeSync() {
  renderer.resize();
  if (mobile()) { const d = $('sidebar').querySelector('.hm-dock'); if (d) { const r = wrap.getBoundingClientRect(), top = d.getBoundingClientRect().top; const ins = Math.max(0, r.bottom - top); renderer.setInset(ins); document.documentElement.style.setProperty('--sheet', ins + 'px'); } } else { renderer.setInset(0); }
  if (renderer.map && lastW === 0 && renderer.w > 0) renderer.fit(); lastW = renderer.w;
}
new ResizeObserver(sizeSync).observe(wrap); addEventListener('resize', sizeSync);
const mo = new MutationObserver(() => { const t0 = performance.now(); const f = () => { sizeSync(); if (performance.now() - t0 < 450) requestAnimationFrame(f); }; f(); });
mo.observe($('sidebar'), { attributes: true, subtree: true, attributeFilter: ['data-sheet'] });
function frame(now) { try { if (mobile()) sizeSync(); renderer.draw(now); } catch (e) { console.error(e); } requestAnimationFrame(frame); }
requestAnimationFrame(frame);
if (store.state.ready) { /* already booted */ }
