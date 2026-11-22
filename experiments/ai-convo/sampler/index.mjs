// Standalone UK people sampler. Usage: node index.mjs <flatshare|family|cafe|street|friends> <n> <seed>
// Data + citations: data.json (approximate published figures). No Larkfield code or data is used.
// JOINT vs CONDITIONAL: the only joint draw is age x sex (Census pop table). Everything else is conditional, in this order:
//   ethnicity|age -> birthplace|ethnicity,age -> religion|ethnicity,age -> activity|age,sex -> education|age,ethnicity,activity
//   -> health|age,activity -> occupation|sex,age,education,activity -> hours|activity,pattern -> hourly pay|occupation,age (ASHE p10-p90)
//   -> shifts|hours,pattern -> contract|pattern -> names|ethnicity,religion,birth cohort.
// Households: either household-first (family, flatshare: type -> members) or person-first (street, cafe, friends:
//   person -> household type|age,ethnicity,sex -> relatives built around them). Then tenure|type,age -> bedrooms|tenure,bedroom standard.
// Not modelled jointly (no cross-tab used): ethnicity x tenure, education x ethnicity beyond a degree multiplier, occupation x ethnicity.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export const D = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url), 'utf8'));
const YEAR = 2025, DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], DEGK = 'deg';
const O = D.O.map((r, i) => { const [t, pat, M, F, y, o, deg, se, ...q] = r; return { id: i + 1, t, pat, M, F, y, o, deg, se, pay: q.slice(0, 5), er: q[5].split('|') }; });
const ACT = { ft: 'employed full-time', pt: 'employed part-time', se: 'self-employed', st: 'student', un: 'unemployed', re: 'retired', si: 'long-term sick or disabled', ho: 'looking after home or family', pre: 'pre-school child', sc: 'school pupil' };
const LAB = { child: { M: 'son', F: 'daughter' }, parent: { M: 'father', F: 'mother' }, spouse: { M: 'husband', F: 'wife' }, partner: { M: 'partner', F: 'partner' }, sib: { M: 'brother', F: 'sister' }, gchild: { M: 'grandson', F: 'granddaughter' }, gparent: { M: 'grandfather', F: 'grandmother' }, pil: { M: 'father-in-law', F: 'mother-in-law' }, cil: { M: 'son-in-law', F: 'daughter-in-law' }, hm: { M: 'housemate (unrelated)', F: 'housemate (unrelated)' } };
const INV = { child: 'parent', parent: 'child', spouse: 'spouse', partner: 'partner', sib: 'sib', gchild: 'gparent', gparent: 'gchild', pil: 'cil', cil: 'pil', hm: 'hm' };
const CLS = {}; for (const [c, v] of Object.entries(LAB)) for (const l of Object.values(v)) CLS[l] = c;
const GAP = { child: (a, b) => a - b >= 16, parent: (a, b) => b - a >= 16, gchild: (a, b) => a - b >= 30, gparent: (a, b) => b - a >= 30, spouse: (a, b) => Math.abs(a - b) <= 30, partner: (a, b) => Math.abs(a - b) <= 30, sib: (a, b) => Math.abs(a - b) <= 25, pil: (a, b) => b - a >= 10, cil: (a, b) => a - b >= 10, hm: () => true };
// ---------- rng + helpers
let R = Math.random;
export const seedRng = s => { let a = 0; for (const c of String(s)) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 0x9E3779B9) >>> 0; R = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const rn = (m, s) => m + s * Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
const cl = (x, a, b) => Math.max(a, Math.min(b, x));
const ent = w => Array.isArray(w) ? w : typeof w === 'string' ? w.split(',').map(x => x.split(':')) : Object.entries(w);
const pk = (w, f) => { const e = ent(w), v = e.map(([k, x]) => +x * (f ? f(k) : 1)); let r = R() * v.reduce((a, b) => a + b, 0); for (let i = 0; i < e.length; i++) if ((r -= v[i]) < 0) return e[i][0]; return e[e.length - 1][0]; };
const one = a => a[Math.floor(R() * a.length)];
const step = (t, x) => { let m = 1; for (const [f, v] of t) if (x >= f) m = v; return m; };
const B = a => a < 18 ? 0 : a < 25 ? 1 : a < 35 ? 2 : a < 50 ? 3 : a < 65 ? 4 : a < 75 ? 5 : 6;
const EB = a => a < 16 ? 0 : a < 25 ? 1 : a < 35 ? 2 : a < 50 ? 3 : a < 65 ? 4 : 5;
const hm = t => { t = ((t % 24) + 24) % 24; return String(Math.floor(t)).padStart(2, '0') + ':' + (t % 1 ? '30' : '00'); };
// ---------- person
function ageSex(o) { // the one joint draw: age x sex, with optional range, profile and setting weights
  const ws = [];
  for (const [lo, hi, m, f] of D.pop) for (const [sx, n] of [['M', m], ['F', f]]) {
    const a0 = Math.max(lo, o.min ?? (o.age != null ? 0 : 18), o.age ?? 0), a1 = Math.min(hi, o.max ?? 99, o.age ?? 99);
    if (a0 > a1 || (o.sex && o.sex !== sx)) continue;
    ws.push([`${sx}:${a0}:${a1}`, n * Math.pow(step(D.prof.age, (a0 + a1) / 2), o.pr) * (o.aw ? step(o.aw, (a0 + a1) / 2) : 1) * (a1 - a0 + 1) / (hi - lo + 1)]);
  }
  const [sex, a0, a1] = pk(ws).split(':'); return { sex, age: o.age ?? ri(+a0, +a1) };
}
const QS = [.1, .25, .5, .75, .9];
function hourly(oc, age, uMax = .9) {
  const u = cl((R() + R()) / 2 * .8 + .1 + (age < 25 ? -.18 : age < 35 ? -.05 : age < 55 ? .05 : 0), .1, uMax);
  let i = 0; while (i < 3 && u > QS[i + 1]) i++;
  const q = oc.pay, h = q[i] + (q[i + 1] - q[i]) * (u - QS[i]) / (QS[i + 1] - QS[i]);
  return Math.round(h * (age < 21 ? .82 : 1) * 100) / 100; // 18-20: NMW is lower
}
function mkShifts(P, h) {
  const L = +pk(P.lens), n0 = cl(Math.round(h / L), 1, P.md), pool = [0, 1, 2, 3, 4, 5, 6].filter(d => d < 5 || P.we > 0), n = Math.min(n0, pool.length), days = [];
  while (days.length < n) days.push(+pk(pool.filter(d => !days.includes(d)).map(d => [d, d >= 5 ? P.we : 1])));
  days.sort((a, b) => a - b);
  const base = Math.round(h / n * 4) / 4, sts = P.st[L] || P.st.d;
  return days.map((d, i) => {
    const len = i === n - 1 ? Math.round((h - base * (n - 1)) * 4) / 4 : base, el = len + (len > 6 ? .5 : 0);
    const ok = sts.filter(s => !P.endMax || s + el <= P.endMax), s = one(ok.length ? ok : [Math.min(...sts)]);
    return { day: DAYS[d], start: hm(s), end: hm(s + el), paid_hours: len };
  });
}
const wOcc = (r, sex, age, edu, act) => r[sex] * (age < 25 ? r.y : age >= 60 ? r.o : 1) * (r.deg > 0 ? (edu === DEGK ? 1 : r.deg > 1 ? 0 : .15) : r.deg < 0 && edu === DEGK ? .35 : 1) * (act === 'se' ? r.se : 1) * (act === 'pt' && r.deg < 0 ? 2 : 1);
function firstName(eth, rel, sex, age) {
  let pool = D.names[eth === 'in' ? (rel === 'Sikh' ? 'sikh' : rel === 'Muslim' ? 'pk' : 'in') : eth];
  if (typeof pool === 'string') pool = D.names[one(pool.split(' '))];
  const v = pool[sex]; if (typeof v === 'string') return [one(v.split(' ')), one(pool.S)];
  const by = YEAR - age, i = by < 1960 ? 0 : by < 1980 ? 1 : by < 2000 ? 2 : 3;
  for (const d of [0, 1, -1, 2, -2, 3, -3]) { const k = 'abcd'[i + d]; if (k && v[k]) return [one(v[k].split(' ')), one(pool.S)]; }
}
function person(o = {}) {
  const pr = o.pr ?? 0, { age, sex } = ageSex({ ...o, pr }), kid = age < 18, b = B(age);
  const eth = o.eth ?? pk(D.eth[EB(age)], k => Math.pow(D.prof.eth[k], pr));
  const uk = R() < 1 - (1 - D.ukBorn[eth]) * (age < 16 ? .35 : 1), bp = uk ? pk(D.ukb) : pk(D.cob[eth]);
  const a0 = age < 18 || R() < .22 ? ri(0, Math.min(15, age)) : ri(18, Math.min(38, age));
  const yrs = uk ? age : Math.min(age, Math.max(1, age - a0));
  const rel = o.rel ?? pk(D.rel[eth], k => k === 'No religion' ? (age < 35 ? 1.3 : age < 55 ? 1 : .75) : 1);
  const act = kid ? (age < 4 ? 'pre' : 'sc') : o.act ?? pk(D.act[sex][b - 1]);
  const edu = kid ? null : o.edu ?? (act === 'st' ? (age < 22 ? pk('l3:85,gcse:15') : pk('deg:55,l3:45')) : pk(D.edu[b - 1], k => k === DEGK ? D.eduMul[eth] : 1));
  let h = pk(D.health[kid ? 0 : b]);
  if (act === 'si') h = pk('fair:30,bad:45,very bad:25'); else if (act === 'ft' || act === 'se') while (h === 'very bad' || (h === 'bad' && R() < .6)) h = pk(D.health[b]);
  const emp = ['ft', 'pt', 'se'].includes(act) || (act === 'st' && (o.occ != null || R() < .38));
  const former = !emp && ['re', 'un', 'si', 'ho'].includes(act) && age >= 25;
  let oc = null; if (emp || former) oc = O[(o.occ ?? +pk(emp && act === 'st' ? D.sj : Object.fromEntries(O.map(r => [r.id, wOcc(r, sex, age, edu, act === 'st' ? 'ft' : act)])))) - 1];
  let P, hrs = 0, hp = null, shifts = [], inc = null, src = null;
  if (emp) {
    P = D.pat[o.pat ?? (act === 'st' ? 'student' : oc.pat)];
    hrs = Math.min(o.hrs ?? (act === 'ft' ? +pk(P.fth) : act === 'pt' ? +pk(D.ptHours) : act === 'se' ? ri(18, 50) : ri(6, 16)), P.md * P.cap);
    hp = hourly(oc, age, o.uMax); shifts = mkShifts(P, hrs); inc = Math.round(hp * hrs * 52); src = 'earnings';
  } else if (D.inc[act]) { const [s, lo, hi] = D.inc[act]; src = s; inc = ri(lo, hi); }
  const [fn, sn] = firstName(eth, rel, sex, age);
  const contract = !emp ? null : act === 'se' ? 'self-employed' : pk(D.contract, k => k === 'zero hours' ? P.zh * (act === 'st' ? 2.5 : 1) : 1);
  const employer = !emp ? null : o.emp ?? (act === 'se' ? 'self-employed (own account)' : pk(Object.fromEntries(oc.er.map((s, i) => [s, 1 / (i + 1)]))));
  return { fn, sn, age, sex, eth, bp, yrs, rel, act, edu, h, oc, emp, former, P, hrs, hp, shifts, inc, src, contract, employer, role: o.role };
}
// ---------- households
function bedReq(M, C, type) { // ONS bedroom standard
  if (type === 'shared') return M.length;
  const cp = new Set(C.flatMap(c => [c[0], c[1]])); let r = C.length, m = 0, f = 0, y = 0;
  M.forEach((p, i) => { if (cp.has(i)) return; if (p.age >= 21) r++; else if (p.age >= 10) p.sex === 'M' ? m++ : f++; else y++; });
  return r + Math.ceil(m / 2) + Math.ceil(f / 2) + Math.ceil(Math.max(0, y - (m % 2 + f % 2)) / 2);
}
function build(type, pr, fo = {}, minK = 0) {
  const M = [], C = [], K = [], S = [], G = [], IL = [], foc = fo.p, ix = p => M.indexOf(p);
  const me = o => { const p = foc ?? person({ pr, ...fo, ...o }); M.push(p); return p; };
  const mar = (a, b) => R() < D.marr[B(Math.max(a.age, b.age)) - 1];
  const partner = (a, minAge = 18, eth) => {
    const sx = R() < .012 ? a.sex : a.sex === 'M' ? 'F' : 'M', d = a.sex === sx ? rn(0, 3) : rn(2.2, 3.5);
    const e = eth ?? (R() < D.endog[a.eth] ? a.eth : a.eth === 'wb' ? pk(D.eth[EB(a.age)], k => k === 'wb' ? 0 : 1) : R() < .6 ? 'wb' : 'mx');
    const q = person({ pr, age: cl(Math.max(minAge, Math.round(a.sex === 'M' ? a.age - d : a.age + d)), 18, 95), sex: sx, eth: e, rel: R() < .8 ? a.rel : undefined });
    M.push(q); C.push([ix(a), ix(q), mar(a, q)]); return q;
  };
  const kidAges = (o, k, lo) => { const a = [o]; while (a.length < k) { const n = a[a.length - 1] - (R() < .03 ? 0 : ri(1, 4)); if (n < lo) break; a.push(n); } return a; };
  const mkKids = (ages, a, b) => {
    const ks = ages.map(ag => { const k = person({ pr, age: ag, eth: b && a.eth !== b.eth ? 'mx' : a.eth, rel: R() < .85 ? a.rel : undefined }); M.push(k); K.push([ix(a), ix(k)]); if (b) K.push([ix(b), ix(k)]); return k; });
    ks.forEach((x, i) => ks.slice(i + 1).forEach(y => S.push([ix(x), ix(y)]))); return ks;
  };
  const age0 = foc?.age ?? fo.age, sex0 = foc?.sex ?? fo.sex, res = () => ({ M, C, K, S, G, IL, type });
  if (type === 'one') { me({}); return res(); }
  if (type === 'couple') { partner(me({})); return res(); }
  if (type === 'shared') {
    const a = me({ aw: D.flatAge, max: 64 }), n = fo.n ?? +pk(D.nKids.shared);
    while (M.length < n) M.push(person({ pr, aw: D.flatAge, ...(R() < .6 ? { min: Math.max(18, a.age - 6), max: a.age + 6 } : { max: 64 }) }));
    return res();
  }
  if (type === 'withparents') {
    const c = me({ min: 18 }), fb = Math.max(17, Math.round(rn(28.8, 5.4))), mo = person({ pr, age: c.age + fb, sex: 'F', eth: c.eth, rel: c.rel });
    if (mo.age > 88) return null; M.push(mo);
    const fa = R() > .32 ? partner(mo, c.age + 17, c.eth) : null; K.push([ix(mo), ix(c)]); if (fa) K.push([ix(fa), ix(c)]);
    const sib = +pk('0:50,1:35,2:15'), ks = sib ? mkKids(kidAges(c.age - ri(1, 4), sib, 0), mo, fa) : [];
    if (ks.length && c.age - ks[0].age < 1) return null;
    ks.forEach(k => S.push([0, ix(k)])); return res();
  }
  const adult = type.endsWith('adult'), lone = type.startsWith('lone'), sx = sex0 ?? (lone ? (R() < .85 ? 'F' : 'M') : one(['F', 'M']));
  let o, age, okk = false;
  for (let t = 0; t < 30 && !okk; t++) {
    const fb = Math.max(17, Math.round(rn(sx === 'F' ? 28.8 : 31.5, 5.4)));
    o = age0 != null ? age0 - fb : adult ? ri(18, 34) : ri(0, 17); age = age0 ?? o + fb;
    okk = (adult ? o >= 18 && o <= 34 : o >= 0 && o <= 17) && age >= 18 && age <= 95;
  }
  if (!okk) return null;
  const a = me({ sex: sx, age, eth: fo.eth }), b = lone ? null : partner(a, o + 17);
  if (b) C.length = 1, C[0][2] = mar(a, b);
  const nk = Math.max(minK, +pk(D.nKids[adult ? 'adult' : lone ? 'lone_dep' : 'couple_dep'])), kids = mkKids(kidAges(o, nk, adult ? 18 : 0), a, b);
  if (type === 'multigen') {
    const gp = person({ pr, age: a.age + Math.max(18, Math.round(rn(28, 5))), sex: R() < .6 ? 'F' : 'M', eth: a.eth, rel: a.rel });
    if (gp.age > 94) return null; M.push(gp); K.push([ix(gp), 0]); IL.push([ix(b), ix(gp)]); kids.forEach(k => G.push([ix(gp), ix(k)]));
    if (R() < .3) { const g2 = partner(gp, 18, a.eth); K.push([ix(g2), 0]); IL.push([ix(b), ix(g2)]); kids.forEach(k => G.push([ix(g2), ix(k)])); }
  }
  return res();
}
const nameOf = p => p.fn + ' ' + p.sn;
function finish(h, pr, tenure) {
  const { M, C, K, S, G, IL, type } = h, n = M.length, rel = M.map(() => ({}));
  const link = (a, b, c) => { rel[a][b] = LAB[c][M[b].sex]; rel[b][a] = LAB[INV[c]][M[a].sex]; };
  C.forEach(([a, b, m]) => link(a, b, m ? 'spouse' : 'partner')); K.forEach(([a, b]) => link(a, b, 'child')); S.forEach(([a, b]) => link(a, b, 'sib'));
  G.forEach(([a, b]) => link(a, b, 'gchild')); IL.forEach(([a, b]) => link(a, b, 'pil'));
  if (type === 'shared') for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) link(i, j, 'hm');
  const sur = () => K.forEach(([a, c]) => { const ps = K.filter(k => k[1] === c).map(k => M[k[0]]); M[c].sn = (ps.find(x => x.sex === 'M') ?? ps[0]).sn; });
  sur(); C.forEach(([a, b, m]) => { const [x, y] = M[a].sex === 'M' ? [M[a], M[b]] : [M[b], M[a]]; if (x.sex !== y.sex && R() < (m ? .75 : .15)) y.sn = x.sn; }); sur();
  const stat = p => { const b = B(p.age) - 1, k = pk(D.rs[b], k => k === 'married' || k === 'cohab' ? 0 : k === 'widowed' ? (p.sex === 'F' ? 1.45 : .55) : k === 'divorced' ? (p.sex === 'F' ? 1.1 : .9) : 1); return k === 'single' ? (R() < D.lat[b] ? 'in a relationship (living apart)' : 'single') : k === 'divorced' ? 'separated or divorced' : k; };
  M.forEach((p, i) => { const c = C.find(x => x[0] === i || x[1] === i); p.status = c ? (c[2] ? 'married' : 'cohabiting') : p.age < 18 ? 'single' : stat(p); });
  const kidRec = (p, c) => ({ name: nameOf(c), age: c.age, lives: 'with me' });
  M.forEach((p, i) => {
    p.kids = K.filter(k => k[0] === i).map(k => kidRec(p, M[k[1]]));
    const hasDep = p.kids.some(k => k.age < 18), cl0 = D.childless[p.sex][Math.max(0, B(p.age) - 1)];
    const cnt = p.kids.length ? (R() < .2 ? 1 : 0) : p.age < 18 || R() < cl0 ? 0 : +pk(D.nkids);
    for (let t = 0; t < cnt && !hasDep; t++) {
      const ka = p.age - Math.max(17, Math.round(rn(p.sex === 'F' ? 28.5 : 31.5, 5.5)));
      if (ka < 0 || (ka < 18 && (p.kids.length || R() > (p.sex === 'M' ? .35 : .1)))) continue;
      const ks = one(['M', 'F']), [f] = firstName(p.eth, p.rel, ks, ka);
      p.kids.push({ name: f + ' ' + p.sn, age: ka, lives: ka < 18 ? 'with other parent' : ka < 24 && R() < .4 ? 'away at university' : 'own household' });
    }
  });
  const eld = Math.max(...M.filter(x => x.age >= 18).map(x => x.age)), req = bedReq(M, C, type), adults = M.filter(x => x.age >= 18).length;
  const tk = tenure ?? pk(D.ten[D.tt[type]], k => D.tenAge[eld < 35 ? 0 : eld < 65 ? 1 : 2][k] * Math.pow(D.prof.ten[k], pr));
  let bd = req + 1;
  for (let t = 0; t < 20; t++) { const x = Math.max(1, req + +pk(D.bed[tk], k => k < 0 ? (type === 'shared' ? .35 : 1 + 3 * pr) : 1)); if (x * 2 >= adults && x * 3 >= n && (type !== 'shared' || x >= Math.max(2, n - 1))) { bd = x; break; } }
  const kind = n === 1 ? 'one-person household' : type === 'shared' ? 'other household: unrelated adults sharing' : G.length ? 'multi-generation family household' : (C.length && K.length ? 'couple family' : K.length ? 'lone-parent family' : 'couple family') + (K.length ? (M.some(x => x.age < 18) ? ' with dependent children' : ' with non-dependent children') : ', no children');
  return M.map((p, i) => {
    const q = {
      name: nameOf(p), age: p.age, sex: p.sex, ethnicity: D.ethLabel[p.eth], birthplace: p.bp, years_in_uk: p.yrs, religion: p.rel, activity: ACT[p.act],
      occupation: p.emp ? p.oc.t : null, contract: p.contract, employer: p.employer, annual_income: p.inc, hours_per_week: p.hrs, shifts: p.shifts,
      household: { type: kind, tenure: D.tenLabel[tk], bedrooms: bd, occupancy_rating: bd - req, size: n, members: M.map((m, j) => j === i ? null : { name: nameOf(m), age: m.age, sex: m.sex, relation: rel[i][j] }).filter(Boolean) },
      relationship_status: p.status, children: p.kids, health: p.h, education: p.edu ? D.eduLabel[p.edu] : p.age < 5 ? 'pre-school' : p.age < 11 ? 'primary school' : 'secondary school / college',
      hourly_pay: p.hp, income_source: p.src, role: p.role ?? null, former_occupation: p.former ? p.oc.t : null
    };
    Object.defineProperty(q, '_', { value: { P: p.P, oc: p.oc, act: p.act, edu: p.edu, p } }); return q;
  });
}
function hhFor(p, pr) {
  for (let t = 0; t < 40; t++) {
    const type = pk(D.hhAge[B(p.age) - 1], k => Math.pow(D.prof.hh[k] ?? 1, pr) * (D.ethTilt[k]?.[p.eth] ?? 1) * (k.startsWith('lone') && p.sex === 'M' ? .2 : 1));
    const h = build(type, pr, { p }); if (h) return finish(h, pr)[0];
  }
  return finish(build('one', pr, { p }), pr)[0];
}
// ---------- validation (works on output objects; resample on failure)
export function validate(ps) {
  const E = [], e = (p, m) => E.push(`${p.name}: ${m}`);
  for (const p of ps) {
    const { P, oc, act } = p._ ?? {}, h = p.household, hrs = p.hours_per_week, adults = h.members.filter(m => m.age >= 18).length + (p.age >= 18);
    if (!(p.age >= 0 && p.age <= 95)) e(p, 'age');
    if (p.years_in_uk > p.age) e(p, 'years_in_uk > age');
    if (['England', 'Wales', 'Scotland', 'Northern Ireland'].includes(p.birthplace) && p.years_in_uk !== p.age) e(p, 'UK-born years');
    if (act === 'ft' && !(hrs >= 30 && hrs <= 60)) e(p, 'ft hours'); if (act === 'pt' && !(hrs >= 8 && hrs < 30)) e(p, 'pt hours');
    if (act === 'se' && !(hrs >= 16 && hrs <= 60)) e(p, 'se hours'); if (act === 'st' && hrs > 16) e(p, 'student job hours');
    if (p.contract === 'self-employed' !== (act === 'se')) e(p, 'contract vs self-employed');
    if (p.health === 'very good' && act === 'si') e(p, 'sick but very good health');
    if (p.age < 18 && (p.children.length || p.relationship_status !== 'single' || p.occupation)) e(p, 'minor with adult attributes');
    if (!p.occupation) { if (hrs || p.shifts.length || p.contract || p.employer) e(p, 'non-worker has work fields'); }
    else {
      const s = p.shifts, sum = s.reduce((a, x) => a + x.paid_hours, 0);
      if (Math.abs(sum - hrs) > .01) e(p, `shift hours ${sum} != ${hrs}`);
      if (new Set(s.map(x => x.day)).size !== s.length || s.length > P.md || !s.length) e(p, 'shift days');
      const allowed = new Set(Object.values(P.st).flat());
      for (const x of s) {
        const st = +x.start.slice(0, 2) + (x.start.endsWith('30') ? .5 : 0);
        if (x.paid_hours > P.cap || !allowed.has(st)) e(p, 'shift length/start ' + x.start);
        if (!P.we && DAYS.indexOf(x.day) > 4) e(p, 'weekend shift in weekday-only job');
        if (P.endMax && st + x.paid_hours + (x.paid_hours > 6 ? .5 : 0) > P.endMax) e(p, 'cafe shift runs past ' + P.endMax);
      }
      if (Math.abs(p.annual_income - Math.round(p.hourly_pay * hrs * 52)) > 1) e(p, 'pay != hourly x hours');
      if (p.hourly_pay < oc.pay[0] * (p.age < 21 ? .75 : 1) || p.hourly_pay > oc.pay[4]) e(p, 'hourly outside ASHE p10-p90');
      if (oc.deg > 1 && p._.edu !== DEGK) e(p, 'degree-required role without degree');
    }
    // household
    if (h.size !== h.members.length + 1) e(p, 'household size');
    if (adults > 2 * h.bedrooms || h.size > 3 * h.bedrooms) e(p, `overfull: ${adults} adults/${h.size} people in ${h.bedrooms} bed`);
    if (h.occupancy_rating < -2) e(p, 'extreme overcrowding');
    if (h.type.startsWith('other household') && h.bedrooms < Math.max(2, h.size - 1)) e(p, 'sharers vs bedrooms');
    if (p.age < 18 && !h.members.some(m => m.age >= 18)) e(p, 'minor without adult');
    let partners = 0;
    for (const m of h.members) {
      const c = CLS[m.relation]; if (!c) { e(p, 'unknown relation ' + m.relation); continue; }
      if (LAB[c][m.sex] !== m.relation) e(p, `relation ${m.relation} vs sex ${m.sex}`);
      if (!GAP[c](p.age, m.age)) e(p, `age gap for ${m.relation}: ${p.age} vs ${m.age}`);
      if (c === 'spouse' || c === 'partner') partners++;
      if (c === 'child' && !p.children.some(k => k.name === m.name && k.age === m.age && k.lives === 'with me')) e(p, 'household child missing from children');
      const q = ps.find(x => x !== p && x.name === m.name && x.age === m.age && x.sex === m.sex);
      if (q) { const back = q.household.members.find(x => x.name === p.name && x.age === p.age); if (!back || back.relation !== LAB[INV[c]][p.sex]) e(p, `inverse mismatch with ${m.name}`); }
    }
    if ((p.relationship_status === 'married' || p.relationship_status === 'cohabiting') !== (partners === 1)) e(p, 'status vs partner in household');
    for (const k of p.children) { if (p.age - k.age < 16) e(p, 'child too old'); if (k.lives === 'with me' && !h.members.some(m => m.name === k.name && CLS[m.relation] === 'child')) e(p, 'child "with me" not in household'); }
  }
  return E;
}
// ---------- settings
const retry = f => { for (let t = 0; t < 200; t++) { const g = f(); if (!validate(g.people).length) return g; } throw new Error('could not generate valid group'); };
const SET = {
  flatshare: (n, pr) => ({ people: finish(build('shared', pr, { n: Math.max(2, n) }), pr, 'priv') }),
  family: (n, pr) => { // one whole household of 3+ (n, if >= 3, is a target size)
    for (let t = 0; ; t++) {
      const eth = pk(D.eth[3], k => Math.pow(D.prof.eth[k], pr)), type = pk(D.famType);
      if (R() * 3.5 > (D.ethTilt[type]?.[eth] ?? 1)) continue;
      const h = build(type, pr, { eth }, type.startsWith('lone') ? 2 : 1);
      if (h && h.M.length >= 3 && (n < 3 || t > 400 || h.M.length === n)) return { people: finish(h, pr) };
    }
  },
  cafe: (n, pr) => {
    const base = { pr, pat: 'cafe', emp: 'this café', aw: D.cafeAge, max: 65 };
    const ps = [person({ ...base, act: 'se', occ: 2, role: 'owner-manager', min: 25, hrs: ri(45, 55), uMax: .5, emp: 'this café (owner)' })];
    for (let i = 1; i < n; i++) {
      const cook = i === 1 && n >= 3, r = R();
      ps.push(person(cook ? { ...base, occ: 16, role: 'cook', act: r < .75 ? 'ft' : 'pt' } : { ...base, occ: 24, role: one(['barista', 'counter assistant', 'server', 'kitchen assistant']), ...(r < .3 ? { act: 'st', max: 25 } : { act: r < .65 ? 'ft' : 'pt' }) }));
    }
    return { people: ps.map(p => hhFor(p, pr)) };
  },
  street: (n, pr) => ({ area: 'one inner-city area (inner profile)', people: Array.from({ length: n }, () => hhFor(person({ pr, min: 18 }), pr)) }),
  friends: (n, pr) => {
    const a = person({ pr, min: 18, max: 60, aw: D.friendAge }), P = [a], shared = (x, y) => [['eth', 'ethnicity'], ['edu', 'education'], ['rel', 'religion'], ['oc', 'occupation group']].filter(([k]) => x[k] && x[k] === y[k]).map(([, l]) => l);
    for (let guard = 0; P.length < n && guard < 500; guard++) {
      const q = person({ pr, age: cl(Math.round(a.age + rn(0, 3.5)), 18, 70), eth: R() < .55 ? a.eth : undefined, edu: R() < .45 ? a.edu : undefined });
      if (P.some(x => shared(x, q).length) && !P.some(x => x.sex === q.sex && x.age === q.age && shared(x, q).length > 3)) P.push(q);
    }
    const people = P.map(p => hhFor(p, pr)), ties = [];
    P.forEach((x, i) => P.slice(i + 1).forEach((y, j) => ties.push({ a: people[i].name, b: people[i + 1 + j].name, shared: shared(x, y), age_gap: Math.abs(x.age - y.age) })));
    return { people, ties };
  }
};
const PR = { flatshare: .5, family: 0, cafe: .5, street: 1, friends: .75 };
export function sample(setting, n, seed) {
  seedRng(seed); const g = retry(() => SET[setting](n, PR[setting])); return { setting, n, seed, ...g };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , s, n = 4, seed = 1] = process.argv;
  if (!SET[s]) { console.error('setting: ' + Object.keys(SET).join('|')); process.exit(1); }
  console.log(JSON.stringify(sample(s, +n, seed), null, 1));
}
