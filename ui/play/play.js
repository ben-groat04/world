// Player UI: one status strip on the map (who / doing / money / energy / mood) + one "Do" button that opens a single sheet. The sheet opens on "Here & now"
// (where you are, who is here, the few sensible things to do), with tabs for Go / Phone / Work / Plans / Me. Every action answers in a feedback card
// (what you did, what happened and why, what to try next). A short skippable intro and a "Things to try" checklist (ticked by real events) help a first-time player.
import { esc } from '../views.js';

const lc = (s) => String(s || '').replace(/_/g, ' ');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const gbp = (n) => { const v = Number.isFinite(+n) ? Math.round(+n) : null; return v == null ? '£–' : (v < 0 ? '-£' : '£') + Math.abs(v).toLocaleString('en-GB'); };
const TALK_EASY = [['small', 'Small talk'], ['joke', 'Make a joke'], ['news', 'Share news']];
const TALK_CLOSE = [['advise', 'Offer advice'], ['comfort', 'Comfort'], ['confide', 'Confide'], ['flirt', 'Flirt'], ['favour', 'Ask a favour']];
const TALK_EDGY = [['complain', 'Complain'], ['gossip', 'Gossip'], ['apologise', 'Apologise'], ['argue', 'Argue']];
const FORUM_KINDS = [['question', 'Ask a question'], ['recommend', 'Recommend something'], ['event', 'Announce an event'], ['noise', 'Complain about noise'], ['parking', 'Parking gripe'], ['freebie', 'Offer a freebie']];
const MOOD = (m) => (m > 0.45 ? '😄' : m > 0.15 ? '🙂' : m > -0.15 ? '😐' : m > -0.45 ? '🙁' : '😟');
const warmWord = (l) => (l == null ? 'not met' : l > 0.5 ? 'close' : l > 0.2 ? 'friendly' : l > -0.15 ? 'acquaintance' : 'cool');
const TABS = [['menu', 'Now'], ['places', 'Go'], ['phone', 'Phone'], ['work', 'Work'], ['goals', 'Plans'], ['me', 'Me']];
const TAB_FULL = { menu: 'Here & now', places: 'Go somewhere', phone: 'Phone', work: 'Work, money and home', goals: 'Plans & clubs', me: 'Me & the street' };
const TAB_OF = { menu: 'menu', talk: 'menu', places: 'places', phone: 'phone', people: 'phone', dating: 'phone', work: 'work', goals: 'goals', me: 'me' };
const INTRO = [
  ['Welcome to Larkfield', 'You are a newcomer. The map shows the neighbourhood and the little figures are your neighbours. Your character is highlighted, and the bar at the top of the map shows where they are and what they are doing.'],
  ['You do not have to do anything', 'Your character lives on autopilot: they sleep, eat, shop and go to work on their own routine while the clock runs. You only step in when you want to change something, like talking to someone or applying for a job.'],
  ['Tap Do to act', 'Do opens on what is happening right here: who is around and a few sensible things to try. Time pauses while it is open, so there is no rush. Close it and life carries on.'],
  ['Things to try', 'Meet your neighbours. Find a job. Join a group. Make a friend. A small checklist in Do ticks them off as they really happen. Start by saying hello to someone.'],
];

const INTRO_TAKE = [
  ['You are {name}', 'This person already lives here, with a job or course, a home, money worries and people who know them. The card at the top of Do says who they are right now. Everything you do runs through the same rules as everyone else in Larkfield.'],
  ['They carry on without you', 'Your character sleeps, eats, studies or works on their own routine while the clock runs. You step in only to change something: talk to someone, apply for work, ask someone out, move, start a small business.'],
  ['Tap Do, read, then act', 'Time pauses while Do is open. Each action says what it costs and roughly how long it takes. Afterwards you get the reason it worked or did not, and "Lately" shows how people reacted.'],
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
    if (step == null) step = 0; P.introStep = step; if (step >= (P.mode === 'take' ? INTRO_TAKE : INTRO).length) { endIntro(); return; }
    if (intro.hidden && store.s.tier !== 'pause') { P.introTier = store.s.tier; store.setSpeed('pause'); }
    const IN = P.mode === 'take' ? INTRO_TAKE : INTRO, [t0, b] = IN[step], t = t0.replace('{name}', (P.s && P.s.name) || 'someone new'), last = step === IN.length - 1;
    intro.hidden = false; card.hidden = true;
    intro.innerHTML = `<div class="pib"><div class="pidots">${IN.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div><h3>${esc(t)}</h3><p>${esc(b)}</p>
      <div class="pia"><button class="pb ghost" data-intro="skip">Skip</button><button class="pb go" data-intro="next">${last ? 'Start playing' : 'Next'}</button></div></div>`;
  }
  function endIntro() { intro.hidden = true; lsSet('lf_play_intro_' + (P.mode || 'create'), '1'); if (P.introTier && store.s.tier === 'pause') store.setSpeed(P.introTier); P.introTier = null; paintStrip(); }
  intro.addEventListener('click', (e) => { const b = e.target.closest('[data-intro]'); if (!b) return; if (b.dataset.intro === 'skip') endIntro(); else showIntro(P.introStep + 1); });

  // ---------------------------------------------------------------- sheet plumbing
  function open(view, arg) {
    if (P.on && sheet.hidden && store.s.tier !== 'pause') { P.prevTier = store.s.tier; store.setSpeed('pause'); }
    if (view !== P.view || (arg || null) !== P.arg) P.fb = P.fbKeep ? P.fb : null; P.fbKeep = false;
    P.view = view; P.arg = arg || null; sheet.hidden = false; document.body.classList.add('psheet-open');
    if (['people', 'phone', 'goals', 'me', 'work', 'places', 'dating'].includes(view)) post({ op: 'section', name: view === 'people' || view === 'dating' ? (view === 'people' ? 'people' : 'phone') : view });
    if (view === 'menu') post({ op: 'state' }); if (view === 'take') store.directoryReq(); if (view === 'create' && !P.setup) post({ op: 'setup' }); if (view === 'talk') { post({ op: 'section', name: 'people' }); post({ op: 'section', name: 'phone' }); }
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
    const plan = f.plan && f.plan.length ? `<ol class="pplan">${f.plan.map((x) => `<li class="${x.now ? 'now' : ''}"><b>${esc(x.text)}</b> <span class="${x.mine ? 'you' : 'auto'}">${x.mine ? 'you can speed this up' : 'done for you'}</span><small>${esc(x.hint)}</small></li>`).join('')}</ol>` : '';
    const next = f.next && f.next.length ? `<div class="pfn"><span>Next:</span>${f.next.map((n) => `<button data-open="${n.open}">${esc(n.label)}</button>`).join('')}</div>` : '';
    // one line (title + first sentence) with the rest behind "More": the card stays short on a phone
    const sent = (f.body || '').split(/(?<=[.!?])\s+/), first = sent[0] || '', rest = (f.body || '').slice(first.length).trim();
    const extra = (rest ? `<p>${esc(rest)}</p>` : '') + (f.facts && f.facts.length ? `<ul class="pfacts">${f.facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '') + plan;
    const more = extra ? (P.fbMore ? `<div class="pfm">${extra}</div><button class="pfmb" data-fbmore>Less</button>` : `<button class="pfmb" data-fbmore>More</button>`) : '';
    return `<div class="pfb ${f.ok ? 'ok' : 'no'}" role="status"><button class="pfx" data-fbx aria-label="Dismiss">✕</button><b>${esc(f.title || f.text || '')}</b>${first ? `<p>${esc(first)}</p>` : ''}${more}${next}</div>`;
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
  function personRow(x) { return x.asleep ? `<div class="pperson asleep"><span><b>${esc(x.name)}</b><small>${esc(x.line || '')}</small></span><i>Asleep</i></div>` : `<button class="pperson" data-talk="${x.id}"><span><b>${esc(x.name)}</b><small>${esc(x.line || '')}</small></span><i>Talk ›</i></button>`; }
  function menuView(s) {
    const here = s.here || [], inbox = s.reqs || [], acts = s.acts || [], things = s.things || [], doneN = things.filter((t) => t.done).length;
    const ibx = inbox.length ? `<h5>Waiting for you <small>${inbox.length}</small></h5>${inbox.slice(0, 6).map((r) => `<div class="preq"><div class="pq"><b>${esc(r.from.name)}</b> ${esc(r.text)}${r.why ? `<small>Trying to ${esc(r.why)}</small>` : ''}</div><div class="pa"><button data-ans="yes" data-rid="${r.id}">Yes</button><button data-ans="maybe" data-rid="${r.id}">Maybe</button><button data-ans="no" data-rid="${r.id}">Not now</button></div></div>`).join('')}${inbox.length > 6 ? `<p class="pdim">${inbox.length - 6} more; they lapse if ignored.</p>` : ''}` : '';
    const where = s.off ? 'Away in the city' : s.loc ? esc(s.loc.name) : 'Out and about';
    const actHtml = acts.map((a) => `<button class="pact" data-a="${a.k}" ${a.id != null ? `data-talk="${a.id}"` : ''} ${a.bid != null ? `data-bid="${a.bid}"` : ''} ${a.dest ? `data-dest="${esc(a.dest)}"` : ''} ${a.item ? `data-item="${a.item}"` : ''}><b>${esc(a.label)}</b><small>${esc(a.sub || '')}</small></button>`).join('');
    const lately = (s.lately || []).length ? `<h5>Lately <small>what happened around you</small></h5>${s.lately.map((l) => `<p class="plog"><small>${l.ago ? l.ago + 'd ago' : 'today'}</small> ${esc(l.text)}</p>`).join('')}` : '';
    const me = s.me, whoCard = me ? `<details class="pwhoami" data-k="whoami" ${P.open.whoami === false ? '' : 'open'}><summary>About you <small>${esc(s.age)} · ${esc(({ student: 'student', retired: 'retired', working: 'working', jobless: 'looking for work', carer: 'at home with family', sick: 'unwell', other: '' })[me.kind] || '')}</small></summary><dl>${me.facts.map((f) => `<div class="${f.tone || ''}"><dt>${esc(f.label)}</dt><dd>${esc(f.text)}</dd></div>`).join('')}</dl></details>` : '';
    const tips = me && me.tips && me.tips.length ? `<h5>What you could do next</h5><div class="ptips">${me.tips.map((t) => `<button data-open="${t.open}"><b>${esc(t.t)}</b><small>${esc(t.d)}</small></button>`).join('')}</div>` : '';
    const pend = (s.pendingJobs || []).length ? `<p class="pdim">Applications out: ${s.pendingJobs.map((x) => `${esc(x.label)} (${x.daysLeft ? x.daysLeft + ' days' : 'any day'})`).join('; ')}.</p>` : '';
    return head(esc(s.name)) + tabs('menu') + `<div class="pbody">
      <div class="pnow"><b>${s.now ? esc(s.now.day + ' ' + s.now.time) : ''}</b> · ${where}<small>${esc(s.doing || s.thought || '')}</small></div>
      ${fbHtml()}${whoCard}${ibx}
      <h5>Here &amp; now</h5>
      ${here.length ? `<div class="pwho2"><small>Who is here</small>${here.slice(0, 8).map(personRow).join('')}</div>` : `<p class="pdim">${s.off ? 'You are away in the city.' : 'Nobody else is here right now.'}</p>`}
      ${actHtml ? `<div class="pacts"><small>Good things to do now</small>${actHtml}</div>` : ''}
      ${tips}
      <details class="pthings" data-k="things" ${(P.open.things ?? (doneN < things.length)) ? 'open' : ''}><summary>${P.mode === 'take' ? 'Where you stand' : 'Things to try'} <em>${P.mode === 'take' ? (doneN === things.length ? 'all sorted' : `${things.length - doneN} to work on`) : `${doneN}/${things.length}`}</em></summary>${P.mode === 'take' ? '<p class="phelp">This is how your life looks right now. What is already in place is ticked, and the rest are things you could work on.</p>' : ''}${things.map((t) => `<div class="pthing ${t.done ? 'done' : ''}"><i>${t.done ? '✓' : ''}</i><span><b>${esc(t.label)}</b>${t.prog && !t.done ? ` <em>${esc(t.prog)}</em>` : ''}<small>${t.done ? esc(t.have || 'Done') : esc(t.hint)}</small></span></div>`).join('')}</details>
      ${pend}${lately}
      <p class="pclock">⏸ Time is paused while this menu is open. When you close it, your character carries on with their routine (sleep, meals, work) by themselves until you act again.</p>
      <button class="plink" data-introshow>How does this work?</button></div>`;
  }
  function talkView(s) {
    const id = P.arg; const x = (s.here || []).find((q) => q.id === id) || (P.sec.people && P.sec.people.here.find((q) => q.id === id));
    if (!x) return head('Talk', 'menu') + `<div class="pbody">${fbHtml()}<p class="pdim">They have gone. Open Here &amp; now to see who is around.</p></div>`;
    if (x.asleep) return head(esc(x.name), 'menu') + `<div class="pbody">${fbHtml()}<p class="pdim">${esc(x.line || '')}</p><p class="phelp">${esc(x.first || x.name)} is asleep. Let them sleep: come back when they are up, or message them from Phone.</p><div class="pgrid2">${btn('Message them', `data-msg="${id}"`)}${btn('View profile', `data-pid="${id}" data-close`)}</div></div>`;
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
    const q = P.q.toLowerCase(), list = pl.places.filter((p) => !q || p.name.toLowerCase().includes(q) || p.tpl.toLowerCase().includes(q));
    const groups = []; for (const p of list) { let g = groups.find((x) => x.n === p.group); if (!g) groups.push(g = { n: p.group, items: [] }); g.items.push(p); }
    const row2 = (p) => btn(`${esc(p.name)}<small>${esc(p.tpl)}</small>`, `data-goto="${p.id}"`, 'row');
    return shell('places', 'Go somewhere', `<p class="phelp">Pick a place and your character walks there while time runs. Cafés, the pub, the library and community centre are where you meet people.</p><input id="pq" type="search" placeholder="Search places…" value="${esc(P.q)}" autocomplete="off">
      <div class="pgrid2">${btn('☕ Stay a while', 'data-act="stay"')}${btn('🌆 Evening in the city', 'data-act="out"')}${btn('⏭ Let 2 hours pass', 'data-act="skip2"')}${btn(P.s && P.s.canSleep ? '🌙 Sleep till morning' : '⏩ Until morning', 'data-act="morning"')}</div>
      <div class="plist">${btn('🏠 Home', 'data-goto="home"', 'row')}</div>${groups.map((g, i) => `<h5>${esc(g.n)}</h5><div class="plist">${g.items.slice(0, q || i < 2 ? 40 : 12).map(row2).join('')}</div>`).join('') || '<p class="pdim">No places match.</p>'}`);
  }
  function peopleView(d) {
    if (!d) return loading('people', 'People you know');
    return shell('people', 'People you know', `<button class="plink" data-open="phone">‹ Phone</button>${d.ties.length ? d.ties.map((t) => row(`<span class="pn"><a class="pl" data-pid="${t.id}" data-close>${esc(t.name)}</a><small>${esc(lc(t.rel || t.k))} · ${warmWord(t.warm)}</small></span><span class="pw"><i style="width:${Math.round(Math.max(0, Math.min(1, (t.warm + 1) / 2)) * 100)}%"></i></span>${btn('Message', `data-msg="${t.id}"`, 'sm')}`)).join('') : '<p class="pdim">You do not know anyone here yet. Go somewhere with people in it (the café, the pub, the community centre) and say hello, or join a group.</p>'}`);
  }
  function phoneView(d) {
    if (!d) return loading('phone', 'Phone');
    const dt = d.dating || { on: false, matches: [] };
    const seeing = P.s && P.s.me && P.s.me.partner;
    return shell('phone', 'Phone', `${seeing ? `<button class="pb row" data-open="dating"><b>💞 Seeing ${esc(seeing)}</b></button>` : `<button class="pb big" data-open="dating"><b>💘 Dating</b><small>${dt.on ? `Profile live · ${dt.matches.length} match${dt.matches.length === 1 ? '' : 'es'}` : 'Set up a profile, get matches over days, or ask out someone you know'}</small></button>`}
      <button class="pb big" data-open="people"><b>☺ People you know</b><small>Everyone you have met, and how well</small></button>
      <h5>Post</h5><div class="pgrid2">${btn('Post online', 'data-post="feed"')}${FORUM_KINDS.slice(0, 4).map(([k, l]) => btn(l, `data-post="forum" data-kind="${k}"`)).join('')}</div>
      <h5>Message someone</h5><div class="pchips">${d.contacts.map((c) => `<button class="pchip" data-msg="${c.id}">${esc(c.name)}</button>`).join('') || '<span class="pdim">No contacts yet. Meet people first.</span>'}</div>
      <h5>Chats</h5>${d.chats.length ? d.chats.map((c) => `<div class="pchat"><b>${esc(cap(lc(c.name)))}</b><small>${c.n} people</small>${c.last.map((m) => `<p><i>${esc(m.au.split(' ')[0])}</i> ${esc(m.text)}</p>`).join('')}</div>`).join('') : '<p class="pdim">No group chats yet. They appear as you get to know people.</p>'}
      <h5>Neighbourhood forum</h5>${d.forum.length ? d.forum.map((f) => `<div class="pchat"><b>${esc(f.au)}</b><small>${esc(f.kind)} · ${esc(f.date)}${f.replies ? ` · ${f.replies} repl${f.replies === 1 ? "y" : "ies"}` : ''}</small><p>${esc(f.text)}</p></div>`).join('') : '<p class="pdim">Nothing yet.</p>'}`);
  }
  function datingView(d) {
    if (!d) return loading('dating', 'Dating');
    const me = P.s && P.s.me;
    if (me && me.partner) return shell('dating', 'Dating', `<button class="plink" data-open="phone">‹ Phone</button><div class="pfb ok"><b>You are seeing ${esc(me.partner)}</b><p>Your dating profile is off while you are together. How it goes depends on time spent together: message ${esc(me.partner)}, meet up, see friends.</p></div>`);
    const dt = d.dating || { on: false, matches: [], pool: 0 }, known = d.datable || [];
    const matchRows = dt.matches.map((m) => row(`<span class="pn"><b>${esc(m.name)}</b><small>${m.age} · ${esc(m.job || '')} · matched ${m.daysAgo ? m.daysAgo + ' days ago' : 'today'}${m.taken ? ' · now seeing someone' : ''}</small></span>${m.taken ? '' : btn('Message', `data-msg="${m.id}"`, 'sm') + btn('Ask out', `data-askout="${m.id}"`, 'sm')}`)).join('');
    const knownRows = known.filter((k) => !dt.matches.some((m) => m.id === k.id)).map((m) => row(`<span class="pn"><b>${esc(m.name)}</b><small>${m.age} · ${esc(m.job || '')} · ${esc(lc(m.rel))} · ${warmWord(m.l)}</small></span>${btn('Ask out', `data-askout="${m.id}"`, 'sm')}`)).join('');
    return shell('dating', 'Dating', `<button class="plink" data-open="phone">‹ Phone</button>
      <p class="phelp">Two ways in. <b>The app</b>: switch on a profile; roughly one or two matches a week turn up, and the game pauses to tell you. Message a match to get chatting, then ask them out. <b>People you know</b>: you can only ask out someone you have really met, who is single and could plausibly be interested.</p>
      <h5>Dating app</h5>${dt.on ? `<p>Your profile is live. About ${dt.pool} people nearby are on the app. New matches arrive every few days and the game pauses to tell you.</p>${btn('Pause my profile', 'data-datingoff', 'ghost')}` : `<p class="pdim">You are not on the app yet.</p>${btn('Set up a dating profile', 'data-dating', 'go')}`}
      <h5>Your matches <small>${dt.matches.length}</small></h5>${matchRows || `<p class="pdim">${dt.on ? 'No matches yet. They arrive over days: carry on with your life and check back.' : 'Turn on your profile to start getting matches.'}</p>`}
      <h5>People you know who could be a match</h5>${knownRows || '<p class="pdim">Nobody you know fits yet. You have not met anyone single and compatible. Say hello to people at the pub or a club, or use the app.</p>'}`);
  }
  // Town life: start a business, work at a local firm, safety and council. Collapsed by default so the sheet stays short.
  const CASES = { bins: 'Missed bins', pothole: 'Pothole', flytip: 'Fly-tipping', damp: 'Damp in a council home', repair: 'Council home repair', noise: 'Noise' };
  const pdet = (key, title, hint, inner) => `<details class="pdet" data-k="${key}" ${P.open[key] ? 'open' : ''}><summary>${title}${hint ? `<small>${hint}</small>` : ''}</summary><div class="pdb">${inner}</div></details>`;
  const SOLO_BLURB = { market_stall: 'A pitch at a local market: no premises and no lease, just a stall, stock and a monthly pitch fee. The classic cheap start.', pop_up: 'Hot food from a stall or trailer at events and street corners. A bit more kit and insurance than a plain stall.', mobile_trade: 'A van and tools for plumbing, cleaning, gardening or similar. Dearer to start, but work comes to you.', home_based: 'Services from your own front room: tutoring, sewing, baking, bookkeeping. Cheapest, and smallest.' };
  function soloBlock(opts, s, mine) {
    if (!opts || !opts.length) return '';
    const sel = opts.find((o) => o.type === P.solo), money = s ? Math.max(0, s.money) : 0;
    const prev = sel ? (() => { const own = Math.min(money * 0.8, sel.cost), want = sel.cost - own; return `<div class="pfb ok"><b>${esc(cap(sel.label))}: about ${gbp(sel.cost)} to start</b><p>${esc(SOLO_BLURB[sel.type] || '')}\n\nYou hold ${gbp(s ? s.money : 0)}: up to 80% of that can go in, ${want > 0 ? `and the other ${gbp(want)} would have to come from a start-up loan (credit-checked, not guaranteed; repaid monthly from takings)` : 'so no loan is needed'}. Running costs (pitch, insurance, van) are paid every month whatever you sell. Takings start low and build over most of a year; after six loss-making months in a row it closes. Many small traders do not make it.</p><div class="pfn">${btn('Start it', `data-sologo="${esc(sel.type)}"`, 'sm')}${btn('Cancel', 'data-biz2=""', 'sm')}</div></div>`; })() : '';
    if (mine) return pdet('solo', 'Your small business', 'running', `<p class="phelp">You run ${esc(mine.label)}, started ${esc(mine.since)}. Each month its takings, pitch or van costs and any loan repayment settle straight into your money (see Me). Takings build slowly; six loss-making months in a row and it closes. You will be told when it does.</p>`);
    return pdet('solo', 'Start small: a stall or home business', `from ${gbp(Math.min(...opts.map((o) => o.cost)))}`, `<p class="phelp">No shop needed. These are the cheap routes into running your own business, with real costs and a real chance of failing.</p><div class="plist">${opts.map((o) => `<button class="pb row ${P.solo === o.type ? 'sel' : ''}" data-biz2="${esc(o.type)}">${esc(cap(o.label))}<small>about ${gbp(o.cost)} to start</small></button>`).join('')}</div>${prev}<label class="pl2 ck"><input type="checkbox" id="pbloan" ${P.biz.loan ? 'checked' : ''}> Allow a start-up loan</label>`);
  }
  function adminView(A, s, solo, mySolo) {
    if (!A) return '';
    const B = P.biz, unit = A.units && A.units.find((u) => u.bid === B.unit) ? B.unit : (s && s.loc && A.units && A.units.find((u) => u.bid === s.loc.id) ? s.loc.id : null);
    const units = (A.units || []).map((u) => `<button class="pb row ${unit === u.bid ? 'sel' : ''}" data-bizunit="${u.bid}">${esc(u.name.replace(/^TO LET, /, ''))}<small>${u.m2} m² · asking ${gbp(u.ask)}/mo · ${u.months >= 1 ? 'empty ' + u.months + ' month' + (u.months > 1 ? 's' : '') : 'just vacated'}</small></button>`).join('') || '<p class="pdim">Every unit on the high street is trading right now.</p>';
    const start = pdet('biz', 'Start a business here', A.units && A.units.length ? `${A.units.length} unit${A.units.length > 1 ? 's' : ''} to let` : 'no units to let', `<p class="phelp">Pick an empty unit and a type. Set-up (fit-out, deposit, stock) usually runs to tens of thousands of pounds and comes from your savings (${gbp(A.money)}) plus a start-up loan of up to £25,000 that is repaid from takings. Rent, wages and business rates are paid monthly; most new businesses lose money at first. Not enough money for a unit? Use <b>Start small</b> above for a stall or home business, or Goals &gt; Start a side hustle.</p><div class="plist">${units}</div>
      <label class="pl2">What kind<select id="pbtype">${(A.formats || []).map((f) => `<option value="${esc(f.id)}" ${B.type === f.id ? 'selected' : ''}>${esc(cap(f.label))}</option>`).join('')}</select></label>
      <label class="pl2 ck"><input type="checkbox" id="pbloan" ${B.loan ? 'checked' : ''}> Borrow part of the cost (a start-up loan, repaid from takings)</label>${btn(unit ? 'Open for business' : 'Choose a unit first', `data-bizgo="${unit || ''}" ${unit ? '' : 'disabled'}`, 'go')}`);
    const work = pdet('workat', 'Work at a local business', '', `<p class="phelp">Shops, cafes, pubs and salons hire rarely and only when they have a vacancy. You can apply to any one; for set job lists see Work above.</p><label class="pl2">Business<select id="pwork">${(A.firms || []).map((f) => `<option value="${f.bid}" ${+P.workBid === f.bid ? 'selected' : ''}>${esc(f.name)} · ${esc(f.kind)} (${esc(f.doing)})</option>`).join('')}</select></label>${btn('Apply to work there', 'data-workat', 'go')}`);
    const v = A.victim;
    const safety = pdet('safety', 'Safety and council', '', `${v && v.n ? `<p class="phelp">You have been a victim of crime ${v.n} time${v.n > 1 ? 's' : ''}. Report anything that has not been reported: it creates a crime number and helps police see patterns.</p>` : '<p class="phelp">If something happens to you, you can report it here. In an emergency call 999.</p>'}
      <div class="pgrid2">${btn('Report a crime<small>to the police</small>', 'data-cmd="crime.report"')}${btn('Join the street watch<small>with neighbours</small>', 'data-cmd="crime.joinWatch"')}${btn('Secure my home<small>locks and lights</small>', 'data-cmd="crime.lockUp"')}</div>
      <h5>Complain to the council</h5><div class="pgrid2"><select id="pcase">${(A.cases || []).map((k) => `<option value="${k}" ${P.caseKind === k ? 'selected' : ''}>${esc(CASES[k] || lc(k))}</option>`).join('')}</select>${btn('Send complaint', 'data-complain')}</div>
      <h5>Object to a planning application</h5>${(A.apps || []).length ? `<div class="plist">${A.apps.map((a) => `<button class="pb row" data-object="${a.id}"><b>Object: ${esc(cap(a.name))}</b><small>${esc(a.street)} · ${a.objections} objection${a.objections === 1 ? '' : 's'} so far</small></button>`).join('')}</div>` : '<p class="pdim">No applications open for comment.</p>'}
      <h5>Join a campaign</h5>${(A.camps || []).length ? `<div class="plist">${A.camps.map((c) => `<button class="pb row" data-joincamp="${c.id}"><b>Join: ${esc(c.name)}</b><small>${c.sign} signatures</small></button>`).join('')}</div>` : '<p class="pdim">No campaigns running. They start when enough neighbours share a grievance.</p>'}
      <h5>Stand as a councillor</h5><p class="phelp">The next ward election is ${esc(A.nextDate || 'not yet set')}. Three seats; you need to be known and trusted.</p><div class="pgrid2"><select id="pparty">${(A.parties || []).map((x) => `<option ${P.party === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>${btn('Stand', 'data-stand')}</div>`);
    return `<h5>Town</h5>${soloBlock(solo, s, mySolo)}${start}${work}${safety}<h5 class="sp">Jobs</h5>`;
  }
  // jobs: the nearest and most approachable first (on the street, then lower-paid entry roles); the rest (professional posts that want qualifications) fold away
  function jobList(all) {
    const one = (o) => `<button class="pb row" data-apply="${esc(o.occ)}" data-bid="${o.bid ?? ''}"><b>${esc(o.label)}</b><small>${esc(o.band)} · ${esc(o.hours)} · ${o.at ? esc(o.at) : esc(o.where)}${o.sub ? ' · ' + esc(o.sub) : ''}</small></button>`;
    const sorted = [...all].sort((a, b) => (b.bid != null) - (a.bid != null) || (a.mid || 0) - (b.mid || 0)), near = sorted.filter((o) => o.bid != null || (o.mid || 0) < 29000).slice(0, 8), rest = sorted.filter((o) => !near.includes(o));
    return `<h5>Jobs you could get now</h5><div class="plist">${near.map(one).join('')}</div>${rest.length ? pdet('morejobs', `${rest.length} more jobs`, 'mostly professional', `<p class="phelp">Qualifications and experience count here; senior posts go to people already working up to them.</p><div class="plist">${rest.map(one).join('')}</div>`) : ''}`;
  }
  function workView(d, s) {
    if (!d) return loading('work', 'Work, money and home');
    const me = d.me || (s && s.me) || {}, kind = me.kind, j = d.job, emp = j && j.activity === 'employed', pend = (d.pending || []).map((x) => `<p class="pdim">⏳ ${esc(x.label)}: reply in ${x.daysLeft ? x.daysLeft + ' days' : 'a day or so'}</p>`).join('');
    let jobs;
    if (emp) jobs = `<h5>Work</h5>${row(`<span class="pn"><b>${esc(j.label || cap(lc(j.occ)))}</b><small>${j.hours ? j.hours + ' h/week' : ''}${j.pay ? ` · ${gbp(j.pay)}/yr gross` : ''}</small></span>${btn('Quit', 'data-act="quit"', 'sm bad')}`)}<p class="pdim">Quitting means no pay after your last day and a new job search. Want a better job instead? Goals: "Change job" or "Ask for a raise".</p>${pdet('morejobs', 'Other jobs on offer', '', jobList(d.openings))}`;
    else if (kind === 'retired') jobs = `<h5>Work</h5><p class="phelp">You are retired. In Larkfield, employers do not take applications from retired people, so there is no job list here. Open to you: a small trade of your own (Start small, above), volunteering (Goals), or enjoying the street.</p>`;
    else jobs = `<h5>Work</h5><p class="phelp">${kind === 'student' ? 'You are studying, so part-time and flexible jobs fit best. ' : 'You are looking for work. '}Pick a job to apply (up to three at once). Employers take one to three weeks to reply and weigh your qualifications and experience against other jobseekers; senior posts go to people already working up to them. If it is a no, the reason is shown. Pay is the typical gross range.</p>${pend}${jobList(d.openings)}`;
    const debtLine = s && (s.debt || me.money < 0) ? ` You owe ${gbp(s.debt)}${me.money < 0 ? ' and are overdrawn' : ''}.` : '';
    const money = `<h5>Money</h5><p class="pdim">${s ? gbp(s.money) + ' in hand.' : ''}${debtLine} Borrowing adds to what you owe and comes out of your income. A lender's limit follows your income and credit record.</p><div class="pgrid2">${btn('Bank loan £200<small>limit follows income</small>', 'data-borrow="200" data-kind="bank"')}${btn('Family £200<small>from kin who can spare it</small>', 'data-borrow="200" data-kind="family"')}${btn('Payday loan £150<small>fast, costly, capped</small>', 'data-borrow="150" data-kind="payday"')}</div>`;
    const homeNote = me.withParents ? 'You live in the family home. Moving out means renting privately: you need cash for a deposit and first month, and then rent every month.' : me.owns ? 'You own your home. Taking a rented flat means leaving it.' : me.rented ? `You rent for ${gbp(me.rent)} a month. Moving takes about a day and needs cash on hand for the deposit.` : 'Moving needs cash on hand for the deposit and first month.';
    const flat = (u) => { const ok = !s || s.money >= u.need; return `<button class="pb row" data-rent="${u.id}">${esc(u.address)}<small>${u.beds} bed · ${gbp(u.rent)}/mo · needs about ${gbp(u.need)} in hand${ok ? '' : ` (you hold ${gbp(s.money)})`} · tap to move</small></button>`; };
    const home = `<h5>Home${s && s.home ? ` <small>${esc(me.withParents ? 'family home' : s.home.tenure)}${s.home.rent ? ' · ' + gbp(s.home.rent) + '/mo' : ''}</small>` : ''}</h5><p class="pdim">${homeNote}</p><div class="plist">${d.vac.length ? d.vac.map(flat).join('') : '<p class="pdim">Nothing to rent right now.</p>'}</div>`;
    return shell('work', 'Work, money and home', adminView(d.admin, s, d.solo, d.mySolo) + jobs + money + home);
  }
  // Goals grouped by theme, with a few picked for the kind of life you lead; the long list stays folded away.
  const GOAL_CATS = [['Work and money', 'get_job change_job get_more_hours ask_for_raise get_promotion repay_debt claim_benefits start_business start_side_hustle go_freelance make_money_quick_irregular return_to_work retrain_career buy_home quit_toxic_job blow_whistle_at_work fiddle_the_system retire_from_job'], ['Learning', 'study_course pass_exams_or_course learn_english_or_skill learn_to_drive learn_instrument'], ['Home', 'find_flat move_out_of_parents get_repair_done downsize_or_adapt_home find_flatmate take_landlord_to_task move_to_new_area_or_city'], ['Health', 'see_gp lose_weight_or_get_fit stop_smoking_or_drinking get_mental_health_help improve_sleep drink_to_cope'], ['People and community', 'make_friends_locally join_group_or_club volunteer_locally take_up_faith_or_return organise_street_event organise_litter_pick report_problem_to_council organise_petition_or_campaign join_cause_or_party run_for_councillor become_governor_or_trustee mentor_young_person start_residents_association start_neighbourhood_watch save_local_place fundraise_for_cause start_book_club start_a_club start_community_garden start_youth_football_team start_parent_toddler_group'], ['Making things', 'start_a_band write_book_or_blog start_podcast_or_channel paint_a_mural run_a_race grow_food_allotment teach_instrument_or_skill become_known_online'], ['Life events', 'plan_wedding get_over_breakup care_for_dying_relative support_parent get_children_into_school settle_a_grievance claim_refund_or_dispute apply_for_visa_or_status']].map(([n, ids]) => [n, ids.split(' ')]);
  const GOAL_FOR = { student: 'claim_benefits make_money_quick_irregular study_course join_group_or_club make_friends_locally learn_to_drive', retired: 'volunteer_locally join_group_or_club see_gp grow_food_allotment take_up_faith_or_return make_friends_locally', jobless: 'get_job claim_benefits repay_debt start_side_hustle retrain_career make_friends_locally', working: 'change_job ask_for_raise get_promotion repay_debt buy_home join_group_or_club', carer: 'return_to_work make_money_quick_irregular join_group_or_club make_friends_locally', sick: 'see_gp get_mental_health_help claim_benefits make_friends_locally', other: 'get_job join_group_or_club make_friends_locally' };
  function goalsView(d) {
    if (!d) return loading('goals', 'Plans & clubs');
    const pick = P.goalPick && d.templates.find((t) => t.id === P.goalPick);
    const preview = pick ? `<div class="pfb ok"><b>${esc(cap(pick.phrase))}</b><p>${pick.by.length ? `Ways it can happen: ${esc(pick.by.join(', '))}.` : ''} ${pick.days ? `Usually takes ${pick.days[0]}–${pick.days[1]} days.` : ''} Your character plans the steps and works through them in spare time; the plan is shown when you start. You can help by doing the steps yourself, and you can drop it any time.</p><div class="pfn">${btn('Start this goal', `data-adopt="${esc(pick.id)}"`, 'sm')}${btn('Cancel', 'data-adoptx', 'sm')}</div></div>` : '';
    const goals = d.goals.length ? d.goals.map((g) => `<div class="pgoal"><div class="pgh"><span><b>${esc(cap(g.phrase))}</b><small>${esc(g.status)}</small></span>${btn('Drop', `data-drop="${g.id}"`, 'sm')}</div>${g.plan && g.plan.length ? `<ol class="pplan">${g.plan.map((x) => `<li class="${x.now ? 'now' : ''} ${x.state === 'done' ? 'done' : ''}"><b>${esc(x.text)}</b> <span class="${x.mine ? 'you' : 'auto'}">${x.mine ? 'you can speed this up' : 'done for you'}</span><small>${esc(x.hint)}${x.note ? ' · ' + esc(x.note) : ''}</small></li>`).join('')}</ol>` : '<p class="pdim">Working out how to start.</p>'}</div>`).join('') : '<p class="pdim">No goals yet. Pick something to aim for. Your character works at it in spare time, and you can speed it up by doing steps yourself.</p>';
    return shell('goals', 'Plans & clubs', `<h5>Your goals</h5>${goals}
      <h5>Pick a goal <small>takes days to weeks; your character works on it in spare time</small></h5>
      ${(() => { const byId = new Map(d.templates.map((t) => [t.id, t])), kind = (P.s && P.s.me && P.s.me.kind) || 'other', sug = (GOAL_FOR[kind] || GOAL_FOR.other).split(' ').map((i) => byId.get(i)).filter(Boolean), used = new Set(); const chip = (t) => `<button class="pchip ${P.goalPick === t.id ? 'on' : ''}" data-goal="${esc(t.id)}">${esc(cap(t.phrase))}</button>`;
        const cats = GOAL_CATS.map(([n, ids]) => { const ts = ids.map((i) => byId.get(i)).filter(Boolean); ts.forEach((t) => used.add(t.id)); return pdet('gc' + n, n, `${ts.length}`, `<div class="pchips">${ts.map(chip).join('')}</div>`); }).join(''), rest = d.templates.filter((t) => !used.has(t.id));
        return `<p class="phelp">Suggested for you</p><div class="pchips">${sug.map(chip).join('')}</div>${preview}${pdet('allgoals', 'All goals by theme', `${d.templates.length}`, cats + (rest.length ? `<div class="pchips">${rest.map(chip).join('')}</div>` : ''))}`; })()}
      ${P.s && P.s.me && P.s.me.partner ? "" : `<p class="pdim">Looking for a partner? Use Phone &gt; Dating: it works from the people you actually know and the app.</p>`}
      <h5>Your groups</h5>${d.groups.map((g) => row(`<span class="pn"><b>${esc(g.name)}</b><small>${esc(g.kind)} · ${g.size} members</small></span>`)).join('') || '<p class="pdim">You are not in any group. Joining one is the easiest way to meet people: you end up in the same places at the same times.</p>'}
      ${d.open.length ? `<h5>Groups you could join</h5><div class="plist">${d.open.map((g) => `<button class="pb row" data-join="${g.id}"><b>Join ${esc(g.name)}</b><small>${esc(g.kind)} · ${g.size} members${g.at ? ' · ' + esc(g.at) : ''}${g.knows ? ` · you know ${esc(g.names)}${g.knows > 3 ? ' and ' + (g.knows - 3) + ' more' : ''}` : ''}</small></button>`).join('')}</div><p class="pdim">Joining puts you in the same places as the members at the same times; it does not make anyone like you. That part comes from talking.</p>` : ''}
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
      <label class="pl2">Apply first for<select id="cf-occ"><option value="">Look for work after I arrive</option>${su.jobs.map((j) => `<option value="${esc(j.occ)}" ${f.occ === j.occ ? 'selected' : ''}>${esc(j.label)}${j.band ? ' · ' + esc(j.band) : ''}</option>`).join('')}</select></label>
      <p class="pdim">Applying is optional: you will hear back in a week or two, and can apply for more later.</p>
      <h5>Home</h5><div class="plist">${su.homes.map((u) => `<button class="pb row ${f.unit === u.id ? 'on' : ''}" data-unit="${u.id}">${esc(u.address)}<small>${u.beds} bed · ${gbp(u.rent)}/mo · ${esc(lc(u.tenure))}</small></button>`).join('')}</div>${fbHtml()}
      ${btn('Move in', 'data-act="create"', 'go')}</div>`;
  }
  const DIR_FILTERS = [['all', 'Everyone'], ['student', 'Students'], ['struggle', 'Struggling'], ['retired', 'Retired'], ['jobless', 'Looking for work'], ['renter', 'Renters']];
  const dirMatch = (r, f) => f === 'student' ? r[9] === 'student' : f === 'retired' ? r[9] === 'retired' : f === 'jobless' ? r[9] === 'unemployed' : f === 'renter' ? /rent/.test(r[11]) : f === 'struggle' ? r[12] > 300 && (r[10] < 150 || r[12] > 2000) : true;
  const dirLine = (r) => { const act = { student: 'Student', retired: 'Retired', unemployed: 'Looking for work', home_family: 'At home with family', employed: r[4] || 'Working' }[r[9]] || r[4] || 'Not working'; const home = r[11] === 'family' ? 'lives with family' : /private/.test(r[11]) ? 'rents privately' : /social/.test(r[11]) ? 'social tenant' : /owned|mortgage/.test(r[11]) ? 'owns home' : ''; return `${r[2]} · ${esc(act)}${home ? ' · ' + home : ''} · ${r[10] < 0 ? 'overdrawn' : gbp(r[10]) + ' in hand'}${r[12] > 300 ? ' · owes ' + gbp(r[12]) : ''}`; };
  function takeView() {
    const L = store.s.directory; if (!L) return head('Take over', 'start') + '<p class="pdim pbody">Loading…</p>';
    const t = P.dirQ.toLowerCase(), f = P.dirF || 'all', pool = L.filter((r) => r[2] >= 16 && !r[8] && dirMatch(r, f)), rows = pool.filter((r) => !t || r[1].toLowerCase().includes(t) || String(r[4]).toLowerCase().includes(t)).slice(0, 40);
    return head('Take over a resident', 'start') + `<div class="pbody"><p class="phelp">Pick someone and you take over their life as it is today: job or course, home, money, relationships. Try a student, a renter in trouble, or a retired neighbour to feel the difference.</p>
      <div class="pchips">${DIR_FILTERS.map(([k, l]) => `<button class="pchip ${f === k ? 'on' : ''}" data-dirf="${k}">${l}</button>`).join('')}</div>
      <input id="tq" type="search" placeholder="Search name or job…" value="${esc(P.dirQ)}" autocomplete="off"><p class="pdim">${pool.length} people${rows.length < pool.length ? `, showing ${rows.length}` : ''}</p><div class="plist">${rows.map((r) => `<button class="pb row" data-take="${r[0]}">${esc(r[1])}<small>${dirLine(r)} · ${esc(r[5])}</small></button>`).join('') || '<p class="pdim">Nobody matches.</p>'}</div></div>`;
  }

  // ---------------------------------------------------------------- events
  sheet.addEventListener('click', (e) => {
    const t = e.target.closest('button,a'); if (!t) return;
    if (t.dataset.ans && t.dataset.rid) { doit('player.respond', { request: +t.dataset.rid, answer: t.dataset.ans }); const r = P.s && P.s.reqs.findIndex((x) => x.id === +t.dataset.rid); if (r >= 0) P.s.reqs.splice(r, 1); paint(); return; }
    if (t.matches('[data-close]')) { if (t.matches('[data-pid]')) hooks.select(+t.dataset.pid); close(); return; }
    if (t.matches('[data-fbx]')) { P.fb = null; P.fbMore = false; paint(); return; }
    if (t.matches('[data-fbmore]')) { P.fbMore = !P.fbMore; paint(); return; }
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
    if (t.dataset.take) { P.mode = 'take'; post({ op: 'take', pid: +t.dataset.take }); close(); return; }
    if (t.dataset.dirf) { P.dirF = t.dataset.dirf; paint(); return; }
    if (t.dataset.goal) { P.goalPick = t.dataset.goal; P.fb = null; paint(); const pv = box.querySelector('.pfb.ok'); if (pv && pv.scrollIntoView) pv.scrollIntoView({ block: 'nearest' }); return; }
    if (t.dataset.biz2 !== undefined) { P.solo = t.dataset.biz2 || null; paint(); return; }
    if (t.dataset.sologo) { doit('business.start', { type: t.dataset.sologo, loan: P.biz.loan }); return; }
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
    else if (a === 'create') { P.mode = 'create'; const f = P.form; if (!f.unit) { P.fb = { ok: false, title: 'Choose a home first', body: 'Tap one of the flats above. The rent is monthly and you need a deposit and first month from your savings.' }; paint(); return; } post({ op: 'create', args: { first: f.first || 'Alex', last: f.last || 'Newcomer', age: f.age, sex: f.sex, seg: f.seg, budget: f.budget, unit: f.unit, occ: f.occ || null } }); }
  });
  // actions that leave the sheet: show the answer as a toast and let time run
  function closeKeep() { const fb = P.fb; P.pendingToast = true; close(); void fb; resume(); }
  sheet.addEventListener('toggle', (e) => { const d = e.target; if (d && d.classList && (d.classList.contains('pdet') || d.dataset.k)) P.open[d.dataset.k] = d.open; }, true);
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
  store.on('play.state', (m) => { const sig = JSON.stringify({ ...m.s, tick: 0, now: 0 }), same = sig === P.sig; P.sig = sig; P.s = m.s; if (P.pendingIntro) { P.pendingIntro = false; showIntro(0); } paintStrip(); if (!same && !sheet.hidden && ['menu', 'talk'].includes(P.view)) paint(); });
  store.on('play.setup', (m) => { P.setup = m; if (!P.form.unit && m.homes[0]) P.form.unit = m.homes[0].id; paint(); });
  store.on('play.section', (m) => { P.sec[m.name] = m; paint(); });
  store.on('directory', () => { if (P.view === 'take') paint(); });
  store.on('play.on', (m) => { P.on = true; P.mode = P.mode || 'create'; document.body.classList.add('playing'); P.pid = m.pid; P.homeId = null; close(); hooks.select(m.pid); hooks.follow(); hooks.peek && hooks.peek(); if (!lsGet('lf_play_intro_' + P.mode)) P.pendingIntro = true; else toast('You are playing. Tap <b>Do</b> to act.', 3000); });
  store.on('play.off', () => { P.on = false; document.body.classList.remove('playing'); P.s = null; endIntro(); paintStrip(); });
  store.on('play.result', (m) => {
    P.fbMore = false; P.fb = { ok: m.ok, title: m.title || m.text || '', body: m.body || '', plan: m.plan, next: m.next, facts: m.facts };
    const n = m.name || ''; if (/apply|quit|rent|borrow|business\.|crime\.|civic\./.test(n)) refresh('work'); else if (/join|found|adopt|drop/.test(n)) refresh('goals'); else if (/datingProfile|askOut|message/.test(n)) refresh('phone');
    if (!sheet.hidden) { paint(); const pb = box.querySelector('.pbody'); if (pb) pb.scrollTop = 0; } else { const first = (m.body || '').split(/(?<=[.!?])\s/)[0]; toast(`<b>${esc(P.fb.title)}</b>${first ? '<br>' + esc(first) : ''}`, 4500); P.fb = null; }
  });
  store.on('play.moment', (m) => { toast(`⏸ <b>${esc(m.why)}</b>${m.hint ? '<br>' + esc(m.hint) : ''}`, 7000); });
  store.on('ready', () => { post({ op: 'state' }); });
  const zp = $('z-play'); if (zp) zp.addEventListener('click', () => { if (P.on) open('menu'); else open('start'); });
  return { open, close, take: (id) => post({ op: 'take', pid: id }), get on() { return P.on; } };
}
