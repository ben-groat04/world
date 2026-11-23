// W2 item 4 check. node w2-checks/chunks.mjs <list> [...] : per arm, share of all messages in the 19:00 hour, and same-sender near-duplicates (>=60% word overlap, |A∩B|/min(|A|,|B|)) between any of the 3 messages before and the 3 after each 04:00 boundary (for W1 arms the boundary is the 19:00 start+24h/48h, i.e. the chunk edge there).
import fs from 'node:fs';
const rows = d => fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), ws = t => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)), arms = {};
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(x => x.trim())) {
  const [label, dir] = l.trim().split(/\s+/), r = rows(dir), m = r.filter(x => x.posted === true && x.text), arm = label.split('-')[0], a = arms[arm] ??= { n: 0, h19: 0, dup: 0, runs: 0, cuts: 0 }; a.runs++;
  const w1 = r[0].writer === 'w1', t0 = +new Date(m[0].at.slice(0, 10) + 'T00:00:00Z'); const start = +new Date(m[0].at + ':00Z');
  for (const x of m) { a.n++; if (x.at.slice(11, 13) === '19') a.h19++; }
  const cuts = []; if (r[0].cuts) cuts.push(...r[0].cuts); else for (let k = 1; k <= 3; k++) cuts.push(start + k * 864e5);
  const edge = (r[0].days && r[0].chunks) ? r[0].chunks : null;
  const bounds = []; { const d = new Date(start); d.setUTCHours(4, 0, 0, 0); let t = +d; while (t <= start) t += 864e5; bounds.push(t, t + 864e5, t + 2 * 864e5); }
  const bs = label.startsWith('W2') || label.startsWith('GW2') ? bounds : [start + 864e5, start + 2 * 864e5];
  for (const b of bs) { const before = m.filter(x => +new Date(x.at + ':00Z') < b).slice(-3), after = m.filter(x => +new Date(x.at + ':00Z') >= b).slice(0, 3); if (!after.length) continue; a.cuts++;
    for (const p of before) for (const q of after) if (p.who === q.who) { const A = ws(p.text), B = ws(q.text), i = [...A].filter(x => B.has(x)).length; if (Math.min(A.size, B.size) >= 3 && i / Math.min(A.size, B.size) >= .6) { a.dup++; console.log(`  dup ${label} ${p.who}: "${p.text.slice(0, 50)}" ~ "${q.text.slice(0, 50)}"`); } } }
}
for (const [arm, a] of Object.entries(arms)) console.log(`${arm}: ${a.runs} runs, ${a.n} msgs, 19:00 hour ${a.h19}/${a.n} = ${(100 * a.h19 / a.n).toFixed(0)}%; near-duplicate same-sender pairs across ${a.cuts} boundaries: ${a.dup}`);
