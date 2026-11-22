import { createLarkfieldWorld } from './sim/larkfield.js';
const YEARS = 8;
let x = 11; const rnd = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
const all = []; let kidsT = 0, kidsBad = 0, bornT = 0, bornBad = 0; const badEx = [], bornEx = [];
for (const sd of [1, 2, 3, 4]) {
  const w = createLarkfieldWorld(sd);
  const heads = new Map();
  for (const p of w.living()) { const q = p.ext.pop; if (q.role === 'head' || !heads.has(q.hh)) if (q.role === 'head') heads.set(q.hh, p); }
  for (const p of w.living()) { all.push({ p, w }); const q = p.ext.pop;
    if ((q.role === 'child') && q.sub) { const h = heads.get(q.hh); if (h && h.ext.pop.eth === q.eth) { kidsT++; if (h.ext.pop.sub !== q.sub) { kidsBad++; if (badEx.length < 5) badEx.push(`${p.firstName} ${p.lastName} (${q.sub}) in ${h.firstName} ${h.lastName}'s (${h.ext.pop.sub}) household`); } } } }
  w.run(YEARS * 365 * 144);
  for (const p of w.living()) { const f = p.family; if (!f || (!f.fatherId && !f.motherId) || w.ageOf(p) > YEARS) continue; const q = p.ext.pop, fa = f.fatherId != null ? w.people.get(f.fatherId) : null, mo = f.motherId != null ? w.people.get(f.motherId) : null;
    if (!q.sub) continue; bornT++; const par = [fa, mo].filter(Boolean).map((a) => a.ext.pop.sub);
    if (!par.includes(q.sub)) { bornBad++; } if (bornEx.length < 12 && ['horn','somali','lithuanian','korean','mainland_chinese','vietnamese','polish','brazilian','spanish_latam','maghrebi','gulf_iraq','bulgarian','russian'].includes(q.sub)) bornEx.push(`${p.firstName} ${p.lastName} <- ${fa ? fa.firstName + ' ' + fa.lastName : '-'} + ${mo ? mo.firstName + ' ' + mo.lastName : '-'}  (${q.sub})`); }
}
console.log('founders+later people sample size', all.length);
const pool = all.slice(); console.log('--- 40 random founding people (4 seeds, ~2300) ---');
for (let i = 0; i < 40; i++) { const { p, w } = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; const q = p.ext.pop; console.log(`${(p.firstName + ' ' + p.lastName).padEnd(28)} b. ${String(q.birthplace).padEnd(20)} ${q.eth}/${q.sub}`); }
console.log(`founding children whose sub != head's sub (same group): ${kidsBad}/${kidsT}`);
badEx.forEach((e) => console.log('  ', e));
console.log(`sim-born children (<=${YEARS}y after ${YEARS}y run) not sharing a parent's sub: ${bornBad}/${bornT}`);
bornEx.forEach((e) => console.log('  ', e));
