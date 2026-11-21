// Social system: encounters, conversations, relationships, gossip & rumors, reputation, cliques, loneliness.
// sim/ code: no DOM, world.rng only.
import { clamp } from '../util.js';
const TPD = 144;
const has = (p, t) => p.traits && p.traits.includes(t);
const pid = (x) => (x !== null && typeof x === 'object' ? x.id : x);
const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1).replace(/[\s,;]+\S*$/, '') + '...' : s);
const full = (p) => `${p.firstName} ${p.lastName}`;
const pron = (p) => (p.sex === 'F' ? { s: 'she', o: 'her', p: 'her' } : { s: 'he', o: 'him', p: 'his' });
const ageOf = (w, p) => (w.ageOf ? w.ageOf(p) : 30);

// ---------------------------------------------------------------- state
function st(world) {
  let S = world.social;
  if (!S) {
    S = world.social = {
      rumors: new Map(),      // id -> {id, aboutId, kind, truth, tick, heard, chronicled}
      nextRumor: 1,
      cliques: [],            // [{id, members:[ids], hangout, name}]
      feuds: new Set(),
      at: new Map(),          // locationId -> [persons] (rebuilt each tick)
      chronToday: 0,
      lastCliqueKey: new Set(),
      stats: { conversations: 0, gossips: 0, arguments: 0, reconciliations: 0, rumorsBorn: 0 },
    };
    if (world.stats) world.stats.social = S.stats;
  }
  return S;
}

// ---------------------------------------------------------------- relationship helpers
function rel(a, b) {
  if (!a.relationships) a.relationships = new Map();
  let r = a.relationships.get(b.id);
  if (!r) { r = { familiarity: 0, affinity: 0, attraction: 0, trust: 0.3, respect: 0, lastTick: 0, tags: [] }; a.relationships.set(b.id, r); }
  if (!r.tags) r.tags = [];
  return r;
}
function addTag(r, t) { if (!r.tags.includes(t)) { r.tags.push(t); return true; } return false; }
function delTag(r, t) { const i = r.tags.indexOf(t); if (i >= 0) { r.tags.splice(i, 1); return true; } return false; }
const isFam = (r) => r.tags.includes('family');

export function getFriends(world, p, minAffinity = 0) {
  const out = [];
  if (!p.relationships) return out;
  for (const [id, r] of p.relationships) {
    if (!r.tags || !(r.tags.includes('friend') || r.tags.includes('close_friend')) || r.affinity < minAffinity) continue;
    const o = world.people.get(id);
    if (o && o.alive) out.push(o);
  }
  out.sort((x, y) => rel(p, y).affinity - rel(p, x).affinity);
  return out;
}
export function getEnemies(world, p) {
  const out = [];
  if (!p.relationships) return out;
  for (const [id, r] of p.relationships) {
    if (r.tags && (r.tags.includes('enemy') || r.tags.includes('rival'))) { const o = world.people.get(id); if (o && o.alive) out.push(o); }
  }
  return out;
}
export function getClique(world, p) { const S = st(world); return S.cliques.find((c) => c.members.includes(p.id)) || null; }

export function addMoodlet(world, p, id, label, value, ticks) { world.moodlet(p, id, label, value, ticks); }
function mem(world, p, type, text, others, weight, importance) {
  if (world.addMemory) world.addMemory(p, { type, text, otherIds: others, weight, importance });
}
function think(world, p, text) { p.thought = text; p._thoughtTick = world.tick; }
function chron(world, entry, importance) {
  const S = st(world);
  if (S.chronToday >= 4 && importance < 4) return;
  S.chronToday++;
  world.chronicle.add({ importance, ...entry });
}
function isDrunk(world, p) {
  if (p.drunk > 0.3) return true;
  if (p.moodlets && p.moodlets.some((m) => /drunk|tipsy/.test(m.id))) return true;
  const b = p.locationId != null ? world.buildings.get(p.locationId) : null;
  return !!(b && b.type === 'tavern' && world.time.hour >= 19 && has(p, 'drunkard'));
}
function isSad(p) {
  return p.mood < -0.3 || (p.moodlets && p.moodlets.some((m) => /griev|mourn|bereav|heartbr|lonely|sad/.test(m.id) && m.value < 0));
}

// ---------------------------------------------------------------- tags
function updateTags(world, a, b, r) {
  const S = st(world);
  const had = r.tags.slice();
  const { affinity: af, familiarity: fa, trust: tr } = r;
  const g = r.grudge || 0;
  if (fa >= 0.12) addTag(r, 'acquaintance');
  if (!r.tags.includes('friend')) { if (af > 0.32 && fa > 0.3 && tr > 0.3) addTag(r, 'friend'); }
  else if (af < 0.18) delTag(r, 'friend');
  if (!r.tags.includes('close_friend')) { if (af > 0.7 && fa > 0.6 && tr > 0.55) addTag(r, 'close_friend'); }
  else if (af < 0.45) delTag(r, 'close_friend');
  if (!r.tags.includes('rival')) { if (af < -0.28 && fa > 0.15) addTag(r, 'rival'); }
  else if (af > -0.12) delTag(r, 'rival');
  if (!r.tags.includes('enemy')) { if (af < -0.6 && fa > 0.25 && g > 0.3) addTag(r, 'enemy'); }
  else if (af > -0.4) delTag(r, 'enemy');
  if (r.tags.includes('rival') || r.tags.includes('enemy')) { delTag(r, 'friend'); delTag(r, 'close_friend'); }
  if (r.tags.length === had.length && r.tags.every((t, i) => t === had[i])) return;
  const added = r.tags.filter((t) => !had.includes(t));
  const other = b.relationships && b.relationships.get(a.id);
  for (const t of added) {
    if (t === 'acquaintance') continue;
    world.emit('relationshipChange', { a, b, tag: t, added: true });
    const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    if (t === 'close_friend' && !r.tags.includes('family') && other && other.tags.includes('close_friend') && !S.feuds.has('cf' + key)) {
      S.feuds.add('cf' + key);
      const place = hangName(world, a, b);
      const T = [
        `${full(a)} and ${full(b)} have become inseparable; neighbours say they are rarely seen apart${place ? ' and are regulars ' + place : ''}.`,
        `A lifelong friendship seems to have taken root between ${a.firstName} ${a.lastName}, the ${a.job}, and ${b.firstName} ${b.lastName}, the ${b.job}.`,
        `${a.firstName} and ${b.firstName} now share every trouble and every pint; the town has started speaking of them in one breath.`,
        `Whatever else changes in Hollowmere, ${full(a)} and ${full(b)} can be counted on to turn up together${place ? ' ' + place : ''}.`,
      ];
      chron(world, { type: 'friendship', text: world.rng.pick(T), people: [a.id, b.id] }, 2);
    }
    if ((t === 'enemy' || t === 'rival') && !r.tags.includes('family') && other && (other.tags.includes('enemy') || other.tags.includes('rival')) && !S.feuds.has(key)) {
      if (t === 'enemy' || other.tags.includes('enemy')) {
        S.feuds.add(key);
        const cause = r.cause || other.cause || 'over old grievances';
        const T = [
          `A quarrel ${cause} between ${full(a)} and ${full(b)} has hardened into a feud; they no longer share a bench at church.`,
          `${full(a)} and ${full(b)} are not on speaking terms after bad blood ${cause}; neighbours are taking sides.`,
          `The long grudge ${cause} between ${a.firstName} ${a.lastName} and ${b.firstName} ${b.lastName} has become open hostility.`,
        ];
        chron(world, { type: 'feud', text: world.rng.pick(T), people: [a.id, b.id] }, 3);
      }
    }
  }
}
function hangName(world, a, b) {
  const h = a._hang;
  if (!h || !h.size) return '';
  let best = null, bv = 0;
  for (const [id, v] of h) if (v > bv) { bv = v; best = id; }
  const bl = best != null ? world.buildings.get(best) : null;
  if (!bl) return '';
  if (bl.type === 'tavern') return `at ${bl.name}`;
  if (bl.type === 'park' || bl.type === 'square' || bl.type === 'market') return `at the ${bl.name || bl.type}`;
  return '';
}

// ---------------------------------------------------------------- rumors
const KIND = {
  affair: { v: -0.6, s: 0.8 }, crime: { v: -0.7, s: 0.8 }, scandal: { v: -0.5, s: 0.6 }, pregnancy: { v: -0.1, s: 0.4 },
  debt: { v: -0.3, s: 0.4 }, praise: { v: 0.5, s: 0.4 }, drunk: { v: -0.3, s: 0.4 }, courtship: { v: 0.1, s: 0.3 },
  quarrel: { v: -0.2, s: 0.3 }, suspicion: { v: -0.35, s: 0.5 }, trouble: { v: -0.15, s: 0.3 }, divorce: { v: -0.25, s: 0.5 },
};
function rumorText(world, kind, subj, ctx = {}) {
  const N = full(subj), F = subj.firstName, pr = pron(subj), rng = world.rng;
  const o = ctx.other ? ctx.other : null;
  const T = {
    affair: [`${N} has been slipping away after dark to meet ${o ? full(o) : 'someone who is not ' + pr.p + ' spouse'}`, `${F} and ${o ? o.firstName : 'a certain someone'} were seen together behind the ${rng.pick(['granary', 'chapel wall', 'mill race', 'orchard'])}`],
    crime: [`${N} was behind the ${ctx.crime || 'trouble'} everyone is talking about`, `${N} is said to be the one responsible for the ${ctx.crime || 'recent trouble'}`],
    scandal: [`${N} has disgraced ${pr.o}self ${rng.pick(['before the whole congregation', 'in front of half the market', 'at the tavern', 'in a way no one will speak of in front of the priest'])}`, `There is an ugly story going about ${N}`],
    pregnancy: [`${N} is expecting a child`, `${F} is with child, so the midwife's neighbour says`],
    debt: [`${N} owes money all over town`, `${N} is badly behind on ${pr.p} debts and ${pr.s} has been avoiding the shops`],
    praise: [`${N} sat up three nights with a sick neighbour`, `${N} quietly paid a widow's rent last winter`, `${N} is the most honest dealer in Hollowmere`, `${N} gave ${pr.p} own bread to a hungry family`],
    drunk: [`${N} had to be carried home from the tavern again`, `${N} was singing in the lane at midnight, drunk as a lord`],
    courtship: [`${N} has been walking out with ${o ? full(o) : 'a sweetheart'}`, `${F} and ${o ? o.firstName : 'someone'} are said to be courting`],
    quarrel: [`${N} was shouting at ${o ? full(o) : 'a neighbour'} in the street`, `${N} and ${o ? full(o) : 'a neighbour'} nearly came to blows`],
    suspicion: [`${N} has been seen near the market stalls after closing`, `things go missing wherever ${N} has been`],
    trouble: [`${N} and ${pr.p} spouse hardly speak any more`, `there is trouble in the ${subj.lastName} household`],
    divorce: [`${N} has left ${pr.p} marriage in ruins`, `${N}'s marriage has ended, and nobody agrees on who was to blame`],
  };
  return rng.pick(T[kind] || T.scandal);
}
const EMBELL = [', and it was not the first time', ', and half the street already knew', ', with others looking on', ', if you believe the baker\'s wife', ', and there is worse not yet told', ', so they say'];

export function createRumor(world, { aboutId, kind = 'scandal', text, truth = true, ctx = {}, severity, valence }) {
  const S = st(world);
  const subj = world.people.get(aboutId);
  if (!subj) return null;
  const k = KIND[kind] || KIND.scandal;
  const r = {
    id: 'r' + S.nextRumor++, aboutId, kind, truth, tick: world.tick, origTick: world.tick, heardFrom: null,
    severity: severity ?? k.s, valence: valence ?? k.v, hops: 0, exag: 0, embell: [],
    base: text || rumorText(world, kind, subj, ctx), text: '',
  };
  if (kind === 'pregnancy' && !valence) r.valence = subj.family && subj.family.spouseId ? 0.15 : -0.35;
  r.text = r.base;
  S.rumors.set(r.id, { id: r.id, aboutId, kind, truth, tick: world.tick, heard: 0, chronicled: false });
  S.stats.rumorsBorn++;
  return r;
}
function mutate(world, r) {
  const rng = world.rng;
  const c = { ...r, embell: r.embell.slice(), hops: r.hops + 1 };
  if (rng.chance(0.28)) {
    if (r.valence < 0 || rng.chance(0.4)) {
      c.severity = Math.min(1, r.severity * 1.15 + 0.04); c.valence = clamp(r.valence * 1.12, -1, 1); c.exag = r.exag + 1;
      if (c.embell.length < 2) c.embell.push(rng.pick(EMBELL));
    } else { c.severity = r.severity * 0.85; c.valence = r.valence * 0.9; c.exag = r.exag + 1; }
    if (c.exag >= 3) c.truth = false;
    c.text = c.base + c.embell.join('');
  }
  return c;
}

// hearer receives rumor from teller (teller may be null for seeding). returns true if believed/stored
export function hear(world, hearer, rumor, teller) {
  const S = st(world), rng = world.rng;
  if (!hearer.alive) return false;
  if (!hearer.rumors) hearer.rumors = [];
  if (hearer.rumors.some((x) => x.id === rumor.id)) return false;
  const subj = world.people.get(rumor.aboutId);
  if (!subj || !subj.alive && world.tick - rumor.tick > 30 * TPD) return false;
  const copy = teller ? mutate(world, rumor) : { ...rumor, embell: rumor.embell.slice() };
  copy.heardFrom = teller ? teller.id : null;
  copy.tick = world.tick;
  const reg = S.rumors.get(rumor.id);
  if (hearer.id === rumor.aboutId) {
    // subject hears what is said of them
    hearer.rumors.push(copy);
    if (copy.valence < -0.15 && teller) {
      const r = rel(hearer, teller);
      const lie = !copy.truth;
      r.affinity = clamp(r.affinity - (lie ? 0.15 : 0.07), -1, 1); r.trust = clamp(r.trust - 0.1, 0, 1); r.grudge = clamp((r.grudge || 0) + 0.1, 0, 1);
      addMoodlet(world, hearer, 'gossiped_about', lie ? 'Hurt by lies being told about them' : 'Ashamed of what the town is saying', lie ? -0.18 : -0.14, 3 * TPD);
      mem(world, hearer, 'rumor_self', `Heard that people are saying ${lc(copy.text)}.`, [teller.id], -0.4, 2);
      think(world, hearer, `Somebody is telling tales about me.`);
    } else if (copy.valence > 0.15) addMoodlet(world, hearer, 'praised', 'Heard kind words said of them', 0.12, 2 * TPD);
    return true;
  }
  const tr = teller ? rel(hearer, teller).trust : 0.5;
  let cred = 0.35 + 0.4 * tr + (has(hearer, 'gossip') ? 0.12 : 0) + (copy.truth ? 0.05 : 0) - (hearer.personality.openness > 0.75 ? 0.05 : 0);
  const rs = rel(hearer, subj);
  if (rs.affinity > 0.5 || (rs.tags.includes('family') && copy.valence < 0)) cred *= 0.5;
  if (has(hearer, 'honest') && copy.valence < 0) cred *= 0.9;
  if (!rng.chance(clamp(cred, 0.05, 0.95))) {
    if (teller && rs.affinity > 0.3 && copy.valence < 0) { const t = rel(hearer, teller); t.affinity = clamp(t.affinity - 0.03, -1, 1); t.trust = clamp(t.trust - 0.03, 0, 1); }
    return false;
  }
  hearer.rumors.push(copy);
  if (hearer.rumors.length > 8) {
    let wi = 0, wv = 1e9;
    hearer.rumors.forEach((x, i) => { const v = Math.abs(x.valence) * x.severity - (world.tick - x.tick) * 1e-4; if (v < wv) { wv = v; wi = i; } });
    hearer.rumors.splice(wi, 1);
  }
  if (reg) {
    reg.heard++;
    const pop = world.living().length;
    if (!reg.chronicled && reg.heard >= Math.max(10, pop * 0.045) && copy.valence <= -0.4 && subj.alive) {
      reg.chronicled = true;
      subj.reputation = clamp((subj.reputation || 0) - 0.08 * copy.severity, -1, 1);
      const pr = pron(subj);
      const T = [
        `Talk of ${full(subj)} is on everyone's lips: ${lc(copy.text)}.`,
        `A scandal is spreading through Hollowmere. ${full(subj)}, the ${subj.job}, is said to be the subject: ${lc(copy.text)}.`,
        `Whether or not it is true, ${full(subj)} can no longer walk to market without a murmur following ${pr.o}: ${lc(copy.text)}.`,
      ];
      chron(world, { type: 'scandal', text: rng.pick(T), people: [subj.id] }, 3);
      addMoodlet(world, subj, 'public_shame', 'The whole town is talking about them', -0.25, 7 * TPD);
    }
  }
  // opinion shift
  const mag = copy.valence * cred * 0.1 * (0.5 + copy.severity) * (teller ? 0.6 + 0.4 * tr : 1);
  const moral = (hearer.personality.agreeableness > 0.65 || has(hearer, 'pious')) && copy.valence < 0 ? 1.5 : 1;
  rs.affinity = clamp(rs.affinity + mag * moral, -1, 1);
  rs.trust = clamp(rs.trust + copy.valence * 0.05 * cred, 0, 1);
  if (copy.kind === 'praise') rs.respect = clamp(rs.respect + 0.05, -1, 1);
  if (copy.valence < 0) rs.respect = clamp(rs.respect + copy.valence * 0.04, -1, 1);
  world.emit('rumor', { rumor: copy, about: subj, from: teller || null, to: hearer });
  return true;
}

// Originate a rumor in fromId's head (and optionally tell toId). Exported for other systems / interventions.
export function spreadRumor(world, fromId, rumor, toId) {
  const from = world.people.get(fromId);
  if (!from) return null;
  let r = rumor;
  if (!r.id) r = createRumor(world, rumor);
  if (!r) return null;
  if (!from.rumors) from.rumors = [];
  if (!from.rumors.some((x) => x.id === r.id)) { from.rumors.push({ ...r, embell: (r.embell || []).slice(), heardFrom: null }); const reg = st(world).rumors.get(r.id); if (reg) reg.heard++; }
  if (toId != null) { const to = world.people.get(toId); if (to) hear(world, to, from.rumors.find((x) => x.id === r.id), from); }
  return r;
}
function seedFor(world, subjId, n, nearIds) {
  // pick hearers: gossipy people, friends of subject
  const S = world.living();
  const out = [];
  const subj = world.people.get(subjId);
  if (nearIds) for (const id of nearIds) { const p = world.people.get(id); if (p && p.alive && id !== subjId) out.push(p); }
  let tries = 0;
  while (out.length < n && tries++ < 20) {
    const p = world.rng.pick(S);
    if (p.id === subjId || out.includes(p) || ageOf(world, p) < 14) continue;
    if (has(p, 'gossip') || world.rng.chance(0.4) || (subj && p.relationships.has(subjId))) out.push(p);
  }
  return out.slice(0, Math.max(n, nearIds ? nearIds.length : 0));
}
function birthRumor(world, r, hearers) {
  for (const h of hearers) {
    if (h.id === r.aboutId) continue;
    spreadRumor(world, h.id, r);
  }
}
function pickShare(world, a, b) {
  if (!a.rumors || !a.rumors.length) return null;
  const rng = world.rng;
  const cand = a.rumors.filter((r) => r.aboutId !== b.id && r.aboutId !== a.id && !(b.rumors && b.rumors.some((x) => x.id === r.id)) && world.people.get(r.aboutId));
  if (!cand.length) return null;
  const tactless = has(a, 'gossip') && a.personality.agreeableness < 0.4;
  const rb = rel(b, a);
  const list = cand.filter((r) => {
    if (r.valence >= 0) return true;
    const rs = b.relationships.get(r.aboutId);
    if (rs && rs.tags.includes('family') && !tactless) return false; // tact
    return true;
  });
  if (!list.length) return null;
  return rng.weighted(list, (r) => (0.2 + Math.abs(r.valence) * r.severity * 2) * (1 + (a.personality.agreeableness < 0.4 && r.valence < 0 ? 0.5 : 0)) / (1 + (world.tick - r.tick) / (10 * TPD)) * (0.6 + rb.familiarity));
}
function tell(world, a, b, r) {
  const S = st(world);
  const ok = hear(world, b, r, a);
  S.stats.gossips++;
  const ra = rel(a, b), rb = rel(b, a);
  if (ok) { ra.trust = clamp(ra.trust + 0.01, 0, 1); rb.familiarity = clamp(rb.familiarity + 0.005, 0, 1); }
  return ok;
}

// ---------------------------------------------------------------- conversation
const GAIN = {
  greeting: [0.012, 0.012, 0, 0], smalltalk: [0.02, 0.03, 0.005, 0], deep: [0.035, 0.07, 0.05, 0.01], joke: [0.015, 0.05, 0.006, 0],
  gossip: [0.02, 0.035, 0.02, 0], complain: [0.02, 0.02, 0.01, -0.005], comfort: [0.03, 0.08, 0.06, 0.02], argue: [0.02, 0.2, 0.15, 0.05],
  apologize: [0.02, 0.08, 0.04, 0.01], flirt: [0.015, 0.045, 0.005, 0],
};
const SOCIAL_BOOST = { greeting: 0.4, smalltalk: 1, deep: 1.8, joke: 1.4, gossip: 1.3, complain: 0.6, comfort: 1.5, argue: 0.3, apologize: 1, flirt: 1.3 };
const CAUSES = ['over a boundary hedge', 'over an unpaid debt', 'over a remark about someone\'s family', 'over a borrowed tool never returned', 'over words spoken in drink', 'over a stray animal', 'over who was owed the last sale', 'over a repeated bit of gossip', 'over an old slight at church', 'over the price of a cartload of wood'];
const COMPLAINTS = ['the price of bread', 'aching joints', 'the state of the roads', 'the tax collector', 'a leaking roof', 'noisy neighbours', 'the weather', 'how nobody pays on time', 'the young people'];
const JOB_TALK = {
  farmer: ['the crop', 'the state of the fields', 'a lame ox'], baker: ['the price of flour', 'the oven draught'], smith: ['iron prices', 'a cracked anvil'],
  tavernkeeper: ['the ale barrels', 'last night\'s crowd'], merchant: ['the roads and the carters', 'the price of cloth'], doctor: ['the coughs going round', 'a stubborn fever'],
  teacher: ['the children\'s letters', 'a clever pupil'], priest: ['Sunday\'s sermon', 'the roof of the temple'], guard: ['a quiet watch', 'strangers on the road'],
  miller: ['the mill-race', 'the grain tallies'], tailor: ['a wedding order', 'the price of wool'], carpenter: ['a half-built cart', 'good timber'], laborer: ['the day\'s work', 'sore backs'],
};
const SEASON_TALK = [['the thaw', 'the mud', 'lambing'], ['the long light', 'the haymaking', 'a fine growing summer'], ['the harvest', 'the first frosts', 'the apple glut'], ['the cold', 'firewood', 'the long dark evenings']];

function topicFor(world, a, b) {
  const rng = world.rng;
  const roll = rng.next();
  if (roll < 0.25) {
    const cs = world.chronicle ? world.chronicle.recent(25, 3) : [];
    const fresh = cs.filter((e) => world.tick - e.tick < 60 * TPD);
    if (fresh.length) return `the news (${trunc(rng.pick(fresh).text, 70)})`;
  }
  if (roll < 0.55) { const t = JOB_TALK[a.job] || JOB_TALK.laborer; return rng.pick(t); }
  if (roll < 0.8) return rng.pick(SEASON_TALK[world.time.season] || SEASON_TALK[0]);
  if (a.family && a.family.childrenIds && a.family.childrenIds.length && rng.chance(0.5)) return `the children`;
  return rng.pick(['the weather', 'the market prices', 'the last festival', 'who is courting whom', 'the harvest']);
}

function chooseType(world, a, b, ra, rb, ctx) {
  const rng = world.rng, pa = a.personality, W = [];
  const adultPair = ageOf(world, a) >= 14 && ageOf(world, b) >= 14;
  const bt = ctx.type;
  const known = ra.familiarity;
  W.push(['greeting', (known < 0.25 ? 3 : 0.6) * (ctx.outdoor ? 2 : 1)]);
  W.push(['smalltalk', 4 * (bt === 'temple' ? 0.5 : 1) * (ctx.working ? 0.8 : 1)]);
  if (known > 0.3 && ra.affinity > 0.25 && ra.trust > 0.35 && adultPair) W.push(['deep', 1.4 * (0.4 + pa.openness) * (bt === 'temple' ? 2 : 1) * (ctx.working ? 0.3 : 1)]);
  if (a.mood > -0.2) W.push(['joke', 1.5 * (0.4 + pa.extraversion) * (has(a, 'charming') ? 1.6 : 1) * (ctx.drunkA ? 1.5 : 1) * (bt === 'tavern' ? 1.5 : 1)]);
  if (known > 0.2 && adultPair && a.rumors && a.rumors.length) W.push(['gossip', (1.2 + (has(a, 'gossip') ? 5 : 0) + a.rumors.length * 0.15) * (bt === 'market' || bt === 'well' ? 1.5 : 1) * (bt === 'temple' ? 0.4 : 1)]);
  W.push(['complain', 1.0 * (pa.neuroticism + 0.2) * (a.mood < 0 ? 2 : 1) * (known > 0.2 ? 1 : 0.4)]);
  if (isSad(b) && ra.affinity > -0.1 && known > 0.1) W.push(['comfort', 6 * (pa.agreeableness + 0.3)]);
  const grudge = ra.grudge || 0;
  const clash = Math.abs(pa.openness - b.personality.openness) * 0.5 + Math.max(0, 0.5 - pa.agreeableness - b.personality.agreeableness * 0.5) + Math.abs(pa.conscientiousness - b.personality.conscientiousness) * 0.3;
  let ar = 0.04 + clash * 0.3 + Math.max(0, -ra.affinity) * 3 + grudge * 3 + (has(a, 'hothead') ? 1.2 : 0) + (ctx.drunkA ? 1.5 : 0) + (ctx.drunkB ? 0.6 : 0) + Math.max(0, -a.mood) * 0.8;
  if (ra.affinity > 0.5 && !ctx.drunkA) ar *= 0.15;
  W.push(['argue', ar * (bt === 'temple' ? 0.2 : 1)]);
  if (ra.affinity < 0.1 && (grudge > 0.05 || ra.affinity < -0.2) && pa.agreeableness > 0.4 && known > 0.2 && !ctx.drunkA)
    W.push(['apologize', (0.6 + (pa.agreeableness - 0.4) * 5 + (ra.tags.includes('family') ? 3 : 0)) * (1 + grudge)]);
  if (ra.attraction > 0.25 && adultPair && ra.affinity > -0.1) W.push(['flirt', ra.attraction * 4 * (0.5 + pa.extraversion) * (ctx.drunkA ? 1.4 : 1) * (has(a, 'romantic') ? 1.4 : 1)]);
  if (!adultPair) {
    return rng.weighted(W.filter((x) => ['greeting', 'smalltalk', 'joke', 'argue', 'complain', 'comfort'].includes(x[0])), (x) => x[1])[0];
  }
  return rng.weighted(W, (x) => x[1])[0];
}

const THOUGHT = {
  greeting: (n) => [`Exchanged a nod and a word with ${n}.`, `Passed the time of day with ${n}.`],
  smalltalk: (n, t) => [`Chatting with ${n} about ${t}.`, `Idle talk with ${n} about ${t}.`],
  deep: (n) => [`Opening up to ${n}; it feels good to be heard.`, `Talking something through with ${n} at last.`],
  joke: (n, t, ok) => (ok ? [`Laughing with ${n} about ${t}.`, `${n} had a joke that landed well.`] : [`The joke fell flat with ${n}.`, `Told ${n} a joke; got a polite smile.`]),
  gossip: (n) => [`Swapping whispers with ${n}.`, `Sharing the latest talk with ${n}.`],
  complain: (n, t) => [`Grumbling to ${n} about ${t}.`, `Letting off steam to ${n} about ${t}.`],
  comfort: (n) => [`Trying to console ${n}.`, `Sitting with ${n}, saying what little can be said.`],
  argue: (n) => [`Bitter words with ${n}.`, `Furious after quarrelling with ${n}.`],
  apologize: (n, t, ok) => (ok ? [`Made peace with ${n}.`, `Apologised to ${n}; a weight is lifted.`] : [`Tried to apologise to ${n} but was rebuffed.`]),
  flirt: (n) => [`Trading glances and teasing with ${n}.`, `Lingering a little too long beside ${n}.`],
};

export function converse(world, a, b, opts = {}) {
  const S = st(world), rng = world.rng, tick = world.tick;
  const ra = rel(a, b), rb = rel(b, a);
  const loc = a.locationId != null ? world.buildings.get(a.locationId) : null;
  const ctx = {
    type: loc ? loc.type : 'street', outdoor: !loc, working: !!(loc && a.workId === loc.id), drunkA: isDrunk(world, a), drunkB: isDrunk(world, b),
  };
  const type = opts.type || chooseType(world, a, b, ra, rb, ctx);
  const firstMeeting = ra.familiarity < 0.03 && rb.familiarity < 0.03;
  const pa = a.personality, pb = b.personality;
  const compat = 1 - (Math.abs(pa.openness - pb.openness) + Math.abs(pa.extraversion - pb.extraversion) + Math.abs(pa.conscientiousness - pb.conscientiousness) + Math.abs(pa.neuroticism - pb.neuroticism)) / 4 * 1.4;
  let q = -0.12 + 0.5 * compat + 0.15 * (a.mood + b.mood) + 0.12 * (pa.agreeableness + pb.agreeableness - 1) + 0.15 * Math.max(ra.affinity, rb.affinity)
    + (has(a, 'charming') ? 0.1 : 0) - (has(b, 'shy') || has(a, 'shy') ? 0.05 : 0) + rng.gauss(0, ctx.drunkA || ctx.drunkB ? 0.35 : 0.2);
  if (ra.grudge || rb.grudge) q -= 0.25 * Math.max(ra.grudge || 0, rb.grudge || 0);
  let shared = null, topic = null, cause = null;
  const an = a.firstName, bn = b.firstName;
  const sharedIds = [a.id, b.id];

  if (type === 'joke') q += ((0.5 * pa.extraversion + (has(a, 'charming') ? 0.3 : 0) + 0.2 * pa.openness) - 0.4) * 0.6;
  if (type === 'argue') { q = -0.25 - Math.abs(rng.gauss(0.15, 0.2)); cause = rng.pick(CAUSES); }
  if (type === 'comfort') q = 0.15 + 0.5 * pa.agreeableness + (has(a, 'kind') ? 0.15 : 0) + rng.gauss(0, 0.15);
  if (type === 'apologize') q = -0.1 + 0.5 * pa.agreeableness + 0.3 * Math.max(rb.affinity + 0.5, 0) - (rb.grudge || 0) * 0.8 + (pb.agreeableness - 0.5) * 0.6 + rng.gauss(0, 0.2);
  if (type === 'complain') topic = rng.pick(COMPLAINTS);
  if (type === 'smalltalk' || type === 'joke') topic = topicFor(world, a, b);

  if (type === 'gossip' || (type !== 'argue' && type !== 'greeting' && a.rumors && a.rumors.length && rng.chance(0.04 + (has(a, 'gossip') ? 0.12 : 0)))) {
    const r = pickShare(world, a, b);
    if (r) { shared = r; tell(world, a, b, r); topic = r.text; } else if (type === 'gossip') { /* nothing to tell: becomes small talk */ }
  }

  // per-side perceived quality
  const qa = clamp(q + rng.gauss(0, 0.08), -1, 1), qb = clamp(q + rng.gauss(0, 0.08), -1, 1);
  const g = GAIN[type];
  const apply = (from, to, r, qq) => {
    const prevAff = r.affinity;
    r.familiarity = clamp(r.familiarity + g[0] * (1 - r.familiarity * 0.6) * (type === 'argue' ? 0.8 : 1), 0, 1);
    const damp = qq > 0 ? 1 - Math.max(0, r.affinity) * 0.5 : 1;
    const day = world.time.totalDays;
    if (r._gd !== day) { r._gd = day; r._g = 0; }
    let dAff = g[1] * qq * damp;
    if (dAff > 0) { dAff = Math.min(dAff, Math.max(0, 0.05 - r._g)); r._g += dAff; } else if (dAff < 0) { dAff = Math.max(dAff, Math.min(0, -0.12 - r._g)); r._g += dAff; }
    r.affinity = clamp(r.affinity + dAff, -1, 1);
    if (type === 'argue') { r.trust = clamp(r.trust - g[2] * (0.5 - qq * 0.5), 0, 1); r.respect = clamp(r.respect + (rng.chance(0.5) ? -g[3] : g[3] * 0.5), -1, 1); }
    else { r.trust = clamp(r.trust + g[2] * qq, 0, 1); r.respect = clamp(r.respect + g[3] * (qq > 0 ? 1 : -1) * (type === 'complain' ? 1 : Math.abs(qq)), -1, 1); }
    if (qq < -0.05 && type !== 'argue') r.grudge = clamp((r.grudge || 0) + 0.02, 0, 1);
    r.lastTick = tick; r._talk = tick;
    // needs & mood
    const boost = (0.04 + 0.1 * Math.max(0, qq + 0.2)) * SOCIAL_BOOST[type];
    if (from.needs) from.needs.social = clamp(from.needs.social + boost, 0, 1);
    return prevAff;
  };
  apply(a, b, ra, qa);
  apply(b, a, rb, qb);
  if (a.needs && b.needs) { /* both boosted above via 'from' */ }
  if (b.needs) { /* b boost applied in second call with from=b */ }

  let outcome = q > 0.35 ? 'great' : q > 0.1 ? 'good' : q > -0.1 ? 'neutral' : 'bad';
  if (type === 'argue') {
    outcome = 'heated'; S.stats.arguments++;
    ra.grudge = clamp((ra.grudge || 0) + 0.15, 0, 1); rb.grudge = clamp((rb.grudge || 0) + 0.15, 0, 1);
    ra.cause = rb.cause = cause;
    addMoodlet(world, a, 'quarrel', 'Still fuming after a quarrel', -0.18, TPD);
    addMoodlet(world, b, 'quarrel', 'Still fuming after a quarrel', -0.18, TPD);
    mem(world, a, 'argument', `Quarrelled with ${full(b)} ${cause}.`, [b.id], -0.5, 2);
    mem(world, b, 'argument', `Quarrelled with ${full(a)} ${cause}.`, [a.id], -0.5, 2);
    const wit = (S.at.get(placeKey(a)) || []).length;
    let escalate = false;
    if ((has(a, 'hothead') || has(b, 'hothead')) && (ctx.drunkA || ctx.drunkB || ra.grudge > 0.5) && rng.chance(0.25)) escalate = true;
    ctx.escalate = escalate;
    if (ctx.type !== 'house' && wit >= 3 && rng.chance(0.3)) {
      const r = createRumor(world, { aboutId: rng.chance(0.5) ? a.id : b.id, kind: 'quarrel', ctx: { other: null }, truth: true });
      if (r) {
        const subj = world.people.get(r.aboutId), oth = subj === a ? b : a;
        r.base = r.text = rumorText(world, 'quarrel', subj, { other: oth });
        birthRumor(world, r, (S.at.get(placeKey(a)) || []).filter((x) => x !== a && x !== b).slice(0, 3));
      }
    }
  } else if (type === 'apologize') {
    if (q > 0.05) {
      outcome = 'reconciled'; S.stats.reconciliations++;
      for (const [r, o] of [[ra, rb], [rb, ra]]) { r.affinity = clamp(r.affinity + 0.1, -1, 1); r.grudge = clamp((r.grudge || 0) - 0.3, 0, 1); }
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (S.feuds.has(key)) {
        S.feuds.delete(key);
        chron(world, { type: 'reconciliation', text: rng.pick([`After a long estrangement, ${full(a)} and ${full(b)} were seen shaking hands outside the temple.`, `${full(a)} has finally made peace with ${full(b)}; the whole street is relieved.`]), people: [a.id, b.id] }, 3);
      }
      mem(world, a, 'apology', `Made peace with ${full(b)}.`, [b.id], 0.5, 2);
      mem(world, b, 'apology', `${full(a)} apologised and made amends.`, [a.id], 0.5, 2);
      addMoodlet(world, a, 'peace', 'Relieved to have made peace', 0.12, 2 * TPD);
      addMoodlet(world, b, 'peace', 'Relieved to have made peace', 0.12, 2 * TPD);
    } else { outcome = 'rebuffed'; rb.grudge = clamp((rb.grudge || 0) + 0.05, 0, 1); }
  } else if (type === 'comfort') {
    if (q > 0.1) {
      outcome = 'comforted';
      addMoodlet(world, b, 'comforted', `Comforted by ${an}`, 0.22, 2 * TPD);
      world.removeMoodlet(b, 'lonely');
      mem(world, b, 'comfort', `${full(a)} sat with me when I was low.`, [a.id], 0.6, 2);
      rb.trust = clamp(rb.trust + 0.04, 0, 1);
      rb.respect = clamp(rb.respect + 0.03, -1, 1);
    }
  } else if (type === 'deep' && q > 0.1) {
    addMoodlet(world, a, 'confided', 'Close talk with someone trusted', 0.14, 2 * TPD);
    addMoodlet(world, b, 'confided', 'Close talk with someone trusted', 0.14, 2 * TPD);
    if (rng.chance(0.35)) { mem(world, a, 'deep_talk', `Had a long, honest talk with ${full(b)}.`, [b.id], 0.4, 2); mem(world, b, 'deep_talk', `Had a long, honest talk with ${full(a)}.`, [a.id], 0.4, 2); }
  } else if (q > 0.1) {
    const v = type === 'joke' ? 0.1 : 0.06;
    addMoodlet(world, a, 'chat', 'Pleasant company', v, 24);
    addMoodlet(world, b, 'chat', 'Pleasant company', v, 24);
    if (type === 'joke' && q > 0.5 && rng.chance(0.2)) { mem(world, a, 'laughter', `Shared a great laugh with ${full(b)}.`, [b.id], 0.4, 1); mem(world, b, 'laughter', `Shared a great laugh with ${full(a)}.`, [a.id], 0.4, 1); }
  } else if (q < -0.1) {
    addMoodlet(world, a, 'awkward', 'An awkward exchange', -0.06, 24);
    addMoodlet(world, b, 'awkward', 'An awkward exchange', -0.08, 24);
  }

  // hangouts (feeds the friend-place bias & cliques)
  if (loc && loc.type !== 'house' && loc.type !== 'farm' && ra.affinity > 0.25 && rb.affinity > 0.25) {
    for (const p of [a, b]) { if (!p._hang) p._hang = new Map(); p._hang.set(a.locationId, (p._hang.get(a.locationId) || 0) + 1); }
  }
  a._talkCount = (a._talkCount || 0) + 1; b._talkCount = (b._talkCount || 0) + 1;
  a._lastTalk = b._lastTalk = tick;
  updateTags(world, a, b, ra);
  updateTags(world, b, a, rb);

  // thoughts (only when notable enough to display)
  const tf = THOUGHT[type];
  if (tf && (type !== 'greeting' || rng.chance(0.3))) {
    const ok = outcome === 'great' || outcome === 'good' || outcome === 'comforted' || outcome === 'reconciled';
    const ta = tf(bn, topic || 'this and that', ok), tb = tf(an, topic || 'this and that', ok);
    if (!(a.id === world.player)) think(world, a, rng.pick(ta));
    if (!(b.id === world.player)) think(world, b, type === 'comfort' ? `${an} was kind to me.` : type === 'gossip' && shared ? `Heard something about ${world.people.get(shared.aboutId)?.firstName}.` : rng.pick(tb));
  }

  S.stats.conversations++;
  const ev = { a: a.id, b: b.id, type, outcome, quality: q, buildingId: a.locationId, topic, rumorId: shared ? shared.id : null, aboutId: shared ? shared.aboutId : null, escalate: !!ctx.escalate, firstMeeting, drunk: ctx.drunkA || ctx.drunkB };
  world.emit('encounter', { a: a.id, b: b.id, buildingId: a.locationId, firstMeeting });
  world.emit('conversation', ev);
  return ev;
}

// ---------------------------------------------------------------- per-tick encounters
function asleep(p, hour) {
  const ca = p.currentAction;
  if (ca && (ca.id === 'sleep' || ca.id === 'bathe')) return true;
  return false;
}
function startProb(world, p, loc) {
  const pe = p.personality.extraversion;
  let m = 0.11 * (0.45 + pe) * (1.5 - p.needs.social * 0.8);
  if (has(p, 'shy')) m *= 0.6;
  if (has(p, 'gossip')) m *= 1.2;
  if (!loc) return m * 0.25;
  const t = loc.type;
  if (t === 'house') m *= 0.45;
  else if (p.workId === loc.id) m *= 0.4;
  else if (t === 'tavern' || t === 'market' || t === 'square' || t === 'park' || t === 'well') m *= 1.3;
  else if (t === 'school') m *= 0.9;
  else if (t === 'temple') m *= 0.6;
  if (p.currentAction && p.currentAction.id === 'work') m *= 0.8;
  return m;
}
const TALK_EVERY = 3, TPY = 16128;
const placeKey = (p) => (p.locationId != null ? p.locationId : 100000 + ((p.y >> 2) << 8) + (p.x >> 2));
function onTick(world) {
  const tick = world.tick;
  if (tick % TALK_EVERY !== 0) return; // encounters are evaluated every 3rd tick with 3x the per-tick probability
  const S = st(world), rng = world.rng, hour = world.time.hour;
  const living = world.living();
  // bucket people by place: building id, or a 4-tile outdoor cell (keys offset past the building ids)
  const buckets = new Map();
  for (let i = 0; i < living.length; i++) {
    const p = living[i];
    const key = placeKey(p);
    const arr = buckets.get(key);
    if (arr === undefined) buckets.set(key, [p]); else arr.push(p);
  }
  S.at = buckets;
  const minBorn = tick - 3 * TPY;
  for (const [key, arr] of buckets) {
    const n = arr.length;
    if (n < 2) continue;
    const loc = key >= 100000 ? null : world.buildings.get(key);
    for (let i = 0; i < n; i++) {
      const p = arr[i];
      if (p._nextTalk > tick || p.birthTick > minBorn || !p.alive) continue;
      if (p.id === world.player) continue;
      const ca = p.currentAction;
      if (ca !== null && (ca.id === 'sleep' || ca.id === 'bathe')) continue;
      if (loc && loc.id === p.homeId && (hour >= 22 || hour < 6)) continue;
      if (p.illness && p.illness.severity > 0.6) continue;
      if (rng.next() >= Math.min(0.95, startProb(world, p, loc) * TALK_EVERY)) continue;
      // choose a partner among up to 4 random others
      const cands = [];
      for (let k = 0; k < 4 && cands.length < 3; k++) {
        const q = arr[rng.int(0, n - 1)];
        if (q === p || !q.alive || cands.includes(q) || q._nextTalk > tick || q.birthTick > minBorn) continue;
        const qa = q.currentAction;
        if (qa !== null && (qa.id === 'sleep' || qa.id === 'bathe')) continue;
        const r = p.relationships.get(q.id);
        if (r && tick - (r._talk || -999) < 6) continue; // same pair cooldown (1 hour)
        cands.push(q);
      }
      if (!cands.length) continue;
      const other = rng.weighted(cands, (q) => {
        const r = p.relationships.get(q.id);
        let w = 0.4;
        if (r) w += r.familiarity * 2 + Math.max(0, r.affinity) * 2 + (r.attraction > 0.3 ? 1 : 0) - Math.max(0, -r.affinity) * 0.8 + (r.grudge || 0) * (has(p, 'hothead') ? 2 : 0);
        if (p._visitFriendId === q.id) w += 4;
        if (tick - p.birthTick < 12 * TPY && tick - q.birthTick < 12 * TPY) w += 1;
        return Math.max(0.05, w);
      });
      if (!loc) {
        // outdoor passers-by: only a brief greeting unless acquainted
        const r = p.relationships.get(other.id);
        if (!r || r.familiarity < 0.2) { converse(world, p, other, { type: 'greeting' }); p._nextTalk = other._nextTalk = tick + 2; continue; }
      }
      const dur = rng.int(2, 5);
      converse(world, p, other);
      p._nextTalk = tick + dur; other._nextTalk = tick + dur;
    }
  }
}

// ---------------------------------------------------------------- daily upkeep
const DECAY_DAYS = 4; // relationship upkeep + reputation run every 4th day with 4x step sizes
function dailyDecay(world) {
  const tick = world.tick, K = DECAY_DAYS;
  for (const p of world.living()) {
    const rels = p.relationships;
    const spouse = p.family.spouseId;
    for (const [id, r] of rels) {
      if (r.grudge) r.grudge = Math.max(0, r.grudge - 0.004 * K);
      const days = (tick - Math.max(r.lastTick || 0, r._talk || 0)) / TPD;
      if (days < 10) continue;
      const tg = r.tags;
      const fam = spouse === id || (tg.length > 0 && tg.includes('family'));
      // prune stale passing acquaintances (keeps relationship maps small: they are scanned by many systems)
      if (!fam && days >= 25 && r.familiarity < 0.2 && !r.grudge && (tg.length === 0 || (tg.length === 1 && tg[0] === 'acquaintance')) && r.attraction < 0.3 && r.affinity > -0.2 && r.affinity < 0.2) { rels.delete(id); continue; }
      const k = fam ? 0.15 : 1;
      r.familiarity = Math.max(fam ? 0.5 : 0, r.familiarity - 0.0012 * k * K);
      if (!fam && r.affinity > 0 && tg.length < 6) r.affinity = Math.max(0, r.affinity - 0.002 * K * (1 + days / 60));
      else if (!fam && r.affinity < 0) r.affinity = Math.min(0, r.affinity + 0.0015 * K); // anger cools
      if (!fam && (tg.length > 1 || (tg.length === 1 && tg[0] !== 'family'))) { const o = world.people.get(id); if (o) updateTags(world, p, o, r); }
    }
    if (p._hang) { for (const [k, v] of p._hang) { const nv = v * 0.885; if (nv < 0.4) p._hang.delete(k); else p._hang.set(k, nv); } }
  }
}
function updateReputation(world) {
  const sum = new Map(), cnt = new Map();
  for (const p of world.living()) {
    if (!p.relationships) continue;
    for (const [id, r] of p.relationships) {
      if (r.familiarity < 0.1) continue;
      const w = 0.3 + r.familiarity;
      sum.set(id, (sum.get(id) || 0) + (r.affinity * 0.8 + r.respect * 0.2) * w);
      cnt.set(id, (cnt.get(id) || 0) + w);
    }
  }
  for (const p of world.living()) {
    const c = cnt.get(p.id) || 0;
    const target = c ? (sum.get(p.id) / c) * Math.min(1, c / 4) * 1.6 : 0;
    p.reputation = clamp((p.reputation || 0) + (target - (p.reputation || 0)) * (1 - Math.pow(0.92, DECAY_DAYS)), -1, 1);
  }
}
function fadeRumors(world) {
  const S = st(world), tick = world.tick;
  for (const p of world.living()) {
    if (!p.rumors || !p.rumors.length) continue;
    p.rumors = p.rumors.filter((r) => {
      const age = (tick - r.tick) / TPD;
      return age < 18 + 70 * r.severity;
    });
  }
  for (const [id, r] of S.rumors) if (tick - r.tick > 160 * TPD) S.rumors.delete(id);
}
function ambientRumors(world) {
  const rng = world.rng, S = st(world), living = world.living();
  const n = 1 + Math.floor(living.length / 120) + (rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const p = rng.pick(living);
    if (!p || ageOf(world, p) < 15) continue;
    const kinds = [];
    if (p.money < 4 && p.job !== 'student' && p.job !== 'retired') kinds.push(['debt', 2]);
    if (has(p, 'drunkard')) kinds.push(['drunk', 3]);
    if (has(p, 'kind') || (p.reputation || 0) > 0.4) kinds.push(['praise', 2]);
    if (has(p, 'thief')) kinds.push(['suspicion', 3, true]);
    else if (has(p, 'greedy') && rng.chance(0.3)) kinds.push(['suspicion', 1, false]);
    if (p.romance && p.romance.status === 'dating' && p.romance.partnerId != null) kinds.push(['courtship', 4]);
    if (p.family && p.family.spouseId != null) {
      const r = p.relationships.get(p.family.spouseId);
      if (r && r.affinity < 0.2) kinds.push(['trouble', 3]);
    }
    if (!kinds.length) continue;
    const k = rng.weighted(kinds, (x) => x[1]);
    const ctx = {};
    if (k[0] === 'courtship') ctx.other = world.people.get(p.romance.partnerId);
    const r = createRumor(world, { aboutId: p.id, kind: k[0], truth: k[2] === undefined ? true : k[2], ctx });
    if (r) birthRumor(world, r, seedFor(world, p.id, rng.int(1, 2)));
  }
  // pregnancies
  for (const p of living) {
    if (p.pregnant && !p._pregRumor && ageOf(world, p) >= 14 && world.tick > (p.pregnant.dueTick || 0) - 4 * 28 * TPD) {
      p._pregRumor = true;
      const near = [];
      if (p.family && p.family.spouseId != null) near.push(p.family.spouseId);
      for (const f of getFriends(world, p).slice(0, 2)) near.push(f.id);
      const r = createRumor(world, { aboutId: p.id, kind: 'pregnancy', truth: true });
      if (r) birthRumor(world, r, seedFor(world, p.id, 2, near));
    }
    if (!p.pregnant && p._pregRumor) p._pregRumor = false;
  }
}
function loneliness(world) {
  for (const p of world.living()) {
    p._talkCount = (p._talkCount || 0) * 0.86;
    const age = ageOf(world, p);
    if (age < 8) continue;
    if ((p._talkCount || 0) < 0.8 && p.needs.social < 0.35) {
      let nf = 0;
      for (const [id, r] of p.relationships) if (r.tags.length && (r.tags.includes('friend') || r.tags.includes('close_friend'))) { const o = world.people.get(id); if (o && o.alive && ++nf > 1) break; }
      if (nf <= 1) { addMoodlet(world, p, 'lonely', 'Lonely and isolated', -0.15 - 0.1 * (1 - p.personality.extraversion < 0.5 ? 1 : 0), 3 * TPD); if (!p._thoughtTick || world.tick - p._thoughtTick > 20) think(world, p, 'Nobody has spoken to me properly in days.'); }
    }
  }
}
function buildCliques(world) {
  const S = st(world);
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const living = world.living();
  for (const p of living) parent.set(p.id, p.id);
  for (const p of living) {
    if (!p.relationships) continue;
    for (const [id, r] of p.relationships) {
      if (r.affinity < 0.4 || r.tags.includes('family') || !parent.has(id)) continue;
      const o = world.people.get(id);
      const back = o.relationships.get(p.id);
      if (!back || back.affinity < 0.4) continue;
      const a = find(p.id), b = find(id);
      if (a !== b) parent.set(a, b);
    }
  }
  const groups = new Map();
  for (const p of living) { const r = find(p.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
  const prev = S.cliques;
  const out = [];
  let ci = 1;
  for (const mem of groups.values()) {
    if (mem.length < 3 || mem.length > 14) continue;
    const hc = new Map();
    for (const p of mem) if (p._hang) for (const [k, v] of p._hang) hc.set(k, (hc.get(k) || 0) + v);
    let hid = null, hv = 0;
    for (const [k, v] of hc) if (v > hv) { hv = v; hid = k; }
    const hb = hid != null ? world.buildings.get(hid) : null;
    const ids = mem.map((p) => p.id);
    const old = prev.find((c) => { const ov = c.members.filter((x) => ids.includes(x)).length; return ov >= Math.min(c.members.length, ids.length) * 0.6; });
    const name = old ? old.name : hb ? `the ${hb.name || hb.type} crowd` : `the ${mem[0].lastName} circle`;
    const cl = { id: ci++, members: ids, hangout: hid, name };
    out.push(cl);
    for (const p of mem) p.cliqueId = cl.id;
    if (!old && mem.length >= 4) {
      const who = mem.slice(0, 3).map((p) => p.firstName).join(', ');
      chron(world, { type: 'clique', text: `A tight circle has formed around ${who} and ${mem.length - 3} other${mem.length - 3 > 1 ? 's' : ''}; ${hb ? 'they gather most days at ' + (hb.name || 'the ' + hb.type) : 'they are seldom apart'}.`, people: ids.slice(0, 6) }, 2);
    }
  }
  const inClique = new Set(out.flatMap((c) => c.members));
  for (const p of living) if (!inClique.has(p.id)) p.cliqueId = null;
  S.cliques = out;
}

// ---------------------------------------------------------------- event hooks
function onCrime(world, e) {
  if (!e || e.hidden === true || e.known === false) return;
  const perp = pid(e.perpetrator ?? e.perpetratorId ?? e.criminal ?? e.culprit ?? e.offender ?? e.thief ?? e.actor ?? e.person);
  if (perp == null || !world.people.get(perp)) return;
  const victim = pid(e.victim ?? e.victimId);
  const crime = e.kind || e.crime || e.type || 'crime';
  const near = [];
  if (victim != null) near.push(victim);
  if (e.buildingId != null) for (const p of (world.peopleAt(e.buildingId) || []).slice(0, 3)) if (p.id !== perp) near.push(p.id);
  const r = createRumor(world, { aboutId: perp, kind: 'crime', truth: true, ctx: { crime } });
  if (r) birthRumor(world, r, seedFor(world, perp, 2, near));
}
function onAffair(world, e) {
  const who = pid(e.cheater ?? e.person ?? e.a);
  const other = pid(e.other ?? e.b);
  if (who == null || !world.people.get(who)) return;
  const r = createRumor(world, { aboutId: who, kind: 'affair', truth: true, ctx: { other: world.people.get(other) } });
  // an affair first leaks to a few; secrecy means slow start
  if (r && world.rng.chance(0.7)) birthRumor(world, r, seedFor(world, who, 1));
}
function onScandal(world, e) {
  const who = pid(e.person ?? e.aboutId ?? e.a);
  if (who == null || !world.people.get(who)) return;
  const r = createRumor(world, { aboutId: who, kind: e.kind || 'scandal', text: e.text, truth: e.truth !== false });
  if (r) birthRumor(world, r, seedFor(world, who, 2));
}
function onDivorce(world, e) {
  const a = world.people.get(pid(e.a)), b = world.people.get(pid(e.b));
  if (!a || !b) return;
  const blamed = world.rng.chance(0.5) ? a : b;
  const r = createRumor(world, { aboutId: blamed.id, kind: 'divorce', truth: true });
  if (r) birthRumor(world, r, seedFor(world, blamed.id, 3));
}

// ---------------------------------------------------------------- leisure bias
const LEISURE = /soci|chat|visit|tavern|drink|park|relax_park|wander|pray|play|eat_tavern/;
function whereId(world, p, action) {
  try {
    const w = action.where ? action.where(world, p) : null;
    if (w == null) return null;
    return typeof w === 'object' ? (w.id ?? w.buildingId ?? null) : w;
  } catch (e) { return null; }
}
const scoreModifiers = [
  function socialBias(world, p, action, score) {
    let lf = action._leisure;
    if (lf === undefined) lf = action._leisure = LEISURE.test(action.id) ? (/soci|chat|visit/.test(action.id) ? 2 : 1) : 0;
    if (lf === 0 || !(score > 0)) return score;
    const S = world.social;
    if (!S) return score;
    let m = 1;
    if (lf === 2) m += 0.5 * (1 - p.needs.social) * (p._talkCount < 0.8 ? 1.5 : 1);
    // use the target chosen by the brain context when available, else ask the action
    let id = world.brain.ctx.target;
    if (id == null && action.where) id = whereId(world, p, action);
    else if (typeof id === 'object') id = null;
    if (id != null) {
      const arr = S.at.get(id);
      if (arr && arr.length > 1) {
        let f = 0, e = 0;
        const rels = p.relationships;
        for (let i = 0; i < arr.length && i < 16; i++) {
          const o = arr[i];
          if (o === p) continue;
          const r = rels.get(o.id);
          if (r === undefined || r.tags.length === 0) continue;
          const tg = r.tags;
          if (tg.includes('close_friend')) f += 1.4; else if (tg.includes('friend')) f += 1; else if (tg.includes('enemy')) e += 1.2; else if (tg.includes('rival')) e += 0.6;
        }
        m += Math.min(0.6, f * 0.18) * (0.5 + p.personality.extraversion) - Math.min(0.5, e * 0.2);
      }
      if (p._hang && p._hang.has(id)) m += Math.min(0.3, p._hang.get(id) * 0.02);
    }
    return score * Math.max(0.3, m);
  },
];

// ---------------------------------------------------------------- interventions
function registerInterventions(world) {
  if (!world.registerIntervention) return;
  const reg = (kind, desc, fn) => { fn.description = desc; world.registerIntervention(kind, fn, desc); };
  reg('spreadRumor', 'Fabricate a rumor about a person ({aboutId, kind, text?, truth?, sourceId?, seeds?}).', (w, params = {}) => {
    const about = w.people.get(pid(params.aboutId));
    if (!about) return { ok: false, error: 'no such person' };
    const r = createRumor(w, { aboutId: about.id, kind: params.kind || 'scandal', text: params.text, truth: params.truth === true });
    if (!r) return { ok: false };
    const src = params.sourceId != null ? [w.people.get(pid(params.sourceId))].filter(Boolean) : seedFor(w, about.id, params.seeds || 3);
    for (const s of src) spreadRumor(w, s.id, r);
    return { ok: true, rumorId: r.id, text: r.text, seeded: src.map((s) => s.id) };
  });
  reg('setRelationship', 'Set a relationship ({a, b, affinity?, trust?, familiarity?, respect?, attraction?, tags?, mutual?}).', (w, params = {}) => {
    const a = w.people.get(pid(params.a)), b = w.people.get(pid(params.b));
    if (!a || !b) return { ok: false, error: 'no such person' };
    const pairs = params.mutual === false ? [[a, b]] : [[a, b], [b, a]];
    for (const [x, y] of pairs) {
      const r = rel(x, y);
      for (const k of ['affinity', 'trust', 'familiarity', 'respect', 'attraction']) if (typeof params[k] === 'number') r[k] = clamp(params[k], k === 'affinity' || k === 'respect' ? -1 : 0, 1);
      if (Array.isArray(params.tags)) r.tags = params.tags.slice();
      else updateTags(w, x, y, r);
      r.lastTick = w.tick;
    }
    return { ok: true };
  });
  reg('moodBoost', 'Boost (or sour) mood ({personId | all:true, value, label?, days?}).', (w, params = {}) => {
    const v = typeof params.value === 'number' ? params.value : 0.3;
    const targets = params.all ? w.living() : [w.people.get(pid(params.personId))].filter(Boolean);
    for (const p of targets) { addMoodlet(w, p, 'divine_mood', params.label || (v >= 0 ? 'Inexplicably cheerful' : 'A strange gloom'), v, Math.round((params.days || 3) * TPD)); if (p.needs && v > 0) p.needs.social = clamp(p.needs.social + 0.2, 0, 1); }
    return { ok: true, count: targets.length };
  });
}

export default {
  name: 'social',
  init(world) {
    const S = st(world);
    registerInterventions(world);
    world.on('crime', (e) => onCrime(world, e));
    world.on('affair', (e) => onAffair(world, e));
    world.on('scandal', (e) => onScandal(world, e));
    world.on('divorce', (e) => onDivorce(world, e));
    world.on('death', (e) => {
      // the dead are talked about kindly; their rumors lose bite
      const p = e && (e.person && typeof e.person === 'object' ? e.person : world.people.get(pid(e.person)));
      if (p) p._nextTalk = Infinity;
    });
    world.social_api = { converse, spreadRumor, createRumor, getFriends, getEnemies, getClique, hear, addMoodlet };
    for (const p of world.living()) if (p.relationships) for (const [id, r] of p.relationships) { if (!r.tags) r.tags = []; const o = world.people.get(id); if (o && !isFam(r)) updateTags(world, p, o, r); }
  },
  onTick,
  onHour(world) {},
  onDay(world) {
    const S = st(world);
    S.chronToday = 0;
    if (world.time.totalDays % DECAY_DAYS === 0) { dailyDecay(world); updateReputation(world); }
    fadeRumors(world);
    ambientRumors(world);
    loneliness(world);
    if (world.time.totalDays % 7 === 0) buildCliques(world);
  },
  scoreModifiers,
  actions: [],
  helpers: { converse, spreadRumor, createRumor, getFriends, getEnemies, getClique, hear, addMoodlet },
};
