// God-mode panel. mountGodmode(container, store, opts) -> { destroy(), refresh() }
// Lists interventions registered in the world (sent by the worker in `ready`), with parameter forms, plus quick buttons.
import { esc, cap } from './inspector.js';

const P = (k, label, extra = {}) => ({ k, label, type: 'person', ...extra });
const N = (k, label, def, min, max, step, extra = {}) => ({ k, label, type: 'number', def, min, max, step, ...extra });
const B = (k, label, extra = {}) => ({ k, label, type: 'building', ...extra });
const S = (k, label, opts, def) => ({ k, label, type: 'select', opts, def });
const T = (k, label, extra = {}) => ({ k, label, type: 'text', ...extra });
const C = (k, label, def = false) => ({ k, label, type: 'bool', def });

export const CATALOG = {
  storm: { cat: 'Weather & disaster', icon: '⛈', label: 'Storm', f: [N('hours', 'Hours', 8, 1, 48, 1), N('severity', 'Severity', 1.6, 0.3, 3, 0.1)] },
  flood: { cat: 'Weather & disaster', icon: '≈', label: 'Flood', f: [N('severity', 'Severity', 0.6, 0.2, 1, 0.05)] },
  fire: { cat: 'Weather & disaster', icon: '🔥', label: 'Fire', f: [B('buildingId', 'Building (blank = random)'), N('severity', 'Severity', 0.5, 0.15, 1, 0.05)] },
  weather: { cat: 'Weather & disaster', icon: '☀', label: 'Weather', f: [S('type', 'Type', ['clear', 'rain', 'storm', 'snow', 'fog', 'heatwave'], 'rain'), N('hours', 'Hours', 8, 1, 72, 1), N('temp', 'Temp (optional)', '', -20, 40, 1)] },
  famine: { cat: 'Economy', icon: '☠', label: 'Famine', f: [N('severity', 'Severity', 0.7, 0.1, 1, 0.05), N('days', 'Days', 30, 3, 120, 1)] },
  goldRush: { cat: 'Economy', icon: '☆', label: 'Gold rush', f: [N('amount', 'Amount', 500, 50, 5000, 50), P('personId', 'Lucky person (optional)')] },
  tradeBoom: { cat: 'Economy', icon: '⚖', label: 'Trade boom', f: [N('days', 'Days', 20, 3, 120, 1), N('factor', 'Factor', 1.5, 1, 4, 0.1)] },
  setPrice: { cat: 'Economy', icon: '⚒', label: 'Set price', f: [S('good', 'Good', ['grain', 'flour', 'bread', 'tools', 'clothes', 'furniture'], 'bread'), N('mult', 'Price multiplier', 2, 0.2, 6, 0.1), N('days', 'Days', 20, 1, 120, 1)] },
  plague: { cat: 'Health', icon: '☣', label: 'Plague', f: [S('disease', 'Disease', ['sweating', 'pox', 'plague', 'flu', 'flux', 'cold'], 'flu'), N('n', 'First cases', 3, 1, 30, 1)] },
  heal: { cat: 'Health', icon: '✚', label: 'Heal', f: [P('person', 'Person'), C('all', 'Heal everyone')] },
  curse: { cat: 'Health', icon: '☠', label: 'Curse (make ill)', f: [P('person', 'Person'), T('disease', 'Disease key (optional)'), N('severity', 'Severity', 0.5, 0.1, 1, 0.05)] },
  miracle: { cat: 'Health', icon: '✨', label: 'Miracle', f: [S('kind', 'Kind', ['healing', 'sign'], 'sign'), P('personId', 'Person (optional)')] },
  spreadRumor: { cat: 'Society', icon: '🗣', label: 'Spread rumour', f: [P('aboutId', 'About', { req: true }), T('kind', 'Kind (affair, theft, ...)'), T('text', 'Text (optional)'), C('truth', 'Actually true', false), P('sourceId', 'Started by (optional)'), N('seeds', 'Told to', 3, 1, 20, 1)] },
  setRelationship: { cat: 'Society', icon: '⇄', label: 'Set relationship', f: [P('a', 'A', { req: true }), P('b', 'B', { req: true }), N('affinity', 'Affinity', 0.6, -1, 1, 0.05), N('trust', 'Trust', 0.5, 0, 1, 0.05), C('mutual', 'Mutual', true)] },
  moodBoost: { cat: 'Society', icon: '☺', label: 'Mood boost / sour', f: [P('personId', 'Person'), C('all', 'Whole town'), N('value', 'Value', 0.5, -1, 1, 0.05), T('label', 'Reason'), N('days', 'Days', 5, 1, 60, 1)] },
  matchmake: { cat: 'Love & family', icon: '♥', label: 'Matchmake', f: [P('a', 'First'), P('b', 'Second'), C('date', 'Start courting', true), C('marry', 'Marry them now', false)] },
  loveTriangle: { cat: 'Love & family', icon: '△', label: 'Love triangle', f: [P('a', 'The desired'), P('b', 'Their partner'), P('c', 'The rival')] },
  babyBoom: { cat: 'Love & family', icon: '☼', label: 'Baby boom', f: [N('count', 'Couples', 8, 1, 30, 1)] },
  twins: { cat: 'Love & family', icon: '↔', label: 'Twins', f: [P('motherId', 'Mother (optional)')] },
  crimeWave: { cat: 'Law & politics', icon: '⚑', label: 'Crime wave', f: [N('days', 'Days', 20, 1, 120, 1), N('intensity', 'Intensity', 2, 0.5, 6, 0.1)] },
  pardon: { cat: 'Law & politics', icon: '⛓', label: 'Pardon', f: [P('personId', 'Prisoner (blank = all)')] },
  callElection: { cat: 'Law & politics', icon: '✉', label: 'Call election', f: [N('days', 'Campaign days', 14, 3, 60, 1)] },
  setPolicy: { cat: 'Law & politics', icon: '⚖', label: 'Set policy', f: [N('taxRate', 'Tax rate', 0.12, 0.05, 0.3, 0.01), N('watchFunding', 'Watch funding', 0.5, 0, 1, 0.05), N('festivalBudget', 'Festival budget', 0.5, 0, 1, 0.05), N('poorRelief', 'Poor relief', 0.5, 0, 1, 0.05), N('publicWorks', 'Public works', 0.5, 0, 1, 0.05)] },
  coup: { cat: 'Law & politics', icon: '♚', label: 'Coup', f: [P('personId', 'Strongman (optional)')] },
  declareCandidacy: { cat: 'Law & politics', icon: '⚑', label: 'Declare candidacy', f: [P('personId', 'Person', { req: true })] },
  castVote: { cat: 'Law & politics', icon: '☑', label: 'Cast vote', f: [P('voterId', 'Voter', { req: true }), P('candidateId', 'Candidate', { req: true })] },
  immigrants: { cat: 'Population', icon: '⛵', label: 'Newcomers', f: [N('n', 'People', 3, 1, 30, 1), S('kind', 'Kind', ['', 'single', 'family', 'elder', 'stranger'], '')] },
  exodus: { cat: 'Population', icon: '➡', label: 'Exodus', f: [N('n', 'Households', 5, 1, 30, 1), P('person', 'Specific person (optional)'), S('reason', 'Reason', ['', 'work', 'disgrace', 'debt', 'ambition', 'heartbreak', 'grief'], '')] },
  festival: { cat: 'Culture', icon: '♫', label: 'Festival', f: [T('name', 'Name (optional)'), N('hours', 'Hours', 6, 1, 24, 1), B('venueId', 'Venue (optional)')] },
};
const QUICK = ['storm', 'plague', 'goldRush', 'immigrants', 'fire', 'matchmake', 'spreadRumor'];
const CAT_ORDER = ['Weather & disaster', 'Health', 'Economy', 'Society', 'Love & family', 'Law & politics', 'Population', 'Culture', 'Other'];

export function mountGodmode(container, store, opts = {}) {
  const root = document.createElement('div'); root.className = 'hm-god';
  root.innerHTML = `<div class="hm-god-intro"><b>Meddle gently.</b> Every nudge is recorded in the Gazette and in people’s memories.</div>
    <section class="hm-gsec"><h4>Time</h4><div class="hm-jump"><span>Skip ahead to the next</span><select class="jsel"><option value="3">news story</option><option value="4">major event</option><option value="5">disaster</option></select><button class="jgo">Skip</button></div><p class="jres muted"></p></section>
    <section class="hm-gsec"><h4>Quick actions</h4><div class="hm-quick"></div></section>
    <section class="hm-gsec"><h4>All interventions</h4><input class="q" type="search" placeholder="Filter…"><div class="hm-ilist"></div></section>
    <section class="hm-gsec"><h4>What you did</h4><div class="hm-glog"><p class="muted">Nothing yet.</p></div></section><datalist id="hm-people-dl"></datalist>`;
  container.appendChild(root);
  const dl = root.querySelector('datalist'); dl.id = 'hm-people-' + Math.random().toString(36).slice(2, 7);
  const quick = root.querySelector('.hm-quick'), list = root.querySelector('.hm-ilist'), glog = root.querySelector('.hm-glog');
  let q = '', openKind = null, nameToId = new Map(), bNameToId = new Map();

  const regs = () => { const m = new Map(); for (const i of store.state.interventions || []) m.set(i.kind, i); return m; };
  function loadPeople() {
    const d = store.state.directory; nameToId = new Map();
    if (!d) return;
    dl.innerHTML = d.living.map((r) => { const key = `${r[1]} (${r[2]}, #${r[0]})`; nameToId.set(key, r[0]); return `<option value="${esc(key)}">`; }).join('');
  }
  const bdl = document.createElement('datalist'); bdl.id = dl.id + 'b'; root.appendChild(bdl);
  function loadBuildings() { bNameToId = new Map(); bdl.innerHTML = (store.state.buildings || []).filter((b) => b.type !== 'park' && b.type !== 'cemetery' && b.type !== 'square' && b.type !== 'well').map((b) => { const key = `${b.name} [${b.type} #${b.id}]`; bNameToId.set(key, b.id); return `<option value="${esc(key)}">`; }).join(''); }

  function fieldHTML(f, kind) {
    const id = `${kind}-${f.k}`, lab = `<label for="${id}">${esc(f.label)}${f.req ? ' *' : ''}</label>`;
    if (f.type === 'number') return `<div class="fld">${lab}<input id="${id}" data-k="${f.k}" data-t="number" type="number" inputmode="decimal" ${f.min != null ? `min="${f.min}" max="${f.max}" step="${f.step}"` : ''} value="${f.def ?? ''}"></div>`;
    if (f.type === 'select') return `<div class="fld">${lab}<select id="${id}" data-k="${f.k}" data-t="select">${f.opts.map((o) => `<option ${o === f.def ? 'selected' : ''} value="${esc(o)}">${esc(o || '(any)')}</option>`).join('')}</select></div>`;
    if (f.type === 'bool') return `<div class="fld chk"><input id="${id}" data-k="${f.k}" data-t="bool" data-def="${f.def ? 1 : 0}" type="checkbox" ${f.def ? 'checked' : ''}>${lab}</div>`;
    if (f.type === 'person') return `<div class="fld per">${lab}<div class="pk"><input id="${id}" data-k="${f.k}" data-t="person" list="${dl.id}" placeholder="random / type a name" autocomplete="off"><button type="button" data-sel title="Use the selected person">◎</button></div></div>`;
    if (f.type === 'building') return `<div class="fld">${lab}<input id="${id}" data-k="${f.k}" data-t="building" list="${bdl.id}" placeholder="random / type a name" autocomplete="off"></div>`;
    return `<div class="fld">${lab}<input id="${id}" data-k="${f.k}" data-t="text" type="text"></div>`;
  }
  function collect(card) {
    const params = {}; let bad = null;
    card.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k, t = el.dataset.t; let v = el.value;
      if (t === 'bool') { if (el.checked) params[k] = true; else if (el.dataset.def === '1') params[k] = false; return; }
      if (t === 'json') { try { Object.assign(params, v.trim() ? JSON.parse(v) : {}); } catch (e) { bad = 'Invalid JSON'; } return; }
      if (v === '') { if (el.closest('.fld').querySelector('label').textContent.endsWith('*')) bad = `${el.closest('.fld').querySelector('label').textContent.replace(' *', '')} is required`; return; }
      if (t === 'number') params[k] = +v; else if (t === 'person') { const id = nameToId.get(v) ?? (/^#?(\d+)$/.test(v.trim()) ? +v.trim().replace('#', '') : null); if (id == null) bad = `Unknown person "${v}"`; else params[k] = id; }
      else if (t === 'building') { const id = bNameToId.get(v) ?? (/^#?(\d+)$/.test(v.trim()) ? +v.trim().replace('#', '') : null); if (id == null) bad = `Unknown building "${v}"`; else params[k] = id; }
      else params[k] = v;
    });
    return { params, bad };
  }
  function cardHTML(kind, info) {
    const cat = CATALOG[kind]; const desc = info?.description || '';
    const fields = cat ? cat.f.map((f) => fieldHTML(f, kind)).join('') : `<div class="fld wide"><label>Params (JSON)</label><textarea data-t="json" rows="3" placeholder='{"n": 3}'></textarea></div>`;
    return `<div class="hm-icard ${openKind === kind ? 'open' : ''}" data-kind="${esc(kind)}"><button class="hd" data-toggle><span class="ic">${cat?.icon || '•'}</span><span class="nm">${esc(cat?.label || kind)}</span><span class="ch">▾</span></button><div class="bd"><p class="ds">${esc(desc.replace(/\s*(params|\{).*$/i, '').trim() || desc)}</p><div class="flds">${fields}</div><button class="go" data-go>Do it</button></div></div>`;
  }
  function render() {
    const R = regs(), show = R.size ? [...R.keys()] : Object.keys(CATALOG);
    const ql = q.toLowerCase(); const by = {};
    for (const k of show) { const c = CATALOG[k]; const label = (c?.label || k).toLowerCase(); if (ql && !label.includes(ql) && !k.toLowerCase().includes(ql) && !(R.get(k)?.description || '').toLowerCase().includes(ql)) continue; (by[c?.cat || 'Other'] ||= []).push(k); }
    list.innerHTML = CAT_ORDER.filter((c) => by[c]).map((c) => `<div class="hm-icat"><h5>${c}</h5>${by[c].map((k) => cardHTML(k, R.get(k))).join('')}</div>`).join('') || '<p class="muted">Nothing matches.</p>';
    quick.innerHTML = QUICK.filter((k) => !R.size || R.has(k)).map((k) => `<button data-quick="${k}" title="${esc(R.get(k)?.description || '')}"><span class="ic">${CATALOG[k].icon}</span>${CATALOG[k].label}</button>`).join('');
  }
  function randomPerson() { const d = store.state.directory; return d && d.living.length ? d.living[Math.floor(Math.random() * d.living.length)][0] : null; }
  function quickFire(kind) {
    const params = {}; const sel = store.state.selectedId;
    for (const f of CATALOG[kind].f) { if (f.def !== undefined && f.def !== '' && f.type !== 'person') params[f.k] = f.def; }
    if (kind === 'spreadRumor') { const about = sel ?? randomPerson(); if (about == null) { flash('Open the People tab once so I can pick someone.'); store.requestDirectory(); return; } params.aboutId = about; delete params.sourceId; params.truth = false; }
    if (kind === 'matchmake') { if (sel != null) params.a = sel; params.date = true; }
    if (kind === 'goldRush' && sel != null) params.personId = sel;
    if (kind === 'fire') delete params.buildingId;
    if (kind === 'plague') params.n = 3;
    store.intervene(kind, params);
  }
  function flash(msg) { glog.querySelector('.muted')?.remove(); glog.insertAdjacentHTML('afterbegin', `<div class="gl warn">${esc(msg)}</div>`); }
  const onResult = (m) => {
    glog.querySelector('.muted')?.remove();
    let res = m.result == null ? '' : typeof m.result === 'string' ? m.result : (m.result.text || m.result.message || JSON.stringify(m.result)).slice(0, 160);
    const lab = CATALOG[m.kind]?.label || m.kind;
    glog.insertAdjacentHTML('afterbegin', `<div class="gl ${m.ok ? 'ok' : 'bad'}"><b>${esc(lab)}</b> <span>${m.ok ? '✓' : '✗ ' + esc(m.error || '')}</span><small>${esc(m.date || '')}${res ? ' · ' + esc(res) : ''}</small></div>`);
    while (glog.children.length > 20) glog.lastChild.remove();
  };
  root.addEventListener('click', (e) => {
    const qk = e.target.closest('[data-quick]'); if (qk) return quickFire(qk.dataset.quick);
    const tg = e.target.closest('[data-toggle]'); if (tg) { const c = tg.closest('.hm-icard'); const k = c.dataset.kind; const was = c.classList.contains('open'); list.querySelectorAll('.hm-icard.open').forEach((x) => x.classList.remove('open')); if (!was) { c.classList.add('open'); openKind = k; loadPeople(); } else openKind = null; return; }
    const sel = e.target.closest('[data-sel]'); if (sel) { const id = store.state.selectedId; if (id == null) return flash('Select a person first.'); const inp = sel.parentElement.querySelector('input'); for (const [k, v] of nameToId) if (v === id) inp.value = k; if (!inp.value) inp.value = '#' + id; return; }
    const go = e.target.closest('[data-go]'); if (go) { const card = go.closest('.hm-icard'); const { params, bad } = collect(card); if (bad) return flash(bad); store.intervene(card.dataset.kind, params); }
  });
  root.querySelector('.q').addEventListener('input', (e) => { q = e.target.value; render(); });
  root.querySelector('.jgo').addEventListener('click', () => { root.querySelector('.jres').textContent = 'Skipping ahead…'; store.jumpToNextEvent(+root.querySelector('.jsel').value); });
  const offs = [store.on('interventions', render), store.on('ready', () => { loadBuildings(); render(); }), store.on('directory', loadPeople), store.on('result', onResult),
    store.on('jumped', (e) => { root.querySelector('.jres').textContent = e ? `${e.date}: ${e.text}` : ''; })];
  loadBuildings(); loadPeople(); render(); store.requestDirectory();
  return { el: root, refresh() { store.requestDirectory(); render(); }, destroy() { offs.forEach((f) => f()); root.remove(); } };
}
export default { mountGodmode, CATALOG };
