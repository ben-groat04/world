// node w8-checks/stretch.mjs <list file>   Gaps between consecutive messages inside one stretch (same `stretch` in the log) and between stretches, in minutes, and how many stretches end up spanning more than 3 h.
import fs from 'node:fs';
const dirs = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')[1]);
const within = [], between = [], spans = {};
for (const d of dirs) { const ms = fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r.posted === true && r.text && !r.oracle);
  for (let i = 1; i < ms.length; i++) { const g = (+new Date(ms[i].at + ':00Z') - +new Date(ms[i - 1].at + ':00Z')) / 6e4; (ms[i].stretch === ms[i - 1].stretch ? within : between).push(g); }
  for (const m of ms) (spans[d + m.stretch] ??= []).push(+new Date(m.at + ':00Z')); }
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)], sp = Object.values(spans).map(v => (Math.max(...v) - Math.min(...v)) / 6e4);
console.log(`within-stretch gaps ${within.length}: median ${q(within, .5)}, p90 ${q(within, .9)}, over 60 min ${within.filter(g => g > 60).length}, over 180 min ${within.filter(g => g > 180).length}; between stretches ${between.length}: median ${q(between, .5)}, under 60 min ${between.filter(g => g < 60).length}; stretches ${sp.length}: median span ${q(sp, .5).toFixed(0)} min, over 180 min ${sp.filter(x => x > 180).length}`);
