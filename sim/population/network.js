// Initial social network: kin (on/off-map), support clique (3-5), sympathy group (~12-15), homophilous on-map friends, weak local ties (neighbours, school gate,
// colleagues, congregation, regulars), many OFF-MAP ties as lightweight Metropolis records (world.lf.metro), and a few mundane pre-existing frictions.
// tie = {o: personId | 'm<n>' (metro id), k: kind, rel, t: tier 1|2|3, s: strength 0..1, v: how/where, on: 1|0, fr?: friction text}
import { clamp, wpick, wpickObj } from './util.js';
import NAMES from '../../content/larkfield/names.js';

const SEG_KIN = { older_longterm: 0.55, family_couples: 0.5, lone_parents: 0.6, students: 0.25, young_sharers: 0.25, early_career: 0.35, settled_professionals: 0.4, shift_workers: 0.45, recent_arrivals: 0.45, local_business_families: 0.55, benefit_dependent: 0.55 };
const WHERE_OFF = [['in the city centre', 3], ['elsewhere in the city', 5], ['another UK city', 3], ['a nearby town', 2]];
const FRIEND_HOW = { students: [['university', 5], ['school (home town)', 3], ['society/club', 2], ['flatmates (past)', 1]], young_sharers: [['work', 3], ['university', 3], ['school', 2], ['club/gym', 1], ['app', 1]], early_career: [['work', 4], ['university', 3], ['school', 2], ['club/gym', 2]], default: [['school', 3], ['work', 3], ['family friend', 2], ['club/community', 2], ['faith', 1]] };

export function buildNetwork(world, rng, hhs, people) {
  const lf = world.lf, byId = new Map(people.map((p) => [p.id, p])), N = people.length;
  const cl = world.calendar, T0 = world.tick;
  let mid = 0;
  const addMetro = (owner, rel, o = {}) => {
    const p = byId.get(owner), seg = p.ext.pop.seg, age = o.age ?? Math.round(p.family ? 40 : 40);
    const origin = o.sameOrigin === false ? null : { group: p.ext.pop.eth, sub: p.ext.pop.sub, firstGroup: p.ext.pop.eth, lastGroup: p.ext.pop.eth, bornUK: true };
    const sex = o.sex || (rng.chance(0.5) ? 'F' : 'M');
    let first = 'Sam', last = p.lastName;
    try { const g = NAMES.pickOrigin(rng, p.ext.pop.eth, 2026 - age); first = NAMES.pickFirst(rng, g, sex, 2026 - age); if (!o.kin) last = NAMES.pickSurname(rng, g, sex); } catch (e) { /* keep defaults */ }
    const where = o.where || (!p.ext.pop.bornUK && rng.chance(0.4) ? `abroad (${p.ext.pop.birthplace})` : wpick(rng, WHERE_OFF));
    const m = { id: 'm' + (++mid), name: `${first} ${last}`, age, sex, rel, where, how: o.how || '', owner, freq: o.freq || wpick(rng, [['daily messages', 2], ['weekly call', 3], ['monthly meetup', 3], ['a few times a year', 2]]) };
    lf.metro.push(m); return m;
  };
  const rel = (a, b, tie) => { // mirror on-map ties into the legacy relationship record so social systems see them
    const r = world.getRel(a, b), s = tie.s;
    r.familiarity = clamp(0.25 + 0.7 * s + (tie.t === 1 ? 0.1 : 0), 0, 1); r.affinity = tie.fr ? -0.35 : clamp(0.1 + 0.8 * s, 0, 1); r.trust = clamp(0.3 + 0.6 * s, 0, 1); r.tags = [tie.k]; r.lastTick = T0 - rng.int(0, 400);
  };
  const addTie = (a, b, kind, relA, relB, tier, s, via, fr) => { // person-to-person (reciprocal)
    if (a.id === b.id) return false;
    const ta = a.ext.pop.ties, tb = b.ext.pop.ties;
    if (ta.some((t) => t.o === b.id)) return false;
    const x = { o: b.id, k: kind, rel: relA, t: tier, s: +s.toFixed(2), v: via || '', on: 1 }, y = { o: a.id, k: kind, rel: relB, t: tier, s: +s.toFixed(2), v: via || '', on: 1 };
    if (fr) { x.fr = fr; y.fr = fr; }
    ta.push(x); tb.push(y); rel(a, b, x); rel(b, a, y); return true;
  };
  const addOff = (a, m, kind, tier, s, via) => { a.ext.pop.ties.push({ o: m.id, k: kind, rel: m.rel, t: tier, s: +s.toFixed(2), v: via || m.how, on: 0 }); };
  const kinLabel = (a, b) => ({ parent: b.sex === 'F' ? 'mother' : 'father', child: b.sex === 'F' ? 'daughter' : 'son', sibling: b.sex === 'F' ? 'sister' : 'brother', partner: 'partner', grand: b.sex === 'F' ? 'grandmother' : 'grandfather', grandchild: b.sex === 'F' ? 'granddaughter' : 'grandson' });
  const hhOf = (p) => hhs[p.ext.pop.hh];
  const segOf = (p) => world.pack.meta.segments.find((s) => s.id === p.ext.pop.seg);
  const ageOf = (p) => world.ageOf(p);

  // ---- 1. household ties
  for (const h of hhs) {
    const ps = h.members.map((m) => m.person);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], ra = h.members[i], rb = h.members[j];
      let kind = 'housemate', relA = 'housemate', relB = 'housemate', tier = h.arch === 'sharers_students_multigen' ? 2 : 3, s = 0.35 + rng.float(0, 0.3);
      if (ra.partnerOf === j || rb.partnerOf === i) { kind = 'partner'; relA = relB = 'partner'; tier = 1; s = 0.85 + rng.float(0, 0.12); }
      else if (rb.parents && rb.parents.includes(i)) { kind = 'kin'; relA = a.sex === 'F' ? 'mother' : 'father'; relB = b.sex === 'F' ? 'daughter' : 'son'; relA = b.sex === 'F' ? 'daughter' : 'son'; relB = a.sex === 'F' ? 'mother' : 'father'; tier = 1; s = 0.8 + rng.float(0, 0.15); }
      else if (ra.parents && ra.parents.includes(j)) { kind = 'kin'; relB = a.sex === 'F' ? 'daughter' : 'son'; relA = b.sex === 'F' ? 'mother' : 'father'; tier = 1; s = 0.8 + rng.float(0, 0.15); }
      else if (ra.parents && rb.parents && ra.parents[0] === rb.parents[0]) { kind = 'kin'; relA = b.sex === 'F' ? 'sister' : 'brother'; relB = a.sex === 'F' ? 'sister' : 'brother'; tier = 1; s = 0.55 + rng.float(0, 0.3); }
      else if ((ra.role === 'parent' || ra.role === 'grandparent') && (rb.role === 'head' || rb.role === 'adult_child' || rb.role === 'partner')) { kind = 'kin'; relA = b.sex === 'F' ? 'daughter' : 'son'; relB = a.sex === 'F' ? 'mother' : 'father'; tier = 1; s = 0.75; }
      else if ((rb.role === 'parent' || rb.role === 'grandparent') && (ra.role === 'head' || ra.role === 'adult_child' || ra.role === 'partner')) { kind = 'kin'; relB = a.sex === 'F' ? 'daughter' : 'son'; relA = b.sex === 'F' ? 'mother' : 'father'; tier = 1; s = 0.75; }
      else if ((ra.role === 'grandparent' && rb.role === 'child') || (rb.role === 'grandparent' && ra.role === 'child')) { kind = 'kin'; relA = relB = 'grandparent/grandchild'; tier = 2; s = 0.7; }
      else if (ra.role === 'sibling' || rb.role === 'sibling') { kind = 'kin'; relA = b.sex === 'F' ? 'sister' : 'brother'; relB = a.sex === 'F' ? 'sister' : 'brother'; tier = 1; s = 0.6; }
      else if (ra.role === 'other' || rb.role === 'other') { kind = 'kin'; relA = relB = 'relative'; tier = 2; s = 0.4; }
      else if (h.arch !== 'sharers_students_multigen') { kind = 'kin'; relA = relB = 'relative'; tier = 2; }
      addTie(a, b, kind, relA, relB, tier, s, 'same household');
    }
  }
  // ---- 2. off-map kin
  for (const p of people) {
    const q = p.ext.pop, a = ageOf(p), h = hhOf(p), seg = segOf(p), role = q.role;
    if (a < 15 && role === 'child') { // grandparents off-map
      const par = p.family.motherId ? byId.get(p.family.motherId) : byId.get(p.family.fatherId);
      for (let k = 0; k < rng.int(1, 2); k++) { const m = addMetro(p.id, k ? 'grandmother' : 'grandfather', { age: Math.round(clamp(ageOf(par || p) + rng.int(24, 32), 50, 90)), sex: k ? 'F' : 'M', kin: true, how: 'family', freq: wpick(rng, [['weekly visit', 3], ['monthly visit', 3], ['daily when nearby', 1]]) }); addOff(p, m, 'kin', k ? 1 : 2, 0.7); }
      continue;
    }
    if (role === 'parent' || role === 'grandparent') { const m = addMetro(p.id, 'son/daughter', { age: Math.round(a - 28), kin: true, where: 'elsewhere in the city' }); addOff(p, m, 'kin', 2, 0.7); continue; }
    // parents (mother, father) alive with prob by own age; siblings; adult children elsewhere
    const pm = clamp(1.05 - Math.max(0, a - 25) * 0.012, 0.05, 0.98), pf = clamp(1.0 - Math.max(0, a - 25) * 0.015, 0.03, 0.95);
    const onMapParent = p.ext.pop.hhParentOnMap;
    const kinTier = (base) => (rng.chance(SEG_KIN[q.seg] || 0.4) ? base : base + 1);
    if (role !== 'sharer' || true) {
      if (!['adult_child'].includes(role) || !p.family.motherId) if (rng.chance(pm) && !(role === 'adult_child' && p.family.motherId)) { const m = addMetro(p.id, 'mother', { age: Math.round(a + rng.int(22, 34)), sex: 'F', kin: true, how: 'family' }); addOff(p, m, 'kin', kinTier(1), 0.6 + rng.float(0, 0.3)); }
      if (!(role === 'adult_child' && p.family.fatherId) && rng.chance(pf)) { const m = addMetro(p.id, 'father', { age: Math.round(a + rng.int(24, 38)), sex: 'M', kin: true, how: 'family' }); addOff(p, m, 'kin', kinTier(2), 0.45 + rng.float(0, 0.3)); }
      const nsib = a < 15 ? 0 : wpick(rng, [[0, 1.2], [1, 3], [2, 2.2], [3, 1]]);
      for (let k = 0; k < nsib; k++) { const sx = rng.chance(0.5) ? 'F' : 'M'; const m = addMetro(p.id, sx === 'F' ? 'sister' : 'brother', { age: Math.round(a + rng.int(-6, 6)), sex: sx, kin: true, how: 'family' }); addOff(p, m, 'kin', k === 0 ? kinTier(1) : 2, 0.45 + rng.float(0, 0.35)); }
    }
    // adult children living elsewhere (older couples/lone parents)
    if (a > 52 && !h.members.some((m) => m.role === 'adult_child') && rng.chance(0.6) && (role === 'head' || role === 'partner')) {
      if (role === 'partner' && h.members[0].person.ext.pop.kidsElsewhere) { p.ext.pop.kidsElsewhere = h.members[0].person.ext.pop.kidsElsewhere; for (const mm of p.ext.pop.kidsElsewhere) addOff(p, lf.metro.find((x) => x.id === mm), 'kin', 1, 0.7); }
      else { const kids = []; for (let k = 0; k < rng.int(1, 3); k++) { const sx = rng.chance(0.5) ? 'F' : 'M'; const m = addMetro(p.id, sx === 'F' ? 'daughter' : 'son', { age: Math.round(clamp(a - rng.int(24, 36), 18, 50)), sex: sx, kin: true, how: 'family' }); kids.push(m.id); addOff(p, m, 'kin', k < 2 ? 1 : 2, 0.75); } p.ext.pop.kidsElsewhere = kids; }
    }
    // single adults: partner elsewhere (LAT / app)
    if (a >= 20 && a < 60 && !p.family.spouseId && (role === 'head' || role === 'sharer' || role === 'adult_child') && rng.chance(h.arch.startsWith('lone_parent') ? 0.12 : q.seg === 'early_career' || q.seg === 'young_sharers' ? 0.28 : 0.15)) {
      const m = addMetro(p.id, 'partner (lives elsewhere)', { age: Math.round(a + rng.int(-5, 6)), where: 'elsewhere in the city', how: wpick(rng, [['dating app', 3], ['friends', 3], ['work', 2]]), freq: 'daily messages', sameOrigin: false }); addOff(p, m, 'partner', 1, 0.8);
    }
    // ex-partner and co-parenting
    if (h.arch.startsWith('lone_parent') && role === 'head') { const m = addMetro(p.id, 'ex-partner', { age: Math.round(a + rng.int(-3, 6)), sex: p.sex === 'F' ? 'M' : 'F', where: 'elsewhere in the city', how: 'previous relationship', freq: wpick(rng, [['child handover weekly', 3], ['rarely', 2], ['messages about the kids', 3]]), sameOrigin: false }); p.ext.pop.ties.push({ o: m.id, k: 'ex', rel: 'ex-partner', t: 2, s: +rng.float(0.25, 0.6).toFixed(2), v: 'co-parent', on: 0, fr: rng.chance(0.25) ? "strained contact arrangements" : null }); }
  }
  // ---- 3. friends: clique + sympathy sizes, homophily on-map, rest off-map
  const kidIds = new Set(people.filter((p) => ageOf(p) < 16).map((p) => p.id));
  const adultsPool = people.filter((p) => ageOf(p) >= 15);
  const door = (p) => world.buildings.get(p.homeId).door;
  const dist = (a, b) => { const da = door(a), db = door(b); return Math.abs(da.x - db.x) + Math.abs(da.y - db.y); };
  const sims = (a, b) => {
    const A = a.ext.pop, B = b.ext.pop; let w = Math.exp(-Math.pow((ageOf(a) - ageOf(b)) / 9, 2)) + 0.03;
    if (A.seg === B.seg) w *= 2.2; if (A.ethGroup === B.ethGroup) w *= 1.7; if (A.religion === B.religion && A.religion !== 'No religion') w *= 1.5;
    if (A.bornUK === B.bornUK) w *= 1.2; let sh = 0; for (const i of a.interests) if (b.interests.includes(i)) sh++; w *= 1 + 0.35 * sh;
    if (A.workplace.kind === 'onmap' && A.workplace.bid === B.workplace.bid) w *= 3; if (a.sex === b.sex) w *= 1.25;
    const dd = dist(a, b); w *= 1 + 2.5 * Math.exp(-dd / 60) * (segOf(a).social.neighbourChat || 0.5);
    return w;
  };
  const onCount = (p) => p.ext.pop.ties.reduce((n, t) => n + (t.on && t.t <= 2 && t.k === 'friend' ? 1 : 0), 0);
  const order = people.map((p) => p).sort(() => rng.next() - 0.5);
  for (const p of order) {
    const q = p.ext.pop, a = ageOf(p), seg = segOf(p), E = p.personality.extraversion;
    if (a < 5) continue;
    const kids = a < 16;
    const K1 = kids ? rng.int(2, 4) : clamp(Math.round(rng.gauss(4.0 + (E - 0.5) * 2, 0.9)), 3, 5);
    const K2 = kids ? rng.int(5, 9) : clamp(Math.round(rng.gauss(13.5 * (a > 65 ? 0.85 : a < 25 ? 1.05 : 1) + (E - 0.5) * 6, 1.8)), 10, 17);
    q.K = [K1, K2];
    // kin/partner ties already placed count toward clique/sympathy; re-tier: strongest K1 are tier 1, next up to K2 tier 2
    const have = q.ties.filter((t) => t.t <= 2);
    have.sort((x, y) => y.s - x.s);
    have.forEach((t, i) => { t.t = i < K1 ? 1 : 2; });
    let n1 = have.filter((t) => t.t === 1).length, n2 = have.length;
    const onShare = seg.social.onMapShare.closeFriends, how = FRIEND_HOW[q.seg] || FRIEND_HOW.default;
    const own = (kind) => q.ties.filter((t) => t.k === kind).length;
    let guard = 0;
    while (n2 < K2 && guard++ < 40) {
      const tier = n1 < K1 ? 1 : 2, s = tier === 1 ? 0.65 + rng.float(0, 0.3) : 0.35 + rng.float(0, 0.3);
      const onMap = rng.chance(onShare * (tier === 1 ? 1 : 0.8) * (kids ? 1.6 : 1));
      let placed = false;
      if (onMap) {
        const pool = kids ? people.filter((x) => ageOf(x) < 16 && Math.abs(ageOf(x) - a) < 3 && x.id !== p.id) : adultsPool;
        const cands = []; for (let k = 0; k < 40; k++) { const c = pool[rng.int(0, pool.length - 1)]; if (c && c.id !== p.id && !q.ties.some((t) => t.o === c.id) && c.ext.pop.ties.filter((t) => t.t <= 2).length < 19) cands.push(c); }
        if (cands.length) { const c = rng.weighted(cands, cands.map((c2) => sims(p, c2))); placed = addTie(p, c, 'friend', 'friend', 'friend', tier, s, c.ext.pop.workplace.bid != null && c.ext.pop.workplace.bid === q.workplace.bid ? 'colleague' : dist(p, c) < 60 ? 'neighbours' : wpick(rng, [['mutual friends', 3], ['faith/community', 1], ['pub/cafe regulars', 2], ['school gate', 1]])); }
      }
      if (!placed) { // off-map friend placeholder
        const hw = wpick(rng, how); const m = addMetro(p.id, 'friend', { age: Math.round(clamp(a + rng.gauss(0, 5), kids ? 6 : 17, 90)), how: hw, sameOrigin: rng.chance(0.7) ? undefined : false, where: q.bornUK ? undefined : undefined }); addOff(p, m, 'friend', tier, s, hw); placed = true;
      }
      n2++; if (tier === 1) n1++;
    }
  }
  // ---- 4. weak local ties
  const bySt = new Map();
  for (const p of people) { const b = world.buildings.get(p.homeId); (bySt.get(b.lf.streetId) || bySt.set(b.lf.streetId, []).get(b.lf.streetId)).push(p); }
  for (const p of people) {
    const seg = segOf(p), a = ageOf(p), q = p.ext.pop, st = bySt.get(world.buildings.get(p.homeId).lf.streetId) || [];
    const chat = seg.social.neighbourChat;
    const same = world.buildings.get(p.homeId);
    let n = 0;
    for (const c of st) { if (c.id === p.id || c.ext.pop.hh === q.hh || n >= 8) continue; const dd = dist(p, c); if (dd > 55) continue; const pr = chat * (c.homeId === p.homeId ? 0.3 : 0.4) * Math.exp(-dd / 40) * (a < 16 ? 0.3 : 1) * (same.lf.units.length > 3 ? 0.4 : 1); if (rng.chance(pr)) { if (addTie(p, c, 'neighbour', 'neighbour', 'neighbour', 3, 0.15 + rng.float(0, 0.3), c.homeId === p.homeId ? 'same building' : 'same street')) n++; } }
    // school gate (parents of primary-age children, same school year +-1)
    if (a >= 22 && p.family.childrenIds.some((cid) => { const c = byId.get(cid); return c && ageOf(c) >= 3 && ageOf(c) < 11; })) {
      const mine = p.family.childrenIds.map((cid) => byId.get(cid)).filter((c) => c && ageOf(c) >= 3 && ageOf(c) < 11);
      for (const c of people) if (c.id > p.id && c.ext.pop.hh !== q.hh && c.family.childrenIds.some((cid) => { const k = byId.get(cid); return k && ageOf(k) >= 3 && ageOf(k) < 11 && mine.some((m) => Math.abs(ageOf(m) - ageOf(k)) < 1.6); }) && rng.chance(seg.social.onMapShare.schoolGateParents * 0.5)) addTie(p, c, 'schoolgate', 'school-gate parent', 'school-gate parent', 3, 0.2 + rng.float(0, 0.3), 'school gate');
    }
  }
  // colleagues (on-map workplaces), congregation, regulars of resident shopkeepers
  const byWork = new Map();
  for (const p of people) { const w = p.ext.pop.workplace; if (w.kind === 'onmap') (byWork.get(w.bid) || byWork.set(w.bid, []).get(w.bid)).push(p); }
  for (const l of byWork.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) addTie(l[i], l[j], 'colleague', 'colleague', 'colleague', 3, 0.3 + rng.float(0, 0.3), 'work');
  const venueByTemplate = (t) => world.map.lf.venues.filter((v) => v.template === t);
  const worshipOf = (p) => { const r = p.ext.pop.religion; return r === 'Muslim' ? venueByTemplate('mosque')[0] : r === 'Christian' ? venueByTemplate('church')[0] : null; };
  const congr = new Map();
  for (const p of people) { const w = worshipOf(p); if (w && p.ext.pop.religiosity > 0.45 && ageOf(p) >= 8) (congr.get(w.id) || congr.set(w.id, []).get(w.id)).push(p); }
  for (const l of congr.values()) for (const p of l) for (let k = 0; k < 2; k++) { const c = l[rng.int(0, l.length - 1)]; if (c !== p && c.ext.pop.hh !== p.ext.pop.hh) addTie(p, c, 'faith', 'congregation', 'congregation', 3, 0.25 + rng.float(0, 0.3), 'place of worship'); }
  for (const p of people) { // customers know resident business owners (shop/cafe/pub/takeaway)
    const q = p.ext.pop; if (q.workplace.kind !== 'onmap' || !(q.contract === 'self_employed' || q.occ === 'shop_owner_manager' || q.occ === 'cafe_owner' || q.occ === 'publican')) continue;
    const n = Math.round(10 + 14 * segOf(p).social.onMapShare.acquaintances * rng.next());
    for (let k = 0; k < n; k++) { const c = adultsPool[rng.int(0, adultsPool.length - 1)]; if (c.ext.pop.hh !== q.hh && rng.chance(segOf(c).social.neighbourChat + 0.2)) addTie(p, c, 'regular', 'customer', 'shopkeeper', 3, 0.15 + rng.float(0, 0.25), 'shop regular'); }
  }
  // ---- 5. mundane frictions (~8%): noise, parking, bins, landlord, workplace rival, school-gate spat
  for (const p of people) {
    const q = p.ext.pop, a = ageOf(p); if (a < 18 || !rng.chance(0.05)) continue;
    const kinds = [['noise complaint', 4], ['parking dispute', 2], ['bins and rubbish', 1.5], ['landlord dispute (repairs/damp)', q.seg === 'older_longterm' ? 0 : ['private_rent'].includes(hhOf(p).tenure) ? 3 : 0], ['workplace rival', q.workplace.kind !== 'none' ? 2 : 0], ['school-gate spat', p.family.childrenIds.length ? 1.5 : 0]];
    const kind = wpick(rng, kinds);
    if (kind === 'landlord dispute (repairs/damp)') { const m = addMetro(p.id, 'landlord/agent', { age: rng.int(35, 65), where: 'elsewhere in the city', how: 'tenancy', freq: 'emails', sameOrigin: false }); p.ext.pop.ties.push({ o: m.id, k: 'friction', rel: 'landlord', t: 3, s: 0.3, v: 'tenancy', on: 0, fr: kind }); continue; }
    if (kind === 'workplace rival' && q.workplace.kind !== 'onmap') { const m = addMetro(p.id, 'colleague (rival)', { age: Math.round(a + rng.int(-8, 8)), where: 'at work', how: 'work', freq: 'daily', sameOrigin: false }); p.ext.pop.ties.push({ o: m.id, k: 'friction', rel: 'colleague', t: 3, s: 0.3, v: 'work', on: 0, fr: kind }); continue; }
    const near = people.filter((c) => c.ext.pop.hh !== q.hh && ageOf(c) >= 18 && dist(p, c) < 40);
    if (!near.length) continue; const c = near[rng.int(0, near.length - 1)];
    const ex = p.ext.pop.ties.find((t) => t.o === c.id);
    if (ex) { ex.fr = kind; const back = c.ext.pop.ties.find((t) => t.o === p.id); if (back) back.fr = kind; } else addTie(p, c, 'friction', 'neighbour', 'neighbour', 3, 0.15, 'same street', kind);
  }
  lf.stats.metro = lf.metro.length;
}
export default buildNetwork;
