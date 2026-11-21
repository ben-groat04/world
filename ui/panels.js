// Gazette feed, stats dashboard (canvas charts + age pyramid), people directory, cemetery, time-lapse view and the
// responsive "dock" that hosts everything (sidebar on desktop, swipe-up bottom sheet on phones).
//   mountDock(container, store, opts)      -> { el, show(tab), destroy() }   (the one-call mount; includes inspector + godmode)
//   mountGazette / mountStats / mountDirectory / mountGraves(container, store, opts) -> { destroy() }
//   mountTimelapse(container, store, opts) -> { show(), hide(), destroy() }   (overlay for max speed; container must be position:relative)
import { esc, cap, pLink, moodColor, moodWord, mountInspector } from './inspector.js';
import { mountGodmode } from './godmode.js';
import { TICKS_PER_YEAR } from './worker.js';

const $ = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const yearOf = (tick) => Math.floor(tick / TICKS_PER_YEAR) + 1;
const cssv = (el, name, d) => (getComputedStyle(el).getPropertyValue(name).trim() || d);
const throttle = (fn, ms) => { let t = 0, q = null; return (...a) => { const n = performance.now(); if (n - t >= ms) { t = n; fn(...a); } else if (!q) q = setTimeout(() => { q = null; t = performance.now(); fn(...a); }, ms - (n - t)); }; };

// ------------------------------------------------------------------ linkify chronicle text
export function linkify(text, ppl) {
  const t = esc(text);
  if (!ppl || !ppl.length) return t;
  const alias = new Map(), firstCount = new Map();
  for (const p of ppl) { const f = p.name.split(' ')[0]; firstCount.set(f, (firstCount.get(f) || 0) + 1); }
  for (const p of ppl) { alias.set(esc(p.name), p.id); const parts = p.name.split(' '); if (firstCount.get(parts[0]) === 1 && parts[0].length > 2) alias.set(esc(parts[0]), p.id); if (parts.length > 1 && ppl.filter((q) => q.name.endsWith(' ' + parts[parts.length - 1])).length === 1) alias.set(esc(parts[parts.length - 1]), p.id); }
  const keys = [...alias.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(^|[^\\w])(${keys.join('|')})(?![\\w])`, 'g');
  return t.replace(re, (m, pre, name) => `${pre}<a class="hm-name" data-pid="${alias.get(name)}" role="button" tabindex="0">${name}</a>`);
}

// ------------------------------------------------------------------ charts
function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 120;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
function niceRange(lo, hi, pad = 0.08) {
  if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-9) { hi = lo + 1; }
  const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 3))), m = span / 3 / step, ns = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * step;
  return [Math.floor((lo - span * pad) / ns) * ns, Math.ceil((hi + span * pad) / ns) * ns, ns];
}
const fmtN = (v, d = 0) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(d));
// line chart: spec {series:[{name,color,pts:[[x,y]],fill?}], y:[min?,max?], fmt, band:[lo,hi]}
export function drawLine(cv, spec, hover) {
  const { g, w, h } = setupCanvas(cv), L = 34, R = 8, T = 8, B = 18;
  const ink = cssv(cv, '--hm-muted', '#8a7f6d'), grid = cssv(cv, '--hm-line', '#d8ccb4');
  let xs = [], ys = [];
  for (const s of spec.series) for (const p of s.pts) { xs.push(p[0]); ys.push(p[1]); }
  if (!xs.length) { g.fillStyle = ink; g.font = '12px system-ui'; g.fillText('Gathering data…', L, h / 2); return null; }
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 0.5);
  let [y0, y1, step] = niceRange(spec.y?.[0] ?? Math.min(...ys), spec.y?.[1] ?? Math.max(...ys));
  if (spec.y?.[0] != null) y0 = spec.y[0]; if (spec.y?.[1] != null) y1 = spec.y[1];
  const X = (x) => L + ((x - x0) / (x1 - x0)) * (w - L - R), Y = (y) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (h - T - B);
  if (spec.band) { g.fillStyle = cssv(cv, '--hm-band', 'rgba(120,160,90,.18)'); g.fillRect(L, Y(Math.min(y1, spec.band[1])), w - L - R, Y(Math.max(y0, spec.band[0])) - Y(Math.min(y1, spec.band[1]))); }
  g.font = '10px system-ui'; g.textBaseline = 'middle'; g.lineWidth = 1;
  const n = 3;
  for (let i = 0; i <= n; i++) { const v = y0 + ((y1 - y0) * i) / n, y = Y(v); g.strokeStyle = grid; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(L, y + .5); g.lineTo(w - R, y + .5); g.stroke(); g.globalAlpha = 1; g.fillStyle = ink; g.textAlign = 'right'; g.fillText((spec.fmt || ((q) => fmtN(q, y1 - y0 < 5 ? 2 : 0)))(v), L - 4, y); }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const span = x1 - x0, ys_ = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1;
  for (let yr = Math.ceil(x0 / ys_) * ys_; yr <= x1; yr += ys_) { g.fillStyle = ink; g.fillText('Y' + (yr + 1), X(yr), h - 4); }
  for (const s of spec.series) {
    if (!s.pts.length) continue;
    g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
    if (s.fill) { const gl = g.createLinearGradient(0, T, 0, h - B); gl.addColorStop(0, s.color + '55'); gl.addColorStop(1, s.color + '05'); g.save(); g.lineTo(X(s.pts[s.pts.length - 1][0]), Y(y0)); g.lineTo(X(s.pts[0][0]), Y(y0)); g.fillStyle = gl; g.fill(); g.restore(); g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); }
    g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    const lp = s.pts[s.pts.length - 1]; g.fillStyle = s.color; g.beginPath(); g.arc(X(lp[0]), Y(lp[1]), 3, 0, 7); g.fill();
  }
  if (hover != null) {
    const hx = Math.max(x0, Math.min(x1, hover)); g.strokeStyle = ink; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(hx), T); g.lineTo(X(hx), h - B); g.stroke(); g.setLineDash([]);
    for (const s of spec.series) { const p = nearest(s.pts, hx); if (p) { g.fillStyle = s.color; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 3.5, 0, 7); g.fill(); } }
  }
  return { x0, x1, L, R, w };
}
function nearest(pts, x) { let best = null, bd = 1e9; for (const p of pts) { const d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = p; } } return best; }
// grouped bar chart: spec {groups:[{x:label, v:[a,b], partial?}], series:[{name,color}]}
export function drawBars(cv, spec) {
  const { g, w, h } = setupCanvas(cv), L = 28, R = 6, T = 8, B = 18, ink = cssv(cv, '--hm-muted', '#8a7f6d'), grid = cssv(cv, '--hm-line', '#d8ccb4');
  const G = spec.groups.slice(-24); if (!G.length) { g.fillStyle = ink; g.font = '12px system-ui'; g.fillText('Gathering data…', L, h / 2); return; }
  const mx = Math.max(3, ...G.flatMap((q) => q.v)), [, y1] = niceRange(0, mx, 0.05), Y = (v) => T + (1 - v / y1) * (h - T - B);
  g.font = '10px system-ui'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) { const v = (y1 * i) / 3, y = Y(v); g.strokeStyle = grid; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(L, y + .5); g.lineTo(w - R, y + .5); g.stroke(); g.globalAlpha = 1; g.fillStyle = ink; g.fillText(fmtN(v, y1 < 5 ? 1 : 0), L - 4, y); }
  const bw = (w - L - R) / G.length, ns = spec.series.length, iw = Math.max(1.5, (bw * 0.8) / ns);
  G.forEach((q, i) => { q.v.forEach((v, k) => { g.fillStyle = spec.series[k].color; g.globalAlpha = q.partial ? 0.45 : 1; g.fillRect(L + i * bw + (bw - iw * ns) / 2 + k * iw, Y(v), iw - 0.5, Y(0) - Y(v)); g.globalAlpha = 1; }); if (G.length < 12 || i % Math.ceil(G.length / 8) === 0) { g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(q.x, L + i * bw + bw / 2, h - 4); } });
}
export function drawPyramid(cv, pyr) {
  const { g, w, h } = setupCanvas(cv), ink = cssv(cv, '--hm-muted', '#8a7f6d');
  const mx = Math.max(4, ...pyr.map((b) => Math.max(b.m, b.f))), cx = w / 2, half = cx - 22, rh = (h - 16) / pyr.length;
  const cm = cssv(cv, '--hm-c1', '#4f7fc0'), cf = cssv(cv, '--hm-c2', '#d9822b');
  g.font = '10px system-ui'; g.textBaseline = 'middle';
  pyr.forEach((b, i) => {
    const y = h - 16 - (i + 1) * rh;
    g.fillStyle = cm; g.fillRect(cx - (b.m / mx) * half - 1, y + 1, (b.m / mx) * half, rh - 1.5);
    g.fillStyle = cf; g.fillRect(cx + 1, y + 1, (b.f / mx) * half, rh - 1.5);
    if (i % 4 === 0) { g.fillStyle = ink; g.textAlign = 'center'; g.fillText(String(b.lo), cx, y + rh / 2); }
  });
  g.fillStyle = cm; g.textAlign = 'left'; g.fillText('♂ men', 4, h - 6); g.fillStyle = cf; g.textAlign = 'right'; g.fillText('women ♀', w - 4, h - 6);
  g.fillStyle = ink; g.textAlign = 'center'; g.fillText('age (years)', cx, h - 6);
}

// ------------------------------------------------------------------ Gazette
export function mountGazette(container, store, opts = {}) {
  const root = $(`<div class="hm-gaz"><header class="hm-mast"><div class="rule"></div><h1></h1><div class="sub"><span class="vol"></span><span class="mid">❦</span><span class="dt"></span><span class="mid">❦</span><span>One penny</span></div><div class="rule"></div></header>
    <div class="hm-filters"><div class="seg" role="group" aria-label="Importance"><button data-imp="1">All</button><button data-imp="2">Notable</button><button data-imp="3" class="on">News</button><button data-imp="4">Major</button></div>
    <select class="type" aria-label="Type"><option value="">Everything</option></select><input class="q" type="search" placeholder="Search the archive…"></div><div class="hm-feed"></div></div>`);
  container.appendChild(root);
  const feed = root.querySelector('.hm-feed'), types = root.querySelector('.type');
  let minImp = opts.minImportance || 3, type = '', q = '', limit = 120; const known = new Set(); let unseenCb = opts.onUnseen;
  root.querySelector('h1').textContent = `The ${store.state.townName || 'Hollowmere'} Gazette`;
  root.querySelectorAll('[data-imp]').forEach((b) => b.classList.toggle('on', +b.dataset.imp === minImp));
  function render() {
    const list = store.state.chron; const out = []; const ql = q.toLowerCase();
    for (let i = list.length - 1; i >= 0 && out.length < limit; i--) { const e = list[i]; if (e.imp < minImp || (type && e.type !== type) || (ql && !e.text.toLowerCase().includes(ql))) continue; out.push(e); }
    let html = '', lastY = null;
    for (const e of out) {
      const y = yearOf(e.tick);
      if (y !== lastY) { html += `<div class="hm-year">Year ${y}</div>`; lastY = y; }
      const c = e.imp >= 5 ? 'extra' : e.imp >= 4 ? 'major' : e.imp >= 3 ? 'news' : 'minor';
      html += `<article class="hm-item ${c}" data-type="${esc(e.type)}"><div class="meta"><time>${esc(e.date)}</time><span class="tp">${esc(e.type)}</span>${e.imp >= 5 ? '<span class="star">EXTRA!</span>' : ''}</div><p>${linkify(e.text, e.ppl)}</p></article>`;
    }
    if (out.length >= limit) html += '<button class="hm-more" data-more>Older editions…</button>';
    feed.innerHTML = html || '<p class="muted pad">No stories match. The town is quiet.</p>';
    const t = store.state.time; if (t) { root.querySelector('.vol').textContent = `Vol. ${t.year}`; root.querySelector('.dt').textContent = t.date; }
    for (const e of list) if (!known.has(e.type)) { known.add(e.type); types.insertAdjacentHTML('beforeend', `<option value="${esc(e.type)}">${esc(cap(e.type))}</option>`); }
  }
  const rr = throttle(() => { if (!root.closest('[hidden]')) render(); }, 500);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-imp]'); if (b) { minImp = +b.dataset.imp; root.querySelectorAll('[data-imp]').forEach((x) => x.classList.toggle('on', x === b)); limit = 120; render(); }
    if (e.target.closest('[data-more]')) { limit += 150; render(); }
    const n = e.target.closest('[data-pid]'); if (n) store.select(+n.dataset.pid);
  });
  types.addEventListener('change', () => { type = types.value; render(); });
  root.querySelector('.q').addEventListener('input', (e) => { q = e.target.value; render(); });
  const offs = [store.on('chron', (en) => { rr(); if (unseenCb && Array.isArray(en)) unseenCb(en.filter((x) => x.imp >= 3).length); }), store.on('ready', () => { root.querySelector('h1').textContent = `The ${store.state.townName} Gazette`; render(); })];
  render();
  return { el: root, refresh: render, destroy() { offs.forEach((f) => f()); root.remove(); } };
}

// ------------------------------------------------------------------ Stats dashboard
function yearly(series, key) {
  const m = new Map(); let prev = 0;
  for (const s of series) { const y = Math.floor(s.tick / TICKS_PER_YEAR); m.set(y, (m.get(y) || 0) + (s[key] - prev)); prev = s[key]; }
  return m;
}
export function mountStats(container, store, opts = {}) {
  const root = $(`<div class="hm-stats"><div class="hm-kpis"></div><div class="hm-charts"></div></div>`); container.appendChild(root);
  const kpis = root.querySelector('.hm-kpis'), wrap = root.querySelector('.hm-charts');
  const c = (n) => cssv(root, '--hm-c' + n, ['', '#4f7fc0', '#d9822b', '#5aa469', '#b86bc4', '#c8a23a'][n]);
  const CH = [
    { id: 'pop', title: 'Population', note: () => `${last('pop') ?? '-'}`, build: (S) => ({ series: [{ name: 'people', color: c(1), fill: true, pts: S.map((s) => [s.tick / TICKS_PER_YEAR, s.pop]) }] }) },
    { id: 'bd', title: 'Births & deaths per year', bars: true, note: () => '<i class="k" style="background:var(--hm-c3)"></i>births <i class="k" style="background:var(--hm-c2)"></i>deaths' },
    { id: 'mood', title: 'Average mood', build: (S) => ({ y: [-0.5, 0.8], fmt: (v) => v.toFixed(1), series: [{ color: c(5), pts: S.map((s) => [s.tick / TICKS_PER_YEAR, s.mood]) }] }) },
    { id: 'gini', title: 'Wealth inequality (Gini)', note: () => 'shaded: typical 0.3–0.5', build: (S) => ({ y: [0, 1], band: [0.3, 0.5], fmt: (v) => v.toFixed(1), series: [{ color: c(4), pts: S.map((s) => [s.tick / TICKS_PER_YEAR, s.gini]) }] }) },
    { id: 'emp', title: 'Working adults', build: (S) => ({ y: [0, 1], fmt: (v) => Math.round(v * 100) + '%', series: [{ color: c(3), pts: S.map((s) => [s.tick / TICKS_PER_YEAR, s.employed]) }] }) },
    { id: 'crime', title: 'Crimes per year', bars: true, note: () => '' },
    { id: 'pyr', title: 'Age pyramid', pyr: true, note: () => '<i class="k" style="background:var(--hm-c1)"></i>men <i class="k" style="background:var(--hm-c2)"></i>women' },
  ];
  const last = (k) => { const S = store.state.series; return S.length ? S[S.length - 1][k] : null; };
  wrap.innerHTML = CH.map((ch) => `<section class="hm-chart ${ch.id === 'pyr' ? 'tall' : ''}" data-c="${ch.id}"><header><h4>${ch.title}</h4><span class="rd"></span></header><canvas></canvas><footer>${ch.note ? ch.note() : ''}</footer></section>`).join('');
  const cvs = {}, rds = {}, foots = {};
  CH.forEach((ch) => { const s = wrap.querySelector(`[data-c="${ch.id}"]`); cvs[ch.id] = s.querySelector('canvas'); rds[ch.id] = s.querySelector('.rd'); foots[ch.id] = s.querySelector('footer'); });
  let hoverX = null, hoverId = null, specs = {};
  function crimesByYear() {
    const S = store.state.series; const tot = S.length ? S[S.length - 1].crime : 0;
    if (tot > 0) return yearly(S, 'crime');
    const m = new Map(); for (const e of store.state.chron) if (/crime|theft|assault|murder|arrest|robbery|brawl/i.test(e.type)) { const y = Math.floor(e.tick / TICKS_PER_YEAR); m.set(y, (m.get(y) || 0) + 1); } return m;
  }
  function draw() {
    const S = store.state.series, t = store.state.time, curY = t ? Math.floor(t.tick / TICKS_PER_YEAR) : 0;
    const L = S[S.length - 1];
    if (L) {
      const ln = (n, v, sub) => `<div class="kpi"><b>${v}</b><span>${n}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
      const by = yearly(S, 'births'), dy = yearly(S, 'deaths');
      kpis.innerHTML = ln('Population', L.pop, `${L.kids} children · ${L.elders} elders`) + ln('Mood', `<span style="color:${moodColor(L.mood)}">${moodWord(L.mood)}</span>`, L.mood.toFixed(2)) + ln('Working', Math.round(L.employed * 100) + '%', `${L.sick} ill`) + ln('Births / deaths', `${by.get(curY) || 0} / ${dy.get(curY) || 0}`, 'this year') + ln('Purse', L.money, `Gini ${L.gini.toFixed(2)}`) + ln('Treasury', L.treasury, `${L.married} marriages`);
    }
    for (const ch of CH) {
      const cv = cvs[ch.id]; if (!cv.clientWidth) continue;
      if (ch.pyr) { const d = store.state.directory; if (d) drawPyramid(cv, d.pyramid); continue; }
      if (ch.bars) {
        const a = ch.id === 'bd' ? [yearly(S, 'births'), yearly(S, 'deaths')] : [crimesByYear()];
        const ys = new Set(); a.forEach((m) => m.forEach((_, y) => ys.add(y)));
        const groups = [...ys].sort((x, y) => x - y).map((y) => ({ x: 'Y' + (y + 1), v: a.map((m) => Math.max(0, m.get(y) || 0)), partial: y === curY })).filter((g) => g.x !== 'Y0');
        drawBars(cv, { groups, series: ch.id === 'bd' ? [{ color: c(3) }, { color: c(2) }] : [{ color: c(2) }] });
        if (ch.id === 'crime') foots.crime.textContent = 'paler bar: year in progress'; else if (ch.id === 'bd') foots.bd.dataset.n = 1;
        continue;
      }
      const spec = ch.build(S); specs[ch.id] = spec;
      drawLine(cv, spec, hoverId === ch.id ? hoverX : null);
      const rd = rds[ch.id]; if (hoverId === ch.id && hoverX != null) rd.textContent = spec.series.map((s) => { const p = nearest(s.pts, hoverX); return p ? `Y${Math.floor(p[0]) + 1}: ${(spec.fmt || ((v) => fmtN(v, 0)))(p[1])}` : ''; }).join(' '); else { const sp = spec.series[0].pts; rd.textContent = sp.length ? (spec.fmt || ((v) => fmtN(v, 0)))(sp[sp.length - 1][1]) : ''; }
    }
  }
  wrap.addEventListener('pointermove', (e) => { const cv = e.target.closest('canvas'); if (!cv) return; const sec = cv.closest('[data-c]'), id = sec.dataset.c, sp = specs[id]; if (!sp) return; const r = cv.getBoundingClientRect(); const xs = sp.series[0].pts; if (!xs.length) return; const x0 = xs[0][0], x1 = xs[xs.length - 1][0]; hoverId = id; hoverX = x0 + ((e.clientX - r.left - 34) / (r.width - 42)) * (x1 - x0); draw(); });
  wrap.addEventListener('pointerleave', () => { hoverId = null; hoverX = null; draw(); });
  const vis = () => !root.closest('[hidden]') && root.offsetParent !== null;
  const dd = throttle(() => { if (vis()) draw(); }, 700);
  let dirTimer = setInterval(() => { if (vis()) store.requestDirectory(); }, 4000);
  const offs = [store.on('stats', dd), store.on('directory', dd), store.on('time', dd), store.on('ready', draw)];
  const ro = new ResizeObserver(() => draw()); ro.observe(root);
  draw();
  return { el: root, refresh() { store.requestDirectory(); draw(); }, destroy() { offs.forEach((f) => f()); clearInterval(dirTimer); ro.disconnect(); root.remove(); } };
}

// ------------------------------------------------------------------ People directory
export function mountDirectory(container, store, opts = {}) {
  const root = $(`<div class="hm-dir"><div class="hm-filters"><input class="q" type="search" placeholder="Search name, trade, street…"><select class="sort"><option value="name">Name</option><option value="age">Oldest first</option><option value="young">Youngest first</option><option value="mood">Happiest</option><option value="sad">Unhappiest</option><option value="money">Richest</option><option value="poor">Poorest</option></select></div><div class="hm-count muted"></div><div class="hm-rows"></div></div>`);
  container.appendChild(root);
  const rows = root.querySelector('.hm-rows'), cnt = root.querySelector('.hm-count'); let q = '', sort = 'name', limit = 100;
  const SORT = { name: (a, b) => a[1].localeCompare(b[1]), age: (a, b) => b[2] - a[2], young: (a, b) => a[2] - b[2], mood: (a, b) => b[5] - a[5], sad: (a, b) => a[5] - b[5], money: (a, b) => b[7] - a[7], poor: (a, b) => a[7] - b[7] };
  function render() {
    const d = store.state.directory; if (!d) { rows.innerHTML = '<p class="muted pad">Taking the census…</p>'; return; }
    const ql = q.toLowerCase(); let L = d.living.filter((r) => !ql || r[1].toLowerCase().includes(ql) || r[4].toLowerCase().includes(ql) || r[6].toLowerCase().includes(ql));
    L.sort(SORT[sort]); cnt.textContent = `${L.length} of ${d.living.length} townsfolk`;
    rows.innerHTML = L.slice(0, limit).map((r) => `<div class="hm-prow" data-pid="${r[0]}" role="button" tabindex="0"><i class="dot" style="background:${moodColor(r[5])}" title="mood ${r[5]}"></i><span class="n">${esc(r[1])}${r[8] ? ' <em title="ill">✚</em>' : ''}</span><span class="a">${r[2]}</span><span class="j">${esc(cap(r[4]))}</span><span class="h">${esc(r[6])}</span><span class="m">${r[7]}</span></div>`).join('') + (L.length > limit ? '<button class="hm-more" data-more>Show more…</button>' : '');
  }
  root.addEventListener('click', (e) => { if (e.target.closest('[data-more]')) { limit += 150; return render(); } const r = e.target.closest('[data-pid]'); if (r) store.select(+r.dataset.pid); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('[data-pid]'); if (r) store.select(+r.dataset.pid); } });
  root.querySelector('.q').addEventListener('input', (e) => { q = e.target.value; limit = 100; render(); });
  root.querySelector('.sort').addEventListener('change', (e) => { sort = e.target.value; render(); });
  const vis = () => !root.closest('[hidden]') && root.offsetParent !== null;
  const timer = setInterval(() => { if (vis()) store.requestDirectory(); }, 5000);
  const off = store.on('directory', () => { if (vis() && document.activeElement?.tagName !== 'SELECT') render(); });
  render();
  return { el: root, refresh() { store.requestDirectory(); render(); }, destroy() { off(); clearInterval(timer); root.remove(); } };
}

// ------------------------------------------------------------------ Cemetery
export function mountGraves(container, store, opts = {}) {
  const root = $(`<div class="hm-graves"><div class="hm-filters"><input class="q" type="search" placeholder="Search the churchyard…"></div><div class="hm-count muted"></div><div class="hm-stones"></div></div>`);
  container.appendChild(root);
  const box = root.querySelector('.hm-stones'), cnt = root.querySelector('.hm-count'); let q = '', limit = 60;
  function render() {
    const d = store.state.directory; if (!d) { box.innerHTML = '<p class="muted pad">Walking the churchyard…</p>'; return; }
    const ql = q.toLowerCase(); const L = d.dead.filter((r) => !ql || r[1].toLowerCase().includes(ql) || r[7].toLowerCase().includes(ql));
    cnt.textContent = d.dead.length ? `${L.length} buried in ${store.state.townName}` : '';
    box.innerHTML = L.slice(0, limit).map((r) => `<div class="hm-stone" data-pid="${r[0]}" role="button" tabindex="0"><div class="cross">${r[2] < 6 ? '✞' : '†'}</div><b>${esc(r[1])}${r[8] ? ` <small>née ${esc(r[8])}</small>` : ''}</b><span class="ag">aged ${r[2]}${r[4] ? ' · ' + esc(r[4]) : ''}</span><span class="dt">${esc(r[6])}</span><em>${esc(r[7])}</em></div>`).join('') + (L.length > limit ? '<button class="hm-more" data-more>More stones…</button>' : '') || '<p class="muted pad">No one has died yet. The churchyard is quiet.</p>';
  }
  root.addEventListener('click', (e) => { if (e.target.closest('[data-more]')) { limit += 60; return render(); } const r = e.target.closest('[data-pid]'); if (r) store.select(+r.dataset.pid); });
  root.querySelector('.q').addEventListener('input', (e) => { q = e.target.value; limit = 60; render(); });
  const vis = () => !root.closest('[hidden]') && root.offsetParent !== null;
  const timer = setInterval(() => { if (vis()) store.requestDirectory(); }, 8000);
  const off = store.on('directory', () => { if (vis()) render(); });
  render();
  return { el: root, refresh() { store.requestDirectory(); render(); }, destroy() { off(); clearInterval(timer); root.remove(); } };
}

// ------------------------------------------------------------------ Time-lapse overlay (shown at max speed)
export function mountTimelapse(container, store, opts = {}) {
  const root = $(`<div class="hm-tl" hidden><div class="tl-top"><div class="tl-date"><b></b><span></span></div><div class="tl-pop"></div><button class="tl-close" data-close title="Back to the map">Show map</button></div>
    <div class="tl-main"><div class="tl-ticker"></div><div class="tl-side"><div class="tl-follow"></div><div class="tl-charts"><canvas data-k="pop"></canvas><canvas data-k="mood"></canvas><canvas data-k="bd"></canvas></div></div></div></div>`);
  container.appendChild(root);
  let dismissed = false, auto = opts.auto !== false;
  const tick = root.querySelector('.tl-ticker'), fol = root.querySelector('.tl-follow');
  const show = () => { dismissed = false; root.hidden = false; draw(true); }, hide = () => { root.hidden = true; };
  const c = (n) => cssv(root, '--hm-c' + n, ['', '#4f7fc0', '#d9822b', '#5aa469', '#b86bc4', '#c8a23a'][n]);
  function ticker() {
    const L = store.state.chron, out = []; for (let i = L.length - 1; i >= 0 && out.length < 14; i--) if (L[i].imp >= 3) out.push(L[i]);
    tick.innerHTML = out.map((e) => `<div class="tl-item i${e.imp}"><time>${esc(e.date)}</time>${linkify(e.text, e.ppl)}</div>`).join('') || '<div class="muted">Years pass quietly…</div>';
  }
  function draw(force) {
    if (root.hidden) return; const t = store.state.time, S = store.state.series;
    if (t) { root.querySelector('.tl-date b').textContent = t.date; root.querySelector('.tl-date span').textContent = `${t.seasonName} · year ${t.year}`; root.querySelector('.tl-pop').innerHTML = `<b>${t.pop}</b> townsfolk`; }
    const cv = root.querySelectorAll('canvas');
    drawLine(cv[0], { series: [{ color: c(1), fill: true, pts: S.map((s) => [s.tick / TICKS_PER_YEAR, s.pop]) }] });
    drawLine(cv[1], { y: [-0.5, 0.8], fmt: (v) => v.toFixed(1), series: [{ color: c(5), pts: S.map((s) => [s.tick / TICKS_PER_YEAR, s.mood]) }] });
    const a = [yearly(S, 'births'), yearly(S, 'deaths')], ys = new Set(); a.forEach((m) => m.forEach((_, y) => ys.add(y)));
    drawBars(cv[2], { groups: [...ys].sort((x, y) => x - y).map((y) => ({ x: 'Y' + (y + 1), v: a.map((m) => Math.max(0, m.get(y) || 0)) })), series: [{ color: c(3) }, { color: c(2) }] });
    const d = store.state.detail;
    fol.innerHTML = d ? `<div class="tl-fp"><b>${pLink(d.id, d.name)}</b><span>${Math.floor(d.age)} · ${esc(cap(d.job))}${d.alive ? '' : ' †'}</span><em>${esc(d.alive ? d.thought : 'Died ' + d.deathDate)}</em><i style="background:${moodColor(d.mood)}"></i></div>` : '<div class="muted">Select someone to follow their life through the years.</div>';
  }
  const dd = throttle(draw, 350), tt = throttle(ticker, 600);
  const sync = () => { const mx = store.state.speed === 'max'; if (!mx) dismissed = false; if (auto && mx && !dismissed) show(); else if (!mx) hide(); };
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { dismissed = true; hide(); } const n = e.target.closest('[data-pid]'); if (n) store.select(+n.dataset.pid); });
  const offs = [store.on('speed', sync), store.on('stats', dd), store.on('time', dd), store.on('detail', dd), store.on('chron', tt)];
  ticker(); sync();
  return { el: root, show, hide, destroy() { offs.forEach((f) => f()); root.remove(); } };
}

// ------------------------------------------------------------------ Dock (tabs + responsive sheet)
const TABS = [['person', 'Person', '☺'], ['gazette', 'Gazette', '✉'], ['stats', 'Stats', '▓'], ['people', 'People', '☖'], ['graves', 'Graves', '†'], ['god', 'God', '✦']];
export function mountDock(container, store, opts = {}) {
  const tabs = opts.tabs || TABS.map((t) => t[0]);
  const root = $(`<div class="hm-dock" data-sheet="peek"><div class="hm-grab" role="button" aria-label="Expand panel" tabindex="0"><i></i></div><nav class="hm-tabs" role="tablist">${TABS.filter((t) => tabs.includes(t[0])).map((t) => `<button role="tab" data-tab="${t[0]}"><span class="ic">${t[2]}</span><span class="tx">${t[1]}</span><sup hidden></sup></button>`).join('')}</nav><div class="hm-panes">${TABS.filter((t) => tabs.includes(t[0])).map((t) => `<section class="hm-pane" data-pane="${t[0]}" hidden></section>`).join('')}</div></div>`);
  container.appendChild(root);
  const panes = {}, mounted = {}, handles = {}; root.querySelectorAll('.hm-pane').forEach((p) => (panes[p.dataset.pane] = p));
  const mk = {
    person: (el) => mountInspector(el, store, { onBuilding: opts.onBuilding, onClose: () => { sheet('peek'); } }),
    gazette: (el) => mountGazette(el, store, { onUnseen: (n) => { if (cur !== 'gazette') { unseen += n; badge('gazette', unseen); } } }),
    stats: (el) => mountStats(el, store), people: (el) => mountDirectory(el, store), graves: (el) => mountGraves(el, store),
    god: (el) => mountGodmode(el, store, opts.godmode || {}),
  };
  let cur = null, unseen = 0;
  const badge = (tab, n) => { const s = root.querySelector(`[data-tab="${tab}"] sup`); if (s) { s.hidden = !n; s.textContent = n > 99 ? '99+' : n; } };
  const sheet = (s) => { root.dataset.sheet = s; };
  function show(tab, o = {}) {
    if (!panes[tab]) return;
    if (cur === tab && !o.force) { if (matchMedia('(max-width:760px)').matches && root.dataset.sheet === 'peek') sheet('half'); return; }
    cur = tab;
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== tab;
    root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
    if (!mounted[tab]) { mounted[tab] = true; handles[tab] = mk[tab](panes[tab]); }
    else if (handles[tab]?.refresh) handles[tab].refresh();
    if (tab === 'gazette') { unseen = 0; badge('gazette', 0); }
    if (matchMedia('(max-width:760px)').matches && root.dataset.sheet === 'peek' && !o.keepSheet) sheet('half');
  }
  root.querySelector('.hm-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  // sheet gestures (phone): tap or swipe the handle / tab bar
  const grab = root.querySelector('.hm-grab'), order = ['peek', 'half', 'full'];
  grab.addEventListener('click', () => sheet(order[(order.indexOf(root.dataset.sheet) + 1) % 3]));
  grab.addEventListener('keydown', (e) => { if (e.key === 'Enter') grab.click(); });
  let sy = null, moved = false;
  const down = (e) => { if (e.target.closest('button')) return; sy = e.clientY; moved = false; };
  const move = (e) => { if (sy == null) return; const dy = e.clientY - sy; if (Math.abs(dy) > 36) { const i = order.indexOf(root.dataset.sheet); sheet(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]); sy = e.clientY; moved = true; } };
  const up = () => { sy = null; };
  for (const el of [grab, root.querySelector('.hm-tabs')]) { el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); }
  const offSel = store.on('select', (id) => { if (id != null && tabs.includes('person')) { show('person', { force: false }); if (matchMedia('(max-width:760px)').matches && root.dataset.sheet === 'peek') sheet('half'); } });
  const offJ = store.on('jumped', (e) => { if (e && e.id && tabs.includes('gazette')) { /* leave user where they are */ } });
  show(opts.initial || 'gazette', { keepSheet: true });
  return { el: root, show, sheet, destroy() { offSel(); offJ(); for (const h of Object.values(handles)) h?.destroy?.(); root.remove(); } };
}

export default { mountDock, mountGazette, mountStats, mountDirectory, mountGraves, mountTimelapse, linkify, drawLine, drawBars, drawPyramid };
