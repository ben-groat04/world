// W2 item 1 check. node w2-checks/style.mjs <list> [<list>...] : per arm (label prefix), pooled over runs (first 36 h): people with 4+ messages split into capital speakers (>60% of their messages start uppercase) and the rest; per group mean words, thanks-word share, names-another-participant share; overall share of messages starting lowercase.
import fs from 'node:fs';
const THX = /\b(thanks|thank you|thx|ty|cheers)\b/i, esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), w = t => t.trim().split(/\s+/).length;
const rows = d => fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), arms = {};
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(x => x.trim())) {
  const [label, dir] = l.trim().split(/\s+/), r = rows(dir), c = r.find(x => x.cast), all = r.filter(x => x.posted === true && x.text), t0 = +new Date(all[0].at + ':00Z'), m = all.filter(x => +new Date(x.at + ':00Z') < t0 + 36 * 36e5), arm = label.split('-')[0], a = arms[arm] ??= { cap: [], low: [], lower: 0, n: 0, runs: 0 }; a.runs++;
  for (const n of c.names) { const v = m.filter(x => x.who === n); if (v.length < 4) continue; const up = v.filter(x => /^\p{Lu}/u.test(x.text.trim())).length / v.length; (up > .6 ? a.cap : a.low).push(...v.map(x => ({ w: w(x.text), thx: THX.test(x.text), nm: c.names.some(o => o !== n && new RegExp(`\\b${esc(o)}\\b`, 'i').test(x.text)) }))); }
  for (const x of m) { a.n++; if (/^\p{Ll}/u.test(x.text.trim())) a.lower++; }
}
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1), pc = (v, k) => (100 * mean(v.map(x => +x[k]))).toFixed(0) + '%';
for (const [arm, a] of Object.entries(arms)) console.log(`${arm}: ${a.runs} runs; lowercase-start msgs ${(100 * a.lower / a.n).toFixed(0)}% of ${a.n}; capital speakers ${a.cap.length} msgs: words ${mean(a.cap.map(x => x.w)).toFixed(1)}, thanks ${pc(a.cap, 'thx')}, names ${pc(a.cap, 'nm')}; lowercase speakers ${a.low.length} msgs: words ${mean(a.low.map(x => x.w)).toFixed(1)}, thanks ${pc(a.low, 'thx')}, names ${pc(a.low, 'nm')}`);
