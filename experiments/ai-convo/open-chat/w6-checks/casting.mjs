// casting check: node w6-checks/casting.mjs <list file>
import fs from 'node:fs';
const casts = [], starts = []; let people = 0;
for (const l of fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)) { const d = l.split(' ')[1], rows = fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); casts.push(rows.find(r => r.cast)); starts.push(rows.find(r => r.posted === true)?.at); }
const cnt = {}, work = {}, whoBad = [], styleBad = []; let n = 0;
const WHO = /joker|quiet|blunt|funny|dry|organi[sz]ed|easygoing|enthusias/i, STY = /full|complete|sentence|no abbrev|no emoji|proper/i;
for (const c of casts) for (const nm of c.names) { n++; cnt[nm] = (cnt[nm] || 0) + 1; const w = (c.cast[nm].work || '').toLowerCase().split(/[^a-z]+/).filter(x => x.length > 3); for (const x of new Set(w)) work[x] = (work[x] || 0) + 1;
  if (WHO.test(c.cast[nm].who)) whoBad.push(c.cast[nm].who); if (c.cast[nm].style && !/^\W*none\b/i.test(c.cast[nm].style) && STY.test(c.cast[nm].style)) styleBad.push(c.cast[nm].style); }
let pairs = 0; for (let i = 0; i < casts.length; i++) for (let j = i + 1; j < casts.length; j++) if (casts[i].names.filter(x => casts[j].names.includes(x)).length >= 2) { pairs++; console.log('pair', i, j, casts[i].names.join(), '|', casts[j].names.join()); }
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6), ms = casts.map(c => c.castMs).sort((a, b) => a - b);
console.log({ casts: casts.length, people: n, topNames: top(cnt), pairs, topWork: top(work).map(([k, v]) => `${k} ${v} (${(v / n * 100).toFixed(0)}%)`), whoBad, styleBad, noneStyle: casts.flatMap(c => c.names).length, medianCastSec: ms[Math.floor(ms.length / 2)] / 1000, distinctStarts: new Set(starts).size });
