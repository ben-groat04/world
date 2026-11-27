// Prints, for chosen chats, the messages the labeller flagged (C caveat, S softened, D deflect) and a few on-topic ones, to check labels by eye.
// node eval/touchy/show.mjs T05-t3-s1 T09-t3n-s1 ...
import fs from 'node:fs'; import path from 'node:path';
const here = import.meta.dirname, res = JSON.parse(fs.readFileSync(path.join(here, 'results.json'), 'utf8')), dirs = Object.fromEntries(res.stats.map(s => [s.label, s.dir]));
for (const l of process.argv.slice(2)) {
  const rows = fs.readFileSync(path.join(dirs[l], 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)), msgs = rows.filter(x => x.posted === true && x.who && !x.oracle && x.text), lab = JSON.parse(fs.readFileSync(path.join(here, 'labels', l + '.json'), 'utf8')).rows;
  console.log(`===== ${l}`); const names = ['T', 'C', 'S', 'D'];
  msgs.forEach((m, i) => { const r = lab[i]; if (r && (r[1] || r[2] || r[3])) console.log(`[${names.filter((_, j) => r[j]).join('')}] ${m.who}: ${m.text.replace(/\n/g, ' / ').slice(0, 220)}`); });
}
