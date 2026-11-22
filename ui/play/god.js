// God mode view: search, presets first, interventions by theme (details on expand, pick-on-map), and a collapsible Consequences tracker that follows each
// intervention's causal event chain. Interventions change circumstances through the same typed commands as everything else; nothing scripts an outcome.
import { esc } from '../views.js';
import { THEMES } from '../godcatalogue.js';

const lc = (s) => String(s || '').replace(/_/g, ' ');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function mountGod(el, store, hooks) {
  el.innerHTML = '<div id="god" class="scroll"></div>'; const root = el.querySelector('#god');
  const G = { q: '', theme: 'All', open: null, consOpen: false, vals: {}, sent: '' };
  const field = (p, ctx) => {
    const id = `${ctx}_${p.k}`, v = G.vals[id] ?? p.def;
    if (p.type === 'number') { const x = v ?? p.def; return `<label class="gf"><span>${esc(p.label)}</span><div class="rng"><input data-k="${p.k}" data-id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${x}"><output>${x}${p.unit || ''}</output></div></label>`; }
    if (p.type === 'person') { const ppl = [...store.s.roster.values()].sort((a, b) => a.last.localeCompare(b.last)); return `<label class="gf"><span>${esc(p.label)}</span><div class="pickrow"><select data-k="${p.k}" data-id="${id}">${ppl.map((r) => `<option value="${r.id}" ${String(r.id) === String(v) ? 'selected' : ''}>${esc(r.last)}, ${esc(r.first)}</option>`).join('')}</select><button type="button" class="pickbtn" data-pick="person" data-for="${id}">Pick on map</button></div></label>`; }
    if (p.type === 'venue') return `<label class="gf"><span>${esc(p.label)}</span><div class="pickrow"><select data-k="${p.k}" data-id="${id}">${store.s.venueList.map((d) => `<option value="${d.id}" ${String(d.id) === String(v) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><button type="button" class="pickbtn" data-pick="venue" data-for="${id}">Pick on map</button></div></label>`;
    const list = p.type === 'dwelling' ? store.s.dwellings.map((d) => [d.unit, d.name]) : p.type === 'sector' ? store.s.sectors.map((d) => [d, lc(d)]) : p.type === 'goal' ? store.s.templates.map((d) => [d.id, cap(d.phrase)]) : p.type === 'select' ? p.options.map((o) => [o.v, o.l]) : null;
    if (list) return `<label class="gf"><span>${esc(p.label)}</span><select data-k="${p.k}" data-id="${id}">${list.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(v) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
    return `<label class="gf"><span>${esc(p.label)}</span><input data-k="${p.k}" data-id="${id}" type="text" value="${esc(v || '')}"></label>`;
  };
  const form = (item, ctx, kind) => `<div class="gform" data-kind="${kind}" data-n="${esc(item.name || item.id)}">${(item.params || item.picks || []).map((p) => field(p, ctx)).join('')}<button class="go" data-go>${kind === 'preset' ? 'Do it' : 'Send'}</button></div>`;
  const match = (c) => !G.q || (c.label + ' ' + c.desc + ' ' + (c.theme || '')).toLowerCase().includes(G.q);

  function conseq() {
    const L = store.s.conseq || []; if (!L.length) return '';
    const tot = L.reduce((s, x) => s + x.n, 0);
    const bars = (b) => { const mx = Math.max(1, ...b); return `<span class="cbars">${b.map((v) => `<i style="height:${Math.max(6, (v / mx) * 100)}%"></i>`).join('')}</span>`; };
    return `<details class="gcons" ${G.consOpen ? 'open' : ''}><summary><b>Consequences</b><small>${L.length} tracked · ${tot} events follow</small></summary>${L.map((x) => `<div class="cv"><div class="cvh"><i>${esc(x.icon)}</i><div><b>${esc(x.label)}</b><small>${esc(x.date)} · ${x.days}d ago${x.live ? ' · still unfolding' : ''}</small></div><div class="cn"><b>${x.n}</b><small>${x.people} people</small></div></div>
      <p class="gnote">${x.undone ? 'Reversed. What it already caused (evictions, moves, closures, illness) stays.' : x.ends ? `Runs until about ${esc(x.ends)}, then ends by itself.` : x.undo ? 'Stays in force until you reverse it.' : 'A one-off change: it cannot be recalled. Its knock-on effects keep playing out.'}</p>${x.undo ? `<button class="pb sm" data-undo="${x.id}">${esc(x.undo)}</button>` : ''}
      ${bars(x.buckets)}<div class="ck">${Object.entries(x.kinds).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `<span>${esc(k)} ${n}</span>`).join('')}</div>
      ${x.top.length ? `<ul class="ct">${x.top.map((t) => `<li><time>${esc(t.date)}</time> ${t.pid != null ? `<a class="pl" data-pid="${t.pid}">${esc(t.text)}</a>` : esc(t.text)}</li>`).join('')}</ul>` : '<p class="pdim">Nothing notable yet. People react over hours and days: let time run (Scene speed shows it live), or open Watch.</p>'}</div>`).join('')}</details>`;
  }
  function render() {
    const g = store.s.god; if (!g) return; const keep = root.scrollTop, focus = document.activeElement && document.activeElement.id === 'gq';
    const presets = (g.presets || []).filter(match);
    const cmds = g.list.filter((c) => match(c) && (G.theme === 'All' || c.theme === G.theme));
    const byTheme = {}; for (const c of cmds) (byTheme[c.theme] ||= []).push(c);
    const lsOn = (() => { try { return localStorage.getItem('lf_god_hint') === '1'; } catch (e) { return false; } })();
    root.innerHTML = `${lsOn || G.hintOff ? '' : '<div class="ghint"><p><b>How it works.</b> Pick a what-if and tap <i>Do it</i>. Neighbours react through the normal rules, so effects take hours to days to show: follow them under <b>Consequences</b> and in Watch. Most changes cannot be undone.</p><button class="pb sm" data-hint>Got it</button></div>'}<input id="gq" type="search" placeholder="Search interventions…" value="${esc(G.q)}" autocomplete="off">${conseq()}
      <h5>Presets</h5>${presets.map((p) => `<div class="gcmd ${G.open === 'p:' + p.id ? 'open' : ''}"><button class="gh" data-open="p:${p.id}"><i>${esc(p.icon)}</i><span><b>${esc(p.label)}</b><small>${esc(p.desc)}</small></span></button>${G.open === 'p:' + p.id ? `<div class="gbody">${form({ id: p.id, picks: p.picks }, 'p' + p.id, 'preset')}</div>` : ''}</div>`).join('') || '<p class="pdim">No presets match.</p>'}
      <h5>All interventions</h5><div class="chips gthemes">${['All', ...THEMES].map((t) => `<button data-theme="${esc(t)}" class="${G.theme === t ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      ${THEMES.filter((t) => byTheme[t]).map((t) => `<h6>${esc(t)}</h6>${byTheme[t].map((c) => `<div class="gcmd ${G.open === 'c:' + c.name ? 'open' : ''}"><button class="gh" data-open="c:${esc(c.name)}"><i>${esc(c.icon)}</i><span><b>${esc(c.label)}</b><small>${esc(c.desc)}</small></span></button>${G.open === 'c:' + c.name ? `<div class="gbody">${form(c, 'c' + c.name, 'cmd')}</div>` : ''}</div>`).join('')}`).join('') || '<p class="pdim">Nothing matches.</p>'}
      <div id="godlog"></div>`;
    root.scrollTop = keep; if (focus) { const q = root.querySelector('#gq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  const collect = (box) => { const a = {}; box.querySelectorAll('[data-k]').forEach((f) => { a[f.dataset.k] = f.type === 'range' ? +f.value : f.value; }); return a; };
  root.addEventListener('input', (e) => {
    const t = e.target; if (t.id === 'gq') { G.q = t.value.toLowerCase(); render(); return; }
    if (t.dataset && t.dataset.id) { G.vals[t.dataset.id] = t.value; if (t.type === 'range') { const c = store.s.god.list.find((x) => x.name === t.closest('.gform').dataset.n); const p = c && c.params.find((x) => x.k === t.dataset.k); t.parentElement.querySelector('output').textContent = t.value + (p && p.unit || ''); } }
  });
  root.addEventListener('click', (e) => {
    const sm = e.target.closest('summary'); if (sm && sm.parentElement.classList.contains('gcons')) { setTimeout(() => { G.consOpen = sm.parentElement.open; }, 0); return; }
    const th = e.target.closest('[data-theme]'); if (th) { G.theme = th.dataset.theme; render(); return; }
    const op = e.target.closest('[data-open]'); if (op) { G.open = G.open === op.dataset.open ? null : op.dataset.open; render(); return; }
    const pk = e.target.closest('[data-pick]'); if (pk) { const id = pk.dataset.for; hooks.pick(pk.dataset.pick, (val) => { G.vals[id] = String(val); render(); }); return; }
    const hn = e.target.closest('[data-hint]'); if (hn) { G.hintOff = true; try { localStorage.setItem('lf_god_hint', '1'); } catch (x) { /* ignore */ } render(); return; }
    const ud = e.target.closest('[data-undo]'); if (ud) { store.post({ cmd: 'play', op: 'godUndo', id: +ud.dataset.undo }); ud.disabled = true; ud.textContent = 'Reversing…'; return; }
    const go = e.target.closest('[data-go]'); if (!go) return; const box = go.closest('.gform'), args = collect(box);
    if (box.dataset.kind === 'preset') store.post({ cmd: 'godPreset', id: box.dataset.n, picks: args }); else store.god(box.dataset.n, args);
    go.textContent = 'Sent ✓'; G.consOpen = true; G.open = null; setTimeout(() => { render(); root.scrollTop = 0; const c = root.querySelector('.gcons'); if (c) c.open = true; }, 350); setTimeout(() => { go.textContent = box.dataset.kind === 'preset' ? 'Do it' : 'Send'; }, 1400);
  });
  let gstale = false; el.addEventListener('shown', () => { if (gstale) { gstale = false; render(); } });
  store.on('conseq', (m) => { store.s.conseq = m.list; if (el.offsetParent === null) { gstale = true; return; } if (!root.querySelector('.gcons') || G.open === null || true) { const d = root.querySelector('.gcons'); const tmp = document.createElement('div'); tmp.innerHTML = conseq(); if (d && tmp.firstChild) { const open = d.open; d.replaceWith(tmp.firstChild); root.querySelector('.gcons').open = open; } else render(); } });
  store.on('ready', render); if (store.s.god) render();
}
