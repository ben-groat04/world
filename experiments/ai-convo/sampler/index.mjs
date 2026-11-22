// Standalone UK people sampler. Usage: node index.mjs <flatshare|family|cafe|street|friends> <n> <seed>
// Every real-world number is in data.json with its source; nothing here is a data claim. Structure rules (shift timetables,
// scenario roles, the profile strength pr) are listed under `design` in data.json; gaps we could not source under `unspecified`.
// Order of conditioning: age x sex (joint, Census single years) -> ethnicity|age -> birthplace|ethnicity,age -> religion|ethnicity
//  -> activity|age,sex -> occupation|sex,age,activity (ASHE jobs) -> education|age,ethnicity,occupation -> health|age,activity
//  -> hours|occupation,activity -> hourly pay|occupation,age band -> shifts|hours,pattern. Households: person-first (street, cafe,
//  friends: type|age,ethnicity then relatives built round the person) or household-first (family, flatshare).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export const D = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url), 'utf8'));
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], DEGK = 'deg', FRIEND_AGE_WINDOW = 5; // design parameter
const ALL = [0, 1, 2, 3, 4, 5, 6], MD = 6, CAP = 12.5; // Working Time Regulations: 24h weekly rest, 11h daily rest
const PAT = { office: { d: [0, 1, 2, 3, 4], st: [8, 8.5, 9, 9.5], lens: [7.5] }, school: { d: [0, 1, 2, 3, 4], st: [8], lens: [7.5] }, retail: { d: ALL, st: [7, 8, 9, 10, 12], lens: [7.5, 8.5] },
  hosp: { d: ALL, st: { 6: [11, 16, 17], 8: [7, 10, 11, 15, 16] }, lens: [6, 8] }, cafe: { d: ALL, st: [6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5], endMax: 18, lens: [6, 8] },
  care: { d: ALL, st: { 7.5: [7, 14], 12: [7, 19] }, lens: [7.5, 12] }, shift12: { d: ALL, st: { 7.5: [8, 8.5, 9], 12: [7.5, 19.5] }, lens: [7.5, 12] }, factory: { d: ALL, st: [6, 14, 22], lens: [8] },
  trades: { d: [0, 1, 2, 3, 4, 5], st: [7, 7.5, 8], lens: [8] }, driver: { d: [0, 1, 2, 3, 4, 5], st: [4, 5, 6, 7, 8, 9, 12], lens: [8, 10] }, security: { d: ALL, st: { 8: [7, 15, 23], 12: [6, 18] }, lens: [8, 12] },
  flex: { d: ALL, st: [9, 9.5, 10, 11], lens: [6, 8] }, student: { d: ALL, st: [10, 12, 17, 18], lens: [4, 5, 6] } };
const ACT = { ft: 'employed full-time', pt: 'employed part-time', se: 'self-employed', st: 'student', un: 'unemployed', re: 'retired', si: 'long-term sick or disabled', ho: 'looking after home or family', pre: 'pre-school child', sc: 'school pupil' };
const LAB = { child: { M: 'son', F: 'daughter' }, parent: { M: 'father', F: 'mother' }, spouse: { M: 'husband', F: 'wife' }, partner: { M: 'partner', F: 'partner' }, sib: { M: 'brother', F: 'sister' }, gchild: { M: 'grandson', F: 'granddaughter' }, gparent: { M: 'grandfather', F: 'grandmother' }, pil: { M: 'father-in-law', F: 'mother-in-law' }, cil: { M: 'son-in-law', F: 'daughter-in-law' }, hm: { M: 'housemate (unrelated)', F: 'housemate (unrelated)' } };
const INV = { child: 'parent', parent: 'child', spouse: 'spouse', partner: 'partner', sib: 'sib', gchild: 'gparent', gparent: 'gchild', pil: 'cil', cil: 'pil', hm: 'hm' };
const CLS = {}; for (const [c, v] of Object.entries(LAB)) for (const l of Object.values(v)) CLS[l] = c;
const GAP = { child: (a, b) => a - b >= 15, parent: (a, b) => b - a >= 15, gchild: (a, b) => a - b >= 30, gparent: (a, b) => b - a >= 30, spouse: () => true, partner: () => true, sib: () => true, pil: (a, b) => b - a >= 0, cil: (a, b) => a - b >= 0, hm: () => true };
// ---------- rng + helpers
let R = Math.random;
export const seedRng = s => { let a = 0; for (const c of String(s)) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 0x9E3779B9) >>> 0; R = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), cl = (x, a, b) => Math.max(a, Math.min(b, x)), one = a => a[Math.floor(R() * a.length)];
const ent = w => Array.isArray(w) ? w : Object.entries(w);
const pk = (w, f) => { const e = ent(w), v = e.map(([k, x]) => +x * (f ? f(k) : 1)); let r = R() * v.reduce((a, b) => a + b, 0); for (let i = 0; i < e.length; i++) if ((r -= v[i]) < 0) return e[i][0]; return e[e.length - 1][0]; };
const step = (t, x) => { let m = 1; for (const [f, v] of t) if (x >= f) m = v; return m; };
const B = a => a < 18 ? 0 : a < 25 ? 1 : a < 35 ? 2 : a < 50 ? 3 : a < 65 ? 4 : a < 75 ? 5 : 6, EB = a => a < 25 ? 0 : a < 35 ? 1 : a < 50 ? 2 : a < 65 ? 3 : 4;
const AB = a => a < 22 ? 0 : a < 30 ? 1 : a < 40 ? 2 : a < 50 ? 3 : a < 60 ? 4 : 5, ABN = ['18-21', '22-29', '30-39', '40-49', '50-59', '60+']; // ASHE age bands
const hm = t => { t = ((t % 24) + 24) % 24; return String(Math.floor(t)).padStart(2, '0') + ':' + (t % 1 ? '30' : '00'); };
const QS = [.1, .25, .5, .75, .9];
const qs = (q, u) => { let i = 0; while (i < 3 && u > QS[i + 1]) i++; return q[i] + (q[i + 1] - q[i]) * (u - QS[i]) / (QS[i + 1] - QS[i]); }; // linear between published percentiles
const O = D.O, byCode = c => O.find(r => r.code === +c);
const popAB = { M: [0, 0, 0, 0, 0, 0], F: [0, 0, 0, 0, 0, 0] }; for (let a = 18; a < 100; a++) { popAB.M[AB(a)] += D.popY[a][0]; popAB.F[AB(a)] += D.popY[a][1]; }
const jobRate = (oc, sx, a) => oc.M ? (sx === 'M' ? oc.M : oc.F)[AB(a)] / popAB[sx][AB(a)] : 0;
const actShare = (sx, a, act) => a < 18 ? 0 : (D.act[sx][B(a) - 1][act] ?? 0);
const sharedShare = a => { const r = D.hhAge[B(a) - 1] ?? {}; const t = Object.values(r).reduce((x, y) => x + y, 0); return t ? (r.shared ?? 0) / t : 0; }; // P(lives in unrelated-adult household | age band)
const profSum = (sx, a) => O.filter(r => r.code >= 21 && r.code < 25).reduce((s, r) => s + (sx === 'M' ? r.M : r.F)[AB(a)], 0) / O.reduce((s, r) => s + (sx === 'M' ? r.M : r.F)[AB(a)], 0); // share of jobs in degree-level major group 2 (SOC 2020 skill level 4)
// ---------- person
function ageSex(o) {
  const ws = [];
  for (let a = Math.max(o.min ?? (o.age != null ? 0 : 18), o.age ?? 0); a <= Math.min(o.max ?? 99, o.age ?? 99); a++) for (const sx of ['M', 'F']) {
    if (o.sex && o.sex !== sx) continue;
    const w = D.popY[a][sx === 'M' ? 0 : 1] * Math.pow(step(D.ageMul, a), o.pr) * (o.aw ? o.aw(a, sx) : 1); if (w > 0) ws.push([a + sx, w]);
  }
  const k = pk(ws); return { age: parseInt(k), sex: k.slice(-1) };
}
const ukBand = a => a < 16 ? 'Aged 15 years and under' : a < 25 ? 'Aged 16 to 24 years' : a < 35 ? 'Aged 25 to 34 years' : a < 50 ? 'Aged 35 to 49 years' : a < 65 ? 'Aged 50 to 64 years' : 'Aged 65 years and over';
function hoursFor(oc, act, age) { const q = act === 'st' ? D.studentHours[age < 22 ? '18-21' : '22-29'] : (act === 'pt' || (act === 'se' && R() < D.sePT)) ? oc.hp : oc.hf; return Math.max(.5, Math.round(qs(q, .1 + .8 * R()) * 2) / 2); }
function mkShifts(P, h) {
  const L = one(P.lens), n = Math.min(cl(Math.round(h / L), 1, MD), P.d.length), days = [];
  while (days.length < n) { const d = one(P.d); if (!days.includes(d)) days.push(d); }
  days.sort((a, b) => a - b);
  const base = Math.round(h / n * 4) / 4, sts = Array.isArray(P.st) ? P.st : P.st[L] || P.st[Object.keys(P.st)[0]];
  const lens = days.map((d, i) => i === n - 1 ? Math.round((h - base * (n - 1)) * 4) / 4 : base), els = lens.map(l => l + (l > 6 ? .5 : 0));
  const okS = i => { const ok = sts.filter(s => !P.endMax || s + els[i] <= P.endMax); return ok.length ? ok : [Math.min(...sts)]; };
  let st = null; const s0 = one(sts);
  for (let t = 0; t < 60 && !st; t++) { const c = days.map((d, i) => { const o = okS(i); return R() < .5 && o.includes(s0) ? s0 : one(o); }); if (restOk(days, c, els)) st = c; } // 50/50: keep one start time, or vary (structure only)
  st ??= days.map((d, i) => { const o = okS(i); return o.includes(s0) ? s0 : o[0]; });
  return days.map((d, i) => ({ day: DAYS[d], start: hm(st[i]), end: hm(st[i] + els[i]), paid_hours: lens[i] }));
}
const restOk = (days, st, els) => { const n = days.length; let mx = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, g = days[j] * 24 + st[j] + (j <= i ? 168 : 0) - (days[i] * 24 + st[i] + els[i]); if (n > 1 && g < 11) return false; mx = Math.max(mx, g); } return n === 1 || mx >= 35; };
function person(o = {}) {
  const pr = o.pr ?? 0, oc0 = o.occ != null ? byCode(o.occ) : null;
  const aw = (a, sx) => (o.aw ? o.aw(a, sx) : 1) * (o.act ? actShare(sx, a, o.act) : 1) * (oc0 ? jobRate(oc0, sx, a) : 1) * (o.act && oc0 && o.act === 'st' ? 1 : 1);
  const { age, sex } = ageSex({ ...o, pr, aw }), kid = age < 18, b = B(age);
  const eth = o.eth ?? pk(D.eth[EB(age)], k => Math.pow(D.ethMul[k], pr) * (o.ethW ? o.ethW(k) : 1)), g8 = D.G8[eth];
  const uk = R() < Math.min(1, D.ukBorn[eth] * D.ukAge[ukBand(age)] / D.ukAge.Total);
  let bp, yrs = age;
  if (uk) bp = pk(D.ukNation); else {
    bp = pk(D.cobRegion[eth]); const bands = Object.entries(D.arr[g8]).map(([k, v]) => [k, v, parseInt(k), k.includes('over') ? 99 : +k.split(' to ')[1]]).filter(x => x[2] <= age);
    const [, , lo, hi] = bands.find(x => x[0] === pk(bands.map(x => [x[0], x[1]]))); yrs = age - ri(lo, Math.min(hi, age));
  }
  const rel = o.rel ?? pk(D.rel[eth]);
  let act = kid ? (age < 4 ? 'pre' : 'sc') : o.act ?? pk(D.act[sex][b - 1], k => k === 'ho' ? (o.noHo ? 0 : 1) : 1); // no source for carers among unrelated sharers -> excluded for them
  if (act === 're' && age < 50) act = 'si'; // design: the Census 'retired' cell below 50 is folded into long-term sick/disabled (early retirement through ill health)
  let h = pk(D.health[kid ? 0 : b]); if (act === 'si' && /good/.test(h)) h = pk(D.health[b], k => /fair|bad/.test(k) ? 1 : 0); // long-term sick/disabled: not "good" health (definition)
  const emp = ['ft', 'pt', 'se'].includes(act) || (act === 'st' && (o.occ != null || R() < D.stWork));
  let oc = null, P = null, hrs = 0, hp = null, shifts = [], earn = null;
  if (emp) {
    oc = oc0 ?? byCode(pk(O.map(r => [r.code, (act === 'st' ? r.M[0] + r.F[0] : (b > 0 && sex === 'M' ? r.M : r.F)[AB(age)]) * (act === 'st' ? D.studentMajor[Math.floor(r.code / 10)] : act === 'ft' ? r.ftJobs / (r.ftJobs + r.ptJobs) : act === 'pt' ? r.ptJobs / (r.ftJobs + r.ptJobs) : 1)])));
    P = PAT[o.pat ?? (act === 'st' ? 'student' : one(oc.pat))]; hrs = o.hrs ?? hoursFor(oc, act, age); shifts = mkShifts(P, hrs);
    hp = Math.round(Math.max(qs(oc.pay[AB(age)], .1 + .8 * R()), age >= 21 ? D.minWage['21+'] : D.minWage['18-20']) * 100) / 100; earn = Math.round(hp * hrs * 52);
  }
  let edu = null;
  if (!kid) {
    const row = { ...D.edu[Math.min(b - 1, 4)] }; row.deg *= D.eduMul[eth] ?? 1; const z = Object.values(row).reduce((x, y) => x + y, 0); for (const k in row) row[k] /= z;
    if (age < 21) { row.deg = 0; } else if (emp && act !== 'st') { const pp = profSum(sex, age); if (oc.code >= 21 && oc.code < 25) edu = DEGK; else { const d = Math.max(0, (row.deg - pp) / (1 - pp)), rest = 1 - row.deg; for (const k in row) row[k] = k === DEGK ? d : row[k] * (1 - d) / rest; } }
    edu ??= pk(row);
  }
  return { age, sex, eth, bp, yrs, rel, act, edu, h, oc, emp, P, hrs, hp, shifts, earn, contract: !emp ? null : act === 'se' ? 'self-employed' : 'employee', employer: !emp ? null : o.emp ?? (act === 'se' ? 'self-employed' : null), role: o.role };
}
// ---------- households
function bedReq(M, C, type) { // ONS bedroom standard
  if (type === 'shared') return M.length;
  const cp = new Set(C.flatMap(c => [c[0], c[1]])); let r = C.length, m = 0, f = 0, y = 0;
  M.forEach((p, i) => { if (cp.has(i)) return; if (p.age >= 21) r++; else if (p.age >= 10) p.sex === 'M' ? m++ : f++; else y++; });
  return r + Math.ceil(m / 2) + Math.ceil(f / 2) + Math.ceil(Math.max(0, y - (m % 2 + f % 2)) / 2);
}
const bandAge = k => { const [lo, hi] = k === 'under 20' ? [16, 19] : k === '45 and over' ? [45, 49] : k.split(' to ').map(Number); return ri(lo, hi); }; // ONS Table 16 bands (under 20 taken as 16-19 - births to under-16s are unspecified - and 45+ as 45-49)
const BAGE = ['under 20', '20 to 24', '25 to 29', '30 to 34', '35 to 39', '40 to 44', '45 and over'];
const anyBirthAge = () => bandAge(pk(BAGE.map((k, i) => [k, Object.values(D.birthAge).reduce((s, r) => s + r[i], 0)])));
function kidsOf(m) { // children of a woman: number from ONS cohort table, ages from ONS births by parity
  const f = D.fert[m]; if (!f) return m < 20 ? [] : null; const K = +pk(f.map((v, i) => [i, v]));
  for (let t = 0; t < 60; t++) { const ba = []; for (let p = 0; p < K; p++) ba.push(bandAge(pk(BAGE.map((k, i) => [k, D.birthAge[p < 4 ? p : '4 and over'][i]])))); ba.sort((a, b) => a - b); if (ba.every((x, i) => (!i || x - ba[i - 1] >= 1) && x <= m)) return ba.map(x => m - x).reverse(); }
  return null;
}
function build(type, pr, fo = {}) {
  const M = [], C = [], K = [], S = [], G = [], IL = [], foc = fo.p, ix = p => M.indexOf(p);
  const me = o => { const p = foc ?? person({ pr, ...fo, ...o }); M.push(p); return p; };
  const mk = (o, a) => { const p = person({ pr, eth: a.eth, ...o }); M.push(p); return p; };
  const married = (a, b) => R() < D.marr.M[B(Math.max(a.age, b.age)) - 1];
  const mate = (a, minAge = 18, ss = false) => { const sx = ss ? a.sex : a.sex === 'M' ? 'F' : 'M', age = ss ? Math.floor(a.age / 5) * 5 + ri(0, 4) : Math.round(a.sex === 'M' ? a.age - D.partnerGap : a.age + D.partnerGap); if (age < minAge || age > 99) return null; const eth = R() < D.pMixedPartner ? pk(D.eth[EB(age)], k => k === a.eth ? 0 : 1) : a.eth; const q = person({ pr, age, sex: sx, eth }); M.push(q); C.push([ix(a), ix(q), married(a, q)]); return q; };
  const adultKidsOnly = p => { if (p.sex !== 'F' || p.age < 20) return true; for (let t = 0; t < 40; t++) { const k = kidsOf(p.age); if (k && k.every(x => x >= 18)) { p.away = k; return true; } } return false; };
  const kidP = (age, m, f) => person({ pr, age, sex: ageSex({ age, pr: 0 }).sex, eth: f && f.eth !== m.eth ? 'mx' : m.eth, rel: m.rel });
  if (type === 'one') { const a = me({}); if (!adultKidsOnly(a)) return null; return { M, C, K, S, G, IL, type }; }
  if (type === 'couple') { const a = me({}), b = mate(a, 18, R() < D.ssNoKids); if (!b || ![a, b].every(adultKidsOnly)) return null; return { M, C, K, S, G, IL, type }; }
  if (type === 'shared') {
    const a = me({ aw: (x) => sharedShare(x), max: 64, noHo: 1 }), n = fo.n ?? +pk(Object.entries(D.hhSize).filter(([k]) => /^[2-9]|^8/.test(k) && !/Total/.test(k)).map(([k, v]) => [parseInt(k), v]));
    while (M.length < n) M.push(person({ pr, aw: sharedShare, max: 64, noHo: 1 })); if (!M.every(adultKidsOnly)) return null; return { M, C, K, S, G, IL, type };
  }
  if (type === 'withparents') {
    const c = me({ min: 18 }), mo = person({ pr, age: c.age + anyBirthAge(), sex: 'F', eth: c.eth, rel: c.rel }); if (mo.age > 94) return null; M.push(mo); K.push([ix(mo), ix(c)]);
    if (R() > D.parLone) { const fa = mate(mo, 18); if (!fa) return null; K.push([ix(fa), ix(c)]); } return { M, C, K, S, G, IL, type };
  }
  const adult = type.endsWith('adult'), lone = type.startsWith('lone'); let mo, fa = null; const f0 = me({ sex: lone ? 'F' : fo.sex });
  if (f0.sex === 'F') mo = f0; else if (lone) mo = { age: Math.round(f0.age - D.partnerGap), eth: f0.eth, rel: f0.rel, away: [] }; else { mo = person({ pr, age: Math.round(f0.age - D.partnerGap), sex: 'F', eth: f0.eth }); if (mo.age < 18) return null; M.push(mo); C.push([0, 1, married(f0, mo)]); fa = f0; }
  if (!lone && !fa) { fa = mate(mo); if (!fa) return null; }
  const ks = (() => { for (let t = 0; t < 80; t++) { const k = kidsOf(mo.age); if (!k || !k.length) continue; const dep = k.some(x => x < 18); if (adult ? k.every(x => x >= 18) : dep) return k; } return null; })(); if (!ks) return null;
  const hk = adult ? ks : ks.filter(x => x < 18); if (!lone || f0.sex === 'F') mo.away = adult ? [] : ks.filter(x => x >= 18);
  const kids = hk.map(a => { const k = kidP(a, mo, fa); M.push(k); if (M.includes(mo)) K.push([ix(mo), ix(k)]); if (fa) K.push([ix(fa), ix(k)]); else if (lone && !M.includes(mo)) K.push([ix(f0), ix(k)]); return k; });
  kids.forEach((x, i) => kids.slice(i + 1).forEach(y => S.push([ix(x), ix(y)])));
  if (type === 'multigen') { const ga = mo.age + anyBirthAge(); if (ga > 94) return null; const gp = person({ pr, age: ga, sex: 'F', eth: mo.eth, rel: mo.rel }); M.push(gp); K.push([ix(gp), ix(mo)]); IL.push([ix(fa), ix(gp)]); kids.forEach(k => G.push([ix(gp), ix(k)])); }
  return { M, C, K, S, G, IL, type };
}
let IDN = 0; // no names (no source conditions them on ethnicity, religion and family): ids say who is who; the simulation's world builder names everyone
function finish(h, pr, tenure) {
  const { M, C, K, S, G, IL, type } = h, n = M.length, rel = M.map(() => ({}));
  const link = (a, b, c) => { rel[a][b] = LAB[c][M[b].sex]; rel[b][a] = LAB[INV[c]][M[a].sex]; };
  C.forEach(([a, b, m]) => link(a, b, m ? 'spouse' : 'partner')); K.forEach(([a, b]) => link(a, b, 'child')); S.forEach(([a, b]) => link(a, b, 'sib')); G.forEach(([a, b]) => link(a, b, 'gchild')); IL.forEach(([a, b]) => link(a, b, 'pil'));
  if (type === 'shared') for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) link(i, j, 'hm');
  M.forEach(p => { p.id ??= 'p' + ++IDN; });
  const stat = p => pk(D.rs[p.sex][B(p.age) - 1], k => k === 'married' || k === 'cohab' ? 0 : 1);
  M.forEach((p, i) => { const c = C.find(x => x[0] === i || x[1] === i); p.status = c ? (c[2] ? 'married' : 'cohabiting') : p.age < 18 ? 'single' : { single: 'single', divorced: 'separated or divorced', widowed: 'widowed' }[stat(p)]; });
  M.forEach((p, i) => {
    p.kids = K.filter(k => k[0] === i).map(k => ({ id: M[k[1]].id, age: M[k[1]].age, lives: 'with me' }));
    for (const a of p.away ?? []) p.kids.push({ id: 'p' + ++IDN, age: a, lives: 'own household' });
  });
  const eld = Math.max(...M.filter(x => x.age >= 18).map(x => x.age)), req = bedReq(M, C, type), adults = M.filter(x => x.age >= 18).length;
  const tk = tenure ?? pk(D.ten[D.tt[type]], k => D.tenAge[eld >= 65 ? 'o65' : 'u65'][k] * Math.pow(D.tenMul[k], pr));
  let bd = null;
  for (let t = 0; t < 40 && !bd; t++) { const tb = D.bed[R() < pr ? 'IL' : 'EW'][`${tk}|${Math.min(n, 4)}`], x = +pk(tb); if (x * 2 >= adults && x * 3 >= n && (type !== 'shared' || x >= n)) bd = x; } // unrelated adults each need their own bedroom (bedroom standard)
  if (!bd && type === 'shared' && n > 4) bd = n; // RM136 stops at '4 or more' bedrooms (unspecified beyond)
  if (!bd) return null;
  const kind = n === 1 ? 'one-person household' : type === 'shared' ? 'other household: unrelated adults sharing' : G.length ? 'multi-generation family household' : (C.length && K.length ? 'couple family' : K.length ? 'lone-parent family' : 'couple family') + (K.length ? (M.some(x => x.age < 18) ? ' with dependent children' : ' with non-dependent children') : ', no children');
  return M.map((p, i) => {
    const q = {
      id: p.id, age: p.age, sex: p.sex, ethnicity: D.ethLabel[p.eth], birthplace: p.bp, years_in_uk: p.yrs, religion: p.rel, activity: ACT[p.act],
      occupation: p.emp ? p.oc.title : null, contract: p.contract, employer: p.employer, annual_income: p.earn, hours_per_week: p.hrs, shifts: p.shifts,
      household: { type: kind, tenure: D.tenLabel[tk], bedrooms: bd, occupancy_rating: bd - req, size: n, members: M.map((m, j) => j === i ? null : { id: m.id, age: m.age, sex: m.sex, relation: rel[i][j] }).filter(Boolean) },
      relationship_status: p.status, children: p.kids, health: p.h, education: p.edu ? D.eduLabel[p.edu] : p.age < 5 ? 'pre-school' : p.age < 11 ? 'primary school' : 'secondary school / college',
      hourly_pay: p.hp, role: p.role ?? null
    };
    Object.defineProperty(q, '_', { value: { P: p.P, oc: p.oc, act: p.act, edu: p.edu, p } }); return q;
  });
}
function hhFor(p, pr) {
  for (let t = 0; t < 80; t++) {
    const type = pk(D.hhAge[B(p.age) - 1], k => Math.pow(D.hhMul[k] ?? 1, pr) * (k.startsWith('lone') ? D.hhEth.lone[p.eth] : k === 'one' ? D.hhEth.one[p.eth] : k === 'shared' || k === 'multigen' ? D.hhEth.other[p.eth] : 1) * (k.startsWith('lone') ? (p.sex === 'F' ? D.loneMother[k === 'lone_dep' ? 'dep' : 'adult'] : 1 - D.loneMother[k === 'lone_dep' ? 'dep' : 'adult']) : 1) * (k === 'shared' && p.act === 'ho' ? 0 : 1));
    const h = build(type, pr, { p }); if (h) { const r = finish(h, pr); if (r) return r[0]; }
  }
  throw new Error('no household');
}
// ---------- validation (works on output objects; groups are resampled on failure)
const FTMIN = Math.floor(Math.min(...O.map(r => r.hf[0]))), STUMAX = Math.max(...Object.values(D.studentHours).map(q => q[4]));
export function validate(ps) {
  const E = [], e = (p, m) => E.push(`${p.id}: ${m}`);
  if (new Set(ps.map(p => p.id)).size !== ps.length) E.push('duplicate ids in group');
  for (const p of ps) {
    const { P, oc, act } = p._ ?? {}, h = p.household, hrs = p.hours_per_week, adults = h.members.filter(m => m.age >= 18).length + (p.age >= 18);
    if (!(p.age >= 0 && p.age <= 99)) e(p, 'age'); if (p.years_in_uk > p.age) e(p, 'years_in_uk > age');
    if (act === 'ft' && hrs < FTMIN) e(p, 'ft hours'); if (act === 'pt' && hrs > 30) e(p, 'pt hours'); if (act === 'st' && hrs > STUMAX) e(p, 'student job hours');
    if ((p.contract === 'self-employed') !== (act === 'se')) e(p, 'contract vs self-employed');
    if (act === 'si' && /good/.test(p.health)) e(p, 'sick but good health');
    if (p.age < 18 && (p.children.length || p.relationship_status !== 'single' || p.occupation)) e(p, 'minor with adult attributes');
    if (!p.occupation) { if (hrs || p.shifts.length || p.contract || p.annual_income) e(p, 'non-worker has work fields'); }
    else {
      const s = p.shifts, sum = s.reduce((a, x) => a + x.paid_hours, 0), allowed = new Set([P.st].flat().concat(Object.values(P.st).flat()));
      if (Math.abs(sum - hrs) > .01) e(p, `shift hours ${sum} != ${hrs}`);
      if (new Set(s.map(x => x.day)).size !== s.length || s.length > MD || !s.length) e(p, 'shift days');
      for (const x of s) { const st = +x.start.slice(0, 2) + (x.start.endsWith('30') ? .5 : 0); if (x.paid_hours > CAP || !allowed.has(st) || !P.d.includes(DAYS.indexOf(x.day))) e(p, 'shift ' + x.day + x.start); if (P.endMax && st + x.paid_hours + (x.paid_hours > 6 ? .5 : 0) > P.endMax) e(p, 'cafe shift runs past close'); }
      if (!restOk(s.map(x => DAYS.indexOf(x.day)), s.map(x => +x.start.slice(0, 2) + (x.start.endsWith('30') ? .5 : 0)), s.map(x => x.paid_hours + (x.paid_hours > 6 ? .5 : 0)))) e(p, 'insufficient rest between shifts');
      if (Math.abs(p.annual_income - Math.round(p.hourly_pay * hrs * 52)) > 1) e(p, 'pay != hourly x hours');
      const q = oc.pay[AB(p.age)]; if (p.hourly_pay < Math.min(q[0], p.age >= 21 ? D.minWage['21+'] : D.minWage['18-20']) - .01 || p.hourly_pay > Math.max(q[4], D.minWage['21+']) + .01) e(p, 'hourly outside ASHE p10-p90 for age band');
      if (oc.code >= 21 && oc.code < 25 && p._.edu !== DEGK) e(p, 'degree-level occupation without degree');
    }
    if (p.age < 21 && p._.edu === DEGK) e(p, 'degree before 21');
    if (h.size !== h.members.length + 1) e(p, 'household size');
    if (adults > 2 * h.bedrooms || h.size > 3 * h.bedrooms) e(p, `overfull: ${adults} adults/${h.size} people in ${h.bedrooms} bed`);
    if (h.type.startsWith('other household') && h.bedrooms < h.size) e(p, 'sharers vs bedrooms');
    if (p.age < 18 && !h.members.some(m => m.age >= 18)) e(p, 'minor without adult');
    let partners = 0;
    for (const m of h.members) {
      const c = CLS[m.relation]; if (!c) { e(p, 'unknown relation ' + m.relation); continue; }
      if (LAB[c][m.sex] !== m.relation) e(p, `relation ${m.relation} vs sex ${m.sex}`);
      if (!GAP[c](p.age, m.age)) e(p, `age gap for ${m.relation}: ${p.age} vs ${m.age}`);
      if (c === 'spouse' || c === 'partner') partners++;
      if (c === 'child' && !p.children.some(k => k.id === m.id && k.lives === 'with me')) e(p, 'household child missing from children');
      const q2 = ps.find(x => x !== p && x.id === m.id);
      if (q2) { const back = q2.household.members.find(x => x.id === p.id); if (!back || back.relation !== LAB[INV[c]][p.sex]) e(p, `inverse mismatch with ${m.id}`); }
    }
    if ((p.relationship_status === 'married' || p.relationship_status === 'cohabiting') !== (partners === 1)) e(p, 'status vs partner in household');
    for (const k of p.children) { if (p.age - k.age < 15) e(p, 'child too old'); if (k.lives === 'with me' && !h.members.some(m => m.id === k.id && CLS[m.relation] === 'child')) e(p, 'child "with me" not in household'); }
  }
  return E;
}
// ---------- settings
const retry = f => { for (let t = 0; t < 400; t++) { let g; try { g = f(); } catch { continue; } if (g && !validate(g.people).length) return g; } throw new Error('could not generate valid group'); };
const SET = {
  flatshare: (n, pr) => { const h = build('shared', pr, { n: Math.max(2, n) }); return h && { people: finish(h, pr, 'priv') }; },
  family: (n, pr) => { // one whole household of 3+ (n, if >= 3, is a target size)
    for (let t = 0; t < 600; t++) {
      const type = pk(D.famType), w = k => type.startsWith('lone') ? D.hhEth.lone[k] : type === 'multigen' ? D.hhEth.other[k] : 1;
      const p = person({ pr, sex: type.startsWith('lone') ? (R() < D.loneMother[type === 'lone_dep' ? 'dep' : 'adult'] ? 'F' : 'M') : 'F', aw: (a) => { const r = D.hhAge[B(a) - 1] ?? {}, z = Object.values(r).reduce((x, y) => x + y, 0); return z ? (r[type] ?? 0) / z : 0; }, ethW: w });
      const h = build(type, pr, { p }); if (!h || h.M.length < 3 || (n >= 3 && t < 500 && h.M.length !== n)) continue; const r = finish(h, pr); if (r) return { people: r };
    }
  },
  cafe: (n, pr) => {
    const base = { pr, pat: 'cafe', emp: 'this café' };
    const ps = [person({ ...base, act: 'se', occ: 12, role: 'owner-manager', min: 25, emp: 'this café (owner)' })];
    for (let i = 1; i < n; i++) { const cook = i === 1 && n >= 3, st = !cook && i === n - 1 && n >= 4; ps.push(person(cook ? { ...base, occ: 54, role: 'cook', act: one(['ft', 'pt']) } : { ...base, occ: 92, role: one(['barista', 'counter assistant', 'server', 'kitchen assistant']), act: st ? 'st' : one(['ft', 'pt']) })); }
    return { people: ps.map(p => hhFor(p, pr)) };
  },
  street: (n, pr) => ({ area: 'one inner-city area (inner profile)', people: Array.from({ length: n }, () => hhFor(person({ pr, min: 18 }), pr)) }),
  friends: (n, pr) => {
    const a = person({ pr, min: 18 }), P = [a], at = x => ({ eth: x.eth, edu: x.edu, rel: x.rel, oc: x.oc?.code }), shared = (x, y) => [['eth', 'ethnicity'], ['edu', 'education'], ['rel', 'religion'], ['oc', 'occupation group']].filter(([k]) => at(x)[k] != null && at(x)[k] === at(y)[k]).map(([, l]) => l);
    for (let guard = 0; P.length < n && guard < 2000; guard++) {
      const q = person({ pr, min: Math.max(18, a.age - FRIEND_AGE_WINDOW), max: a.age + FRIEND_AGE_WINDOW });
      if (P.some(x => shared(x, q).length) && !P.some(x => x.sex === q.sex && x.age === q.age && shared(x, q).length > 3)) P.push(q);
    }
    if (P.length < n) throw new Error('friends');
    const people = P.map(p => hhFor(p, pr)), ties = [];
    P.forEach((x, i) => P.slice(i + 1).forEach((y, j) => ties.push({ a: people[i].id, b: people[i + 1 + j].id, shared: shared(x, y), age_gap: Math.abs(x.age - y.age) })));
    return { people, ties };
  }
};
const PR = { flatshare: .5, family: 0, cafe: .5, street: 1, friends: .75 };
export function sample(setting, n, seed) { seedRng(setting + ':' + seed); IDN = 0; const g = retry(() => SET[setting](n, PR[setting])); return { setting, n, seed, ...g }; }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , s, n = 4, seed = 1] = process.argv;
  if (!SET[s]) { console.error('setting: ' + Object.keys(SET).join('|')); process.exit(1); }
  console.log(JSON.stringify(sample(s, +n, seed), null, 1));
}
