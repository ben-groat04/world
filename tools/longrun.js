// Long-run drift check.  node tools/longrun.js [--seed 1] [--years 50] [--step 10] [--save dir]
// Prints one row per `step` years: pop, median age, %65+, births, deaths, moves-in/out, households, unemployment, real rent, vacancy, groups, memory, tick speed, log sizes.
import { createLarkfieldWorld } from '../sim/larkfield.js';

import fs from 'node:fs';
const a = process.argv.slice(2), arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const seed = +arg('--seed', 1), years = +arg('--years', 50), step = +arg('--step', 10), save = arg('--save', null);
const w = createLarkfieldWorld(seed); const TICKS_PER_YEAR = w.calendar.ticksPerYear;
let births = 0, deaths = 0; w.on('life.birth', () => births++); w.on('life.death', () => deaths++);
const med = (x) => { x = x.slice().sort((p, q) => p - q); return x.length ? x[x.length >> 1] : 0; };
const size = (o) => { let n = 0; for (const p of w.people.values()) n += o(p); return n; };
const rows = [];
function row(y, secs, ticks) {
  const L = w.living(), ages = L.map((p) => w.ageOf(p)), lab = w.sys.labour.query.unemployment(), mk = w.sys.housing.query.market(), hs = w.sys.housing.query.stats();
  const hhs = w.lf.households.filter((h) => h.members ? h.members.length : true).length;
  const grp = w.sys.goals.query.groups ? w.sys.goals.query.groups().length : 0;
  if (global.gc) global.gc();
  const r = {
    y, pop: L.length, med: med(ages), p65: +(ages.filter((x) => x >= 65).length / L.length * 100).toFixed(1), u15: +(ages.filter((x) => x < 15).length / L.length * 100).toFixed(1), births, deaths, in: hs.arrivals, out: hs.departures, mv: hs.moves,
    hh: hs.households, units: hs.units, vacN: hs.vacancies, unemp: typeof lab === 'object' ? +(lab.rate ?? lab.unemployment ?? NaN).toFixed?.(3) : lab, rentIdx: +mk.rentIndex.toFixed(2), vac: +(hs.vacancyRate * 100).toFixed(1), grp,
    mem: Math.round(process.memoryUsage().heapUsed / 1e6), tps: Math.round(ticks / secs), people: w.people.size, rel: size((p) => Object.keys(p.relationships || {}).length), mems: size((p) => (p.memories || []).length), ev: w.events.size ?? w.events.count?.() ?? '', chron: w.chronicle.entries?.length ?? w.chronicle.list?.length ?? ''
  };
  rows.push(r); console.log(JSON.stringify(r)); births = 0; deaths = 0;
}
row(0, 1, 1);
for (let y = step; y <= years; y += step) {
  const t0 = performance.now(); w.run(step * TICKS_PER_YEAR); row(y, (performance.now() - t0) / 1000, step * TICKS_PER_YEAR);
  if (save) fs.writeFileSync(`${save}/s${seed}-y${y}.json`, JSON.stringify(w.snapshot()));
}
