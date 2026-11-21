// Hollowmere plausibility checks. Used by tools/report.js; usable standalone:
//   import { attachCollector, computeMetrics, runChecks } from './plausibility.js';
//   const d = attachCollector(world);            // call right after `new World()`, before stepping
//   ...world.step() x N...
//   const m = computeMetrics(world, d);          // demographic/economic metrics (null-safe)
//   const checks = runChecks(world, d, m);       // [{status:'PASS'|'WARN'|'FAIL', name, msg}]
// Expected engine API (CONTRACT.md): world.on, world.living(), world.ageOf(p), world.tick, world.time{hour,restDay|weekday},
// world.people, world.buildings, world.chronicle.entries, events birth/death/marriage/divorce/crime/immigrate/emigrate/rumor/election/year/hour.
// Everything is defensive: missing data yields WARN 'no data', never a crash.
import { TICKS_PER_YEAR } from '../sim/time.js';

const NONWORK = new Set(['child', 'student', 'retired', 'unemployed']);
export const BINS = [[0, 1], [1, 5], ...Array.from({ length: 19 }, (_, i) => [5 + i * 5, 10 + i * 5])]; // 0,1-4,5-9..95-99
BINS[BINS.length - 1][1] = 200;
const binOf = (a) => { for (let i = 0; i < BINS.length; i++) if (a < BINS[i][1]) return i; return BINS.length - 1; };
const yearIdx = (w) => Math.max(0, Math.floor((w.tick + 36) / TICKS_PER_YEAR));
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
export const isEmployed = (p) => p.job && !NONWORK.has(p.job) && p.job !== 'mayor' ? true : p.job === 'mayor';
const idOf = (x) => (x && typeof x === 'object' ? x.id : x);

function census(w) {
  const c = { M: new Array(BINS.length).fill(0), F: new Array(BINS.length).fill(0) };
  for (const p of w.living()) c[p.sex === 'F' ? 'F' : 'M'][binOf(w.ageOf(p))]++;
  return c;
}

export function attachCollector(w) {
  const d = {
    years: [], births: 0, deaths: [], firstMarr: { M: [], F: [] }, firstBirth: [], everMarried: new Set(), mothers: new Set(),
    census: [], crimeKinds: {}, murders: 0, mayors: [], rumors: 0, rhythm: { nightHome: 0, nightN: 0, workAt: 0, workN: 0 },
    viol: {}, violEx: {}, startPop: 0, startTick: w.tick, popByYear: [],
  };
  const Y = (i = yearIdx(w)) => (d.years[i] ||= { births: 0, deaths: 0, marriages: 0, divorces: 0, crimes: 0, imm: 0, emi: 0, pop: null });
  const safe = (fn) => (e) => { try { fn(e || {}); } catch (err) { d.err = (d.err || 0) + 1; d.lastErr = String(err && err.stack || err).split('\n').slice(0, 2).join(' '); } };
  const viol = (k, p) => { d.viol[k] = (d.viol[k] || 0) + 1; if (!d.violEx[k]) d.violEx[k] = p ? `${p.firstName || ''} ${p.lastName || ''}#${p.id}`.trim() : ''; };
  d.startPop = w.living().length;
  for (const p of w.living()) if (p.family?.spouseId != null || p.family?.exSpouseIds?.length) d.everMarried.add(p.id);
  d.census.push({ year: 0, ...census(w) });
  d.viol_fn = viol;

  w.on('birth', safe((e) => {
    d.births++; Y().births++;
    const m = e.mother, id = idOf(m), mp = typeof m === 'object' ? m : w.people.get(id);
    if (mp && !d.mothers.has(id)) { d.mothers.add(id); d.firstBirth.push(w.ageOf(mp)); }
  }));
  w.on('death', safe((e) => {
    const p = e.person; if (!p) return; Y().deaths++;
    const age = (w.tick - p.birthTick) / TICKS_PER_YEAR;
    const cause = e.cause || p.causeOfDeath || 'unknown';
    d.deaths.push({ age, sex: p.sex, cause, id: p.id });
    if (/murder|homicide|killed|slain|stabb/i.test(cause)) d.murders++;
  }));
  w.on('marriage', safe((e) => {
    Y().marriages++;
    for (const x of [e.a, e.b]) { const p = typeof x === 'object' ? x : w.people.get(x); if (!p) continue; if (!d.everMarried.has(p.id)) { d.everMarried.add(p.id); (d.firstMarr[p.sex === 'F' ? 'F' : 'M']).push(w.ageOf(p)); } }
  }));
  w.on('divorce', safe(() => { Y().divorces++; }));
  w.on('crime', safe((e) => { Y().crimes++; const k = e.kind || 'crime'; d.crimeKinds[k] = (d.crimeKinds[k] || 0) + 1; if (/murder|homicide|manslaughter/i.test(k)) d.murders++; }));
  w.on('immigrate', safe(() => { Y().imm++; }));
  w.on('emigrate', safe((e) => { Y().emi += Math.max(1, Array.isArray(e.group) ? e.group.length : 1); }));
  w.on('rumor', safe(() => { d.rumors++; }));
  w.on('election', safe((e) => { if (e.phase === 'result' && e.winner != null) d.mayors.push({ id: e.winner, tick: w.tick }); }));
  w.on('jobChange', safe((e) => { if (e.newJob === 'mayor' && e.person) { const l = d.mayors[d.mayors.length - 1]; if (!l || l.id !== e.person.id) d.mayors.push({ id: e.person.id, tick: w.tick }); } }));

  // daily-rhythm samples: 3am home/asleep, 11am workday at work
  w.on('hour', safe(() => {
    const h = w.time.hour; if (h !== 3 && h !== 11) return;
    const rest = w.time.restDay ?? (w.time.weekday === 6);
    for (const p of w.living()) {
      const age = w.ageOf(p); if (age < 16 || age > 70) continue;
      const act = p.currentAction?.id || '';
      if (h === 3) { d.rhythm.nightN++; if ((p.locationId != null && p.locationId === p.homeId) || /sleep|rest|jail|ill|bed/i.test(act) || p.jailedUntil > w.tick) d.rhythm.nightHome++; }
      else if (!rest && p.workId != null && isEmployed(p) && !(p.illness && p.illness.severity > 0.4)) { d.rhythm.workN++; if (p.locationId === p.workId || /work/i.test(act)) d.rhythm.workAt++; }
    }
  }));

  // invariant scan + census at each year boundary
  w.on('year', safe(() => {
    const yi = yearIdx(w), L = w.living(); Y(yi).pop = L.length; d.census.push({ year: yi, ...census(w) });
    const jobs = new Map();
    for (const b of w.buildings.values()) for (const id of b.employees || []) jobs.set(id, (jobs.get(id) || 0) + 1);
    for (const p of L) {
      const age = w.ageOf(p);
      if (!num(age) || age < 0) viol('negative/NaN age', p);
      if (age > 105) viol('age>105', p);
      if (age < 15 && (p.family?.spouseId != null || p.romance?.status === 'married')) viol('child married', p);
      if (p.pregnant && (age < 15 || age > 48)) viol('pregnancy outside 15-48', p);
      let bad = !num(p.money) || !num(p.mood) || !num(p.health);
      if (p.needs) for (const k in p.needs) if (!num(p.needs[k])) bad = true;
      if (bad) viol('NaN in needs/money/mood/health', p);
      if ((jobs.get(p.id) || 0) > 1) viol('listed as employee of 2+ buildings', p);
      let inB = 0; for (const b of w.buildings.values()) if (b.occupants && b.occupants.has && b.occupants.has(p)) inB++;
      if (inB > 1) viol('in two buildings at once', p);
      if (age < 15) {
        const fa = w.people.get(p.family?.fatherId), mo = w.people.get(p.family?.motherId);
        const parentsAlive = (fa && fa.alive) || (mo && mo.alive);
        const home = p.homeId != null ? w.buildings.get(p.homeId) : null;
        const housed = home && (!home.residents || home.residents.includes(p.id));
        if (!housed) viol('child without household', p);
        else if (!parentsAlive && !(home.residents || []).some((id) => { const o = w.people.get(id); return o && o.alive && w.ageOf(o) >= 15; })) viol('orphan without adult in household', p);
      }
    }
  }));
  return d;
}

// ---------- metrics ----------
export function lifeTable(d) {
  // abridged period life table from deaths + census exposure
  const nb = BINS.length, D = new Array(nb).fill(0), PY = new Array(nb).fill(0);
  for (const x of d.deaths) D[binOf(x.age)]++;
  for (let i = 1; i < d.census.length; i++) for (let b = 0; b < nb; b++) PY[b] += ((d.census[i - 1].M[b] + d.census[i - 1].F[b]) + (d.census[i].M[b] + d.census[i].F[b])) / 2;
  if (!d.deaths.length || !d.census.length) return null;
  const nYears = Math.max(1, d.census.length - 1);
  const q = [];
  for (let b = 0; b < nb; b++) {
    const n = BINS[b][1] - BINS[b][0];
    if (b === 0) { q.push(d.births > 0 ? Math.min(1, D[0] / d.births) : 0); continue; }
    if (b === nb - 1) { q.push(1); continue; }
    const m = PY[b] > 0 ? D[b] / PY[b] : 0;
    q.push(Math.min(1, (n * m) / (1 + (n / 2) * m)));
  }
  let l = 1, ex = [], e0 = 0, tail = 0; const L = [];
  const ls = [1];
  for (let b = 0; b < nb; b++) {
    const n = BINS[b][1] - BINS[b][0], a = b === 0 ? 0.3 : n / 2;
    const lnext = l * (1 - q[b]);
    if (b === nb - 1) { const m = PY[b] > 0 && D[b] > 0 ? D[b] / PY[b] : 0.3; L.push(l / m); }
    else L.push(n * lnext + a * (l - lnext));
    l = lnext; ls.push(l);
  }
  const Tfrom = (b0) => { let t = 0; for (let b = b0; b < nb; b++) t += L[b]; return t / (ls[b0] || 1); };
  const b15 = binOf(15);
  return { e0: Tfrom(0), e15: ls[b15] > 0.01 ? Tfrom(b15) : null, infant: q[0], under5: 1 - (1 - q[0]) * (1 - q[1]), nYears };
}

export function gini(vals) {
  const a = vals.filter(num).map((x) => Math.max(0, x)).sort((x, y) => x - y), n = a.length, s = a.reduce((x, y) => x + y, 0);
  if (n < 2 || s <= 0) return null;
  let c = 0; for (let i = 0; i < n; i++) c += (i + 1) * a[i];
  return (2 * c) / (n * s) - (n + 1) / n;
}

export function computeMetrics(w, d) {
  const m = {}, L = w.living(), ages = L.map((p) => w.ageOf(p));
  m.pop = L.length; m.startPop = d.startPop; m.popChange = d.startPop ? (L.length - d.startPop) / d.startPop : null;
  m.sexRatio = L.filter((p) => p.sex === 'M').length / Math.max(1, L.filter((p) => p.sex === 'F').length);
  m.medianAge = median(ages);
  m.life = lifeTable(d);
  const causes = {}; for (const x of d.deaths) causes[x.cause] = (causes[x.cause] || 0) + 1;
  m.causes = Object.entries(causes).sort((a, b) => b[1] - a[1]); m.deathsN = d.deaths.length;
  m.marrAge = { M: mean(d.firstMarr.M), F: mean(d.firstMarr.F), nM: d.firstMarr.M.length, nF: d.firstMarr.F.length };
  m.firstBirthAge = mean(d.firstBirth);
  const women45 = L.filter((p) => p.sex === 'F' && w.ageOf(p) >= 45);
  m.fertility = women45.length >= 5 ? mean(women45.map((p) => (p.family?.childrenIds || []).length)) : null;
  m.fertilityN = women45.length;
  const adults = L.filter((p) => w.ageOf(p) >= 18);
  m.marriedPct = adults.length ? adults.filter((p) => p.family?.spouseId != null).length / adults.length : null;
  const o50 = L.filter((p) => w.ageOf(p) >= 50);
  m.neverMarried50 = o50.length >= 5 ? o50.filter((p) => !d.everMarried.has(p.id) && p.family?.spouseId == null && !(p.family?.exSpouseIds?.length)).length / o50.length : null;
  const wa = L.filter((p) => { const a = w.ageOf(p); return a >= 16 && a < 65; });
  m.employment = wa.length ? wa.filter(isEmployed).length / wa.length : null;
  const jobs = {}; for (const p of L) if (p.job) jobs[p.job] = (jobs[p.job] || 0) + 1;
  m.jobs = Object.entries(jobs).sort((a, b) => b[1] - a[1]);
  m.gini = gini(L.map((p) => p.money));
  m.rich = [...L].sort((a, b) => (b.money || 0) - (a.money || 0)).slice(0, 3).map((p) => {
    const owned = [...w.buildings.values()].filter((b) => b.ownerId === p.id).map((b) => b.type);
    return { p, money: p.money, owned };
  });
  m.mood = mean(L.map((p) => p.mood).filter(num));
  m.depressed = L.length ? L.filter((p) => p.mood < -0.4 || /depress/i.test(p.illness?.name || '') || p.traits?.includes?.('depressed')).length / L.length : null;
  let fr = 0, en = 0, tags = new Set();
  for (const p of L) if (p.relationships) for (const r of p.relationships.values()) for (const t of r.tags || []) { tags.add(t); if (t === 'friend' || t === 'best friend' || t === 'bestfriend') fr++; if (t === 'enemy' || t === 'rival') en++; }
  m.friendsPer = L.length ? fr / L.length : null; m.enemiesPer = L.length ? en / L.length : null; m.relTags = tags.size;
  const yrs = Math.max(1, d.census.length - 1);
  const totalCrimes = d.years.reduce((s, y) => s + (y?.crimes || 0), 0);
  const avgPop = mean(d.years.map((y) => y?.pop).filter(num)) || L.length || 1;
  m.crimePer1000 = totalCrimes / yrs / avgPop * 1000; m.crimes = totalCrimes; m.years = yrs;
  const ch = w.chronicle?.entries || [];
  m.chron = { n: ch.length, textRatio: ch.length ? new Set(ch.map((e) => e.text)).size / ch.length : null, types: new Set(ch.map((e) => e.type)).size };
  m.oldest = ages.length ? Math.max(...ages) : null;
  return m;
}

// ---------- checks ----------
const band = (name, v, lo, hi, fmt = (x) => x.toFixed(2), warnPad = 0.15) => {
  if (v == null || !num(v)) return { status: 'WARN', name, msg: 'no data' };
  const s = `${fmt(v)} (band ${fmt(lo)}..${fmt(hi)})`;
  if (v >= lo && v <= hi) return { status: 'PASS', name, msg: s };
  const span = (hi - lo) * warnPad;
  return { status: v >= lo - span && v <= hi + span ? 'WARN' : 'FAIL', name, msg: s };
};
const pc = (x) => (x * 100).toFixed(1) + '%';

export function runChecks(w, d, m = computeMetrics(w, d)) {
  const out = [], T = (c) => out.push(c);
  const wrap = (f) => { try { f(); } catch (e) { out.push({ status: 'WARN', name: 'check error', msg: String(e.message || e) }); } };
  wrap(() => { const l = m.life; T(band('life expectancy at 15 (total yrs)', l?.e15 != null ? 15 + l.e15 : null, 55, 75, (x) => x.toFixed(1), 0.1)); });
  wrap(() => T(band('infant mortality', m.life?.infant, 0.03, 0.20, pc, 0.3)));
  wrap(() => T(band('under-5 mortality', m.life?.under5, 0.05, 0.38, pc, 0.2)));
  wrap(() => T(band('female first-marriage age', m.marrAge.nF >= 3 ? m.marrAge.F : null, 18, 28, (x) => x.toFixed(1))));
  wrap(() => T(band('male first-marriage age', m.marrAge.nM >= 3 ? m.marrAge.M : null, 20, 32, (x) => x.toFixed(1))));
  wrap(() => T(band('female age at first birth', m.firstBirthAge, 19, 30, (x) => x.toFixed(1))));
  wrap(() => T(band('completed fertility (women 45+)', m.fertility, 2.5, 6, (x) => x.toFixed(2))));
  wrap(() => T(band('population change over run', m.popChange, -0.3, 1.5, pc, 0.3)));
  wrap(() => T(band('gini of money', m.gini, 0.25, 0.6)));
  wrap(() => T(band('employment of working-age', m.employment, 0.70, 0.98, pc)));
  wrap(() => T(band('crimes /1000 /yr', m.years ? m.crimePer1000 : null, 2, 30, (x) => x.toFixed(1), 0.5)));
  wrap(() => T(band('married % of adults', m.marriedPct, 0.45, 0.80, pc)));
  wrap(() => T(band('never married at 50+', m.neverMarried50, 0.02, 0.15, pc)));
  wrap(() => T(band('avg mood', m.mood, -0.2, 0.6)));
  wrap(() => { const yrs = Math.max(1, m.years); const r = d.murders / yrs / Math.max(1, m.pop) * 1000;
    T(d.years.length ? { status: r <= 0.5 ? 'PASS' : r <= 1.5 ? 'WARN' : 'FAIL', name: 'murders rare', msg: `${d.murders} total, ${r.toFixed(2)}/1000/yr` } : { status: 'WARN', name: 'murders rare', msg: 'no data' }); });
  wrap(() => T(m.oldest == null ? { status: 'WARN', name: 'nobody older than 105', msg: 'no data' } : { status: m.oldest <= 105 && !d.viol['age>105'] ? 'PASS' : 'FAIL', name: 'nobody older than 105', msg: `oldest ${m.oldest.toFixed(1)}` }));
  const inv = ['negative/NaN age', 'child married', 'pregnancy outside 15-48', 'NaN in needs/money/mood/health', 'listed as employee of 2+ buildings', 'in two buildings at once', 'child without household', 'orphan without adult in household'];
  wrap(() => { const scanned = d.years.some((y) => y && y.pop != null);
    for (const k of inv) T(!scanned ? { status: 'WARN', name: k, msg: 'no yearly scan yet' } : d.viol[k] ? { status: 'FAIL', name: 'invariant: ' + k, msg: `${d.viol[k]} cases, e.g. ${d.violEx[k]}` } : { status: 'PASS', name: 'no ' + k, msg: '' }); });
  wrap(() => { const r = d.rhythm; T(r.nightN < 20 ? { status: 'WARN', name: '3am adults home/asleep', msg: 'no data' } : band('3am adults home/asleep', r.nightHome / r.nightN, 0.8, 1, pc, 0.2)); });
  wrap(() => { const r = d.rhythm; T(r.workN < 20 ? { status: 'WARN', name: '11am workday employed at work', msg: 'no data' } : band('11am workday employed at work', r.workAt / r.workN, 0.6, 1, pc, 0.2)); });
  wrap(() => { const c = m.chron; T(c.n < 30 ? { status: 'WARN', name: 'chronicle variety', msg: 'too few entries' } : { status: c.textRatio >= 0.6 && c.types >= 8 ? 'PASS' : c.textRatio >= 0.4 && c.types >= 5 ? 'WARN' : 'FAIL', name: 'chronicle variety', msg: `${pc(c.textRatio)} distinct texts of ${c.n}, ${c.types} event types` }); });
  if (d.err) T({ status: 'WARN', name: 'collector errors', msg: `${d.err}: ${d.lastErr}` });
  return out;
}
