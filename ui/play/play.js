// Player UI: one status strip on the map (who / doing / money / energy / mood) + one "Do" button that opens a single sheet. The sheet opens on "Here & now"
// (where you are, who is here, the few sensible things to do), with tabs for Go / Phone / Life admin / Goals & groups / Me. Every action answers in a feedback card
// (what you did, what happened and why, what to try next). A short skippable intro and a "Things to try" checklist (ticked by real events) help a first-time player.
import { esc } from '../views.js';

const lc = (s) => String(s || '').replace(/_/g, ' ');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const gbp = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const TALK_EASY = [['small', 'Small talk'], ['joke', 'Make a joke'], ['news', 'Share news']];
const TALK_CLOSE = [['advise', 'Offer advice'], ['comfort', 'Comfort'], ['confide', 'Confide'], ['flirt', 'Flirt'], ['favour', 'Ask a favour']];
const TALK_EDGY = [['complain', 'Complain'], ['gossip', 'Gossip'], ['apologise', 'Apologise'], ['argue', 'Argue']];
const FORUM_KINDS = [['question', 'Ask a question'], ['recommend', 'Recommend something'], ['event', 'Announce an event'], ['noise', 'Complain about noise'], ['parking', 'Parking gripe'], ['freebie', 'Offer a freebie']];
const MOOD = (m) => (m > 0.45 ? '😄' : m > 0.15 ? '🙂' : m > -0.15 ? '😐' : m > -0.45 ? '🙁' : '😟');
const warmWord = (l) => (l == null ? 'not met' : l > 0.5 ? 'close' : l > 0.2 ? 'friendly' : l > -0.15 ? 'acquaintance' : 'cool');
const TABS = [['menu', 'Here & now'], ['places', 'Go somewhere'], ['phone', 'Phone'], ['work', 'Life admin'], ['goals', 'Goals & groups'], ['me', 'Me']];
const TAB_OF = { menu: 'menu', talk: 'menu', places: 'places', phone: 'phone', people: 'phone', dating: 'phone', work: 'work', goals: 'goals', me: 'me' };
const INTRO = [
  ['Welcome to Larkfield', 'You are a newcomer. The map shows the neighbourhood and the little figures are your neighbours. Your character is highlighted, and the bar at the top of the map shows where they are and what they are doing.'],
  ['You do not have to do anything', 'Your character lives on autopilot: they sleep, eat, shop and go to work on their own routine while the clock runs. You only step in when you want to change something, like talking to someone or applying for a job.'],
  ['Tap Do to act', 'Do opens on what is happening right here: who is around and a few sensible things to try. Time pauses while it is open, so there is no rush. Close it and life carries on.'],
  ['Things to try', 'Meet your neighbours. Find a job. Join a group. Make a friend. A small checklist in Do ticks them off as they really happen. Start by saying hello to someone.'],
];

export function mountPlay(store, hooks) {
  const $ = (id) => document.getElementById(id);
  const wrap = $('map-wrap');
  const strip = document.createElement('div'); strip.id = 'pstrip'; strip.hidden = true; wrap.appendChild(strip);
  const card = document.createElement('div'); card.id = 'pcard'; card.hidden = true; wrap.appendChild(card);
  const sheet = document.createElement('div'); sheet.id = 'psheet'; sheet.hidden = true; sheet.innerHTML = '<div class="psb"></div>'; document.body.appendChild(sheet);
  const box = sheet.querySelector('.psb');
  const intro = document.createElement('div'); intro.id = 'pintro'; intro.hidden = true; document.body.appendChild(intro);
  const P = { on: false, s: null, view: 'start', arg: null, sec: {}, setup: null, form: { first: '', last: '', age: 27, sex: 'F', seg: 'early_career', budget: 3500, occ: '', unit: null }, fb: null, open: {}, biz: { unit: null, type: 'coffee_shop', loan: true }, workBid: null, caseKind: 'bins', party: 'Independent', q: '', dirQ: '', goalPick: null, introStep: 0, seenNotes: 0 };
  store.s.play = P;
  const post = (m) => store.post({ cmd: 'play', ...m });
  const doit = (name, args) => post({ op: 'do', name, args });
  const resume = () => { if (store.s.tier === 'pause') store.setSpeed('scene'); };
  const toast = (m, ms) => hooks.toast && hooks.toast(m, ms);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const refresh = (name) => setTimeout(() => post({ op: 'section', name }), 150);

  // ---------------------------------------------------------------- strip + card
  function paintStrip() {
    const s = P.s; if (!P.on || !s) { strip.hidden = true; card.hidden = true; return; } strip.hidden = false;
    const en = s.needs.energy ?? 0.7, req = s.reqs.length;
    strip.innerHTML = `<div class="pwho"><b>${esc(s.name)}</b><small>${s.now ? esc(s.now.time) + ' · ' : ''}${s.off ? 'Away in the city' : esc(s.doing || (s.loc ? s.loc.name : 'Out and about'))}</small></div>
      <div class="pmini"><span title="Money">${gbp(s.money)}</span><span title="Energy"><i class="pbar"><b style="width:${Math.round(en * 100)}%;background:${en < 0.3 ? 'var(--bad)' : en < 0.55 ? 'var(--warn)' : 'var(--good)'}"></b></i></span><span title="Mood">${MOOD(s.mood)}</span></div>
      <button class="pdo" id="pdo">Do${req ? `<em>${req > 9 ? '9+' : req}</em>` : ''}</button>`;
    const r = s.reqs.find((x) => x.notable), rest = s.reqs.length - (r ? 1 : 0); // one weighty ask at a time; the rest wait in the Do menu inbox
    if (r && sheet.hidden && intro.hidden) { card.hidden = false; card.innerHTML = `<div class="pq"><b>${esc(r.from.name)}</b> ${esc(r.text)}${r.why ? `<small>Trying to ${esc(r.why)}</small>` : ''}</div><div class="pa"><button data-ans="yes">Yes</button><button data-ans="maybe">Maybe</button><button data-ans="no">Not now</button></div>${rest ? `<small class="pmore">${rest} more in your inbox</small>` : ''}`; card.dataset.rid = r.id; }
    else card.hidden = true;
  }
  card.addEventListener('click', (e) => { const b = e.target.closest('[data-ans]'); if (!b) return; doit('player.respond', { request: +card.dataset.rid, answer: b.dataset.ans }); card.hidden = true; resume(); });
  strip.addEventListener('click', (e) => { if (e.target.closest('#pdo')) open('menu'); else if (P.s) hooks.select(P.s.pid); });

  // ---------------------------------------------------------------- intro (first run, skippable)
  function showIntro(step) {
    if (step == null) step = 0; P.introStep = step; if (step >= INTRO.length) { endIntro(); return; }
    if (intro.hidden && store.s.tier !== 'pause') { P.introTier = store.s.tier; store.setSpeed('pause'); }
    const [t, b] = INTRO[step], last = step === INTRO.length - 1;
    intro.hidden = false; card.hidden = true;
    intro.innerHTML = `<div class="pib"><div class="pidots">${INTRO.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div><h3>${esc(t)}</h3><p>${esc(b)}</p>
      <div class="pia"><button class="pb ghost" data-intro="skip">Skip</button><button class="pb go" data-intro="next">${last ? 'Start playing' : 'Next'}</button></div></div>`;
  }
  function endIntro() { intro.hidden = true; lsSet('lf_play_intro', '1'); if (P.introTier && store.s.tier === 'pause') store.setSpeed(P.introTier); P.introTier = null; paintStrip(); }
  intro.addEventListener('click', (e) => { const b = e.target.closest('[data-intro]'); if (!b) return; if (b.dataset.intro === 'skip') endIntro(); else showIntro(P.introStep + 1); });

  // ---------------------------------------------------------------- sheet plumbing
  function open(view, arg) {
    if (P.on && sheet.hidden && store.s.tier !== 'pause') { P.prevTier = store.s.tier; store.setSpeed('pause'); }
    if (view !== P.view || (arg || null) !== P.arg) P.fb = P.fbKeep ? P.fb : null; P.fbKeep = false;
    P.view = view; P.arg = arg || null; sheet.hidden = false; document.body.classList.add('psheet-open');
    if (['people', 'phone', 'goals', 'me', 'work', 'places', 'dating'].includes(view)) post({ op: 'section', name: view === 'people' || view === 'dating' ? (view === 'people' ? 'people' : 'phone') : view });
    if (view === 'take') store.directoryReq(); if (view === 'create' && !P.setup) post({ op: 'setup' }); if (view === 'talk') { post({ op: 'section', name: 'people' }); post({ op: 'section', name: 'phone' }); }
    paint();
  }
  function close() { const was = !sheet.hidden; sheet.hidden = true; if (was && P.on && P.prevTier && store.s.tier === 'pause') { store.setSpeed(P.prevTier); if (!P.tip) { P.tip = 1; toast('Time is running again. Your character follows their routine until you act.', 3500); } } P.prevTier = null; P.fb = null; paintStrip(); document.body.classList.remove('psheet-open'); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  const head = (title, back) => `<div class="psh">${back ? `<button class="pback" data-open="${back}" aria-label="Back">‹</button>` : ''}<h3>${title}</h3><button class="pclose" data-close aria-label="Close">✕</button></div>`;
  const tabs = (v) => `<nav class="ptabs">${TABS.map(([k, l]) => `<button data-open="${k}" class="${TAB_OF[v] === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
  const row = (inner, attrs = '') => `<div class="prow2" ${attrs}>${inner}</div>`;
  const btn = (label, attrs, cls = '') => `<button class="pb ${cls}" ${attrs}>${label}</button>`;
  const fbHtml = () => {
    const f = P.fb; if (!f) return '';
    const plan = f.plan && f.plan.length ? `<ol class="pplan">${f.plan.map((x) => `<li class="${x.now ? 'now' : ''}"><b>${esc(x.text)}</b> <span class="${x.mine ? 'you' : 'auto'}">${x.mine ? 'you can help' : 'automatic'}</span><small>${esc(x.hint)}</small></li>`).join('')}</ol>` : '';
    const next = f.next && f.next.length ? `<div class="pfn"><span>Next:</span>${f.next.map((n) => `<button data-open="${n.open}">${esc(n.label)}</button>`).join('')}</div>` : '';
    return `<div class="pfb ${f.ok ? 'ok' : 'no'}" role="status"><button class="pfx" data-fbx aria-label="Dismiss">✕</button><b>${esc(f.title || f.text || '')}</b>${f.body ? `<p>${esc(f.body)}</p>` : ''}${plan}${next}</div>`;
  };
  const shell = (v, title, body) => head(title) + tabs(v) + `<div class="pbody">${fbHtml()}${body}</div>`;

  function paint() {
    if (sheet.hidden) return; const s = P.s, sec = P.sec; let h = '';
    const V = P.view;
    if (V === 'start') h = head('Play Larkfield') + `<div class="pbody">${fbHtml()}<p class="pdim">Live a life here, or just watch. Whatever you do, neighbours react through the same rules as everyone else.</p>
      ${btn('<b>Move to Larkfield</b><small>Create a newcomer and rent a flat</small>', 'data-open="create"', 'big')}${btn('<b>Take over a resident</b><small>Pick anyone already living here</small>', 'data-open="take"', 'big')}${P.on ? btn('<b>Stop playing</b><small>Your person carries on without you</small>', 'data-act="release"', 'big') : ''}${btn('Just watch', 'data-close', 'ghost')}</div>`;
    else if (V === 'create') h = createView();
    else if (V === 'take') h = takeView();
    else if (V === 'menu' && s) h = menuView(s);
    else if (V === 'talk' && s) h = talkView(s);
    else if (V === 'places') h = placesView(sec.places);
    else if (V === 'people') h = peopleView(sec.people);
    else if (V === 'phone') h = phoneView(sec.phone);
    else if (V === 'dating') h = datingView(sec.phone);
    else if (V === 'work') h = workView(sec.work, s);
    else if (V === 'goals') h = goalsView(sec.goals);
    else if (V === 'me') h = meView(sec.me, s);
    else h = head('Play') + '<p class="pdim pbody">…</p>';
    const keep = box.querySelector('.pbody'); const top = keep ? keep.scrollTop : 0; const focus = document.activeElement && document.activeElement.id;
    box.innerHTML = h; const nb = box.querySelector('.pbody'); if (nb && V === P._last) nb.scrollTop = top; P._last = V;
    const act = box.querySelector('.ptabs .on'); if (act && act.scrollIntoView) { const tb = act.parentElement; tb.scrollLeft = act.offsetLeft - 12; }
    if (focus) { const f = box.querySelector('#' + focus); if (f && f.tagName === 'INPUT' && f.type !== 'range') { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { /* ignore */ } } }
  }
  const loading = (v, t) => shell(v, t, '<p class="pdim">Loading…</p>');

  // ---------------------------------------------------------------- views
  function personRow(x) { return `<button class="pperson" data-talk="${x.id}"><span><b>${esc(x.name)}</b><small>${esc(x.line || '')}</small></span><i>Talk ›</i></button>`; }
  function menuView(s) {
    const here = s.here || [], inbox = s.reqs || [], acts = s.acts || [], things = s.things || [], doneN = things.filter((t) => t.done).length;
    const ibx = inbox.length ? `<h5>Waiting for you <small>${inbox.length}</small></h5>${inbox.slice(0, 6).map((r) => `<div class="preq"><div class="pq"><b>${esc(r.from.name)}</b> ${esc(r.text)}${r.why ? `<small>Trying to ${esc(r.why)}</small>` : ''}</div><div class="pa"><button data-ans="yes" data-rid="${r.id}">Yes</button><button data-ans="maybe" data-rid="${r.id}">Maybe</button><button data-ans="no" data-rid="${r.id}">Not now</button></div></div>`).join('')}${inbox.length > 6 ? `<p class="pdim">${inbox.length - 6} more; they lapse if ignored.</p>` : ''}` : '';
    const where = s.off ? 'Away in the city' : s.loc ? esc(s.loc.name) : 'Out and about';
    const actHtml = acts.map((a) => `<button class="pact" data-a="${a.k}" ${a.id != null ? `data-talk="${a.id}"` : ''} ${a.bid != null ? `data-bid="${a.bid}"` : ''} ${a.dest ? `data-dest="${esc(a.dest)}"` : ''} ${a.item ? `data-item="${a.item}"` : ''}><b>${esc(a.label)}</b><small>${esc(a.sub || '')}</small></button>`).join('');
    const lately = (s.lately || []).length ? `<h5>Lately</h5>${s.lately.map((l) => `<p class="plog"><small>${l.ago ? l.ago + 'd ago' : 'today'}</small> ${esc(l.text)}</p>`).join('')}` : '';
    const pend = (s.pendingJobs || []).length ? `<p class="pdim">Applications out: ${s.pendingJobs.map((x) => `${esc(x.label)} (${x.daysLeft ? x.daysLeft + ' days' : 'any day'})`).join('; ')}.</p>` : '';
    return head(esc(s.name)) + tabs('menu') + `<div class="pbody">
      <div class="pnow"><b>${s.now ? esc(s.now.day + ' ' + s.now.time) : ''}</b> · ${where}<small>${esc(s.doing || s.thought || '')}</small></div>
      ${fbHtml()}${ibx}
      <h5>Here &amp; now</h5>
      ${here.length ? `<div class="pwho2"><small>Who is here</small>${here.slice(0, 8).map(personRow).join('')}</div>` : `<p class="pdim">${s.off ? 'You are away in the city.' : 'Nobody else is here right now.'}</p>`}
      ${actHtml ? `<div class="pacts"><small>Good things to do now</small>${actHtml}</div>` : ''}
      <details class="pthings" ${doneN < things.length ? 'open' : ''}><summary>Things to try <em>${doneN}/${things.length}</em></summary>${things.map((t) => `<div class="pthing ${t.done ? 'done' : ''}"><i>${t.done ? '✓' : ''}</i><span><b>${esc(t.label)}</b>${t.prog && !t.done ? ` <em>${esc(t.prog)}</em>` : ''}<small>${t.done ? 'Done' : esc(t.hint)}</small></span></div>`).join('')}</details>
      ${pend}${lately}
      <p class="pclock">⏸ Time is paused while this menu is open. When you close it, your character carries on with their routine (sleep, meals, work) by themselves until you act again.</p>
      <button class="plink" data-introshow>How does this work?</button></div>`;
  }
  function talkView(s) {
    const id = P.arg; const x = (s.here || []).find((q) => q.id === id) || (P.sec.people && P.sec.people.here.find((q) => q.id === id));
    if (!x) return head('Talk', 'menu') + `<div class="pbody">${fbHtml()}<p class="pdim">They have gone. Open Here &amp; now to see who is around.</p></div>`;
    const datable = ((P.sec.phone && P.sec.phone.datable) || []).some((d) => d.id === id);
    return head(esc(x.name), 'menu') + `<div class="pbody">${fbHtml()}<p class="pdim">${esc(x.line || '')}</p>
      <p class="phelp">${x.known ? 'You have met. Closer topics work better the better you know each other.' : 'You have not really met. Start with small talk: it is the safe way to break the ice.'}</p>
      <h5>Easy</h5><div class="pgrid2">${TALK_EASY.map(([k, l]) => btn(l, `data-say="${k}" data-to="${id}"`)).join('')}</div>
      <h5>Closer ${x.known ? '' : '<small>(better once you know them)</small>'}</h5><div class="pgrid2">${TALK_CLOSE.map(([k, l]) => btn(l, `data-say="${k}" data-to="${id}"`)).join('')}</div>
      <h5>Tense</h5><div class="pgrid2">${TALK_EDGY.map(([k, l]) => btn(l, `data-say="${k}" data-to="${id}"`)).join('')}</div>
      ${datable ? `<h5>Romance</h5><div class="pgrid2">${btn('Ask them out', `data-askout="${id}"`)}</div>` : ''}
      <h5>Other</h5><div class="pgrid2">${btn('Message them', `data-msg="${id}"`)}${btn('View profile', `data-pid="${id}" data-close`)}${[20, 50].map((n) => btn(`Lend £${n}`, `data-lend="${n}" data-to="${id}"`)).join('')}</div></div>`;
  }
  function placesView(pl) {
    if (!pl) return loading('places', 'Go somewhere');
    const q = P.q.toLowerCase(), list = pl.places.filter((p) => !q || p.name.toLowerCase().includes(q) || p.tpl.includes(q)).slice(0, 60);
    return shell('places', 'Go somewhere', `<p class="phelp">Pick a place and your character walks there while time runs. Cafés, the pub, the library and community centre are where you meet people.</p><input id="pq" type="search" placeholder="Search places…" value="${esc(P.q)}" autocomplete="off">
      <div class="pgrid2">${btn('☕ Stay a while', 'data-act="stay"')}${btn('🌆 Evening in the city', 'data-act="out"')}${btn('⏭ Let 2 hours pass', 'data-act="skip2"')}${btn(P.s && P.s.canSleep ? '🌙 Sleep till morning' : '⏩ Until morning', 'data-act="morning"')}</div>
      <div class="plist">${btn('🏠 Home', 'data-goto="home"', 'row')}${list.map((p) => btn(`${esc(p.name)}<small>${esc(p.tpl)}</small>`, `data-goto="${p.id}"`, 'row')).join('')}</div>`);
  }
  function peopleView(d) {
    if (!d) return loading('people', 'People you know');
    return shell('people', 'People you know', `<button class="plink" data-open="phone">‹ Phone</button>${d.ties.length ? d.ties.map((t) => row(`<span class="pn"><a class="pl" data-pid="${t.id}" data-close>${esc(t.name)}</a><small>${esc(lc(t.rel || t.k))} · ${warmWord(t.warm)}</small></span><span class="pw"><i style="width:${Math.round(Math.max(0, Math.min(1, (t.warm + 1) / 2)) * 100)}%"></i></span>${btn('Message', `data-msg="${t.id}"`, 'sm')}`)).join('') : '<p class="pdim">You do not know anyone here yet. Go somewhere with people in it (the café, the pub, the community centre) and say hello, or join a group.</p>'}`);
  }
  function phoneView(d) {
    if (!d) return loading('phone', 'Phone');
    const dt = d.dating || { on: false, matches: [] };
    return shell('phone', 'Phone', `<button class="pb big" data-open="dating"><b>💘 Dating</b><small>${dt.on ? `Profile live · ${dt.matches.length} match${dt.matches.length === 1 ? '' : 'es'}` : 'Set up a profile, get matches over days, or ask out someone you know'}</small></button>
      <button class="pb big" data-open="people"><b>☺ People you know</b><small>Everyone you have met, and how well</small></button>
      <h5>Post</h5><div class="pgrid2">${btn('Post online', 'data-post="feed"')}${FORUM_KINDS.slice(0, 4).map(([k, l]) => btn(l, `data-post="forum" data-kind="${k}"`)).join('')}</div>
      <h5>Message someone</h5><div class="pchips">${d.contacts.map((c) => `<button class="pchip" data-msg="${c.id}">${esc(c.name)}</button>`).join('') || '<span class="pdim">No contacts yet. Meet people first.</span>'}</div>
      <h5>Chats</h5>${d.chats.length ? d.chats.map((c) => `<div class="pchat"><b>${esc(cap(lc(c.name)))}</b><small>${c.n} people</small>${c.last.map((m) => `<p><i>${esc(m.au.split(' ')[0])}</i> ${esc(m.text)}</p>`).join('')}</div>`).join('') : '<p class="pdim">No group chats yet. They appear as you get to know people.</p>'}
      <h5>Neighbourhood forum</h5>${d.forum.length ? d.forum.map((f) => `<div class="pchat"><b>${esc(f.au)}</b><small>${esc(f.kind)} · ${esc(f.date)}${f.replies ? ` · ${f.replies} replies` : ''}</small><p>${esc(f.text)}</p></div>`).join('') : '<p class="pdim">Nothing yet.</p>'}`);
  }
  function datingView(d) {
    if (!d) return loading('dating', 'Dating');
    const dt = d.dating || { on: false, matches: [], pool: 0 }, known = d.datable || [];
    const matchRows = dt.matches.map((m) => row(`<span class="pn"><b>${esc(m.name)}</b><small>${m.age} · ${esc(m.job || '')} · matched ${m.daysAgo ? m.daysAgo + ' days ago' : 'today'}${m.taken ? ' · now seeing someone' : ''}</small></span>${m.taken ? '' : btn('Message', `data-msg="${m.id}"`, 'sm') + btn('Ask out', `data-askout="${m.id}"`, 'sm')}`)).join('');
    const knownRows = known.filter((k) => !dt.matches.some((m) => m.id === k.id)).map((m) => row(`<span class="pn"><b>${esc(m.name)}</b><small>${m.age} · ${esc(m.job || '')} · ${esc(lc(m.rel))} · ${warmWord(m.l)}</small></span>${btn('Ask out', `data-askout="${m.id}"`, 'sm')}`)).join('');
    return shell('dating', 'Dating', `<button class="plink" data-open="phone">‹ Phone</button>
      <p class="phelp">Two ways in. <b>The app</b>: switch on a profile and matches turn up over days. Message a match to get chatting, then ask them out. <b>People you know</b>: you can only ask out someone you have really met, who is single and could plausibly be interested.</p>
      <h5>Dating app</h5>${dt.on ? `<p>Your profile is live. About ${dt.pool} people nearby are on the app. New matches arrive every few days and the game pauses to tell you.</p>${btn('Pause my profile', 'data-datingoff', 'ghost')}` : `<p class="pdim">You are not on the app yet.</p>${btn('Set up a dating profile', 'data-dating', 'go')}`}
      <h5>Your matches <small>${dt.matches.length}</small></h5>${matchRows || `<p class="pdim">${dt.on ? 'No matches yet. They arrive over days: carry on with your life and check back.' : 'Turn on your profile to start getting matches.'}</p>`}
      <h5>People you know who could be a match</h5>${knownRows || '<p class="pdim">Nobody you know fits yet. You have not met anyone single and compatible. Say hello to people at the pub or a club, or use the app.</p>'}`);
  }
  // Town life: start a business, work at a local firm, safety and council. Collapsed by default so the sheet stays short.
  const CASES = { bins: 'Missed bins', pothole: 'Pothole', flytip: 'Fly-tipping', damp: 'Damp in a council home', repair: 'Council home repair', noise: 'Noise' };
  const pdet = (key, title, hint, inner) => `<details class="pdet" data-k="${key}" ${P.open[key] ? 'open' : ''}><summary>${title}${hint ? `<small>${hint}</small>` : ''}</summary><div class="pdb">${inner}</div></details>`;
  function adminView(A, s) {
    if (!A) return '';
    const B = P.biz, unit = A.units && A.units.find((u) => u.bid === B.unit) ? B.unit : (s && s.loc && A.units && A.units.find((u) => u.bid === s.loc.id) ? s.loc.id : null);
    const units = (A.units || []).map((u) => `<button class="pb row ${unit === u.bid ? 'sel' : ''}" data-bizunit="${u.bid}">${esc(u.name.replace(/^TO LET, /, ''))}<small>${u.m2} m² · asking ${gbp(u.ask)}/mo · ${u.months >= 1 ? 'empty ' + u.months + ' month' + (u.months > 1 ? 's' : '') : 'just vacated'}</small></button>`).join('') || '<p class="pdim">Every unit on the high street is trading right now.</p>';
    const start = pdet('biz', 'Start a business here', A.units && A.units.length ? `${A.units.length} unit${A.units.length > 1 ? 's' : ''} to let` : 'no units to let', `<p class="phelp">Pick an empty unit and a type. Set-up (fit-out, deposit, stock) usually runs to tens of thousands of pounds and comes from your savings (${gbp(A.money)}) plus a start-up loan of up to £25,000 that is repaid from takings. Rent, wages and business rates are paid monthly; most new businesses lose money at first.</p><div class="plist">${units}</div>
      <label class="pl2">What kind<select id="pbtype">${(A.formats || []).map((f) => `<option value="${esc(f.id)}" ${B.type === f.id ? 'selected' : ''}>${esc(cap(f.label))}</option>`).join('')}</select></label>
      <label class="pl2 ck"><input type="checkbox" id="pbloan" ${B.loan ? 'checked' : ''}> Use a start-up loan</label>${btn(unit ? 'Open for business' : 'Choose a unit first', `data-bizgo="${unit || ''}" ${unit ? '' : 'disabled'}`, 'go')}`);
    const work = pdet('workat', 'Work at a local business', '', `<p class="phelp">Shops, cafes, pubs and salons hire rarely and only when they have a vacancy. You can apply to any one; for set job lists see Work above.</p><label class="pl2">Business<select id="pwork">${(A.firms || []).map((f) => `<option value="${f.bid}" ${+P.workBid === f.bid ? 'selected' : ''}>${esc(f.name)} · ${esc(f.kind)} (${esc(f.doing)})</option>`).join('')}</select></label>${btn('Apply to work there', 'data-workat', 'go')}`);
    const v = A.victim;
    const safety = pdet('safety', 'Safety and council', '', `${v && v.n ? `<p class="phelp">You have been a victim of crime ${v.n} time${v.n > 1 ? 's' : ''}. Report anything that has not been reported: it creates a crime number and helps police see patterns.</p>` : '<p class="phelp">If something happens to you, you can report it here. In an emergency call 999.</p>'}
      <div class="pgrid2">${btn('Report a crime<small>to the police</small>', 'data-cmd="crime.report"')}${btn('Join the street watch<small>with neighbours</small>', 'data-cmd="crime.joinWatch"')}${btn('Secure my home<small>locks and lights</small>', 'data-cmd="crime.lockUp"')}</div>
      <h5>Complain to the council</h5><div class="pgrid2"><select id="pcase">${(A.cases || []).map((k) => `<option value="${k}" ${P.caseKind === k ? 'selected' : ''}>${esc(CASES[k] || lc(k))}</option>`).join('')}</select>${btn('Send complaint', 'data-complain')}</div>
      <h5>Object to a planning application</h5>${(A.apps || []).length ? `<div class="plist">${A.apps.map((a) => `<button class="pb row" data-object="${a.id}"><b>Object: ${esc(cap(a.name))}</b><small>${esc(a.street)} · ${a.objections} objection${a.objections === 1 ? '' : 's'} so far</small></button>`).join('')}</div>` : '<p class="pdim">No applications open for comment.</p>'}
      <h5>Join a campaign</h5>${(A.camps || []).length ? `<div class="plist">${A.camps.map((c) => `<button class="pb row" data-joincamp="${c.id}"><b>Join: ${esc(c.name)}</b><small>${c.sign} signatures</small></button>`).join('')}</div>` : '<p class="pdim">No campaigns running. They start when enough neighbours share a grievance.</p>'}
      <h5>Stand as a councillor</h5><p class="phelp">The next ward election is ${esc(A.nextDate || 'not yet set')}. Three seats; you need to be known and trusted.</p><div class="pgrid2"><select id="pparty">${(A.parties || []).map((x) => `<option ${P.party === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>${btn('Stand', 'data-stand')}</div>`);
    return `<h5>Town</h5>${start}${work}${safety}<h5 class="sp">Jobs</h5>`;
  }
  function workView(d, s) {
    if (!d) return loading('work', 'Life admin');
    const j = d.job, emp = j && j.activity === 'employed';
    const jobs = `<h5>Work</h5>${emp ? row(`<span class="pn"><b>${esc(j.label || cap(lc(j.occ)))}</b><small>${j.hours} h/week · ${gbp(j.pay)}/yr gross</small></span>${btn('Quit', 'data-act="quit"', 'sm bad')}`) : `<p class="phelp">You are looking for work. Pick a job to apply (up to three at once). Employers take one to three weeks to reply and weigh your qualifications and experience against other jobseekers; senior posts go to people already working up to them. Pay shown is the typical gross range for the job.</p>${(d.pending || []).map((x) => `<p class="pdim">⏳ ${esc(x.label)}: reply in ${x.daysLeft ? x.daysLeft + ' days' : 'a day or so'}</p>`).join('')}`}
      <div class="plist">${d.openings.map((o) => `<button class="pb row" data-apply="${esc(o.occ)}" data-bid="${o.bid ?? ''}"><b>${esc(o.label)}</b><small>${esc(o.band)} a year · ${esc(o.hours)} · ${o.at ? esc(o.at) : esc(o.where)}${o.sub ? ' · ' + esc(o.sub) : ''}</small></button>`).join('')}</div>`;
    const money = `<h5>Money</h5><p class="pdim">${s ? gbp(s.money) + ' in hand' + (s.debt ? `, ${gbp(s.debt)} debt` : '') : ''}. Borrowing adds to your debt; repaying comes out of income.</p><div class="pgrid2">${btn('Bank loan £200<small>needs income</small>', 'data-borrow="200" data-kind="bank"')}${btn('Family £200<small>if relatives can</small>', 'data-borrow="200" data-kind="family"')}${btn('Payday loan £150<small>fast but costly</small>', 'data-borrow="150" data-kind="payday"')}</div>`;
    const home = `<h5>Home${s && s.home ? ` <small>${esc(s.home.tenure)} · ${gbp(s.home.rent)}/mo</small>` : ''}</h5><p class="pdim">Moving costs a deposit and first month. Pick a flat to move in.</p><div class="plist">${d.vac.length ? d.vac.map((u) => `<button class="pb row" data-rent="${u.id}">${esc(u.address)}<small>${u.beds} bed · ${gbp(u.rent)}/mo · tap to move</small></button>`).join('') : '<p class="pdim">Nothing to rent right now.</p>'}</div>`;
    return shell('work', 'Life admin', adminView(d.admin, s) + jobs + money + home);
  }
  function goalsView(d) {
    if (!d) return loading('goals', 'Goals & groups');
    const pick = P.goalPick && d.templates.find((t) => t.id === P.goalPick);
    const preview = pick ? `<div class="pfb ok"><b>${esc(cap(pick.phrase))}</b><p>${pick.by.length ? `Ways it can happen: ${esc(pick.by.join(', '))}.` : ''} ${pick.days ? `Usually takes ${pick.days[0]}–${pick.days[1]} days.` : ''} Your character plans the steps and works through them in spare time; the plan is shown when you start. You can help by doing the steps yourself, and you can drop it any time.</p><div class="pfn">${btn('Start this goal', `data-adopt="${esc(pick.id)}"`, 'sm')}${btn('Cancel', 'data-adoptx', 'sm')}</div></div>` : '';
    const goals = d.goals.length ? d.goals.map((g) => `<div class="pgoal"><div class="pgh"><span><b>${esc(cap(g.phrase))}</b><small>${esc(g.status)}</small></span>${btn('Drop', `data-drop="${g.id}"`, 'sm')}</div>${g.plan && g.plan.length ? `<ol class="pplan">${g.plan.map((x) => `<li class="${x.now ? 'now' : ''} ${x.state === 'done' ? 'done' : ''}"><b>${esc(x.text)}</b> <span class="${x.mine ? 'you' : 'auto'}">${x.mine ? 'you can help' : 'automatic'}</span><small>${esc(x.hint)}${x.note ? ' · ' + esc(x.note) : ''}</small></li>`).join('')}</ol>` : '<p class="pdim">Working out how to start.</p>'}</div>`).join('') : '<p class="pdim">No goals yet. Pick something to aim for. Your character works at it in spare time, and you can speed it up by doing steps yourself.</p>';
    return shell('goals', 'Goals & groups', `<h5>Your goals</h5>${goals}
      <label class="pl2">Pick a goal<select id="padopt"><option value="">Choose…</option>${d.templates.map((t) => `<option value="${esc(t.id)}" ${P.goalPick === t.id ? 'selected' : ''}>${esc(cap(t.phrase))}</option>`).join('')}</select></label>${preview}
      <p class="pdim">Looking for a partner? Use Phone &gt; Dating: it works from the people you actually know and the app.</p>
      <h5>Your groups</h5>${d.groups.map((g) => row(`<span class="pn"><b>${esc(g.name)}</b><small>${esc(g.kind)} · ${g.size} members</small></span>`)).join('') || '<p class="pdim">You are not in any group. Joining one is the easiest way to meet people: you end up in the same places at the same times.</p>'}
      ${d.open.length ? `<h5>Groups you could join</h5><div class="plist">${d.open.map((g) => `<button class="pb row" data-join="${g.id}"><b>Join ${esc(g.name)}</b><small>${esc(g.kind)} · ${g.size} members${g.at ? ' · ' + esc(g.at) : ''}</small></button>`).join('')}</div>` : ''}
      <div class="pgrid2"><input id="pgname" placeholder="Start a group: name" autocomplete="off">${btn('Found it', 'data-found="club"')}</div>`);
  }
  function meView(d, s) {
    if (!d) return loading('me', 'Me & the street');
    const r = d.rep;
    return shell('me', 'Me & the street', `<h5>How the neighbourhood sees you</h5>
      <p>${r.known ? `<b>${r.known}</b> people know you: <b>${r.warm}</b> warm, <b>${r.cool}</b> cool.` : 'Nobody here really knows you yet. Talk to people to change that.'}</p>${r.beliefs.length ? `<p class="pdim">What people think they know: ${r.beliefs.map((b) => `${esc(b.text)} (${b.n})`).join(', ')}.</p>` : ''}
      <h5>You</h5><p>${gbp(d.money.cash)} in hand${d.money.debt ? `, ${gbp(d.money.debt)} debt` : ''}${d.money.arrears ? `, ${gbp(d.money.arrears)} arrears` : ''}. Health ${Math.round(d.health.score * 100)}%${d.health.conditions.length ? ' · ' + esc(d.health.conditions.join(', ')) : ''}.</p>
      <label class="pl2"><input type="checkbox" id="ppause" ${P.pauseOn !== false ? 'checked' : ''}> Pause when something happens to me</label>
      <h5>Recently</h5>${d.log.length ? d.log.map((l) => `<p class="plog">${esc(l.text)}</p>`).join('') : '<p class="pdim">Nothing yet.</p>'}<button class="plink" data-introshow>How does this work?</button>${btn('Stop playing', 'data-act="release"', 'ghost')}`);
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
      <label class="pl2">Apply first for<select id="cf-occ"><option value="">Look for work after I arrive</option>${su.jobs.map((j) => `<option value="${esc(j.occ)}" ${f.occ === j.occ ? 'selected' : ''}>${esc(j.label)}${j.band ? ' · ' + esc(j.band) + ' a year' : ''}</option>`).join('')}</select></label>
      <p class="pdim">Applying is optional: you will hear back in a week or two, and can apply for more later.</p>
      <h5>Home</h5><div class="plist">${su.homes.map((u) => `<button class="pb row ${f.unit === u.id ? 'on' : ''}" data-unit="${u.id}">${esc(u.address)}<small>${u.beds} bed · ${gbp(u.rent)}/mo · ${esc(lc(u.tenure))}</small></button>`).join('')}</div>${fbHtml()}
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
    if (t.matches('[data-fbx]')) { P.fb = null; paint(); return; }
    if (t.matches('[data-introshow]')) { close(); showIntro(0); return; }
    if (t.dataset.a) { // suggested action on Here & now
      const a = t.dataset.a;
      if (a === 'talk') { open('talk', +t.dataset.talk); return; }
      if (a === 'buy') { doit('player.buy', { item: t.dataset.item }); return; }
      if (a === 'home') { doit('player.goTo', { bid: P.s.homeId, hours: 3, label: 'Heading home' }); closeKeep(); return; }
      if (a === 'work') { if (t.dataset.bid) doit('player.goTo', { bid: +t.dataset.bid, hours: 4, label: 'Heading to work' }); else doit('player.goOut', { dest: t.dataset.dest || undefined, hours: 6 }); closeKeep(); return; }
      if (a === 'stay') { doit('player.stay', { hours: 1 }); closeKeep(); return; }
      if (a === 'morning') { post({ op: 'skip', what: 'morning' }); close(); return; }
    }
    if (t.dataset.open) { P.fbKeep = false; open(t.dataset.open); return; }
    if (t.dataset.talk) { open('talk', +t.dataset.talk); return; }
    if (t.dataset.say) { doit('player.talk', { to: +t.dataset.to, act: t.dataset.say }); return; }
    if (t.dataset.lend) { doit('player.lend', { to: +t.dataset.to, amount: +t.dataset.lend }); return; }
    if (t.dataset.msg) { doit('player.message', { to: +t.dataset.msg }); return; }
    if (t.dataset.askout) { doit('player.askOut', { to: +t.dataset.askout }); return; }
    if (t.matches('[data-dating]')) { doit('player.datingProfile', { on: true }); return; }
    if (t.matches('[data-datingoff]')) { doit('player.datingProfile', { on: false }); return; }
    if (t.dataset.goto) { if (t.dataset.goto === 'home') doit('player.goTo', { bid: P.s.homeId, hours: 3, label: 'Heading home' }); else doit('player.goTo', { bid: +t.dataset.goto, hours: 3 }); closeKeep(); return; }
    if (t.dataset.apply) { doit('player.apply', { occ: t.dataset.apply, bid: t.dataset.bid === '' ? undefined : +t.dataset.bid }); return; }
    if (t.dataset.borrow) { doit('player.borrow', { amount: +t.dataset.borrow, kind: t.dataset.kind }); return; }
    if (t.dataset.bizunit) { P.biz.unit = +t.dataset.bizunit; paint(); return; }
    if (t.dataset.bizgo !== undefined && t.matches('[data-bizgo]')) { if (t.dataset.bizgo) doit('business.start', { unit: +t.dataset.bizgo, type: P.biz.type, loan: P.biz.loan }); return; }
    if (t.matches('[data-workat]')) { const sel = box.querySelector('#pwork'); if (sel && sel.value) doit('business.workAt', { bid: +sel.value }); return; }
    if (t.dataset.cmd) { doit(t.dataset.cmd, {}); return; }
    if (t.matches('[data-complain]')) { doit('civic.complain', { kind: P.caseKind }); return; }
    if (t.dataset.object) { doit('civic.object', { app: +t.dataset.object }); return; }
    if (t.dataset.joincamp) { doit('civic.joinCampaign', { id: +t.dataset.joincamp }); return; }
    if (t.matches('[data-stand]')) { doit('civic.standCouncillor', { party: P.party }); return; }
    if (t.dataset.rent) { doit('player.rent', { unit: +t.dataset.rent }); return; }
    if (t.dataset.drop) { doit('player.drop', { goal: +t.dataset.drop }); return; }
    if (t.dataset.adopt) { doit('player.adopt', { tpl: t.dataset.adopt }); P.goalPick = null; return; }
    if (t.matches('[data-adoptx]')) { P.goalPick = null; paint(); return; }
    if (t.dataset.join) { doit('player.join', { group: +t.dataset.join }); return; }
    if (t.dataset.found) { const n = box.querySelector('#pgname').value.trim(); if (n) doit('player.found', { kind: 'club', name: n }); else { P.fb = { ok: false, title: 'Name your group first', body: 'Type a name above, like "Tuesday walkers", then tap Found it.' }; paint(); } return; }
    if (t.dataset.post) { doit('player.post', { forum: t.dataset.post === 'forum', kind: t.dataset.kind }); return; }
    if (t.dataset.take) { post({ op: 'take', pid: +t.dataset.take }); close(); return; }
    if (t.dataset.sex) { P.form.sex = t.dataset.sex; paint(); return; }
    if (t.dataset.seg) { P.form.seg = t.dataset.seg; paint(); return; }
    if (t.dataset.unit) { P.form.unit = +t.dataset.unit; paint(); return; }
    const a = t.dataset.act; if (!a) return;
    if (a === 'stay') { doit('player.stay', { hours: 1 }); closeKeep(); }
    else if (a === 'out') { doit('player.goOut', { hours: 4 }); closeKeep(); }
    else if (a === 'skip2') { post({ op: 'skip', hours: 2 }); close(); }
    else if (a === 'morning') { post({ op: 'skip', what: 'morning' }); close(); }
    else if (a === 'quit') doit('player.quit', {});
    else if (a === 'release') { post({ op: 'release' }); close(); }
    else if (a === 'create') { const f = P.form; if (!f.unit) { P.fb = { ok: false, title: 'Choose a home first', body: 'Tap one of the flats above. The rent is monthly and you need a deposit and first month from your savings.' }; paint(); return; } post({ op: 'create', args: { first: f.first || 'Alex', last: f.last || 'Newcomer', age: f.age, sex: f.sex, seg: f.seg, budget: f.budget, unit: f.unit, occ: f.occ || null } }); }
  });
  // actions that leave the sheet: show the answer as a toast and let time run
  function closeKeep() { const fb = P.fb; P.pendingToast = true; close(); void fb; resume(); }
  sheet.addEventListener('toggle', (e) => { const d = e.target; if (d && d.classList && d.classList.contains('pdet')) P.open[d.dataset.k] = d.open; }, true);
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
    else if (t.id === 'pbtype') P.biz.type = t.value; else if (t.id === 'pbloan') P.biz.loan = t.checked; else if (t.id === 'pwork') P.workBid = t.value; else if (t.id === 'pcase') P.caseKind = t.value; else if (t.id === 'pparty') P.party = t.value;
    else if (t.id === 'padopt') { P.goalPick = t.value || null; P.fb = null; paint(); }
    else if (t.id === 'ppause') { P.pauseOn = t.checked; post({ op: 'pauseOnEvent', on: t.checked }); }
  });

  // ---------------------------------------------------------------- store wiring
  store.on('play.state', (m) => { P.s = m.s; paintStrip(); if (!sheet.hidden && ['menu', 'talk'].includes(P.view)) paint(); });
  store.on('play.setup', (m) => { P.setup = m; if (!P.form.unit && m.homes[0]) P.form.unit = m.homes[0].id; paint(); });
  store.on('play.section', (m) => { P.sec[m.name] = m; paint(); });
  store.on('directory', () => { if (P.view === 'take') paint(); });
  store.on('play.on', (m) => { P.on = true; document.body.classList.add('playing'); P.pid = m.pid; P.homeId = null; close(); hooks.select(m.pid); hooks.follow(); hooks.peek && hooks.peek(); if (!lsGet('lf_play_intro')) showIntro(0); else toast('You are playing. Tap <b>Do</b> to act.', 3000); });
  store.on('play.off', () => { P.on = false; document.body.classList.remove('playing'); P.s = null; endIntro(); paintStrip(); });
  store.on('play.result', (m) => {
    P.fb = { ok: m.ok, title: m.title || m.text || '', body: m.body || '', plan: m.plan, next: m.next };
    const n = m.name || ''; if (/apply|quit|rent|borrow|business\.|crime\.|civic\./.test(n)) refresh('work'); else if (/join|found|adopt|drop/.test(n)) refresh('goals'); else if (/datingProfile|askOut|message/.test(n)) refresh('phone');
    if (!sheet.hidden) paint(); else { const first = (m.body || '').split(/(?<=[.!?])\s/)[0]; toast(`<b>${esc(P.fb.title)}</b>${first ? '<br>' + esc(first) : ''}`, 4500); P.fb = null; }
  });
  store.on('play.moment', (m) => { toast(`⏸ <b>${esc(m.why)}</b>${m.hint ? '<br>' + esc(m.hint) : ''}`, 7000); });
  store.on('ready', () => { post({ op: 'state' }); });
  const zp = $('z-play'); if (zp) zp.addEventListener('click', () => { if (P.on) open('menu'); else open('start'); });
  return { open, close, take: (id) => post({ op: 'take', pid: id }), get on() { return P.on; } };
}
