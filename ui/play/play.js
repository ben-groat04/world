// Player UI: one status strip on the map (who / where / money / energy / mood) + one "Do" button that opens a single sheet (context actions; phone, people,
// work & home, goals, me behind one tap each) + one choice card at a time for requests. No permanent panels or tabs; reuses #toast and the store.
import { esc } from '../views.js';

const lc = (s) => String(s || '').replace(/_/g, ' ');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const gbp = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const TALK = [['small', 'Small talk'], ['joke', 'Make a joke'], ['news', 'Share news'], ['advise', 'Offer advice'], ['comfort', 'Comfort'], ['complain', 'Complain'], ['confide', 'Confide'], ['gossip', 'Gossip'], ['flirt', 'Flirt'], ['favour', 'Ask a favour'], ['apologise', 'Apologise'], ['argue', 'Argue']];
const FORUM_KINDS = [['question', 'Ask a question'], ['recommend', 'Recommend something'], ['event', 'Announce an event'], ['noise', 'Complain about noise'], ['parking', 'Parking gripe'], ['freebie', 'Offer a freebie']];
const MOOD = (m) => (m > 0.45 ? '😄' : m > 0.15 ? '🙂' : m > -0.15 ? '😐' : m > -0.45 ? '🙁' : '😟');
const warmWord = (l) => (l == null ? 'not met' : l > 0.5 ? 'close' : l > 0.2 ? 'friendly' : l > -0.15 ? 'acquaintance' : 'cool');

export function mountPlay(store, hooks) {
  const $ = (id) => document.getElementById(id);
  const wrap = $('map-wrap');
  const strip = document.createElement('div'); strip.id = 'pstrip'; strip.hidden = true; wrap.appendChild(strip);
  const card = document.createElement('div'); card.id = 'pcard'; card.hidden = true; wrap.appendChild(card);
  const sheet = document.createElement('div'); sheet.id = 'psheet'; sheet.hidden = true; sheet.innerHTML = '<div class="psb"></div>'; document.body.appendChild(sheet);
  const box = sheet.querySelector('.psb');
  const P = { on: false, s: null, view: 'start', arg: null, sec: {}, setup: null, form: { first: '', last: '', age: 27, sex: 'F', seg: 'early_career', budget: 3500, occ: '', unit: null }, msg: '', q: '', dirQ: '' };
  store.s.play = P;
  const post = (m) => store.post({ cmd: 'play', ...m });
  const doit = (name, args) => post({ op: 'do', name, args });
  const resume = () => { if (store.s.tier === 'pause') store.setSpeed('scene'); };
  const toast = (m, ms) => hooks.toast && hooks.toast(m, ms);

  // ---------------------------------------------------------------- strip + card
  function paintStrip() {
    const s = P.s; if (!P.on || !s) { strip.hidden = true; card.hidden = true; return; } strip.hidden = false;
    const en = s.needs.energy ?? 0.7, req = s.reqs.length;
    strip.innerHTML = `<div class="pwho"><b>${esc(s.name)}</b><small>${s.off ? 'Away in the city' : s.loc ? esc(s.loc.name) : 'Out and about'}</small></div>
      <div class="pmini"><span title="Money">${gbp(s.money)}</span><span title="Energy"><i class="pbar"><b style="width:${Math.round(en * 100)}%;background:${en < 0.3 ? 'var(--bad)' : en < 0.55 ? 'var(--warn)' : 'var(--good)'}"></b></i></span><span title="Mood">${MOOD(s.mood)}</span></div>
      <button class="pdo" id="pdo">Do${req ? `<em>${req > 9 ? '9+' : req}</em>` : ''}</button>`;
    const r = s.reqs.find((x) => x.notable), rest = s.reqs.length - (r ? 1 : 0); // one weighty ask at a time; the rest wait in the Do menu inbox
    if (r && sheet.hidden) { card.hidden = false; card.innerHTML = `<div class="pq"><b>${esc(r.from.name)}</b> ${esc(r.text)}${r.why ? `<small>Trying to ${esc(r.why)}</small>` : ''}</div><div class="pa"><button data-ans="yes">Yes</button><button data-ans="maybe">Maybe</button><button data-ans="no">Not now</button></div>${rest ? `<small class="pmore">${rest} more in your inbox</small>` : ''}`; card.dataset.rid = r.id; }
    else card.hidden = true;
  }
  card.addEventListener('click', (e) => { const b = e.target.closest('[data-ans]'); if (!b) return; doit('player.respond', { request: +card.dataset.rid, answer: b.dataset.ans }); card.hidden = true; resume(); });
  strip.addEventListener('click', (e) => { if (e.target.closest('#pdo')) open('menu'); else if (P.s) hooks.select(P.s.pid); });

  // ---------------------------------------------------------------- sheet plumbing
  function open(view, arg) { if (P.on && sheet.hidden && store.s.tier !== 'pause') { P.prevTier = store.s.tier; store.setSpeed('pause'); } P.view = view; P.arg = arg || null; P.msg = ''; sheet.hidden = false; document.body.classList.add('psheet-open'); if (['people', 'phone', 'goals', 'me', 'work', 'places'].includes(view)) post({ op: 'section', name: view }); if (view === 'take') store.directoryReq(); if (view === 'create' && !P.setup) post({ op: 'setup' }); if (view === 'talk') post({ op: 'section', name: 'people' }); paint(); }
  function close() { const was = !sheet.hidden; sheet.hidden = true; if (was && P.on && P.prevTier && store.s.tier === 'pause') { store.setSpeed(P.prevTier); } P.prevTier = null; paintStrip(); document.body.classList.remove('psheet-open'); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  const head = (title, back) => `<div class="psh">${back ? `<button class="pback" data-open="${back}">‹</button>` : ''}<h3>${title}</h3><button class="pclose" data-close>✕</button></div>`;
  const row = (inner, attrs = '') => `<div class="prow2" ${attrs}>${inner}</div>`;
  const btn = (label, attrs, cls = '') => `<button class="pb ${cls}" ${attrs}>${label}</button>`;
  const msg = () => (P.msg ? `<p class="pmsg">${esc(P.msg)}</p>` : '');

  function paint() {
    if (sheet.hidden) return; const s = P.s, sec = P.sec; let h = '';
    const V = P.view;
    if (V === 'start') h = head('Play Larkfield') + `<div class="pbody"><p class="pdim">Live a life here, or just watch. Whatever you do, neighbours react through the same rules as everyone else.</p>
      ${btn('<b>Move to Larkfield</b><small>Create a newcomer and rent a flat</small>', 'data-open="create"', 'big')}${btn('<b>Take over a resident</b><small>Pick anyone already living here</small>', 'data-open="take"', 'big')}${P.on ? btn('<b>Stop playing</b><small>Your person carries on without you</small>', 'data-act="release"', 'big') : ''}${btn('Just watch', 'data-close', 'ghost')}</div>`;
    else if (V === 'create') h = createView();
    else if (V === 'take') h = takeView();
    else if (V === 'menu' && s) h = menuView(s);
    else if (V === 'talk') h = talkView(s);
    else if (V === 'places') h = placesView(sec.places);
    else if (V === 'people') h = peopleView(sec.people);
    else if (V === 'phone') h = phoneView(sec.phone);
    else if (V === 'work') h = workView(sec.work, s);
    else if (V === 'goals') h = goalsView(sec.goals);
    else if (V === 'me') h = meView(sec.me);
    else h = head('Play') + '<p class="pdim">…</p>';
    const keep = box.querySelector('.pbody'); const top = keep ? keep.scrollTop : 0; const focus = document.activeElement && document.activeElement.id;
    box.innerHTML = h; const nb = box.querySelector('.pbody'); if (nb && V === P._last) nb.scrollTop = top; P._last = V;
    if (focus) { const f = box.querySelector('#' + focus); if (f && f.tagName === 'INPUT' && f.type !== 'range') { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { /* ignore */ } } }
  }
  const secOf = (n) => P.sec[n];

  // ---------------------------------------------------------------- views
  function menuView(s) {
    const here = s.here || [], inbox = s.reqs || [];
    const ibx = inbox.length ? `<h5>Waiting for you <small>${inbox.length}</small></h5>${inbox.slice(0, 8).map((r) => `<div class="preq"><div class="pq"><b>${esc(r.from.name)}</b> ${esc(r.text)}${r.why ? `<small>Trying to ${esc(r.why)}</small>` : ''}</div><div class="pa"><button data-ans="yes" data-rid="${r.id}">Yes</button><button data-ans="maybe" data-rid="${r.id}">Maybe</button><button data-ans="no" data-rid="${r.id}">Not now</button></div></div>`).join('')}${inbox.length > 8 ? `<p class="pdim">${inbox.length - 8} more; they lapse if ignored.</p>` : ''}` : '';
    return head(esc(s.name)) + `<div class="pbody">
      <p class="pthought">${esc(s.thought || '')}</p>${ibx}
      ${here.length ? `<h5>Here with you</h5><div class="pchips">${here.map((x) => `<button class="pchip" data-talk="${x.id}">${esc(x.name)}<small>${x.known ? warmWord(x.l) : 'stranger'}</small></button>`).join('')}</div>` : `<p class="pdim">${s.off ? 'You are away in the city.' : 'Nobody else is here right now.'}</p>`}
      <div class="pgrid">${btn('📍<span>Go somewhere</span>', 'data-open="places"')}${btn('☕<span>Stay a while</span>', 'data-act="stay"')}${btn('🌆<span>Evening in the city</span>', 'data-act="out"')}${btn('⏭<span>Let time pass</span>', 'data-act="skip2"')}${btn(s.canSleep ? '🌙<span>Sleep till morning</span>' : '⏩<span>Until morning</span>', 'data-act="morning"')}
        ${btn('📱<span>Phone</span>', 'data-open="phone"')}${btn('☺<span>People</span>', 'data-open="people"')}${btn('💼<span>Work &amp; home</span>', 'data-open="work"')}${btn('⚑<span>Goals &amp; groups</span>', 'data-open="goals"')}${btn('◉<span>Me &amp; the street</span>', 'data-open="me"')}</div>${msg()}</div>`;
  }
  function talkView(s) {
    const id = P.arg; const x = (s.here || []).find((q) => q.id === id) || (secOf('people') && secOf('people').here.find((q) => q.id === id));
    if (!x) return head('Talk', 'menu') + '<div class="pbody"><p class="pdim">They have gone.</p></div>';
    return head(esc(x.name), 'menu') + `<div class="pbody"><p class="pdim">${x.known ? `You are ${warmWord(x.l)}.` : 'You have not really met.'} ${x.age ? x.age + ' · ' : ''}${esc(x.job || '')}</p>
      <div class="pgrid2">${TALK.map(([k, l]) => btn(l, `data-say="${k}" data-to="${id}"`)).join('')}</div>
      <h5>Money</h5><div class="pgrid2">${[20, 50, 100].map((n) => btn(`Lend £${n}`, `data-lend="${n}" data-to="${id}"`)).join('')}</div>
      <div class="pgrid2">${btn('Message them', `data-msg="${id}"`)}${btn('View profile', `data-pid="${id}" data-close`)}</div>${msg()}</div>`;
  }
  function placesView(pl) {
    if (!pl) return head('Go somewhere', 'menu') + '<p class="pdim pbody">Loading…</p>';
    const q = P.q.toLowerCase(), home = s0() && s0().home;
    const list = pl.places.filter((p) => !q || p.name.toLowerCase().includes(q) || p.tpl.includes(q)).slice(0, 60);
    return head('Go somewhere', 'menu') + `<div class="pbody"><input id="pq" type="search" placeholder="Search places…" value="${esc(P.q)}" autocomplete="off">
      <div class="plist">${btn('🏠 Home', 'data-goto="home"', 'row')}${list.map((p) => btn(`${esc(p.name)}<small>${esc(p.tpl)}</small>`, `data-goto="${p.id}"`, 'row')).join('')}</div></div>`;
  }
  const s0 = () => P.s;
  function peopleView(d) {
    if (!d) return head('People', 'menu') + '<p class="pdim pbody">Loading…</p>';
    return head('People you know', 'menu') + `<div class="pbody">${d.ties.length ? d.ties.map((t) => row(`<span class="pn"><a class="pl" data-pid="${t.id}" data-close>${esc(t.name)}</a><small>${esc(lc(t.rel || t.k))}</small></span><span class="pw"><i style="width:${Math.round(Math.max(0, Math.min(1, (t.warm + 1) / 2)) * 100)}%"></i></span>${btn('Message', `data-msg="${t.id}"`, 'sm')}`)).join('') : '<p class="pdim">You do not know anyone here yet. Go somewhere with people in it and talk to them.</p>'}${msg()}</div>`;
  }
  function phoneView(d) {
    if (!d) return head('Phone', 'menu') + '<p class="pdim pbody">Loading…</p>';
    return head('Phone', 'menu') + `<div class="pbody"><h5>Post</h5><div class="pgrid2">${btn('Post online', 'data-post="feed"')}</div><div class="pgrid2">${FORUM_KINDS.slice(0, 4).map(([k, l]) => btn(l, `data-post="forum" data-kind="${k}"`)).join('')}</div>${msg()}
      <h5>Chats</h5>${d.chats.length ? d.chats.map((c) => `<div class="pchat"><b>${esc(cap(lc(c.name)))}</b><small>${c.n} people</small>${c.last.map((m) => `<p><i>${esc(m.au.split(' ')[0])}</i> ${esc(m.text)}</p>`).join('')}</div>`).join('') : '<p class="pdim">No group chats yet.</p>'}
      <h5>Neighbourhood forum</h5>${d.forum.length ? d.forum.map((f) => `<div class="pchat"><b>${esc(f.au)}</b><small>${esc(f.kind)} · ${esc(f.date)}${f.replies ? ` · ${f.replies} replies` : ''}</small><p>${esc(f.text)}</p></div>`).join('') : '<p class="pdim">Nothing yet.</p>'}
      <h5>Message someone</h5><div class="pchips">${d.contacts.map((c) => `<button class="pchip" data-msg="${c.id}">${esc(c.name)}</button>`).join('') || '<span class="pdim">No contacts yet.</span>'}</div></div>`;
  }
  function workView(d, s) {
    if (!d) return head('Work & home', 'menu') + '<p class="pdim pbody">Loading…</p>';
    const j = d.job, emp = j && j.activity === 'employed';
    return head('Work &amp; home', 'menu') + `<div class="pbody">${msg()}<h5>Work</h5>${emp ? row(`<span class="pn"><b>${esc(cap(lc(j.occ)))}</b><small>${j.hours} h/week · ${gbp(j.pay)}/yr</small></span>${btn('Quit', 'data-act="quit"', 'sm bad')}`) : `<p class="pdim">You are looking for work. Employers take one to three weeks to reply, weigh your qualifications and experience against other jobseekers, and senior posts go to people already working up to them.</p>${(d.pending || []).map((x) => `<p class="pdim">⏳ ${esc(cap(lc(x.occ)))}: reply in ${x.daysLeft ? x.daysLeft + ' days' : 'a day or so'}</p>`).join('')}`}
      <div class="plist">${d.openings.slice(0, 24).map((o) => `<button class="pb row" data-apply="${esc(o.occ)}" data-bid="${o.bid ?? ''}">${esc(cap(o.label))}<small>${esc(o.where || '')} · ${o.count} opening${o.count > 1 ? 's' : ''}</small></button>`).join('')}</div>
      <h5>Money</h5><div class="pgrid2">${btn('Borrow £200 (bank)', 'data-borrow="200" data-kind="bank"')}${btn('Borrow £200 (family)', 'data-borrow="200" data-kind="family"')}${btn('Payday loan £150', 'data-borrow="150" data-kind="payday"')}</div>
      <h5>Home${s && s.home ? ` <small>${esc(s.home.tenure)} · ${gbp(s.home.rent)}/mo</small>` : ''}</h5><div class="plist">${d.vac.length ? d.vac.map((u) => `<button class="pb row" data-rent="${u.id}">${esc(u.address)}<small>${u.beds} bed · ${gbp(u.rent)}/mo · tap to move</small></button>`).join('') : '<p class="pdim">Nothing to rent right now.</p>'}</div></div>`;
  }
  function goalsView(d) {
    if (!d) return head('Goals & groups', 'menu') + '<p class="pdim pbody">Loading…</p>';
    return head('Goals &amp; groups', 'menu') + `<div class="pbody">${msg()}<h5>Your goals</h5>${d.goals.length ? d.goals.map((g) => row(`<span class="pn"><b>${esc(cap(g.phrase))}</b><small>${esc(g.status)}${g.line ? ' · ' + esc(g.line) : ''}</small></span>${btn('Drop', `data-drop="${g.id}"`, 'sm')}`)).join('') : '<p class="pdim">No goals yet. Pick something to aim for; your person will work at it in their spare time.</p>'}
      <label class="pl2">Adopt a goal<select id="padopt"><option value="">Choose…</option>${d.templates.map((t) => `<option value="${esc(t.id)}">${esc(cap(t.phrase))}</option>`).join('')}</select></label>
      <h5>Groups</h5>${d.groups.map((g) => row(`<span class="pn"><b>${esc(g.name)}</b><small>${esc(g.kind)} · ${g.size} members</small></span>`)).join('') || '<p class="pdim">You are not in any group.</p>'}
      ${d.open.length ? `<div class="plist">${d.open.map((g) => `<button class="pb row" data-join="${g.id}">Join ${esc(g.name)}<small>${esc(g.kind)} · ${g.size} members</small></button>`).join('')}</div>` : ''}
      <div class="pgrid2"><input id="pgname" placeholder="Start a group: name" autocomplete="off">${btn('Found it', 'data-found="club"')}</div></div>`;
  }
  function meView(d) {
    if (!d) return head('Me & the street', 'menu') + '<p class="pdim pbody">Loading…</p>';
    const r = d.rep;
    return head('Me &amp; the street', 'menu') + `<div class="pbody"><h5>How the neighbourhood sees you</h5>
      <p>${r.known ? `<b>${r.known}</b> people know you: <b>${r.warm}</b> warm, <b>${r.cool}</b> cool.` : 'Nobody here really knows you yet.'}</p>${r.beliefs.length ? `<p class="pdim">What people think they know: ${r.beliefs.map((b) => `${esc(b.text)} (${b.n})`).join(', ')}.</p>` : ''}
      <h5>You</h5><p>${gbp(d.money.cash)} in hand${d.money.debt ? `, ${gbp(d.money.debt)} debt` : ''}${d.money.arrears ? `, ${gbp(d.money.arrears)} arrears` : ''}. Health ${Math.round(d.health.score * 100)}%${d.health.conditions.length ? ' · ' + esc(d.health.conditions.join(', ')) : ''}.</p>
      <label class="pl2"><input type="checkbox" id="ppause" ${P.pauseOn !== false ? 'checked' : ''}> Pause when something happens to me</label>
      <h5>Recently</h5>${d.log.length ? d.log.map((l) => `<p class="plog">${esc(l.text)}</p>`).join('') : '<p class="pdim">Nothing yet.</p>'}${btn('Stop playing', 'data-act="release"', 'ghost')}</div>`;
  }
  function createView() {
    const f = P.form, su = P.setup, segs = store.s.segs || [];
    if (!su) return head('New in town', 'start') + '<p class="pdim pbody">Finding flats…</p>';
    const seg = segs.find((g) => g.id === f.seg);
    return head('New in town', 'start') + `<div class="pbody pform">
      <div class="pgrid2"><input id="cf-first" placeholder="First name" value="${esc(f.first)}" autocomplete="off"><input id="cf-last" placeholder="Surname" value="${esc(f.last)}" autocomplete="off"></div>
      <label class="pl2">Age <output>${f.age}</output><input id="cf-age" type="range" min="18" max="75" value="${f.age}"></label>
      <div class="pchips">${btn('Woman', 'data-sex="F"', f.sex === 'F' ? 'on' : '')}${btn('Man', 'data-sex="M"', f.sex === 'M' ? 'on' : '')}</div>
      <h5>Background</h5><div class="pchips">${segs.filter((g) => !/older_longterm|local_business/.test(g.id)).map((g) => `<button class="pchip ${f.seg === g.id ? 'on' : ''}" data-seg="${g.id}">${esc(g.label.replace(/ \(.*\)/, ''))}</button>`).join('')}</div>${seg ? `<p class="pdim">${esc(seg.blurb || '')}</p>` : ''}
      <label class="pl2">Savings to bring <output>${gbp(f.budget)}</output><input id="cf-budget" type="range" min="800" max="20000" step="100" value="${f.budget}"></label>
      <label class="pl2">Apply first for<select id="cf-occ"><option value="">Look for work after I arrive</option>${su.jobs.map((j) => `<option value="${esc(j.occ)}" ${f.occ === j.occ ? 'selected' : ''}>${esc(cap(j.label))}${j.pay ? ' · ' + gbp(j.pay) + '/yr' : ''}</option>`).join('')}</select></label>
      <h5>Home</h5><div class="plist">${su.homes.map((u) => `<button class="pb row ${f.unit === u.id ? 'on' : ''}" data-unit="${u.id}">${esc(u.address)}<small>${u.beds} bed · ${gbp(u.rent)}/mo · ${esc(lc(u.tenure))}</small></button>`).join('')}</div>${msg()}
      ${btn('Move in', 'data-act="create"', 'go')}</div>`;
  }
  function takeView() {
    const L = store.s.directory; if (!L) return head('Take over', 'start') + '<p class="pdim pbody">Loading…</p>';
    const t = P.dirQ.toLowerCase(), rows = L.filter((r) => r[2] >= 16 && !r[8] && (!t || r[1].toLowerCase().includes(t) || r[4].toLowerCase().includes(t))).slice(0, 60);
    return head('Take over a resident', 'start') + `<div class="pbody"><input id="tq" type="search" placeholder="Search name or job…" value="${esc(P.dirQ)}" autocomplete="off"><div class="plist">${rows.map((r) => `<button class="pb row" data-take="${r[0]}">${esc(r[1])}<small>${r[2]} · ${esc(r[4] || 'no job')} · ${esc(r[5])}</small></button>`).join('')}</div></div>`;
  }

  // ---------------------------------------------------------------- events
  sheet.addEventListener('click', (e) => {
    const t = e.target.closest('button,a'); if (!t) return;
    if (t.dataset.ans && t.dataset.rid) { doit('player.respond', { request: +t.dataset.rid, answer: t.dataset.ans }); const r = P.s && P.s.reqs.findIndex((x) => x.id === +t.dataset.rid); if (r >= 0) P.s.reqs.splice(r, 1); paint(); return; }
    if (t.matches('[data-close]')) { if (t.matches('[data-pid]')) hooks.select(+t.dataset.pid); close(); return; }
    if (t.dataset.open) { open(t.dataset.open); return; }
    if (t.dataset.talk) { open('talk', +t.dataset.talk); return; }
    if (t.dataset.say) { doit('player.talk', { to: +t.dataset.to, act: t.dataset.say }); return; }
    if (t.dataset.lend) { doit('player.lend', { to: +t.dataset.to, amount: +t.dataset.lend }); return; }
    if (t.dataset.msg) { doit('player.message', { to: +t.dataset.msg }); return; }
    if (t.dataset.goto) { const p = P.s; if (t.dataset.goto === 'home') doit('player.goTo', { bid: P.s.homeId, hours: 3, label: 'Heading home' }); else doit('player.goTo', { bid: +t.dataset.goto, hours: 3 }); close(); resume(); void p; return; }
    if (t.dataset.apply) { doit('player.apply', { occ: t.dataset.apply, bid: t.dataset.bid === '' ? undefined : +t.dataset.bid }); return; }
    if (t.dataset.borrow) { doit('player.borrow', { amount: +t.dataset.borrow, kind: t.dataset.kind }); return; }
    if (t.dataset.rent) { doit('player.rent', { unit: +t.dataset.rent }); return; }
    if (t.dataset.drop) { doit('player.drop', { goal: +t.dataset.drop }); setTimeout(() => post({ op: 'section', name: 'goals' }), 200); return; }
    if (t.dataset.join) { doit('player.join', { group: +t.dataset.join }); setTimeout(() => post({ op: 'section', name: 'goals' }), 200); return; }
    if (t.dataset.found) { const n = box.querySelector('#pgname').value.trim(); if (n) { doit('player.found', { kind: 'club', name: n }); setTimeout(() => post({ op: 'section', name: 'goals' }), 200); } return; }
    if (t.dataset.post) { doit('player.post', { forum: t.dataset.post === 'forum', kind: t.dataset.kind }); return; }
    if (t.dataset.take) { post({ op: 'take', pid: +t.dataset.take }); close(); return; }
    if (t.dataset.sex) { P.form.sex = t.dataset.sex; paint(); return; }
    if (t.dataset.seg) { P.form.seg = t.dataset.seg; paint(); return; }
    if (t.dataset.unit) { P.form.unit = +t.dataset.unit; paint(); return; }
    const a = t.dataset.act; if (!a) return;
    if (a === 'stay') { doit('player.stay', { hours: 1 }); close(); resume(); }
    else if (a === 'out') { doit('player.goOut', { hours: 4 }); close(); resume(); }
    else if (a === 'skip2') { post({ op: 'skip', hours: 2 }); close(); }
    else if (a === 'morning') { post({ op: 'skip', what: 'morning' }); close(); }
    else if (a === 'quit') doit('player.quit', {});
    else if (a === 'release') { post({ op: 'release' }); close(); }
    else if (a === 'create') { const f = P.form; if (!f.unit) { P.msg = 'Choose a home first.'; paint(); return; } post({ op: 'create', args: { first: f.first || 'Alex', last: f.last || 'Newcomer', age: f.age, sex: f.sex, seg: f.seg, budget: f.budget, unit: f.unit, occ: f.occ || null } }); }
  });
  sheet.addEventListener('input', (e) => {
    const t = e.target, f = P.form;
    if (t.id === 'cf-first') f.first = t.value; else if (t.id === 'cf-last') f.last = t.value;
    else if (t.id === 'cf-age') { f.age = +t.value; t.parentElement.querySelector('output').textContent = t.value; }
    else if (t.id === 'cf-budget') { f.budget = +t.value; t.parentElement.querySelector('output').textContent = gbp(+t.value); }
    else if (t.id === 'pq') { P.q = t.value; paint(); } else if (t.id === 'tq') { P.dirQ = t.value; paint(); }
  });
  sheet.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'cf-occ') P.form.occ = t.value;
    else if (t.id === 'padopt' && t.value) { doit('player.adopt', { tpl: t.value }); t.value = ''; setTimeout(() => post({ op: 'section', name: 'goals' }), 250); }
    else if (t.id === 'ppause') { P.pauseOn = t.checked; post({ op: 'pauseOnEvent', on: t.checked }); }
  });

  // ---------------------------------------------------------------- store wiring
  store.on('play.state', (m) => { P.s = m.s; paintStrip(); if (!sheet.hidden && ['menu', 'talk'].includes(P.view)) paint(); });
  store.on('play.setup', (m) => { P.setup = m; if (!P.form.unit && m.homes[0]) P.form.unit = m.homes[0].id; paint(); });
  store.on('play.section', (m) => { P.sec[m.name] = m; paint(); });
  store.on('directory', () => { if (P.view === 'take') paint(); });
  store.on('play.on', (m) => { P.on = true; document.body.classList.add('playing'); P.pid = m.pid; P.homeId = null; close(); hooks.select(m.pid); hooks.follow(); hooks.peek && hooks.peek(); toast('You are playing. Tap <b>Do</b> to act.', 3000); });
  store.on('play.off', () => { P.on = false; document.body.classList.remove('playing'); P.s = null; paintStrip(); });
  store.on('play.result', (m) => { P.msg = m.text || ''; toast(esc(m.text || ''), 3200); if (!sheet.hidden) { if (P.view === 'work') post({ op: 'section', name: 'work' }); paint(); } });
  store.on('play.moment', (m) => { toast(`⏸ <b>${esc(m.why)}</b>`, 6000); });
  store.on('ready', () => { post({ op: 'state' }); });
  const zp = $('z-play'); if (zp) zp.addEventListener('click', () => { if (P.on) open('menu'); else open('start'); });
  return { open, close, take: (id) => post({ op: 'take', pid: id }), get on() { return P.on; } };
}
