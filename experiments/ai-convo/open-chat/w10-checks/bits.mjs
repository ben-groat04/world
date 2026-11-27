// node w10-checks/bits.mjs <list.txt>...  per chat: words of 5+ letters used in 3+ messages on 2+ story days, with their count and whether the Setting has them (candidates for running bits, read by eye).
import fs from 'node:fs'; import path from 'node:path';
const stop = new Set('that this with have from they them what when were been will your about there their would could just like know into than then also some more over very much only back still even want need make going think because after before really right thing things maybe never today tomorrow tonight sorry thanks happy'.split(' '));
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  const [label, dir] = l.split(/\s+/), r = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)), c = r.find(x => x.cast), ms = r.filter(x => x.posted === true && !x.oracle && x.text), set = new Set((c.setting + ' ' + c.names.map(n => c.cast[n].knows + c.private_lines[n]).join(' ')).toLowerCase().match(/\p{L}{5,}/gu)), hits = {};
  for (const m of ms) for (const w of new Set(m.text.toLowerCase().match(/\p{L}{5,}/gu) ?? [])) if (!stop.has(w) && !c.names.some(n => n.toLowerCase() === w)) { const o = hits[w] ??= { n: 0, d: new Set() }; o.n++; o.d.add(m.at.slice(0, 10)); }
  console.log(label, Object.entries(hits).filter(([, o]) => o.n >= 3 && o.d.size >= 2).sort((a, b) => b[1].n - a[1].n).map(([w, o]) => `${w}${set.has(w) ? '*' : ''}:${o.n}`).join(' '));
}
