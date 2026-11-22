#!/usr/bin/env node
// Factual attribute sheets for people drawn from the Larkfield population generator.
//   node attributes.mjs <flatshare|family|cafe|street> <n> <seed>      -> JSON array on stdout
// The generator (sim/population/index.js, via createLarkfieldWorld) builds the whole neighbourhood from the census calibration; this script only SELECTS
// from the people it produced (no distributions of its own) and reads their attributes. Every attribute of a person was drawn jointly by the generator.
//   flatshare: n adults of one private-rented, non-family (sharer) household        family: one household with >= max(3,n) members, everyone in it
//   cafe: n people = 1 self-employed cafe owner + (n-1) food-service/hospitality staff, students or part-timers doing such jobs
//   street: n adults, one each from n different households, all on the same street
import { createLarkfieldWorld } from '../../../../sim/larkfield.js';
import { RNG } from '../../../../sim/rng.js';
import { PATTERNS } from '../../../../content/larkfield/jobs.js';
import NAMES from '../../../../content/larkfield/names.js';

const [scenario, nArg, seedArg] = process.argv.slice(2);
const SCENARIOS = ['flatshare', 'family', 'cafe', 'street'];
if (!SCENARIOS.includes(scenario)) { console.error('usage: node attributes.mjs <flatshare|family|cafe|street> <n> <seed>'); process.exit(1); }
const n = Math.max(1, parseInt(nArg ?? '4', 10) || 4), seed = parseInt(seedArg ?? '1', 10) || 1;
const rng = new RNG(seed).fork('attributes:' + scenario);

// The generated neighbourhood for `seed`; further seeds are only used if one neighbourhood cannot supply the request (e.g. a second cafe owner).
const worlds = [];
const worldAt = (k) => worlds[k] || (worlds[k] = createLarkfieldWorld(k === 0 ? seed : seed + 1000 * k));
const MAX_WORLDS = 25;

const EDU = { in_school: 'still in school', none: 'no formal qualifications', level1: 'Level 1 (some GCSEs)', level2: 'Level 2 (GCSEs)', apprenticeship: 'apprenticeship', level3: 'Level 3 (A-levels/BTEC)', level4plus: 'degree or higher', other: 'other/vocational qualification' };
const ACT = { employed: 'employed', student: 'student', retired: 'retired', unemployed: 'unemployed', home_family: 'looking after home/family', sick_disabled: 'long-term sick or disabled', other_inactive: 'economically inactive', child: 'child' };
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hh = (x) => { const h = Math.floor(x) % 24, m = Math.round((x % 1) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
const round = (x, to) => Math.round(x / to) * to;
const streetOf = (a) => a.split(',').pop().trim().replace(/^\d+\S*\s+/, '');

function describe(w, p) {
  const q = p.ext.pop, L = p.ext.life || {}, TPY = w.calendar.ticksPerYear, H = w.lf.households[q.hh];
  const occ = q.occ ? w.pack.jobs.find((j) => j.id === q.occ) : null;
  const age = Math.floor(w.ageOf(p));
  // children: those living here (family record) plus grown/other children elsewhere (off-map kin the generator recorded)
  const kids = [], seen = new Set();
  for (const id of p.family.childrenIds || []) { const c = w.people.get(id); if (c && c.alive) { seen.add(id); kids.push({ name: `${c.firstName} ${c.lastName}`, age: Math.floor(w.ageOf(c)), lives: 'at home' }); } }
  for (const t of q.ties || []) if (t.k === 'kin' && (t.rel === 'son' || t.rel === 'daughter') && typeof t.o === 'string') { const m = w.popQuery.metro(t.o); if (m && !kids.some((k) => k.name === m.name)) kids.push({ name: m.name, age: m.age, lives: m.where }); }
  const part = L.part && L.part.on !== false ? L.part : null;
  const partner = part && w.people.get(part.id);
  const rel = { never: 'single, never married', married: 'married', divorced: 'divorced', widowed: 'widowed', separated: 'separated' }[L.mar] || L.mar || 'single';
  const status = part ? (part.st === 'married' ? 'married' : part.st === 'cohab' ? 'living with partner' : part.lat ? 'in a relationship (living apart)' : 'in a relationship') + (partner ? ` (${partner.firstName})` : '') : rel;
  const relTo = (o) => { const t = (q.ties || []).find((x) => x.o === o.id && x.on); return t ? t.rel : o.ext.pop.role; };
  const others = H.members.filter((id) => id !== p.id).map((id) => w.people.get(id));
  const venue = q.workplace && q.workplace.vid != null ? w.map.lf.venues.find((v) => v.id === q.workplace.vid) : null;
  const pat = q.pattern && PATTERNS[q.pattern];
  const shifts = pat ? pat.shifts.map((s) => `${s.days.length === 7 ? 'daily' : s.days.map((d) => DAY[d]).join('/')} ${hh(s.from)}-${hh(s.to % 24)}`).join('; ') : null;
  const pets = [q.pets.dogs ? `${q.pets.dogs} dog${q.pets.dogs > 1 ? 's' : ''}` : null, q.pets.cats ? `${q.pets.cats} cat${q.pets.cats > 1 ? 's' : ''}` : null].filter(Boolean);
  const g = NAMES.GROUPS[q.ethGroup];
  return {
    name: `${p.firstName} ${p.lastName}`,
    age, sex: p.sex === 'F' ? 'female' : 'male',
    ethnicity: g ? g.label.replace(/ \(.*/, '') : q.ethGroup,
    birthplace: q.birthplace, born_in_uk: !!q.bornUK,
    years_in_uk: q.bornUK ? null : Math.max(0, Math.round(-q.arrived / TPY)),
    religion: q.religion,
    occupation: occ ? occ.label : ACT[q.activity] || q.activity,
    activity: ACT[q.activity] || q.activity,
    contract: q.contract,
    workplace: venue ? `${venue.name || venue.template} (in Larkfield)` : q.workplace.kind === 'home' ? 'from home' : q.workplace.kind === 'offmap' ? 'elsewhere in the city (' + q.workplace.dest + ')' : null,
    approx_annual_income_gbp: { gross: round(q.fin.gross, 100), net: round(q.fin.net, 100) },
    hours_per_week: q.hours || null,
    shift_pattern: pat ? { label: pat.label, shifts } : null,
    household: {
      type: H.arch.replace(/_/g, ' '), tenure: H.tenure.replace(/_/g, ' '), bedrooms: H.bedrooms, address: H.address,
      lives_with: others.map((o) => ({ name: `${o.firstName} ${o.lastName}`, age: Math.floor(w.ageOf(o)), relation: relTo(o) })),
    },
    relationship_status: status,
    children: kids,
    pets: pets.length ? pets : null,
    health: { general: q.health.general, conditions: q.health.conds, disabled: q.health.disabled },
    education: EDU[q.edu] || q.edu,
    _src: { world_seed: w.seed ?? undefined, id: p.id, household: q.hh, segment: q.seg },
  };
}

const living = (w) => w.living();
const adultsOf = (w, h) => h.members.map((id) => w.people.get(id)).filter((p) => p && w.ageOf(p) >= 18);
const FOOD = new Set(['barista_waiter', 'cook_chef', 'kitchen_porter_cook', 'bar_staff', 'restaurant_manager', 'chef_offmap', 'hospitality_offmap', 'school_cook_midday', 'student_part_time']);

function pick(label, tryWorld) {
  for (let k = 0; k < MAX_WORLDS; k++) { const r = tryWorld(worldAt(k), k); if (r) return r; }
  console.error(`could not satisfy '${label}' with n=${n}`); process.exit(2);
}

let out;
if (scenario === 'flatshare') {
  out = pick('flatshare', (w) => {
    let c = w.lf.households.filter((h) => h.tenure === 'private_rent' && h.arch === 'sharers_students_multigen' && adultsOf(w, h).length >= n);
    const flats = c.filter((h) => w.map.lf.units.find((u) => u.id === h.unit)?.kind === 'flat'); if (flats.length) c = flats;
    if (!c.length) return null;
    const h = rng.pick(c), a = adultsOf(w, h); rng.shuffle(a);
    return a.slice(0, n).map((p) => describe(w, p));
  });
} else if (scenario === 'family') {
  out = pick('family', (w) => {
    const c = w.lf.households.filter((h) => h.members.length >= Math.max(3, n));
    if (!c.length) return null;
    const h = rng.pick(c);
    return h.members.map((id) => describe(w, w.people.get(id)));
  });
} else if (scenario === 'cafe') {
  out = pick('cafe', (w) => {
    const owners = living(w).filter((p) => p.ext.pop.occ === 'cafe_owner');
    const staff = living(w).filter((p) => FOOD.has(p.ext.pop.occ) && w.ageOf(p) >= 16);
    if (!owners.length || staff.length < n - 1) return null;
    const o = rng.pick(owners); rng.shuffle(staff);
    return [o, ...staff.slice(0, n - 1)].map((p) => describe(w, p));
  });
} else {
  out = pick('street', (w) => {
    const by = new Map();
    for (const h of w.lf.households) if (adultsOf(w, h).length) { const s = streetOf(h.address); (by.get(s) || by.set(s, []).get(s)).push(h); }
    const streets = [...by.entries()].filter(([, hs]) => hs.length >= n);
    if (!streets.length) return null;
    const [, hs] = rng.weighted(streets, streets.map(([, x]) => x.length));
    const chosen = hs.slice(); rng.shuffle(chosen);
    return chosen.slice(0, n).map((h) => describe(w, rng.pick(adultsOf(w, h))));
  });
}
for (const o of out) { delete o._src.world_seed; }
console.log(JSON.stringify(out, null, 2));
