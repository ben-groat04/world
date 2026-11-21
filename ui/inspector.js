// Person inspector. mountInspector(container, store, opts) -> { destroy(), show(id) }
//   store: Store from ui/worker.js (createWorkerSource / createLocalSource)
//   opts:  { onBuilding(id), onClose(), portraitSize }
// Also exports small shared helpers used by panels.js / godmode.js.
import { portraitDataURL } from './portrait.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const pct = (v) => Math.round(v * 100);
export const money = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)));
export const pLink = (id, name, cls = '') => `<a class="hm-name ${cls}" data-pid="${id}" role="button" tabindex="0">${esc(name)}</a>`;
export function moodWord(m) {
  return m > 0.6 ? 'elated' : m > 0.35 ? 'cheerful' : m > 0.12 ? 'content' : m > -0.12 ? 'steady' : m > -0.35 ? 'low' : m > -0.6 ? 'miserable' : 'despairing';
}
export const moodColor = (m) => (m >= 0 ? `hsl(${48 + Math.min(1, m) * 70} 62% 48%)` : `hsl(${20 - Math.min(1, -m) * 20} 62% ${50 - Math.min(1, -m) * 8}%)`);
export const NEEDS = [
  ['hunger', 'Hunger', '#d9822b'], ['energy', 'Energy', '#5b8fd9'], ['social', 'Company', '#b86bc4'], ['fun', 'Fun', '#d6b43a'],
  ['hygiene', 'Hygiene', '#3fb4ba'], ['comfort', 'Comfort', '#7fb050'], ['purpose', 'Purpose', '#d9606a'],
];
const BIG5 = [['openness', 'Open'], ['conscientiousness', 'Diligent'], ['extraversion', 'Outgoing'], ['agreeableness', 'Kind'], ['neuroticism', 'Anxious']];
const VALUE_LABEL = { tradition: 'Tradition', wealth: 'Wealth', family: 'Family', freedom: 'Freedom', community: 'Community', piety: 'Piety' };
const GROUPS = [['family', 'Family'], ['partner', 'Partner'], ['friend', 'Friends'], ['crush', 'Crushes'], ['coworker', 'Colleagues'], ['rival', 'Rivals'], ['enemy', 'Enemies'], ['ex', 'Former flames'], ['acquaintance', 'Acquaintances']];
const GLYPH = { partner: '♥', crush: '♡', enemy: '⚔', rival: '⚡', friend: '☺', family: '⌂', ex: '•', coworker: '⚒', acquaintance: '·' };

const bar = (label, v, col, extra = '') => `<div class="hm-bar"><span class="l">${label}</span><i><b style="width:${pct(Math.max(0, Math.min(1, v)))}%;background:${col}"></b></i><span class="v">${extra || pct(v)}</span></div>`;

function radar(pers) {
  const R = 46, C = 64, n = BIG5.length, pt = (i, r) => [C + Math.sin((i / n) * Math.PI * 2) * r, C - Math.cos((i / n) * Math.PI * 2) * r];
  let grid = '';
  for (const k of [0.33, 0.66, 1]) grid += `<polygon points="${BIG5.map((_, i) => pt(i, R * k).join(',')).join(' ')}" class="g"/>`;
  const axes = BIG5.map((_, i) => `<line x1="${C}" y1="${C}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" class="g"/>`).join('');
  const poly = BIG5.map(([k], i) => pt(i, R * (0.06 + 0.94 * (pers[k] ?? 0.5))).join(',')).join(' ');
  const labels = BIG5.map(([k, l], i) => { const [x, y] = pt(i, R + 13); return `<text x="${x}" y="${y + 3}" text-anchor="${Math.abs(x - C) < 4 ? 'middle' : x > C ? 'start' : 'end'}">${l}</text>`; }).join('');
  return `<svg class="hm-radar" viewBox="-14 -2 156 134" aria-label="Personality radar">${grid}${axes}<polygon points="${poly}" class="a"/>${labels}</svg>`;
}

function chip(r) { return r ? `<span class="hm-chip ${r.alive ? '' : 'dead'} ${r.sex === 'F' ? 'f' : 'm'}">${pLink(r.id, r.name)}<small>${r.alive ? r.age : '†' + r.age}</small></span>` : ''; }
function treeRow(label, list) { list = (list || []).filter(Boolean); return list.length ? `<div class="hm-trow"><span class="rl">${label}</span><span class="rc">${list.map(chip).join('')}</span></div>` : ''; }

function sections(d, ctx) {
  const S = {};
  const sub = [`${Math.floor(d.age)} yrs`, d.sex === 'M' ? 'man' : 'woman', cap(d.job)].join(' · ');
  S.head = `<div class="hm-head ${d.alive ? '' : 'dead'}">
    ${ctx.portrait ? `<img class="hm-portrait" src="${ctx.portrait}" width="${ctx.psize}" height="${ctx.psize}" alt="">` : ''}
    <div class="hm-id"><h2>${esc(d.name)}${d.maiden ? ` <small>née ${esc(d.maiden)}</small>` : ''}</h2>
      <div class="sub">${esc(sub)}</div>
      <div class="sub2">${d.alive ? (d.loc ? 'at ' + (d.loc.type === 'house' ? 'home' : `<a class="hm-name" data-bid="${d.loc.id}">${esc(d.loc.name)}</a>`) : 'out and about') : `Died ${esc(d.deathDate)} — ${esc(d.cause || 'unknown causes')}`}</div>
      <div class="sub2">${d.home ? `Home <a class="hm-name" data-bid="${d.home.id}">${esc(d.home.name)}</a>` : 'No fixed home'}${d.work ? ` · Works at <a class="hm-name" data-bid="${d.work.id}">${esc(d.work.name)}</a>` : ''}</div>
      <div class="hm-btns">${d.alive ? `<button data-act="follow" class="${ctx.following ? 'on' : ''}">${ctx.following ? '◉ Following' : '◎ Follow'}</button>` : ''}
        ${d.alive ? `<button data-act="player" class="${d.isPlayer ? 'on' : ''}" title="Play as this person">${d.isPlayer ? '♟ Playing' : '♟ Play as'}</button>` : ''}
        <button data-act="close" aria-label="Close">✕</button></div></div></div>`;
  const ex = d.explain && d.explain.length ? `<div class="hm-why">${d.explain.map((e) => `<span title="${esc(e.why)}">${esc(e.id.replace(/_/g, ' '))} <b>${e.score.toFixed(0)}</b></span>`).join('')}</div>` : '';
  S.now = d.alive ? `<div class="hm-thought">${esc(d.thought || '…')}</div>
    ${d.bubble ? `<div class="hm-say">“${esc(d.bubble)}”</div>` : ''}
    ${d.action ? `<div class="hm-act"><b>${esc(cap(d.action.label))}</b> <span>${d.action.status === 0 ? 'on the way' : 'now'}</span>${d.action.why ? `<em>${esc(d.action.why)}</em>` : ''}</div>` : ''}${ex}
    ${d.jailed ? `<div class="hm-flag bad">In jail until ${esc(d.jailed)}</div>` : ''}${d.pregnant ? `<div class="hm-flag">Expecting a child, due ${esc(d.pregnant.due)}${d.pregnant.father ? ' (father: ' + pLink(d.pregnant.father.id, d.pregnant.father.name) + ')' : ''}</div>` : ''}` : '';
  const ml = d.moodlets.slice(0, 10).map((m) => `<li class="${m.value >= 0 ? 'pos' : 'neg'}"><b>${m.value >= 0 ? '+' : '−'}${Math.abs(m.value).toFixed(2)}</b> ${esc(m.label)}</li>`).join('');
  S.mood = `<div class="hm-moodbar"><i><b style="left:${50 + d.mood * 50}%;background:${moodColor(d.mood)}"></b></i><span>${moodWord(d.mood)} <em>${d.mood >= 0 ? '+' : '−'}${Math.abs(d.mood).toFixed(2)}</em></span></div>${ml ? `<ul class="hm-moodlets">${ml}</ul>` : '<p class="muted">Nothing in particular on their mind.</p>'}`;
  S.needs = NEEDS.map(([k, l, c]) => bar(l, d.needs[k] ?? 0, d.needs[k] < 0.2 ? '#d9534f' : c)).join('');
  S.body = `${bar('Health', d.health, d.health < 0.4 ? '#d9534f' : '#6fae5a')}
    ${d.illness ? `<div class="hm-flag bad">${esc(cap(d.illness.name))}${d.illness.contagious ? ' (contagious)' : ''} — severity ${pct(d.illness.severity)}%, since ${esc(d.illness.since)}</div>` : ''}
    <div class="hm-kvs"><div><span>Purse</span><b>${money(d.money)} <small>coins</small></b></div><div><span>Larder</span><b>${d.food}</b></div><div><span>Standing</span><b>${d.rep >= 0 ? '+' : '−'}${Math.abs(d.rep).toFixed(2)}</b></div><div><span>Born</span><b class="sm">${esc(d.birthDate)}</b></div></div>`;
  const vals = Object.entries(d.values || {}).filter(([k]) => VALUE_LABEL[k]).map(([k, v]) => bar(VALUE_LABEL[k], v, '#a38a5c')).join('');
  S.person = `<div class="hm-pers">${radar(d.personality)}<div class="hm-traits">${d.traits.length ? d.traits.map((t) => `<span class="hm-trait">${esc(t)}</span>`).join('') : '<span class="muted">No marked traits</span>'}</div></div>${vals ? `<details class="hm-sub"><summary>Values</summary>${vals}</details>` : ''}`;
  S.skills = d.skills.length ? d.skills.slice(0, 9).map(([k, v]) => bar(cap(k), v, '#7c8fb8')).join('') : '<p class="muted">Untrained.</p>';
  let rh = '';
  for (const [k, label] of GROUPS) {
    const list = d.rels.filter((r) => r.kind === k); if (!list.length) continue;
    rh += `<div class="hm-rg"><h4>${label}${d.relCounts[k] > list.length ? ` <small>+${d.relCounts[k] - list.length}</small>` : ''}</h4>${list.map((r) => `<div class="hm-rel k-${k}"><span class="gl">${GLYPH[k]}</span>${pLink(r.id, r.name, r.alive ? '' : 'dead')}<small>${r.alive ? r.age : '†'}</small>
      <span class="meter" title="affinity ${r.aff} · trust ${r.trust} · attraction ${r.att}"><i style="width:${Math.abs(r.aff) * 50}%;${r.aff >= 0 ? 'left:50%;background:#6fae5a' : 'right:50%;background:#d9534f'}"></i></span>${r.att > 0.5 && k !== 'family' ? '<span class="hm-heart">♥</span>' : ''}</div>`).join('')}</div>`;
  }
  S.rels = rh || '<p class="muted">Hasn’t made many connections yet.</p>';
  S.rumors = d.rumors.length ? d.rumors.map((r) => `<div class="hm-rumor ${r.truth === false ? 'false' : ''}">“${esc(r.text || r.kind)}”<small>${r.about ? 'about ' + pLink(r.about.id, r.about.name) : ''}${r.from ? ' · heard from ' + pLink(r.from.id, r.from.name) : ''}${r.date ? ' · ' + esc(r.date) : ''}</small></div>`).join('') : '<p class="muted">Hasn’t heard any talk worth repeating.</p>';
  const F = d.family;
  S.family = `<div class="hm-tree">${treeRow('Grandparents', [F.paternal?.father, F.paternal?.mother, F.maternal?.father, F.maternal?.mother])}${treeRow('Parents', [F.father, F.mother])}
    ${treeRow(F.spouse ? 'Spouse' : 'Partner', F.spouse ? [F.spouse] : F.partner ? [F.partner] : [])}${treeRow('Formerly wed', F.exSpouses)}${treeRow('Siblings', F.siblings)}${treeRow('Children', F.children)}${treeRow('Grandchildren', F.grandchildren)}
    ${!F.father && !F.mother && !F.spouse && !F.partner && !F.children.length && !F.siblings.length ? '<p class="muted">No kin known in town.</p>' : ''}</div>`;
  S.life = d.life.length ? `<ol class="hm-life">${d.life.slice().reverse().map((l) => `<li class="i${l.imp}"><time>${esc(l.date)}</time>${esc(l.text)}</li>`).join('')}</ol>` : '<p class="muted">Nothing recorded yet.</p>';
  return S;
}
const ORDER = [['now', 'Right now', true], ['mood', 'Mood', true], ['needs', 'Needs', true], ['body', 'Body & purse', true], ['person', 'Personality', true], ['skills', 'Skills', false], ['rels', 'Relationships', true], ['rumors', 'Rumours believed', false], ['family', 'Family', true], ['life', 'Life story', true]];

export function mountInspector(container, store, opts = {}) {
  const psize = opts.portraitSize || 88;
  const root = document.createElement('div'); root.className = 'hm-ins'; container.appendChild(root);
  const cache = new Map(); const openState = new Map(ORDER.map(([k, , o]) => [k, o]));
  let built = false, pkey = '', pimg = '', curId = null;
  const els = {};
  function build() {
    root.innerHTML = `<div class="hm-empty"></div><div class="hm-body" hidden><div data-s="head"></div>${ORDER.map(([k, t]) => `<details class="hm-card" data-k="${k}" ${openState.get(k) ? 'open' : ''}><summary>${t}</summary><div data-s="${k}"></div></details>`).join('')}</div>`;
    root.querySelectorAll('[data-s]').forEach((e) => (els[e.dataset.s] = e));
    root.querySelectorAll('details.hm-card').forEach((e) => { els['d_' + e.dataset.k] = e; e.addEventListener('toggle', () => openState.set(e.dataset.k, e.open)); });
    els.empty = root.querySelector('.hm-empty'); els.wrap = root.querySelector('.hm-body'); built = true;
  }
  function renderEmpty() {
    els.empty.hidden = false; els.wrap.hidden = true;
    els.empty.innerHTML = `<div class="hm-empty-in"><div class="big">☺</div><p>Click someone on the map, a name in the Gazette, or pick a townsperson to read their life.</p><button data-act="random">Pick a random townsperson</button></div>`;
  }
  function render(d) {
    if (!built) build();
    if (!d) { cache.clear(); pkey = ''; return renderEmpty(); }
    els.empty.hidden = true; els.wrap.hidden = false;
    const key = [d.id, Math.floor(d.age), Math.round(d.mood * 4), Math.round(d.health * 4), d.job, d.alive].join('|');
    if (key !== pkey) { pkey = key; try { pimg = portraitDataURL(d.portrait, psize * 2); } catch (e) { pimg = ''; } }
    const S = sections(d, { portrait: pimg, psize, following: store.state.following });
    for (const [k, h] of Object.entries(S)) { if (cache.get(k) !== h && els[k]) { els[k].innerHTML = h; cache.set(k, h); } }
    if (els.d_now) els.d_now.hidden = !d.alive;
    for (const k of ['mood', 'needs', 'body']) if (els['d_' + k]) els['d_' + k].hidden = !d.alive;
  }
  const onClick = (e) => {
    const t = e.target.closest('[data-pid],[data-bid],[data-act]'); if (!t || !root.contains(t)) return;
    if (t.dataset.pid) { store.select(+t.dataset.pid); cache.clear(); return; }
    if (t.dataset.bid) { opts.onBuilding && opts.onBuilding(+t.dataset.bid); return; }
    const a = t.dataset.act;
    if (a === 'close') { store.select(null); opts.onClose && opts.onClose(); }
    else if (a === 'follow') { store.follow(); cache.delete('head'); render(store.state.detail); }
    else if (a === 'player') { const d = store.state.detail; store.playerCommand({ type: 'setPlayer', id: d.isPlayer ? null : d.id }); }
    else if (a === 'random') {
      const pick = (dir) => store.select(dir.living[Math.floor(Math.random() * dir.living.length)][0]);
      const dir = store.state.directory;
      if (dir && dir.living.length) pick(dir); else { const off = store.on('directory', (dd) => { off(); pick(dd); }); store.requestDirectory(); }
    }
  };
  const onKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-pid]')) { e.preventDefault(); e.target.click(); } };
  root.addEventListener('click', onClick); root.addEventListener('keydown', onKey);
  const offs = [
    store.on('detail', (d) => { if (d && d.id !== curId) { curId = d.id; cache.clear(); } render(d); }),
    store.on('select', (id) => { if (id == null) { curId = null; render(null); } }),
    store.on('follow', () => { cache.delete('head'); render(store.state.detail); }),
  ];
  render(store.state.detail);
  return { el: root, show: (id) => store.select(id), destroy() { offs.forEach((f) => f()); root.remove(); } };
}
export default { mountInspector };
