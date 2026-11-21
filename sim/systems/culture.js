// CULTURE: weather & seasons, festival calendar, temple & religion, ceremonies (christenings, funerals),
// natural disasters (fire, flood, storm, harsh winter), clubs & hobbies, emergent traditions and memorials.
// Pure sim code: world.rng only, no DOM. Never assumes every person is AI-driven (world.player is never forced).
import { clamp } from '../util.js';
import { isOpen, BUILDING_TYPES } from '../map.js';
import { createRumor, spreadRumor } from './social.js';

const DAY = 144;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
const has = (p, t) => !!p && p.traits.includes(t);
const he = (p) => (p.sex === 'F' ? 'she' : 'he');
const his = (p) => (p.sex === 'F' ? 'her' : 'his');
const ordinal = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] || `${n}th`;
const isPlayer = (w, p) => w.player != null && w.player === p.id;
const jailed = (w, p) => (p.jailedUntil || 0) > w.tick;
const C = (w) => w.culture;
const skill = (p, k) => (p.skills && p.skills[k]) || 0;
function town(w) { w.town = w.town || {}; if (typeof w.town.treasury !== 'number') w.town.treasury = 0; return w.town; }
function chron(w, type, importance, text, people, buildingId) { return w.chronicle.add({ type, importance, text, people: (people || []).filter((x) => x != null), buildingId }); }
function mood(w, p, id, label, v, ticks) { w.moodlet(p, id, label, v, ticks); }
function mem(w, p, type, text, others, weight, imp) { if (p && p.alive) w.addMemory(p, { type, text, otherIds: others || [], weight, importance: imp }); }
function cx(p) { if (!p.ext) p.ext = {}; if (!p.ext.culture) p.ext.culture = { attended: 0, services: 0, drinks: 0, gamble: 0, temperanceUntil: 0 }; return p.ext.culture; }
function bn(b) { return b ? (b.name || BUILDING_TYPES[b.type]?.label || b.type) : 'the street'; }
function squareId(w) { return w.map?.squareId ?? w.buildingsOfType('square')[0]?.id ?? null; }
function temple(w) { return w.buildingsOfType('temple')[0] || null; }
function priestOf(w) { const t = temple(w); const id = t && t.employees.find((i) => { const p = w.people.get(i); return p && p.alive && p.job === 'priest'; }); return id != null ? w.people.get(id) : w.living().find((p) => p.job === 'priest') || null; }
function season(w) { return ['spring', 'summer', 'autumn', 'winter'][w.time.season]; }
function forceable(w, p) { return p && p.alive && !isPlayer(w, p) && !jailed(w, p) && !(p.illness && p.illness.severity > 0.5); }
function kinOf(p) { const f = p.family || {}; return [f.spouseId, f.fatherId, f.motherId, ...(f.childrenIds || []), ...(f.siblingIds || [])].filter((x) => x != null); }
function pickN(w, arr, n) { const a = arr.slice(); w.rng.shuffle(a); return a.slice(0, n); }
function list(names) { return names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]; }

// =================================================================== WEATHER
const SEASON_WET = [0.3, 0.16, 0.3, 0.3];
function baseTemp(doy) { return 10.5 + 10.5 * Math.sin((2 * Math.PI * (doy - 14)) / 112); }
function planWeather(w) {
  const st = C(w), t = w.time, r = w.rng, s = t.season;
  st.anom = 0.65 * st.anom + r.gauss(0, 2.4);
  if (st.harshWinterYear === t.year && s === 3) st.anom -= 0.8;
  let temp = baseTemp(t.day) + st.anom + (st.harshWinterYear === t.year && s === 3 ? -4 : 0);
  // wet spells persist
  const wetP = SEASON_WET[s] * (st.wetSpell ? 2.0 : 0.8);
  let plan = { type: 'clear', from: 0, to: 0, base: temp };
  const x = r.next();
  st.heatDays = st.heatDays || 0;
  if (s === 1 && (st.heatDays > 0 || (st.anom > 4 && r.chance(0.5)))) {
    if (st.heatDays <= 0) st.heatDays = r.int(3, 7);
    st.heatDays--; temp += 3.5; plan = { type: 'heatwave', from: 10, to: 19, base: temp };
  } else if (x < wetP) {
    st.wetSpell = true;
    const cold = temp < 0.5;
    const stormy = !cold && ((s === 1 && r.chance(0.22)) || (s === 2 && r.chance(0.14)) || (s === 0 && r.chance(0.1)) || (st.harshWinterYear === t.year && false));
    if (cold) { const from = r.int(3, 14); plan = { type: 'snow', from, to: from + r.int(3, 12), base: temp }; }
    else if (stormy) { const from = r.int(12, 19); plan = { type: 'storm', from, to: from + r.int(2, 5), base: temp }; }
    else { const from = r.int(2, 15); plan = { type: 'rain', from, to: from + r.int(3, 11), base: temp }; }
  } else {
    st.wetSpell = r.chance(0.25) ? st.wetSpell : false;
    if ((s === 2 || s === 3) && r.chance(s === 2 ? 0.1 : 0.07)) plan = { type: 'fog', from: 4, to: r.int(8, 11), base: temp };
  }
  st.plan = plan;
  // the river: rain and snow melt feed it
  const lv = st.river || (st.river = { level: 0.25, pack: 0 });
  lv.level *= 0.93;
  if (plan.type === 'rain') lv.level += 0.05; else if (plan.type === 'storm') lv.level += 0.11;
  if (plan.type === 'snow') lv.pack += 0.05;
  if (temp > 2 && lv.pack > 0) { const m = lv.pack * (t.season === 0 ? 0.1 : 0.15); lv.pack -= m; lv.level += m * 0.9; }
  if (temp < -3 && lv.pack > 0) lv.pack *= 0.995;
  applyHourWeather(w);
}
function applyHourWeather(w) {
  const st = C(w), h = w.time.hour, p = st.plan;
  if (!p) return;
  const inWin = h >= p.from && h < p.to;
  let type = 'clear';
  if (p.type !== 'clear' && inWin) type = p.type;
  const diurnal = -3.2 * Math.cos(((h - 4) / 24) * 2 * Math.PI) * 0.9;
  const temp = Math.round(p.base + diurnal + (type === 'rain' ? -1.5 : type === 'snow' ? 1 : 0));
  const prev = w.weather.type;
  w.weather = { type, temp, humidity: type === 'rain' || type === 'storm' || type === 'fog' ? 1 : 0.4, wind: type === 'storm' ? 3 : 0.5 };
  if (type === 'storm' && prev !== 'storm') stormDamage(w, 1);
}
const OUTDOOR_JOBS = new Set(['farmer', 'laborer', 'gardener', 'gravedigger']);
const scoreModifiers = [
  function weatherMod(world, p, action, score) {
    if (!(score > 0)) return score;
    const wt = world.weather && world.weather.type;
    const id = action.id;
    if (wt && wt !== 'clear' && wt !== 'fog') {
      const harsh = wt === 'storm' ? 0.2 : wt === 'snow' ? 0.6 : wt === 'rain' ? 0.55 : 0.75; // heatwave: lazy afternoons
      if (id === 'wander' || id === 'relax_park') score *= harsh;
      else if (id === 'visit_friend' || id === 'shop') score *= 0.5 + 0.5 * harsh;
      else if (id === 'work' && OUTDOOR_JOBS.has(p.job)) score *= wt === 'storm' ? 0.35 : wt === 'heatwave' ? 0.85 : 0.8 + 0.2 * harsh;
      else if (id === 'tavern' && wt !== 'heatwave') score *= 1.25;
      else if (id === 'relax_home' && wt !== 'heatwave') score *= 1.2;
      else if (id === 'tavern' && wt === 'heatwave') score *= 1.15;
    } else if (wt === 'clear' && world.weather.temp > 13 && world.weather.temp < 26 && (id === 'wander' || id === 'relax_park')) score *= 1.2;
    const cult = p.ext && p.ext.culture;
    if (cult && cult.temperanceUntil > world.tick && id === 'tavern') score *= 0.65;
    // rest-day church-going
    if (id === 'pray' && world.time.restDay && world.time.hour >= 8 && world.time.hour < 11) {
      const pi = (p.values && p.values.piety) ?? 0.4;
      score *= p.traits.includes('pious') ? 1.7 : pi > 0.6 ? 1.5 : pi < 0.3 ? 0.4 : 1;
    }
    // public holidays
    const F = world.town && world.town.festivalToday;
    if (F && F.kind === 'festival' && (id === 'work' || id === 'school') && world.time.hour >= F.startHour - 2) {
      if (!['tavernkeeper', 'server', 'innkeeper', 'doctor', 'nurse', 'guard', 'captain', 'baker'].includes(p.job)) score *= 0.12;
    }
    return score;
  },
];
function exposed(w, p) {
  if (p.locationId == null) return true;
  const b = w.buildings.get(p.locationId);
  return !!(b && b.open);
}
function weatherMoods(w) {
  const wt = w.weather.type, tmp = w.weather.temp;
  const sunny = wt === 'clear' && tmp > 14 && tmp < 27 && w.time.hour >= 9 && w.time.hour < 18;
  const bitter = tmp < -3 || wt === 'snow' || wt === 'rain' || wt === 'storm' || wt === 'heatwave';
  if (!bitter && !sunny) return;
  for (const p of w.living()) {
    if (!exposed(w, p)) continue;
    if (sunny) { mood(w, p, 'sun', 'Warm sun on the face', 0.05, 5 * 6); continue; }
    if (wt === 'storm') mood(w, p, 'weather', 'Caught in a storm', -0.2, 6 * 6);
    else if (wt === 'rain') mood(w, p, 'weather', 'Soaked by the rain', -0.08, 4 * 6);
    else if (wt === 'heatwave') mood(w, p, 'weather', 'Sweltering heat', -0.1, 4 * 6);
    else if (tmp < -3 || wt === 'snow') mood(w, p, 'weather', tmp < -6 ? 'Bitter cold' : 'Biting cold', tmp < -6 ? -0.18 : -0.08, 4 * 6);
  }
}

// =================================================================== DISASTERS
const FIRE_WEIGHT = { bakery: 3, smithy: 3, tavern: 2.2, mill: 1.6, carpenter: 2, house: 1, inn: 1.4, tailor: 1, farm: 1.1, market: 0.8, school: 0.4, temple: 0.4, townhall: 0.4, clinic: 0.5, jail: 0.3 };
const FIRE_CAUSE = {
  bakery: ['a spark from the oven flue', 'an overheated baking oven', 'a flour-dust flare near the ovens'],
  smithy: ['a stray ember from the forge', 'sparks from the forge catching the rafters'],
  tavern: ['a tipped lamp after closing', 'a kitchen fat fire', 'a drunken knock to a hanging lantern'],
  mill: ['grain dust catching a spark', 'a seized millstone throwing sparks'],
  carpenter: ['a heap of shavings near the stove', 'a glue-pot left on the fire'],
  house: ['a chimney fire in the thatch', 'a candle left burning by a sleeper', 'a spark from the hearth'],
  farm: ['a hay-loft fire', 'a lantern kicked over in the barn'],
};
function weightedBuilding(w, types) {
  const bs = [...w.buildings.values()].filter((b) => FIRE_WEIGHT[b.type] && (!types || types.includes(b.type)) && (b.condition ?? 1) > 0.15);
  if (!bs.length) return null;
  return w.rng.weighted(bs, (b) => FIRE_WEIGHT[b.type] * (1.3 - 0.5 * (b.condition ?? 1)));
}
function rehouse(w, b) {
  const res = b.residents.map((i) => w.people.get(i)).filter((p) => p && p.alive);
  if (!res.length) return 0;
  const vacant = [...w.buildings.values()].filter((h) => h.type === 'house' && h.id !== b.id && h.residents.length === 0 && (h.condition ?? 1) > 0.3);
  let moved = 0;
  let target = vacant.length ? w.rng.pick(vacant) : null;
  for (const p of res) {
    let dest = target;
    if (!dest) { // stay with kin or best friend
      const rel = [...kinOf(p)].map((i) => w.people.get(i)).filter((q) => q && q.alive && q.homeId != null && q.homeId !== b.id && q.homeId !== undefined);
      dest = rel.length ? w.buildings.get(rel[0].homeId) : null;
    }
    if (!dest) continue;
    b.residents = b.residents.filter((i) => i !== p.id);
    if (!dest.residents.includes(p.id)) dest.residents.push(p.id);
    p.homeId = dest.id; moved++;
    w.emit('moveHome', { person: p, homeId: dest.id });
  }
  return moved;
}
function addMemorial(w, kind, name, text, deaths) {
  const st = C(w), t = w.time;
  if (!deaths && kind !== 'flood' && kind !== 'winter' && kind !== 'fire-big') return;
  st.memorials.push({ id: 'm' + st.memorials.length, kind, name, text, doy: t.day, year: t.year, holds: 0, deaths });
}
function fire(w, b, opts = {}) {
  const st = C(w), r = w.rng, t = w.time;
  b = b || weightedBuilding(w);
  if (!b) return 'nothing to burn';
  const sev = clamp((opts.severity ?? r.float(0.35, 1)) * (b.type === 'house' ? 0.85 : 1), 0.15, 1);
  const spread = opts.spread ?? 0;
  const night = t.hour < 6 || t.hour >= 22;
  const inside = (w.peopleAt(b.id) || []).slice();
  const volunteers = (w.peopleNear(b.x + b.w / 2, b.y + b.h / 2, 22) || []).filter((p) => w.ageOf(p) >= 14 && !inside.includes(p));
  const watch = w.settings.watchFunding ?? 0.5;
  const mitigation = Math.min(0.7, volunteers.length * 0.03 + watch * 0.12 + (night ? -0.08 : 0.05));
  const dmg = clamp(sev * (1 - mitigation), 0.05, 0.98);
  const before = b.condition ?? 1;
  b.condition = Math.max(0.02, before - dmg);
  const gutted = b.condition < 0.15;
  const dead = [], hurt = [];
  for (const p of inside) {
    const age = w.ageOf(p);
    const frag = age > 65 || age < 5 ? 3 : 1;
    if (r.chance(dmg * 0.035 * frag * (night ? 2.2 : 1))) { dead.push(p); continue; }
    if (r.chance(dmg * 0.3)) { p.health = clamp((p.health ?? 1) - r.float(0.1, 0.4) * (1 + dmg), 0, 1); hurt.push(p); }
  }
  for (const p of dead) w.killPerson(p, 'died in the fire at ' + bn(b));
  // goods lost
  if (b.inventory) for (const k of Object.keys(b.inventory)) if (typeof b.inventory[k] === 'number' && ['food', 'grain', 'flour', 'bread', 'goods', 'cloth', 'timber'].includes(k)) b.inventory[k] *= 1 - dmg * 0.8;
  if (b.funds) b.funds *= 1 - dmg * 0.25;
  const owner = b.ownerId != null ? w.people.get(b.ownerId) : null;
  let rehoused = 0;
  if (gutted) { b.ruined = true; rehoused = rehouse(w, b); }
  const resident = b.residents.map((i) => w.people.get(i)).filter(Boolean);
  const victims = [...new Set([owner, ...resident, ...inside])].filter((p) => p && p.alive);
  // heroes
  volunteers.sort((a, c) => (c.genes.vitality + c.personality.extraversion * 0.3 + (has(c, 'kind') ? 0.2 : 0) + r.next() * 0.3) - (a.genes.vitality + a.personality.extraversion * 0.3 + (has(a, 'kind') ? 0.2 : 0) + r.next() * 0.3));
  const heroes = volunteers.slice(0, Math.min(3, Math.floor(volunteers.length / 3)));
  for (const p of volunteers) { mood(w, p, 'fire', 'Fought the fire', 0.05, 2 * DAY); }
  for (const h of heroes) { h.reputation = clamp((h.reputation || 0) + 0.04, -1, 1); mem(w, h, 'fire', `Fought the blaze at ${bn(b)} with a bucket line.`, [], 0.3, 3); }
  for (const p of victims) { mood(w, p, 'fireVictim', gutted ? 'Lost home or livelihood to fire' : 'Scorched by fire', gutted ? -0.5 : -0.2, 14 * DAY); mem(w, p, 'disaster', `The fire at ${bn(b)}${gutted ? ' took almost everything' : ' did its damage'}.`, [], -0.6, 5); }
  for (const p of w.living()) { if (!victims.includes(p) && r.chance(0.12)) mem(w, p, 'disaster', `Saw the smoke rise over ${bn(b)}.`, [], -0.2, 2); }
  // treasury & neighbours help the burnt out
  const T = town(w);
  if (gutted && T.treasury > 150 && (w.settings.poorRelief ?? 0.3) > 0.15) { const aid = Math.min(80, Math.round(T.treasury * 0.05)); T.treasury -= aid; const tgt = owner || victims[0]; if (tgt) tgt.money = (tgt.money || 0) + aid; }
  const cause = opts.cause || (FIRE_CAUSE[b.type] ? r.pick(FIRE_CAUSE[b.type]) : 'a stray spark');
  const text = [`FIRE at ${bn(b)}: ${cause}${night ? ' in the dead of night' : ''}.`, gutted ? `The building is gutted${rehoused ? ` and ${rehoused} of its household have been taken in by neighbours or kin` : ''}.` : `The damage is bad but the walls stand.`, volunteers.length ? `${volunteers.length} neighbours formed a bucket line${heroes[0] ? `, ${nm(heroes[0])} foremost among them` : ''}.` : 'Hardly anyone was near enough to help.', dead.length ? `${list(dead.map(nm))} ${dead.length > 1 ? 'did' : 'did'} not escape.` : hurt.length ? `${hurt.length} were hurt but all lived.` : 'Everyone got out alive.'].join(' ');
  chron(w, 'disaster', dead.length || gutted ? 5 : 4, text.replace('FIRE', 'Fire'), [owner?.id, ...dead.map((p) => p.id), heroes[0]?.id], b.id);
  w.emit('fire', { buildingId: b.id, severity: dmg, dead, gutted });
  w.emit('disaster', { kind: 'fire', buildingId: b.id });
  st.disasters.push({ kind: 'fire', tick: w.tick, buildingId: b.id, dead: dead.length });
  st.lastDisasterTick = w.tick;
  if (dead.length) addMemorial(w, 'fire', `the Fire at ${bn(b)}`, `the fire at ${bn(b)}`, dead.length);
  else if (gutted && b.type !== 'house') addMemorial(w, 'fire-big', `the Burning of ${bn(b)}`, `the fire that gutted ${bn(b)}`, 0);
  // spreading
  if (spread < 2) {
    const dry = w.weather.type === 'heatwave' ? 0.25 : w.weather.type === 'storm' ? 0.3 : 0.07;
    const near = [...w.buildings.values()].filter((o) => o.id !== b.id && FIRE_WEIGHT[o.type] && Math.abs(o.x - b.x) < 8 && Math.abs(o.y - b.y) < 8 && (o.condition ?? 1) > 0.2);
    if (sev > 0.5 && near.length && r.chance(dry * (1 - mitigation))) fire(w, r.pick(near), { severity: sev * 0.6, spread: spread + 1, cause: 'sparks carried over from the blaze next door' });
  }
  return `fire at ${bn(b)}${dead.length ? ` (${dead.length} dead)` : ''}`;
}
function stormDamage(w, mult) {
  const r = w.rng, st = C(w);
  const bs = [...w.buildings.values()].filter((b) => b.type !== 'park' && b.type !== 'cemetery' && b.type !== 'square');
  if (!bs.length) return 0;
  const n = Math.max(0, Math.round(r.int(1, 5) * mult * (r.chance(0.5) ? 1 : 0.5)));
  const hit = pickN(w, bs, n);
  for (const b of hit) b.condition = Math.max(0.05, (b.condition ?? 1) - r.float(0.02, 0.09) * mult);
  const T = town(w);
  if (T.bridgeCondition != null) T.bridgeCondition = Math.max(0, T.bridgeCondition - 0.02 * mult);
  if (hit.length >= 3 || mult > 1.4) chron(w, 'weather', hit.length >= 4 ? 4 : 3, r.pick([`A violent gale tears slates and shutters from ${hit.length} buildings, ${bn(hit[0])} worst of all.`, `Thunder rolls down the valley and the storm leaves ${hit.length} roofs the worse for wear, with ${bn(hit[0])} the hardest hit.`, `The storm rages through the evening; by morning fences are down in every lane and ${bn(hit[0])} is missing half its roof.`]), [], hit[0].id);
  if (r.chance(0.012 * mult)) { const b = weightedBuilding(w); if (b) fire(w, b, { cause: 'a lightning strike' }); }
  st.stormsThisYear++;
  return hit.length;
}
function flood(w, params = {}) {
  const st = C(w), r = w.rng, map = w.map;
  const sev = clamp(params.severity ?? r.float(0.4, 1), 0.2, 1);
  const rx = (y) => (map && map.riverX ? map.riverX[clamp(Math.round(y), 0, map.riverX.length - 1)] : 60);
  const dist = (b) => Math.abs(b.x + b.w / 2 - rx(b.y));
  const all = [...w.buildings.values()].filter((b) => b.type !== 'square' && b.type !== 'park').sort((a, b) => dist(a) - dist(b));
  const reach = 10 + sev * 16; // the river lies at the town's eastern edge: low farms and mill-side houses take the water first
  const low = all.filter((b, i) => dist(b) <= reach || i < 2);
  let dead = [];
  for (const b of low) {
    const d = r.float(0.08, 0.4) * sev;
    b.condition = Math.max(0.05, (b.condition ?? 1) - d);
    if (b.inventory) for (const k of Object.keys(b.inventory)) if (typeof b.inventory[k] === 'number' && k !== 'toolsWear') b.inventory[k] *= 1 - 0.5 * sev;
    for (const p of (w.peopleAt(b.id) || []).slice()) {
      const age = w.ageOf(p);
      if (r.chance(0.01 * sev * (age > 65 || age < 5 ? 3 : 1))) { dead.push(p); w.killPerson(p, 'drowned in the flood'); }
      else mood(w, p, 'flood', 'Flooded out', -0.3, 10 * DAY);
    }
    for (const id of b.residents) { const p = w.people.get(id); if (p && p.alive) { mood(w, p, 'flood', 'Flooded out', -0.3, 10 * DAY); mem(w, p, 'disaster', 'The river came into the house; we carried what we could upstairs.', [], -0.5, 4); } }
  }
  const T = town(w);
  let bridgeText = '';
  if (T.bridgeCondition != null) { if (T.bridgeCondition < 0.35 && sev > 0.5) { T.bridgeCondition = 0.05; bridgeText = ' The rotten old bridge is carried away in the night.'; } else { T.bridgeCondition = Math.max(0.1, T.bridgeCondition - 0.3 * sev); bridgeText = ' The bridge piers are scoured.'; } }
  chron(w, 'disaster', 5, `The river bursts its banks after ${w.time.season === 0 ? 'the thaw and spring rains' : 'days of rain'}: ${low.length} buildings take water${dead.length ? `, and ${list(dead.map(nm))} ${dead.length > 1 ? 'are' : 'is'} drowned` : ''}.${bridgeText}`, dead.map((p) => p.id), low[0]?.id);
  w.emit('disaster', { kind: 'flood', buildings: low.map((b) => b.id) });
  st.disasters.push({ kind: 'flood', tick: w.tick, dead: dead.length });
  st.lastDisasterTick = w.tick;
  st.river.level = 0.3;
  addMemorial(w, 'flood', 'Flood Day', 'the great flood', dead.length);
  return `flood: ${low.length} buildings`;
}
function harshWinterDaily(w) {
  const st = C(w), r = w.rng;
  if (st.harshWinterYear !== w.time.year || w.time.season !== 3) return;
  const T = town(w);
  for (const p of w.living()) {
    const age = w.ageOf(p);
    const vuln = age > 65 || age < 4 || ((p.money || 0) < 5 && (p.inventory?.food || 0) < 1);
    if (!vuln || !r.chance(0.18)) continue;
    p.health = clamp((p.health ?? 1) - r.float(0.01, 0.04), 0, 1);
    if (p.health < 0.04 && r.chance(0.12)) { st.winterDead.push(p.id); w.killPerson(p, 'the bitter cold of the hard winter'); }
  }
  T.harshWinter = true;
}
function dailyDisasters(w) {
  const st = C(w), r = w.rng, t = w.time;
  const watch = w.settings.watchFunding ?? 0.5;
  const dry = w.weather.type === 'heatwave' ? 2.5 : t.season === 3 ? 1.3 : 1;
  if (r.chance(0.0022 * dry * (1.25 - 0.5 * watch))) fire(w, weightedBuilding(w));
  if (st.river.level > st.floodAt && !st.floodedThisYear) { st.floodedThisYear = true; flood(w); }
  if (w.weather.type === 'storm' && t.hour === 0) { /* storms handled hourly */ }
  harshWinterDaily(w);
}

// =================================================================== FESTIVALS
import { CAL, OPENERS } from '../data/calendar.js';
function festivalFor(w) {
  const t = w.time;
  return CAL.find((f) => f.season === t.season && f.dos === t.dayOfSeason) || null;
}
function startEvent(w, def, extra = {}) {
  const st = C(w), T = town(w), t = w.time, r = w.rng;
  const pop = w.living().length, scale = pop / 220;
  const kind = extra.kind || 'festival';
  let venueId = extra.venueId ?? squareId(w);
  const wt = w.weather.type;
  let moved = false;
  if (kind === 'festival' && extra.venueId == null && (st.plan && (st.plan.type === 'storm' || (st.plan.type === 'snow' && t.season === 3 && false)))) { const mk = w.buildingsOfType('market')[0] || w.buildingsOfType('tavern')[0]; if (mk) { venueId = mk.id; moved = true; } }
  let cost = 0, quality = 0.5;
  if (kind === 'festival') {
    const budget = (w.settings.festivalBudget ?? 0.5) * 220 * scale + (extra.extraBudget || 0);
    cost = Math.min(budget, Math.max(0, T.treasury - 100));
    quality = clamp(cost / (110 * scale), 0, 1.5);
    T.treasury -= cost;
  }
  const attendeesGo = new Set();
  for (const p of w.living()) {
    const a = w.ageOf(p);
    if (jailed(w, p) || (p.illness && p.illness.severity > 0.4)) continue;
    let pr;
    if (kind === 'vigil') {
      const pi = (p.values && p.values.piety) ?? 0.4;
      pr = (has(p, 'pious') ? 0.55 : 0) + pi * 0.4 + ((p.values && p.values.community) ?? 0.5) * 0.25 + (extra.kin && extra.kin.has(p.id) ? 0.6 : 0);
      if (a < 10) pr *= 0.3;
    } else {
      pr = 0.55 + 0.35 * (p.personality.extraversion - 0.5) * 2 * 0.6 + (a < 14 ? 0.3 : 0) - (a > 72 ? 0.15 : 0) - (p.personality.neuroticism > 0.75 ? 0.1 : 0) - (has(p, 'shy') ? 0.12 : 0) + (has(p, 'drunkard') ? 0.15 : 0) + (has(p, 'romantic') ? 0.05 : 0);
    }
    if (r.chance(clamp(pr, kind === 'vigil' ? 0.02 : 0.25, 0.96))) attendeesGo.add(p.id);
  }
  const ev = { kind, id: def.id, name: def.name, short: def.short || def.name, def, venueId, startHour: extra.startHour ?? def.startHour, endHour: extra.endHour ?? def.endHour, go: attendeesGo, attendees: new Set(), cost, quality, moved, dances: [], drinks: new Map(), contestDone: false, brawl: null, startTick: w.tick, spontaneous: !!extra.spontaneous, memorial: extra.memorial || null, summarised: false, hotheads: 0 };
  st.today = ev;
  T.festivalToday = { id: ev.id, name: ev.name, kind, venueId, startHour: ev.startHour, endHour: ev.endHour, quality };
  w.emit('festival', { id: ev.id, name: ev.name, kind, venueId });
  if (kind === 'festival') {
    const op = r.pick(OPENERS[def.id] || OPENERS.spontaneous);
    const wtxt = wt === 'rain' || st.plan?.type === 'rain' ? ' despite the drizzle' : st.plan?.type === 'storm' ? ', driven indoors by the threatening sky' : st.plan?.type === 'heatwave' ? ' in oppressive heat' : st.plan?.type === 'snow' ? ' in a fall of snow' : '';
    if (moved && venueId != null) ev.moved = true;
    chron(w, 'festival', 2, `${op}: ${cap(ev.name)} begins${wtxt}${moved ? `, moved under cover at ${bn(w.buildings.get(venueId))}` : ''}. ${cost > 0 ? `The town purse has set aside ${Math.round(cost)} coins for food, ale and prizes.` : 'The treasury is bare, so it is a bring-your-own affair.'}`, [], venueId);
  }
  return ev;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function onFestivalAction(w, p) { const ev = C(w).today; if (ev && ev.attendees) ev.attendees.add(p.id); }
function festivalHour(w) {
  const st = C(w), ev = st.today, t = w.time, r = w.rng;
  if (!ev) return;
  const h = t.hour;
  const venue = w.buildings.get(ev.venueId);
  if (h >= ev.startHour && h < ev.endHour && venue) {
    const here = (w.peopleAt(ev.venueId) || []).filter((p) => w.ageOf(p) >= 8);
    const L = here.slice(); r.shuffle(L);
    const nPairs = Math.min(Math.floor(L.length / 4), 24);
    for (let i = 0; i < nPairs; i++) {
      const a = L[2 * i], b = L[2 * i + 1];
      if (!a || !b) break;
      const ra = w.getRel(a, b), rb = w.getRel(b, a);
      const mulA = 1, fam = 0.03 * ev.quality + 0.02;
      ra.familiarity = clamp((ra.familiarity || 0) + fam, 0, 1); rb.familiarity = clamp((rb.familiarity || 0) + fam, 0, 1);
      ra.affinity = clamp((ra.affinity || 0) + 0.02 * mulA, -1, 1); rb.affinity = clamp((rb.affinity || 0) + 0.02, -1, 1);
      const ageGap = Math.abs(w.ageOf(a) - w.ageOf(b));
      const adultsBoth = w.ageOf(a) >= 16 && w.ageOf(b) >= 16;
      if (adultsBoth && a.sex !== b.sex && ageGap < 14 && h >= 17) {
        const s = (ra.attraction || 0) + (rb.attraction || 0);
        ra.attraction = clamp((ra.attraction || 0) + 0.03, 0, 1); rb.attraction = clamp((rb.attraction || 0) + 0.03, 0, 1);
        const attached = (x) => x.romance && x.romance.status;
        if (s > 0.3) ev.dances.push({ a: a.id, b: b.id, s: s + (attached(a) ? 0 : 0.3) + (attached(b) ? 0 : 0.3), tick: w.tick });
      }
    }
    // brawl chance: two drunk hotheads with a grudge
    if (h >= 19 && !ev.brawl && L.length > 10 && r.chance(0.03)) {
      const drunk = L.filter((p) => (ev.drinks.get(p.id) || 0) >= 4 && (has(p, 'hothead') || p.personality.agreeableness < 0.3));
      if (drunk.length >= 2) {
        const a = drunk[0], b = drunk.find((x) => x !== a && w.relScore(a, x) < 0.1);
        if (b) { ev.brawl = [a.id, b.id]; const rr = w.getRel(a, b); rr.affinity = clamp(rr.affinity - 0.2, -1, 1); const r2 = w.getRel(b, a); r2.affinity = clamp(r2.affinity - 0.2, -1, 1); mem(w, a, 'brawl', `Got into a scuffle with ${nm(b)} at the ${ev.short || 'festival'}.`, [b.id], -0.4, 3); mem(w, b, 'brawl', `Got into a scuffle with ${nm(a)} at the ${ev.short || 'festival'}.`, [a.id], -0.4, 3); }
      }
    }
    // contest at mid-festival
    if (ev.kind === 'festival' && !ev.contestDone && h >= Math.floor((ev.startHour + ev.endHour) / 2) && ev.def.skill) runContest(w, ev, here);
  }
  if (h >= ev.endHour && !ev.summarised) endEvent(w, ev);
}
function runContest(w, ev, here) {
  const st = C(w), r = w.rng;
  ev.contestDone = true;
  const field = here.filter((p) => w.ageOf(p) >= 13 && w.ageOf(p) <= 60 && (ev.def.id !== 'midwinter' || true));
  if (field.length < 3) return;
  const score = (p) => Math.pow(skill(p, ev.def.skill) + 0.08, 1.4) * (ev.def.skill === 'athletics' ? (0.6 + p.genes.vitality * 0.6) * (1 - Math.max(0, w.ageOf(p) - 35) / 60) : 1) + r.float(0, 0.18);
  field.sort((a, b) => score(b) - score(a));
  const win = field[0];
  ev.winner = win.id;
  const hist = (st.records[ev.def.id] || (st.records[ev.def.id] = []));
  hist.push({ year: w.time.year, id: win.id });
  let streak = 0; for (let i = hist.length - 1; i >= 0 && hist[i].id === win.id; i--) streak++;
  ev.winStreak = streak;
  const prize = Math.round(ev.def.prize * (0.5 + ev.quality / 2));
  win.money = (win.money || 0) + prize;
  win.reputation = clamp((win.reputation || 0) + 0.03, -1, 1);
  mood(w, win, 'contestWin', 'Won the ' + ev.def.contest, 0.35, 5 * DAY);
  mem(w, win, 'festival', `Won the ${ev.def.contest} at ${ev.name}.`, [], 0.6, 3);
  const second = field[1];
  if (second && has(second, 'jealous')) mem(w, second, 'festival', `Lost the ${ev.def.contest} to ${nm(win)} and has not forgotten it.`, [win.id], -0.3, 2);
  if (streak === 3 && !st.traditions.some((x) => x.id === 'streak-' + ev.def.id + '-' + win.id)) addTradition(w, 'streak-' + ev.def.id + '-' + win.id, `${nm(win)} is now spoken of as the permanent champion of the ${ev.def.contest}; no one dares enter against ${he(win)} without a joke about it.`);
}
function addTradition(w, id, text) {
  const st = C(w);
  if (st.traditions.some((x) => x.id === id)) return;
  st.traditions.push({ id, text, tick: w.tick });
  chron(w, 'tradition', 3, `A custom takes root: ${text}`, []);
}
function endEvent(w, ev) {
  const st = C(w), T = town(w), r = w.rng;
  ev.summarised = true;
  const n = ev.attendees.size;
  const living = w.living().length || 1;
  const venue = w.buildings.get(ev.venueId);
  if (ev.kind === 'vigil') {
    for (const id of ev.attendees) { const p = w.people.get(id); if (p && p.alive) { mood(w, p, 'vigil', 'Remembered the dead together', 0.08, 2 * DAY); if (p.needs) p.needs.purpose = clamp(p.needs.purpose + 0.06, 0, 1); } }
    const m = ev.memorial;
    if (m) {
      m.holds++;
      const first = m.holds === 1;
      if (first) { st.traditions.push({ id: 'vigil-' + m.id, text: `an annual vigil for ${m.text}`, tick: w.tick }); chron(w, 'tradition', 3, `A year on, ${n} townsfolk gather at ${bn(venue)} with candles to remember ${m.text}${m.deaths ? ` and the ${m.deaths === 1 ? 'one' : m.deaths} lost` : ''}. Without anyone saying so, it becomes the town's custom.`, [], ev.venueId); }
      else if (m.holds <= 3 || r.chance(0.3)) chron(w, 'tradition', 2, `For the ${ordinal(m.holds)} year ${n} gather by candlelight to remember ${m.text}, ${m.holds > 5 ? 'now as much a part of the calendar as the festivals' : 'the old griefs still showing on some faces'}.`, [], ev.venueId);
    }
    T.festivalToday = null; st.today = null;
    return;
  }
  // festival aftermath
  const q = ev.quality;
  for (const id of ev.attendees) { const p = w.people.get(id); if (p && p.alive) mood(w, p, 'festival', `Enjoyed ${ev.short || ev.name}`, 0.18 + 0.14 * Math.min(1, q), 3 * DAY); }
  for (const p of w.living()) { if (ev.attendees.has(p.id)) continue; if (p.personality.extraversion > 0.6 && !ev.go.has(p.id)) mood(w, p, 'missedFest', 'Missed the festival', -0.06, DAY); }
  // trade
  const revenue = ev.cost * 0.35 + n * 0.9;
  const tav = w.buildingsOfType('tavern'), mk = w.buildingsOfType('market');
  if (tav.length) tav.forEach((b) => { b.funds = (b.funds || 0) + revenue * 0.4 / tav.length; });
  if (mk.length) mk.forEach((b) => { b.funds = (b.funds || 0) + revenue * 0.45 / mk.length; });
  const parts = [];
  const pct = Math.round((n / living) * 100);
  parts.push(`${cap(ev.name)} drew about ${n} souls (${pct}% of the town) to ${bn(venue)}.`);
  // dance
  const best = ev.dances.sort((a, b) => b.s - a.s)[0];
  if (best) {
    const a = w.people.get(best.a), b = w.people.get(best.b);
    if (a && b && a.alive && b.alive) {
      const attA = a.romance && a.romance.status, attB = b.romance && b.romance.status;
      const spouseOfOther = (attA && a.romance.partnerId !== b.id) || (attB && b.romance.partnerId !== a.id);
      if (spouseOfOther) {
        parts.push(`${nm(a)} and ${nm(b)} danced rather closer than ${a.romance && a.romance.partnerId != null && a.romance.partnerId !== b.id ? 'a married person' : 'a betrothed one'} should, and tongues wagged by the third reel.`);
        if (r.chance(0.35)) { try { const rum = createRumor(w, { aboutId: attA && a.romance.partnerId !== b.id ? a.id : b.id, kind: 'affair', ctx: { other: attA && a.romance.partnerId !== b.id ? b : a } }); if (rum) { const wit = w.living().filter((p) => ev.attendees.has(p.id)); for (let i = 0; i < 3 && wit.length; i++) { const x = r.pick(wit); spreadRumor(w, x.id, rum, r.pick(wit).id); } } } catch (e) { /* social absent */ } }
      } else if (!attA && !attB) parts.push(r.pick([`${nm(a)} and ${nm(b)} danced every set together and left, it was noticed, at the same time.`, `${nm(a)} and ${nm(b)} spent the evening at the edge of the dancers, talking, until the fiddler packed up.`, `A look passed between ${nm(a)} and ${nm(b)} across the lantern-light; ${a.firstName} blushed to the ears.`]));
      else parts.push(`${nm(a)} and ${nm(b)} led the dancing${attA && attB ? ' with their respective partners' : ''}.`);
      const e1 = w.getRel(a, b), e2 = w.getRel(b, a); e1.attraction = clamp(e1.attraction + 0.05, 0, 1); e2.attraction = clamp(e2.attraction + 0.05, 0, 1);
      mem(w, a, 'festival', `Danced with ${nm(b)} at ${ev.name}.`, [b.id], 0.4, 2); mem(w, b, 'festival', `Danced with ${nm(a)} at ${ev.name}.`, [a.id], 0.4, 2);
    }
  }
  // contest
  if (ev.winner != null) { const wp = w.people.get(ev.winner); if (wp) parts.push(ev.winStreak > 1 ? `${nm(wp)} took the ${ev.def.contest} for the ${ordinal(ev.winStreak)} year running.` : `${nm(wp)} won the ${ev.def.contest} and ${Math.round(ev.def.prize * (0.5 + q / 2))} coins.`); }
  // choir
  const choir = st.clubs.find((c) => c.interest === 'music' && c.active && (ev.id === 'midwinter' || ev.id === 'harvest'));
  if (choir) { choir.performed = (choir.performed || 0) + 1; choir.cohesion = Math.min(1, choir.cohesion + 0.05); parts.push(`${cap(choir.name)} sang ${ev.id === 'midwinter' ? 'the old carols' : 'a harvest hymn'}${r.chance(0.3) ? ', one soprano drowning out all the rest' : ''}.`); if (choir.performed >= 2 && ev.id === 'midwinter') addTradition(w, 'carol', `${choir.name} now sings at the Midwinter Lights, and no lantern is lit until the first carol has been sung.`); }
  // drink
  let top = null, tn = 0; for (const [id, c] of ev.drinks) if (c > tn) { tn = c; top = id; }
  if (top != null && tn >= 5) { const d = w.people.get(top); if (d && d.alive) { const friend = [...(d.family?.spouseId != null ? [d.family.spouseId] : []), ...kinOf(d)].map((i) => w.people.get(i)).find((x) => x && x.alive && ev.attendees.has(x.id)); parts.push(r.pick([`${nm(d)} was well in drink by dusk${friend ? ` and was steered home by ${nm(friend)}` : ' and slept it off under a cart'}.`, `${nm(d)} sang rather more verses than anyone had asked for.`, `${nm(d)} lost count of the cups and tried to dance with the fountain.`])); mood(w, d, 'hangover', 'Hungover', -0.18, DAY); mem(w, d, 'festival', `Drank too much at ${ev.name}.`, [], -0.2, 1); } }
  if (ev.brawl) { const a = w.people.get(ev.brawl[0]), b = w.people.get(ev.brawl[1]); if (a && b) parts.push(`A scuffle broke out between ${nm(a)} and ${nm(b)} that the watch had to part.`); }
  if (q < 0.2 && ev.kind === 'festival') parts.push('Fewer coins meant thin fare and thinner humour.');
  chron(w, 'festival', 3, parts.join(' '), [ev.winner, best?.a, best?.b, top].filter((x) => x != null), ev.venueId);
  w.emit('festivalEnd', { id: ev.id, attendance: n });
  st.festivalCount++;
  T.festivalToday = null; st.today = null;
}

// ----- memorial anniversaries
function checkMemorials(w) {
  const st = C(w), t = w.time;
  if (st.today) return;
  for (const m of st.memorials) {
    if (m.doy !== t.day || (m.year >= t.year) || m.holds > 12) continue;
    const venue = temple(w) || null;
    const kin = new Set();
    if (m.deaths) for (const p of w.living()) { if ((p.memories || []).some((mm) => mm.type === 'disaster' && mm.weight < -0.4)) kin.add(p.id); }
    startEvent(w, { id: 'vigil', name: 'the vigil', short: 'vigil', startHour: 18, endHour: 20 }, { kind: 'vigil', venueId: venue ? venue.id : squareId(w), startHour: 18, endHour: 20, memorial: m, kin });
    break;
  }
}

// =================================================================== RELIGION
const SERMONS = ['forgiveness', 'charity', 'temperance', 'humility', 'duty', 'thanksgiving', 'renewal', 'resilience'];
function sermonTopic(w) {
  const st = C(w), r = w.rng, t = w.time;
  if (st.lastDisasterTick && w.tick - st.lastDisasterTick < 20 * DAY && r.chance(0.7)) return 'resilience';
  const wts = { forgiveness: 1, charity: t.season === 3 ? 2.5 : 1, temperance: 0.8, humility: 0.8, duty: 0.8, thanksgiving: t.season === 2 ? 3 : 0.3, renewal: t.season === 0 ? 2.5 : 0.3, resilience: 0.2 };
  return r.weighted(SERMONS, (k) => wts[k]);
}
function sermon(w) {
  const st = C(w), r = w.rng, T = town(w);
  const tp = temple(w), pr = priestOf(w);
  if (!tp) return;
  const topic = sermonTopic(w);
  const quality = pr ? clamp(0.3 + skill(pr, 'charisma') * 0.7 + pr.genes.intellect * 0.3 + (has(pr, 'pious') ? 0.15 : 0), 0.2, 1.3) : 0.3;
  const hear = (w.peopleAt(tp.id) || []).filter((p) => !pr || p.id !== pr.id);
  let donated = 0;
  for (const p of hear) {
    const c = cx(p); c.services++; c.attended++;
    const pi = (p.values && p.values.piety) ?? 0.4;
    if (p.needs) { p.needs.social = clamp(p.needs.social + 0.04, 0, 1); p.needs.purpose = clamp(p.needs.purpose + 0.05, 0, 1); }
    mood(w, p, 'service', 'Found comfort at the service', 0.05 + 0.05 * pi, DAY);
    if (p.values) p.values.piety = clamp(p.values.piety + 0.0015 * quality, 0, 1);
    if (topic === 'charity' && (p.money || 0) > 22 && pi > 0.4) { const g = Math.min(Math.round(1 + r.next() * 2 * quality), p.money); p.money -= g; donated += g; }
    else if ((p.money || 0) > 60 && pi > 0.55 && r.chance(0.3)) { p.money -= 1; donated += 1; }
    if (topic === 'temperance' && (has(p, 'drunkard') || (c.drinks || 0) > 5)) c.temperanceUntil = w.tick + 14 * DAY;
    if (topic === 'forgiveness' && r.chance(0.06 * quality)) { const en = [...p.relationships.entries()].find(([, rel]) => rel.affinity < -0.3 && rel.tags.includes('enemy')); if (en) { en[1].affinity = clamp(en[1].affinity + 0.08, -1, 1); const o = w.people.get(en[0]); if (o && o.alive) mem(w, p, 'service', `The sermon on forgiveness made me think of ${nm(o)}.`, [o.id], 0.1, 2); } }
    if (topic === 'humility' && has(p, 'ambitious') && r.chance(0.02)) mem(w, p, 'service', 'Sat through a sermon on humility and felt it was aimed at me.', [], -0.1, 1);
  }
  if (donated) { T.almsBox = (T.almsBox || 0) + donated * 0.7; tp.funds = (tp.funds || 0) + donated * 0.3; }
  st.services++;
  st.lastSermon = { tick: w.tick, topic, attendance: hear.length };
  w.emit('sermon', { priest: pr || null, topic, attendance: hear.length });
  const mayor = T.mayorId != null ? w.people.get(T.mayorId) : null;
  // notable sermons reach the chronicle: after disasters, to full houses, or against a scandal
  const special = topic === 'resilience' || hear.length > 105;
  if (pr && (special && r.chance(0.4) || r.chance(0.02))) {
    const title = pr.sex === 'F' ? 'Mother' : 'Father';
    const lines = {
      forgiveness: `${title} ${pr.lastName} preaches forgiveness from the pulpit, and ${hear.length > 30 ? 'a full temple listens with bowed heads' : 'those who needed to hear it shifted in their pews'}.`,
      charity: `${title} ${pr.lastName} reminds a congregation of ${hear.length} that the poor-box is half empty; ${Math.round(donated)} coins go in before the doors are closed.`,
      temperance: `${title} ${pr.lastName} thunders against the tavern; a few red faces look at their boots and the innkeepers expect a quiet week.`,
      humility: `${title} ${pr.lastName}'s sermon on humility is judged "pointed" by those who thought they knew who it was for.`,
      duty: `${title} ${pr.lastName} preaches on duty to neighbour and town${mayor ? `, with Mayor ${nm(mayor)} in the front pew` : ''}.`,
      thanksgiving: `${title} ${pr.lastName} leads the congregation in thanks for the harvest; sheaves are laid at the altar.`,
      renewal: `${title} ${pr.lastName} preaches renewal as the fields green; ${hear.length} townsfolk go out into the sun humming the hymn.`,
      resilience: `${title} ${pr.lastName} preaches comfort to a temple packed with ${hear.length} townsfolk still raw from the recent calamity.`,
    };
    chron(w, 'religion', topic === 'resilience' ? 3 : 2, lines[topic], [pr.id], tp.id);
  }
}
function scheduleSermon(w) {
  const t = w.time;
  if (!t.restDay) return;
  const pr = priestOf(w), tp = temple(w);
  if (t.hour === 8 && pr && tp && forceable(w, pr)) w.forceAction(pr, 'sermon', tp.id, { duration: 10, why: 'preaching the rest-day service', thought: 'Preaching to the congregation.' });
  if (t.hour === 10) sermon(w);
}
function pietyDrift(w) {
  for (const p of w.living()) {
    const c = cx(p);
    if (p.values && w.ageOf(p) >= 14) {
      const rate = c.services / 16; // ~16 rest days a year... 112/7
      const pi = p.values.piety;
      p.values.piety = clamp(pi + 0.02 * (rate - (0.2 + pi * 0.6)) + (w.ageOf(p) > 50 ? 0.004 : 0), 0, 1);
      if (p.values.piety > 0.72 && !p.traits.includes('pious') && w.rng.chance(0.08)) p.traits.push('pious');
      else if (p.values.piety < 0.2 && p.traits.includes('pious') && w.rng.chance(0.3)) p.traits.splice(p.traits.indexOf('pious'), 1);
    }
    c.services = 0; c.drinks = 0;
  }
}

// =================================================================== CEREMONIES
function queueChristening(w, ev) {
  const st = C(w), t = w.time;
  const child = ev.child; if (!child) return;
  const rest = (6 - t.weekday + 7) % 7 || 7;
  const days = rest < 3 ? rest + 7 : rest;
  st.ceremonies.push({ kind: 'christening', day: t.totalDays + days, hour: 11, childId: child.id, motherId: ev.mother?.id ?? child.family?.motherId, fatherId: ev.father?.id ?? child.family?.fatherId, state: 'pending' });
}
function queueFuneral(w, ev) {
  const st = C(w), p = ev.person; if (!p || w.ageOf(p) < 0.1) return;
  const kin = kinOf(p).filter((i) => { const q = w.people.get(i); return q && q.alive; });
  const friends = [];
  for (const [oid, rel] of p.relationships) { if (rel.affinity > 0.4 && rel.familiarity > 0.45) { const q = w.people.get(oid); if (q && q.alive) friends.push(oid); } }
  if (!kin.length && !friends.length) return;
  st.ceremonies.push({ kind: 'funeral', day: w.time.totalDays + 1, hour: 10, personId: p.id, mourners: [...new Set([...kin, ...friends])].slice(0, 30), state: 'pending', cause: ev.cause });
}
function ceremonyHour(w) {
  const st = C(w), t = w.time, r = w.rng;
  if (!st.ceremonies.length) return;
  const keep = [];
  for (const c of st.ceremonies) {
    if (c.state === 'pending') {
      if (t.totalDays < c.day || (t.totalDays === c.day && t.hour < c.hour)) { keep.push(c); continue; }
      if (t.totalDays > c.day + 1) continue; // missed (e.g. engine paused); drop
      startCeremony(w, c); c.state = 'running'; c.end = w.tick + 10; keep.push(c);
    } else if (c.state === 'running') {
      if (w.tick < c.end) { keep.push(c); continue; }
      finishCeremony(w, c);
    }
  }
  st.ceremonies = keep;
  void r;
}
function startCeremony(w, c) {
  const pr = priestOf(w), tp = temple(w);
  c.present = [];
  const go = (p, where, why, thought, dur) => { if (forceable(w, p) && w.forceAction(p, c.kind === 'funeral' ? 'funeral' : 'christening', where, { duration: dur, why, thought, data: { ceremony: c.kind } })) c.present.push(p.id); };
  if (c.kind === 'christening') {
    const child = w.people.get(c.childId); if (!child || !child.alive) { c.state = 'dead'; return; }
    const fam = [c.motherId, c.fatherId, child.family?.fatherId ? w.people.get(child.family.fatherId)?.family?.fatherId : null, child.family?.motherId ? w.people.get(child.family.motherId)?.family?.motherId : null].filter((x) => x != null);
    const sib = (w.people.get(c.motherId)?.family?.childrenIds || []).filter((i) => i !== c.childId).slice(0, 3);
    if (!tp) { c.state = 'dead'; return; }
    for (const id of [...new Set([...fam, ...sib])]) { const q = w.people.get(id); if (q && q.alive && w.ageOf(q) > 3) go(q, tp.id, 'christening', `Off to ${child.firstName}'s christening.`, 9); }
    if (pr) go(pr, tp.id, 'christening', 'Christening a child.', 9);
    // godparent: a trusted friend of the mother
    const m = w.people.get(c.motherId);
    if (m) { let best = null, bs = 0.35; for (const [oid, rel] of m.relationships) { const q = w.people.get(oid); if (q && q.alive && w.ageOf(q) >= 18 && oid !== c.fatherId && rel.affinity > bs && !kinOf(m).includes(oid)) { bs = rel.affinity; best = q; } } if (best) { c.godparent = best.id; go(best, tp.id, 'godparent', `Standing godparent to ${child.firstName}.`, 9); } }
  } else {
    const dead = w.people.get(c.personId); if (!dead) { c.state = 'dead'; return; }
    const cem = w.map?.cemeteryId != null ? w.buildings.get(w.map.cemeteryId) : w.buildingsOfType('cemetery')[0];
    const where = cem ? cem.id : tp ? tp.id : null; if (where == null) { c.state = 'dead'; return; }
    for (const id of c.mourners) { const q = w.people.get(id); if (q && q.alive && w.ageOf(q) >= 5) go(q, where, 'funeral', `Burying ${dead.firstName} ${dead.lastName}.`, 9); }
    if (pr) go(pr, where, 'funeral', `Burying ${dead.firstName} ${dead.lastName}.`, 9);
    c.where = where;
  }
}
function finishCeremony(w, c) {
  const r = w.rng, st = C(w);
  const present = (c.present || []).map((i) => w.people.get(i)).filter((p) => p && p.alive);
  if (c.kind === 'christening') {
    const child = w.people.get(c.childId); if (!child || !child.alive || present.length < 2) return;
    const gp = c.godparent != null ? w.people.get(c.godparent) : null;
    const m = w.people.get(c.motherId), f = w.people.get(c.fatherId);
    for (const p of present) { mood(w, p, 'christening', `Attended ${child.firstName}'s christening`, 0.12, DAY); if (p.values) p.values.piety = clamp(p.values.piety + 0.002, 0, 1); }
    if (gp && gp.alive) { const a = w.getRel(gp, child), b = w.getRel(m, gp); a.affinity = clamp(a.affinity + 0.3, -1, 1); a.familiarity = clamp(a.familiarity + 0.3, 0, 1); if (!a.tags.includes('godchild')) a.tags.push('godchild'); b.trust = clamp(b.trust + 0.1, 0, 1); mem(w, gp, 'christening', `Stood godparent to ${child.firstName} ${child.lastName}.`, [child.id], 0.5, 3); }
    if (r.chance(0.3) || (m && m.family && m.family.childrenIds.length <= 1)) chron(w, 'religion', 1, r.pick([`${child.firstName} ${child.lastName} is christened at the temple${gp ? `, ${nm(gp)} standing godparent` : ''}; the baby slept through all of it.`, `Little ${child.firstName} is christened amid ${present.length} well-wishers${f ? `, ${nm(f)} beaming` : ''}.`, `The christening of ${nm(child)} fills the front pews with relatives${gp ? `, and ${nm(gp)} takes on the role of godparent` : ''}.`]), [child.id, m?.id, gp?.id]);
  } else {
    const dead = w.people.get(c.personId);
    for (const p of present) { mood(w, p, 'funeral', `Mourned ${dead ? dead.firstName : 'a friend'} at the funeral`, -0.12, 2 * DAY); const rel = dead && w.getRel(p, dead); if (rel && rel.affinity > 0.5) mem(w, p, 'funeral', `Stood at the graveside as ${nm(dead)} was laid to rest.`, [dead.id], -0.5, 3); if (p.values && w.ageOf(p) > 14) p.values.piety = clamp(p.values.piety + (p.traits.includes('pious') ? 0.01 : 0.002), 0, 1); }
    const mayor = dead && dead.id === w.town.mayorId, nb = present.length;
    const noteworthy = dead && (nb >= 14 || mayor || dead.job === 'priest' || (dead.reputation || 0) > 0.5 || (w.ageOf(dead) < 12 && r.chance(0.3)));
    if (noteworthy) chron(w, 'funeral', nb >= 14 ? 3 : 2, w.ageOf(dead) < 12 ? `A small coffin is carried to the cemetery; ${nb} neighbours follow ${dead.firstName}'s grieving family in silence.` : r.pick([`${nb >= 25 ? 'Half the town' : nb + ' mourners'} follow ${nm(dead)} to the cemetery${c.cause ? ` (${c.cause})` : ''}.`, `${nm(dead)} is laid to rest; ${nb} people stand in the cold${dead.job && dead.job !== 'retired' ? `, and the ${dead.job === 'unemployed' ? 'town' : dead.job + 's'} close ranks around the family` : ''}.`]), [dead.id]);
    for (const p of present) { const c2 = cx(p); c2.funerals = (c2.funerals || 0) + 1; }
  }
  void st;
}
function onDeath(w, ev) {
  const p = ev && ev.person; if (!p) return;
  queueFuneral(w, ev);
  // grief shapes faith
  const f = p.family || {};
  const grievers = [f.spouseId, ...(f.childrenIds || []), f.fatherId, f.motherId].filter((x) => x != null).map((i) => w.people.get(i)).filter((q) => q && q.alive && q.values);
  for (const q of grievers) {
    const pi = q.values.piety;
    const turn = q.personality.neuroticism > 0.6 ? -0.02 : 0.02; // some find God, some lose Him
    q.values.piety = clamp(pi + (pi > 0.5 ? Math.abs(turn) : turn) * (w.ageOf(p) < 12 ? 2 : 1), 0, 1);
  }
}

// =================================================================== CLUBS
const CLUB_DEFS = {
  music: { names: ['the Hollowmere Choir', 'the Temple Singers', 'the Thursday Voices'], venue: 'temple', hour: 19, skill: 'charisma', verb: 'rehearsed hymns and glees' },
  gambling: { names: ['the Card Table', 'the Tavern Dicers', 'the Wednesday Hand'], venue: 'tavern', hour: 20, skill: 'trade', verb: 'played for pennies' },
  books: { names: ['the Reading Circle', 'the Almanac Society', 'the Lamplight Readers'], venue: 'inn', hour: 19, skill: 'scholarship', verb: 'read aloud and argued over it' },
  storytelling: { names: ['the Fireside Tellers', 'the Tall-Tale Society'], venue: 'tavern', hour: 19, skill: 'charisma', verb: 'swapped stories' },
  gardening: { names: ['the Garden Society', 'the Allotment Club'], venue: 'park', hour: 16, skill: 'farming', verb: 'compared marrows and seedlings' },
  crafts: { names: ['the Crafters\' Circle', 'the Makers\' Evening'], venue: 'inn', hour: 18, skill: 'crafting', verb: 'worked on their pieces' },
  hunting: { names: ['the Hunting Fellowship', 'the Huntsmen\'s Table'], venue: 'tavern', hour: 19, skill: 'athletics', verb: 'planned the next hunt and told last season\'s tales' },
  sports: { names: ['the Wrestling Ring', 'the Square Athletes', 'the Sunday Football Men'], venue: 'square', hour: 17, skill: 'athletics', verb: 'wrestled and raced' },
  politics: { names: ['the Debating Society', 'the Civic Circle'], venue: 'townhall', hour: 16, skill: 'charisma', verb: 'debated the town\'s affairs' },
  religion: { names: ['the Temple Guild', 'the Almoners\' Guild'], venue: 'temple', hour: 18, skill: 'scholarship', verb: 'collected for the poor-box' },
  cooking: { names: ['the Cooks\' Circle', 'the Pie Society'], venue: 'inn', hour: 18, skill: 'cooking', verb: 'traded recipes' },
  farming: { names: ['the Farmers\' Grange', 'the Plough Club'], venue: 'tavern', hour: 19, skill: 'farming', verb: 'grumbled about prices and weather' },
};
function clubVenue(w, def, club) {
  const bs = w.buildingsOfType(def.venue);
  const b = bs.length ? (club && club.venueId != null ? w.buildings.get(club.venueId) : bs[0]) : (w.buildingsOfType('tavern')[0] || null);
  return b || null;
}
function clubPool(w, interest) {
  return w.living().filter((p) => w.ageOf(p) >= 14 && p.interests && p.interests.includes(interest) && !jailed(w, p) && p.job !== 'child');
}
function foundClubs(w) {
  const st = C(w), r = w.rng;
  for (const interest of Object.keys(CLUB_DEFS)) {
    if (st.clubs.some((c) => c.interest === interest && c.active)) continue;
    const def = CLUB_DEFS[interest];
    const pool = clubPool(w, interest);
    if (pool.length < 4 || !r.chance(0.35)) continue;
    pool.sort((a, b) => (b.personality.extraversion + skill(b, 'charisma') + (has(b, 'charming') ? 0.4 : 0)) - (a.personality.extraversion + skill(a, 'charisma') + (has(a, 'charming') ? 0.4 : 0)));
    const founder = pool[0];
    const members = [founder];
    for (const p of pool.slice(1)) { if (members.length >= 10) break; if (r.chance(0.35 + 0.5 * p.personality.extraversion + (w.relScore(founder, p) > 0.1 ? 0.2 : 0))) members.push(p); }
    if (members.length < 3) continue;
    const venue = clubVenue(w, def);
    if (!venue || !isOpen(venue, def.hour)) continue;
    const used = st.clubs.filter((c) => c.active).map((c) => c.day);
    let day = r.int(0, 4); for (let i = 0; i < 5 && used.filter((d) => d === day).length >= 2; i++) day = (day + 1) % 5;
    const club = { id: 'c' + st.nextClub++, interest, name: r.pick(def.names), day, hour: def.hour, venueId: venue.id, members: members.map((p) => p.id), founderId: founder.id, cohesion: 0.3, active: true, since: w.tick, meetings: 0, performed: 0, lastResolve: 0 };
    st.clubs.push(club);
    chron(w, 'club', 2, `${cap(club.name)} is formed by ${list(members.slice(0, 3).map(nm))}${members.length > 3 ? ` and ${members.length - 3} others` : ''}; they will meet at ${bn(venue)} on ${WEEKDAYS[day]} evenings${members.length >= 6 ? ', and the first night is standing room only' : ''}.`, members.slice(0, 3).map((p) => p.id), venue.id);
    for (const p of members) mem(w, p, 'club', `Joined ${club.name}.`, [founder.id], 0.3, 2);
  }
}
function updateClubs(w) {
  const st = C(w), r = w.rng;
  for (const c of st.clubs) {
    if (!c.active) continue;
    c.members = c.members.filter((i) => { const p = w.people.get(i); return p && p.alive; });
    const mem2 = c.members.map((i) => w.people.get(i));
    // leavers: those who fell out with another member, or the old and frail
    for (const p of mem2.slice()) {
      const foe = mem2.some((q) => q !== p && w.relScore(p, q) < -0.4);
      if ((foe && r.chance(0.3)) || (w.ageOf(p) > 78 && r.chance(0.2)) || (p.id !== c.founderId && r.chance(0.015))) c.members = c.members.filter((i) => i !== p.id);
    }
    // joiners: friends of members who share the interest, or the newly curious
    if (c.members.length < 14) {
      const pool = clubPool(w, c.interest).filter((p) => !c.members.includes(p.id));
      for (const p of pool) {
        const link = c.members.some((i) => w.relScore(p, w.people.get(i)) > 0.2);
        if (r.chance(0.04 + (link ? 0.12 : 0) + 0.06 * p.personality.extraversion)) { c.members.push(p.id); mem(w, p, 'club', `Joined ${c.name}.`, [], 0.2, 1); if (c.members.length >= 14) break; }
      }
    }
    if (c.members.length < 3) { c.active = false; chron(w, 'club', 1, `${cap(c.name)} has dwindled to nothing; the last meeting was just two people and a draught.`, c.members.slice(0, 2)); }
  }
}
function clubHour(w) {
  const st = C(w), t = w.time, r = w.rng;
  const F = w.town.festivalToday;
  for (const c of st.clubs) {
    if (!c.active) continue;
    const on = t.weekday === c.day && !t.restDay;
    if (!on) continue;
    if (t.hour === c.hour - 1 && !(F && F.kind === 'festival') && w.weather.type !== 'storm') {
      const venue = w.buildings.get(c.venueId); if (!venue) continue;
      let n = 0;
      for (const id of c.members) {
        const p = w.people.get(id); if (!forceable(w, p)) continue;
        if (p.needs && p.needs.energy < 0.2) continue;
        if (!r.chance(0.5 + 0.35 * p.personality.extraversion + (c.cohesion * 0.15))) continue;
        if (w.forceAction(p, 'club_meeting', venue.id, { duration: 12, why: `${c.name} meets tonight`, thought: `Off to ${c.name}.`, data: { clubId: c.id } })) n++;
      }
      c.pending = n;
    }
    if (t.hour === c.hour + 2 && c.lastResolve !== t.totalDays) { c.lastResolve = t.totalDays; resolveClub(w, c); }
  }
}
function resolveClub(w, c) {
  const r = w.rng, T = town(w);
  const att = c.members.map((i) => w.people.get(i)).filter((p) => p && p.alive && p.currentAction && p.currentAction.id === 'club_meeting' && p.currentAction.data && p.currentAction.data.clubId === c.id);
  if (att.length < 2) return;
  c.meetings++;
  c.cohesion = clamp(c.cohesion + 0.012, 0, 1);
  const def = CLUB_DEFS[c.interest];
  const L = att.slice(); r.shuffle(L);
  for (let i = 0; i + 1 < L.length && i < 12; i += 2) {
    const a = L[i], b = L[i + 1];
    const ra = w.getRel(a, b), rb = w.getRel(b, a);
    for (const x of [ra, rb]) { x.familiarity = clamp(x.familiarity + 0.03, 0, 1); x.affinity = clamp(x.affinity + 0.02 + 0.02 * c.cohesion, -1, 1); }
  }
  for (const p of att) { if (def.skill && p.skills) p.skills[def.skill] = clamp((p.skills[def.skill] || 0) + 0.002, 0, 1); if (p.needs) { p.needs.fun = clamp(p.needs.fun + 0.15, 0, 1); p.needs.social = clamp(p.needs.social + 0.2, 0, 1); } if (r.chance(0.5)) mood(w, p, 'club', `A good evening at ${c.name}`, 0.08, DAY); }
  if (c.interest === 'religion') { let g = 0; for (const p of att) if ((p.money || 0) > 12) { p.money -= 1; g++; } T.almsBox = (T.almsBox || 0) + g; }
  if (c.interest === 'gambling' && att.length >= 3) {
    const pot = [];
    for (let k = 0; k < Math.min(4, att.length); k++) {
      const loser = r.pick(att), win = r.pick(att);
      if (loser === win) continue;
      const stake = Math.min(loser.money || 0, r.int(1, 4) * (has(loser, 'greedy') || has(loser, 'drunkard') ? 3 : 1));
      if (stake <= 0) continue;
      loser.money -= stake; win.money = (win.money || 0) + stake; pot.push([win, loser, stake]);
      const lc = cx(loser); lc.gamble += stake;
      if (stake >= 9 && (loser.money || 0) < 8) { mem(w, loser, 'gambling', `Lost ${stake} coins to ${nm(win)} at the card table and went home with an empty purse.`, [win.id], -0.5, 3); mood(w, loser, 'gambleLoss', 'Cleaned out at cards', -0.2, 3 * DAY); const rel = w.getRel(loser, win); rel.affinity = clamp(rel.affinity - 0.05, -1, 1); }
    }
    pot.sort((a, b) => b[2] - a[2]);
    if (pot[0] && pot[0][2] >= 8 && r.chance(0.35)) chron(w, 'club', 2, `${nm(pot[0][0])} takes ${pot[0][2]} coins off ${nm(pot[0][1])} at ${c.name}; the loser is quiet on the walk home.`, [pot[0][0].id, pot[0][1].id], c.venueId);
  }
  if (r.chance(0.012)) {
    const [a, b] = [L[0], L[1]];
    chron(w, 'club', 1, r.pick([`${cap(c.name)} ${def.verb} until the lamps were low.`, `At ${c.name}, ${nm(a)} and ${nm(b)} fell into a long argument that neither would let drop.`, `${cap(c.name)} welcomes ${att.length} members tonight; ${nm(a)} brought cake.`]), [a.id, b.id], c.venueId);
  }
}

// =================================================================== ACTIONS
const actions = [
  {
    id: 'festival', label: (w) => (w.town.festivalToday && w.town.festivalToday.kind === 'vigil' ? 'keeping vigil' : 'at the festival'),
    where(w) { const f = w.town.festivalToday; return f ? f.venueId : null; },
    score(w, p) {
      const st = w.culture, ev = st && st.today; if (!ev) return 0;
      const h = w.time.hour;
      if (h < ev.startHour || h >= ev.endHour) return 0;
      if (!ev.go.has(p.id) || jailed(w, p) || (p.needs && p.needs.energy < 0.1)) return 0;
      if (p.id === w.player) return 0;
      return (ev.kind === 'vigil' ? 70 : 96) + 14 * p.personality.extraversion;
    },
    duration: (w) => w.rng.int(6, 12),
    interruptible: true,
    perTick: { social: 0.012, fun: 0.014, comfort: 0.002 },
    onStart(w, p) { onFestivalAction(w, p); },
    onTick(w, p) {
      const ev = w.culture && w.culture.today; if (!ev || ev.kind !== 'festival') return;
      if (ev.quality > 0.15 && p.needs && p.needs.hunger < 0.9) p.needs.hunger = Math.min(1, p.needs.hunger + 0.006 * Math.min(1, ev.quality));
      if (ev.quality > 0.15 && w.ageOf(p) >= 15 && w.time.hour >= 12) {
        const rate = has(p, 'drunkard') ? 0.011 : 0.0035 + 0.003 * (1 - p.personality.conscientiousness);
        if (w.rng.chance(rate)) { ev.drinks.set(p.id, (ev.drinks.get(p.id) || 0) + 1); cx(p).drinks++; if (p.needs) p.needs.fun = Math.min(1, p.needs.fun + 0.01); }
      }
    },
    thought: (w, p) => (w.town.festivalToday?.kind === 'vigil' ? 'Standing in the candlelight, remembering.' : 'Enjoying the festival.'),
  },
  { id: 'sermon', label: 'preaching', score: () => 0, duration: (w, p, b, ca) => (ca && ca.duration) || 10, interruptible: false, perTick: { purpose: 0.01, social: 0.005 }, thought: () => 'Preaching to the congregation.' },
  { id: 'christening', label: 'at a christening', score: () => 0, duration: (w, p, b, ca) => (ca && ca.duration) || 9, interruptible: false, perTick: { social: 0.005, fun: 0.003 }, thought: () => 'At a christening.' },
  { id: 'funeral', label: 'at a funeral', score: () => 0, duration: (w, p, b, ca) => (ca && ca.duration) || 9, interruptible: false, perTick: { social: 0.003, purpose: 0.003 }, thought: () => 'Standing at a graveside.' },
  { id: 'club_meeting', label: 'at a club meeting', score: () => 0, duration: (w, p, b, ca) => (ca && ca.duration) || 12, interruptible: false, perTick: { social: 0.012, fun: 0.009 }, thought: () => 'Enjoying the club.' },
];

// =================================================================== INTERVENTIONS
function reg(w, kind, fn, desc) { fn.description = desc; if (w.registerIntervention) w.registerIntervention(kind, fn, desc); }
function miracle(w, params = {}) {
  const r = w.rng, tp = temple(w), pr = priestOf(w);
  const kind = params.kind || 'healing';
  const sick = params.personId != null ? w.people.get(params.personId) : r.pick([...w.living().filter((p) => p.illness || (p.health ?? 1) < 0.45), ...[]].concat([]));
  const hear = tp ? (w.peopleAt(tp.id) || []) : [];
  if (kind === 'healing' && sick) {
    sick.health = 1; sick.illness = null;
    chron(w, 'miracle', 5, `A miracle is claimed at the temple: ${nm(sick)}, given up for lost, rises from ${his(sick)} sickbed and walks home unaided. ${pr ? `${pr.sex === 'F' ? 'Mother' : 'Father'} ${pr.lastName} falls to ${pr.sex === 'F' ? 'her' : 'his'} knees` : 'The faithful fall to their knees'}; the ${season(w)} congregations swell for weeks.`, [sick.id, pr?.id], tp?.id);
    mem(w, sick, 'miracle', 'I was healed. I do not understand it, and I will never forget it.', [], 1, 5); if (sick.values) sick.values.piety = clamp(sick.values.piety + 0.35, 0, 1);
    mood(w, sick, 'miracle', 'Miraculously healed', 0.7, 10 * DAY);
  } else {
    chron(w, 'miracle', 4, `A strange light pours through the temple's east window at dusk and ${hear.length || 'many'} townsfolk swear the air hummed with song. Some call it a sign; the sceptics blame the glass.`, [pr?.id], tp?.id);
  }
  for (const p of w.living()) { if (!p.values) continue; const near = hear.includes(p); p.values.piety = clamp(p.values.piety + (near ? 0.1 : 0.03) * (p.personality.openness > 0.5 ? 1.2 : 0.8), 0, 1); mood(w, p, 'miracleAwe', 'Stirred by talk of a miracle', near ? 0.25 : 0.1, 7 * DAY); }
  C(w).miracles++;
  w.emit('miracle', { kind, person: sick || null });
  return `miracle (${kind})${sick ? ' on ' + nm(sick) : ''}`;
}
function interventions(w) {
  reg(w, 'storm', (world, params = {}) => {
    const st = C(world), h = world.time.hour, hours = params.hours ?? 8;
    st.plan = { type: 'storm', from: h, to: Math.min(h + hours, 30), base: st.plan ? st.plan.base : 12 };
    if (h + hours > 24) st.plan.to = 24;
    world.weather = { type: 'storm', temp: world.weather.temp, humidity: 1, wind: 3 };
    const n = stormDamage(world, params.severity ?? 1.6);
    return `storm for ~${hours}h, ${n} buildings damaged`;
  }, 'Whip up a storm now. params {hours=8, severity=1.6}');
  reg(w, 'fire', (world, params = {}) => {
    const b = params.buildingId != null ? world.buildings.get(params.buildingId) : weightedBuilding(world);
    if (!b) return 'no such building';
    return fire(world, b, { severity: params.severity, cause: params.cause });
  }, 'Set a building on fire. params {buildingId?, severity 0.15-1?}');
  reg(w, 'festival', (world, params = {}) => {
    const st = C(world);
    if (st.today) return 'a festival is already on';
    const h = world.time.hour, hours = params.hours ?? 6;
    const def = { id: 'spontaneous', name: params.name || 'an impromptu festival', short: params.name || 'impromptu festival', startHour: Math.min(23, h + 1), endHour: Math.min(24, h + 1 + hours), skill: params.contest ? 'charisma' : null, contest: params.contest || 'singing contest', prize: 8 };
    startEvent(world, def, { spontaneous: true, venueId: params.venueId, startHour: def.startHour, endHour: def.endHour, extraBudget: params.budget || 0 });
    return `festival "${def.name}" from ${def.startHour}:00 to ${def.endHour}:00`;
  }, 'Declare a spontaneous festival. params {name?, hours=6, venueId?, budget?}');
  reg(w, 'miracle', (world, params = {}) => miracle(world, params), "A religious miracle. params {kind:'healing'|'sign', personId?}");
  reg(w, 'flood', (world, params = {}) => flood(world, params), 'The river floods its banks. params {severity 0.2-1}');
  reg(w, 'weather', (world, params = {}) => { const st = C(world); st.plan = { type: params.type || 'clear', from: world.time.hour, to: Math.min(24, world.time.hour + (params.hours ?? 8)), base: params.temp ?? (st.plan ? st.plan.base : 12) }; applyHourWeather(world); return `weather ${st.plan.type}`; }, "Set today's weather. params {type:'clear'|'rain'|'storm'|'snow'|'fog'|'heatwave', hours=8, temp}");
}

// =================================================================== SYSTEM
export default {
  name: 'culture',
  actions,
  scoreModifiers,
  init(world) {
    const st = world.culture = { anom: 0, plan: null, river: { level: 0.25, pack: 0 }, floodAt: 0.62, floodedThisYear: false, today: null, records: {}, clubs: [], nextClub: 1, traditions: [], memorials: [], disasters: [], ceremonies: [], harshWinterYear: null, winterDead: [], festivalCount: 0, services: 0, miracles: 0, stormsThisYear: 0, wetSpell: false, heatDays: 0 };
    world.town = world.town || {};
    world.town.festivalToday = null;
    world.settings.festivalBudget = world.settings.festivalBudget ?? 0.5;
    planWeather(world);
    interventions(world);
    world.on('birth', (ev) => queueChristening(world, ev));
    world.on('death', (ev) => onDeath(world, ev));
    foundClubs(world);
  },
  onHour(world) {
    const st = C(world); if (!st) return;
    applyHourWeather(world);
    if (world.time.hour % 3 === 0) weatherMoods(world);
    const t = world.time;
    // start a calendar festival at its morning hour
    scheduleSermon(world);
    ceremonyHour(world);
    clubHour(world);
    festivalHour(world);
    if (t.hour === 6 && !st.today) { /* dawn: nothing */ }
  },
  onDay(world) {
    const st = C(world), t = world.time;
    planWeather(world);
    if (!st.today) { const f = festivalFor(world); if (f) startEvent(world, f); else checkMemorials(world); }
    dailyDisasters(world);
    if (t.totalDays % 7 === 1) foundClubs(world);
    if (t.totalDays % 28 === 5) updateClubs(world);
    if (world.weather.type === 'storm' || (st.plan && st.plan.type === 'storm')) { /* damage applied when the storm arrives */ }
  },
  onSeason(world) {
    const st = C(world), t = world.time;
    if (t.season === 3 && world.rng.chance(0.07) && st.harshWinterYear !== t.year && world.rng.chance(0.75)) {
      st.harshWinterYear = t.year; st.winterDead = [];
      chron(world, 'weather', 4, `The frost comes early and hard: the old folk say they have not seen the like in a generation. Woodpiles dwindle and the river freezes at the edges.`, []);
      world.emit('disaster', { kind: 'harshWinter' });
    }
    if (t.season === 0 && st.harshWinterYear === t.year - 1 && st.harshWinterYear != null) {
      const d = st.winterDead.length; world.town.harshWinter = false;
      chron(world, 'weather', 4, `The Hard Winter loosens its grip at last; ${d ? `${d} of the town's old and poor did not live to see the thaw` : 'the town counts itself lucky'}.`, st.winterDead.slice(0, 4));
      if (d) addMemorial(world, 'winter', 'the Hard Winter', 'the Hard Winter', d);
      st.disasters.push({ kind: 'harshWinter', tick: world.tick, dead: d });
      st.lastDisasterTick = world.tick;
    }
  },
  onYear(world) {
    const st = C(world);
    pietyDrift(world);
    st.floodedThisYear = false; st.stormsThisYear = 0;
    st.river.pack *= 0.3;
  },
};
