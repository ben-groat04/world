// Side-panel views: feed (Local / Forum / Posts / Stories), inspector (person + place), town stats, people directory, god mode.
import { drawPortrait } from './portrait.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => Math.round(v * 100);
const gbp = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const lc = (s) => String(s || '').replace(/_/g, ' ');
/** Human durations: "3 days", "5 weeks", "8 months", "2 years 3 months". */
export const dur = (days) => { days = Math.max(0, Math.round(days)); if (days < 2) return days <= 0 ? 'today' : '1 day'; if (days < 14) return days + ' days'; if (days < 60) return Math.round(days / 7) + ' weeks'; if (days < 730) { const m = Math.round(days / 30.4); return m + ' months'; } const y = Math.floor(days / 365.25), m = Math.round((days - y * 365.25) / 30.4); return y + ' years' + (m && m < 12 ? ' ' + m + ' months' : ''); };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const SEG_COL = [32, 205, 330, 265, 175, 120, 15, 48, 290, 90, 0];
const segColor = (i) => `hsl(${SEG_COL[i] ?? 200},62%,52%)`;
const pl = (id, name) => `<a class="pl" data-pid="${id}">${esc(name)}</a>`;
const bl = (id, name) => `<a class="bl" data-bid="${id}">${esc(name)}</a>`;
const KIND_ICON = { life: '♥', labour: '⚒', housing: '⌂', health: '✚', money: '£', social: '☺', group: '⚉', goal: '⚑', god: '★', civic: '✉', crime: '◈', business: '▣' };

// ------------------------------------------------------------------ small chart helpers (inline SVG)
function spark(vals, { w = 150, h = 38, col = '#5bb4ff', fmt = (v) => v } = {}) {
  if (vals.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"><text x="4" y="22" fill="#627185" font-size="11">collecting…</text></svg>`;
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1; const pts = vals.map((v, i) => [2 + (i / (vals.length - 1)) * (w - 4), h - 4 - ((v - mn) / sp) * (h - 10)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img"><path d="${d} L${w - 2} ${h} L2 ${h} Z" fill="${col}" opacity=".16"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2.6" fill="${col}"/></svg>`;
}
function pyramid(pyr) {
  const mx = Math.max(1, ...pyr.map((b) => Math.max(b.m, b.f))), rows = pyr.slice().reverse().filter((b) => b.lo <= 95);
  return `<div class="pyr">${rows.map((b) => `<div class="pr"><span class="pm" style="width:${(b.m / mx) * 100}%" title="Men ${b.m}"></span><i>${b.lo}</i><span class="pf" style="width:${(b.f / mx) * 100}%" title="Women ${b.f}"></span></div>`).join('')}</div><div class="pleg"><span><b class="dm"></b>men</span><span><b class="df"></b>women</span></div>`;
}
const bar = (v, col = 'var(--accent2)', label = '') => `<div class="meter" title="${esc(label)}"><i style="width:${Math.max(0, Math.min(100, v * 100))}%;background:${col}"></i></div>`;
const stackBar = (parts) => { const tot = parts.reduce((s, p) => s + p.v, 0) || 1; return `<div class="stack">${parts.map((p) => `<i style="width:${(p.v / tot) * 100}%;background:${p.c}" title="${esc(p.l)}: ${p.v}"></i>`).join('')}</div><div class="slegend">${parts.map((p) => `<span><b style="background:${p.c}"></b>${esc(p.l)} ${p.v}</span>`).join('')}</div>`; };

// ------------------------------------------------------------------ FEED
export function mountFeed(el, store) {
  let mode = 'local', lf = 'all'; const tabs = [['local', 'Local'], ['stories', 'Storylines'], ['forum', 'Forum'], ['posts', 'Posts']];
  el.innerHTML = `<div class="chips" id="fchips">${tabs.map(([k, l]) => `<button data-m="${k}" class="${k === mode ? 'on' : ''}">${l}</button>`).join('')}</div><div class="seg" id="lfilter">${[['all', 'Everything'], ['people', 'People'], ['town', 'Town']].map(([k, l]) => `<button data-lf="${k}" class="${k === lf ? 'on' : ''}">${l}</button>`).join('')}</div><div id="fbody" class="scroll"></div>`;
  const body = el.querySelector('#fbody');
  el.querySelector('#fchips').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; el.querySelectorAll('#fchips button').forEach((x) => x.classList.toggle('on', x === b)); render(); };
  el.querySelector('#lfilter').onclick = (e) => { const b = e.target.closest('[data-lf]'); if (!b) return; lf = b.dataset.lf; el.querySelectorAll('#lfilter button').forEach((x) => x.classList.toggle('on', x === b)); render(); };
  const person = (p) => pl(p.id, p.name);
  el.addEventListener('click', (e) => { const c = e.target.closest('.news'); if (c && !e.target.closest('a')) c.classList.toggle('open'); });
  function news(it) {
    const ic = KIND_ICON[it.kind] || '●';
    return `<article class="card news k-${it.kind}${it.conseq ? ' conseq' : ''}${it.sal >= 0.5 ? ' big' : ''}"><div class="ni">${ic}</div><div class="nb"><div class="nh">${esc(it.head)}</div>${it.because ? `<div class="because">↳ because of: ${esc(it.because)}</div>` : ''}${it.body ? `<p>${esc(it.body)}</p>` : it.line && it.line !== it.head ? `<p>${esc(it.line)}</p>` : ''}<div class="nm"><time>${esc(it.date)}</time>${it.conseq ? '<em>consequence</em>' : ''}${it.place ? ' · ' + bl(it.place.id, it.place.name) : ''}${(it.ppl || []).slice(0, 3).map((p) => ' ' + pl(p.id, p.name)).join('')}</div></div></article>`;
  }
  function renderLocal() {
    const TOWN = new Set(['business', 'crime', 'civic', 'health']); const items = store.s.news.filter((x) => lf === 'all' || (lf === 'town' ? TOWN.has(x.kind) && x.town : !(TOWN.has(x.kind) && x.town))).slice(-80).reverse();
    if (lf === 'town' && !items.length) return '<p class="empty">Nothing to report from the high street, the council or the police yet. Shops opening and closing, planning decisions, council cuts and elections appear here.</p>';
    return items.length ? items.map(news).join('') : '<p class="empty">A quiet start. Local news will appear here as things happen: arrivals, jobs, rows, weddings, rent rises…</p>';
  }
  function renderForum() {
    const P = store.s.posts.filter((p) => p.ch === 'forum');
    if (!P.length) return '<p class="empty">The neighbourhood forum is empty so far.</p>';
    return P.map((p) => `<article class="card post forum"><div class="ph"><span class="av" style="background:hsl(${(p.au.id * 47) % 360},45%,40%)">${esc((p.au.name || '?')[0])}</span><div>${person(p.au)}<small>${esc(p.date)} · ${esc(lc(p.kind))}${p.seen ? ` · seen by ${p.seen}` : ''}</small></div></div><p>${esc(p.text)}</p>${(p.replies || []).map((r) => `<div class="reply"><b>${person(r.au)}</b> ${esc(r.text)}</div>`).join('')}</article>`).join('');
  }
  function renderPosts() {
    const P = store.s.posts.filter((p) => p.ch === 'feed');
    if (!P.length) return '<p class="empty">No posts yet.</p>';
    return P.map((p) => `<article class="card post"><div class="ph"><span class="av" style="background:hsl(${(p.au.id * 47) % 360},45%,40%)">${esc((p.au.name || '?')[0])}</span><div>${person(p.au)}<small>${esc(p.date)}${p.reach ? ` · reached ${p.reach}` : ''}</small></div></div><p>${esc(p.text)}</p></article>`).join('');
  }
  function renderStories() {
    const A = store.s.arcs, F = store.s.follow; if (!A.length) return '<p class="empty">No story is running strongly yet: just ordinary lives. Speed up and check back in a few game-weeks.</p>';
    const who = F ? `<article class="card follow"><div class="fh">Who to follow</div><div class="fw">${pl(F.id, F.name)}<small>${esc(F.kind)}</small></div><p>${esc(F.why)}</p><button class="pb" data-follow="${F.id}">◎ Follow ${esc(F.name.split(' ')[0])}</button></article>` : '';
    return who + A.map((a) => `<article class="card arc k-${esc(a.kind)}"><div class="ah"><span class="tag">${esc(a.label)}</span><span class="st ${a.status}">${a.status === 'open' ? 'ongoing' : esc(a.outcome || a.status)}</span><small>${dur(a.since)}${a.idle > 14 ? ' · quiet for ' + dur(a.idle) : ''}</small></div><div class="hl">${storyHead(a)}</div><ol class="beats">${beatList(a.beats)}</ol></article>`).join('');
  }
  // collapse repeats ("fell behind on rent" x3) so the last few beats tell a sequence, not an echo
  const beatList = (bs) => { const out = []; for (const b of bs) { const l = out[out.length - 1]; if (l && l.text === b.text) { l.n++; l.date = b.date; } else out.push({ text: b.text, date: b.date, n: 1 }); } return out.slice(-4).map((b) => `<li><time>${esc(b.date)}</time> ${esc(b.text)}${b.n > 1 ? ` <em>again (x${b.n})</em>` : ''}</li>`).join(''); };
  // premise sentence with the protagonists' names turned into links
  const storyHead = (a) => { let t = esc(a.headline); for (const x of a.actors) { const f = esc(x.name.split(' ')[0]); t = t.replace(new RegExp('\\b' + f + '\\b'), `<a class="pl" data-pid="${x.id}">${f}</a>`); } return t; };
  function render() { const top = body.scrollTop; el.querySelector('#lfilter').hidden = mode !== 'local'; body.innerHTML = mode === 'local' ? renderLocal() : mode === 'forum' ? renderForum() : mode === 'posts' ? renderPosts() : renderStories(); body.scrollTop = top; }
  let dirty = false; const mark = () => { if (!dirty) { dirty = true; setTimeout(() => { dirty = false; render(); }, 400); } };
  store.on('news', mark); store.on('posts', mark); store.on('arcs', mark); store.on('ready', mark); render();
}

// ------------------------------------------------------------------ INSPECTOR (person or place)
export function mountInspect(el, store, hooks) {
  el.innerHTML = '<div id="inspect" class="scroll"><div class="empty big">Tap a person or a building on the map.</div></div>';
  const root = el.querySelector('#inspect'); let mode = 'none', lastKey = '', open = { story: false };
  const sec = (key, title, inner, openDef = false, hint = '') => { const o = open[key] ?? openDef; return `<details class="sec" data-k="${key}" ${o ? 'open' : ''}><summary>${title}${hint ? `<small class="hint">${hint}</small>` : ''}</summary>${inner}</details>`; };
  root.addEventListener('toggle', (e) => { const d = e.target.closest && e.target.closest('details.sec'); if (d) open[d.dataset.k] = d.open; }, true);
  const tie = (t) => (t.on ? pl(t.id, t.name) : `<span class="off" title="Lives elsewhere (off-map)">${esc(t.name)}<small>elsewhere</small></span>`);
  function person(d) {
    const tm = (c) => (c >= 0.5 ? 'warm' : c <= -0.25 ? 'cold' : 'mid');
    const fam = d.ties.filter((t) => t.k === 'kin'), friends = d.ties.filter((t) => t.k === 'friend').sort((a, b) => b.strength - a.strength).slice(0, 8), fric = d.ties.filter((t) => t.k === 'friction' || t.warmth < -0.2), house = d.ties.filter((t) => t.k === 'housemate'), others = d.ties.filter((t) => ['colleague', 'neighbour'].includes(t.k)).slice(0, 6);
    const m = d.money, pr = m.pressure || {}, hs = d.health.status || {}, men = d.health.mental || {}, wb = d.health.wellbeing || {};
    const bur = m.burden || 0; const stress = pr.stress ?? 0;
    const job = d.jobInfo, wpl = d.workplace;
    const workLine = job && job.occ && d.activity === 'employed' ? `${esc(d.occLabel || cap(lc(job.occ)))} · ${esc(lc(job.contract))} · ${job.hours} h/wk · ${gbp(job.pay)}/yr${wpl ? `<br><small>${wpl.offmap ? 'Works in the city (' + esc(wpl.name) + ')' : 'at ' + bl(wpl.id, wpl.name)}${wpl.mode ? ' · ' + esc(lc(wpl.mode)) + (wpl.mins ? ', ' + wpl.mins + ' min' : '') : ''}${wpl.hybrid ? ' · hybrid' : ''}</small>` : ''}${job.job2 ? '<br><small>+ second job</small>' : ''}` : `${esc(cap(lc(d.activity)))}${d.job && lc(d.job).toLowerCase() !== lc(d.activity).toLowerCase() ? ' · ' + esc(d.job) : ''}`;
    const unit = d.unit;
    const moodW = d.health.mood > 0.35 ? 'upbeat' : d.health.mood > 0.05 ? 'okay' : d.health.mood > -0.3 ? 'flat' : 'low', strW = stress < 0.3 ? 'coping' : stress < 0.6 ? 'strained' : 'under pressure';
    const stCls = (bad) => (bad ? 'stt bad' : 'stt');
    const workHint = job && job.occ && d.activity === 'employed' ? esc(d.occLabel || cap(lc(job.occ))) : esc(cap(lc(d.activity)));
    const lifeRows = d.life.slice().reverse();
    const goals = d.goals.length ? d.goals.map((g) => `<div class="goal"><div class="gt">${esc(cap(g.phrase))}<small>${esc(g.status)}${g.secret ? ' · secret' : ''}</small></div>${g.step ? `<div class="gs"><span>${esc(g.step.label)}</span><span>${g.step.i}/${g.step.n}</span></div>${bar(g.step.n ? g.step.i / g.step.n : 0, 'var(--good)')}` : ''}</div>`).join('') : '<p class="mute">No active goals right now.</p>';
    const cond = (hs.conditions || []).length ? hs.conditions.map((c) => `<span class="pill">${esc(lc(c))}</span>`).join('') : '';
    return `
    <button class="back" data-back>&lsaquo; People</button>
    <div class="phead"><canvas id="pcv" width="192" height="192"></canvas><div class="pn"><h2>${esc(d.name)}</h2><div class="sub">${d.age} · ${esc(d.segLabel)}</div><div class="sub dim">${d.home ? bl(d.home.id, d.home.name) : ''}${d.yearsAtAddress != null ? ` · ${dur(d.yearsAtAddress * 365.25)} here` : ''}</div>
      <div class="pbtns"><button id="pfollow" class="${store.s.following ? 'on' : ''}">${store.s.following ? '◉ Following' : '◎ Follow'}</button><button id="pshow">Show on map</button><button id="pplay" title="Play as this person">Play as</button></div></div></div>
    ${d.story ? `<div class="mystory"><b>${esc(d.story.label)}</b> ${esc(d.story.headline)}${d.story.status === 'open' ? '' : ' <i>(' + esc(d.story.outcome || d.story.status) + ')</i>'}</div>` : ''}
    ${d.alive ? '' : `<div class="dead">Died${d.cause ? ': ' + esc(d.cause) : ''}</div>`}
    <div class="now ${d.offmap ? 'away' : ''}"><div class="act">${d.offmap ? '✈ Away in the city' : d.loc ? '⌂ At ' + bl(d.loc.id, d.loc.name) : '→ Out and about'}${d.now ? ` · ${esc(lc(d.now.act))}` : ''}</div><div class="thought">“${esc(d.thought || '…')}”</div><div class="states"><span class="${stCls(moodW === 'low')}">Mood ${moodW}</span><span class="${stCls(stress >= 0.6)}">Money ${strW}</span>${wb.lonely ? '<span class="stt bad">Lonely</span>' : ''}${(hs.conditions || []).length ? `<span class="stt bad">${esc(lc(hs.conditions[0]))}</span>` : ''}</div></div>
    ${sec('home', 'Home &amp; household', `<div class="kv"><span>Household</span><span>${d.household.members.length ? d.household.members.map((x) => pl(x.id, x.name)).join(', ') : 'lives alone'}</span></div>${unit ? `<div class="kv"><span>Home</span><span>${esc(lc(unit.tenure))}, ${unit.bedrooms} bed${unit.bedrooms === 1 ? '' : 's'}${unit.rent ? ' · ' + gbp(unit.rent) + '/mo' : ''}</span></div>${unit.landlord ? `<div class="kv"><span>Landlord</span><span>${pl(unit.landlord.id, unit.landlord.name)}</span></div>` : ''}<div class="kv"><span>Condition</span><span>${pct(unit.cond)}%${unit.damp ? ' · damp' : ''}${unit.notice ? ' · <b class="bad">notice served</b>' : ''}</span></div>` : ''}`, false, `${d.household.members.length ? 'with ' + d.household.members.length : 'lives alone'}${unit ? ' · ' + esc(lc(unit.tenure)) : ''}`)}
    ${sec('work', 'Work', `<div class="kv one"><span>${workLine}</span></div>`, false, workHint)}
    ${sec('money', 'Money', `<div class="gauge"><label>Cost-of-living stress</label>${bar(stress, stress > 0.6 ? 'var(--bad)' : stress > 0.3 ? 'var(--warn)' : 'var(--good)')}</div>
      <div class="gauge"><label>Rent burden${bur ? ` · ${pct(bur)}% of income` : ''}</label>${bar(Math.min(1, bur / 0.6), bur > 0.4 ? 'var(--bad)' : bur > 0.3 ? 'var(--warn)' : 'var(--accent2)')}</div>
      <div class="grid3"><div><b>${gbp(m.savings)}</b><small>savings</small></div><div><b class="${m.debt > 0 ? 'bad' : ''}">${gbp(m.debt)}</b><small>debt</small></div><div><b>${gbp(m.net)}</b><small>net / yr</small></div></div>${m.arrears ? `<p class="warnline">In arrears: ${gbp(m.arrears)}</p>` : ''}${pr.spiral ? '<p class="warnline">Borrowing at high cost to cover essentials.</p>' : ''}${m.budget ? `<small class="mute">Monthly: income ${gbp(m.budget.income + (m.budget.benefits || 0))}, rent ${gbp(m.budget.rent || 0)}, bills ${gbp((m.budget.energy || 0) + (m.budget.water || 0) + (m.budget.counciltax || 0))}, food ${gbp(m.budget.food || 0)}, spare ${gbp(m.budget.disc || 0)}</small>` : ''}`, false, `${gbp(m.savings)} saved${m.debt > 0 ? ' · ' + gbp(m.debt) + ' debt' : ''}`)}
    ${sec('health', 'Health &amp; wellbeing', `<div class="gauge"><label>Mood</label>${bar((d.health.mood + 1) / 2, 'var(--accent)')}</div><div class="gauge"><label>Stress</label>${bar(wb.stress ?? 0, 'var(--warn)')}</div><div class="kv"><span>General health</span><span>${esc(hs.general || '?')}</span></div><div class="kv"><span>Mental health</span><span>${esc(men.state || 'well')}${men.treated ? ' · in treatment' : ''}${wb.lonely ? ' · lonely' : ''}${wb.grieving ? ' · grieving' : ''}</span></div>${cond ? `<div class="pills">${cond}</div>` : ''}${hs.acute ? `<div class="kv"><span>Currently</span><span>${esc(hs.acute.name || 'unwell')}</span></div>` : ''}`, false, moodW)}
    ${sec('goals', `Goals <small>${d.goals.length}</small>`, goals)}
    ${d.groups.length ? sec('groups', `Groups <small>${d.groups.length}</small>`, d.groups.map((g) => `<div class="kv"><span>${esc(g.name)}</span><span>${esc(lc(g.kind))} · ${g.size}${g.venue ? ' · ' + bl(g.venue.id, g.venue.name) : ''}</span></div>`).join('')) : ''}
    ${sec('rels', `Relationships <small>${d.ties.length}</small>`, `${d.partner ? `<h5>Partner</h5><div class="chiprow"><span class="rc warm">${tie({ id: d.partner.id, name: d.partner.name || 'partner', on: d.partner.kind === 'on' })}<small>${esc(d.partner.st || '')}${d.partner.kind === 'off' ? ' \u00b7 lives elsewhere' : ''}</small></span></div>` : ''}${fam.length ? `<h5>Family</h5><div class="chiprow">${fam.map((t) => `<span class="rc ${tm(t.warmth)}">${tie(t)}<small>${esc(t.r)}</small></span>`).join('')}</div>` : ''}${house.length ? `<h5>Household</h5><div class="chiprow">${house.map((t) => `<span class="rc ${tm(t.warmth)}">${tie(t)}</span>`).join('')}</div>` : ''}${friends.length ? `<h5>Close friends</h5><div class="chiprow">${friends.map((t) => `<span class="rc ${tm(t.warmth)}">${tie(t)}<small>${esc(t.via || '')}</small></span>`).join('')}</div>` : ''}${others.length ? `<h5>Colleagues &amp; neighbours</h5><div class="chiprow">${others.map((t) => `<span class="rc ${tm(t.warmth)}">${tie(t)}<small>${esc(t.k)}</small></span>`).join('')}</div>` : ''}${fric.length ? `<h5>Frictions</h5><div class="chiprow">${fric.map((t) => `<span class="rc cold">${tie(t)}</span>`).join('')}</div>` : ''}${d.ties.length ? '' : '<p class="mute">No ties recorded yet.</p>'}`, false, d.goals.length ? esc(cap(d.goals[0].phrase)) : '')}
    ${sec('story', `Life story <small>${lifeRows.length}</small>`, `<ol class="timeline">${lifeRows.map((l) => `<li class="i${Math.min(5, l.imp || 2)}"><time>${esc(l.date)}</time><span>${esc(l.text)}</span></li>`).join('')}</ol>`, false)}
    ${sec('about', 'About', `<div class="kv"><span>Born</span><span>${esc(d.born || '?')}${d.religion && d.religion !== 'No religion' ? ' · ' + esc(d.religion) : ''}</span></div><div class="kv"><span>Education</span><span>${esc(lc(d.edu))}</span></div><div class="kv"><span>Interests</span><span>${esc((d.interests || []).join(', ') || '—')}</span></div>${d.pets && (d.pets.dogs || d.pets.cats) ? `<div class="kv"><span>Pets</span><span>${d.pets.dogs ? d.pets.dogs + ' dog' + (d.pets.dogs > 1 ? 's' : '') : ''} ${d.pets.cats ? d.pets.cats + ' cat' : ''}</span></div>` : ''}`, false)}`;
  }
  function bizCard(b) {
    const z = b.biz; const notes = (b.notices || []).map((n) => `<div class="notice"><b>${n.camp ? 'Campaign against: ' : 'Planning notice: '}</b>${esc(n.text)}${n.objections != null ? `<small>${n.objections} objection${n.objections === 1 ? '' : 's'} so far</small>` : ''}</div>`).join('');
    if (!z) return notes;
    if (z.status === 'vacant') return `<div class="bizcard vacant"><div class="bz-h"><b class="warn">To let</b><span>${z.months >= 1 ? 'empty for ' + dur(z.months * 30.4) : 'recently vacated'}</span></div>
      <div class="kv"><span>Asking rent</span><span>${z.ask ? gbp(z.ask) + '/mo' : '—'}</span></div><div class="kv"><span>Size</span><span>${z.m2} m²</span></div>${z.was ? `<div class="kv"><span>Last tenant</span><span>${esc(z.was)}</span></div>` : ''}
      <p class="mute small">A unit left empty for long drags down footfall for its neighbours. Someone may take it on: a resident starting up, or a chain.</p></div>${notes}`;
    const d = z.doing, L = z.last, yrs = z.ageMonths != null ? (z.ageMonths >= 24 ? Math.round(z.ageMonths / 12) + ' years' : z.ageMonths + ' months') : '';
    const fresh = b.fresh != null && b.now - b.fresh < 144 * 45;
    return `<div class="bizcard"><div class="bz-h"><b class="${d.tone === 'bad' ? 'bad' : d.tone === 'warn' ? 'warn' : 'good'}">${esc(cap(d.word))}</b><span>${fresh ? 'New · ' : ''}${esc(z.kind)}${yrs ? ' · trading ' + yrs : ''}</span></div><p class="mute small">${esc(d.why)}${z.hours ? ' Opening hours are reduced.' : ''}</p>
      <div class="kv"><span>Owner</span><span>${z.owner ? pl(z.owner.id, z.owner.name) : esc(z.ownerText || '—')}</span></div>
      <div class="kv"><span>Regulars</span><span>${z.regulars || 'few known'}</span></div>${L ? `<details class="sec sub" data-k="bizfin"><summary>Last month's books</summary><div class="kv"><span>Takings</span><span>${gbp(L.rev)}</span></div><div class="kv"><span>Wages</span><span>${gbp(L.wages)}</span></div><div class="kv"><span>Rent</span><span>${gbp(L.rent)}</span></div><div class="kv"><span>${L.profit >= 0 ? 'Left over' : 'Shortfall'}</span><span class="${L.profit < 0 ? 'bad' : ''}">${gbp(Math.abs(L.profit))}</span></div></details>` : ''}</div>${notes}`;
  }
  function place(b) {
    const P = (a, k) => a.length ? a.map((p) => `<a class="pl chip" data-pid="${p.id}">${esc(p.name)}<small>${esc(p.job || '')}</small></a>`).join('') : `<span class="mute">${k}</span>`;
    const rentBand = b.units && b.units.length ? (() => { const r = b.units.filter((u) => u.rent).map((u) => u.rent); return r.length ? `${gbp(Math.min(...r))}${Math.max(...r) !== Math.min(...r) ? '–' + gbp(Math.max(...r)) : ''}/mo` : null; })() : null;
    return `<button class="back" data-back>&lsaquo; People</button><div class="bhead"><h2>${esc(b.name)}</h2><div class="sub">${esc(lc(b.tpl || b.arch || b.type))}${b.cat ? ' · ' + esc(lc(b.cat)) : ''}${b.year ? ' · built ' + b.year : ''}</div><div class="sub dim">${esc(b.address)}</div></div>
      ${bizCard(b)}
      ${b.hours != null ? `<div class="now"><div class="act"><b class="${b.open ? 'good' : 'bad'}">${b.open ? 'Open now' : 'Closed'}</b> · ${esc(b.hours)}</div></div>` : ''}
      <div class="grid3"><div><b>${b.inside.length}</b><small>inside now</small></div><div><b>${b.residents.length}</b><small>live here</small></div><div><b>${b.employees.length}</b><small>work here</small></div></div>
      ${b.owner ? `<div class="kv"><span>Owner / landlord</span><span>${pl(b.owner.id, b.owner.name)}</span></div>` : ''}${rentBand ? `<div class="kv"><span>Rent band</span><span>${rentBand}</span></div>` : ''}${b.capacity ? `<div class="kv"><span>Capacity</span><span>${b.capacity}</span></div>` : ''}
      ${b.units && b.units.length ? sec('units', `Homes <small>${b.units.length}</small>`, b.units.map((u) => `<div class="kv"><span>${u.bedrooms} bed · ${esc(lc(u.tenure))}</span><span>${u.vacant ? '<b class="warn">vacant</b>' : ''}${u.rent ? ' ' + gbp(u.rent) : ''}</span></div>`).join('')) : ''}
      ${sec('inside', `Inside now <small class="hint">${b.inside.length}</small>`, `<div class="chips2">${P(b.inside, 'nobody')}</div>`, true)}${sec('res', `Residents <small class="hint">${b.residents.length}</small>`, `<div class="chips2">${P(b.residents, 'none')}</div>`, false)}${b.employees.length ? sec('emp', `Staff <small class="hint">${b.employees.length}</small>`, `<div class="chips2">${P(b.employees, 'none')}</div>`, false) : ''}`;
  }
  function paint() {
    const s = store.s;
    if (s.selected != null && s.detail && s.detail.id === s.selected) {
      const d = s.detail; const first = mode !== 'person' || lastKey !== 'p' + d.id; const st = root.scrollTop; mode = 'person'; lastKey = 'p' + d.id;
      const keepOpen = {}; root.querySelectorAll('details.sec').forEach((x) => { keepOpen[x.dataset.k] = x.open; });
      root.innerHTML = person(d); const cv = root.querySelector('#pcv'); if (cv) { const c = cv.getContext('2d'); c.clearRect(0, 0, 192, 192); try { drawPortrait(c, d.portrait, 0, 0, 192, { bust: true }); } catch (e) { c.fillStyle = '#334'; c.fillRect(0, 0, 192, 192); } }
      if (!first) root.scrollTop = st;
    } else if (s.selected != null) { if (mode !== 'loading' || lastKey !== 'l' + s.selected) { mode = 'loading'; lastKey = 'l' + s.selected; root.innerHTML = '<div class="empty big">Loading…</div>'; } }
    else if (hooks.selB() != null && s.bdetail && s.bdetail.id === hooks.selB()) { const st = root.scrollTop; mode = 'place'; lastKey = 'b' + s.bdetail.id; root.innerHTML = place(s.bdetail); root.scrollTop = st; }
    else if (mode !== 'none') { mode = 'none'; lastKey = ''; root.innerHTML = '<div class="empty big">Tap a person or a building on the map.</div>'; }
  }
  root.addEventListener('click', (e) => {
    if (e.target.closest('#pfollow')) { store.follow(); return; }
    if (e.target.closest('#pshow')) { hooks.show(store.s.selected); return; }
  });
  store.on('detail', paint); store.on('building', paint); store.on('select', () => { mode = 'x'; paint(); }); store.on('follow', () => { if (store.s.detail) { const b = root.querySelector('#pfollow'); if (b) { b.classList.toggle('on', store.s.following); b.textContent = store.s.following ? '◉ Following' : '◎ Follow'; } } });
  hooks.onBuilding(() => { mode = 'x'; paint(); });
}

// ------------------------------------------------------------------ TOWN (stats dashboard)
export function mountTown(el, store) {
  el.innerHTML = '<div id="town" class="scroll"></div>'; const root = el.querySelector('#town'); const open = {};
  root.addEventListener('toggle', (e) => { const d = e.target.closest && e.target.closest('details.sec'); if (d && d.dataset.k) open[d.dataset.k] = d.open; }, true);
  const card = (label, val, sub, series, col, fmt) => `<div class="stat"><div class="sl">${label}</div><div class="sv">${val}</div>${series ? spark(series, { col }) : ''}<div class="ss">${sub || ''}</div></div>`;
  const det = (key, title, hint, inner) => `<details class="sec tcard" data-k="${key}" ${open[key] ? 'open' : ''}><summary>${title}<small class="hint">${hint}</small></summary><div class="tbody">${inner}</div></details>`;
  const kv = (k, v) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  const lvl = (v) => (v >= 0.95 ? ['as normal', ''] : v >= 0.7 ? ['slightly reduced', 'warn'] : v >= 0.45 ? ['reduced', 'warn'] : ['badly cut', 'bad']);
  function highCard(t, ser) {
    const h = t.high; if (!h) return ''; const tot = h.trading + h.vacant || 1;
    const vac = ser.map((x) => x.biz).filter((v) => v != null);
    const units = h.units.length ? h.units.map((u) => `<a class="bl chip2" data-bid="${u.bid}">${esc(u.name.replace(/^TO LET, /, ''))}<small>${u.months >= 1 ? dur(u.months * 30.4) : 'new'}${u.ask ? ' · ' + gbp(u.ask) + '/mo' : ''}</small></a>`).join('') : '<span class="mute">None. Every unit is trading.</span>';
    const ch = h.changes.length ? h.changes.map((c) => `<span class="pill ${c.d > 0 ? 'up' : 'down'}">${c.d > 0 ? '+' : '−'}${Math.abs(c.d)} ${esc(c.label)}</span>`).join('') : '<span class="mute">Same mix of shops as when we started.</span>';
    const news = h.news.length ? `<ul class="plain">${h.news.slice(0, 6).map((n) => `<li><time>${esc(n.date)}</time> ${esc(n.text)}</li>`).join('')}</ul>` : '<p class="mute">No openings or closures yet.</p>';
    return det('high', 'High street', `${h.trading} trading · ${h.vacant} to let`, `${stackBar([{ l: 'trading', v: h.trading, c: '#5fd09a' }, { l: 'to let', v: h.vacant, c: '#8a8478' }])}
      <p class="mute small">${pct(h.vacant / tot)}% of units empty${h.struggling ? ` · ${h.struggling} cutting hours or staff` : ''} · commercial rents ${Math.abs(h.rentIdx - 1) < 0.01 ? 'level with' : (h.rentIdx > 1 ? 'up ' : 'down ') + Math.abs(Math.round((h.rentIdx - 1) * 100)) + '% on'} the start</p>
      ${vac.length > 2 ? `<h5>Empty units over time</h5>${spark(vac, { col: '#c9b27a' })}` : ''}<h5>Empty units</h5><div class="chips2">${units}</div><h5>Mix of shops, change since the start</h5><div class="pills">${ch}</div><h5>Recent changes</h5>${news}`);
  }
  const SG = ['#5bb4ff', '#ffd36b', '#c58bff', '#ff9b6b', '#5fd09a', '#8c9bb0'];
  function safetyCard(t, ser, det0) {
    const sf = t.safety, last = ser.at(-1); if (!sf || !last || !last.cr) return sf ? det('safety', 'Safety', 'collecting data', '<p class="mute">Recorded crime figures start after the first few weeks.</p>') : '';
    const cr = ser.filter((x) => x.cr); const end = cr.at(-1), t12 = end.tick - 365 * 144; let base = cr[0]; for (const x of cr) if (x.tick <= t12) base = x;
    const spanY = Math.max(0.1, (end.tick - base.tick) / (365 * 144)), enough = spanY >= 0.9, sum = (a) => a.reduce((s, v) => s + v, 0);
    const diff = end.cr.map((v, i) => Math.max(0, v - base.cr[i])), total = sum(diff), per = (total / spanY) / Math.max(1, end.pop || 500) * 1000;
    // trend: last six months against the six before (needs a year of history)
    let trend = '';
    if (spanY >= 0.95) { const mid = cr.reduce((m, x) => (Math.abs(x.tick - (end.tick - 182 * 144)) < Math.abs(m.tick - (end.tick - 182 * 144)) ? x : m), cr[0]), a = sum(end.cr) - sum(mid.cr), b = sum(mid.cr) - sum(base.cr); trend = b >= 5 ? (a > b * 1.15 ? 'rising' : a < b * 0.85 ? 'falling' : 'steady') : ''; }
    const fear = cr.map((x) => x.fear), f0 = fear[Math.max(0, fear.length - 14)], fNow = end.fear;
    const deltas = []; for (let i = 1; i < cr.length; i++) deltas.push(sum(cr[i].cr) - sum(cr[i - 1].cr)); const sm = deltas.map((_, i) => sum(deltas.slice(Math.max(0, i - 5), i + 1)) / Math.min(6, i + 1));
    const mx = Math.max(1, ...diff);
    const rows = sf.groups.map((g, i) => `<div class="hbar"><span>${esc(g.label)}</span><i style="width:${(diff[i] / mx) * 100}%;background:${SG[i % SG.length]}"></i><b>${diff[i]}</b></div>`).join('');
    const watch = sf.watches.length ? `<p class="small">Neighbourhood watch: ${sf.watches.map((w) => esc(w.street)).join(', ')}.</p>` : '';
    const pol = sf.police < 0.8 ? 'stretched' : sf.police > 1.15 ? 'well resourced' : 'normal';
    return det('safety', 'Safety', trend ? `recorded crime ${trend}` : `${total} recorded ${enough ? 'this year' : 'so far'}`, `
      <p class="small">Police recorded <b>${total}</b> offences ${enough ? 'in the last 12 months' : `in the first ${Math.max(1, Math.round(spanY * 12))} months`} (about ${per.toFixed(0)} per 1,000 residents a year).${trend ? ' The trend is ' + trend + '.' : ' Not enough history yet for a trend.'}</p>
      ${sm.length > 3 ? `<h5>Recorded crime, smoothed</h5>${spark(sm, { col: '#5bb4ff' })}` : ''}<h5>What was recorded</h5><div class="hbars">${rows}</div>
      <h5>How safe people feel</h5><p class="small">${end.worried}% of residents say they feel quite worried about crime; the average worry level is ${fNow.toFixed(0)}/100${f0 != null && Math.abs(fNow - f0) >= 1.5 ? (fNow > f0 ? ', up' : ', down') + ' on six months ago' : ', about the same as before'}. Feelings of safety often move differently from recorded crime: they follow what people hear and see.</p>
      ${fear.length > 3 ? spark(fear, { col: '#ffd36b' }) : ''}<p class="small">Police capacity: ${pol}.</p>${watch}`);
  }
  function councilCard(t) {
    const c = t.council; if (!c) return '';
    const sv = c.services.map((s) => { const [w, cls] = lvl(s.level); return `<div class="kv"><span>${esc(s.label)}</span><span class="${cls}">${s.detail && s.level < 0.95 ? esc(s.detail) + ' · ' : ''}${w}</span></div>`; }).join('');
    const apps = c.apps.length ? c.apps.map((a) => `<div class="app"><b>${esc(cap(a.name))}</b><small>${esc(a.street)} · ${a.objections} objection${a.objections === 1 ? '' : 's'}${a.supports ? ', ' + a.supports + ' in support' : ''} · decision in ${dur(a.days)}</small></div>`).join('') : '<p class="mute">No applications open.</p>';
    const camps = c.camps.length ? c.camps.map((k) => `<div class="app"><b>${esc(k.name)}</b><small>${k.sign} signatures${k.leader ? ' · led by ' + pl(k.leader.id, k.leader.name) : ''}</small></div>`).join('') : '<p class="mute">No active campaigns.</p>';
    const cut = c.services.some((s) => s.level < 0.95);
    return det('council', 'Council', `${c.nextDays != null ? 'election in ' + dur(c.nextDays) : ''}${c.apps.length ? ' · ' + c.apps.length + ' planning' : ''}${c.camps.length ? ' · ' + c.camps.length + ' campaign' + (c.camps.length > 1 ? 's' : '') : ''}`, `
      <h5>Ward councillors <small>${esc(c.control || '')} borough</small></h5><div class="chips2">${c.cllrs.map((x) => `<span class="chip2">${x.id ? pl(x.id, x.name) : esc(x.name)}<small>${esc(x.party)}</small></span>`).join('')}</div>
      <p class="small">Next election: <b>${esc(c.next)}</b>${c.last ? `. Last time (${esc(c.last.date)}) turnout was ${c.last.turnout}% and ${esc(c.last.top)} won.` : ''}</p>
      <h5>Services${cut ? ' <small>some have been cut</small>' : ''}</h5>${sv}<h5>Planning applications</h5>${apps}<h5>Campaigns</h5>${camps}${c.cases ? `<p class="small">${c.cases} council case${c.cases > 1 ? 's' : ''} open (bins, potholes, repairs).</p>` : ''}`);
  }
  function render() {
    const S = store.s, ser = S.series, last = ser.at(-1) || {}, dt = S.stats || {}, first = ser[0] || last, T = S.town || {};
    const col = (k) => ser.map((x) => x[k]);
    const seg = dt.segs || {}; const segParts = S.segs.map((g, i) => ({ l: g.label.replace(/ \(.*\)/, ''), v: seg[g.id] || 0, c: segColor(i) })).filter((p) => p.v);
    const ten = dt.tenure || {}; const TC = { owned_outright: '#5fd09a', mortgage: '#4fa97a', private_rent: '#ff9b6b', council: '#5bb4ff', housing_assoc: '#8c7bff', shared_ownership: '#e6c34f' };
    const tenParts = Object.entries(ten).map(([k, v]) => ({ l: lc(k), v, c: TC[k] || '#888' }));
    const lab = dt.labour || {}; const top = root.scrollTop;
    root.innerHTML = `<div class="stats">
      ${card('Residents', last.pop ?? '—', `${dt.households || '?'} households`, col('pop'), '#5bb4ff')}
      ${card('Unemployment', (last.unemp ?? 0).toFixed(1) + '%', `${lab.employed || 0} employed · ${lab.unemployed || 0} looking`, col('unemp'), '#ff9b6b')}
      ${card('Rent burden', (last.burden ?? 0).toFixed(0) + '%', 'of income, renters (mean)', col('burden'), '#ffd36b')}
      ${card('Wellbeing', ((last.mood ?? 0) * 50 + 50).toFixed(0), 'mood index 0–100', col('mood').map((v) => v * 50 + 50), '#5fd09a')}
      ${card('Loneliness', (last.lone ?? 0).toFixed(1) + '%', 'of residents lonely', col('lone'), '#c58bff')}
      ${card('Households pressured', last.pressured ?? 0, 'high cost-of-living stress', col('pressured'), '#ff7a6b')}
    </div>
    <div class="tcards">${highCard(T, ser)}${safetyCard(T, ser)}${councilCard(T)}</div>
    <div class="tally"><div><b>${last.births ?? 0}</b><small>births</small></div><div><b>${last.deaths ?? 0}</b><small>deaths</small></div><div><b>${last.moves ?? 0}</b><small>home moves</small></div><div><b>${(last.vac ?? 0).toFixed(1)}%</b><small>vacant homes</small></div><div><b>${(last.rentIdx ?? 1).toFixed(2)}</b><small>rent index</small></div></div>
    <h4>Age pyramid</h4>${dt.pyr ? pyramid(dt.pyr) : ''}
    <h4>Who lives here</h4>${stackBar(segParts)}
    <h4>How people hold their homes</h4>${stackBar(tenParts)}
    <p class="mute small">Sampled every 14 game days · ${ser.length} samples since ${esc(first.date || '')}</p>`;
    root.scrollTop = top;
  }
  let t = 0; const mark = () => { clearTimeout(t); t = setTimeout(render, 250); };
  const ask = () => { if (el.offsetParent !== null || !store.s.town) store.post({ cmd: 'town' }); };
  store.on('stats', mark); store.on('ready', () => { ask(); mark(); }); store.on('town', mark); render(); setInterval(() => { if (el.offsetParent !== null) ask(); }, 3500);
}

// ------------------------------------------------------------------ PEOPLE directory
export function mountPeople(el, store) {
  el.innerHTML = `<div class="dirbar"><input id="q" type="search" placeholder="Search residents…" autocomplete="off"><select id="sortby"><option value="name">Name</option><option value="age">Age</option><option value="stress">Stress</option></select></div><div class="chips" id="segf"></div><div id="dirlist" class="scroll"></div>`;
  const q = el.querySelector('#q'), list = el.querySelector('#dirlist'), sf = el.querySelector('#segf'), sortby = el.querySelector('#sortby'); let seg = -2;
  function chips() { sf.innerHTML = `<button data-s="-2" class="${seg === -2 ? 'on' : ''}">All</button>` + store.s.segs.map((g, i) => `<button data-s="${i}" class="${seg === i ? 'on' : ''}" style="--c:${segColor(i)}">${esc(g.label.replace(/ \(.*\)/, '').replace('Established ', ''))}</button>`).join(''); }
  sf.onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; seg = +b.dataset.s; chips(); render(); };
  function render() {
    const L = store.s.directory; if (!L) { list.innerHTML = '<p class="empty">Loading…</p>'; return; }
    const term = q.value.trim().toLowerCase(); let rows = L.filter((r) => (seg === -2 || r[3] === seg) && (!term || r[1].toLowerCase().includes(term) || r[4].toLowerCase().includes(term) || r[5].toLowerCase().includes(term)));
    const k = sortby.value; rows.sort((a, b) => (k === 'age' ? b[2] - a[2] : k === 'stress' ? b[6] - a[6] : a[1].localeCompare(b[1])));
    list.innerHTML = `<div class="cnt">${rows.length} resident${rows.length === 1 ? '' : 's'}</div>` + rows.slice(0, 150).map((r) => `<a class="prow" data-pid="${r[0]}"><span class="dot" style="background:${segColor(r[3])}"></span><span class="pn2"><b>${esc(r[1])}</b><small>${r[2]} · ${esc(r[4] || 'not working')}${r[8] ? ' · <em>in the city</em>' : ''}</small></span><span class="addr">${esc(r[5])}</span>${r[6] > 0.5 ? '<i class="warnpip" title="under financial stress"></i>' : ''}</a>`).join('') + (rows.length > 150 ? '<p class="mute small">Showing 150. Narrow the search to see more.</p>' : '');
  }
  q.oninput = render; sortby.onchange = render; store.on('directory', render); store.on('ready', () => { chips(); }); chips();
  return { refresh: () => { store.directoryReq(); } };
}

// ------------------------------------------------------------------ GOD mode
export function mountGod(el, store) {
  el.innerHTML = '<div id="god" class="scroll"></div>'; const root = el.querySelector('#god'); let built = false, openCmd = null;
  const personOpts = () => [...store.s.roster.values()].sort((a, b) => a.last.localeCompare(b.last)).map((r) => `<option value="${r.id}">${esc(r.last)}, ${esc(r.first)}</option>`).join('');
  function field(p, selId) {
    const id = 'gf_' + p.k;
    if (p.type === 'number') return `<label class="gf"><span>${esc(p.label)}</span><div class="rng"><input id="${id}" data-k="${p.k}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.def}"><output>${p.def}${p.unit || ''}</output></div></label>`;
    if (p.type === 'person') return `<label class="gf"><span>${esc(p.label)}</span><select data-k="${p.k}" data-person="1"></select></label>`;
    if (p.type === 'dwelling') return `<label class="gf"><span>${esc(p.label)}</span><select data-k="${p.k}">${store.s.dwellings.map((d) => `<option value="${d.unit}">${esc(d.name)}</option>`).join('')}</select></label>`;
    if (p.type === 'venue') return `<label class="gf"><span>${esc(p.label)}</span><select data-k="${p.k}">${store.s.venueList.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>`;
    if (p.type === 'sector') return `<label class="gf"><span>${esc(p.label)}</span><select data-k="${p.k}">${store.s.sectors.map((d) => `<option value="${d}">${esc(lc(d))}</option>`).join('')}</select></label>`;
    if (p.type === 'goal') return `<label class="gf"><span>${esc(p.label)}</span><select data-k="${p.k}">${store.s.templates.map((d) => `<option value="${d.id}">${esc(cap(d.phrase))}</option>`).join('')}</select></label>`;
    if (p.type === 'select') return `<label class="gf"><span>${esc(p.label)}</span><select data-k="${p.k}">${p.options.map((o) => `<option value="${o.v}" ${o.v === p.def ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
    return `<label class="gf"><span>${esc(p.label)}</span><input data-k="${p.k}" type="text" value="${esc(p.def || '')}"></label>`;
  }
  function build() {
    const g = store.s.god; if (!g) return; built = true;
    const groups = {}; for (const c of g.list) (groups[c.group] ||= []).push(c);
    root.innerHTML = `<p class="mute small">Interventions are typed commands sent through the kernel command queue (logged and replayable). Consequences appear in the Local feed, tagged <em>consequence</em>.</p><div id="godlog"></div>` + Object.entries(groups).map(([gr, cs]) => `<h4>${esc(gr)}</h4>` + cs.map((c) => `<div class="gcmd" data-n="${c.name}"><button class="gh"><i>${esc(c.icon || '★')}</i><span><b>${esc(c.label)}</b><small>${esc(c.desc)}</small></span></button><div class="gbody" hidden>${c.params.map((p) => field(p)).join('')}<button class="go">Do it</button></div></div>`).join('')).join('') + `<h4>All other commands</h4><details class="sec"><summary>${g.other.length} more registered commands (raw JSON)</summary><div class="gbody"><label class="gf"><span>Command</span><select id="rawname">${g.other.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label><label class="gf"><span>Args (JSON)</span><textarea id="rawargs" rows="3">{}</textarea></label><button id="rawgo" class="go">Send</button></div></details>`;
  }
  root.addEventListener('input', (e) => { const r = e.target.closest('input[type=range]'); if (r) { const o = r.parentElement.querySelector('output'); const c = store.s.god.list.find((x) => x.name === r.closest('.gcmd').dataset.n); const p = c.params.find((x) => x.k === r.dataset.k); o.textContent = r.value + (p.unit || ''); } });
  root.addEventListener('click', (e) => {
    const gh = e.target.closest('.gh'); if (gh) { const box = gh.parentElement, body = box.querySelector('.gbody'); body.hidden = !body.hidden; box.classList.toggle('open', !body.hidden); if (!body.hidden) { const sel = store.s.selected; box.querySelectorAll('select[data-person]').forEach((s2, i) => { if (!s2.options.length) s2.innerHTML = personOpts(); if (sel != null && i === 0) s2.value = sel; }); } return; }
    const go = e.target.closest('.go'); if (!go) return;
    if (go.id === 'rawgo') { let a = {}; try { a = JSON.parse(root.querySelector('#rawargs').value || '{}'); } catch (er) { toast('Invalid JSON'); return; } store.god(root.querySelector('#rawname').value, a); return; }
    const box = go.closest('.gcmd'), name = box.dataset.n, args = {}; box.querySelectorAll('[data-k]').forEach((f) => { args[f.dataset.k] = f.type === 'range' ? +f.value : f.value; }); store.god(name, args); go.textContent = 'Sent ✓'; setTimeout(() => { go.textContent = 'Do it'; }, 1400);
  });
  function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2500); }
  store.on('result', (r) => { const log = root.querySelector('#godlog'); if (!log) return; const row = document.createElement('div'); row.className = 'glog ' + (r.ok ? 'ok' : 'err'); row.innerHTML = `<b>${esc(r.name)}</b> ${r.ok ? 'executed' : 'failed'}${r.error ? ': ' + esc(r.error) : ''}${typeof r.result === 'number' ? ` · affected ${r.result}` : ''}<small>${esc(r.date)}</small>`; log.prepend(row); while (log.children.length > 6) log.lastChild.remove(); });
  store.on('ready', build);
  if (store.s.god) build();
}
