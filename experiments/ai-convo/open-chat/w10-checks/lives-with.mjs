// node w10-checks/lives-with.mjs <list.txt>  prints each lives-with pair with the situation and each person's `who`.
import fs from 'node:fs'; import path from 'node:path';
for (const l of fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)) { const [label, dir] = l.split(/\s+/); const r = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)), c = r.find(x => x.cast);
  const seen = new Set(); for (const n of c.names) for (const o of c.cast[n].lives) { const k = [n, o].sort().join('+'); if (seen.has(k)) continue; seen.add(k); console.log(label, '|', c.situation, '|', n, `(${c.cast[n].who})`, '&', o, `(${c.cast[o].who})`); } }
