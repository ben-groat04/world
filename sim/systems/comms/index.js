// COMMS plugin (W1-E): phones and online life. Group chats (family, flatshare, friends, class parents, five-a-side, residents, work, faith), aggregate 1:1 message volume, a local
// neighbourhood forum (lost cats, parking rows, recommendations, crime alerts, council gripes), personal feed posts with ties-dependent reach (heavy-tailed, viral rare), dating-app hooks.
// State lives in world.soc (chats, forum, posts, dating, stats) so it snapshots with the social plugin. Text is stored as structure and rendered at read time via the text engine.
//   QUERY world.sys.comms.query: chats(pid) chat(id,n) feed(n) forum(n) post(id) datingPool(pid,n) stats() sample(kind,n)
//   COMMANDS comms.message{from,to,text} comms.call{from,to} comms.post{author,kind,cause} comms.forumPost{author,kind,about,street} comms.viralPost{author,kind}
//            comms.matchOnApp{a,b} comms.createChat{kind,members,name}
//   EVENTS comms.post comms.viral comms.pileon comms.chat_created comms.chat_row comms.chat_left comms.match
import { liveHh } from '../../kernel/archive.js';
import { TextEngine } from '../../text/engine.js';
import baseText from '../../../content/larkfield/text/index.js';
import socialText from '../../../content/larkfield/text/social/index.js';
import { clamp, TPD, isOff } from '../social/core.js';
import { psOf, link, touch, doorDist } from '../social/ties.js';
import { converse } from '../social/acts.js';
import { learn, mkBelief, KINDS } from '../social/beliefs.js';
import { bandOf } from '../social/index.js';

const EVENTS = [
  ['comms.post', 'A post went up (forum, feed or group)', { channel: 'string', kind: 'string' }], ['comms.viral', 'A post travelled far beyond its author\'s circle', { reach: 'number' }],
  ['comms.pileon', 'A thread turned into a pile-on', { n: 'number' }], ['comms.chat_created', 'A group chat was started', { kind: 'string', n: 'number' }],
  ['comms.chat_row', 'A row in a group chat', { kind: 'string' }], ['comms.chat_left', 'Someone left a group chat after a row', { kind: 'string' }], ['comms.match', 'Two people matched on a dating app', { via: 'string' }],
];
const CHAT_BASE = { family: 6, flat: 7, friends: 9, school: 5, five: 4, residents: 2, work: 5, faith: 1.5, dm: 0 };
const FORUM_W = { lost_pet: 5, parking: 12, recommend: 14, crime: 7, council: 9, noise: 6, bins: 6, kids: 2, dogs: 3, event: 8, freebie: 7, question: 10, shop: 3, lost_prop: 5, alert: 2 };
const FORUM_TONES = { freebie: [0.05, 0, 0.05, 0, 0.9], lost_prop: [0.1, 0, 0.05, 0, 0.85], shop: [0.6, 0, 0.3, 0.1, 0], alert: [0.7, 0, 0.2, 0.1, 0], event: [0.1, 0, 0.05, 0, 0.85], parking: [0.4, 0.3, 0.1, 0.35], noise: [0.35, 0.2, 0.1, 0.35], kids: [0.3, 0.2, 0.2, 0.3], dogs: [0.4, 0.2, 0.1, 0.3], bins: [0.4, 0.2, 0.2, 0.2], recommend: [0.05, 0.9, 0.05, 0.02], question: [0.05, 0.8, 0.1, 0.02], default: [0.35, 0.3, 0.15, 0.15] };
const PET = ['Biscuit', 'Mabel', 'Ziggy', 'Pickle', 'Mo', 'Tilly', 'Bruno', 'Luna', 'Gizmo', 'Nala', 'Archie', 'Dotty'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const THING = ['a repair cafe', 'a community garden', 'a street party', 'a book swap', 'a walking group', 'a litter pick', 'a food bank rota'];
const POISSON = (r, l) => { let n = Math.floor(l); if (r.next() < l - n) n++; return n; };

export function createComms() {
  let W = null, E = null;
  const view = (p) => p ? ({ id: p.id, firstName: p.firstName, lastName: p.lastName, sex: p.sex, age: Math.floor(W.ageOf(p)), segment: p.ext.pop.seg, job: p.job, mood: (p.mood + 1) / 2, children: p.family.childrenIds, traits: {} }) : null;
  const shops = () => (W._shopNames || (W._shopNames = [...W.buildings.values()].filter((b) => b.lf && ['cafe', 'pub', 'small_supermarket', 'bakery', 'library', 'community_centre', 'pharmacy'].includes(b.lf.template)).map((b) => b.name.replace(/^The /, '')))); 
  const streetName = (p) => { const b = W.buildings.get(p.homeId); const st = b && b.lf && W.map.lf.streets[b.lf.streetId]; return st ? st.name : 'the High Street'; };
  function render(key, a, o = {}) {
    const ap = typeof a === 'number' ? W.people.get(a) : a, bp = typeof o.b === 'number' ? W.people.get(o.b) : o.b; const av = view(ap);
    const seed = (o.seed || 0);
    const dest = ['Tenerife', 'Cornwall', 'Portugal', 'Lanzarote', 'the Lakes', 'Turkey', 'Wales', 'Greece', 'Scotland', 'Bangladesh', 'Poland', 'Jamaica'];
    const p = { street: ap ? streetName(ap) : 'Newport Road', name: PET[seed % PET.length], shop: shops()[(seed >> 2) % shops().length] || 'the corner shop', day: DAYS[(seed >> 1) % 7], road: ap ? streetName(ap) : 'Newport Road', thing: THING[seed % THING.length], place: shops()[(seed >> 3) % shops().length] || 'the corner shop', n: 1 + (seed % 40), ...(key.endsWith('.holiday') ? { place: dest[seed % dest.length] } : {}), ...(o.p || {}) };
    try { return E.render(key, { a: av, b: view(bp), s: view(typeof o.s === 'number' ? W.people.get(o.s) : o.s), o: view(typeof o.o === 'number' ? W.people.get(o.o) : o.o), actors: [typeof o.s === 'object' && o.s ? o.s.id : o.s, typeof o.o === 'object' && o.o ? o.o.id : o.o].filter((x) => x != null), people: (id) => view(W.people.get(id)), seed, p, genre: 'ev', date: W.calendar.dateOf ? W.calendar.dateOf(o.t != null ? o.t : W.tick) : undefined, memory: o.memory }, W); /* dated by when the post was written, so a post is never dressed in a later month's weather or season */ } catch (e) { return '[' + key + ']'; }
  }
  const plugin = {
    name: 'comms', version: '1.0.0', deps: ['social'],
    init(world) {
      W = world; const S = world.soc;
      for (const [t, d, pl] of EVENTS) if (!world.events.registry.has(t)) world.registerEventType(t, { doc: d, payload: pl });
      const merged = {}; for (const g of [baseText.rules, socialText.rules]) for (const [k, v] of Object.entries(g)) merged[k] = (merged[k] || []).concat(v);
      E = new TextEngine({ rules: merged, sentiment: baseText.sentiment }, { seed: world.seed || 0 });
      if (world.text && !world.text.engine) world.text.setEngine({ render: (w, k, c) => E.render(k, c || {}, w), has: (k) => E.has(k) });
      world.commsText = { render, engine: E };
      buildAll(world, S);
      for (const t of ['life.birth', 'life.couple', 'life.marriage', 'labour.hired', 'labour.promoted', 'life.death', 'housing.moved_in', 'life.breakup', 'labour.job_lost']) if (world.events.registry.has(t)) world.on(t, (ev) => eventPost(ev));
    },
    clocks: { hour: (w) => hourly(w), day: (w) => daily(w), month: (w) => monthly(w) },
    commands: {
      'comms.message': (w, a) => { const x = w.people.get(a.from), y = w.people.get(a.to); if (!x || !y) return false; w.soc.stats.msgs.dm++; return converse(w, w.soc, w.rngFor('comms'), x, y, 2, 'message') >= 0; },
      'comms.call': (w, a) => { const x = w.people.get(a.from), y = w.people.get(a.to); if (!x || !y) return false; w.soc.stats.calls++; return converse(w, w.soc, w.rngFor('comms'), x, y, 1, 'call') >= 0; },
      'comms.post': (w, a) => !!personalPost(w, w.soc, w.rngFor('comms'), w.people.get(a.author), a.kind || 'daily', a.cause),
      'comms.forumPost': (w, a) => !!forumPost(w, w.soc, w.rngFor('comms'), w.people.get(a.author), a.kind, a),
      'comms.viralPost': (w, a) => { const p = w.people.get(a.author); if (!p) return false; return !!personalPost(w, w.soc, w.rngFor('comms'), p, a.kind || 'daily', 0, true); },
      'comms.matchOnApp': (w, a) => match(w, a.a, a.b),
      'comms.createChat': (w, a) => !!mkChat(w, w.soc, a.kind || 'friends', a.members, a.name),
    },
    query: {
      chats: (pid) => { const ps = W.soc.ppl.get(pid); return ps ? ps.ch.map((id) => { const c = W.soc.chats[id - 1]; return { id, kind: c.kind, name: c.name, n: c.m.length + c.nx, act: +c.act.toFixed(2) }; }) : []; },
      chat: (id, n = 6) => { const c = W.soc.chats[id - 1]; return c ? c.ring.slice(-n).map((m) => ({ t: m.t, author: m.au, text: chatText(c, m) })) : []; },
      feed: (n = 8) => W.soc.posts.slice(-n).map((p) => ({ id: p.id, t: p.t, author: p.au, kind: p.k, reach: p.r, text: postText(p) })),
      forum: (n = 8) => W.soc.forum.posts.slice(-n).map((p) => ({ id: p.id, t: p.t, author: p.au, kind: p.k, replies: p.cm.map((c) => ({ author: c.au, tone: c.tn, text: render(replyKey(p.k, ['agree', 'help', 'joke', 'argue', 'interest'][c.tn]), c.au, { seed: c.sd, p: { name: ['Mick', 'Karen at number 9', 'Steve (the plumber)', 'big Dave', 'Ali at the garage', 'Priti'][c.sd % 6] } }) })), text: postText(p, true), seen: p.r })),
      datingPool: (pid, n = 10) => datingPool(W, pid, n),
      stats: () => JSON.parse(JSON.stringify({ msgs: W.soc.stats.msgs, calls: W.soc.stats.calls, posts: W.soc.stats.posts, viral: W.soc.stats.viral, pile: W.soc.stats.pile, matches: W.soc.stats.matches, chats: W.soc.chats.length, forumMembers: W.soc.forum.members.length })),
    },
  };
  // ----- text of stored structures
  function chatText(c, m) { return render('chat.' + (m.k || c.kind), m.au, { seed: m.sd, b: m.bo, t: m.t, p: { thing: 'the plan' } }); }
  // replies come from the topic's own pool (feedreply.<topic>.<tone>) so an answer fits the post; topics without one use the generic tone pool
  const replyKey = (kind, tone) => (E && E.has('feedreply.' + kind + '.' + tone) ? 'feedreply.' + kind + '.' + tone : 'feedreply.' + tone);
  function postText(p, forum) {
    if (p.ev) { const ev = W.events.get(p.ev); if (ev) { try { return E.render(ev, { genre: 'post', a: view(W.people.get(p.au)), people: (id) => view(W.people.get(id)), seed: p.sd, date: W.calendar.dateOf(p.t), p: { street: W.people.get(p.au) ? streetName(W.people.get(p.au)) : 'the High Street', ...ev.payload } }, W); } catch (e) { /* fall through */ } } }
    if (forum || p.k.startsWith('f:')) return render('feed.' + (p.k.startsWith('f:') ? p.k.slice(2) : p.k), p.au, { seed: p.sd, s: p.ab, t: p.t, p: p.ab != null ? {} : undefined });
    const key = p.k === 'daily' ? ['post.daily', 'post2.mood', 'post2.mood', 'post2.photo'][p.sd % 4] : p.k === 'goal' ? 'feed.goal' : 'post.daily';
    return render(key, p.au, { seed: p.sd, t: p.t });
  }
  function adultsOf(ids) { return ids.map((i) => W.people.get(i)).filter((p) => p && p.alive); }
  // ----- group chats
  function mkChat(w, S, kind, members, name, nx = 0) {
    const ids = [...new Set(members)].filter((i) => w.people.get(i)); if (ids.length + nx < 3) return null;
    const c = { id: S.nextChat++, kind, name: name || kind, m: ids, nx, t0: w.tick, act: 0.4 + 0.6 * w.rngFor('comms.chat', S.nextChat).next(), ring: [], vol: 0 };
    S.chats.push(c); for (const i of ids) { const ps = psOf(w, S, i); if (ps) ps.ch.push(c.id); }
    return c;
  }
  function buildAll(w, S) {
    const r = w.rngFor('comms.build'), seen = new Set(); const sig = (ids) => ids.slice().sort((a, b) => a - b).join(',');
    const add = (kind, ids, name, nx) => { const s = kind + sig(ids); if (seen.has(s)) return; seen.add(s); mkChat(w, S, kind, ids, name, nx); };
    for (const hh of liveHh(w)) {
      const live = hh.members.map((i) => w.people.get(i)).filter((p) => p && p.alive && p.ext.pop && w.ageOf(p) >= 14);
      if (!live.length) continue;
      if (hh.arch === 'sharers_students_multigen' && live.length >= 3) add('flat', live.map((p) => p.id), 'House chat');
      const head = live[0], ps = S.ppl.get(head.id); let ex = [], nx = 0;
      if (ps) for (const t of ps.T.values()) { if (t.k !== 'kin' || t.L > 2) continue; if (isOff(t.o)) nx++; else if (!live.some((p) => p.id === t.o) && ex.length < 4) ex.push(t.o); }
      add('family', [...live.map((p) => p.id), ...ex], head.lastName + ' family', Math.min(nx, 5));
    }
    const friendsDone = new Set();
    for (const p of w.living()) {
      const ps = S.ppl.get(p.id); if (!ps || w.ageOf(p) < 13 || friendsDone.has(p.id)) continue;
      const fr = []; for (const t of ps.T.values()) if (t.k === 'friend' && t.L <= 2 && !isOff(t.o)) fr.push(t.o);
      if (fr.length < 2) continue;
      const grp = [p.id]; for (const f of fr) { const fp = S.ppl.get(f); if (fp && grp.every((g) => g === p.id || fp.T.has(g))) grp.push(f); if (grp.length >= 7) break; }
      if (grp.length >= 3) { grp.forEach((g) => friendsDone.add(g)); add('friends', grp, 'The group chat', r.int(0, 3)); }
    }
    // class parents: parents of primary children by school year
    const byYear = new Map();
    for (const p of w.living()) { const q = p.ext.pop; if (!q.school || q.school.kind !== 'primary') continue; const y = Math.floor(w.ageOf(p)) - 4; const par = [p.family.motherId, p.family.fatherId].filter((x) => x != null && w.people.get(x)); (byYear.get(y) || byYear.set(y, []).get(y)).push(...par); }
    for (const [y, ids] of byYear) add('school', [...new Set(ids)].slice(0, 28), 'Year ' + (y + 1) + ' parents');
    // sport and clubs
    const pool = (f) => w.living().filter(f).map((p) => p.id);
    const foot = pool((p) => p.interests.includes('football') && w.ageOf(p) >= 17 && w.ageOf(p) < 48); add('five', foot.slice(0, 11), 'Thursday five-a-side');
    const run = pool((p) => p.interests.includes('running') && w.ageOf(p) >= 17); add('five', run.slice(0, 12), 'Run club');
    for (const [sid, ids] of S.street) { const m = ids.filter((i) => { const p = w.people.get(i); return p && p.values.community > 0.5 && w.ageOf(p) > 28; }).slice(0, 14); if (ids.length >= 15 && m.length >= 4) add('residents', m, (w.map.lf.streets[sid] || {}).name + ' residents'); }
    for (const b of w.buildings.values()) if (b.employees.length >= 4 && b.lf && b.lf.template) add('work', b.employees.slice(0, 15), b.name + ' team');
    for (const rel of ['Christian', 'Muslim']) { const m = pool((p) => p.ext.pop.religion === rel && p.ext.pop.religiosity > 0.55 && w.ageOf(p) >= 16).slice(0, 22); add('faith', m, rel === 'Muslim' ? 'Mosque community' : 'Church community'); }
    // forum membership
    for (const p of w.living()) { const q = p.ext.pop, age = w.ageOf(p); if (age < 20) continue; const base = q.seg === 'older_longterm' ? 0.42 : q.seg === 'family_couples' || q.seg === 'lone_parents' ? 0.38 : q.seg === 'settled_professionals' ? 0.35 : q.seg === 'students' ? 0.03 : q.seg === 'young_sharers' ? 0.1 : q.seg === 'recent_arrivals' ? 0.25 : 0.22; const own = w.lf.households[q.hh]; const pr = base * (own && (own.tenure === 'owned_outright' || own.tenure === 'mortgage') ? 1.3 : 0.9); if (w.rngFor('comms.forum', p.id).next() < pr) { const ps = S.ppl.get(p.id); if (ps) { ps.fm = 1; S.forum.members.push(p.id); } } }
    cumulate(w, S);
  }
  function cumulate(w, S) { let t = 0; S.postCum = []; S.postIds = []; for (const [id, ps] of S.ppl) { const p = w.people.get(id); if (!p || !p.alive) continue; t += ps.pr; S.postCum.push(t); S.postIds.push(id); } S.postTot = t; }
  // ----- hourly: personal posts (sampled by author weight, never per-person scans)
  function hourly(w) {
    const S = w.soc, r = w.rngFor('comms'), h = w.time.hour; if (h < 7 || h > 23) return;
    if (!S.postCum) cumulate(w, S);
    const lam = S.postTot / 17; let n = POISSON(r, lam);
    while (n-- > 0) { const x = r.next() * S.postTot; let lo = 0, hi = S.postCum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (S.postCum[m] < x) lo = m + 1; else hi = m; } const p = w.people.get(S.postIds[lo]); if (p && p.alive) personalPost(w, S, r, p, 'daily', 0); }
  }
  function personalPost(w, S, r, p, kind, cause, viral) {
    if (!p) return 0; const ps = S.ppl.get(p.id); if (!ps) return 0;
    // reach depends on ties: followers (heavy tailed) x engagement; a post that catches fire is rare
    let reach = Math.round(ps.nf * (0.15 + 0.5 * r.next())); const fire = viral || r.next() < 0.00004 * Math.min(4, 1 + ps.nf / 80);
    if (fire) { reach *= 20 + Math.round(r.next() * 80); S.stats.viral++; w.emit('comms.viral', { actors: [p.id], salience: 0.35, cause: cause || 0, tags: ['viral', 'social'], payload: { reach } }); }
    const post = { id: S.nextPost++, t: w.tick, au: p.id, k: kind, r: reach, sd: (r.next() * 1e6) | 0 }; if (cause) post.cause = cause;
    S.posts.push(post); if (S.posts.length > 300) S.posts.shift();
    S.stats.posts.feed++; S.stats.posts[kind === 'daily' ? 'daily' : 'event']++;
    ps.lastPost = w.tick;
    // the people who actually see it: close ties (capped 25); they learn the author's news and the tie warms a little
    if (kind !== 'daily') {
      let best = null; for (const b of ps.B.values()) if (b.a === p.id && KINDS[b.k][0] && (!best || b.t > best.t)) best = b;
      let n = 0; for (const id of ps.top) { if (n >= 25) break; if (r.next() > 0.35) continue; const q = S.ppl.get(id); if (!q) continue; n++; const t = q.T.get(p.id); if (t) touch(t, 3, 1, w.tick); if (best) learn(S, q, mkBelief(S, best.k, best.a, best.o, best.m, 0.9, -2, 1, w.tick, 1, { ev: best.ev })); }
    }
    return post;
  }
  function eventPost(ev) {
    const S = W.soc, r = W.rngFor('comms.ev'); const pid = ev.actors[0]; const p = W.people.get(pid); if (!p || !p.alive || !p.ext.pop) return; const ps = S.ppl.get(pid); if (!ps) return;
    if (r.next() > 0.18 + ps.pr * 2.5) return;
    const post = personalPost(W, S, r, p, 'ev', ev.id); if (post) { post.ev = ev.id; S.stats.posts.event++; w_emit(p, 'feed', ev.type, ev.id); }
  }
  const w_emit = (p, channel, kind, cause) => W.emit('comms.post', { actors: [p.id], salience: 0.03, cause, payload: { channel, kind } });
  // ----- daily: chats and the forum
  function daily(w) {
    const S = w.soc, r = w.rngFor('comms.d');
    if (!S.dating.users.length) monthly(w); // the app pool exists from day one (it used to stay empty until the first month boundary)
    const dn = w.time.dayAbs;
    for (const c of S.chats) {
      if ((dn + c.id) % 3) continue;
      const n = c.m.length + c.nx; if (c.lam === undefined) c.lam = (CHAT_BASE[c.kind] || 3) * Math.pow(n, 0.55) * c.act * 1.5; let k = POISSON(r, c.lam);
      S.stats.msgs.grp += k; c.vol = c.vol * 0.9 + k * 0.1;
      for (let i = 0; i < k; i++) { const id = c.m[(r.next() * c.m.length) | 0], p = w.people.get(id); if (!p || !p.alive) continue; const b = bandOf(w.ageOf(p)); S.stats.msgs.byBand[b] = (S.stats.msgs.byBand[b] || 0) + 1; if (i < 3 && r.next() < 0.5) { c.ring.push({ t: w.tick, au: id, k: c.kind, sd: (r.next() * 1e6) | 0, bo: c.m[(r.next() * c.m.length) | 0] }); if (c.ring.length > 16) c.ring.shift(); } }
      if (k > 0 && n >= 4 && r.next() < 0.0035) chatRow(w, S, r, c);
    }
    // 1:1 message volume (aggregate per age band from each person's messaging rate; individual exchanges that carry news are simulated in social)
    for (const b in S.bandMr || {}) S.stats.msgs.byBand[b] = (S.stats.msgs.byBand[b] || 0) + S.bandMr[b] * 1.2;
    S.stats.msgs.dm += S.dmDay || 0; S.stats.calls += (S.dmDay || 0) / 60;
    // forum
    const F = S.forum; if (F.members.length) {
      let n = POISSON(r, 0.5 + F.members.length * 0.012);
      while (n-- > 0) { const p = w.people.get(F.members[(r.next() * F.members.length) | 0]); if (p && p.alive) forumPost(w, S, r, p, null, {}); }
    }
  }
  function chatRow(w, S, r, c) {
    const id = c.m[(r.next() * c.m.length) | 0], p = w.people.get(id); if (!p) return;
    S.stats.pile += 0; w.emit('comms.chat_row', { actors: [id], salience: 0.1, tags: ['conflict'], payload: { kind: c.kind } });
    if (r.next() < 0.35) { c.m = c.m.filter((x) => x !== id); const ps = S.ppl.get(id); if (ps) ps.ch = ps.ch.filter((x) => x !== c.id); w.emit('comms.chat_left', { actors: [id], salience: 0.12, tags: ['conflict'], payload: { kind: c.kind } }); }
  }
  function forumPost(w, S, r, p, kind, o) {
    if (!p) return 0; const F = S.forum;
    if (!kind) { const items = Object.keys(FORUM_W); for (let tries = 0; tries < 4 && !kind; tries++) { const k = r.weighted(items, items.map((x) => FORUM_W[x])); if (k === 'lost_pet' && !(p.ext.pop.pets && (p.ext.pop.pets.cats || p.ext.pop.pets.dogs)) && r.next() < 0.85) continue; if (k === 'parking' && !p.ext.pop.car && r.next() < 0.6) continue; if (k === 'kids' && !p.family.childrenIds.length && r.next() < 0.7) continue; if (k === 'dogs' && !(p.ext.pop.pets && p.ext.pop.pets.dogs) && r.next() < 0.5) continue; kind = k; } if (!kind) kind = 'question'; }
    const post = { id: F.n++, t: w.tick, au: p.id, k: kind, sd: (r.next() * 1e6) | 0, cm: [], r: 0 }; if (o && o.about != null) post.ab = o.about;
    const members = F.members, nm = members.length, tones = FORUM_TONES[kind] || FORUM_TONES.default;
    const seen = Math.min(50, Math.round(nm * (0.35 + 0.3 * r.next()))); post.r = seen;
    let ncm = POISSON(r, (kind === 'parking' || kind === 'council' || kind === 'crime' ? 3.2 : kind === 'recommend' || kind === 'question' ? 2.6 : 1.2) * (0.4 + r.next())); let heat = 0;
    for (let i = 0; i < ncm; i++) { const q = w.people.get(members[(r.next() * nm) | 0]); if (!q || q === p || !q.alive) continue; const tone = r.weighted([0, 1, 2, 3, 4], tones.length < 5 ? [...tones, 0] : tones); if (tone === 3) heat++; if (post.cm.length < 8) post.cm.push({ au: q.id, tn: tone, sd: (r.next() * 1e6) | 0 });
      const A = psOf(w, S, p.id), B = psOf(w, S, q.id);
      if (A && B) { const t = A.T.get(q.id); if (t) { touch(t, 3, 1, w.tick); if (tone === 3) { t.l = clamp(t.l - 0.05, -1, 1); t.cf = clamp(t.cf + 0.1, 0, 1); } } else if (r.next() < 0.05) link(w, S, p, q, { k: 'neighbour', r: 'neighbour (met online)', L: 4, c: 0.06, lv: 2, l: 0.1 }, 'online'); } }
    if (kind === 'crime' || kind === 'alert') { let n = 0; for (let i = 0; i < Math.min(seen, 30); i++) { const q = S.ppl.get(members[(r.next() * nm) | 0]); if (!q) continue; learn(S, q, mkBelief(S, 'crime_nearby', p.id, 0, 2, 0.6, -3, 1, w.tick, undefined, {})); n++; } }
    if (heat >= 3) { S.stats.pile++; w.emit('comms.pileon', { actors: [p.id], salience: 0.2, tags: ['conflict', 'social'], payload: { n: heat } }); }
    F.posts.push(post); if (F.posts.length > 200) F.posts.shift(); S.stats.posts.forum++; w.emit('comms.post', { actors: [p.id], salience: 0.03, payload: { channel: 'forum', kind } });
    return post;
  }
  // ----- monthly: refresh the dating pool and band message sums
  function monthly(w) {
    const S = w.soc, users = [], bm = {}; let dm = 0;
    for (const p of w.living()) { const ps = S.ppl.get(p.id); if (!ps) continue; const age = w.ageOf(p), b = bandOf(age); bm[b] = (bm[b] || 0) + ps.mr * 0.6; dm += ps.mr * 0.6;
      if (age >= 18 && age < 70 && !(p.romance && p.romance.partnerId != null)) { const pr = age < 25 ? 0.3 : age < 35 ? 0.4 : age < 45 ? 0.28 : age < 55 ? 0.15 : 0.07; if (w.rngFor('comms.dat', p.id, w.tick / 4032 | 0).next() < pr) { users.push(p.id); ps.dt = 1; } else ps.dt = 0; } else ps.dt = 0; }
    S.dating.users = users; S.bandMr = bm; S.dmDay = dm; cumulate(w, S);
  }
  function datingPool(w, pid, n) {
    const S = w.soc, p = w.people.get(pid); if (!p || !S.dating.users.length) return []; const age = w.ageOf(p), out = [];
    for (const id of S.dating.users) { if (id === pid) continue; const q = w.people.get(id); if (!q || !q.alive) continue; const gap = Math.abs(w.ageOf(q) - age); if (gap > 12) continue; const ok = (S.ppl.get(pid) && w.sys.social && w.sys.social.query.attractionPossible(pid, id)); if (!ok) continue; const d = doorDist(w, p, q); out.push({ id, score: +(Math.exp(-gap / 6) * (1 + (p.ext.pop.seg === q.ext.pop.seg ? 0.3 : 0)) * (1 + 0.5 * Math.exp(-d / 80)) * (0.7 + q.genes.looks * 0.6)).toFixed(3), age: Math.round(w.ageOf(q)), tick: w.tick }); }
    return out.sort((a, b) => b.score - a.score).slice(0, n);
  }
  function match(w, ai, bi) {
    const a = w.people.get(ai), b = w.people.get(bi); if (!a || !b) return false; const S = w.soc, res = link(w, S, a, b, { k: 'match', r: 'match', L: 4, c: 0.06, lv: 2, l: 0.2, a: 0.35 }, 'app'); if (!res) return false;
    res[0].a = res[1].a = Math.max(res[0].a, 0.35); S.stats.matches++; w.emit('comms.match', { actors: [ai, bi], salience: 0.15, tags: ['romance', 'online'], payload: { via: 'app' } }); return true;
  }
  return plugin;
}
export default createComms();
