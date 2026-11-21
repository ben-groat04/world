// node tools/headless.js --seed 1 --years 2 [--pop 220] [--hist] [--chronicle]
import { World } from '../sim/world.js';
import { TICKS_PER_YEAR } from '../sim/time.js';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const seed = +arg('seed', 1), years = +arg('years', 2), pop = +arg('pop', 220);
const t0 = performance.now();
const w = new World({ seed, population: pop });
console.log(`Hollowmere seed=${seed}: ${w.buildings.size} buildings, ${w.living().length} people, built in ${(performance.now() - t0).toFixed(0)}ms`);
if (args.includes('--wages')) { // test-only wage/production stub for when no economy system exists
  const { JOBS } = await import('../sim/map.js');
  w.registerSystem({ name: 'wagestub', onDay(world) { for (const p of world.living()) { const J = JOBS[p.job]; if (J && p.workedTicks > 20) p.money += J.wage; else if (p.job === 'retired' || p.job === 'unemployed') p.money += 5; } }, onHour(world) { for (const m of world.buildingsOfType('market')) m.inventory.food = 300; } });
}
let lastB = 0, lastD = 0;
const hist = {};
const row = (y) => {
  const L = w.living(); let mood = 0, money = 0, hunger = 0, soc = 0, fun = 0, en = 0, pu = 0;
  for (const p of L) { mood += p.mood; money += p.money; hunger += p.needs.hunger; soc += p.needs.social; fun += p.needs.fun; en += p.needs.energy; pu += p.needs.purpose; }
  const n = L.length || 1;
  const emp = L.filter((p) => p.workId != null).length;
  console.log(`Y${y} pop=${L.length} mood=${(mood / n).toFixed(2)} money=${(money / n).toFixed(0)} hunger=${(hunger / n).toFixed(2)} soc=${(soc / n).toFixed(2)} fun=${(fun / n).toFixed(2)} energy=${(en / n).toFixed(2)} purpose=${(pu / n).toFixed(2)} employed=${emp} births=${w.stats.births - lastB} deaths=${w.stats.deaths - lastD}`);
  lastB = w.stats.births; lastD = w.stats.deaths;
};
const hh = args.includes('--hist');
for (let y = 1; y <= years; y++) {
  const ts = performance.now();
  for (let i = 0; i < TICKS_PER_YEAR; i++) {
    w.step();
    if (hh && y === 1 && w.time.dayOfYear === 10) { const hr = w.time.hour; const h = hist[hr] || (hist[hr] = {}); for (const p of w.living()) { const k = p.currentAction ? p.currentAction.id + (p.currentAction.status === 0 ? '>' : '') : '-'; h[k] = (h[k] || 0) + 1; } }
  }
  row(y);
  console.log(`   year ${y} took ${((performance.now() - ts) / 1000).toFixed(2)}s (${(w.path.stats.searches)} A* searches, cache ${w.path.cache.size})`);
}
console.log(`total ${((performance.now() - t0) / 1000).toFixed(2)}s`);
if (hh) for (const hr of Object.keys(hist)) { const h = hist[hr]; console.log(String(hr).padStart(2), Object.entries(h).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round(v / 6)}`).join(' ')); }
if (arg('chronicle', false)) for (const e of w.chronicle.recent(15, 3).reverse()) console.log(' ', w.chronicle.format(e));
