// Boot, sim loop (speed controls), input, minimal inspector + feed. Other UI modules should import `ui` from here
// and add themselves via ui.onFrame / ui.onSelect / ui.onTick; mount into #sidebar-extra, #inspector, #feed-list, #topbar-extra.
import { World } from '../sim/world.js';
import { Renderer } from './render.js';
import { formatDate } from '../sim/time.js';

const qs = new URLSearchParams(location.search);
const seed = +(qs.get('seed') || 1);
const world = new World({ seed, population: +(qs.get('pop') || 220) });
world.recordTrails = true;
const canvas = document.getElementById('map');
const renderer = new Renderer(canvas, world);
renderer.fit();

const SPEEDS = [0, 3, 15, 60, 300, Infinity]; // ticks per real second
export const ui = {
  world, renderer, speedIndex: 1, selected: null, selectedBuilding: null,
  _sel: [], _frame: [], _tick: [],
  onSelect(fn) { this._sel.push(fn); }, onFrame(fn) { this._frame.push(fn); }, onTick(fn) { this._tick.push(fn); },
  setSpeed(i) {
    this.speedIndex = i;
    document.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === i));
  },
  select(id) { this.selected = id; this.selectedBuilding = null; renderer.selectedId = id; renderer.selectedBuilding = null; for (const f of this._sel) f(id, null); renderInspector(); },
  selectBuilding(id) { this.selectedBuilding = id; this.selected = null; renderer.selectedId = null; renderer.selectedBuilding = id; for (const f of this._sel) f(null, id); renderInspector(); },
};
window.hollowmere = ui;

// ---- speed buttons / keys
document.querySelectorAll('#speed button').forEach((b) => b.addEventListener('click', () => ui.setSpeed(+b.dataset.speed)));
addEventListener('keydown', (e) => {
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  if (e.code === 'Space') { ui.setSpeed(ui.speedIndex === 0 ? 1 : 0); e.preventDefault(); }
  else if (e.key >= '1' && e.key <= '5') ui.setSpeed(+e.key);
  else if (e.key === 'Escape') ui.select(null);
});

// ---- map input
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag'); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; renderer.pan(dx, dy); });
canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('drag');
  if (drag && drag.moved < 5) { const r = canvas.getBoundingClientRect(); click(e.clientX - r.left, e.clientY - r.top); }
  drag = null;
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
addEventListener('resize', () => renderer.resize());
new ResizeObserver(() => renderer.resize()).observe(document.getElementById('map-wrap'));

function click(sx, sy) {
  const [wx, wy] = renderer.toWorld(sx, sy), cur = { x: 0, y: 0 };
  let best = null, bd = Math.max(0.9, 14 / renderer.cam.zoom) ** 2;
  for (const p of world.living()) {
    if (p.inside) continue;
    renderer.posOf(p, frac, cur);
    const d = (cur.x + 0.5 - wx) ** 2 + (cur.y + 0.5 - wy) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  if (best) return ui.select(best.id);
  const bid = world.map.bAt[Math.floor(wy) * world.map.W + Math.floor(wx)];
  if (bid >= 0) return ui.selectBuilding(bid);
  ui.select(null);
}

// ---- minimal inspector (the UI agent can replace/extend; set ui.renderInspector to override)
const insEl = document.getElementById('inspector');
const NEED_COL = { hunger: '#d9822b', energy: '#5b8fd9', social: '#c46ad0', fun: '#e0c040', hygiene: '#4fc3c8', comfort: '#8fbf5a', purpose: '#e06a6a' };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function renderInspector() {
  if (ui.renderInspector) return ui.renderInspector(insEl);
  if (ui.selectedBuilding != null) {
    const b = world.buildings.get(ui.selectedBuilding);
    if (!b) return;
    insEl.innerHTML = `<div class="ins"><h2>${esc(b.name)}</h2><div class="sub">${esc(b.type)} &middot; ${b.occupants.size} inside</div>
      <div class="kv"><span>Employees</span><span>${b.employees.length}/${b.jobs.length}</span></div><div class="kv"><span>Residents</span><span>${b.residents.length}</span></div>
      <div class="kv"><span>Funds</span><span>${Math.round(b.funds)}</span></div>
      <p class="muted">${b.employees.map((id) => { const p = world.people.get(id); return p ? esc(p.firstName + ' ' + p.lastName) + ' (' + p.job + ')' : ''; }).join('<br>')}</p></div>`;
    return;
  }
  const p = ui.selected != null ? world.people.get(ui.selected) : null;
  if (!p) { insEl.innerHTML = '<p class="muted">Click a person or building to inspect.</p>'; return; }
  const age = Math.floor(world.ageOf(p)), ca = p.currentAction;
  const where = ca ? (ca.status === 0 ? 'walking' : 'doing') : 'idle';
  const home = p.homeId != null ? world.buildings.get(p.homeId) : null, work = p.workId != null ? world.buildings.get(p.workId) : null;
  const bars = Object.keys(NEED_COL).map((k) => `<div class="bar"><span>${k}</span><i><b style="width:${Math.round(p.needs[k] * 100)}%;background:${NEED_COL[k]}"></b></i><span>${Math.round(p.needs[k] * 100)}</span></div>`).join('');
  insEl.innerHTML = `<div class="ins"><h2>${esc(p.firstName + ' ' + p.lastName)}${p.alive ? '' : ' (deceased)'}</h2>
    <div class="sub">${age} years old &middot; ${p.sex === 'M' ? 'man' : 'woman'} &middot; ${esc(p.job)}</div>
    <div class="thought">${esc(p.thought || '...')}</div>
    <div class="kv"><span>Action</span><span>${ca ? esc(ca.label || ca.id) + ' (' + where + ')' : 'none'}</span></div>
    <div class="kv"><span>Mood</span><span>${p.mood.toFixed(2)}</span></div><div class="kv"><span>Money</span><span>${Math.round(p.money)}</span></div>
    <div class="kv"><span>Home</span><span>${home ? esc(home.name) : '-'}</span></div><div class="kv"><span>Work</span><span>${work ? esc(work.name) : '-'}</span></div>
    <div class="kv"><span>Traits</span><span>${esc(p.traits.join(', ') || '-')}</span></div><div style="margin-top:8px">${bars}</div></div>`;
}

// ---- feed
const feedEl = document.getElementById('feed-list');
let feedDirty = false;
world.on('chronicle', () => { feedDirty = true; });
function renderFeed() {
  feedDirty = false;
  feedEl.innerHTML = world.chronicle.recent(40, 2).map((e) => `<div class="feed-item i${e.importance}"><span class="d">${formatDate(e.tick)}</span>${esc(e.text)}</div>`).join('');
}
renderFeed();

// ---- loop
const el = { date: document.getElementById('date'), time: document.getElementById('time'), weather: document.getElementById('weather'), pop: document.getElementById('popcount') };
let last = performance.now(), acc = 0, frac = 1, lastUI = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  const sp = SPEEDS[ui.speedIndex];
  if (sp === 0) frac = 1;
  else if (sp === Infinity) {
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < 12 && n < 5000) { world.step(); n++; for (const f of ui._tick) f(world); }
    frac = 1;
  } else {
    acc += dt * sp;
    let n = 0;
    while (acc >= 1 && n < 400) { world.step(); acc -= 1; n++; for (const f of ui._tick) f(world); }
    if (acc > 5) acc = 0;
    frac = acc;
  }
  renderer.draw(frac);
  for (const f of ui._frame) f(world, now);
  if (now - lastUI > 200) {
    lastUI = now;
    const t = world.time;
    el.date.textContent = formatDate(world.tick); el.time.textContent = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    el.weather.textContent = `${world.weather.type}, ${world.weather.temp}°`;
    el.pop.textContent = `Pop. ${world.living().length}`;
    if (feedDirty) renderFeed();
    if (ui.selected != null || ui.selectedBuilding != null) renderInspector();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
